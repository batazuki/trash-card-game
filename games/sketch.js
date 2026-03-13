// games/sketch.js — Sketch It server logic

module.exports = function(io, helpers) {
  const { endGame } = helpers;

  const SHAPE_KEYS = [
    "cat_face","house","star","heart","fish","bird","tree","sun",
    "cloud","moon","mountain","diamond","arrow","spiral","cross",
    "lightning","rabbit","key","crown","mushroom"
  ];

  function pickShape() {
    return SHAPE_KEYS[Math.floor(Math.random() * SHAPE_KEYS.length)];
  }

  function shuffleMapping() {
    return Math.random() < 0.5 ? [0, 1] : [1, 0];
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
    sk.shapeKey = pickShape();
    sk.drawDone = new Array(n).fill(false);
    sk.photos = new Array(n).fill(null);
    sk.submittedScores = new Array(n).fill(null);
    sk.phase = "preview";

    io.to(roomId).emit("sketch:start_round", {
      shapeKey: sk.shapeKey,
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
      if (sk.submittedScores[i] !== null) return; // already submitted early
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
      shapeKey: sk.shapeKey,
      round: sk.round,
      maxRounds: sk.maxRounds,
    });

    // Free photo memory immediately after sending
    sk.photos = [null, null];

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
    let maxW = -1, winner = 0;
    sk.roundWins.forEach((w, i) => { if (w > maxW) { maxW = w; winner = i; } });
    endGame(state, roomId, winner);
  }

  return {
    startGame(state, roomId) {
      // Clear any leftover state from previous game
      if (state.sketch) clearTimers(state.sketch);

      const n = state.sketchMaxPlayers || 2;
      const drawTime    = state.sketchDrawTime    || 30;
      const previewTime = state.sketchPreviewTime || 3;

      state.sketch = {
        round: 0,
        maxRounds: state.sketchMaxRounds || 3,
        numPlayers: n,
        drawTime,
        previewTime,
        shapeKey: null,
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

        // If both done early, cut the draw timer short
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
          // Both submitted — cancel any remaining draw timer before resolving
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
          shapeKey: sk.shapeKey,
        },
      };
    },
  };
};
