// game.js

class GameState {
    constructor() {
        this.board = Array(7).fill(null).map(() => Array(7).fill(null));
        this.currentTurn = 'A'; // 'A' = Humano (Azul), 'B' = IA (Rojo)
        this.gameOver = false;
        this.winner = null;
        
        this.initBoard();
    }

    initBoard() {
        // Limpiar tablero
        for (let r = 0; r < 7; r++) {
            for (let c = 0; c < 7; c++) {
                this.board[r][c] = null;
            }
        }
        this.gameOver = false;
        this.winner = null;
        this.currentTurn = 'A';

        // 1. Colocar las Banderas en la posición central fija de sus filas base extremas (0 y 6)
        this.board[0][3] = { team: 'B', type: 'flag', value: 'F' }; // IA
        this.board[6][3] = { team: 'A', type: 'flag', value: 'F' }; // Humano

        // 2. Mezclar piezas atacantes 1 a 5 para el Equipo B en su penúltima fila (Fila 1)
        const piecesB = [
            { team: 'B', type: 'attacker', value: 1 },
            { team: 'B', type: 'attacker', value: 2 },
            { team: 'B', type: 'attacker', value: 3 },
            { team: 'B', type: 'attacker', value: 4 },
            { team: 'B', type: 'attacker', value: 5 }
        ];
        this.shuffleArray(piecesB);

        // Colocar en Fila 1 en las posiciones centrales (columnas 1 a 5), extremos (0 y 6) libres
        let idxB = 0;
        for (let col = 1; col <= 5; col++) {
            this.board[1][col] = piecesB[idxB++];
        }

        // 3. Mezclar piezas atacantes 1 a 5 para el Equipo A en su penúltima fila (Fila 5)
        const piecesA = [
            { team: 'A', type: 'attacker', value: 1 },
            { team: 'A', type: 'attacker', value: 2 },
            { team: 'A', type: 'attacker', value: 3 },
            { team: 'A', type: 'attacker', value: 4 },
            { team: 'A', type: 'attacker', value: 5 }
        ];
        this.shuffleArray(piecesA);

        // Colocar en Fila 5 en las posiciones centrales (columnas 1 a 5), extremos (0 y 6) libres
        let idxA = 0;
        for (let col = 1; col <= 5; col++) {
            this.board[5][col] = piecesA[idxA++];
        }
    }

    shuffleArray(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
    }

    isValidMove(fromRow, fromCol, toRow, toCol) {
        if (this.gameOver) return false;

        // Comprobación de límites
        if (fromRow < 0 || fromRow >= 7 || fromCol < 0 || fromCol >= 7 ||
            toRow < 0 || toRow >= 7 || toCol < 0 || toCol >= 7) {
            return false;
        }

        const piece = this.board[fromRow][fromCol];
        
        // Debe haber una pieza en la casilla de origen
        if (!piece) return false;

        // Debe ser el turno del dueño de la pieza
        if (piece.team !== this.currentTurn) return false;

        // La bandera 'F' no puede moverse (es estática para defensa)
        if (piece.type === 'flag') return false;

        // Movimiento en cualquier dirección (incluyendo diagonales) de exactamente 1 casilla
        const rowDiff = Math.abs(fromRow - toRow);
        const colDiff = Math.abs(fromCol - toCol);
        const isAdjacent = (rowDiff <= 1 && colDiff <= 1) && !(rowDiff === 0 && colDiff === 0);
        if (!isAdjacent) return false;

        // No se puede mover a una casilla ocupada por una pieza propia
        const destPiece = this.board[toRow][toCol];
        if (destPiece && destPiece.team === piece.team) return false;

        // Regla: No valen movimientos suicidas
        // Si atacamos una pieza enemiga, el atacante no puede perder el combate.
        if (destPiece && destPiece.team !== piece.team) {
            if (destPiece.type !== 'flag') {
                const aVal = piece.value;
                const dVal = destPiece.value;

                // Casos en los que el defensor gana (movimiento suicida para el atacante)
                if (aVal === 5 && dVal === 1) {
                    return false; // El 1 come al 5, defensor gana
                }
                if (aVal !== 1 && dVal === 5 && aVal < dVal) {
                    return false; // Defensor 5 gana a cualquier atacante excepto al 1
                }
                if (aVal < dVal && !(aVal === 1 && dVal === 5)) {
                    return false; // En general, menor valor pierde contra mayor valor
                }
            }
        }

        return true;
    }

