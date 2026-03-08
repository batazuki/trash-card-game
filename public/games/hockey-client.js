// games/hockey-client.js — Cat Paw Hockey client (canvas-based)

(function() {
  const { sfxTone } = window._gameShared;

  // State
  let canvas, ctx;
  let rafId = null;
  let myIdx = 0;
  let serverStates = [];
  let localPaddle = { x: 0.5, y: 0.85 };
  let lastSendTime = 0;
  let pointerId = null;
  let goalFlash = 0;
  let goalFlashWinner = -1;
  let reactionBarTimer = 0;
  let disposed = false;
  let playerNames = ["You", "Opponent"]; // indexed by actual player index

  // Constants matching server
  const BALL_R   = 0.038;
  const PADDLE_R = 0.055;
  const GOAL_W   = 0.35;

  // Paddle y bounds matching server
  const P0_Y_MIN = 0.52, P0_Y_MAX = 0.95;
  const P1_Y_MIN = 0.05, P1_Y_MAX = 0.48;

  // Interpolated render state
  let renderState = {
    ball:    { x: 0.5, y: 0.5 },
    paddles: [{ x: 0.5, y: 0.85 }, { x: 0.5, y: 0.15 }],
    score:   [0, 0],
    mouse:   null,
    paused:  true,
  };

  // ─── Canvas setup ───────────────────────────────────────────────────────────

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
    const maxW = window.innerWidth;
    const maxH = window.innerHeight;
    let w = maxW;
    let h = w * (4 / 3);
    if (h > maxH) { h = maxH; w = h * (3 / 4); }
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width  = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width  = w + "px";
    canvas.style.height = h + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  // ─── Coordinate helpers ─────────────────────────────────────────────────────

  function toX(nx) { return nx * parseFloat(canvas.style.width); }
  function toY(ny) {
    const raw = ny * parseFloat(canvas.style.height);
    return myIdx === 1 ? parseFloat(canvas.style.height) - raw : raw;
  }
  function toR(nr) { return nr * parseFloat(canvas.style.width); }

  // ─── Input ──────────────────────────────────────────────────────────────────

  function pointerToNorm(e) {
    const rect = canvas.getBoundingClientRect();
    let nx = (e.clientX - rect.left) / rect.width;
    let ny = (e.clientY - rect.top)  / rect.height;
    if (myIdx === 1) ny = 1 - ny;
    nx = Math.max(PADDLE_R, Math.min(1 - PADDLE_R, nx));
    const yMin = myIdx === 0 ? P0_Y_MIN : P1_Y_MIN;
    const yMax = myIdx === 0 ? P0_Y_MAX : P1_Y_MAX;
    ny = Math.max(yMin, Math.min(yMax, ny));
    return { x: nx, y: ny };
  }

  function sendPaddle(x, y) {
    const now = Date.now();
    if (now - lastSendTime < 33) return;
    lastSendTime = now;
    socket.emit("hockey:paddle", { roomId: window._gameLocal.roomId, x, y });
  }

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

  // ─── Interpolation ──────────────────────────────────────────────────────────

  function interpolate() {
    if (serverStates.length === 0) return;
    if (serverStates.length === 1) {
      const d = serverStates[0].data;
      renderState.ball    = { ...d.ball };
      renderState.paddles = d.paddles.map(p => ({ ...p }));
      renderState.score   = [...d.score];
      renderState.mouse   = d.mouse ? { ...d.mouse } : null;
      renderState.paused  = d.paused;
      return;
    }
    const now = Date.now();
    const s0 = serverStates[0], s1 = serverStates[1];
    const dt = s1.time - s0.time;
    let t = dt > 0 ? Math.max(0, Math.min(2, (now - s0.time) / dt)) : 1;
    const lerp = (a, b) => a + (b - a) * t;
    renderState.ball.x = lerp(s0.data.ball.x, s1.data.ball.x);
    renderState.ball.y = lerp(s0.data.ball.y, s1.data.ball.y);
    for (let i = 0; i < 2; i++) {
      if (i === myIdx) {
        renderState.paddles[i] = { ...localPaddle };
      } else {
        renderState.paddles[i].x = lerp(s0.data.paddles[i].x, s1.data.paddles[i].x);
        renderState.paddles[i].y = lerp(s0.data.paddles[i].y, s1.data.paddles[i].y);
      }
    }
    renderState.score  = [...s1.data.score];
    renderState.paused = s1.data.paused;
    if (s1.data.mouse) {
      renderState.mouse = {
        x: lerp(s0.data.mouse ? s0.data.mouse.x : s1.data.mouse.x, s1.data.mouse.x),
        y: lerp(s0.data.mouse ? s0.data.mouse.y : s1.data.mouse.y, s1.data.mouse.y),
      };
    } else {
      renderState.mouse = null;
    }
  }

  // ─── Drawing helpers ────────────────────────────────────────────────────────

  function drawTable(w, h) {
    // Background with radial gradient
    const bg = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.hypot(w, h) / 2);
    bg.addColorStop(0, "#218a3a");
    bg.addColorStop(1, "#0c3015");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    // Air holes grid
    const holeR   = Math.max(1.2, toR(0.005));
    const holeGap = toR(0.055);
    ctx.fillStyle = "rgba(0,0,0,0.22)";
    for (let gx = holeGap; gx < w - holeGap / 2; gx += holeGap) {
      for (let gy = holeGap; gy < h - holeGap / 2; gy += holeGap) {
        ctx.beginPath();
        ctx.arc(gx, gy, holeR, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Wooden side rails
    const rail = toR(0.022);
    const railGrad = ctx.createLinearGradient(0, 0, rail * 2, 0);
    railGrad.addColorStop(0, "#7a4510");
    railGrad.addColorStop(0.5, "#a0621a");
    railGrad.addColorStop(1, "#7a4510");
    ctx.fillStyle = railGrad;
    ctx.fillRect(0, 0, rail, h);                  // left
    ctx.fillRect(w - rail, 0, rail, h);            // right
    const railGradH = ctx.createLinearGradient(0, 0, 0, rail * 2);
    railGradH.addColorStop(0, "#7a4510");
    railGradH.addColorStop(0.5, "#a0621a");
    railGradH.addColorStop(1, "#7a4510");
    ctx.fillStyle = railGradH;
    ctx.fillRect(0, 0, w, rail);                   // top (non-goal)
    ctx.fillRect(0, h - rail, w, rail);            // bottom (non-goal)

    // Goal openings cut into rails (clear the rail over goal)
    const goalLeft  = toX(0.5 - GOAL_W / 2);
    const goalRight = toX(0.5 + GOAL_W / 2);
    const goalDepth = toR(0.04);
    ctx.fillStyle = "#000";
    ctx.fillRect(goalLeft, 0, goalRight - goalLeft, rail);
    ctx.fillRect(goalLeft, h - rail, goalRight - goalLeft, rail);

    // Goal interiors (dark recess)
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.fillRect(goalLeft, 0, goalRight - goalLeft, goalDepth);
    ctx.fillRect(goalLeft, h - goalDepth, goalRight - goalLeft, goalDepth);

    // Goal posts (thick white pipes)
    const postR = toR(0.014);
    ctx.fillStyle = "#e8e8e8";
    // Top goal
    drawCircle(goalLeft,  goalDepth, postR);
    drawCircle(goalRight, goalDepth, postR);
    // Bottom goal
    drawCircle(goalLeft,  h - goalDepth, postR);
    drawCircle(goalRight, h - goalDepth, postR);

    // Goal crossbars
    ctx.strokeStyle = "#cccccc";
    ctx.lineWidth = postR * 1.2;
    ctx.beginPath();
    ctx.moveTo(goalLeft, goalDepth);
    ctx.lineTo(goalRight, goalDepth);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(goalLeft, h - goalDepth);
    ctx.lineTo(goalRight, h - goalDepth);
    ctx.stroke();

    // Center dividing line
    ctx.strokeStyle = "rgba(255,255,255,0.25)";
    ctx.lineWidth = toR(0.007);
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(rail, h / 2);
    ctx.lineTo(w - rail, h / 2);
    ctx.stroke();

    // Center circle
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, toR(0.1), 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(255,255,255,0.18)";
    ctx.lineWidth = toR(0.005);
    ctx.stroke();

    // Center dot
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, toR(0.012), 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,255,255,0.25)";
    ctx.fill();

    // Scoring arcs near goals
    ctx.strokeStyle = "rgba(255,255,255,0.1)";
    ctx.lineWidth = toR(0.004);
    ctx.beginPath();
    ctx.arc(w / 2, goalDepth, toR(0.22), 0, Math.PI);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(w / 2, h - goalDepth, toR(0.22), Math.PI, Math.PI * 2);
    ctx.stroke();
  }

  function drawCircle(x, y, r) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawPaw(cx, cy, size, isMe) {
    const padFill   = isMe ? "#f9a8d4" : "#fdba74";
    const padStroke = isMe ? "#db2777" : "#c2410c";
    const glowColor = isMe ? "rgba(219,39,119,0.45)" : "rgba(194,65,12,0.45)";

    ctx.save();
    ctx.shadowColor = glowColor;
    ctx.shadowBlur  = size * 0.55;

    // Main palm pad (large oval, slightly tall)
    ctx.beginPath();
    ctx.ellipse(cx, cy + size * 0.12, size * 0.37, size * 0.31, 0, 0, Math.PI * 2);
    ctx.fillStyle   = padFill;
    ctx.fill();
    ctx.strokeStyle = padStroke;
    ctx.lineWidth   = size * 0.065;
    ctx.stroke();

    // 4 toe beans in a slight arc above the main pad
    const toes = [
      { x: cx - size * 0.43, y: cy - size * 0.14 },
      { x: cx - size * 0.16, y: cy - size * 0.46 },
      { x: cx + size * 0.16, y: cy - size * 0.46 },
      { x: cx + size * 0.43, y: cy - size * 0.14 },
    ];
    toes.forEach(t => {
      ctx.beginPath();
      ctx.ellipse(t.x, t.y, size * 0.18, size * 0.16, 0, 0, Math.PI * 2);
      ctx.fillStyle   = padFill;
      ctx.fill();
      ctx.strokeStyle = padStroke;
      ctx.lineWidth   = size * 0.065;
      ctx.stroke();
    });

    ctx.restore();
  }

  function drawYarnBall(cx, cy, r) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.clip();

    // Base color
    const grad = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.35, 0, cx, cy, r);
    grad.addColorStop(0, "#ff9f43");
    grad.addColorStop(1, "#c0370a");
    ctx.fillStyle = grad;
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);

    // Yarn winding strokes
    ctx.strokeStyle = "rgba(255,210,100,0.55)";
    ctx.lineWidth   = r * 0.18;
    ctx.lineCap     = "round";

    ctx.beginPath();
    ctx.moveTo(cx - r, cy - r * 0.2);
    ctx.bezierCurveTo(cx - r * 0.2, cy - r, cx + r * 0.2, cy + r, cx + r, cy + r * 0.2);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(cx - r * 0.5, cy - r);
    ctx.bezierCurveTo(cx + r * 0.6, cy - r * 0.4, cx - r * 0.6, cy + r * 0.4, cx + r * 0.5, cy + r);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(cx - r, cy + r * 0.4);
    ctx.bezierCurveTo(cx - r * 0.1, cy - r * 0.2, cx + r * 0.3, cy + r * 0.5, cx + r, cy - r * 0.3);
    ctx.stroke();

    // Highlight
    ctx.beginPath();
    ctx.arc(cx - r * 0.28, cy - r * 0.3, r * 0.22, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,255,255,0.22)";
    ctx.fill();

    ctx.restore();

    // Outer border
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(120,30,0,0.5)";
    ctx.lineWidth   = r * 0.12;
    ctx.stroke();
  }

  // ─── Main draw ──────────────────────────────────────────────────────────────

  function draw() {
    if (!canvas || !ctx) return;
    const w = parseFloat(canvas.style.width);
    const h = parseFloat(canvas.style.height);

    drawTable(w, h);

    // Goal flash
    if (goalFlash > 0) {
      const alpha = (goalFlash / 50) * 0.35;
      ctx.fillStyle = goalFlashWinner === myIdx
        ? `rgba(80,255,120,${alpha})`
        : `rgba(255,80,80,${alpha})`;
      ctx.fillRect(0, 0, w, h);
      goalFlash--;
    }

    // Mouse NPC (emoji is fine for the fun NPC)
    if (renderState.mouse) {
      const mx = toX(renderState.mouse.x);
      const my = toY(renderState.mouse.y);
      ctx.font = `${toR(0.055)}px serif`;
      ctx.textAlign    = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("🐭", mx, my);
    }

    // Yarn ball
    drawYarnBall(toX(renderState.ball.x), toY(renderState.ball.y), toR(BALL_R));

    // Paddles
    for (let i = 0; i < 2; i++) {
      drawPaw(
        toX(renderState.paddles[i].x),
        toY(renderState.paddles[i].y),
        toR(PADDLE_R),
        i === myIdx
      );
    }

    // Score
    const myScore  = renderState.score[myIdx];
    const oppScore = renderState.score[1 - myIdx];
    ctx.font      = `bold ${toR(0.058)}px 'Nunito', sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "rgba(255,255,255,0.88)";
    ctx.fillText(`${oppScore}  —  ${myScore}`, w / 2, h / 2);

    ctx.font      = `bold ${toR(0.026)}px 'Nunito', sans-serif`;
    ctx.fillStyle = "rgba(255,255,255,0.42)";
    ctx.fillText(playerNames[1 - myIdx], w / 2, h / 2 - toR(0.058));
    ctx.fillText(playerNames[myIdx],     w / 2, h / 2 + toR(0.058));

    if (renderState.paused) {
      ctx.font      = `bold ${toR(0.032)}px 'Nunito', sans-serif`;
      ctx.fillStyle = "rgba(255,255,255,0.55)";
      ctx.fillText("Ready...", w / 2, h / 2 + toR(0.105));
    }

    // Reaction bar timer
    if (reactionBarTimer > 0) {
      reactionBarTimer--;
      if (reactionBarTimer === 0) {
        const rb = document.getElementById("shared-reaction-bar");
        if (rb) rb.classList.add("hidden");
      }
    }
  }

  function gameLoop() {
    if (disposed) return;
    interpolate();
    draw();
    rafId = requestAnimationFrame(gameLoop);
  }

  function onResize() { sizeCanvas(); }

  // ─── Client registry ────────────────────────────────────────────────────────

  window.gameClients = window.gameClients || {};
  window.gameClients.hockey = {
    onGameStart(data) {
      disposed      = false;
      myIdx         = data.myPlayerIndex;
      serverStates  = [];
      goalFlash     = 0;
      pointerId     = null;
      lastSendTime  = 0;
      reactionBarTimer = 0;

      // Index by actual player index so playerNames[myIdx] = my name
      playerNames[0] = data.players[0].name + (data.players[0].isAI ? " 🤖" : "");
      playerNames[1] = data.players[1].name + (data.players[1].isAI ? " 🤖" : "");

      localPaddle = myIdx === 0 ? { x: 0.5, y: 0.85 } : { x: 0.5, y: 0.15 };

      if (data.hockey) {
        renderState.ball    = { ...data.hockey.ball };
        renderState.paddles = data.hockey.paddles.map(p => ({ ...p }));
        renderState.score   = [...data.hockey.score];
        renderState.mouse   = data.hockey.mouse ? { ...data.hockey.mouse } : null;
        renderState.paused  = data.hockey.paused;
      }

      const container = document.getElementById("game-container");
      createCanvas(container);

      canvas.addEventListener("pointerdown",   onPointerDown);
      canvas.addEventListener("pointermove",   onPointerMove);
      canvas.addEventListener("pointerup",     onPointerUp);
      canvas.addEventListener("pointercancel", onPointerUp);
      window.addEventListener("resize", onResize);

      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(gameLoop);
    },

    onReconnect(data) { this.onGameStart(data); },

    cleanup() {
      disposed = true;
      if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
      if (canvas) {
        canvas.removeEventListener("pointerdown",   onPointerDown);
        canvas.removeEventListener("pointermove",   onPointerMove);
        canvas.removeEventListener("pointerup",     onPointerUp);
        canvas.removeEventListener("pointercancel", onPointerUp);
        canvas = null;
        ctx    = null;
      }
      window.removeEventListener("resize", onResize);
      // Ensure reaction bar is hidden on cleanup
      const rb = document.getElementById("shared-reaction-bar");
      if (rb) rb.classList.add("hidden");
      serverStates = [];
      pointerId    = null;
    },
  };

  // ─── Socket handlers ────────────────────────────────────────────────────────

  socket.on("hockey:state", (data) => {
    serverStates.push({ time: Date.now(), data });
    if (serverStates.length > 2) serverStates.shift();
  });

  socket.on("hockey:goal", ({ scorerIndex }) => {
    goalFlash       = 50;
    goalFlashWinner = scorerIndex;

    // Show reaction bar for 4 seconds after a goal
    const rb = document.getElementById("shared-reaction-bar");
    if (rb) {
      rb.classList.remove("hidden");
      reactionBarTimer = 240; // ~4s at 60fps
    }

    if (scorerIndex === myIdx) {
      if (sfxTone) {
        sfxTone(440, 0.15, 0.15, "triangle");
        sfxTone(554, 0.15, 0.15, "triangle", 0.08);
        sfxTone(659, 0.25, 0.2,  "triangle", 0.16);
      }
    } else {
      if (sfxTone) {
        sfxTone(400, 0.2, 0.12, "sine");
        sfxTone(300, 0.3, 0.1,  "sine", 0.1);
      }
    }
  });

  socket.on("hockey:mousehit", () => {
    if (sfxTone) {
      sfxTone(1200, 0.05, 0.12, "square");
      sfxTone(1600, 0.04, 0.08, "square", 0.03);
    }
  });
})();
