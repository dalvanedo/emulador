import torch
import torch.nn as nn
import torch.optim as optim
from torch.distributions import Categorical
import json
import os
import copy
import numpy as np

from env import FlagStrikeEnv

class FlagStrikeCNN(nn.Module):
    def __init__(self, num_actions=392):
        super().__init__()
        self.conv1 = nn.Conv2d(8, 32, kernel_size=3, padding=1)
        self.conv2 = nn.Conv2d(32, 64, kernel_size=3, padding=1)
        self.conv3 = nn.Conv2d(64, 64, kernel_size=3, padding=1)
        self.fc1 = nn.Linear(7*7*64, 128)
        self.actor = nn.Linear(128, num_actions)
        self.critic = nn.Linear(128, 1)

    def forward(self, x):
        c = torch.relu(self.conv1(x))
        c = torch.relu(self.conv2(c))
        c = torch.relu(self.conv3(c))
        c = c.reshape(c.shape[0], -1)
        c = torch.relu(self.fc1(c))
        return self.actor(c), self.critic(c)

def export_weights_to_json(model, filepath='../model_weights.json'):
    weights = {}
    for name, param in model.named_parameters():
        weights[name] = param.detach().cpu().numpy().tolist()
    with open(filepath, 'w') as f:
        json.dump(weights, f)

def evaluate_against_best(current_model, best_model, num_games=10):
    env = FlagStrikeEnv()
    wins = 0
    for _ in range(num_games):
        env.reset()
        for agent in env.agent_iter():
            obs, reward, termination, truncation, info = env.last()
            if termination or truncation:
                env.step(None)
                continue
                
            obs_tensor = torch.FloatTensor(obs['observation']).unsqueeze(0)
            action_mask = torch.tensor(obs['action_mask'])
            
            with torch.no_grad():
                if agent == 'player_A':
                    logits, _ = current_model(obs_tensor)
                else:
                    logits, _ = best_model(obs_tensor)
                    
                logits = logits.squeeze(0)
                logits[action_mask == 0] = -1e9
                action = Categorical(logits=logits).sample().item()
                
            env.step(action)
            
        if env.game.winner == 'A':
            wins += 1
            
    win_rate = wins / num_games
    return win_rate

