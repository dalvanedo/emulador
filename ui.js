// ui.js

document.addEventListener('DOMContentLoaded', () => {
    const game = new GameState();
    let selectedCell = null;

    const boardElement = document.getElementById('board');
    const btnReset = document.getElementById('btn-reset');
    
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
                    }

                    pieceElement.textContent = piece.value;

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

    function updateSidebar(moveResult = null) {
        const turn = game.currentTurn;
        
        // 1. Actualizar indicador del turno actual
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
                const winnerName = game.winner === 'A' ? 'Equipo A (Humano)' : 'Equipo B (IA)';
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
                
                turnValue.textContent = 'Equipo A (Humano)';
            } else {
                statusCard.style.borderLeftColor = 'var(--color-player-b)';
                pulseIndicator.style.backgroundColor = 'var(--color-player-b)';
                pulseIndicator.style.boxShadow = '0 0 10px var(--color-player-b)';
                
                turnAvatar.textContent = 'B';
                turnAvatar.style.borderColor = 'var(--color-player-b)';
                turnAvatar.style.color = 'var(--color-player-b)';
                turnAvatar.style.backgroundColor = 'hsla(345, 100%, 55%, 0.15)';
                
                turnValue.textContent = 'Equipo B (IA Minimax)';
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

    // Evento de Reinicio
    btnReset.addEventListener('click', () => {
        game.initBoard();
        selectedCell = null;
        renderBoard();
        updateSidebar();
        
        // Resetear estilos manuales en caso de fin de juego previo
        turnAvatar.style.borderColor = '';
        turnAvatar.style.color = '';
        turnAvatar.style.backgroundColor = '';
    });

    // Inicializar el render y la barra de estado
    renderBoard();
    updateSidebar();
});
