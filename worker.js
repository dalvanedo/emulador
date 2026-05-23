// worker.js

let board;
let gameOver;
let winner;
let currentTurn;
let countA;
let countB;

// Conceptos de Ajedrez: Valores en Centipeones
const pieceValues = {
    "1": 300,
    "2": 180,
    "3": 290,
    "4": 580,
    "5": 770
};

// Piece-Square Tables (PST) - Bonificaciones posicionales (Centipeones)
const pstB = [
    [  45, -10,   5,   0,   5, -10,  45 ],
    [   5,  60,  65,  45,  65,  60,   5 ],
    [  10,   5,  90,  95,  90,   5,  10 ],
    [  40, -10,  40, -15,  40, -10,  40 ],
    [  35,  10,  55,  65,  55,  10,  35 ],
    [ -20,   0, 125, 105, 125,   0, -20 ],
    [  60,  85,  65, 120,  65,  85,  60 ]
];

const pstA = [
    [  60,  70, 135, 120, 135,  70,  60 ],
    [  50, 125, 120, 160, 120, 125,  50 ],
    [  80,  75,  55, 150,  55,  75,  80 ],
    [  35,  85,  65,  70,  65,  85,  35 ],
    [  15,  60,  40,  20,  40,  60,  15 ],
    [  15,   5,  20, -25,  20,   5,  15 ],
    [ -40,   5, -15,   0, -15,   5, -40 ]
];

// Zobrist Hashing
const zobristTable = new Array(7).fill(0).map(() => new Array(7).fill(0).map(() => ({})));
let zobristTurn;

function initZobrist() {
    function random32() { return Math.floor(Math.random() * 0x100000000) ^ 0; }
    zobristTurn = random32();
    const pieceKeys = ['A1','A2','A3','A4','A5','AF','B1','B2','B3','B4','B5','BF'];
    for(let r=0; r<7; r++) {
        for(let c=0; c<7; c++) {
            for(let key of pieceKeys) {
                zobristTable[r][c][key] = random32();
            }
        }
    }
}
initZobrist();

function getPieceKey(p) {
    if(p.type === 'flag') return p.team + 'F';
    return p.team + p.value;
}

let currentHash = 0;
const transpositionTable = new Map();

function computeHash() {
    let h = 0;
    for(let r=0; r<7; r++) {
        for(let c=0; c<7; c++) {
            let p = board[r][c];
            if(p) h ^= zobristTable[r][c][getPieceKey(p)];
        }
    }
    if(currentTurn === 'B') h ^= zobristTurn;
    return h;
}

const TIME_LIMIT = 800; // ms por turno

self.onmessage = function(e) {
    board = e.data.board;
    gameOver = e.data.gameOver || false;
    winner = e.data.winner || null;
    currentTurn = e.data.currentTurn || 'B';

    // Count active attackers on the board
    countA = 0;
    countB = 0;
    for (let r = 0; r < 7; r++) {
        for (let c = 0; c < 7; c++) {
            const piece = board[r][c];
            if (piece && piece.type === 'attacker') {
                if (piece.team === 'A') countA++;
                else if (piece.team === 'B') countB++;
            }
        }
    }

    transpositionTable.clear();
    currentHash = computeHash();

    const bestMove = findBestMove();
    self.postMessage(bestMove);
};

function evaluateBoard(board, gameOver, winner, depth = 0) {
    if (gameOver) {
        // Mate evaluation in chess engines uses huge scores like 20000
        if (winner === 'B') return 20000 + depth * 100;
        if (winner === 'A') return -20000 - depth * 100;
        return 0; // Draw
    }

    let materialB = 0, materialA = 0;
    let positionalB = 0, positionalA = 0;

    for (let r = 0; r < 7; r++) {
        for (let c = 0; c < 7; c++) {
            const piece = board[r][c];
            if (piece && piece.type === 'attacker') {
                const val = piece.value;
                const materialVal = pieceValues[val];
                
                if (piece.team === 'B') {
                    materialB += materialVal;
                    // Las piezas más valiosas reciben más bono por avanzar
                    positionalB += pstB[r][c] * (materialVal / 500);
                } else if (piece.team === 'A') {
                    materialA += materialVal;
                    positionalA += pstA[r][c] * (materialVal / 500);
                }
            }
        }
    }

    const scoreB = materialB + positionalB;
    const scoreA = materialA + positionalA;

    return scoreB - scoreA;
}

