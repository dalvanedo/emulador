importScripts('game.js', 'nn_engine.js');

let nnEngine = new NNEngine();

self.onmessage = function(e) {
    if (e.data.type === 'LOAD_NN') {
        nnEngine.weights = e.data.weights;
        nnEngine.isLoaded = true;
        return;
    }

    if (!nnEngine.isLoaded) {
        console.error("Worker: NNEngine not loaded yet.");
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
