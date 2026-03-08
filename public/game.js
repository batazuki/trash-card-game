/* ═══════════════════════════════════════════════
   TINY TINY GAMES — Shared Client
   ═══════════════════════════════════════════════ */

const socket = io();

// ═══ SPLASH SCREEN ═══
(function dismissSplash() {
  const splash = document.getElementById("splash-screen");
  if (!splash) return;
  const minTime = 1800;
  const start = Date.now();
  function hide() {
    const elapsed = Date.now() - start;
    const remaining = Math.max(0, minTime - elapsed);
    setTimeout(() => {
      splash.classList.add("fade-out");
      setTimeout(() => splash.classList.add("hidden"), 500);
    }, remaining);
  }
  socket.once("connect", hide);
  setTimeout(hide, 4000);
})();

// ═══ GAME CLIENT REGISTRY ═══
window.gameClients = window.gameClients || {};
window._gameLocal = null;

// ═══ LOCAL STATE ═══
let local = {
  roomId: null,
  myPlayerIndex: null,
  playerName: "",
  opponentName: "",
  boards: [[], []],
  currentPlayerIndex: 0,
  turnPhase: "draw",
  pendingWildcard: null,
  validSlots: [],
  isMyTurn: false,
  deckCount: 0,
  topDiscard: null,
  vsAI: false,
  rowReversed: localStorage.getItem("rowReversed") === "1",
  gameType: "trash",
  viewingCards: false,
  oldies: localStorage.getItem("oldies") === "1",
};
document.body.classList.toggle("mode-oldies", local.oldies);

// ═══ HELPERS ═══
const $ = id => document.getElementById(id);

function showScreen(id) {
  document.querySelectorAll(".screen").forEach(s => {
    s.classList.remove("active");
    s.classList.add("hidden");
  });
  $(id).classList.remove("hidden");
  $(id).classList.add("active");
}

function showError(msg) {
  const el = $("lobby-error");
  el.textContent = msg;
  el.classList.remove("hidden");
  setTimeout(() => el.classList.add("hidden"), 3000);
}

// ═══ CARD RENDERING (SHARED) ═══
const SUIT_SYMBOL = { hearts: "♥", diamonds: "♦", clubs: "♣", spades: "♠" };
const RANK_LABEL = r => r === 1 ? "A" : r === 11 ? "J" : r === 12 ? "Q" : r === 13 ? "K" : String(r);
const isRed = suit => suit === "hearts" || suit === "diamonds";
const SLOT_LABELS = ["A","2","3","4","5","6","7","8","9","10","★"];

function makeCard(card) {
  const el = document.createElement("div");
  el.className = `card ${isRed(card.suit) ? "red" : "black"}`;
  const rank = RANK_LABEL(card.rank);
  const sym  = SUIT_SYMBOL[card.suit];
  el.innerHTML = `
    <span class="card-corner tl">${rank}</span>
    <span class="card-center">${sym}</span>
    <span class="card-corner br">${rank}</span>
  `;
  return el;
}

function makeCardBack() {
  const el = document.createElement("div");
  el.className = "card card-back";
  return el;
}

// ═══ UNIVERSAL CARD FLIP ANIMATION ═══
function animateFlip(containerEl, card, options = {}) {
  containerEl.innerHTML = "";
  const flipOuter = document.createElement("div");
  flipOuter.className = "card-flip";
  if (options.width) flipOuter.style.width = options.width;
  if (options.height) flipOuter.style.height = options.height;
  const flipInner = document.createElement("div");
  flipInner.className = "card-flip-inner";
  flipInner.appendChild(makeCardBack());
  flipInner.appendChild(makeCard(card));
  flipOuter.appendChild(flipInner);
  containerEl.appendChild(flipOuter);
  requestAnimationFrame(() => requestAnimationFrame(() => flipInner.classList.add("flipped")));
}

