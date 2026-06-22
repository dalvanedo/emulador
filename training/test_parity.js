// test_parity.js
const fs = require('fs');
const path = require('path');

// Mock DOM para poder cargar game.js si lo requiere
global.document = { addEventListener: () => {} };

// Cargar la definición de GameState
// Asegúrate de que este script corra en Node.js y game.js no use 'window' que rompa
const gameScript = fs.readFileSync(path.join(__dirname, '../game.js'), 'utf8');
eval(gameScript);

function getBoardFEN(board) {
    let fen = '';
    for(let r=0; r<7; r++) {
        for(let c=0; c<7; c++) {
            const p = board[r][c];
            if (!p) fen += '.';
            else if (p.type === 'flag') fen += p.team === 'A' ? 'F' : 'f';
            else {
                if (p.team === 'A') fen += p.value;
                else fen += String.fromCharCode(96 + parseInt(p.value));
            }
        }
    }
    return fen;
}

let game = new GameState();
game.initBoard();

// Solo generamos el estado inicial FEN para validarlo contra python
console.log(getBoardFEN(game.board));
