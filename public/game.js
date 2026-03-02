/* ═══════════════════════════════════════════════
   TRASH CARD GAME — Client
   ═══════════════════════════════════════════════ */

const socket = io();

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
  rowReversed: false,
  variant: "default",
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
    <span class="card-corner tl">${rank}<br>${sym}</span>
    <span class="card-center">${sym}</span>
    <span class="card-corner br">${rank}<br>${sym}</span>
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

  const isEleven = local.variant === "eleven";
  container.classList.toggle("eleven-board", isEleven);

  let order;
  if (isEleven) {
    order = local.rowReversed
      ? [5, 6, 7, 8, 9, 10, 0, 1, 2, 3, 4]
      : [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  } else {
    order = local.rowReversed
      ? [5, 6, 7, 8, 9, 0, 1, 2, 3, 4]
      : [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
  }

  order.forEach(i => {
    const slot = board[i];
    if (!slot) return;
    const slotEl = document.createElement("div");
    let cls = "card-slot";
    if (slot.filled)          cls += " filled";
    if (slot.wildcardFilled)  cls += " wildcard-filled";
    if (i === 10)             cls += " eleven-slot";
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

    container.appendChild(slotEl);
  });
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
  if (local.isMyTurn) {
    el.textContent = "Your Turn";
    el.className = "turn-indicator my-turn";
  } else {
    const name = local.opponentName || "Opponent";
    el.textContent = `${name}'s Turn`;
    el.className = "turn-indicator their-turn";
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
  if (local.variant === "eleven" && slot.wildcardFilled) return idx;
  if (local.variant === "eleven" && card.rank === 1 && board[10]) {
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
  document.title = "⚡ Your Turn! — Trash";
  // Board glow
  const myArea = document.querySelector(".my-area");
  myArea.classList.remove("turn-flash");
  void myArea.offsetWidth; // force reflow to restart animation
  myArea.classList.add("turn-flash");
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

let lastReactionTime = 0;
document.querySelectorAll(".reaction-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    if (!local.roomId) return;
    const now = Date.now();
    if (now - lastReactionTime < 1000) return; // 1s cooldown
    lastReactionTime = now;
    socket.emit("sendReaction", { roomId: local.roomId, emoji: btn.dataset.emoji });
  });
});

// ═══ ELEVEN VARIANT THEME ═══
function applyVariantTheme(variant) {
  document.body.classList.toggle("variant-eleven", variant === "eleven");
}

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
    const btn = $("settings-music");
    if (btn) { btn.classList.remove("hidden"); btn.textContent = musicMuted ? "🔇 Music" : "🔊 Music"; }
  } catch(e) {}
}
function stopElevenMusic() {
  clearTimeout(musicScheduleTimer);
  if (musicCtx) { musicCtx.close().catch(()=>{}); musicCtx = null; musicMasterGain = null; }
  const btn = $("settings-music");
  if (btn) btn.classList.add("hidden");
}
function toggleMusic() {
  musicMuted = !musicMuted;
  if (musicMasterGain) musicMasterGain.gain.setTargetAtTime(musicMuted ? 0 : 0.55, musicCtx.currentTime, 0.1);
  const btn = $("settings-music");
  if (btn) btn.textContent = musicMuted ? "🔇 Music" : "🔊 Music";
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

// ═══ ROW ORDER TOGGLE ═══
$("row-order-toggle").addEventListener("change", e => {
  local.rowReversed = e.target.checked;
  if (local.boards[0].length) renderBothBoards();
});

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
  const isEleven    = local.variant === "eleven";
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

  const oppCardW = Math.max(30, Math.round(cardW * (isLandscape ? 0.92 : 0.86)));

  const r = document.documentElement;
  r.style.setProperty("--card-w",     `${cardW}px`);
  r.style.setProperty("--card-h",     `${Math.round(cardW * 1.43)}px`);
  r.style.setProperty("--opp-card-w", `${oppCardW}px`);
  r.style.setProperty("--opp-card-h", `${Math.round(oppCardW * 1.43)}px`);
}

