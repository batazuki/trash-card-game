/* ═══════════════════════════════════════════════
   TINY TINY GAMES — Server
   Node.js + Express + Socket.io
   ═══════════════════════════════════════════════ */

const express = require("express");
const http    = require("http");
const crypto  = require("crypto");
const { Server } = require("socket.io");
const path    = require("path");

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, {
  pingTimeout:       30000,
  pingInterval:      10000,
  maxHttpBufferSize: 1e6,   // C1: cap any single socket message at 1 MB
});

app.use(express.static(path.join(__dirname, "public")));

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Tiny Tiny Games running on port ${PORT}`));

// ═══════════════════════════════════════════════
// IN-MEMORY ROOM STORE
// ═══════════════════════════════════════════════
const rooms = new Map(); // roomId → GameState
const MAX_ROOMS = 500;   // L1: prevent infinite generateRoomId loop

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

// L1: bail out rather than looping forever
function generateRoomId() {
  if (rooms.size >= MAX_ROOMS) throw new Error("Server at capacity");
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  let id, attempts = 0;
  do {
    id = Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
    if (++attempts > 1000) throw new Error("Cannot generate unique room ID");
  } while (rooms.has(id));
  return id;
}

// C2: per-player session token for rejoin authentication
function generateToken() {
  return crypto.randomBytes(24).toString("hex");
}

// C4: strip HTML-significant chars and enforce length cap on player names
function sanitizeName(name) {
  return String(name || "").replace(/[<>&"'`]/g, "").trim().slice(0, 20) || "Player";
}

function endGame(state, roomId, winnerIndex) {
  if (state.phase === "ended") return; // H1: idempotency guard — prevents double score on async races
  state.phase = "ended";
  state.scores[winnerIndex]++;
  state.gamesPlayed++;
  io.to(roomId).emit("gameOver", {
    winnerIndex,
    winnerName: state.players[winnerIndex].name,
    scores: state.scores,
    gamesPlayed: state.gamesPlayed,
    playerNames: state.players.map(p => p.name),
  });
  // Auto-cleanup room after 5 minutes if no rematch
  clearTimeout(state.endedTimer);
  state.endedTimer = setTimeout(() => {
    if (rooms.has(roomId) && rooms.get(roomId).phase === "ended") {
      rooms.delete(roomId);
      console.log(`Room ${roomId} cleaned up (TTL expired)`);
    }
  }, 5 * 60 * 1000);
}

function getLobbyConfig(state) {
  return {
    game:              state.game,
    ghostArea:         state.ghostArea  || null,
    ghostCount:        state.ghostCount || 3,
    sketchRounds:      state.sketchMaxRounds    || 3,
    sketchDrawTime:    state.sketchDrawTime      || 15,
    sketchPreviewTime: state.sketchPreviewTime   || 3,
  };
}

// ═══════════════════════════════════════════════
// GAME MODULES
// ═══════════════════════════════════════════════

const helpers = { createDeck, shuffle, delay, endGame };
const trashGame    = require("./games/trash")(io, helpers);
const warGame      = require("./games/war")(io, helpers);
const solitaireGame = require("./games/solitaire")(io, helpers);
const hockeyGame   = require("./games/hockey")(io, helpers);
const sketchGame   = require("./games/sketch")(io, helpers);
const ghostGame    = require("./games/ghost")(io, helpers);

const gameModules = {
  trash: trashGame,
  "trash-eleven": trashGame,
  war: warGame,
  solitaire: solitaireGame,
  hockey: hockeyGame,
  sketch: sketchGame,
  ghost: ghostGame,
};

// M10: return null for unknown game types — callers already guard for null
function getGameModule(gameType) {
  return gameModules[gameType] || null;
}

// ═══════════════════════════════════════════════
// GAME START (dispatches to game module)
// ═══════════════════════════════════════════════

function startGame(state, roomId) {
  // H6: cancel any pending room-delete timer before starting a new game
  clearTimeout(state.cleanupTimer);
  state.cleanupTimer = null;
  // Cancel any pending avatar-selection timer
  if (state.avatarSelectTimer) {
    clearTimeout(state.avatarSelectTimer);
    state.avatarSelectTimer = null;
  }
  // Ensure scores array has a slot for every player (joinRoom doesn't add one)
  while (state.scores.length < state.players.length) state.scores.push(0);
  const mod = getGameModule(state.game);
  if (mod) mod.startGame(state, roomId);
}

// ═══════════════════════════════════════════════
// ALLOWED REACTION EMOJIS (M1)
// ═══════════════════════════════════════════════
const ALLOWED_EMOJIS = new Set(["👍","😂","😮","🔥","💀","😬","🦍","6️⃣7️⃣"]);

