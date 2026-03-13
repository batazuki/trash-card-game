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

    sk.round++;
    sk.shapeKey = pickShape();
    sk.drawDone = [false, false];
    sk.photos = [null, null];
    sk.submittedScores = [null, null];
    sk.phase = "preview";

    io.to(roomId).emit("sketch:start_round", {
      shapeKey: sk.shapeKey,
      round: sk.round,
      maxRounds: sk.maxRounds,
      scores: sk.roundWins.slice(),
    });

    // 3s preview → 30s draw
    runTimer(state, roomId, 3, "preview", () => {
      if (state.phase !== "playing" || !state.sketch) return;
      sk.phase = "draw";
      startDrawTimer(state, roomId);
    });
  }

  function startDrawTimer(state, roomId) {
    const sk = state.sketch;
    runTimer(state, roomId, 30, "draw", () => {
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

    const [s0, s1] = sk.submittedScores;
    let winnerIndex = -1;
    if (s0 > s1) winnerIndex = 0;
    else if (s1 > s0) winnerIndex = 1;

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
    const [w0, w1] = sk.roundWins;
    const winner = w0 > w1 ? 0 : w0 < w1 ? 1 : 0;
    endGame(state, roomId, winner);
  }

  return {
    startGame(state, roomId) {
      // Clear any leftover state from previous game
      if (state.sketch) clearTimers(state.sketch);

      state.sketch = {
        round: 0,
        maxRounds: state.sketchMaxRounds || 3,
        shapeKey: null,
        drawDone: [false, false],
        photos: [null, null],
        submittedScores: [null, null],
        roundWins: [0, 0],
        phase: "preview",
        timerRef: null,
        photoTimeouts: [null, null],
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
              round: 0,
              roundWins: [0, 0],
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
        if (state.sketch.phase !== "camera") return;
        const pi = state.players.findIndex(p => p.id === socket.id);
        if (pi === -1 || state.sketch.submittedScores[pi] !== null) return;

        state.sketch.submittedScores[pi] = Math.round(Math.max(0, Math.min(100, Number(score) || 0)));
        state.sketch.photos[pi] = photoData || null;

        if (state.sketch.photoTimeouts[pi]) {
          clearTimeout(state.sketch.photoTimeouts[pi]);
          state.sketch.photoTimeouts[pi] = null;
        }

        if (state.sketch.submittedScores.every(s => s !== null)) {
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
