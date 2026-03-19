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
    shy:      { speed: 60,  ouijaTime: 25, diversions: [1,2], fleeRange: 200, color: '#a8d8ea', description: 'Skittish and easily frightened — hides from the living',           emfMult: 0.7, soundMult: 0.6 },
    dramatic: { speed: 120, ouijaTime: 35, diversions: [0,1], fleeRange: 0,   color: '#ff6b9d', description: 'Theatrical and flamboyant — loves an audience',                    emfMult: 1.4, soundMult: 1.3 },
    goofy:    { speed: 90,  ouijaTime: 50, diversions: [0,2], fleeRange: 0,   color: '#ffd93d', description: 'Bouncy and unpredictable — finds everything hilarious',             emfMult: 1.0, soundMult: 1.5 },
    grumpy:   { speed: 70,  ouijaTime: 15, diversions: [2,3], fleeRange: 0,   color: '#ff4757', description: 'Irritable and impatient — just wants to be left alone',            emfMult: 1.3, soundMult: 0.7 },
    regal:    { speed: 40,  ouijaTime: 30, diversions: [0,0], fleeRange: 0,   color: '#c9a86c', description: 'Dignified and slow-moving — haunting with elegance since 1842',    emfMult: 1.0, soundMult: 0.9 },
    confused: { speed: 80,  ouijaTime: 45, diversions: [2,4], fleeRange: 0,   color: '#b8f5a3', description: 'Wandering aimlessly — not sure where, or when, they are',          emfMult: 0.8, soundMult: 1.2 },
  };

  const POI_POOLS = {
    graveyard: [
      { title: 'Elias Morrow, 1869',       text: 'Beloved innkeeper of Dunhallow. Died counting coins — found without a single one.' },
      { title: 'Agnes Fitch, 1901',         text: 'She brewed the finest tea in the county. Some say the kettle still whistles on cold nights.' },
      { title: 'Constance Hale, 1887',      text: 'Schoolteacher. Forty years of perfect attendance. Her students rarely agreed.' },
      { title: 'Reginald Pools, 1923',      text: 'He argued the church clock ran fast. The clock outlasted him by 80 years.' },
      { title: 'Muriel Cray, 1855',         text: 'Our lady of the loom. Wove twelve quilts in her final year. The thirteenth was unfinished.' },
      { title: 'Orphaned Stone, ???',       text: 'Name worn away by weather. Someone still leaves fresh flowers here every Sunday.' },
      { title: 'Tobias Wren, 1912',         text: 'Postmaster. Never opened a single letter addressed to himself. There were many.' },
      { title: 'The Dunhallow Children',    text: 'Five brothers: Arthur, George, Henry, Edmund, and little Poll. They all went ice skating. The ice did not hold.' },
    ],
    garden: [
      { title: 'Founders Plaque, 1784',     text: 'These grounds were laid by Countess Ashwood. She lost the estate in a card game in 1786.' },
      { title: 'The Weeping Elm',           text: 'Planted by a heartbroken suitor. The one he loved married another — and planted the elm next door.' },
      { title: 'Bench, In Memoriam',        text: 'In memory of Gerald, who sat here every morning. Gerald was a dog.' },
      { title: 'Sundial Inscription',       text: '"I count only the hours of sunshine." The shadow runs backward. The gardener says it always has.' },
      { title: 'Garden Labyrinth Notice',   text: 'Three visitors became lost in 1891. Two found their way out. The third found something else entirely.' },
      { title: 'Birdbath Dedication',       text: 'Donated by Mrs. Harlow, who believed birds were the souls of gossips. The birds seem unsettled here.' },
      { title: 'The Faceless Statue',       text: 'This figure once had a face. The groundskeeper removed it in 1952. He refuses to explain why.' },
      { title: 'Sealed Well Notice, 1903',  text: 'A surveyor heard voices from inside. The official report cites "echo effects from underground chambers."' },
    ],
    hotel: [
      { title: 'Guest Logbook, 1987',    text: 'Room 312 has been listed as occupied for 34 consecutive years. Housekeeping stopped knocking in 1991.' },
      { title: 'Pool Closure Notice',    text: '"Closed due to unexplained activity." The posted date has been scratched away. The water is still warm.' },
      { title: 'Room Service Ticket',    text: '"One rare steak, two glasses of wine, candles." Room 218. Order placed in 1978. Never collected. Never canceled.' },
      { title: 'Staff Bulletin Board',   text: '"Do NOT use elevator C between 3am and 5am. It will take you to the wrong floor." — No one knows who posted it.' },
      { title: 'Lobby Piano Placard',    text: '"This instrument has not been tuned since 1965." Night staff report hearing it play itself during quiet evenings.' },
      { title: 'Lost & Found Ledger',    text: 'Entry 47 reads: "One child\'s shoe. No matching shoe found. No child reported missing." Entry 48 is torn out.' },
      { title: 'Ballroom Dance Card',    text: 'New Year\'s Eve, 1959. Every dance slot is filled — in the same handwriting. The owner\'s name is left blank.' },
      { title: 'Maintenance Log',        text: '"Replaced mirror in Room 206 for the seventh time this year. Glass arrives facing inward. Cause unknown."' },
    ],
    house: [
      { title: 'Faded Letter',              text: '"Do not go into the east wing after sundown. We did not ask why. Now we know." — Unsigned.' },
      { title: 'Guest Register',            text: 'Last entry: "Room 4, party of 3, checking out Monday." Monday was a Wednesday that year. They never checked out.' },
      { title: 'The Stopped Clock',         text: 'The family wound it daily for thirty years. It stopped again. Always at 3:17.' },
      { title: 'Dusty Portrait',            text: 'The subject has been painted over three times. Each layer reveals the same expression.' },
      { title: 'Recipe Card',               text: "Aunt Delphine's famous roast. One ingredient is listed only as 'the usual thing.' No one remembers what it was." },
      { title: "Child's Drawing",           text: 'A crayon drawing of a family. Seven people are labeled. The family only had six members.' },
      { title: 'Bookshelf Note',            text: '"Count the windows from outside, then from inside. Tell me which number is right."' },
      { title: 'Fireplace Carving',         text: 'Names carved since 1840. The most recent was added three years ago. The house has been empty for fifteen.' },
    ],
    egypt: [
      { title: 'Canopic Jar',         text: '"Contents: liver, lungs, stomach, intestines. The fourth jar is missing. Its contents were never found."' },
      { title: 'Hieroglyph Warning',  text: '"Translation: Those who disturb this rest shall be followed home. The expedition members disagreed on what followed whom."' },
      { title: 'Offering Table',      text: '"Daily offerings recorded for 3,000 years. The last entry is dated this morning. The table was empty when we arrived."' },
      { title: 'Sarcophagus Lid',     text: '"The lid has been resealed from the inside. Archaeologists confirmed the mechanism only works from within."' },
      { title: 'Scarab Amulet',       text: '"Buried to guide the heart in the afterlife. This one was found in the wrong tomb. It keeps reappearing."' },
      { title: 'Tomb Oil Lamp',       text: '"Still burning after 4,000 years. Oil levels increase overnight. No one has been observed refilling it."' },
      { title: 'Cartouche',           text: '"The name belongs to a pharaoh with no known reign, no known tomb, no known death. Yet here is the tomb."' },
      { title: 'Excavation Log',      text: '"Day 14: The night watchman quit. Said something moved inside. Day 15: We hired a new one. Day 16: He also quit."' },
    ],
  };

  const FLASH_RANGE = 280;
  const FLASH_ANGLE = Math.PI / 4.5;
  const EMF_RANGE   = 450;
  const SOUND_RANGE = 350;
  const PLAYER_SPEED = 180;

  // Per-avatar stat multipliers (index matches GHOST_AVATAR_DEFS in game.js)
  const AVATAR_STATS = [
    { flashMult: 1.00, emfMult: 1.00, soundMult: 1.00 },  // 0: Pirate
    { flashMult: 1.00, emfMult: 0.75, soundMult: 1.25 },  // 1: Explorer
    { flashMult: 1.25, emfMult: 1.00, soundMult: 0.75 },  // 2: Police
    { flashMult: 0.75, emfMult: 1.25, soundMult: 1.00 },  // 3: Doctor
  ];
  const PICKUP_RANGE = 48;

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

  function buildHotelObstacles() {
    const obs = [];
    // Outer walls
    obs.push(rect(0,0,80,1,'stone'), rect(0,79,80,1,'stone'));
    obs.push(rect(0,0,1,80,'stone'), rect(79,0,1,80,'stone'));
    // Interior side walls
    obs.push(rect(20,1,1,13,'stone'), rect(59,1,1,13,'stone'));
    obs.push(rect(21,6,38,1,'stone'));
    // Back office furniture
    obs.push(rect(22,2,7,3,'table'), rect(50,2,7,3,'table'));
    obs.push(rect(31,2,1,4,'shelf'), rect(47,2,1,4,'shelf'));
    // Reception counter
    obs.push(rect(31,8,18,3,'counter'));
    // Columns
    obs.push(rect(7,5,2,4,'pillar'), rect(13,5,2,4,'pillar'));
    obs.push(rect(63,5,2,4,'pillar'), rect(69,5,2,4,'pillar'));
    // Sofas and tables in lobby
    obs.push(rect(3,7,5,3,'sofa'), rect(72,7,5,3,'sofa'));
    obs.push(rect(4,10,3,2,'table'), rect(73,10,3,2,'table'));
    // Stairs and elevators
    obs.push(rect(38,8,4,5,'stairs'), rect(44,8,4,5,'stairs'));
    obs.push(rect(28,8,4,5,'elevator'), rect(49,8,4,5,'elevator'));
    // Lobby divider wall with passages
    obs.push(rect(1,14,19,1,'stone'), rect(28,14,24,1,'stone'), rect(60,14,19,1,'stone'));
    // Wing A right wall — 3 doorways (every 2 rooms)
    obs.push(rect(19,15,1,2,'stone'), rect(19,19,1,12,'stone'), rect(19,33,1,12,'stone'), rect(19,47,1,11,'stone'));
    // Wing A rooms (walls and furniture)
    obs.push(rect(1,21,18,1,'stone'));
    obs.push(rect(2,16,7,3,'bed'), rect(14,16,3,3,'mirror'), rect(14,19,2,1,'table'));
    obs.push(rect(1,28,18,1,'stone'));
    obs.push(rect(2,23,7,3,'bed'), rect(14,23,3,3,'mirror'), rect(14,26,2,1,'table'), rect(11,27,2,1,'chair'));
    obs.push(rect(1,35,18,1,'stone'));
    obs.push(rect(2,30,7,3,'bed'), rect(14,30,3,3,'mirror'), rect(14,33,2,1,'table'));
    obs.push(rect(1,42,18,1,'stone'));
    obs.push(rect(2,37,7,3,'bed'), rect(14,37,3,3,'mirror'), rect(14,40,2,1,'table'), rect(11,41,2,1,'chair'));
    obs.push(rect(1,49,18,1,'stone'));
    obs.push(rect(2,44,7,3,'bed'), rect(14,44,3,3,'mirror'), rect(14,47,2,1,'table'));
    obs.push(rect(1,56,18,1,'stone'));
    obs.push(rect(2,51,7,3,'bed'), rect(14,51,3,3,'mirror'), rect(14,54,2,1,'table'), rect(11,55,2,1,'chair'));
    // Wing B left wall — 3 doorways (every 2 rooms)
    obs.push(rect(60,15,1,2,'stone'), rect(60,19,1,12,'stone'), rect(60,33,1,12,'stone'), rect(60,47,1,11,'stone'));
    // Wing B rooms
    obs.push(rect(61,21,18,1,'stone'));
    obs.push(rect(70,16,7,3,'bed'), rect(62,16,3,3,'mirror'), rect(62,19,2,1,'table'));
    obs.push(rect(61,28,18,1,'stone'));
    obs.push(rect(70,23,7,3,'bed'), rect(62,23,3,3,'mirror'), rect(62,26,2,1,'table'), rect(66,27,2,1,'chair'));
    obs.push(rect(61,35,18,1,'stone'));
    obs.push(rect(70,30,7,3,'bed'), rect(62,30,3,3,'mirror'), rect(62,33,2,1,'table'));
    obs.push(rect(61,42,18,1,'stone'));
    obs.push(rect(70,37,7,3,'bed'), rect(62,37,3,3,'mirror'), rect(62,40,2,1,'table'), rect(66,41,2,1,'chair'));
    obs.push(rect(61,49,18,1,'stone'));
    obs.push(rect(70,44,7,3,'bed'), rect(62,44,3,3,'mirror'), rect(62,47,2,1,'table'));
    obs.push(rect(61,56,18,1,'stone'));
    obs.push(rect(70,51,7,3,'bed'), rect(62,51,3,3,'mirror'), rect(62,54,2,1,'table'), rect(66,55,2,1,'chair'));
    // Ballroom bottom wall — 2 passages into pool area (tiles 28-31 and 46-49 left open)
    obs.push(rect(20,37,8,1,'stone'), rect(32,37,14,1,'stone'), rect(50,37,10,1,'stone'));
    obs.push(rect(21,16,2,3,'pillar'), rect(56,16,2,3,'pillar'));
    obs.push(rect(21,33,2,3,'pillar'), rect(56,33,2,3,'pillar'));
    // Ballroom tables
    obs.push(rect(24,18,3,3,'table'), rect(33,18,3,3,'table'), rect(42,18,3,3,'table'), rect(51,18,3,3,'table'));
    obs.push(rect(24,25,3,3,'table'), rect(33,25,3,3,'table'), rect(42,25,3,3,'table'), rect(51,25,3,3,'table'));
    obs.push(rect(24,32,3,3,'table'), rect(33,32,3,3,'table'), rect(42,32,3,3,'table'), rect(51,32,3,3,'table'));
    // Ballroom chairs
    obs.push(rect(23,19,1,1,'chair'), rect(27,19,1,1,'chair'), rect(25,17,1,1,'chair'), rect(25,21,1,1,'chair'));
    obs.push(rect(32,19,1,1,'chair'), rect(36,19,1,1,'chair'), rect(34,17,1,1,'chair'), rect(34,21,1,1,'chair'));
    obs.push(rect(41,19,1,1,'chair'), rect(45,19,1,1,'chair'), rect(43,17,1,1,'chair'), rect(43,21,1,1,'chair'));
    obs.push(rect(50,19,1,1,'chair'), rect(54,19,1,1,'chair'), rect(52,17,1,1,'chair'), rect(52,21,1,1,'chair'));
    obs.push(rect(23,26,1,1,'chair'), rect(27,26,1,1,'chair'), rect(25,24,1,1,'chair'), rect(25,28,1,1,'chair'));
    obs.push(rect(32,26,1,1,'chair'), rect(36,26,1,1,'chair'), rect(34,24,1,1,'chair'), rect(34,28,1,1,'chair'));
    obs.push(rect(41,26,1,1,'chair'), rect(45,26,1,1,'chair'), rect(43,24,1,1,'chair'), rect(43,28,1,1,'chair'));
    obs.push(rect(50,26,1,1,'chair'), rect(54,26,1,1,'chair'), rect(52,24,1,1,'chair'), rect(52,28,1,1,'chair'));
    // Pool room bottom wall — 2 passages into lower section (tiles 28-31 and 46-49 left open)
    obs.push(rect(20,59,8,1,'stone'), rect(32,59,14,1,'stone'), rect(50,59,10,1,'stone'));
    // Lounge chairs around pool
    obs.push(rect(21,43,3,1,'chair'), rect(21,48,3,1,'chair'), rect(21,53,3,1,'chair'));
    obs.push(rect(56,43,3,1,'chair'), rect(56,48,3,1,'chair'), rect(56,53,3,1,'chair'));
    obs.push(rect(31,38,3,1,'chair'), rect(39,38,3,1,'chair'), rect(47,38,3,1,'chair'));
    obs.push(rect(31,57,3,1,'chair'), rect(39,57,3,1,'chair'), rect(47,57,3,1,'chair'));
    // Shrubs near pool
    obs.push(rect(21,40,2,2,'shrub'), rect(57,40,2,2,'shrub'));
    obs.push(rect(21,56,2,2,'shrub'), rect(57,56,2,2,'shrub'));
    // Lower section — wing lower walls have a doorway at y=64-67 each
    obs.push(rect(19,60,1,4,'stone'), rect(19,68,1,11,'stone'), rect(1,66,18,1,'stone'), rect(9,60,1,6,'stone'));
    obs.push(rect(2,61,5,3,'table'), rect(11,61,6,3,'table'), rect(11,67,4,2,'table'));
    obs.push(rect(2,64,1,5,'shelf'), rect(5,64,1,5,'shelf'));
    obs.push(rect(39,60,1,19,'stone'));
    obs.push(rect(21,61,16,3,'counter'), rect(21,64,3,8,'counter'));
    obs.push(rect(21,61,1,3,'shelf'));
    obs.push(rect(24,64,2,1,'chair'), rect(27,64,2,1,'chair'), rect(30,64,2,1,'chair'), rect(33,64,2,1,'chair'));
    obs.push(rect(25,69,4,3,'sofa'), rect(31,69,4,3,'sofa'), rect(27,73,5,2,'table'));
    obs.push(rect(59,60,1,19,'stone'), rect(40,66,20,1,'stone'));
    obs.push(rect(41,61,5,3,'table'), rect(50,61,5,3,'table'));
    obs.push(rect(41,67,5,3,'table'), rect(50,67,5,3,'table'));
    obs.push(rect(41,73,5,3,'table'), rect(50,73,5,3,'table'));
    obs.push(rect(40,62,1,1,'chair'), rect(46,62,1,1,'chair'), rect(47,62,1,1,'chair'), rect(55,62,1,1,'chair'));
    obs.push(rect(40,68,1,1,'chair'), rect(46,68,1,1,'chair'), rect(47,68,1,1,'chair'), rect(55,68,1,1,'chair'));
    obs.push(rect(40,74,1,1,'chair'), rect(46,74,1,1,'chair'), rect(47,74,1,1,'chair'), rect(55,74,1,1,'chair'));
    obs.push(rect(60,60,1,4,'stone'), rect(60,68,1,11,'stone'), rect(61,66,18,1,'stone'), rect(70,60,1,6,'stone'));
    obs.push(rect(62,61,6,3,'table'), rect(72,61,5,3,'table'));
    obs.push(rect(62,64,1,5,'shelf'), rect(65,64,1,5,'shelf'));
    obs.push(rect(2,75,4,3,'stairs'), rect(73,75,4,3,'stairs'));
    obs.push(rect(19,25,1,3,'mirror'), rect(60,25,1,3,'mirror'));
    return obs;
  }

  function buildEgyptObstacles() {
    const obs = [];
    // Outer walls
    obs.push(rect(0,0,90,1,'stone'), rect(0,69,90,1,'stone'));
    obs.push(rect(0,0,1,70,'stone'), rect(89,0,1,70,'stone'));
    // Vestibule back wall (y=8): gap x=32-58 for center hall entry
    obs.push(rect(1,8,31,1,'stone'), rect(59,8,30,1,'stone'));
    // Center hall west wall (x=32, y=9-56): doors at y=17-19, y=33-35, y=49-51
    obs.push(rect(32,9,1,8,'stone'), rect(32,20,1,13,'stone'), rect(32,36,1,13,'stone'), rect(32,52,1,5,'stone'));
    // Center hall east wall (x=58, y=9-56): same doors
    obs.push(rect(58,9,1,8,'stone'), rect(58,20,1,13,'stone'), rect(58,36,1,13,'stone'), rect(58,52,1,5,'stone'));
    // Center hall columns (4 rows × 2)
    obs.push(rect(35,11,2,3,'pillar'), rect(53,11,2,3,'pillar'));
    obs.push(rect(35,21,2,3,'pillar'), rect(53,21,2,3,'pillar'));
    obs.push(rect(35,36,2,3,'pillar'), rect(53,36,2,3,'pillar'));
    obs.push(rect(35,51,2,3,'pillar'), rect(53,51,2,3,'pillar'));
    // Central altar + flanking urns
    obs.push(rect(40,28,10,5,'altar'));
    obs.push(rect(38,29,2,2,'urn'), rect(50,29,2,2,'urn'));
    // West wing room dividers (passage at x=13-17 each)
    obs.push(rect(1,24,12,1,'stone'), rect(18,24,14,1,'stone'));
    obs.push(rect(1,41,12,1,'stone'), rect(18,41,14,1,'stone'));
    // West wing room 1 (y=9-23)
    obs.push(rect(3,13,5,3,'sarcophagus'), rect(20,12,3,3,'urn'), rect(22,18,3,3,'statue'));
    // West wing room 2 (y=25-40)
    obs.push(rect(3,29,5,3,'sarcophagus'), rect(20,28,3,3,'urn'), rect(22,34,4,3,'altar'));
    // West wing room 3 (y=42-56)
    obs.push(rect(3,46,5,3,'sarcophagus'), rect(20,45,3,3,'urn'), rect(22,50,3,3,'statue'));
    // East wing room dividers (passage at x=73-77 each)
    obs.push(rect(59,24,14,1,'stone'), rect(78,24,11,1,'stone'));
    obs.push(rect(59,41,14,1,'stone'), rect(78,41,11,1,'stone'));
    // East wing room 1 (y=9-23)
    obs.push(rect(82,13,5,3,'sarcophagus'), rect(67,12,3,3,'urn'), rect(65,18,3,3,'statue'));
    // East wing room 2 (y=25-40)
    obs.push(rect(82,29,5,3,'sarcophagus'), rect(67,28,3,3,'urn'), rect(64,34,4,3,'altar'));
    // East wing room 3 (y=42-56)
    obs.push(rect(82,46,5,3,'sarcophagus'), rect(67,45,3,3,'urn'), rect(65,50,3,3,'statue'));
    // Inner sanctum: main sarcophagus, obelisks, altars, urns
    obs.push(rect(40,60,10,6,'sarcophagus'));
    obs.push(rect(33,59,2,8,'obelisk'), rect(55,59,2,8,'obelisk'));
    obs.push(rect(5,60,8,4,'altar'), rect(77,60,8,4,'altar'));
    obs.push(rect(36,60,2,2,'urn'), rect(52,60,2,2,'urn'));
    obs.push(rect(36,65,2,2,'urn'), rect(52,65,2,2,'urn'));
    // Vestibule: obelisks and columns (decorative but collidable)
    obs.push(rect(34,2,2,5,'obelisk'), rect(54,2,2,5,'obelisk'));
    obs.push(rect(40,3,2,4,'pillar'), rect(48,3,2,4,'pillar'));
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
      playerStart: { x: 1120, y: 1120 },
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
    hotel: {
      label: 'Hotel',
      bgColor: '#18121e',
      areaWidth:  80 * T,  // 2560
      areaHeight: 80 * T,  // 2560
      obstacles: buildHotelObstacles(),
      spawnZones: [
        { x:  96, y:  512, w: 416, h: 384 },  // wing A rooms
        { x: 1984, y:  512, w: 416, h: 384 }, // wing B rooms
        { x:  704, y:  512, w: 896, h: 640 }, // ballroom area
        { x:  704, y: 1280, w: 896, h: 512 }, // pool area
        { x:  128, y: 1984, w: 512, h: 512 }, // lower section left
        { x: 1280, y: 1984, w: 896, h: 512 }, // lower section right
      ],
      playerStart: { x: 1280, y: 520 },
    },
    egypt: {
      label: 'Egyptian Temple',
      bgColor: '#1a1208',
      areaWidth:  90 * T,  // 2880
      areaHeight: 70 * T,  // 2240
      obstacles: buildEgyptObstacles(),
      spawnZones: [
        { x:  64,  y:  64,  w: 2752, h: 192  },   // north vestibule
        { x:  64,  y: 320,  w: 832,  h: 1408 },   // west wing
        { x: 1024, y: 320,  w: 832,  h: 1408 },   // center hall
        { x: 1984, y: 320,  w: 832,  h: 1408 },   // east wing
        { x:  64,  y: 1888, w: 2752, h: 288  },   // inner sanctum
      ],
      playerStart: { x: 1440, y: 480 },
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
  function updateGhost(ghost, dt, areaData, areaKey, playerPositions, litIntensity, roomId) {
    if (ghost.identified || ghost.claimedBy !== null) return;

    const { areaWidth, areaHeight, obstacles } = areaData;
    const cfg = PCONFIG[ghost.personality] || PCONFIG.confused;
    const MARGIN = 64;

    // C4 — Awareness state machine
    let nearestPlayerDist = Infinity;
    for (const pp of playerPositions) {
      if (!pp) continue;
      const d = Math.hypot(pp.x - ghost.x, pp.y - ghost.y);
      if (d < nearestPlayerDist) nearestPlayerDist = d;
    }
    let newState = ghost.awarenessState;
    if (nearestPlayerDist <= 180) {
      newState = 'aware';
      ghost.awarenessTimer = 0;
    } else if (nearestPlayerDist <= 400) {
      if (ghost.awarenessState === 'restless') newState = 'dormant';
      else if (ghost.awarenessState !== 'aware') newState = 'dormant';
      ghost.awarenessTimer = 0;
    } else {
      ghost.awarenessTimer += dt;
      if (ghost.awarenessTimer >= 60000) {
        newState = 'restless';
      }
      // don't change state here if still counting up — preserve 'aware' or 'dormant'
    }
    if (newState !== ghost.awarenessState) {
      ghost.awarenessState = newState;
      io.to(roomId).emit('ghost:awareness_change', { ghostIndex: ghost.id, state: newState });
    }

    // C5 — Personality behavioral tells
    ghost.behaviorTimer += dt;
    if (ghost.behaviorActive) {
      ghost.behaviorElapsed += dt;
    }

    if (ghost.personality === 'dramatic') {
      if (!ghost.behaviorActive && ghost.behaviorTimer >= 20000) {
        ghost.behaviorActive = true;
        ghost.behaviorType = 'pose';
        ghost.behaviorElapsed = 0;
        ghost.behaviorTimer = 0;
        if (roomId) io.to(roomId).emit('ghost:dramatic_pose', { ghostIndex: ghost.id });
      }
      if (ghost.behaviorActive && ghost.behaviorElapsed >= 1000) {
        ghost.behaviorActive = false;
        ghost.behaviorType = null;
      }
    }

    if (ghost.personality === 'goofy') {
      if (!ghost.behaviorActive && ghost.behaviorTimer >= 20000) {
        ghost.behaviorActive = true;
        ghost.behaviorType = 'figure8';
        ghost.behaviorElapsed = 0;
        ghost.behaviorTimer = 0;
      }
      if (ghost.behaviorActive && ghost.behaviorElapsed >= 3000) {
        ghost.behaviorActive = false;
        ghost.behaviorType = null;
      }
    }

    if (ghost.personality === 'grumpy') {
      if (!ghost.behaviorActive && ghost.behaviorTimer >= 30000) {
        ghost.behaviorActive = true;
        ghost.behaviorType = 'charge';
        ghost.behaviorElapsed = 0;
        ghost.behaviorTimer = 0;
        // Find nearest player for charge target
        let nearestP = null, nearestD = Infinity;
        for (const pp of playerPositions) {
          if (!pp) continue;
          const d = Math.hypot(pp.x - ghost.x, pp.y - ghost.y);
          if (d < nearestD) { nearestD = d; nearestP = pp; }
        }
        if (nearestP) {
          ghost.targetX = nearestP.x;
          ghost.targetY = nearestP.y;
        }
      }
      if (ghost.behaviorActive && ghost.behaviorElapsed >= 1000) {
        ghost.behaviorActive = false;
        ghost.behaviorType = null;
      }
    }

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

    // C5 shy: steer toward corner when no player nearby
    if (ghost.personality === 'shy' && nearestPlayerDist > 300) {
      const shyCorners = {
        graveyard: { x: 200,  y: 200 },
        garden:    { x: 400,  y: 400 },
        house:     { x: 960,  y: 320 },
        hotel:     { x: 256,  y: 256 },
        egypt:     { x: 512,  y: 256 },
      };
      const corner = shyCorners[areaKey] || shyCorners.graveyard;
      ghost.targetX = corner.x;
      ghost.targetY = corner.y;
    }

    // C5 goofy: figure-8 movement override
    if (ghost.personality === 'goofy' && ghost.behaviorActive && ghost.behaviorType === 'figure8') {
      const t = ghost.behaviorElapsed / 1000;
      const r = 120;
      ghost.x = clamp(ghost.x + Math.cos(t * 2) * r * dt / 1000, MARGIN, areaWidth  - MARGIN);
      ghost.y = clamp(ghost.y + Math.sin(t * 4) * r * dt / 1000, MARGIN, areaHeight - MARGIN);
      // Skip normal movement this tick
    } else {
      // Move toward target
      const dx = ghost.targetX - ghost.x;
      const dy = ghost.targetY - ghost.y;
      const dist = Math.hypot(dx, dy);
      if (dist > 2) {
        let spd = cfg.speed;
        // C4 — restless multiplier
        if (ghost.awarenessState === 'restless') spd *= 1.5;
        if (ghost.personality === 'dramatic' && ghost.sprintActive) spd *= 2;
        if (ghost.personality === 'regal') spd *= 0.7;
        // C5 grumpy: 3× speed during behavior charge
        if (ghost.personality === 'grumpy' && ghost.behaviorActive && ghost.behaviorType === 'charge') spd *= 3;
        spd = Math.min(spd, cfg.speed * 3.5);
        // Flashlight illumination causes ghost to flee faster, capped at player speed
        if (litIntensity > 0.1) spd = Math.min(PLAYER_SPEED, spd * (1 + litIntensity * 2.5));
        const step = Math.min(spd * dt / 1000, dist);
        const nx = ghost.x + (dx / dist) * step;
        const ny = ghost.y + (dy / dist) * step;
        const resolved = resolveObstacle(nx, ny, obstacles, 16);
        ghost.x = clamp(resolved.x, MARGIN, areaWidth  - MARGIN);
        ghost.y = clamp(resolved.y, MARGIN, areaHeight - MARGIN);
      }
    }

    // C5 confused: ±32px jitter each tick, clamped to world bounds
    if (ghost.personality === 'confused') {
      ghost.x = clamp(ghost.x + randomBetween(-32, 32), 0, areaWidth);
      ghost.y = clamp(ghost.y + randomBetween(-32, 32), 0, areaHeight);
    }
  }

  // ─── Signal Computation ───────────────────────────────────────────────────
  // emfRange/soundRange/flashRange already include both avatar and ghost personality multipliers
  function computeSignals(ghost, playerPos, facing, emfRange, soundRange, flashRange) {
    const dx = ghost.x - playerPos.x;
    const dy = ghost.y - playerPos.y;
    const dist = Math.hypot(dx, dy);
    const ghostCfg = PCONFIG[ghost.personality] || PCONFIG.confused;
    const effEmf   = (emfRange   || EMF_RANGE)   * (ghostCfg.emfMult   || 1.0);
    const effSnd   = (soundRange || SOUND_RANGE)  * (ghostCfg.soundMult || 1.0);
    const effFlash = flashRange  || FLASH_RANGE;
    const emf   = Math.max(0, 1 - dist / effEmf);
    const sound  = Math.max(0, 1 - dist / effSnd);
    let flashlight = 0;
    if (dist < effFlash) {
      const gAngle = Math.atan2(dy, dx);
      let diff = Math.abs(gAngle - facing);
      if (diff > Math.PI) diff = 2 * Math.PI - diff;
      if (diff < FLASH_ANGLE) {
        flashlight = (1 - dist / effFlash) * (1 - diff / FLASH_ANGLE);
      }
    }
    // C8 — Temperature: inverse distance clamped 0–1
    const temperature = clamp(1 - dist / Math.max(effEmf, effSnd, effFlash), 0, 1);
    return { emf, sound, flashlight, temperature };
  }

  // ─── Spawn ghosts ─────────────────────────────────────────────────────────
  function spawnGhosts(areaData, count) {
    const ghosts = [];
    const usedPersonalities = [];
    for (let i = 0; i < count; i++) {
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
        // C4 — Awareness state machine
        awarenessState: 'dormant',
        awarenessTimer: 0,
        // C5 — Personality behavioral tells
        behaviorTimer: 0,
        behaviorActive: false,
        behaviorType: null,
        behaviorElapsed: 0,
        // C6 — Haunting flicker timer
        hauntTimer: randomBetween(8000, 15000),
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

      // Track max flashlight intensity per ghost from any player
      const ghostLitIntensity = {};
      for (const ghost of ghosts) ghostLitIntensity[ghost.id] = 0;
      for (const player of state.players) {
        if (player.isAI || !player.ghostPos) continue;
        const facing = player.ghostFacing || 0;
        const avStat = AVATAR_STATS[player.lobbyAvatar || 0] || AVATAR_STATS[0];
        for (const ghost of ghosts) {
          if (ghost.identified) continue;
          const sig = computeSignals(ghost, player.ghostPos, facing, EMF_RANGE, SOUND_RANGE, FLASH_RANGE * avStat.flashMult);
          if (sig.flashlight > (ghostLitIntensity[ghost.id] || 0)) {
            ghostLitIntensity[ghost.id] = sig.flashlight;
          }
        }
      }

      // Update each active ghost AI
      for (const ghost of ghosts) {
        if (!ghost.identified && ghost.claimedBy === null) {
          updateGhost(ghost, dt, areaData, gs.area, playerPositions, ghostLitIntensity[ghost.id] || 0, roomId);
        }
      }

      // Pickup detection
      for (let pi2 = 0; pi2 < state.players.length; pi2++) {
        const player2 = state.players[pi2];
        if (player2.isAI || !player2.ghostPos) continue;
        const pos2 = player2.ghostPos;
        if (gs.keyAvailable && Math.hypot(pos2.x - gs.keyPos.x, pos2.y - gs.keyPos.y) < PICKUP_RANGE) {
          gs.keyAvailable = false;
          gs.keyHolder = pi2;
          io.to(roomId).emit('ghost:key_taken', { playerIndex: pi2 });
        }
        if (gs.powerupAvailable && gs.keyHolder === pi2 &&
            Math.hypot(pos2.x - gs.powerupPos.x, pos2.y - gs.powerupPos.y) < PICKUP_RANGE) {
          gs.powerupAvailable = false;
          gs.emfUpgradedPlayers.add(pi2);
          io.to(roomId).emit('ghost:powerup_taken', { playerIndex: pi2 });
        }
      }

      // Emit signals to each human player; broadcast positions of found ghosts
      for (let pi = 0; pi < state.players.length; pi++) {
        const player = state.players[pi];
        if (player.isAI) continue;

        const playerPos = player.ghostPos || areaData.playerStart;
        const facing    = player.ghostFacing || 0;
        const avStat    = AVATAR_STATS[player.lobbyAvatar || 0] || AVATAR_STATS[0];
        const emfBase   = gs.emfUpgradedPlayers && gs.emfUpgradedPlayers.has(pi) ? EMF_RANGE * 2 : EMF_RANGE;

        // Compute signals for each unfound ghost
        const signals = [];
        let emfDir = null, sndDir = null, maxEmf = 0, maxSnd = 0;
        for (const ghost of ghosts) {
          if (ghost.identified) continue;
          const sig = computeSignals(ghost, playerPos, facing,
            emfBase   * avStat.emfMult,
            SOUND_RANGE * avStat.soundMult,
            FLASH_RANGE * avStat.flashMult);
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

          // Detection: flashlight > 0.22 → found (allows detection across most of the cone range)
          if (!ghost.found && sig.flashlight > 0.22) {
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

        // C3 — Formal Evidence Card System: check thresholds and emit once per player per ghost
        for (const sig of signals) {
          const evidenceSet = gs.evidenceCollected;
          const checkEvidence = (type, value, threshold) => {
            const key = `${type}_${pi}_${sig.ghostId}`;
            if (value > threshold && !evidenceSet.has(key)) {
              evidenceSet.add(key);
              io.to(roomId).emit('ghost:evidence', { type, playerIndex: pi });
            }
          };
          checkEvidence('cold_presence', sig.temperature, 0.6);
          checkEvidence('emf_level5',    sig.emf,         0.75);
          checkEvidence('audible_sounds', sig.sound,      0.75);
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

      // C6 — Light flicker haunting events
      for (const ghost of ghosts) {
        if (ghost.identified) continue;
        ghost.hauntTimer -= dt;
        if (ghost.hauntTimer <= 0) {
          const lightObs = areaData.obstacles.filter(o => o.type === 'lamp' || o.type === 'torch' || o.type === 'candle');
          let nearLight = false;
          for (const ob of lightObs) {
            const ocx = ob.x + ob.w / 2;
            const ocy = ob.y + ob.h / 2;
            if (Math.hypot(ocx - ghost.x, ocy - ghost.y) < 200) { nearLight = true; break; }
          }
          if (nearLight || lightObs.length === 0) {
            io.to(roomId).emit('ghost:haunt_flicker', { ghostIndex: ghost.id });
          }
          ghost.hauntTimer = randomBetween(8000, 15000);
        }
      }

      // C7 — Optional case timer
      if (state.timerOn) {
        gs.elapsedMs = (gs.elapsedMs || 0) + dt;
        gs.timerAccum = (gs.timerAccum || 0) + dt;
        if (gs.timerAccum >= 1000) {
          gs.timerAccum -= 1000;
          io.to(roomId).emit('ghost:timer_update', { elapsed: gs.elapsedMs });
        }
        if (gs.elapsedMs >= 480000) {
          clearAllTimers(gs);
          state.phase = 'ended';
          io.to(roomId).emit('ghost:time_up');
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

  // ─── POI Generation ───────────────────────────────────────────────────────
  function generatePOIs(areaKey, areaData) {
    const pool = (POI_POOLS[areaKey] || POI_POOLS.graveyard).slice();
    // Shuffle
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    const selected = pool.slice(0, 5);
    const zones = areaData.spawnZones;
    return selected.map((p, i) => {
      const zone = zones[i % zones.length];
      // Scatter within zone
      const x = Math.round(zone.x + randomBetween(zone.w * 0.1, zone.w * 0.9));
      const y = Math.round(zone.y + randomBetween(zone.h * 0.1, zone.h * 0.9));
      return { id: i, x, y, title: p.title, text: p.text };
    });
  }

  function randomPickupPos(areaData, excludePos, minExcludeDist) {
    const zones = areaData.spawnZones;
    for (let attempt = 0; attempt < 30; attempt++) {
      const zone = zones[Math.floor(Math.random() * zones.length)];
      const x = Math.round(zone.x + randomBetween(zone.w * 0.15, zone.w * 0.85));
      const y = Math.round(zone.y + randomBetween(zone.h * 0.15, zone.h * 0.85));
      if (!excludePos || Math.hypot(x - excludePos.x, y - excludePos.y) > minExcludeDist) {
        return { x, y };
      }
    }
    const z0 = zones[0];
    return { x: Math.round(z0.x + z0.w / 2), y: Math.round(z0.y + z0.h / 2) };
  }

  // ─── startGame ────────────────────────────────────────────────────────────
  function startGame(state, roomId) {
    // Clear any existing state
    clearAllTimers(state.ghost);

    // Pick area (respect host's selection if valid, otherwise random)
    const areaKeys = ['graveyard', 'garden', 'house', 'hotel', 'egypt'];
    const areaKey  = (state.ghostArea && AREAS[state.ghostArea]) ? state.ghostArea
                   : areaKeys[Math.floor(Math.random() * areaKeys.length)];
    const areaData = AREAS[areaKey];

    // Spawn ghosts
    const ghostCount = (state.ghostCount >= 3 && state.ghostCount <= 5) ? state.ghostCount : 3;
    const ghosts = spawnGhosts(areaData, ghostCount);

    // Generate POIs and pickup positions
    const pois = generatePOIs(areaKey, areaData);
    const keyPos = randomPickupPos(areaData, areaData.playerStart, 500);
    const powerupPos = randomPickupPos(areaData, keyPos, 300);

    // Build state
    state.ghost = {
      area:           areaKey,
      ghosts,
      ouijaTimers:    {},
      tickRef:        null,
      identifiedCount: 0,
      totalGhosts:    ghostCount,
      pois,
      keyPos,
      powerupPos,
      keyAvailable:   true,
      keyHolder:      null,
      powerupAvailable: true,
      emfUpgradedPlayers: new Set(),
      evidenceCollected: new Set(),
      gameEnding: false,
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
        players: state.players.map(p => ({ name: p.name, isAI: p.isAI, avatar: p.lobbyAvatar || 0 })),
        game: 'ghost',
        ghost: {
          area:        areaKey,
          areaWidth:   areaData.areaWidth,
          areaHeight:  areaData.areaHeight,
          obstacles:   areaData.obstacles,
          playerStart: areaData.playerStart,
          ghostCount:  ghostCount,
          bgColor:     areaData.bgColor,
          label:       areaData.label,
          pois,
          keyPos,
          powerupPos,
        },
      });
    });

    startTick(state, roomId);
  }

  // ─── registerEvents ───────────────────────────────────────────────────────
  function registerEvents(socket, rooms) {

    // Player movement
    socket.on('ghost:move', ({ roomId, x, y, facing, avatar, tool }) => {
      const state = rooms.get(roomId);
      if (!state || !state.ghost || state.phase !== 'playing') return;
      const areaData = AREAS[state.ghost.area];
      const playerIndex = state.players.findIndex(p => p.id === socket.id);
      if (playerIndex === -1) return;
      const cx = clamp(x, 0, areaData.areaWidth);
      const cy = clamp(y, 0, areaData.areaHeight);
      state.players[playerIndex].ghostPos    = { x: cx, y: cy };
      state.players[playerIndex].ghostFacing = facing || 0;
      socket.to(roomId).emit('ghost:player_pos', {
        playerIndex, x: cx, y: cy,
        facing: facing || 0,
        avatar: state.players[playerIndex].lobbyAvatar || 0,
        tool: tool || null,
      });
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

      const sequence = buildOuijaSequence(ghost.name.toUpperCase(), ghost.personality);

      socket.emit('ghost:ouija_start', {
        ghostId, sequence,
        personality: ghost.personality, attemptsLeft: 3 - ghost.ouijaAttempts,
      });
    });

    // Submit name guess
    socket.on('ghost:submit_name', ({ roomId, ghostId, name }) => {
      const state = rooms.get(roomId);
      if (!state || !state.ghost || state.phase !== 'playing') return;
      const gs    = state.ghost;
      if (gs.gameEnding) return;
      const ghost = gs.ghosts[ghostId];
      if (!ghost) return;
      const playerIndex = state.players.findIndex(p => p.id === socket.id);
      if (playerIndex === -1) return;

      if ((name || '').trim().toLowerCase() === ghost.name.toLowerCase()) {
        ghost.identified = true;
        ghost.claimedBy  = null;
        gs.identifiedCount++;
        gs.evidenceCollected = new Set();
        const cfg = PCONFIG[ghost.personality] || PCONFIG.confused;
        io.to(roomId).emit('ghost:identified', {
          ghostId, name: ghost.name, personality: ghost.personality,
          color: cfg.color, description: cfg.description, identifiedBy: playerIndex,
        });
        if (gs.identifiedCount >= gs.totalGhosts) {
          gs.gameEnding = true;
          clearAllTimers(gs);
          // C9 — Farewell sequence: emit farewell for each ghost, then end game after 3s
          for (const g of gs.ghosts) {
            io.to(roomId).emit('ghost:farewell', { ghostIndex: g.id });
          }
          setTimeout(() => {
            endGame(state, roomId, playerIndex);
          }, 3000);
        }
      } else {
        // Wrong guess: immediately release claim, increment counter
        ghost.claimedBy = null;
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

    // Player signal ("Come here!")
    socket.on('ghost:signal', ({ roomId }) => {
      const state = rooms.get(roomId);
      if (!state || !state.ghost || state.phase !== 'playing') return;
      const playerIndex = state.players.findIndex(p => p.id === socket.id);
      if (playerIndex === -1) return;
      const pos = state.players[playerIndex].ghostPos;
      if (!pos) return;
      socket.to(roomId).emit('ghost:signal_broadcast', { playerIndex, x: pos.x, y: pos.y });
    });

    // Close board
    socket.on('ghost:close_board', ({ roomId, ghostId }) => {
      const state = rooms.get(roomId);
      if (!state || !state.ghost) return;
      const gs    = state.ghost;
      const ghost = gs.ghosts[ghostId];
      if (!ghost) return;
      const playerIndex = state.players.findIndex(p => p.id === socket.id);
      // Only the player who claimed the board (or a disconnected player) can release it
      if (ghost.claimedBy !== null && ghost.claimedBy !== playerIndex) return;
      ghost.claimedBy = null;
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
        pois:            gs.pois,
        keyPos:          gs.keyPos,
        powerupPos:      gs.powerupPos,
        keyAvailable:    gs.keyAvailable,
        powerupAvailable: gs.powerupAvailable,
        hasKey:          gs.keyHolder === playerIndex,
        hasEMFUpgrade:   gs.emfUpgradedPlayers ? gs.emfUpgradedPlayers.has(playerIndex) : false,
      },
    };
  }

  return { startGame, registerEvents, getReconnectData };
};
