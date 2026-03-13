// public/games/sketch-client.js — Sketch It client

(function () {
  'use strict';

  // ── State ───────────────────────────────────────────────────────────────────
  var myIdx, roomId, playerNames, maxRounds, currentRound, roundWins;
  var drawTime, previewTime;
  var currentShapeKey, currentPhase;
  var cameraStream = null;
  var disposed = false;
  var inCameraPhase = false; // prevent duplicate camera entry

  // ── Shape Drawing Functions ─────────────────────────────────────────────────

  function drawCatFace(ctx, w, h) {
    var cx = w / 2, cy = h * 0.52, r = w * 0.36;
    // Head
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
    // Ears
    function ear(ox, oy, pts) {
      ctx.beginPath(); ctx.moveTo(pts[0], pts[1]);
      for (var i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i+1]);
      ctx.closePath(); ctx.stroke();
    }
    ear(0, 0, [cx - r * 0.55, cy - r * 0.78, cx - r * 0.75, cy - r * 1.28, cx - r * 0.2, cy - r * 0.85]);
    ear(0, 0, [cx + r * 0.55, cy - r * 0.78, cx + r * 0.75, cy - r * 1.28, cx + r * 0.2, cy - r * 0.85]);
    // Eyes
    ctx.beginPath(); ctx.arc(cx - r * 0.35, cy - r * 0.18, r * 0.1, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx + r * 0.35, cy - r * 0.18, r * 0.1, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    // Whiskers left
    ctx.beginPath(); ctx.moveTo(cx - r * 0.12, cy + r * 0.08); ctx.lineTo(cx - r * 0.85, cy); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx - r * 0.12, cy + r * 0.18); ctx.lineTo(cx - r * 0.85, cy + r * 0.25); ctx.stroke();
    // Whiskers right
    ctx.beginPath(); ctx.moveTo(cx + r * 0.12, cy + r * 0.08); ctx.lineTo(cx + r * 0.85, cy); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx + r * 0.12, cy + r * 0.18); ctx.lineTo(cx + r * 0.85, cy + r * 0.25); ctx.stroke();
    // Smile
    ctx.beginPath(); ctx.arc(cx, cy + r * 0.28, r * 0.18, 0, Math.PI); ctx.stroke();
  }

  function drawHouse(ctx, w, h) {
    var bx = w * 0.15, by = h * 0.45, bw = w * 0.7, bh = h * 0.42;
    // Body
    ctx.beginPath(); ctx.rect(bx, by, bw, bh); ctx.stroke();
    // Roof
    ctx.beginPath(); ctx.moveTo(bx - w * 0.04, by); ctx.lineTo(w / 2, h * 0.1); ctx.lineTo(bx + bw + w * 0.04, by); ctx.stroke();
    // Door
    ctx.beginPath(); ctx.rect(w * 0.41, by + bh * 0.52, bw * 0.18, bh * 0.48); ctx.stroke();
  }

  function drawStar(ctx, w, h) {
    var cx = w / 2, cy = h / 2, outerR = w * 0.4, innerR = w * 0.17;
    ctx.beginPath();
    for (var i = 0; i < 10; i++) {
      var angle = (i * Math.PI / 5) - Math.PI / 2;
      var r = i % 2 === 0 ? outerR : innerR;
      var x = cx + Math.cos(angle) * r, y = cy + Math.sin(angle) * r;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.closePath(); ctx.fill(); ctx.stroke();
  }

  function drawHeart(ctx, w, h) {
    var cx = w / 2, top = h * 0.22, bot = h * 0.85;
    ctx.beginPath();
    ctx.moveTo(cx, bot);
    ctx.bezierCurveTo(w * 0.02, h * 0.58, w * 0.02, top, w * 0.28, top);
    ctx.bezierCurveTo(w * 0.4, top, cx, h * 0.34, cx, h * 0.34);
    ctx.bezierCurveTo(cx, h * 0.34, w * 0.6, top, w * 0.72, top);
    ctx.bezierCurveTo(w * 0.98, top, w * 0.98, h * 0.58, cx, bot);
    ctx.closePath(); ctx.fill(); ctx.stroke();
  }

  function drawFish(ctx, w, h) {
    var cx = w * 0.46, cy = h / 2, rx = w * 0.32, ry = h * 0.22;
    // Body
    ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); ctx.stroke();
    // Tail
    ctx.beginPath(); ctx.moveTo(cx + rx - w * 0.06, cy); ctx.lineTo(w * 0.94, cy - ry * 0.9); ctx.lineTo(w * 0.94, cy + ry * 0.9); ctx.closePath(); ctx.stroke();
    // Eye
    ctx.beginPath(); ctx.arc(cx - rx * 0.5, cy - ry * 0.25, rx * 0.1, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  }

  function drawBird(ctx, w, h) {
    var cx = w / 2, cy = h * 0.5, r = w * 0.28;
    // Body arc
    ctx.beginPath(); ctx.arc(cx, cy, r, Math.PI * 0.25, Math.PI * 1.75); ctx.stroke();
    // Wing arcs
    ctx.beginPath(); ctx.arc(cx - r * 0.8, cy - r * 0.15, r * 0.55, Math.PI * 0.6, Math.PI * 1.9); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx + r * 0.8, cy - r * 0.15, r * 0.55, Math.PI * 1.1, Math.PI * 2.4); ctx.stroke();
    // Beak
    ctx.beginPath(); ctx.moveTo(cx - r * 0.15, cy - r * 0.55); ctx.lineTo(cx - r * 0.52, cy - r * 0.72); ctx.lineTo(cx - r * 0.15, cy - r * 0.32); ctx.closePath(); ctx.fill(); ctx.stroke();
    // Eye
    ctx.beginPath(); ctx.arc(cx - r * 0.08, cy - r * 0.3, r * 0.08, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  }

  function drawTree(ctx, w, h) {
    var cx = w / 2;
    // Canopy layers
    ctx.beginPath(); ctx.moveTo(cx, h * 0.07); ctx.lineTo(w * 0.18, h * 0.48); ctx.lineTo(w * 0.82, h * 0.48); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx, h * 0.28); ctx.lineTo(w * 0.13, h * 0.65); ctx.lineTo(w * 0.87, h * 0.65); ctx.closePath(); ctx.fill(); ctx.stroke();
    // Trunk
    ctx.beginPath(); ctx.rect(cx - w * 0.09, h * 0.65, w * 0.18, h * 0.27); ctx.stroke();
  }

  function drawSun(ctx, w, h) {
    var cx = w / 2, cy = h / 2, r = w * 0.22, rayLen = w * 0.15;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
    for (var i = 0; i < 8; i++) {
      var a = (i / 8) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * (r + 5), cy + Math.sin(a) * (r + 5));
      ctx.lineTo(cx + Math.cos(a) * (r + rayLen), cy + Math.sin(a) * (r + rayLen));
      ctx.stroke();
    }
  }

  function drawCloud(ctx, w, h) {
    var baseY = h * 0.62;
    var arcs = [
      [w * 0.5, baseY - h * 0.22, w * 0.2],
      [w * 0.3, baseY - h * 0.1, w * 0.16],
      [w * 0.7, baseY - h * 0.12, w * 0.15],
      [w * 0.18, baseY, w * 0.12],
      [w * 0.82, baseY, w * 0.12],
    ];
    arcs.forEach(function(a) {
      ctx.beginPath(); ctx.arc(a[0], a[1], a[2], 0, Math.PI * 2); ctx.stroke();
    });
    // Bottom flat line
    ctx.beginPath(); ctx.moveTo(w * 0.08, baseY); ctx.lineTo(w * 0.92, baseY); ctx.stroke();
  }

  function drawMoon(ctx, w, h) {
    var cx = w * 0.48, cy = h / 2, r = w * 0.32;
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.clip();
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
    // Cut-out circle
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath(); ctx.arc(cx + r * 0.45, cy - r * 0.1, r * 0.85, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    // Redraw visible crescent stroke
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, Math.PI * 0.55, Math.PI * 1.55, false); ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy, r, Math.PI * 1.55, Math.PI * 0.55, false); ctx.stroke();
    ctx.restore();
  }

  function drawMountain(ctx, w, h) {
    var base = h * 0.86;
    ctx.beginPath(); ctx.moveTo(w * 0.05, base); ctx.lineTo(w * 0.42, h * 0.1); ctx.lineTo(w * 0.72, base); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(w * 0.32, base); ctx.lineTo(w * 0.68, h * 0.3); ctx.lineTo(w * 0.96, base); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(w * 0.02, base); ctx.lineTo(w * 0.98, base); ctx.stroke();
  }

  function drawDiamond(ctx, w, h) {
    var cx = w / 2, cy = h / 2;
    ctx.beginPath();
    ctx.moveTo(cx, h * 0.1);
    ctx.lineTo(w * 0.88, cy);
    ctx.lineTo(cx, h * 0.9);
    ctx.lineTo(w * 0.12, cy);
    ctx.closePath(); ctx.fill(); ctx.stroke();
  }

  function drawArrow(ctx, w, h) {
    var cy = h / 2, shaftY = h * 0.1, tipX = w * 0.88;
    ctx.beginPath();
    // Shaft
    ctx.moveTo(w * 0.08, cy - shaftY * 0.5); ctx.lineTo(w * 0.65, cy - shaftY * 0.5);
    ctx.lineTo(w * 0.65, cy - shaftY); ctx.lineTo(tipX, cy); ctx.lineTo(w * 0.65, cy + shaftY);
    ctx.lineTo(w * 0.65, cy + shaftY * 0.5); ctx.lineTo(w * 0.08, cy + shaftY * 0.5);
    ctx.closePath(); ctx.fill(); ctx.stroke();
  }

  function drawSpiral(ctx, w, h) {
    var cx = w / 2, cy = h / 2;
    ctx.beginPath();
    for (var i = 0; i <= 200; i++) {
      var angle = (i / 200) * Math.PI * 6;
      var r = (i / 200) * w * 0.42;
      var x = cx + Math.cos(angle) * r, y = cy + Math.sin(angle) * r;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  function drawCross(ctx, w, h) {
    var arm = w * 0.22, thick = w * 0.18;
    var cx = w / 2, cy = h / 2;
    ctx.beginPath();
    ctx.rect(cx - thick / 2, cy - arm - thick / 2, thick, arm * 2 + thick);
    ctx.stroke();
    ctx.beginPath();
    ctx.rect(cx - arm - thick / 2, cy - thick / 2, arm * 2 + thick, thick);
    ctx.stroke();
  }

  function drawLightning(ctx, w, h) {
    ctx.beginPath();
    ctx.moveTo(w * 0.58, h * 0.06);
    ctx.lineTo(w * 0.28, h * 0.48);
    ctx.lineTo(w * 0.5, h * 0.48);
    ctx.lineTo(w * 0.22, h * 0.94);
    ctx.lineTo(w * 0.62, h * 0.52);
    ctx.lineTo(w * 0.42, h * 0.52);
    ctx.lineTo(w * 0.72, h * 0.06);
    ctx.closePath(); ctx.fill(); ctx.stroke();
  }

  function drawRabbit(ctx, w, h) {
    var cx = w / 2, bodyY = h * 0.64, headY = h * 0.42;
    // Body
    ctx.beginPath(); ctx.ellipse(cx, bodyY, w * 0.26, h * 0.24, 0, 0, Math.PI * 2); ctx.stroke();
    // Head
    ctx.beginPath(); ctx.ellipse(cx, headY, w * 0.18, h * 0.17, 0, 0, Math.PI * 2); ctx.stroke();
    // Ears
    ctx.beginPath(); ctx.ellipse(cx - w * 0.1, h * 0.18, w * 0.065, h * 0.15, -0.2, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(cx + w * 0.1, h * 0.18, w * 0.065, h * 0.15, 0.2, 0, Math.PI * 2); ctx.stroke();
    // Eye
    ctx.beginPath(); ctx.arc(cx - w * 0.06, headY - h * 0.03, w * 0.025, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx + w * 0.06, headY - h * 0.03, w * 0.025, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  }

  function drawKey(ctx, w, h) {
    var headCX = w * 0.3, headCY = h / 2, headR = h * 0.23;
    // Circle head
    ctx.beginPath(); ctx.arc(headCX, headCY, headR, 0, Math.PI * 2); ctx.stroke();
    // Inner circle
    ctx.beginPath(); ctx.arc(headCX, headCY, headR * 0.55, 0, Math.PI * 2); ctx.stroke();
    // Shaft
    var shaftY = h * 0.47, shaftH = h * 0.06;
    ctx.beginPath(); ctx.rect(headCX + headR - 2, shaftY, w * 0.45, shaftH); ctx.stroke();
    // Teeth
    ctx.beginPath(); ctx.rect(w * 0.67, shaftY + shaftH, w * 0.06, h * 0.1); ctx.stroke();
    ctx.beginPath(); ctx.rect(w * 0.78, shaftY + shaftH, w * 0.05, h * 0.07); ctx.stroke();
  }

  function drawCrown(ctx, w, h) {
    var base = h * 0.72, top = h * 0.22, bh = h * 0.28;
    // Base
    ctx.beginPath(); ctx.rect(w * 0.08, base - bh, w * 0.84, bh); ctx.stroke();
    // 5 points
    var pts = [0.08, 0.28, 0.5, 0.72, 0.92];
    ctx.beginPath();
    ctx.moveTo(w * 0.08, base - bh);
    ctx.lineTo(w * pts[0], top); ctx.lineTo(w * 0.28, base - bh);
    ctx.lineTo(w * pts[1], top); ctx.lineTo(w * 0.5,  base - bh);
    ctx.lineTo(w * pts[2], top); ctx.lineTo(w * 0.72, base - bh);
    ctx.lineTo(w * pts[3], top); ctx.lineTo(w * 0.92, base - bh);
    ctx.lineTo(w * pts[4], top); ctx.lineTo(w * 0.92, base - bh);
    ctx.stroke();
  }

  function drawMushroom(ctx, w, h) {
    var stemX = w * 0.32, stemW = w * 0.36, stemY = h * 0.55, stemH = h * 0.35;
    var capCX = w / 2, capCY = h * 0.47, capRX = w * 0.42, capRY = h * 0.38;
    // Cap (top half ellipse)
    ctx.beginPath(); ctx.ellipse(capCX, capCY, capRX, capRY, 0, Math.PI, 0); ctx.stroke();
    // Stem
    ctx.beginPath(); ctx.rect(stemX, stemY, stemW, stemH); ctx.stroke();
    // Spots
    [[w*0.38, h*0.28],[w*0.6, h*0.22],[w*0.56, h*0.38]].forEach(function(s) {
      ctx.beginPath(); ctx.arc(s[0], s[1], w * 0.048, 0, Math.PI * 2); ctx.stroke();
    });
  }

  var SHAPE_DRAWERS = {
    cat_face: drawCatFace, house: drawHouse, star: drawStar, heart: drawHeart,
    fish: drawFish, bird: drawBird, tree: drawTree, sun: drawSun,
    cloud: drawCloud, moon: drawMoon, mountain: drawMountain, diamond: drawDiamond,
    arrow: drawArrow, spiral: drawSpiral, cross: drawCross, lightning: drawLightning,
    rabbit: drawRabbit, key: drawKey, crown: drawCrown, mushroom: drawMushroom,
  };

  function drawShape(ctx, key, w, h) {
    ctx.clearRect(0, 0, w, h);
    ctx.save();
    ctx.strokeStyle = '#ffffff';
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = Math.max(4, w * 0.04);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    var fn = SHAPE_DRAWERS[key];
    if (fn) fn(ctx, w, h);
    ctx.restore();
  }

  // Shape name display
  var SHAPE_NAMES = {
    cat_face:'Cat Face', house:'House', star:'Star', heart:'Heart', fish:'Fish',
    bird:'Bird', tree:'Tree', sun:'Sun', cloud:'Cloud', moon:'Moon',
    mountain:'Mountain', diamond:'Diamond', arrow:'Arrow', spiral:'Spiral',
    cross:'Cross', lightning:'Lightning bolt', rabbit:'Rabbit', key:'Key',
    crown:'Crown', mushroom:'Mushroom',
  };

  // ── Pixel Comparison ────────────────────────────────────────────────────────

  function scorePhotoAgainstShape(videoEl, shapeKey) {
    var SIZE = 128;

    // 1. Render shape on white bg
    var shapeOff = document.createElement('canvas');
    shapeOff.width = shapeOff.height = SIZE;
    var sc = shapeOff.getContext('2d');
    sc.fillStyle = '#fff'; sc.fillRect(0, 0, SIZE, SIZE);
    sc.save();
    sc.strokeStyle = '#000'; sc.fillStyle = 'rgba(0,0,0,0.15)';
    sc.lineWidth = Math.max(5, SIZE * 0.05);
    sc.lineCap = 'round'; sc.lineJoin = 'round';
    var fn = SHAPE_DRAWERS[shapeKey];
    if (fn) fn(sc, SIZE, SIZE);
    sc.restore();
    var shapeData = sc.getImageData(0, 0, SIZE, SIZE).data;

    // 2. Draw camera frame scaled to SIZE × SIZE
    var photoOff = document.createElement('canvas');
    photoOff.width = photoOff.height = SIZE;
    var pc = photoOff.getContext('2d');
    pc.fillStyle = '#fff'; pc.fillRect(0, 0, SIZE, SIZE);
    var vw = videoEl.videoWidth || 640, vh = videoEl.videoHeight || 480;
    var scale = Math.min(SIZE / vw, SIZE / vh);
    var pw = vw * scale, ph = vh * scale;
    pc.drawImage(videoEl, (SIZE - pw) / 2, (SIZE - ph) / 2, pw, ph);
    var photoData = pc.getImageData(0, 0, SIZE, SIZE).data;

    // 3. Compare dark pixels
    var shapeDark = 0, matches = 0;
    for (var i = 0; i < SIZE * SIZE; i++) {
      var si = i * 4;
      var sB = (shapeData[si] + shapeData[si+1] + shapeData[si+2]) / 3;
      var pB = (photoData[si] + photoData[si+1] + photoData[si+2]) / 3;
      if (sB < 180) {
        shapeDark++;
        if (pB < 160) matches++;
      }
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

  function showPreviewPhase(shapeKey) {
    if (disposed) return;
    currentShapeKey = shapeKey;
    currentPhase = 'preview';
    inCameraPhase = false;
    updateHeader();

    var shapeName = SHAPE_NAMES[shapeKey] || shapeKey;
    setPhaseArea(
      '<div class="sk-shape-wrap">' +
        '<canvas id="sk-shape-canvas" class="sketch-shape-canvas" width="260" height="260"></canvas>' +
        '<div class="sk-shape-label">' + shapeName + '</div>' +
      '</div>' +
      '<div class="sketch-timer-bar-wrap"><div class="sketch-timer-bar" id="sk-timer-bar" style="width:100%"></div></div>' +
      '<div id="sk-timer" class="sk-timer-text">3s</div>'
    );
    setStatus('Memorize this shape!');

    var canvas = document.getElementById('sk-shape-canvas');
    if (canvas) {
      var ctx = canvas.getContext('2d');
      drawShape(ctx, shapeKey, 260, 260);
    }
  }

  // ── Phase: Draw ─────────────────────────────────────────────────────────────

  function showDrawPhase() {
    if (disposed) return;
    currentPhase = 'draw';
    stopCamera();

    setPhaseArea(
      '<div class="sk-draw-instruction">✏️ Draw it on paper now!</div>' +
      '<div class="sketch-timer-bar-wrap"><div class="sketch-timer-bar" id="sk-timer-bar" style="width:100%"></div></div>' +
      '<div id="sk-timer" class="sk-timer-text">30s</div>' +
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
      if (videoEl && videoEl.videoWidth) {
        score = scorePhotoAgainstShape(videoEl, currentShapeKey);
      }
      // Capture JPEG for relay
      var photoData = null;
      try {
        var off = document.createElement('canvas');
        var vw = videoEl.videoWidth || 640, vh = videoEl.videoHeight || 480;
        var scale = Math.min(1, 640 / vw);
        off.width = Math.round(vw * scale); off.height = Math.round(vh * scale);
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
    var winnerIndex = data.winnerIndex;
    roundWins = data.roundWins || roundWins;
    var photos = data.photos || [];

    function photoHTML(photo, name, score, won) {
      var border = won ? ' winner' : '';
      var badge = won ? '<div class="sk-winner-badge">Winner! 🏆</div>' : '';
      var img = photo
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

    var shapeHTML = '<canvas id="sk-reveal-shape" class="sk-reveal-shape" width="80" height="80"></canvas>';
    var nextMsg = data.round >= data.maxRounds ? 'Final results coming...' : 'Next round in 5...';

    setPhaseArea(
      '<div class="sk-reveal-original">' + shapeHTML + '<div class="sk-reveal-orig-label">Original: ' + (SHAPE_NAMES[data.shapeKey] || '') + '</div></div>' +
      '<div class="sketch-photo-row">' + panelsHTML + '</div>' +
      '<div class="sk-next-msg">' + nextMsg + '</div>'
    );

    var shapeCv = document.getElementById('sk-reveal-shape');
    if (shapeCv) {
      var sCtx = shapeCv.getContext('2d');
      drawShape(sCtx, data.shapeKey, 80, 80);
    }

    updateHeader();
    var myWon = winnerIndex === myIdx;
    setStatus(myWon ? 'You won this round! 🎉' : winnerIndex === -1 ? "It's a tie!" : playerNames[winnerIndex] + ' won this round');
  }

  // ── Timer ─────────────────────────────────────────────────────────────────────

  function onTimer(data) {
    if (disposed) return;
    var maxes = { preview: previewTime || 3, draw: drawTime || 30, camera: 65 };
    var el = document.getElementById('sk-timer');
    if (el) el.textContent = data.timeLeft + 's';
    var bar = document.getElementById('sk-timer-bar');
    if (bar) bar.style.width = (data.timeLeft / (maxes[data.phase] || 30) * 100) + '%';
    // Transition preview → draw on client when timer phase changes
    if (data.phase === 'draw' && currentPhase === 'preview') {
      showDrawPhase();
    }
  }

  // ── Socket Handlers ──────────────────────────────────────────────────────────

  function onStartRound(data) {
    if (disposed) return;
    currentRound = data.round;
    maxRounds = data.maxRounds;
    roundWins = data.scores || roundWins;
    showPreviewPhase(data.shapeKey);
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
    c.innerHTML = '';
    c.innerHTML =
      '<div class="sketch-wrap">' +
        '<div class="sketch-header">' +
          '<span id="sk-round">Round — / —</span>' +
          '<span id="sk-scores">You 0 — Opp 0</span>' +
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
    maxRounds    = data.sketch ? data.sketch.maxRounds   : 3;
    drawTime     = data.sketch ? data.sketch.drawTime    : 30;
    previewTime  = data.sketch ? data.sketch.previewTime : 3;
    roundWins = data.sketch ? data.sketch.roundWins.slice() : new Array(data.players.length).fill(0);
    currentRound = 0;

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
      currentShapeKey = data.sketch.shapeKey;
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
