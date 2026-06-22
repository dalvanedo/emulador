importScripts('game.js', 'nn_engine.js');

let nnEngine = new NNEngine();

// Cargar pesos y guardar la promesa para poder esperarla
let loadPromise = nnEngine.loadWeights('model_weights.json');

self.onmessage = async function(e) {
    // Esperar activamente a que los pesos terminen de descargarse
    await loadPromise;
    
    if (!nnEngine.isLoaded) {
        console.error("Worker: Error crítico, NNEngine no cargó los pesos correctamente.");
        return;
    }

    let game = new GameState();
    game.board = e.data.board;
    game.currentTurn = e.data.currentTurn || 'B';
    game.gameOver = e.data.gameOver || false;
    game.winner = e.data.winner || null;

    const bestMove = nnEngine.getBestMove(game);
    self.postMessage(bestMove);
};