// ═══ TURN SOUND ═══
function playTurnSound() {
  if (musicMuted) return;
  try {
    const ctx = getSfxCtx();
    const t = ctx.currentTime;
    [523.25, 659.25].forEach((freq, i) => {
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = "sine";
      osc.frequency.value = freq;
      const s = t + i * 0.13;
      gain.gain.setValueAtTime(0, s);
      gain.gain.linearRampToValueAtTime(0.22, s + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, s + 0.45);
      osc.start(s);
      osc.stop(s + 0.5);
    });
  } catch(e) {}
}

// ═══ TURN NOTIFICATION ═══
function notifyMyTurn() {
  playTurnSound();
  navigator.vibrate?.(160);
  document.title = "⚡ Your Turn! — Tiny Tiny Games";
  const myArea = document.querySelector(".my-area");
  if (myArea) {
    myArea.classList.remove("turn-flash");
    void myArea.offsetWidth;
    myArea.classList.add("turn-flash");
    myArea.addEventListener("animationend", () => myArea.classList.remove("turn-flash"), { once: true });
  }
  document.body.classList.add("your-turn-flash");
  setTimeout(() => document.body.classList.remove("your-turn-flash"), 1200);
}

// ═══ REACTIONS ═══
function showReaction(emoji, isMe) {
  const el = document.createElement("div");
  el.className = "reaction-float";
  el.textContent = emoji;
  const isLandscape = document.body.classList.contains("is-landscape");
  if (isLandscape) {
    el.style.top = `${25 + Math.random() * 35}vh`;
    el.style.bottom = "auto";
    if (isMe) { el.style.right = "4vw"; el.style.left = "auto"; }
    else       { el.style.left = "4vw"; el.style.right = "auto"; }
  } else {
    el.style.left = `${20 + Math.random() * 55}vw`;
    if (isMe) { el.style.bottom = "28vh"; el.style.top = "auto"; }
    else       { el.style.top = "25vh";   el.style.bottom = "auto"; }
  }
  document.body.appendChild(el);
  el.addEventListener("animationend", () => el.remove());
}

const reactionTimes = [];
document.querySelectorAll(".reaction-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    if (!local.roomId) return;
    const now = Date.now();
    while (reactionTimes.length && now - reactionTimes[0] > 15000) reactionTimes.shift();
    if (reactionTimes.length >= 5) return;
    reactionTimes.push(now);
    socket.emit("sendReaction", { roomId: local.roomId, emoji: btn.dataset.emoji });
  });
});

// ═══ GAME THEME ═══
function applyGameTheme(game) {
  // Remove all game-* classes
  document.body.className = document.body.className.replace(/\bgame-\S+/g, '').trim();
  if (game && game !== "trash") {
    document.body.classList.add("game-" + game);
  }
}

// ═══ SCREEN WAKE LOCK ═══
let wakeLock = null;
async function requestWakeLock() {
  if (!('wakeLock' in navigator)) return;
  try {
    wakeLock = await navigator.wakeLock.request('screen');
    wakeLock.addEventListener('release', () => { wakeLock = null; });
  } catch (_) {}
}
function releaseWakeLock() {
  if (wakeLock) { wakeLock.release().catch(() => {}); wakeLock = null; }
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && local.roomId) requestWakeLock();
});

