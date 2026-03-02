// games/oldmaid.js — Old Maid card game server logic

module.exports = function(io, helpers) {
  const { createDeck, shuffle, delay, endGame } = helpers;

  function removePairs(hand) {
    const pairs = [];
    const rankGroups = {};
    hand.forEach(c => {
      if (!rankGroups[c.rank]) rankGroups[c.rank] = [];
      rankGroups[c.rank].push(c);
    });
    for (const [rank, cards] of Object.entries(rankGroups)) {
      while (cards.length >= 2) {
        const a = cards.pop();
        const b = cards.pop();
        pairs.push([a, b]);
        hand.splice(hand.indexOf(a), 1);
        hand.splice(hand.indexOf(b), 1);
      }
    }
    return pairs;
  }

  function checkGameOver(state, roomId) {
    for (let i = 0; i < 2; i++) {
      if (state.hands[i].length === 0) {
        // Player i wins (emptied hand first)
        // The loser is the one still holding the Queen
        endGame(state, roomId, i);
        return true;
      }
    }
    // Also check: if total cards = 1, game is over (that player loses)
    const total = state.hands[0].length + state.hands[1].length;
    if (total === 1) {
      const loser = state.hands[0].length === 1 ? 0 : 1;
      endGame(state, roomId, 1 - loser);
      return true;
    }
    return false;
  }

  function emitState(state, roomId) {
    state.players.forEach((player, i) => {
      if (!player.isAI) {
        io.to(player.id).emit("oldmaid:state", {
          hand: state.hands[i],
          opponentCardCount: state.hands[1 - i].length,
          pairs: state.pairs,
          currentPlayerIndex: state.currentPlayerIndex,
        });
      }
    });
  }

  function triggerAI(state, roomId) {
    (async () => {
      await delay(1200);
      if (state.phase !== "playing") return;
      io.to(roomId).emit("aiThinking");
      await delay(800);
      if (state.phase !== "playing") return;

      const aiIndex = state.currentPlayerIndex;
      const oppIndex = 1 - aiIndex;
      const oppHand = state.hands[oppIndex];
      if (oppHand.length === 0) return;

      // AI picks a random card from opponent's hand
      const drawIdx = Math.floor(Math.random() * oppHand.length);
      processDraw(state, roomId, aiIndex, drawIdx);
    })();
  }

  async function processDraw(state, roomId, drawerIndex, cardIndex) {
    const oppIndex = 1 - drawerIndex;
    const oppHand = state.hands[oppIndex];
    if (cardIndex < 0 || cardIndex >= oppHand.length) return;

    const card = oppHand.splice(cardIndex, 1)[0];
    state.hands[drawerIndex].push(card);

    const drawerName = state.players[drawerIndex].name;

    // Check if this card forms a pair
    const hand = state.hands[drawerIndex];
    const matchIdx = hand.findIndex(c => c.rank === card.rank && c !== card);
    let paired = false;
    if (matchIdx !== -1) {
      const matchCard = hand.splice(matchIdx, 1)[0];
      // Also remove the drawn card
      const drawnIdx = hand.indexOf(card);
      if (drawnIdx !== -1) hand.splice(drawnIdx, 1);
      state.pairs[drawerIndex].push([card, matchCard]);
      paired = true;
    }

    io.to(roomId).emit("oldmaid:drew", {
      drawerIndex,
      drawerName,
      paired,
      pairRank: paired ? card.rank : null,
      // Don't reveal which card was drawn to the opponent (only that a draw happened)
    });

    if (checkGameOver(state, roomId)) return;

    // Switch turns
    state.currentPlayerIndex = oppIndex;
    // Shuffle the current player's hand so opponent card-backs are random
    shuffle(state.hands[drawerIndex]);

    await delay(400);
    emitState(state, roomId);

    if (state.players[state.currentPlayerIndex].isAI) {
      triggerAI(state, roomId);
    }
  }

  return {
    startGame(state, roomId) {
      const deck = createDeck();
      // Remove one Queen (e.g., Queen of clubs)
      const qIdx = deck.findIndex(c => c.rank === 12 && c.suit === "clubs");
      if (qIdx !== -1) deck.splice(qIdx, 1);
      shuffle(deck);

      // Deal all cards
      state.hands = [[], []];
      deck.forEach((card, i) => {
        state.hands[i % 2].push(card);
      });

      // Remove initial pairs
      state.pairs = [[], []];
      for (let i = 0; i < 2; i++) {
        removePairs(state.hands[i]);
      }

      // Shuffle hands
      shuffle(state.hands[0]);
      shuffle(state.hands[1]);

      state.currentPlayerIndex = 0;
      state.phase = "playing";

      state.players.forEach((player, i) => {
        if (!player.isAI) {
          io.to(player.id).emit("gameStart", {
            roomId,
            myPlayerIndex: i,
            hand: state.hands[i],
            opponentCardCount: state.hands[1 - i].length,
            pairs: state.pairs,
            currentPlayerIndex: state.currentPlayerIndex,
            players: state.players.map(p => ({ name: p.name, isAI: p.isAI })),
            game: state.game,
          });
        }
      });

      if (state.players[0].isAI) triggerAI(state, roomId);
    },

    registerEvents(socket, rooms) {
      socket.on("oldmaid:draw", ({ roomId, cardIndex }) => {
        const state = rooms.get(roomId);
        if (!state || state.phase !== "playing" || state.game !== "oldmaid") return;
        const playerIndex = state.players.findIndex(p => p.id === socket.id);
        if (playerIndex === -1 || playerIndex !== state.currentPlayerIndex) return;

        // Server picks a random card regardless of which card-back was tapped
        // This prevents cheating — the visual position is cosmetic only
        const oppHand = state.hands[1 - playerIndex];
        if (oppHand.length === 0) return;
        const randomIdx = Math.floor(Math.random() * oppHand.length);
        processDraw(state, roomId, playerIndex, randomIdx);
      });
    },

    getReconnectData(state, playerIndex) {
      return {
        hand: state.hands ? state.hands[playerIndex] : [],
        opponentCardCount: state.hands ? state.hands[1 - playerIndex].length : 0,
        pairs: state.pairs || [[], []],
      };
    },
  };
};
