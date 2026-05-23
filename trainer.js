document.addEventListener('DOMContentLoaded', () => {
    const btnGenerate = document.getElementById('btn-generate');
    const progressBar = document.getElementById('progress-bar');
    const progressContainer = document.getElementById('progress-container');
    const statusText = document.getElementById('status-text');

    let totalGames = 5000;
    let completedGames = 0;
    let dataset = []; // Array de strings "FEN,Resultado"
    let isGenerating = false;

    // Elementos de optimización
    const btnOptimize = document.getElementById('btn-optimize');
    const optProgressBar = document.getElementById('opt-progress-bar');
    const optProgressContainer = document.getElementById('opt-progress-container');
    const optStatusText = document.getElementById('opt-status-text');
    const weightsOutput = document.getElementById('weights-output');

    let isOptimizing = false;
    let currentOptIter = 0;
    const totalOptIters = 500;
    let bestMSE = Infinity;

    // Valores básicos para evaluación rápida en Depth 1
    let pieceValues = {
        "1": 300,
        "2": 180,
        "3": 290,
        "4": 580,
        "5": 770
    };

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

    // ==========================================
    // 1. CODIFICACIÓN DEL TABLERO (FEN)
    // ==========================================
    // Transforma la matriz de 7x7 en una cadena de 49 caracteres (dataset input).
    // FEN (Forsyth-Edwards Notation) adaptado para nuestro motor:
    // '.' = Casilla vacía
    // 'F' / 'f' = Bandera (Equipo A / Equipo B)
    // '1' a '5' = Atacantes del Equipo A
    // 'a' a 'e' = Atacantes del Equipo B (1->a, 2->b...)
    function getBoardFEN(board) {
        let fen = '';
        for(let r=0; r<7; r++) {
            for(let c=0; c<7; c++) {
                const p = board[r][c];
                if (!p) fen += '.';
                else if (p.type === 'flag') fen += p.team === 'A' ? 'F' : 'f';
                else {
                    // A: 1, 2, 3, 4, 5
                    // B: a, b, c, d, e
                    if (p.team === 'A') {
                        fen += p.value;
                    } else {
                        fen += String.fromCharCode(96 + parseInt(p.value));
                    }
                }
            }
        }
        return fen;
    }

    // ==========================================
    // 2. MOTOR DE EVALUACIÓN (HEURÍSTICA BASE)
    // ==========================================
    // Calcula la puntuación actual basándose en los centipeones y las Tablas PST.
    // Este es el valor que el Texel's Tuning de Machine Learning intentará optimizar
    // comparándolo con el resultado real de la partida.
    function evaluateState(game) {
        if (game.gameOver) {
            if (game.winner === 'B') return 20000;
            if (game.winner === 'A') return -20000;
            return 0;
        }
        let scoreB = 0;
        let scoreA = 0;
        for (let r=0; r<7; r++) {
            for (let c=0; c<7; c++) {
                const p = game.board[r][c];
                if (p && p.type === 'attacker') {
                    const mVal = pieceValues[p.value];
                    if (p.team === 'B') {
                        scoreB += mVal + pstB[r][c] * (mVal/500);
                    } else {
                        scoreA += mVal + pstA[r][c] * (mVal/500);
                    }
                }
            }
        }
        return scoreB - scoreA;
    }

    function generateMoves(game, team) {
        const moves = [];
        for (let r=0; r<7; r++) {
            for (let c=0; c<7; c++) {
                const p = game.board[r][c];
                if (p && p.team === team && p.type !== 'flag') {
                    for (let dr=-1; dr<=1; dr++) {
                        for (let dc=-1; dc<=1; dc++) {
                            if (dr===0 && dc===0) continue;
                            if (game.isValidMove(r, c, r+dr, c+dc)) {
                                let moveScore = 0;
                                const destPiece = game.board[r+dr][c+dc];
                                if (destPiece && destPiece.team !== team) {
                                    if (destPiece.type === 'flag') moveScore = 1000000;
                                    else moveScore = (pieceValues[destPiece.value] * 10) - pieceValues[p.value];
                                } else {
                                    const pst = team === 'B' ? pstB : pstA;
                                    moveScore = pst[r+dr][c+dc] - pst[r][c];
                                }
                                moves.push({fromR: r, fromC: c, toR: r+dr, toC: c+dc, score: moveScore});
                            }
                        }
                    }
                }
            }
        }
        moves.sort((a, b) => b.score - a.score);
        return moves;
    }

    // ==========================================
    // 3. EXPLORACIÓN Y MOVIMIENTO (DEPTH 1)
    // ==========================================
    // Selecciona el mejor movimiento a 1 nivel de profundidad.
    // Crucial: Durante los primeros 10 turnos, hay un 50% de probabilidad
    // de elegir un movimiento al azar. Esto asegura que el dataset tenga
    // una inmensa variedad de posiciones y no juegue siempre la misma partida.
    function getBestMove(game, team) {
        const moves = generateMoves(game, team);
        if (moves.length === 0) return null;

        // Añadir aleatoriedad en los primeros turnos para mayor variabilidad del dataset
        if (gameHistory.length < 10 && Math.random() < 0.5) {
            return moves[Math.floor(Math.random() * moves.length)];
        }

        let bestEval = team === 'B' ? -Infinity : Infinity;
        let bestMoves = [];

        for (let m of moves) {
            // Guardar estado
            const pFrom = game.board[m.fromR][m.fromC];
            const pTo = game.board[m.toR][m.toC];
            const prevGameOver = game.gameOver;
            const prevWinner = game.winner;

            // Simular
            game.movePiece(m.fromR, m.fromC, m.toR, m.toC);
            const ev = evaluateState(game);

            // Revertir
            game.board[m.fromR][m.fromC] = pFrom;
            game.board[m.toR][m.toC] = pTo;
            game.gameOver = prevGameOver;
            game.winner = prevWinner;
            game.currentTurn = team;

            if (team === 'B') {
                if (ev > bestEval) { bestEval = ev; bestMoves = [m]; }
                else if (ev === bestEval) bestMoves.push(m);
            } else {
                if (ev < bestEval) { bestEval = ev; bestMoves = [m]; }
                else if (ev === bestEval) bestMoves.push(m);
            }
        }
        return bestMoves[Math.floor(Math.random() * bestMoves.length)] || moves[0];
    }

    // ==========================================
    // 4. CICLO DE GENERACIÓN (BATCHING Y CSV)
    // ==========================================
    // Ejecuta las partidas en lotes (batches) de 100 usando setTimeout.
    // Esto evita que el bucle principal bloquee (congele) el hilo del navegador,
    // permitiendo que el DOM (la barra de progreso) se actualice fluidamente.
    function runBatch() {
        if (!isGenerating) return;

        let batchSize = 100; // Partidas por ciclo
        for (let i = 0; i < batchSize; i++) {
            if (completedGames >= totalGames) {
                finishGeneration();
                return;
            }

            const game = new GameState();
            let moveCount = 0;
            let historyFENs = [];

            while (!game.gameOver && moveCount < 100) {
                historyFENs.push(getBoardFEN(game.board));
                
                const move = getBestMove(game, game.currentTurn);
                if (!move) {
                    game.endGame('Draw');
                    break;
                }
                game.movePiece(move.fromR, move.fromC, move.toR, move.toC);
                moveCount++;
            }

            let result = '0.5';
            if (game.winner === 'A') result = '1';
            else if (game.winner === 'B') result = '0';

            // Guardar al dataset (solo capturamos 1 de cada 4 posiciones para evitar redundancia extrema,
            // ya que posiciones consecutivas están demasiado correlacionadas matemáticamente)
            for (let j = 0; j < historyFENs.length; j += 4) {
                dataset.push(`${historyFENs[j]},${result}`);
            }

            completedGames++;
        }

        const pct = (completedGames / totalGames) * 100;
        progressBar.style.width = pct + '%';
        statusText.textContent = `Generadas ${completedGames} de ${totalGames} partidas...`;

        // Llamar al siguiente lote sin bloquear la UI
        setTimeout(runBatch, 10);
    }

    function finishGeneration() {
        isGenerating = false;
        statusText.textContent = `Generación completa. Preparando CSV...`;
        
        let csvContent = "data:text/csv;charset=utf-8,FEN,Result\n" + dataset.join('\n');
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", "texel_dataset.csv");
        document.body.appendChild(link);
        
        link.click();
        
        statusText.textContent = `CSV descargado con ${dataset.length} posiciones de evaluación.`;
        btnGenerate.disabled = false;
        btnGenerate.textContent = "Generar Nuevamente";

        // Habilitar optimización
        btnOptimize.disabled = false;
        btnOptimize.style.display = 'inline-block';
        optStatusText.textContent = `Listo para optimizar sobre ${dataset.length} posiciones.`;
    }

    btnGenerate.addEventListener('click', () => {
        if (isGenerating) return;
        isGenerating = true;
        completedGames = 0;
        dataset = [];
        btnGenerate.disabled = true;
        btnOptimize.disabled = true;
        progressContainer.style.display = 'block';
        progressBar.style.width = '0%';
        statusText.textContent = "Iniciando generación de dataset...";
        
        // Timeout para que el render del UI se aplique
        setTimeout(runBatch, 100);
    });

    // ==========================================
    // 5. OPTIMIZACIÓN SPSA (TEXEL TUNING)
    // ==========================================
    
    // Calcula el Error Cuadrático Medio de todo el dataset
    function calculateMSE(testPieces, testPstB, testPstA) {
        let totalError = 0;
        for (let i = 0; i < dataset.length; i++) {
            const [fen, resStr] = dataset[i].split(',');
            const actualResult = parseFloat(resStr); // 1 = A wins, 0 = B wins

            // Recrear puntuación desde FEN
            let materialB = 0, materialA = 0;
            let positionalB = 0, positionalA = 0;
            let idx = 0;
            for(let r = 0; r < 7; r++) {
                for(let c = 0; c < 7; c++) {
                    const char = fen[idx++];
                    if (char === '.' || char === 'f' || char === 'F') continue;
                    
                    let team = (char >= '1' && char <= '5') ? 'A' : 'B';
                    let val = team === 'A' ? char : (char.charCodeAt(0) - 96).toString();
                    
                    const mVal = testPieces[val];
                    if (team === 'B') {
                        materialB += mVal;
                        positionalB += testPstB[r][c] * (mVal/500);
                    } else {
                        materialA += mVal;
                        positionalA += testPstA[r][c] * (mVal/500);
                    }
                }
            }
            
            const scoreB = materialB + positionalB;
            const scoreA = materialA + positionalA;
            const centipawns = scoreA - scoreB; // Desde la perspectiva de A

            // Probabilidad Elo para A
            const probA = 100 / (1 + Math.pow(10, -centipawns / 400)) / 100;
            
            const err = probA - actualResult;
            totalError += err * err;
        }
        return totalError / dataset.length;
    }

    function clonePST(pst) {
        return pst.map(row => [...row]);
    }

    function runOptBatch() {
        if (!isOptimizing) return;
        
        let batchSize = 10;
        for (let b = 0; b < batchSize; b++) {
            if (currentOptIter >= totalOptIters) {
                finishOptimization();
                return;
            }

            // Perturbar aleatoriamente un parámetro
            let testPieces = { ...pieceValues };
            let testPstB = clonePST(pstB);
            let testPstA = clonePST(pstA);

            const isPiece = Math.random() < 0.2;
            let modificationDesc = "";

            if (isPiece) {
                // Modificar valor de pieza
                const keys = Object.keys(testPieces);
                const k = keys[Math.floor(Math.random() * keys.length)];
                const delta = (Math.random() < 0.5 ? -10 : 10);
                testPieces[k] = Math.max(100, Math.min(1000, testPieces[k] + delta));
            } else {
                // Modificar PST (Manteniendo simetría horizontal)
                const r = Math.floor(Math.random() * 7);
                const c = Math.floor(Math.random() * 4); // Mitad del tablero
                const isB = Math.random() < 0.5;
                const delta = (Math.random() < 0.5 ? -5 : 5);
                
                if (isB) {
                    testPstB[r][c] += delta;
                    testPstB[r][6-c] = testPstB[r][c]; // Simetría
                } else {
                    testPstA[r][c] += delta;
                    testPstA[r][6-c] = testPstA[r][c];
                }
            }

            const newMSE = calculateMSE(testPieces, testPstB, testPstA);

            if (newMSE < bestMSE) {
                bestMSE = newMSE;
                pieceValues = testPieces;
                for (let r=0; r<7; r++) {
                    for (let c=0; c<7; c++) {
                        pstB[r][c] = testPstB[r][c];
                        pstA[r][c] = testPstA[r][c];
                    }
                }
            }

            currentOptIter++;
        }

        const pct = (currentOptIter / totalOptIters) * 100;
        optProgressBar.style.width = pct + '%';
        optStatusText.textContent = `Iteración ${currentOptIter}/${totalOptIters} | Mejor MSE actual: ${bestMSE.toFixed(4)}`;

        setTimeout(runOptBatch, 1);
    }

    function finishOptimization() {
        isOptimizing = false;
        optStatusText.textContent = `Optimización finalizada. MSE final: ${bestMSE.toFixed(4)}`;
        
        let outputStr = "// NUEVOS PESOS OPTIMIZADOS (COPIAR A worker.js y ui.js)\n\n";
        outputStr += "const pieceValues = " + JSON.stringify(pieceValues, null, 4) + ";\n\n";
        
        const formatPst = (name, arr) => {
            let s = `const ${name} = [\n`;
            for (let r=0; r<7; r++) {
                s += "    [ " + arr[r].map(v => v.toString().padStart(3, ' ')).join(', ') + " ]" + (r<6?",\n":"\n");
            }
            s += "];\n\n";
            return s;
        };

        outputStr += formatPst('pstB', pstB);
        outputStr += formatPst('pstA', pstA);
        
        weightsOutput.value = outputStr;
        weightsOutput.style.display = 'block';
        btnOptimize.disabled = false;
    }

    btnOptimize.addEventListener('click', () => {
        if (isOptimizing) return;
        if (dataset.length === 0) {
            alert("Primero genera el dataset.");
            return;
        }

        isOptimizing = true;
        currentOptIter = 0;
        btnOptimize.disabled = true;
        optProgressContainer.style.display = 'block';
        optProgressBar.style.width = '0%';
        optStatusText.textContent = "Calculando MSE base (esto tomará unos segundos)...";

        weightsOutput.style.display = 'none';

        setTimeout(() => {
            bestMSE = calculateMSE(pieceValues, pstB, pstA);
            optStatusText.textContent = `MSE Base: ${bestMSE.toFixed(4)}. Iniciando Descenso de Gradiente...`;
            runOptBatch();
        }, 50);
    });
});