// ═══ STRANGER THINGS SYNTH MUSIC ═══
let musicCtx = null, musicMuted = false, musicScheduleTimer = null, musicMasterGain = null;
const M_BPM = 80, M_BEAT = 60 / M_BPM, M_LOOP = 16 * (60 / M_BPM);
const MN = {
  B1:61.74, B2:123.47, D3:146.83, E3:164.81, Fs3:185.00, G3:196.00,
  A3:220.00, B3:246.94, D4:293.66, E4:329.63, Fs4:369.99,
  G4:392.00, A4:440.00, B4:493.88,
};
const BASS = [
  MN.B2,MN.Fs3,MN.B3,MN.D4, MN.B3,MN.Fs3,MN.B2,MN.E3,
  MN.G3,MN.B3,MN.E4,MN.G4,  MN.E4,MN.B3,MN.G3,MN.D3,
];
const LEAD = [
  [null,1],[MN.B4,1],[MN.A4,.5],[MN.G4,.5],
  [MN.Fs4,1],[MN.E4,1],[MN.D4,1],[MN.E4,.5],[MN.Fs4,.5],[MN.G4,2],
  [null,1],[MN.A4,.5],[MN.G4,.5],[MN.Fs4,.5],[MN.E4,.5],
  [MN.D4,1],[MN.E4,1],[MN.B3,2],
];
function mNote(ctx, dest, freq, t, dur, vol, type='sawtooth') {
  if (!freq) return;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.value = freq;
  o.connect(g); g.connect(dest);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.04);
  g.gain.setValueAtTime(vol, t + dur - 0.07);
  g.gain.linearRampToValueAtTime(0, t + dur);
  o.start(t); o.stop(t + dur + 0.05);
}
function scheduleMusicLoop(t0) {
  if (!musicCtx || musicCtx.state === 'closed') return;
  const dry = musicMasterGain;
  const dly = musicCtx.createDelay(1.5);
  dly.delayTime.value = M_BEAT * 0.75;
  const fb = musicCtx.createGain(); fb.gain.value = 0.3;
  const dOut = musicCtx.createGain(); dOut.gain.value = 0.35;
  dly.connect(fb); fb.connect(dly); dly.connect(dOut); dOut.connect(dry);
  for (let r = 0; r < 2; r++) {
    BASS.forEach((f, i) => {
      const t = t0 + (r * 8 + i * 0.5) * M_BEAT;
      mNote(musicCtx, dly, f, t, 0.38 * M_BEAT, 0.07, 'sawtooth');
    });
  }
  let t = t0;
  LEAD.forEach(([f, b]) => {
    mNote(musicCtx, dry, f, t, b * M_BEAT * 0.88, 0.13, 'sine');
    mNote(musicCtx, dly, f, t, b * M_BEAT * 0.88, 0.04, 'triangle');
    t += b * M_BEAT;
  });
  musicScheduleTimer = setTimeout(() => scheduleMusicLoop(t0 + M_LOOP), (M_LOOP - 2) * 1000);
}
function startElevenMusic() {
  if (musicCtx) return;
  try {
    musicCtx = new (window.AudioContext || window.webkitAudioContext)();
    musicMasterGain = musicCtx.createGain();
    musicMasterGain.gain.value = musicMuted ? 0 : 0.55;
    musicMasterGain.connect(musicCtx.destination);
    scheduleMusicLoop(musicCtx.currentTime + 0.15);
  } catch(e) {}
}
function stopElevenMusic() {
  clearTimeout(musicScheduleTimer);
  if (musicCtx) { musicCtx.close().catch(()=>{}); musicCtx = null; musicMasterGain = null; }
}
function toggleMusic() {
  musicMuted = !musicMuted;
  if (musicMasterGain) musicMasterGain.gain.setTargetAtTime(musicMuted ? 0 : 0.55, musicCtx.currentTime, 0.1);
  const btn = $("settings-music");
  if (btn) btn.textContent = musicMuted ? "🔇 Music" : "🔊 Music";
}

// ═══ SOUND EFFECTS ═══
let sfxCtx = null;
function getSfxCtx() {
  if (!sfxCtx || sfxCtx.state === 'closed')
    sfxCtx = new (window.AudioContext || window.webkitAudioContext)();
  return sfxCtx;
}
function sfxTone(freq, dur, vol, type = 'sine', delay = 0) {
  if (musicMuted) return;
  const ctx = getSfxCtx();
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.value = freq;
  o.connect(g); g.connect(ctx.destination);
  const t = ctx.currentTime + delay;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.start(t); o.stop(t + dur + 0.02);
}
function playWinFanfare() {
  [523.25, 659.25, 783.99, 1046.5].forEach((f, i) =>
    sfxTone(f, 0.38, 0.18, 'triangle', i * 0.13)
  );
}

