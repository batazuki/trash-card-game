// public/games/ghost-client.js — Ghost Detective client
(function () {
  'use strict';

  // ── Constants (must match games/ghost.js) ────────────────────────────────
  const PLAYER_SPEED  = 180;   // px/s
  const PLAYER_R      = 14;
  const FLASH_RANGE   = 280;
  const FLASH_ANGLE   = Math.PI / 4.5;
  const BOARD_RANGE   = 90;    // px from ghost to place board
  const POS_SEND_MS   = 60;
  const T             = 32;    // tile size

  // ── Avatar definitions ──────────────────────────────────────────────────
  const AVATARS = [
    { name:'Pirate',   body:'#2a3a6a', hat:'#1a2040', acc:'#c8a820' },
    { name:'Explorer', body:'#8b4a18', hat:'#6a3510', acc:'#e8c840' },
    { name:'Police',   body:'#1a2a5a', hat:'#0a1530', acc:'#6090d8' },
    { name:'Doctor',   body:'#c8e4ef', hat:'#8ab4c8', acc:'#4488b0' },
  ];

  // Per-avatar stat multipliers (must match GHOST_AVATAR_DEFS in game.js and AVATAR_STATS in ghost.js)
  const AVATAR_STATS = [
    { flashMult: 1.00, emfMult: 1.00, soundMult: 1.00 },  // 0: Pirate
    { flashMult: 1.00, emfMult: 0.75, soundMult: 1.25 },  // 1: Explorer
    { flashMult: 1.25, emfMult: 1.00, soundMult: 0.75 },  // 2: Police
    { flashMult: 0.75, emfMult: 1.25, soundMult: 1.00 },  // 3: Doctor
  ];

  // ── Area definitions (obstacle arrays must be identical to ghost.js) ─────
  function rect(tx, ty, tw, th, type) {
    return { x: tx*T, y: ty*T, w: tw*T, h: th*T, type };
  }

  function buildGraveyardObs() {
    const o = [];
    // Border walls
    o.push(rect(0,0,80,1,'stone'),rect(0,59,80,1,'stone'),rect(0,0,1,60,'stone'),rect(79,0,1,60,'stone'));
    // Mausoleum
    o.push(rect(4,4,8,6,'stone'));
    // Iron arch gate near mausoleum
    o.push(rect(7,10,1,3,'arch'),rect(9,10,1,3,'arch'),rect(7,9,3,1,'arch'));
    // Group 1 tombstones (crosses)
    o.push(rect(14,8,1,2,'cross'),rect(18,8,1,2,'cross'),rect(22,8,1,2,'cross'));
    o.push(rect(14,13,1,2,'cross'),rect(18,13,1,2,'cross'),rect(22,13,1,2,'cross'));
    o.push(rect(26,8,1,2,'cross'),rect(26,13,1,2,'cross'));
    // Group 2 tombstones
    o.push(rect(50,6,1,2,'cross'),rect(54,6,1,2,'cross'),rect(58,6,1,2,'cross'),rect(62,6,1,2,'cross'));
    o.push(rect(50,11,1,2,'cross'),rect(54,11,1,2,'cross'),rect(58,11,1,2,'cross'),rect(66,6,1,2,'cross'));
    // Group 3 tombstones
    o.push(rect(10,35,1,2,'cross'),rect(14,35,1,2,'cross'),rect(18,35,1,2,'cross'));
    o.push(rect(10,40,1,2,'cross'),rect(14,40,1,2,'cross'),rect(18,40,1,2,'cross'));
    o.push(rect(22,35,1,2,'cross'),rect(22,40,1,2,'cross'));
    // Group 4 tombstones
    o.push(rect(45,38,1,2,'cross'),rect(49,38,1,2,'cross'),rect(53,38,1,2,'cross'),rect(57,38,1,2,'cross'));
    o.push(rect(45,43,1,2,'cross'),rect(49,43,1,2,'cross'),rect(53,43,1,2,'cross'),rect(61,38,1,2,'cross'));
    // Group 5 tombstones
    o.push(rect(30,22,1,2,'cross'),rect(34,22,1,2,'cross'),rect(38,22,1,2,'cross'),rect(42,22,1,2,'cross'));
    o.push(rect(30,27,1,2,'cross'),rect(34,27,1,2,'cross'),rect(38,27,1,2,'cross'),rect(42,27,1,2,'cross'));
    // Dead trees
    o.push(rect(36,5,1,3,'tree'),rect(68,12,1,3,'tree'),rect(3,25,1,3,'tree'));
    o.push(rect(70,38,1,3,'tree'),rect(28,50,1,3,'tree'),rect(60,52,1,3,'tree'));
    // Low stone walls
    o.push(rect(32,10,12,1,'stone'),rect(6,48,12,1,'stone'));
    o.push(rect(55,24,12,1,'stone'),rect(35,45,1,12,'stone'));
    // Iron fence sections along borders
    o.push(rect(13,2,6,1,'fence'),rect(25,2,6,1,'fence'),rect(45,2,6,1,'fence'),rect(60,2,6,1,'fence'));
    o.push(rect(13,57,6,1,'fence'),rect(35,57,6,1,'fence'),rect(55,57,6,1,'fence'));
    // Stone well
    o.push(rect(65,48,2,2,'well'));
    // Overgrown shrubs
    o.push(rect(48,20,1,1,'shrub'),rect(72,28,1,1,'shrub'),rect(15,52,1,1,'shrub'),rect(40,5,1,1,'shrub'));
    o.push(rect(8,18,1,1,'shrub'),rect(74,50,1,1,'shrub'),rect(56,35,1,1,'shrub'));
    // Torches (non-collidable decoration)
    o.push(rect(4,3,1,1,'torch'),rect(11,3,1,1,'torch'));
    o.push(rect(32,9,1,1,'torch'),rect(43,9,1,1,'torch'));
    o.push(rect(6,47,1,1,'torch'),rect(17,47,1,1,'torch'));
    return o;
  }

  function buildGardenObs() {
    const o = [];
    // Border hedges
    o.push(rect(0,0,100,1,'hedge'),rect(0,69,100,1,'hedge'),rect(0,0,1,70,'hedge'),rect(99,0,1,70,'hedge'));
    // Fountain center
    o.push(rect(46,31,8,8,'stone'));
    // Hedges H
    o.push(rect(10,15,12,1,'hedge'),rect(30,10,8,1,'hedge'),rect(60,18,10,1,'hedge'),rect(75,30,8,1,'hedge'));
    o.push(rect(20,45,14,1,'hedge'),rect(60,50,10,1,'hedge'),rect(38,58,8,1,'hedge'),rect(80,55,12,1,'hedge'));
    // Hedges V
    o.push(rect(25,20,1,8,'hedge'),rect(40,12,1,10,'hedge'),rect(70,25,1,8,'hedge'));
    o.push(rect(15,50,1,8,'hedge'),rect(55,35,1,8,'hedge'),rect(85,20,1,12,'hedge'),rect(35,42,1,8,'hedge'));
    // Flower beds
    o.push(rect(5,5,3,3,'flower'),rect(92,5,3,3,'flower'),rect(5,62,3,3,'flower'));
    o.push(rect(92,62,3,3,'flower'),rect(20,30,3,3,'flower'),rect(74,55,3,3,'flower'));
    // Trees
    o.push(rect(3,3,2,2,'tree'),rect(95,3,2,2,'tree'),rect(3,65,2,2,'tree'));
    o.push(rect(95,65,2,2,'tree'),rect(47,3,2,2,'tree'),rect(47,65,2,2,'tree'));
    // Garden benches
    o.push(rect(12,8,3,1,'bench'),rect(72,12,3,1,'bench'),rect(8,38,3,1,'bench'));
    o.push(rect(88,40,3,1,'bench'),rect(50,60,3,1,'bench'),rect(28,62,3,1,'bench'));
    // Gas lamp posts
    o.push(rect(8,8,1,2,'lamp'),rect(90,8,1,2,'lamp'),rect(8,60,1,2,'lamp'),rect(90,60,1,2,'lamp'));
    o.push(rect(49,28,1,2,'lamp'),rect(49,42,1,2,'lamp'));
    // Stone statues
    o.push(rect(22,18,2,3,'statue'),rect(72,50,2,3,'statue'));
    // Birdbaths
    o.push(rect(18,62,2,2,'birdbath'),rect(78,8,2,2,'birdbath'));
    // Gazebo pillars
    o.push(rect(42,22,1,2,'pillar'),rect(45,22,1,2,'pillar'),rect(48,22,1,2,'pillar'),rect(51,22,1,2,'pillar'));
    o.push(rect(42,26,1,2,'pillar'),rect(45,26,1,2,'pillar'),rect(48,26,1,2,'pillar'),rect(51,26,1,2,'pillar'));
    return o;
  }

  function buildHouseObs() {
    const o = [];
    // Outer walls
    o.push(rect(0,0,60,1,'stone'),rect(0,79,60,1,'stone'),rect(0,0,1,80,'stone'),rect(59,0,1,80,'stone'));
    // Ground floor dividers
    o.push(rect(1,15,9,1,'stone'),rect(13,15,7,1,'stone'),rect(21,15,38,1,'stone'));
    o.push(rect(20,1,1,14,'stone'),rect(40,1,1,39,'stone'));
    // Stairwell divider
    o.push(rect(1,39,27,1,'stone'),rect(33,39,26,1,'stone'));
    // Basement divider
    o.push(rect(30,40,1,40,'stone'));
    // Basement horizontal walls
    o.push(rect(1,55,13,1,'stone'),rect(18,55,12,1,'stone'),rect(32,55,27,1,'stone'));
    // Ground floor room 1: fireplace + chairs
    o.push(rect(2,2,4,2,'fireplace'));
    o.push(rect(8,2,2,1,'chair'),rect(10,2,2,1,'chair'));
    // Ground floor room 2: table + chairs
    o.push(rect(22,3,5,2,'table'));
    o.push(rect(22,2,1,1,'chair'),rect(24,2,1,1,'chair'),rect(26,2,1,1,'chair'));
    o.push(rect(22,5,1,1,'chair'),rect(24,5,1,1,'chair'),rect(26,5,1,1,'chair'));
    // Ground floor room 3: bookshelves + mirror
    o.push(rect(42,1,1,6,'shelf'),rect(55,1,1,6,'shelf'));
    o.push(rect(47,1,2,2,'mirror'));
    // Mid floor: clock + table + chair
    o.push(rect(2,20,1,2,'clock'),rect(5,20,3,2,'table'));
    o.push(rect(10,20,2,1,'chair'));
    // Staircase sections
    o.push(rect(28,37,2,2,'stairs'),rect(30,37,2,2,'stairs'));
    // Basement left: workbench + shelf
    o.push(rect(2,42,5,2,'table'),rect(2,47,1,4,'shelf'));
    o.push(rect(10,42,2,1,'chair'));
    // Basement right: table + shelves
    o.push(rect(33,42,5,2,'table'));
    o.push(rect(50,42,1,6,'shelf'),rect(53,42,1,6,'shelf'));
    return o;
  }

  const AREA_DEFS = {
    graveyard: {
      areaWidth: 2560, areaHeight: 1920, bgColor: '#1a2e1a', label: 'Graveyard',
      playerStart: { x:1280, y:960 }, obstacles: buildGraveyardObs(),
      obsColors: { stone:'#6a6a6a', tree:'#3a2510', cross:'#9a9a8a', fence:'#505058',
                   well:'#7a7a7a', torch:'#b05820', shrub:'#2a5a1a', arch:'#7a6a58',
                   default:'#5a5a5a' },
      pathColor: '#243524',
    },
    garden: {
      areaWidth: 3200, areaHeight: 2240, bgColor: '#2d4a1e', label: 'Garden',
      playerStart: { x:1120, y:1120 }, obstacles: buildGardenObs(),
      obsColors: { hedge:'#1a4010', flower:'#8b3a6a', tree:'#3a2510', stone:'#7a7a5a',
                   bench:'#8b6a40', lamp:'#c0a850', statue:'#a09080', birdbath:'#7090a0',
                   pillar:'#c8b878', default:'#2a5018' },
      pathColor: '#3d5a2a',
    },
    house: {
      areaWidth: 1920, areaHeight: 2560, bgColor: '#1a1510', label: 'Old House',
      playerStart: { x:960, y:640 }, obstacles: buildHouseObs(),
      obsColors: { stone:'#4a3a2a', wood:'#6b4a1a', table:'#7a5030', chair:'#5a3a18',
                   shelf:'#3a2810', fireplace:'#5a3020', clock:'#3a2a10', mirror:'#8080a8',
                   stairs:'#5a4838', default:'#3a2a1a' },
      pathColor: '#251c14',
    },
  };

  // ── Collision ────────────────────────────────────────────────────────────
  const NON_COLLIDABLE = new Set(['torch', 'candle']);
  function isBlocked(x, y, r, obstacles) {
    for (const o of obstacles) {
      if (NON_COLLIDABLE.has(o.type)) continue;
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
  // speed: how fast it chases the target (0 = frozen, 0.15 = snappy)
  // momentum: fraction of velocity kept each frame (higher = overshoots more)
  const PCFG = {
    shy:      { speed: 0.04,  momentum: 0.55, dwellMs: 1300 },
    dramatic: { speed: 0.06,  momentum: 0.50, dwellMs: 1000 },
    goofy:    { speed: 0.10,  momentum: 0.35, dwellMs: 750  },
    grumpy:   { speed: 0.09,  momentum: 0.45, dwellMs: 600  },
    regal:    { speed: 0.025, momentum: 0.60, dwellMs: 1600 },
    confused: { speed: 0.12,  momentum: 0.20, dwellMs: 900  },
  };

  // ── Module state ─────────────────────────────────────────────────────────
  let canvas, ctx, darkCanvas, darkCtx;
  let S = null;          // all game state (null when inactive)
  let animFrame = null;
  let lastTs = 0;
  let posSendAccum = 0;
  let cssW = 0, cssH = 0, dpr = 1;
  let mmOpen = true;
  let fogGrid = null, fogGridW = 0, fogGridH = 0;
  const FOG_CELL = 64;

  // ── Ghost Audio ───────────────────────────────────────────────────────────
  const GA = {
    ctx: null, master: null, delay: null,
    persist: [],      // always-on oscillator nodes
    emfOsc: null, emfGain: null,
    sndOsc: null, sndGain: null,
    presOsc: null, presGain: null,  // always-on ghost proximity oscillator
    timers: [],       // music scheduling setTimeout handles
    lastMoanSig: 0,   // track signal level for moan trigger
  };

  function gaInit(area) {
    if (GA.ctx) return;
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      GA.ctx = ctx;
      GA.area = area || 'graveyard';

      const master = ctx.createGain();
      master.gain.value = 0.38;
      master.connect(ctx.destination);
      GA.master = master;

      // Reverb: simple feedback delay network
      const dly = ctx.createDelay(1.8); dly.delayTime.value = 0.68;
      const fb  = ctx.createGain();     fb.gain.value  = 0.44;
      const dOut = ctx.createGain();    dOut.gain.value = 0.25;
      dly.connect(fb); fb.connect(dly);
      dly.connect(dOut); dOut.connect(master);
      GA.delay = dly;

      // Drones: area-specific tritone pairs for atmosphere
      const DRONE_PAIRS = {
        graveyard: [[36.71, 0.060, 0.048], [51.91, 0.036, 0.073]], // D1+Ab1 — classic unease
        garden:    [[41.20, 0.050, 0.052], [55.00, 0.032, 0.065]], // E1+A1  — eerie pastoral
        house:     [[30.87, 0.065, 0.041], [46.25, 0.040, 0.079]], // B0+Bb1 — deep dread
      };
      const dronePair = DRONE_PAIRS[GA.area] || DRONE_PAIRS.graveyard;
      dronePair.forEach(([f, vol, lfoHz]) => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        const lfo = ctx.createOscillator(), lg = ctx.createGain();
        o.type = 'sine'; o.frequency.value = f; g.gain.value = vol;
        lfo.type = 'sine'; lfo.frequency.value = lfoHz; lg.gain.value = f * 0.016;
        lfo.connect(lg); lg.connect(o.frequency);
        o.connect(g); g.connect(master);
        lfo.start(); o.start();
        GA.persist.push(o, lfo);
      });

      // EMF buzz oscillator — gain/freq driven per frame
      const emfO = ctx.createOscillator(), emfG = ctx.createGain();
      emfO.type = 'sawtooth'; emfO.frequency.value = 100; emfG.gain.value = 0;
      emfO.connect(emfG); emfG.connect(master);
      emfO.start(); GA.persist.push(emfO);
      GA.emfOsc = emfO; GA.emfGain = emfG;

      // Sound-recorder rumble oscillator
      const sndO = ctx.createOscillator(), sndG = ctx.createGain();
      sndO.type = 'sine'; sndO.frequency.value = 50; sndG.gain.value = 0;
      sndO.connect(sndG); sndG.connect(master);
      sndO.start(); GA.persist.push(sndO);
      GA.sndOsc = sndO; GA.sndGain = sndG;

      // Ghost presence oscillator — always on, scales with proximity regardless of active tool
      const presO = ctx.createOscillator(), presG = ctx.createGain();
      presO.type = 'sine'; presO.frequency.value = 38; presG.gain.value = 0;
      presO.connect(presG); presG.connect(master);
      presO.start(); GA.persist.push(presO);
      GA.presOsc = presO; GA.presGain = presG;

      // Hook so game.js toggleMusic() can mute/unmute ghost audio too
      window._ghostAudioSetMute = muted => {
        if (GA.master) GA.master.gain.setTargetAtTime(muted ? 0 : 0.38, GA.ctx.currentTime, 0.12);
      };

      // Kick off music loops
      gaMusicPulse(ctx.currentTime + 1.0);
      gaMusicBell(ctx.currentTime + 3.0 + Math.random() * 3);
      gaMusicChord(ctx.currentTime + 8.0 + Math.random() * 5);
    } catch(e) {}
  }

  function gaStop() {
    GA.timers.forEach(clearTimeout); GA.timers = [];
    GA.persist.forEach(o => { try { o.stop(); } catch(_) {} }); GA.persist = [];
    GA.emfOsc = GA.emfGain = GA.sndOsc = GA.sndGain = GA.presOsc = GA.presGain = null;
    GA.lastMoanSig = 0;
    if (GA.ctx) { GA.ctx.close().catch(() => {}); GA.ctx = null; GA.master = null; GA.delay = null; }
    window._ghostAudioSetMute = null;
  }

  // Fire-and-forget note: freq, waveform, peak-vol, attack, hold, decay, destination, startTime
  function gaN(f, type, vol, att, hold, dec, dest, t) {
    const ctx = GA.ctx; if (!ctx) return;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.value = f;
    o.connect(g); g.connect(dest || GA.master);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + att);
    if (hold > 0) g.gain.setValueAtTime(vol, t + att + hold);
    g.gain.exponentialRampToValueAtTime(0.0001, t + att + hold + dec);
    o.start(t); o.stop(t + att + hold + dec + 0.1);
  }

  // Area-specific note pools
  const GA_NOTE_POOLS = {
    graveyard: {
      bass:   [73.42, 110.00, 146.83],                          // D2 A2 D3 — D minor
      bells:  [293.66, 349.23, 440.00, 523.25, 587.33, 698.46], // D4 F4 A4 C5 D5 F5
      chords: [[146.83,174.61,207.65],[110.00,130.81,155.56],[196.00,220.00,261.63]],
      bassInterval: [2.0, 3.5], bellInterval: [4.5, 9.0], chordInterval: [10, 14],
    },
    garden: {
      bass:   [98.00, 130.81, 164.81],                           // G2 C3 E3 — Gm
      bells:  [392.00, 466.16, 523.25, 622.25, 698.46, 783.99], // G4 Bb4 C5 Eb5 F5 G5
      chords: [[196.00,233.08,293.66],[261.63,311.13,392.00],[196.00,246.94,329.63]],
      bassInterval: [1.5, 2.5], bellInterval: [3.0, 7.0], chordInterval: [8, 12],
    },
    house: {
      bass:   [61.74, 92.50, 123.47],                            // B1 F#2 B2 — B dim
      bells:  [246.94, 311.13, 369.99, 493.88, 622.25, 739.99], // B3 Eb4 F#4 B4 Eb5 F#5
      chords: [[123.47,155.56,184.99],[185.00,220.00,261.63],[246.94,311.13,369.99]],
      bassInterval: [2.5, 4.5], bellInterval: [5.0, 11.0], chordInterval: [12, 18],
    },
  };

  function gaPool() {
    return GA_NOTE_POOLS[GA.area] || GA_NOTE_POOLS.graveyard;
  }

  function gaMusicPulse(t) {
    if (!GA.ctx) return;
    const pool = gaPool();
    const f = pool.bass[Math.floor(Math.random() * pool.bass.length)];
    gaN(f, 'triangle', 0.09, 0.04, 0.06, 1.8, GA.master, t);
    gaN(f, 'sawtooth', 0.03, 0.04, 0.06, 0.9, GA.delay,  t);
    const dt = pool.bassInterval[0] + Math.random() * pool.bassInterval[1];
    GA.timers.push(setTimeout(() => gaMusicPulse(t + dt),
      Math.max(50, (t + dt - GA.ctx.currentTime - 0.4) * 1000)));
  }

  function gaMusicBell(t) {
    if (!GA.ctx) return;
    const pool = gaPool();
    const f = pool.bells[Math.floor(Math.random() * pool.bells.length)];
    gaN(f,     'sine', 0.055, 0.005, 0.05, 4.2, GA.delay, t);
    gaN(f * 2, 'sine', 0.020, 0.005, 0.05, 2.6, GA.delay, t);
    const dt = pool.bellInterval[0] + Math.random() * pool.bellInterval[1];
    GA.timers.push(setTimeout(() => gaMusicBell(t + dt),
      Math.max(50, (t + dt - GA.ctx.currentTime - 0.4) * 1000)));
  }

  function gaMusicChord(t) {
    if (!GA.ctx) return;
    const pool = gaPool();
    const notes = pool.chords[Math.floor(Math.random() * pool.chords.length)];
    notes.forEach(f => gaN(f, 'sine', 0.034, 0.40, 0.30, 4.2, GA.delay, t));
    const dt = pool.chordInterval[0] + Math.random() * pool.chordInterval[1];
    GA.timers.push(setTimeout(() => gaMusicChord(t + dt),
      Math.max(50, (t + dt - GA.ctx.currentTime - 0.4) * 1000)));
  }

  // Ghost moan — triggered when signal crosses threshold
  function gaGhostMoan() {
    if (!GA.ctx) return;
    const t = GA.ctx.currentTime;
    // Low-pitched wavering moan
    const o = GA.ctx.createOscillator(), g = GA.ctx.createGain();
    const lfo = GA.ctx.createOscillator(), lg = GA.ctx.createGain();
    o.type = 'sine'; o.frequency.value = 120;
    lfo.type = 'sine'; lfo.frequency.value = 3.5; lg.gain.value = 18;
    lfo.connect(lg); lg.connect(o.frequency);
    o.connect(g); g.connect(GA.delay || GA.master);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.22, t + 0.4);
    g.gain.setValueAtTime(0.22, t + 0.9);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 2.8);
    lfo.start(t); o.start(t);
    lfo.stop(t + 2.9); o.stop(t + 2.9);
  }

  // Called every frame — drives EMF/sound signal oscillators + ambient ghost presence
  function gaSignals(signals, tool) {
    if (!GA.ctx || !GA.emfGain || !GA.sndGain) return;
    const ct = GA.ctx.currentTime;

    // Tool-gated EMF / sound instruments (higher volumes for audibility)
    if (tool === 'emf') {
      const sig = (signals.emf || 0) / 100;
      GA.emfGain.gain.setTargetAtTime(sig * 0.22, ct, 0.07);
      GA.emfOsc.frequency.setTargetAtTime(80 + sig * 200, ct, 0.07);
      GA.sndGain.gain.setTargetAtTime(0, ct, 0.07);
    } else if (tool === 'sound') {
      const sig = (signals.sound || 0) / 100;
      GA.sndGain.gain.setTargetAtTime(sig * 0.18, ct, 0.10);
      GA.sndOsc.frequency.setTargetAtTime(40 + sig * 80, ct, 0.10);
      GA.emfGain.gain.setTargetAtTime(0, ct, 0.07);
    } else {
      GA.emfGain.gain.setTargetAtTime(0, ct, 0.06);
      GA.sndGain.gain.setTargetAtTime(0, ct, 0.08);
    }

    // Always-on ghost proximity hum (strongest signal regardless of tool)
    if (GA.presGain) {
      const proxSig = Math.max((signals.emf || 0), (signals.sound || 0)) / 100;
      GA.presGain.gain.setTargetAtTime(proxSig * 0.14, ct, 0.15);
      if (GA.presOsc) GA.presOsc.frequency.setTargetAtTime(30 + proxSig * 28, ct, 0.15);

      // Trigger moan when signal rises above 0.55 and was previously below 0.4
      if (proxSig > 0.55 && GA.lastMoanSig < 0.4) gaGhostMoan();
      GA.lastMoanSig = proxSig;
    }
  }

  // SFX — tool switch click
  function gaSfxTool() {
    if (!GA.ctx) return;
    const t = GA.ctx.currentTime;
    gaN(1400, 'sine', 0.055, 0.002, 0.01, 0.07, GA.master, t);
    gaN(900,  'sine', 0.028, 0.002, 0.01, 0.05, GA.master, t + 0.04);
  }

  // SFX — ghost detected by flashlight
  function gaSfxGhostFound() {
    if (!GA.ctx) return;
    const t = GA.ctx.currentTime;
    gaN(55, 'sine', 0.18, 0.01, 0.05, 2.2, GA.master, t);
    [[207.65, 0], [261.63, 0.15], [369.99, 0.30]].forEach(([f, dt]) =>
      gaN(f, 'sine', 0.11, 0.02, 0.07, 1.6, GA.delay, t + dt));
  }

  // SFX — ghost fully identified
  function gaSfxIdentified() {
    if (!GA.ctx) return;
    const t = GA.ctx.currentTime;
    [293.66, 349.23, 440.00, 587.33, 880.00].forEach((f, i) => {
      gaN(f, 'sine',     0.09, 0.012, 0.06, 1.1, GA.delay,  t + i * 0.13);
      gaN(f, 'triangle', 0.05, 0.012, 0.06, 0.5, GA.master, t + i * 0.13);
    });
  }

  // SFX — wrong name submitted
  function gaSfxWrong() {
    if (!GA.ctx) return;
    const t = GA.ctx.currentTime;
    gaN(233.08, 'sawtooth', 0.09, 0.004, 0.07, 0.28, GA.master, t);
    gaN(174.61, 'sawtooth', 0.07, 0.004, 0.07, 0.24, GA.master, t + 0.19);
  }

  // SFX — ouija planchette lands on a letter
  function gaSfxOuija(isReal) {
    if (!GA.ctx) return;
    const t = GA.ctx.currentTime;
    if (isReal) {
      gaN(880,  'sine', 0.07, 0.003, 0.02, 0.75, GA.delay, t);
      gaN(1320, 'sine', 0.03, 0.003, 0.02, 0.42, GA.delay, t);
    } else {
      gaN(330, 'triangle', 0.03, 0.002, 0.01, 0.10, GA.master, t);
    }
  }

  // Virtual joystick
  const joy = { active: false, id: null, bx: 0, by: 0, dx: 0, dy: 0, angle: 0, mag: 0 };

  // Walk animation phase (increments with distance moved)
  let walkPhase = 0;

  // Suppress synthetic click events that follow touchstart on mobile
  let _lastTouchEndMs = 0;

  // ── Canvas setup ─────────────────────────────────────────────────────────
  function setupCanvas() {
    const container = document.getElementById('game-container');
    container.innerHTML = '';
    canvas = document.createElement('canvas');
    canvas.style.cssText = 'position:absolute;top:0;left:0;right:0;bottom:0;touch-action:none;';
    container.style.position = 'relative';
    container.appendChild(canvas);
    ctx = canvas.getContext('2d');

    darkCanvas = document.createElement('canvas');
    darkCtx = darkCanvas.getContext('2d');

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    canvas.addEventListener('touchstart',  onTouchStart,  { passive: false });
    canvas.addEventListener('touchmove',   onTouchMove,   { passive: false });
    canvas.addEventListener('touchend',    onTouchEnd,    { passive: false });
    canvas.addEventListener('touchcancel', onTouchCancel, { passive: false });
    canvas.addEventListener('touchstart', onTap,        { passive: false });
    // Desktop fallback
    canvas.addEventListener('mousedown', onMouseDown);
    canvas.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('mouseup',   onMouseUp);
    canvas.addEventListener('click',     onCanvasClick);
  }

  function resizeCanvas() {
    const c = canvas.parentElement;
    cssW = c.clientWidth  || window.innerWidth;
    cssH = c.clientHeight || window.innerHeight;
    canvas.width      = cssW;
    canvas.height     = cssH;
    darkCanvas.width  = cssW;
    darkCanvas.height = cssH;
  }

  // ── Input: touch joystick ────────────────────────────────────────────────
  function onTouchStart(e) {
    e.preventDefault();
    gaInit(S && S.area); // start audio on first user gesture
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
    _lastTouchEndMs = Date.now();
    for (const t of e.changedTouches) {
      if (t.identifier === joy.id) { joy.active = false; joy.mag = 0; }
    }
  }
  function onTouchCancel(e) {
    // OS interrupted the touch (notification, gesture, etc.) — release joystick
    for (const t of e.changedTouches) {
      if (t.identifier === joy.id) { joy.active = false; joy.mag = 0; }
    }
  }
  // Desktop fallback
  let mouseJoy = false;
  function onMouseDown(e) { gaInit(S && S.area); if (e.clientX < canvas.clientWidth * 0.5 && !(S && S.ouija)) { mouseJoy = true; Object.assign(joy, { active:true, bx:e.clientX, by:e.clientY, dx:0, dy:0, angle:0, mag:0 }); } }
  function onCanvasClick(e) {
    if (!S) return;
    // Ignore synthetic click events generated by touch (follow touchend within 500ms)
    if (Date.now() - _lastTouchEndMs < 500) return;
    handleTap(e.clientX, e.clientY);
  }
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
    const tx = cx, ty = cy;
    const cw = cssW, ch = cssH;

    if (S.ouija) { handleOuijaTap(tx, ty, cw, ch); return; }

    // Signal button
    const sbX2 = 128, sbY2 = 8, sbW2 = 52, sbH2 = 32;
    if (tx >= sbX2 && tx <= sbX2+sbW2 && ty >= sbY2 && ty <= sbY2+sbH2) {
      if (!S.signalCooldown || S.signalCooldown <= 0) {
        socket.emit('ghost:signal', { roomId: S.roomId });
        S.signalCooldown = 12000;
        // Show a brief flash on your own screen
        S.attemptsMsg = '📣 Signal sent!';
        clearTimeout(S.attemptsMsgTimer);
        S.attemptsMsgTimer = setTimeout(() => { if (S) S.attemptsMsg = null; }, 1500);
      }
      return;
    }

    // Journal button (top-right)
    const jbX = cw - 44, jbY = 8, jbW = 36, jbH = 32;
    if (tx >= jbX && tx <= jbX+jbW && ty >= jbY && ty <= jbY+jbH) {
      S.journal = !S.journal; return;
    }
    // If journal open, any other tap closes it
    if (S.journal) { S.journal = false; return; }

    // Map toggle button
    const tbW = 28, tbH = 22, tbX = cw - tbW - 6, tbY = ch - tbH - 6;
    if (tx >= tbX && tx <= tbX+tbW && ty >= tbY && ty <= tbY+tbH) {
      mmOpen = !mmOpen; return;
    }

    // Tool bar (bottom-center)
    const tools = ['flashlight','emf','sound'];
    const bw = 70, bh = 52, gap = 8;
    const barW = tools.length * bw + (tools.length-1) * gap;
    const barX = (cw - barW) / 2, barY = ch - bh - 10;
    tools.forEach((t, i) => {
      const bx = barX + i*(bw+gap);
      if (tx >= bx && tx <= bx+bw && ty >= barY && ty <= barY+bh) {
        if (S.activeTool !== t) { gaSfxTool(); S.activeTool = t; }
      }
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
      walkPhase += spd * dt * 0.12;
    }

    // Camera (smooth follow)
    const cw = cssW, ch = cssH;
    const tx = S.me.x - cw/2, ty = S.me.y - ch/2;
    if (!S.cam) S.cam = { x: tx, y: ty };
    S.cam.x += (tx - S.cam.x) * 0.12;
    S.cam.y += (ty - S.cam.y) * 0.12;
    S.cam.x = Math.max(0, Math.min(area.areaWidth  - cw, S.cam.x));
    S.cam.y = Math.max(0, Math.min(area.areaHeight - ch, S.cam.y));

    // Update fog-of-war grid (reveal radii scaled by avatar stats)
    if (fogGrid) {
      const avSt = AVATAR_STATS[S.me.avatar || 0] || AVATAR_STATS[0];
      const emfReveal = (S.hasEMFUpgrade ? 900 : 450) * avSt.emfMult;
      const revR = S.activeTool === 'flashlight' ? FLASH_RANGE * avSt.flashMult :
                   S.activeTool === 'emf' ? emfReveal : 350 * avSt.soundMult;
      const markCircle = (wx, wy, r) => {
        const gcx = Math.floor(wx / FOG_CELL), gcy = Math.floor(wy / FOG_CELL);
        const gcr = Math.ceil(r / FOG_CELL) + 1;
        for (let gy = Math.max(0, gcy-gcr); gy <= Math.min(fogGridH-1, gcy+gcr); gy++) {
          for (let gx = Math.max(0, gcx-gcr); gx <= Math.min(fogGridW-1, gcx+gcr); gx++) {
            if (Math.hypot((gx+0.5)*FOG_CELL - wx, (gy+0.5)*FOG_CELL - wy) <= r)
              fogGrid[gy * fogGridW + gx] = 1;
          }
        }
      };
      markCircle(S.me.x, S.me.y, revR);
      for (const p of Object.values(S.otherPlayers)) markCircle(p.x, p.y, 80);
    }

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
      socket.emit('ghost:move', { roomId: S.roomId, x: S.me.x, y: S.me.y, facing: S.me.facing, avatar: S.me.avatar });
    }

    // Drive signal-reactive audio (EMF buzz / sound rumble)
    gaSignals(S.signals, S.activeTool);

    // Tick signal cooldown
    if (S.signalCooldown > 0) S.signalCooldown = Math.max(0, S.signalCooldown - dt * 1000);

    // Check POI proximity
    S.activePoi = null;
    for (const poi of (S.pois || [])) {
      if (Math.hypot(poi.x - S.me.x, poi.y - S.me.y) < 65) {
        S.activePoi = poi;
        poi.read = true;
        break;
      }
    }
  }

  // ── Avatar sprites ────────────────────────────────────────────────────────
  function facingToDir(angle) {
    const a = ((angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    if (a < Math.PI * 0.25 || a >= Math.PI * 1.75) return 'right';
    if (a < Math.PI * 0.75) return 'down';
    if (a < Math.PI * 1.25) return 'left';
    return 'up';
  }

  function drawAvatarHat(ctx, idx, av, dir) {
    switch (idx) {
      case 0: { // Pirate - tricorn hat
        ctx.fillStyle = av.hat;
        // Brim
        ctx.beginPath(); ctx.ellipse(0, -3, 10, 2.8, 0, 0, Math.PI * 2); ctx.fill();
        // Crown
        ctx.beginPath();
        ctx.moveTo(-6, -4); ctx.lineTo(-7, -12); ctx.lineTo(0, -15); ctx.lineTo(7, -12); ctx.lineTo(6, -4);
        ctx.closePath(); ctx.fill();
        // Gold band
        ctx.strokeStyle = av.acc; ctx.lineWidth = 1.8;
        ctx.beginPath(); ctx.moveTo(-6, -7); ctx.lineTo(6, -7); ctx.stroke();
        // Skull & crossbones (tiny)
        ctx.fillStyle = av.acc; ctx.font = 'bold 7px sans-serif'; ctx.textAlign = 'center';
        ctx.fillText('☠', 0, -9.5);
        break;
      }
      case 1: { // Explorer - pith helmet
        ctx.fillStyle = av.hat;
        // Wide brim
        ctx.beginPath(); ctx.ellipse(0, -3, 11, 3.2, 0, 0, Math.PI * 2); ctx.fill();
        // Dome crown
        ctx.beginPath(); ctx.arc(0, -7, 7, Math.PI, Math.PI * 2); ctx.fill();
        ctx.fillRect(-7, -7, 14, 4);
        // Center ridge line
        ctx.strokeStyle = av.acc; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(0, -14); ctx.lineTo(0, -3); ctx.stroke();
        // Side vent dots
        ctx.fillStyle = av.acc;
        ctx.beginPath(); ctx.arc(-4, -8, 1, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(4, -8, 1, 0, Math.PI * 2); ctx.fill();
        break;
      }
      case 2: { // Police - peaked cap
        ctx.fillStyle = av.hat;
        // Crown
        ctx.beginPath(); ctx.arc(0, -7, 6.5, Math.PI, Math.PI * 2); ctx.fill();
        ctx.fillRect(-6.5, -7, 13, 4);
        // Peak brim (direction aware)
        const peakDir = (dir === 'left') ? -1 : 1;
        ctx.beginPath(); ctx.ellipse(peakDir * 5.5, -3.5, 5.5, 2, 0, 0, Math.PI * 2); ctx.fill();
        // Hat band
        ctx.fillStyle = av.acc;
        ctx.fillRect(-6.5, -5, 13, 1.8);
        // Badge
        ctx.fillStyle = '#ffe040';
        ctx.beginPath(); ctx.arc(0, -9, 2.2, 0, Math.PI * 2); ctx.fill();
        break;
      }
      case 3: { // Doctor - surgical cap + headband
        ctx.fillStyle = av.hat;
        // Soft cap dome
        ctx.beginPath(); ctx.arc(0, -7, 7, Math.PI, Math.PI * 2); ctx.fill();
        ctx.fillRect(-7, -7, 14, 5);
        // Headband (contrasting color)
        ctx.fillStyle = av.acc;
        ctx.fillRect(-7, -3, 14, 2.5);
        // Cap fold line
        ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(-7, -7); ctx.lineTo(7, -7); ctx.stroke();
        // Tiny red cross emblem
        ctx.fillStyle = '#e83040';
        ctx.fillRect(-1, -10, 2, 6);
        ctx.fillRect(-3, -8, 6, 2);
        break;
      }
    }
  }

  function drawAvatar(ctx, cx, cy, dir, wPhase, bob, avatarIdx, isMe) {
    const av = AVATARS[avatarIdx % AVATARS.length];
    const walkBob = Math.abs(Math.sin(wPhase * Math.PI * 2)) * 1.5;
    const totalBob = walkBob + bob;

    ctx.save();
    ctx.translate(cx, cy);

    // Shadow (fixed to ground — does not bob with character)
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.ellipse(0, 13, 10, 3.5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;

    ctx.save();
    ctx.translate(0, totalBob);

    // Body circle
    ctx.fillStyle = av.body;
    ctx.beginPath(); ctx.arc(0, 0, 12, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = isMe ? '#ffffff' : 'rgba(255,255,255,0.5)';
    ctx.lineWidth = isMe ? 2.5 : 1.5;
    ctx.stroke();

    // Head offset per direction
    let hx = 0, hy = -8;
    if (dir === 'right') { hx = 4; hy = -7; }
    else if (dir === 'left') { hx = -4; hy = -7; }
    else if (dir === 'up') { hx = 0; hy = -11; }

    // Head (skin)
    ctx.fillStyle = '#f0c080';
    ctx.beginPath(); ctx.arc(hx, hy, 5.5, 0, Math.PI * 2); ctx.fill();

    // Eyes (not shown when facing up)
    if (dir !== 'up') {
      ctx.fillStyle = '#1a1020';
      const eo = dir === 'right' ? 1 : dir === 'left' ? -1 : 0;
      ctx.beginPath(); ctx.arc(hx - 1.5 + eo, hy - 1.5, 1.3, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(hx + 1.5 + eo, hy - 1.5, 1.3, 0, Math.PI * 2); ctx.fill();
    }

    // Hat
    ctx.save(); ctx.translate(hx, hy);
    drawAvatarHat(ctx, avatarIdx % AVATARS.length, av, dir);
    ctx.restore();

    ctx.restore(); // un-bob
    ctx.restore(); // un-translate
  }

  // ── Render ───────────────────────────────────────────────────────────────
  function render() {
    if (!S || !canvas) return;
    const cw = cssW, ch = cssH;

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
    drawPOIPanel(cw, ch);
    drawPlayerSignals(cw, ch);
    drawJoystick(cw, ch);
    if (S.reveal) drawReveal(cw, ch);
  }

  function drawWorld() {
    const area = AREA_DEFS[S.area];
    const now = Date.now();
    ctx.fillStyle = area.bgColor;
    ctx.fillRect(0, 0, area.areaWidth, area.areaHeight);

    ctx.fillStyle = area.pathColor;
    ctx.fillRect(32, 32, area.areaWidth-64, area.areaHeight-64);
    ctx.fillStyle = area.bgColor;
    ctx.fillRect(64, 64, area.areaWidth-128, area.areaHeight-128);

    for (const ob of area.obstacles) {
      drawObstacle(ob, area, now);
    }
    drawPOIs();
    drawPickups();
  }

  function drawPOIs() {
    if (!S.pois) return;
    const now = Date.now();
    for (const poi of S.pois) {
      const sx = poi.x;   // already in world space (inside ctx.translate)
      const sy = poi.y;
      const pulse = 0.6 + 0.4 * Math.sin(now * 0.0025 + poi.id * 1.3);
      const alpha = poi.read ? 0.35 : pulse;
      ctx.save();
      ctx.globalAlpha = alpha;
      // Glow ring
      const glow = ctx.createRadialGradient(sx, sy, 0, sx, sy, 18);
      glow.addColorStop(0, 'rgba(200,160,255,0.6)');
      glow.addColorStop(1, 'rgba(200,160,255,0)');
      ctx.fillStyle = glow;
      ctx.beginPath(); ctx.arc(sx, sy, 18, 0, Math.PI * 2); ctx.fill();
      // Symbol
      ctx.fillStyle = poi.read ? '#9070b0' : '#d4a0ff';
      ctx.font = `bold ${14}px Georgia,serif`;
      ctx.textAlign = 'center';
      ctx.fillText('?', sx, sy + 5);
      ctx.restore();
    }
  }

  function drawPickups() {
    if (!S.cam) return;
    const now = Date.now();
    const pulse = 0.5 + 0.5 * Math.sin(now * 0.004);

    if (S.keyAvailable && S.keyPos) {
      const kx = S.keyPos.x;   // already in world space
      const ky = S.keyPos.y;
      ctx.save();
      const g = ctx.createRadialGradient(kx, ky, 0, kx, ky, 22 + pulse * 8);
      g.addColorStop(0, `rgba(255,215,0,${0.55 + pulse * 0.3})`);
      g.addColorStop(1, 'rgba(255,215,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(kx, ky, 22 + pulse * 8, 0, Math.PI * 2); ctx.fill();
      ctx.font = '16px serif'; ctx.textAlign = 'center';
      ctx.fillText('🗝', kx, ky + 6);
      ctx.restore();
    }

    if (S.powerupAvailable && S.powerupPos) {
      const px = S.powerupPos.x;   // already in world space
      const py = S.powerupPos.y;
      const hasK = S.hasKey;
      ctx.save();
      ctx.globalAlpha = hasK ? 1 : 0.4;
      const g2 = ctx.createRadialGradient(px, py, 0, px, py, 24 + pulse * 10);
      g2.addColorStop(0, `rgba(0,255,136,${0.55 + pulse * 0.3})`);
      g2.addColorStop(1, 'rgba(0,255,136,0)');
      ctx.fillStyle = g2;
      ctx.beginPath(); ctx.arc(px, py, 24 + pulse * 10, 0, Math.PI * 2); ctx.fill();
      ctx.font = '15px serif'; ctx.textAlign = 'center';
      ctx.fillText('⚡', px, py + 5);
      // Lock icon if no key
      if (!hasK) {
        ctx.font = '10px serif';
        ctx.fillStyle = '#aaa'; ctx.globalAlpha = 0.7;
        ctx.fillText('🔒', px + 14, py - 8);
      }
      ctx.restore();
    }
  }

  function drawObstacle(ob, area, now) {
    const { x, y, w, h, type } = ob;
    const colors = area.obsColors || {};
    const col = colors[type] || colors.default || '#5a5a5a';
    switch (type) {
      case 'cross':    drawCross(x, y, w, h, col); break;
      case 'fence':    drawFence(x, y, w, h, col); break;
      case 'well':     drawWell(x, y, w, h, col); break;
      case 'torch':
      case 'candle':   drawTorch(x, y, w, h, now); break;
      case 'shrub':    drawShrub(x, y, w, h, col); break;
      case 'arch':     drawArch(x, y, w, h, col); break;
      case 'bench':    drawBench(x, y, w, h, col); break;
      case 'lamp':     drawLamp(x, y, w, h, col, now); break;
      case 'statue':   drawStatue(x, y, w, h, col); break;
      case 'birdbath': drawBirdbath(x, y, w, h, col); break;
      case 'pillar':   drawPillar(x, y, w, h, col); break;
      case 'table':    drawTable(x, y, w, h, col); break;
      case 'chair':    drawChair(x, y, w, h, col); break;
      case 'shelf':    drawShelf(x, y, w, h, col); break;
      case 'fireplace':drawFireplace(x, y, w, h, col, now); break;
      case 'clock':    drawClock(x, y, w, h, col); break;
      case 'mirror':   drawMirror(x, y, w, h, col); break;
      case 'stairs':   drawStairs(x, y, w, h, col); break;
      default:
        ctx.fillStyle = col;
        ctx.fillRect(x, y, w, h);
        ctx.fillStyle = 'rgba(255,255,255,0.1)';
        ctx.fillRect(x, y, w, 2);
    }
  }

  function drawCross(x, y, w, h, col) {
    ctx.fillStyle = col;
    const bw = Math.max(3, Math.round(w * 0.28));
    const cx2 = x + w/2 - bw/2;
    ctx.fillRect(cx2, y, bw, h);
    ctx.fillRect(x, y + h * 0.3, w, bw);
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fillRect(cx2, y, bw, 2);
  }

  function drawFence(x, y, w, h, col) {
    ctx.fillStyle = col;
    ctx.fillRect(x, y + 3, w, 2);
    ctx.fillRect(x, y + h - 5, w, 2);
    const nPosts = Math.max(2, Math.round(w / 14));
    const sp = w / nPosts;
    for (let i = 0; i <= nPosts; i++) {
      const px = Math.round(x + i * sp);
      ctx.fillStyle = col;
      ctx.fillRect(px - 2, y, 4, h);
      ctx.fillStyle = '#b0b0c0';
      ctx.beginPath();
      ctx.moveTo(px - 3, y + 4); ctx.lineTo(px, y - 3); ctx.lineTo(px + 3, y + 4);
      ctx.fill();
    }
  }

  function drawWell(x, y, w, h, col) {
    ctx.fillStyle = col;
    ctx.fillRect(x, y + 8, w, h - 8);
    ctx.fillStyle = '#2a1a0a';
    ctx.beginPath(); ctx.ellipse(x+w/2, y+8, w/2-2, 6, 0, 0, Math.PI*2); ctx.fill();
    ctx.strokeStyle = '#8a8a8a'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(x+w/2, y+8, w/2-2, 6, 0, 0, Math.PI*2); ctx.stroke();
    ctx.fillStyle = '#5a3a1a';
    ctx.fillRect(x+w/2-3, y-8, 5, 18);
    ctx.fillRect(x+2, y-10, w-4, 5);
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(x, y+8, w, 2);
  }

  function drawTorch(x, y, w, h, now) {
    const flicker = 0.7 + 0.3 * Math.sin(now * 0.008 + x);
    const cx2 = x + w/2;
    ctx.fillStyle = '#5a3a1a';
    ctx.fillRect(cx2 - 3, y + h*0.3, 5, h*0.7);
    ctx.fillStyle = '#c06020';
    ctx.fillRect(cx2 - 5, y + h*0.15, 10, h*0.25);
    const fg = ctx.createRadialGradient(cx2, y + h*0.15, 0, cx2, y + h*0.15, 18 * flicker);
    fg.addColorStop(0, `rgba(255,200,60,${(0.85*flicker).toFixed(2)})`);
    fg.addColorStop(0.5, `rgba(255,100,20,${(0.5*flicker).toFixed(2)})`);
    fg.addColorStop(1, 'rgba(255,80,10,0)');
    ctx.fillStyle = fg;
    ctx.beginPath(); ctx.arc(cx2, y + h*0.1, 18 * flicker, 0, Math.PI*2); ctx.fill();
  }

  function drawShrub(x, y, w, h, col) {
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.arc(x + w*0.35, y + h*0.6, w*0.38, 0, Math.PI*2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x + w*0.65, y + h*0.55, w*0.35, 0, Math.PI*2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x + w*0.5, y + h*0.35, w*0.32, 0, Math.PI*2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.1)';
    ctx.beginPath(); ctx.arc(x + w*0.4, y + h*0.3, w*0.15, 0, Math.PI*2); ctx.fill();
  }

  function drawArch(x, y, w, h, col) {
    ctx.fillStyle = col;
    const pw = Math.max(4, Math.round(w * 0.28));
    ctx.fillRect(x, y, pw, h);
    ctx.fillRect(x + w - pw, y, pw, h);
    ctx.fillRect(x, y, w, Math.round(h * 0.28));
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(x, y, w, 2);
  }

  function drawBench(x, y, w, h, col) {
    ctx.fillStyle = col;
    ctx.fillRect(x, y + 2, w, h - 8);
    ctx.fillStyle = '#6a5030';
    ctx.fillRect(x + 4, y + h - 6, 6, 6);
    ctx.fillRect(x + w - 10, y + h - 6, 6, 6);
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.fillRect(x, y + 2, w, 2);
  }

  function drawLamp(x, y, w, h, col, now) {
    const flicker = 0.85 + 0.15 * Math.sin(now * 0.005 + x * 0.01);
    ctx.fillStyle = '#3a3a3a';
    ctx.fillRect(x + w/2 - 3, y + 10, 5, h - 10);
    ctx.fillRect(x + 2, y + h - 6, w - 4, 4);
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.arc(x + w/2, y + 7, 8, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = `rgba(255,230,120,${(0.7 * flicker).toFixed(2)})`;
    ctx.beginPath(); ctx.arc(x + w/2, y + 7, 5, 0, Math.PI*2); ctx.fill();
    ctx.strokeStyle = '#808060'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(x + w/2, y + 7, 8, 0, Math.PI*2); ctx.stroke();
  }

  function drawStatue(x, y, w, h, col) {
    ctx.fillStyle = col;
    ctx.fillRect(x, y + h - 10, w, 10);
    ctx.fillRect(x + 4, y + h - 18, w - 8, 10);
    ctx.fillStyle = '#b8a888';
    ctx.beginPath(); ctx.arc(x + w/2, y + 8, w*0.28, 0, Math.PI*2); ctx.fill();
    ctx.fillRect(x + w/2 - w*0.22, y + 14, w*0.44, h*0.42);
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(x, y + h - 10, w, 2);
  }

  function drawBirdbath(x, y, w, h, col) {
    ctx.fillStyle = col;
    ctx.fillRect(x + w/2 - 4, y + 10, 7, h - 10);
    ctx.fillRect(x + w/2 - 5, y + h - 6, 10, 6);
    ctx.fillStyle = '#8090b0';
    ctx.beginPath(); ctx.ellipse(x+w/2, y+10, w/2-2, 7, 0, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#5070a0';
    ctx.beginPath(); ctx.ellipse(x+w/2, y+10, w/2-6, 4, 0, 0, Math.PI*2); ctx.fill();
  }

  function drawPillar(x, y, w, h, col) {
    const pw = Math.max(3, w - 4);
    ctx.fillStyle = col;
    ctx.fillRect(x + (w-pw)/2, y + 4, pw, h - 8);
    ctx.fillRect(x, y, w, 5);
    ctx.fillRect(x, y + h - 5, w, 5);
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.fillRect(x + (w-pw)/2, y + 4, 2, h - 8);
  }

  function drawTable(x, y, w, h, col) {
    ctx.fillStyle = col;
    ctx.fillRect(x, y + 4, w, h - 8);
    ctx.fillStyle = '#5a3818';
    ctx.fillRect(x + 3, y + h - 4, 5, 4);
    ctx.fillRect(x + w - 8, y + h - 4, 5, 4);
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.fillRect(x, y + 4, w, 2);
  }

  function drawChair(x, y, w, h, col) {
    ctx.fillStyle = col;
    ctx.fillRect(x + 2, y + h*0.4, w - 4, h*0.35);
    ctx.fillRect(x + 2, y, 4, h*0.45);
    ctx.fillStyle = '#3a2210';
    ctx.fillRect(x + 2, y + h*0.75, 4, h*0.25);
    ctx.fillRect(x + w - 6, y + h*0.75, 4, h*0.25);
  }

  function drawShelf(x, y, w, h, col) {
    ctx.fillStyle = col;
    ctx.fillRect(x, y, w, h);
    const nShelves = Math.max(2, Math.round(h / 20));
    const sp = h / nShelves;
    const bookColors = ['#8a2020','#2050a0','#206a20','#80601a'];
    for (let i = 0; i < nShelves; i++) {
      ctx.fillStyle = 'rgba(255,255,255,0.1)';
      ctx.fillRect(x, y + i * sp, w, 2);
      const nBooks = Math.floor(w / 5);
      for (let b = 0; b < nBooks; b++) {
        ctx.fillStyle = bookColors[(i * nBooks + b) % bookColors.length] + 'bb';
        ctx.fillRect(x + b * 5 + 1, y + i * sp + 3, 4, sp - 5);
      }
    }
  }

  function drawFireplace(x, y, w, h, col, now) {
    ctx.fillStyle = col;
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = '#1a0a00';
    ctx.fillRect(x + 5, y + 5, w - 10, h - 10);
    const flicker = 0.6 + 0.4 * Math.sin(now * 0.01 + x);
    const fg = ctx.createRadialGradient(x+w/2, y+h-4, 2, x+w/2, y+h/2, h*0.5*flicker);
    fg.addColorStop(0, `rgba(255,180,30,${(0.9*flicker).toFixed(2)})`);
    fg.addColorStop(0.4, `rgba(255,80,10,${(0.7*flicker).toFixed(2)})`);
    fg.addColorStop(1, 'rgba(200,40,0,0)');
    ctx.fillStyle = fg;
    ctx.fillRect(x + 5, y + 5, w - 10, h - 10);
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.fillRect(x, y, w, 2);
  }

  function drawClock(x, y, w, h, col) {
    ctx.fillStyle = col;
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = '#c8a060';
    ctx.fillRect(x + 2, y + 2, w - 4, w - 4);
    ctx.fillStyle = '#0a0808';
    ctx.beginPath(); ctx.arc(x+w/2, y+w/2, w/2-4, 0, Math.PI*2); ctx.fill();
    ctx.strokeStyle = '#c8a060'; ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x+w/2, y+w/2);
    ctx.lineTo(x+w/2 + (w/2-6)*0.6, y+w/2 - (w/2-6)*0.5);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(x, y, w, 2);
  }

  function drawMirror(x, y, w, h, col) {
    ctx.fillStyle = col;
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = 'rgba(180,200,220,0.45)';
    ctx.fillRect(x + 3, y + 3, w - 6, h - 6);
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.fillRect(x + 4, y + 4, 4, h - 8);
  }

  function drawStairs(x, y, w, h, col) {
    const nSteps = 4;
    const sw = w / nSteps;
    for (let i = 0; i < nSteps; i++) {
      const shade = 40 + i * 15;
      ctx.fillStyle = `rgb(${shade+30},${shade+20},${shade})`;
      ctx.fillRect(x + i*sw, y + (h - h*(i+1)/nSteps), sw, h*(i+1)/nSteps);
      ctx.fillStyle = 'rgba(255,255,255,0.1)';
      ctx.fillRect(x + i*sw, y + (h - h*(i+1)/nSteps), sw, 2);
    }
  }

  function drawEntities() {
    const now = Date.now();

    // Found ghosts
    for (const gh of Object.values(S.ghosts)) {
      if (!gh.found || gh.identified) continue;

      // Vapor trail — fading position history
      if (gh.trail && gh.trail.length > 0) {
        for (let ti = 0; ti < gh.trail.length; ti++) {
          const tp = gh.trail[ti];
          const alpha = (ti / gh.trail.length) * 0.45;
          const r = 8 + (ti / gh.trail.length) * 18;
          const tg = ctx.createRadialGradient(tp.x, tp.y, 0, tp.x, tp.y, r);
          tg.addColorStop(0, gh.color + Math.round(alpha * 200).toString(16).padStart(2,'0'));
          tg.addColorStop(1, gh.color + '00');
          ctx.fillStyle = tg;
          ctx.beginPath(); ctx.arc(tp.x, tp.y, r, 0, Math.PI*2); ctx.fill();
        }
      }

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

    // Shared idle bob (time-driven)
    const nowSec = Date.now() / 1000;
    const idleBob = Math.sin(nowSec * 1.8) * 1.2;
    const meMoving = joy.active && joy.mag > 0.05;

    // Other players
    for (const [, p] of Object.entries(S.otherPlayers)) {
      const pBob = Math.sin(nowSec * 1.8 + (p.walkPhase || 0) * 0.5) * 1.2;
      drawAvatar(ctx, p.x, p.y, facingToDir(p.facing || 0), p.walkPhase || 0, pBob, p.avatar || 0, false);
    }

    // Player (self)
    drawAvatar(ctx, S.me.x, S.me.y, facingToDir(S.me.facing), walkPhase, meMoving ? 0 : idleBob, S.me.avatar || 0, true);
  }

  function applyDarkness(cw, ch) {
    const dc = darkCtx;
    dc.clearRect(0, 0, cw, ch);
    dc.fillStyle = 'rgba(0,0,0,0.87)';
    dc.fillRect(0, 0, cw, ch);

    const sx = Math.round(S.me.x - S.cam.x);
    const sy = Math.round(S.me.y - S.cam.y);

    dc.globalCompositeOperation = 'destination-out';

    // Flashlight cone (range scaled by avatar flashMult)
    if (S.activeTool === 'flashlight') {
      const avFlash = FLASH_RANGE * (AVATAR_STATS[S.me.avatar || 0] || AVATAR_STATS[0]).flashMult;
      const grad = dc.createRadialGradient(sx, sy, 0, sx, sy, avFlash);
      grad.addColorStop(0,   'rgba(255,255,255,1)');
      grad.addColorStop(0.5, 'rgba(255,255,255,0.9)');
      grad.addColorStop(1,   'rgba(255,255,255,0)');
      dc.fillStyle = grad;
      dc.beginPath();
      dc.moveTo(sx, sy);
      dc.arc(sx, sy, avFlash, S.me.facing - FLASH_ANGLE, S.me.facing + FLASH_ANGLE);
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

    // Lamp posts in garden — static ambient light sources
    if (S.area === 'garden') {
      const area = AREA_DEFS[S.area];
      for (const ob of area.obstacles) {
        if (ob.type !== 'lamp') continue;
        const lx = ob.x + ob.w/2 - S.cam.x;
        const ly = ob.y - S.cam.y;
        if (lx < -120 || lx > cw+120 || ly < -120 || ly > ch+120) continue;
        const lg = dc.createRadialGradient(lx, ly, 0, lx, ly, 90);
        lg.addColorStop(0, 'rgba(255,255,200,0.55)');
        lg.addColorStop(1, 'rgba(255,255,200,0)');
        dc.fillStyle = lg;
        dc.beginPath(); dc.arc(lx, ly, 90, 0, Math.PI*2); dc.fill();
      }
    }
    dc.globalCompositeOperation = 'source-over';
    ctx.drawImage(darkCanvas, 0, 0, cssW, cssH);

    // Cold spot: frost-blue edge glow when near an undiscovered ghost
    if (S.coldSignal > 0.15) {
      const intensity = Math.min(1, (S.coldSignal - 0.15) / 0.85);
      const cg = ctx.createRadialGradient(cw/2, ch/2, Math.min(cw,ch)*0.28, cw/2, ch/2, Math.max(cw,ch)*0.75);
      cg.addColorStop(0, 'rgba(100,200,255,0)');
      cg.addColorStop(1, `rgba(80,170,255,${(intensity * 0.38).toFixed(3)})`);
      ctx.fillStyle = cg;
      ctx.fillRect(0, 0, cw, ch);
    }
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
      const sig = S.signals[t] || 0;

      if (t === 'emf') {
        // EMF gets a distinct look: dark green background, segmented bars indicator
        ctx.fillStyle = active ? 'rgba(0,80,30,0.92)' : 'rgba(0,30,10,0.82)';
        rrect(ctx, bx, barY, bw, bh, 10); ctx.fill();
        if (active) { ctx.strokeStyle = '#00ff88'; ctx.lineWidth = 2; rrect(ctx, bx, barY, bw, bh, 10); ctx.stroke(); }
        // EMF label
        ctx.fillStyle = active ? '#00ff88' : '#44bb77'; ctx.font = 'bold 10px monospace'; ctx.textAlign = 'center';
        ctx.fillText('EMF', bx+bw/2, barY+13);
        if (S.hasEMFUpgrade) {
          ctx.fillStyle = '#ffdd00'; ctx.font = 'bold 8px monospace';
          ctx.fillText('2×', bx + bw - 10, barY + 11);
        }
        // 5 segmented bars
        const nbars = 5, barH = [6,8,10,12,14];
        const litBars = Math.round((sig / 100) * nbars);
        const segW = 8, segGap = 3;
        const totalW = nbars * segW + (nbars-1) * segGap;
        const startX = bx + (bw - totalW) / 2;
        const baseY = barY + bh - 5;
        for (let b = 0; b < nbars; b++) {
          const sx = startX + b * (segW + segGap);
          const sh = barH[b];
          const lit = b < litBars;
          const barColor = b >= 4 ? '#ff2244' : b >= 3 ? '#ff8800' : b >= 2 ? '#ffdd00' : '#00ff88';
          ctx.fillStyle = lit ? barColor : 'rgba(255,255,255,0.12)';
          ctx.fillRect(sx, baseY - sh, segW, sh);
        }
        // Pulsing ring when active and signal > 0
        if (active && sig > 0) {
          const pulse = (Math.sin(Date.now() / 180) + 1) / 2;
          ctx.strokeStyle = `rgba(0,255,136,${0.2 + pulse * 0.5})`;
          ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.arc(bx+bw/2, barY+28, 10 + pulse * 4, 0, Math.PI*2); ctx.stroke();
        }
        ctx.font = '16px serif'; ctx.fillText('📡', bx+bw/2, barY+34);
      } else {
        ctx.fillStyle = active ? 'rgba(96,165,250,0.85)' : 'rgba(20,20,30,0.78)';
        rrect(ctx, bx, barY, bw, bh, 10); ctx.fill();
        if (active) { ctx.strokeStyle = '#60a5fa'; ctx.lineWidth = 2; rrect(ctx, bx, barY, bw, bh, 10); ctx.stroke(); }
        ctx.font = '22px serif'; ctx.textAlign = 'center';
        ctx.fillText(icons[t], bx+bw/2, barY+26);
        // Signal bar
        ctx.fillStyle = 'rgba(255,255,255,0.18)';
        ctx.fillRect(bx+6, barY+bh-9, bw-12, 4);
        ctx.fillStyle = sig > 70 ? '#ef4444' : sig > 40 ? '#f97316' : sig > 15 ? '#eab308' : '#4ade80';
        ctx.fillRect(bx+6, barY+bh-9, (bw-12)*(sig/100), 4);
      }
    });

    // Ghost progress
    ctx.fillStyle = 'rgba(0,0,0,0.55)'; rrect(ctx, 10, 10, 110, 32, 8); ctx.fill();
    ctx.fillStyle = '#e2e8f0'; ctx.font = '13px monospace'; ctx.textAlign = 'left';
    ctx.fillText(`👻 ${S.identified}/${S.totalGhosts}`, 20, 31);

    // Signal button (top-left, beside ghost counter)
    const sigCool = S.signalCooldown > 0;
    const sbX = 128, sbY = 8, sbW = 52, sbH = 32;
    ctx.fillStyle = sigCool ? 'rgba(20,20,30,0.78)' : 'rgba(160,50,10,0.90)';
    rrect(ctx, sbX, sbY, sbW, sbH, 8); ctx.fill();
    if (!sigCool) { ctx.strokeStyle = '#ff8040'; ctx.lineWidth = 1.5; rrect(ctx, sbX, sbY, sbW, sbH, 8); ctx.stroke(); }
    ctx.font = '14px serif'; ctx.textAlign = 'center';
    ctx.fillText('📣', sbX + sbW/2, sbY + 13);
    ctx.fillStyle = sigCool ? '#555' : '#ffaa60'; ctx.font = '9px monospace';
    ctx.fillText(sigCool ? `${Math.ceil(S.signalCooldown/1000)}s` : 'SIGNAL', sbX + sbW/2, sbY + 27);
    ctx.textAlign = 'left';

    // Area label
    ctx.fillStyle = 'rgba(0,0,0,0.55)'; rrect(ctx, cw/2-70, 10, 140, 30, 8); ctx.fill();
    ctx.fillStyle = '#cbd5e1'; ctx.font = '13px monospace'; ctx.textAlign = 'center';
    ctx.fillText(AREA_DEFS[S.area]?.label || '', cw/2, 30);

    // Journal toggle button (top-right)
    const jbX = cw - 44, jbY = 8, jbW = 36, jbH = 32;
    ctx.fillStyle = S.journal ? 'rgba(124,58,237,0.85)' : 'rgba(20,20,30,0.78)';
    rrect(ctx, jbX, jbY, jbW, jbH, 8); ctx.fill();
    if (S.journal) { ctx.strokeStyle = '#a78bfa'; ctx.lineWidth = 1.5; rrect(ctx, jbX, jbY, jbW, jbH, 8); ctx.stroke(); }
    ctx.font = '16px serif'; ctx.textAlign = 'center';
    ctx.fillText('📒', jbX+jbW/2, jbY+22);

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
      const msgW = Math.min(cw - 24, 300), msgH = 34;
      const msgX = (cw - msgW) / 2, msgY = ch / 2 - 60;
      ctx.fillStyle = 'rgba(0,0,0,0.75)';
      rrect(ctx, msgX, msgY, msgW, msgH, 8); ctx.fill();
      ctx.strokeStyle = '#ef4444'; ctx.lineWidth = 1.5;
      rrect(ctx, msgX, msgY, msgW, msgH, 8); ctx.stroke();
      ctx.fillStyle = '#fca5a5'; ctx.font = 'bold 13px monospace'; ctx.textAlign = 'center';
      ctx.fillText(S.attemptsMsg, cw / 2, msgY + 22);
    }

    ctx.textAlign = 'left';

    // Direction arrow (signal tool pointing toward ghost)
    drawDirectionArrow(cw, ch);
    // Minimap (bottom-right)
    drawMinimap(cw, ch);
    // Evidence journal overlay
    drawJournal(cw, ch);
  }

  function drawPOIPanel(cw, ch) {
    if (!S.activePoi) return;
    const poi = S.activePoi;
    const pw = Math.min(cw - 32, 290), ph = 92;
    const px = (cw - pw) / 2;
    const barH = 52, gap = 8;
    const barW = 3 * 70 + 2 * gap;
    const barY = ch - barH - 10;
    const py = barY - ph - 10;
    ctx.fillStyle = 'rgba(8,4,18,0.93)';
    rrect(ctx, px, py, pw, ph, 12); ctx.fill();
    ctx.strokeStyle = '#8855cc'; ctx.lineWidth = 1.5;
    rrect(ctx, px, py, pw, ph, 12); ctx.stroke();
    ctx.fillStyle = '#d4a840'; ctx.font = 'bold 11px Georgia,serif'; ctx.textAlign = 'center';
    ctx.fillText(poi.title, px + pw / 2, py + 18);
    ctx.fillStyle = '#c0b8d8'; ctx.font = '10px sans-serif';
    wrapText(poi.text, px + pw / 2, py + 34, pw - 24, 13);
  }

  function drawPlayerSignals(cw, ch) {
    const now = Date.now();
    for (const [piStr, sig] of Object.entries(S.playerSignals)) {
      const age = now - sig.ts;
      if (age > 5000) { delete S.playerSignals[piStr]; continue; }
      const alpha = Math.max(0, 1 - age / 5000);
      const pulse = 0.5 + 0.5 * Math.sin(now * 0.008);
      const dx = sig.x - S.me.x;
      const dy = sig.y - S.me.y;
      const dir = Math.atan2(dy, dx);
      const cxS = cw / 2, cyS = ch / 2;
      const margin = 55;
      const cosD = Math.cos(dir), sinD = Math.sin(dir);
      let t = Infinity;
      if (cosD > 0.001)  t = Math.min(t, (cw - cxS - margin) / cosD);
      else if (cosD < -0.001) t = Math.min(t, (cxS - margin) / (-cosD));
      if (sinD > 0.001)  t = Math.min(t, (ch - cyS - margin) / sinD);
      else if (sinD < -0.001) t = Math.min(t, (cyS - margin) / (-sinD));
      const ax = cxS + cosD * t, ay = cyS + sinD * t;
      ctx.save();
      ctx.globalAlpha = alpha * (0.75 + pulse * 0.25);
      ctx.translate(ax, ay);
      ctx.rotate(dir);
      ctx.fillStyle = '#ff5533';
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(18, 0); ctx.lineTo(-10, -10); ctx.lineTo(-6, 0); ctx.lineTo(-10, 10);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 8px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('HERE!', 0, -14);
      ctx.restore();
    }
  }

  function drawJoystick(cw, ch) {
    if (!joy.active) return;
    const bx = joy.bx, by = joy.by;
    const dx = joy.dx, dy = joy.dy;
    const maxR = 60;
    const dist = Math.hypot(dx, dy);
    const kx = bx + (dist > 0 ? (dx/dist)*Math.min(dist,maxR) : 0);
    const ky = by + (dist > 0 ? (dy/dist)*Math.min(dist,maxR) : 0);

    ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(bx, by, maxR, 0, Math.PI*2); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.beginPath(); ctx.arc(kx, ky, 18, 0, Math.PI*2); ctx.fill();
  }

  // ── Ouija board ──────────────────────────────────────────────────────────
  function openOuija(ghostId, sequence, personality) {
    const pcfg = PCFG[personality] || PCFG.confused;
    S.ouija = {
      ghostId, sequence, personality, pcfg,
      seqIdx: 0,
      planchette: { x: 0.5, y: 0.5, vx: 0, vy: 0 },
      dwellTimer: 0,
      collected: [],
      phase: 'playing',   // 'playing' | 'submitting'
      alpha: 0,
    };
  }

  function closeOuija(reason) {
    if (!S || !S.ouija) return;
    closeNameInput();
    if (reason === 'cancel') {
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

    // Blank slots hint (below board)
    const gh = S.ghosts[ou.ghostId];
    if (gh) {
      ctx.fillStyle = 'rgba(160,130,255,0.8)'; ctx.font = '13px monospace';
      ctx.fillText('_ '.repeat(gh.nameLength).trim(), bx+bw/2, by+bh+26);
    }

    // Submitting phase: show auto-identifying message
    if (ou.phase === 'submitting') {
      ctx.fillStyle = '#a090d8'; ctx.font = '13px monospace';
      ctx.fillText('Identifying the spirit…', bx+bw/2, by+bh+48);
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
    if (ou.seqIdx >= ou.sequence.length) {
      if (ou.phase === 'playing') {
        ou.phase = 'submitting';
        // Auto-identify: emit the collected name directly (letters are in name order)
        const name = ou.collected.join('');
        socket.emit('ghost:submit_name', { roomId: S.roomId, ghostId: ou.ghostId, name });
        setTimeout(() => { if (S && S.ouija) closeOuija('submit'); }, 1400);
      }
      return;
    }

    const target = ou.sequence[ou.seqIdx];
    const p = ou.planchette, c = ou.pcfg;
    // Stable velocity model: v = v * momentum + dx * speed  (always converges when momentum < 1)
    const dx = target.targetX - p.x;
    const dy = target.targetY - p.y;
    p.vx = p.vx * c.momentum + dx * c.speed;
    p.vy = p.vy * c.momentum + dy * c.speed;
    if (ou.personality === 'confused') { p.vx += (Math.random()-0.5)*0.008; p.vy += (Math.random()-0.5)*0.008; }
    p.x += p.vx; p.y += p.vy;
    p.x = Math.max(0.04, Math.min(0.96, p.x));
    p.y = Math.max(0.08, Math.min(0.92, p.y));

    const d = Math.hypot(p.x - target.targetX, p.y - target.targetY);
    if (d < 0.035) {
      ou.dwellTimer += dt * 1000;
      if (ou.dwellTimer >= c.dwellMs) {
        if (target.isReal) {
          ou.collected.push(target.letter);
          // Mirror to ghost so journal can show it
          if (S && S.ghosts[ou.ghostId]) S.ghosts[ou.ghostId].ouijaLetters = [...ou.collected];
          if (navigator.vibrate) navigator.vibrate([70, 30, 70]);
        } else {
          if (navigator.vibrate) navigator.vibrate([15]);
        }
        gaSfxOuija(target.isReal);
        ou.dwellTimer = 0;
        ou.seqIdx++;
        p.vx = (Math.random()-0.5)*0.015; p.vy = (Math.random()-0.5)*0.015;
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
  }

  // ── Ouija name input overlay ─────────────────────────────────────────────
  function openNameInput(ghostId) {
    closeNameInput();
    const wrap = document.createElement('div');
    wrap.id = 'ouija-name-input';
    wrap.style.cssText = [
      'position:fixed;bottom:10%;left:50%;transform:translateX(-50%)',
      'z-index:9500;display:flex;gap:8px;align-items:center',
      'background:rgba(10,5,25,0.92);padding:10px 14px;border-radius:12px',
      'border:2px solid #7040c0',
    ].join(';');

    const inp = document.createElement('input');
    inp.type = 'text';
    inp.placeholder = "Ghost's name…";
    inp.maxLength = 24;
    inp.autocomplete = 'off';
    inp.autocapitalize = 'off';
    inp.spellcheck = false;
    inp.style.cssText = [
      'font-family:monospace;font-size:17px;padding:7px 10px',
      'background:rgba(30,15,60,0.95);color:#d4a840',
      'border:1px solid #6040a0;border-radius:8px;outline:none;width:150px',
    ].join(';');

    const btn = document.createElement('button');
    btn.textContent = 'Identify!';
    btn.style.cssText = [
      'font-family:monospace;font-size:14px;font-weight:bold;padding:7px 14px',
      'background:linear-gradient(135deg,#6030b0,#3a1870);color:#fff',
      'border:none;border-radius:8px;cursor:pointer;white-space:nowrap',
    ].join(';');

    function doSubmit() {
      const name = inp.value.trim();
      if (!name) { inp.focus(); return; }
      socket.emit('ghost:submit_name', { roomId: S.roomId, ghostId, name });
      closeOuija('submit');
    }

    btn.addEventListener('click', doSubmit);
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') doSubmit(); });

    wrap.appendChild(inp);
    wrap.appendChild(btn);
    document.body.appendChild(wrap);
    setTimeout(() => inp.focus(), 80);
  }

  function closeNameInput() {
    const el = document.getElementById('ouija-name-input');
    if (el) el.remove();
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

  // ── Minimap ───────────────────────────────────────────────────────────────
  function drawMinimap(cw, ch) {
    if (!S.cam) return;
    const area = AREA_DEFS[S.area];

    // Toggle button
    const tbW = 28, tbH = 22, tbX = cw - tbW - 6, tbY = ch - tbH - 6;
    ctx.fillStyle = mmOpen ? 'rgba(40,60,40,0.85)' : 'rgba(20,20,30,0.80)';
    rrect(ctx, tbX, tbY, tbW, tbH, 5); ctx.fill();
    ctx.fillStyle = '#94a3b8'; ctx.font = '12px monospace'; ctx.textAlign = 'center';
    ctx.fillText('[M]', tbX + tbW/2, tbY + 14);

    if (!mmOpen) return;

    const mmW = Math.min(70, Math.round(cw * 0.18));
    const mmH = Math.round(mmW * area.areaHeight / area.areaWidth);
    const mmX = cw - mmW - 6, mmY = ch - mmH - tbH - 10;
    const sc  = mmW / area.areaWidth;

    ctx.fillStyle = 'rgba(0,0,0,0.82)';
    rrect(ctx, mmX-2, mmY-2, mmW+4, mmH+4, 5); ctx.fill();
    ctx.fillStyle = '#050a05';
    ctx.fillRect(mmX, mmY, mmW, mmH);

    ctx.save();
    ctx.beginPath(); ctx.rect(mmX, mmY, mmW, mmH); ctx.clip();

    if (fogGrid) {
      // Revealed terrain
      for (let gy = 0; gy < fogGridH; gy++) {
        for (let gx = 0; gx < fogGridW; gx++) {
          if (!fogGrid[gy * fogGridW + gx]) continue;
          const px = mmX + gx * FOG_CELL * sc;
          const py = mmY + gy * FOG_CELL * sc;
          const ps = Math.ceil(FOG_CELL * sc) + 1;
          ctx.fillStyle = area.bgColor;
          ctx.fillRect(px, py, ps, ps);
        }
      }
      // Obstacles in revealed cells
      const obsColors = area.obsColors || {};
      for (const ob of area.obstacles) {
        const gcx = Math.floor((ob.x + ob.w/2) / FOG_CELL);
        const gcy = Math.floor((ob.y + ob.h/2) / FOG_CELL);
        if (gcx < 0 || gcy < 0 || gcx >= fogGridW || gcy >= fogGridH) continue;
        if (!fogGrid[gcy * fogGridW + gcx]) continue;
        ctx.fillStyle = obsColors[ob.type] || obsColors.default || '#5a5a5a';
        ctx.fillRect(mmX + ob.x*sc, mmY + ob.y*sc,
                     Math.max(1, ob.w*sc), Math.max(1, ob.h*sc));
      }
    }

    // Viewport rect
    ctx.strokeStyle = 'rgba(255,255,255,0.28)'; ctx.lineWidth = 1;
    const vx = mmX + S.cam.x * sc, vy = mmY + S.cam.y * sc;
    ctx.strokeRect(vx, vy, Math.min(cssW*sc, mmW-(vx-mmX)), Math.min(cssH*sc, mmH-(vy-mmY)));

    // Other players
    const pColors = ['#60a5fa','#f97316','#a855f7','#10b981'];
    for (const [piStr, p] of Object.entries(S.otherPlayers)) {
      ctx.fillStyle = pColors[parseInt(piStr) % pColors.length];
      ctx.beginPath(); ctx.arc(mmX + p.x*sc, mmY + p.y*sc, 2.5, 0, Math.PI*2); ctx.fill();
    }

    // Found ghosts
    for (const gh of Object.values(S.ghosts)) {
      if (!gh.found) continue;
      ctx.fillStyle = gh.identified ? gh.color + '99' : gh.color;
      ctx.beginPath(); ctx.arc(mmX + gh.x*sc, mmY + gh.y*sc,
        gh.identified ? 2 : 3.5, 0, Math.PI*2); ctx.fill();
    }

    // Self
    ctx.fillStyle = '#22c55e';
    ctx.beginPath(); ctx.arc(mmX + S.me.x*sc, mmY + S.me.y*sc, 3.5, 0, Math.PI*2); ctx.fill();

    ctx.restore();

    ctx.strokeStyle = 'rgba(80,120,80,0.55)'; ctx.lineWidth = 1;
    rrect(ctx, mmX-2, mmY-2, mmW+4, mmH+4, 5); ctx.stroke();
  }

  // ── Direction Arrow ───────────────────────────────────────────────────────
  function drawDirectionArrow(cw, ch) {
    const dir = S.activeTool === 'emf' ? S.emfDir : (S.activeTool === 'sound' ? S.sndDir : null);
    if (dir === null) return;

    const cx = cw / 2, cy = ch / 2;
    const margin = 48;
    const cos = Math.cos(dir), sin = Math.sin(dir);
    let t = Infinity;
    if (cos > 0.001)  t = Math.min(t, (cw - cx - margin) / cos);
    else if (cos < -0.001) t = Math.min(t, (cx - margin) / (-cos));
    if (sin > 0.001)  t = Math.min(t, (ch - cy - margin) / sin);
    else if (sin < -0.001) t = Math.min(t, (cy - margin) / (-sin));

    const ax = cx + cos * t, ay = cy + sin * t;
    const col = S.activeTool === 'emf' ? '#4ade80' : '#c084fc';

    ctx.save();
    ctx.translate(ax, ay);
    ctx.rotate(dir);
    ctx.globalAlpha = 0.82 + 0.18 * Math.sin(Date.now() * 0.004);
    ctx.fillStyle = col;
    ctx.strokeStyle = 'rgba(0,0,0,0.55)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(14, 0); ctx.lineTo(-9, -8); ctx.lineTo(-5, 0); ctx.lineTo(-9, 8);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  // ── Evidence Journal ─────────────────────────────────────────────────────
  function drawJournal(cw, ch) {
    if (!S.journal) return;
    const jW = Math.min(cw - 24, 300), jH = Math.min(ch - 100, 420);
    const jX = (cw - jW) / 2, jY = (ch - jH) / 2;

    ctx.fillStyle = 'rgba(8,8,18,0.94)';
    rrect(ctx, jX, jY, jW, jH, 14); ctx.fill();
    ctx.strokeStyle = '#7c3aed'; ctx.lineWidth = 2;
    rrect(ctx, jX, jY, jW, jH, 14); ctx.stroke();

    ctx.fillStyle = '#c4b5fd'; ctx.font = 'bold 14px Georgia,serif'; ctx.textAlign = 'center';
    ctx.fillText('📒 Evidence Journal', jX+jW/2, jY+28);
    ctx.strokeStyle = 'rgba(124,58,237,0.35)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(jX+14, jY+38); ctx.lineTo(jX+jW-14, jY+38); ctx.stroke();

    const found = Object.values(S.ghosts).filter(g => g.found);
    if (found.length === 0) {
      ctx.fillStyle = '#6b7280'; ctx.font = '12px monospace'; ctx.textAlign = 'center';
      ctx.fillText('No ghosts located yet...', jX+jW/2, jY+jH/2);
    } else {
      let cardY = jY + 48;
      for (const gh of found) {
        const cardH = 72;
        if (cardY + cardH > jY + jH - 10) break;
        ctx.fillStyle = gh.color + '22';
        rrect(ctx, jX+8, cardY, jW-16, cardH, 8); ctx.fill();
        ctx.strokeStyle = gh.color + '66'; ctx.lineWidth = 1;
        rrect(ctx, jX+8, cardY, jW-16, cardH, 8); ctx.stroke();

        ctx.fillStyle = gh.color; ctx.font = 'bold 12px monospace'; ctx.textAlign = 'left';
        ctx.fillText(`Ghost #${gh.id+1}`, jX+16, cardY+18);
        ctx.fillStyle = '#94a3b8'; ctx.font = '11px monospace';
        ctx.fillText(`${gh.personality || '?'} • ${gh.nameLength} letters`, jX+16, cardY+33);
        if (gh.ouijaLetters && gh.ouijaLetters.length > 0) {
          ctx.fillStyle = '#d4a840';
          ctx.fillText('Letters: '+gh.ouijaLetters.join(' '), jX+16, cardY+49);
        }
        if (gh.attempts > 0) {
          ctx.fillStyle = '#ef4444'; ctx.font = '10px monospace';
          ctx.fillText(`${gh.attempts} wrong guess${gh.attempts!==1?'es':''}`, jX+16, cardY+63);
        }
        if (gh.identified) {
          ctx.fillStyle = '#4ade80'; ctx.font = 'bold 10px monospace'; ctx.textAlign = 'right';
          ctx.fillText('✓ NAMED', jX+jW-14, cardY+18);
        }
        cardY += cardH + 5;
      }
    }
    ctx.textAlign = 'left';
  }

  // ── Post-game case file DOM overlay ──────────────────────────────────────
  function showCaseFile() {
    const old = document.getElementById('ghost-case-file');
    if (old) old.remove();
    if (!S || Object.keys(S.identifiedGhosts).length === 0) return;

    const overlay = document.createElement('div');
    overlay.id = 'ghost-case-file';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.93);z-index:9000;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;padding:24px;overflow:auto;font-family:Georgia,serif;';

    const title = document.createElement('div');
    title.style.cssText = 'font-size:20px;font-weight:bold;color:#d4a840;letter-spacing:0.04em;text-align:center;';
    title.textContent = '📋 Case Closed — Ghost Report';
    overlay.appendChild(title);

    const cards = document.createElement('div');
    cards.style.cssText = 'display:flex;flex-wrap:wrap;gap:14px;justify-content:center;max-width:700px;';

    for (const gh of Object.values(S.identifiedGhosts)) {
      const card = document.createElement('div');
      card.style.cssText = `background:${gh.color}25;border:2px solid ${gh.color}aa;border-radius:14px;padding:16px 18px;min-width:140px;max-width:190px;text-align:center;color:#fff;`;
      const letters = gh.letters && gh.letters.length > 0
        ? `<div style="margin-top:8px;font-size:11px;font-family:monospace;color:#d4a840;opacity:0.9">Letters: ${gh.letters.join(' ')}</div>` : '';
      card.innerHTML = `<div style="font-size:26px;margin-bottom:4px">👻</div>`
        + `<div style="font-weight:bold;font-size:15px;color:${gh.color}">${gh.name}</div>`
        + `<div style="font-size:10px;letter-spacing:0.08em;opacity:0.7;margin-top:3px">${gh.personality.toUpperCase()}</div>`
        + `<div style="font-size:10px;opacity:0.6;margin-top:8px;line-height:1.4">${gh.description}</div>`
        + letters;
      cards.appendChild(card);
    }
    overlay.appendChild(cards);

    const sub = document.createElement('div');
    sub.style.cssText = 'color:#6b7280;font-size:12px;font-family:monospace;text-align:center;';
    sub.textContent = 'All spirits have been identified...';
    overlay.appendChild(sub);

    document.body.appendChild(overlay);
    setTimeout(() => { if (overlay.parentNode) overlay.remove(); }, 5500);
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
    socket.on('ghost:signals', ({ signals, emfDir, sndDir }) => {
      if (!S) return;
      let emf = 0, sound = 0, flashlight = 0, coldSignal = 0;
      for (const sig of signals) {
        emf        = Math.max(emf,        sig.emf       * 100);
        sound      = Math.max(sound,      sig.sound     * 100);
        flashlight = Math.max(flashlight, sig.flashlight * 100);
        // Cold spot: track proximity to ghosts not yet found
        if (!S.ghosts[sig.ghostId]) coldSignal = Math.max(coldSignal, sig.emf);
      }
      S.signals   = { emf: Math.round(emf), sound: Math.round(sound), flashlight: Math.round(flashlight) };
      S.emfDir    = (emfDir !== null && emfDir !== undefined) ? emfDir : null;
      S.sndDir    = (sndDir !== null && sndDir !== undefined) ? sndDir : null;
      S.coldSignal = coldSignal;
    });

    socket.on('ghost:found', ({ ghostId, x, y, personality, color, nameLength }) => {
      if (!S) return;
      S.ghosts[ghostId] = { id:ghostId, x, y, personality, color, nameLength,
        found:true, identified:false, claimedBy:false,
        trail:[], ouijaLetters:[], attempts:0 };
      if (navigator.vibrate) navigator.vibrate([60,25,60,25,60]);
      gaSfxGhostFound();
    });

    socket.on('ghost:position', ({ ghostId, x, y }) => {
      if (!S || !S.ghosts[ghostId]) return;
      const gh = S.ghosts[ghostId];
      if (!gh.trail) gh.trail = [];
      gh.trail.push({ x: gh.x, y: gh.y });
      if (gh.trail.length > 15) gh.trail.shift();
      gh.x = x; gh.y = y;
    });

    socket.on('ghost:player_pos', ({ playerIndex, x, y, facing, avatar }) => {
      if (!S) return;
      if (!S.otherPlayers[playerIndex]) S.otherPlayers[playerIndex] = { x, y, facing: 0, avatar: 0, walkPhase: 0 };
      const p = S.otherPlayers[playerIndex];
      const dist = Math.hypot(x - p.x, y - p.y);
      p.walkPhase = (p.walkPhase || 0) + dist * 0.12;
      p.x = x; p.y = y;
      if (facing !== undefined) p.facing = facing;
      if (avatar !== undefined) p.avatar = avatar;
    });

    socket.on('ghost:ouija_start', ({ ghostId, sequence, personality }) => {
      if (!S) return;
      openOuija(ghostId, sequence, personality);
    });

    socket.on('ghost:identified', ({ ghostId, name, personality, color, description, identifiedBy }) => {
      if (!S) return;
      const gh = S.ghosts[ghostId];
      if (gh) { gh.identified = true; gh.claimedBy = false; }
      S.identifiedGhosts[ghostId] = { name, personality, color, description,
        letters: gh ? (gh.ouijaLetters || []) : [] };
      S.identified++;
      gaSfxIdentified();
      showReveal(name, personality, color, description, identifiedBy === S.myPlayerIndex);
      if (S.identified >= S.totalGhosts) {
        setTimeout(() => showCaseFile(), 400);
      }
    });

    socket.on('ghost:wrong_name', ({ ghostId, attemptsLeft, respawned }) => {
      if (!S) return;
      if (S.ghosts[ghostId]) S.ghosts[ghostId].attempts = (S.ghosts[ghostId].attempts || 0) + 1;
      S.wrongFlash = 1.0;
      gaSfxWrong();
      if (respawned) {
        delete S.ghosts[ghostId];
        S.attemptsMsg = '👻 Wrong! Ghost fled—find it again.';
      } else {
        S.attemptsMsg = attemptsLeft > 0
          ? `Wrong! ${attemptsLeft} guess${attemptsLeft !== 1 ? 'es' : ''} left`
          : 'Ghost escapes permanently!';
      }
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

    socket.on('ghost:respawn', ({ ghostId }) => {
      if (!S) return;
      delete S.ghosts[ghostId];
      // Show notification for all players (guesser's ghost:wrong_name will override)
      S.attemptsMsg = '👻 Ghost fled! Find it again.';
      clearTimeout(S.attemptsMsgTimer);
      S.attemptsMsgTimer = setTimeout(() => { if (S) S.attemptsMsg = null; }, 2500);
    });

    socket.on('ghost:signal_broadcast', ({ playerIndex, x, y }) => {
      if (!S) return;
      S.playerSignals[playerIndex] = { x, y, ts: Date.now() };
    });

    socket.on('ghost:key_taken', ({ playerIndex }) => {
      if (!S) return;
      S.keyAvailable = false;
      if (playerIndex === S.myPlayerIndex) {
        S.hasKey = true;
        S.attemptsMsg = '🗝 Found a key! Locate the EMF upgrade.';
        clearTimeout(S.attemptsMsgTimer);
        S.attemptsMsgTimer = setTimeout(() => { if (S) S.attemptsMsg = null; }, 3500);
      }
    });

    socket.on('ghost:powerup_taken', ({ playerIndex }) => {
      if (!S) return;
      S.powerupAvailable = false;
      if (playerIndex === S.myPlayerIndex) {
        S.hasEMFUpgrade = true;
        S.attemptsMsg = '⚡ EMF Upgraded — range doubled!';
        clearTimeout(S.attemptsMsgTimer);
        S.attemptsMsgTimer = setTimeout(() => { if (S) S.attemptsMsg = null; }, 3500);
      }
    });
  }

  function unbindSocketEvents() {
    ['ghost:signals','ghost:found','ghost:position','ghost:player_pos',
     'ghost:ouija_start',
     'ghost:identified','ghost:wrong_name','ghost:claimed','ghost:released',
     'ghost:respawn','ghost:signal_broadcast','ghost:key_taken','ghost:powerup_taken'].forEach(ev => socket.off(ev));
  }

  // ── Init / cleanup ────────────────────────────────────────────────────────
  function init(data) {
    const gd = data.ghost || {};
    const area = AREA_DEFS[gd.area] || AREA_DEFS.graveyard;
    const start = gd.playerStart || area.playerStart;

    cleanup();
    setupCanvas();
    walkPhase = 0;

    // Use server-confirmed avatar (from ghost:avatarChosen) if present in gameStart data,
    // falling back to local selection
    const myAvatar = ((data.players || [])[data.myPlayerIndex] || {}).avatar
                     ?? (window._ghostAvatarSelection || 0);

    // Seed other players with their confirmed avatars from gameStart
    const seedOtherPlayers = {};
    (data.players || []).forEach((p, i) => {
      if (i !== data.myPlayerIndex && !p.isAI) {
        seedOtherPlayers[i] = { x: start.x, y: start.y, facing: 0, avatar: p.avatar || 0, walkPhase: 0 };
      }
    });

    S = {
      roomId:       data.roomId,
      myPlayerIndex: data.myPlayerIndex,
      area:         gd.area || 'graveyard',
      me:           { x: start.x, y: start.y, facing: 0, avatar: myAvatar },
      cam:          null,
      ghosts:       {},
      otherPlayers: seedOtherPlayers,
      activeTool:   'flashlight',
      signals:      { emf: 0, sound: 0, flashlight: 0 },
      emfDir:       null,
      sndDir:       null,
      coldSignal:   0,
      ouija:        null,
      reveal:       null,
      nearGhost:    null,
      identified:   gd.identified || 0,
      totalGhosts:  gd.ghostCount || 3,
      wrongFlash:   0,
      attemptsMsg:  null,
      attemptsMsgTimer: null,
      journal:      false,
      identifiedGhosts: {},
      pois:          (gd.pois || []).map(p => ({ ...p, read: false })),
      activePoi:     null,
      keyPos:        gd.keyPos || null,
      powerupPos:    gd.powerupPos || null,
      keyAvailable:  gd.keyAvailable !== false,
      powerupAvailable: gd.powerupAvailable !== false,
      hasKey:        gd.hasKey || false,
      hasEMFUpgrade: gd.hasEMFUpgrade || false,
      playerSignals: {},
      signalCooldown: 0,
    };

    // Init fog grid
    const areaForFog = AREA_DEFS[S.area] || AREA_DEFS.graveyard;
    fogGridW = Math.ceil(areaForFog.areaWidth  / FOG_CELL);
    fogGridH = Math.ceil(areaForFog.areaHeight / FOG_CELL);
    fogGrid  = new Float32Array(fogGridW * fogGridH);
    mmOpen   = true;

    // Restore found ghosts from reconnect data
    if (gd.foundGhosts) {
      for (const g of gd.foundGhosts) {
        S.ghosts[g.id] = { ...g, found: true, trail: [], ouijaLetters: [], attempts: 0, claimedBy: false };
      }
    }

    bindSocketEvents();
    startLoop();
  }

  function cleanup() {
    if (animFrame) { cancelAnimationFrame(animFrame); animFrame = null; }
    if (S) {
      clearTimeout(S.attemptsMsgTimer);
      // Release ghost board claim so other players aren't locked out
      if (S.ouija && S.roomId) {
        socket.emit('ghost:close_board', { roomId: S.roomId, ghostId: S.ouija.ghostId });
      }
      S.ouija = null;
    }
    closeNameInput();
    const caseFile = document.getElementById('ghost-case-file');
    if (caseFile) caseFile.remove();
    gaStop();
    unbindSocketEvents();
    window.removeEventListener('resize', resizeCanvas);
    if (canvas) {
      canvas.removeEventListener('touchstart',  onTouchStart);
      canvas.removeEventListener('touchmove',   onTouchMove);
      canvas.removeEventListener('touchend',    onTouchEnd);
      canvas.removeEventListener('touchcancel', onTouchCancel);
      canvas.removeEventListener('touchstart', onTap);
      canvas.removeEventListener('mousedown',  onMouseDown);
      canvas.removeEventListener('mousemove',  onMouseMove);
      canvas.removeEventListener('mouseup',    onMouseUp);
      canvas.removeEventListener('click',      onCanvasClick);
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
