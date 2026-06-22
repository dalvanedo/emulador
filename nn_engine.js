// nn_engine.js
// Implementación de Forward Pass en JavaScript Puro (Cero Dependencias) para la CNN entrenada en Python

class NNEngine {
    constructor() {
        this.weights = null;
        this.isLoaded = false;
    }

    async loadWeights(url) {
        try {
            const response = await fetch(url);
            const data = await response.json();
            this.weights = data;
            this.isLoaded = true;
            console.log("Model weights loaded successfully.");
        } catch (e) {
            console.error("Error loading model weights:", e);
        }
    }

    // Funciones matemáticas auxiliares
    relu(x) {
        return x > 0 ? x : 0;
    }

    // Conv2d simple (stride 1, padding 1)
    // inTensor: [C_in, H, W]
    // weight: [C_out, C_in, kH, kW]
    // bias: [C_out]
    // outTensor: [C_out, H, W]
    conv2d(inTensor, weight, bias, C_in, C_out, H, W, kH, kW) {
        let outTensor = new Float32Array(C_out * H * W);
        let padY = Math.floor(kH / 2);
        let padX = Math.floor(kW / 2);

        for (let oc = 0; oc < C_out; oc++) {
            let b = bias[oc];
            for (let y = 0; y < H; y++) {
                for (let x = 0; x < W; x++) {
                    let sum = b;
                    for (let ic = 0; ic < C_in; ic++) {
                        for (let ky = 0; ky < kH; ky++) {
                            for (let kx = 0; kx < kW; kx++) {
                                let in_y = y + ky - padY;
                                let in_x = x + kx - padX;
                                if (in_y >= 0 && in_y < H && in_x >= 0 && in_x < W) {
                                    let in_val = inTensor[(ic * H * W) + (in_y * W) + in_x];
                                    let w_val = weight[oc][ic][ky][kx];
                                    sum += in_val * w_val;
                                }
                            }
                        }
                    }
                    outTensor[(oc * H * W) + (y * W) + x] = this.relu(sum);
                }
            }
        }
        return outTensor;
    }

    // Linear (Dense) layer
    // inTensor: [in_features]
    // weight: [out_features, in_features]
    // bias: [out_features]
    linear(inTensor, weight, bias, in_features, out_features, applyRelu) {
        let outTensor = new Float32Array(out_features);
        for (let o = 0; o < out_features; o++) {
            let sum = bias[o];
            for (let i = 0; i < in_features; i++) {
                sum += inTensor[i] * weight[o][i];
            }
            outTensor[o] = applyRelu ? this.relu(sum) : sum;
        }
        return outTensor;
    }

    encodeBoard(board, currentTurn) {
        let obs = new Float32Array(8 * 7 * 7); // 8 channels, 7x7
        let myTeam = currentTurn;
        
        for (let r = 0; r < 7; r++) {
            for (let c = 0; c < 7; c++) {
                let p = board[r][c];
                if (p) {
                    let idx = (r * 7) + c;
                    if (p.team === myTeam) {
                        if (p.type === 'flag') {
                            obs[(0 * 49) + idx] = 1.0;
                        } else {
                            obs[(1 * 49) + idx] = p.value / 5.0;
                            if (p.value === 1) obs[(2 * 49) + idx] = 1.0;
                            else if (p.value === 5) obs[(3 * 49) + idx] = 1.0;
                        }
                    } else {
                        if (p.type === 'flag') {
                            obs[(4 * 49) + idx] = 1.0;
                        } else {
                            obs[(5 * 49) + idx] = p.value / 5.0;
                            if (p.value === 1) obs[(6 * 49) + idx] = 1.0;
                            else if (p.value === 5) obs[(7 * 49) + idx] = 1.0;
                        }
                    }
                }
            }
        }
        return obs;
    }

    forward(board, currentTurn) {
        if (!this.isLoaded) return null;

        let x = this.encodeBoard(board, currentTurn);

        // conv1: 8 -> 32
        x = this.conv2d(x, this.weights['conv1.weight'], this.weights['conv1.bias'], 8, 32, 7, 7, 3, 3);
        
        // conv2: 32 -> 64
        x = this.conv2d(x, this.weights['conv2.weight'], this.weights['conv2.bias'], 32, 64, 7, 7, 3, 3);

        // conv3: 64 -> 64
        x = this.conv2d(x, this.weights['conv3.weight'], this.weights['conv3.bias'], 64, 64, 7, 7, 3, 3);

        // flatten is implicit because x is a flat Float32Array
        
        // fc1: 3136 -> 128
        x = this.linear(x, this.weights['fc1.weight'], this.weights['fc1.bias'], 3136, 128, true);

        // actor: 128 -> 392
        let logits = this.linear(x, this.weights['actor.weight'], this.weights['actor.bias'], 128, 392, false);

        // critic: 128 -> 1
        let value = this.linear(x, this.weights['critic.weight'], this.weights['critic.bias'], 128, 1, false);

        return { logits: logits, value: value[0] };
    }

