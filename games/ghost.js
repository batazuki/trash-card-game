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

  // ─── Area-specific ghost character rosters ────────────────────────────────
  const AREA_CHARACTERS = {
    egypt: [
      { name: 'Tutankhamun',  personality: 'confused', color: '#d4c050',
        title: 'The Boy King',
        bio_short: 'A restless young pharaoh — barely old enough to reign. He still seems confused about how it ended.',
        bio_full: 'Tutankhamun became pharaoh at age 9 and died mysteriously at 19. His tomb lay undisturbed for 3,000 years until 1922. His mummy showed signs of injury, but whether by accident, illness, or foul play remains debated by historians.' },
      { name: 'Ramesses',     personality: 'regal',    color: '#c87a20',
        title: 'The Great Builder',
        bio_short: 'Slow to move, impossible to ignore. He ruled 66 years and left his name on half of Egypt.',
        bio_full: 'Ramesses II reigned for 66 years, outliving 12 heirs and fathering 96 children. He erected more monuments than any other pharaoh and signed history\'s first known peace treaty with the Hittites. He lived to approximately age 90.' },
      { name: 'Cleopatra',    personality: 'dramatic',  color: '#a050d0',
        title: 'The Last Pharaoh',
        bio_short: 'Theatrical, polyglot, magnificent. She was the last ruler of an ancient dynasty, and she knew it.',
        bio_full: 'Cleopatra VII spoke nine languages and was the first Ptolemaic ruler to learn Egyptian. Her alliances with Julius Caesar and Mark Antony reshaped the Mediterranean world. After her death, Egypt became a Roman province — ending three millennia of pharaonic rule.' },
      { name: 'Akhenaten',    personality: 'confused',  color: '#d08030',
        title: 'The Heretic Pharaoh',
        bio_short: 'He stares at walls where his temples once stood. He abolished the old gods and was erased from history for it.',
        bio_full: 'Akhenaten dismantled Egypt\'s entire religious order, replacing its pantheon with sole worship of the Aten sun disk. After his death, his successors erased his name from every monument and record. Archaeologists only rediscovered him in the 19th century.' },
      { name: 'Hatshepsut',   personality: 'regal',    color: '#b87848',
        title: 'The Female Pharaoh',
        bio_short: 'Dignified and unhurried, she carries herself like the ruler she was — despite all attempts to pretend otherwise.',
        bio_full: 'Hatshepsut ruled Egypt for over 20 years, wearing the double crown and ceremonial beard of tradition. After her death, her stepson systematically erased her image from monuments. She was lost to history for 3,000 years before Egyptologists pieced together who she was.' },
      { name: 'Thutmose',     personality: 'grumpy',   color: '#906030',
        title: 'The Napoleon of Egypt',
        bio_short: 'Irritable, impatient. He fought seventeen campaigns and never lost — and now he waits here, furious about it.',
        bio_full: 'Thutmose III led 17 successful military campaigns, expanding Egypt to its greatest territorial extent. He is often called the greatest military commander of the ancient world. He also spent years systematically erasing Hatshepsut from the historical record.' },
      { name: 'Nefertiti',    personality: 'shy',      color: '#40a8b8',
        title: 'The Beloved One',
        bio_short: 'She retreats from the light. Once the most depicted queen in Egypt, she vanished from all records mid-reign.',
        bio_full: 'Nefertiti was co-ruler with Akhenaten during Egypt\'s religious revolution. Her painted limestone bust is among the most recognizable works of ancient art. Then, midway through Akhenaten\'s reign, she simply vanishes from all records. No one knows why.' },
      { name: 'Amenhotep',    personality: 'dramatic',  color: '#d8a018',
        title: 'The Magnificent',
        bio_short: 'Theatrical and opulent. He built on a scale that awed even later pharaohs — and declared himself a god mid-reign.',
        bio_full: 'Amenhotep III presided over Egypt at its wealthiest peak, commissioning the Colossi of Memnon and hundreds of statues of himself. He styled himself as a living divine being — the Horus on Earth — a bold theological claim even by pharaonic standards.' },
    ],
    hotel: [
      { name: 'Harold',   personality: 'shy',      color: '#8090c0',
        title: 'Head Bellhop, 1952–1979',
        bio_short: 'You sense someone hovering near the entrance, arms full of luggage that no one else can see.',
        bio_full: 'Harold worked the main entrance for 27 years. He knew every returning guest by name, every room\'s quirks, and where the ice machine on Floor 4 made that noise. He died of a stroke in Room 112 during the winter of 1979 — on his lunch break.' },
      { name: 'Doris',    personality: 'grumpy',   color: '#c09080',
        title: 'Head Housekeeper, 1961–1989',
        bio_short: 'The pillows are wrong. The towels are wrong. Everything is wrong. She has very specific opinions about corners.',
        bio_full: 'Doris ran housekeeping with military precision for 28 years. She trained 140 staff members and was personally responsible for the hotel\'s four-star rating in 1973. She still appears in hallways at 6am, apparently checking whether sheets have been properly tucked.' },
      { name: 'Vincent',  personality: 'dramatic',  color: '#c84040',
        title: 'Executive Chef, 1968–1971',
        bio_short: 'A grand, theatrical presence from the kitchen corridor. Something smells faintly of garlic and copper.',
        bio_full: 'Vincent arrived from Lyon in 1968 with extraordinary credentials and an even more extraordinary ego. He died during dinner service on November 14, 1971 — mid-instruction, mid-sentence. The soufflé he was demonstrating reportedly collapsed at the same moment.' },
      { name: 'Margot',   personality: 'confused',  color: '#a090c8',
        title: 'Telephone Operator, 1955–1972',
        bio_short: 'A voice tries to connect you somewhere. The line is full of static. She\'s not sure the number still exists.',
        bio_full: 'Margot sat at the hotel switchboard for 17 years, connecting guests with unfailing patience. She passed quietly in 1972, the year the switchboard was replaced. Guests still occasionally report hearing soft crackling from the old telephone alcove, followed by a woman\'s voice asking who they\'d like to reach.' },
      { name: 'Chester',  personality: 'grumpy',   color: '#607090',
        title: 'Night Porter, 1963–1988',
        bio_short: 'He\'s seen too much to be surprised — and not enough sleep to be pleasant about any of it.',
        bio_full: 'Chester worked nights for 25 years, six days a week. His incident log runs to fourteen handwritten volumes. He catalogued every unusual report and anomaly, then wrote "Unknown" in the resolution column with increasing frequency after 1974.' },
      { name: 'Estelle',  personality: 'goofy',    color: '#e878a0',
        title: 'Ballroom Waitress, 1959–1965',
        bio_short: 'She\'s still dancing between the tables. The music she\'s dancing to hasn\'t been played since 1965.',
        bio_full: 'Estelle worked New Year\'s Eve 1959 through 1964, the golden age of the ballroom. Famous for balancing six glasses and a smile simultaneously. She quit abruptly in 1965 after an incident that put three guests in the hospital. She never explained why.' },
      { name: 'Edmund',   personality: 'shy',      color: '#7090a8',
        title: 'Elevator Operator, 1948–1967',
        bio_short: 'You sense someone standing very still, facing forward, waiting for you to state your floor.',
        bio_full: 'Edmund operated Elevator B for 19 years, pressing the same brass button thousands of times a day. Known for rarely speaking unless spoken to. After his 1967 retirement, Elevator B began stopping at floors on its own. Edmund died in 1969. The elevator was decommissioned in 1971.' },
      { name: 'Sylvia',   personality: 'regal',    color: '#b8a8d0',
        title: 'Chief Concierge, 1970–1997',
        bio_short: 'She knows exactly what you need before you\'ve asked. She always knew. Her knowledge of this building is absolute.',
        bio_full: 'Sylvia served as chief concierge for 27 years, memorising the preferences of over 4,000 repeat guests. She quietly resolved fourteen incidents that never appeared in the hotel records. She still roams the lobby, apparently unable to stop being helpful.' },
    ],
    house: [
      { name: 'Cornelius', personality: 'regal',    color: '#c0b0a0',
        title: 'Patriarch of Blackwood House',
        bio_short: 'He stands at the center of every room like he still owns it. He does, technically, in every way that matters.',
        bio_full: 'Cornelius Blackwood built the house in 1842 and lived in it for 58 years — barrister, magistrate, amateur archaeologist. He wrote extensively about the east wing in his journals. The journals end abruptly in 1897. No explanation was given.' },
      { name: 'Agnes',     personality: 'dramatic',  color: '#d0a0b8',
        title: 'Matriarch of Blackwood House',
        bio_short: 'She was never quiet in life. In death she is somehow louder. You can feel her disapproval across the hall.',
        bio_full: 'Agnes ran the household with impeccable social precision, renowned for her dinner parties and strong opinions on furniture. She outlived Cornelius by 11 years and continued hosting guests until the very end. She did not approve of the east wing. She made this clear repeatedly.' },
      { name: 'Thomas',    personality: 'confused',  color: '#a8b8c0',
        title: 'Youngest Son of the Blackwoods',
        bio_short: 'He wanders through rooms he used to know. He\'s not sure what year it is — or whether that matters anymore.',
        bio_full: 'Thomas was the family\'s youngest child, brilliant at mathematics and terrible at everything else. He went to university in 1891 and returned two years later — changed, by all accounts. His room was sealed in 1894. No one from his letters ever wrote back to explain what happened.' },
      { name: 'Eliza',     personality: 'shy',      color: '#b8c0b0',
        title: 'Governess, 1873–1888',
        bio_short: 'She keeps to the corners. She\'s been keeping to the corners for a very long time — it was safer that way.',
        bio_full: 'Eliza governed the Blackwood children for 15 years with quiet dignity and firm patience. She left suddenly in 1888 without collecting her final month\'s wages. Her forwarding address was never provided. The children she taught never spoke of her departure.' },
      { name: 'Samuel',    personality: 'grumpy',   color: '#787060',
        title: 'Butler, 1860–1899',
        bio_short: 'His disapproval is tangible. He finds your presence irregular. He finds most things irregular.',
        bio_full: 'Samuel Grist served the Blackwood household for 39 years, outlasting four cooks, nine maids, and one full exorcism attempt in 1892 (which he described in his diary as "undignified"). He died at his post in 1899, three days before his scheduled retirement.' },
      { name: 'Harriet',   personality: 'goofy',    color: '#d0a870',
        title: 'Cook, 1878–1895',
        bio_short: 'Something is burning. It was always slightly burning. She was delightful about it every single time.',
        bio_full: 'Harriet was beloved by the household staff and a source of diplomatic tension for formal guests. Her cooking was enthusiastic rather than precise. She once fed the vicar something she described as "mostly gravy" and refused to specify further. She left in 1895 to open a boarding house.' },
      { name: 'Rose',      personality: 'shy',      color: '#c8b0c0',
        title: 'Housemaid, 1885–1890',
        bio_short: 'She moves very carefully, afraid of making sound. She was always afraid of making sound.',
        bio_full: 'Rose worked as housemaid for five years before leaving without notice in 1890, noted in records only as "personal circumstances." She is the only former staff member known to have refused wages owed to her. She asked only that a particular room on the upper floor be locked.' },
      { name: 'Phineas',   personality: 'regal',    color: '#a8b8a8',
        title: 'Family Physician, 1871–1901',
        bio_short: 'He carries himself with the authority of a man who has seen everything. He has. He wishes he hadn\'t.',
        bio_full: 'Dr. Croft attended the Blackwood family for thirty years. He filed one death certificate where the cause-of-death column contains only a question mark. He described six medical incidents in his notes only as "anomalous." He then moved to another county without further explanation.' },
    ],
    garden: [
      { name: 'Grumbold',  personality: 'grumpy',   color: '#607840',
        title: 'Self-Appointed Warden of the Third Hedgerow',
        bio_short: 'You have stepped on something. He knows. He will not forgive you.',
        bio_full: 'Grumbold designated himself Official Warden of the Third Hedgerow in 1987 and has enforced this role ever since, despite no one else acknowledging it. His jurisdiction extends, in his view, to "anywhere he can see from the hedgerow, which is further than you\'d think." He logs trespasses in a tiny waterproof notebook.' },
      { name: 'Pippin',    personality: 'goofy',    color: '#a87840',
        title: 'Champion Mushroom Finder (Disputed)',
        bio_short: 'You hear a tiny cheer from somewhere near the ground. Something has been found and it is very exciting.',
        bio_full: 'Pippin holds the garden record for mushrooms found — 847 by his own count. Gerald the neighbouring gnome claims the actual total is "considerably fewer, because some of those were rocks." Pippin considers this a difference of opinion. He is very proud of the rocks too.' },
      { name: 'Brixie',    personality: 'dramatic',  color: '#d86890',
        title: 'Her Royal Highness, Probably',
        bio_short: 'She enters every space like it was arranged for her arrival — and she has opinions about whether it was done properly.',
        bio_full: 'Brixie insists she is descended from garden royalty and carries herself accordingly. The other gnomes have been unable to confirm this due to lack of documentation and Brixie\'s insistence that "the documentation is in her head, which is even more official." She wears a found stone as a crown. It is a very good stone.' },
      { name: 'Fern',      personality: 'confused',  color: '#88b870',
        title: 'Perpetually Lost',
        bio_short: 'She\'s not sure where she is, or where she came from. She seems genuinely cheerful about this.',
        bio_full: 'Fern has been lost in this garden since approximately 1994. She knows it is a garden because there are plants, which she finds reassuring. She has been given directions home seventeen times. Each time she thanks the giver sincerely, sets off confidently, and reappears six minutes later from a completely different direction.' },
      { name: 'Nig',       personality: 'shy',      color: '#90a860',
        title: 'Acorn Hoarder, Butterfly Avoider',
        bio_short: 'He\'s under a leaf. You\'ve frightened him. You probably didn\'t mean to, but here we are.',
        bio_full: 'Nig has collected 1,240 acorns which he calls his "emergency fund." He is terrified of butterflies ("unpredictable, too many wings for their size") and suspicious of squirrels ("known associates"). He has never been to the other side of the garden despite living here for thirty years. It\'s too far.' },
      { name: 'Dolt',      personality: 'goofy',    color: '#b89070',
        title: 'Founder, Institute of Interesting Rocks',
        bio_short: 'He\'s found something incredible. He wants to show you. You cannot tell if it is incredible.',
        bio_full: 'Dolt founded the Institute of Interesting Rocks (current membership: 1) after discovering a rock described as "basically triangular, very unusual." His collection stands at 212 rocks, each catalogued in a system only Dolt understands. He insists they are all different. Several are the same rock.' },
      { name: 'Maude',     personality: 'regal',    color: '#c0a888',
        title: 'The One Who Knows Everything',
        bio_short: 'She already knows why you\'re here. She knew before you arrived. She will bring it up at the appropriate moment.',
        bio_full: 'Maude is the uncontested social authority of the garden, obtained through longevity, an excellent memory, and strategic deployment of what she knows about everyone. She insists she has never gossiped — only "shared relevant context." The other gnomes do not dispute this to her face.' },
      { name: 'Reginald',  personality: 'dramatic',  color: '#c07850',
        title: 'Keeper of the Grand Mushroom Ceremony',
        bio_short: 'He insists on a formal introduction. He has prepared remarks. The remarks are long.',
        bio_full: 'Reginald created the Grand Mushroom Ceremony in 2003 to "properly mark the discovery of significant fungi." The ceremony involves a speech (minimum twelve minutes), a ceremonial bow, and a period of respectful silence. He has performed it 63 times. The other gnomes stopped attending after the fourth.' },
    ],
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
    hotel_basement: [
      { title: 'Service Elevator Log', text: '"Car malfunction, Sept 14 1978. Elevator C failed to stop at B1. Car reached sub-basement. No survivors were using the elevator at the time." The last sentence has been crossed out and rewritten three times.' },
      { title: 'Maintenance Notice',   text: '"The smell is normal. Do not investigate the smell." — Posted June 14, 1983. No other entries in this log.' },
      { title: 'Boiler Room Warning',  text: '"Boiler 3 has been out of service since 1969. If you hear it running, leave immediately and do not look back." — Chief Engineer, retired 1971.' },
      { title: 'Wine Cellar Inventory', text: '"Château Morrow, 1961 — 48 bottles. Winery closed 1963, estate demolished 1964. Labels describe a vineyard that never existed."' },
      { title: 'Rusted Padlock',       text: '"Keys to Storage Room B. Do NOT open Storage Room B." The padlock was open when you arrived. The keys are missing.' },
      { title: 'Wall Scratches',       text: 'Tally marks, hundreds of them. Neat at first, then increasingly frantic. The last ones are long horizontal strokes, scratched across twelve verticals at once.' },
      { title: 'Maintenance Clipboard', text: '"Monday: replaced the candles. Tuesday: replaced the candles. Wednesday: DO NOT REPLACE THE CANDLES." No entries after Wednesday.' },
      { title: 'Cold Room Thermometer', text: '"Must remain above 35°F at all times." Current reading: 24°F. The refrigeration unit has been disconnected since 1971. There is no power source in this room.' },
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
    // Gravestones (rounded tombstone variant)
    obs.push(rect(16,9,1,2,'gravestone'),rect(20,9,1,2,'gravestone'),rect(32,22,1,2,'gravestone'));
    obs.push(rect(46,38,1,2,'gravestone'),rect(50,43,1,2,'gravestone'));
    // Coffins near mausoleum
    obs.push(rect(5,5,2,1,'coffin'),rect(5,7,2,1,'coffin'));
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
    // Basement coffins
    obs.push(rect(7,43,2,2,'coffin'),rect(7,47,2,2,'coffin'));
    // Basement storage
    obs.push(rect(35,44,2,2,'crate'),rect(38,44,2,2,'crate'),rect(41,44,2,1,'crate'));
    obs.push(rect(35,48,2,2,'barrel'),rect(38,48,2,2,'barrel'));
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

    // ── SERVICE ELEVATOR to basement (lower bar section, x=33–36, y=74–76) ──
    obs.push(rect(33,74,4,3,'elevator_b'));

    // ── BASEMENT (tiles y=84–131, px y=2688–4192) ────────────────────────────
    // North wall: gap at x=33–37 for elevator shaft
    obs.push(rect(0,84,33,1,'stone'), rect(37,84,43,1,'stone'));
    // South wall
    obs.push(rect(0,131,80,1,'stone'));
    // Basement side walls
    obs.push(rect(0,84,1,48,'stone'), rect(79,84,1,48,'stone'));
    // Horizontal divider at y=96: gaps at x=18–22, x=33–37, x=57–61
    obs.push(rect(1,96,17,1,'stone'), rect(22,96,11,1,'stone'), rect(37,96,20,1,'stone'), rect(61,96,18,1,'stone'));
    // Vertical room dividers: x=22 (wine/boiler) and x=57 (boiler/cold)
    // Passage in each at y=115–119 for interconnection
    obs.push(rect(22,97,1,18,'stone'), rect(22,119,1,12,'stone'));
    obs.push(rect(57,97,1,18,'stone'), rect(57,119,1,12,'stone'));

    // ── WINE CELLAR (x=1–21, y=97–131) ────────────────────────────────────────
    obs.push(rect(2,98,4,2,'barrel'), rect(7,98,4,2,'barrel'), rect(12,98,4,2,'barrel'));
    obs.push(rect(2,102,4,2,'barrel'), rect(7,102,4,2,'barrel'), rect(12,102,4,2,'barrel'));
    obs.push(rect(2,106,4,2,'barrel'), rect(7,106,4,2,'barrel'), rect(12,106,4,2,'barrel'));
    obs.push(rect(14,98,6,5,'crate'), rect(14,105,6,5,'crate'), rect(14,112,6,4,'crate'));
    obs.push(rect(2,112,11,1,'shelf'), rect(2,116,11,1,'shelf'), rect(2,120,11,1,'shelf'));
    obs.push(rect(4,123,8,4,'table'));
    obs.push(rect(13,122,7,8,'coffin'));

    // ── BOILER ROOM (x=23–56, y=97–131) ───────────────────────────────────────
    obs.push(rect(27,101,7,9,'boiler'), rect(43,101,7,9,'boiler'));
    // Horizontal pipes
    obs.push(rect(25,100,2,1,'pipe'), rect(34,100,9,1,'pipe'), rect(50,100,2,1,'pipe'));
    obs.push(rect(25,110,2,1,'pipe'), rect(34,110,9,1,'pipe'), rect(50,110,2,1,'pipe'));
    // Vertical pipe connectors
    obs.push(rect(26,100,1,2,'pipe'), rect(34,100,1,2,'pipe'), rect(42,100,1,2,'pipe'), rect(50,100,1,2,'pipe'));
    obs.push(rect(24,121,8,3,'crate'), rect(45,121,8,3,'crate'));
    obs.push(rect(33,122,11,4,'table'));
    obs.push(rect(35,128,10,2,'coffin'));

    // ── COLD STORAGE (x=58–78, y=97–131) ──────────────────────────────────────
    obs.push(rect(59,98,3,5,'locker'), rect(63,98,3,5,'locker'), rect(67,98,3,5,'locker'), rect(71,98,3,5,'locker'));
    obs.push(rect(59,105,3,5,'locker'), rect(63,105,3,5,'locker'), rect(67,105,3,5,'locker'), rect(71,105,3,5,'locker'));
    obs.push(rect(59,112,3,4,'locker'), rect(63,112,3,4,'locker'));
    obs.push(rect(68,112,9,2,'shelf'), rect(68,116,9,2,'shelf'), rect(68,120,9,2,'shelf'));
    obs.push(rect(59,118,7,4,'table'));
    obs.push(rect(59,124,18,1,'shelf'), rect(59,128,18,1,'shelf'));
    obs.push(rect(59,122,12,8,'coffin'));

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
      areaWidth:  80 * T,   // 2560
      areaHeight: 132 * T,  // 4224 (extended for basement)
      obstacles: buildHotelObstacles(),
      spawnZones: [
        { x:  96, y:  512, w: 416, h: 384 },  // wing A rooms
        { x: 1984, y:  512, w: 416, h: 384 }, // wing B rooms
        { x:  704, y:  512, w: 896, h: 640 }, // ballroom area
        { x:  704, y: 1280, w: 896, h: 512 }, // pool area
        { x:  128, y: 1984, w: 512, h: 512 }, // lower section left
        { x: 1280, y: 1984, w: 896, h: 512 }, // lower section right
        // Basement spawn zones (tagged basement:true)
        { x:  128, y: 3072, w: 512, h: 704, basement: true }, // wine cellar / boiler west
        { x:  896, y: 2880, w: 768, h: 896, basement: true }, // center boiler room
        { x: 1792, y: 3072, w: 512, h: 704, basement: true }, // cold storage east
      ],
      playerStart:        { x: 1280,  y: 520  },
      basementStart:      { x: 1120,  y: 2816 },
      serviceElevatorPos: { x: 33*32, y: 74*32, w: 4*32, h: 3*32 }, // matches rect(33,74,4,3,'elevator_b')
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
      newState = 'dormant';
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
        if (roomId) io.to(roomId).emit('ghost:dramatic_pose', { ghostIndex: ghost.id, color: ghost.color });
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
      let corner = shyCorners[areaKey] || shyCorners.graveyard;
      if (areaKey === 'hotel' && ghost.floor === 'basement') {
        corner = { x: 256, y: 3200 }; // basement west corner
      }
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

    // Hotel: clamp ghosts to their respective floor so they don't wander through the shaft
    if (areaKey === 'hotel') {
      if (ghost.floor === 'basement') {
        ghost.y = clamp(ghost.y, 84 * T + MARGIN, areaHeight - MARGIN);
      } else {
        ghost.y = clamp(ghost.y, MARGIN, 79 * T - MARGIN);
      }
    }
  }

  // ─── Signal Computation ───────────────────────────────────────────────────
  // emfRange/soundRange/flashRange already include both avatar and ghost personality multipliers
  // playerTool (optional): when provided, gates which signal values are non-zero
  function computeSignals(ghost, playerPos, facing, emfRange, soundRange, flashRange, playerTool) {
    const dx = ghost.x - playerPos.x;
    const dy = ghost.y - playerPos.y;
    const dist = Math.hypot(dx, dy);
    const ghostCfg = PCONFIG[ghost.personality] || PCONFIG.confused;
    const effEmf   = (emfRange   || EMF_RANGE)   * (ghostCfg.emfMult   || 1.0);
    const effSnd   = (soundRange || SOUND_RANGE)  * (ghostCfg.soundMult || 1.0);
    const effFlash = flashRange  || FLASH_RANGE;
    const emfRaw   = Math.max(0, 1 - dist / effEmf);
    const soundRaw = Math.max(0, 1 - dist / effSnd);
    let flashlightRaw = 0;
    if (dist < effFlash) {
      const gAngle = Math.atan2(dy, dx);
      let diff = Math.abs(gAngle - facing);
      if (diff > Math.PI) diff = 2 * Math.PI - diff;
      if (diff < FLASH_ANGLE) {
        flashlightRaw = (1 - dist / effFlash) * (1 - diff / FLASH_ANGLE);
      }
    }
    // C8 — Temperature: inverse distance clamped 0–1 (always computed, not tool-gated)
    const temperature = clamp(1 - dist / Math.max(effEmf, effSnd, effFlash), 0, 1);
    // Gate signal values by player's active tool when specified
    let emf = emfRaw, sound = soundRaw, flashlight = flashlightRaw;
    if (playerTool === 'flashlight') {
      emf = 0; sound = 0;
    } else if (playerTool === 'emf') {
      sound = 0; flashlight = 0;
    } else if (playerTool === 'microphone') {
      emf = 0; flashlight = 0;
    } else if (playerTool !== undefined && playerTool !== null) {
      // Unknown or missing tool — return all zeros for detection signals
      emf = 0; sound = 0; flashlight = 0;
    }
    return { emf, sound, flashlight, temperature };
  }

  // ─── Spawn ghosts ─────────────────────────────────────────────────────────
  // prebuiltRoster: pre-sliced character array, bypasses area lookup (used to
  //   avoid duplicate characters when hotel splits across main/basement floors)
  function spawnGhosts(spawnZones, count, startId = 0, area = null, prebuiltRoster = null) {
    const ghosts = [];
    const usedPersonalities = [];

    // Build shuffled roster: prebuiltRoster > area lookup > null (random names)
    let roster = prebuiltRoster;
    if (!roster && area && AREA_CHARACTERS[area]) {
      roster = [...AREA_CHARACTERS[area]];
      for (let ri = roster.length - 1; ri > 0; ri--) {
        const rj = Math.floor(Math.random() * (ri + 1));
        [roster[ri], roster[rj]] = [roster[rj], roster[ri]];
      }
    }

    for (let i = 0; i < count; i++) {
      let personality, name, title = null, bio_short = null, bio_full = null, charColor = null;

      if (roster && i < roster.length) {
        const char = roster[i];
        personality = char.personality;
        name        = char.name;
        title       = char.title;
        bio_short   = char.bio_short;
        bio_full    = char.bio_full;
        charColor   = char.color;
      } else {
        do {
          personality = PERSONALITIES[Math.floor(Math.random() * PERSONALITIES.length)];
        } while (usedPersonalities.includes(personality) && usedPersonalities.length < PERSONALITIES.length);
        name = randomName(personality);
      }
      usedPersonalities.push(personality);

      const pos  = randomSpawn(spawnZones);
      const cfg  = PCONFIG[personality];

      ghosts.push({
        id: startId + i,
        personality,
        name,
        title,
        bio_short,
        bio_full,
        color: charColor || cfg.color,
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
            FLASH_RANGE * avStat.flashMult,
            player.tool || 'flashlight');
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
              title:       ghost.title,
              bio_short:   ghost.bio_short,
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
          io.to(roomId).emit('ghost:timer_update', { remainingMs: Math.max(0, 480000 - gs.elapsedMs) });
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
    if (gs.levelVoteTimer) { clearTimeout(gs.levelVoteTimer); gs.levelVoteTimer = null; }
    if (gs.elevator && gs.elevator.activateTimer) {
      clearTimeout(gs.elevator.activateTimer);
      gs.elevator.activateTimer = null;
    }
  }

  // ─── Level Vote ───────────────────────────────────────────────────────────
  const VOTE_AREA_KEYS = ['graveyard', 'garden', 'house', 'hotel', 'egypt'];
  const VOTE_DURATION_MS = 15000;

  function startLevelVote(state, roomId) {
    const gs = state.ghost;
    gs.levelVote = { votes: {} };
    io.to(roomId).emit('ghost:vote_start', {
      areas:       VOTE_AREA_KEYS,
      areaLabels:  VOTE_AREA_KEYS.map(k => AREAS[k].label),
      currentArea: gs.area,
      durationMs:  VOTE_DURATION_MS,
    });
    gs.levelVoteTimer = setTimeout(() => resolveLevelVote(state, roomId), VOTE_DURATION_MS);
  }

  function resolveLevelVote(state, roomId) {
    const gs = state.ghost;
    if (!gs.levelVote) return;
    if (gs.levelVoteTimer) { clearTimeout(gs.levelVoteTimer); gs.levelVoteTimer = null; }
    // Guard: room may have ended (all players quit) while vote was pending
    if (state.phase !== 'playing') { gs.levelVote = null; return; }

    const counts = Object.fromEntries(VOTE_AREA_KEYS.map(a => [a, 0]));
    for (const v of Object.values(gs.levelVote.votes)) {
      if (counts[v] !== undefined) counts[v]++;
    }
    const maxVotes = Math.max(...Object.values(counts));
    const tied = VOTE_AREA_KEYS.filter(a => counts[a] === maxVotes);
    const winner = tied[Math.floor(Math.random() * tied.length)];

    gs.levelVote = null;
    state.ghostArea = winner;
    io.to(roomId).emit('ghost:vote_result', { winner, counts });
    setTimeout(() => startGame(state, roomId), 3000);
  }

  // ─── POI Generation ───────────────────────────────────────────────────────
  function generatePOIs(areaKey, zones, count = 5, idOffset = 0) {
    const pool = (POI_POOLS[areaKey] || POI_POOLS.graveyard).slice();
    // Shuffle
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    const selected = pool.slice(0, count);
    return selected.map((p, i) => {
      const zone = zones[i % zones.length];
      const x = Math.round(zone.x + randomBetween(zone.w * 0.1, zone.w * 0.9));
      const y = Math.round(zone.y + randomBetween(zone.h * 0.1, zone.h * 0.9));
      return { id: idOffset + i, x, y, title: p.title, text: p.text };
    });
  }

  function randomPickupPos(zones, excludePos, minExcludeDist) {
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

  // ─── triggerElevator ──────────────────────────────────────────────────────
  function triggerElevator(state, roomId) {
    const gs = state.ghost;
    if (!gs || !gs.elevator) return;
    gs.elevator.activated = true;
    gs.noRespawn = true;
    // Signal cutscene start (5 second animation)
    io.to(roomId).emit('ghost:floor_transition', { durationMs: 6000 });
    // After cutscene, teleport all players to basement
    setTimeout(() => {
      if (!state.ghost) return;
      const areaData = AREAS[gs.area];
      const bStart = areaData.basementStart;
      for (const player of state.players) {
        player.ghostPos = { x: bStart.x, y: bStart.y };
      }
      io.to(roomId).emit('ghost:floor_arrived', { playerStart: bStart });
    }, 6000);
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

    // Spawn ghosts — hotel splits ghosts across main floor and basement
    const ghostCount = (state.ghostCount >= 3 && state.ghostCount <= 5) ? state.ghostCount : 3;
    let ghosts;
    let hotelElevator = null;
    let mainFloorCount = ghostCount;

    if (areaKey === 'hotel') {
      const mainFloorZones = areaData.spawnZones.filter(z => !z.basement);
      const basementZones  = areaData.spawnZones.filter(z =>  z.basement);
      mainFloorCount       = ghostCount >= 5 ? 3 : 2;
      const basementCount  = ghostCount - mainFloorCount;
      // Pre-shuffle hotel roster once so main/basement floors get different characters
      let hotelRoster = null;
      if (AREA_CHARACTERS.hotel) {
        hotelRoster = [...AREA_CHARACTERS.hotel];
        for (let ri = hotelRoster.length - 1; ri > 0; ri--) {
          const rj = Math.floor(Math.random() * (ri + 1));
          [hotelRoster[ri], hotelRoster[rj]] = [hotelRoster[rj], hotelRoster[ri]];
        }
      }
      const mainGhosts     = spawnGhosts(mainFloorZones, mainFloorCount, 0,              null, hotelRoster ? hotelRoster.slice(0, mainFloorCount) : null);
      const basementGhosts = spawnGhosts(basementZones,  basementCount,  mainFloorCount, null, hotelRoster ? hotelRoster.slice(mainFloorCount)     : null);
      basementGhosts.forEach(g => { g.floor = 'basement'; });
      mainGhosts.forEach(g => { g.floor = 'main'; });
      ghosts = [...mainGhosts, ...basementGhosts];
      hotelElevator = {
        unlocked: false,
        insidePlayers: new Set(),
        activating: false,
        activateTimer: null,
        activated: false,
      };
    } else {
      ghosts = spawnGhosts(areaData.spawnZones, ghostCount, 0, areaKey);
    }

    // Generate POIs and pickup positions
    const mainZones = areaData.spawnZones.filter(z => !z.basement);
    let pois;
    if (areaKey === 'hotel') {
      const basementZones = areaData.spawnZones.filter(z => z.basement);
      const mainPois      = generatePOIs('hotel',          mainZones,    5, 0);
      const bPois         = generatePOIs('hotel_basement', basementZones, 3, 5);
      pois = [...mainPois, ...bPois];
    } else {
      pois = generatePOIs(areaKey, mainZones, 5, 0);
    }
    const keyPos    = randomPickupPos(mainZones, areaData.playerStart, 500);
    const powerupPos = randomPickupPos(mainZones, keyPos, 300);

    // Build state
    state.ghost = {
      area:           areaKey,
      ghosts,
      ouijaTimers:    {},
      tickRef:        null,
      identifiedCount: 0,
      totalGhosts:    ghostCount,
      mainFloorCount,
      mainFloorIdentified: 0,
      elevator:       hotelElevator,
      noRespawn:      false,
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

    // Init each player's position / facing / tool
    for (const player of state.players) {
      player.ghostPos    = { x: areaData.playerStart.x, y: areaData.playerStart.y };
      player.ghostFacing = 0;
      player.tool        = 'flashlight';
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
          hotelElevator: areaKey === 'hotel' ? {
            serviceElevatorPos: areaData.serviceElevatorPos,
            mainFloorCount,
          } : null,
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
      if (tool !== undefined) state.players[playerIndex].tool = tool;
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
          color: ghost.color, description: cfg.description, identifiedBy: playerIndex,
          title: ghost.title, bio_full: ghost.bio_full,
        });

        // Hotel: track main-floor identifies → elevator unlock
        if (gs.area === 'hotel' && ghost.floor !== 'basement' && gs.elevator && !gs.elevator.unlocked) {
          gs.mainFloorIdentified = (gs.mainFloorIdentified || 0) + 1;
          if (gs.mainFloorIdentified >= gs.mainFloorCount) {
            gs.elevator.unlocked = true;
            io.to(roomId).emit('ghost:elevator_unlocked', {
              message: 'A deep rumble shakes the walls. Somewhere below, the service elevator groans to life...',
            });
          }
        }

        if (gs.identifiedCount >= gs.totalGhosts) {
          gs.gameEnding = true;
          clearAllTimers(gs);
          // Farewell sequence, then level vote
          for (const g of gs.ghosts) {
            io.to(roomId).emit('ghost:farewell', { ghostId: g.id, x: g.x, y: g.y, color: g.color });
          }
          setTimeout(() => startLevelVote(state, roomId), 2500);
        }
      } else {
        // Wrong guess: immediately release claim, increment counter
        ghost.claimedBy = null;
        ghost.ouijaAttempts++;
        io.to(roomId).emit('ghost:released', { ghostId });

        if (ghost.ouijaAttempts >= 3) {
          if (!gs.noRespawn) {
            // Ghost flees to a new location and resets
            const areaData = AREAS[gs.area];
            const floorZones = areaData.spawnZones.filter(z =>
              ghost.floor === 'basement' ? z.basement : !z.basement
            );
            const spawnPool = floorZones.length ? floorZones : areaData.spawnZones;
            const newPos = randomSpawn(spawnPool);
            ghost.x = newPos.x; ghost.y = newPos.y;
            ghost.targetX = newPos.x; ghost.targetY = newPos.y;
            ghost.found = false; ghost.ouijaAttempts = 0; ghost.stateTimer = 0;
            io.to(roomId).emit('ghost:respawn', { ghostId, personality: ghost.personality, color: ghost.color });
            socket.emit('ghost:wrong_name', { ghostId, attemptsLeft: 0, respawned: true });
          } else {
            // Basement mode: release claim without respawning
            // (ghost:released already emitted above; just reset attempts)
            ghost.ouijaAttempts = 0;
            socket.emit('ghost:wrong_name', { ghostId, attemptsLeft: 0, respawned: false });
          }
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
    socket.on('ghost:vote_level', ({ roomId, area }) => {
      const state = rooms.get(roomId);
      if (!state || !state.ghost || !state.ghost.levelVote) return;
      if (!VOTE_AREA_KEYS.includes(area)) return;
      const playerIndex = state.players.findIndex(p => p.id === socket.id);
      if (playerIndex === -1) return;
      state.ghost.levelVote.votes[playerIndex] = area;
      const counts = Object.fromEntries(VOTE_AREA_KEYS.map(a => [a, 0]));
      for (const v of Object.values(state.ghost.levelVote.votes)) counts[v]++;
      io.to(roomId).emit('ghost:vote_update', {
        counts,
        playerVotes: { ...state.ghost.levelVote.votes },
      });
      // Early resolution: if all human players have now voted, don't wait for timer
      const humanPlayers = state.players.filter(p => !p.isAI);
      if (humanPlayers.length > 0 &&
          Object.keys(state.ghost.levelVote.votes).length >= humanPlayers.length) {
        resolveLevelVote(state, roomId);
      }
    });

    // Hotel elevator: player enters proximity
    socket.on('ghost:enter_elevator', ({ roomId }) => {
      const state = rooms.get(roomId);
      if (!state || !state.ghost || state.phase !== 'playing') return;
      const gs = state.ghost;
      if (!gs.elevator || !gs.elevator.unlocked || gs.elevator.activated) return;
      const playerIndex = state.players.findIndex(p => p.id === socket.id);
      if (playerIndex === -1) return;
      gs.elevator.insidePlayers.add(playerIndex);
      const humanCount = state.players.filter(p => !p.isAI).length;
      io.to(roomId).emit('ghost:elevator_waiting', {
        insidePlayers: [...gs.elevator.insidePlayers],
        totalHuman: humanCount,
      });
      // Auto-activate when all human players are inside
      if (gs.elevator.insidePlayers.size >= humanCount && !gs.elevator.activating) {
        gs.elevator.activating = true;
        io.to(roomId).emit('ghost:elevator_ready', { countdownMs: 3000 });
        gs.elevator.activateTimer = setTimeout(() => triggerElevator(state, roomId), 3000);
      }
    });

    // Hotel elevator: player leaves proximity
    socket.on('ghost:leave_elevator', ({ roomId }) => {
      const state = rooms.get(roomId);
      if (!state || !state.ghost || state.phase !== 'playing') return;
      const gs = state.ghost;
      if (!gs.elevator || !gs.elevator.unlocked || gs.elevator.activated) return;
      const playerIndex = state.players.findIndex(p => p.id === socket.id);
      if (playerIndex === -1) return;
      gs.elevator.insidePlayers.delete(playerIndex);
      if (gs.elevator.activating) {
        gs.elevator.activating = false;
        if (gs.elevator.activateTimer) { clearTimeout(gs.elevator.activateTimer); gs.elevator.activateTimer = null; }
        io.to(roomId).emit('ghost:elevator_waiting', {
          insidePlayers: [...gs.elevator.insidePlayers],
          totalHuman: state.players.filter(p => !p.isAI).length,
        });
      }
    });

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
          title: g.title || null, bio_short: g.bio_short || null,
          name: g.identified ? g.name : undefined,
          bio_full: g.identified ? (g.bio_full || null) : undefined,
        })),
        pois:            gs.pois,
        keyPos:          gs.keyPos,
        powerupPos:      gs.powerupPos,
        keyAvailable:    gs.keyAvailable,
        powerupAvailable: gs.powerupAvailable,
        hasKey:          gs.keyHolder === playerIndex,
        hasEMFUpgrade:   gs.emfUpgradedPlayers ? gs.emfUpgradedPlayers.has(playerIndex) : false,
        hotelElevator:   gs.area === 'hotel' ? {
          serviceElevatorPos: areaData.serviceElevatorPos,
          mainFloorCount:     gs.mainFloorCount,
          unlocked:           gs.elevator ? gs.elevator.unlocked  : false,
          activated:          gs.elevator ? gs.elevator.activated : false,
        } : null,
      },
    };
  }

  return { startGame, registerEvents, getReconnectData };
};