    movePiece(fromRow, fromCol, toRow, toCol) {
        if (!this.isValidMove(fromRow, fromCol, toRow, toCol)) {
            return { success: false };
        }

        const attacker = this.board[fromRow][fromCol];
        const defender = this.board[toRow][toCol];

        let battleResult = 'move'; // 'move', 'victory_a', 'victory_b', 'mutual_destroyed'
        let message = '';

        if (defender) {
            // Combate
            if (defender.type === 'flag') {
                battleResult = 'capture_flag';
                message = `¡Equipo ${attacker.team} capturó la Bandera enemiga!`;
                this.board[toRow][toCol] = attacker;
                this.board[fromRow][fromCol] = null;
                this.endGame(attacker.team);
            } else {
                // Resolviendo combate entre atacantes
                const aVal = attacker.value;
                const dVal = defender.value;

                if (aVal === dVal) {
                    // Empate: gana el atacante
                    battleResult = 'win_attacker';
                    message = `Atacante ${aVal} vence a Defensor ${dVal} (Empate favorece atacante)`;
                    this.board[toRow][toCol] = attacker;
                    this.board[fromRow][fromCol] = null;
                } else if (aVal === 1 && dVal === 5) {
                    // El 1 come al 5
                    battleResult = 'win_attacker';
                    message = `¡Atacante 1 derrota al poderoso Defensor 5!`;
                    this.board[toRow][toCol] = attacker;
                    this.board[fromRow][fromCol] = null;
                } else if (aVal === 5 && dVal === 1) {
                    // Si el atacante es 5 y defensor es 1, el 1 come al 5, gana defensor (teóricamente no debería pasar por filtro suicida)
                    battleResult = 'win_defender';
                    message = `Defensor 1 detiene al Atacante 5`;
                    this.board[fromRow][fromCol] = null;
                } else if (aVal > dVal) {
                    // Mayor valor gana
                    battleResult = 'win_attacker';
                    message = `Atacante ${aVal} vence a Defensor ${dVal}`;
                    this.board[toRow][toCol] = attacker;
                    this.board[fromRow][fromCol] = null;
                } else {
                    // Menor valor pierde (teóricamente no debería ocurrir por filtro suicida)
                    battleResult = 'win_defender';
                    message = `Defensor ${dVal} derrota a Atacante ${aVal}`;
                    this.board[fromRow][fromCol] = null;
                }
            }
        } else {
            // Movimiento simple
            this.board[toRow][toCol] = attacker;
            this.board[fromRow][fromCol] = null;
        }

        // Verificar si algún equipo se quedó sin atacantes
        if (!this.gameOver) {
            this.checkAttackerCount();
        }

        // Cambiar turno si el juego no terminó
        if (!this.gameOver) {
            this.currentTurn = this.currentTurn === 'A' ? 'B' : 'A';
        }

        return {
            success: true,
            battleResult,
            message,
            turn: this.currentTurn,
            gameOver: this.gameOver,
            winner: this.winner
        };
    }

    checkAttackerCount() {
        let hasAttackerA = false;
        let hasAttackerB = false;

        for (let r = 0; r < 7; r++) {
            for (let c = 0; c < 7; c++) {
                const piece = this.board[r][c];
                if (piece && piece.type === 'attacker') {
                    if (piece.team === 'A') hasAttackerA = true;
                    if (piece.team === 'B') hasAttackerB = true;
                }
            }
        }

        if (!hasAttackerA && !hasAttackerB) {
            this.endGame('Draw'); // Empate técnico
        } else if (!hasAttackerA) {
            this.endGame('B'); // Gana B por eliminación de atacantes
        } else if (!hasAttackerB) {
            this.endGame('A'); // Gana A por eliminación de atacantes
        }
    }

    endGame(winnerTeam) {
        this.gameOver = true;
        this.winner = winnerTeam;
    }

    getPieceCount(team) {
        let flag = false;
        let attackers = 0;
        for (let r = 0; r < 7; r++) {
            for (let c = 0; c < 7; c++) {
                const piece = this.board[r][c];
                if (piece && piece.team === team) {
                    if (piece.type === 'flag') flag = true;
                    if (piece.type === 'attacker') attackers++;
                }
            }
        }
        return { flag, attackers };
    }
}
