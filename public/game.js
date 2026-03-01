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
  turnPhase: "draw",     // "draw" | "chain" | "place-wildcard"
  pendingWildcard: null,
  validSlots: [],
  isMyTurn: false,
  deckCount: 0,
  topDiscard: null,
  vsAI: false,
  rowReversed: false,  // if true, render slots 5-9 on top row, 0-4 on bottom
};

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
const SLOT_LABELS = ["A","2","3","4","5","6","7","8","9","10"];

function renderBoard(playerIndex, board) {
  const isMe = playerIndex === local.myPlayerIndex;
  const container = $(isMe ? "my-board" : "opponent-board");
  container.innerHTML = "";

  // Row order: normal = [0..9], reversed = [5-9, 0-4]
  const order = local.rowReversed
    ? [5, 6, 7, 8, 9, 0, 1, 2, 3, 4]
    : [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

  order.forEach(i => {
    const slot = board[i];
    const slotEl = document.createElement("div");
    slotEl.className = "card-slot" + (slot.filled ? " filled" : "");
    slotEl.dataset.slotIndex = i;

    // Slot number hint (visible when empty)
    if (!slot.filled) {
      const hint = document.createElement("span");
      hint.className = "slot-hint";
      hint.textContent = SLOT_LABELS[i];
      slotEl.appendChild(hint);
    }

    if (slot.card && slot.card.faceUp) {
      const cardEl = makeCard(slot.card);
      slotEl.appendChild(cardEl);
    } else if (slot.card && !slot.card.faceUp) {
      slotEl.appendChild(makeCardBack());
    }

    // Wildcard slot highlighting (only my board, only my turn)
    if (isMe &&
        local.turnPhase === "place-wildcard" &&
        local.validSlots.includes(i)) {
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
  const takeBtn = $("draw-discard-btn");
  takeBtn.disabled = !topCard || !local.isMyTurn || local.turnPhase !== "draw";
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
function setDrawButtonsEnabled(enabled) {
  $("draw-deck-btn").disabled = !enabled;
  $("draw-discard-btn").disabled = !enabled || !local.topDiscard;
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
  el.style.left = `${20 + Math.random() * 55}vw`;
  if (isMe) { el.style.bottom = "28vh"; el.style.top = "auto"; }
  else       { el.style.top = "25vh";   el.style.bottom = "auto"; }
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

// ═══ CARD SIZING & LANDSCAPE MODE ═══
// Sets --card-w/h and --opp-card-w/h as inline styles on :root so they
// override any CSS defaults and respond to both window size and layout mode.
function recalcCardSizes() {
  const isLandscape = document.body.classList.contains("is-landscape");
  const vw = window.innerWidth;
  const gap = isLandscape ? 4 : 6;

  let cardW;
  if (isLandscape) {
    // Each side panel gets roughly half the viewport minus the center column
    const centerW = Math.min(280, Math.max(140, vw * 0.18));
    const sideW   = (vw - centerW - 16 - gap * 2) / 2;
    cardW = Math.max(34, Math.floor((sideW - 4 * gap) / 5));
  } else {
    // Portrait: fill up to a comfortable game width, then scale up to fill the screen
    const gameW = Math.min(vw - 16, Math.max(vw * 0.92, 320));
    cardW = Math.max(44, Math.floor((gameW - 4 * gap) / 5));
  }
  // Height guard: 4 card rows (2 mine + 2 opp) plus ~200px for center/chrome
  // Prevents overflow on short/landscape-ish portrait windows
  const maxCardWByHeight = Math.floor(((window.innerHeight - 200) / 4) / 1.43);
  cardW = Math.min(cardW, Math.max(44, maxCardWByHeight));

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
$("vs-ai-btn").addEventListener("click", () => {
  const name = $("player-name").value.trim() || "Player";
  local.playerName = name;
  local.vsAI = true;
  socket.emit("playVsAI", { playerName: name });
});

$("create-room-btn").addEventListener("click", () => {
  const name = $("player-name").value.trim() || "Player";
  local.playerName = name;
  socket.emit("createRoom", { playerName: name });
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
  if (local.vsAI) {
    const name = local.playerName || "Player";
    socket.emit("playVsAI", { playerName: name });
  } else {
    const name = local.playerName || "Player";
    socket.emit("createRoom", { playerName: name });
    showScreen("lobby-screen");
    $("room-code-display").classList.remove("hidden");
  }
});

$("back-lobby-btn").addEventListener("click", () => {
  local.roomId = null;
  local.vsAI = false;
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

socket.on("gameStart", ({ roomId, myPlayerIndex, boards, currentPlayerIndex, players, deckCount }) => {
  local.roomId = roomId;
  local.myPlayerIndex = myPlayerIndex;
  local.boards = boards;
  local.currentPlayerIndex = currentPlayerIndex;
  local.isMyTurn = myPlayerIndex === currentPlayerIndex;
  local.turnPhase = "draw";
  local.pendingWildcard = null;
  local.validSlots = [];
  local.topDiscard = null;

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

socket.on("boardUpdated", ({ playerIndex, slotIndex, card, deckCount }) => {
  local.boards[playerIndex][slotIndex].card = card;
  local.boards[playerIndex][slotIndex].filled = true;
  if (deckCount !== undefined) updateDeckCount(deckCount);
  renderBoard(playerIndex, local.boards[playerIndex]);

  // Animate the slot
  const isMe = playerIndex === local.myPlayerIndex;
  const boardId = isMe ? "my-board" : "opponent-board";
  const slot = $(boardId).children[slotIndex];
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
  local.pendingWildcard = card;
  local.validSlots = validSlots;
  local.turnPhase = "place-wildcard";
  showChainCard(card);
  updateTurnIndicator(`Place ${RANK_LABEL(card.rank)} — tap a glowing slot`);
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
  $("result-sub").textContent = didWin
    ? "You filled all your spots first!"
    : `Better luck next time.`;
  setTimeout(() => showScreen("end-screen"), 800);
});

socket.on("opponentDisconnected", () => {
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
