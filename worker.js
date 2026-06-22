importScripts('game.js?v=5', 'nn_engine.js?v=5');

let nnEngine = new NNEngine();

// Cargar pesos y notificar progreso al hilo principal
let loadPromise = nnEngine.loadWeights('model_weights.json', (percent) => {
    self.postMessage({ type: 'NN_PROGRESS', percent: percent });
}).then(() => {
    self.postMessage({ type: 'NN_LOADED' });
}).catch(err => {
    console.error("Error en worker cargando pesos:", err);
    self.postMessage({ type: 'ERROR', message: "Error de carga: " + err.message, stack: err.stack });
});

self.onmessage = async function(e) {
    // Esperar activamente a que los pesos terminen de descargarse
    await loadPromise;
    
    if (!nnEngine.isLoaded) {
        console.error("Worker: Error crítico, NNEngine no cargó los pesos correctamente.");
        return;
    }

    try {
        let game = new GameState();
        game.board = e.data.board;
        game.currentTurn = e.data.currentTurn || 'B';
        game.gameOver = e.data.gameOver || false;
        game.winner = e.data.winner || null;

        const bestMove = nnEngine.getBestMove(game);
        self.postMessage(bestMove);
    } catch (error) {
        self.postMessage({ type: 'ERROR', message: error.message, stack: error.stack });
    }
};
