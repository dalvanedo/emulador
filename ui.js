// ui.js

document.addEventListener('DOMContentLoaded', () => {
    const game = new GameState();
    let selectedCell = null;
    let gameMode = 'ai'; // 'ai' o 'human'
    let currentReviewIndex = -1;
    let isReviewMode = false;
    
    // Crear el Web Worker en línea mediante un Blob para evitar problemas de CORS con el protocolo file://
    const workerCode = `\n// worker.js

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
\n`;
    
    const blob = new Blob([workerCode], { type: 'application/javascript' });
    const aiWorker = new Worker(URL.createObjectURL(blob));

    const boardElement = document.getElementById('board');
    const btnReset = document.getElementById('btn-reset');
    
    // Selectores de Modo de Juego
    const btnModeAi = document.getElementById('btn-mode-ai');
    const btnModeHuman = document.getElementById('btn-mode-human');

    // Elementos del panel lateral
    const statusCard = document.getElementById('status-card');
    const pulseIndicator = document.getElementById('pulse-indicator');
    const turnAvatar = document.getElementById('turn-avatar');
    const turnValue = document.getElementById('turn-value');
    
    const teamAFlag = document.getElementById('team-a-flag');
    const teamAAttackers = document.getElementById('team-a-attackers');
    const teamBFlag = document.getElementById('team-b-flag');
    const teamBAttackers = document.getElementById('team-b-attackers');

    // Selectores del panel de revisión
    const reviewCard = document.getElementById('review-card');
    const btnReviewStart = document.getElementById('btn-review-start');
    const btnReviewPrev = document.getElementById('btn-review-prev');
    const btnReviewNext = document.getElementById('btn-review-next');
    const btnReviewEnd = document.getElementById('btn-review-end');
    const reviewStatus = document.getElementById('review-status');
    const reviewDetails = document.getElementById('review-details');
    const victoryBarFill = document.getElementById('victory-bar-fill');
    const victoryPercentageText = document.getElementById('victory-percentage-text');

    function renderBoard() {
        boardElement.innerHTML = '';

        if (isReviewMode) {
            boardElement.classList.add('board-locked');
        } else {
            boardElement.classList.remove('board-locked');
        }

        for (let r = 0; r < 7; r++) {
            for (let c = 0; c < 7; c++) {
                const cellElement = document.createElement('div');
                cellElement.classList.add('cell');
                cellElement.dataset.row = r;
                cellElement.dataset.col = c;

                const boardSource = isReviewMode ? window.gameHistory[currentReviewIndex].board : game.board;
                const piece = boardSource[r][c];

                // Resaltar casilla seleccionada
                if (!isReviewMode && selectedCell && selectedCell.r === r && selectedCell.c === c) {
                    cellElement.classList.add('selected');
                }

                // Resaltar posibles casillas a las que mover la pieza seleccionada
                if (!isReviewMode && selectedCell && game.isValidMove(selectedCell.r, selectedCell.c, r, c)) {
                    cellElement.classList.add('valid-hint');
                }

                if (piece) {
                    const pieceElement = document.createElement('div');
                    pieceElement.classList.add('piece');
                    
                    if (piece.team === 'A') {
                        pieceElement.classList.add('piece-a');
                    } else {
                        pieceElement.classList.add('piece-b');
                    }

                    if (piece.type === 'flag') {
                        pieceElement.classList.add('piece-flag');
                        pieceElement.innerHTML = `
                            <svg viewBox="0 0 24 24" fill="currentColor" style="width: 1.5rem; height: 1.5rem; display: block;">
                                <path d="M12.4 5H18v10h-4.6l-.4-2H7v6H5V3.5h7l.4 1.5z"></path>
                            </svg>
                        `;
                    } else {
                        pieceElement.textContent = piece.value;
                    }

                    // Si es la pieza seleccionada, aplicar clase selected
                    if (!isReviewMode && selectedCell && selectedCell.r === r && selectedCell.c === c) {
                        pieceElement.classList.add('selected');
                    }

                    cellElement.appendChild(pieceElement);
                }

                // Manejo del evento de click en la casilla
                cellElement.addEventListener('click', () => handleCellClick(r, c));

                boardElement.appendChild(cellElement);
            }
        }
    }

    function handleCellClick(r, c) {
        if (game.gameOver || isReviewMode) return;
        // Evitar clicks si la IA está pensando
        if (document.body.classList.contains('ia-thinking')) return;

        const piece = game.board[r][c];

        if (!selectedCell) {
            // Primer Clic: Seleccionar una pieza del equipo al que le toca
            if (piece && piece.team === game.currentTurn) {
                // La bandera no puede moverse, no permitimos seleccionarla
                if (piece.type === 'flag') return;
                
                selectedCell = { r, c };
                renderBoard();
            }
        } else {
            // Segundo Clic: Intentar mover o re-seleccionar
            if (game.isValidMove(selectedCell.r, selectedCell.c, r, c)) {
                const result = game.movePiece(selectedCell.r, selectedCell.c, r, c);
                
                if (result.success) {
                    selectedCell = null;
                    renderBoard();
                    updateSidebar(result);

                    // Si le toca a la IA, el juego no ha terminado y estamos en modo IA
                    if (gameMode === 'ai' && game.currentTurn === 'B' && !game.gameOver) {
                        triggerAIMove();
                    }
                }
            } else if (piece && piece.team === game.currentTurn && piece.type !== 'flag') {
                // Cambiar selección si se hace clic en otra de sus piezas móviles
                selectedCell = { r, c };
                renderBoard();
            } else {
                // Clic inválido o deselección
                selectedCell = null;
                renderBoard();
            }
        }
    }

    function triggerAIMove() {
        // Bloquear visualmente la interfaz añadiendo la clase ia-thinking
        document.body.classList.add('ia-thinking');
        
        // Actualizar visualmente la barra lateral para mostrar que la IA está pensando
        turnValue.textContent = 'Equipo B (IA) pensando...';
        statusCard.classList.add('thinking-pulse');
        
        // Enviar el tablero actual al Web Worker para calcular el movimiento
        aiWorker.postMessage({
            board: game.board,
            gameOver: game.gameOver,
            winner: game.winner,
            currentTurn: game.currentTurn
        });
    }

    // Configurar el listener de respuesta del Web Worker
    aiWorker.onmessage = function(e) {
        const bestMove = e.data;
        if (bestMove) {
            // Retrasar levemente para dar una sensación más orgánica y visual al movimiento
            setTimeout(() => {
                const result = game.movePiece(bestMove.fromR, bestMove.fromC, bestMove.toR, bestMove.toC);
                
                // Desbloquear la interfaz
                document.body.classList.remove('ia-thinking');
                statusCard.classList.remove('thinking-pulse');
                
                renderBoard();
                updateSidebar(result);
            }, 600); // 600ms de retraso simulado para que se aprecie la animación de "pensando"
        }
    };

    function updateSidebar(moveResult = null) {
        const turn = game.currentTurn;
        
        // 1. Actualizar indicador del turno actual y textos correspondientes
        const badgeA = document.getElementById('team-a-badge');
        const badgeB = document.getElementById('team-b-badge');
        if (badgeA) badgeA.textContent = gameMode === 'ai' ? 'Humano' : 'Humano 1';
        if (badgeB) badgeB.textContent = gameMode === 'ai' ? 'IA Minimax' : 'Humano 2';

        if (game.gameOver) {
            statusCard.style.borderLeftColor = game.winner === 'A' ? 'var(--color-player-a)' : 'var(--color-player-b)';
            pulseIndicator.classList.remove('active');
            pulseIndicator.style.backgroundColor = 'transparent';
            pulseIndicator.style.boxShadow = 'none';

            if (game.winner === 'Draw') {
                turnAvatar.textContent = '=';
                turnAvatar.style.borderColor = 'var(--text-muted)';
                turnAvatar.style.color = 'var(--text-muted)';
                turnAvatar.style.backgroundColor = 'rgba(255, 255, 255, 0.05)';
                turnValue.textContent = 'Partida Terminada - Empate';
            } else {
                const winnerName = game.winner === 'A' 
                    ? (gameMode === 'ai' ? 'Equipo A (Humano)' : 'Equipo A (Humano 1)')
                    : (gameMode === 'ai' ? 'Equipo B (IA)' : 'Equipo B (Humano 2)');
                turnAvatar.textContent = game.winner;
                turnAvatar.style.borderColor = game.winner === 'A' ? 'var(--color-player-a)' : 'var(--color-player-b)';
                turnAvatar.style.color = game.winner === 'A' ? 'var(--color-player-a)' : 'var(--color-player-b)';
                turnAvatar.style.backgroundColor = game.winner === 'A' ? 'hsla(210, 100%, 55%, 0.15)' : 'hsla(345, 100%, 55%, 0.15)';
                turnValue.innerHTML = `¡Ganador! <span style="color: ${game.winner === 'A' ? 'var(--color-player-a)' : 'var(--color-player-b)'}">${winnerName}</span>`;
            }

            if (window.gameHistory && window.gameHistory.length > 0) {
                showReviewPanel();
            }
        } else {
            // Configurar estilos según el turno activo
            pulseIndicator.classList.add('active');
            
            if (turn === 'A') {
                statusCard.style.borderLeftColor = 'var(--color-player-a)';
                pulseIndicator.style.backgroundColor = 'var(--color-player-a)';
                pulseIndicator.style.boxShadow = '0 0 10px var(--color-player-a)';
                
                turnAvatar.textContent = 'A';
                turnAvatar.style.borderColor = 'var(--color-player-a)';
                turnAvatar.style.color = 'var(--color-player-a)';
                turnAvatar.style.backgroundColor = 'hsla(210, 100%, 55%, 0.15)';
                
                turnValue.textContent = gameMode === 'ai' ? 'Equipo A (Humano)' : 'Equipo A (Humano 1)';
            } else {
                statusCard.style.borderLeftColor = 'var(--color-player-b)';
                pulseIndicator.style.backgroundColor = 'var(--color-player-b)';
                pulseIndicator.style.boxShadow = '0 0 10px var(--color-player-b)';
                
                turnAvatar.textContent = 'B';
                turnAvatar.style.borderColor = 'var(--color-player-b)';
                turnAvatar.style.color = 'var(--color-player-b)';
                turnAvatar.style.backgroundColor = 'hsla(345, 100%, 55%, 0.15)';
                
                turnValue.textContent = gameMode === 'ai' ? 'Equipo B (IA Minimax)' : 'Equipo B (Humano 2)';
            }
        }

        // 2. Actualizar conteo y estado de piezas de ambos equipos
        const statsA = game.getPieceCount('A');
        const statsB = game.getPieceCount('B');

        // Equipo A
        if (statsA.flag) {
            teamAFlag.textContent = 'Activa';
            teamAFlag.className = 'stat-val alive';
        } else {
            teamAFlag.textContent = 'CAPTURADA';
            teamAFlag.className = 'stat-val';
            teamAFlag.style.color = 'var(--color-player-b)';
        }
        teamAAttackers.textContent = `${statsA.attackers} / 5`;

        // Equipo B
        if (statsB.flag) {
            teamBFlag.textContent = 'Activa';
            teamBFlag.className = 'stat-val alive';
        } else {
            teamBFlag.textContent = 'CAPTURADA';
            teamBFlag.className = 'stat-val';
            teamBFlag.style.color = 'var(--color-player-a)';
        }
        teamBAttackers.textContent = `${statsB.attackers} / 5`;
    }

    function resetGame() {
        // En caso de que se reinicie mientras la IA piensa, removemos los bloqueos
        document.body.classList.remove('ia-thinking');
        statusCard.classList.remove('thinking-pulse');
        
        hideReviewPanel();
        
        game.initBoard();
        selectedCell = null;
        renderBoard();
        updateSidebar();
        
        // Resetear estilos manuales en caso de fin de juego previo
        turnAvatar.style.borderColor = '';
        turnAvatar.style.color = '';
        turnAvatar.style.backgroundColor = '';
    }

    // Configurar selectores de Modo de Juego
    btnModeAi.addEventListener('click', () => {
        if (document.body.classList.contains('ia-thinking')) return;
        gameMode = 'ai';
        btnModeAi.classList.add('active');
        btnModeHuman.classList.remove('active');
        resetGame();
    });

    btnModeHuman.addEventListener('click', () => {
        if (document.body.classList.contains('ia-thinking')) return;
        gameMode = 'human';
        btnModeHuman.classList.add('active');
        btnModeAi.classList.remove('active');
        resetGame();
    });

    // Funciones de utilidad para el Modo Revisión
    function toChessCoords(r, c) {
        const cols = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
        const row = 7 - r;
        return `${cols[c]}${row}`;
    }

    function getWinPercentage(boardSource) {
        let hasFlagA = false;
        let hasFlagB = false;
        let attackersA = 0;
        let attackersB = 0;

        for (let r = 0; r < 7; r++) {
            for (let c = 0; c < 7; c++) {
                const piece = boardSource[r][c];
                if (piece) {
                    if (piece.type === 'flag') {
                        if (piece.team === 'A') hasFlagA = true;
                        if (piece.team === 'B') hasFlagB = true;
                    } else if (piece.type === 'attacker') {
                        if (piece.team === 'A') attackersA++;
                        if (piece.team === 'B') attackersB++;
                    }
                }
            }
        }

        // Terminal states check
        if (!hasFlagB) return 100; // Azul won (captured B flag)
        if (!hasFlagA) return 0;   // Rojo won (captured A flag)
        if (attackersA === 0 && attackersB === 0) return 50; // Draw
        if (attackersA === 0) return 0;   // Rojo won
        if (attackersB === 0) return 100; // Azul won

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

        let materialB = 0, materialA = 0;
        let positionalB = 0, positionalA = 0;

        for (let r = 0; r < 7; r++) {
            for (let c = 0; c < 7; c++) {
                const piece = boardSource[r][c];
                if (piece && piece.type === 'attacker') {
                    const val = piece.value;
                    const materialVal = pieceValues[val];
                    
                    if (piece.team === 'B') {
                        materialB += materialVal;
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

        // B's evaluation is scoreB - scoreA. So A's score is scoreA - scoreB.
        const centipawns = scoreA - scoreB;
        
        // Modelo Elo estándar de ajedrez
        return 100 / (1 + Math.pow(10, -centipawns / 400));
    }

    function showReviewPanel() {
        reviewCard.style.display = 'block';
        isReviewMode = true;
        currentReviewIndex = window.gameHistory.length - 1;
        updateReviewUI();
    }

    function hideReviewPanel() {
        reviewCard.style.display = 'none';
        isReviewMode = false;
        currentReviewIndex = -1;
        boardElement.classList.remove('board-locked');
    }

    function updateReviewUI() {
        if (!window.gameHistory || window.gameHistory.length === 0) return;

        if (currentReviewIndex < 0) currentReviewIndex = 0;
        if (currentReviewIndex >= window.gameHistory.length) {
            currentReviewIndex = window.gameHistory.length - 1;
        }

        reviewStatus.textContent = `${currentReviewIndex + 1} / ${window.gameHistory.length}`;

        btnReviewStart.disabled = currentReviewIndex === 0;
        btnReviewPrev.disabled = currentReviewIndex === 0;
        btnReviewNext.disabled = currentReviewIndex === window.gameHistory.length - 1;
        btnReviewEnd.disabled = currentReviewIndex === window.gameHistory.length - 1;

        const state = window.gameHistory[currentReviewIndex];
        const move = state.move;
        const playerBadge = state.turn === 'A' ? 'team-a' : 'team-b';
        const playerName = state.turn === 'A' 
            ? (gameMode === 'ai' ? 'Equipo A (Humano)' : 'Equipo A (Humano 1)')
            : (gameMode === 'ai' ? 'Equipo B (IA)' : 'Equipo B (Humano 2)');

        let detailsHtml = `
            <div class="move-label">
                <span class="move-badge ${playerBadge}">${state.turn}</span>
                <span class="move-text">${playerName}</span>
            </div>
        `;

        if (move && move.fromRow !== null && move.fromRow !== undefined) {
            detailsHtml += `
            <div style="margin-top: 4px;">
                Movió de <strong class="move-text">${toChessCoords(move.fromRow, move.fromCol)}</strong> a <strong class="move-text">${toChessCoords(move.toRow, move.toCol)}</strong>
            </div>
            `;
        } else {
            detailsHtml += `
            <div style="margin-top: 4px;">
                <strong>Posición Inicial</strong>
            </div>
            `;
        }

        reviewDetails.innerHTML = detailsHtml;

        // Calculate and display victory percentage for Team Blue (A)
        const pct = getWinPercentage(state.board);
        victoryBarFill.style.width = `${pct}%`;
        victoryPercentageText.textContent = `${pct.toFixed(1)}%`;

        // Dynamic color transition based on percentage
        if (pct > 70) {
            victoryBarFill.style.background = 'linear-gradient(90deg, var(--color-player-a) 0%, hsl(180, 100%, 50%) 100%)';
            victoryBarFill.style.boxShadow = '0 0 10px hsla(180, 100%, 50%, 0.4)';
        } else if (pct < 30) {
            victoryBarFill.style.background = 'linear-gradient(90deg, hsl(210, 60%, 40%) 0%, var(--color-player-a) 100%)';
            victoryBarFill.style.boxShadow = 'none';
        } else {
            victoryBarFill.style.background = 'linear-gradient(90deg, var(--color-player-a) 0%, hsl(200, 100%, 60%) 100%)';
            victoryBarFill.style.boxShadow = '0 0 8px var(--color-player-a-glow)';
        }

        renderBoard();
    }

    btnReviewStart.addEventListener('click', () => {
        currentReviewIndex = 0;
        updateReviewUI();
    });

    btnReviewPrev.addEventListener('click', () => {
        if (currentReviewIndex > 0) {
            currentReviewIndex--;
            updateReviewUI();
        }
    });

    btnReviewNext.addEventListener('click', () => {
        if (currentReviewIndex < window.gameHistory.length - 1) {
            currentReviewIndex++;
            updateReviewUI();
        }
    });

    btnReviewEnd.addEventListener('click', () => {
        currentReviewIndex = window.gameHistory.length - 1;
        updateReviewUI();
    });

    // Evento de Reinicio
    btnReset.addEventListener('click', resetGame);

    // Inicializar el render y la barra de estado
    renderBoard();
    updateSidebar();
});
