/* ═══════════════════════════════════════════════
   TRASH CARD GAME — Client
   ═══════════════════════════════════════════════ */

const socket = io();

// ═══ SPLASH SCREEN ═══
(function dismissSplash() {
  const splash = document.getElementById("splash-screen");
  if (!splash) return;
  const minTime = 1800; // show for at least 1.8s
  const start = Date.now();
  function hide() {
    const elapsed = Date.now() - start;
    const remaining = Math.max(0, minTime - elapsed);
    setTimeout(() => {
      splash.classList.add("fade-out");
      setTimeout(() => splash.classList.add("hidden"), 500);
    }, remaining);
  }
  // Dismiss once socket connects (means server is ready)
  socket.once("connect", hide);
  // Fallback: dismiss after 4s even if socket is slow
  setTimeout(hide, 4000);
})();

// ═══ GAME CLIENT REGISTRY ═══
// Game client modules register themselves on window.gameClients
window.gameClients = window.gameClients || {};
window._gameLocal = null; // Exposed for game client modules

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
  viewingCards: false,   // true when showing game-screen from end-screen
  oldies: localStorage.getItem("oldies") === "1",
};
// Apply persisted Oldies preference immediately
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

// ═══ CARD RENDERING ═══
const SUIT_SYMBOL = { hearts: "♥", diamonds: "♦", clubs: "♣", spades: "♠" };
const RANK_LABEL = r => r === 1 ? "A" : r === 11 ? "J" : r === 12 ? "Q" : r === 13 ? "K" : String(r);
const isRed = suit => suit === "hearts" || suit === "diamonds";

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

// ═══ BOARD RENDERING ═══
const SLOT_LABELS = ["A","2","3","4","5","6","7","8","9","10","★"];

