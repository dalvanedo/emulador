// ui.js

document.addEventListener('DOMContentLoaded', () => {
    const game = new GameState();
    let selectedCell = null;
    let gameMode = 'ai'; // 'ai' o 'human'
    let currentReviewIndex = -1;
    let isReviewMode = false;
    
    // Crear el Web Worker apuntando al archivo independiente
    let aiWorker;
    try {
        aiWorker = new Worker('worker.js');
    } catch (e) {
        console.error("No se pudo iniciar el Worker (¿Estás usando file:// en lugar de un servidor local HTTP?):", e);
        const overlay = document.getElementById('ai-loading-overlay');
        if (overlay) overlay.classList.add('hidden');
    }

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
        
        if (aiWorker) {
            aiWorker.postMessage({
                board: game.board,
                gameOver: game.gameOver,
                winner: game.winner,
                currentTurn: game.currentTurn
            });
        } else {
            console.error("Worker no disponible. Por favor arranca el juego con un servidor local HTTP.");
            document.body.classList.remove('ia-thinking');
            statusCard.classList.remove('thinking-pulse');
            turnValue.textContent = 'Error: Worker no disponible';
        }
    }

    // Configurar el listener de respuesta del Web Worker
    if (aiWorker) {
        aiWorker.onmessage = function(e) {
            if (e.data && e.data.type === 'NN_PROGRESS') {
                const bar = document.getElementById('loading-progress-bar');
                const text = document.getElementById('loading-percent-text');
                if (bar && text) {
                    bar.style.width = `${e.data.percent}%`;
                    text.textContent = `${Math.round(e.data.percent)}%`;
                }
                return;
            }

            if (e.data && e.data.type === 'NN_LOADED') {
                const overlay = document.getElementById('ai-loading-overlay');
                if (overlay) overlay.classList.add('hidden');
                return;
            }

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
    }

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
        let valueA = 0;
        let valueB = 0;

        for (let r = 0; r < 7; r++) {
            for (let c = 0; c < 7; c++) {
                const piece = boardSource[r][c];
                if (piece) {
                    if (piece.type === 'flag') {
                        if (piece.team === 'A') hasFlagA = true;
                        if (piece.team === 'B') hasFlagB = true;
                    } else if (piece.type === 'attacker') {
                        if (piece.team === 'A') { attackersA++; valueA += piece.value; }
                        if (piece.team === 'B') { attackersB++; valueB += piece.value; }
                    }
                }
            }
        }

        if (!hasFlagB) return 100; // Azul won
        if (!hasFlagA) return 0;   // Rojo won
        if (attackersA === 0 && attackersB === 0) return 50;
        if (attackersA === 0) return 0;
        if (attackersB === 0) return 100;

        const totalValue = valueA + valueB;
        if (totalValue === 0) return 50;
        return (valueA / totalValue) * 100;
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