// ═══ SHARE ROOM CODE ═══
async function shareRoomCode(roomId) {
  const url = window.location.href.split('?')[0];
  const text = `Join my game! Room code: ${roomId}\n${url}`;
  if (navigator.share) {
    try { await navigator.share({ title: "Tiny Tiny Games", text }); return; } catch(e) {}
  }
  try {
    await navigator.clipboard.writeText(text);
    showShareToast("Copied to clipboard!");
  } catch(e) { showShareToast(roomId); }
}
function showShareToast(msg) {
  let t = document.getElementById("share-toast");
  if (!t) {
    t = document.createElement("div");
    t.id = "share-toast";
    t.style.cssText = "position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.75);color:#fff;padding:8px 18px;border-radius:20px;font-family:var(--font);font-size:13px;font-weight:800;z-index:400;pointer-events:none;";
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.style.opacity = "1";
  clearTimeout(t._timer);
  t._timer = setTimeout(() => { t.style.opacity = "0"; }, 2000);
}

// ═══ HELP MODAL ═══
const GAME_TO_TAB = { trash: "default", "trash-eleven": "eleven", war: "war", solitaire: "solitaire", hockey: "hockey" };

function openHelp() {
  // Determine current game — in-game uses local.gameType, lobby uses dropdown
  const game = local.roomId ? local.gameType : ($("game-select").value || "trash");
  const tabKey = GAME_TO_TAB[game] || "default";

  // Hide all tabs and sections, then show only the relevant one
  document.querySelectorAll(".modal-tab").forEach(t => t.classList.remove("active"));
  document.querySelectorAll(".modal-section").forEach(s => s.classList.remove("active"));

  const tab = document.querySelector(`.modal-tab[data-tab="${tabKey}"]`);
  if (tab) tab.classList.add("active");
  const sec = document.getElementById("help-" + tabKey);
  if (sec) sec.classList.add("active");

  // During a game, hide the tab bar since only one game is relevant
  document.querySelector(".modal-tabs").classList.toggle("hidden", !!local.roomId);

  $("help-modal").classList.remove("hidden");
}
function closeHelp() { $("help-modal").classList.add("hidden"); }
document.querySelectorAll(".modal-tab").forEach(tab => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".modal-tab").forEach(t => t.classList.remove("active"));
    document.querySelectorAll(".modal-section").forEach(s => s.classList.remove("active"));
    tab.classList.add("active");
    const sec = document.getElementById("help-" + tab.dataset.tab);
    if (sec) sec.classList.add("active");
  });
});

// ═══ VIEW CARDS (from end screen) ═══
function viewCards() {
  local.viewingCards = true;
  const banner = $("view-only-banner");
  if (banner) banner.classList.remove("hidden");
  showScreen("game-screen");
}
function closeViewCards() {
  local.viewingCards = false;
  const banner = $("view-only-banner");
  if (banner) banner.classList.add("hidden");
  showScreen("end-screen");
}

// ═══ ROW ORDER ═══
function setRowOrder(on) {
  local.rowReversed = on;
  localStorage.setItem("rowReversed", on ? "1" : "0");
  $("settings-row-order").textContent = on ? "🔄 6–10 Top: On" : "🔄 6–10 Top: Off";
  const trashClient = window.gameClients.trash;
  if (trashClient && local.boards[0].length) trashClient.renderBothBoards();
}
$("settings-row-order").textContent = local.rowReversed ? "🔄 6–10 Top: On" : "🔄 6–10 Top: Off";

// ═══ OLDIES / HIGH-CONTRAST MODE ═══
function setOldiesMode(on) {
  local.oldies = on;
  localStorage.setItem("oldies", on ? "1" : "0");
  document.body.classList.toggle("mode-oldies", on);
  $("oldies-toggle").checked = on;
  $("settings-oldies").textContent = on ? "👓 Oldies: On" : "👓 Oldies: Off";
}
$("oldies-toggle").checked = local.oldies;
$("settings-oldies").textContent = local.oldies ? "👓 Oldies: On" : "👓 Oldies: Off";
$("oldies-toggle").addEventListener("change", e => setOldiesMode(e.target.checked));

