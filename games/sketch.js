// games/sketch.js — Sketch It server logic

module.exports = function(io, helpers) {
  const { endGame } = helpers;

  const SHAPE_TYPES = [
    "star","spiral","cross","diamond","arrow","sun","moon",
    "mountain","tree","crown","lightning",
    "cat_face","house","heart","fish","bird","cloud","rabbit","key","mushroom"
  ];

  function generateParams(type) {
    const ri  = (lo, hi, dec) => +(lo + Math.random() * (hi - lo)).toFixed(dec || 2);
    const ri0 = (lo, hi)      => lo + Math.floor(Math.random() * (hi - lo + 1));
    switch (type) {
      case "star":      return { points: ri0(4, 8), innerRatio: ri(0.28, 0.55) };
      case "spiral":    return { loops: ri0(3, 7) };
      case "cross":     return { armLen: ri(0.30, 0.45), armThick: ri(0.10, 0.22) };
      case "diamond":   return { widthRatio: ri(0.55, 1.4) };
      case "arrow":     return { dir: ri0(0, 3) };
      case "sun":       return { rays: ri0(5, 12) };
      case "moon":      return { bite: ri(0.55, 0.80) };
      case "mountain":  return { peaks: ri0(1, 3) };
      case "tree":      return { layers: ri0(2, 4) };
      case "crown":     return { points: ri0(3, 7) };
      case "lightning": return { segments: ri0(2, 4) };
      default:          return {};
    }
  }

  function shuffleArray(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function buildTypeQueue(recentTypes) {
    const fresh = SHAPE_TYPES.filter(t => !recentTypes.has(t));
    const stale = SHAPE_TYPES.filter(t =>  recentTypes.has(t));
    return [...shuffleArray(fresh), ...shuffleArray(stale)];
  }

  function popNextShape(sk) {
    if (sk.typeQueue.length === 0) sk.typeQueue = shuffleArray(SHAPE_TYPES.slice());
    const type = sk.typeQueue.shift();
    return { type, params: generateParams(type) };
  }

  function runTimer(state, roomId, seconds, phase, onDone) {
    let t = seconds;
    state.sketch.timerRef = setInterval(() => {
      io.to(roomId).emit("sketch:timer", { phase, timeLeft: t });
      t--;
      if (t < 0) {
        clearInterval(state.sketch.timerRef);
        state.sketch.timerRef = null;
        onDone();
      }
    }, 1000);
  }

  function clearTimers(sk) {
    if (sk.timerRef) { clearInterval(sk.timerRef); sk.timerRef = null; }
    sk.photoTimeouts.forEach((t, i) => {
      if (t) { clearTimeout(t); sk.photoTimeouts[i] = null; }
    });
  }

  function startRound(state, roomId) {
    const sk = state.sketch;
    if (state.phase !== "playing" || !sk) return;

    const n = sk.numPlayers;
    sk.round++;
    sk.shape = popNextShape(sk);
    sk.typeHistory.push(sk.shape.type);
    sk.drawDone = new Array(n).fill(false);
    sk.photos = new Array(n).fill(null);
    sk.submittedScores = new Array(n).fill(null);
    sk.phase = "preview";

    io.to(roomId).emit("sketch:start_round", {
      shape: sk.shape,
      round: sk.round,
      maxRounds: sk.maxRounds,
      scores: sk.roundWins.slice(),
    });

    runTimer(state, roomId, sk.previewTime, "preview", () => {
      if (state.phase !== "playing" || !state.sketch) return;
      sk.phase = "draw";
      startDrawTimer(state, roomId);
    });
  }

  function startDrawTimer(state, roomId) {
    const sk = state.sketch;
    runTimer(state, roomId, sk.drawTime, "draw", () => {
      if (state.phase !== "playing" || !state.sketch) return;
      // Send goto_camera to any player who hasn't tapped Done yet
      state.players.forEach((p, i) => {
        if (!sk.drawDone[i] && !p.isAI) {
          sk.drawDone[i] = true;
          io.to(p.id).emit("sketch:goto_camera");
        }
      });
      sk.phase = "camera";
      startPhotoTimeouts(state, roomId);
    });
  }

  function startPhotoTimeouts(state, roomId) {
    const sk = state.sketch;
    state.players.forEach((p, i) => {
      if (p.isAI) return;
      if (sk.submittedScores[i] !== null) return;
      sk.photoTimeouts[i] = setTimeout(() => {
        if (state.phase !== "playing" || !state.sketch) return;
        if (sk.submittedScores[i] === null) {
          sk.submittedScores[i] = 0;
          sk.photos[i] = null;
          if (sk.submittedScores.every(s => s !== null)) resolveRound(state, roomId);
        }
      }, 65000);
    });
  }

  function resolveRound(state, roomId) {
    const sk = state.sketch;
    if (!sk) return;
    sk.phase = "reveal";

    const maxScore = Math.max(...sk.submittedScores);
    const topPlayers = sk.submittedScores.reduce((a, s, i) => { if (s === maxScore) a.push(i); return a; }, []);
    const winnerIndex = topPlayers.length === 1 ? topPlayers[0] : -1;

    if (winnerIndex >= 0) sk.roundWins[winnerIndex]++;

    io.to(roomId).emit("sketch:round_result", {
      playerScores: sk.submittedScores.slice(),
      winnerIndex,
      roundWins: sk.roundWins.slice(),
      photos: sk.photos.slice(),
      shape: sk.shape,
      round: sk.round,
      maxRounds: sk.maxRounds,
    });

    // Free photo memory immediately after sending
    sk.photos = new Array(sk.numPlayers).fill(null);

    const over = sk.round >= sk.maxRounds;
    setTimeout(() => {
      if (state.phase !== "playing" || !state.sketch) return;
      if (over) {
        finishGame(state, roomId);
      } else {
        startRound(state, roomId);
      }
    }, 6000);
  }

  function finishGame(state, roomId) {
    const sk = state.sketch;

    // Merge this game's shape types into room-level history
    if (!state.sketchTypeHistory) state.sketchTypeHistory = new Set();
    sk.typeHistory.forEach(t => state.sketchTypeHistory.add(t));
    // Cap at 15 so shapes cycle back after enough games
    if (state.sketchTypeHistory.size > 15) {
      const arr = Array.from(state.sketchTypeHistory);
      state.sketchTypeHistory = new Set(arr.slice(arr.length - 15));
    }

    let maxW = -1, winner = 0;
    sk.roundWins.forEach((w, i) => { if (w > maxW) { maxW = w; winner = i; } });
    endGame(state, roomId, winner);
  }

  return {
    startGame(state, roomId) {
      // Clear any leftover state from previous game
      if (state.sketch) clearTimers(state.sketch);

      const n = state.players.length;
      // Expand scores array to cover all players
      while (state.scores.length < n) state.scores.push(0);
      const drawTime    = state.sketchDrawTime    || 15;
      const previewTime = state.sketchPreviewTime || 3;
      const recentTypes = state.sketchTypeHistory || new Set();

      state.sketch = {
        round: 0,
        maxRounds: state.sketchMaxRounds || 3,
        numPlayers: n,
        drawTime,
        previewTime,
        shape: null,
        typeQueue:   buildTypeQueue(recentTypes),
        typeHistory: [],
        drawDone: new Array(n).fill(false),
        photos: new Array(n).fill(null),
        submittedScores: new Array(n).fill(null),
        roundWins: new Array(n).fill(0),
        phase: "preview",
        timerRef: null,
        photoTimeouts: new Array(n).fill(null),
      };
      state.phase = "playing";

      state.players.forEach((player, i) => {
        if (!player.isAI) {
          io.to(player.id).emit("gameStart", {
            roomId,
            myPlayerIndex: i,
            players: state.players.map(p => ({ name: p.name, isAI: p.isAI })),
            game: state.game,
            sketch: {
              maxRounds: state.sketch.maxRounds,
              drawTime,
              previewTime,
              round: 0,
              roundWins: new Array(n).fill(0),
            },
          });
        }
      });

      setTimeout(() => startRound(state, roomId), 800);
    },

    registerEvents(socket, rooms) {
      socket.on("sketch:draw_done", ({ roomId }) => {
        const state = rooms.get(roomId);
        if (!state || state.phase !== "playing" || !state.sketch) return;
        if (state.sketch.phase !== "draw") return;
        const pi = state.players.findIndex(p => p.id === socket.id);
        if (pi === -1 || state.sketch.drawDone[pi]) return;

        state.sketch.drawDone[pi] = true;
        socket.emit("sketch:goto_camera");

        // If all done early, cut the draw timer short
        if (state.sketch.drawDone.every(Boolean)) {
          if (state.sketch.timerRef) {
            clearInterval(state.sketch.timerRef);
            state.sketch.timerRef = null;
          }
          state.sketch.phase = "camera";
          startPhotoTimeouts(state, roomId);
        }
      });

      socket.on("sketch:photo_score", ({ roomId, score, photoData }) => {
        const state = rooms.get(roomId);
        if (!state || state.phase !== "playing" || !state.sketch) return;
        const sk = state.sketch;
        const pi = state.players.findIndex(p => p.id === socket.id);
        if (pi === -1 || sk.submittedScores[pi] !== null) return;
        // Accept during camera phase, or during draw phase if this player already tapped Done
        if (sk.phase !== "camera" && !(sk.phase === "draw" && sk.drawDone[pi])) return;

        sk.submittedScores[pi] = Math.round(Math.max(0, Math.min(100, Number(score) || 0)));
        sk.photos[pi] = photoData || null;

        if (sk.photoTimeouts[pi]) {
          clearTimeout(sk.photoTimeouts[pi]);
          sk.photoTimeouts[pi] = null;
        }

        if (sk.submittedScores.every(s => s !== null)) {
          // All submitted — cancel any remaining draw timer before resolving
          if (sk.timerRef) { clearInterval(sk.timerRef); sk.timerRef = null; }
          resolveRound(state, roomId);
        }
      });
    },

    getReconnectData(state) {
      if (!state.sketch) return {};
      const sk = state.sketch;
      return {
        sketch: {
          round: sk.round,
          maxRounds: sk.maxRounds,
          roundWins: sk.roundWins.slice(),
          phase: sk.phase,
          shape: sk.shape,
        },
      };
    },
  };
};
