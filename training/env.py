from pettingzoo import AECEnv
from pettingzoo.utils.agent_selector import agent_selector
from gymnasium import spaces
import numpy as np
from game import GameState

def encode_board(game_state, current_agent):
    obs = np.zeros((8, 7, 7), dtype=np.float32)
    my_team = 'A' if current_agent == 'player_A' else 'B'
    
    for r in range(7):
        for c in range(7):
            p = game_state.board[r][c]
            if p:
                if p.team == my_team:
                    if p.type == 'flag':
                        obs[0][r][c] = 1.0
                    else:
                        obs[1][r][c] = p.value / 5.0
                        if p.value == 1:
                            obs[2][r][c] = 1.0
                        elif p.value == 5:
                            obs[3][r][c] = 1.0
                else:
                    if p.type == 'flag':
                        obs[4][r][c] = 1.0
                    else:
                        obs[5][r][c] = p.value / 5.0
                        if p.value == 1:
                            obs[6][r][c] = 1.0
                        elif p.value == 5:
                            obs[7][r][c] = 1.0
    return obs

class FlagStrikeEnv(AECEnv):
    metadata = {'render.modes': ['human'], 'name': 'flagstrike_v0'}

    def __init__(self):
        super().__init__()
        self.game = GameState()
        self.agents = ['player_A', 'player_B']
        self.possible_agents = self.agents[:]
        self.agent_name_mapping = dict(zip(self.agents, list(range(len(self.agents)))))
        
        self.action_spaces = {agent: spaces.Discrete(7 * 7 * 8) for agent in self.agents}
        self.observation_spaces = {
            agent: spaces.Dict({
                'observation': spaces.Box(low=0, high=1, shape=(8, 7, 7), dtype=np.float32),
                'action_mask': spaces.Box(low=0, high=1, shape=(392,), dtype=np.int8)
            }) for agent in self.agents
        }

    def observation_space(self, agent):
        return self.observation_spaces[agent]

    def action_space(self, agent):
        return self.action_spaces[agent]

    def render(self, mode="human"):
        pass

    def observe(self, agent):
        board_obs = encode_board(self.game, agent)
        mask = np.zeros(392, dtype=np.int8)
        team = 'A' if agent == 'player_A' else 'B'
        if self.game.current_turn == team and not self.game.game_over:
            moves = self.game.get_moves(team)
            for (fr, fc, tr, tc) in moves:
                dr = tr - fr
                dc = tc - fc
                dir_idx = (dr + 1) * 3 + (dc + 1)
                if dir_idx >= 4: dir_idx -= 1
                action_idx = (fr * 7 + fc) * 8 + dir_idx
                mask[action_idx] = 1
        return {'observation': board_obs, 'action_mask': mask}

    def reset(self, seed=None, return_info=False, options=None):
        self.game = GameState()
        self.agents = self.possible_agents[:]
        self.rewards = {agent: 0 for agent in self.agents}
        self._cumulative_rewards = {agent: 0 for agent in self.agents}
        self.terminations = {agent: False for agent in self.agents}
        self.truncations = {agent: False for agent in self.agents}
        self.infos = {agent: {} for agent in self.agents}
        self._agent_selector = agent_selector(self.agents)
        self.agent_selection = self._agent_selector.next()

    def step(self, action):
        if self.terminations[self.agent_selection] or self.truncations[self.agent_selection]:
            self._was_dead_step(action)
            return

        agent = self.agent_selection
        team = 'A' if agent == 'player_A' else 'B'
        
        dir_idx = action % 8
        sq = action // 8
        fr = sq // 7
        fc = sq % 7
        
        dr = (dir_idx // 3) - 1
        dc = (dir_idx % 3) - 1
        if dir_idx >= 4:
            dr = ((dir_idx + 1) // 3) - 1
            dc = ((dir_idx + 1) % 3) - 1
            
        tr = fr + dr
        tc = fc + dc
        
        valid = self.game.move_piece(fr, fc, tr, tc)
        
        self.rewards = {a: -0.01 for a in self.agents}
        
        if self.game.game_over:
            self.terminations = {a: True for a in self.agents}
            if self.game.winner == 'A':
                self.rewards['player_A'] += 1.0
                self.rewards['player_B'] -= 1.0
            elif self.game.winner == 'B':
                self.rewards['player_B'] += 1.0
                self.rewards['player_A'] -= 1.0
            elif self.game.winner == 'Draw_Repetition':
                self.rewards['player_A'] -= 0.5
                self.rewards['player_B'] -= 0.5
        
        self.agent_selection = self._agent_selector.next()
        self._accumulate_rewards()
