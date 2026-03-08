/* public/games/mancala-client.js — Mancala with cherry blossoms, blueberries & strawberries */
(function () {
  'use strict';

  // ── State ──────────────────────────────────────────────────────────────────
  let canvas, ctx, myIdx = 0;
  let pits = new Array(14).fill(0);
  let currentPlayer = 0;
  let lastMove = null;
  let lastMoveTime = 0;
  let playerNames = ['You', 'Opponent'];
  let disposed = false;
  let rafId = null;
  let layout = null;
  let _cssW = 0, _cssH = 0; // stored from sizeCanvas; used in computeLayout (clientWidth is 0 when screen is hidden)

  const FRUITS = ['🌸', '🫐', '🍓'];
  const HIGHLIGHT_MS = 1400;

  // ── Audio ──────────────────────────────────────────────────────────────────
  function sfxTone(freq, dur, type = 'sine', vol = 0.15) {
    try {
      const ac = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.connect(gain); gain.connect(ac.destination);
      osc.type = type; osc.frequency.value = freq;
      gain.gain.setValueAtTime(vol, ac.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + dur);
      osc.start(); osc.stop(ac.currentTime + dur);
    } catch (e) {}
  }

  function sfxPlace()     { sfxTone(420, 0.07, 'triangle', 0.14); }
  function sfxCapture()   { sfxTone(660, 0.14, 'square',   0.10); setTimeout(() => sfxTone(880, 0.10, 'square', 0.08), 100); }
  function sfxExtraTurn() { sfxTone(880, 0.08, 'sine', 0.13); setTimeout(() => sfxTone(1100, 0.08, 'sine', 0.11), 100); }
  function sfxEnd()       { [350, 500, 680].forEach((f, i) => setTimeout(() => sfxTone(f, 0.22, 'sine', 0.12), i * 140)); }

  // ── Canvas Setup ───────────────────────────────────────────────────────────
  function initCanvas() {
    const container = document.getElementById('game-container');
    canvas = document.createElement('canvas');
    canvas.className = 'mancala-canvas';
    container.appendChild(canvas);
    ctx = canvas.getContext('2d');
    sizeCanvas();
  }

  function sizeCanvas() {
    if (!canvas) return;
    const pad = 32;
    let w = window.innerWidth - pad;
    let h = w * (4 / 3);
    if (h > window.innerHeight - pad) { h = window.innerHeight - pad; w = h * (3 / 4); }
    w = Math.floor(w); h = Math.floor(h);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width  = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width  = w + 'px';
    canvas.style.height = h + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    _cssW = w; _cssH = h;
    computeLayout();
  }

  // ── Layout ─────────────────────────────────────────────────────────────────
  function computeLayout() {
    const W = _cssW, H = _cssH;
    if (!W || !H) { layout = null; return; }

    const bx = W * 0.01, bw = W * 0.98;
    const by = H * 0.17, bh = H * 0.62;
    const boardR = bh * 0.08;

    const storeW   = bw * 0.135;
    const pitAreaX = bx + storeW;
    const pitAreaW = bw - 2 * storeW;
    const pitSpacing = pitAreaW / 6;
    const pitR    = Math.min(pitSpacing * 0.43, bh * 0.22);
    const pitHitR = Math.max(pitR * 1.35, 24);

    const topRowCY = by + bh * 0.27;
    const botRowCY = by + bh * 0.73;
    const storeCY  = by + bh * 0.5;
    const storeRx  = storeW * 0.36;
    const storeRy  = bh * 0.37;
    const leftCX   = bx + storeW * 0.5;
    const rightCX  = bx + bw - storeW * 0.5;

    // Pit descriptors from viewer's perspective (my pits always at bottom)
    const pitDescs = [];
    if (myIdx === 0) {
      for (let k = 0; k < 6; k++)
        pitDescs.push({ idx: k,    cx: pitAreaX + k * pitSpacing + pitSpacing / 2, cy: botRowCY });
      for (let k = 0; k < 6; k++)
        pitDescs.push({ idx: 12-k, cx: pitAreaX + k * pitSpacing + pitSpacing / 2, cy: topRowCY });
      pitDescs.push({ idx: 13, cx: leftCX,  cy: storeCY, isStore: true, isMine: false });
      pitDescs.push({ idx: 6,  cx: rightCX, cy: storeCY, isStore: true, isMine: true  });
    } else {
      for (let k = 0; k < 6; k++)
        pitDescs.push({ idx: 7+k,  cx: pitAreaX + k * pitSpacing + pitSpacing / 2, cy: botRowCY });
      for (let k = 0; k < 6; k++)
        pitDescs.push({ idx: 5-k,  cx: pitAreaX + k * pitSpacing + pitSpacing / 2, cy: topRowCY });
      pitDescs.push({ idx: 6,  cx: leftCX,  cy: storeCY, isStore: true, isMine: false });
      pitDescs.push({ idx: 13, cx: rightCX, cy: storeCY, isStore: true, isMine: true  });
    }

    layout = {
      W, H, bx, bw, by, bh, boardR,
      storeW, pitAreaX, pitAreaW, pitSpacing, pitR, pitHitR,
      topRowCY, botRowCY, storeCY, storeRx, storeRy, leftCX, rightCX,
      pitDescs,
    };
  }

  // ── Render Loop ────────────────────────────────────────────────────────────
  function render() {
    if (disposed || !canvas) return;
    // layout is null if computeLayout ran while screen was hidden (clientWidth=0); retry now
    if (!layout) sizeCanvas();
    if (!layout) { rafId = requestAnimationFrame(render); return; }
    const { W, H } = layout;
    ctx.clearRect(0, 0, W, H);
    drawBg(W, H);
    drawBoard();
    drawLabels(W, H);
    rafId = requestAnimationFrame(render);
  }

  function drawBg(W, H) {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#1e0a30');
    g.addColorStop(1, '#07030e');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // Decorative scattered fruits in background
    const deco = [
      [0.08, 0.06, '🌸'], [0.92, 0.07, '🫐'], [0.05, 0.88, '🍓'],
      [0.95, 0.90, '🌸'], [0.12, 0.50, '🫐'], [0.88, 0.52, '🍓'],
      [0.50, 0.96, '🌸'],
    ];
    ctx.font = `${W * 0.024}px serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.globalAlpha = 0.10;
    for (const [fx, fy, f] of deco) ctx.fillText(f, W * fx, H * fy);
    ctx.globalAlpha = 1;
  }

  function rrect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  function drawBoard() {
    const { bx, bw, by, bh, boardR, storeW, pitAreaX, pitAreaW, pitR,
            storeRx, storeRy, pitDescs } = layout;
    const now = Date.now();
    const hlActive = lastMove && (now - lastMoveTime < HIGHLIGHT_MS);

    // Board body — warm amber wood, clearly visible against dark bg
    ctx.save();
    rrect(bx, by, bw, bh, boardR);
    const woodG = ctx.createLinearGradient(bx, by, bx + bw, by + bh);
    woodG.addColorStop(0,   '#c8742a');
    woodG.addColorStop(0.3, '#d9883a');
    woodG.addColorStop(0.7, '#bf6a22');
    woodG.addColorStop(1,   '#a85818');
    ctx.fillStyle = woodG;
    ctx.fill();
    // Bright border so the board edge is unmistakable
    ctx.strokeStyle = '#7a3c08';
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.restore();

    // Wood grain (subtle bezier arcs)
    ctx.save();
    ctx.globalAlpha = 0.10;
    ctx.strokeStyle = '#fff0b0';
    ctx.lineWidth = 1.5;
    for (let i = 1; i < 8; i++) {
      const ly = by + bh * i / 8;
      ctx.beginPath();
      ctx.moveTo(bx + boardR, ly);
      ctx.bezierCurveTo(bx + bw * 0.3, ly - 5, bx + bw * 0.7, ly + 5, bx + bw - boardR, ly);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.restore();

    // Store separator lines
    ctx.save();
    ctx.strokeStyle = 'rgba(80,30,0,0.45)';
    ctx.lineWidth = 3;
    [[bx + storeW, by + bh * 0.06, bx + storeW, by + bh * 0.94],
     [bx + bw - storeW, by + bh * 0.06, bx + bw - storeW, by + bh * 0.94]].forEach(([x1,y1,x2,y2]) => {
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    });
    ctx.restore();

    // Center divider
    ctx.save();
    ctx.strokeStyle = 'rgba(80,30,0,0.35)';
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 6]);
    ctx.beginPath();
    ctx.moveTo(pitAreaX + pitR, by + bh / 2);
    ctx.lineTo(pitAreaX + pitAreaW - pitR, by + bh / 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    // Draw all pits
    for (const p of pitDescs) {
      const count = pits[p.idx] || 0;
      const isSource  = hlActive && lastMove && lastMove.pitIdx === p.idx;
      const isLanded  = hlActive && lastMove && lastMove.lastIdx === p.idx;
      const isCaptureOpp = hlActive && lastMove && lastMove.captured && p.idx === (12 - lastMove.pitIdx);
      const canSelect = !p.isStore && isMyPit(p.idx) && currentPlayer === myIdx && count > 0;

      if (p.isStore) {
        drawStore(p.cx, p.cy, storeRx, storeRy, count, p.isMine);
      } else {
        drawPit(p.cx, p.cy, pitR, count, canSelect, isSource, isLanded || isCaptureOpp);
      }
    }
  }

  function drawPit(cx, cy, r, count, canSelect, isSource, isLanded) {
    ctx.save();

    // Outer shadow ring — gives depth against the board
    ctx.beginPath();
    ctx.arc(cx, cy, r + 3, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.50)';
    ctx.fill();

    // Cavity — dark concave depression, clearly visible on the amber wood
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    const g = ctx.createRadialGradient(cx - r * 0.25, cy - r * 0.25, r * 0.05, cx, cy, r);
    if (isSource) {
      g.addColorStop(0, '#8b4a22'); g.addColorStop(1, '#280e04');
    } else if (isLanded) {
      g.addColorStop(0, '#6a3818'); g.addColorStop(1, '#1e0904');
    } else {
      g.addColorStop(0, '#4a2410'); g.addColorStop(1, '#180804');
    }
    ctx.fillStyle = g;
    ctx.fill();

    // Rim highlight
    if (canSelect) {
      ctx.shadowColor = '#ffee44';
      ctx.shadowBlur = 16;
      ctx.strokeStyle = '#ffee44';
      ctx.lineWidth = 3;
    } else {
      ctx.strokeStyle = isLanded ? '#ffaa55' : 'rgba(255,180,80,0.30)';
      ctx.lineWidth = 1.5;
    }
    ctx.stroke();
    ctx.restore();

    drawStonesInPit(cx, cy, r, count);
  }

  function drawStore(cx, cy, rx, ry, count, isMine) {
    ctx.save();

    // Shadow
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx + 4, ry + 5, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fill();

    // Cavity
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    const g = ctx.createRadialGradient(cx - rx * 0.2, cy - ry * 0.2, rx * 0.05, cx, cy, ry);
    g.addColorStop(0, '#4e2812');
    g.addColorStop(1, '#140604');
    ctx.fillStyle = g;
    ctx.fill();
    // Bright rim so stores are unmistakable
    ctx.strokeStyle = isMine ? '#ffcc44' : 'rgba(255,180,80,0.40)';
    ctx.lineWidth = isMine ? 2.5 : 1.5;
    ctx.stroke();
    ctx.restore();

    // Count number — large and bright
    const numSize = Math.min(rx * 1.3, ry * 0.55);
    ctx.fillStyle = isMine ? '#ffee80' : '#d0a060';
    ctx.font = `bold ${numSize}px Nunito, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(count, cx, cy - ry * 0.14);

    // Sample stones (ring)
    if (count > 0) {
      const show = Math.min(count, 6);
      const fSize = Math.min(rx * 0.48, ry * 0.20);
      ctx.font = `${fSize}px serif`;
      for (let i = 0; i < show; i++) {
        const angle = (i / show) * Math.PI * 2 - Math.PI / 2;
        const sx = cx + Math.cos(angle) * rx * 0.60;
        const sy = cy + ry * 0.35 + Math.sin(angle) * ry * 0.24;
        if (sy > cy - ry * 0.3) ctx.fillText(FRUITS[i % 3], sx, sy);
      }
    }

    // Label
    const lblSize = Math.max(rx * 0.55, 9);
    ctx.fillStyle = isMine ? 'rgba(255,200,80,0.60)' : 'rgba(150,100,50,0.50)';
    ctx.font = `${lblSize}px Nunito, sans-serif`;
    ctx.textBaseline = 'bottom';
    ctx.fillText(isMine ? '▲ Mine' : 'Theirs', cx, cy + ry * 0.97);
  }

  function drawStonesInPit(cx, cy, r, count) {
    if (count <= 0) return;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';

    if (count <= 4) {
      // Show individual emoji at a legible size
      const POS = {
        1: [[0, 0]],
        2: [[-0.40, 0], [0.40, 0]],
        3: [[0, -0.38], [-0.38, 0.30], [0.38, 0.30]],
        4: [[-0.38, -0.38], [0.38, -0.38], [-0.38, 0.38], [0.38, 0.38]],
      };
      const fSize = count === 1 ? r * 1.18 : r * 0.88;
      ctx.font = `${fSize}px serif`;
      for (let i = 0; i < count; i++) {
        ctx.fillText(FRUITS[i % 3], cx + POS[count][i][0] * r, cy + POS[count][i][1] * r);
      }
    } else {
      // Show count number prominently + 3 tiny emoji around rim
      ctx.fillStyle = '#ffffff';
      ctx.font = `bold ${r * 0.75}px Nunito, sans-serif`;
      ctx.fillText(count, cx, cy);
      const fSize = r * 0.38;
      ctx.font = `${fSize}px serif`;
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2 - Math.PI / 2;
        ctx.fillText(FRUITS[i], cx + Math.cos(a) * r * 0.72, cy + Math.sin(a) * r * 0.72);
      }
    }
  }

  function drawLabels(W, H) {
    if (!layout) return;
    const { by, bh } = layout;
    const isMeTurn = currentPlayer === myIdx;

    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';

    // Opponent name (above board)
    const oppName = playerNames[1 - myIdx];
    ctx.font = `bold ${Math.max(W * 0.044, 14)}px Nunito, sans-serif`;
    ctx.fillStyle = !isMeTurn ? '#ffee66' : 'rgba(240,210,160,0.65)';
    ctx.fillText((!isMeTurn ? '▶ ' : '') + oppName, W / 2, by * 0.52);

    // My name + turn indicator (below board)
    const myName = playerNames[myIdx];
    const bottomY = by + bh + (H - by - bh) * 0.38;
    ctx.font = `bold ${Math.max(W * 0.046, 14)}px Nunito, sans-serif`;
    ctx.fillStyle = isMeTurn ? '#ffee66' : 'rgba(240,210,160,0.65)';
    const myLabel = (isMeTurn ? '▶ ' : '') + myName + (isMeTurn ? ' — Your turn!' : '');
    ctx.fillText(myLabel, W / 2, bottomY);
  }

  // ── Input ──────────────────────────────────────────────────────────────────
  function onPointerDown(e) {
    e.preventDefault();
    if (currentPlayer !== myIdx || !layout) return;
    canvas.setPointerCapture(e.pointerId);
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (canvas.clientWidth  / rect.width);
    const y = (e.clientY - rect.top)  * (canvas.clientHeight / rect.height);
    const pit = hitTest(x, y);
    if (pit === null || !isMyPit(pit) || (pits[pit] || 0) <= 0) return;
    socket.emit('mancala:move', { roomId: window._gameLocal.roomId, pit });
  }

  function onContextMenu(e) { e.preventDefault(); }

  function hitTest(x, y) {
    for (const p of layout.pitDescs) {
      if (p.isStore) continue;
      const dx = x - p.cx, dy = y - p.cy;
      if (dx * dx + dy * dy <= layout.pitHitR * layout.pitHitR) return p.idx;
    }
    return null;
  }

  function isMyPit(idx) {
    return myIdx === 0 ? idx >= 0 && idx <= 5 : idx >= 7 && idx <= 12;
  }

  // ── Socket Events ──────────────────────────────────────────────────────────
  function registerEvents() {
    socket.on('mancala:state', (data) => {
      pits = data.pits;
      currentPlayer = data.currentPlayer;
      if (data.lastMove) {
        lastMove = data.lastMove;
        lastMoveTime = Date.now();
        sfxPlace();
        if (data.lastMove.captured)  sfxCapture();
        if (data.lastMove.extraTurn) sfxExtraTurn();
        if (data.lastMove.gameOver) {
          sfxEnd();
          if (pits[6] === pits[13]) window._mancalaTied = true;
        }
      }
    });
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────
  function handleResize() { sizeCanvas(); }

  window.gameClients = window.gameClients || {};
  window.gameClients.mancala = {
    onGameStart(data) {
      disposed = false;
      myIdx         = data.myPlayerIndex;
      pits          = data.mancala.pits;
      currentPlayer = data.mancala.currentPlayer;
      playerNames[0] = data.players[0].name;
      playerNames[1] = data.players[1].name;
      lastMove = null;
      window._mancalaTied = false;

      initCanvas();
      registerEvents();
      canvas.addEventListener('pointerdown', onPointerDown);
      canvas.addEventListener('contextmenu', onContextMenu);
      window.addEventListener('resize', handleResize);
      rafId = requestAnimationFrame(render);
    },

    onReconnect(data) {
      this.onGameStart(data);
    },

    cleanup() {
      disposed = true;
      if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
      socket.off('mancala:state');
      if (canvas) {
        canvas.removeEventListener('pointerdown', onPointerDown);
        canvas.removeEventListener('contextmenu', onContextMenu);
        canvas.remove();
        canvas = ctx = null;
      }
      window.removeEventListener('resize', handleResize);
      pits = new Array(14).fill(0);
      lastMove = null; layout = null;
    },
  };
})();