// ═══════════════════════════════════════════════
// SOCKET EVENTS
// ═══════════════════════════════════════════════

io.on("connection", socket => {
  console.log(`Connected: ${socket.id}`);
  // Per-socket reaction rate-limit bucket (max 5 per 15 s)
  const reactionTimestamps = [];

  // Register game-specific socket events
  warGame.registerEvents(socket, rooms);
  solitaireGame.registerEvents(socket, rooms);
  hockeyGame.registerEvents(socket, rooms);
  sketchGame.registerEvents(socket, rooms);
  ghostGame.registerEvents(socket, rooms);

  // ── Create Room ──
  socket.on("createRoom", ({ playerName, game, rounds, drawTime, previewTime, ghostArea, ghostCount }) => {
    let roomId;
    try { roomId = generateRoomId(); }
    catch(e) { socket.emit("joinError", { message: "Server is full, try again later." }); return; }

    const safeGame = gameModules[game] ? game : "trash"; // only accept known game types
    const isSketch = safeGame === "sketch";
    const token = generateToken(); // C2
    const creator = {
      id: socket.id,
      name: sanitizeName(playerName), // C4
      isAI: false,
      board: [],
      wantsRematch: false,
      token,
    };
    const state = {
      roomId,
      phase: "lobby",
      game: safeGame,
      sketchMaxRounds:   isSketch ? Math.min(5,  Math.max(1,  parseInt(rounds)      || 3))  : undefined,
      sketchMaxPlayers:  isSketch ? 4 : undefined,
      sketchDrawTime:    isSketch ? Math.min(20, Math.max(10, parseInt(drawTime)    || 15)) : undefined,
      sketchPreviewTime: isSketch ? Math.min(3,  Math.max(1,  parseInt(previewTime) || 3))  : undefined,
      ghostArea:         safeGame === 'ghost' ? (ghostArea || null) : undefined,
      ghostCount:        safeGame === 'ghost' ? (parseInt(ghostCount) || 3) : undefined,
      players: [creator],
      deck: [],
      discardPile: [],
      currentPlayerIndex: 0,
      turnPhase: "draw",
      pendingWildcard: null,
      pendingValidSlots: null,
      scores: [0],
      gamesPlayed: 0,
      endedTimer: null,
      cleanupTimer: null,
    };
    rooms.set(roomId, state);
    socket.join(roomId);
    socket.emit("roomCreated", { roomId, players: [{ name: creator.name }], token, ...getLobbyConfig(state) }); // C2: send token
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
    if (state.players.length >= 4) {
      socket.emit("joinError", { message: "Room is full." });
      return;
    }

    const token = generateToken(); // C2
    state.players.push({
      id: socket.id,
      name: sanitizeName(playerName), // C4
      isAI: false,
      board: [],
      wantsRematch: false,
      token,
    });
    socket.join(roomId);
    const playerList = state.players.map(p => ({ name: p.name, avatar: p.lobbyAvatar || 0 }));
    socket.emit("joinedRoom", { roomId, players: playerList, token, ...getLobbyConfig(state) }); // C2: send token
    io.to(roomId).emit("playerJoined", { players: playerList, ...getLobbyConfig(state) });
  });

  // ── Host requests game start (from pre-game lobby) ──
  socket.on("hostStartGame", ({ roomId }) => {
    const state = rooms.get(roomId);
    if (!state || state.phase !== "lobby") return;
    if (state.players[0]?.id !== socket.id) return; // host only
    const minPlayers = state.game === "ghost" ? 1 : 2;
    if (state.players.length < minPlayers) return;

    // Ghost: enter avatar-selection phase before starting
    if (state.game === "ghost") {
      state.phase = "avatar_select";
      state.avatarConfirmed = new Set();
      state.avatarSelectTimer = setTimeout(() => {
        if (state.phase === "avatar_select") {
          state.avatarSelectTimer = null;
          startGame(state, roomId);
        }
      }, 10000);
      io.to(roomId).emit("ghost:avatarSelect", { timeoutMs: 10000 });
      return;
    }

    startGame(state, roomId);
  });

  // ── Ghost: player confirms avatar selection ──
  socket.on("ghost:avatarChosen", ({ roomId, avatar }) => {
    const state = rooms.get(roomId);
    if (!state || state.phase !== "avatar_select") return;
    const pi = state.players.findIndex(p => p.id === socket.id);
    if (pi === -1) return;
    const av = Math.max(0, Math.min(3, parseInt(avatar) || 0));
    state.players[pi].lobbyAvatar = av;
    if (!state.avatarConfirmed) state.avatarConfirmed = new Set();
    state.avatarConfirmed.add(pi);
    // Start early if all human players have confirmed
    const humanCount = state.players.filter(p => !p.isAI).length;
    if (state.avatarConfirmed.size >= humanCount) {
      clearTimeout(state.avatarSelectTimer);
      state.avatarSelectTimer = null;
      startGame(state, roomId);
    }
  });

  // ── Play vs AI (or solo for Solitaire) ──
  socket.on("playVsAI", ({ playerName, game, ghostArea, ghostCount, ghostAvatar }) => {
    if (game === "sketch") {
      socket.emit("joinError", { message: "Sketch It requires two real players. Create a room and share the code!" });
      return;
    }
    let roomId;
    try { roomId = generateRoomId(); }
    catch(e) { socket.emit("joinError", { message: "Server is full, try again later." }); return; }

    const safeGame = gameModules[game] ? game : "trash";
    const isSolo = safeGame === "solitaire" || safeGame === "ghost";
    const token = generateToken(); // C2
    const soloPiAvatar = Math.max(0, Math.min(3, parseInt(ghostAvatar) || 0));
    const players = [
      { id: socket.id, name: sanitizeName(playerName), isAI: false, board: [], wantsRematch: false, token,
        lobbyAvatar: soloPiAvatar }, // C4
    ];
    if (!isSolo) {
      players.push({ id: "ai", name: "AI", isAI: true, board: [], wantsRematch: false, token: null });
    }
    const state = {
      roomId,
      phase: "lobby",
      game: safeGame,
      ghostArea:  safeGame === 'ghost' ? (ghostArea || null) : undefined,
      ghostCount: safeGame === 'ghost' ? (parseInt(ghostCount) || 3) : undefined,
      players,
      deck: [],
      discardPile: [],
      currentPlayerIndex: 0,
      turnPhase: "draw",
      pendingWildcard: null,
      pendingValidSlots: null,
      scores: isSolo ? [0] : [0, 0],
      gamesPlayed: 0,
      endedTimer: null,
      cleanupTimer: null,
    };
    rooms.set(roomId, state);
    socket.join(roomId);
    socket.emit("playerToken", { token }); // C2: send token before gameStart for AI/solo games
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
      clearTimeout(state.endedTimer);
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

    // M5: validate slotIndex is an integer in the valid range before passing to game logic
    slotIndex = parseInt(slotIndex, 10);
    if (!Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex > 10) return;

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
    socket.leave(roomId); // L7: clean up socket membership so client needn't send leaveRoom too
    // H6: store timer reference so a subsequent startGame (rematch) can cancel it
    clearTimeout(state.cleanupTimer);
    clearTimeout(state.endedTimer);
    state.cleanupTimer = setTimeout(() => rooms.delete(roomId), 30000);
  });

  // ── Leave Room ──
  socket.on("leaveRoom", ({ roomId }) => {
    const state = rooms.get(roomId);
    if (!state) return;
    const pi = state.players.findIndex(p => p.id === socket.id);
    if (pi === -1) return;
    socket.leave(roomId);
    io.to(roomId).emit("opponentLeft");
    // H6: store timer; cancel any existing cleanup/ended timer first
    clearTimeout(state.endedTimer);
    clearTimeout(state.cleanupTimer);
    state.cleanupTimer = setTimeout(() => rooms.delete(roomId), 5000);
  });

  // ── Change Game Type (from end screen) ──
  socket.on("changeGame", ({ roomId, game }) => {
    const state = rooms.get(roomId);
    if (!state || state.phase !== "ended") return;
    if (!gameModules[game]) return;
    // M2: only room participants may change the game
    const pi = state.players.findIndex(p => p.id === socket.id);
    if (pi === -1) return;
    state.game = game;
    // M2: reset rematch votes so a pre-existing "Rematch" click doesn't auto-start the new game
    state.players.forEach(p => { p.wantsRematch = false; });
    io.to(roomId).emit("gameChanged", { game });
  });

  // Ghost: update area/count config (used before a rematch)
  socket.on("ghost:set_config", ({ roomId, ghostArea, ghostCount }) => {
    const state = rooms.get(roomId);
    if (!state || state.phase !== "ended") return;
    if (ghostArea !== undefined) state.ghostArea = ghostArea || null;
    if (ghostCount !== undefined) state.ghostCount = parseInt(ghostCount) || 3;
  });

  // ── Lobby: host changes game type ──
  socket.on("lobbySetGame", ({ roomId, game }) => {
    const state = rooms.get(roomId);
    if (!state || state.phase !== "lobby") return;
    if (state.players[0]?.id !== socket.id) return; // host only
    const safeGame = gameModules[game] ? game : state.game;
    state.game = safeGame;
    const isSketch = safeGame === "sketch";
    // Reset sketch options to defaults when switching to sketch
    if (isSketch && !state.sketchMaxRounds) {
      state.sketchMaxRounds = 3;
      state.sketchDrawTime = 15;
      state.sketchPreviewTime = 3;
    }
    // Reset ghost options to defaults when switching to ghost
    if (safeGame === "ghost" && !state.ghostCount) {
      state.ghostCount = 3;
    }
    const playerList = state.players.map(p => ({ name: p.name, avatar: p.lobbyAvatar || 0 }));
    io.to(roomId).emit("lobbyUpdate", { players: playerList, ...getLobbyConfig(state) });
  });

  // ── Lobby: host changes a game option ──
  socket.on("lobbySetOption", ({ roomId, key, value }) => {
    const state = rooms.get(roomId);
    if (!state || state.phase !== "lobby") return;
    if (state.players[0]?.id !== socket.id) return; // host only
    const allowed = ["ghostArea","ghostCount","sketchMaxRounds","sketchDrawTime","sketchPreviewTime"];
    if (!allowed.includes(key)) return;
    if (key === "ghostArea")         state.ghostArea         = value || null;
    if (key === "ghostCount")        state.ghostCount        = parseInt(value) || 3;
    if (key === "sketchMaxRounds")   state.sketchMaxRounds   = parseInt(value) || 3;
    if (key === "sketchDrawTime")    state.sketchDrawTime    = parseInt(value) || 15;
    if (key === "sketchPreviewTime") state.sketchPreviewTime = parseInt(value) || 3;
    const playerList = state.players.map(p => ({ name: p.name, avatar: p.lobbyAvatar || 0 }));
    io.to(roomId).emit("lobbyUpdate", { players: playerList, ...getLobbyConfig(state) });
  });

  // ── Lobby: any player sets their ghost avatar ──
  socket.on("lobbySetAvatar", ({ roomId, avatar }) => {
    const state = rooms.get(roomId);
    if (!state || state.phase !== "lobby") return;
    const pi = state.players.findIndex(p => p.id === socket.id);
    if (pi === -1) return;
    state.players[pi].lobbyAvatar = parseInt(avatar) || 0;
    const playerList = state.players.map(p => ({ name: p.name, avatar: p.lobbyAvatar || 0 }));
    io.to(roomId).emit("lobbyUpdate", { players: playerList, ...getLobbyConfig(state) });
  });

  // ── Reaction Emoji ──
  socket.on("sendReaction", ({ roomId, emoji }) => {
    const state = rooms.get(roomId);
    if (!state || state.phase === "lobby") return;
    // M1: whitelist — reject any arbitrary string a client might send
    if (!ALLOWED_EMOJIS.has(emoji)) return;
    const playerIndex = state.players.findIndex(p => p.id === socket.id);
    if (playerIndex === -1) return;
    // Server-side rate limit: max 5 reactions per 15 seconds per socket
    const now = Date.now(), cutoff = now - 15000;
    while (reactionTimestamps.length && reactionTimestamps[0] < cutoff) reactionTimestamps.shift();
    if (reactionTimestamps.length >= 5) return;
    reactionTimestamps.push(now);
    io.to(roomId).emit("reaction", { playerIndex, emoji });
  });

  // ── Rejoin Room ──
  socket.on("rejoinRoom", ({ roomId, playerIndex, token }) => {
    const state = rooms.get(roomId);
    if (!state || state.phase !== "playing") return;
    if (playerIndex < 0 || playerIndex >= state.players.length) return;
    const player = state.players[playerIndex];
    if (!player || !player.disconnecting) return;
    // C2: require the session token issued at room creation / join to prevent slot hijacking
    if (!token || token !== player.token) return;

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

    const opponentConnected = !state.players.some((p, i) => i !== playerIndex && p.disconnecting);
    socket.emit("gameRejoined", {
      roomId,
      myPlayerIndex: playerIndex,
      currentPlayerIndex: state.currentPlayerIndex,
      players: state.players.map(p => ({ name: p.name, isAI: p.isAI })),
      deckCount: state.deck.length,
      game: state.game,
      scores: state.scores,
      gamesPlayed: state.gamesPlayed,
      opponentConnected,
      ...gameData,
    });
  });

  // ── Disconnect ──
  socket.on("disconnect", () => {
    console.log(`Disconnected: ${socket.id}`);
    // H5 note: linear scan is acceptable at this scale; a socketRooms reverse-index
    // would be an optimization for servers with thousands of concurrent rooms.
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
          // H6: store the cleanup timer so startGame (rematch) can cancel it
          clearTimeout(state.cleanupTimer);
          state.cleanupTimer = setTimeout(() => rooms.delete(roomId), 30000);
        }, 15000);
      } else {
        // H6: store timer reference
        clearTimeout(state.cleanupTimer);
        state.cleanupTimer = setTimeout(() => rooms.delete(roomId), 5000);
      }
      break;
    }
  });
});