    getBestMove(game) {
        return this.getBestMoveMinimax(game, 2); // Profundidad 2 plies por defecto para que sea rápido en JS
    }

    getBestMoveMinimax(originalGame, depth) {
        if (!this.isLoaded) return null;

        let bestMove = null;
        let bestValue = -Infinity;
        let alpha = -Infinity;
        let beta = Infinity;

        const maximizingPlayer = originalGame.currentTurn;

        let legalMoves = this.getAllLegalMoves(originalGame);
        if (legalMoves.length === 0) return null;

        // Softmax/Argmax sobre los legal moves para ordenar y mejorar Poda Alfa-Beta
        let result = this.forward(originalGame.board, originalGame.currentTurn);
        if (result) {
            for (let m of legalMoves) {
                let actionIdx = this.moveToActionIdx(m);
                m.logit = result.logits[actionIdx];
            }
            legalMoves.sort((a, b) => b.logit - a.logit); // Mejores logits primero
        }

        for (let m of legalMoves) {
            let cloned = originalGame.clone();
            cloned.movePiece(m.fr, m.fc, m.tr, m.tc);
            
            let val = this.minimax(cloned, depth - 1, alpha, beta, maximizingPlayer);
            
            if (val > bestValue) {
                bestValue = val;
                bestMove = m;
            }
            alpha = Math.max(alpha, bestValue);
            if (alpha >= beta) break;
        }

        return bestMove || legalMoves[0]; // Fallback por si acaso
    }

    minimax(game, depth, alpha, beta, maximizingPlayer) {
        if (game.gameOver) {
            if (game.winner === 'Draw_Repetition' || game.winner === 'Draw') return 0;
            return game.winner === maximizingPlayer ? 1000 + depth : -1000 - depth;
        }

        if (depth === 0) {
            // Heurística de Red Neuronal (Critic)
            let result = this.forward(game.board, game.currentTurn);
            let nnValue = result ? result.value : 0;
            
            // El NN value está siempre desde la perspectiva de game.currentTurn
            let evalScore = game.currentTurn === maximizingPlayer ? nnValue : -nnValue;
            
            // Material heurístico de apoyo para romper empates y castigar colgarse piezas
            let materialScore = this.getMaterialScore(game.board, maximizingPlayer);
            
            return (evalScore * 10) + materialScore; 
        }

        let legalMoves = this.getAllLegalMoves(game);
        if (legalMoves.length === 0) {
            return game.currentTurn === maximizingPlayer ? -1000 - depth : 1000 + depth;
        }

        if (game.currentTurn === maximizingPlayer) {
            let maxEval = -Infinity;
            for (let m of legalMoves) {
                let cloned = game.clone();
                cloned.movePiece(m.fr, m.fc, m.tr, m.tc);
                let ev = this.minimax(cloned, depth - 1, alpha, beta, maximizingPlayer);
                maxEval = Math.max(maxEval, ev);
                alpha = Math.max(alpha, ev);
                if (beta <= alpha) break;
            }
            return maxEval;
        } else {
            let minEval = Infinity;
            for (let m of legalMoves) {
                let cloned = game.clone();
                cloned.movePiece(m.fr, m.fc, m.tr, m.tc);
                let ev = this.minimax(cloned, depth - 1, alpha, beta, maximizingPlayer);
                minEval = Math.min(minEval, ev);
                beta = Math.min(beta, ev);
                if (beta <= alpha) break;
            }
            return minEval;
        }
    }

    getMaterialScore(board, maximizingPlayer) {
        let score = 0;
        for (let r = 0; r < 7; r++) {
            for (let c = 0; c < 7; c++) {
                let p = board[r][c];
                if (p && p.type === 'attacker') {
                    let val = p.value; // 1 to 5
                    if (p.team === maximizingPlayer) score += val;
                    else score -= val;
                }
            }
        }
        return score * 0.1; // Pequeño peso frente a la NN (-1.5 a 1.5)
    }

    getAllLegalMoves(game) {
        let moves = [];
        for (let r=0; r<7; r++) {
            for (let c=0; c<7; c++) {
                let p = game.board[r][c];
                if (p && p.team === game.currentTurn && p.type !== 'flag') {
                    for (let dr=-1; dr<=1; dr++) {
                        for (let dc=-1; dc<=1; dc++) {
                            if (dr===0 && dc===0) continue;
                            if (game.isValidMove(r, c, r+dr, c+dc)) {
                                moves.push({fr: r, fc: c, tr: r+dr, tc: c+dc});
                            }
                        }
                    }
                }
            }
        }
        return moves;
    }

    moveToActionIdx(m) {
        let dr = m.tr - m.fr;
        let dc = m.tc - m.fc;
        let dirIdx = (dr + 1) * 3 + (dc + 1);
        if (dirIdx >= 4) dirIdx -= 1;
        return (m.fr * 7 + m.fc) * 8 + dirIdx;
    }
}
