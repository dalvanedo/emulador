// ui.js

document.addEventListener('DOMContentLoaded', () => {
    const game = new GameState();
    let selectedCell = null;
    let gameMode = 'ai'; // 'ai' o 'human'
    
    // Crear el Web Worker en línea mediante un Blob para evitar problemas de CORS con el protocolo file://
    const workerCode = `
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
                return 0;
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
                                const advance = r;
                                scoreB += w + weights.pos * advance;
                            } else if (piece.team === 'A') {
                                aliveA[val] = true;
                                const advance = 6 - r;
                                scoreA += w + weights.pos * advance;
                            }
                        }
                    }
                }
            }

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
                const evalVal = minimax(2, -Infinity, Infinity, false);
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
    `;
    
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

    function renderBoard() {
        boardElement.innerHTML = '';

        for (let r = 0; r < 7; r++) {
            for (let c = 0; c < 7; c++) {
                const cellElement = document.createElement('div');
                cellElement.classList.add('cell');
                cellElement.dataset.row = r;
                cellElement.dataset.col = c;

                const piece = game.board[r][c];

                // Resaltar casilla seleccionada
                if (selectedCell && selectedCell.r === r && selectedCell.c === c) {
                    cellElement.classList.add('selected');
                }

                // Resaltar posibles casillas a las que mover la pieza seleccionada
                if (selectedCell && game.isValidMove(selectedCell.r, selectedCell.c, r, c)) {
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
                    if (selectedCell && selectedCell.r === r && selectedCell.c === c) {
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
        if (game.gameOver) return;
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

    // Evento de Reinicio
    btnReset.addEventListener('click', resetGame);

    // Inicializar el render y la barra de estado
    renderBoard();
    updateSidebar();
});