function generateMoves(team) {
    const moves = [];
    for (let r = 0; r < 7; r++) {
        for (let c = 0; c < 7; c++) {
            const piece = board[r][c];
            if (piece && piece.team === team && piece.type !== 'flag') {
                const aVal = piece.value;
                for (let dr = -1; dr <= 1; dr++) {
                    for (let dc = -1; dc <= 1; dc++) {
                        if (dr === 0 && dc === 0) continue;
                        const toR = r + dr;
                        const toC = c + dc;

                        if (toR < 0 || toR >= 7 || toC < 0 || toC >= 7) continue;

                        const destPiece = board[toR][toC];
                        if (destPiece && destPiece.team === team) continue;

                        // Suicide filter
                        if (destPiece && destPiece.team !== team) {
                            if (destPiece.type !== 'flag') {
                                const dVal = destPiece.value;
                                const isValid = (aVal === dVal) ||
                                                (aVal === 1 && dVal === 5) ||
                                                (aVal > dVal && !(aVal === 5 && dVal === 1));
                                if (!isValid) continue;
                            }
                        }

                        let moveScore = 0;
                        if (destPiece && destPiece.team !== team) {
                            if (destPiece.type === 'flag') {
                                moveScore = 1000000; // Capturar bandera es la máxima prioridad
                            } else {
                                const dVal = destPiece.value;
                                // MVV-LVA: Most Valuable Victim - Least Valuable Attacker
                                moveScore = (pieceValues[dVal] * 10) - pieceValues[aVal];
                            }
                        } else {
                            // Movimiento pacífico: Priorizar avance táctico según PST
                            const pst = team === 'B' ? pstB : pstA;
                            moveScore = pst[toR][toC] - pst[r][c];
                        }

                        moves.push({
                            fromR: r,
                            fromC: c,
                            toR: toR,
                            toC: toC,
                            score: moveScore
                        });
                    }
                }
            }
        }
    }
    // Move Ordering: Ordenar movimientos de mejor a peor para optimizar la Poda Alfa-Beta
    moves.sort((a, b) => b.score - a.score);
    return moves;
}

function makeMove(move) {
    const attacker = board[move.fromR][move.fromC];
    const defender = board[move.toR][move.toC];

    const attackerHashFrom = zobristTable[move.fromR][move.fromC][getPieceKey(attacker)];
    const attackerHashTo = zobristTable[move.toR][move.toC][getPieceKey(attacker)];
    const defenderHash = defender ? zobristTable[move.toR][move.toC][getPieceKey(defender)] : 0;

    const state = {
        fromR: move.fromR,
        fromC: move.fromC,
        toR: move.toR,
        toC: move.toC,
        defender: defender,
        prevGameOver: gameOver,
        prevWinner: winner,
        prevCurrentTurn: currentTurn,
        prevCountA: countA,
        prevCountB: countB,
        prevHash: currentHash
    };

    currentHash ^= attackerHashFrom; // Remove from old sq
    if (defender) currentHash ^= defenderHash; // Remove defender
    currentHash ^= attackerHashTo; // Add to new sq

    board[move.toR][move.toC] = attacker;
    board[move.fromR][move.fromC] = null;

    if (defender) {
        if (defender.type === 'flag') {
            gameOver = true;
            winner = attacker.team;
        } else {
            if (defender.team === 'A') {
                countA--;
            } else {
                countB--;
            }

            if (countA === 0 && countB === 0) {
                gameOver = true;
                winner = 'Draw';
            } else if (countA === 0) {
                gameOver = true;
                winner = 'B';
            } else if (countB === 0) {
                gameOver = true;
                winner = 'A';
            }
        }
    }

    if (!gameOver) {
        currentTurn = currentTurn === 'A' ? 'B' : 'A';
        currentHash ^= zobristTurn; // Swap turn
    }

    return state;
}

function undoMove(state) {
    const attacker = board[state.toR][state.toC];

    board[state.fromR][state.fromC] = attacker;
    board[state.toR][state.toC] = state.defender;

    gameOver = state.prevGameOver;
    winner = state.prevWinner;
    currentTurn = state.prevCurrentTurn;
    countA = state.prevCountA;
    countB = state.prevCountB;
    currentHash = state.prevHash;
}

