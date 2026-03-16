// public/games/ghost-client.js — Ghost Detective client
(function () {
  'use strict';

  // ── Constants (must match games/ghost.js) ────────────────────────────────
  const PLAYER_SPEED  = 180;   // px/s
  const PLAYER_R      = 14;
  const FLASH_RANGE   = 280;
  const FLASH_ANGLE   = Math.PI / 2.8;
  const BOARD_RANGE   = 90;    // px from ghost to place board
  const POS_SEND_MS   = 60;
  const T             = 32;    // tile size

  // ── Area definitions (obstacle arrays must be identical to ghost.js) ─────
  function rect(tx, ty, tw, th, type) {
    return { x: tx*T, y: ty*T, w: tw*T, h: th*T, type };
  }

  function buildGraveyardObs() {
    const o = [];
    o.push(rect(0,0,80,1,'stone'),rect(0,59,80,1,'stone'),rect(0,0,1,60,'stone'),rect(79,0,1,60,'stone'));
    o.push(rect(4,4,8,6,'stone'));
    // Group 1
    o.push(rect(14,8,1,2,'stone'),rect(18,8,1,2,'stone'),rect(22,8,1,2,'stone'));
    o.push(rect(14,13,1,2,'stone'),rect(18,13,1,2,'stone'),rect(22,13,1,2,'stone'));
    o.push(rect(26,8,1,2,'stone'),rect(26,13,1,2,'stone'));
    // Group 2
    o.push(rect(50,6,1,2,'stone'),rect(54,6,1,2,'stone'),rect(58,6,1,2,'stone'),rect(62,6,1,2,'stone'));
    o.push(rect(50,11,1,2,'stone'),rect(54,11,1,2,'stone'),rect(58,11,1,2,'stone'),rect(66,6,1,2,'stone'));
    // Group 3
    o.push(rect(10,35,1,2,'stone'),rect(14,35,1,2,'stone'),rect(18,35,1,2,'stone'));
    o.push(rect(10,40,1,2,'stone'),rect(14,40,1,2,'stone'),rect(18,40,1,2,'stone'));
    o.push(rect(22,35,1,2,'stone'),rect(22,40,1,2,'stone'));
    // Group 4
    o.push(rect(45,38,1,2,'stone'),rect(49,38,1,2,'stone'),rect(53,38,1,2,'stone'),rect(57,38,1,2,'stone'));
    o.push(rect(45,43,1,2,'stone'),rect(49,43,1,2,'stone'),rect(53,43,1,2,'stone'),rect(61,38,1,2,'stone'));
    // Group 5
    o.push(rect(30,22,1,2,'stone'),rect(34,22,1,2,'stone'),rect(38,22,1,2,'stone'),rect(42,22,1,2,'stone'));
    o.push(rect(30,27,1,2,'stone'),rect(34,27,1,2,'stone'),rect(38,27,1,2,'stone'),rect(42,27,1,2,'stone'));
    // Trees
    o.push(rect(36,5,1,3,'tree'),rect(68,12,1,3,'tree'),rect(3,25,1,3,'tree'));
    o.push(rect(70,38,1,3,'tree'),rect(28,50,1,3,'tree'),rect(60,52,1,3,'tree'));
    // Low walls
    o.push(rect(32,10,12,1,'stone'),rect(6,48,12,1,'stone'));
    o.push(rect(55,24,12,1,'stone'),rect(35,45,1,12,'stone'));
    return o;
  }

  function buildGardenObs() {
    const o = [];
    o.push(rect(0,0,100,1,'hedge'),rect(0,69,100,1,'hedge'),rect(0,0,1,70,'hedge'),rect(99,0,1,70,'hedge'));
    o.push(rect(46,31,8,8,'stone'));
    // Hedges H
    o.push(rect(10,15,12,1,'hedge'),rect(30,10,8,1,'hedge'),rect(60,18,10,1,'hedge'),rect(75,30,8,1,'hedge'));
    o.push(rect(20,45,14,1,'hedge'),rect(60,50,10,1,'hedge'),rect(38,58,8,1,'hedge'),rect(80,55,12,1,'hedge'));
    // Hedges V
    o.push(rect(25,20,1,8,'hedge'),rect(40,12,1,10,'hedge'),rect(70,25,1,8,'hedge'));
    o.push(rect(15,50,1,8,'hedge'),rect(55,35,1,8,'hedge'),rect(85,20,1,12,'hedge'),rect(35,42,1,8,'hedge'));
    // Flowers
    o.push(rect(5,5,3,3,'flower'),rect(92,5,3,3,'flower'),rect(5,62,3,3,'flower'));
    o.push(rect(92,62,3,3,'flower'),rect(20,30,3,3,'flower'),rect(74,55,3,3,'flower'));
    // Trees
    o.push(rect(3,3,2,2,'tree'),rect(95,3,2,2,'tree'),rect(3,65,2,2,'tree'));
    o.push(rect(95,65,2,2,'tree'),rect(47,3,2,2,'tree'),rect(47,65,2,2,'tree'));
    return o;
  }

  function buildHouseObs() {
    const o = [];
    o.push(rect(0,0,60,1,'stone'),rect(0,79,60,1,'stone'),rect(0,0,1,80,'stone'),rect(59,0,1,80,'stone'));
    o.push(rect(1,15,9,1,'stone'),rect(13,15,7,1,'stone'),rect(21,15,38,1,'stone'));
    o.push(rect(20,1,1,14,'stone'),rect(40,1,1,39,'stone'));
    o.push(rect(1,39,27,1,'stone'),rect(33,39,26,1,'stone'));
    o.push(rect(30,40,1,40,'stone'));
    o.push(rect(1,55,13,1,'stone'),rect(18,55,12,1,'stone'),rect(32,55,27,1,'stone'));
    o.push(rect(2,2,5,3,'wood'),rect(22,2,5,3,'wood'),rect(42,2,5,3,'wood'));
    o.push(rect(2,20,5,3,'wood'),rect(2,42,5,3,'wood'),rect(33,42,5,3,'wood'));
    return o;
  }

  const AREA_DEFS = {
    graveyard: {
      areaWidth: 2560, areaHeight: 1920, bgColor: '#1a2e1a', label: 'Graveyard',
      playerStart: { x:1280, y:960 }, obstacles: buildGraveyardObs(),
      obsColors: { stone:'#6a6a6a', tree:'#3a2510', default:'#5a5a5a' },
      pathColor: '#243524',
    },
    garden: {
      areaWidth: 3200, areaHeight: 2240, bgColor: '#2d4a1e', label: 'Garden',
      playerStart: { x:1600, y:1120 }, obstacles: buildGardenObs(),
      obsColors: { hedge:'#1a4010', flower:'#8b3a6a', tree:'#3a2510', stone:'#7a7a5a', default:'#2a5018' },
      pathColor: '#3d5a2a',
    },
    house: {
      areaWidth: 1920, areaHeight: 2560, bgColor: '#1a1510', label: 'Old House',
      playerStart: { x:960, y:640 }, obstacles: buildHouseObs(),
      obsColors: { stone:'#4a3a2a', wood:'#6b4a1a', default:'#3a2a1a' },
      pathColor: '#251c14',
    },
  };

  // ── Collision ────────────────────────────────────────────────────────────
  function isBlocked(x, y, r, obstacles) {
    for (const o of obstacles) {
      if (x+r > o.x && x-r < o.x+o.w && y+r > o.y && y-r < o.y+o.h) return true;
    }
    return false;
  }

  // ── Ouija letter positions (must match ghost.js buildLetterPositions) ────
  const LETTER_POS = (function () {
    const pos = {}, r1 = 'ABCDEFGHIJKLM', r2 = 'NOPQRSTUVWXYZ';
    r1.split('').forEach((l,i) => { pos[l] = { x: 0.07+i*0.065, y: 0.38+Math.sin(i/(r1.length-1)*Math.PI)*0.07 }; });
    r2.split('').forEach((l,i) => { pos[l] = { x: 0.07+i*0.065, y: 0.54+Math.sin(i/(r2.length-1)*Math.PI)*0.07 }; });
    return pos;
  })();

  // Personality → planchette feel
  const PCFG = {
    shy:      { stiffness: 5,  damping: 0.15, dwellMs: 1300 },
    dramatic: { stiffness: 7,  damping: 0.12, dwellMs: 1000 },
    goofy:    { stiffness: 10, damping: 0.07, dwellMs: 750  },
    grumpy:   { stiffness: 9,  damping: 0.18, dwellMs: 600  },
    regal:    { stiffness: 3,  damping: 0.22, dwellMs: 1600 },
    confused: { stiffness: 12, damping: 0.04, dwellMs: 900  },
  };

  // ── Module state ─────────────────────────────────────────────────────────
  let canvas, ctx, darkCanvas, darkCtx;
  let S = null;          // all game state (null when inactive)
  let animFrame = null;
  let lastTs = 0;
  let posSendAccum = 0;

  // Virtual joystick
  const joy = { active: false, id: null, bx: 0, by: 0, dx: 0, dy: 0, angle: 0, mag: 0 };

  // ── Canvas setup ─────────────────────────────────────────────────────────
  function setupCanvas() {
    const container = document.getElementById('game-container');
    container.innerHTML = '';
    canvas = document.createElement('canvas');
    canvas.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;touch-action:none;';
    container.style.position = 'relative';
    container.appendChild(canvas);
    ctx = canvas.getContext('2d');

    darkCanvas = document.createElement('canvas');
    darkCtx = darkCanvas.getContext('2d');

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    canvas.addEventListener('touchstart', onTouchStart, { passive: false });
    canvas.addEventListener('touchmove',  onTouchMove,  { passive: false });
    canvas.addEventListener('touchend',   onTouchEnd,   { passive: false });
    canvas.addEventListener('touchstart', onTap,        { passive: false });
    // Desktop fallback
    canvas.addEventListener('mousedown', onMouseDown);
    canvas.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('mouseup',   onMouseUp);
  }

  function resizeCanvas() {
    const c = canvas.parentElement;
    const w = c.clientWidth  || window.innerWidth;
    const h = c.clientHeight || window.innerHeight;
    canvas.width = w; canvas.height = h;
    darkCanvas.width = w; darkCanvas.height = h;
  }

  // ── Input: touch joystick ────────────────────────────────────────────────
  function onTouchStart(e) {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (t.clientX < canvas.clientWidth * 0.5 && !joy.active && !(S && S.ouija)) {
        Object.assign(joy, { active:true, id:t.identifier, bx:t.clientX, by:t.clientY, dx:0, dy:0, angle:0, mag:0 });
      }
    }
  }
  function onTouchMove(e) {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (t.identifier === joy.id) updateJoy(t.clientX - joy.bx, t.clientY - joy.by);
    }
  }
  function onTouchEnd(e) {
    for (const t of e.changedTouches) {
      if (t.identifier === joy.id) { joy.active = false; joy.mag = 0; }
    }
  }
  // Desktop fallback
  let mouseJoy = false;
  function onMouseDown(e) { if (e.clientX < canvas.clientWidth * 0.5 && !(S && S.ouija)) { mouseJoy = true; Object.assign(joy, { active:true, bx:e.clientX, by:e.clientY, dx:0, dy:0, angle:0, mag:0 }); } }
  function onMouseMove(e) { if (mouseJoy) updateJoy(e.clientX - joy.bx, e.clientY - joy.by); }
  function onMouseUp()    { mouseJoy = false; joy.active = false; joy.mag = 0; }

  function updateJoy(dx, dy) {
    const maxR = 60, dist = Math.hypot(dx, dy);
    joy.mag = Math.min(1, dist / maxR);
    joy.angle = Math.atan2(dy, dx);
    joy.dx = dx; joy.dy = dy;
  }

  // Tap handler (tool buttons, place board, ouija)
  function onTap(e) {
    e.preventDefault();
    if (!S) return;
    const t = e.changedTouches[0];
    handleTap(t.clientX, t.clientY);
  }

  function handleTap(cx, cy) {
    // Scale from CSS to canvas pixels
    const scaleX = canvas.width  / (canvas.clientWidth  || canvas.width);
    const scaleY = canvas.height / (canvas.clientHeight || canvas.height);
    const tx = cx * scaleX, ty = cy * scaleY;
    const cw = canvas.width, ch = canvas.height;

    if (S.ouija) { handleOuijaTap(tx, ty, cw, ch); return; }

    // Tool bar (bottom-center)
    const tools = ['flashlight','emf','sound'];
    const bw = 70, bh = 52, gap = 8;
    const barW = tools.length * bw + (tools.length-1) * gap;
    const barX = (cw - barW) / 2, barY = ch - bh - 10;
    tools.forEach((t, i) => {
      const bx = barX + i*(bw+gap);
      if (tx >= bx && tx <= bx+bw && ty >= barY && ty <= barY+bh) S.activeTool = t;
    });

    // Place board button
    if (S.nearGhost && !S.nearGhost.claimedBy) {
      const btnW = 160, btnH = 42;
      const btnX = (cw - btnW) / 2, btnY = ch - bh - 10 - btnH - 12;
      if (tx >= btnX && tx <= btnX+btnW && ty >= btnY && ty <= btnY+btnH) {
        socket.emit('ghost:place_board', { roomId: S.roomId, ghostId: S.nearGhost.id });
      }
    }
  }

  // ── Game loop ────────────────────────────────────────────────────────────
  function startLoop() {
    lastTs = performance.now();
    function loop(ts) {
      if (!S) return;
      const dt = Math.min((ts - lastTs) / 1000, 0.05);
      lastTs = ts;
      update(dt);
      render();
      animFrame = requestAnimationFrame(loop);
    }
    animFrame = requestAnimationFrame(loop);
  }

  function update(dt) {
    if (!S || S.ouija) return;
    const area = AREA_DEFS[S.area];
    if (!area) return;

    // Move player
    if (joy.active && joy.mag > 0.05) {
      const spd = PLAYER_SPEED * Math.min(1, joy.mag);
      let nx = S.me.x + Math.cos(joy.angle) * spd * dt;
      let ny = S.me.y + Math.sin(joy.angle) * spd * dt;
      if (!isBlocked(nx, S.me.y, PLAYER_R, area.obstacles)) S.me.x = nx;
      if (!isBlocked(S.me.x, ny, PLAYER_R, area.obstacles)) S.me.y = ny;
      S.me.x = Math.max(PLAYER_R, Math.min(area.areaWidth  - PLAYER_R, S.me.x));
      S.me.y = Math.max(PLAYER_R, Math.min(area.areaHeight - PLAYER_R, S.me.y));
      S.me.facing = joy.angle;
    }

    // Camera (smooth follow)
    const cw = canvas.width, ch = canvas.height;
    const tx = S.me.x - cw/2, ty = S.me.y - ch/2;
    if (!S.cam) S.cam = { x: tx, y: ty };
    S.cam.x += (tx - S.cam.x) * 0.12;
    S.cam.y += (ty - S.cam.y) * 0.12;
    S.cam.x = Math.max(0, Math.min(area.areaWidth  - cw, S.cam.x));
    S.cam.y = Math.max(0, Math.min(area.areaHeight - ch, S.cam.y));

    // Find nearest found ghost for "Place Board" button
    S.nearGhost = null;
    let nearDist = Infinity;
    for (const gh of Object.values(S.ghosts)) {
      if (!gh.found || gh.identified) continue;
      const d = Math.hypot(gh.x - S.me.x, gh.y - S.me.y);
      if (d < BOARD_RANGE && d < nearDist) { S.nearGhost = gh; nearDist = d; }
    }

    // Send position
    posSendAccum += dt * 1000;
    if (posSendAccum >= POS_SEND_MS) {
      posSendAccum = 0;
      socket.emit('ghost:move', { roomId: S.roomId, x: S.me.x, y: S.me.y, facing: S.me.facing });
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────
  function render() {
    if (!S || !canvas) return;
    const cw = canvas.width, ch = canvas.height;

    if (S.ouija) { renderOuija(cw, ch); return; }

    ctx.clearRect(0, 0, cw, ch);
    if (!S.cam) S.cam = { x: S.me.x - cw/2, y: S.me.y - ch/2 };

    ctx.save();
    ctx.translate(-Math.round(S.cam.x), -Math.round(S.cam.y));
    drawWorld();
    drawEntities();
    ctx.restore();

    applyDarkness(cw, ch);
    drawHUD(cw, ch);
    drawJoystick(cw, ch);
    if (S.reveal) drawReveal(cw, ch);
  }

  function drawWorld() {
    const area = AREA_DEFS[S.area];
    ctx.fillStyle = area.bgColor;
    ctx.fillRect(0, 0, area.areaWidth, area.areaHeight);

    // Simple path-color border region (cosmetic)
    ctx.fillStyle = area.pathColor;
    ctx.fillRect(32, 32, area.areaWidth-64, area.areaHeight-64);
    ctx.fillStyle = area.bgColor;
    ctx.fillRect(64, 64, area.areaWidth-128, area.areaHeight-128);

    for (const ob of area.obstacles) {
      const color = (area.obsColors || {})[ob.type] || (area.obsColors || {}).default || '#5a5a5a';
      ctx.fillStyle = color;
      ctx.fillRect(ob.x, ob.y, ob.w, ob.h);
      // Top edge highlight
      ctx.fillStyle = 'rgba(255,255,255,0.1)';
      ctx.fillRect(ob.x, ob.y, ob.w, 2);
    }
  }

  function drawEntities() {
    const now = Date.now();

    // Found ghosts
    for (const gh of Object.values(S.ghosts)) {
      if (!gh.found || gh.identified) continue;
      const pulse = 0.6 + 0.4 * Math.sin(now * 0.003 + gh.id * 1.8);
      const glow  = ctx.createRadialGradient(gh.x, gh.y, 0, gh.x, gh.y, 44);
      glow.addColorStop(0, gh.color + 'bb');
      glow.addColorStop(1, gh.color + '00');
      ctx.fillStyle = glow;
      ctx.beginPath(); ctx.arc(gh.x, gh.y, 44, 0, Math.PI*2); ctx.fill();

      // Body
      const by = gh.y - 6 + Math.sin(now*0.002+gh.id)*4;
      ctx.fillStyle = gh.color + 'ee';
      ctx.beginPath(); ctx.arc(gh.x, by-10, 16+pulse*3, 0, Math.PI*2); ctx.fill();
      ctx.fillRect(gh.x-16, by-10, 32, 22);
      // Wavy hem
      ctx.beginPath(); ctx.moveTo(gh.x-16, by+12);
      for (let i=0;i<4;i++) ctx.quadraticCurveTo(gh.x-12+i*8, by+20+(i%2?5:-5), gh.x-8+i*8, by+12);
      ctx.fill();
      // Eyes
      ctx.fillStyle = 'rgba(0,0,0,0.75)';
      ctx.beginPath(); ctx.arc(gh.x-5, by-11, 3, 0, Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.arc(gh.x+5, by-11, 3, 0, Math.PI*2); ctx.fill();

      // Name-length dots
      const nl = gh.nameLength, dotX = gh.x - nl*5;
      for (let i=0;i<nl;i++) {
        ctx.fillStyle = 'rgba(255,255,255,0.55)';
        ctx.beginPath(); ctx.arc(dotX + i*10, gh.y+32, 3, 0, Math.PI*2); ctx.fill();
      }
    }

    // Other players
    const pColors = ['#60a5fa','#f97316','#a855f7','#10b981'];
    for (const [piStr, p] of Object.entries(S.otherPlayers)) {
      const col = pColors[parseInt(piStr) % pColors.length];
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.arc(p.x, p.y, PLAYER_R, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = 'white';
      ctx.beginPath(); ctx.arc(p.x+Math.cos(p.facing||0)*(PLAYER_R+5), p.y+Math.sin(p.facing||0)*(PLAYER_R+5), 4, 0, Math.PI*2); ctx.fill();
    }

    // Player (self)
    ctx.fillStyle = '#22c55e';
    ctx.beginPath(); ctx.arc(S.me.x, S.me.y, PLAYER_R, 0, Math.PI*2); ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = 'white';
    ctx.beginPath();
    ctx.arc(S.me.x+Math.cos(S.me.facing)*(PLAYER_R+6), S.me.y+Math.sin(S.me.facing)*(PLAYER_R+6), 4, 0, Math.PI*2);
    ctx.fill();
  }

  function applyDarkness(cw, ch) {
    const dc = darkCtx;
    dc.clearRect(0, 0, cw, ch);
    dc.fillStyle = 'rgba(0,0,0,0.87)';
    dc.fillRect(0, 0, cw, ch);

    const sx = Math.round(S.me.x - S.cam.x);
    const sy = Math.round(S.me.y - S.cam.y);

    dc.globalCompositeOperation = 'destination-out';

    // Flashlight cone
    if (S.activeTool === 'flashlight') {
      const grad = dc.createRadialGradient(sx, sy, 0, sx, sy, FLASH_RANGE);
      grad.addColorStop(0,   'rgba(255,255,255,1)');
      grad.addColorStop(0.5, 'rgba(255,255,255,0.9)');
      grad.addColorStop(1,   'rgba(255,255,255,0)');
      dc.fillStyle = grad;
      dc.beginPath();
      dc.moveTo(sx, sy);
      dc.arc(sx, sy, FLASH_RANGE, S.me.facing - FLASH_ANGLE, S.me.facing + FLASH_ANGLE);
      dc.closePath();
      dc.fill();
    }

    // EMF — radial glow tinted green
    if (S.activeTool === 'emf') {
      const emfSig = S.signals.emf / 100;
      if (emfSig > 0.05) {
        const r = 60 + emfSig * 120;
        const g = dc.createRadialGradient(sx, sy, 0, sx, sy, r);
        g.addColorStop(0, `rgba(255,255,255,${0.4 + emfSig*0.4})`);
        g.addColorStop(1, 'rgba(255,255,255,0)');
        dc.fillStyle = g;
        dc.beginPath(); dc.arc(sx, sy, r, 0, Math.PI*2); dc.fill();
      }
    }

    // Sound — wider ambient
    if (S.activeTool === 'sound') {
      const sndSig = S.signals.sound / 100;
      const r = 50 + sndSig * 160;
      const g = dc.createRadialGradient(sx, sy, 0, sx, sy, r);
      g.addColorStop(0, `rgba(255,255,255,${0.3 + sndSig*0.35})`);
      g.addColorStop(1, 'rgba(255,255,255,0)');
      dc.fillStyle = g;
      dc.beginPath(); dc.arc(sx, sy, r, 0, Math.PI*2); dc.fill();
    }

    // Ambient ring always present
    const ag = dc.createRadialGradient(sx, sy, 0, sx, sy, 48);
    ag.addColorStop(0, 'rgba(255,255,255,0.45)');
    ag.addColorStop(1, 'rgba(255,255,255,0)');
    dc.fillStyle = ag;
    dc.beginPath(); dc.arc(sx, sy, 48, 0, Math.PI*2); dc.fill();

    dc.globalCompositeOperation = 'source-over';
    ctx.drawImage(darkCanvas, 0, 0);
  }

  function drawHUD(cw, ch) {
    const tools = ['flashlight','emf','sound'];
    const icons = { flashlight:'🔦', emf:'📡', sound:'🎙️' };
    const bw = 70, bh = 52, gap = 8;
    const barW = tools.length*bw + (tools.length-1)*gap;
    const barX = (cw - barW) / 2, barY = ch - bh - 10;

    // Tool buttons
    tools.forEach((t, i) => {
      const bx = barX + i*(bw+gap);
      const active = S.activeTool === t;
      ctx.fillStyle = active ? 'rgba(96,165,250,0.85)' : 'rgba(20,20,30,0.78)';
      rrect(ctx, bx, barY, bw, bh, 10); ctx.fill();
      if (active) { ctx.strokeStyle = '#60a5fa'; ctx.lineWidth = 2; rrect(ctx, bx, barY, bw, bh, 10); ctx.stroke(); }
      ctx.font = '22px serif'; ctx.textAlign = 'center';
      ctx.fillText(icons[t], bx+bw/2, barY+26);
      // Signal bar
      const sig = S.signals[t] || 0;
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.fillRect(bx+6, barY+bh-9, bw-12, 4);
      ctx.fillStyle = sig > 70 ? '#ef4444' : sig > 40 ? '#f97316' : sig > 15 ? '#eab308' : '#4ade80';
      ctx.fillRect(bx+6, barY+bh-9, (bw-12)*(sig/100), 4);
    });

    // Ghost progress
    ctx.fillStyle = 'rgba(0,0,0,0.55)'; rrect(ctx, 10, 10, 110, 32, 8); ctx.fill();
    ctx.fillStyle = '#e2e8f0'; ctx.font = '13px monospace'; ctx.textAlign = 'left';
    ctx.fillText(`👻 ${S.identified}/${S.totalGhosts}`, 20, 31);

    // Area label
    ctx.fillStyle = 'rgba(0,0,0,0.55)'; rrect(ctx, cw/2-70, 10, 140, 30, 8); ctx.fill();
    ctx.fillStyle = '#cbd5e1'; ctx.font = '13px monospace'; ctx.textAlign = 'center';
    ctx.fillText(AREA_DEFS[S.area]?.label || '', cw/2, 30);

    // Place Board button
    if (S.nearGhost && !S.nearGhost.claimedBy) {
      const btnW = 160, btnH = 42;
      const btnX = (cw - btnW) / 2, btnY = barY - btnH - 12;
      ctx.fillStyle = 'rgba(140,70,220,0.9)'; rrect(ctx, btnX, btnY, btnW, btnH, 12); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.font = 'bold 14px monospace'; ctx.textAlign = 'center';
      ctx.fillText('✦ Place Board', cw/2, btnY + 27);
    }

    // Wrong name flash
    if (S.wrongFlash > 0) {
      ctx.fillStyle = `rgba(239,68,68,${S.wrongFlash * 0.4})`;
      ctx.fillRect(0, 0, cw, ch);
      S.wrongFlash = Math.max(0, S.wrongFlash - 0.05);
    }

    // Wrong-guess message
    if (S.attemptsMsg) {
      const msgW = 230, msgH = 34;
      const msgX = (cw - msgW) / 2, msgY = ch / 2 - 60;
      ctx.fillStyle = 'rgba(0,0,0,0.75)';
      rrect(ctx, msgX, msgY, msgW, msgH, 8); ctx.fill();
      ctx.strokeStyle = '#ef4444'; ctx.lineWidth = 1.5;
      rrect(ctx, msgX, msgY, msgW, msgH, 8); ctx.stroke();
      ctx.fillStyle = '#fca5a5'; ctx.font = 'bold 13px monospace'; ctx.textAlign = 'center';
      ctx.fillText(S.attemptsMsg, cw / 2, msgY + 22);
    }

    ctx.textAlign = 'left';
  }

  function drawJoystick(cw, ch) {
    if (!joy.active) return;
    const scale = canvas.width / (canvas.clientWidth || canvas.width);
    const bx = joy.bx * scale, by = joy.by * scale;
    const dx = joy.dx * scale, dy = joy.dy * scale;
    const maxR = 60 * scale;
    const dist = Math.hypot(dx, dy);
    const kx = bx + (dist > 0 ? (dx/dist)*Math.min(dist,maxR) : 0);
    const ky = by + (dist > 0 ? (dy/dist)*Math.min(dist,maxR) : 0);

    ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(bx, by, maxR, 0, Math.PI*2); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.beginPath(); ctx.arc(kx, ky, 18*scale, 0, Math.PI*2); ctx.fill();
  }

  // ── Ouija board ──────────────────────────────────────────────────────────
  function openOuija(ghostId, sequence, timeLimit, personality) {
    const pcfg = PCFG[personality] || PCFG.confused;
    S.ouija = {
      ghostId, sequence, personality, pcfg,
      seqIdx: 0,
      planchette: { x: 0.5, y: 0.5, vx: 0, vy: 0 },
      dwellTimer: 0,
      collected: [],
      timeLeft: timeLimit,
      phase: 'playing',   // 'playing' | 'submitting'
      submitName: '',
      alpha: 0,
    };
  }

  function closeOuija(reason) {
    if (!S || !S.ouija) return;
    if (reason === 'cancel' || reason === 'timeout') {
      socket.emit('ghost:close_board', { roomId: S.roomId, ghostId: S.ouija.ghostId });
    }
    S.ouija = null;
  }

  function renderOuija(cw, ch) {
    const ou = S.ouija;
    ou.alpha = Math.min(1, ou.alpha + 0.06);
    ctx.save();
    ctx.globalAlpha = ou.alpha;

    // Backdrop
    ctx.fillStyle = 'rgba(0,0,0,0.88)'; ctx.fillRect(0, 0, cw, ch);

    // Board
    const margin = 16;
    const bw = Math.min(cw - margin*2, 380);
    const bh = Math.min(ch - 140, 520);
    const bx = (cw - bw) / 2, by = (ch - bh) / 2 + 20;

    const wg = ctx.createLinearGradient(bx, by, bx, by+bh);
    wg.addColorStop(0, '#5a3a0e'); wg.addColorStop(0.5, '#4a2e08'); wg.addColorStop(1, '#3a2004');
    ctx.fillStyle = wg; rrect(ctx, bx, by, bw, bh, 16); ctx.fill();
    ctx.strokeStyle = '#9b7a28'; ctx.lineWidth = 3; rrect(ctx, bx, by, bw, bh, 16); ctx.stroke();
    ctx.strokeStyle = 'rgba(155,122,40,0.4)'; ctx.lineWidth = 1;
    rrect(ctx, bx+8, by+8, bw-16, bh-16, 11); ctx.stroke();

    // Helpers to convert normalized board coords
    const bpt = (nx, ny) => [bx + nx*bw, by + ny*bh];

    // YES / NO
    ctx.font = `bold ${Math.round(bw*0.055)}px Georgia,serif`;
    ctx.fillStyle = '#d4a840'; ctx.textAlign = 'center';
    ctx.fillText('YES', ...bpt(0.18, 0.13));
    ctx.fillText('NO',  ...bpt(0.82, 0.13));

    // Title
    ctx.font = `italic ${Math.round(bw*0.07)}px Georgia,serif`;
    ctx.fillStyle = '#c9a050';
    ctx.fillText('OUIJA', bx+bw/2, by+bh*0.07);

    // Letters
    ctx.font = `bold ${Math.round(bw*0.048)}px monospace`;
    ctx.fillStyle = '#d4a840';
    const pp = ou.planchette;
    for (const [l, lp] of Object.entries(LETTER_POS)) {
      const [lx, ly] = bpt(lp.x+0.02, lp.y);
      const near = Math.hypot(pp.x - lp.x, pp.y - lp.y) < 0.055;
      if (near) {
        ctx.save();
        ctx.fillStyle = 'rgba(255,200,60,0.28)';
        ctx.beginPath(); ctx.arc(lx, ly-2, 16, 0, Math.PI*2); ctx.fill();
        ctx.restore();
        ctx.fillStyle = '#fff3a0';
      } else {
        ctx.fillStyle = '#d4a840';
      }
      ctx.fillText(l, lx, ly+5);
    }

    // GOODBYE
    ctx.font = `italic ${Math.round(bw*0.05)}px Georgia,serif`;
    ctx.fillStyle = '#c9a050';
    ctx.fillText('GOODBYE', bx+bw/2, by+bh*0.89);

    // Planchette
    const [plx, ply] = bpt(pp.x, pp.y);
    ctx.save();
    ctx.translate(plx, ply);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath(); ctx.ellipse(3, 3, 22, 15, 0, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#d4a030'; ctx.strokeStyle = '#8B6010'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(0, 0, 21, 14, 0, 0, Math.PI*2); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = '#5a3a08'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(0, -1, 7, 0, Math.PI*2); ctx.stroke();
    ctx.restore();

    // Collected letters (above board)
    if (ou.collected.length > 0) {
      const lstr = ou.collected.join(' ');
      ctx.fillStyle = 'rgba(0,0,0,0.65)';
      ctx.fillRect(bx, by-50, bw, 40);
      ctx.fillStyle = '#e0d5ff';
      const fs = Math.min(22, Math.floor(bw / (ou.collected.length * 1.5 + 2)));
      ctx.font = `bold ${fs}px monospace`;
      ctx.fillText(lstr, bx+bw/2, by-22);
    }

    // Timer + blank slots (below board)
    const tColor = ou.timeLeft < 8 ? '#ef4444' : '#e2e8f0';
    ctx.fillStyle = tColor; ctx.font = '15px monospace';
    ctx.fillText(`⏱ ${ou.timeLeft}s`, bx+bw/2, by+bh+22);
    const gh = S.ghosts[ou.ghostId];
    if (gh) {
      ctx.fillStyle = 'rgba(160,130,255,0.8)'; ctx.font = '13px monospace';
      ctx.fillText('_ '.repeat(gh.nameLength).trim(), bx+bw/2, by+bh+44);
    }

    // Submit phase overlay
    if (ou.phase === 'submitting') {
      const ow = bw-40, oh = 120;
      const ox = bx+20, oy = by+bh/2-60;
      ctx.fillStyle = 'rgba(0,0,0,0.75)'; rrect(ctx, ox, oy, ow, oh, 12); ctx.fill();
      ctx.strokeStyle = '#8060d0'; ctx.lineWidth = 2; rrect(ctx, ox, oy, ow, oh, 12); ctx.stroke();
      ctx.fillStyle = '#d0c8ff'; ctx.font = '13px monospace';
      ctx.fillText('Name revealed:', bx+bw/2, oy+28);
      ctx.fillStyle = '#d4a840'; ctx.font = `bold 22px monospace`;
      ctx.fillText(ou.submitName, bx+bw/2, oy+60);
      ctx.fillStyle = 'rgba(90,40,180,0.9)'; rrect(ctx, bx+bw/2-70, oy+78, 140, 36, 10); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.font = 'bold 15px monospace';
      ctx.fillText('Identify!', bx+bw/2, oy+102);
    }

    // Cancel button
    ctx.fillStyle = 'rgba(60,20,20,0.85)'; rrect(ctx, bx+bw-58, by-42, 50, 28, 8); ctx.fill();
    ctx.fillStyle = '#ff9090'; ctx.font = '12px monospace';
    ctx.fillText('✕ Exit', bx+bw-33, by-22);

    ctx.globalAlpha = 1;
    ctx.restore();

    // Animate planchette
    if (ou.phase === 'playing') stepOuijaPlanchette(1/60);
  }

  function stepOuijaPlanchette(dt) {
    const ou = S.ouija;
    if (ou.seqIdx >= ou.sequence.length) { ou.phase = 'submitting'; ou.submitName = ou.collected.join(''); return; }

    const target = ou.sequence[ou.seqIdx];
    const p = ou.planchette, c = ou.pcfg;
    const fx = (target.targetX - p.x) * c.stiffness;
    const fy = (target.targetY - p.y) * c.stiffness;
    p.vx = p.vx * (1 - c.damping) + fx * dt;
    p.vy = p.vy * (1 - c.damping) + fy * dt;
    if (ou.personality === 'confused') { p.vx += (Math.random()-0.5)*0.04; p.vy += (Math.random()-0.5)*0.04; }
    p.x += p.vx; p.y += p.vy;
    p.x = Math.max(0.04, Math.min(0.96, p.x));
    p.y = Math.max(0.08, Math.min(0.92, p.y));

    const d = Math.hypot(p.x - target.targetX, p.y - target.targetY);
    if (d < 0.035) {
      ou.dwellTimer += dt * 1000;
      if (ou.dwellTimer >= c.dwellMs) {
        if (target.isReal) {
          ou.collected.push(target.letter);
          if (navigator.vibrate) navigator.vibrate([70, 30, 70]);
        } else {
          if (navigator.vibrate) navigator.vibrate([15]);
        }
        ou.dwellTimer = 0;
        ou.seqIdx++;
        p.vx = (Math.random()-0.5)*0.4; p.vy = (Math.random()-0.5)*0.4;
      }
    } else {
      ou.dwellTimer = Math.max(0, ou.dwellTimer - dt*600);
      if (target.isReal && d < 0.08 && navigator.vibrate) navigator.vibrate([8]);
    }
  }

  function handleOuijaTap(tx, ty, cw, ch) {
    const ou = S.ouija;
    const margin = 16;
    const bw = Math.min(cw - margin*2, 380);
    const bh = Math.min(ch - 140, 520);
    const bx = (cw - bw) / 2, by = (ch - bh) / 2 + 20;

    // Cancel
    if (tx >= bx+bw-58 && tx <= bx+bw-8 && ty >= by-42 && ty <= by-14) {
      closeOuija('cancel'); return;
    }
    // Submit
    if (ou.phase === 'submitting') {
      const sx = bx+bw/2, sy = by+bh/2+18;
      if (tx >= sx-70 && tx <= sx+70 && ty >= sy && ty <= sy+36) {
        socket.emit('ghost:submit_name', { roomId: S.roomId, ghostId: ou.ghostId, name: ou.submitName });
        closeOuija('submit');
      }
    }
  }

  // ── Ghost reveal animation ────────────────────────────────────────────────
  function showReveal(name, personality, color, description, byMe) {
    S.reveal = { name, personality, color, description, byMe, start: Date.now() };
    setTimeout(() => { if (S) S.reveal = null; }, 4500);
  }

  function drawReveal(cw, ch) {
    const rv = S.reveal;
    const t = Date.now() - rv.start;
    const alpha = t < 300 ? t/300 : t > 3800 ? Math.max(0,1-(t-3800)/700) : 1;
    ctx.save(); ctx.globalAlpha = alpha;
    ctx.fillStyle = 'rgba(0,0,0,0.65)'; ctx.fillRect(0,0,cw,ch);
    const crdW = Math.min(cw-40, 290), crdH = 210;
    const crdX = (cw-crdW)/2, crdY = ch/2-crdH/2-20;
    ctx.fillStyle = rv.color+'cc'; rrect(ctx, crdX, crdY, crdW, crdH, 18); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 2; rrect(ctx, crdX, crdY, crdW, crdH, 18); ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center';
    ctx.font = '28px serif'; ctx.fillText('👻', crdX+crdW/2, crdY+46);
    ctx.font = 'bold 20px Georgia,serif'; ctx.fillText(rv.name, crdX+crdW/2, crdY+76);
    ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.font = '11px monospace';
    ctx.fillText(rv.personality.toUpperCase(), crdX+crdW/2, crdY+96);
    ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.font = '12px sans-serif';
    wrapText(rv.description, crdX+crdW/2, crdY+116, crdW-24, 17);
    if (rv.byMe) { ctx.fillStyle = '#fbbf24'; ctx.font = 'bold 13px monospace'; ctx.fillText('✓ You found this ghost!', crdX+crdW/2, crdY+crdH-14); }
    ctx.globalAlpha = 1; ctx.restore();
  }

  function wrapText(text, cx, y, maxW, lineH) {
    const words = text.split(' '); let line = '';
    words.forEach(w => {
      const test = line ? line+' '+w : w;
      if (ctx.measureText(test).width > maxW && line) {
        ctx.fillText(line, cx, y); line = w; y += lineH;
      } else line = test;
    });
    if (line) ctx.fillText(line, cx, y);
  }

  // ── Helpers ──────────────────────────────────────────────────────────────
  function rrect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x+r,y); ctx.lineTo(x+w-r,y); ctx.quadraticCurveTo(x+w,y,x+w,y+r);
    ctx.lineTo(x+w,y+h-r); ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h);
    ctx.lineTo(x+r,y+h); ctx.quadraticCurveTo(x,y+h,x,y+h-r);
    ctx.lineTo(x,y+r); ctx.quadraticCurveTo(x,y,x+r,y); ctx.closePath();
  }

  // ── Socket listeners ─────────────────────────────────────────────────────
  function bindSocketEvents() {
    socket.on('ghost:signals', ({ signals }) => {
      if (!S) return;
      let emf = 0, sound = 0, flashlight = 0;
      for (const sig of signals) {
        emf       = Math.max(emf,       sig.emf       * 100);
        sound     = Math.max(sound,     sig.sound     * 100);
        flashlight = Math.max(flashlight, sig.flashlight * 100);
      }
      S.signals = { emf: Math.round(emf), sound: Math.round(sound), flashlight: Math.round(flashlight) };
    });

    socket.on('ghost:found', ({ ghostId, x, y, personality, color, nameLength }) => {
      if (!S) return;
      S.ghosts[ghostId] = { id:ghostId, x, y, personality, color, nameLength, found:true, identified:false };
      if (navigator.vibrate) navigator.vibrate([60,25,60,25,60]);
    });

    socket.on('ghost:position', ({ ghostId, x, y }) => {
      if (!S || !S.ghosts[ghostId]) return;
      S.ghosts[ghostId].x = x; S.ghosts[ghostId].y = y;
    });

    socket.on('ghost:player_pos', ({ playerIndex, x, y }) => {
      if (!S) return;
      if (!S.otherPlayers[playerIndex]) S.otherPlayers[playerIndex] = { x, y, facing:0 };
      S.otherPlayers[playerIndex].x = x; S.otherPlayers[playerIndex].y = y;
    });

    socket.on('ghost:ouija_start', ({ ghostId, sequence, timeLimit, personality }) => {
      if (!S) return;
      openOuija(ghostId, sequence, timeLimit, personality);
    });

    socket.on('ghost:ouija_tick', ({ timeLeft }) => {
      if (S && S.ouija) S.ouija.timeLeft = timeLeft;
    });

    socket.on('ghost:ouija_timeout', ({ ghostId }) => {
      if (S && S.ouija && S.ouija.ghostId === ghostId) closeOuija('timeout');
    });

    socket.on('ghost:identified', ({ ghostId, name, personality, color, description, identifiedBy }) => {
      if (!S) return;
      if (S.ghosts[ghostId]) { S.ghosts[ghostId].identified = true; S.ghosts[ghostId].claimedBy = false; }
      S.identified++;
      showReveal(name, personality, color, description, identifiedBy === S.myPlayerIndex);
    });

    socket.on('ghost:wrong_name', ({ ghostId, attemptsLeft }) => {
      if (!S) return;
      S.wrongFlash = 1.0;
      S.attemptsMsg = attemptsLeft > 0
        ? `Wrong! ${attemptsLeft} guess${attemptsLeft !== 1 ? 'es' : ''} left`
        : 'Ghost escapes permanently!';
      clearTimeout(S.attemptsMsgTimer);
      S.attemptsMsgTimer = setTimeout(() => { if (S) S.attemptsMsg = null; }, 2500);
    });

    socket.on('ghost:claimed', ({ ghostId }) => {
      if (!S || !S.ghosts[ghostId]) return;
      S.ghosts[ghostId].claimedBy = true;
    });

    socket.on('ghost:released', ({ ghostId }) => {
      if (!S || !S.ghosts[ghostId]) return;
      S.ghosts[ghostId].claimedBy = false;
    });
  }

  function unbindSocketEvents() {
    ['ghost:signals','ghost:found','ghost:position','ghost:player_pos',
     'ghost:ouija_start','ghost:ouija_tick','ghost:ouija_timeout',
     'ghost:identified','ghost:wrong_name','ghost:claimed','ghost:released'].forEach(ev => socket.off(ev));
  }

  // ── Init / cleanup ────────────────────────────────────────────────────────
  function init(data) {
    const gd = data.ghost || {};
    const area = AREA_DEFS[gd.area] || AREA_DEFS.graveyard;
    const start = gd.playerStart || area.playerStart;

    cleanup();
    setupCanvas();

    S = {
      roomId:       data.roomId,
      myPlayerIndex: data.myPlayerIndex,
      area:         gd.area || 'graveyard',
      me:           { x: start.x, y: start.y, facing: 0 },
      cam:          null,
      ghosts:       {},
      otherPlayers: {},
      activeTool:   'flashlight',
      signals:      { emf: 0, sound: 0, flashlight: 0 },
      ouija:        null,
      reveal:       null,
      nearGhost:    null,
      identified:   gd.identified || 0,
      totalGhosts:  gd.ghostCount || 3,
      wrongFlash:   0,
      attemptsMsg:  null,
      attemptsMsgTimer: null,
    };

    // Restore found ghosts from reconnect data
    if (gd.foundGhosts) {
      for (const g of gd.foundGhosts) {
        S.ghosts[g.id] = { ...g, found: true };
      }
    }

    bindSocketEvents();
    startLoop();
  }

  function cleanup() {
    if (animFrame) { cancelAnimationFrame(animFrame); animFrame = null; }
    if (S) { clearTimeout(S.attemptsMsgTimer); S.ouija = null; }
    unbindSocketEvents();
    window.removeEventListener('resize', resizeCanvas);
    if (canvas) {
      canvas.removeEventListener('touchstart', onTouchStart);
      canvas.removeEventListener('touchmove',  onTouchMove);
      canvas.removeEventListener('touchend',   onTouchEnd);
      canvas.removeEventListener('touchstart', onTap);
      canvas.removeEventListener('mousedown',  onMouseDown);
      canvas.removeEventListener('mousemove',  onMouseMove);
      canvas.removeEventListener('mouseup',    onMouseUp);
    }
    S = null;
  }

  // ── Register ──────────────────────────────────────────────────────────────
  window.gameClients = window.gameClients || {};
  window.gameClients.ghost = {
    onGameStart(data) { init(data); },
    onReconnect(data) { init(data); },
    cleanup()         { cleanup(); },
  };
})();
