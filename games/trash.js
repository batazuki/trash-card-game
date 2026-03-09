// games/trash.js — Trash card game server logic

module.exports = function(io, helpers) {
  const { createDeck, shuffle, delay, endGame } = helpers;

  function makeBoard(cards) {
    return cards.map((card, i) => ({
      slotIndex: i,
      card: { ...card, faceUp: false },
      filled: false,
      wildcardFilled: false,
    }));
  }

  function deal(game) {
    const deck = shuffle(createDeck());
    const slots = game === "trash-eleven" ? 11 : 10;
    const board0 = makeBoard(deck.splice(0, slots));
    const board1 = makeBoard(deck.splice(0, slots));
    return { deck, board0, board1 };
  }

  function getValidSlot(card, board, game) {
    if (card.rank < 1 || card.rank > 10) return null;
    const idx = card.rank - 1;
    const slot = board[idx];
    if (!slot) return null;
    if (!slot.filled) return idx;
    if (game === "trash-eleven" && slot.wildcardFilled) return idx;
    if (game === "trash-eleven" && card.rank === 1 && board[10]) {
      const s10 = board[10];
      if (!s10.filled || s10.wildcardFilled) return 10;
    }
    return null;
  }

  function getValidSlotsForWildcard(card, board, game) {
    const candidates = card.rank === 13 ? [0, 4, 5, 9] : [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
    return candidates.filter(i => board[i] && !board[i].filled && !(game === "trash-eleven" && i === 10));
  }

  function applyCardToSlot(board, slotIndex, card, isWildcard = false) {
    const prev = board[slotIndex].card;
    board[slotIndex].card = { ...card, faceUp: true };
    board[slotIndex].filled = true;
    board[slotIndex].wildcardFilled = isWildcard;
    return prev;
  }

  function checkWin(board) {
    return board.every(slot => slot.filled);
  }

  function advanceTurn(state) {
    state.currentPlayerIndex = 1 - state.currentPlayerIndex;
    state.turnPhase = "draw";
    state.pendingWildcard = null;
    state.pendingValidSlots = null;
  }

  function ensureDeck(state, roomId) {
    if (state.deck.length === 0) {
      if (state.discardPile.length <= 1) return;
      const top = state.discardPile.pop();
      state.deck = shuffle(state.discardPile);
      state.discardPile = top ? [top] : [];
      state.deck.forEach(c => { c.faceUp = false; });
      io.to(roomId).emit("deckReshuffled", { deckCount: state.deck.length });
    }
  }

  function canUseCard(card, board, game) {
    if (card.rank === 12) return false;
    if (card.rank === 11) return board.slice(0, 10).some(s => !s.filled);
    if (card.rank === 13) return [0, 4, 5, 9].some(i => !board[i]?.filled);
    return getValidSlot(card, board, game) !== null;
  }

  function pickAIWildcardSlot(validSlots, board) {
    const nonCorners = validSlots.filter(i => ![0, 4, 5, 9].includes(i));
    return nonCorners.length > 0 ? nonCorners[0] : validSlots[0];
  }

  function endTurn(state, roomId, playerIndex) {
    advanceTurn(state);
    const topDiscard = state.discardPile.length > 0
      ? state.discardPile[state.discardPile.length - 1]
      : null;
    io.to(roomId).emit("turnEnded", {
      nextPlayerIndex: state.currentPlayerIndex,
      topDiscard,
      deckCount: state.deck.length,
    });
    if (state.phase === "playing" && state.players[state.currentPlayerIndex].isAI) {
      triggerAI(state, roomId);
    }
  }

  async function placeNumberCardForPlayer(state, roomId, playerIndex, card, slotIndex) {
    const board = state.players[playerIndex].board;
    const isAI = state.players[playerIndex].isAI;
    const isDisplacingWildcard = board[slotIndex].wildcardFilled;
    const chainCard = applyCardToSlot(board, slotIndex, card, false);

    io.to(roomId).emit("boardUpdated", {
      playerIndex, slotIndex,
      card: { ...card, faceUp: true },
      wildcardFilled: false,
      deckCount: state.deck.length,
    });

    const unfilled = board.filter(s => !s.filled).length;
    if (unfilled === 1) io.to(roomId).emit("lastCard", { playerIndex });
    if (checkWin(board)) { endGame(state, roomId, playerIndex); return; }

    if (isDisplacingWildcard) {
      // The displaced wildcard becomes the next chain card (Trash-Eleven rule).
      // Route it through evaluateCard so the player can place it.
      state.turnPhase = "chain";
      await delay(isAI ? 500 : 300);
      if (state.phase !== "playing") return;
      io.to(roomId).emit("chainCard", { playerIndex, card: { ...chainCard, faceUp: true } });
      await delay(isAI ? 400 : 200);
      if (state.phase !== "playing") return;
      await evaluateCard(state, roomId, playerIndex, chainCard, true);
      return;
    }

    state.turnPhase = "chain";
    await delay(isAI ? 500 : 300);
    if (state.phase !== "playing") return;
    io.to(roomId).emit("chainCard", { playerIndex, card: { ...chainCard, faceUp: true } });
    await delay(isAI ? 400 : 200);
    if (state.phase !== "playing") return;
    await evaluateCard(state, roomId, playerIndex, chainCard, true);
  }

  async function placeWildcardForPlayer(state, roomId, playerIndex, card, slotIndex) {
    const board = state.players[playerIndex].board;
    const chainCard = applyCardToSlot(board, slotIndex, card, true);

    io.to(roomId).emit("boardUpdated", {
      playerIndex, slotIndex,
      card: { ...card, faceUp: true },
      wildcardFilled: true,
      deckCount: state.deck.length,
    });

    const unfilled = board.filter(s => !s.filled).length;
    if (unfilled === 1) io.to(roomId).emit("lastCard", { playerIndex });
    if (checkWin(board)) { endGame(state, roomId, playerIndex); return; }

    state.turnPhase = "chain";
    const isAI = state.players[playerIndex].isAI;
    await delay(isAI ? 500 : 300);
    if (state.phase !== "playing") return;
    io.to(roomId).emit("chainCard", { playerIndex, card: { ...chainCard, faceUp: true } });
    await delay(isAI ? 400 : 200);
    if (state.phase !== "playing") return;
    await evaluateCard(state, roomId, playerIndex, chainCard, true);
  }

  async function evaluateCard(state, roomId, playerIndex, card, isChain) {
    const player = state.players[playerIndex];
    const board = player.board;

    if (card.rank === 12) {
      state.discardPile.push({ ...card, faceUp: true });
      io.to(roomId).emit("discarded", { card, playerIndex, topDiscard: { ...card, faceUp: true }, deckCount: state.deck.length });
      endTurn(state, roomId, playerIndex);
      return;
    }

    if (card.rank === 11 || card.rank === 13) {
      const validSlots = getValidSlotsForWildcard(card, board, state.game);
      if (validSlots.length === 0) {
        state.discardPile.push({ ...card, faceUp: true });
        io.to(roomId).emit("discarded", { card, playerIndex, topDiscard: { ...card, faceUp: true }, deckCount: state.deck.length });
        endTurn(state, roomId, playerIndex);
        return;
      }
      if (player.isAI) {
        const chosenSlot = pickAIWildcardSlot(validSlots, board);
        await delay(500);
        if (state.phase !== "playing") return;
        await placeWildcardForPlayer(state, roomId, playerIndex, card, chosenSlot);
      } else {
        state.turnPhase = "place-wildcard";
        state.pendingWildcard = card;
        io.to(player.id).emit("chooseWildcardSlot", { card, validSlots });
      }
      return;
    }

    if (state.game === "trash-eleven" && card.rank === 1) {
      const s0 = board[0], s10 = board[10];
      const s0avail = s0 && (!s0.filled || s0.wildcardFilled);
      const s10avail = s10 && (!s10.filled || s10.wildcardFilled);
      if (s0avail && s10avail) {
        if (player.isAI) {
          await delay(300);
          await placeNumberCardForPlayer(state, roomId, playerIndex, card, s0.filled ? 10 : 0);
        } else {
          state.turnPhase = "place-wildcard";
          state.pendingWildcard = card;
          state.pendingValidSlots = [0, 10];
          io.to(player.id).emit("chooseWildcardSlot", { card, validSlots: [0, 10] });
        }
        return;
      }
    }

    const slotIndex = getValidSlot(card, board, state.game);
    if (slotIndex === null) {
      state.discardPile.push({ ...card, faceUp: true });
      io.to(roomId).emit("discarded", { card, playerIndex, topDiscard: { ...card, faceUp: true }, deckCount: state.deck.length });
      endTurn(state, roomId, playerIndex);
      return;
    }
    await placeNumberCardForPlayer(state, roomId, playerIndex, card, slotIndex);
  }

  function triggerAI(state, roomId) {
    (async () => {
      await delay(600);
      if (state.phase !== "playing") return;
      io.to(roomId).emit("aiThinking");
      await delay(700);
      if (state.phase !== "playing") return;

      const aiIndex = state.currentPlayerIndex;
      const aiBoard = state.players[aiIndex].board;
      const topDiscard = state.discardPile.length > 0
        ? state.discardPile[state.discardPile.length - 1]
        : null;

      let card;
      if (topDiscard && canUseCard(topDiscard, aiBoard, state.game)) {
        card = state.discardPile.pop();
      } else {
        ensureDeck(state, roomId);
        if (state.deck.length === 0) {
          endTurn(state, roomId, aiIndex);
          return;
        }
        card = state.deck.pop();
      }
      await evaluateCard(state, roomId, aiIndex, card, false);
    })().catch(err => console.error("triggerAI error:", err));
  }

  // ── Public API ──

  return {
    startGame(state, roomId) {
      const { deck, board0, board1 } = deal(state.game);
      state.deck = deck;
      state.discardPile = [];
      state.players[0].board = board0;
      state.players[1].board = board1;
      state.currentPlayerIndex = 0;
      state.turnPhase = "draw";
      state.pendingWildcard = null;
      state.pendingValidSlots = null;
      state.phase = "playing";

      state.players.forEach((player, i) => {
        const boards = [
          state.players[0].board.map(s => ({ ...s, card: s.card ? { ...s.card, faceUp: false } : null })),
          state.players[1].board.map(s => ({ ...s, card: s.card ? { ...s.card, faceUp: false } : null })),
        ];
        if (!player.isAI) {
          io.to(player.id).emit("gameStart", {
            roomId,
            myPlayerIndex: i,
            boards,
            currentPlayerIndex: state.currentPlayerIndex,
            players: state.players.map(p => ({ name: p.name, isAI: p.isAI })),
            deckCount: state.deck.length,
            game: state.game,
          });
        }
      });

      if (state.players[state.currentPlayerIndex].isAI) {
        triggerAI(state, roomId);
      }
    },

    handleDraw(state, roomId, playerIndex, source) {
      if (state.turnPhase !== "draw") return;
      let card;
      if (source === "discard" && state.discardPile.length > 0) {
        card = state.discardPile.pop();
      } else {
        ensureDeck(state, roomId);
        if (state.deck.length === 0) {
          endTurn(state, roomId, playerIndex);
          return;
        }
        card = state.deck.pop();
      }
      state.turnPhase = "chain";
      evaluateCard(state, roomId, playerIndex, card, false)
        .catch(err => console.error("evaluateCard error:", err));
    },

    handlePlaceWildcard(state, roomId, playerIndex, slotIndex) {
      if (state.turnPhase !== "place-wildcard" || !state.pendingWildcard) return;
      const board = state.players[playerIndex].board;
      const card = state.pendingWildcard;

      if ((card.rank === 11 || card.rank === 13) && slotIndex === 10) return;

      const validSlots = state.pendingValidSlots
        ? state.pendingValidSlots
        : getValidSlotsForWildcard(card, board, state.game);
      if (!validSlots.includes(slotIndex)) return;

      state.pendingWildcard = null;
      state.pendingValidSlots = null;

      const fn = (card.rank !== 11 && card.rank !== 13)
        ? placeNumberCardForPlayer(state, roomId, playerIndex, card, slotIndex)
        : placeWildcardForPlayer(state, roomId, playerIndex, card, slotIndex);
      fn.catch(err => console.error("placeCard error:", err));
    },

    getReconnectData(state, playerIndex) {
      const topDiscard = state.discardPile.length > 0
        ? state.discardPile[state.discardPile.length - 1]
        : null;
      return {
        boards: state.players.map(p =>
          p.board.map(s => ({
            ...s,
            card: s.card ? { ...s.card, faceUp: s.filled } : null,
          }))
        ),
        turnPhase: state.turnPhase,
        topDiscard,
        pendingWildcard: state.pendingWildcard,
        pendingValidSlots: state.pendingValidSlots,
      };
    },
  };
};
