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
    p = p || {};
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
    // Whiskers: 2 or 3 per side
    var n = (p.whiskers === 3) ? 3 : 2;
    var wkY = n === 3
      ? [cy - r*0.04, cy + r*0.10, cy + r*0.22]
      : [cy + r*0.08, cy + r*0.22];
    for (var i = 0; i < n; i++) {
      ctx.beginPath(); ctx.moveTo(cx - r*0.12, wkY[i]); ctx.lineTo(cx - r*0.90, wkY[i] - r*0.07); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx + r*0.12, wkY[i]); ctx.lineTo(cx + r*0.90, wkY[i] - r*0.07); ctx.stroke();
    }
    // Mouth: smile arc or open/meow W-shape
    if (p.mouthOpen) {
      ctx.beginPath();
      ctx.moveTo(cx - r*0.28, cy + r*0.28);
      ctx.quadraticCurveTo(cx - r*0.1, cy + r*0.48, cx, cy + r*0.36);
      ctx.quadraticCurveTo(cx + r*0.1, cy + r*0.48, cx + r*0.28, cy + r*0.28);
      ctx.stroke();
    } else {
      ctx.beginPath(); ctx.arc(cx, cy + r*0.28, r*0.18, 0, Math.PI); ctx.stroke();
    }
  }

  function drawHouse(ctx, w, h, p) {
    p = p || {};
    var bx = w*0.15, by = h*0.45, bw = w*0.7, bh = h*0.42;
    ctx.beginPath(); ctx.rect(bx, by, bw, bh); ctx.stroke();
    // Roof
    ctx.beginPath(); ctx.moveTo(bx - w*0.04, by); ctx.lineTo(w/2, h*0.1); ctx.lineTo(bx+bw+w*0.04, by); ctx.stroke();
    // Door
    ctx.beginPath(); ctx.rect(w*0.41, by+bh*0.52, bw*0.18, bh*0.48); ctx.stroke();
    // Optional window
    if (p.hasWindow) {
      ctx.beginPath(); ctx.rect(w*0.20, by + bh*0.14, bw*0.19, bh*0.25); ctx.stroke();
    }
    // Optional chimney
    if (p.chimney) {
      var chX = w*0.63, chW = w*0.08;
      var roofYatCh = h*0.1 + (bx+bw+w*0.04 - chX) / (bx+bw+w*0.04 - w/2) * (h*0.1 - by) * (-1);
      // simpler: just place chimney above the roof line at a fixed offset
      ctx.beginPath(); ctx.rect(chX, h*0.06, chW, h*0.12); ctx.stroke();
    }
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
    p = p || {};
    // fatness: 0.82 (narrow) → 1.0 (normal) → 1.18 (wide/chubby)
    var f = p.fatness || 1.0;
    var cx = w/2, top = h*0.22, bot = h*0.85;
    var lx = cx * (2 - f), rx = w - lx; // push control points inward or outward
    ctx.beginPath();
    ctx.moveTo(cx, bot);
    ctx.bezierCurveTo(w*(0.02/f), h*0.58, w*(0.02/f), top, w*(0.14 + 0.14*f), top);
    ctx.bezierCurveTo(w*(0.30 + 0.10*f), top, cx, h*0.34, cx, h*0.34);
    ctx.bezierCurveTo(cx, h*0.34, w*(0.70 - 0.10*f), top, w*(0.86 - 0.14*f), top);
    ctx.bezierCurveTo(w*(1 - 0.02/f), top, w*(1 - 0.02/f), h*0.58, cx, bot);
    ctx.closePath(); ctx.fill(); ctx.stroke();
  }

  function drawFish(ctx, w, h, p) {
    p = p || {};
    var cx = w*0.46, cy = h/2, rx = w*0.32, ry = h*0.22;
    ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI*2); ctx.stroke();
    // Tail: triangle or forked
    var tailTip = w*0.94, tailSpread = ry*0.9;
    if (p.tailFork) {
      // Forked tail: two lobes with a notch
      ctx.beginPath();
      ctx.moveTo(cx+rx-w*0.06, cy);
      ctx.lineTo(tailTip, cy - tailSpread);
      ctx.lineTo(tailTip - w*0.08, cy - tailSpread*0.35);
      ctx.lineTo(tailTip - w*0.08, cy + tailSpread*0.35);
      ctx.lineTo(tailTip, cy + tailSpread);
      ctx.closePath(); ctx.stroke();
    } else {
      ctx.beginPath(); ctx.moveTo(cx+rx-w*0.06, cy); ctx.lineTo(tailTip, cy-tailSpread); ctx.lineTo(tailTip, cy+tailSpread); ctx.closePath(); ctx.stroke();
    }
    // Eye
    ctx.beginPath(); ctx.arc(cx-rx*0.5, cy-ry*0.25, rx*0.1, 0, Math.PI*2); ctx.fill(); ctx.stroke();
    // Optional dorsal fin
    if (p.hasTopFin) {
      ctx.beginPath();
      ctx.moveTo(cx - rx*0.1, cy - ry);
      ctx.quadraticCurveTo(cx + rx*0.1, cy - ry*1.65, cx + rx*0.35, cy - ry);
      ctx.stroke();
    }
  }

  function drawBird(ctx, w, h, p) {
    p = p || {};
    var cx = w/2, cy = h*0.5, r = w*0.28;
    if (p.flipped) {
      ctx.save();
      ctx.translate(w, 0);
      ctx.scale(-1, 1);
    }
    ctx.beginPath(); ctx.arc(cx, cy, r, Math.PI*0.25, Math.PI*1.75); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx-r*0.8, cy-r*0.15, r*0.55, Math.PI*0.6, Math.PI*1.9); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx+r*0.8, cy-r*0.15, r*0.55, Math.PI*1.1, Math.PI*2.4); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx-r*0.15, cy-r*0.55); ctx.lineTo(cx-r*0.52, cy-r*0.72); ctx.lineTo(cx-r*0.15, cy-r*0.32); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx-r*0.08, cy-r*0.3, r*0.08, 0, Math.PI*2); ctx.fill(); ctx.stroke();
    if (p.flipped) ctx.restore();
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
    p = p || {};
    var baseY = h * 0.62;
    var puffs = p.puffs || 5;
    if (puffs <= 3) {
      // Compact 3-puff cloud
      [[w*0.5, baseY-h*0.20, w*0.22],[w*0.28, baseY-h*0.04, w*0.15],[w*0.72, baseY-h*0.06, w*0.15]].forEach(function(a) {
        ctx.beginPath(); ctx.arc(a[0], a[1], a[2], 0, Math.PI*2); ctx.stroke();
      });
      ctx.beginPath(); ctx.moveTo(w*0.14, baseY); ctx.lineTo(w*0.86, baseY); ctx.stroke();
    } else {
      // Fluffy 5-puff cloud
      [[w*0.5, baseY-h*0.22, w*0.2],[w*0.3, baseY-h*0.1, w*0.16],[w*0.7, baseY-h*0.12, w*0.15],[w*0.18, baseY, w*0.12],[w*0.82, baseY, w*0.12]].forEach(function(a) {
        ctx.beginPath(); ctx.arc(a[0], a[1], a[2], 0, Math.PI*2); ctx.stroke();
      });
      ctx.beginPath(); ctx.moveTo(w*0.08, baseY); ctx.lineTo(w*0.92, baseY); ctx.stroke();
    }
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
    var shaftLen = p.shaftLen || 0.57;  // fraction of width used for shaft
    var cx = w/2, cy = h/2;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate([0, Math.PI, -Math.PI/2, Math.PI/2][dir] || 0);
    ctx.translate(-cx, -cy);
    var shaftY = h*0.1, tipX = w*0.88;
    var shaftEnd = w*(1 - shaftLen + 0.08);  // right edge of shaft body
    ctx.beginPath();
    ctx.moveTo(w*0.08, cy - shaftY*0.5); ctx.lineTo(shaftEnd, cy - shaftY*0.5);
    ctx.lineTo(shaftEnd, cy - shaftY);   ctx.lineTo(tipX, cy);
    ctx.lineTo(shaftEnd, cy + shaftY);   ctx.lineTo(shaftEnd, cy + shaftY*0.5);
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
    p = p || {};
    var cx = w/2, bodyY = h*0.64, headY = h*0.42;
    ctx.beginPath(); ctx.ellipse(cx, bodyY, w*0.26, h*0.24, 0, 0, Math.PI*2); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(cx, headY, w*0.18, h*0.17, 0, 0, Math.PI*2); ctx.stroke();
    // Ears: upright or floppy (one ear tilted outward)
    if (p.floppy) {
      // Left ear upright, right ear flopped to the side
      ctx.beginPath(); ctx.ellipse(cx-w*0.1, h*0.18, w*0.065, h*0.15, -0.2, 0, Math.PI*2); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(cx+w*0.22, h*0.26, w*0.065, h*0.12, 1.1, 0, Math.PI*2); ctx.stroke();
    } else {
      ctx.beginPath(); ctx.ellipse(cx-w*0.1, h*0.18, w*0.065, h*0.15, -0.2, 0, Math.PI*2); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(cx+w*0.1, h*0.18, w*0.065, h*0.15, 0.2, 0, Math.PI*2); ctx.stroke();
    }
    ctx.beginPath(); ctx.arc(cx-w*0.06, headY-h*0.03, w*0.025, 0, Math.PI*2); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx+w*0.06, headY-h*0.03, w*0.025, 0, Math.PI*2); ctx.fill(); ctx.stroke();
  }

  function drawKey(ctx, w, h, p) {
    p = p || {};
    var headCX = w*0.3, headCY = h/2, headR = h*0.23;
    ctx.beginPath(); ctx.arc(headCX, headCY, headR, 0, Math.PI*2); ctx.stroke();
    ctx.beginPath(); ctx.arc(headCX, headCY, headR*0.55, 0, Math.PI*2); ctx.stroke();
    var shaftY = h*0.47, shaftH = h*0.06;
    var shaftStartX = headCX + headR - 2;
    ctx.beginPath(); ctx.rect(shaftStartX, shaftY, w*0.45, shaftH); ctx.stroke();
    // Variable notches (1-3): evenly spaced teeth below the shaft
    var n = p.notches || 2;
    var spacing = w * 0.45 / (n + 1);
    var notchHeights = [h*0.10, h*0.07, h*0.10];
    for (var i = 0; i < n; i++) {
      var nx = shaftStartX + spacing * (i + 1) - w*0.025;
      ctx.beginPath(); ctx.rect(nx, shaftY + shaftH, w*0.05, notchHeights[i % notchHeights.length]); ctx.stroke();
    }
  }

  function drawCrown(ctx, w, h, p) {
    p = p || {};
    var nPts = Math.max(2, p.points || 5); // L8: guard against nPts=1 → division by zero in i/(nPts-1)
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
    p = p || {};
    var stemX = w*0.32, stemW = w*0.36, stemY = h*0.55, stemH = h*0.35;
    var capCX = w/2, capCY = h*0.47;
    var capWide = p.capWide || 1.0;
    var capRX = w * 0.42 * capWide, capRY = h*0.38;
    ctx.beginPath(); ctx.ellipse(capCX, capCY, capRX, capRY, 0, Math.PI, 0); ctx.stroke();
    ctx.beginPath(); ctx.rect(stemX, stemY, stemW, stemH); ctx.stroke();
    // Variable spots (2-5), arranged in a loose arc across the cap
    var spotCount = p.spots || 3;
    var spotPositions = [
      [0.38,0.28],[0.60,0.22],[0.56,0.38],[0.30,0.40],[0.70,0.35]
    ];
    for (var i = 0; i < Math.min(spotCount, spotPositions.length); i++) {
      ctx.beginPath(); ctx.arc(w*spotPositions[i][0], h*spotPositions[i][1], w*0.048, 0, Math.PI*2); ctx.stroke();
    }
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
      case 'tree':      return 'Tree (' + (params.layers || 2) + ' layers)';
      case 'crown':     return 'Crown';
      case 'lightning': return 'Lightning Bolt';
      case 'cat_face':  return params.mouthOpen ? 'Cat Face (meowing)' : 'Cat Face';
      case 'house':     return params.chimney ? 'House with Chimney' : 'House';
      case 'heart':     return (params.fatness || 1) > 1.08 ? 'Chubby Heart' : (params.fatness || 1) < 0.92 ? 'Slim Heart' : 'Heart';
      case 'fish':      return params.hasTopFin ? 'Fish with Fin' : 'Fish';
      case 'bird':      return 'Bird';
      case 'cloud':     return (params.puffs || 5) <= 3 ? 'Small Cloud' : 'Fluffy Cloud';
      case 'rabbit':    return params.floppy ? 'Rabbit (floppy ear)' : 'Rabbit';
      case 'key':       return 'Key (' + (params.notches || 2) + ' notches)';
      case 'mushroom':  return (params.capWide || 1) > 1.06 ? 'Wide Mushroom' : 'Mushroom';
      default:          return type;
    }
  }

  // ── Pixel Comparison ────────────────────────────────────────────────────────

  function scorePhotoAgainstShape(videoEl, shape) {
    var SIZE = 128;
    // Shape threshold: include anti-aliased stroke edges
    var SHAPE_THRESH = 180;
    // Photo threshold: loosened from 120 → 155 to catch pencil marks and dim lighting
    var PHOTO_THRESH = 155;

    // ── 1. Render reference shape: black stroke on white background ──
    var shapeCanvas = document.createElement('canvas');
    shapeCanvas.width = shapeCanvas.height = SIZE;
    var sc = shapeCanvas.getContext('2d');
    sc.fillStyle = '#fff'; sc.fillRect(0, 0, SIZE, SIZE);
    sc.strokeStyle = '#000'; sc.fillStyle = 'rgba(0,0,0,0.15)';
    sc.lineWidth = Math.max(5, SIZE * 0.05);
    sc.lineCap = 'round'; sc.lineJoin = 'round';
    var shapeFn = SHAPE_DRAWERS[shape.type];
    if (shapeFn) shapeFn(sc, SIZE, SIZE, shape.params || {});
    var shapeData = sc.getImageData(0, 0, SIZE, SIZE).data;

    // ── 2. Capture photo frame onto white background ──
    var photoCanvas = document.createElement('canvas');
    photoCanvas.width = photoCanvas.height = SIZE;
    var pc = photoCanvas.getContext('2d');
    pc.fillStyle = '#fff'; pc.fillRect(0, 0, SIZE, SIZE);
    var vw = videoEl.videoWidth || 640, vh = videoEl.videoHeight || 480;
    var fscl = Math.min(SIZE / vw, SIZE / vh);
    pc.drawImage(videoEl, (SIZE - vw * fscl) / 2, (SIZE - vh * fscl) / 2, vw * fscl, vh * fscl);
    var photoData = pc.getImageData(0, 0, SIZE, SIZE).data;

    // ── 3. Build binary pixel masks ──
    var shapePx    = new Uint8Array(SIZE * SIZE);
    var rawPhotoPx = new Uint8Array(SIZE * SIZE);
    var shapeDark = 0, photoDark = 0;
    for (var i = 0; i < SIZE * SIZE; i++) {
      var si = i * 4;
      if ((shapeData[si] + shapeData[si+1] + shapeData[si+2]) < SHAPE_THRESH * 3) { shapePx[i] = 1; shapeDark++; }
      if ((photoData[si] + photoData[si+1] + photoData[si+2]) < PHOTO_THRESH * 3) { rawPhotoPx[i] = 1; photoDark++; }
    }
    if (shapeDark === 0 || photoDark === 0) return 0;
    // If more than 55% of the photo is dark it's a dark environment/covered lens/table.
    // 40% was too aggressive — dim indoor lighting can push a valid drawing to 40–50% dark.
    // A pitch-black surface (the original bug) is ~100%, well above this threshold.
    if (photoDark > SIZE * SIZE * 0.55) return 0;

    // ── 4. Find the bounding box of the user's dark marks ──
    // Core problem without this: the reference shape fills the full 128×128 canvas,
    // but the user's drawing on paper occupies only ~30–60px of the canvas after
    // letterboxing the camera frame. This causes near-zero overlap even for perfect drawings.
    var pMinX = SIZE, pMaxX = -1, pMinY = SIZE, pMaxY = -1;
    for (var y = 0; y < SIZE; y++) {
      for (var x = 0; x < SIZE; x++) {
        if (!rawPhotoPx[y * SIZE + x]) continue;
        if (x < pMinX) pMinX = x; if (x > pMaxX) pMaxX = x;
        if (y < pMinY) pMinY = y; if (y > pMaxY) pMaxY = y;
      }
    }
    var pbW = pMaxX - pMinX + 1, pbH = pMaxY - pMinY + 1;

    // ── 5. Normalize: rescale the user's drawing region to fill the reference canvas ──
    // This corrects for the user drawing at a different position/scale than the reference.
    // Only normalize when the dark pixels form a concentrated region (not a dark background).
    //   < 25% of canvas is dark  → not a dark-background/bad-lighting situation
    //   bbox >= 10px across      → at least a minimal drawing was made
    //   bbox < 85% of canvas     → marks aren't spread across the whole image
    var photoPx = rawPhotoPx;
    var doNorm = photoDark < SIZE * SIZE * 0.25
              && pbW >= 10 && pbH >= 10
              && pbW < SIZE * 0.85 && pbH < SIZE * 0.85;
    if (doNorm) {
      var normCanvas = document.createElement('canvas');
      normCanvas.width = normCanvas.height = SIZE;
      var nc = normCanvas.getContext('2d');
      nc.fillStyle = '#fff'; nc.fillRect(0, 0, SIZE, SIZE);
      // Stretch the photo's detected drawing region to fill the entire reference canvas.
      // Canvas drawImage handles the interpolation, so thin strokes scale up naturally.
      nc.drawImage(photoCanvas, pMinX, pMinY, pbW, pbH, 0, 0, SIZE, SIZE);
      var normData = nc.getImageData(0, 0, SIZE, SIZE).data;
      photoPx = new Uint8Array(SIZE * SIZE);
      for (var i = 0; i < SIZE * SIZE; i++) {
        var si = i * 4;
        if ((normData[si] + normData[si+1] + normData[si+2]) < PHOTO_THRESH * 3) photoPx[i] = 1;
      }
    }

    // ── 6. Intersection over Union ──
    var inter = 0, union = 0;
    for (var i = 0; i < SIZE * SIZE; i++) {
      if (shapePx[i] || photoPx[i]) union++;
      if (shapePx[i] && photoPx[i]) inter++;
    }
    if (union === 0) return 0;
    var iou = inter / union;

    // Cube-root scale spreads scores more evenly across the range:
    //   IoU 0.00 (blank / totally wrong shape) → 0%
    //   IoU 0.05 (rough attempt)               → ~37%
    //   IoU 0.15 (recognisable)                → ~53%
    //   IoU 0.30 (decent match)                → ~67%
    //   IoU 0.50 (good match)                  → ~79%
    //   IoU 0.70 (great match)                 → ~89%
    //   IoU 0.90 (excellent)                   → ~97%
    return Math.min(100, Math.round(Math.cbrt(iou) * 100));
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
    if (btn) {
      btn.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      btn.addEventListener('click', function() {
        btn.disabled = true;
        btn.textContent = 'Submitted!';
        socket.emit('sketch:draw_done', { roomId: roomId });
        showCameraPhase();
      });
    }
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
      '<div id="sk-cam-status" class="sk-cam-status">Point camera at your drawing</div>' +
      '<div id="sk-cam-timer" class="sk-cam-timer">60s</div>'
    );
    setStatus('Time to scan your drawing!');

    // Client-side 60-second countdown matching the server's 65s timeout (5s buffer for latency)
    var camSecsLeft = 60;
    var camTimerEl = document.getElementById('sk-cam-timer');
    var camInterval = setInterval(function() {
      if (disposed || !document.getElementById('sk-cam-timer')) {
        clearInterval(camInterval);
        return;
      }
      camSecsLeft--;
      if (camTimerEl) {
        camTimerEl.textContent = camSecsLeft + 's';
        if (camSecsLeft <= 10) camTimerEl.classList.add('sk-cam-timer-urgent');
      }
      if (camSecsLeft <= 0) clearInterval(camInterval);
    }, 1000);

    var videoEl = document.getElementById('sk-video');
    var captureBtn = document.getElementById('sk-capture-btn');
    var camStatus = document.getElementById('sk-cam-status');

    // Keep Capture disabled until the video frame is actually live.
    // If tapped before the stream plays, videoWidth is 0 → score would always be 0
    // and the saved photo would be a blank canvas.
    if (captureBtn) {
      captureBtn.disabled = true;
      captureBtn.textContent = '⏳ Camera loading…';
    }

    function enableCapture() {
      if (disposed || !captureBtn || !document.getElementById('sk-capture-btn')) return;
      captureBtn.disabled = false;
      captureBtn.textContent = '📸 Capture Drawing';
    }

    // Fallback: enable after 6 seconds in case the 'playing' event never fires
    var enableFallback = setTimeout(enableCapture, 6000);

    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 640 } } })
      .then(function(stream) {
        if (disposed) { stream.getTracks().forEach(function(t) { t.stop(); }); return; }
        cameraStream = stream;
        videoEl.srcObject = stream;
        videoEl.addEventListener('playing', function() {
          clearTimeout(enableFallback);
          enableCapture();
        }, { once: true });
      })
      .catch(function() {
        clearTimeout(enableFallback);
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

    // C4: escape HTML to prevent XSS from malicious playerName values
    function escHtml(s) {
      return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }

    function photoHTML(photo, name, score, won) {
      var border = won ? ' winner' : '';
      var badge  = won ? '<div class="sk-winner-badge">Winner! 🏆</div>' : '';
      var img    = photo
        ? '<img src="' + photo + '" alt="Drawing" class="sk-reveal-img">'
        : '<div class="sketch-missing-photo">No photo</div>';
      return '<div class="sketch-photo-panel' + border + '">' +
        badge + img +
        '<div class="sketch-photo-label">' + escHtml(name) + '</div>' +
        '<div class="sk-score-badge">' + (score | 0) + '% match</div>' +
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
      '<div class="sketch-photo-row" data-players="' + playerNames.length + '">' + panelsHTML + '</div>' +
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
    if (data.phase === 'preview' && data.timeLeft <= 1) {
      setStatus('Shape disappearing…');
    }
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
    // Release any lingering camera stream and de-register stale handlers
    stopCamera();
    socket.off('sketch:start_round', onStartRound);
    socket.off('sketch:timer', onTimer);
    socket.off('sketch:goto_camera', onGotoCamera);
    socket.off('sketch:round_result', onRoundResult);

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
      if (data.sketch.phase === 'preview') {
        showPreviewPhase(currentShape);
        setStatus('Reconnected — memorize the shape!');
      } else if (data.sketch.phase === 'draw') {
        if (data.sketch.drawDone) {
          showCameraPhase();
        } else {
          showDrawPhase();
          setStatus('Reconnected — drawing phase in progress');
        }
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