// ═══ CARD SIZING & LANDSCAPE MODE ═══
function recalcCardSizes() {
  const isLandscape = document.body.classList.contains("is-landscape");
  const isEleven    = local.gameType === "trash-eleven";
  const cols = isEleven ? 6 : 5;
  const vw = window.innerWidth;
  const gap = isLandscape ? 4 : 6;

  let cardW;
  if (isLandscape) {
    const centerW = Math.min(280, Math.max(140, vw * 0.18));
    const sideW   = (vw - centerW - 16 - gap * 2) / 2;
    cardW = Math.max(30, Math.floor((sideW - (cols - 1) * gap) / cols));
  } else {
    const gameW = Math.min(vw - 16, Math.max(vw * 0.92, 320));
    cardW = Math.max(38, Math.floor((gameW - (cols - 1) * gap) / cols));
  }
  const maxCardWByHeight = Math.floor(((window.innerHeight - 200) / 4) / 1.43);
  cardW = Math.min(cardW, Math.max(38, maxCardWByHeight));

  const oppCardW = isLandscape ? cardW : Math.max(28, Math.round(cardW * 0.80));

  const r = document.documentElement;
  r.style.setProperty("--card-w",     `${cardW}px`);
  r.style.setProperty("--card-h",     `${Math.round(cardW * 1.43)}px`);
  r.style.setProperty("--opp-card-w", `${oppCardW}px`);
  r.style.setProperty("--opp-card-h", `${Math.round(oppCardW * 1.43)}px`);
}

function setLandscape(on) {
  document.body.classList.toggle("is-landscape", on);
  if (!isTouchDevice) localStorage.setItem("landscape", on ? "1" : "0");
  $("settings-landscape").textContent = on ? "↔ Landscape: On" : "↔ Landscape: Off";
  recalcCardSizes();
  const trashClient = window.gameClients.trash;
  if (trashClient && local.boards[0].length) trashClient.renderBothBoards();
}

const isTouchDevice = navigator.maxTouchPoints > 0;
window.addEventListener("orientationchange", () => {
  if (isTouchDevice) setTimeout(() => setLandscape(window.innerWidth > window.innerHeight), 120);
});

window.addEventListener("resize", () => {
  recalcCardSizes();
  const trashClient = window.gameClients.trash;
  if (trashClient && local.boards[0].length) trashClient.renderBothBoards();
});

recalcCardSizes();
if (isTouchDevice) setLandscape(window.innerWidth > window.innerHeight);
else setLandscape(localStorage.getItem("landscape") === "1");

function dealAnimate(container, selector, staggerMs = 50) {
  const els = container.querySelectorAll(selector);
  els.forEach((el, i) => {
    el.classList.add("deal-animate");
    setTimeout(() => el.classList.add("dealt"), i * staggerMs);
  });
}

// ═══ EXPOSE SHARED UTILITIES ═══
window._gameShared = {
  makeCard, makeCardBack, RANK_LABEL, SUIT_SYMBOL, isRed, SLOT_LABELS,
  sfxTone, notifyMyTurn, recalcCardSizes, $, animateFlip, showScreen, dealAnimate,
};

// ═══ LOBBY BUTTON HANDLERS ═══
(function() {
  const saved = localStorage.getItem("game") || "trash";
  $("game-select").value = saved;
  applyGameTheme(saved);
})();

$("game-select").addEventListener("change", e => {
  localStorage.setItem("game", e.target.value);
  applyGameTheme(e.target.value);
  updateLobbyForGame(e.target.value);
});

function updateLobbyForGame(game) {
  const isSolo = game === "solitaire";
  $("vs-ai-btn").textContent = isSolo ? "Play" : "Play vs AI";
  $("create-room-btn").style.display = isSolo ? "none" : "";
  document.querySelector(".divider").style.display = isSolo ? "none" : "";
  document.querySelector(".join-row").style.display = isSolo ? "none" : "";
}
updateLobbyForGame(localStorage.getItem("game") || "trash");

