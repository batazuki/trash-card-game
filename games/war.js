// games/war.js — War card game server logic

module.exports = function(io, helpers) {
  const { createDeck, shuffle, delay, endGame } = helpers;

  function dealWar() {
    const deck = shuffle(createDeck());
    const half = Math.ceil(deck.length / 2);
    return { pile0: deck.slice(0, half), pile1: deck.slice(half) };
  }

  function cardValue(rank) {
    // A=14, K=13, Q=12, J=11, else face value
    if (rank === 1) return 14;
    return rank;
  }

  function resolveRound(state, roomId) {
    const r = state.warRound;
    const v0 = cardValue(r.faceUp[0].rank);
    const v1 = cardValue(r.faceUp[1].rank);

    if (v0 !== v1) {
      // Winner takes all cards in the pot
      const winnerIdx = v0 > v1 ? 0 : 1;
      const pot = [...r.pot, r.faceUp[0], r.faceUp[1]];
      // Add to bottom of winner's pile (shuffled to prevent infinite loops)
      state.piles[winnerIdx].unshift(...shuffle(pot));

      io.to(roomId).emit("war:result", {
        faceUp: r.faceUp,
        winnerIndex: winnerIdx,
        pileCounts: [state.piles[0].length, state.piles[1].length],
        warCards: r.warCards,
      });

      state.warRound = null;

      // Check for game over
      if (state.piles[0].length === 0) {
        endGame(state, roomId, 1);
      } else if (state.piles[1].length === 0) {
        endGame(state, roomId, 0);
      }
    } else {
      // Tie → War!
      if (r.depth >= 3) {
        // Max war depth — break tie by suit rank (deterministic, not lexicographic)
        // L3: card IDs are like "h13", "s9"; string compare "s9">"h13" is wrong — use suit index
        const SUIT_ORDER = { h: 0, d: 1, c: 2, s: 3 };
        const s0 = SUIT_ORDER[r.faceUp[0].id[0]] ?? 0;
        const s1 = SUIT_ORDER[r.faceUp[1].id[0]] ?? 0;
        const winnerIdx = s0 >= s1 ? 0 : 1;
        const pot = [...r.pot, r.faceUp[0], r.faceUp[1]];
        state.piles[winnerIdx].unshift(...shuffle(pot));
        io.to(roomId).emit("war:result", {
          faceUp: r.faceUp,
          winnerIndex: winnerIdx,
          pileCounts: [state.piles[0].length, state.piles[1].length],
          warCards: r.warCards,
        });
        state.warRound = null;
        if (state.piles[0].length === 0) endGame(state, roomId, 1);
        else if (state.piles[1].length === 0) endGame(state, roomId, 0);
        return;
      }

      // Each player puts up to 3 face-down cards + 1 face-up
      const newPot = [...r.pot, r.faceUp[0], r.faceUp[1]];
      const warDown = [[], []];
      for (let p = 0; p < 2; p++) {
        const count = Math.min(3, state.piles[p].length);
        for (let i = 0; i < count; i++) {
          warDown[p].push(state.piles[p].pop());
        }
        newPot.push(...warDown[p]);
      }

      // Check if either player ran out during war
      if (state.piles[0].length === 0 && state.piles[1].length === 0) {
        // Both out — split pot equally, declare draw by giving to player 0
        state.piles[0].unshift(...shuffle(newPot));
        io.to(roomId).emit("war:result", {
          faceUp: r.faceUp,
          winnerIndex: 0,
          pileCounts: [state.piles[0].length, state.piles[1].length],
          warCards: r.warCards,
        });
        state.warRound = null;
        return;
      }
      if (state.piles[0].length === 0) {
        state.piles[1].unshift(...shuffle(newPot));
        endGame(state, roomId, 1);
        state.warRound = null;
        return;
      }
      if (state.piles[1].length === 0) {
        state.piles[0].unshift(...shuffle(newPot));
        endGame(state, roomId, 0);
        state.warRound = null;
        return;
      }

      const newFaceUp = [state.piles[0].pop(), state.piles[1].pop()];

      state.warRound = {
        pot: newPot,
        faceUp: newFaceUp,
        warCards: [...r.warCards, { down: [warDown[0].length, warDown[1].length], faceUp: [newFaceUp[0], newFaceUp[1]] }],
        depth: r.depth + 1,
      };

      io.to(roomId).emit("war:tie", {
        faceUp: r.faceUp,
        warDown: [warDown[0].length, warDown[1].length],
        pileCounts: [state.piles[0].length, state.piles[1].length],
      });

      // Auto-resolve after delay
      (async () => {
        await delay(2000);
        if (state.phase !== "playing" || !state.warRound) return;
        resolveRound(state, roomId);
      })();
    }
  }

  return {
    startGame(state, roomId) {
      const { pile0, pile1 } = dealWar();
      state.piles = [pile0, pile1];
      state.warRound = null;
      state.currentPlayerIndex = 0;
      state.phase = "playing";

      state.players.forEach((player, i) => {
        if (!player.isAI) {
          io.to(player.id).emit("gameStart", {
            roomId,
            myPlayerIndex: i,
            pileCounts: [state.piles[0].length, state.piles[1].length],
            currentPlayerIndex: 0,
            players: state.players.map(p => ({ name: p.name, isAI: p.isAI })),
            game: state.game,
          });
        }
      });
    },

    registerEvents(socket, rooms) {
      socket.on("war:flip", ({ roomId }) => {
        const state = rooms.get(roomId);
        if (!state || state.phase !== "playing" || state.game !== "war") return;
        // H2: verify sender is actually a room participant
        if (state.players.findIndex(p => p.id === socket.id) === -1) return;
        if (state.warRound) return; // already flipping

        // Both flip simultaneously
        if (state.piles[0].length === 0 || state.piles[1].length === 0) return;

        const card0 = state.piles[0].pop();
        const card1 = state.piles[1].pop();

        state.warRound = {
          pot: [],
          faceUp: [card0, card1],
          warCards: [],
          depth: 0,
        };

        // Resolve after a brief pause for animation
        (async () => {
          await delay(800);
          if (state.phase !== "playing" || !state.warRound) return;
          resolveRound(state, roomId);
        })();

        // AI auto-flips
        if (state.players.some(p => p.isAI)) {
          // Already triggered by human
        }
      });
    },

    getReconnectData(state, playerIndex) {
      return {
        pileCounts: state.piles ? [state.piles[0].length, state.piles[1].length] : [26, 26],
      };
    },
  };
};
