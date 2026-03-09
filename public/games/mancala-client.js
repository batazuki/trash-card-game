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
  let _cssW = 0, _cssH = 0;

  const FRUITS = ['\uD83C\uDF38', '\uD83E\uDED0', '\uD83C\uDF53']; // 🌸 🫐 🍓
  const HIGHLIGHT_MS = 2400;

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
  function sfxEnd()       { [350,500,680].forEach(function(f,i) { setTimeout(function() { sfxTone(f,0.2,'sine',0.12); }, i*140); }); }

  // ── Canvas ─────────────────────────────────────────────────────────────────
  function initCanvas() {
    var container = document.getElementById('game-container');
    container.innerHTML = '';
    canvas = document.createElement('canvas');
    canvas.className = 'mancala-canvas';
    container.appendChild(canvas);
    ctx = canvas.getContext('2d');
    sizeCanvas();
  }

  function sizeCanvas() {
    if (!canvas) return;
    var pad = 24;
    var w = window.innerWidth - pad;
    var h = w * (4 / 3);
    if (h > window.innerHeight - pad) { h = window.innerHeight - pad; w = h * (3 / 4); }
    w = Math.floor(w); h = Math.floor(h);
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
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
    var W = _cssW, H = _cssH;
    if (!W || !H) { layout = null; return; }

    // Portrait when H >= W (3:4 canvas is always portrait on this app)
    var isPortrait = H >= W * 1.1;

    var bx = W * 0.02, bw = W * 0.96;
    var by, bh;

    var pitR, pitHitR, pitSpacing;
    var topRowCY, botRowCY;
    var oppStoreCX, oppStoreCY, myStoreCX, myStoreCY;
    var storeRx, storeRy;
    var boardR = Math.min(bw, H) * 0.05;

    if (isPortrait) {
      // ── Portrait: stores at top and bottom ──────────────────────────────
      by = H * 0.11; bh = H * 0.76;
      var storeH   = bh * 0.15;
      var pitAreaY = by + storeH;
      var pitAreaH = bh - 2 * storeH;

      pitSpacing = bw / 6;
      pitR     = Math.min(pitSpacing * 0.42, pitAreaH * 0.22);
      pitHitR  = Math.max(pitR * 1.4, 22);
      topRowCY = pitAreaY + pitAreaH * 0.28;
      botRowCY = pitAreaY + pitAreaH * 0.72;

      // Stores are centered horizontally at top/bottom of board
      oppStoreCX = bx + bw / 2;
      oppStoreCY = by + storeH / 2;
      myStoreCX  = bx + bw / 2;
      myStoreCY  = by + bh - storeH / 2;
      storeRx = bw * 0.41;
      storeRy = storeH * 0.44;

    } else {
      // ── Landscape: stores on left and right sides ────────────────────────
      by = H * 0.08; bh = H * 0.84;
      var storeW   = bw * 0.13;
      var pitAreaX2 = bx + storeW;
      var pitAreaW2 = bw - 2 * storeW;

      pitSpacing = pitAreaW2 / 6;
      pitR     = Math.min(pitSpacing * 0.42, bh * 0.22);
      pitHitR  = Math.max(pitR * 1.4, 22);
      topRowCY = by + bh * 0.27;
      botRowCY = by + bh * 0.73;

      // Left store = opp, right store = mine  (set per-player below)
      oppStoreCX = bx + storeW * 0.5;
      oppStoreCY = by + bh / 2;
      myStoreCX  = bx + bw - storeW * 0.5;
      myStoreCY  = by + bh / 2;
      storeRx = storeW * 0.38;
      storeRy = bh * 0.37;
    }

    // Pit centres — my pits always at bottom row regardless of player
    var pitDescs = [];
    var pitAreaXStart = isPortrait ? bx : (bx + bw * 0.13);

    if (myIdx === 0) {
      for (var k = 0; k < 6; k++)
        pitDescs.push({ idx: k,    cx: pitAreaXStart + k*pitSpacing + pitSpacing/2, cy: botRowCY });
      for (var k2 = 0; k2 < 6; k2++)
        pitDescs.push({ idx: 12-k2, cx: pitAreaXStart + k2*pitSpacing + pitSpacing/2, cy: topRowCY });
      pitDescs.push({ idx: 13, cx: isPortrait ? oppStoreCX : (bx + bw * 0.065), cy: oppStoreCY, isStore: true, isMine: false });
      pitDescs.push({ idx: 6,  cx: isPortrait ? myStoreCX  : (bx + bw * 0.935), cy: myStoreCY,  isStore: true, isMine: true  });
    } else {
      for (var k3 = 0; k3 < 6; k3++)
        pitDescs.push({ idx: 7+k3,  cx: pitAreaXStart + k3*pitSpacing + pitSpacing/2, cy: botRowCY });
      for (var k4 = 0; k4 < 6; k4++)
        pitDescs.push({ idx: 5-k4,  cx: pitAreaXStart + k4*pitSpacing + pitSpacing/2, cy: topRowCY });
      pitDescs.push({ idx: 6,  cx: isPortrait ? oppStoreCX : (bx + bw * 0.065), cy: oppStoreCY, isStore: true, isMine: false });
      pitDescs.push({ idx: 13, cx: isPortrait ? myStoreCX  : (bx + bw * 0.935), cy: myStoreCY,  isStore: true, isMine: true  });
    }

    layout = {
      W: W, H: H, bx: bx, bw: bw, by: by, bh: bh, boardR: boardR,
      isPortrait: isPortrait,
      pitSpacing: pitSpacing, pitR: pitR, pitHitR: pitHitR,
      topRowCY: topRowCY, botRowCY: botRowCY,
      storeRx: storeRx, storeRy: storeRy,
      pitDescs: pitDescs,
    };
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  function render() {
    if (disposed || !canvas) return;
    if (!layout) sizeCanvas();
    if (layout) {
      try {
        var W = layout.W, H = layout.H;
        ctx.clearRect(0, 0, W, H);
        drawBg(W, H);
        drawBoard();
        drawLabels(W, H);
      } catch (err) {
        if (window.console) console.error('mancala render:', err);
        // Draw error text so we can diagnose in production
        try {
          ctx.fillStyle = '#ff6666';
          ctx.font = 'bold 13px sans-serif';
          ctx.textAlign = 'left'; ctx.textBaseline = 'top';
          ctx.fillText('Render error: ' + (err && err.message), 8, 8);
        } catch(e2) {}
      }
    }
    rafId = requestAnimationFrame(render);
  }

  function rrect(x, y, w, h, r) {
    var safe = Math.min(r, w / 2, h / 2);
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
    var g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#1c0830');
    g.addColorStop(1, '#060210');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 0.07;
    ctx.font = (W * 0.028) + 'px serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    var deco = [[0.08,0.06,0],[0.92,0.07,1],[0.05,0.90,2],[0.95,0.92,0],[0.50,0.97,1]];
    for (var i = 0; i < deco.length; i++)
      ctx.fillText(FRUITS[deco[i][2]], W * deco[i][0], H * deco[i][1]);
    ctx.restore();
  }

  function drawBoard() {
    var lyt = layout;
    var bx = lyt.bx, bw = lyt.bw, by = lyt.by, bh = lyt.bh, boardR = lyt.boardR;
    var isPortrait = lyt.isPortrait;
    var pitDescs = lyt.pitDescs;
    var storeRx = lyt.storeRx, storeRy = lyt.storeRy;
    var pitR = lyt.pitR;
    var now = Date.now();
    var hlActive = lastMove && (now - lastMoveTime < HIGHLIGHT_MS);

    // Board body
    ctx.save();
    rrect(bx, by, bw, bh, boardR);
    var woodG = ctx.createLinearGradient(bx, by, bx + bw, by + bh);
    woodG.addColorStop(0,    '#cc7830');
    woodG.addColorStop(0.35, '#e0943e');
    woodG.addColorStop(0.65, '#c87028');
    woodG.addColorStop(1,    '#a85a18');
    ctx.fillStyle = woodG;
    ctx.fill();
    ctx.strokeStyle = '#6a3008';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.restore();

    // Wood grain
    ctx.save();
    ctx.globalAlpha = 0.09;
    ctx.strokeStyle = '#fff8d0';
    ctx.lineWidth = 1.2;
    for (var gi = 1; gi < 8; gi++) {
      var ly = by + bh * gi / 8;
      ctx.beginPath();
      ctx.moveTo(bx + boardR, ly);
      ctx.bezierCurveTo(bx + bw*0.3, ly - 4, bx + bw*0.7, ly + 4, bx + bw - boardR, ly);
      ctx.stroke();
    }
    ctx.restore();

    // Store separators: horizontal lines in portrait, vertical lines in landscape
    ctx.save();
    ctx.strokeStyle = 'rgba(70,25,0,0.50)';
    ctx.lineWidth = 2.5;
    if (isPortrait) {
      var myStoreDesc = null, oppStoreDesc = null;
      for (var sd = 0; sd < pitDescs.length; sd++) {
        if (pitDescs[sd].isStore) {
          if (pitDescs[sd].isMine) myStoreDesc = pitDescs[sd];
          else oppStoreDesc = pitDescs[sd];
        }
      }
      if (oppStoreDesc) {
        var sepY1 = oppStoreDesc.cy + storeRy + 4;
        ctx.beginPath();
        ctx.moveTo(bx + boardR, sepY1);
        ctx.lineTo(bx + bw - boardR, sepY1);
        ctx.stroke();
      }
      if (myStoreDesc) {
        var sepY2 = myStoreDesc.cy - storeRy - 4;
        ctx.beginPath();
        ctx.moveTo(bx + boardR, sepY2);
        ctx.lineTo(bx + bw - boardR, sepY2);
        ctx.stroke();
      }
    } else {
      var storeW = bw * 0.13;
      for (var si = 0; si < 2; si++) {
        var sepX = bx + (si === 0 ? storeW : bw - storeW);
        ctx.beginPath();
        ctx.moveTo(sepX, by + bh * 0.06);
        ctx.lineTo(sepX, by + bh * 0.94);
        ctx.stroke();
      }
    }
    ctx.restore();

    // Center divider
    ctx.save();
    ctx.strokeStyle = 'rgba(70,25,0,0.30)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([7, 5]);
    var midY = (lyt.topRowCY + lyt.botRowCY) / 2;
    var pitAreaXStart2 = isPortrait ? bx : (bx + bw * 0.13);
    ctx.beginPath();
    ctx.moveTo(pitAreaXStart2 + pitR, midY);
    ctx.lineTo(pitAreaXStart2 + lyt.pitSpacing * 6 - pitR, midY);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    // Pits & stores
    for (var pi = 0; pi < pitDescs.length; pi++) {
      var p = pitDescs[pi];
      var count = pits[p.idx] || 0;
      var isSource   = hlActive && lastMove.pitIdx  === p.idx;
      var isLanded   = hlActive && lastMove.lastIdx  === p.idx;
      var isCaptured = hlActive && lastMove.captured && p.idx === (12 - lastMove.lastIdx);
      var canSelect  = !p.isStore && isMyPit(p.idx) && currentPlayer === myIdx && count > 0;

      if (p.isStore) {
        drawStore(p.cx, p.cy, storeRx, storeRy, count, p.isMine, isPortrait);
      } else {
        drawPit(p.cx, p.cy, pitR, count, canSelect, isSource, isLanded || isCaptured);
      }
    }
  }

  function drawPit(cx, cy, r, count, canSelect, isSource, isLanded) {
    ctx.save();

    // Shadow ring
    ctx.beginPath();
    ctx.arc(cx, cy, r + 2.5, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.40)';
    ctx.fill();

    // Cavity
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = isSource ? '#7a3e1a' : isLanded ? '#5a3010' : '#3a1c08';
    ctx.fill();

    // Rim
    if (canSelect) {
      ctx.shadowColor = '#ffe040';
      ctx.shadowBlur  = 12;
      ctx.strokeStyle = '#ffe040';
      ctx.lineWidth   = 2.5;
    } else {
      ctx.strokeStyle = isLanded ? '#ffaa44' : 'rgba(255,170,60,0.28)';
      ctx.lineWidth   = 1.5;
    }
    ctx.stroke();
    ctx.restore();

    drawStonesInPit(cx, cy, r, count);
  }

  function drawStore(cx, cy, rx, ry, count, isMine, isPortrait) {
    var cornerR = Math.min(rx, ry) * 0.30;

    // Shadow
    ctx.save();
    rrect(cx - rx, cy - ry + 3, rx * 2, ry * 2, cornerR);
    ctx.fillStyle = 'rgba(0,0,0,0.40)';
    ctx.fill();

    // Body
    rrect(cx - rx, cy - ry, rx * 2, ry * 2, cornerR);
    ctx.fillStyle = '#2a1006';
    ctx.fill();
    ctx.strokeStyle = isMine ? '#ffcc44' : 'rgba(255,160,60,0.35)';
    ctx.lineWidth   = isMine ? 2.5 : 1.5;
    ctx.stroke();
    ctx.restore();

    ctx.save();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';

    if (isPortrait) {
      // Wide, thin rectangle — label | count | emoji arranged left–center–right
      var lblSize = Math.max(Math.min(ry * 0.88, 13), 8);
      ctx.font = lblSize + 'px Nunito, sans-serif';
      ctx.fillStyle = isMine ? 'rgba(255,200,70,0.65)' : 'rgba(200,130,50,0.50)';
      ctx.fillText(isMine ? 'My Store' : 'Theirs', cx - rx * 0.62, cy);

      // Count — center
      var numSize = Math.max(Math.min(ry * 1.55, 26), 12);
      ctx.font = 'bold ' + numSize + 'px Nunito, sans-serif';
      ctx.fillStyle = isMine ? '#ffee70' : '#cc9040';
      ctx.fillText(count, cx, cy);

      // Emoji — right third
      if (count > 0) {
        var show = Math.min(count, 4);
        var fSize = Math.max(Math.min(ry * 0.72, 14), 7);
        ctx.font = fSize + 'px serif';
        var spacing = fSize * 1.25;
        var totalEW = spacing * (show - 1);
        var emoX = cx + rx * 0.62;
        for (var ei = 0; ei < show; ei++) {
          ctx.fillText(FRUITS[ei % 3], emoX - totalEW / 2 + ei * spacing, cy);
        }
      }

    } else {
      // Tall, narrow rectangle — label top, emoji cluster middle, count lower-center
      var lblSize2 = Math.max(Math.min(rx * 0.55, 13), 8);
      ctx.font = lblSize2 + 'px Nunito, sans-serif';
      ctx.fillStyle = isMine ? 'rgba(255,200,70,0.65)' : 'rgba(200,130,50,0.50)';
      ctx.fillText(isMine ? 'Mine' : 'Theirs', cx, cy - ry * 0.72);

      // Count
      var numSize2 = Math.max(Math.min(rx * 1.4, ry * 0.30), 12);
      ctx.font = 'bold ' + numSize2 + 'px Nunito, sans-serif';
      ctx.fillStyle = isMine ? '#ffee70' : '#cc9040';
      ctx.fillText(count, cx, cy + ry * 0.22);

      // Emoji cluster above count
      if (count > 0) {
        var show2 = Math.min(count, 5);
        var fSize2 = Math.max(Math.min(rx * 0.50, ry * 0.18), 7);
        ctx.font = fSize2 + 'px serif';
        for (var ej = 0; ej < show2; ej++) {
          var a = (ej / show2) * Math.PI * 2 - Math.PI * 0.5;
          var eSx = cx + Math.cos(a) * rx * 0.52;
          var eSy = cy - ry * 0.12 + Math.sin(a) * ry * 0.22;
          if (eSy < cy + ry * 0.06) ctx.fillText(FRUITS[ej % 3], eSx, eSy);
        }
      }
    }

    ctx.restore();
  }

  function drawStonesInPit(cx, cy, r, count) {
    if (count <= 0) return;
    ctx.save();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';

    if (count <= 4) {
      var POS = {
        1: [[0, 0]],
        2: [[-0.40, 0], [0.40, 0]],
        3: [[0, -0.38], [-0.38, 0.30], [0.38, 0.30]],
        4: [[-0.38, -0.38], [0.38, -0.38], [-0.38, 0.38], [0.38, 0.38]],
      };
      var fSize = count === 1 ? r * 1.15 : r * 0.85;
      ctx.font = fSize + 'px serif';
      for (var i = 0; i < count; i++) {
        ctx.fillText(FRUITS[i % 3],
          cx + POS[count][i][0] * r,
          cy + POS[count][i][1] * r);
      }
    } else {
      // Count + tiny emoji halo
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold ' + (r * 0.72) + 'px Nunito, sans-serif';
      ctx.fillText(count, cx, cy);
      var fSize2 = r * 0.36;
      ctx.font = fSize2 + 'px serif';
      for (var j = 0; j < 3; j++) {
        var ang = (j / 3) * Math.PI * 2 - Math.PI / 2;
        ctx.fillText(FRUITS[j],
          cx + Math.cos(ang) * r * 0.72,
          cy + Math.sin(ang) * r * 0.72);
      }
    }
    ctx.restore();
  }

  function drawLabels(W, H) {
    var lyt = layout;
    ctx.save();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    var isMeTurn = currentPlayer === myIdx;

    // Opponent label (above board)
    var oppName = playerNames[1 - myIdx] || 'Opponent';
    ctx.font = 'bold ' + Math.max(W * 0.044, 13) + 'px Nunito, sans-serif';
    ctx.fillStyle = !isMeTurn ? '#ffe060' : 'rgba(240,210,150,0.55)';
    ctx.fillText((!isMeTurn ? '\u25B6 ' : '') + oppName, W / 2, lyt.by * 0.52);

    // My label (below board)
    var myName = playerNames[myIdx] || 'You';
    var bottomY = lyt.by + lyt.bh + (H - lyt.by - lyt.bh) * 0.40;
    ctx.font = 'bold ' + Math.max(W * 0.046, 13) + 'px Nunito, sans-serif';
    ctx.fillStyle = isMeTurn ? '#ffe060' : 'rgba(240,210,150,0.55)';
    var myLabel = (isMeTurn ? '\u25B6 ' : '') + myName + (isMeTurn ? ' \u2014 Your turn!' : '');
    ctx.fillText(myLabel, W / 2, bottomY);
    ctx.restore();
  }

  // ── Input ──────────────────────────────────────────────────────────────────
  function onPointerDown(e) {
    e.preventDefault();
    if (currentPlayer !== myIdx || !layout) return;
    try { canvas.setPointerCapture(e.pointerId); } catch(err2) {}
    var rect = canvas.getBoundingClientRect();
    var scaleX = _cssW / (rect.width  || _cssW);
    var scaleY = _cssH / (rect.height || _cssH);
    var x = (e.clientX - rect.left) * scaleX;
    var y = (e.clientY - rect.top)  * scaleY;
    var pit = hitTest(x, y);
    if (pit === null || !isMyPit(pit) || (pits[pit] || 0) <= 0) return;
    socket.emit('mancala:move', { roomId: window._gameLocal.roomId, pit: pit });
  }

  function onContextMenu(e) { e.preventDefault(); }

  function hitTest(x, y) {
    if (!layout) return null;
    var descs = layout.pitDescs;
    var hr = layout.pitHitR;
    for (var i = 0; i < descs.length; i++) {
      var p = descs[i];
      if (p.isStore) continue;
      var dx = x - p.cx, dy = y - p.cy;
      if (dx*dx + dy*dy <= hr * hr) return p.idx;
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