$("vs-ai-btn").addEventListener("click", () => {
  const name = $("player-name").value.trim() || "Player";
  local.playerName = name;
  local.vsAI = true;
  socket.emit("playVsAI", { playerName: name, game: $("game-select").value });
});

$("create-room-btn").addEventListener("click", () => {
  const name = $("player-name").value.trim() || "Player";
  local.playerName = name;
  socket.emit("createRoom", { playerName: name, game: $("game-select").value });
});

$("join-room-btn").addEventListener("click", () => {
  const name = $("player-name").value.trim() || "Player";
  const code = $("join-code").value.trim().toUpperCase();
  if (!code || code.length !== 4) { showError("Enter a 4-letter room code"); return; }
  local.playerName = name;
  socket.emit("joinRoom", { roomId: code, playerName: name });
});

$("join-code").addEventListener("keydown", e => {
  if (e.key === "Enter") $("join-room-btn").click();
});

// ═══ END SCREEN HANDLERS ═══
$("play-again-btn").addEventListener("click", () => {
  if (local.roomId) {
    socket.emit("requestRematch", { roomId: local.roomId });
    $("play-again-btn").disabled = true;
    $("play-again-btn").textContent = "Waiting...";
  }
});

$("back-lobby-btn").addEventListener("click", () => {
  releaseWakeLock();
  stopElevenMusic();
  // Notify server we're leaving
  if (local.roomId) {
    socket.emit("leaveRoom", { roomId: local.roomId });
  }
  // Clean up current game client
  const gameClient = window.gameClients[local.gameType];
  if (gameClient && gameClient.cleanup) gameClient.cleanup();
  // Restore lobby to saved game selection
  const savedGame = $("game-select").value || "trash";
  applyGameTheme(savedGame);
  local.roomId = null;
  local.vsAI = false;
  local.gameType = savedGame;
  $("room-code-display").classList.add("hidden");
  $("room-code-text").textContent = "";
  $("score-display").classList.add("hidden");
  $("shared-reaction-bar").classList.add("hidden");
  $("end-game-switch").classList.add("hidden");
  showScreen("lobby-screen");
});

// ═══ SOCKET EVENTS ═══

socket.on("roomCreated", ({ roomId }) => {
  local.roomId = roomId;
  $("room-code-text").textContent = roomId;
  $("room-code-display").classList.remove("hidden");
});

socket.on("joinedRoom", ({ roomId, game }) => {
  local.roomId = roomId;
  if (game) {
    local.gameType = game;
    $("game-select").value = game;
    applyGameTheme(game);
    updateLobbyForGame(game);
  }
});

socket.on("joinError", ({ message }) => {
  showError(message);
});

socket.on("gameStart", (data) => {
  const { roomId, myPlayerIndex, players, game } = data;
  local.roomId = roomId;
  local.myPlayerIndex = myPlayerIndex;
  local.gameType = game || "trash";
  local.vsAI = players.some(p => p.isAI);

  const me = players[myPlayerIndex];
  const opp = players.length > 1 ? players[1 - myPlayerIndex] : null;
  local.playerName = me.name;
  local.opponentName = opp ? opp.name : "";

  window._gameLocal = local;

  applyGameTheme(local.gameType);
  if (local.gameType === "trash-eleven") startElevenMusic();
  else stopElevenMusic();

  $("settings-row-order").classList.toggle("hidden", !local.gameType.startsWith("trash"));

  const isTrash = local.gameType.startsWith("trash");
  const gameClient = window.gameClients[local.gameType];

  // Toggle Trash UI vs game-container
  $("trash-ui").classList.toggle("hidden", !isTrash);
  $("game-container").classList.toggle("hidden", isTrash);

  // Show shared reaction bar for non-trash multiplayer games (not solitaire, not hockey)
  const showSharedReactions = !isTrash && local.gameType !== "solitaire" && local.gameType !== "hockey";
  $("shared-reaction-bar").classList.toggle("hidden", !showSharedReactions);

  if (gameClient) {
    gameClient.onGameStart(data);
  }

  requestWakeLock();
  showScreen("game-screen");
  if (local.isMyTurn) notifyMyTurn();
  else document.title = "Tiny Tiny Games";
});

