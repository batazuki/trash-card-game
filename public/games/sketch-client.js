// public/games/sketch-client.js — Sketch It client

(function () {
  'use strict';

  // ── State ───────────────────────────────────────────────────────────────────
  var myIdx, roomId, playerNames, maxRounds, currentRound, roundWins;
  var drawTime, previewTime;
  var currentShape, currentPhase;   // currentShape = { type, params }
  var cameraStream = null;
  var disposed = false;
  var inCameraPhase = false;

  // ── Shape Drawing Functions ─────────────────────────────────────────────────
  // Fixed shapes ignore the params argument (p). Parameterized shapes use it.

  function drawCatFace(ctx, w, h, p) {
    var cx = w / 2, cy = h * 0.52, r = w * 0.36;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
    function ear(pts) {
      ctx.beginPath(); ctx.moveTo(pts[0], pts[1]);
      for (var i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i+1]);
      ctx.closePath(); ctx.stroke();
    }
    ear([cx - r*0.55, cy - r*0.78, cx - r*0.75, cy - r*1.28, cx - r*0.2, cy - r*0.85]);
    ear([cx + r*0.55, cy - r*0.78, cx + r*0.75, cy - r*1.28, cx + r*0.2, cy - r*0.85]);
    ctx.beginPath(); ctx.arc(cx - r*0.35, cy - r*0.18, r*0.1, 0, Math.PI*2); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx + r*0.35, cy - r*0.18, r*0.1, 0, Math.PI*2); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx - r*0.12, cy + r*0.08); ctx.lineTo(cx - r*0.85, cy); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx - r*0.12, cy + r*0.18); ctx.lineTo(cx - r*0.85, cy + r*0.25); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx + r*0.12, cy + r*0.08); ctx.lineTo(cx + r*0.85, cy); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx + r*0.12, cy + r*0.18); ctx.lineTo(cx + r*0.85, cy + r*0.25); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy + r*0.28, r*0.18, 0, Math.PI); ctx.stroke();
  }

  function drawHouse(ctx, w, h, p) {
    var bx = w*0.15, by = h*0.45, bw = w*0.7, bh = h*0.42;
    ctx.beginPath(); ctx.rect(bx, by, bw, bh); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(bx - w*0.04, by); ctx.lineTo(w/2, h*0.1); ctx.lineTo(bx+bw+w*0.04, by); ctx.stroke();
    ctx.beginPath(); ctx.rect(w*0.41, by+bh*0.52, bw*0.18, bh*0.48); ctx.stroke();
  }

  function drawStar(ctx, w, h, p) {
    p = p || {};
    var pts = p.points || 5;
    var inner = p.innerRatio || 0.40;
    var cx = w/2, cy = h/2, outer = w * 0.42;
    ctx.beginPath();
    for (var i = 0; i < pts * 2; i++) {
      var r = i % 2 === 0 ? outer : outer * inner;
      var angle = (Math.PI / pts) * i - Math.PI / 2;
      var x = cx + Math.cos(angle) * r, y = cy + Math.sin(angle) * r;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.closePath(); ctx.fill(); ctx.stroke();
  }

  function drawHeart(ctx, w, h, p) {
    var cx = w/2, top = h*0.22, bot = h*0.85;
    ctx.beginPath();
    ctx.moveTo(cx, bot);
    ctx.bezierCurveTo(w*0.02, h*0.58, w*0.02, top, w*0.28, top);
    ctx.bezierCurveTo(w*0.4, top, cx, h*0.34, cx, h*0.34);
    ctx.bezierCurveTo(cx, h*0.34, w*0.6, top, w*0.72, top);
    ctx.bezierCurveTo(w*0.98, top, w*0.98, h*0.58, cx, bot);
    ctx.closePath(); ctx.fill(); ctx.stroke();
  }

  function drawFish(ctx, w, h, p) {
    var cx = w*0.46, cy = h/2, rx = w*0.32, ry = h*0.22;
    ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI*2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx+rx-w*0.06, cy); ctx.lineTo(w*0.94, cy-ry*0.9); ctx.lineTo(w*0.94, cy+ry*0.9); ctx.closePath(); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx-rx*0.5, cy-ry*0.25, rx*0.1, 0, Math.PI*2); ctx.fill(); ctx.stroke();
  }

  function drawBird(ctx, w, h, p) {
    var cx = w/2, cy = h*0.5, r = w*0.28;
    ctx.beginPath(); ctx.arc(cx, cy, r, Math.PI*0.25, Math.PI*1.75); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx-r*0.8, cy-r*0.15, r*0.55, Math.PI*0.6, Math.PI*1.9); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx+r*0.8, cy-r*0.15, r*0.55, Math.PI*1.1, Math.PI*2.4); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx-r*0.15, cy-r*0.55); ctx.lineTo(cx-r*0.52, cy-r*0.72); ctx.lineTo(cx-r*0.15, cy-r*0.32); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx-r*0.08, cy-r*0.3, r*0.08, 0, Math.PI*2); ctx.fill(); ctx.stroke();
  }

  function drawTree(ctx, w, h, p) {
    p = p || {};
    var n = p.layers || 2;
    var cx = w / 2;
    var trunkTop = h * 0.70;
    var canopyTop = h * 0.06;
    var layerStep = (trunkTop - canopyTop) / (n + 0.4);

    for (var i = 0; i < n; i++) {
      var apexY = canopyTop + i * layerStep * 0.65;
      var baseY = canopyTop + (i + 1) * layerStep;
      var hw = w * (0.20 + i * 0.06);
      ctx.beginPath();
      ctx.moveTo(cx, apexY);
      ctx.lineTo(cx - hw, baseY);
      ctx.lineTo(cx + hw, baseY);
      ctx.closePath(); ctx.fill(); ctx.stroke();
    }
    ctx.beginPath(); ctx.rect(cx - w*0.09, trunkTop, w*0.18, h*0.24); ctx.stroke();
  }

  function drawSun(ctx, w, h, p) {
    p = p || {};
    var rays = p.rays || 8;
    var cx = w/2, cy = h/2, r = w*0.22, rayLen = w*0.15;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI*2); ctx.stroke();
    for (var i = 0; i < rays; i++) {
      var a = (i / rays) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a)*(r+5), cy + Math.sin(a)*(r+5));
      ctx.lineTo(cx + Math.cos(a)*(r+rayLen), cy + Math.sin(a)*(r+rayLen));
      ctx.stroke();
    }
  }

  function drawCloud(ctx, w, h, p) {
    var baseY = h * 0.62;
    [[w*0.5, baseY-h*0.22, w*0.2],[w*0.3, baseY-h*0.1, w*0.16],[w*0.7, baseY-h*0.12, w*0.15],[w*0.18, baseY, w*0.12],[w*0.82, baseY, w*0.12]].forEach(function(a) {
      ctx.beginPath(); ctx.arc(a[0], a[1], a[2], 0, Math.PI*2); ctx.stroke();
    });
    ctx.beginPath(); ctx.moveTo(w*0.08, baseY); ctx.lineTo(w*0.92, baseY); ctx.stroke();
  }

  function drawMoon(ctx, w, h, p) {
    p = p || {};
    // bite 0.55 (thin crescent) to 0.80 (chunky crescent)
    // cutR = r * (1.45 - bite): higher bite → smaller cutout → chunkier
    var bite = p.bite || 0.60;
    var cx = w*0.48, cy = h/2, r = w*0.32;
    var cutR = r * (1.45 - bite);
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI*2);
    ctx.clip();
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI*2); ctx.stroke();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath(); ctx.arc(cx + r*0.45, cy - r*0.1, cutR, 0, Math.PI*2); ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, r, Math.PI*0.55, Math.PI*1.55, false); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy, r, Math.PI*1.55, Math.PI*0.55, false); ctx.stroke();
    ctx.restore();
  }

  function drawMountain(ctx, w, h, p) {
    p = p || {};
    var base = h * 0.86;
    var n = p.peaks || 2;
    if (n === 1) {
      ctx.beginPath(); ctx.moveTo(w*0.10, base); ctx.lineTo(w*0.50, h*0.08); ctx.lineTo(w*0.90, base); ctx.stroke();
    } else if (n === 2) {
      ctx.beginPath(); ctx.moveTo(w*0.05, base); ctx.lineTo(w*0.42, h*0.10); ctx.lineTo(w*0.72, base); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(w*0.32, base); ctx.lineTo(w*0.68, h*0.30); ctx.lineTo(w*0.96, base); ctx.stroke();
    } else {
      ctx.beginPath(); ctx.moveTo(w*0.02, base); ctx.lineTo(w*0.25, h*0.38); ctx.lineTo(w*0.44, base); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(w*0.30, base); ctx.lineTo(w*0.52, h*0.08); ctx.lineTo(w*0.74, base); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(w*0.60, base); ctx.lineTo(w*0.78, h*0.30); ctx.lineTo(w*0.98, base); ctx.stroke();
    }
    ctx.beginPath(); ctx.moveTo(w*0.02, base); ctx.lineTo(w*0.98, base); ctx.stroke();
  }

  function drawDiamond(ctx, w, h, p) {
    p = p || {};
    var cx = w/2, cy = h/2;
    var hw = Math.min(w*0.46, w*0.38*(p.widthRatio || 1.0));
    var hh = h * 0.40;
    ctx.beginPath();
    ctx.moveTo(cx, cy - hh);
    ctx.lineTo(cx + hw, cy);
    ctx.lineTo(cx, cy + hh);
    ctx.lineTo(cx - hw, cy);
    ctx.closePath(); ctx.fill(); ctx.stroke();
  }

  function drawArrow(ctx, w, h, p) {
    p = p || {};
    var dir = p.dir || 0;  // 0=right 1=left 2=up 3=down
    var cx = w/2, cy = h/2;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate([0, Math.PI, -Math.PI/2, Math.PI/2][dir] || 0);
    ctx.translate(-cx, -cy);
    var shaftY = h*0.1, tipX = w*0.88;
    ctx.beginPath();
    ctx.moveTo(w*0.08, cy - shaftY*0.5); ctx.lineTo(w*0.65, cy - shaftY*0.5);
    ctx.lineTo(w*0.65, cy - shaftY);     ctx.lineTo(tipX, cy);
    ctx.lineTo(w*0.65, cy + shaftY);     ctx.lineTo(w*0.65, cy + shaftY*0.5);
    ctx.lineTo(w*0.08, cy + shaftY*0.5);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
  }

  function drawSpiral(ctx, w, h, p) {
    p = p || {};
    var loops = p.loops || 5;
    var cx = w/2, cy = h/2;
    ctx.beginPath();
    for (var i = 0; i <= 200; i++) {
      var angle = (i / 200) * Math.PI * 2 * loops;
      var r = (i / 200) * w * 0.42;
      var x = cx + Math.cos(angle)*r, y = cy + Math.sin(angle)*r;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  function drawCross(ctx, w, h, p) {
    p = p || {};
    var al = (p.armLen  || 0.38) * w;  // arm half-length from center
    var at = (p.armThick || 0.15) * w; // arm thickness
    var cx = w/2, cy = h/2;
    ctx.beginPath(); ctx.rect(cx - at/2, cy - al, at, al*2); ctx.stroke();
    ctx.beginPath(); ctx.rect(cx - al, cy - at/2, al*2, at); ctx.stroke();
  }

  function drawLightning(ctx, w, h, p) {
    p = p || {};
    var n = p.segments || 2;
    var verts;
    if (n <= 2) {
      verts = [[0.58,0.06],[0.28,0.48],[0.50,0.48],[0.22,0.94],[0.62,0.52],[0.42,0.52],[0.72,0.06]];
    } else if (n === 3) {
      verts = [[0.60,0.05],[0.38,0.33],[0.54,0.33],[0.26,0.62],[0.50,0.62],[0.20,0.95],[0.58,0.68],[0.40,0.68],[0.70,0.05]];
    } else {
      verts = [[0.60,0.04],[0.40,0.27],[0.55,0.27],[0.28,0.50],[0.48,0.50],[0.22,0.73],[0.50,0.73],[0.18,0.96],[0.58,0.76],[0.38,0.76],[0.72,0.04]];
    }
    ctx.beginPath();
    ctx.moveTo(w*verts[0][0], h*verts[0][1]);
    for (var i = 1; i < verts.length; i++) ctx.lineTo(w*verts[i][0], h*verts[i][1]);
    ctx.closePath(); ctx.fill(); ctx.stroke();
  }

  function drawRabbit(ctx, w, h, p) {
    var cx = w/2, bodyY = h*0.64, headY = h*0.42;
    ctx.beginPath(); ctx.ellipse(cx, bodyY, w*0.26, h*0.24, 0, 0, Math.PI*2); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(cx, headY, w*0.18, h*0.17, 0, 0, Math.PI*2); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(cx-w*0.1, h*0.18, w*0.065, h*0.15, -0.2, 0, Math.PI*2); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(cx+w*0.1, h*0.18, w*0.065, h*0.15, 0.2, 0, Math.PI*2); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx-w*0.06, headY-h*0.03, w*0.025, 0, Math.PI*2); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx+w*0.06, headY-h*0.03, w*0.025, 0, Math.PI*2); ctx.fill(); ctx.stroke();
  }

  function drawKey(ctx, w, h, p) {
    var headCX = w*0.3, headCY = h/2, headR = h*0.23;
    ctx.beginPath(); ctx.arc(headCX, headCY, headR, 0, Math.PI*2); ctx.stroke();
    ctx.beginPath(); ctx.arc(headCX, headCY, headR*0.55, 0, Math.PI*2); ctx.stroke();
    var shaftY = h*0.47, shaftH = h*0.06;
    ctx.beginPath(); ctx.rect(headCX+headR-2, shaftY, w*0.45, shaftH); ctx.stroke();
    ctx.beginPath(); ctx.rect(w*0.67, shaftY+shaftH, w*0.06, h*0.10); ctx.stroke();
    ctx.beginPath(); ctx.rect(w*0.78, shaftY+shaftH, w*0.05, h*0.07); ctx.stroke();
  }

  function drawCrown(ctx, w, h, p) {
    p = p || {};
    var nPts = p.points || 5;
    var leftX = w*0.08, rightX = w*0.92;
    var baseTop = h*0.44, top = h*0.22;

    ctx.beginPath(); ctx.rect(leftX, baseTop, rightX-leftX, h*0.72-baseTop); ctx.stroke();

    // Distribute points evenly, zigzag up and back down between each
    var pts = [];
    for (var i = 0; i < nPts; i++) pts.push(leftX + (i/(nPts-1))*(rightX-leftX));

    ctx.beginPath();
    ctx.moveTo(leftX, baseTop);
    for (var i = 0; i < nPts; i++) {
      ctx.lineTo(pts[i], top);
      if (i < nPts - 1) ctx.lineTo((pts[i]+pts[i+1])/2, baseTop);
    }
    ctx.lineTo(rightX, baseTop);
    ctx.stroke();
  }

  function drawMushroom(ctx, w, h, p) {
    var stemX = w*0.32, stemW = w*0.36, stemY = h*0.55, stemH = h*0.35;
    var capCX = w/2, capCY = h*0.47, capRX = w*0.42, capRY = h*0.38;
    ctx.beginPath(); ctx.ellipse(capCX, capCY, capRX, capRY, 0, Math.PI, 0); ctx.stroke();
    ctx.beginPath(); ctx.rect(stemX, stemY, stemW, stemH); ctx.stroke();
    [[w*0.38,h*0.28],[w*0.6,h*0.22],[w*0.56,h*0.38]].forEach(function(s) {
      ctx.beginPath(); ctx.arc(s[0], s[1], w*0.048, 0, Math.PI*2); ctx.stroke();
    });
  }

  // ── Shape dispatcher ────────────────────────────────────────────────────────

  var SHAPE_DRAWERS = {
    cat_face: drawCatFace, house: drawHouse, star: drawStar, heart: drawHeart,
    fish: drawFish, bird: drawBird, tree: drawTree, sun: drawSun,
    cloud: drawCloud, moon: drawMoon, mountain: drawMountain, diamond: drawDiamond,
    arrow: drawArrow, spiral: drawSpiral, cross: drawCross, lightning: drawLightning,
    rabbit: drawRabbit, key: drawKey, crown: drawCrown, mushroom: drawMushroom,
  };

  function drawShape(ctx, type, params, w, h) {
    ctx.clearRect(0, 0, w, h);
    ctx.save();
    ctx.strokeStyle = '#ffffff';
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = Math.max(4, w * 0.04);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    var fn = SHAPE_DRAWERS[type];
    if (fn) fn(ctx, w, h, params || {});
    ctx.restore();
  }

  // ── Shape names ──────────────────────────────────────────────────────────────

  var FIXED_NAMES = {
    cat_face:'Cat Face', house:'House', heart:'Heart', fish:'Fish', bird:'Bird',
    cloud:'Cloud', rabbit:'Rabbit', key:'Key', mushroom:'Mushroom',
  };

  function computeShapeName(type, params) {
    params = params || {};
    switch (type) {
      case 'star':      return (params.points || 5) + '-Point Star';
      case 'spiral':    return (params.loops || 5) <= 4 ? 'Loose Spiral' : 'Tight Spiral';
      case 'cross':     return 'Cross';
      case 'diamond':   return (params.widthRatio || 1) > 1.0 ? 'Wide Diamond' : 'Diamond';
      case 'arrow':     return 'Arrow ' + (['→','←','↑','↓'][params.dir] || '→');
      case 'sun':       return 'Sun';
      case 'moon':      return 'Crescent Moon';
      case 'mountain':  return (params.peaks || 2) === 1 ? 'Mountain' : 'Mountains';
      case 'tree':      return 'Tree';
      case 'crown':     return 'Crown';
      case 'lightning': return 'Lightning Bolt';
      default:          return FIXED_NAMES[type] || type;
    }
  }

  // ── Pixel Comparison ────────────────────────────────────────────────────────

  function scorePhotoAgainstShape(videoEl, shape) {
    var SIZE = 128;

    var shapeOff = document.createElement('canvas');
    shapeOff.width = shapeOff.height = SIZE;
    var sc = shapeOff.getContext('2d');
    sc.fillStyle = '#fff'; sc.fillRect(0, 0, SIZE, SIZE);
    sc.save();
    sc.strokeStyle = '#000'; sc.fillStyle = 'rgba(0,0,0,0.15)';
    sc.lineWidth = Math.max(5, SIZE * 0.05);
    sc.lineCap = 'round'; sc.lineJoin = 'round';
    var fn = SHAPE_DRAWERS[shape.type];
    if (fn) fn(sc, SIZE, SIZE, shape.params || {});
    sc.restore();
    var shapeData = sc.getImageData(0, 0, SIZE, SIZE).data;

    var photoOff = document.createElement('canvas');
    photoOff.width = photoOff.height = SIZE;
    var pc = photoOff.getContext('2d');
    pc.fillStyle = '#fff'; pc.fillRect(0, 0, SIZE, SIZE);
    var vw = videoEl.videoWidth || 640, vh = videoEl.videoHeight || 480;
    var scale = Math.min(SIZE / vw, SIZE / vh);
    var pw = vw*scale, ph = vh*scale;
    pc.drawImage(videoEl, (SIZE-pw)/2, (SIZE-ph)/2, pw, ph);
    var photoData = pc.getImageData(0, 0, SIZE, SIZE).data;

    var shapeDark = 0, matches = 0;
    for (var i = 0; i < SIZE * SIZE; i++) {
      var si = i * 4;
      var sB = (shapeData[si] + shapeData[si+1] + shapeData[si+2]) / 3;
      var pB = (photoData[si] + photoData[si+1] + photoData[si+2]) / 3;
      if (sB < 180) { shapeDark++; if (pB < 160) matches++; }
    }
    if (shapeDark === 0) return 0;
    return Math.min(100, Math.round((matches / shapeDark) * 100));
  }

  // ── Camera ──────────────────────────────────────────────────────────────────

  function stopCamera() {
    if (cameraStream) {
      cameraStream.getTracks().forEach(function(t) { t.stop(); });
      cameraStream = null;
    }
  }

  // ── UI Helpers ───────────────────────────────────────────────────────────────

  function container() { return document.getElementById('game-container'); }

  function updateHeader() {
    var el = document.getElementById('sk-round');
    if (el) el.textContent = 'Round ' + (currentRound || 0) + ' / ' + (maxRounds || 3);
    var sc = document.getElementById('sk-scores');
    if (sc && roundWins && playerNames) {
      sc.textContent = playerNames.map(function(name, i) {
        return (i === myIdx ? 'You' : name) + ': ' + (roundWins[i] || 0);
      }).join(' | ');
    }
  }

  function setPhaseArea(html) {
    var el = document.getElementById('sk-phase-area');
    if (el) el.innerHTML = html;
  }

  function setStatus(txt) {
    var el = document.getElementById('sk-status');
    if (el) el.textContent = txt;
  }

  // ── Phase: Preview ───────────────────────────────────────────────────────────

  function showPreviewPhase(shape) {
    if (disposed) return;
    currentShape = shape;
    currentPhase = 'preview';
    inCameraPhase = false;
    updateHeader();

    var shapeName = computeShapeName(shape.type, shape.params);
    setPhaseArea(
      '<div class="sk-shape-wrap">' +
        '<canvas id="sk-shape-canvas" class="sketch-shape-canvas" width="260" height="260"></canvas>' +
        '<div class="sk-shape-label">' + shapeName + '</div>' +
      '</div>' +
      '<div class="sketch-timer-bar-wrap"><div class="sketch-timer-bar" id="sk-timer-bar" style="width:100%"></div></div>' +
      '<div id="sk-timer" class="sk-timer-text">' + (previewTime || 3) + 's</div>'
    );
    setStatus('Memorize this shape!');

    var canvas = document.getElementById('sk-shape-canvas');
    if (canvas) drawShape(canvas.getContext('2d'), shape.type, shape.params, 260, 260);
  }

  // ── Phase: Draw ─────────────────────────────────────────────────────────────

  function showDrawPhase() {
    if (disposed) return;
    currentPhase = 'draw';
    stopCamera();

    setPhaseArea(
      '<div class="sk-draw-instruction">✏️ Draw it on paper now!</div>' +
      '<div class="sketch-timer-bar-wrap"><div class="sketch-timer-bar" id="sk-timer-bar" style="width:100%"></div></div>' +
      '<div id="sk-timer" class="sk-timer-text">' + (drawTime || 15) + 's</div>' +
      '<button class="btn btn-secondary sk-done-btn" id="sk-done-btn">Done Drawing</button>'
    );
    setStatus('No peeking at the screen!');

    var btn = document.getElementById('sk-done-btn');
    if (btn) btn.addEventListener('click', function() {
      btn.disabled = true;
      btn.textContent = 'Submitted!';
      socket.emit('sketch:draw_done', { roomId: roomId });
      showCameraPhase();
    });
  }

  // ── Phase: Camera ────────────────────────────────────────────────────────────

  function showCameraPhase() {
    if (disposed || inCameraPhase) return;
    inCameraPhase = true;
    currentPhase = 'camera';

    setPhaseArea(
      '<div class="sk-camera-wrap">' +
        '<video id="sk-video" class="sketch-video" autoplay playsinline muted></video>' +
      '</div>' +
      '<button class="btn btn-primary sk-capture-btn" id="sk-capture-btn">📸 Capture Drawing</button>' +
      '<div id="sk-cam-status" class="sk-cam-status">Point camera at your drawing</div>'
    );
    setStatus('Time to scan your drawing!');

    var videoEl = document.getElementById('sk-video');
    var captureBtn = document.getElementById('sk-capture-btn');
    var camStatus = document.getElementById('sk-cam-status');

    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 640 } } })
      .then(function(stream) {
        if (disposed) { stream.getTracks().forEach(function(t) { t.stop(); }); return; }
        cameraStream = stream;
        videoEl.srcObject = stream;
      })
      .catch(function() {
        if (camStatus) camStatus.textContent = 'Camera unavailable — submitting score of 0';
        if (captureBtn) captureBtn.style.display = 'none';
        submitScore(0, null);
      });

    if (captureBtn) captureBtn.addEventListener('click', function() {
      captureBtn.disabled = true;
      var score = 0;
      if (videoEl && videoEl.videoWidth && currentShape) {
        score = scorePhotoAgainstShape(videoEl, currentShape);
      }
      var photoData = null;
      try {
        var off = document.createElement('canvas');
        var vw = videoEl.videoWidth || 640, vh = videoEl.videoHeight || 480;
        var scale = Math.min(1, 640 / vw);
        off.width = Math.round(vw*scale); off.height = Math.round(vh*scale);
        off.getContext('2d').drawImage(videoEl, 0, 0, off.width, off.height);
        photoData = off.toDataURL('image/jpeg', 0.6);
      } catch(e) {}

      stopCamera();
      submitScore(score, photoData);
      captureBtn.textContent = 'Photo submitted!';
      if (camStatus) camStatus.textContent = 'Waiting for opponent...';
    });
  }

  function submitScore(score, photoData) {
    socket.emit('sketch:photo_score', { roomId: roomId, score: score, photoData: photoData });
  }

  // ── Phase: Reveal ────────────────────────────────────────────────────────────

  function showRevealPhase(data) {
    if (disposed) return;
    currentPhase = 'reveal';
    stopCamera();
    inCameraPhase = false;

    var playerScores = data.playerScores || [];
    var winnerIndex  = data.winnerIndex;
    roundWins = data.roundWins || roundWins;
    var photos = data.photos || [];
    var shape  = data.shape || currentShape || { type: 'star', params: {} };

    function photoHTML(photo, name, score, won) {
      var border = won ? ' winner' : '';
      var badge  = won ? '<div class="sk-winner-badge">Winner! 🏆</div>' : '';
      var img    = photo
        ? '<img src="' + photo + '" alt="Drawing" class="sk-reveal-img">'
        : '<div class="sketch-missing-photo">No photo</div>';
      return '<div class="sketch-photo-panel' + border + '">' +
        badge + img +
        '<div class="sketch-photo-label">' + name + '</div>' +
        '<div class="sk-score-badge">' + score + '% match</div>' +
      '</div>';
    }

    var panelsHTML = playerNames.map(function(name, i) {
      return photoHTML(photos[i] || null, i === myIdx ? 'You (' + name + ')' : name, playerScores[i] || 0, i === winnerIndex);
    }).join('');

    var shapeCanvas = '<canvas id="sk-reveal-shape" class="sk-reveal-shape" width="80" height="80"></canvas>';
    var nextMsg = data.round >= data.maxRounds ? 'Final results coming...' : 'Next round in 5...';

    setPhaseArea(
      '<div class="sk-reveal-original">' + shapeCanvas +
        '<div class="sk-reveal-orig-label">Original: ' + computeShapeName(shape.type, shape.params) + '</div>' +
      '</div>' +
      '<div class="sketch-photo-row">' + panelsHTML + '</div>' +
      '<div class="sk-next-msg">' + nextMsg + '</div>'
    );

    var shapeCv = document.getElementById('sk-reveal-shape');
    if (shapeCv) drawShape(shapeCv.getContext('2d'), shape.type, shape.params, 80, 80);

    updateHeader();
    var myWon = winnerIndex === myIdx;
    setStatus(myWon ? 'You won this round! 🎉' : winnerIndex === -1 ? "It's a tie!" : (playerNames[winnerIndex] || 'Opponent') + ' won this round');
  }

  // ── Timer ─────────────────────────────────────────────────────────────────────

  function onTimer(data) {
    if (disposed) return;
    var maxes = { preview: previewTime || 3, draw: drawTime || 15, camera: 65 };
    var el = document.getElementById('sk-timer');
    if (el) el.textContent = data.timeLeft + 's';
    var bar = document.getElementById('sk-timer-bar');
    if (bar) bar.style.width = (data.timeLeft / (maxes[data.phase] || 15) * 100) + '%';
    if (data.phase === 'draw' && currentPhase === 'preview') showDrawPhase();
  }

  // ── Socket Handlers ──────────────────────────────────────────────────────────

  function onStartRound(data) {
    if (disposed) return;
    currentRound = data.round;
    maxRounds = data.maxRounds;
    roundWins = data.scores || roundWins;
    showPreviewPhase(data.shape);
  }

  function onGotoCamera() {
    if (disposed) return;
    if (currentPhase !== 'camera') showCameraPhase();
  }

  function onRoundResult(data) {
    if (disposed) return;
    showRevealPhase(data);
  }

  // ── Init & Cleanup ────────────────────────────────────────────────────────────

  function buildUI() {
    var c = container();
    if (!c) return;
    c.innerHTML =
      '<div class="sketch-wrap">' +
        '<div class="sketch-header">' +
          '<span id="sk-round">Round — / —</span>' +
          '<span id="sk-scores"></span>' +
        '</div>' +
        '<div id="sk-phase-area"></div>' +
        '<div id="sk-status" class="sketch-status"></div>' +
      '</div>';
  }

  function onGameStart(data) {
    disposed = false;
    inCameraPhase = false;
    myIdx = data.myPlayerIndex;
    roomId = data.roomId;
    playerNames = data.players.map(function(p) { return p.name; });
    maxRounds   = data.sketch ? data.sketch.maxRounds   : 3;
    drawTime    = data.sketch ? data.sketch.drawTime    : 15;
    previewTime = data.sketch ? data.sketch.previewTime : 3;
    roundWins   = data.sketch ? data.sketch.roundWins.slice() : new Array(data.players.length).fill(0);
    currentRound = 0;
    currentShape = null;

    buildUI();

    socket.on('sketch:start_round', onStartRound);
    socket.on('sketch:timer', onTimer);
    socket.on('sketch:goto_camera', onGotoCamera);
    socket.on('sketch:round_result', onRoundResult);

    setStatus('Get ready...');
  }

  function onReconnect(data) {
    onGameStart(data);
    if (data.sketch && data.sketch.phase) {
      currentPhase = data.sketch.phase;
      currentShape = data.sketch.shape || null;
      currentRound = data.sketch.round;
      roundWins = data.sketch.roundWins || new Array(playerNames.length).fill(0);
      if (data.sketch.phase === 'preview' || data.sketch.phase === 'draw') {
        showDrawPhase();
        setStatus('Reconnected — drawing phase in progress');
      } else if (data.sketch.phase === 'camera') {
        showCameraPhase();
      }
    }
  }

  function cleanup() {
    disposed = true;
    inCameraPhase = false;
    stopCamera();
    socket.off('sketch:start_round', onStartRound);
    socket.off('sketch:timer', onTimer);
    socket.off('sketch:goto_camera', onGotoCamera);
    socket.off('sketch:round_result', onRoundResult);
    var c = container();
    if (c) c.innerHTML = '';
  }

  window.gameClients = window.gameClients || {};
  window.gameClients.sketch = { onGameStart: onGameStart, onReconnect: onReconnect, cleanup: cleanup };
})();
