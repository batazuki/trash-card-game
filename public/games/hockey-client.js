// games/hockey-client.js — Cat Paw Hockey client (canvas-based)

(function() {
  const { sfxTone, $ } = window._gameShared;

  // State
  let canvas, ctx;
  let rafId = null;
  let myIdx = 0;
  let serverStates = []; // ring buffer of last 2 server states for interpolation
  let localPaddle = { x: 0.5, y: 0.85 };
  let lastSendTime = 0;
  let pointerId = null;
  let goalFlash = 0; // countdown frames for goal flash effect
  let goalFlashWinner = -1;
  let paused = false;
  let disposed = false;
  let playerNames = ["You", "Opponent"];

  // Constants matching server
  const BALL_R = 0.015;
  const PADDLE_R = 0.055;
  const GOAL_W = 0.35;

  // Interpolated state for rendering
  let renderState = {
    ball: { x: 0.5, y: 0.5 },
    paddles: [{ x: 0.5, y: 0.85 }, { x: 0.5, y: 0.15 }],
    score: [0, 0],
    mouse: null,
    paused: true,
  };

  function createCanvas(container) {
    container.innerHTML = "";
    canvas = document.createElement("canvas");
    canvas.className = "hockey-canvas";
    canvas.style.touchAction = "none";
    container.appendChild(canvas);
    ctx = canvas.getContext("2d");
    sizeCanvas();
  }

  function sizeCanvas() {
    if (!canvas) return;
    const parent = canvas.parentElement;
    const maxW = parent.clientWidth;
    const maxH = parent.clientHeight || window.innerHeight - 20;
    // 3:4 aspect ratio (portrait)
    let w = maxW;
    let h = w * (4 / 3);
    if (h > maxH) {
      h = maxH;
      w = h * (3 / 4);
    }
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = w + "px";
    canvas.style.height = h + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  // Convert normalized 0-1 coords to canvas pixel coords
  function toX(nx) { return nx * parseFloat(canvas.style.width); }
  function toY(ny) {
    const raw = ny * parseFloat(canvas.style.height);
    // Flip for player 1 so their goal is at bottom
    if (myIdx === 1) return parseFloat(canvas.style.height) - raw;
    return raw;
  }
  function toR(nr) { return nr * parseFloat(canvas.style.width); }

  // Convert pointer event to normalized coords (with flip for player 1)
  function pointerToNorm(e) {
    const rect = canvas.getBoundingClientRect();
    let nx = (e.clientX - rect.left) / rect.width;
    let ny = (e.clientY - rect.top) / rect.height;
    if (myIdx === 1) ny = 1 - ny;
    return { x: Math.max(0, Math.min(1, nx)), y: Math.max(0, Math.min(1, ny)) };
  }

  function sendPaddle(x, y) {
    const now = Date.now();
    if (now - lastSendTime < 33) return; // throttle ~30Hz
    lastSendTime = now;
    socket.emit("hockey:paddle", { roomId: window._gameLocal.roomId, x, y });
  }

  // Input handlers
  function onPointerDown(e) {
    if (pointerId !== null) return;
    pointerId = e.pointerId;
    canvas.setPointerCapture(e.pointerId);
    const p = pointerToNorm(e);
    localPaddle.x = p.x;
    localPaddle.y = p.y;
    sendPaddle(p.x, p.y);
  }

  function onPointerMove(e) {
    if (e.pointerId !== pointerId) return;
    const p = pointerToNorm(e);
    localPaddle.x = p.x;
    localPaddle.y = p.y;
    sendPaddle(p.x, p.y);
  }

  function onPointerUp(e) {
    if (e.pointerId !== pointerId) return;
    pointerId = null;
  }

  // Interpolation
  function interpolate() {
    if (serverStates.length < 2) {
      if (serverStates.length === 1) {
        const s = serverStates[0].data;
        renderState.ball = { ...s.ball };
        renderState.paddles = s.paddles.map(p => ({ ...p }));
        renderState.score = [...s.score];
        renderState.mouse = s.mouse ? { ...s.mouse } : null;
        renderState.paused = s.paused;
      }
      return;
    }

    const now = Date.now();
    const s0 = serverStates[0];
    const s1 = serverStates[1];
    const dt = s1.time - s0.time;
    if (dt <= 0) {
      renderState.ball = { ...s1.data.ball };
      renderState.paddles = s1.data.paddles.map(p => ({ ...p }));
      renderState.score = [...s1.data.score];
      renderState.mouse = s1.data.mouse ? { ...s1.data.mouse } : null;
      renderState.paused = s1.data.paused;
      return;
    }

    // Extrapolate slightly ahead
    let t = (now - s0.time) / dt;
    t = Math.max(0, Math.min(2, t)); // allow slight extrapolation

    const lerp = (a, b) => a + (b - a) * t;
    renderState.ball.x = lerp(s0.data.ball.x, s1.data.ball.x);
    renderState.ball.y = lerp(s0.data.ball.y, s1.data.ball.y);

    for (let i = 0; i < 2; i++) {
      if (i === myIdx) {
        // Use local paddle for self (more responsive)
        renderState.paddles[i] = { ...localPaddle };
      } else {
        renderState.paddles[i].x = lerp(s0.data.paddles[i].x, s1.data.paddles[i].x);
        renderState.paddles[i].y = lerp(s0.data.paddles[i].y, s1.data.paddles[i].y);
      }
    }

    renderState.score = [...s1.data.score];
    renderState.mouse = s1.data.mouse ? {
      x: lerp(s0.data.mouse ? s0.data.mouse.x : s1.data.mouse.x, s1.data.mouse.x),
      y: lerp(s0.data.mouse ? s0.data.mouse.y : s1.data.mouse.y, s1.data.mouse.y),
    } : null;
    renderState.paused = s1.data.paused;
  }

  // Drawing
  function draw() {
    if (!canvas || !ctx) return;
    const w = parseFloat(canvas.style.width);
    const h = parseFloat(canvas.style.height);

    // Table background
    ctx.fillStyle = "#1a5c2a";
    ctx.fillRect(0, 0, w, h);

    // Table border
    ctx.strokeStyle = "#2a8040";
    ctx.lineWidth = 3;
    ctx.strokeRect(2, 2, w - 4, h - 4);

    // Center line
    ctx.strokeStyle = "rgba(255,255,255,0.15)";
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 8]);
    ctx.beginPath();
    ctx.moveTo(0, h / 2);
    ctx.lineTo(w, h / 2);
    ctx.stroke();
    ctx.setLineDash([]);

    // Center circle
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, toR(0.08), 0, Math.PI * 2);
    ctx.stroke();

    // Goal zones (top and bottom)
    const goalLeft = toX(0.5 - GOAL_W / 2);
    const goalRight = toX(0.5 + GOAL_W / 2);
    const goalDepth = toR(0.03);

    // Determine which physical side is which
    // For player 0: top goal = opponent's, bottom goal = mine (but scored into = opponent scores)
    // For player 1: view is flipped

    ctx.fillStyle = "rgba(255,100,100,0.25)";
    // Top goal
    ctx.fillRect(goalLeft, 0, goalRight - goalLeft, goalDepth);
    // Bottom goal
    ctx.fillRect(goalLeft, h - goalDepth, goalRight - goalLeft, goalDepth);

    // Goal posts
    ctx.strokeStyle = "rgba(255,255,255,0.5)";
    ctx.lineWidth = 3;
    // Top goal posts
    ctx.beginPath();
    ctx.moveTo(goalLeft, goalDepth);
    ctx.lineTo(goalLeft, 0);
    ctx.moveTo(goalRight, goalDepth);
    ctx.lineTo(goalRight, 0);
    ctx.stroke();
    // Bottom goal posts
    ctx.beginPath();
    ctx.moveTo(goalLeft, h - goalDepth);
    ctx.lineTo(goalLeft, h);
    ctx.moveTo(goalRight, h - goalDepth);
    ctx.lineTo(goalRight, h);
    ctx.stroke();

    // Goal flash overlay
    if (goalFlash > 0) {
      const alpha = (goalFlash / 30) * 0.3;
      ctx.fillStyle = goalFlashWinner === myIdx
        ? `rgba(100,255,100,${alpha})`
        : `rgba(255,100,100,${alpha})`;
      ctx.fillRect(0, 0, w, h);
      goalFlash--;
    }

    // Mouse NPC
    if (renderState.mouse) {
      const mx = toX(renderState.mouse.x);
      const my = toY(renderState.mouse.y);
      ctx.font = `${toR(0.05)}px serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("🐭", mx, my);
    }

    // Ball (yarn)
    const bx = toX(renderState.ball.x);
    const by = toY(renderState.ball.y);
    ctx.font = `${toR(0.04)}px serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("🧶", bx, by);

    // Paddles (paws)
    for (let i = 0; i < 2; i++) {
      const px = toX(renderState.paddles[i].x);
      const py = toY(renderState.paddles[i].y);
      const pawSize = toR(PADDLE_R * 2.2);
      ctx.font = `${pawSize}px serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      // Subtle glow behind paddle
      ctx.shadowColor = i === myIdx ? "rgba(100,200,255,0.4)" : "rgba(255,150,100,0.4)";
      ctx.shadowBlur = 12;
      ctx.fillText("🐾", px, py);
      ctx.shadowColor = "transparent";
      ctx.shadowBlur = 0;
    }

    // Score display
    const myScore = renderState.score[myIdx];
    const oppScore = renderState.score[1 - myIdx];
    ctx.font = `bold ${toR(0.055)}px 'Nunito', sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.fillText(`${oppScore}  —  ${myScore}`, w / 2, h / 2);

    // Player name labels near score
    ctx.font = `bold ${toR(0.025)}px 'Nunito', sans-serif`;
    ctx.fillStyle = "rgba(255,255,255,0.45)";
    // Opponent label above center, my label below
    ctx.fillText(playerNames[1 - myIdx], w / 2, h / 2 - toR(0.055));
    ctx.fillText(playerNames[myIdx], w / 2, h / 2 + toR(0.055));

    // Paused indicator
    if (renderState.paused) {
      ctx.font = `bold ${toR(0.03)}px 'Nunito', sans-serif`;
      ctx.fillStyle = "rgba(255,255,255,0.5)";
      ctx.fillText("Ready...", w / 2, h / 2 + toR(0.1));
    }
  }

  function gameLoop() {
    if (disposed) return;
    interpolate();
    draw();
    rafId = requestAnimationFrame(gameLoop);
  }

  // Resize handler
  function onResize() {
    sizeCanvas();
  }

  // Register client
  window.gameClients = window.gameClients || {};
  window.gameClients.hockey = {
    onGameStart(data) {
      disposed = false;
      myIdx = data.myPlayerIndex;
      serverStates = [];
      goalFlash = 0;
      pointerId = null;
      lastSendTime = 0;

      playerNames = [
        data.players[myIdx].name,
        data.players[1 - myIdx].name + (data.players[1 - myIdx].isAI ? " 🤖" : ""),
      ];

      // Init local paddle position
      localPaddle = myIdx === 0
        ? { x: 0.5, y: 0.85 }
        : { x: 0.5, y: 0.15 };

      // Set initial render state from server data
      if (data.hockey) {
        renderState.ball = { ...data.hockey.ball };
        renderState.paddles = data.hockey.paddles.map(p => ({ ...p }));
        renderState.score = [...data.hockey.score];
        renderState.mouse = data.hockey.mouse ? { ...data.hockey.mouse } : null;
        renderState.paused = data.hockey.paused;
      }

      const container = document.getElementById("game-container");
      createCanvas(container);

      // Input events
      canvas.addEventListener("pointerdown", onPointerDown);
      canvas.addEventListener("pointermove", onPointerMove);
      canvas.addEventListener("pointerup", onPointerUp);
      canvas.addEventListener("pointercancel", onPointerUp);

      window.addEventListener("resize", onResize);

      // Start render loop
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(gameLoop);
    },

    onReconnect(data) {
      this.onGameStart(data);
    },

    cleanup() {
      disposed = true;
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
      if (canvas) {
        canvas.removeEventListener("pointerdown", onPointerDown);
        canvas.removeEventListener("pointermove", onPointerMove);
        canvas.removeEventListener("pointerup", onPointerUp);
        canvas.removeEventListener("pointercancel", onPointerUp);
        canvas = null;
        ctx = null;
      }
      window.removeEventListener("resize", onResize);
      serverStates = [];
      pointerId = null;
    },
  };

  // Socket handlers
  socket.on("hockey:state", (data) => {
    serverStates.push({ time: Date.now(), data });
    // Keep only last 2
    if (serverStates.length > 2) serverStates.shift();
  });

  socket.on("hockey:goal", ({ scorerIndex, score }) => {
    goalFlash = 30;
    goalFlashWinner = scorerIndex;

    // Sound effect
    if (scorerIndex === myIdx) {
      // I scored - ascending fanfare
      if (sfxTone) {
        sfxTone(440, 0.15, 0.15, "triangle");
        sfxTone(554, 0.15, 0.15, "triangle", 0.08);
        sfxTone(659, 0.25, 0.2, "triangle", 0.16);
      }
    } else {
      // Opponent scored - descending
      if (sfxTone) {
        sfxTone(400, 0.2, 0.12, "sine");
        sfxTone(300, 0.3, 0.1, "sine", 0.1);
      }
    }
  });

  socket.on("hockey:mousehit", () => {
    // Mouse squeak
    if (sfxTone) {
      sfxTone(1200, 0.05, 0.12, "square");
      sfxTone(1600, 0.04, 0.08, "square", 0.03);
    }
  });
})();
