// games/ghost.js — Ghost Detective server logic

module.exports = function(io, helpers) {
  const { endGame } = helpers;

  // ─── Constants ────────────────────────────────────────────────────────────
  const TICK_MS = 100;
  const T = 32; // tile size in pixels

  const NAME_POOLS = {
    shy:      ['Mildred','Percival','Winifred','Beatrice','Florence','Ethelyn','Clarice','Rosalind','Gwendolyn','Mortlake'],
    dramatic: ['Vivienne','Mortimer','Reginald','Eugenia','Balthazar','Desdemona','Valentina','Seraphina','Maximilian','Lysander'],
    goofy:    ['Blobsworth','Snorflkins','Flumpleton','Wobbledorf','Splatkins','Globbington','Fizzelwick','Borfington','Splooshkin','Wubbleton'],
    grumpy:   ['Gratchul','Vexorak','Morgrath','Draklix','Skulgorr','Kraxon','Gorbax','Brutarg','Hexmoor','Skragg'],
    regal:    ['Algernon','Humphrey','Cornelius','Archibald','Peregrine','Erasmus','Hieronymus','Bartholomew','Ptolemy','Isadora'],
    confused: ['Flumpton','Wirblex','Glorpitz','Snibworf','Zorfwick','Blibzle','Tworfnik','Splimble','Dribblix','Quorfzle'],
  };

  const PERSONALITIES = ['shy','dramatic','goofy','grumpy','regal','confused'];

  const PCONFIG = {
    shy:      { speed: 60,  ouijaTime: 25, diversions: [1,2], fleeRange: 200, color: '#a8d8ea', description: 'Skittish and easily frightened — hides from the living' },
    dramatic: { speed: 120, ouijaTime: 35, diversions: [0,1], fleeRange: 0,   color: '#ff6b9d', description: 'Theatrical and flamboyant — loves an audience' },
    goofy:    { speed: 90,  ouijaTime: 50, diversions: [0,2], fleeRange: 0,   color: '#ffd93d', description: 'Bouncy and unpredictable — finds everything hilarious' },
    grumpy:   { speed: 70,  ouijaTime: 15, diversions: [2,3], fleeRange: 0,   color: '#ff4757', description: 'Irritable and impatient — just wants to be left alone' },
    regal:    { speed: 40,  ouijaTime: 30, diversions: [0,0], fleeRange: 0,   color: '#c9a86c', description: 'Dignified and slow-moving — haunting with elegance since 1842' },
    confused: { speed: 80,  ouijaTime: 45, diversions: [2,4], fleeRange: 0,   color: '#b8f5a3', description: 'Wandering aimlessly — not sure where, or when, they are' },
  };

  const FLASH_RANGE = 280;
  const FLASH_ANGLE = Math.PI / 2.8;
  const EMF_RANGE   = 250;
  const SOUND_RANGE = 350;

  // ─── Area Definitions ─────────────────────────────────────────────────────
  // All obstacle coords in pixels. T = 32px tile.
  // Helper: rect(tx, ty, tw, th, type) → {x, y, w, h, type}
  function rect(tx, ty, tw, th, type) {
    return { x: tx*T, y: ty*T, w: tw*T, h: th*T, type };
  }

  function buildGraveyardObstacles() {
    const obs = [];
    obs.push(rect(0,0,80,1,'stone'),rect(0,59,80,1,'stone'),rect(0,0,1,60,'stone'),rect(79,0,1,60,'stone'));
    obs.push(rect(4,4,8,6,'stone'));
    obs.push(rect(7,10,1,3,'arch'),rect(9,10,1,3,'arch'),rect(7,9,3,1,'arch'));
    obs.push(rect(14,8,1,2,'cross'),rect(18,8,1,2,'cross'),rect(22,8,1,2,'cross'));
    obs.push(rect(14,13,1,2,'cross'),rect(18,13,1,2,'cross'),rect(22,13,1,2,'cross'));
    obs.push(rect(26,8,1,2,'cross'),rect(26,13,1,2,'cross'));
    obs.push(rect(50,6,1,2,'cross'),rect(54,6,1,2,'cross'),rect(58,6,1,2,'cross'),rect(62,6,1,2,'cross'));
    obs.push(rect(50,11,1,2,'cross'),rect(54,11,1,2,'cross'),rect(58,11,1,2,'cross'),rect(66,6,1,2,'cross'));
    obs.push(rect(10,35,1,2,'cross'),rect(14,35,1,2,'cross'),rect(18,35,1,2,'cross'));
    obs.push(rect(10,40,1,2,'cross'),rect(14,40,1,2,'cross'),rect(18,40,1,2,'cross'));
    obs.push(rect(22,35,1,2,'cross'),rect(22,40,1,2,'cross'));
    obs.push(rect(45,38,1,2,'cross'),rect(49,38,1,2,'cross'),rect(53,38,1,2,'cross'),rect(57,38,1,2,'cross'));
    obs.push(rect(45,43,1,2,'cross'),rect(49,43,1,2,'cross'),rect(53,43,1,2,'cross'),rect(61,38,1,2,'cross'));
    obs.push(rect(30,22,1,2,'cross'),rect(34,22,1,2,'cross'),rect(38,22,1,2,'cross'),rect(42,22,1,2,'cross'));
    obs.push(rect(30,27,1,2,'cross'),rect(34,27,1,2,'cross'),rect(38,27,1,2,'cross'),rect(42,27,1,2,'cross'));
    obs.push(rect(36,5,1,3,'tree'),rect(68,12,1,3,'tree'),rect(3,25,1,3,'tree'));
    obs.push(rect(70,38,1,3,'tree'),rect(28,50,1,3,'tree'),rect(60,52,1,3,'tree'));
    obs.push(rect(32,10,12,1,'stone'),rect(6,48,12,1,'stone'));
    obs.push(rect(55,24,12,1,'stone'),rect(35,45,1,12,'stone'));
    obs.push(rect(13,2,6,1,'fence'),rect(25,2,6,1,'fence'),rect(45,2,6,1,'fence'),rect(60,2,6,1,'fence'));
    obs.push(rect(13,57,6,1,'fence'),rect(35,57,6,1,'fence'),rect(55,57,6,1,'fence'));
    obs.push(rect(65,48,2,2,'well'));
    obs.push(rect(48,20,1,1,'shrub'),rect(72,28,1,1,'shrub'),rect(15,52,1,1,'shrub'),rect(40,5,1,1,'shrub'));
    obs.push(rect(8,18,1,1,'shrub'),rect(74,50,1,1,'shrub'),rect(56,35,1,1,'shrub'));
    return obs;
  }

  function buildGardenObstacles() {
    const obs = [];
    obs.push(rect(0,0,100,1,'hedge'),rect(0,69,100,1,'hedge'),rect(0,0,1,70,'hedge'),rect(99,0,1,70,'hedge'));
    obs.push(rect(46,31,8,8,'stone'));
    obs.push(rect(10,15,12,1,'hedge'),rect(30,10,8,1,'hedge'),rect(60,18,10,1,'hedge'),rect(75,30,8,1,'hedge'));
    obs.push(rect(20,45,14,1,'hedge'),rect(60,50,10,1,'hedge'),rect(38,58,8,1,'hedge'),rect(80,55,12,1,'hedge'));
    obs.push(rect(25,20,1,8,'hedge'),rect(40,12,1,10,'hedge'),rect(70,25,1,8,'hedge'));
    obs.push(rect(15,50,1,8,'hedge'),rect(55,35,1,8,'hedge'),rect(85,20,1,12,'hedge'),rect(35,42,1,8,'hedge'));
    obs.push(rect(5,5,3,3,'flower'),rect(92,5,3,3,'flower'),rect(5,62,3,3,'flower'));
    obs.push(rect(92,62,3,3,'flower'),rect(20,30,3,3,'flower'),rect(74,55,3,3,'flower'));
    obs.push(rect(3,3,2,2,'tree'),rect(95,3,2,2,'tree'),rect(3,65,2,2,'tree'));
    obs.push(rect(95,65,2,2,'tree'),rect(47,3,2,2,'tree'),rect(47,65,2,2,'tree'));
    obs.push(rect(12,8,3,1,'bench'),rect(72,12,3,1,'bench'),rect(8,38,3,1,'bench'));
    obs.push(rect(88,40,3,1,'bench'),rect(50,60,3,1,'bench'),rect(28,62,3,1,'bench'));
    obs.push(rect(8,8,1,2,'lamp'),rect(90,8,1,2,'lamp'),rect(8,60,1,2,'lamp'),rect(90,60,1,2,'lamp'));
    obs.push(rect(49,28,1,2,'lamp'),rect(49,42,1,2,'lamp'));
    obs.push(rect(22,18,2,3,'statue'),rect(72,50,2,3,'statue'));
    obs.push(rect(18,62,2,2,'birdbath'),rect(78,8,2,2,'birdbath'));
    obs.push(rect(42,22,1,2,'pillar'),rect(45,22,1,2,'pillar'),rect(48,22,1,2,'pillar'),rect(51,22,1,2,'pillar'));
    obs.push(rect(42,26,1,2,'pillar'),rect(45,26,1,2,'pillar'),rect(48,26,1,2,'pillar'),rect(51,26,1,2,'pillar'));
    return obs;
  }

  function buildHouseObstacles() {
    const obs = [];
    obs.push(rect(0,0,60,1,'stone'),rect(0,79,60,1,'stone'),rect(0,0,1,80,'stone'),rect(59,0,1,80,'stone'));
    obs.push(rect(1,15,9,1,'stone'),rect(13,15,7,1,'stone'),rect(21,15,38,1,'stone'));
    obs.push(rect(20,1,1,14,'stone'),rect(40,1,1,39,'stone'));
    obs.push(rect(1,39,27,1,'stone'),rect(33,39,26,1,'stone'));
    obs.push(rect(30,40,1,40,'stone'));
    obs.push(rect(1,55,13,1,'stone'),rect(18,55,12,1,'stone'),rect(32,55,27,1,'stone'));
    obs.push(rect(2,2,4,2,'fireplace'));
    obs.push(rect(8,2,2,1,'chair'),rect(10,2,2,1,'chair'));
    obs.push(rect(22,3,5,2,'table'));
    obs.push(rect(22,2,1,1,'chair'),rect(24,2,1,1,'chair'),rect(26,2,1,1,'chair'));
    obs.push(rect(22,5,1,1,'chair'),rect(24,5,1,1,'chair'),rect(26,5,1,1,'chair'));
    obs.push(rect(42,1,1,6,'shelf'),rect(55,1,1,6,'shelf'));
    obs.push(rect(47,1,2,2,'mirror'));
    obs.push(rect(2,20,1,2,'clock'),rect(5,20,3,2,'table'));
    obs.push(rect(10,20,2,1,'chair'));
    obs.push(rect(28,37,2,2,'stairs'),rect(30,37,2,2,'stairs'));
    obs.push(rect(2,42,5,2,'table'),rect(2,47,1,4,'shelf'));
    obs.push(rect(10,42,2,1,'chair'));
    obs.push(rect(33,42,5,2,'table'));
    obs.push(rect(50,42,1,6,'shelf'),rect(53,42,1,6,'shelf'));
    return obs;
  }

  const AREAS = {
    graveyard: {
      label: 'Graveyard',
      bgColor: '#1a2e1a',
      areaWidth:  80 * T,  // 2560
      areaHeight: 60 * T,  // 1920
      obstacles: buildGraveyardObstacles(),
      spawnZones: [
        { x: 512,  y: 512,  w: 384, h: 384 },  // NW quadrant
        { x: 1536, y: 256,  w: 512, h: 384 },  // NE quadrant
        { x: 256,  y: 1280, w: 384, h: 512 },  // SW quadrant
        { x: 1536, y: 1280, w: 512, h: 512 },  // SE quadrant
      ],
      playerStart: { x: 1280, y: 960 },
    },
    garden: {
      label: 'Garden',
      bgColor: '#2d4a1e',
      areaWidth:  100 * T, // 3200
      areaHeight:  70 * T, // 2240
      obstacles: buildGardenObstacles(),
      spawnZones: [
        { x: 128,  y: 128,  w: 512, h: 512 },
        { x: 1600, y: 256,  w: 512, h: 512 },
        { x: 256,  y: 1280, w: 512, h: 640 },
      ],
      playerStart: { x: 1600, y: 1120 },
    },
    house: {
      label: 'Old House',
      bgColor: '#1a1510',
      areaWidth:  60 * T,  // 1920
      areaHeight: 80 * T,  // 2560
      obstacles: buildHouseObstacles(),
      spawnZones: [
        { x:  64, y:  64, w: 512, h: 384 },  // ground floor left rooms
        { x: 768, y:  64, w: 512, h: 384 },  // ground floor right room
        { x:  64, y: 1344, w: 512, h: 512 }, // basement left
        { x: 1024, y: 1344, w: 512, h: 512 },// basement right
      ],
      playerStart: { x: 960, y: 640 },
    },
  };

  // ─── Ouija letter positions ───────────────────────────────────────────────
  function buildLetterPositions() {
    const pos = {};
    const r1 = 'ABCDEFGHIJKLM', r2 = 'NOPQRSTUVWXYZ';
    r1.split('').forEach((l, i) => {
      pos[l] = { x: 0.07 + i * 0.065, y: 0.38 + Math.sin(i / (r1.length - 1) * Math.PI) * 0.07 };
    });
    r2.split('').forEach((l, i) => {
      pos[l] = { x: 0.07 + i * 0.065, y: 0.54 + Math.sin(i / (r2.length - 1) * Math.PI) * 0.07 };
    });
    return pos;
  }
  const LETTER_POS = buildLetterPositions();

  // ─── Ouija Sequence Generation ────────────────────────────────────────────
  function buildOuijaSequence(name, personality) {
    const cfg = PCONFIG[personality] || PCONFIG.confused;
    const [minDiv, maxDiv] = cfg.diversions;
    const allLetters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const sequence = [];
    for (const letter of name) {
      const pos = LETTER_POS[letter];
      if (!pos) continue;
      const numDiv = minDiv + Math.floor(Math.random() * (maxDiv - minDiv + 1));
      for (let d = 0; d < numDiv; d++) {
        const fakeLetter = allLetters[Math.floor(Math.random() * allLetters.length)];
        const fakePos = LETTER_POS[fakeLetter] || pos;
        sequence.push({ letter: fakeLetter, isReal: false, targetX: fakePos.x, targetY: fakePos.y });
      }
      sequence.push({ letter, isReal: true, targetX: pos.x, targetY: pos.y });
    }
    return sequence;
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────
  function randomBetween(min, max) {
    return min + Math.random() * (max - min);
  }

  function clamp(val, lo, hi) {
    return Math.max(lo, Math.min(hi, val));
  }

  function randomSpawn(spawnZones) {
    const zone = spawnZones[Math.floor(Math.random() * spawnZones.length)];
    return {
      x: zone.x + Math.random() * zone.w,
      y: zone.y + Math.random() * zone.h,
    };
  }

  function randomName(personality) {
    const pool = NAME_POOLS[personality] || NAME_POOLS.confused;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  // ─── Obstacle collision (simple AABB sliding) ─────────────────────────────
  function resolveObstacle(nx, ny, obstacles, ghostRadius) {
    const r = ghostRadius || 16;
    for (const ob of obstacles) {
      const left   = ob.x - r;
      const right  = ob.x + ob.w + r;
      const top    = ob.y - r;
      const bottom = ob.y + ob.h + r;
      if (nx > left && nx < right && ny > top && ny < bottom) {
        // Push out on shortest axis
        const overlapL = nx - left;
        const overlapR = right - nx;
        const overlapT = ny - top;
        const overlapB = bottom - ny;
        const minOH = Math.min(overlapL, overlapR);
        const minOV = Math.min(overlapT, overlapB);
        if (minOH < minOV) {
          nx = (overlapL < overlapR) ? left : right;
        } else {
          ny = (overlapT < overlapB) ? top : bottom;
        }
      }
    }
    return { x: nx, y: ny };
  }

  // ─── Ghost AI ─────────────────────────────────────────────────────────────
  function updateGhost(ghost, dt, areaData, playerPositions) {
    if (ghost.identified || ghost.claimedBy !== null) return;

    const { areaWidth, areaHeight, obstacles } = areaData;
    const cfg = PCONFIG[ghost.personality];
    const MARGIN = 64;

    ghost.stateTimer -= dt;

    if (ghost.stateTimer <= 0) {
      // Pick new behavior
      switch (ghost.personality) {

        case 'shy': {
          // Check for nearby players
          let nearest = null, nearestDist = Infinity;
          for (const pp of playerPositions) {
            if (!pp) continue;
            const d = Math.hypot(pp.x - ghost.x, pp.y - ghost.y);
            if (d < nearestDist) { nearestDist = d; nearest = pp; }
          }
          if (nearest && cfg.fleeRange > 0 && nearestDist < cfg.fleeRange) {
            // Flee away
            const angle = Math.atan2(ghost.y - nearest.y, ghost.x - nearest.x);
            const dist  = randomBetween(150, 300);
            ghost.targetX = clamp(ghost.x + Math.cos(angle) * dist, MARGIN, areaWidth  - MARGIN);
            ghost.targetY = clamp(ghost.y + Math.sin(angle) * dist, MARGIN, areaHeight - MARGIN);
            ghost.stateTimer = 1000;
          } else {
            ghost.targetX = randomBetween(MARGIN, areaWidth  - MARGIN);
            ghost.targetY = randomBetween(MARGIN, areaHeight - MARGIN);
            ghost.stateTimer = randomBetween(2000, 5000);
          }
          break;
        }

        case 'dramatic': {
          const angle  = randomBetween(0, Math.PI * 2);
          const radius = randomBetween(100, 300);
          ghost.targetX = clamp(ghost.x + Math.cos(angle) * radius, MARGIN, areaWidth  - MARGIN);
          ghost.targetY = clamp(ghost.y + Math.sin(angle) * radius, MARGIN, areaHeight - MARGIN);
          ghost.stateTimer = randomBetween(1500, 3500);
          ghost.sprintActive = Math.random() < 0.30;
          break;
        }

        case 'goofy': {
          ghost.targetX = clamp(ghost.x + randomBetween(-300, 300), MARGIN, areaWidth  - MARGIN);
          ghost.targetY = clamp(ghost.y + randomBetween(-300, 300), MARGIN, areaHeight - MARGIN);
          ghost.stateTimer = randomBetween(500, 2000);
          break;
        }

        case 'grumpy': {
          // Check for nearby players → charge
          let nearest = null, nearestDist = Infinity;
          for (const pp of playerPositions) {
            if (!pp) continue;
            const d = Math.hypot(pp.x - ghost.x, pp.y - ghost.y);
            if (d < nearestDist) { nearestDist = d; nearest = pp; }
          }
          if (nearest && nearestDist < 150) {
            ghost.targetX = nearest.x;
            ghost.targetY = nearest.y;
            ghost.stateTimer = 800;
            ghost.charging = true;
          } else {
            ghost.charging = false;
            if (!ghost.patrolBase) ghost.patrolBase = { x: ghost.x, y: ghost.y };
            ghost.targetX = clamp(ghost.patrolBase.x + randomBetween(-200, 200), MARGIN, areaWidth  - MARGIN);
            ghost.targetY = clamp(ghost.patrolBase.y + randomBetween(-200, 200), MARGIN, areaHeight - MARGIN);
            ghost.stateTimer = randomBetween(3000, 7000);
          }
          break;
        }

        case 'regal': {
          if (!ghost.orbitCenter) {
            ghost.orbitCenter = { x: ghost.x, y: ghost.y };
          }
          ghost.orbitAngle = (ghost.orbitAngle || 0) + Math.PI / 4;
          const radius = randomBetween(128, 384);
          ghost.targetX = clamp(ghost.orbitCenter.x + Math.cos(ghost.orbitAngle) * radius, MARGIN, areaWidth  - MARGIN);
          ghost.targetY = clamp(ghost.orbitCenter.y + Math.sin(ghost.orbitAngle) * radius, MARGIN, areaHeight - MARGIN);
          ghost.stateTimer = randomBetween(4000, 7000);
          break;
        }

        case 'confused':
        default: {
          ghost.targetX = clamp(ghost.x + randomBetween(-150, 150), MARGIN, areaWidth  - MARGIN);
          ghost.targetY = clamp(ghost.y + randomBetween(-150, 150), MARGIN, areaHeight - MARGIN);
          ghost.stateTimer = randomBetween(300, 1500);
          break;
        }
      }
    }

    // Move toward target
    const dx = ghost.targetX - ghost.x;
    const dy = ghost.targetY - ghost.y;
    const dist = Math.hypot(dx, dy);
    if (dist > 2) {
      let spd = cfg.speed;
      if (ghost.personality === 'dramatic' && ghost.sprintActive) spd *= 2;
      if (ghost.personality === 'regal') spd *= 0.7;
      const step = Math.min(spd * dt / 1000, dist);
      const nx = ghost.x + (dx / dist) * step;
      const ny = ghost.y + (dy / dist) * step;
      const resolved = resolveObstacle(nx, ny, obstacles, 16);
      ghost.x = clamp(resolved.x, MARGIN, areaWidth  - MARGIN);
      ghost.y = clamp(resolved.y, MARGIN, areaHeight - MARGIN);
    }
  }

  // ─── Signal Computation ───────────────────────────────────────────────────
  function computeSignals(ghost, playerPos, facing) {
    const dx = ghost.x - playerPos.x;
    const dy = ghost.y - playerPos.y;
    const dist = Math.hypot(dx, dy);
    const emf   = Math.max(0, 1 - dist / EMF_RANGE);
    const sound  = Math.max(0, 1 - dist / SOUND_RANGE);
    let flashlight = 0;
    if (dist < FLASH_RANGE) {
      const gAngle = Math.atan2(dy, dx);
      let diff = Math.abs(gAngle - facing);
      if (diff > Math.PI) diff = 2 * Math.PI - diff;
      if (diff < FLASH_ANGLE) {
        flashlight = (1 - dist / FLASH_RANGE) * (1 - diff / FLASH_ANGLE);
      }
    }
    return { emf, sound, flashlight };
  }

  // ─── Spawn ghosts ─────────────────────────────────────────────────────────
  function spawnGhosts(areaData) {
    const ghosts = [];
    const usedPersonalities = [];
    for (let i = 0; i < 3; i++) {
      let personality;
      do {
        personality = PERSONALITIES[Math.floor(Math.random() * PERSONALITIES.length)];
      } while (usedPersonalities.includes(personality) && usedPersonalities.length < PERSONALITIES.length);
      usedPersonalities.push(personality);

      const name = randomName(personality);
      const pos  = randomSpawn(areaData.spawnZones);
      const cfg  = PCONFIG[personality];

      ghosts.push({
        id: i,
        personality,
        name,
        color: cfg.color,
        x: pos.x,
        y: pos.y,
        targetX: pos.x,
        targetY: pos.y,
        found: false,
        claimedBy: null,
        identified: false,
        ouijaAttempts: 0,
        stateTimer: 0,
        behaviorState: 'wander',
        patrolBase: null,
        orbitAngle: 0,
        orbitCenter: null,
        sprintActive: false,
        charging: false,
      });
    }
    return ghosts;
  }

  // ─── Tick ─────────────────────────────────────────────────────────────────
  function startTick(state, roomId) {
    let lastTime = Date.now();

    state.ghost.tickRef = setInterval(() => {
      if (!state.ghost || state.phase !== 'playing') return;

      const now = Date.now();
      const dt  = now - lastTime;
      lastTime  = now;

      const gs       = state.ghost;
      const areaData = AREAS[gs.area];
      const ghosts   = gs.ghosts;

      // Collect player positions
      const playerPositions = state.players.map(p => p.ghostPos || null);

      // Update each active ghost AI
      for (const ghost of ghosts) {
        if (!ghost.identified && ghost.claimedBy === null) {
          updateGhost(ghost, dt, areaData, playerPositions);
        }
      }

      // Emit signals to each human player; broadcast positions of found ghosts
      for (let pi = 0; pi < state.players.length; pi++) {
        const player = state.players[pi];
        if (player.isAI) continue;

        const playerPos = player.ghostPos || areaData.playerStart;
        const facing    = player.ghostFacing || 0;

        // Compute signals for each unfound ghost
        const signals = [];
        let emfDir = null, sndDir = null, maxEmf = 0, maxSnd = 0;
        for (const ghost of ghosts) {
          if (ghost.identified) continue;
          const sig = computeSignals(ghost, playerPos, facing);
          signals.push({ ghostId: ghost.id, ...sig });

          // Track strongest signal direction for arrow indicator
          if (sig.emf > maxEmf) {
            maxEmf = sig.emf;
            emfDir = Math.atan2(ghost.y - playerPos.y, ghost.x - playerPos.x);
          }
          if (sig.sound > maxSnd) {
            maxSnd = sig.sound;
            sndDir = Math.atan2(ghost.y - playerPos.y, ghost.x - playerPos.x);
          }

          // Detection: flashlight > 0.6 → found
          if (!ghost.found && sig.flashlight > 0.6) {
            ghost.found = true;
            io.to(roomId).emit('ghost:found', {
              ghostId:    ghost.id,
              x:          ghost.x,
              y:          ghost.y,
              personality: ghost.personality,
              color:       ghost.color,
              nameLength:  ghost.name.length,
            });
          }
        }

        io.to(player.id).emit('ghost:signals', {
          signals,
          emfDir: maxEmf > 0.05 ? emfDir : null,
          sndDir: maxSnd > 0.05 ? sndDir : null,
        });
      }

      // Broadcast found (but not yet identified) ghost positions to whole room
      for (const ghost of ghosts) {
        if (ghost.found && !ghost.identified) {
          io.to(roomId).emit('ghost:position', {
            ghostId: ghost.id,
            x: ghost.x,
            y: ghost.y,
          });
        }
      }
    }, TICK_MS);
  }

  // ─── Clear all timers ─────────────────────────────────────────────────────
  function clearAllTimers(gs) {
    if (!gs) return;
    if (gs.tickRef) { clearInterval(gs.tickRef); gs.tickRef = null; }
    for (const ghostId of Object.keys(gs.ouijaTimers || {})) {
      if (gs.ouijaTimers[ghostId]) {
        clearInterval(gs.ouijaTimers[ghostId]);
        delete gs.ouijaTimers[ghostId];
      }
    }
  }

  // ─── startGame ────────────────────────────────────────────────────────────
  function startGame(state, roomId) {
    // Clear any existing state
    clearAllTimers(state.ghost);

    // Pick area (respect host's selection if valid, otherwise random)
    const areaKeys = ['graveyard', 'garden', 'house'];
    const areaKey  = (state.ghostArea && AREAS[state.ghostArea]) ? state.ghostArea
                   : areaKeys[Math.floor(Math.random() * areaKeys.length)];
    const areaData = AREAS[areaKey];

    // Spawn ghosts
    const ghosts = spawnGhosts(areaData);

    // Build state
    state.ghost = {
      area:           areaKey,
      ghosts,
      ouijaTimers:    {},
      tickRef:        null,
      identifiedCount: 0,
      totalGhosts:    3,
    };
    state.phase = 'playing';

    // Init each player's position / facing
    for (const player of state.players) {
      player.ghostPos    = { x: areaData.playerStart.x, y: areaData.playerStart.y };
      player.ghostFacing = 0;
    }

    // Emit gameStart to each human player
    state.players.forEach((player, idx) => {
      if (player.isAI) return;
      io.to(player.id).emit('gameStart', {
        roomId,
        myPlayerIndex: idx,
        players: state.players.map(p => ({ name: p.name, isAI: p.isAI })),
        game: 'ghost',
        ghost: {
          area:        areaKey,
          areaWidth:   areaData.areaWidth,
          areaHeight:  areaData.areaHeight,
          obstacles:   areaData.obstacles,
          playerStart: areaData.playerStart,
          ghostCount:  3,
          bgColor:     areaData.bgColor,
          label:       areaData.label,
        },
      });
    });

    startTick(state, roomId);
  }

  // ─── registerEvents ───────────────────────────────────────────────────────
  function registerEvents(socket, rooms) {

    // Player movement
    socket.on('ghost:move', ({ roomId, x, y, facing }) => {
      const state = rooms.get(roomId);
      if (!state || !state.ghost || state.phase !== 'playing') return;
      const areaData = AREAS[state.ghost.area];
      const playerIndex = state.players.findIndex(p => p.id === socket.id);
      if (playerIndex === -1) return;
      const cx = clamp(x, 0, areaData.areaWidth);
      const cy = clamp(y, 0, areaData.areaHeight);
      state.players[playerIndex].ghostPos    = { x: cx, y: cy };
      state.players[playerIndex].ghostFacing = facing || 0;
      socket.to(roomId).emit('ghost:player_pos', { playerIndex, x: cx, y: cy });
    });

    // Place ouija board
    socket.on('ghost:place_board', ({ roomId, ghostId }) => {
      const state = rooms.get(roomId);
      if (!state || !state.ghost || state.phase !== 'playing') return;
      const gs    = state.ghost;
      const ghost = gs.ghosts[ghostId];
      if (!ghost) return;
      const playerIndex = state.players.findIndex(p => p.id === socket.id);
      if (playerIndex === -1) return;
      if (!ghost.found || ghost.identified || ghost.claimedBy !== null || ghost.ouijaAttempts >= 3) return;

      ghost.claimedBy = playerIndex;
      // Broadcast claim so all clients can hide the "Place Board" button
      io.to(roomId).emit('ghost:claimed', { ghostId });

      const cfg      = PCONFIG[ghost.personality];
      const sequence = buildOuijaSequence(ghost.name.toUpperCase(), ghost.personality);
      let timeLeft   = cfg.ouijaTime;

      const timer = setInterval(() => {
        timeLeft--;
        socket.emit('ghost:ouija_tick', { ghostId, timeLeft });
        if (timeLeft <= 0) {
          clearInterval(gs.ouijaTimers[ghostId]);
          delete gs.ouijaTimers[ghostId];
          ghost.claimedBy = null;
          socket.emit('ghost:ouija_timeout', { ghostId });
          io.to(roomId).emit('ghost:released', { ghostId });
        }
      }, 1000);

      gs.ouijaTimers[ghostId] = timer;

      socket.emit('ghost:ouija_start', {
        ghostId, sequence, timeLimit: cfg.ouijaTime,
        personality: ghost.personality, attemptsLeft: 3 - ghost.ouijaAttempts,
      });
    });

    // Submit name guess
    socket.on('ghost:submit_name', ({ roomId, ghostId, name }) => {
      const state = rooms.get(roomId);
      if (!state || !state.ghost || state.phase !== 'playing') return;
      const gs    = state.ghost;
      const ghost = gs.ghosts[ghostId];
      if (!ghost) return;
      const playerIndex = state.players.findIndex(p => p.id === socket.id);
      if (playerIndex === -1) return;

      if ((name || '').trim().toLowerCase() === ghost.name.toLowerCase()) {
        ghost.identified = true;
        ghost.claimedBy  = null;
        if (gs.ouijaTimers[ghostId]) { clearInterval(gs.ouijaTimers[ghostId]); delete gs.ouijaTimers[ghostId]; }
        gs.identifiedCount++;
        const cfg = PCONFIG[ghost.personality];
        io.to(roomId).emit('ghost:identified', {
          ghostId, name: ghost.name, personality: ghost.personality,
          color: cfg.color, description: cfg.description, identifiedBy: playerIndex,
        });
        if (gs.identifiedCount >= gs.totalGhosts) {
          clearAllTimers(gs);
          endGame(state, roomId, playerIndex);
        }
      } else {
        // Wrong guess: immediately release claim, increment counter
        ghost.claimedBy = null;
        if (gs.ouijaTimers[ghostId]) { clearInterval(gs.ouijaTimers[ghostId]); delete gs.ouijaTimers[ghostId]; }
        ghost.ouijaAttempts++;
        io.to(roomId).emit('ghost:released', { ghostId });

        if (ghost.ouijaAttempts >= 3) {
          // Ghost flees to a new location and resets
          const areaData = AREAS[gs.area];
          const newPos = randomSpawn(areaData.spawnZones);
          ghost.x = newPos.x; ghost.y = newPos.y;
          ghost.targetX = newPos.x; ghost.targetY = newPos.y;
          ghost.found = false; ghost.ouijaAttempts = 0; ghost.stateTimer = 0;
          io.to(roomId).emit('ghost:respawn', { ghostId, personality: ghost.personality, color: ghost.color });
          socket.emit('ghost:wrong_name', { ghostId, attemptsLeft: 0, respawned: true });
        } else {
          socket.emit('ghost:wrong_name', { ghostId, attemptsLeft: 3 - ghost.ouijaAttempts });
        }
      }
    });

    // Close board
    socket.on('ghost:close_board', ({ roomId, ghostId }) => {
      const state = rooms.get(roomId);
      if (!state || !state.ghost) return;
      const gs    = state.ghost;
      const ghost = gs.ghosts[ghostId];
      if (!ghost) return;
      ghost.claimedBy = null;
      if (gs.ouijaTimers[ghostId]) { clearInterval(gs.ouijaTimers[ghostId]); delete gs.ouijaTimers[ghostId]; }
      io.to(roomId).emit('ghost:released', { ghostId });
    });
  }

  // ─── getReconnectData ─────────────────────────────────────────────────────
  function getReconnectData(state, playerIndex) {
    if (!state.ghost) return {};
    const gs       = state.ghost;
    const areaData = AREAS[gs.area];
    const player   = state.players[playerIndex];
    return {
      ghost: {
        area:        gs.area,
        areaWidth:   areaData.areaWidth,
        areaHeight:  areaData.areaHeight,
        obstacles:   areaData.obstacles,
        playerStart: player ? player.ghostPos : areaData.playerStart,
        ghostCount:  gs.totalGhosts,
        identified:  gs.identifiedCount,
        bgColor:     areaData.bgColor,
        label:       areaData.label,
        foundGhosts: gs.ghosts.filter(g => g.found).map(g => ({
          id: g.id, x: g.x, y: g.y, personality: g.personality,
          color: g.color, nameLength: g.name.length, identified: g.identified,
        })),
      },
    };
  }

  return { startGame, registerEvents, getReconnectData };
};