function renderBoard(playerIndex, board) {
  const isMe = playerIndex === local.myPlayerIndex;
  const container = $(isMe ? "my-board" : "opponent-board");
  container.innerHTML = "";

  const isEleven = local.gameType === "trash-eleven";
  container.classList.toggle("eleven-board", isEleven);

  function buildSlotEl(i) {
    const slot = board[i];
    if (!slot) return null;
    const slotEl = document.createElement("div");
    let cls = "card-slot";
    if (slot.filled)         cls += " filled";
    if (slot.wildcardFilled) cls += " wildcard-filled";
    if (i === 10)            cls += " eleven-slot";
    slotEl.className = cls;
    slotEl.dataset.slotIndex = i;
    if (!slot.filled) {
      const hint = document.createElement("span");
      hint.className = "slot-hint";
      hint.textContent = SLOT_LABELS[i];
      slotEl.appendChild(hint);
    }
    if (slot.card && slot.card.faceUp) {
      slotEl.appendChild(makeCard(slot.card));
    } else if (slot.card && !slot.card.faceUp) {
      slotEl.appendChild(makeCardBack());
    }
    if (isMe && local.turnPhase === "place-wildcard" && local.validSlots.includes(i)) {
      slotEl.classList.add("valid-slot");
      slotEl.addEventListener("click", () => onSlotClick(i), { once: true });
    }
    return slotEl;
  }

  if (isEleven) {
    // Slots 0–9 in a 5×2 main grid; ★ (slot 10) floats to the right, centered
    const mainGrid = document.createElement("div");
    mainGrid.className = "eleven-main-grid";
    const mainOrder = local.rowReversed
      ? [5, 6, 7, 8, 9, 0, 1, 2, 3, 4]
      : [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
    mainOrder.forEach(i => { const el = buildSlotEl(i); if (el) mainGrid.appendChild(el); });
    container.appendChild(mainGrid);
    const starEl = buildSlotEl(10);
    if (starEl) container.appendChild(starEl);
  } else {
    const order = local.rowReversed
      ? [5, 6, 7, 8, 9, 0, 1, 2, 3, 4]
      : [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
    order.forEach(i => { const el = buildSlotEl(i); if (el) container.appendChild(el); });
  }
}

function renderBothBoards() {
  renderBoard(0, local.boards[0]);
  renderBoard(1, local.boards[1]);
}

// ═══ DISCARD PILE RENDERING ═══
function renderDiscardPile(topCard) {
  local.topDiscard = topCard;
  const el = $("discard-pile");
  el.innerHTML = "";

  if (topCard) {
    el.className = "pile-card";
    el.style.width = "";
    el.style.height = "";
    const cardEl = makeCard(topCard);
    el.appendChild(cardEl);
  } else {
    el.className = "pile-card discard-empty";
    el.innerHTML = `<span class="pile-empty-label">Empty</span>`;
  }

  // Reset label back to "Discard" (showChainCard may have changed it)
  const label = $("discard-pile-label");
  if (label) label.textContent = "Discard";

  // Enable/disable "Take Discard" button
  const myBoard = local.boards[local.myPlayerIndex] || [];
  const takeBtn = $("draw-discard-btn");
  takeBtn.disabled = !local.isMyTurn || local.turnPhase !== "draw" || !canUseDiscard(topCard, myBoard);
}

function updateDeckCount(count) {
  local.deckCount = count;
  $("deck-count").textContent = count;
}

// ═══ TURN INDICATOR ═══
function updateTurnIndicator(msg) {
  const el = $("turn-indicator");
  if (msg) {
    el.textContent = msg;
    el.className = "turn-indicator";
    return;
  }
  const newClass = local.isMyTurn ? "turn-indicator my-turn" : "turn-indicator their-turn";
  const newText  = local.isMyTurn ? "Your Turn" : `${local.opponentName || "Opponent"}'s Turn`;
  const changed  = el.textContent !== newText;
  el.textContent = newText;
  el.className = newClass;
  if (changed) {
    el.classList.add("turn-pop");
    el.addEventListener("animationend", () => el.classList.remove("turn-pop"), { once: true });
  }
}

// ═══ DRAW BUTTONS ═══
// Mirror of server getValidSlot + canUseCard
function getValidSlotClient(card, board) {
  if (!card || card.rank < 1 || card.rank > 10) return null;
  const idx = card.rank - 1;
  const slot = board[idx];
  if (!slot) return null;
  if (!slot.filled) return idx;
  // Wildcard overlay: Eleven variant only
  if (local.gameType === "trash-eleven" && slot.wildcardFilled) return idx;
  if (local.gameType === "trash-eleven" && card.rank === 1 && board[10]) {
    const s10 = board[10];
    if (!s10.filled || s10.wildcardFilled) return 10;
  }
  return null;
}
function canUseDiscard(card, board) {
  if (!card) return false;
  if (card.rank === 12) return false;
  if (card.rank === 11) return board.slice(0, 10).some(s => !s.filled);
  if (card.rank === 13) return [0,4,5,9].some(i => !board[i]?.filled);
  return getValidSlotClient(card, board) !== null;
}

function setDrawButtonsEnabled(enabled) {
  $("draw-deck-btn").disabled = !enabled;
  const myBoard = local.boards[local.myPlayerIndex] || [];
  const discardUsable = canUseDiscard(local.topDiscard, myBoard);
  $("draw-discard-btn").disabled = !enabled || !discardUsable;
}

// ═══ CHAIN DISPLAY ═══
// Shows the active chain card in the discard pile area (no extra space needed).
function showChainCard(card) {
  const label = $("discard-pile-label");
  if (card) {
    const el = $("discard-pile");
    el.innerHTML = "";
    el.className = "pile-card";
    el.appendChild(makeCard(card));
    if (label) label.textContent = "Chain";
  } else {
    renderDiscardPile(local.topDiscard);
  }
}

// ═══ TURN SOUND ═══
function playTurnSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
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
  // Board glow (Trash only — .my-area may not exist for other games)
  const myArea = document.querySelector(".my-area");
  if (myArea) {
    myArea.classList.remove("turn-flash");
    void myArea.offsetWidth; // force reflow to restart animation
    myArea.classList.add("turn-flash");
  }
  myArea.addEventListener("animationend", () => myArea.classList.remove("turn-flash"), { once: true });
  // Background flash
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
    // In landscape, my area is on the right and opponent is on the left
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

// Rate limit: max 5 reactions per 15 seconds (sliding window)
const reactionTimes = [];
document.querySelectorAll(".reaction-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    if (!local.roomId) return;
    const now = Date.now();
    // Drop timestamps older than 15 seconds
    while (reactionTimes.length && now - reactionTimes[0] > 15000) reactionTimes.shift();
    if (reactionTimes.length >= 5) return; // limit reached
    reactionTimes.push(now);
    socket.emit("sendReaction", { roomId: local.roomId, emoji: btn.dataset.emoji });
  });
});

