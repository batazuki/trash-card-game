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
  let _cssW = 0, _cssH = 0; // from sizeCanvas; canvas.clientWidth is 0 while screen is hidden

  const FRUITS = ['\uD83C\uDF38', '\uD83E\uDED0', '\uD83C\uDF53']; // 🌸 🫐 🍓
  const HIGHLIGHT_MS = 1400;

  // ── Audio ──────────────────────────────────────────────────────────────────
  function sfxTone(freq, dur, type, vol) {
    try {
      const ac = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.connect(gain); gain.connect(ac.destination);
      osc.type = type || 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(vol || 0.15, ac.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + dur);
      osc.start(); osc.stop(ac.currentTime + dur);
    } catch (e) {}
  }
  function sfxPlace()     { sfxTone(420, 0.07, 'triangle', 0.14); }
  function sfxCapture()   { sfxTone(660, 0.12, 'square', 0.10); }
  function sfxExtraTurn() { sfxTone(900, 0.08, 'sine', 0.12); }
  function sfxEnd()       { [350,500,680].forEach((f,i) => setTimeout(() => sfxTone(f,0.2,'sine',0.12), i*140)); }

  // ── Canvas ─────────────────────────────────────────────────────────────────
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

    const bx = W * 0.01,  bw = W * 0.98;
    const by = H * 0.17,  bh = H * 0.62;
    const boardR = Math.min(bh, bw) * 0.06;

    const storeW    = bw * 0.13;
    const pitAreaX  = bx + storeW;
    const pitAreaW  = bw - 2 * storeW;
    const pitSpacing = pitAreaW / 6;
    const pitR      = Math.min(pitSpacing * 0.42, bh * 0.22);
    const pitHitR   = Math.max(pitR * 1.4, 22);

    const topRowCY = by + bh * 0.27;
    const botRowCY = by + bh * 0.73;
    const storeCY  = by + bh * 0.5;
    const storeRx  = storeW * 0.38;
    const storeRy  = bh * 0.37;
    const leftCX   = bx + storeW * 0.5;
    const rightCX  = bx + bw - storeW * 0.5;

    // Pit descriptors — my pits always at bottom row
    const pitDescs = [];
    if (myIdx === 0) {
      for (let k = 0; k < 6; k++)
        pitDescs.push({ idx: k,     cx: pitAreaX + k*pitSpacing + pitSpacing/2, cy: botRowCY });
      for (let k = 0; k < 6; k++)
        pitDescs.push({ idx: 12-k,  cx: pitAreaX + k*pitSpacing + pitSpacing/2, cy: topRowCY });
      pitDescs.push({ idx: 13, cx: leftCX,  cy: storeCY, isStore: true, isMine: false });
      pitDescs.push({ idx: 6,  cx: rightCX, cy: storeCY, isStore: true, isMine: true  });
    } else {
      for (let k = 0; k < 6; k++)
        pitDescs.push({ idx: 7+k,   cx: pitAreaX + k*pitSpacing + pitSpacing/2, cy: botRowCY });
      for (let k = 0; k < 6; k++)
        pitDescs.push({ idx: 5-k,   cx: pitAreaX + k*pitSpacing + pitSpacing/2, cy: topRowCY });
      pitDescs.push({ idx: 6,  cx: leftCX,  cy: storeCY, isStore: true, isMine: false });
      pitDescs.push({ idx: 13, cx: rightCX, cy: storeCY, isStore: true, isMine: true  });
    }

    layout = { W, H, bx, bw, by, bh, boardR,
               storeW, pitAreaX, pitAreaW, pitSpacing, pitR, pitHitR,
               topRowCY, botRowCY, storeCY, storeRx, storeRy, leftCX, rightCX,
               pitDescs };
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  function render() {
    if (disposed || !canvas) return;
    if (!layout) sizeCanvas();           // retry after screen becomes visible
    if (layout) {
      try {
        const { W, H } = layout;
        ctx.clearRect(0, 0, W, H);
        drawBg(W, H);
        drawBoard();
        drawLabels(W, H);
      } catch (err) {
        // Swallow draw errors so the loop keeps going; log for debugging
        if (window.console) console.error('mancala render error:', err);
      }
    }
    rafId = requestAnimationFrame(render);
  }

  // Draw oval using scale trick — avoids ctx.ellipse browser compatibility issues
  function oval(cx, cy, rx, ry) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(1, ry / rx);
    ctx.beginPath();
    ctx.arc(0, 0, rx, 0, Math.PI * 2);
    ctx.restore();
  }

  function rrect(x, y, w, h, r) {
    const safe = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + safe, y);
    ctx.lineTo(x + w - safe, y); ctx.quadraticCurveTo(x + w, y, x + w, y + safe);
    ctx.lineTo(x + w, y + h - safe); ctx.quadraticCurveTo(x + w, y + h, x + w - safe, y + h);
    ctx.lineTo(x + safe, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - safe);
    ctx.lineTo(x, y + safe); ctx.quadraticCurveTo(x, y, x + safe, y);
    ctx.closePath();
  }

  function drawBg(W, H) {
    ctx.save();
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#1c0830');
    g.addColorStop(1, '#060210');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // Faint decorative fruits
    ctx.globalAlpha = 0.08;
    ctx.font = (W * 0.026) + 'px serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const deco = [[0.08,0.06,0],[0.92,0.07,1],[0.05,0.88,2],[0.95,0.90,0],[0.50,0.96,1]];
    for (const [fx, fy, fi] of deco) ctx.fillText(FRUITS[fi], W * fx, H * fy);
    ctx.restore();
  }

  function drawBoard() {
    const { bx, bw, by, bh, boardR, storeW, pitAreaX, pitAreaW, pitR,
            storeRx, storeRy, pitDescs } = layout;
    const now = Date.now();
    const hlActive = lastMove && (now - lastMoveTime < HIGHLIGHT_MS);

    // ── Board body ────────────────────────────────────────────────────────────
    ctx.save();
    rrect(bx, by, bw, bh, boardR);
    const woodG = ctx.createLinearGradient(bx, by, bx + bw, by + bh);
    woodG.addColorStop(0,   '#cc7830');
    woodG.addColorStop(0.35,'#e0943e');
    woodG.addColorStop(0.65,'#c87028');
    woodG.addColorStop(1,   '#a85a18');
    ctx.fillStyle = woodG;
    ctx.fill();
    ctx.strokeStyle = '#6a3008';
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.restore();

    // ── Wood grain ────────────────────────────────────────────────────────────
    ctx.save();
    ctx.globalAlpha = 0.09;
    ctx.strokeStyle = '#fff8d0';
    ctx.lineWidth = 1.2;
    for (let i = 1; i < 8; i++) {
      const ly = by + bh * i / 8;
      ctx.beginPath();
      ctx.moveTo(bx + boardR, ly);
      ctx.bezierCurveTo(bx + bw*0.3, ly - 5, bx + bw*0.7, ly + 5, bx + bw - boardR, ly);
      ctx.stroke();
    }
    ctx.restore();

    // ── Store separators ──────────────────────────────────────────────────────
    ctx.save();
    ctx.strokeStyle = 'rgba(70,25,0,0.50)';
    ctx.lineWidth = 3;
    for (const sepX of [bx + storeW, bx + bw - storeW]) {
      ctx.beginPath();
      ctx.moveTo(sepX, by + bh * 0.06);
      ctx.lineTo(sepX, by + bh * 0.94);
      ctx.stroke();
    }
    ctx.restore();

    // ── Center divider ────────────────────────────────────────────────────────
    ctx.save();
    ctx.strokeStyle = 'rgba(70,25,0,0.30)';
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 6]);
    ctx.beginPath();
    ctx.moveTo(pitAreaX + pitR, by + bh / 2);
    ctx.lineTo(pitAreaX + pitAreaW - pitR, by + bh / 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    // ── Pits & stores ─────────────────────────────────────────────────────────
    for (const p of pitDescs) {
      const count = pits[p.idx] || 0;
      const isSource = hlActive && lastMove && lastMove.pitIdx === p.idx;
      const isLanded = hlActive && lastMove && lastMove.lastIdx === p.idx;
      const isCaptured = hlActive && lastMove && lastMove.captured && p.idx === (12 - lastMove.pitIdx);
      const canSelect  = !p.isStore && isMyPit(p.idx) && currentPlayer === myIdx && count > 0;

      if (p.isStore) {
        drawStore(p.cx, p.cy, storeRx, storeRy, count, p.isMine);
      } else {
        drawPit(p.cx, p.cy, pitR, count, canSelect, isSource, isLanded || isCaptured);
      }
    }
  }

  function drawPit(cx, cy, r, count, canSelect, isSource, isLanded) {
    ctx.save();

    // Shadow ring
    ctx.beginPath();
    ctx.arc(cx, cy, r + 3, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fill();

    // Cavity
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    const fillColor = isSource ? '#7a3e1a' : isLanded ? '#5a3010' : '#3a1c08';
    ctx.fillStyle = fillColor;
    ctx.fill();

    // Rim
    if (canSelect) {
      ctx.shadowColor = '#ffe040';
      ctx.shadowBlur  = 14;
      ctx.strokeStyle = '#ffe040';
      ctx.lineWidth   = 3;
    } else {
      ctx.strokeStyle = isLanded ? '#ffaa44' : 'rgba(255,170,60,0.28)';
      ctx.lineWidth   = 1.5;
    }
    ctx.stroke();
    ctx.restore();

    drawStonesInPit(cx, cy, r, count);
  }

  function drawStore(cx, cy, rx, ry, count, isMine) {
    ctx.save();

    // Shadow
    oval(cx, cy + 4, rx + 3, ry + 4);
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fill();

    // Cavity
    oval(cx, cy, rx, ry);
    ctx.fillStyle = '#301408';
    ctx.fill();
    ctx.strokeStyle = isMine ? '#ffcc44' : 'rgba(255,160,60,0.35)';
    ctx.lineWidth   = isMine ? 2.5 : 1.5;
    ctx.stroke();

    ctx.restore();

    // Count
    const numSize = Math.max(Math.min(rx * 1.4, ry * 0.55), 12);
    ctx.save();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = isMine ? '#ffee70' : '#cc9040';
    ctx.font = 'bold ' + numSize + 'px Nunito, sans-serif';
    ctx.fillText(count, cx, cy - ry * 0.15);

    // Small emoji ring (lower half of store)
    if (count > 0) {
      const show = Math.min(count, 5);
      const fSize = Math.max(Math.min(rx * 0.5, ry * 0.18), 8);
      ctx.font = fSize + 'px serif';
      for (let i = 0; i < show; i++) {
        const a = (i / show) * Math.PI * 2 - Math.PI * 0.5;
        const sx = cx + Math.cos(a) * rx * 0.58;
        const sy = cy + ry * 0.32 + Math.sin(a) * ry * 0.22;
        if (sy > cy - ry * 0.1) ctx.fillText(FRUITS[i % 3], sx, sy);
      }
    }

    // Label
    const lblSize = Math.max(rx * 0.5, 8);
    ctx.fillStyle = isMine ? 'rgba(255,200,70,0.65)' : 'rgba(200,130,50,0.50)';
    ctx.font = lblSize + 'px Nunito, sans-serif';
    ctx.textBaseline = 'bottom';
    ctx.fillText(isMine ? 'My Store' : 'Theirs', cx, cy + ry * 0.96);
    ctx.restore();
  }

  function drawStonesInPit(cx, cy, r, count) {
    if (count <= 0) return;
    ctx.save();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';

    if (count <= 4) {
      const POS = {
        1: [[0, 0]],
        2: [[-0.40, 0], [0.40, 0]],
        3: [[0, -0.38], [-0.38, 0.30], [0.38, 0.30]],
        4: [[-0.38, -0.38], [0.38, -0.38], [-0.38, 0.38], [0.38, 0.38]],
      };
      const fSize = count === 1 ? r * 1.15 : r * 0.85;
      ctx.font = fSize + 'px serif';
      for (let i = 0; i < count; i++) {
        ctx.fillText(FRUITS[i % 3],
          cx + POS[count][i][0] * r,
          cy + POS[count][i][1] * r);
      }
    } else {
      // Count number + tiny emoji halo
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold ' + (r * 0.72) + 'px Nunito, sans-serif';
      ctx.fillText(count, cx, cy);
      const fSize = r * 0.36;
      ctx.font = fSize + 'px serif';
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2 - Math.PI / 2;
        ctx.fillText(FRUITS[i],
          cx + Math.cos(a) * r * 0.72,
          cy + Math.sin(a) * r * 0.72);
      }
    }
    ctx.restore();
  }

  function drawLabels(W, H) {
    const { by, bh } = layout;
    ctx.save();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const isMeTurn = currentPlayer === myIdx;

    // Opponent (above board)
    const oppName = playerNames[1 - myIdx] || 'Opponent';
    ctx.font = 'bold ' + Math.max(W * 0.044, 14) + 'px Nunito, sans-serif';
    ctx.fillStyle = !isMeTurn ? '#ffe060' : 'rgba(240,210,150,0.60)';
    ctx.fillText((!isMeTurn ? '\u25B6 ' : '') + oppName, W / 2, by * 0.52);

    // Me (below board)
    const myName = playerNames[myIdx] || 'You';
    const bottomY = by + bh + (H - by - bh) * 0.38;
    ctx.font = 'bold ' + Math.max(W * 0.046, 14) + 'px Nunito, sans-serif';
    ctx.fillStyle = isMeTurn ? '#ffe060' : 'rgba(240,210,150,0.60)';
    const myLabel = (isMeTurn ? '\u25B6 ' : '') + myName + (isMeTurn ? ' \u2014 Your turn!' : '');
    ctx.fillText(myLabel, W / 2, bottomY);
    ctx.restore();
  }

  // ── Input ──────────────────────────────────────────────────────────────────
  function onPointerDown(e) {
    e.preventDefault();
    if (currentPlayer !== myIdx || !layout) return;
    try { canvas.setPointerCapture(e.pointerId); } catch(err) {}
    const rect = canvas.getBoundingClientRect();
    const scaleX = _cssW / (rect.width  || _cssW);
    const scaleY = _cssH / (rect.height || _cssH);
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top)  * scaleY;
    const pit = hitTest(x, y);
    if (pit === null || !isMyPit(pit) || (pits[pit] || 0) <= 0) return;
    socket.emit('mancala:move', { roomId: window._gameLocal.roomId, pit });
  }

  function onContextMenu(e) { e.preventDefault(); }

  function hitTest(x, y) {
    if (!layout) return null;
    for (const p of layout.pitDescs) {
      if (p.isStore) continue;
      const dx = x - p.cx, dy = y - p.cy;
      if (dx*dx + dy*dy <= layout.pitHitR * layout.pitHitR) return p.idx;
    }
    return null;
  }

  function isMyPit(idx) {
    return myIdx === 0 ? (idx >= 0 && idx <= 5) : (idx >= 7 && idx <= 12);
  }

  // ── Socket ─────────────────────────────────────────────────────────────────
  function registerEvents() {
    socket.on('mancala:state', function(data) {
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
    onGameStart: function(data) {
      disposed = false;
      myIdx          = data.myPlayerIndex;
      pits           = data.mancala.pits.slice();
      currentPlayer  = data.mancala.currentPlayer;
      playerNames[0] = data.players[0].name;
      playerNames[1] = data.players[1].name;
      lastMove = null; lastMoveTime = 0;
      window._mancalaTied = false;

      initCanvas();
      registerEvents();
      canvas.addEventListener('pointerdown', onPointerDown);
      canvas.addEventListener('contextmenu', onContextMenu);
      window.addEventListener('resize', handleResize);
      rafId = requestAnimationFrame(render);
    },

    onReconnect: function(data) {
      this.onGameStart(data);
    },

    cleanup: function() {
      disposed = true;
      if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
      socket.off('mancala:state');
      if (canvas) {
        canvas.removeEventListener('pointerdown', onPointerDown);
        canvas.removeEventListener('contextmenu', onContextMenu);
        canvas.remove();
        canvas = null; ctx = null;
      }
      window.removeEventListener('resize', handleResize);
      pits = new Array(14).fill(0);
      lastMove = null; layout = null; _cssW = 0; _cssH = 0;
    },
  };
})();