socket.on("gameOver", ({ winnerIndex, winnerName, scores, gamesPlayed }) => {
  releaseWakeLock();
  if (winnerIndex === local.myPlayerIndex) playWinFanfare();
  const didWin = winnerIndex === local.myPlayerIndex;
  $("result-emoji").textContent = didWin ? "🎉" : "😔";
  $("result-text").textContent = didWin ? "You Win!" : `${winnerName} Wins!`;
  const subTexts = {
    trash: didWin ? "You filled all your spots first!" : "Better luck next time.",
    "trash-eleven": didWin ? "You filled all 11 slots first!" : "Better luck next time.",
    war: didWin ? "You captured all the cards!" : "Your opponent took all the cards.",
    solitaire: "Congratulations!",
    hockey: didWin ? "Purrfect victory!" : "The yarn got away...",
  };
  $("result-sub").textContent = subTexts[local.gameType] || (didWin ? "Nice job!" : "Better luck next time.");
  $("play-again-btn").disabled = false;
  $("play-again-btn").textContent = (local.vsAI || local.gameType === "solitaire") ? "Play Again" : "Rematch";
  $("see-cards-btn").style.display = local.gameType.startsWith("trash") ? "" : "none";
  // Hide hockey from physics cleanup (already handled by clearInterval on server)


  // Show game switcher only for multiplayer (not AI, not solitaire)
  const showSwitcher = !local.vsAI && local.gameType !== "solitaire";
  $("end-game-switch").classList.toggle("hidden", !showSwitcher);
  if (showSwitcher) $("end-game-select").value = local.gameType;

  const scoreEl = $("score-display");
  if (scores && gamesPlayed > 1) {
    const myScore = scores[local.myPlayerIndex];
    const oppScore = scores[1 - local.myPlayerIndex];
    scoreEl.textContent = `You ${myScore} — ${local.opponentName || "Opponent"} ${oppScore}`;
    scoreEl.classList.remove("hidden");
  } else {
    scoreEl.classList.add("hidden");
  }

  setTimeout(() => showScreen("end-screen"), 800);
});

socket.on("rematchRequested", ({ playerIndex }) => {
  if (playerIndex !== local.myPlayerIndex) {
    $("result-sub").textContent = `${local.opponentName} wants a rematch!`;
  }
});

socket.on("opponentDisconnected", () => {
  releaseWakeLock();
  stopElevenMusic();
  setTimeout(() => {
    $("result-emoji").textContent = "🏆";
    $("result-text").textContent = "You Win!";
    $("result-sub").textContent = "Opponent disconnected.";
    showScreen("end-screen");
  }, 1500);
});

socket.on("reaction", ({ playerIndex, emoji }) => {
  showReaction(emoji, playerIndex === local.myPlayerIndex);
});

socket.on("opponentLeft", () => {
  $("play-again-btn").disabled = true;
  $("play-again-btn").textContent = "Opponent Left";
  $("end-game-switch").classList.add("hidden");
  $("result-sub").textContent = "Opponent left the room.";
});

socket.on("gameChanged", ({ game }) => {
  local.gameType = game;
  applyGameTheme(game);
  const sel = $("end-game-select");
  if (sel && sel.value !== game) sel.value = game;
});

// ── End screen game selector ──
$("end-game-select").addEventListener("change", e => {
  if (!local.roomId) return;
  const game = e.target.value;
  socket.emit("changeGame", { roomId: local.roomId, game });
});

// ═══ REMAINING BUTTON WIRES ═══

$("gear-btn").addEventListener("click", e => {
  e.stopPropagation();
  $("settings-panel").classList.toggle("hidden");
});
document.addEventListener("click", () => $("settings-panel").classList.add("hidden"));
$("settings-panel").addEventListener("click", e => e.stopPropagation());

