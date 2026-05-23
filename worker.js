// worker.js

let board;
let gameOver;
let winner;
let currentTurn;
let countA;
let countB;

const weights = {
    '1': 29.06,
    '2': 29.09,
    '3': 36.57,
    '4': 38.8,
    '5': 49.76,
    'pos': 8.56
};

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

    const bestMove = findBestMove();
    self.postMessage(bestMove);
};

function evaluateBoard(board, gameOver, winner) {
    if (gameOver) {
        if (winner === 'B') return 10000;
        if (winner === 'A') return -10000;
        return 0; // Draw
    }

    let scoreB = 0;
    let scoreA = 0;

    let aliveB = { 1: false, 2: false, 3: false, 4: false, 5: false };
    let aliveA = { 1: false, 2: false, 3: false, 4: false, 5: false };

    for (let r = 0; r < 7; r++) {
        for (let c = 0; c < 7; c++) {
            const piece = board[r][c];
            if (piece) {
                if (piece.type === 'attacker') {
                    const val = piece.value;
                    const w = weights[val];
                    if (piece.team === 'B') {
                        aliveB[val] = true;
                        const advance = r; // B moves from row 0 down to row 6
                        scoreB += w + weights.pos * advance;
                    } else if (piece.team === 'A') {
                        aliveA[val] = true;
                        const advance = 6 - r; // A moves from row 6 up to row 0
                        scoreA += w + weights.pos * advance;
                    }
                }
            }
        }
    }

    // Subtract lost pieces' values
    for (let val = 1; val <= 5; val++) {
        if (!aliveB[val]) {
            scoreB -= weights[val];
        }
        if (!aliveA[val]) {
            scoreA -= weights[val];
        }
    }

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

                        moves.push({
                            fromR: r,
                            fromC: c,
                            toR: toR,
                            toC: toC
                        });
                    }
                }
            }
        }
    }
    return moves;
}

function makeMove(move) {
    const attacker = board[move.fromR][move.fromC];
    const defender = board[move.toR][move.toC];

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
        prevCountB: countB
    };

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
}

function minimax(depth, alpha, beta, isMaximizing) {
    if (depth === 0 || gameOver) {
        return evaluateBoard(board, gameOver, winner);
    }

    if (isMaximizing) {
        let maxEval = -Infinity;
        const moves = generateMoves('B');
        for (let i = 0; i < moves.length; i++) {
            const state = makeMove(moves[i]);
            const evaluation = minimax(depth - 1, alpha, beta, false);
            undoMove(state);
            maxEval = Math.max(maxEval, evaluation);
            alpha = Math.max(alpha, evaluation);
            if (beta <= alpha) {
                break;
            }
        }
        return maxEval;
    } else {
        let minEval = Infinity;
        const moves = generateMoves('A');
        for (let i = 0; i < moves.length; i++) {
            const state = makeMove(moves[i]);
            const evaluation = minimax(depth - 1, alpha, beta, true);
            undoMove(state);
            minEval = Math.min(minEval, evaluation);
            beta = Math.min(beta, evaluation);
            if (beta <= alpha) {
                break;
            }
        }
        return minEval;
    }
}

function findBestMove() {
    const moves = generateMoves('B');
    if (moves.length === 0) return null;

    let bestEval = -Infinity;
    let bestMoves = [];

    for (let i = 0; i < moves.length; i++) {
        const state = makeMove(moves[i]);
        const evalVal = minimax(2, -Infinity, Infinity, false); // depth=3 in total, so 2 more levels
        undoMove(state);

        if (evalVal > bestEval) {
            bestEval = evalVal;
            bestMoves = [moves[i]];
        } else if (evalVal === bestEval) {
            bestMoves.push(moves[i]);
        }
    }

    const randomIndex = Math.floor(Math.random() * bestMoves.length);
    return bestMoves[randomIndex];
}
