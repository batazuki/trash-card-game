// games/gofish.js — Go Fish card game server logic

module.exports = function(io, helpers) {
  const { createDeck, shuffle, delay, endGame } = helpers;

  function checkForSets(hand, sets) {
    const found = [];
    const rankCounts = {};
    hand.forEach(c => { rankCounts[c.rank] = (rankCounts[c.rank] || 0) + 1; });
    for (const [rank, count] of Object.entries(rankCounts)) {
      if (count === 4) {
        found.push(Number(rank));
        sets.push(Number(rank));
      }
    }
    // Remove completed sets from hand
    for (const rank of found) {
      for (let i = hand.length - 1; i >= 0; i--) {
        if (hand[i].rank === rank) hand.splice(i, 1);
      }
    }
    return found;
  }

  function isGameOver(state) {
    if (state.sets[0].length + state.sets[1].length >= 13) return true;
    if (state.deck.length === 0 && (state.hands[0].length === 0 || state.hands[1].length === 0)) return true;
    return false;
  }

  function determineWinner(state) {
    if (state.sets[0].length > state.sets[1].length) return 0;
    if (state.sets[1].length > state.sets[0].length) return 1;
    return 0;
  }

  function emitHandUpdate(state, roomId, playerIndex) {
    const player = state.players[playerIndex];
    if (!player.isAI) {
      io.to(player.id).emit("gofish:handUpdate", {
        hand: state.hands[playerIndex],
        opponentCardCount: state.hands[1 - playerIndex].length,
        sets: state.sets,
        deckCount: state.deck.length,
        currentPlayerIndex: state.currentPlayerIndex,
      });
    }
    const opp = state.players[1 - playerIndex];
    if (!opp.isAI) {
      io.to(opp.id).emit("gofish:handUpdate", {
        hand: state.hands[1 - playerIndex],
        opponentCardCount: state.hands[playerIndex].length,
        sets: state.sets,
        deckCount: state.deck.length,
        currentPlayerIndex: state.currentPlayerIndex,
      });
    }
  }

  function drawCard(state, playerIndex) {
    if (state.deck.length === 0) return null;
    const card = state.deck.pop();
    state.hands[playerIndex].push(card);
    return card;
  }

  // Refill empty hand from deck (Go Fish rule: draw when hand is empty)
  function refillIfEmpty(state, playerIndex) {
    if (state.hands[playerIndex].length === 0 && state.deck.length > 0) {
      drawCard(state, playerIndex);
    }
  }

  function triggerAI(state, roomId) {
    (async () => {
      await delay(1000);
      if (state.phase !== "playing") return;
      io.to(roomId).emit("aiThinking");
      await delay(800);
      if (state.phase !== "playing" || state.processing) return;

      const aiIndex = state.currentPlayerIndex;
      const aiHand = state.hands[aiIndex];
      if (aiHand.length === 0) {
        if (state.deck.length > 0) {
          drawCard(state, aiIndex);
          checkForSets(state.hands[aiIndex], state.sets[aiIndex]);
          emitHandUpdate(state, roomId, aiIndex);
          if (isGameOver(state)) { endGame(state, roomId, determineWinner(state)); return; }
        }
        state.currentPlayerIndex = 1 - aiIndex;
        emitHandUpdate(state, roomId, aiIndex);
        return;
      }

      const rankCounts = {};
      aiHand.forEach(c => { rankCounts[c.rank] = (rankCounts[c.rank] || 0) + 1; });
      const ranks = Object.keys(rankCounts).map(Number);
      const mem = state.aiMemory || [];
      ranks.sort((a, b) => {
        const memA = mem.includes(a) ? 1 : 0;
        const memB = mem.includes(b) ? 1 : 0;
        if (rankCounts[b] !== rankCounts[a]) return rankCounts[b] - rankCounts[a];
        return memB - memA;
      });
      const askRank = ranks[0];

      processAsk(state, roomId, aiIndex, askRank);
    })();
  }

  async function processAsk(state, roomId, playerIndex, askRank) {
    // Guard against concurrent calls
    if (state.processing) return;
    state.processing = true;

    try {
      const oppIndex = 1 - playerIndex;
      const oppHand = state.hands[oppIndex];
      const matching = oppHand.filter(c => c.rank === askRank);
      const askerName = state.players[playerIndex].name;
      const RANK_LABEL = r => r === 1 ? "A" : r === 11 ? "J" : r === 12 ? "Q" : r === 13 ? "K" : String(r);

      // Track in AI memory
      if (!state.aiMemory) state.aiMemory = [];
      if (!state.players[playerIndex].isAI) {
        state.aiMemory.push(askRank);
        if (state.aiMemory.length > 20) state.aiMemory.shift();
      }

      if (matching.length > 0) {
        // Remove from opponent's hand, add to asker's hand
        for (const card of matching) {
          const idx = oppHand.indexOf(card);
          if (idx !== -1) oppHand.splice(idx, 1);
          state.hands[playerIndex].push(card);
        }

        io.to(roomId).emit("gofish:result", {
          askerIndex: playerIndex,
          askerName,
          rank: askRank,
          rankLabel: RANK_LABEL(askRank),
          count: matching.length,
          gotFish: false,
        });

        // Check for completed sets
        const newSets = checkForSets(state.hands[playerIndex], state.sets[playerIndex]);
        if (newSets.length > 0) {
          io.to(roomId).emit("gofish:setComplete", {
            playerIndex,
            ranks: newSets,
            sets: state.sets,
          });
        }

        // Refill hand from deck if completing a set emptied it
        refillIfEmpty(state, playerIndex);

        emitHandUpdate(state, roomId, playerIndex);

        if (isGameOver(state)) { endGame(state, roomId, determineWinner(state)); return; }

        // Same player goes again
        state.processing = false;
        await delay(600);
        if (state.players[playerIndex].isAI) {
          triggerAI(state, roomId);
        }
      } else {
        // Go Fish!
        io.to(roomId).emit("gofish:result", {
          askerIndex: playerIndex,
          askerName,
          rank: askRank,
          rankLabel: RANK_LABEL(askRank),
          count: 0,
          gotFish: true,
        });

        state.processing = false;
        await delay(800);

        // Re-acquire processing lock for the draw phase
        state.processing = true;

        const drawn = drawCard(state, playerIndex);
        let goAgain = false;
        if (drawn && drawn.rank === askRank) {
          goAgain = true;
          io.to(roomId).emit("gofish:luckyDraw", { playerIndex });
        }

        const newSets = checkForSets(state.hands[playerIndex], state.sets[playerIndex]);
        if (newSets.length > 0) {
          io.to(roomId).emit("gofish:setComplete", {
            playerIndex,
            ranks: newSets,
            sets: state.sets,
          });
        }

        // Refill hand from deck if completing a set emptied it
        refillIfEmpty(state, playerIndex);

        if (isGameOver(state)) {
          emitHandUpdate(state, roomId, playerIndex);
          endGame(state, roomId, determineWinner(state));
          return;
        }

        if (!goAgain) {
          state.currentPlayerIndex = oppIndex;
        }
        emitHandUpdate(state, roomId, playerIndex);

        state.processing = false;
        await delay(600);
        if (state.players[state.currentPlayerIndex].isAI) {
          triggerAI(state, roomId);
        }
      }
    } finally {
      state.processing = false;
    }
  }

  return {
    startGame(state, roomId) {
      const deck = shuffle(createDeck());
      state.hands = [deck.splice(0, 7), deck.splice(0, 7)];
      state.deck = deck;
      state.sets = [[], []];
      state.currentPlayerIndex = 0;
      state.phase = "playing";
      state.aiMemory = [];
      state.processing = false;

      // Check for initial sets
      for (let i = 0; i < 2; i++) {
        checkForSets(state.hands[i], state.sets[i]);
      }

      state.players.forEach((player, i) => {
        if (!player.isAI) {
          io.to(player.id).emit("gameStart", {
            roomId,
            myPlayerIndex: i,
            hand: state.hands[i],
            opponentCardCount: state.hands[1 - i].length,
            sets: state.sets,
            deckCount: state.deck.length,
            currentPlayerIndex: state.currentPlayerIndex,
            players: state.players.map(p => ({ name: p.name, isAI: p.isAI })),
            game: state.game,
          });
        }
      });

      if (state.players[0].isAI) triggerAI(state, roomId);
    },

    registerEvents(socket, rooms) {
      socket.on("gofish:ask", ({ roomId, rank }) => {
        const state = rooms.get(roomId);
        if (!state || state.phase !== "playing" || state.game !== "gofish") return;
        if (state.processing) return;
        const playerIndex = state.players.findIndex(p => p.id === socket.id);
        if (playerIndex === -1 || playerIndex !== state.currentPlayerIndex) return;

        const hand = state.hands[playerIndex];
        if (!hand.some(c => c.rank === rank)) return;

        processAsk(state, roomId, playerIndex, rank);
      });
    },

    getReconnectData(state, playerIndex) {
      return {
        hand: state.hands ? state.hands[playerIndex] : [],
        opponentCardCount: state.hands ? state.hands[1 - playerIndex].length : 0,
        sets: state.sets || [[], []],
        deckCount: state.deck ? state.deck.length : 0,
        currentPlayerIndex: state.currentPlayerIndex || 0,
      };
    },
  };
};
