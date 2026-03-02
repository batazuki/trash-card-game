/* ═══════════════════════════════════════════════
   TINY TINY GAMES — Server
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
server.listen(PORT, () => console.log(`Tiny Tiny Games running on port ${PORT}`));

// ═══════════════════════════════════════════════
// IN-MEMORY ROOM STORE
// ═══════════════════════════════════════════════
const rooms = new Map(); // roomId → GameState

// ═══════════════════════════════════════════════
// SHARED UTILITIES
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

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function generateRoomId() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  let id;
  do {
    id = Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
  } while (rooms.has(id));
  return id;
}

function endGame(state, roomId, winnerIndex) {
  state.phase = "ended";
  state.scores[winnerIndex]++;
  state.gamesPlayed++;
  io.to(roomId).emit("gameOver", {
    winnerIndex,
    winnerName: state.players[winnerIndex].name,
    scores: state.scores,
    gamesPlayed: state.gamesPlayed,
  });
}

// ═══════════════════════════════════════════════
// GAME MODULES
// ═══════════════════════════════════════════════

const helpers = { createDeck, shuffle, delay, endGame };
const trashGame    = require("./games/trash")(io, helpers);
const warGame      = require("./games/war")(io, helpers);
const gofishGame   = require("./games/gofish")(io, helpers);
const oldmaidGame  = require("./games/oldmaid")(io, helpers);
const solitaireGame = require("./games/solitaire")(io, helpers);

const gameModules = {
  trash: trashGame,
  "trash-eleven": trashGame,
  war: warGame,
  gofish: gofishGame,
  oldmaid: oldmaidGame,
  solitaire: solitaireGame,
};

function getGameModule(gameType) {
  return gameModules[gameType] || trashGame;
}

// ═══════════════════════════════════════════════
// GAME START (dispatches to game module)
// ═══════════════════════════════════════════════

function startGame(state, roomId) {
  const mod = getGameModule(state.game);
  if (mod) mod.startGame(state, roomId);
}

// ═══════════════════════════════════════════════
// SOCKET EVENTS
// ═══════════════════════════════════════════════

io.on("connection", socket => {
  console.log(`Connected: ${socket.id}`);

  // Register game-specific socket events
  warGame.registerEvents(socket, rooms);
  gofishGame.registerEvents(socket, rooms);
  oldmaidGame.registerEvents(socket, rooms);
  solitaireGame.registerEvents(socket, rooms);

  // ── Create Room ──
  socket.on("createRoom", ({ playerName, game }) => {
    const roomId = generateRoomId();
    const state = {
      roomId,
      phase: "lobby",
      game: game || "trash",
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
      scores: [0, 0],
      gamesPlayed: 0,
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
    startGame(state, roomId);
  });

  // ── Play vs AI (or solo for Solitaire) ──
  socket.on("playVsAI", ({ playerName, game }) => {
    const roomId = generateRoomId();
    const isSolo = game === "solitaire";
    const players = [
      { id: socket.id, name: playerName || "Player", isAI: false, board: [], wantsRematch: false },
    ];
    if (!isSolo) {
      players.push({ id: "ai", name: "AI", isAI: true, board: [], wantsRematch: false });
    }
    const state = {
      roomId,
      phase: "lobby",
      game: game || "trash",
      players,
      deck: [],
      discardPile: [],
      currentPlayerIndex: 0,
      turnPhase: "draw",
      pendingWildcard: null,
      pendingValidSlots: null,
      scores: isSolo ? [0] : [0, 0],
      gamesPlayed: 0,
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
    const allWant = state.players.every(p => p.isAI || p.wantsRematch);
    if (allWant) {
      state.players.forEach(p => { p.wantsRematch = false; });
      startGame(state, roomId);
    }
  });

  // ── Draw Card (Trash) ──
  socket.on("drawCard", ({ roomId, source }) => {
    const state = rooms.get(roomId);
    if (!state || state.phase !== "playing") return;
    const playerIndex = state.players.findIndex(p => p.id === socket.id);
    if (playerIndex === -1 || playerIndex !== state.currentPlayerIndex) return;

    const mod = getGameModule(state.game);
    if (mod && mod.handleDraw) mod.handleDraw(state, roomId, playerIndex, source);
  });

  // ── Place Wildcard (Trash) ──
  socket.on("placeWildcard", ({ roomId, slotIndex }) => {
    const state = rooms.get(roomId);
    if (!state || state.phase !== "playing") return;
    const playerIndex = state.players.findIndex(p => p.id === socket.id);
    if (playerIndex === -1 || playerIndex !== state.currentPlayerIndex) return;

    const mod = getGameModule(state.game);
    if (mod && mod.handlePlaceWildcard) mod.handlePlaceWildcard(state, roomId, playerIndex, slotIndex);
  });

  // ── Quit Game ──
  socket.on("quitGame", ({ roomId }) => {
    const state = rooms.get(roomId);
    if (!state || state.phase !== "playing") return;
    const quitterIndex = state.players.findIndex(p => p.id === socket.id);
    if (quitterIndex === -1) return;
    state.phase = "ended";
    io.to(roomId).emit("opponentQuit", { quitterIndex });
    setTimeout(() => rooms.delete(roomId), 30000);
  });

  // ── Reaction Emoji ──
  socket.on("sendReaction", ({ roomId, emoji }) => {
    const state = rooms.get(roomId);
    if (!state || state.phase === "lobby") return;
    const playerIndex = state.players.findIndex(p => p.id === socket.id);
    if (playerIndex === -1) return;
    io.to(roomId).emit("reaction", { playerIndex, emoji });
  });

  // ── Rejoin Room ──
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

    // Get game-specific reconnect data
    const mod = getGameModule(state.game);
    const gameData = mod && mod.getReconnectData
      ? mod.getReconnectData(state, playerIndex)
      : {};

    socket.emit("gameRejoined", {
      roomId,
      myPlayerIndex: playerIndex,
      currentPlayerIndex: state.currentPlayerIndex,
      players: state.players.map(p => ({ name: p.name, isAI: p.isAI })),
      deckCount: state.deck.length,
      game: state.game,
      ...gameData,
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
