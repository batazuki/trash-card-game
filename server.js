/* ═══════════════════════════════════════════════
   TRASH CARD GAME — Server
   Node.js + Express + Socket.io
   ═══════════════════════════════════════════════ */

const express = require("express");
const http    = require("http");
const { Server } = require("socket.io");
const path    = require("path");

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, {
  pingTimeout:  30000,
  pingInterval: 10000,
});

app.use(express.static(path.join(__dirname, "public")));

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Trash card game running on port ${PORT}`));

// ═══════════════════════════════════════════════
// IN-MEMORY ROOM STORE
// ═══════════════════════════════════════════════
const rooms = new Map(); // roomId → GameState

// ═══════════════════════════════════════════════
// DECK UTILITIES
// ═══════════════════════════════════════════════

function createDeck() {
  const suits = ["hearts", "diamonds", "clubs", "spades"];
  return suits.flatMap(suit =>
    Array.from({ length: 13 }, (_, i) => ({
      id: `${suit[0]}${i + 1}`,
      suit,
      rank: i + 1,
      faceUp: false,
    }))
  );
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function makeBoard(cards) {
  return cards.map((card, i) => ({
    slotIndex: i,
    card: { ...card, faceUp: false },
    filled: false,
    wildcardFilled: false,
  }));
}

function dealGame(variant) {
  const deck = shuffle(createDeck());
  const slots = variant === "eleven" ? 11 : 10;
  const board0 = makeBoard(deck.splice(0, slots));
  const board1 = makeBoard(deck.splice(0, slots));
  return { deck, board0, board1 };
}

// ═══════════════════════════════════════════════
// GAME LOGIC
// ═══════════════════════════════════════════════

// Returns slot index if card can go there, else null.
// Handles wildcard-overlay (natural card can displace a wildcard in a slot)
// and Eleven variant's extra Ace slot at index 10.
function getValidSlot(card, board, variant) {
  if (card.rank < 1 || card.rank > 10) return null;
  const idx = card.rank - 1;
  const slot = board[idx];
  if (!slot) return null;
  if (!slot.filled) return idx;   // empty → place here
  // Wildcard overlay: Eleven variant only — natural card can displace a wildcard
  if (variant === "eleven" && slot.wildcardFilled) return idx;
  // Eleven variant: Ace has a second home at slot 10
  if (variant === "eleven" && card.rank === 1 && board[10]) {
    const s10 = board[10];
    if (!s10.filled || s10.wildcardFilled) return 10;
  }
  return null;
}

// Returns array of valid slot indices for a wildcard
// King (13): corners only = indices 0, 4, 5, 9
// Jack (11): any unfilled slot
function getValidSlotsForWildcard(card, board) {
  const candidates = card.rank === 13 ? [0, 4, 5, 9] : [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
  return candidates.filter(i => !board[i].filled);
}

// Place a card face-up in a slot; return the card that was there (chain card).
// isWildcard=true marks the slot so a natural card can still displace it later.
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

// Place a natural number card in a slot; handles wildcard displacement.
// If the slot had a wildcard, that wildcard is simply gone — turn ends.
async function placeNumberCardForPlayer(state, roomId, playerIndex, card, slotIndex) {
  const board = state.players[playerIndex].board;
  const isAI  = state.players[playerIndex].isAI;
  const isDisplacingWildcard = board[slotIndex].wildcardFilled;

  const chainCard = applyCardToSlot(board, slotIndex, card, false);

  io.to(roomId).emit("boardUpdated", {
    playerIndex, slotIndex,
    card: { ...card, faceUp: true },
    wildcardFilled: false,
    deckCount: state.deck.length,
  });

  if (checkWin(board)) { endGame(state, roomId, playerIndex); return; }

  // Displaced wildcard is used up — it does NOT re-enter play; turn ends
  if (isDisplacingWildcard) {
    endTurn(state, roomId, playerIndex);
    return;
  }

  // Normal chain: evaluate the face-down card that was in the slot
  state.turnPhase = "chain";
  await delay(isAI ? 500 : 300);
  io.to(roomId).emit("chainCard", { playerIndex, card: { ...chainCard, faceUp: true } });
  await delay(isAI ? 400 : 200);
  await evaluateCard(state, roomId, playerIndex, chainCard, true);
}

// Ensure deck has cards; reshuffle discard if needed
function ensureDeck(state, roomId) {
  if (state.deck.length === 0) {
    if (state.discardPile.length <= 1) return; // nothing to reshuffle
    const top = state.discardPile.pop();
    state.deck = shuffle(state.discardPile);
    state.discardPile = top ? [top] : [];
    state.deck.forEach(c => { c.faceUp = false; });
    io.to(roomId).emit("deckReshuffled", { deckCount: state.deck.length });
  }
}

// Generate a unique 4-char room code
function generateRoomId() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  let id;
  do {
    id = Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
  } while (rooms.has(id));
  return id;
}

// ═══════════════════════════════════════════════
// GAME START HELPER
// ═══════════════════════════════════════════════

function startGame(state, roomId) {
  const { deck, board0, board1 } = dealGame(state.variant);
  state.deck = deck;
  state.discardPile = [];
  state.players[0].board = board0;
  state.players[1].board = board1;
  state.currentPlayerIndex = 0;
  state.turnPhase = "draw";
  state.pendingWildcard = null;
  state.pendingValidSlots = null;
  state.phase = "playing";

  // Send each player their own perspective
  state.players.forEach((player, i) => {
    const myPlayerIndex = i;
    // Build boards to send: player sees their own cards face-down (unknown),
    // and opponent's cards also face-down
    const boards = [
      state.players[0].board.map(s => ({ ...s, card: s.card ? { ...s.card, faceUp: false } : null })),
      state.players[1].board.map(s => ({ ...s, card: s.card ? { ...s.card, faceUp: false } : null })),
    ];
    if (!player.isAI) {
      io.to(player.id).emit("gameStart", {
        roomId,
        myPlayerIndex,
        boards,
        currentPlayerIndex: state.currentPlayerIndex,
        players: state.players.map(p => ({ name: p.name, isAI: p.isAI })),
        deckCount: state.deck.length,
        variant: state.variant,
      });
    }
  });

  // If player 0 is AI (shouldn't happen in normal flow), trigger AI
  if (state.players[state.currentPlayerIndex].isAI) {
    triggerAI(state, roomId);
  }
}

// ═══════════════════════════════════════════════
// CARD EVALUATION (shared by human & AI turns)
// ═══════════════════════════════════════════════

// Evaluate a card for a player. Returns whether the turn continues (chain).
// Emits appropriate events. Calls callback(chainCard) if chain continues.
async function evaluateCard(state, roomId, playerIndex, card, isChain) {
  const player = state.players[playerIndex];
  const board = player.board;

  // ── Queen: always discard ──
  if (card.rank === 12) {
    state.discardPile.push({ ...card, faceUp: true });
    io.to(roomId).emit("discarded", {
      card,
      playerIndex,
      topDiscard: card,
      deckCount: state.deck.length,
    });
    endTurn(state, roomId, playerIndex);
    return;
  }

  // ── Wildcard: Jack or King ──
  if (card.rank === 11 || card.rank === 13) {
    const validSlots = getValidSlotsForWildcard(card, board);
    if (validSlots.length === 0) {
      // No valid slots — discard, end turn
      state.discardPile.push({ ...card, faceUp: true });
      io.to(roomId).emit("discarded", {
        card,
        playerIndex,
        topDiscard: card,
        deckCount: state.deck.length,
      });
      endTurn(state, roomId, playerIndex);
      return;
    }

    if (player.isAI) {
      const chosenSlot = pickAIWildcardSlot(validSlots, board);
      await delay(500);
      placeWildcardForPlayer(state, roomId, playerIndex, card, chosenSlot);
    } else {
      state.turnPhase = "place-wildcard";
      state.pendingWildcard = card;
      io.to(player.id).emit("chooseWildcardSlot", { card, validSlots });
    }
    return;
  }

  // ── Number card (Ace=1 through 10) ──

  // Eleven: if both Ace slots (0 and 10) are open, let the player choose
  if (state.variant === "eleven" && card.rank === 1) {
    const s0  = board[0], s10 = board[10];
    const s0avail  = s0  && (!s0.filled  || s0.wildcardFilled);
    const s10avail = s10 && (!s10.filled || s10.wildcardFilled);
    if (s0avail && s10avail) {
      if (player.isAI) {
        await delay(300);
        // AI fills the empty slot first; if both empty, prefers slot 0
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

  const slotIndex = getValidSlot(card, board, state.variant);
  if (slotIndex === null) {
    // No valid slot — discard, end turn
    state.discardPile.push({ ...card, faceUp: true });
    io.to(roomId).emit("discarded", {
      card, playerIndex, topDiscard: card, deckCount: state.deck.length,
    });
    endTurn(state, roomId, playerIndex);
    return;
  }

  await placeNumberCardForPlayer(state, roomId, playerIndex, card, slotIndex);
}

// Place a wildcard for a player (both human and AI use this after slot is chosen)
async function placeWildcardForPlayer(state, roomId, playerIndex, card, slotIndex) {
  const board = state.players[playerIndex].board;

  const chainCard = applyCardToSlot(board, slotIndex, card, true);

  io.to(roomId).emit("boardUpdated", {
    playerIndex,
    slotIndex,
    card: { ...card, faceUp: true },
    wildcardFilled: true,
    deckCount: state.deck.length,
  });

  if (checkWin(board)) {
    endGame(state, roomId, playerIndex);
    return;
  }

  state.turnPhase = "chain";
  const isAI = state.players[playerIndex].isAI;
  await delay(isAI ? 500 : 300);

  io.to(roomId).emit("chainCard", {
    playerIndex,
    card: { ...chainCard, faceUp: true },
  });

  await delay(isAI ? 400 : 200);
  await evaluateCard(state, roomId, playerIndex, chainCard, true);
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

  // Trigger AI if needed
  if (state.phase === "playing" && state.players[state.currentPlayerIndex].isAI) {
    triggerAI(state, roomId);
  }
}

function endGame(state, roomId, winnerIndex) {
  state.phase = "ended";
  io.to(roomId).emit("gameOver", {
    winnerIndex,
    winnerName: state.players[winnerIndex].name,
  });
}

// ═══════════════════════════════════════════════
// AI LOGIC
// ═══════════════════════════════════════════════

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function pickAIWildcardSlot(validSlots, board) {
  // Prefer filling slots where the face-down card is more likely to be useful.
  // Simple heuristic: choose the slot with the lowest index that isn't a corner
  // (saves corners for Kings). For King, validSlots are already corners only.
  const nonCorners = validSlots.filter(i => ![0, 4, 5, 9].includes(i));
  return nonCorners.length > 0 ? nonCorners[0] : validSlots[0];
}

function triggerAI(state, roomId) {
  (async () => {
    await delay(600);
    if (state.phase !== "playing") return;

    io.to(roomId).emit("aiThinking");
    await delay(700);

    if (state.phase !== "playing") return;

    // AI decides: take from discard if it can use the top card, else draw from deck
    const aiIndex = state.currentPlayerIndex;
    const aiBoard = state.players[aiIndex].board;
    const topDiscard = state.discardPile.length > 0
      ? state.discardPile[state.discardPile.length - 1]
      : null;

    let card;
    if (topDiscard && canUseCard(topDiscard, aiBoard, state.variant)) {
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
  })();
}

// Quick check: can a card be used at all on a board?
function canUseCard(card, board, variant) {
  if (card.rank === 12) return false;
  if (card.rank === 11) return board.slice(0, 10).some(s => !s.filled);    // Jack: slot 0-9 only
  if (card.rank === 13) return [0, 4, 5, 9].some(i => !board[i]?.filled); // King: corners
  return getValidSlot(card, board, variant) !== null;
}

// ═══════════════════════════════════════════════
// SOCKET EVENTS
// ═══════════════════════════════════════════════

io.on("connection", socket => {
  console.log(`Connected: ${socket.id}`);

  // ── Create Room ──
  socket.on("createRoom", ({ playerName, variant }) => {
    const roomId = generateRoomId();
    const state = {
      roomId,
      phase: "lobby",
      variant: variant || "default",
      players: [{
        id: socket.id,
        name: playerName || "Player 1",
        isAI: false,
        board: [],
        wantsRematch: false,
      }],
      deck: [],
      discardPile: [],
      currentPlayerIndex: 0,
      turnPhase: "draw",
      pendingWildcard: null,
      pendingValidSlots: null,
    };
    rooms.set(roomId, state);
    socket.join(roomId);
    socket.emit("roomCreated", { roomId });
  });

  // ── Join Room ──
  socket.on("joinRoom", ({ roomId, playerName }) => {
    const state = rooms.get(roomId);
    if (!state) {
      socket.emit("joinError", { message: "Room not found." });
      return;
    }
    if (state.phase !== "lobby") {
      socket.emit("joinError", { message: "Game already in progress." });
      return;
    }
    if (state.players.length >= 2) {
      socket.emit("joinError", { message: "Room is full." });
      return;
    }

    state.players.push({
      id: socket.id,
      name: playerName || "Player 2",
      isAI: false,
      board: [],
      wantsRematch: false,
    });
    socket.join(roomId);
    socket.emit("joinedRoom", { roomId });

    // Both players present — start game
    startGame(state, roomId);
  });

  // ── Play vs AI ──
  socket.on("playVsAI", ({ playerName, variant }) => {
    const roomId = generateRoomId();
    const state = {
      roomId,
      phase: "lobby",
      variant: variant || "default",
      players: [
        { id: socket.id, name: playerName || "Player", isAI: false, board: [], wantsRematch: false },
        { id: "ai", name: "AI", isAI: true, board: [], wantsRematch: false },
      ],
      deck: [],
      discardPile: [],
      currentPlayerIndex: 0,
      turnPhase: "draw",
      pendingWildcard: null,
      pendingValidSlots: null,
    };
    rooms.set(roomId, state);
    socket.join(roomId);
    startGame(state, roomId);
  });

  // ── Rematch ──
  socket.on("requestRematch", ({ roomId }) => {
    const state = rooms.get(roomId);
    if (!state || state.phase !== "ended") return;
    const pi = state.players.findIndex(p => p.id === socket.id);
    if (pi === -1) return;
    state.players[pi].wantsRematch = true;
    io.to(roomId).emit("rematchRequested", { playerIndex: pi });
    // If AI opponent, or both players want rematch → start new game
    const allWant = state.players.every(p => p.isAI || p.wantsRematch);
    if (allWant) {
      state.players.forEach(p => { p.wantsRematch = false; });
      startGame(state, roomId);
    }
  });

  // ── Draw Card ──
  socket.on("drawCard", ({ roomId, source }) => {
    const state = rooms.get(roomId);
    if (!state || state.phase !== "playing") return;

    const playerIndex = state.players.findIndex(p => p.id === socket.id);
    if (playerIndex === -1 || playerIndex !== state.currentPlayerIndex) return;
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
    evaluateCard(state, roomId, playerIndex, card, false);
  });

  // ── Place Wildcard (or Ace choice in Eleven) ──
  socket.on("placeWildcard", ({ roomId, slotIndex }) => {
    const state = rooms.get(roomId);
    if (!state || state.phase !== "playing") return;

    const playerIndex = state.players.findIndex(p => p.id === socket.id);
    if (playerIndex === -1 || playerIndex !== state.currentPlayerIndex) return;
    if (state.turnPhase !== "place-wildcard" || !state.pendingWildcard) return;

    const board = state.players[playerIndex].board;
    const card  = state.pendingWildcard;

    // Use pre-computed valid slots (Ace choice) or compute for a wildcard
    const validSlots = state.pendingValidSlots
      ? state.pendingValidSlots
      : getValidSlotsForWildcard(card, board);
    if (!validSlots.includes(slotIndex)) return;

    state.pendingWildcard    = null;
    state.pendingValidSlots  = null;

    // Route: natural card (Ace choice) vs actual wildcard (Jack/King)
    if (card.rank !== 11 && card.rank !== 13) {
      placeNumberCardForPlayer(state, roomId, playerIndex, card, slotIndex);
    } else {
      placeWildcardForPlayer(state, roomId, playerIndex, card, slotIndex);
    }
  });

  // ── Reaction Emoji ──
  socket.on("sendReaction", ({ roomId, emoji }) => {
    const state = rooms.get(roomId);
    if (!state || state.phase === "lobby") return;
    const playerIndex = state.players.findIndex(p => p.id === socket.id);
    if (playerIndex === -1) return;
    io.to(roomId).emit("reaction", { playerIndex, emoji });
  });

  // ── Rejoin Room (after a brief disconnect) ──
  socket.on("rejoinRoom", ({ roomId, playerIndex }) => {
    const state = rooms.get(roomId);
    if (!state || state.phase !== "playing") return;
    if (playerIndex < 0 || playerIndex >= state.players.length) return;
    const player = state.players[playerIndex];
    if (!player || !player.disconnecting) return;

    clearTimeout(player.disconnectTimer);
    player.disconnecting = false;
    player.id = socket.id;
    socket.join(roomId);

    io.to(roomId).emit("opponentReconnected");

    const topDiscard = state.discardPile.length > 0
      ? state.discardPile[state.discardPile.length - 1]
      : null;

    socket.emit("gameRejoined", {
      roomId,
      myPlayerIndex: playerIndex,
      // Send filled slots face-up, unfilled face-down (don't leak hidden ranks)
      boards: state.players.map(p =>
        p.board.map(s => ({
          ...s,
          card: s.card ? { ...s.card, faceUp: s.filled } : null,
        }))
      ),
      currentPlayerIndex: state.currentPlayerIndex,
      players: state.players.map(p => ({ name: p.name, isAI: p.isAI })),
      deckCount: state.deck.length,
      variant: state.variant,
      turnPhase: state.turnPhase,
      topDiscard,
      pendingWildcard: state.pendingWildcard,
      pendingValidSlots: state.pendingValidSlots,
    });
  });

  // ── Disconnect ──
  socket.on("disconnect", () => {
    console.log(`Disconnected: ${socket.id}`);
    for (const [roomId, state] of rooms.entries()) {
      const idx = state.players.findIndex(p => p.id === socket.id);
      if (idx === -1) continue;

      if (state.phase === "playing") {
        const player = state.players[idx];
        player.disconnecting = true;
        // Notify the other player and give a 15-second reconnect window
        io.to(roomId).emit("opponentDisconnecting");
        player.disconnectTimer = setTimeout(() => {
          if (state.phase === "playing" && player.disconnecting) {
            io.to(roomId).emit("opponentDisconnected");
            state.phase = "ended";
          }
          setTimeout(() => rooms.delete(roomId), 30000);
        }, 15000);
      } else {
        setTimeout(() => rooms.delete(roomId), 5000);
      }
      break;
    }
  });
});