// ═══ ELEVEN VARIANT THEME ═══
function applyGameTheme(variant) {
  document.body.classList.toggle("game-trash-eleven", variant === "trash-eleven");
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
// Bass arpeggio: 16 eighth-notes (8 beats), runs twice per loop
const BASS = [
  MN.B2,MN.Fs3,MN.B3,MN.D4, MN.B3,MN.Fs3,MN.B2,MN.E3,
  MN.G3,MN.B3,MN.E4,MN.G4,  MN.E4,MN.B3,MN.G3,MN.D3,
];
// Lead melody over 16 beats [freq|null, beats] — total must equal 16
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
  // Delay/echo chain
  const dly = musicCtx.createDelay(1.5);
  dly.delayTime.value = M_BEAT * 0.75;
  const fb = musicCtx.createGain(); fb.gain.value = 0.3;
  const dOut = musicCtx.createGain(); dOut.gain.value = 0.35;
  dly.connect(fb); fb.connect(dly); dly.connect(dOut); dOut.connect(dry);
  // Schedule bass (×2)
  for (let r = 0; r < 2; r++) {
    BASS.forEach((f, i) => {
      const t = t0 + (r * 8 + i * 0.5) * M_BEAT;
      mNote(musicCtx, dly, f, t, 0.38 * M_BEAT, 0.07, 'sawtooth');
    });
  }
  // Schedule lead
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
function playCardPlace() {
  sfxTone(700, 0.07, 0.18, 'sine');
  sfxTone(440, 0.09, 0.06, 'triangle', 0.01);
}
function playDiscard() {
  sfxTone(380, 0.12, 0.10, 'sine');
}
function playTurnStart() {
  sfxTone(660, 0.10, 0.12, 'sine');
  sfxTone(880, 0.12, 0.10, 'sine', 0.10);
}
function playWinFanfare() {
  [523.25, 659.25, 783.99, 1046.5].forEach((f, i) =>
    sfxTone(f, 0.38, 0.18, 'triangle', i * 0.13)
  );
}

// ═══ SHARE ROOM CODE ═══
async function shareRoomCode(roomId) {
  const url = window.location.href.split('?')[0];
  const text = `Join my Trash game! Room code: ${roomId}\n${url}`;
  if (navigator.share) {
    try { await navigator.share({ title: "Trash Card Game", text }); return; } catch(e) {}
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
function openHelp() { $("help-modal").classList.remove("hidden"); }
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
  $("view-only-banner").classList.remove("hidden");
  showScreen("game-screen");
}
function closeViewCards() {
  local.viewingCards = false;
  $("view-only-banner").classList.add("hidden");
  showScreen("end-screen");
}

// ═══ SLOT CLICK (WILDCARD PLACEMENT) ═══
function onSlotClick(slotIndex) {
  if (local.turnPhase !== "place-wildcard") return;
  if (!local.validSlots.includes(slotIndex)) return;
  local.validSlots = [];
  local.turnPhase = "chain";
  setDrawButtonsEnabled(false);
  socket.emit("placeWildcard", { roomId: local.roomId, slotIndex });
}

// ═══ ROW ORDER ═══
function setRowOrder(on) {
  local.rowReversed = on;
  localStorage.setItem("rowReversed", on ? "1" : "0");
  $("settings-row-order").textContent = on ? "🔄 6–10 Top: On" : "🔄 6–10 Top: Off";
  if (local.boards[0].length) renderBothBoards();
}
// Apply persisted row order preference immediately
$("settings-row-order").textContent = local.rowReversed ? "🔄 6–10 Top: On" : "🔄 6–10 Top: Off";

// ═══ OLDIES / HIGH-CONTRAST MODE ═══
function setOldiesMode(on) {
  local.oldies = on;
  localStorage.setItem("oldies", on ? "1" : "0");
  document.body.classList.toggle("mode-oldies", on);
  $("oldies-toggle").checked = on;
  $("settings-oldies").textContent = on ? "👓 Oldies: On" : "👓 Oldies: Off";
}
// Init both controls to match persisted state
$("oldies-toggle").checked = local.oldies;
$("settings-oldies").textContent = local.oldies ? "👓 Oldies: On" : "👓 Oldies: Off";
$("oldies-toggle").addEventListener("change", e => setOldiesMode(e.target.checked));

// ═══ CARD SIZING & LANDSCAPE MODE ═══
// Sets --card-w/h and --opp-card-w/h as inline styles on :root so they
// override any CSS defaults and respond to both window size and layout mode.
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
  if (local.boards[0].length) renderBothBoards();
}

// Touch devices (phones/tablets): auto-detect physical rotation
const isTouchDevice = navigator.maxTouchPoints > 0;
window.addEventListener("orientationchange", () => {
  if (isTouchDevice) setTimeout(() => setLandscape(window.innerWidth > window.innerHeight), 120);
});

// Any window resize: update card sizes to fit new dimensions
window.addEventListener("resize", () => {
  recalcCardSizes();
  if (local.boards[0].length) renderBothBoards();
});

// Initial setup
recalcCardSizes();
if (isTouchDevice) setLandscape(window.innerWidth > window.innerHeight);
else setLandscape(localStorage.getItem("landscape") === "1");

// ═══ LOBBY BUTTON HANDLERS ═══
// Restore persisted game in lobby select
(function() {
  const saved = localStorage.getItem("game") || "trash";
  $("game-select").value = saved;
  applyGameTheme(saved);
})();

// Live lobby theme preview when game changes + persist + update UI
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
// Apply on load
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

// Allow pressing Enter in join code input
$("join-code").addEventListener("keydown", e => {
  if (e.key === "Enter") $("join-room-btn").click();
});

// ═══ DRAW BUTTON HANDLERS ═══
$("draw-deck-btn").addEventListener("click", () => {
  if (!local.isMyTurn || local.turnPhase !== "draw") return;
  setDrawButtonsEnabled(false);
  socket.emit("drawCard", { roomId: local.roomId, source: "deck" });
});

$("draw-discard-btn").addEventListener("click", () => {
  if (!local.isMyTurn || local.turnPhase !== "draw") return;
  if (!local.topDiscard) return;
  setDrawButtonsEnabled(false);
  socket.emit("drawCard", { roomId: local.roomId, source: "discard" });
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
  applyGameTheme("trash");
  local.roomId = null;
  local.vsAI = false;
  local.gameType = "trash";
  $("room-code-display").classList.add("hidden");
  $("room-code-text").textContent = "";
  $("score-display").classList.add("hidden");
  showScreen("lobby-screen");
});

// ═══ SOCKET EVENTS ═══

socket.on("roomCreated", ({ roomId }) => {
  local.roomId = roomId;
  $("room-code-text").textContent = roomId;
  $("room-code-display").classList.remove("hidden");
});

socket.on("joinedRoom", ({ roomId }) => {
  local.roomId = roomId;
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

  // Set player/opponent names
  const me = players[myPlayerIndex];
  const opp = players.length > 1 ? players[1 - myPlayerIndex] : null;
  local.playerName = me.name;
  local.opponentName = opp ? opp.name : "";

  // Expose for game client modules
  window._gameLocal = local;

  // Apply/remove theme and music
  applyGameTheme(local.gameType);
  if (local.gameType === "trash-eleven") startElevenMusic();
  else stopElevenMusic();

  // Show 6-10 Top setting only for Trash games
  $("settings-row-order").classList.toggle("hidden", !local.gameType.startsWith("trash"));

  const isTrash = local.gameType.startsWith("trash");
  const gameClient = !isTrash && window.gameClients[local.gameType];

  // Toggle Trash UI vs game-container
  $("trash-ui").classList.toggle("hidden", !isTrash);
  $("game-container").classList.toggle("hidden", isTrash);

  if (gameClient) {
    // Non-trash game: delegate to game client module
    gameClient.onGameStart(data);
  } else {
    // Trash: use existing inline logic
    const { boards, currentPlayerIndex, deckCount } = data;
    local.boards = boards;
    local.currentPlayerIndex = currentPlayerIndex;
    local.isMyTurn = myPlayerIndex === currentPlayerIndex;
    local.turnPhase = "draw";
    local.pendingWildcard = null;
    local.validSlots = [];
    local.topDiscard = null;
    recalcCardSizes();

    $("my-label").textContent = me.name;
    $("opponent-label").textContent = opp.name + (opp.isAI ? " 🤖" : "");

    updateDeckCount(deckCount);
    renderBothBoards();
    renderDiscardPile(null);
    setDrawButtonsEnabled(local.isMyTurn);
    updateTurnIndicator();
    showChainCard(null);
  }

  requestWakeLock();
  showScreen("game-screen");
  if (local.isMyTurn) notifyMyTurn();
  else document.title = "Tiny Tiny Games";
});

socket.on("boardUpdated", ({ playerIndex, slotIndex, card, wildcardFilled, deckCount }) => {
  const prevSlot = local.boards[playerIndex][slotIndex];
  const wasHidden = prevSlot.card && !prevSlot.card.faceUp;

  prevSlot.card = card;
  prevSlot.filled = true;
  prevSlot.wildcardFilled = wildcardFilled || false;
  if (deckCount !== undefined) updateDeckCount(deckCount);

  playCardPlace();
  const isMe = playerIndex === local.myPlayerIndex;
  const boardId = isMe ? "my-board" : "opponent-board";

  if (wasHidden) {
    // 3D flip: find the slot, replace contents with flip container
    const slotEl = $(boardId).querySelector('[data-slot-index="' + slotIndex + '"]');
    if (slotEl) {
      slotEl.innerHTML = "";
      slotEl.classList.add("filled");
      if (wildcardFilled) slotEl.classList.add("wildcard-filled");
      const flipOuter = document.createElement("div");
      flipOuter.className = "card-flip";
      const flipInner = document.createElement("div");
      flipInner.className = "card-flip-inner";
      flipInner.appendChild(makeCardBack());
      flipInner.appendChild(makeCard(card));
      flipOuter.appendChild(flipInner);
      slotEl.appendChild(flipOuter);
      requestAnimationFrame(() => requestAnimationFrame(() => flipInner.classList.add("flipped")));
    }
  } else {
    // Normal re-render + scale animation
    renderBoard(playerIndex, local.boards[playerIndex]);
    const slotEl = $(boardId).querySelector('[data-slot-index="' + slotIndex + '"]');
    if (slotEl) {
      const cardEl = slotEl.querySelector(".card");
      if (cardEl) cardEl.classList.add("card-animate-in");
    }
  }
});

socket.on("lastCard", ({ playerIndex }) => {
  const isMe = playerIndex === local.myPlayerIndex;
  const name = isMe ? "You" : (local.opponentName || "Opponent");
  const area = document.querySelector(isMe ? ".my-area" : ".opponent-area");
  if (!area) return;
  const banner = document.createElement("div");
  banner.className = "last-card-alert";
  banner.textContent = `${name} — LAST CARD!`;
  area.appendChild(banner);
  sfxTone(880, 0.12, 0.14, 'sine');
  sfxTone(1100, 0.15, 0.12, 'sine', 0.12);
  setTimeout(() => banner.remove(), 2500);
});

socket.on("chainCard", ({ playerIndex, card }) => {
  const isMe = playerIndex === local.myPlayerIndex;
  if (isMe) {
    local.turnPhase = "chain";
    showChainCard(card);
    updateTurnIndicator("Chain — place or discard");
  } else {
    updateTurnIndicator(`${local.opponentName}'s chain...`);
  }
});

socket.on("chooseWildcardSlot", ({ card, validSlots }) => {
  // Only one option — auto-place without bothering the player
  if (validSlots.length === 1) {
    showChainCard(card);
    setTimeout(() => socket.emit("placeWildcard", { roomId: local.roomId, slotIndex: validSlots[0] }), 300);
    return;
  }
  local.pendingWildcard = card;
  local.validSlots = validSlots;
  local.turnPhase = "place-wildcard";
  showChainCard(card);
  const isAceChoice = card.rank !== 11 && card.rank !== 13;
  updateTurnIndicator(isAceChoice
    ? "Ace in A or ★? — tap a glowing slot"
    : `Place ${RANK_LABEL(card.rank)} — tap a glowing slot`);
  renderBoard(local.myPlayerIndex, local.boards[local.myPlayerIndex]);
});

socket.on("discarded", ({ card, playerIndex, deckCount, topDiscard }) => {
  playDiscard();
  if (deckCount !== undefined) updateDeckCount(deckCount);
  renderDiscardPile(topDiscard !== undefined ? topDiscard : card);
  showChainCard(null);
});

socket.on("deckReshuffled", ({ deckCount }) => {
  updateDeckCount(deckCount);
  updateTurnIndicator("Deck reshuffled!");
  setTimeout(() => updateTurnIndicator(), 1500);
});

socket.on("turnEnded", ({ nextPlayerIndex, topDiscard, deckCount }) => {
  local.currentPlayerIndex = nextPlayerIndex;
  local.isMyTurn = nextPlayerIndex === local.myPlayerIndex;
  local.turnPhase = "draw";
  local.pendingWildcard = null;
  local.validSlots = [];

  if (deckCount !== undefined) updateDeckCount(deckCount);
  if (topDiscard !== undefined) renderDiscardPile(topDiscard);

  showChainCard(null);
  setDrawButtonsEnabled(local.isMyTurn);
  updateTurnIndicator();

  // Re-render my board to clear wildcard highlights
  renderBoard(local.myPlayerIndex, local.boards[local.myPlayerIndex]);

  if (local.isMyTurn) { notifyMyTurn(); playTurnStart(); }
  else document.title = "Tiny Tiny Games";
});

socket.on("aiThinking", () => {
  updateTurnIndicator(`${local.opponentName} is thinking...`);
});

socket.on("gameOver", ({ winnerIndex, winnerName, scores, gamesPlayed }) => {
  releaseWakeLock();
  if (winnerIndex === local.myPlayerIndex) playWinFanfare();
  const didWin = winnerIndex === local.myPlayerIndex;
  $("result-emoji").textContent = didWin ? "🎉" : "😔";
  $("result-text").textContent = didWin ? "You Win!" : `${winnerName} Wins!`;
  // Game-specific result sub text
  const subTexts = {
    trash: didWin ? "You filled all your spots first!" : "Better luck next time.",
    "trash-eleven": didWin ? "You filled all 11 slots first!" : "Better luck next time.",
    war: didWin ? "You captured all the cards!" : "Your opponent took all the cards.",
    gofish: didWin ? "You collected the most sets!" : "Your opponent had more sets.",
    oldmaid: didWin ? "You emptied your hand!" : "You're stuck with the Old Maid!",
    solitaire: "Congratulations!",
  };
  $("result-sub").textContent = subTexts[local.gameType] || (didWin ? "Nice job!" : "Better luck next time.");
  $("play-again-btn").disabled = false;
  $("play-again-btn").textContent = (local.vsAI || local.gameType === "solitaire") ? "Play Again" : "Rematch";
  $("see-cards-btn").style.display = local.gameType.startsWith("trash") ? "" : "none";

  // Score display
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
  updateTurnIndicator("Opponent disconnected");
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

// ═══ REMAINING BUTTON WIRES ═══

// Gear / settings menu
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
  stopElevenMusic();
  local.roomId = null;
  local.myPlayerIndex = null;
  showScreen("lobby-screen");
});

// Help buttons — lobby and in-game (lobby ? button + settings panel help)
$("help-btn-lobby").addEventListener("click", openHelp);
$("help-close").addEventListener("click", closeHelp);
// Click outside the modal box to close
$("help-modal").addEventListener("click", e => {
  if (e.target === $("help-modal")) closeHelp();
});

// Share room code button
$("share-btn").addEventListener("click", () => shareRoomCode(local.roomId));

// See Cards / Back to Results (end screen ↔ game-screen view)
$("see-cards-btn").addEventListener("click", viewCards);
$("back-results-btn").addEventListener("click", closeViewCards);

// ═══ RECONNECTION ═══

// Show reconnecting message when our socket drops
socket.on("disconnect", () => {
  updateTurnIndicator("Reconnecting…");
  document.title = "Reconnecting… — Tiny Tiny Games";
});

// On connect (and reconnect), try to rejoin an active game
socket.on("connect", () => {
  if (local.roomId && local.myPlayerIndex !== null) {
    socket.emit("rejoinRoom", { roomId: local.roomId, playerIndex: local.myPlayerIndex });
  }
});

// Server confirmed rejoin — restore full game state
socket.on("gameRejoined", (data) => {
  const { roomId, myPlayerIndex, currentPlayerIndex, players, deckCount, game } = data;
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
  const gameClient = !isTrash && window.gameClients[local.gameType];

  $("trash-ui").classList.toggle("hidden", !isTrash);
  $("game-container").classList.toggle("hidden", isTrash);

  if (gameClient && gameClient.onReconnect) {
    gameClient.onReconnect(data);
  } else {
    // Trash reconnect
    const { boards, turnPhase, topDiscard, pendingWildcard, pendingValidSlots } = data;
    local.boards = boards;
    local.currentPlayerIndex = currentPlayerIndex;
    local.isMyTurn = myPlayerIndex === currentPlayerIndex;
    local.turnPhase = turnPhase;
    local.topDiscard = topDiscard;
    local.pendingWildcard = pendingWildcard || null;
    local.validSlots = pendingValidSlots || [];
    recalcCardSizes();

    $("my-label").textContent = me.name;
    $("opponent-label").textContent = opp.name + (opp.isAI ? " 🤖" : "");

    updateDeckCount(deckCount);
    renderBothBoards();
    renderDiscardPile(topDiscard || null);
    setDrawButtonsEnabled(local.isMyTurn && turnPhase === "draw");

    if (turnPhase === "place-wildcard" && local.isMyTurn && pendingWildcard) {
      renderBoard(myPlayerIndex, boards[myPlayerIndex]);
      const isAceChoice = pendingWildcard.rank !== 11 && pendingWildcard.rank !== 13;
      updateTurnIndicator(isAceChoice
        ? "Ace in A or ★? — tap a glowing slot"
        : `Place ${RANK_LABEL(pendingWildcard.rank)} — tap a glowing slot`);
    } else {
      updateTurnIndicator();
    }
  }

  showScreen("game-screen");
  document.title = "Tiny Tiny Games";
});

// Opponent's socket dropped — give them time to reconnect
socket.on("opponentDisconnecting", () => {
  updateTurnIndicator(`${local.opponentName || "Opponent"} reconnecting…`);
});

// Opponent reconnected successfully
socket.on("opponentReconnected", () => {
  updateTurnIndicator();
});

// Opponent quit voluntarily
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
