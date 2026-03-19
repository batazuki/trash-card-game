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

  // ── Noise-based flicker system ───────────────────────────────────────────
  const FLICKER_NOISE = new Float32Array(256);
  for (let i = 0; i < 256; i++) FLICKER_NOISE[i] = Math.random();
  function flickerNoise(t, speed, seed) {
    const idx = ((t * speed + seed) | 0) & 255;
    const next = (idx + 1) & 255;
    const frac = (t * speed + seed) - Math.floor(t * speed + seed);
    return FLICKER_NOISE[idx] * (1 - frac) + FLICKER_NOISE[next] * frac;
  }
  function getFlicker(now, seed) {
    const t = now * 0.001;
    return 0.65
      + flickerNoise(t, 8.0, seed)      * 0.15   // fast jitter
      + flickerNoise(t, 2.5, seed + 50) * 0.12   // medium wave
      + flickerNoise(t, 0.7, seed + 99) * 0.08;  // slow drift
  }

  // ── Avatar pixel-art palettes ────────────────────────────────────────────
  const PIXEL = 2; // real pixels per art unit

  const CHAR_PAL = [
    { name: 'Pirate',
      skin: '#f4c07a', skinSh: '#c0885a',
      coat: '#243070', coatSh: '#141840', coatHi: '#3a4898',
      trim: '#c8a020', trim2: '#ff8820',
      pant: '#101820', pantSh: '#080c10',
      boot: '#4a2814',
      hat: '#1a1d38', hatHi: '#2a2d50',
    },
    { name: 'Explorer',
      skin: '#e8aa7a', skinSh: '#b87840',
      coat: '#c8a860', coatSh: '#907535', coatHi: '#ddc478',
      trim: '#e8d040', trim2: '#508830',
      pant: '#3a5818', pantSh: '#283c10',
      boot: '#5a3010',
      hat: '#d4ac58', hatHi: '#c49840',
    },
    { name: 'Police',
      skin: '#f4c07a', skinSh: '#c0885a',
      coat: '#182050', coatSh: '#0c1030', coatHi: '#243070',
      trim: '#6090e0', trim2: '#e8c030',
      pant: '#182050', pantSh: '#0c1030',
      boot: '#0c0c18',
      hat: '#0c1028', hatHi: '#182048',
    },
    { name: 'Doctor',
      skin: '#f4c07a', skinSh: '#c0885a',
      coat: '#e4eef8', coatSh: '#b0c8d8', coatHi: '#f8fcff',
      trim: '#3880b0', trim2: '#d82840',
      pant: '#3878b0', pantSh: '#2a5888',
      boot: '#c0c4d0',
      hat: '#c0d4e4', hatHi: '#d8ecf8',
    },
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

  function buildHotelObs() {
    const o = [];
    // Outer walls
    o.push(rect(0,0,80,1,'stone'), rect(0,79,80,1,'stone'));
    o.push(rect(0,0,1,80,'stone'), rect(79,0,1,80,'stone'));
    // Interior side walls separating lobby back office from main lobby
    o.push(rect(20,1,1,13,'stone'), rect(59,1,1,13,'stone'));
    // Back office wall
    o.push(rect(21,6,38,1,'stone'));
    // Back office furniture
    o.push(rect(22,2,7,3,'table'), rect(50,2,7,3,'table'));
    o.push(rect(31,2,1,4,'shelf'), rect(47,2,1,4,'shelf'));
    // Reception counter
    o.push(rect(31,8,18,3,'counter'));
    // Grand entrance columns
    o.push(rect(7,5,2,4,'pillar'), rect(13,5,2,4,'pillar'));
    o.push(rect(63,5,2,4,'pillar'), rect(69,5,2,4,'pillar'));
    // Lobby sofas
    o.push(rect(3,7,5,3,'sofa'), rect(72,7,5,3,'sofa'));
    // Coffee tables
    o.push(rect(4,10,3,2,'table'), rect(73,10,3,2,'table'));
    // Staircase banks
    o.push(rect(38,8,4,5,'stairs'), rect(44,8,4,5,'stairs'));
    // Elevators
    o.push(rect(28,8,4,5,'elevator'), rect(49,8,4,5,'elevator'));
    // Lobby candelabras (non-collidable)
    o.push(rect(22,8,1,1,'candle'), rect(57,8,1,1,'candle'));
    // Lobby divider wall with passages
    o.push(rect(1,14,19,1,'stone'));   // left solid
    // passage x=20-27
    o.push(rect(28,14,24,1,'stone'));  // center solid
    // passage x=53-59
    o.push(rect(60,14,19,1,'stone')); // right solid

    // ── WING A — left rooms (x=1-19, y=15-58) ─────────────────────────────
    // Wing A right wall — 3 doorways (every 2 rooms: y=17-18, y=31-32, y=45-46)
    o.push(rect(19,15,1,2,'stone'), rect(19,19,1,12,'stone'), rect(19,33,1,12,'stone'), rect(19,47,1,11,'stone'));
    // Room 101 (y=15-20)
    o.push(rect(1,21,18,1,'stone'));
    o.push(rect(2,16,7,3,'bed')); o.push(rect(14,16,3,3,'mirror')); o.push(rect(14,19,2,1,'table'));
    // Room 102 (y=22-27)
    o.push(rect(1,28,18,1,'stone'));
    o.push(rect(2,23,7,3,'bed')); o.push(rect(14,23,3,3,'mirror')); o.push(rect(14,26,2,1,'table')); o.push(rect(11,27,2,1,'chair'));
    // Room 103 (y=29-34)
    o.push(rect(1,35,18,1,'stone'));
    o.push(rect(2,30,7,3,'bed')); o.push(rect(14,30,3,3,'mirror')); o.push(rect(14,33,2,1,'table'));
    // Room 104 (y=36-41)
    o.push(rect(1,42,18,1,'stone'));
    o.push(rect(2,37,7,3,'bed')); o.push(rect(14,37,3,3,'mirror')); o.push(rect(14,40,2,1,'table')); o.push(rect(11,41,2,1,'chair'));
    // Room 105 (y=43-48)
    o.push(rect(1,49,18,1,'stone'));
    o.push(rect(2,44,7,3,'bed')); o.push(rect(14,44,3,3,'mirror')); o.push(rect(14,47,2,1,'table'));
    // Room 106 (y=50-55)
    o.push(rect(1,56,18,1,'stone'));
    o.push(rect(2,51,7,3,'bed')); o.push(rect(14,51,3,3,'mirror')); o.push(rect(14,54,2,1,'table')); o.push(rect(11,55,2,1,'chair'));

    // ── WING B — right rooms (x=61-79, y=15-58) ───────────────────────────
    // Wing B left wall — 3 doorways (every 2 rooms: y=17-18, y=31-32, y=45-46)
    o.push(rect(60,15,1,2,'stone'), rect(60,19,1,12,'stone'), rect(60,33,1,12,'stone'), rect(60,47,1,11,'stone'));
    // Room 201 (y=15-20)
    o.push(rect(61,21,18,1,'stone'));
    o.push(rect(70,16,7,3,'bed')); o.push(rect(62,16,3,3,'mirror')); o.push(rect(62,19,2,1,'table'));
    // Room 202 (y=22-27)
    o.push(rect(61,28,18,1,'stone'));
    o.push(rect(70,23,7,3,'bed')); o.push(rect(62,23,3,3,'mirror')); o.push(rect(62,26,2,1,'table')); o.push(rect(66,27,2,1,'chair'));
    // Room 203 (y=29-34)
    o.push(rect(61,35,18,1,'stone'));
    o.push(rect(70,30,7,3,'bed')); o.push(rect(62,30,3,3,'mirror')); o.push(rect(62,33,2,1,'table'));
    // Room 204 (y=36-41)
    o.push(rect(61,42,18,1,'stone'));
    o.push(rect(70,37,7,3,'bed')); o.push(rect(62,37,3,3,'mirror')); o.push(rect(62,40,2,1,'table')); o.push(rect(66,41,2,1,'chair'));
    // Room 205 (y=43-48)
    o.push(rect(61,49,18,1,'stone'));
    o.push(rect(70,44,7,3,'bed')); o.push(rect(62,44,3,3,'mirror')); o.push(rect(62,47,2,1,'table'));
    // Room 206 (y=50-55)
    o.push(rect(61,56,18,1,'stone'));
    o.push(rect(70,51,7,3,'bed')); o.push(rect(62,51,3,3,'mirror')); o.push(rect(62,54,2,1,'table')); o.push(rect(66,55,2,1,'chair'));

    // ── CENTRAL BALLROOM (x=20-59, y=15-37) ───────────────────────────────
    // Ballroom bottom wall — 2 passages into pool area (tiles 28-31 and 46-49 left open)
    o.push(rect(20,37,8,1,'stone'), rect(32,37,14,1,'stone'), rect(50,37,10,1,'stone'));
    // Corner pillars
    o.push(rect(21,16,2,3,'pillar'), rect(56,16,2,3,'pillar'));
    o.push(rect(21,33,2,3,'pillar'), rect(56,33,2,3,'pillar'));
    // Ballroom tables (4 cols × 3 rows)
    o.push(rect(24,18,3,3,'table'), rect(33,18,3,3,'table'), rect(42,18,3,3,'table'), rect(51,18,3,3,'table'));
    o.push(rect(24,25,3,3,'table'), rect(33,25,3,3,'table'), rect(42,25,3,3,'table'), rect(51,25,3,3,'table'));
    o.push(rect(24,32,3,3,'table'), rect(33,32,3,3,'table'), rect(42,32,3,3,'table'), rect(51,32,3,3,'table'));
    // Chairs (representative)
    o.push(rect(23,19,1,1,'chair'), rect(27,19,1,1,'chair'), rect(25,17,1,1,'chair'), rect(25,21,1,1,'chair'));
    o.push(rect(32,19,1,1,'chair'), rect(36,19,1,1,'chair'), rect(34,17,1,1,'chair'), rect(34,21,1,1,'chair'));
    o.push(rect(41,19,1,1,'chair'), rect(45,19,1,1,'chair'), rect(43,17,1,1,'chair'), rect(43,21,1,1,'chair'));
    o.push(rect(50,19,1,1,'chair'), rect(54,19,1,1,'chair'), rect(52,17,1,1,'chair'), rect(52,21,1,1,'chair'));
    o.push(rect(23,26,1,1,'chair'), rect(27,26,1,1,'chair'), rect(25,24,1,1,'chair'), rect(25,28,1,1,'chair'));
    o.push(rect(32,26,1,1,'chair'), rect(36,26,1,1,'chair'), rect(34,24,1,1,'chair'), rect(34,28,1,1,'chair'));
    o.push(rect(41,26,1,1,'chair'), rect(45,26,1,1,'chair'), rect(43,24,1,1,'chair'), rect(43,28,1,1,'chair'));
    o.push(rect(50,26,1,1,'chair'), rect(54,26,1,1,'chair'), rect(52,24,1,1,'chair'), rect(52,28,1,1,'chair'));
    // Ballroom chandeliers (non-collidable candles mark positions)
    o.push(rect(39,16,1,1,'candle'), rect(39,24,1,1,'candle'), rect(39,32,1,1,'candle'));

    // ── POOL ROOM (x=20-59, y=38-59) ──────────────────────────────────────
    // Pool room bottom wall — 2 passages into lower section (tiles 28-31 and 46-49 left open)
    o.push(rect(20,59,8,1,'stone'), rect(32,59,14,1,'stone'), rect(50,59,10,1,'stone'));
    // Swimming pool (non-collidable)
    o.push(rect(27,40,26,16,'pool'));
    // Lounge chairs
    o.push(rect(21,43,3,1,'chair'), rect(21,48,3,1,'chair'), rect(21,53,3,1,'chair'));
    o.push(rect(56,43,3,1,'chair'), rect(56,48,3,1,'chair'), rect(56,53,3,1,'chair'));
    o.push(rect(31,38,3,1,'chair'), rect(39,38,3,1,'chair'), rect(47,38,3,1,'chair'));
    o.push(rect(31,57,3,1,'chair'), rect(39,57,3,1,'chair'), rect(47,57,3,1,'chair'));
    // Potted plants near pool
    o.push(rect(21,40,2,2,'shrub'), rect(57,40,2,2,'shrub'));
    o.push(rect(21,56,2,2,'shrub'), rect(57,56,2,2,'shrub'));

    // ── LOWER SECTION (y=60-79) ─────────────────────────────────────────────
    // Wing A lower: service/laundry (x=1-19, y=60-79) — doorway at y=64-67
    o.push(rect(19,60,1,4,'stone'), rect(19,68,1,11,'stone'));
    o.push(rect(1,66,18,1,'stone'));    // room divider
    o.push(rect(9,60,1,6,'stone'));     // vertical divider
    o.push(rect(2,61,5,3,'table'), rect(11,61,6,3,'table'));
    o.push(rect(2,64,1,5,'shelf'), rect(5,64,1,5,'shelf'));
    o.push(rect(11,67,4,2,'table'));

    // BAR (x=20-39, y=60-79)
    o.push(rect(39,60,1,19,'stone'));   // right wall of bar
    o.push(rect(21,61,16,3,'counter')); // main bar counter
    o.push(rect(21,64,3,8,'counter'));  // return counter
    o.push(rect(21,61,1,3,'shelf'));    // back bar shelf
    // Bar stools
    o.push(rect(24,64,2,1,'chair'), rect(27,64,2,1,'chair'), rect(30,64,2,1,'chair'), rect(33,64,2,1,'chair'));
    // Lounge seating
    o.push(rect(25,69,4,3,'sofa'), rect(31,69,4,3,'sofa'));
    o.push(rect(27,73,5,2,'table'));
    // Candles
    o.push(rect(36,67,1,1,'candle'), rect(36,73,1,1,'candle'));

    // DINING ROOM (x=40-59, y=60-79)
    o.push(rect(59,60,1,19,'stone'));   // right wall of dining
    o.push(rect(40,66,20,1,'stone'));   // room divider
    o.push(rect(41,61,5,3,'table'), rect(50,61,5,3,'table'));
    o.push(rect(41,67,5,3,'table'), rect(50,67,5,3,'table'));
    o.push(rect(41,73,5,3,'table'), rect(50,73,5,3,'table'));
    o.push(rect(40,62,1,1,'chair'), rect(46,62,1,1,'chair'), rect(47,62,1,1,'chair'), rect(55,62,1,1,'chair'));
    o.push(rect(40,68,1,1,'chair'), rect(46,68,1,1,'chair'), rect(47,68,1,1,'chair'), rect(55,68,1,1,'chair'));
    o.push(rect(40,74,1,1,'chair'), rect(46,74,1,1,'chair'), rect(47,74,1,1,'chair'), rect(55,74,1,1,'chair'));
    o.push(rect(48,65,1,1,'candle'));

    // Wing B lower: storage/utility (x=61-79, y=60-79) — doorway at y=64-67
    o.push(rect(60,60,1,4,'stone'), rect(60,68,1,11,'stone'));
    o.push(rect(61,66,18,1,'stone'));
    o.push(rect(70,60,1,6,'stone'));
    o.push(rect(62,61,6,3,'table'), rect(72,61,5,3,'table'));
    o.push(rect(62,64,1,5,'shelf'), rect(65,64,1,5,'shelf'));

    // Bottom staircases
    o.push(rect(2,75,4,3,'stairs'), rect(73,75,4,3,'stairs'));

    // Corridor mirrors
    o.push(rect(19,25,1,3,'mirror'));
    o.push(rect(60,25,1,3,'mirror'));

    return o;
  }

  function buildEgyptObs() {
    const o = [];
    // Outer walls
    o.push(rect(0,0,90,1,'stone'), rect(0,69,90,1,'stone'));
    o.push(rect(0,0,1,70,'stone'), rect(89,0,1,70,'stone'));
    // Vestibule back wall (y=8): gap x=32-58 for center hall entry
    o.push(rect(1,8,31,1,'stone'), rect(59,8,30,1,'stone'));
    // Center hall west wall: doors at y=17-19, y=33-35, y=49-51
    o.push(rect(32,9,1,8,'stone'), rect(32,20,1,13,'stone'), rect(32,36,1,13,'stone'), rect(32,52,1,5,'stone'));
    // Center hall east wall: same doors
    o.push(rect(58,9,1,8,'stone'), rect(58,20,1,13,'stone'), rect(58,36,1,13,'stone'), rect(58,52,1,5,'stone'));
    // Center hall columns (4 rows × 2)
    o.push(rect(35,11,2,3,'pillar'), rect(53,11,2,3,'pillar'));
    o.push(rect(35,21,2,3,'pillar'), rect(53,21,2,3,'pillar'));
    o.push(rect(35,36,2,3,'pillar'), rect(53,36,2,3,'pillar'));
    o.push(rect(35,51,2,3,'pillar'), rect(53,51,2,3,'pillar'));
    // Central altar + flanking urns
    o.push(rect(40,28,10,5,'altar'));
    o.push(rect(38,29,2,2,'urn'), rect(50,29,2,2,'urn'));
    // Center hall torches
    o.push(rect(33,10,1,1,'torch'), rect(57,10,1,1,'torch'));
    o.push(rect(33,25,1,1,'torch'), rect(57,25,1,1,'torch'));
    o.push(rect(33,40,1,1,'torch'), rect(57,40,1,1,'torch'));
    o.push(rect(33,55,1,1,'torch'), rect(57,55,1,1,'torch'));
    // West wing room dividers (passage at x=13-17)
    o.push(rect(1,24,12,1,'stone'), rect(18,24,14,1,'stone'));
    o.push(rect(1,41,12,1,'stone'), rect(18,41,14,1,'stone'));
    // West wing room 1 (y=9-23)
    o.push(rect(3,13,5,3,'sarcophagus'), rect(20,12,3,3,'urn'), rect(22,18,3,3,'statue'));
    o.push(rect(2,10,1,1,'torch'), rect(30,10,1,1,'torch'));
    // West wing room 2 (y=25-40)
    o.push(rect(3,29,5,3,'sarcophagus'), rect(20,28,3,3,'urn'), rect(22,34,4,3,'altar'));
    o.push(rect(2,26,1,1,'torch'), rect(30,26,1,1,'torch'));
    // West wing room 3 (y=42-56)
    o.push(rect(3,46,5,3,'sarcophagus'), rect(20,45,3,3,'urn'), rect(22,50,3,3,'statue'));
    o.push(rect(2,42,1,1,'torch'), rect(30,42,1,1,'torch'));
    // East wing room dividers (passage at x=73-77)
    o.push(rect(59,24,14,1,'stone'), rect(78,24,11,1,'stone'));
    o.push(rect(59,41,14,1,'stone'), rect(78,41,11,1,'stone'));
    // East wing room 1 (y=9-23)
    o.push(rect(82,13,5,3,'sarcophagus'), rect(67,12,3,3,'urn'), rect(65,18,3,3,'statue'));
    o.push(rect(59,10,1,1,'torch'), rect(87,10,1,1,'torch'));
    // East wing room 2 (y=25-40)
    o.push(rect(82,29,5,3,'sarcophagus'), rect(67,28,3,3,'urn'), rect(64,34,4,3,'altar'));
    o.push(rect(59,26,1,1,'torch'), rect(87,26,1,1,'torch'));
    // East wing room 3 (y=42-56)
    o.push(rect(82,46,5,3,'sarcophagus'), rect(67,45,3,3,'urn'), rect(65,50,3,3,'statue'));
    o.push(rect(59,42,1,1,'torch'), rect(87,42,1,1,'torch'));
    // Inner sanctum: main sarcophagus, obelisks, altars, urns
    o.push(rect(40,60,10,6,'sarcophagus'));
    o.push(rect(33,59,2,8,'obelisk'), rect(55,59,2,8,'obelisk'));
    o.push(rect(5,60,8,4,'altar'), rect(77,60,8,4,'altar'));
    o.push(rect(36,60,2,2,'urn'), rect(52,60,2,2,'urn'));
    o.push(rect(36,65,2,2,'urn'), rect(52,65,2,2,'urn'));
    o.push(rect(2,59,1,1,'torch'), rect(87,59,1,1,'torch'));
    o.push(rect(2,67,1,1,'torch'), rect(87,67,1,1,'torch'));
    o.push(rect(38,59,1,1,'torch'), rect(52,59,1,1,'torch'));
    // Vestibule: obelisks, columns, torches
    o.push(rect(34,2,2,5,'obelisk'), rect(54,2,2,5,'obelisk'));
    o.push(rect(40,3,2,4,'pillar'), rect(48,3,2,4,'pillar'));
    o.push(rect(33,1,1,1,'torch'), rect(56,1,1,1,'torch'));
    o.push(rect(39,2,1,1,'torch'), rect(50,2,1,1,'torch'));
    // Sandpit decorations (non-collidable)
    o.push(rect(5,15,4,4,'sandpit'), rect(22,32,4,4,'sandpit'));
    o.push(rect(64,20,4,4,'sandpit'), rect(81,38,4,4,'sandpit'));
    o.push(rect(36,62,4,3,'sandpit'), rect(50,63,4,3,'sandpit'));
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
    hotel: {
      areaWidth: 2560, areaHeight: 2560, bgColor: '#18121e', label: 'Hotel',
      playerStart: { x:1280, y:520 }, obstacles: buildHotelObs(),
      obsColors: { stone:'#3a3050', counter:'#5a4038', bed:'#6a3a5a', sofa:'#7a3848',
                   elevator:'#5a5870', pillar:'#c8b878', table:'#7a5030', chair:'#5a3a28',
                   shelf:'#3a2810', mirror:'#8080b8', stairs:'#504860', shrub:'#2a4820',
                   pool:'#1848a0', default:'#3a2a40' },
      pathColor: '#22182e',
    },
    egypt: {
      areaWidth: 2880, areaHeight: 2240, bgColor: '#1a1208', label: 'Egyptian Temple',
      playerStart: { x: 1440, y: 480 }, obstacles: buildEgyptObs(),
      obsColors: {
        stone:       '#5a4830',
        pillar:      '#c8a840',
        obelisk:     '#b89030',
        sarcophagus: '#7a6040',
        altar:       '#9a7830',
        urn:         '#b06020',
        statue:      '#a08040',
        sandpit:     '#c8a060',
        default:     '#7a5a2a',
      },
      pathColor: '#2a1c0e',
    },
  };

  // ── Collision ────────────────────────────────────────────────────────────
  const NON_COLLIDABLE = new Set(['torch', 'candle', 'pool', 'sandpit']);
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
  let cssW = 0, cssH = 0;
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
        hotel:     [[43.65, 0.058, 0.044], [61.74, 0.038, 0.069]], // F1+B1  — tritone dread
        egypt:     [[34.65, 0.055, 0.042], [46.25, 0.040, 0.068]], // C1+Bb1 — ancient dread
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
    hotel: {
      bass:   [43.65, 58.27, 87.31],                             // F1 Bb1 F2 — Fm
      bells:  [174.61, 207.65, 261.63, 311.13, 349.23, 415.30], // F3 Ab3 C4 Eb4 F4 Ab4
      chords: [[87.31,103.83,130.81],[130.81,155.56,174.61],[174.61,207.65,261.63]],
      bassInterval: [2.0, 4.0], bellInterval: [4.0, 9.0], chordInterval: [10, 16],
    },
    egypt: {
      bass:   [36.71, 55.00, 73.42],
      bells:  [277.18, 329.63, 415.30, 466.16, 554.37, 622.25],
      chords: [[73.42,92.50,110.00],[110.00,130.81,155.56],[146.83,174.61,207.65]],
      bassInterval: [2.5, 4.5], bellInterval: [5.5, 11.0], chordInterval: [14, 22],
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

  // ── C2: Microphone Tool Audio ─────────────────────────────────────────────
  const MIC = {
    audioCtx: null,
    gainNode: null,
    oscillators: [],
    active: false,
    personality: null,
  };

  function initMicAudio(personality) {
    stopMicAudio();
    try {
      const actx = new (window.AudioContext || window.webkitAudioContext)();
      MIC.audioCtx = actx;

      const gain = actx.createGain();
      gain.gain.value = 0;
      gain.connect(actx.destination);
      MIC.gainNode = gain;
      MIC.oscillators = [];

      const buildOsc = (freq, type, detune) => {
        const o = actx.createOscillator();
        o.type = type || 'sine';
        o.frequency.value = freq;
        if (detune) o.detune.value = detune;
        o.connect(gain);
        o.start();
        MIC.oscillators.push(o);
        return o;
      };
      const buildLFO = (targetParam, rate, depth) => {
        const lfo = actx.createOscillator();
        const lg  = actx.createGain();
        lfo.frequency.value = rate;
        lg.gain.value = depth;
        lfo.connect(lg); lg.connect(targetParam);
        lfo.start();
        MIC.oscillators.push(lfo);
        return lfo;
      };

      switch (personality) {
        case 'shy': {
          const o1 = buildOsc(220, 'sine');
          const o2 = buildOsc(330, 'sine');
          gain.gain.value = 0.04;
          buildLFO(o1.frequency, 0.3, 8);
          buildLFO(o2.frequency, 0.3, 8);
          break;
        }
        case 'dramatic': {
          const o1 = buildOsc(180, 'sine');
          const o2 = buildOsc(360, 'sine');
          gain.gain.value = 0.08;
          buildLFO(o1.frequency, 1.5, 14);
          buildLFO(o2.frequency, 1.5, 14);
          break;
        }
        case 'goofy': {
          const o1 = buildOsc(440, 'square');
          gain.gain.value = 0.05;
          buildLFO(o1.frequency, 4, 30);
          break;
        }
        case 'grumpy': {
          buildOsc(80, 'sawtooth');
          buildOsc(160, 'sawtooth');
          gain.gain.value = 0.07;
          break;
        }
        case 'regal': {
          buildOsc(528, 'sine');
          gain.gain.value = 0.04;
          break;
        }
        case 'confused':
        default: {
          const o1 = buildOsc(300, 'sine');
          gain.gain.value = 0.05;
          buildLFO(o1.detune, 0.1, 100);
          break;
        }
      }

      MIC.active = true;
      MIC.personality = personality;
    } catch(e) {
      MIC.active = false;
    }
  }

  function updateMicVolume(dist) {
    if (!MIC.active || !MIC.gainNode || !MIC.audioCtx) return;
    const volume = Math.max(0, 1 - dist / 500) * 0.15;
    MIC.gainNode.gain.setTargetAtTime(volume, MIC.audioCtx.currentTime, 0.1);
  }

  function stopMicAudio() {
    MIC.oscillators.forEach(o => { try { o.stop(); } catch(_) {} });
    MIC.oscillators = [];
    if (MIC.gainNode) { try { MIC.gainNode.disconnect(); } catch(_) {} MIC.gainNode = null; }
    if (MIC.audioCtx) { MIC.audioCtx.close().catch(() => {}); MIC.audioCtx = null; }
    MIC.active = false;
  }

  // Virtual joystick
  const joy = { active: false, id: null, bx: 0, by: 0, dx: 0, dy: 0, angle: 0, mag: 0 };

  // Walk animation phase (increments with distance moved)
  let walkPhase = 0;
  // Shock animation start timestamp (0 = not active)
  let shockStart = 0;

  function getShockAmt(startMs) {
    if (!startMs) return 0;
    const t = (Date.now() - startMs) / 1600;
    if (t >= 1) return 0;
    return t < 0.12 ? t / 0.12 : 1.0 - (t - 0.12) / 0.88;
  }

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
    if (S && S.titleCard && S.titleCard.inputGated) return;
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
  function onMouseDown(e) { gaInit(S && S.area); if (S && S.titleCard && S.titleCard.inputGated) return; if (e.clientX < canvas.clientWidth * 0.5 && !(S && S.ouija)) { mouseJoy = true; Object.assign(joy, { active:true, bx:e.clientX, by:e.clientY, dx:0, dy:0, angle:0, mag:0 }); } }
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
    if (S && S.titleCard && S.titleCard.inputGated) return;
    const tx = cx, ty = cy;
    const cw = cssW, ch = cssH;

    if (S.ouija) { handleOuijaTap(tx, ty, cw, ch); return; }

    // ── Layout mirrors drawHUD ─────────────────────────────────────────
    const topH = 44;
    const panW = 76, panMargin = 8, panX = cw - panW - panMargin;
    const toolH = 48, toolGap = 5;
    const toolsY = Math.round(ch * 0.44 - 30);
    const sigH = 36, sigY = toolsY - sigH - toolGap;

    // Signal button (right panel, above tools)
    if (tx >= panX && tx <= panX + panW && ty >= sigY && ty <= sigY + sigH) {
      if (!S.signalCooldown || S.signalCooldown <= 0) {
        socket.emit('ghost:signal', { roomId: S.roomId });
        S.signalCooldown = 12000;
        S.attemptsMsg = '📣 Signal sent!';
        clearTimeout(S.attemptsMsgTimer);
        S.attemptsMsgTimer = setTimeout(() => { if (S) S.attemptsMsg = null; }, 1500);
      }
      return;
    }

    // Journal button (top bar, right)
    const jbW = 38, jbH = 32, jbX = cw - jbW - 6, jbY = (topH - jbH) / 2;
    if (tx >= jbX && tx <= jbX + jbW && ty >= jbY && ty <= jbY + jbH) {
      S.journal = !S.journal; return;
    }
    // If journal open, any other tap closes it
    if (S.journal) { S.journal = false; return; }

    // Minimap toggle (top-right, below top bar)
    const mmTglW = 36, mmTglH = 26, mmTglX = cw - mmTglW - 6, mmTglY = topH + 4;
    if (tx >= mmTglX && tx <= mmTglX + mmTglW && ty >= mmTglY && ty <= mmTglY + mmTglH) {
      mmOpen = !mmOpen; return;
    }

    // Tool buttons (vertical stack in right panel)
    const tools = ['flashlight','emf','sound','microphone'];
    tools.forEach((t, i) => {
      const bx = panX, by = toolsY + i * (toolH + toolGap);
      if (tx >= bx && tx <= bx + panW && ty >= by && ty <= by + toolH) {
        if (S.activeTool !== t) {
          gaSfxTool();
          S.activeTool = t;
          // C2: init mic audio when microphone tool activated and a ghost personality is known
          if (t === 'microphone') {
            const foundPersonality = MIC.personality || (() => {
              for (const gh of Object.values(S.ghosts)) {
                if (gh.found && gh.personality) return gh.personality;
              }
              return null;
            })();
            if (foundPersonality) initMicAudio(foundPersonality);
          } else {
            stopMicAudio();
          }
        }
      }
    });

    // Place board button (above signal, right-aligned)
    if (S.nearGhost && !S.nearGhost.claimedBy) {
      const pbW = 130, pbH = 40;
      const pbX = cw - pbW - panMargin, pbY = sigY - pbH - toolGap;
      if (tx >= pbX && tx <= pbX + pbW && ty >= pbY && ty <= pbY + pbH) {
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
    if (S.titleCard && !S.titleCard.done) {
      S.titleCard.inputGated = (Date.now() - S.titleCard.start) < 2500;
      if (!S.titleCard.inputGated) S.titleCard.done = true;
      return; // gate all input
    }
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
      const prevPhase = walkPhase;
      walkPhase += spd * dt * 0.12;
      // Emit a footstep dust particle at each half-step crossing
      if (Math.floor(prevPhase * 2) !== Math.floor(walkPhase * 2)) {
        if (!S.footsteps) S.footsteps = [];
        S.footsteps.push({ x: S.me.x, y: S.me.y + 10, age: 0 });
        if (S.footsteps.length > 40) S.footsteps.shift();
      }
    }

    // Age footstep particles
    if (S.footsteps) {
      for (let fi = S.footsteps.length - 1; fi >= 0; fi--) {
        S.footsteps[fi].age += dt;
        if (S.footsteps[fi].age > 0.55) S.footsteps.splice(fi, 1);
      }
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
      socket.emit('ghost:move', { roomId: S.roomId, x: S.me.x, y: S.me.y, facing: S.me.facing, avatar: S.me.avatar, tool: S.activeTool });
    }

    // Drive signal-reactive audio (EMF buzz / sound rumble)
    gaSignals(S.signals, S.activeTool);

    // C2: Update microphone tool volume based on distance to nearest found ghost
    if (S.activeTool === 'microphone' && MIC.active) {
      let minDist = 500;
      for (const gh of Object.values(S.ghosts)) {
        if (gh.found && !gh.identified) {
          const d = Math.hypot(gh.x - S.me.x, gh.y - S.me.y);
          if (d < minDist) minDist = d;
        }
      }
      updateMicVolume(minDist);
    }

    // Tick signal cooldown
    if (S.signalCooldown > 0) S.signalCooldown = Math.max(0, S.signalCooldown - dt * 1000);

    // Update alligators (hotel only)
    if (S.area === 'hotel') updateAlligators(dt);
    if (S.area === 'egypt') updateEgyptNPCs(dt);

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

  // ── Avatar pixel-art sprites ──────────────────────────────────────────────

  // Helper: draw filled rect in art-unit coords (ctx already at char center)
  function ar(ctx, x, y, w, h) {
    ctx.fillRect(
      Math.round(x * PIXEL), Math.round(y * PIXEL),
      Math.round(w * PIXEL), Math.round(h * PIXEL)
    );
  }

  function facingToDir(angle) {
    const a = ((angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    if (a < Math.PI * 0.25 || a >= Math.PI * 1.75) return 'right';
    if (a < Math.PI * 0.75) return 'down';
    if (a < Math.PI * 1.25) return 'left';
    return 'up';
  }

  // ── Character-specific details ────────────────────────────────────────────
  function drawBodyDetailsFront(ctx, idx, pal) {
    switch (idx) {
      case 0: // Pirate — white collar + gold buttons
        ctx.fillStyle = '#e8e4d0';
        ar(ctx, -1.5, -5, 1, 2); ar(ctx, 0.5, -5, 1, 2);
        ctx.fillStyle = pal.trim;
        ar(ctx, -0.5, -4, 1, 1); ar(ctx, -0.5, -2, 1, 1); ar(ctx, -0.5, 0, 1, 1);
        break;
      case 1: // Explorer — breast pockets + compass
        ctx.fillStyle = pal.coatSh;
        ar(ctx, -3.5, -3, 2.5, 2.5); ar(ctx, 1, -3, 2.5, 2.5);
        ctx.fillStyle = '#181810';
        ar(ctx, -3.5, -3, 2.5, 0.5); ar(ctx, 1, -3, 2.5, 0.5);
        ctx.fillStyle = '#d0b830'; ar(ctx, -1, -1, 2, 2);
        ctx.fillStyle = '#4898c8'; ar(ctx, -0.5, -0.5, 1, 1);
        break;
      case 2: // Police — chest badge + buttons
        ctx.fillStyle = pal.trim2; ar(ctx, -2, -4.5, 4, 4);
        ctx.fillStyle = '#fff060'; ar(ctx, -1.5, -4, 3, 3);
        ctx.fillStyle = '#c0b820';
        ar(ctx, -0.5, -3.5, 1, 2); ar(ctx, -1.5, -3, 3, 0.5);
        ctx.fillStyle = '#a0a0a0';
        ar(ctx, -0.5, 2.5, 1, 1); ar(ctx, -0.5, 0.5, 1, 1);
        break;
      case 3: // Doctor — buttons + stethoscope
        ctx.fillStyle = '#8090a0';
        ar(ctx, -0.5, -4, 1, 1); ar(ctx, -0.5, -2, 1, 1); ar(ctx, -0.5, 0, 1, 1);
        ctx.fillStyle = pal.trim;
        ar(ctx, -2.5, -3.5, 1.5, 0.5); ar(ctx, -2.5, -3.5, 0.5, 2);
        ar(ctx, 1, -3.5, 1.5, 0.5); ar(ctx, 2, -3.5, 0.5, 2);
        ar(ctx, -2.5, -1.5, 5, 0.5);
        ctx.fillStyle = pal.coatSh; ar(ctx, -3.5, 0, 2.5, 2.5);
        ctx.fillStyle = pal.trim2; ar(ctx, -3, 0.5, 1.5, 0.5);
        break;
    }
  }

  function drawFaceDetailsFront(ctx, idx, pal, shock) {
    if (idx === 0) { // Pirate eyepatch
      ctx.fillStyle = '#181020';
      ar(ctx, -4.5, -12, 4, 3);
      ctx.fillStyle = '#0a0a14';
      ar(ctx, -3.5, -13, 0.5, 1.5);
    }
    if (idx === 3 && shock < 0.3) { // Doctor glasses
      ctx.strokeStyle = '#4080a0'; ctx.lineWidth = 1;
      ctx.strokeRect(-4.5 * PIXEL, -11.5 * PIXEL, 3 * PIXEL, 2.5 * PIXEL);
      ctx.strokeRect(1 * PIXEL, -11.5 * PIXEL, 3 * PIXEL, 2.5 * PIXEL);
      ctx.beginPath();
      ctx.moveTo(-1.5 * PIXEL, -10 * PIXEL); ctx.lineTo(1 * PIXEL, -10 * PIXEL);
      ctx.stroke();
    }
  }

  function drawBodyDetailsSide(ctx, idx, pal) {
    if (idx === 0) {
      ctx.fillStyle = pal.trim;
      ar(ctx, -1.5, -4, 1, 1); ar(ctx, -1.5, -2, 1, 1); ar(ctx, -1.5, 0, 1, 1);
    }
    if (idx === 2) {
      ctx.fillStyle = pal.trim2; ar(ctx, -2, -4.5, 3.5, 4);
      ctx.fillStyle = '#fff060'; ar(ctx, -1.5, -4, 2.5, 3);
    }
    if (idx === 3) {
      ctx.fillStyle = pal.trim;
      ar(ctx, -2, -3.5, 0.5, 3); ar(ctx, -2, -0.5, 3, 0.5);
    }
  }

  function drawFaceDetailsSide(ctx, idx, pal, shock) {
    if (idx === 0) {
      ctx.fillStyle = '#181020'; ar(ctx, -4, -12, 3.5, 3);
    }
    if (idx === 3 && shock < 0.3) {
      ctx.fillStyle = '#4080a0'; ar(ctx, -4, -12, 2.5, 2.5);
    }
  }

  // ── Hat drawing (3 directions) ────────────────────────────────────────────
  function drawHatFront(ctx, idx, pal) {
    ctx.save(); ctx.translate(0, -12);
    switch (idx) {
      case 0: // Pirate — Tricorn
        ctx.fillStyle = pal.hat;
        ar(ctx, -5, -7, 10, 6);
        ctx.fillStyle = pal.hatHi;
        ar(ctx, -5, -7, 10, 1.5); ar(ctx, -5, -7, 1.5, 6);
        ctx.fillStyle = pal.hat;
        ar(ctx, -8, -5, 16, 1.5);
        ar(ctx, -9.5, -5, 3, 3); ar(ctx, 6.5, -5, 3, 3); ar(ctx, -1.5, -7.5, 3, 2);
        ctx.fillStyle = pal.trim; ar(ctx, -5, -3, 10, 1);
        ctx.fillStyle = '#e0d8c0'; ar(ctx, -1, -6.5, 2, 2.5);
        ctx.fillStyle = pal.hat;
        ar(ctx, -0.8, -6, 0.8, 0.8); ar(ctx, 0.3, -6, 0.8, 0.8);
        break;
      case 1: // Explorer — Pith helmet
        ctx.fillStyle = pal.hat;
        ar(ctx, -6, -9, 12, 8);
        ctx.fillStyle = pal.hatHi;
        ar(ctx, -5, -9, 10, 2); ar(ctx, -6, -7, 2, 6);
        ctx.fillStyle = pal.hat;
        ar(ctx, -8, -2, 16, 2.5);
        ctx.fillStyle = pal.hatHi; ar(ctx, -8, -2, 16, 0.8);
        ctx.fillStyle = pal.coatSh;
        ar(ctx, -1, -9, 1.5, 7.5);
        ar(ctx, -4.5, -6, 1, 1.5); ar(ctx, 3.5, -6, 1, 1.5);
        ctx.fillStyle = pal.hat; ar(ctx, -5, 0, 10, 1.5);
        break;
      case 2: // Police — Peaked cap
        ctx.fillStyle = pal.hat;
        ar(ctx, -5, -9, 10, 8);
        ctx.fillStyle = pal.hatHi;
        ar(ctx, -5, -9, 10, 2); ar(ctx, -5, -7, 2, 6);
        ctx.fillStyle = '#000820'; ar(ctx, -5, -2, 10, 2);
        ctx.fillStyle = pal.trim;
        ar(ctx, -5, -2, 10, 0.5); ar(ctx, -5, -0.5, 10, 0.5);
        ctx.fillStyle = '#000820';
        ar(ctx, -7, -0.5, 14, 2); ar(ctx, -8, 1, 16, 1.5);
        ctx.fillStyle = pal.trim; ar(ctx, -8, 2.5, 16, 0.6);
        ctx.fillStyle = pal.trim2; ar(ctx, -3, -8, 6, 6);
        ctx.fillStyle = '#d0b820'; ar(ctx, -2, -7, 4, 4);
        ctx.fillStyle = '#fff888';
        ar(ctx, -0.5, -7, 1, 4); ar(ctx, -2, -5.5, 4, 0.8);
        break;
      case 3: // Doctor — Surgical cap
        ctx.fillStyle = pal.hat;
        ar(ctx, -5, -8, 10, 7);
        ctx.fillStyle = pal.hatHi;
        ar(ctx, -5, -8, 10, 2); ar(ctx, -5, -6, 2, 5);
        ctx.fillStyle = pal.coatSh;
        ar(ctx, -5, -2, 10, 1);
        ar(ctx, 4.5, -4, 2.5, 3); ar(ctx, -7, -4, 2.5, 3);
        ctx.fillStyle = pal.trim2;
        ar(ctx, -0.5, -7, 1, 5); ar(ctx, -2, -5.5, 4, 1.5);
        break;
    }
    ctx.restore();
  }

  function drawHatBack(ctx, idx, pal) {
    ctx.save(); ctx.translate(0, -12);
    switch (idx) {
      case 0:
        ctx.fillStyle = pal.hat;
        ar(ctx, -5, -7, 10, 6);
        ar(ctx, -9.5, -5, 3, 3); ar(ctx, 6.5, -5, 3, 3);
        ctx.fillStyle = pal.trim; ar(ctx, -5, -3, 10, 1);
        break;
      case 1:
        ctx.fillStyle = pal.hat;
        ar(ctx, -6, -9, 12, 8); ar(ctx, -8, -2, 16, 2.5);
        ctx.fillStyle = pal.coatSh; ar(ctx, -1, -9, 1.5, 7.5);
        break;
      case 2:
        ctx.fillStyle = pal.hat; ar(ctx, -5, -9, 10, 8);
        ctx.fillStyle = '#000820'; ar(ctx, -5, -2, 10, 2);
        ctx.fillStyle = pal.trim; ar(ctx, -5, -2, 10, 0.5);
        ctx.fillStyle = '#606060'; ar(ctx, -1, -1, 2, 3);
        break;
      case 3:
        ctx.fillStyle = pal.hat; ar(ctx, -5, -8, 10, 7);
        ctx.fillStyle = pal.coatSh; ar(ctx, -5, -2, 10, 1);
        ar(ctx, -2, 0, 1.5, 4); ar(ctx, 0.5, 0, 1.5, 4);
        break;
    }
    ctx.restore();
  }

  function drawHatSide(ctx, idx, pal) {
    ctx.save(); ctx.translate(0, -12);
    switch (idx) {
      case 0:
        ctx.fillStyle = pal.hat;
        ar(ctx, -4, -7, 8, 6);
        ar(ctx, -7, -5, 3, 2.5); ar(ctx, 3.5, -5, 3, 2.5);
        ctx.fillStyle = pal.trim; ar(ctx, -4, -3, 8, 1);
        break;
      case 1:
        ctx.fillStyle = pal.hat; ar(ctx, -4, -9, 9, 8);
        ctx.fillStyle = pal.hatHi;
        ar(ctx, -4, -9, 9, 2); ar(ctx, -4, -7, 2, 6);
        ctx.fillStyle = pal.hat; ar(ctx, -7, -2, 13, 2.5);
        ctx.fillStyle = pal.coatSh; ar(ctx, -1, -9, 1.5, 7.5);
        break;
      case 2:
        ctx.fillStyle = pal.hat; ar(ctx, -4, -9, 8, 8);
        ctx.fillStyle = pal.hatHi;
        ar(ctx, -4, -9, 8, 2); ar(ctx, -4, -7, 2, 6);
        ctx.fillStyle = '#000820';
        ar(ctx, -4, -2, 8, 2); ar(ctx, -5, -0.5, 8, 2.5);
        ctx.fillStyle = pal.trim; ar(ctx, -5, 2, 8, 0.6);
        break;
      case 3:
        ctx.fillStyle = pal.hat; ar(ctx, -4, -8, 8, 7);
        ctx.fillStyle = pal.coatSh; ar(ctx, -4, -2, 8, 1);
        ar(ctx, 3.5, -4, 2.5, 3);
        break;
    }
    ctx.restore();
  }

  // ── Per-direction sprite renderers ────────────────────────────────────────
  function drawCharFront(ctx, idx, pal, wPhase, shock, breathe) {
    const wCyc     = Math.sin(wPhase * Math.PI * 2);
    const lLeg     = wCyc * 1.8 * (1 - shock);
    const rLeg     = -lLeg;
    const lArm     = -lLeg * 0.7;
    const rArm     = lLeg * 0.7;
    const bodyY    = breathe * 0.4 - shock * 3;
    const armRaise = shock * 5;
    const armH     = 4 + armRaise * 0.4;
    const armTop   = -3 - armRaise;

    ctx.save(); ctx.translate(0, bodyY);

    // Legs
    ctx.fillStyle = pal.pant;
    ar(ctx, -4, 4 + lLeg, 3, 4); ar(ctx, 1, 4 + rLeg, 3, 4);
    ctx.fillStyle = pal.pantSh;
    ar(ctx, -4, 4 + lLeg, 1, 4); ar(ctx, 3, 4 + rLeg, 1, 4);
    // Boots
    ctx.fillStyle = pal.boot;
    ar(ctx, -5, 7.5 + lLeg, 4.5, 2.5); ar(ctx, 0.5, 7.5 + rLeg, 4.5, 2.5);
    // Arms
    ctx.fillStyle = pal.coat;
    ar(ctx, -7, armTop + lArm, 3, armH); ar(ctx, 4, armTop + rArm, 3, armH);
    ctx.fillStyle = pal.coatSh;
    ar(ctx, -7, armTop + lArm, 1, armH); ar(ctx, 6, armTop + rArm, 1, armH);
    ctx.fillStyle = pal.skin;
    ar(ctx, -7, armTop + lArm + armH, 3, 2); ar(ctx, 4, armTop + rArm + armH, 3, 2);
    // Body
    ctx.fillStyle = pal.coat; ar(ctx, -4, -5, 8, 9);
    ctx.fillStyle = pal.coatSh; ar(ctx, -4, -5, 1.5, 9); ar(ctx, 2.5, -5, 1.5, 9);
    ctx.fillStyle = pal.coatHi; ar(ctx, -2.5, -5, 1.5, 9);
    // Belt
    ctx.fillStyle = '#181810'; ar(ctx, -4, 3.5, 8, 1.5);
    ctx.fillStyle = pal.trim; ar(ctx, -1, 3.5, 2, 1.5);
    drawBodyDetailsFront(ctx, idx, pal);
    // Neck
    ctx.fillStyle = pal.skin; ar(ctx, -1.5, -5, 3, 2);
    // Head
    ctx.fillStyle = pal.skin; ar(ctx, -4.5, -12, 9, 7);
    ctx.fillStyle = pal.skinSh;
    ar(ctx, -4.5, -12, 1, 7); ar(ctx, 3.5, -12, 1, 7); ar(ctx, -4.5, -6, 9, 1);
    // Eyes
    const eY = shock > 0.3 ? -11.5 : -11;
    const eW = shock > 0.3 ? 2.5 : 2;
    const eH = shock > 0.3 ? 2.5 : 2;
    if (shock > 0.3) {
      ctx.fillStyle = 'white';
      ar(ctx, -4.5, eY - 0.5, 3.5, eH + 1); ar(ctx, 0.5, eY - 0.5, 3.5, eH + 1);
    }
    ctx.fillStyle = '#1a1028';
    ar(ctx, -4, eY, eW, eH); ar(ctx, 1, eY, eW, eH);
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ar(ctx, -3.5, eY, 0.8, 0.8); ar(ctx, 1.5, eY, 0.8, 0.8);
    // Mouth
    if (shock > 0.4) {
      ctx.fillStyle = '#1a0810'; ar(ctx, -2.5, -8, 5, 3);
      ctx.fillStyle = '#b02840'; ar(ctx, -2, -7.5, 4, 2);
    } else {
      ctx.fillStyle = pal.skinSh; ar(ctx, -2.5, -7, 5, 1);
    }
    drawFaceDetailsFront(ctx, idx, pal, shock);
    drawHatFront(ctx, idx, pal);
    ctx.restore();
  }

  function drawCharBack(ctx, idx, pal, wPhase, shock, breathe) {
    const wCyc     = Math.sin(wPhase * Math.PI * 2);
    const lLeg     = wCyc * 1.8 * (1 - shock);
    const rLeg     = -lLeg;
    const lArm     = -lLeg * 0.7;
    const rArm     = lLeg * 0.7;
    const bodyY    = breathe * 0.4 - shock * 3;
    const armRaise = shock * 5;
    const armH     = 4 + armRaise * 0.4;
    const armTop   = -3 - armRaise;

    ctx.save(); ctx.translate(0, bodyY);

    // Legs
    ctx.fillStyle = pal.pant;
    ar(ctx, -4, 4 + lLeg, 3, 4); ar(ctx, 1, 4 + rLeg, 3, 4);
    ctx.fillStyle = pal.pantSh;
    ar(ctx, -4, 4 + lLeg, 1, 4); ar(ctx, 3, 4 + rLeg, 1, 4);
    ctx.fillStyle = pal.boot;
    ar(ctx, -5, 7.5 + lLeg, 4.5, 2.5); ar(ctx, 0.5, 7.5 + rLeg, 4.5, 2.5);
    // Arms
    ctx.fillStyle = pal.coat;
    ar(ctx, -7, armTop + lArm, 3, armH); ar(ctx, 4, armTop + rArm, 3, armH);
    ctx.fillStyle = pal.coatSh;
    ar(ctx, -7, armTop + lArm, 1, armH); ar(ctx, 6, armTop + rArm, 1, armH);
    ctx.fillStyle = pal.skin;
    ar(ctx, -7, armTop + lArm + armH, 3, 2); ar(ctx, 4, armTop + rArm + armH, 3, 2);
    // Body
    ctx.fillStyle = pal.coat; ar(ctx, -4, -5, 8, 9);
    ctx.fillStyle = pal.coatSh; ar(ctx, -4, -5, 1.5, 9); ar(ctx, 2.5, -5, 1.5, 9);
    ctx.fillStyle = pal.coatHi; ar(ctx, -2.5, -5, 1.5, 9);
    // Belt
    ctx.fillStyle = '#181810'; ar(ctx, -4, 3.5, 8, 1.5);
    ctx.fillStyle = pal.trim; ar(ctx, -1, 3.5, 2, 1.5);
    // Explorer backpack visible from behind
    if (idx === 1) {
      ctx.fillStyle = '#5a4830'; ar(ctx, -2.5, -4, 5, 6.5);
      ctx.fillStyle = '#3a2810'; ar(ctx, -1.5, -1, 3, 3.5);
      ctx.fillStyle = '#282010'; ar(ctx, -1, -3, 2, 0.5);
    }
    // Neck
    ctx.fillStyle = pal.skin; ar(ctx, -1.5, -5, 3, 2);
    // Head (back)
    ctx.fillStyle = pal.skin; ar(ctx, -4.5, -12, 9, 7);
    ctx.fillStyle = pal.skinSh;
    ar(ctx, -4.5, -12, 1, 7); ar(ctx, 3.5, -12, 1, 7); ar(ctx, -4.5, -6, 9, 1);
    // Hair (back of head shows hat color as hair)
    ctx.fillStyle = pal.hat; ar(ctx, -3.5, -12, 7, 2.5);
    drawHatBack(ctx, idx, pal);
    ctx.restore();
  }

  function drawCharSide(ctx, idx, pal, wPhase, shock, breathe) {
    // Draws facing right; caller does ctx.scale(-1,1) for left
    const wCyc     = Math.sin(wPhase * Math.PI * 2);
    const fLeg     = wCyc * 2.5 * (1 - shock);
    const bLeg     = -fLeg;
    const fArm     = -fLeg * 0.7;
    const bArm     = fLeg * 0.7;
    const bodyY    = breathe * 0.4 - shock * 3;
    const armRaise = shock * 5;
    const fArmH    = 4 + armRaise * 0.4;
    const fArmTop  = -3 - armRaise;

    ctx.save(); ctx.translate(0, bodyY);

    // Back leg
    ctx.fillStyle = pal.pantSh; ar(ctx, 0, 4 + bLeg, 3, 4);
    ctx.fillStyle = pal.boot; ar(ctx, -0.5, 7.5 + bLeg, 3.5, 2.5);
    // Back arm
    ctx.fillStyle = pal.coatSh;
    ar(ctx, 0.5, fArmTop + bArm, 2.5, fArmH);
    ctx.fillStyle = pal.skinSh;
    ar(ctx, 0.5, fArmTop + bArm + fArmH, 2.5, 2);
    // Body (side profile)
    ctx.fillStyle = pal.coat; ar(ctx, -2, -5, 7, 9);
    ctx.fillStyle = pal.coatSh; ar(ctx, 4, -5, 1, 9);
    ctx.fillStyle = pal.coatHi; ar(ctx, -2, -5, 1.5, 9);
    // Belt
    ctx.fillStyle = '#181810'; ar(ctx, -2, 3.5, 7, 1.5);
    ctx.fillStyle = pal.trim; ar(ctx, 0, 3.5, 2, 1.5);
    drawBodyDetailsSide(ctx, idx, pal);
    // Front leg
    ctx.fillStyle = pal.pant; ar(ctx, -1, 4 + fLeg, 3, 4);
    ctx.fillStyle = pal.pantSh; ar(ctx, -1, 4 + fLeg, 1, 4);
    ctx.fillStyle = pal.boot;
    ar(ctx, -2, 7.5 + fLeg, 4.5, 2.5);
    ar(ctx, -3.5, 8.5 + fLeg, 1, 1.5); // toe
    // Front arm
    ctx.fillStyle = pal.coat; ar(ctx, -4.5, fArmTop + fArm, 3, fArmH);
    ctx.fillStyle = pal.coatSh; ar(ctx, -4.5, fArmTop + fArm, 1, fArmH);
    ctx.fillStyle = pal.skin; ar(ctx, -4.5, fArmTop + fArm + fArmH, 3, 2);
    // Neck
    ctx.fillStyle = pal.skin; ar(ctx, -1, -5, 3, 2);
    // Head (side profile)
    ctx.fillStyle = pal.skin; ar(ctx, -3, -12, 7, 7);
    ctx.fillStyle = pal.skinSh;
    ar(ctx, 3, -12, 1, 7);
    ar(ctx, -3, -6, 7, 1);
    // Nose
    ar(ctx, -4, -10.5, 1.5, 1);
    // Eye
    const eY = shock > 0.3 ? -11.5 : -11;
    if (shock > 0.3) {
      ctx.fillStyle = 'white'; ar(ctx, -3.5, eY - 0.5, 3.5, 3.5);
    }
    ctx.fillStyle = '#1a1028';
    ar(ctx, -3, eY, shock > 0.3 ? 2.5 : 2, shock > 0.3 ? 2.5 : 2);
    ctx.fillStyle = 'rgba(255,255,255,0.75)'; ar(ctx, -3, eY, 0.8, 0.8);
    // Mouth
    if (shock > 0.4) {
      ctx.fillStyle = '#1a0810'; ar(ctx, -3.5, -8.5, 2.5, 2.5);
    } else {
      ctx.fillStyle = pal.skinSh; ar(ctx, -3.5, -8, 2.5, 0.8);
    }
    drawFaceDetailsSide(ctx, idx, pal, shock);
    drawHatSide(ctx, idx, pal);
    ctx.restore();
  }

  // ── Shock VFX (floating ! and stars) ─────────────────────────────────────
  function drawShockEffects(ctx, shock, nowMs) {
    if (shock < 0.05) return;
    const t = nowMs / 200;
    ctx.globalAlpha = shock;
    ctx.fillStyle = '#ff3010';
    ar(ctx, -0.5, -21.5, 1, 4.5);
    ar(ctx, -0.5, -16, 1, 1.5);
    const sw = Math.sin(t) * 1.5;
    ctx.fillStyle = '#ffee10';
    ar(ctx, -10 + sw, -18 + sw, 2, 2);
    ar(ctx, 8 - sw,  -20 + sw, 2, 2);
    ar(ctx, -9 - sw, -22, 1.5, 1.5);
    ar(ctx,  7 + sw, -16, 1.5, 1.5);
    ctx.globalAlpha = 1;
  }

  // ── Main drawAvatar ───────────────────────────────────────────────────────
  function drawAvatar(ctx, cx, cy, dir, wPhase, bob, avatarIdx, isMe, shockAnim) {
    const idx   = avatarIdx % CHAR_PAL.length;
    const pal   = CHAR_PAL[idx];
    const shock = shockAnim || 0;
    const nowMs = Date.now();

    ctx.save();
    ctx.translate(Math.round(cx), Math.round(cy));

    // Ground shadow (fixed, does not bob)
    ctx.globalAlpha = 0.28;
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.ellipse(0, 11, 11 + shock * 2, 3.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    // Shock visual effects
    drawShockEffects(ctx, shock, nowMs);

    // Self indicator ring
    if (isMe) {
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(0, 0, 16, 0, Math.PI * 2); ctx.stroke();
    }

    if (dir === 'down') {
      drawCharFront(ctx, idx, pal, wPhase, shock, bob);
    } else if (dir === 'up') {
      drawCharBack(ctx, idx, pal, wPhase, shock, bob);
    } else if (dir === 'right') {
      drawCharSide(ctx, idx, pal, wPhase, shock, bob);
    } else { // left — mirror the right sprite
      ctx.scale(-1, 1);
      drawCharSide(ctx, idx, pal, wPhase, shock, bob);
    }

    ctx.restore();
  }

  // ── Title Card ───────────────────────────────────────────────────────────
  function drawTitleCard(cw, ch) {
    const tc = S.titleCard;
    const t = Date.now() - tc.start;
    const inAlpha = Math.min(1, t / 400);
    const outAlpha = t > 2000 ? Math.max(0, 1 - (t - 2000) / 500) : 1;
    const alpha = inAlpha * outAlpha;
    if (alpha <= 0) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = 'rgba(0,0,0,0.92)';
    ctx.fillRect(0, 0, cw, ch);
    const shake = t < 1800 ? Math.sin(t / 60) * (1 - t / 1800) * 4 : 0;
    ctx.translate(shake, 0);
    const areaLabel = (AREA_DEFS[S.area] || {}).label || 'Unknown Location';
    ctx.textAlign = 'center';
    ctx.font = `bold ${Math.min(48, cw / 7)}px Georgia,serif`;
    ctx.fillStyle = '#d4a840';
    ctx.fillText(areaLabel, cw / 2, ch / 2 - 30);
    ctx.font = `italic ${Math.min(20, cw / 18)}px Georgia,serif`;
    ctx.fillStyle = 'rgba(180,160,220,0.9)';
    ctx.fillText(`${S.totalGhosts} spirit${S.totalGhosts !== 1 ? 's' : ''} detected\u2026`, cw / 2, ch / 2 + 12);
    ctx.font = `${Math.min(13, cw / 28)}px monospace`;
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.fillText('Ready your equipment\u2026', cw / 2, ch / 2 + 44);
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  // ── Light Flicker Override ────────────────────────────────────────────────
  let flickerOverride = null; // { start, duration }

  // ── Dramatic Pose Flash ───────────────────────────────────────────────────
  let dramaticPoseFlash = null; // { start, color }

  // ── Ghost Awareness States ────────────────────────────────────────────────
  let ghostAwarenessStates = {}; // ghostId -> 'dormant'|'aware'|'restless'

  // ── Case Timer ────────────────────────────────────────────────────────────
  let caseTimerMs = null; // remaining ms, null = no timer

  // ── Ouija Candle Particles ───────────────────────────────────────────────
  let ouijaCandleParticles = [];

  // ── Celebration Particles ────────────────────────────────────────────────
  let celebrationParticles = [];

  function drawCelebration(cw, ch) {
    if (!celebrationParticles.length) return;
    const now = Date.now();
    ctx.save();
    for (let i = celebrationParticles.length - 1; i >= 0; i--) {
      const p = celebrationParticles[i];
      const age = (now - p.born) / 2000;
      if (age >= 1) { celebrationParticles.splice(i, 1); continue; }
      const alpha = (1 - age) * 0.85;
      p.x += p.vx * 0.016;
      p.y += p.vy * 0.016;
      p.vy += 30 * 0.016; // gravity
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r * (1 - age * 0.5), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  // ── Farewell Sequence ────────────────────────────────────────────────────
  let farewellGhost = null; // { ghostId, x, y, color, start }

  function drawFarewell(cw, ch) {
    const fw = farewellGhost;
    const age = Date.now() - fw.start;
    if (age > 3000) { farewellGhost = null; return; }
    const t = age / 3000;
    const sx = fw.x - S.cam.x;
    const sy = (fw.y - S.cam.y) - t * 80; // drifts up
    const alpha = 1 - t;
    ctx.save();
    ctx.globalAlpha = alpha * 0.9;
    ctx.fillStyle = fw.color || '#ffffff';
    ctx.font = `${32 + t * 8}px serif`;
    ctx.textAlign = 'center';
    ctx.fillText('\uD83D\uDC7B', sx, sy);
    ctx.restore();
    // "SPIRIT DEPARTED" text
    if (age > 500 && age < 2500) {
      const msgAlpha = Math.min(1, (age - 500) / 400) * Math.min(1, (2500 - age) / 400);
      ctx.save();
      ctx.globalAlpha = msgAlpha;
      ctx.fillStyle = '#c9a050';
      ctx.font = 'bold 18px Georgia,serif';
      ctx.textAlign = 'center';
      ctx.fillText('SPIRIT DEPARTED', cw / 2, ch / 2);
      ctx.restore();
    }
    // Darkness overlay fades out
    // (handled by S.cam follow; just lighten the canvas)
    ctx.save();
    ctx.globalAlpha = t * 0.15;
    ctx.fillStyle = 'rgba(180,140,255,0.6)';
    ctx.fillRect(0, 0, cw, ch);
    ctx.restore();
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
    // #1 Screen-space vignette — darkens edges for tension/depth
    const vg = ctx.createRadialGradient(cw/2, ch/2, Math.min(cw,ch)*0.28, cw/2, ch/2, Math.max(cw,ch)*0.82);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.30)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, cw, ch);

    // A8: Icy blue frost edge overlay for Doctor avatar when temperature is high
    if (S.me.avatar === 3 && S.lastTemperature > 0.3) {
      const frostAlpha = (S.lastTemperature - 0.3) / 0.7 * 0.4;
      // Four corner frost gradients
      const corners = [
        [0, 0], [cw, 0], [0, ch], [cw, ch],
      ];
      ctx.save();
      for (const [fx, fy] of corners) {
        const frostR = Math.min(cw, ch) * 0.55;
        const fg = ctx.createRadialGradient(fx, fy, 0, fx, fy, frostR);
        fg.addColorStop(0, `rgba(150,210,255,${(frostAlpha).toFixed(3)})`);
        fg.addColorStop(0.5, `rgba(150,210,255,${(frostAlpha * 0.4).toFixed(3)})`);
        fg.addColorStop(1, 'rgba(150,210,255,0)');
        ctx.fillStyle = fg;
        ctx.fillRect(0, 0, cw, ch);
      }
      ctx.restore();
    }

    // A8: Cold breath expanding ellipse for Doctor avatar
    if (S.me.avatar === 3 && S.breathTimer > 0) {
      const breathAge = (Date.now() - S.breathTimer) / 600;
      if (breathAge < 1) {
        const bAlpha = (1 - breathAge) * 0.55;
        const bRx = 8 + breathAge * 28;
        const bRy = 5 + breathAge * 14;
        // Position slightly above avatar center in screen space
        const bsx = Math.round(S.me.x - S.cam.x);
        const bsy = Math.round(S.me.y - S.cam.y) - 20;
        ctx.save();
        ctx.globalAlpha = bAlpha;
        ctx.fillStyle = 'rgba(220,240,255,0.85)';
        ctx.beginPath();
        ctx.ellipse(bsx, bsy, bRx, bRy, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }

    // Chromatic aberration — red/blue screen-blend gradients when cold signal is strong
    if (S.coldSignal > 0.08) {
      const caInt = Math.min(1, (S.coldSignal - 0.08) / 0.72);
      const caShift = caInt * 8;
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      // Red channel shifted left
      const rg = ctx.createLinearGradient(0, 0, cw, 0);
      rg.addColorStop(0, `rgba(80,0,0,${(caInt * 0.12).toFixed(3)})`);
      rg.addColorStop(0.5, 'rgba(0,0,0,0)');
      rg.addColorStop(1, `rgba(80,0,0,${(caInt * 0.06).toFixed(3)})`);
      ctx.fillStyle = rg;
      ctx.fillRect(-caShift, 0, cw, ch);
      // Blue channel shifted right
      const bg2 = ctx.createLinearGradient(0, 0, cw, 0);
      bg2.addColorStop(0, `rgba(0,0,80,${(caInt * 0.06).toFixed(3)})`);
      bg2.addColorStop(0.5, 'rgba(0,0,0,0)');
      bg2.addColorStop(1, `rgba(0,0,80,${(caInt * 0.12).toFixed(3)})`);
      ctx.fillStyle = bg2;
      ctx.fillRect(caShift, 0, cw, ch);
      ctx.restore();
    }

    // Film grain — 500 random 1.5px dots, alternating light/dark
    ctx.save();
    for (let g = 0; g < 500; g++) {
      const gx = Math.random() * cw;
      const gy = Math.random() * ch;
      ctx.fillStyle = (g & 1) ? 'rgba(255,255,255,0.025)' : 'rgba(0,0,0,0.022)';
      ctx.fillRect(gx, gy, 1.5, 1.5);
    }
    ctx.restore();

    drawHUD(cw, ch);
    drawPOIPanel(cw, ch);
    drawPlayerSignals(cw, ch);
    drawJoystick(cw, ch);
    // Dramatic pose flash
    if (dramaticPoseFlash) {
      const dp = dramaticPoseFlash;
      const dAge = (Date.now() - dp.start) / 600;
      if (dAge < 1) {
        const dAlpha = dAge < 0.3 ? dAge / 0.3 * 0.35 : (1 - dAge) * 0.35;
        ctx.save();
        ctx.globalAlpha = dAlpha;
        ctx.fillStyle = dp.color;
        ctx.fillRect(0, 0, cw, ch);
        ctx.globalAlpha = 1 - dAge;
        ctx.font = `${Math.min(80, cw / 4)}px serif`;
        ctx.textAlign = 'center';
        ctx.fillText('\uD83D\uDC7B', cw / 2, ch / 2 + 20);
        ctx.restore();
      } else {
        dramaticPoseFlash = null;
      }
    }
    if (S.reveal) drawReveal(cw, ch);
    drawCelebration(cw, ch);
    if (farewellGhost) drawFarewell(cw, ch);
    if (S.titleCard && !S.titleCard.done) drawTitleCard(cw, ch);
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

    drawGroundTexture(S.area, area, now);

    // Footstep dust trails (drawn before obstacles so they appear on ground)
    if (S.footsteps && S.footsteps.length > 0) {
      for (const fs of S.footsteps) {
        const t = fs.age / 0.55;
        const fsAlpha = (1 - t) * 0.22;
        const fsRX = 5 + t * 6;
        const fsRY = 2.5 + t * 3;
        ctx.save();
        ctx.globalAlpha = fsAlpha;
        ctx.fillStyle = 'rgba(200,180,140,1)';
        ctx.beginPath();
        ctx.ellipse(fs.x, fs.y, fsRX, fsRY, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }

    // --- Ambient occlusion halos ---
    const _aoSkip = new Set(['torch','candle','sandpit','pool','flower','cross','fence','lamp','pillar']);
    for (const ob of area.obstacles) {
      if (_aoSkip.has(ob.type)) continue;
      const aoCx = ob.x + ob.w / 2;
      const aoCy = ob.y + ob.h;
      const aoRx = ob.w * 0.7;
      const aoRy = Math.min(ob.h * 0.3, 18);
      ctx.save();
      ctx.translate(aoCx, aoCy);
      ctx.scale(1, aoRy / aoRx);
      const aoGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, aoRx);
      aoGrad.addColorStop(0, 'rgba(0,0,0,0.18)');
      aoGrad.addColorStop(0.5, 'rgba(0,0,0,0.07)');
      aoGrad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = aoGrad;
      ctx.beginPath();
      ctx.arc(0, 0, aoRx, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // #2 Contact shadows — soft radial gradient shadow ellipse below each obstacle
    for (const ob of area.obstacles) {
      if (ob.w < 32 || ob.h < 32) continue;
      const _t = ob.type;
      if (_t==='chair'||_t==='candle'||_t==='torch'||_t==='lamp'||_t==='cross'||_t==='fence'||_t==='pillar'||_t==='flower'||_t==='pool'||_t==='sandpit') continue;
      const cx = ob.x + ob.w / 2;
      const cy = ob.y + ob.h + 4;
      const rx = ob.w * 0.65;
      const ry = Math.min(ob.h * 0.25, 14);
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(1, ry / rx);
      const shadowGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
      shadowGrad.addColorStop(0, 'rgba(0,0,0,0.22)');
      shadowGrad.addColorStop(0.6, 'rgba(0,0,0,0.08)');
      shadowGrad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = shadowGrad;
      ctx.beginPath();
      ctx.arc(0, 0, rx, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Find nearest found ghost for trembling effect
    let _nearGhostX = null, _nearGhostY = null, _nearGhostDist = Infinity;
    for (const gh of Object.values(S.ghosts)) {
      if (!gh.found || gh.identified) continue;
      if (!_nearGhostX || Math.hypot(gh.x - S.me.x, gh.y - S.me.y) < _nearGhostDist) {
        _nearGhostX = gh.x; _nearGhostY = gh.y;
        _nearGhostDist = Math.hypot(gh.x - S.me.x, gh.y - S.me.y);
      }
    }
    for (const ob of area.obstacles) {
      if (_nearGhostX !== null) {
        const obCx = ob.x + ob.w / 2, obCy = ob.y + ob.h / 2;
        const d = Math.hypot(obCx - _nearGhostX, obCy - _nearGhostY);
        if (d < 200) {
          const proximity = 1 - d / 200;
          const jitter = Math.sin(now / 80 + ob.x * 0.1) * 1.2 * proximity;
          ctx.save();
          ctx.translate(jitter, 0);
          drawObstacle(ob, area, now);
          ctx.restore();
          continue;
        }
      }
      drawObstacle(ob, area, now);
    }
    drawPOIs();
    drawPickups();
    drawAmbientParticles(S.area, area, now);
  }

  function drawGroundTexture(areaName, area, now) {
    const aw = area.areaWidth, ah = area.areaHeight;

    if (areaName === 'graveyard') {
      // Scattered dirt patches (deterministic via sine hash — no flicker)
      ctx.fillStyle = 'rgba(0,0,0,0.13)';
      for (let i = 0; i < 28; i++) {
        const px = 96 + (Math.sin(i * 7.31) * 0.5 + 0.5) * (aw - 192);
        const py = 96 + (Math.sin(i * 5.17) * 0.5 + 0.5) * (ah - 192);
        const rx = 14 + (Math.sin(i * 4.09) * 0.5 + 0.5) * 22;
        const ry =  6 + (Math.sin(i * 3.71) * 0.5 + 0.5) * 9;
        ctx.save();
        ctx.translate(px, py);
        ctx.rotate(Math.sin(i * 2.33) * Math.PI);
        ctx.beginPath(); ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }
      // Worn path lines between tombstone clusters
      ctx.save();
      ctx.strokeStyle = 'rgba(140,120,70,0.09)';
      ctx.lineWidth = 24;
      ctx.lineCap = 'round';
      const pathPts = [
        [1280,640, 896,576], [1280,640, 1760,384],
        [1280,640,  832,1280], [1280,640, 1792,1408], [1280,640, 1280,1472],
      ];
      for (const [x1,y1,x2,y2] of pathPts) {
        ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke();
      }
      ctx.restore();
    }

    else if (areaName === 'garden') {
      // Grass tufts (deterministic)
      ctx.save();
      ctx.strokeStyle = 'rgba(55,115,28,0.32)';
      ctx.lineWidth = 1.5;
      ctx.lineCap = 'round';
      for (let i = 0; i < 80; i++) {
        const gx = 96 + (Math.sin(i * 7.13) * 0.5 + 0.5) * (aw - 192);
        const gy = 96 + (Math.sin(i * 4.97) * 0.5 + 0.5) * (ah - 192);
        const len = 5 + (Math.sin(i * 3.41) * 0.5 + 0.5) * 6;
        const a1 = Math.sin(i * 2.17) * 0.5;
        ctx.beginPath(); ctx.moveTo(gx, gy); ctx.lineTo(gx + Math.sin(a1)*len,       gy - Math.cos(a1)*len);       ctx.stroke();
        ctx.beginPath(); ctx.moveTo(gx, gy); ctx.lineTo(gx + Math.sin(a1+0.4)*len*0.7, gy - Math.cos(a1+0.4)*len*0.7); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(gx, gy); ctx.lineTo(gx + Math.sin(a1-0.4)*len*0.7, gy - Math.cos(a1-0.4)*len*0.7); ctx.stroke();
      }
      ctx.restore();
      // Worn stone paths toward fountain and between landmarks
      ctx.save();
      ctx.strokeStyle = 'rgba(180,160,100,0.10)';
      ctx.lineWidth = 30;
      ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(1120,1120); ctx.lineTo(1600,1120); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(1600,1120); ctx.lineTo(1600,320);  ctx.stroke();
      ctx.beginPath(); ctx.moveTo(1600,1120); ctx.lineTo(1600,1920); ctx.stroke();
      ctx.restore();
    }

    else if (areaName === 'house') {
      // Floorboard stripes — alternating tint every 2 tiles
      for (let fy = 64; fy < ah - 64; fy += 64) {
        ctx.fillStyle = (Math.floor(fy / 64) % 2 === 0)
          ? 'rgba(255,190,90,0.022)' : 'rgba(0,0,0,0.032)';
        ctx.fillRect(64, fy, aw - 128, 64);
      }
      // Window glow patches in main rooms
      const wglows = [
        {cx:160, cy:160}, {cx:960, cy:160}, {cx:1440,cy:160},
        {cx:160, cy:700}, {cx:960, cy:700},
      ];
      for (const wg of wglows) {
        const gr = ctx.createRadialGradient(wg.cx, wg.cy, 0, wg.cx, wg.cy, 120);
        gr.addColorStop(0, 'rgba(255,200,80,0.055)');
        gr.addColorStop(1, 'rgba(255,200,80,0)');
        ctx.fillStyle = gr;
        ctx.fillRect(wg.cx - 120, wg.cy - 120, 240, 240);
      }
    }

    else if (areaName === 'hotel') {
      // Zone-differentiated floor overlays
      // Grand lobby entrance (y=32-448 = tiles 1-14)
      ctx.fillStyle = 'rgba(200,160,80,0.06)';
      ctx.fillRect(64, 32, aw - 128, 448 - 32);
      // Wing A rooms corridor tint (x=32-608, y=480-1888)
      ctx.fillStyle = 'rgba(100,20,40,0.08)';
      ctx.fillRect(32, 480, 608 - 32, 1888 - 480);
      // Wing B rooms corridor tint (x=1920-2528, y=480-1888)
      ctx.fillStyle = 'rgba(100,20,40,0.08)';
      ctx.fillRect(1920, 480, 2528 - 1920, 1888 - 480);
      // Ballroom marble tint (x=640-1888, y=480-1184)
      ctx.fillStyle = 'rgba(220,210,190,0.035)';
      ctx.fillRect(640, 480, 1888 - 640, 1184 - 480);
      // Pool room aqua tint (x=640-1888, y=1216-1888)
      ctx.fillStyle = 'rgba(20,80,120,0.07)';
      ctx.fillRect(640, 1216, 1888 - 640, 1888 - 1216);
      // Bar area warm amber (x=640-1248, y=1920-2528)
      ctx.fillStyle = 'rgba(120,60,10,0.07)';
      ctx.fillRect(640, 1920, 1248 - 640, 2528 - 1920);
      // Dining area warm tint (x=1280-1888, y=1920-2528)
      ctx.fillStyle = 'rgba(80,40,20,0.05)';
      ctx.fillRect(1280, 1920, 1888 - 1280, 2528 - 1920);

      // Carpet tile grid — subtle cross-hatch (whole hotel)
      ctx.strokeStyle = 'rgba(255,255,255,0.03)';
      ctx.lineWidth = 1;
      for (let gx = 96; gx < aw - 64; gx += 96) {
        ctx.beginPath(); ctx.moveTo(gx, 64); ctx.lineTo(gx, ah - 64); ctx.stroke();
      }
      for (let gy = 96; gy < ah - 64; gy += 96) {
        ctx.beginPath(); ctx.moveTo(64, gy); ctx.lineTo(aw - 64, gy); ctx.stroke();
      }

      // Ballroom checkerboard dance floor (tiles 24-56 x 15-37 → px 768-1792 x 480-1184)
      const bfX = 768, bfY = 480, bfW = 1024, bfH = 704, tSz = 64;
      for (let tx = 0; tx < bfW; tx += tSz) {
        for (let ty = 0; ty < bfH; ty += tSz) {
          ctx.fillStyle = ((Math.floor(tx/tSz) + Math.floor(ty/tSz)) % 2 === 0)
            ? 'rgba(255,255,255,0.045)' : 'rgba(0,0,0,0.06)';
          ctx.fillRect(bfX + tx, bfY + ty, tSz, tSz);
        }
      }

      // Lobby entrance medallion (concentric rings + 8-point star at center px 1280,224)
      const mx = 1280, my = 224;
      ctx.strokeStyle = 'rgba(200,160,80,0.14)';
      ctx.lineWidth = 2;
      for (let r = 30; r <= 110; r += 20) {
        ctx.beginPath(); ctx.arc(mx, my, r, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.fillStyle = 'rgba(200,160,80,0.07)';
      for (let pt = 0; pt < 8; pt++) {
        const a1 = (pt / 8) * Math.PI * 2;
        const a2 = ((pt + 0.5) / 8) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(mx, my);
        ctx.lineTo(mx + Math.cos(a1) * 110, my + Math.sin(a1) * 110);
        ctx.lineTo(mx + Math.cos(a2) * 60,  my + Math.sin(a2) * 60);
        ctx.closePath(); ctx.fill();
      }

      // Wing corridor carpet runners (thin herringbone-ish diagonal lines)
      ctx.save();
      ctx.strokeStyle = 'rgba(180,60,80,0.07)';
      ctx.lineWidth = 1;
      // Wing A corridor (x=32-608)
      for (let d = -200; d < 2560; d += 28) {
        ctx.beginPath(); ctx.moveTo(32, 480 + d); ctx.lineTo(608, 480 + d - 576); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(32, 480 + d); ctx.lineTo(608, 480 + d + 576); ctx.stroke();
      }
      // Wing B corridor (x=1920-2528)
      for (let d = -200; d < 2560; d += 28) {
        ctx.beginPath(); ctx.moveTo(1920, 480 + d); ctx.lineTo(2528, 480 + d - 576); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(1920, 480 + d); ctx.lineTo(2528, 480 + d + 576); ctx.stroke();
      }
      ctx.restore();
    }

    else if (areaName === 'egypt') {
      // Sandy floor — scattered sand ripple patches
      for (let i = 0; i < 22; i++) {
        const px = 128 + (Math.sin(i * 6.31) * 0.5 + 0.5) * (aw - 256);
        const py = 128 + (Math.sin(i * 4.73) * 0.5 + 0.5) * (ah - 256);
        const rx = 20 + (Math.sin(i * 3.17) * 0.5 + 0.5) * 36;
        const ry = 8  + (Math.sin(i * 5.29) * 0.5 + 0.5) * 16;
        ctx.fillStyle = `rgba(200,155,50,${0.055 + (Math.sin(i*2.1)*0.5+0.5)*0.045})`;
        ctx.save(); ctx.translate(px, py); ctx.rotate(Math.sin(i*1.7) * 0.8);
        ctx.beginPath(); ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI*2); ctx.fill();
        ctx.restore();
      }
      // Fine sand grain dots
      ctx.fillStyle = 'rgba(215,175,80,0.08)';
      for (let i = 0; i < 60; i++) {
        const px = 64 + (Math.sin(i * 7.43) * 0.5 + 0.5) * (aw - 128);
        const py = 64 + (Math.sin(i * 5.81) * 0.5 + 0.5) * (ah - 128);
        ctx.beginPath(); ctx.arc(px, py, 2.5, 0, Math.PI*2); ctx.fill();
      }
    }
  }

  function drawAmbientParticles(areaName, area, now) {
    const aw = area.areaWidth, ah = area.areaHeight;

    if (areaName === 'graveyard') {
      // #7 Large slow-drifting fog banks
      for (let b = 0; b < 3; b++) {
        const fbx = aw * (0.18 + b * 0.32) + Math.sin(now * 0.00012 + b * 2.3) * (aw * 0.12);
        const fby = ah * (0.22 + b * 0.28) + Math.cos(now * 0.000089 + b * 1.7) * (ah * 0.09);
        const falpha = 0.028 + 0.012 * Math.sin(now * 0.00075 + b * 1.1);
        ctx.fillStyle = `rgba(155,200,160,${falpha.toFixed(3)})`;
        ctx.save();
        ctx.translate(fbx, fby);
        ctx.beginPath(); ctx.ellipse(0, 0, 260, 100, 0, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }
      // Drifting fog wisps
      for (let i = 0; i < 8; i++) {
        const bx = 128 + (Math.sin(i * 5.31) * 0.5 + 0.5) * (aw - 256);
        const by = 128 + (Math.sin(i * 3.77) * 0.5 + 0.5) * (ah - 256);
        const dx = Math.sin(now * 0.00028 + i * 1.37) * 90;
        const dy = Math.cos(now * 0.00021 + i * 0.94) * 45;
        const alpha = 0.055 + 0.03 * Math.sin(now * 0.0015 + i * 2.1);
        const rx = 55 + 20 * Math.sin(i * 2.7);
        const ry = 18 + 8 * Math.cos(i * 3.1);
        ctx.fillStyle = `rgba(170,215,175,${alpha.toFixed(3)})`;
        ctx.save();
        ctx.translate(bx + dx, by + dy);
        ctx.rotate(Math.sin(i) * 0.9);
        ctx.beginPath(); ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }
    }

    else if (areaName === 'garden') {
      // Fountain — drawn on top of stone obstacle so water is visible
      const fx = 1600, fy = 1120; // center of fountain (tile 50,35)
      const fRipple = (now * 0.0012) % 1;
      ctx.fillStyle = '#183898';
      ctx.beginPath(); ctx.arc(fx, fy, 108, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#1e50b8';
      ctx.beginPath(); ctx.arc(fx, fy, 90, 0, Math.PI * 2); ctx.fill();
      for (let r = 0; r < 3; r++) {
        const rp = (fRipple + r / 3) % 1;
        ctx.strokeStyle = `rgba(150,205,255,${(0.5*(1-rp)).toFixed(3)})`;
        ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.arc(fx, fy, 12 + rp * 72, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.fillStyle = 'rgba(200,235,255,0.5)';
      ctx.beginPath(); ctx.arc(fx, fy, 10, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#8a7a50'; ctx.lineWidth = 7;
      ctx.beginPath(); ctx.arc(fx, fy, 108, 0, Math.PI * 2); ctx.stroke();
      // Fireflies
      for (let i = 0; i < 10; i++) {
        const bx = 128 + (Math.sin(i * 6.13) * 0.5 + 0.5) * (aw - 256);
        const by = 128 + (Math.sin(i * 4.51) * 0.5 + 0.5) * (ah - 256);
        const px = bx + Math.sin(now * 0.00082 + i * 2.3) * 60;
        const py = by + Math.cos(now * 0.00065 + i * 1.7) * 40;
        const twinkle = 0.5 + 0.5 * Math.sin(now * 0.006 + i * 1.9);
        ctx.fillStyle = `rgba(200,255,110,${(twinkle * 0.8).toFixed(3)})`;
        ctx.beginPath(); ctx.arc(px, py, 2.5, 0, Math.PI * 2); ctx.fill();
        if (twinkle > 0.68) {
          const fg = ctx.createRadialGradient(px, py, 0, px, py, 11);
          fg.addColorStop(0, `rgba(200,255,110,${(twinkle * 0.32).toFixed(3)})`);
          fg.addColorStop(1, 'rgba(200,255,110,0)');
          ctx.fillStyle = fg;
          ctx.beginPath(); ctx.arc(px, py, 11, 0, Math.PI * 2); ctx.fill();
        }
      }
    }

    else if (areaName === 'house') {
      // Floating dust motes drifting upward
      for (let i = 0; i < 14; i++) {
        const bx = 80 + (Math.sin(i * 6.21) * 0.5 + 0.5) * (aw - 160);
        const yOff = (now * 0.015 + i * (ah / 14)) % ah;
        const py = ah - 80 - yOff;
        const alpha = 0.07 + 0.055 * Math.sin(now * 0.002 + i * 1.5);
        const wobX = Math.sin(now * 0.0018 + i * 2.7) * 22;
        ctx.fillStyle = `rgba(220,200,155,${alpha.toFixed(3)})`;
        ctx.beginPath(); ctx.arc(bx + wobX, py, 1.8, 0, Math.PI * 2); ctx.fill();
      }
    }

    else if (areaName === 'hotel') {
      // Chandelier glow pools (3 positions in ballroom: tiles 39,16 / 39,24 / 39,32)
      const chandelierPositions = [
        { x: 39 * 32 + 16, y: 16 * 32 + 16 },
        { x: 39 * 32 + 16, y: 24 * 32 + 16 },
        { x: 39 * 32 + 16, y: 32 * 32 + 16 },
      ];
      for (const ch of chandelierPositions) {
        const flicker = 0.88 + 0.12 * Math.sin(now * 0.0032 + ch.y * 0.001);
        const cg = ctx.createRadialGradient(ch.x, ch.y, 0, ch.x, ch.y, 160 * flicker);
        cg.addColorStop(0, `rgba(255,220,100,${(0.09 * flicker).toFixed(3)})`);
        cg.addColorStop(0.5, `rgba(255,180,60,${(0.04 * flicker).toFixed(3)})`);
        cg.addColorStop(1, 'rgba(255,160,40,0)');
        ctx.fillStyle = cg;
        ctx.beginPath(); ctx.arc(ch.x, ch.y, 160 * flicker, 0, Math.PI * 2); ctx.fill();
        // Light shaft — narrow column of soft light descending
        const sg = ctx.createLinearGradient(ch.x, ch.y - 60, ch.x, ch.y + 200);
        sg.addColorStop(0, 'rgba(255,220,140,0)');
        sg.addColorStop(0.25, `rgba(255,220,140,${(0.025 * flicker).toFixed(3)})`);
        sg.addColorStop(1, 'rgba(255,220,140,0)');
        ctx.fillStyle = sg;
        ctx.fillRect(ch.x - 18, ch.y - 60, 36, 260);
      }

      // Wall sconce glow patches along wing corridors (midpoint of each room section)
      // Wing A sconces (x≈480px, every ~192px from y=576 to y=1792)
      // Wing B sconces (x≈2112px)
      const sconceYPositions = [576 + 96, 576 + 96*3, 576 + 96*5, 576 + 96*7, 576 + 96*9, 576 + 96*11];
      for (let si = 0; si < sconceYPositions.length; si++) {
        const sy2 = sconceYPositions[si];
        const sflicker = 0.82 + 0.18 * Math.sin(now * 0.0025 + si * 1.7);
        for (const sx2 of [96, aw - 96]) {
          const sg2 = ctx.createRadialGradient(sx2, sy2, 0, sx2, sy2, 70 * sflicker);
          sg2.addColorStop(0, `rgba(255,180,80,${(0.07 * sflicker).toFixed(3)})`);
          sg2.addColorStop(1, 'rgba(255,180,80,0)');
          ctx.fillStyle = sg2;
          ctx.beginPath(); ctx.arc(sx2, sy2, 70 * sflicker, 0, Math.PI * 2); ctx.fill();
        }
      }

      // Bar candle ambient glow (tiles 36,67 and 36,73 → px 1152+16,2144+16 and 1152+16,2336+16)
      const barCandlePositions = [
        { x: 36 * 32 + 16, y: 67 * 32 + 16 },
        { x: 36 * 32 + 16, y: 73 * 32 + 16 },
      ];
      for (const bc of barCandlePositions) {
        const bf = 0.78 + 0.22 * Math.sin(now * 0.0045 + bc.y * 0.002);
        const bg2 = ctx.createRadialGradient(bc.x, bc.y, 0, bc.x, bc.y, 52 * bf);
        bg2.addColorStop(0, `rgba(255,160,50,${(0.09 * bf).toFixed(3)})`);
        bg2.addColorStop(1, 'rgba(255,140,30,0)');
        ctx.fillStyle = bg2;
        ctx.beginPath(); ctx.arc(bc.x, bc.y, 52 * bf, 0, Math.PI * 2); ctx.fill();
      }

      // Pool steam wisps (rising vapor above pool tiles 27-53 × 40-56 → px 864-1696 × 1280-1792)
      for (let i = 0; i < 10; i++) {
        const bx = 864 + (Math.sin(i * 6.71) * 0.5 + 0.5) * (1696 - 864);
        const baseY = 1792;
        const yOff = (now * 0.022 + i * (512 / 10)) % 512;
        const py2 = baseY - yOff;
        const alpha = 0.06 * (1 - yOff / 512) * (0.6 + 0.4 * Math.sin(now * 0.003 + i * 1.4));
        const wobX = Math.sin(now * 0.0014 + i * 2.1) * 14;
        ctx.fillStyle = `rgba(180,220,240,${alpha.toFixed(3)})`;
        ctx.save();
        ctx.translate(bx + wobX, py2);
        ctx.beginPath(); ctx.ellipse(0, 0, 5 + yOff * 0.018, 7, 0, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }

      // General hotel corridor dust (subtle, more of them than before)
      for (let i = 0; i < 14; i++) {
        const bx = 80 + (Math.sin(i * 5.91) * 0.5 + 0.5) * (aw - 160);
        const yOff = (now * 0.007 + i * (ah / 14)) % ah;
        const py2 = ah - 80 - yOff;
        const alpha = 0.03 + 0.02 * Math.sin(now * 0.0014 + i * 1.9);
        ctx.fillStyle = `rgba(200,175,220,${alpha.toFixed(3)})`;
        ctx.beginPath(); ctx.arc(bx, py2, 1.5, 0, Math.PI * 2); ctx.fill();
      }
    }

    else if (areaName === 'egypt') {
      // Drifting sand motes rising upward
      for (let i = 0; i < 18; i++) {
        const bx2 = 80 + (Math.sin(i * 6.11) * 0.5 + 0.5) * (aw - 160);
        const yOff2 = (now * 0.012 + i * (ah / 18)) % ah;
        const py2 = ah - 80 - yOff2;
        const alpha2 = 0.06 + 0.04 * Math.sin(now * 0.0015 + i * 2.1);
        const wobX2 = Math.sin(now * 0.0012 + i * 3.1) * 30;
        ctx.fillStyle = `rgba(220,175,70,${alpha2.toFixed(3)})`;
        ctx.beginPath(); ctx.arc(bx2 + wobX2, py2, 2.2, 0, Math.PI * 2); ctx.fill();
      }
      // Slow golden shimmer particles near altar
      const altarX = 40 * T + T * 5, altarY = 28 * T + T * 2.5;
      for (let i = 0; i < 8; i++) {
        const ax = altarX + Math.sin(now * 0.0008 + i * 0.78) * 90;
        const ay = altarY + Math.cos(now * 0.0011 + i * 1.1) * 40 - (now * 0.008 + i * (ah/8)) % 200;
        const aa = 0.05 + 0.04 * Math.sin(now * 0.002 + i * 1.5);
        ctx.fillStyle = `rgba(255,215,80,${aa.toFixed(3)})`;
        ctx.beginPath(); ctx.arc(ax, ay, 1.8, 0, Math.PI * 2); ctx.fill();
      }
      // Torch smoke wisps from wall torches (subtle dark upward tendrils)
      const torchPosArr = [
        { x:33*T, y:10*T }, { x:57*T, y:10*T }, { x:33*T, y:25*T }, { x:57*T, y:25*T },
        { x:33*T, y:40*T }, { x:57*T, y:40*T }, { x:38*T, y:59*T }, { x:52*T, y:59*T },
      ];
      for (let i = 0; i < torchPosArr.length; i++) {
        const tp = torchPosArr[i];
        for (let s = 0; s < 3; s++) {
          const age = (now * 0.0005 + i * 0.7 + s * 0.33) % 1;
          const sy2 = tp.y - age * 40;
          const sx2 = tp.x + Math.sin(now * 0.003 + i * 2.1 + s) * 6;
          const sa = (0.07 - age * 0.07);
          if (sa <= 0) continue;
          ctx.fillStyle = `rgba(60,40,20,${sa.toFixed(3)})`;
          ctx.beginPath(); ctx.arc(sx2, sy2, 2.5 + age * 3, 0, Math.PI * 2); ctx.fill();
        }
      }
    }
  }

  function drawPOIs() {
    if (!S.pois) return;
    const now = Date.now();
    for (let poiIndex = 0; poiIndex < S.pois.length; poiIndex++) {
      const poi = S.pois[poiIndex];
      const sx = poi.x;   // already in world space (inside ctx.translate)
      const sy = poi.y;
      const pulse = 0.6 + 0.4 * Math.sin(now * 0.0025 + poi.id * 1.3);
      const alpha = poi.read ? 0.35 : pulse;

      // Expanding ping ring
      if (!poi.read) {
        const pingPhase = ((now * 0.0008) + poiIndex * 0.37) % 1.0;
        const pingR = 18 + pingPhase * 28;
        const pingAlpha = (1.0 - pingPhase) * 0.55;
        ctx.save();
        ctx.strokeStyle = `rgba(200,160,255,${pingAlpha.toFixed(3)})`;
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(sx, sy, pingR, 0, Math.PI * 2); ctx.stroke();
        ctx.restore();
      }

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

  function drawSarcophagus(x, y, w, h, col) {
    // Base coffin body
    ctx.fillStyle = col;
    ctx.fillRect(x, y, w, h);
    // Lid panel (slightly raised - lighter stripe)
    ctx.fillStyle = 'rgba(255,255,200,0.10)';
    ctx.fillRect(x + Math.round(w*0.12), y + Math.round(h*0.08), Math.round(w*0.76), Math.round(h*0.84));
    // Carved cross-band lines
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.fillRect(x, Math.round(y + h*0.32), w, 2);
    ctx.fillRect(x, Math.round(y + h*0.62), w, 2);
    // Hieroglyph dots (decorative)
    ctx.fillStyle = 'rgba(220,180,60,0.45)';
    const dc = Math.round(w * 0.22), dr = 2;
    ctx.beginPath(); ctx.arc(x + dc, y + Math.round(h*0.18), dr, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(x + w - dc, y + Math.round(h*0.18), dr, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(x + Math.round(w*0.5), y + Math.round(h*0.47), dr+1, 0, Math.PI*2); ctx.fill();
    // Top/left edge highlight
    ctx.fillStyle = 'rgba(255,255,255,0.09)';
    ctx.fillRect(x, y, w, 2);
    ctx.fillRect(x, y, 2, h);
    // Inner depth lines
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x+1, y+h-1); ctx.lineTo(x+1, y+1); ctx.lineTo(x+w-1, y+1); ctx.stroke();
    ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x+w-1, y+1); ctx.lineTo(x+w-1, y+h-1); ctx.lineTo(x+1, y+h-1); ctx.stroke();
    ctx.restore();
  }

  function drawObelisk(x, y, w, h, col) {
    ctx.fillStyle = col;
    // Taper: wide at base, narrow at top
    const cx2 = x + w/2;
    ctx.beginPath();
    ctx.moveTo(x,      y + h);          // bottom-left
    ctx.lineTo(x + w,  y + h);          // bottom-right
    ctx.lineTo(cx2 + w*0.15, y + h*0.12); // upper-right
    ctx.lineTo(cx2 - w*0.15, y + h*0.12); // upper-left
    ctx.closePath(); ctx.fill();
    // Pyramidion tip (gold)
    ctx.fillStyle = '#e8c040';
    ctx.beginPath();
    ctx.moveTo(cx2, y);
    ctx.lineTo(cx2 + w*0.15, y + h*0.12);
    ctx.lineTo(cx2 - w*0.15, y + h*0.12);
    ctx.closePath(); ctx.fill();
    // Carved band lines
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.fillRect(x, Math.round(y + h*0.3), w, 2);
    ctx.fillRect(x, Math.round(y + h*0.55), w, 2);
    ctx.fillRect(x, Math.round(y + h*0.75), w, 2);
    // Highlight
    ctx.fillStyle = 'rgba(255,255,200,0.12)';
    ctx.fillRect(x, y, 3, h);
  }

  function drawAltar(x, y, w, h, col) {
    ctx.fillStyle = col;
    ctx.fillRect(x, y, w, h);
    // Stone block top edge
    ctx.fillStyle = 'rgba(255,255,200,0.16)';
    ctx.fillRect(x, y, w, 3);
    ctx.fillRect(x, y, 3, h);
    // Shadow bottom
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.fillRect(x, y + h - 3, w, 3);
    // Carved center symbol
    ctx.fillStyle = 'rgba(220,180,50,0.35)';
    const ccx = x + w/2, ccy = y + h/2;
    ctx.beginPath(); ctx.arc(ccx, ccy, Math.min(w,h)*0.18, 0, Math.PI*2); ctx.fill();
    // Inner depth lines
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x+1, y+h-1); ctx.lineTo(x+1, y+1); ctx.lineTo(x+w-1, y+1); ctx.stroke();
    ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x+w-1, y+1); ctx.lineTo(x+w-1, y+h-1); ctx.lineTo(x+1, y+h-1); ctx.stroke();
    ctx.restore();
  }

  function drawUrn(x, y, w, h, col) {
    const cx2 = x + w/2, cy2 = y + h/2;
    // Body (oval)
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.ellipse(cx2, cy2 + h*0.05, w*0.44, h*0.42, 0, 0, Math.PI*2); ctx.fill();
    // Neck
    ctx.fillRect(cx2 - w*0.16, y, w*0.32, h*0.28);
    // Lip at top
    ctx.fillStyle = 'rgba(255,255,200,0.20)';
    ctx.fillRect(cx2 - w*0.22, y - 2, w*0.44, 4);
    // Highlight
    ctx.fillStyle = 'rgba(255,255,255,0.14)';
    ctx.beginPath(); ctx.ellipse(cx2 - w*0.14, cy2 - h*0.08, w*0.1, h*0.16, -0.5, 0, Math.PI*2); ctx.fill();
    // Band decoration
    ctx.strokeStyle = 'rgba(220,150,30,0.55)';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.ellipse(cx2, cy2 + h*0.12, w*0.38, 4, 0, 0, Math.PI*2); ctx.stroke();
  }

  function drawSandpit(x, y, w, h) {
    ctx.fillStyle = 'rgba(200,160,70,0.22)';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = 'rgba(220,180,80,0.12)';
    ctx.lineWidth = 1;
    // Wave texture lines
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo(x, y + h * (0.25 + i * 0.25));
      ctx.bezierCurveTo(x + w*0.33, y + h*(0.2 + i*0.25), x + w*0.66, y + h*(0.3 + i*0.25), x+w, y + h*(0.25 + i*0.25));
      ctx.stroke();
    }
  }

  function drawObstacle(ob, area, now) {
    const { x, y, w, h, type } = ob;
    const colors = area.obsColors || {};
    const col = colors[type] || colors.default || '#5a5a5a';
    switch (type) {
      case 'stone':    drawStone(x, y, w, h, col); break;
      case 'hedge':    drawHedge(x, y, w, h, col); break;
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
      case 'mirror':   drawMirror(x, y, w, h, col, now); break;
      case 'stairs':   drawStairs(x, y, w, h, col); break;
      case 'bed':      drawBed(x, y, w, h, col); break;
      case 'counter':  drawCounter(x, y, w, h, col); break;
      case 'sofa':     drawSofa(x, y, w, h, col); break;
      case 'pool':     drawPool(x, y, w, h, col, now); break;
      case 'elevator': drawElevator(x, y, w, h, col, now); break;
      case 'sarcophagus': drawSarcophagus(x, y, w, h, col); break;
      case 'obelisk':     drawObelisk(x, y, w, h, col); break;
      case 'altar':       drawAltar(x, y, w, h, col); break;
      case 'urn':         drawUrn(x, y, w, h, col); break;
      case 'sandpit':     drawSandpit(x, y, w, h); break;
      default:
        ctx.fillStyle = col;
        ctx.fillRect(x, y, w, h);
        ctx.fillStyle = 'rgba(255,255,255,0.1)';
        ctx.fillRect(x, y, w, 2);
        // Wood/bed/other wooden types: horizontal grain lines
        if (type === 'wood' || type === 'bed') {
          ctx.strokeStyle = 'rgba(80,45,15,0.06)';
          ctx.lineWidth = 1;
          const dgSpacing = Math.max(4, Math.round(h / 5));
          for (let gi = 1; gi <= 4; gi++) {
            const gy = y + gi * dgSpacing;
            if (gy < y + h - 1) {
              ctx.beginPath(); ctx.moveTo(x + 1, gy); ctx.lineTo(x + w - 1, gy); ctx.stroke();
            }
          }
        }
        // Inner depth lines for wood and similar solid types
        if (type === 'wood') {
          ctx.save();
          ctx.strokeStyle = 'rgba(255,255,255,0.12)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(x + 1, y + h - 1);
          ctx.lineTo(x + 1, y + 1);
          ctx.lineTo(x + w - 1, y + 1);
          ctx.stroke();
          ctx.strokeStyle = 'rgba(0,0,0,0.25)';
          ctx.beginPath();
          ctx.moveTo(x + 1, y + h - 1);
          ctx.lineTo(x + w - 1, y + h - 1);
          ctx.lineTo(x + w - 1, y + 1);
          ctx.stroke();
          ctx.restore();
        }
    }
  }

  function drawStone(x, y, w, h, col) {
    if (w <= 0 || h <= 0) return;
    ctx.fillStyle = col;
    ctx.fillRect(x, y, w, h);
    // Border walls (aspect ratio > 4:1) get brick texture
    if (w >= h * 4 || h >= w * 4) {
      const bw = Math.min(44, Math.max(20, Math.round(Math.max(w, h) / 16)));
      const bh = Math.min(20, Math.max(8, Math.round(Math.min(w, h) * 0.55)));
      ctx.fillStyle = 'rgba(255,255,255,0.055)';
      for (let bx2 = x; bx2 < x + w; bx2 += bw * 2) {
        for (let by2 = y; by2 < y + h; by2 += bh) {
          const off = (Math.floor((by2 - y) / bh) % 2) * bw;
          ctx.fillRect(bx2 + off + 1, by2 + 1, bw - 2, bh - 2);
        }
      }
      ctx.fillStyle = 'rgba(0,0,0,0.15)';
      ctx.fillRect(x, y + h, w, 3);
    } else {
      ctx.fillStyle = 'rgba(255,255,255,0.10)';
      ctx.fillRect(x, y, w, 2);
      // Deterministic dot scatter interior texture
      ctx.fillStyle = 'rgba(0,0,0,0.07)';
      const nDots = Math.max(2, Math.round(w * h / 400));
      for (let di = 0; di < nDots; di++) {
        const dx = x + 3 + (Math.sin(di * 7.31 + x * 0.01) * 0.5 + 0.5) * (w - 6);
        const dy2 = y + 3 + (Math.sin(di * 5.17 + y * 0.01) * 0.5 + 0.5) * (h - 6);
        ctx.fillRect(Math.round(dx), Math.round(dy2), 2, 2);
      }
    }
    // Inner depth lines
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x+1, y+h-1); ctx.lineTo(x+1, y+1); ctx.lineTo(x+w-1, y+1); ctx.stroke();
    ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x+w-1, y+1); ctx.lineTo(x+w-1, y+h-1); ctx.lineTo(x+1, y+h-1); ctx.stroke();
    ctx.restore();
  }

  function drawHedge(x, y, w, h, col) {
    if (w <= 0 || h <= 0) return;
    // Dark base
    ctx.fillStyle = col;
    ctx.fillRect(x, y, w, h);
    // Leafy bump clusters (top-down foliage texture)
    const bR = Math.min(9, Math.max(3, Math.min(w, h) * 0.28));
    const cols = Math.max(1, Math.round(w / (bR * 2)));
    const rows = Math.max(1, Math.round(h / (bR * 2)));
    const lighter = '#3a7520', darker = '#142e0a';
    for (let c = 0; c < cols; c++) {
      for (let r = 0; r < rows; r++) {
        const bx2 = x + (c + 0.5) * (w / cols);
        const by2 = y + (r + 0.5) * (h / rows);
        ctx.fillStyle = ((c + r) % 2 === 0) ? lighter : darker;
        ctx.beginPath(); ctx.arc(bx2, by2, bR * 0.82, 0, Math.PI * 2); ctx.fill();
      }
    }
    // Leaf ellipse texture overlay
    ctx.fillStyle = 'rgba(0,0,0,0.09)';
    const nLeaves = Math.max(3, Math.round(w * h / 300));
    for (let li = 0; li < nLeaves; li++) {
      const lx2 = x + 2 + (Math.sin(li * 6.13 + x * 0.02) * 0.5 + 0.5) * (w - 4);
      const ly2 = y + 2 + (Math.sin(li * 4.77 + y * 0.02) * 0.5 + 0.5) * (h - 4);
      const lr = 3 + (Math.sin(li * 3.41) * 0.5 + 0.5) * 4;
      const la = Math.sin(li * 2.09) * Math.PI;
      ctx.save();
      ctx.translate(Math.round(lx2), Math.round(ly2));
      ctx.rotate(la);
      ctx.beginPath(); ctx.ellipse(0, 0, lr, lr * 0.45, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    // Top-left highlight
    ctx.fillStyle = 'rgba(255,255,255,0.07)';
    ctx.fillRect(x, y, w, 2);
    ctx.fillRect(x, y, 2, h);
    // Inner depth lines
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x+1, y+h-1); ctx.lineTo(x+1, y+1); ctx.lineTo(x+w-1, y+1); ctx.stroke();
    ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x+w-1, y+1); ctx.lineTo(x+w-1, y+h-1); ctx.lineTo(x+1, y+h-1); ctx.stroke();
    ctx.restore();
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
    // Specular highlight
    ctx.save();
    const specX = x + w * 0.2, specY = y + h * 0.15;
    const specGrad = ctx.createRadialGradient(specX, specY, 0, specX, specY, Math.min(w, h) * 0.3);
    specGrad.addColorStop(0, 'rgba(255,255,255,0.38)');
    specGrad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = specGrad;
    ctx.beginPath(); ctx.arc(specX, specY, Math.min(w, h) * 0.3, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  function drawTorch(x, y, w, h, now) {
    const flicker = getFlicker(now, x + y);
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
    // Drop shadow
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.beginPath(); ctx.arc(x + w*0.4+4,  y + h*0.65+5, w*0.38, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(x + w*0.68+4, y + h*0.60+5, w*0.35, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(x + w*0.52+3, y + h*0.38+4, w*0.32, 0, Math.PI*2); ctx.fill();
    // Foliage
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.arc(x + w*0.35, y + h*0.6,  w*0.38, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(x + w*0.65, y + h*0.55, w*0.35, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(x + w*0.5,  y + h*0.35, w*0.32, 0, Math.PI*2); ctx.fill();
    // Highlight
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
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
    // Inner depth lines
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x+1, y+h-7); ctx.lineTo(x+1, y+3); ctx.lineTo(x+w-1, y+3); ctx.stroke();
    ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x+w-1, y+3); ctx.lineTo(x+w-1, y+h-7); ctx.lineTo(x+1, y+h-7); ctx.stroke();
    ctx.restore();
  }

  function drawLamp(x, y, w, h, col, now) {
    const flicker = getFlicker(now, x * 2 + y);
    const hcx = x + w / 2;
    // Ground glow pool beneath lamp
    const glowR = 58 * flicker;
    const gg = ctx.createRadialGradient(hcx, y + h * 0.6, 0, hcx, y + h * 0.6, glowR);
    gg.addColorStop(0, `rgba(255,220,100,${(0.16 * flicker).toFixed(3)})`);
    gg.addColorStop(1, 'rgba(255,220,100,0)');
    ctx.fillStyle = gg;
    ctx.beginPath(); ctx.arc(hcx, y + h * 0.6, glowR, 0, Math.PI * 2); ctx.fill();
    // Pole
    ctx.fillStyle = '#3a3a3a';
    ctx.fillRect(hcx - 3, y + 10, 5, h - 10);
    ctx.fillRect(x + 2, y + h - 6, w - 4, 4);
    // Lamp head
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.arc(hcx, y + 7, 8, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = `rgba(255,230,120,${(0.7 * flicker).toFixed(2)})`;
    ctx.beginPath(); ctx.arc(hcx, y + 7, 5, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#808060'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(hcx, y + 7, 8, 0, Math.PI * 2); ctx.stroke();
    // Specular highlight
    ctx.save();
    const specX = hcx - 3, specY = y + 3;
    const specGrad = ctx.createRadialGradient(specX, specY, 0, specX, specY, Math.min(w, h) * 0.3);
    specGrad.addColorStop(0, 'rgba(255,255,255,0.38)');
    specGrad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = specGrad;
    ctx.beginPath(); ctx.arc(specX, specY, Math.min(w, h) * 0.3, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
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
    // Specular highlight (cool tint for water surface)
    ctx.save();
    const specX = x + w * 0.2, specY = y + h * 0.15;
    const specGrad = ctx.createRadialGradient(specX, specY, 0, specX, specY, Math.min(w, h) * 0.25);
    specGrad.addColorStop(0, 'rgba(200,235,255,0.35)');
    specGrad.addColorStop(1, 'rgba(200,235,255,0)');
    ctx.fillStyle = specGrad;
    ctx.beginPath(); ctx.arc(specX, specY, Math.min(w, h) * 0.25, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  function drawPillar(x, y, w, h, col) {
    const pw = Math.max(3, w - 4);
    ctx.fillStyle = col;
    ctx.fillRect(x + (w-pw)/2, y + 4, pw, h - 8);
    ctx.fillRect(x, y, w, 5);
    ctx.fillRect(x, y + h - 5, w, 5);
    // Fluting (vertical grooves) on shaft
    const flutes = Math.max(2, Math.floor(pw / 4));
    const fw = pw / flutes;
    for (let f = 0; f < flutes; f++) {
      const fx2 = x + (w-pw)/2 + f * fw;
      ctx.fillStyle = (f % 2 === 0) ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.12)';
      ctx.fillRect(fx2 + 1, y + 6, fw - 1, h - 12);
    }
    // Capital highlight
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    ctx.fillRect(x, y, w, 2);
    ctx.fillRect(x, y + h - 5, w, 2);
  }

  function drawTable(x, y, w, h, col) {
    ctx.fillStyle = col;
    ctx.fillRect(x, y + 4, w, h - 8);
    ctx.fillStyle = '#5a3818';
    ctx.fillRect(x + 3, y + h - 4, 5, 4);
    ctx.fillRect(x + w - 8, y + h - 4, 5, 4);
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.fillRect(x, y + 4, w, 2);
    // Horizontal wood grain lines
    ctx.strokeStyle = 'rgba(80,45,15,0.06)';
    ctx.lineWidth = 1;
    const grainSpacing = Math.max(4, Math.round(h / 5));
    for (let gi = 1; gi < 5; gi++) {
      const gy = y + 5 + gi * grainSpacing;
      if (gy < y + h - 8) {
        ctx.beginPath(); ctx.moveTo(x + 1, gy); ctx.lineTo(x + w - 1, gy); ctx.stroke();
      }
    }
    // Inner depth lines
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x+1, y+h-9); ctx.lineTo(x+1, y+5); ctx.lineTo(x+w-1, y+5); ctx.stroke();
    ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x+w-1, y+5); ctx.lineTo(x+w-1, y+h-9); ctx.lineTo(x+1, y+h-9); ctx.stroke();
    ctx.restore();
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
    // Horizontal wood grain lines on shelf body
    ctx.strokeStyle = 'rgba(80,45,15,0.06)';
    ctx.lineWidth = 1;
    for (let gi = 1; gi < 6; gi++) {
      const gy = y + Math.round(gi * h / 6);
      if (gy > y && gy < y + h) {
        ctx.beginPath(); ctx.moveTo(x + 1, gy); ctx.lineTo(x + w - 1, gy); ctx.stroke();
      }
    }
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
    // Inner depth lines
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x+1, y+h-1); ctx.lineTo(x+1, y+1); ctx.lineTo(x+w-1, y+1); ctx.stroke();
    ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x+w-1, y+1); ctx.lineTo(x+w-1, y+h-1); ctx.lineTo(x+1, y+h-1); ctx.stroke();
    ctx.restore();
  }

  function drawFireplace(x, y, w, h, col, now) {
    ctx.fillStyle = col;
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = '#1a0a00';
    ctx.fillRect(x + 5, y + 5, w - 10, h - 10);
    const flicker = getFlicker(now, x + y * 2);
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
    // Specular highlight
    ctx.save();
    const specX = x + w * 0.2, specY = y + h * 0.15;
    const specGrad = ctx.createRadialGradient(specX, specY, 0, specX, specY, Math.min(w, h) * 0.3);
    specGrad.addColorStop(0, 'rgba(255,255,255,0.38)');
    specGrad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = specGrad;
    ctx.beginPath(); ctx.arc(specX, specY, Math.min(w, h) * 0.3, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  function drawMirror(x, y, w, h, col, now) {
    ctx.fillStyle = col;
    ctx.fillRect(x, y, w, h);
    // Mirror glass with ghostly shimmer
    const shimmer = now !== undefined ? (0.35 + 0.1 * Math.sin(now * 0.0018 + x * 0.003)) : 0.45;
    ctx.fillStyle = `rgba(180,200,220,${shimmer.toFixed(3)})`;
    ctx.fillRect(x + 3, y + 3, w - 6, h - 6);
    // Vertical highlight streak
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.fillRect(x + 4, y + 4, 4, h - 8);
    // Ghostly tint sweep
    if (now !== undefined) {
      const gt = 0.5 + 0.5 * Math.sin(now * 0.0009 + x * 0.005);
      ctx.fillStyle = `rgba(160,200,255,${(gt * 0.07).toFixed(3)})`;
      ctx.fillRect(x + 3, y + 3, w - 6, h - 6);
    }
    // Specular highlight
    ctx.save();
    const specX = x + w * 0.2, specY = y + h * 0.15;
    const specGrad = ctx.createRadialGradient(specX, specY, 0, specX, specY, Math.min(w, h) * 0.3);
    specGrad.addColorStop(0, 'rgba(255,255,255,0.38)');
    specGrad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = specGrad;
    ctx.beginPath(); ctx.arc(specX, specY, Math.min(w, h) * 0.3, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
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
    // Inner depth lines
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x+1, y+h-1); ctx.lineTo(x+1, y+1); ctx.lineTo(x+w-1, y+1); ctx.stroke();
    ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x+w-1, y+1); ctx.lineTo(x+w-1, y+h-1); ctx.lineTo(x+1, y+h-1); ctx.stroke();
    ctx.restore();
  }

  function drawBed(x, y, w, h, col) {
    // Bed frame
    ctx.fillStyle = col;
    ctx.fillRect(x, y, w, h);
    // Headboard
    ctx.fillStyle = '#4a2a3a';
    ctx.fillRect(x, y, w, Math.max(4, Math.round(h * 0.22)));
    // Pillow(s)
    const pw = Math.max(8, Math.round(w * 0.28));
    const ph = Math.max(5, Math.round(h * 0.20));
    const py2 = y + Math.round(h * 0.24);
    ctx.fillStyle = '#e8daf0';
    ctx.fillRect(x + 4, py2, pw, ph);
    if (w > 60) ctx.fillRect(x + w - pw - 4, py2, pw, ph);
    // Sheets
    ctx.fillStyle = '#c8b8d4';
    ctx.fillRect(x + 2, py2 + ph + 2, w - 4, h - (ph + 2 + Math.round(h*0.24)) - 4);
    // Sheet fold
    ctx.fillStyle = '#d4c8e0';
    ctx.fillRect(x + 2, py2 + ph + 2, w - 4, 4);
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(x, y, w, 2);
  }

  function drawCounter(x, y, w, h, col) {
    // Counter body
    ctx.fillStyle = col;
    ctx.fillRect(x, y, w, h);
    // Top surface (darker wood)
    ctx.fillStyle = '#6a4828';
    ctx.fillRect(x, y, w, Math.max(3, Math.round(h * 0.2)));
    // Front panel insets
    const insetW = Math.max(10, Math.round(w * 0.2));
    const nInsets = Math.max(1, Math.floor(w / (insetW + 6)));
    const spacing = w / nInsets;
    for (let i = 0; i < nInsets; i++) {
      ctx.fillStyle = 'rgba(0,0,0,0.2)';
      ctx.fillRect(x + i * spacing + 3, y + Math.round(h * 0.3), insetW, Math.round(h * 0.55));
    }
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.fillRect(x, y, w, 2);
    // Horizontal wood grain lines on counter top surface
    ctx.strokeStyle = 'rgba(80,45,15,0.06)';
    ctx.lineWidth = 1;
    const cTopH = Math.max(3, Math.round(h * 0.2));
    for (let gi = 1; gi < 4; gi++) {
      const gy = y + Math.round(gi * cTopH / 4);
      if (gy > y && gy < y + cTopH) {
        ctx.beginPath(); ctx.moveTo(x + 1, gy); ctx.lineTo(x + w - 1, gy); ctx.stroke();
      }
    }
    // Inner depth lines
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x+1, y+h-1); ctx.lineTo(x+1, y+1); ctx.lineTo(x+w-1, y+1); ctx.stroke();
    ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x+w-1, y+1); ctx.lineTo(x+w-1, y+h-1); ctx.lineTo(x+1, y+h-1); ctx.stroke();
    ctx.restore();
  }

  function drawSofa(x, y, w, h, col) {
    // Base
    ctx.fillStyle = col;
    ctx.fillRect(x, y, w, h);
    // Back cushion
    ctx.fillStyle = '#8a2840';
    ctx.fillRect(x, y, w, Math.max(4, Math.round(h * 0.35)));
    // Seat cushions
    const cw2 = Math.floor((w - 8) / 2);
    ctx.fillStyle = '#aa3850';
    ctx.fillRect(x + 3, y + Math.round(h * 0.38), cw2, Math.round(h * 0.5));
    ctx.fillRect(x + 5 + cw2, y + Math.round(h * 0.38), cw2, Math.round(h * 0.5));
    // Armrests
    ctx.fillStyle = '#6a2030';
    ctx.fillRect(x, y, 4, h);
    ctx.fillRect(x + w - 4, y, 4, h);
    ctx.fillStyle = 'rgba(255,255,255,0.1)';
    ctx.fillRect(x, y, w, 2);
    // Inner depth lines
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x+1, y+h-1); ctx.lineTo(x+1, y+1); ctx.lineTo(x+w-1, y+1); ctx.stroke();
    ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x+w-1, y+1); ctx.lineTo(x+w-1, y+h-1); ctx.lineTo(x+1, y+h-1); ctx.stroke();
    ctx.restore();
  }

  function drawPool(x, y, w, h, col, now) {
    // Pool basin (deep blue)
    const shimmer = 0.7 + 0.3 * Math.sin(now * 0.002 + x * 0.001);
    ctx.fillStyle = '#1040b0';
    ctx.fillRect(x, y, w, h);
    // Water shimmer gradient
    const pg = ctx.createLinearGradient(x, y, x + w, y + h);
    pg.addColorStop(0, `rgba(40,120,220,${(0.45 * shimmer).toFixed(3)})`);
    pg.addColorStop(0.5, `rgba(80,160,255,${(0.3 * shimmer).toFixed(3)})`);
    pg.addColorStop(1, `rgba(20,80,180,${(0.5 * shimmer).toFixed(3)})`);
    ctx.fillStyle = pg;
    ctx.fillRect(x, y, w, h);
    // Pool lane lines
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.lineWidth = 2;
    const nLanes = 3;
    const laneH = h / nLanes;
    for (let i = 1; i < nLanes; i++) {
      ctx.beginPath();
      ctx.moveTo(x + 8, y + i * laneH);
      ctx.lineTo(x + w - 8, y + i * laneH);
      ctx.stroke();
    }
    // Pool edge/border
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.lineWidth = 3;
    ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
    // Caustic light refraction — drifting diagonal beams
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    const causticT = now * 0.00045;
    for (let c = 0; c < 6; c++) {
      const drift = Math.sin(causticT + c * 1.1) * w * 0.12;
      const cx2 = x + (c / 6) * w + drift;
      const alpha = 0.055 + 0.035 * Math.sin(causticT * 1.7 + c * 0.9);
      ctx.strokeStyle = `rgba(160,230,255,${alpha.toFixed(3)})`;
      ctx.lineWidth = 3 + 2 * Math.sin(causticT + c * 0.7);
      ctx.beginPath();
      ctx.moveTo(cx2 - h * 0.18, y);
      ctx.lineTo(cx2 + h * 0.18, y + h);
      ctx.stroke();
    }
    ctx.restore();
    // Animated ripples
    const rippleT = (now * 0.001) % 1;
    for (let i = 0; i < 3; i++) {
      const rp = (rippleT + i / 3) % 1;
      const rx = x + w * (0.25 + i * 0.25);
      const ry = y + h * 0.5;
      const rr = rp * Math.min(w, h) * 0.2;
      ctx.strokeStyle = `rgba(200,240,255,${(0.3 * (1 - rp)).toFixed(3)})`;
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.ellipse(rx, ry, rr, rr * 0.35, 0, 0, Math.PI * 2); ctx.stroke();
    }
    // Specular highlight (cool tint for water surface)
    ctx.save();
    const poolSpecX = x + w * 0.2, poolSpecY = y + h * 0.15;
    const poolSpecGrad = ctx.createRadialGradient(poolSpecX, poolSpecY, 0, poolSpecX, poolSpecY, Math.min(w, h) * 0.25);
    poolSpecGrad.addColorStop(0, 'rgba(200,235,255,0.35)');
    poolSpecGrad.addColorStop(1, 'rgba(200,235,255,0)');
    ctx.fillStyle = poolSpecGrad;
    ctx.beginPath(); ctx.arc(poolSpecX, poolSpecY, Math.min(w, h) * 0.25, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  function drawElevator(x, y, w, h, col, now) {
    // Frame
    ctx.fillStyle = '#3a3850';
    ctx.fillRect(x, y, w, h);
    // Door panels (two panels with gap)
    const doorW = Math.floor((w - 6) / 2);
    ctx.fillStyle = '#5a5878';
    ctx.fillRect(x + 2, y + 2, doorW, h - 4);
    ctx.fillRect(x + w - 2 - doorW, y + 2, doorW, h - 4);
    // Door gap
    ctx.fillStyle = '#1a1828';
    ctx.fillRect(x + w / 2 - 1, y + 2, 2, h - 4);
    // Button panel — animated pulse
    const pulse = now !== undefined ? (0.5 + 0.5 * Math.sin(now * 0.0028 + x * 0.01)) : 0.5;
    ctx.fillStyle = '#8080a0';
    ctx.beginPath(); ctx.arc(x + w / 2, y + 8, 3, 0, Math.PI * 2); ctx.fill();
    // Button glow
    const btnGlow = ctx.createRadialGradient(x + w / 2, y + 8, 0, x + w / 2, y + 8, 6);
    btnGlow.addColorStop(0, `rgba(255,220,80,${(0.8 * pulse).toFixed(3)})`);
    btnGlow.addColorStop(1, 'rgba(255,220,80,0)');
    ctx.fillStyle = btnGlow;
    ctx.beginPath(); ctx.arc(x + w / 2, y + 8, 6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = `rgba(255,240,${Math.floor(80 + pulse * 100)},${(0.6 + 0.4 * pulse).toFixed(2)})`;
    ctx.beginPath(); ctx.arc(x + w / 2, y + 8, 1.5, 0, Math.PI * 2); ctx.fill();
    // Reflection highlight
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(x + 2, y + 2, 3, h - 4);
    ctx.fillRect(x + w - 2 - doorW, y + 2, 3, h - 4);
  }

  // ── Egypt NPCs: Mummies and Scarabs ─────────────────────────────────────
  const EGYPT_BOUNDS = { x1: 64, y1: 64, x2: 2816, y2: 2176 };

  function initEgyptNPCs() {
    S.egyptNPCs = [
      { type: 'mummy', x: 1440, y: 640,  angle: 0,          stateTimer: 0,    speed: 26 },
      { type: 'mummy', x:  320, y: 800,  angle: Math.PI/2,  stateTimer: 800,  speed: 24 },
      { type: 'mummy', x: 2560, y: 1100, angle: Math.PI,    stateTimer: 1600, speed: 28 },
      { type: 'scarab',x:  800, y: 480,  angle: 0.8,        stateTimer: 0,    speed: 55 },
      { type: 'scarab',x: 2100, y: 700,  angle: 2.5,        stateTimer: 300,  speed: 60 },
      { type: 'scarab',x: 1200, y: 1400, angle: 4.1,        stateTimer: 600,  speed: 52 },
      { type: 'scarab',x: 1700, y: 1800, angle: 1.2,        stateTimer: 900,  speed: 58 },
      { type: 'scarab',x:  500, y: 1600, angle: 3.7,        stateTimer: 200,  speed: 56 },
      { type: 'scarab',x: 2300, y: 1500, angle: 5.1,        stateTimer: 450,  speed: 54 },
    ];
  }

  function updateEgyptNPCs(dt) {
    if (!S || !S.egyptNPCs) return;
    const b = EGYPT_BOUNDS;
    for (const npc of S.egyptNPCs) {
      npc.stateTimer -= dt * 1000;
      if (npc.stateTimer <= 0) {
        npc.angle += (Math.random() - 0.5) * (npc.type === 'mummy' ? 1.2 : 2.4);
        npc.stateTimer = npc.type === 'mummy'
          ? 2500 + Math.random() * 3000
          : 600  + Math.random() * 1200;
      }
      const step = npc.speed * dt;
      const nx = npc.x + Math.cos(npc.angle) * step;
      const ny = npc.y + Math.sin(npc.angle) * step;
      if (nx < b.x1 + 40 || nx > b.x2 - 40) { npc.angle = Math.PI - npc.angle; }
      else if (ny < b.y1 + 40 || ny > b.y2 - 40) { npc.angle = -npc.angle; }
      else { npc.x = nx; npc.y = ny; }
    }
  }

  function drawMummy(cx, cy, angle, now) {
    const bob = Math.sin(now * 0.0015) * 2.5;
    ctx.save(); ctx.translate(Math.round(cx), Math.round(cy + bob));
    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.beginPath(); ctx.ellipse(0, 14, 9, 4, 0, 0, Math.PI*2); ctx.fill();
    // Body
    ctx.fillStyle = '#c8b890';
    ctx.fillRect(-7, -12, 14, 26);
    // Bandage stripes
    ctx.strokeStyle = '#a09070'; ctx.lineWidth = 1.5;
    for (let i = -10; i < 14; i += 4) {
      ctx.beginPath(); ctx.moveTo(-7, i); ctx.lineTo(7, i); ctx.stroke();
    }
    // Head
    ctx.fillStyle = '#d0ba9a';
    ctx.beginPath(); ctx.ellipse(0, -16, 6, 7, 0, 0, Math.PI*2); ctx.fill();
    // Glowing eyes
    ctx.fillStyle = '#ff8020';
    ctx.beginPath(); ctx.arc(-2.5, -16, 2, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc( 2.5, -16, 2, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = 'rgba(255,160,40,0.6)';
    ctx.beginPath(); ctx.arc(-2.5, -16, 3.5, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc( 2.5, -16, 3.5, 0, Math.PI*2); ctx.fill();
    ctx.restore();
  }

  function drawScarabNPC(cx, cy, angle, now) {
    ctx.save(); ctx.translate(Math.round(cx), Math.round(cy)); ctx.rotate(angle);
    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.beginPath(); ctx.ellipse(0, 3.5, 6, 2.5, 0, 0, Math.PI*2); ctx.fill();
    // Shell
    ctx.fillStyle = '#1a7848';
    ctx.beginPath(); ctx.ellipse(0, 0, 6, 4.5, 0, 0, Math.PI*2); ctx.fill();
    // Iridescent highlight
    ctx.fillStyle = 'rgba(60,220,140,0.50)';
    ctx.beginPath(); ctx.ellipse(-1, -1.5, 3, 2, 0.4, 0, Math.PI*2); ctx.fill();
    // Center line
    ctx.strokeStyle = '#0d5030'; ctx.lineWidth = 0.8;
    ctx.beginPath(); ctx.moveTo(0, -4.5); ctx.lineTo(0, 4.5); ctx.stroke();
    // Legs
    ctx.strokeStyle = '#1a6040'; ctx.lineWidth = 0.7;
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath(); ctx.moveTo(-6, i*2.2); ctx.lineTo(-10, i*2.2 - 1.5); ctx.stroke();
      ctx.beginPath(); ctx.moveTo( 6, i*2.2); ctx.lineTo( 10, i*2.2 - 1.5); ctx.stroke();
    }
    ctx.restore();
  }

  function drawEgyptNPCs() {
    if (!S || !S.egyptNPCs) return;
    const now = Date.now();
    for (const npc of S.egyptNPCs) {
      if (npc.type === 'mummy') drawMummy(npc.x, npc.y, npc.angle, now);
      else drawScarabNPC(npc.x, npc.y, npc.angle, now);
    }
  }

  // ── Alligator system ─────────────────────────────────────────────────────
  const ALLIGATOR_SPEED = 55;
  const ALLIGATOR_DETECT_RANGE = 280;
  // Alligators roam within the pool section of the hotel
  const ALLIGATOR_BOUNDS = { x1: 672, y1: 1216, x2: 1888, y2: 1920 };

  function initAlligators() {
    S.alligators = [
      { x: 1200, y: 1450, angle: 0,            stateTimer: 0,    isFollowing: false, targetX: 1200, targetY: 1450, walkPhase: 0   },
      { x:  960, y: 1540, angle: Math.PI / 3,  stateTimer: 1000, isFollowing: false, targetX:  960, targetY: 1540, walkPhase: 0.5 },
      { x: 1520, y: 1380, angle: Math.PI,      stateTimer: 2000, isFollowing: false, targetX: 1520, targetY: 1380, walkPhase: 1.0 },
    ];
  }

  function updateAlligators(dt) {
    if (!S || !S.alligators) return;
    const bounds = ALLIGATOR_BOUNDS;
    for (const al of S.alligators) {
      al.stateTimer -= dt * 1000;
      // Find nearest player
      let nearDist = Infinity, nearX = al.x, nearY = al.y;
      const pts = [{ x: S.me.x, y: S.me.y }];
      for (const p of Object.values(S.otherPlayers)) pts.push({ x: p.x, y: p.y });
      for (const p of pts) {
        const d = Math.hypot(p.x - al.x, p.y - al.y);
        if (d < nearDist) { nearDist = d; nearX = p.x; nearY = p.y; }
      }
      // State transitions
      if (nearDist < ALLIGATOR_DETECT_RANGE) {
        al.isFollowing = true;
        al.targetX = nearX;
        al.targetY = nearY;
      } else if (al.stateTimer <= 0) {
        al.isFollowing = false;
        al.targetX = bounds.x1 + Math.random() * (bounds.x2 - bounds.x1);
        al.targetY = bounds.y1 + Math.random() * (bounds.y2 - bounds.y1);
        al.stateTimer = 2000 + Math.random() * 3000;
      }
      // Move toward target
      const dx = al.targetX - al.x;
      const dy = al.targetY - al.y;
      const dist = Math.hypot(dx, dy);
      if (dist > 6) {
        const spd = al.isFollowing ? ALLIGATOR_SPEED * 1.3 : ALLIGATOR_SPEED * 0.55;
        const step = Math.min(spd * dt, dist);
        al.x += (dx / dist) * step;
        al.y += (dy / dist) * step;
        al.angle = Math.atan2(dy, dx);
        al.walkPhase += step * 0.008;
      }
      // Clamp to roam bounds
      al.x = Math.max(bounds.x1, Math.min(bounds.x2, al.x));
      al.y = Math.max(bounds.y1, Math.min(bounds.y2, al.y));
    }
  }

  function drawAlligator(cx, cy, angle, walkPhase) {
    ctx.save();
    ctx.translate(Math.round(cx), Math.round(cy));
    ctx.rotate(angle);

    const bodyLen = 26, bodyW = 11;
    const waddle = Math.sin(walkPhase * Math.PI * 2) * 2;

    // Shadow
    ctx.globalAlpha = 0.2;
    ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.ellipse(2, 14, bodyLen * 0.85, 4, 0, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;

    // Tail
    ctx.fillStyle = '#2d5a18';
    ctx.beginPath();
    ctx.moveTo(-bodyLen * 0.45, -3 + waddle);
    ctx.lineTo(-bodyLen * 1.35, waddle * 0.5);
    ctx.lineTo(-bodyLen * 0.45, 3 + waddle);
    ctx.closePath(); ctx.fill();

    // Body
    ctx.fillStyle = '#3d7a22';
    ctx.beginPath(); ctx.ellipse(2, 0, bodyLen * 0.55, bodyW * 0.52, 0, 0, Math.PI * 2); ctx.fill();

    // Scale bumps along spine
    ctx.fillStyle = '#2d5a18';
    for (let i = -2; i <= 2; i++) {
      ctx.beginPath(); ctx.arc(i * 7 + 2, -bodyW * 0.35, 2.5, 0, Math.PI * 2); ctx.fill();
    }

    // Legs (4 stubby)
    const legPhase = Math.sin(walkPhase * Math.PI * 2);
    ctx.fillStyle = '#3d7a22';
    ctx.fillRect( 6,  -bodyW * 0.5 + legPhase * 2.5,  7, 4);
    ctx.fillRect( 6,   bodyW * 0.5 - 3 - legPhase * 2.5, 7, 4);
    ctx.fillRect(-10, -bodyW * 0.5 - legPhase * 2.5,  7, 4);
    ctx.fillRect(-10,  bodyW * 0.5 - 3 + legPhase * 2.5, 7, 4);

    // Head
    ctx.fillStyle = '#3d7a22';
    ctx.beginPath(); ctx.ellipse(bodyLen * 0.55, 0, bodyLen * 0.26, bodyW * 0.44, 0, 0, Math.PI * 2); ctx.fill();

    // Snout
    ctx.fillStyle = '#4d9a2a';
    ctx.beginPath();
    ctx.moveTo(bodyLen * 0.68, -5);
    ctx.lineTo(bodyLen * 1.08, waddle * 0.3);
    ctx.lineTo(bodyLen * 0.68,  5);
    ctx.closePath(); ctx.fill();

    // Nostrils
    ctx.fillStyle = '#1a3a08';
    ctx.beginPath(); ctx.arc(bodyLen * 1.0, -1.5, 1.2, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(bodyLen * 1.0,  1.5, 1.2, 0, Math.PI * 2); ctx.fill();

    // Eyes
    ctx.fillStyle = '#d0b000';
    ctx.beginPath(); ctx.arc(bodyLen * 0.64, -4, 2.8, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(bodyLen * 0.64,  4, 2.8, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#1a0800';
    ctx.beginPath(); ctx.arc(bodyLen * 0.64, -4, 1.2, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(bodyLen * 0.64,  4, 1.2, 0, Math.PI * 2); ctx.fill();
    // Eye highlight
    ctx.fillStyle = 'rgba(255,255,200,0.6)';
    ctx.beginPath(); ctx.arc(bodyLen * 0.64 + 0.8, -4.5, 0.7, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(bodyLen * 0.64 + 0.8,  3.5, 0.7, 0, Math.PI * 2); ctx.fill();

    ctx.restore();
  }

  function drawAlligators() {
    if (!S || !S.alligators) return;
    for (const al of S.alligators) {
      drawAlligator(al.x, al.y, al.angle, al.walkPhase);
    }
  }

  function drawEntities() {
    const now = Date.now();

    // Found ghosts
    for (const gh of Object.values(S.ghosts)) {
      if (!gh.found || gh.identified) continue;

      // Vapor trail — personality-specific particle ribbon
      if (gh.trail && gh.trail.length > 0) {
        const pers = gh.personality || 'shy';
        for (let ti = 0; ti < gh.trail.length; ti++) {
          const tp = gh.trail[ti];
          const tFrac = ti / gh.trail.length;
          // Personality params
          let alpha, rX, rY, color;
          const wobble = Math.sin(ti * 0.8 + now * 0.002) * 6 * (1 - tFrac);
          const wobbleY = Math.cos(ti * 1.2 + now * 0.0015) * 4 * (1 - tFrac);
          switch(pers) {
            case 'shy':
              alpha = tFrac * 0.18;
              rX = 4 + tFrac * 6; rY = 3 + tFrac * 4;
              color = 'rgba(168,216,234,'; break;
            case 'dramatic':
              alpha = tFrac * 0.55;
              rX = 6 + tFrac * 14; rY = 4 + tFrac * 8;
              color = 'rgba(255,107,157,'; break;
            case 'goofy': {
              const hue = (ti * 37 + now * 0.05) % 360;
              alpha = tFrac * 0.45;
              rX = 5 + tFrac * 10; rY = 4 + tFrac * 6;
              color = `hsla(${hue},80%,65%,`; break;
            }
            case 'grumpy':
              alpha = tFrac * 0.40;
              rX = 4 + tFrac * 7; rY = 3 + tFrac * 4;
              color = 'rgba(255,80,60,'; break;
            case 'regal':
              alpha = tFrac * 0.35;
              rX = 5 + tFrac * 10; rY = 4 + tFrac * 7;
              color = 'rgba(201,168,108,'; break;
            default: // confused
              alpha = tFrac * 0.30;
              rX = 5 + tFrac * 8; rY = 3 + tFrac * 5;
              color = 'rgba(184,245,163,'; break;
          }
          ctx.save();
          ctx.globalAlpha = alpha;
          ctx.fillStyle = color + '1)';
          ctx.beginPath();
          ctx.ellipse(tp.x + wobble, tp.y + wobbleY, rX, rY, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
      }

      const pulse = 0.6 + 0.4 * Math.sin(now * 0.003 + gh.id * 1.8);
      const glow  = ctx.createRadialGradient(gh.x, gh.y, 0, gh.x, gh.y, 44);
      glow.addColorStop(0, gh.color + 'bb');
      glow.addColorStop(1, gh.color + '00');
      ctx.fillStyle = glow;
      ctx.beginPath(); ctx.arc(gh.x, gh.y, 44, 0, Math.PI*2); ctx.fill();

      // Per-personality visual parameters
      const pers = gh.personality || 'shy';
      let gScale = 1.0, gWide = 1.0, gTilt = 0, eyeSpread = 1.0, eyeSize = 3;
      let hemFreq = 4, hemAmp = 5;
      switch(pers) {
        case 'shy':      gScale = 0.88; gWide = 0.92; break;
        case 'dramatic': gScale = 1.18; hemFreq = 6; hemAmp = 7; eyeSize = 3.5; break;
        case 'goofy':    gWide = 1.25; gScale = 0.92; eyeSpread = 1.4; eyeSize = 3.5; break;
        case 'grumpy':   gWide = 1.1; hemFreq = 3; hemAmp = 3; break;
        case 'regal':    gScale = 1.12; hemFreq = 5; hemAmp = 4; break;
        case 'confused': gTilt = Math.sin(now * 0.002) * 0.18; break;
      }

      // Body
      const by = gh.y - 6 + Math.sin(now*0.002+gh.id)*4;
      const headR = (16 + pulse * 3) * gScale;
      const sheetW = 32 * gWide;
      const sheetH = 22 * gScale;

      // Awareness state visual
      const awareness = ghostAwarenessStates[gh.id] || 'dormant';
      let awarenessAlphaBoost = 1.0, awarenessScale = 1.0;
      if (awareness === 'aware') { awarenessAlphaBoost = 1.3; awarenessScale = 1.05; }
      else if (awareness === 'restless') { awarenessAlphaBoost = 1.5; awarenessScale = 1.15; }

      ctx.save();
      if (pers === 'shy') ctx.globalAlpha = 0.75 + Math.sin(now * 0.002) * 0.2;
      ctx.translate(gh.x, by);
      if (gTilt !== 0) ctx.rotate(gTilt);
      ctx.scale(awarenessScale, awarenessScale);
      ctx.fillStyle = gh.color + 'ee';
      ctx.beginPath(); ctx.arc(0, -10 * gScale, headR, 0, Math.PI*2); ctx.fill();
      ctx.fillRect(-sheetW/2, -10 * gScale, sheetW, sheetH);
      // Wavy hem
      const hemY = (-10 * gScale) + sheetH;
      ctx.beginPath(); ctx.moveTo(-sheetW/2, hemY);
      for (let i = 0; i < hemFreq; i++) {
        const segW = sheetW / hemFreq;
        ctx.quadraticCurveTo(
          -sheetW/2 + (i + 0.5) * segW,
          hemY + hemAmp * (i % 2 ? 1 : -1),
          -sheetW/2 + (i + 1) * segW,
          hemY
        );
      }
      ctx.fill();
      // Eyes
      const eyeOff = 5 * eyeSpread;
      ctx.fillStyle = 'rgba(0,0,0,0.75)';
      ctx.beginPath(); ctx.arc(-eyeOff, (-10 * gScale) + 1, eyeSize, 0, Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.arc( eyeOff, (-10 * gScale) + 1, eyeSize, 0, Math.PI*2); ctx.fill();

      // Regal crown
      if (pers === 'regal') {
        const crownY = (-10 * gScale) - headR - 4;
        ctx.fillStyle = 'rgba(255,215,0,0.85)';
        for (let ci = -1; ci <= 1; ci++) {
          const peakH = ci === 0 ? 9 : 6;
          ctx.beginPath();
          ctx.moveTo(ci * 8 - 4, crownY);
          ctx.lineTo(ci * 8,     crownY - peakH);
          ctx.lineTo(ci * 8 + 4, crownY);
          ctx.closePath(); ctx.fill();
        }
      }

      // Grumpy brow lines
      if (pers === 'grumpy') {
        ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 1.5;
        const browY = (-10 * gScale) - eyeSize - 3;
        ctx.beginPath(); ctx.moveTo(-eyeOff - 4, browY - 3); ctx.lineTo(-eyeOff + 2, browY); ctx.stroke();
        ctx.beginPath(); ctx.moveTo( eyeOff + 4, browY - 3); ctx.lineTo( eyeOff - 2, browY); ctx.stroke();
      }

      ctx.restore();

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
      drawAvatar(ctx, p.x, p.y, facingToDir(p.facing || 0), p.walkPhase || 0, pBob, p.avatar || 0, false, getShockAmt(p.shockStart || 0));
    }

    // Player (self)
    drawAvatar(ctx, S.me.x, S.me.y, facingToDir(S.me.facing), walkPhase, meMoving ? 0 : idleBob, S.me.avatar || 0, true, getShockAmt(shockStart));

    // Alligators (hotel only)
    if (S.area === 'hotel') drawAlligators();
    if (S.area === 'egypt') drawEgyptNPCs();
  }

  function applyDarkness(cw, ch) {
    const dc = darkCtx;
    const now = Date.now();
    dc.clearRect(0, 0, cw, ch);
    dc.fillStyle = 'rgba(0,0,0,0.87)';
    dc.fillRect(0, 0, cw, ch);
    // Light flicker override
    if (flickerOverride) {
      const fe = Date.now() - flickerOverride.start;
      if (fe < flickerOverride.duration) {
        dc.fillStyle = `rgba(0,0,0,${(0.87 * 0.22).toFixed(3)})`;
        dc.fillRect(0, 0, cw, ch);
      } else {
        flickerOverride = null;
      }
    }

    const sx = Math.round(S.me.x - S.cam.x);
    const sy = Math.round(S.me.y - S.cam.y);

    dc.globalCompositeOperation = 'destination-out';

    // #3 Found-ghost ambient glow — guides players toward revealed ghosts in the dark
    for (const gh of Object.values(S.ghosts)) {
      if (!gh.found || gh.identified) continue;
      const gx = gh.x - S.cam.x, gy = gh.y - S.cam.y;
      if (gx < -100 || gx > cw+100 || gy < -100 || gy > ch+100) continue;
      const gpulse = 0.6 + 0.4 * Math.sin(now * 0.003 + gh.id * 1.8);
      const gr = 55 + gpulse * 12;
      const gg = dc.createRadialGradient(gx, gy, 0, gx, gy, gr);
      gg.addColorStop(0, `rgba(255,255,255,${(0.32 + gpulse * 0.14).toFixed(3)})`);
      gg.addColorStop(1, 'rgba(255,255,255,0)');
      dc.fillStyle = gg;
      dc.beginPath(); dc.arc(gx, gy, gr, 0, Math.PI*2); dc.fill();
    }

    // Flashlight cone — self (slightly reduced from 1.0 → 0.82 for better atmosphere)
    if (S.activeTool === 'flashlight') {
      const avFlash = FLASH_RANGE * (AVATAR_STATS[S.me.avatar || 0] || AVATAR_STATS[0]).flashMult;
      const grad = dc.createRadialGradient(sx, sy, 0, sx, sy, avFlash);
      grad.addColorStop(0,   'rgba(255,255,255,0.82)');
      grad.addColorStop(0.5, 'rgba(255,255,255,0.70)');
      grad.addColorStop(1,   'rgba(255,255,255,0)');
      dc.fillStyle = grad;
      dc.beginPath();
      dc.moveTo(sx, sy);
      dc.arc(sx, sy, avFlash, S.me.facing - FLASH_ANGLE, S.me.facing + FLASH_ANGLE);
      dc.closePath();
      dc.fill();
    }

    // Flashlight cones — other players (dimmer, tinted slightly warm)
    for (const p of Object.values(S.otherPlayers)) {
      if (p.activeTool !== 'flashlight') continue;
      const px = p.x - S.cam.x, py = p.y - S.cam.y;
      if (px < -FLASH_RANGE || px > cw + FLASH_RANGE || py < -FLASH_RANGE || py > ch + FLASH_RANGE) continue;
      const pgrad = dc.createRadialGradient(px, py, 0, px, py, FLASH_RANGE * 0.92);
      pgrad.addColorStop(0,   'rgba(255,255,240,0.58)');
      pgrad.addColorStop(0.5, 'rgba(255,255,220,0.42)');
      pgrad.addColorStop(1,   'rgba(255,255,200,0)');
      dc.fillStyle = pgrad;
      dc.beginPath();
      dc.moveTo(px, py);
      dc.arc(px, py, FLASH_RANGE * 0.92, p.facing - FLASH_ANGLE, p.facing + FLASH_ANGLE);
      dc.closePath();
      dc.fill();
    }

    // EMF — radial glow
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

    // ── Per-level static light sources ──────────────────────────────────
    const area = AREA_DEFS[S.area];

    // #5 Graveyard + House: torch and candle obstacles emit real warm light
    if (S.area === 'graveyard' || S.area === 'house') {
      for (const ob of area.obstacles) {
        if (ob.type !== 'torch' && ob.type !== 'candle') continue;
        const lx = ob.x + ob.w/2 - S.cam.x, ly = ob.y - S.cam.y;
        if (lx < -140 || lx > cw+140 || ly < -140 || ly > ch+140) continue;
        const flicker = getFlicker(now, ob.x + ob.y);
        const lr = 75 * flicker;
        const tg = dc.createRadialGradient(lx, ly, 0, lx, ly, lr);
        tg.addColorStop(0, `rgba(255,240,180,${(0.55 * flicker).toFixed(3)})`);
        tg.addColorStop(0.4, `rgba(255,200,100,${(0.28 * flicker).toFixed(3)})`);
        tg.addColorStop(1, 'rgba(255,160,60,0)');
        dc.fillStyle = tg;
        dc.beginPath(); dc.arc(lx, ly, lr, 0, Math.PI*2); dc.fill();
      }
    }

    // #11 House: fireplace casts large warm amber light
    if (S.area === 'house') {
      for (const ob of area.obstacles) {
        if (ob.type !== 'fireplace') continue;
        const lx = ob.x + ob.w/2 - S.cam.x, ly = ob.y + ob.h/2 - S.cam.y;
        if (lx < -200 || lx > cw+200 || ly < -200 || ly > ch+200) continue;
        const flicker = getFlicker(now, ob.x + ob.y * 2);
        const lr = 130 * flicker;
        const fg = dc.createRadialGradient(lx, ly, 0, lx, ly, lr);
        fg.addColorStop(0, `rgba(255,220,160,${(0.65 * flicker).toFixed(3)})`);
        fg.addColorStop(0.4, `rgba(255,160,60,${(0.38 * flicker).toFixed(3)})`);
        fg.addColorStop(1, 'rgba(255,100,30,0)');
        dc.fillStyle = fg;
        dc.beginPath(); dc.arc(lx, ly, lr, 0, Math.PI*2); dc.fill();
      }
    }

    // #8 #9 #10 Garden: lamp posts + fountain beacon + fireflies + bioluminescent flowers
    if (S.area === 'garden') {
      const aw = area.areaWidth, ah = area.areaHeight;
      for (const ob of area.obstacles) {
        if (ob.type !== 'lamp') continue;
        const lx = ob.x + ob.w/2 - S.cam.x, ly = ob.y - S.cam.y;
        if (lx < -120 || lx > cw+120 || ly < -120 || ly > ch+120) continue;
        const lampFlicker = getFlicker(now, ob.x * 2 + ob.y);
        const lg = dc.createRadialGradient(lx, ly, 0, lx, ly, 90 * lampFlicker);
        lg.addColorStop(0, `rgba(255,255,200,${(0.55 * lampFlicker).toFixed(3)})`);
        lg.addColorStop(1, 'rgba(255,255,200,0)');
        dc.fillStyle = lg;
        dc.beginPath(); dc.arc(lx, ly, 90 * lampFlicker, 0, Math.PI*2); dc.fill();
      }
      // #9 Fountain — cool blue landmark light source
      const fnx = 1600 - S.cam.x, fny = 1120 - S.cam.y;
      if (fnx > -200 && fnx < cw+200 && fny > -200 && fny < ch+200) {
        const fng = dc.createRadialGradient(fnx, fny, 0, fnx, fny, 90);
        fng.addColorStop(0, 'rgba(140,225,255,0.5)');
        fng.addColorStop(0.6, 'rgba(90,195,255,0.18)');
        fng.addColorStop(1, 'rgba(80,190,255,0)');
        dc.fillStyle = fng;
        dc.beginPath(); dc.arc(fnx, fny, 90, 0, Math.PI*2); dc.fill();
      }
      // #8 Fireflies — cut tiny light dots when bright (same deterministic positions as drawAmbientParticles)
      for (let i = 0; i < 10; i++) {
        const bx = 128 + (Math.sin(i * 6.13) * 0.5 + 0.5) * (aw - 256);
        const by = 128 + (Math.sin(i * 4.51) * 0.5 + 0.5) * (ah - 256);
        const ffx = bx + Math.sin(now * 0.00082 + i * 2.3) * 60;
        const ffy = by + Math.cos(now * 0.00065 + i * 1.7) * 40;
        const twinkle = 0.5 + 0.5 * Math.sin(now * 0.006 + i * 1.9);
        if (twinkle < 0.6) continue;
        const flx = ffx - S.cam.x, fly = ffy - S.cam.y;
        if (flx < -40 || flx > cw+40 || fly < -40 || fly > ch+40) continue;
        const fr = 14 * twinkle;
        const fg = dc.createRadialGradient(flx, fly, 0, flx, fly, fr);
        fg.addColorStop(0, `rgba(255,255,200,${(twinkle * 0.45).toFixed(3)})`);
        fg.addColorStop(1, 'rgba(255,255,200,0)');
        dc.fillStyle = fg;
        dc.beginPath(); dc.arc(flx, fly, fr, 0, Math.PI*2); dc.fill();
      }
      // #10 Bioluminescent flowers — faint magenta/violet glow
      for (const ob of area.obstacles) {
        if (ob.type !== 'flower') continue;
        const flx2 = ob.x + ob.w/2 - S.cam.x, fly2 = ob.y + ob.h/2 - S.cam.y;
        if (flx2 < -60 || flx2 > cw+60 || fly2 < -60 || fly2 > ch+60) continue;
        const fpulse = 0.5 + 0.5 * Math.sin(now * 0.0018 + ob.x * 0.007);
        const fr2 = 20 * fpulse;
        const fwg = dc.createRadialGradient(flx2, fly2, 0, flx2, fly2, fr2);
        fwg.addColorStop(0, `rgba(255,180,255,${(0.32 * fpulse).toFixed(3)})`);
        fwg.addColorStop(1, 'rgba(255,180,255,0)');
        dc.fillStyle = fwg;
        dc.beginPath(); dc.arc(flx2, fly2, fr2, 0, Math.PI*2); dc.fill();
      }
    }

    // #14 #15 #16 #17 Hotel: chandeliers + corridor sconces + pool glow + elevator proximity
    if (S.area === 'hotel') {
      const aw = area.areaWidth;
      // #14 Ballroom chandeliers — large warm pools of golden light
      const chandelierPositions = [
        { x: 39*32+16, y: 16*32+16 },
        { x: 39*32+16, y: 24*32+16 },
        { x: 39*32+16, y: 32*32+16 },
      ];
      for (const cp of chandelierPositions) {
        const lx = cp.x - S.cam.x, ly = cp.y - S.cam.y;
        if (lx < -240 || lx > cw+240 || ly < -240 || ly > ch+240) continue;
        const flicker = 0.88 + 0.12 * Math.sin(now * 0.0032 + cp.y * 0.001);
        const lr = 165 * flicker;
        const cg = dc.createRadialGradient(lx, ly, 0, lx, ly, lr);
        cg.addColorStop(0, `rgba(255,245,200,${(0.62 * flicker).toFixed(3)})`);
        cg.addColorStop(0.4, `rgba(255,210,120,${(0.38 * flicker).toFixed(3)})`);
        cg.addColorStop(1, 'rgba(255,190,80,0)');
        dc.fillStyle = cg;
        dc.beginPath(); dc.arc(lx, ly, lr, 0, Math.PI*2); dc.fill();
      }
      // #15 Corridor sconces — series of warm lit pools in wing corridors
      const sconceYPositions = [576+96, 576+96*3, 576+96*5, 576+96*7, 576+96*9, 576+96*11];
      for (let si = 0; si < sconceYPositions.length; si++) {
        const swy = sconceYPositions[si];
        const sflicker = 0.82 + 0.18 * Math.sin(now * 0.0025 + si * 1.7);
        for (const swx of [96, aw - 96]) {
          const lx2 = swx - S.cam.x, ly2 = swy - S.cam.y;
          if (lx2 < -130 || lx2 > cw+130 || ly2 < -130 || ly2 > ch+130) continue;
          const lr2 = 60 * sflicker;
          const sg = dc.createRadialGradient(lx2, ly2, 0, lx2, ly2, lr2);
          sg.addColorStop(0, `rgba(255,200,120,${(0.52 * sflicker).toFixed(3)})`);
          sg.addColorStop(0.5, `rgba(255,170,80,${(0.28 * sflicker).toFixed(3)})`);
          sg.addColorStop(1, 'rgba(255,150,50,0)');
          dc.fillStyle = sg;
          dc.beginPath(); dc.arc(lx2, ly2, lr2, 0, Math.PI*2); dc.fill();
        }
      }
      // #16 Pool — cool blue-green ambient light from the water
      const poolCX = (864 + 1696) / 2, poolCY = (1280 + 1792) / 2;
      const plx = poolCX - S.cam.x, ply = poolCY - S.cam.y;
      if (plx > -280 && plx < cw+280 && ply > -280 && ply < ch+280) {
        const ppulse = 0.9 + 0.1 * Math.sin(now * 0.0018);
        const pg = dc.createRadialGradient(plx, ply, 0, plx, ply, 185 * ppulse);
        pg.addColorStop(0, `rgba(80,210,255,${(0.45 * ppulse).toFixed(3)})`);
        pg.addColorStop(0.5, `rgba(40,180,220,${(0.2 * ppulse).toFixed(3)})`);
        pg.addColorStop(1, 'rgba(20,160,200,0)');
        dc.fillStyle = pg;
        dc.beginPath(); dc.arc(plx, ply, 185 * ppulse, 0, Math.PI*2); dc.fill();
      }
      // #17 Elevator proximity glow — warm amber as player approaches
      for (const ob of area.obstacles) {
        if (ob.type !== 'elevator') continue;
        const edist = Math.hypot(S.me.x - (ob.x + ob.w/2), S.me.y - (ob.y + ob.h/2));
        if (edist > 200) continue;
        const elx = ob.x + ob.w/2 - S.cam.x, ely = ob.y + ob.h - 20 - S.cam.y;
        const eInt = Math.max(0, 1 - edist/200);
        const ePulse = 0.6 + 0.4 * Math.sin(now * 0.0028 + ob.x * 0.01);
        const er = 35 * ePulse;
        const eg = dc.createRadialGradient(elx, ely, 0, elx, ely, er);
        eg.addColorStop(0, `rgba(255,230,100,${(0.52 * eInt * ePulse).toFixed(3)})`);
        eg.addColorStop(1, 'rgba(255,200,60,0)');
        dc.fillStyle = eg;
        dc.beginPath(); dc.arc(elx, ely, er, 0, Math.PI*2); dc.fill();
      }
    }

    // #18 Egypt: torch glow + altar radiance + obelisk ambient + inner sanctum
    if (S.area === 'egypt') {
      const aw = area.areaWidth;
      // Torch light cutouts from obstacle array
      for (const ob of area.obstacles) {
        if (ob.type !== 'torch') continue;
        const lx = ob.x + ob.w/2 - S.cam.x, ly = ob.y - S.cam.y;
        if (lx < -120 || lx > cw+120 || ly < -120 || ly > ch+120) continue;
        const flicker = getFlicker(now, ob.x + ob.y);
        const tr = 70 * flicker;
        const tg = dc.createRadialGradient(lx, ly, 0, lx, ly, tr);
        tg.addColorStop(0, `rgba(255,200,100,${(0.68 * flicker).toFixed(3)})`);
        tg.addColorStop(0.5, `rgba(255,160,50,${(0.35 * flicker).toFixed(3)})`);
        tg.addColorStop(1, 'rgba(255,140,30,0)');
        dc.fillStyle = tg;
        dc.beginPath(); dc.arc(lx, ly, tr, 0, Math.PI*2); dc.fill();
      }
      // Central altar golden radiance
      const alx = (40*32+160) - S.cam.x, aly = (28*32+80) - S.cam.y;
      if (alx > -280 && alx < cw+280 && aly > -280 && aly < ch+280) {
        const apulse = 0.85 + 0.15 * Math.sin(now * 0.0022);
        const alg = dc.createRadialGradient(alx, aly, 0, alx, aly, 160 * apulse);
        alg.addColorStop(0, `rgba(255,230,100,${(0.40 * apulse).toFixed(3)})`);
        alg.addColorStop(0.5, `rgba(255,200,60,${(0.18 * apulse).toFixed(3)})`);
        alg.addColorStop(1, 'rgba(255,180,40,0)');
        dc.fillStyle = alg;
        dc.beginPath(); dc.arc(alx, aly, 160 * apulse, 0, Math.PI*2); dc.fill();
      }
      // Inner sanctum main sarcophagus eerie cold glow
      const scx = (40*32+160) - S.cam.x, scy = (60*32+96) - S.cam.y;
      if (scx > -240 && scx < cw+240 && scy > -240 && scy < ch+240) {
        const spulse = 0.75 + 0.25 * Math.sin(now * 0.0016);
        const scg = dc.createRadialGradient(scx, scy, 0, scx, scy, 120 * spulse);
        scg.addColorStop(0, `rgba(180,255,210,${(0.32 * spulse).toFixed(3)})`);
        scg.addColorStop(0.6, `rgba(100,220,160,${(0.12 * spulse).toFixed(3)})`);
        scg.addColorStop(1, 'rgba(60,200,140,0)');
        dc.fillStyle = scg;
        dc.beginPath(); dc.arc(scx, scy, 120 * spulse, 0, Math.PI*2); dc.fill();
      }
      // Obelisk tip glow (4 obelisks: vestibule pair + inner sanctum pair)
      const obeliskTips = [
        { x: 34*32+32, y: 2*32 }, { x: 54*32+32, y: 2*32 },
        { x: 33*32+32, y: 59*32 }, { x: 55*32+32, y: 59*32 },
      ];
      for (const ot of obeliskTips) {
        const otx = ot.x - S.cam.x, oty = ot.y - S.cam.y;
        if (otx < -80 || otx > cw+80 || oty < -80 || oty > ch+80) continue;
        const opglow = 0.55 + 0.45 * Math.sin(now * 0.0028 + ot.x * 0.002);
        const org = dc.createRadialGradient(otx, oty, 0, otx, oty, 35 * opglow);
        org.addColorStop(0, `rgba(255,220,80,${(0.42 * opglow).toFixed(3)})`);
        org.addColorStop(1, 'rgba(255,200,40,0)');
        dc.fillStyle = org;
        dc.beginPath(); dc.arc(otx, oty, 35 * opglow, 0, Math.PI*2); dc.fill();
      }
    }

    // Celebration white flash
    if (S.celebPulse) {
      const ct = (Date.now() - S.celebPulse.start) / 400;
      if (ct < 1) {
        dc.globalCompositeOperation = 'source-over';
        dc.fillStyle = `rgba(255,255,255,${(0.6 * (1 - ct)).toFixed(3)})`;
        dc.fillRect(0, 0, cw, ch);
        dc.globalCompositeOperation = 'destination-out';
      } else {
        S.celebPulse = null;
      }
    }
    dc.globalCompositeOperation = 'source-over';
    ctx.drawImage(darkCanvas, 0, 0, cssW, cssH);

    // ── Screen-space overlays (drawn on main ctx after dark blit) ──────────

    // #6 Graveyard: diagonal moonbeam shafts — faint pale green light rays
    if (S.area === 'graveyard') {
      for (let b = 0; b < 3; b++) {
        const beamX = cw * (0.15 + b * 0.34) + Math.sin(now * 0.00015 + b * 2.3) * 18;
        const alpha = 0.048 + 0.022 * Math.sin(now * 0.00022 + b * 1.8);
        ctx.save();
        ctx.translate(beamX, 0);
        ctx.rotate(0.52);
        const bmg = ctx.createLinearGradient(-22, 0, 22, 0);
        bmg.addColorStop(0, 'rgba(200,230,200,0)');
        bmg.addColorStop(0.5, `rgba(200,230,200,${alpha.toFixed(3)})`);
        bmg.addColorStop(1, 'rgba(200,230,200,0)');
        ctx.fillStyle = bmg;
        ctx.fillRect(-22, -ch * 0.2, 44, ch * 1.55);
        ctx.restore();
      }
    }

    // #12 House: faint amber window light shafts from room wall openings
    if (S.area === 'house') {
      const winWorldX = [192, 480, 800, 1120, 1440, 1680];
      for (let wi = 0; wi < winWorldX.length; wi++) {
        const wx = winWorldX[wi] - S.cam.x;
        if (wx < -80 || wx > cw + 80) continue;
        const alpha = 0.055 + 0.02 * Math.sin(now * 0.0003 + wi * 1.4);
        ctx.save();
        ctx.translate(wx, 0);
        ctx.rotate(0.1);
        const wg = ctx.createLinearGradient(-26, 0, 26, 0);
        wg.addColorStop(0, 'rgba(255,220,150,0)');
        wg.addColorStop(0.5, `rgba(255,220,150,${alpha.toFixed(3)})`);
        wg.addColorStop(1, 'rgba(255,220,150,0)');
        ctx.fillStyle = wg;
        ctx.fillRect(-26, 0, 52, ch);
        ctx.restore();
      }
    }

    // #4 Cold spot: frost-blue edge glow with pulsing sparkles (enhanced)
    if (S.coldSignal > 0.15) {
      const intensity = Math.min(1, (S.coldSignal - 0.15) / 0.85);
      const cpulse = 0.72 + 0.28 * Math.sin(now * 0.0044);
      const cg = ctx.createRadialGradient(cw/2, ch/2, Math.min(cw,ch)*0.22, cw/2, ch/2, Math.max(cw,ch)*0.75);
      cg.addColorStop(0, 'rgba(100,200,255,0)');
      cg.addColorStop(0.65, `rgba(80,170,255,${(intensity * 0.18 * cpulse).toFixed(3)})`);
      cg.addColorStop(1, `rgba(60,140,255,${(intensity * 0.38 * cpulse).toFixed(3)})`);
      ctx.fillStyle = cg;
      ctx.fillRect(0, 0, cw, ch);
      if (intensity > 0.3) {
        for (let i = 0; i < 6; i++) {
          const angle = now * 0.0006 * Math.PI * 2 + (i / 6) * Math.PI * 2;
          const dist = Math.min(cw, ch) * 0.42;
          const spx = cw/2 + Math.cos(angle) * dist;
          const spy = ch/2 + Math.sin(angle) * dist;
          const sparkA = intensity * (0.45 + 0.55 * Math.sin(now * 0.004 + i * 1.1)) * 0.65;
          ctx.fillStyle = `rgba(160,230,255,${sparkA.toFixed(3)})`;
          ctx.beginPath(); ctx.arc(spx, spy, 2.5, 0, Math.PI*2); ctx.fill();
        }
      }
    }
  }

  function drawHUD(cw, ch) {
    const tools = ['flashlight','emf','sound','microphone'];
    const icons  = { flashlight:'🔦', emf:'📡', sound:'🎙️', microphone:'🎤' };
    const labels = { flashlight:'FLASH', sound:'SOUND', microphone:'MIC' };

    // ── Layout constants (mirrored in handleTap) ───────────────────────
    const topH = 44;
    const panW = 76, panMargin = 8;
    const panX = cw - panW - panMargin;
    const toolH = 48, toolGap = 5;
    const toolsH = tools.length * toolH + (tools.length - 1) * toolGap;
    const toolsY = Math.round(ch * 0.44 - 30);
    const sigH = 36;
    const sigY = toolsY - sigH - toolGap;

    // ── Top info bar ───────────────────────────────────────────────────
    ctx.fillStyle = 'rgba(0,0,0,0.68)';
    ctx.fillRect(0, 0, cw, topH);
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.fillRect(0, topH - 1, cw, 1);  // subtle glass edge

    // Ghost progress (left)
    ctx.fillStyle = '#e2e8f0'; ctx.font = 'bold 13px monospace'; ctx.textAlign = 'left';
    ctx.fillText(`👻 ${S.identified}/${S.totalGhosts}`, 14, 27);

    // Area label (center)
    ctx.fillStyle = '#94a3b8'; ctx.font = '12px monospace'; ctx.textAlign = 'center';
    ctx.fillText(AREA_DEFS[S.area]?.label || '', cw / 2, 27);

    // Role badge (based on avatar)
    const roleNames = ['Pirate', 'Explorer', 'Officer', 'Medic'];
    const roleIcons = ['\uD83C\uDFF4\u200D\u2620\uFE0F', '\uD83C\uDF3F', '\uD83D\uDC6E', '\u2695\uFE0F'];
    const myRole = roleNames[S.me.avatar || 0] || roleNames[0];
    const myRoleIcon = roleIcons[S.me.avatar || 0] || roleIcons[0];
    ctx.fillStyle = '#6b7280'; ctx.font = '10px monospace'; ctx.textAlign = 'left';
    ctx.fillText(`${myRoleIcon} ${myRole}`, 14, 40);

    // Journal toggle button (right, inside top bar)
    const jbW = 38, jbH = 32, jbX = cw - jbW - 6, jbY = (topH - jbH) / 2;
    ctx.fillStyle = S.journal ? 'rgba(124,58,237,0.85)' : 'rgba(255,255,255,0.08)';
    rrect(ctx, jbX, jbY, jbW, jbH, 8); ctx.fill();
    if (S.journal) { ctx.strokeStyle = '#a78bfa'; ctx.lineWidth = 1.5; rrect(ctx, jbX, jbY, jbW, jbH, 8); ctx.stroke(); }
    ctx.font = '16px serif'; ctx.textAlign = 'center';
    ctx.fillText('📒', jbX + jbW / 2, jbY + 22);

    // ── Right action panel ─────────────────────────────────────────────

    // Signal button (above tool cluster)
    const sigCool = S.signalCooldown > 0;
    ctx.fillStyle = sigCool ? 'rgba(20,20,30,0.82)' : 'rgba(160,50,10,0.90)';
    rrect(ctx, panX, sigY, panW, sigH, 10); ctx.fill();
    if (!sigCool) { ctx.strokeStyle = '#ff8040'; ctx.lineWidth = 1.5; rrect(ctx, panX, sigY, panW, sigH, 10); ctx.stroke(); }
    ctx.font = '14px serif'; ctx.textAlign = 'center';
    ctx.fillText('📣', panX + panW / 2, sigY + 14);
    ctx.fillStyle = sigCool ? '#666' : '#ffaa60'; ctx.font = 'bold 9px monospace';
    ctx.fillText(sigCool ? `${Math.ceil(S.signalCooldown / 1000)}s` : 'SIGNAL', panX + panW / 2, sigY + 28);

    // Place Board button (above signal, right-aligned, when near ghost)
    if (S.nearGhost && !S.nearGhost.claimedBy) {
      const pbW = 130, pbH = 40;
      const pbX = cw - pbW - panMargin, pbY = sigY - pbH - toolGap;
      ctx.fillStyle = 'rgba(140,70,220,0.9)'; rrect(ctx, pbX, pbY, pbW, pbH, 12); ctx.fill();
      ctx.strokeStyle = '#c084fc'; ctx.lineWidth = 1.5; rrect(ctx, pbX, pbY, pbW, pbH, 12); ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.font = 'bold 13px monospace'; ctx.textAlign = 'center';
      ctx.fillText('✦ Place Board', pbX + pbW / 2, pbY + 26);
    }

    // Tool buttons (vertical stack)
    tools.forEach((t, i) => {
      const bx = panX;
      const by = toolsY + i * (toolH + toolGap);
      const active = S.activeTool === t;
      const sig = S.signals[t] || 0;

      if (t === 'emf') {
        ctx.fillStyle = active ? 'rgba(0,80,30,0.92)' : 'rgba(0,30,10,0.82)';
        rrect(ctx, bx, by, panW, toolH, 10); ctx.fill();
        if (active) { ctx.strokeStyle = '#00ff88'; ctx.lineWidth = 2; rrect(ctx, bx, by, panW, toolH, 10); ctx.stroke(); }
        ctx.fillStyle = active ? '#00ff88' : '#44bb77'; ctx.font = 'bold 10px monospace'; ctx.textAlign = 'center';
        ctx.fillText('EMF', bx + panW / 2, by + 13);
        if (S.hasEMFUpgrade) {
          ctx.fillStyle = '#ffdd00'; ctx.font = 'bold 8px monospace';
          ctx.fillText('2×', bx + panW - 10, by + 13);
        }
        // 5 segmented bars
        const nbars = 5, barH = [6,8,10,12,14];
        const litBars = Math.round((sig / 100) * nbars);
        const segW = 8, segGap = 3;
        const totalW = nbars * segW + (nbars - 1) * segGap;
        const startX = bx + (panW - totalW) / 2;
        const baseY = by + toolH - 5;
        for (let b = 0; b < nbars; b++) {
          const sx = startX + b * (segW + segGap);
          const sh = barH[b];
          const lit = b < litBars;
          const barColor = b >= 4 ? '#ff2244' : b >= 3 ? '#ff8800' : b >= 2 ? '#ffdd00' : '#00ff88';
          ctx.fillStyle = lit ? barColor : 'rgba(255,255,255,0.12)';
          ctx.fillRect(sx, baseY - sh, segW, sh);
        }
        if (active && sig > 0) {
          const pulse = (Math.sin(Date.now() / 180) + 1) / 2;
          ctx.strokeStyle = `rgba(0,255,136,${0.2 + pulse * 0.5})`;
          ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.arc(bx + panW / 2, by + 28, 10 + pulse * 4, 0, Math.PI * 2); ctx.stroke();
        }
        ctx.font = '16px serif'; ctx.textAlign = 'center';
        ctx.fillText('📡', bx + panW / 2, by + 34);
      } else {
        ctx.fillStyle = active ? 'rgba(96,165,250,0.85)' : 'rgba(20,20,30,0.78)';
        rrect(ctx, bx, by, panW, toolH, 10); ctx.fill();
        if (active) { ctx.strokeStyle = '#60a5fa'; ctx.lineWidth = 2; rrect(ctx, bx, by, panW, toolH, 10); ctx.stroke(); }
        ctx.font = '20px serif'; ctx.textAlign = 'center';
        ctx.fillText(icons[t], bx + panW / 2, by + 23);
        ctx.fillStyle = active ? '#93c5fd' : '#64748b'; ctx.font = 'bold 8px monospace';
        ctx.fillText(labels[t], bx + panW / 2, by + 35);
        // Signal bar (skip for microphone — has no signal metric)
        if (t !== 'microphone') {
          ctx.fillStyle = 'rgba(255,255,255,0.18)';
          ctx.fillRect(bx + 6, by + toolH - 9, panW - 12, 4);
          ctx.fillStyle = sig > 70 ? '#ef4444' : sig > 40 ? '#f97316' : sig > 15 ? '#eab308' : '#4ade80';
          ctx.fillRect(bx + 6, by + toolH - 9, (panW - 12) * (sig / 100), 4);
        }
      }
    });

    // C1: Thermometer bar for Doctor avatar (index 3)
    if (S.me.avatar === 3) {
      const tmpBarH = 60, tmpBarW = 8;
      const tmpX = panX - tmpBarW - 10;
      const tmpY = toolsY + Math.floor(tools.length * (toolH + toolGap) / 2) - tmpBarH / 2;
      const temp = Math.max(0, Math.min(1, S.lastTemperature || 0));

      ctx.fillStyle = '#a0c8ff';
      ctx.font = 'bold 9px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('TEMP', tmpX + tmpBarW / 2, tmpY - 5);

      ctx.fillStyle = '#1a3a5c';
      rrect(ctx, tmpX, tmpY, tmpBarW, tmpBarH, 3);
      ctx.fill();

      const fillH = Math.round(temp * (tmpBarH - 4));
      if (fillH > 0) {
        ctx.fillStyle = 'rgba(100,180,255,0.9)';
        ctx.fillRect(tmpX + 2, tmpY + tmpBarH - 2 - fillH, tmpBarW - 4, fillH);
      }

      ctx.strokeStyle = '#3a6a9c';
      ctx.lineWidth = 1;
      rrect(ctx, tmpX, tmpY, tmpBarW, tmpBarH, 3);
      ctx.stroke();
    }

    // C3: Evidence card slots (bottom-left, above joystick zone)
    if (S.evidenceCards !== undefined) {
      const cardW = 30, cardH = 42, cardGap = 6;
      const slots = ['cold_presence', 'emf_level5', 'audible_sounds'];
      const slotColors  = { cold_presence: '#2060c0', emf_level5: '#206040', audible_sounds: '#602080' };
      const slotLabels  = { cold_presence: 'COLD', emf_level5: 'EMF', audible_sounds: 'SND' };
      const slotEmoji   = { cold_presence: '\u2745', emf_level5: 'EMF', audible_sounds: 'SND' };
      const baseX = 12, baseY = ch - cardH - 60;

      slots.forEach((slot, si) => {
        const cx2 = baseX + si * (cardW + cardGap);
        const cy2 = baseY;
        const collected = S.evidenceCards.includes(slot);
        const lastEvidence = S.evidenceCards[S.evidenceCards.length - 1];
        const isNewest  = collected && slot === lastEvidence;
        const flipAge   = (Date.now() - (S.evidenceFlipTime || 0)) / 500;
        const scaleY    = (isNewest && flipAge < 1) ? Math.max(0.01, flipAge) : 1;

        ctx.save();
        ctx.translate(cx2 + cardW / 2, cy2 + cardH / 2);
        ctx.scale(1, scaleY);
        ctx.translate(-(cx2 + cardW / 2), -(cy2 + cardH / 2));

        ctx.fillStyle = collected ? (slotColors[slot] || '#444') : 'rgba(30,30,40,0.6)';
        rrect(ctx, cx2, cy2, cardW, cardH, 4); ctx.fill();
        ctx.strokeStyle = collected ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.18)';
        ctx.lineWidth = 1.5;
        rrect(ctx, cx2, cy2, cardW, cardH, 4); ctx.stroke();

        if (collected) {
          ctx.fillStyle = '#fff';
          ctx.font = '11px serif';
          ctx.textAlign = 'center';
          ctx.fillText(slotEmoji[slot], cx2 + cardW / 2, cy2 + cardH * 0.48);
          ctx.font = 'bold 7px monospace';
          ctx.fillText(slotLabels[slot], cx2 + cardW / 2, cy2 + cardH - 6);
        } else {
          ctx.fillStyle = 'rgba(255,255,255,0.18)';
          ctx.font = '16px serif';
          ctx.textAlign = 'center';
          ctx.fillText('?', cx2 + cardW / 2, cy2 + cardH / 2 + 6);
        }
        ctx.restore();
      });
    }

    // ── Wrong guess flash / message ────────────────────────────────────
    if (S.wrongFlash > 0) {
      ctx.fillStyle = `rgba(239,68,68,${S.wrongFlash * 0.4})`;
      ctx.fillRect(0, 0, cw, ch);
      S.wrongFlash = Math.max(0, S.wrongFlash - 0.05);
    }

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

    // Case timer (if active)
    if (caseTimerMs !== null && caseTimerMs > 0) {
      const mins = Math.floor(caseTimerMs / 60000);
      const secs = Math.floor((caseTimerMs % 60000) / 1000);
      const timeStr = `${mins}:${secs.toString().padStart(2, '0')}`;
      const tW = 70, tH = 26, tX = (cw - tW) / 2, tY = 10;
      // Amber tint at 2 min remaining
      const isWarning = caseTimerMs < 120000;
      ctx.fillStyle = isWarning ? 'rgba(180,80,10,0.85)' : 'rgba(0,0,0,0.75)';
      rrect(ctx, tX, tY, tW, tH, 8); ctx.fill();
      ctx.strokeStyle = isWarning ? '#ff8040' : 'rgba(255,255,255,0.2)';
      ctx.lineWidth = 1;
      rrect(ctx, tX, tY, tW, tH, 8); ctx.stroke();
      ctx.fillStyle = isWarning ? '#ffcc80' : '#e2e8f0';
      ctx.font = 'bold 14px monospace'; ctx.textAlign = 'center';
      ctx.fillText('\u23F1 ' + timeStr, cw / 2, tY + 18);
    }

    ctx.textAlign = 'left';

    // Direction arrow (signal tool pointing toward ghost)
    drawDirectionArrow(cw, ch);
    // Minimap (top-right)
    drawMinimap(cw, ch);
    // Evidence journal overlay
    drawJournal(cw, ch);
  }

  function drawPOIPanel(cw, ch) {
    if (!S.activePoi) return;
    const poi = S.activePoi;
    // Left-aligned in bottom zone, clear of right action panel
    const pw = Math.min(cw / 2 - 20, 240), ph = 92;
    const px = 12, py = ch - ph - 18;
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
    ouijaCandleParticles = [];
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

    // Candle atmosphere on dark canvas
    if (S.ouija) {
      const now2 = Date.now();
      // Spawn candle particles
      if (Math.random() < 0.3) {
        const candlePositions = [
          { x: bx + 20, y: by + 20 }, { x: bx + bw - 20, y: by + 20 },
          { x: bx + 20, y: by + bh - 20 }, { x: bx + bw - 20, y: by + bh - 20 },
          { x: bx + bw * 0.5, y: by + 10 }, { x: bx + bw * 0.5, y: by + bh - 10 },
        ];
        const cp = candlePositions[Math.floor(Math.random() * candlePositions.length)];
        ouijaCandleParticles.push({ x: cp.x, y: cp.y, vy: -(0.5 + Math.random()), vx: (Math.random() - 0.5) * 0.4, life: 1.0, r: 3 + Math.random() * 3 });
      }
      // Update and draw candle particles
      for (let pi = ouijaCandleParticles.length - 1; pi >= 0; pi--) {
        const p = ouijaCandleParticles[pi];
        p.life -= 0.018;
        if (p.life <= 0) { ouijaCandleParticles.splice(pi, 1); continue; }
        p.x += p.vx; p.y += p.vy;
        const flicker = 0.7 + 0.3 * Math.sin(now2 * 0.02 + pi);
        ctx.save();
        ctx.globalAlpha = ou.alpha * p.life * flicker * 0.8;
        const grad2 = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 2);
        grad2.addColorStop(0, 'rgba(255,220,80,0.9)');
        grad2.addColorStop(1, 'rgba(255,120,20,0)');
        ctx.fillStyle = grad2;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 2, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }
    }

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

    // Toggle button (top-right, just below the top bar)
    const topH = 44;
    const tbW = 36, tbH = 26, tbX = cw - tbW - 6, tbY = topH + 4;
    ctx.fillStyle = mmOpen ? 'rgba(40,60,40,0.85)' : 'rgba(20,20,30,0.80)';
    rrect(ctx, tbX, tbY, tbW, tbH, 5); ctx.fill();
    ctx.fillStyle = '#94a3b8'; ctx.font = '11px monospace'; ctx.textAlign = 'center';
    ctx.fillText('[M]', tbX + tbW / 2, tbY + 17);

    if (!mmOpen) return;

    const mmW = Math.min(80, Math.round(cw * 0.20));
    const mmH = Math.round(mmW * area.areaHeight / area.areaWidth);
    const mmX = cw - mmW - 6, mmY = tbY + tbH + 4;
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

    // Found ghosts — ? for unidentified, dimmed circle for identified
    for (const gh of Object.values(S.ghosts)) {
      if (!gh.found) continue;
      const gx = mmX + gh.x * sc, gy = mmY + gh.y * sc;
      if (!gh.identified) {
        ctx.fillStyle = gh.color;
        ctx.font = '8px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('?', gx, gy + 3);
      } else {
        ctx.fillStyle = gh.color + '99';
        ctx.beginPath(); ctx.arc(gx, gy, 2, 0, Math.PI * 2); ctx.fill();
      }
    }

    // Self — triangle
    const smx = mmX + S.me.x * sc, smy = mmY + S.me.y * sc;
    ctx.fillStyle = '#22c55e';
    ctx.beginPath();
    ctx.moveTo(smx, smy - 5);
    ctx.lineTo(smx - 4, smy + 3);
    ctx.lineTo(smx + 4, smy + 3);
    ctx.closePath();
    ctx.fill();

    ctx.restore();

    // Ghost proximity pulse border
    let mmGhostNear = false;
    for (const gh of Object.values(S.ghosts)) {
      if (gh.found && !gh.identified && Math.hypot(gh.x - S.me.x, gh.y - S.me.y) < 300) {
        mmGhostNear = true; break;
      }
    }
    if (mmGhostNear) {
      const mpulse = 0.5 + 0.5 * Math.sin(Date.now() * 0.008);
      ctx.strokeStyle = `rgba(255,60,60,${(0.4 + mpulse * 0.6).toFixed(2)})`;
      ctx.lineWidth = 2;
    } else {
      ctx.strokeStyle = 'rgba(80,120,80,0.55)';
      ctx.lineWidth = 1;
    }
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

  // ── Case File reveal state (A6) ──────────────────────────────────────────
  let caseFileReveal = []; // per-ghost: { chars: number, startMs: number }
  let caseFileRafHandle = null;

  // ── Post-game case file DOM overlay (A6 — manila folder redesign) ─────────
  function showCaseFile() {
    const old = document.getElementById('ghost-case-file');
    if (old) old.remove();
    if (!S || Object.keys(S.identifiedGhosts).length === 0) return;

    const ghosts = Object.values(S.identifiedGhosts);
    const startMs = Date.now();
    caseFileReveal = ghosts.map(() => ({ chars: 0, startMs }));

    const overlay = document.createElement('div');
    overlay.id = 'ghost-case-file';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.93);z-index:9000;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;padding:24px;overflow:auto;font-family:Georgia,serif;';

    const title = document.createElement('div');
    title.style.cssText = 'font-size:20px;font-weight:bold;color:#d4a840;letter-spacing:0.04em;text-align:center;';
    title.textContent = '📋 Case Files — Investigation Complete';
    overlay.appendChild(title);

    const cards = document.createElement('div');
    cards.style.cssText = 'display:flex;flex-wrap:wrap;gap:18px;justify-content:center;max-width:750px;';

    ghosts.forEach((gh, gi) => {
      const card = document.createElement('div');
      card.dataset.ghostIdx = gi;
      // Manila folder aesthetic
      card.style.cssText = [
        'background:#c8a96e',
        'border:2px solid #8b6914',
        'border-radius:3px 3px 8px 8px',
        'padding:14px 18px 16px',
        'min-width:150px',
        'max-width:200px',
        'text-align:center',
        'color:#2a1a00',
        'position:relative',
        'box-shadow:2px 4px 10px rgba(0,0,0,0.55)',
      ].join(';');

      // Folder tab at top
      const tab = document.createElement('div');
      tab.style.cssText = 'position:absolute;top:-12px;left:16px;background:#b8994e;border:2px solid #8b6914;border-bottom:none;border-radius:4px 4px 0 0;padding:2px 10px;font-size:10px;font-family:monospace;color:#5a3a00;font-weight:bold;';
      tab.textContent = `FILE #${gi + 1}`;
      card.appendChild(tab);

      // Ghost icon
      const ghost = document.createElement('div');
      ghost.style.cssText = 'font-size:28px;margin:6px 0 4px;';
      ghost.textContent = '👻';
      card.appendChild(ghost);

      // Name — typewriter placeholder
      const nameEl = document.createElement('div');
      nameEl.dataset.fullName = gh.name;
      nameEl.style.cssText = 'font-weight:bold;font-size:16px;color:#3a1a00;min-height:22px;font-family:Georgia,serif;letter-spacing:0.04em;';
      nameEl.textContent = '';
      card.appendChild(nameEl);

      // Personality stamp
      const persEl = document.createElement('div');
      persEl.style.cssText = 'font-size:9px;letter-spacing:0.12em;color:#6b4a00;margin-top:3px;font-family:monospace;';
      persEl.textContent = gh.personality.toUpperCase();
      card.appendChild(persEl);

      // Divider line (manila paper rule)
      const rule = document.createElement('div');
      rule.style.cssText = 'border-bottom:1px solid #8b6914;margin:8px 0;opacity:0.5;';
      card.appendChild(rule);

      // Description
      const descEl = document.createElement('div');
      descEl.style.cssText = 'font-size:10px;color:#4a2a00;line-height:1.5;text-align:left;';
      descEl.textContent = gh.description;
      card.appendChild(descEl);

      // Letters
      if (gh.letters && gh.letters.length > 0) {
        const letEl = document.createElement('div');
        letEl.style.cssText = 'margin-top:8px;font-size:10px;font-family:monospace;color:#6b3a00;';
        letEl.textContent = 'Letters: ' + gh.letters.join(' ');
        card.appendChild(letEl);
      }

      // "CASE CLOSED" stamp placeholder (added by typewriter timer)
      const stampEl = document.createElement('div');
      stampEl.className = 'case-stamp';
      stampEl.dataset.stamp = '1';
      stampEl.style.cssText = 'position:absolute;bottom:10px;right:8px;font-size:11px;font-weight:bold;color:#cc0000;font-family:serif;transform:rotate(12deg);opacity:0;transition:opacity 0.3s;letter-spacing:0.06em;border:1.5px solid #cc0000;padding:2px 5px;border-radius:2px;';
      stampEl.textContent = 'CASE CLOSED';
      card.appendChild(stampEl);

      cards.appendChild(card);
    });
    overlay.appendChild(cards);

    document.body.appendChild(overlay);

    // Typewriter + stamp animation
    function tickCaseFile() {
      const overlayEl = document.getElementById('ghost-case-file');
      if (!overlayEl) return;
      const now = Date.now();
      const cardEls = overlayEl.querySelectorAll('[data-ghost-idx]');
      let anyActive = false;
      cardEls.forEach((card, gi) => {
        const nameEl = card.querySelector('[data-full-name]');
        if (!nameEl) return;
        const fullName = nameEl.dataset.fullName || '';
        const revState = caseFileReveal[gi];
        if (!revState) return;
        // Stagger each ghost card by 600ms
        const elapsed = now - revState.startMs - gi * 600;
        if (elapsed < 0) { anyActive = true; return; }
        const charsToShow = Math.min(fullName.length, Math.floor(elapsed / 60));
        if (charsToShow > revState.chars) {
          revState.chars = charsToShow;
          nameEl.textContent = fullName.slice(0, charsToShow);
        }
        if (charsToShow < fullName.length) {
          anyActive = true;
        } else {
          // Show stamp after 1.5s from name completion
          const nameCompleteAt = revState.startMs + gi * 600 + fullName.length * 60;
          const stampEl = card.querySelector('[data-stamp]');
          if (stampEl && (now - nameCompleteAt) > 1500) {
            stampEl.style.opacity = '1';
          } else {
            anyActive = true;
          }
        }
      });
      if (anyActive) caseFileRafHandle = requestAnimationFrame(tickCaseFile);
    }
    caseFileRafHandle = requestAnimationFrame(tickCaseFile);

    setTimeout(() => { if (overlay.parentNode) overlay.remove(); }, 9000);
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
        // A8/C1: temperature field
        if (sig.temperature !== undefined) S.lastTemperature = sig.temperature;
      }
      S.signals   = { emf: Math.round(emf), sound: Math.round(sound), flashlight: Math.round(flashlight) };
      S.emfDir    = (emfDir !== null && emfDir !== undefined) ? emfDir : null;
      S.sndDir    = (sndDir !== null && sndDir !== undefined) ? sndDir : null;
      S.coldSignal = coldSignal;
      // A8: trigger breath visual when Doctor (idx 3) and temperature above threshold
      if (S.me.avatar === 3 && S.lastTemperature > 0.3) {
        S.breathTimer = Date.now();
      }
    });

    socket.on('ghost:found', ({ ghostId, x, y, personality, color, nameLength }) => {
      if (!S) return;
      S.ghosts[ghostId] = { id:ghostId, x, y, personality, color, nameLength,
        found:true, identified:false, claimedBy:false,
        trail:[], ouijaLetters:[], attempts:0 };
      if (navigator.vibrate) navigator.vibrate([60,25,60,25,60]);
      gaSfxGhostFound();
      // Trigger shock animation on self and all visible other players
      shockStart = Date.now();
      for (const p of Object.values(S.otherPlayers)) p.shockStart = Date.now();
      // C2: store personality for microphone tool; if mic is already active, reinit
      MIC.personality = personality;
      if (S.activeTool === 'microphone') initMicAudio(personality);
    });

    socket.on('ghost:position', ({ ghostId, x, y }) => {
      if (!S || !S.ghosts[ghostId]) return;
      const gh = S.ghosts[ghostId];
      if (!gh.trail) gh.trail = [];
      gh.trail.push({ x: gh.x, y: gh.y });
      if (gh.trail.length > 15) gh.trail.shift();
      gh.x = x; gh.y = y;
    });

    socket.on('ghost:player_pos', ({ playerIndex, x, y, facing, avatar, tool }) => {
      if (!S) return;
      if (!S.otherPlayers[playerIndex]) S.otherPlayers[playerIndex] = { x, y, facing: 0, avatar: 0, walkPhase: 0, shockStart: 0, activeTool: null };
      const p = S.otherPlayers[playerIndex];
      const dist = Math.hypot(x - p.x, y - p.y);
      p.walkPhase = (p.walkPhase || 0) + dist * 0.12;
      p.x = x; p.y = y;
      if (facing !== undefined) p.facing = facing;
      if (avatar !== undefined) p.avatar = avatar;
      if (tool !== undefined) p.activeTool = tool;
    });

    socket.on('ghost:player_left', ({ playerIndex }) => {
      if (!S) return;
      delete S.otherPlayers[playerIndex];
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
      // Spawn celebration particles in screen center
      const cw2 = cssW || 400, ch2 = cssH || 700;
      const cx2 = cw2 / 2, cy2 = ch2 / 2;
      for (let pi = 0; pi < 28; pi++) {
        const angle = (pi / 28) * Math.PI * 2 + Math.random() * 0.3;
        const speed = 80 + Math.random() * 140;
        const hue = Math.random() * 360;
        celebrationParticles.push({
          x: cx2, y: cy2,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 80,
          r: 4 + Math.random() * 6,
          color: `hsl(${hue},80%,65%)`,
          born: Date.now(),
        });
      }
      S.celebPulse = { start: Date.now() };
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
      // Only show generic message if ghost:wrong_name hasn't already set a message
      // (guesser receives both events; wrong_name fires first with the more specific msg)
      if (!S.attemptsMsg) {
        S.attemptsMsg = '👻 Ghost fled! Find it again.';
        clearTimeout(S.attemptsMsgTimer);
        S.attemptsMsgTimer = setTimeout(() => { if (S) S.attemptsMsg = null; }, 2500);
      }
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
        S.attemptsMsg = '\u26A1 EMF Upgraded \u2014 range doubled!';
        clearTimeout(S.attemptsMsgTimer);
        S.attemptsMsgTimer = setTimeout(() => { if (S) S.attemptsMsg = null; }, 3500);
      }
    });

    socket.on('ghost:haunt_flicker', () => {
      if (!S) return;
      flickerOverride = { start: Date.now(), duration: 80 };
    });

    socket.on('ghost:timer_update', ({ remainingMs }) => {
      if (!S) return;
      caseTimerMs = remainingMs;
    });

    socket.on('ghost:time_up', () => {
      if (!S) return;
      caseTimerMs = 0;
      // Show "Night is Over" message
      S.attemptsMsg = '\uD83C\uDF05 Night is over! Investigation complete.';
      clearTimeout(S.attemptsMsgTimer);
      S.attemptsMsgTimer = setTimeout(() => { if (S) S.attemptsMsg = null; }, 4000);
    });

    socket.on('ghost:farewell', ({ ghostId, x, y, color }) => {
      if (!S) return;
      farewellGhost = { ghostId, x, y, color, start: Date.now() };
    });

    socket.on('ghost:awareness_change', ({ ghostId, state }) => {
      if (!S) return;
      ghostAwarenessStates[ghostId] = state;
    });

    socket.on('ghost:dramatic_pose', ({ color }) => {
      if (!S) return;
      dramaticPoseFlash = { start: Date.now(), color: color || '#ff6b9d' };
    });

    // C3: Evidence card collection
    socket.on('ghost:evidence', ({ type }) => {
      if (!S) return;
      if (!S.evidenceCards.includes(type)) {
        S.evidenceCards.push(type);
        S.evidenceFlipTime = Date.now();
      }
    });
  }

  function unbindSocketEvents() {
    ['ghost:signals','ghost:found','ghost:position','ghost:player_pos',
     'ghost:ouija_start',
     'ghost:identified','ghost:wrong_name','ghost:claimed','ghost:released',
     'ghost:respawn','ghost:signal_broadcast','ghost:key_taken','ghost:powerup_taken',
     'ghost:haunt_flicker','ghost:timer_update','ghost:time_up',
     'ghost:farewell','ghost:awareness_change','ghost:dramatic_pose',
     'ghost:evidence','ghost:player_left'].forEach(ev => socket.off(ev));
  }

  // ── Init / cleanup ────────────────────────────────────────────────────────
  function init(data) {
    const gd = data.ghost || {};
    const area = AREA_DEFS[gd.area] || AREA_DEFS.graveyard;
    const start = gd.playerStart || area.playerStart;

    cleanup();
    setupCanvas();
    walkPhase = 0;
    shockStart = 0;

    // Use server-confirmed avatar (from ghost:avatarChosen) if present in gameStart data,
    // falling back to local selection
    const myAvatar = ((data.players || [])[data.myPlayerIndex] || {}).avatar
                     ?? (window._ghostAvatarSelection || 0);

    // Seed other players with their confirmed avatars from gameStart
    const seedOtherPlayers = {};
    (data.players || []).forEach((p, i) => {
      if (i !== data.myPlayerIndex && !p.isAI) {
        seedOtherPlayers[i] = { x: start.x, y: start.y, facing: 0, avatar: p.avatar || 0, walkPhase: 0, shockStart: 0 };
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
      footsteps: [],
      // A8/C1: temperature tracking
      lastTemperature: 0,
      breathTimer: 0,
      // C3: evidence cards
      evidenceCards: [],
      evidenceFlipTime: 0,
    };

    // Init alligators for hotel
    if ((gd.area || 'graveyard') === 'hotel') initAlligators();
    if ((gd.area || 'graveyard') === 'egypt') initEgyptNPCs();

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

    S.titleCard = { start: Date.now(), done: false, inputGated: true };

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
    farewellGhost = null;
    celebrationParticles = [];
    ouijaCandleParticles = [];
    flickerOverride = null;
    dramaticPoseFlash = null;
    ghostAwarenessStates = {};
    caseTimerMs = null;
    closeNameInput();
    if (caseFileRafHandle) { cancelAnimationFrame(caseFileRafHandle); caseFileRafHandle = null; }
    const caseFile = document.getElementById('ghost-case-file');
    if (caseFile) caseFile.remove();
    gaStop();
    stopMicAudio();
    MIC.personality = null;
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