$("settings-music").addEventListener("click", () => {
  toggleMusic();
  $("settings-panel").classList.add("hidden");
});
$("settings-oldies").addEventListener("click", () => {
  setOldiesMode(!local.oldies);
  $("settings-panel").classList.add("hidden");
});
$("settings-row-order").addEventListener("click", () => {
  setRowOrder(!local.rowReversed);
  $("settings-panel").classList.add("hidden");
});
$("settings-landscape").addEventListener("click", () => {
  setLandscape(!document.body.classList.contains("is-landscape"));
  $("settings-panel").classList.add("hidden");
});
$("settings-help").addEventListener("click", () => {
  openHelp();
  $("settings-panel").classList.add("hidden");
});
$("settings-quit").addEventListener("click", () => {
  $("settings-panel").classList.add("hidden");
  if (!local.roomId) return;
  if (!confirm("Quit game? Your opponent will be notified.")) return;
  releaseWakeLock();
  socket.emit("quitGame", { roomId: local.roomId });
  socket.emit("leaveRoom", { roomId: local.roomId });
  stopElevenMusic();
  const gameClient = window.gameClients[local.gameType];
  if (gameClient && gameClient.cleanup) gameClient.cleanup();
  const savedGame = $("game-select").value || "trash";
  applyGameTheme(savedGame);
  local.roomId = null;
  local.vsAI = false;
  local.myPlayerIndex = null;
  local.gameType = savedGame;
  $("shared-reaction-bar").classList.add("hidden");
  showScreen("lobby-screen");
});

$("help-btn-lobby").addEventListener("click", openHelp);
$("help-close").addEventListener("click", closeHelp);
$("help-modal").addEventListener("click", e => {
  if (e.target === $("help-modal")) closeHelp();
});

$("share-btn").addEventListener("click", () => shareRoomCode(local.roomId));

$("see-cards-btn").addEventListener("click", viewCards);

// ═══ RECONNECTION ═══

socket.on("disconnect", () => {
  document.title = "Reconnecting… — Tiny Tiny Games";
});

socket.on("connect", () => {
  if (local.roomId && local.myPlayerIndex !== null) {
    socket.emit("rejoinRoom", { roomId: local.roomId, playerIndex: local.myPlayerIndex });
  }
});

socket.on("gameRejoined", (data) => {
  const { roomId, myPlayerIndex, players, game } = data;
  local.roomId = roomId;
  local.myPlayerIndex = myPlayerIndex;
  local.gameType = game || "trash";
  window._gameLocal = local;

  const me = players[myPlayerIndex];
  const opp = players.length > 1 ? players[1 - myPlayerIndex] : null;
  local.playerName = me.name;
  local.opponentName = opp ? opp.name : "";

  applyGameTheme(local.gameType);
  if (local.gameType === "trash-eleven") startElevenMusic();

  const isTrash = local.gameType.startsWith("trash");
  const gameClient = window.gameClients[local.gameType];

  $("trash-ui").classList.toggle("hidden", !isTrash);
  $("game-container").classList.toggle("hidden", isTrash);

  const showSharedReactions = !isTrash && local.gameType !== "solitaire";
  $("shared-reaction-bar").classList.toggle("hidden", !showSharedReactions);

  if (gameClient && gameClient.onReconnect) {
    gameClient.onReconnect(data);
  }

  showScreen("game-screen");
  document.title = "Tiny Tiny Games";
});

socket.on("opponentDisconnecting", () => {
  // Generic message — Trash's updateTurnIndicator is now in trash-client
});

socket.on("opponentReconnected", () => {
  // Game-specific handlers will update their own UI
});

socket.on("opponentQuit", ({ quitterIndex }) => {
  if (quitterIndex === local.myPlayerIndex) return;
  releaseWakeLock();
  stopElevenMusic();
  setTimeout(() => {
    $("result-emoji").textContent = "🏆";
    $("result-text").textContent = "You Win!";
    $("result-sub").textContent = "Opponent quit the game.";
    showScreen("end-screen");
  }, 500);
});
