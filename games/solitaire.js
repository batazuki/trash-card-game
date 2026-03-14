// games/solitaire.js — Klondike Solitaire server logic (minimal — mostly client-side)

module.exports = function(io, helpers) {
  const { createDeck, shuffle, endGame } = helpers;

  function dealSolitaire() {
    const deck = shuffle(createDeck());
    const tableau = [];
    for (let col = 0; col < 7; col++) {
      const pile = [];
      for (let row = 0; row <= col; row++) {
        const card = deck.pop();
        card.faceUp = (row === col); // only top card face-up
        pile.push(card);
      }
      tableau.push(pile);
    }
    return { stock: deck, tableau };
  }

  return {
    startGame(state, roomId) {
      const { stock, tableau } = dealSolitaire();
      state.phase = "playing";
      state.solitaire = { stock, tableau, foundations: [[], [], [], []], waste: [] };

      // Only one player for solitaire
      const player = state.players[0];
      if (!player.isAI) {
        io.to(player.id).emit("gameStart", {
          roomId,
          myPlayerIndex: 0,
          solitaire: state.solitaire,
          players: [{ name: player.name, isAI: false }],
          game: state.game,
        });
      }
    },

    registerEvents(socket, rooms) {
      // Solitaire is client-authoritative — server just starts the game
      // Client handles all move logic locally
      socket.on("solitaire:win", ({ roomId }) => {
        const state = rooms.get(roomId);
        // C3: guard phase AND game type AND player membership to prevent event spam
        if (!state || state.game !== "solitaire" || state.phase !== "playing") return;
        if (state.players[0]?.id !== socket.id) return;
        endGame(state, roomId, 0); // use shared helper — updates scores, gamesPlayed, TTL timer
      });
    },

    getReconnectData(state, playerIndex) {
      return {
        solitaire: state.solitaire || null,
      };
    },
  };
};