function setLandscape(on) {
  document.body.classList.toggle("is-landscape", on);
  $("landscape-toggle").checked = on;
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

// Manual toggle: works on any device, overrides auto-detection on desktop
$("landscape-toggle").addEventListener("change", e => {
  document.body.classList.toggle("is-landscape", e.target.checked);
  recalcCardSizes();
  if (local.boards[0].length) renderBothBoards();
});

// ═══ LOBBY BUTTON HANDLERS ═══
// Live lobby theme preview when variant changes
$("variant-select").addEventListener("change", e => applyVariantTheme(e.target.value));

$("vs-ai-btn").addEventListener("click", () => {
  const name = $("player-name").value.trim() || "Player";
  local.playerName = name;
  local.vsAI = true;
  socket.emit("playVsAI", { playerName: name, variant: $("variant-select").value });
});

$("create-room-btn").addEventListener("click", () => {
  const name = $("player-name").value.trim() || "Player";
  local.playerName = name;
  socket.emit("createRoom", { playerName: name, variant: $("variant-select").value });
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
  stopElevenMusic();
  applyVariantTheme("default");
  local.roomId = null;
  local.vsAI = false;
  local.variant = "default";
  $("room-code-display").classList.add("hidden");
  $("room-code-text").textContent = "";
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

socket.on("gameStart", ({ roomId, myPlayerIndex, boards, currentPlayerIndex, players, deckCount, variant }) => {
  local.roomId = roomId;
  local.myPlayerIndex = myPlayerIndex;
  local.boards = boards;
  local.currentPlayerIndex = currentPlayerIndex;
  local.isMyTurn = myPlayerIndex === currentPlayerIndex;
  local.turnPhase = "draw";
  local.pendingWildcard = null;
  local.validSlots = [];
  local.topDiscard = null;
  local.variant = variant || "default";
  // Apply/remove theme and music
  applyVariantTheme(local.variant);
  if (local.variant === "eleven") startElevenMusic();
  else stopElevenMusic();
  recalcCardSizes();

  // Set player/opponent names
  const me = players[myPlayerIndex];
  const opp = players[1 - myPlayerIndex];
  local.playerName = me.name;
  local.opponentName = opp.name;

  $("my-label").textContent = me.name;
  $("opponent-label").textContent = opp.name + (opp.isAI ? " 🤖" : "");

  updateDeckCount(deckCount);
  renderBothBoards();
  renderDiscardPile(null);
  setDrawButtonsEnabled(local.isMyTurn);
  updateTurnIndicator();
  showChainCard(null);
  showScreen("game-screen");
  if (local.isMyTurn) notifyMyTurn();
  else document.title = "Trash ✨";
});

socket.on("boardUpdated", ({ playerIndex, slotIndex, card, wildcardFilled, deckCount }) => {
  local.boards[playerIndex][slotIndex].card = card;
  local.boards[playerIndex][slotIndex].filled = true;
  local.boards[playerIndex][slotIndex].wildcardFilled = wildcardFilled || false;
  if (deckCount !== undefined) updateDeckCount(deckCount);
  renderBoard(playerIndex, local.boards[playerIndex]);

  // Animate the slot
  const isMe = playerIndex === local.myPlayerIndex;
  const boardId = isMe ? "my-board" : "opponent-board";
  const slot = $(boardId).querySelector('[data-slot-index="' + slotIndex + '"]');
  if (slot) {
    const cardEl = slot.querySelector(".card");
    if (cardEl) cardEl.classList.add("card-animate-in");
  }
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

  if (local.isMyTurn) notifyMyTurn();
  else document.title = "Trash ✨";
});

socket.on("aiThinking", () => {
  updateTurnIndicator(`${local.opponentName} is thinking...`);
});

socket.on("gameOver", ({ winnerIndex, winnerName }) => {
  const didWin = winnerIndex === local.myPlayerIndex;
  $("result-emoji").textContent = didWin ? "🎉" : "😔";
  $("result-text").textContent = didWin ? "You Win!" : `${winnerName} Wins!`;
  $("result-sub").textContent = didWin ? "You filled all your spots first!" : "Better luck next time.";
  $("play-again-btn").disabled = false;
  $("play-again-btn").textContent = local.vsAI ? "Play Again" : "Rematch";
  setTimeout(() => showScreen("end-screen"), 800);
});

socket.on("rematchRequested", ({ playerIndex }) => {
  if (playerIndex !== local.myPlayerIndex) {
    $("result-sub").textContent = `${local.opponentName} wants a rematch!`;
  }
});

socket.on("opponentDisconnected", () => {
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
$("settings-help").addEventListener("click", () => {
  openHelp();
  $("settings-panel").classList.add("hidden");
});
$("settings-quit").addEventListener("click", () => {
  $("settings-panel").classList.add("hidden");
  if (!local.roomId) return;
  if (!confirm("Quit game? Your opponent will be notified.")) return;
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
  document.title = "Reconnecting… — Trash";
});

// On connect (and reconnect), try to rejoin an active game
socket.on("connect", () => {
  if (local.roomId && local.myPlayerIndex !== null) {
    socket.emit("rejoinRoom", { roomId: local.roomId, playerIndex: local.myPlayerIndex });
  }
});

// Server confirmed rejoin — restore full game state
socket.on("gameRejoined", ({
  roomId, myPlayerIndex, boards, currentPlayerIndex, players,
  deckCount, variant, turnPhase, topDiscard,
  pendingWildcard, pendingValidSlots,
}) => {
  local.roomId              = roomId;
  local.myPlayerIndex       = myPlayerIndex;
  local.boards              = boards;
  local.currentPlayerIndex  = currentPlayerIndex;
  local.isMyTurn            = myPlayerIndex === currentPlayerIndex;
  local.turnPhase           = turnPhase;
  local.topDiscard          = topDiscard;
  local.variant             = variant || "default";
  local.pendingWildcard     = pendingWildcard || null;
  local.validSlots          = pendingValidSlots || [];

  applyVariantTheme(local.variant);
  if (local.variant === "eleven") startElevenMusic();
  recalcCardSizes();

  const me  = players[myPlayerIndex];
  const opp = players[1 - myPlayerIndex];
  local.playerName   = me.name;
  local.opponentName = opp.name;
  $("my-label").textContent       = me.name;
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

  showScreen("game-screen");
  document.title = "Trash ✨";
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
  stopElevenMusic();
  setTimeout(() => {
    $("result-emoji").textContent = "🏆";
    $("result-text").textContent = "You Win!";
    $("result-sub").textContent = "Opponent quit the game.";
    showScreen("end-screen");
  }, 500);
});