def train():
    env = FlagStrikeEnv()
    model = FlagStrikeCNN()
    
    best_model_path = 'best_model.pth'
    if os.path.exists(best_model_path):
        # Allow loading weights with shape mismatch gracefully or ignore if it fails
        try:
            model.load_state_dict(torch.load(best_model_path))
        except:
            print("No se pudo cargar el modelo anterior (posible cambio de arquitectura). Empezando desde cero.")
        
    best_model = copy.deepcopy(model)
    historical_pool = [copy.deepcopy(best_model)]
    optimizer = optim.Adam(model.parameters(), lr=3e-4, eps=1e-5)
    
    # Hyperparameters (CleanRL Style)
    epochs = 20
    gamma = 0.99
    gae_lambda = 0.95
    clip_coef = 0.2
    ent_coef = 0.01
    vf_coef = 0.5
    update_epochs = 4
    
    print("Iniciando entrenamiento CleanRL PPO Nativo (Iron Sharpens Iron con Historical Pool)...")
    
    for epoch in range(epochs):
        env.reset()
        
        # Seleccionar oponente para esta partida
        if np.random.rand() < 0.2 and len(historical_pool) > 0:
            opponent_model = np.random.choice(historical_pool)
        else:
            opponent_model = best_model
            
        obs_list = []
        masks_list = []
        actions_list = []
        log_probs_list = []
        values_list = []
        rewards_list = []
        dones_list = []
        
        # Jugar hasta terminar la partida recolectando rollout
        for agent in env.agent_iter():
            obs, reward, termination, truncation, info = env.last()
            done = termination or truncation
            
            if done:
                if agent == 'player_A' and len(rewards_list) > 0:
                    rewards_list[-1] += reward
                    dones_list[-1] = 1.0
                env.step(None)
                continue
                
            obs_tensor = torch.FloatTensor(obs['observation'])
            action_mask = torch.tensor(obs['action_mask'])
            
            if agent == 'player_A':
                obs_list.append(obs_tensor)
                masks_list.append(action_mask)
                
                with torch.no_grad():
                    logits, value = model(obs_tensor.unsqueeze(0))
                    logits = logits.squeeze(0)
                    logits[action_mask == 0] = -1e9
                    dist = Categorical(logits=logits)
                    action = dist.sample()
                    
                    log_probs_list.append(dist.log_prob(action))
                    values_list.append(value.squeeze())
                    
                actions_list.append(action)
                rewards_list.append(reward)
                dones_list.append(0.0)
            else:
                with torch.no_grad():
                    logits, _ = opponent_model(obs_tensor.unsqueeze(0))
                    logits = logits.squeeze(0)
                    logits[action_mask == 0] = -1e9
                    dist = Categorical(logits=logits)
                    action = dist.sample()
                    
            env.step(action.item())
            
        if len(obs_list) == 0:
            continue
            
        # Re-alinear los arrays (el primer reward pertenece a un estado anterior, etc.)
        b_obs = torch.stack(obs_list)
        b_masks = torch.stack(masks_list)
        b_actions = torch.stack(actions_list)
        b_logprobs = torch.stack(log_probs_list)
        b_values = torch.stack(values_list)
        b_rewards = torch.tensor(rewards_list, dtype=torch.float32)
        b_dones = torch.tensor(dones_list, dtype=torch.float32)
        
        # Generalized Advantage Estimation (GAE)
        with torch.no_grad():
            advantages = torch.zeros_like(b_rewards)
            lastgaelam = 0
            # Aproximamos next_value = 0 porque el entorno termina
            for t in reversed(range(len(b_rewards))):
                if t == len(b_rewards) - 1:
                    nextnonterminal = 0.0
                    nextvalues = 0.0
                else:
                    nextnonterminal = 1.0 - b_dones[t]
                    nextvalues = b_values[t + 1]
                delta = b_rewards[t] + gamma * nextvalues * nextnonterminal - b_values[t]
                advantages[t] = lastgaelam = delta + gamma * gae_lambda * nextnonterminal * lastgaelam
            returns = advantages + b_values

        # Optimizing the policy and value network
        b_inds = np.arange(len(b_obs))
        
        for _ in range(update_epochs):
            np.random.shuffle(b_inds)
            for start in range(0, len(b_obs), 64):
                end = start + 64
                mb_inds = b_inds[start:end]
                
                mb_obs = b_obs[mb_inds]
                mb_masks = b_masks[mb_inds]
                mb_actions = b_actions[mb_inds]
                mb_advantages = advantages[mb_inds]
                mb_returns = returns[mb_inds]
                
                # Normalize advantages
                mb_advantages = (mb_advantages - mb_advantages.mean()) / (mb_advantages.std() + 1e-8)

                logits, newvalue = model(mb_obs)
                logits[mb_masks == 0] = -1e9
                dist = Categorical(logits=logits)
                newlogprob = dist.log_prob(mb_actions)
                entropy = dist.entropy().mean()
                
                logratio = newlogprob - b_logprobs[mb_inds]
                ratio = logratio.exp()

                # Policy Loss
                pg_loss1 = -mb_advantages * ratio
                pg_loss2 = -mb_advantages * torch.clamp(ratio, 1 - clip_coef, 1 + clip_coef)
                pg_loss = torch.max(pg_loss1, pg_loss2).mean()

                # Value Loss
                v_loss_unclipped = (newvalue.squeeze() - mb_returns) ** 2
                v_clipped = b_values[mb_inds] + torch.clamp(
                    newvalue.squeeze() - b_values[mb_inds],
                    -clip_coef,
                    clip_coef,
                )
                v_loss_clipped = (v_clipped - mb_returns) ** 2
                v_loss_max = torch.max(v_loss_unclipped, v_loss_clipped)
                v_loss = 0.5 * v_loss_max.mean()

                loss = pg_loss - ent_coef * entropy + v_loss * vf_coef

                optimizer.zero_grad()
                loss.backward()
                nn.utils.clip_grad_norm_(model.parameters(), 0.5)
                optimizer.step()
                
        print(f"Epoch {epoch+1}/{epochs} | Loss: {loss.item():.4f} | R: {b_rewards.sum().item()}")
            
        if (epoch + 1) % 5 == 0:
            win_rate = evaluate_against_best(model, best_model, num_games=5)
            print(f"Evaluación vs Best Model: Win Rate = {win_rate*100}%")
            if win_rate >= 0.5: # Permitir reemplazo si empata o supera
                print("¡Mejor o igual modelo encontrado! Reemplazando...")
                best_model = copy.deepcopy(model)
                historical_pool.append(copy.deepcopy(best_model))
                if len(historical_pool) > 10:
                    historical_pool.pop(0) # Keep last 10
                torch.save(best_model.state_dict(), best_model_path)
                export_weights_to_json(best_model)
                print("Pesos exportados.")

if __name__ == '__main__':
    train()