function minimax(depth, alpha, beta, isMaximizing, startTime) {
    if ((performance.now() - startTime) >= TIME_LIMIT) return 'TIMEOUT';

    const hashKey = currentHash;
    if (transpositionTable.has(hashKey)) {
        const entry = transpositionTable.get(hashKey);
        if (entry.depth >= depth) {
            if (entry.flag === 'EXACT') return entry.eval;
            if (entry.flag === 'LOWERBOUND') alpha = Math.max(alpha, entry.eval);
            if (entry.flag === 'UPPERBOUND') beta = Math.min(beta, entry.eval);
            if (alpha >= beta) return entry.eval;
        }
    }

    if (depth === 0 || gameOver) {
        return evaluateBoard(board, gameOver, winner, depth);
    }

    const moves = generateMoves(isMaximizing ? 'B' : 'A');
    
    // Hash move ordering (try best move from TT first)
    if (transpositionTable.has(hashKey)) {
        const bestTTMove = transpositionTable.get(hashKey).bestMove;
        if (bestTTMove) {
            moves.sort((a,b) => {
                if (a.fromR === bestTTMove.fromR && a.toR === bestTTMove.toR && a.toC === bestTTMove.toC && a.fromC === bestTTMove.fromC) return -1;
                if (b.fromR === bestTTMove.fromR && b.toR === bestTTMove.toR && b.toC === bestTTMove.toC && b.fromC === bestTTMove.fromC) return 1;
                return b.score - a.score; // Fallback al score original MVV-LVA
            });
        }
    }

    let bestEval = isMaximizing ? -Infinity : Infinity;
    let bestMoveObj = null;
    let origAlpha = alpha;

    for (let i = 0; i < moves.length; i++) {
        const state = makeMove(moves[i]);
        const evaluation = minimax(depth - 1, alpha, beta, !isMaximizing, startTime);
        undoMove(state);

        if (evaluation === 'TIMEOUT') return 'TIMEOUT';

        if (isMaximizing) {
            if (evaluation > bestEval) {
                bestEval = evaluation;
                bestMoveObj = moves[i];
            }
            alpha = Math.max(alpha, evaluation);
        } else {
            if (evaluation < bestEval) {
                bestEval = evaluation;
                bestMoveObj = moves[i];
            }
            beta = Math.min(beta, evaluation);
        }

        if (beta <= alpha) break;
    }

    let flag = 'EXACT';
    if (bestEval <= origAlpha) flag = 'UPPERBOUND';
    else if (bestEval >= beta) flag = 'LOWERBOUND';

    if (transpositionTable.size > 100000) transpositionTable.clear(); // OOM protection
    transpositionTable.set(hashKey, {
        depth: depth,
        eval: bestEval,
        flag: flag,
        bestMove: bestMoveObj
    });

    return bestEval;
}

function findBestMove() {
    const startTime = performance.now();
    let bestMove = null;
    let maxDepth = 1;
    let bestEvalGlobal = -Infinity;

    while (performance.now() - startTime < TIME_LIMIT) {
        let currentBestEval = -Infinity;
        let currentBestMoves = [];

        const moves = generateMoves('B');
        if (moves.length === 0) break;

        for (let i = 0; i < moves.length; i++) {
            const state = makeMove(moves[i]);
            const evalVal = minimax(maxDepth - 1, -Infinity, Infinity, false, startTime);
            undoMove(state);

            if (evalVal === 'TIMEOUT') break;

            if (evalVal > currentBestEval) {
                currentBestEval = evalVal;
                currentBestMoves = [moves[i]];
            } else if (evalVal === currentBestEval) {
                currentBestMoves.push(moves[i]);
            }
        }

        if (performance.now() - startTime >= TIME_LIMIT && maxDepth > 1) {
            break; // Descartar iteración incompleta si no es la primera
        }

        if (currentBestMoves.length > 0) {
            const randomIndex = Math.floor(Math.random() * currentBestMoves.length);
            bestMove = currentBestMoves[randomIndex];
            bestEvalGlobal = currentBestEval;
        }

        maxDepth++;
    }

    if (!bestMove) return null;
    
    const centipawns = -bestEvalGlobal;
    const prob = 100 / (1 + Math.pow(10, -centipawns / 400));
    bestMove.winPercentage = prob;

    return bestMove;
}
