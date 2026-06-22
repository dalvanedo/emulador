// nn_engine.js
// Implementación de Forward Pass en JavaScript Puro (Cero Dependencias) para la CNN entrenada en Python

class NNEngine {
    constructor() {
        this.weights = null;
        this.isLoaded = false;
    }

    loadWeights(url, onProgress) {
        return new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open('GET', url, true);
            // Si el servidor sirve json directo
            xhr.responseType = 'text'; 
            
            xhr.onprogress = (event) => {
                let loaded = event.loaded;
                // Si el servidor comprime con gzip, event.total puede ser 0. Usamos el tamaño real del archivo sin comprimir como fallback (11456118 bytes)
                let total = event.lengthComputable && event.total > 0 ? event.total : 11456118; 
                let percent = (loaded / total) * 100;
                if (percent > 100) percent = 100; // Por si hay compresión y descargamos menos
                if (onProgress) onProgress(percent);
            };

            xhr.onload = () => {
                if (xhr.status === 200 || xhr.status === 0) {
                    try {
                        let parsed = JSON.parse(xhr.responseText);
                        this.weights = {};
                        for (let key in parsed) {
                            if (Array.isArray(parsed[key])) {
                                this.weights[key] = new Float32Array(this.flattenArray(parsed[key]));
                            } else {
                                this.weights[key] = parsed[key];
                            }
                        }
                        this.isLoaded = true;
                        resolve();
                    } catch(e) {
                        reject(new Error("Error parseando JSON: " + e));
                    }
                } else {
                    reject(new Error("HTTP Error " + xhr.status));
                }
            };
            
            xhr.onerror = () => reject(new Error("Network Error"));
            xhr.send();
        });
    }

    flattenArray(arr) {
        let result = [];
        function recurse(a) {
            if (Array.isArray(a)) {
                for (let i = 0; i < a.length; i++) {
                    recurse(a[i]);
                }
            } else {
                result.push(a);
            }
        }
        recurse(arr);
        return result;
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
                                    let w_idx = (((oc * C_in + ic) * kH) + ky) * kW + kx;
                                    let w_val = weight[w_idx];
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
                let w_idx = o * in_features + i;
                sum += inTensor[i] * weight[w_idx];
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
        if (!this.isLoaded) return null;

        let legalMoves = this.getAllLegalMoves(game);
        if (legalMoves.length === 0) return null;

        // Evaluar la red neuronal EXACTAMENTE UNA VEZ (Inferencia pura de la Política/Actor)
        let result = this.forward(game.board, game.currentTurn);
        if (!result) return legalMoves[0];

        let bestMove = null;
        let bestLogit = -Infinity;

        // PPO (Proximal Policy Optimization) ya entrenó al 'Actor' para que devuelva
        // los mejores logits para las acciones ganadoras. Simplemente hacemos un ArgMax.
        for (let m of legalMoves) {
            let actionIdx = this.moveToActionIdx(m);
            let logit = result.logits[actionIdx];
            m.logit = logit;
            
            if (logit > bestLogit) {
                bestLogit = logit;
                bestMove = m;
            }
        }

        return bestMove || legalMoves[0];
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
                                moves.push({fromR: r, fromC: c, toR: r+dr, toC: c+dc});
                            }
                        }
                    }
                }
            }
        }
        return moves;
    }

    moveToActionIdx(m) {
        let dr = m.toR - m.fromR;
        let dc = m.toC - m.fromC;
        let dirIdx = (dr + 1) * 3 + (dc + 1);
        if (dirIdx >= 4) dirIdx -= 1;
        return (m.fromR * 7 + m.fromC) * 8 + dirIdx;
    }
}
