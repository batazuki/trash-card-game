// games/trash-client.js — Trash/Eleven card game client module

(function() {
  // Access shared utilities from game.js
  const shared = () => window._gameShared;
  const local = () => window._gameLocal;
  const $ = id => document.getElementById(id);

  // ═══ BOARD RENDERING ═══
  function renderBoard(playerIndex, board) {
    const loc = local();
    const isMe = playerIndex === loc.myPlayerIndex;
    const container = $(isMe ? "my-board" : "opponent-board");
    if (!container) return;
    container.innerHTML = "";

    const isEleven = loc.gameType === "trash-eleven";
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
        hint.textContent = shared().SLOT_LABELS[i];
        slotEl.appendChild(hint);
      }
      if (slot.card && slot.card.faceUp) {
        slotEl.appendChild(shared().makeCard(slot.card));
      } else if (slot.card && !slot.card.faceUp) {
        slotEl.appendChild(shared().makeCardBack());
      }
      if (isMe && loc.turnPhase === "place-wildcard" && loc.validSlots.includes(i)) {
        slotEl.classList.add("valid-slot");
        slotEl.addEventListener("click", () => onSlotClick(i), { once: true });
      }
      return slotEl;
    }

    if (isEleven) {
      const mainGrid = document.createElement("div");
      mainGrid.className = "eleven-main-grid";
      const mainOrder = loc.rowReversed
        ? [5, 6, 7, 8, 9, 0, 1, 2, 3, 4]
        : [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
      mainOrder.forEach(i => { const el = buildSlotEl(i); if (el) mainGrid.appendChild(el); });
      container.appendChild(mainGrid);
      const starEl = buildSlotEl(10);
      if (starEl) container.appendChild(starEl);
    } else {
      const order = loc.rowReversed
        ? [5, 6, 7, 8, 9, 0, 1, 2, 3, 4]
        : [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
      order.forEach(i => { const el = buildSlotEl(i); if (el) container.appendChild(el); });
    }
  }

  function renderBothBoards() {
    const loc = local();
    renderBoard(0, loc.boards[0]);
    renderBoard(1, loc.boards[1]);
  }

  // ═══ DISCARD PILE ═══
  function renderDiscardPile(topCard) {
    const loc = local();
    loc.topDiscard = topCard;
    const el = $("discard-pile");
    if (!el) return;
    el.innerHTML = "";

    if (topCard) {
      el.className = "pile-card";
      el.style.width = "";
      el.style.height = "";
      el.appendChild(shared().makeCard(topCard));
    } else {
      el.className = "pile-card discard-empty";
      el.innerHTML = `<span class="pile-empty-label">Empty</span>`;
    }

    const label = $("discard-pile-label");
    if (label) label.textContent = "Discard";

    const myBoard = loc.boards[loc.myPlayerIndex] || [];
    const takeBtn = $("draw-discard-btn");
    if (takeBtn) takeBtn.disabled = !loc.isMyTurn || loc.turnPhase !== "draw" || !canUseDiscard(topCard, myBoard);
  }

  function updateDeckCount(count) {
    const loc = local();
    loc.deckCount = count;
    const el = $("deck-count");
    if (el) el.textContent = count;
  }

  // ═══ TURN INDICATOR ═══
  function updateTurnIndicator(msg) {
    const loc = local();
    const el = $("turn-indicator");
    if (!el) return;
    if (msg) {
      el.textContent = msg;
      el.className = "turn-indicator";
      return;
    }
    const newClass = loc.isMyTurn ? "turn-indicator my-turn" : "turn-indicator their-turn";
    const newText  = loc.isMyTurn ? "Your Turn" : `${loc.opponentName || "Opponent"}'s Turn`;
    const changed  = el.textContent !== newText;
    el.textContent = newText;
    el.className = newClass;
    if (changed) {
      el.classList.add("turn-pop");
      el.addEventListener("animationend", () => el.classList.remove("turn-pop"), { once: true });
    }
  }

  // ═══ DRAW LOGIC ═══
  function getValidSlotClient(card, board) {
    const loc = local();
    if (!card || card.rank < 1 || card.rank > 10) return null;
    const idx = card.rank - 1;
    const slot = board[idx];
    if (!slot) return null;
    if (!slot.filled) return idx;
    if (loc.gameType === "trash-eleven" && slot.wildcardFilled) return idx;
    if (loc.gameType === "trash-eleven" && card.rank === 1 && board[10]) {
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
    const loc = local();
    const deckBtn = $("draw-deck-btn");
    const discardBtn = $("draw-discard-btn");
    if (deckBtn) deckBtn.disabled = !enabled;
    if (discardBtn) {
      const myBoard = loc.boards[loc.myPlayerIndex] || [];
      discardBtn.disabled = !enabled || !canUseDiscard(loc.topDiscard, myBoard);
    }
  }

  // ═══ CHAIN DISPLAY ═══
  function showChainCard(card) {
    const loc = local();
    const label = $("discard-pile-label");
    if (card) {
      const el = $("discard-pile");
      if (!el) return;
      el.innerHTML = "";
      el.className = "pile-card";
      el.appendChild(shared().makeCard(card));
      if (label) label.textContent = "Chain";
    } else {
      renderDiscardPile(loc.topDiscard);
    }
  }

  // ═══ SFX ═══
  function playCardPlace() {
    shared().sfxTone(700, 0.07, 0.18, 'sine');
    shared().sfxTone(440, 0.09, 0.06, 'triangle', 0.01);
  }
  function playDiscard() {
    shared().sfxTone(380, 0.12, 0.10, 'sine');
  }
  function playTurnStart() {
    shared().sfxTone(660, 0.10, 0.12, 'sine');
    shared().sfxTone(880, 0.12, 0.10, 'sine', 0.10);
  }

  // ═══ SLOT CLICK (WILDCARD) ═══
  function onSlotClick(slotIndex) {
    const loc = local();
    if (loc.turnPhase !== "place-wildcard") return;
    if (!loc.validSlots.includes(slotIndex)) return;
    loc.validSlots = [];
    loc.turnPhase = "chain";
    setDrawButtonsEnabled(false);
    socket.emit("placeWildcard", { roomId: loc.roomId, slotIndex });
  }

  // ═══ BUILD UI ═══
  function buildUI(container) {
    container.innerHTML = `
      <div class="player-area opponent-area">
        <div class="player-label" id="opponent-label">Opponent</div>
        <div class="board" id="opponent-board"></div>
      </div>

      <div id="game-center">
        <div id="turn-indicator" class="turn-indicator">Your Turn</div>

        <div class="pile-row">
          <div class="pile-container">
            <div id="deck-pile" class="card card-back pile-card">
              <span id="deck-count" class="deck-count">52</span>
            </div>
            <div class="pile-label">Deck</div>
          </div>
          <div class="pile-container">
            <div id="discard-pile" class="pile-card discard-empty">
              <span class="pile-empty-label">Empty</span>
            </div>
            <div class="pile-label" id="discard-pile-label">Discard</div>
          </div>
        </div>

        <div class="draw-buttons">
          <button class="btn btn-draw" id="draw-deck-btn">Draw from Deck</button>
          <button class="btn btn-draw btn-discard-draw" id="draw-discard-btn" disabled>Take Discard</button>
        </div>
      </div>

      <div class="player-area my-area">
        <div class="player-label" id="my-label">You</div>
        <div id="reaction-bar" class="reaction-bar">
          <button class="reaction-btn" data-emoji="👍">👍</button>
          <button class="reaction-btn" data-emoji="😂">😂</button>
          <button class="reaction-btn" data-emoji="😮">😮</button>
          <button class="reaction-btn" data-emoji="🔥">🔥</button>
          <button class="reaction-btn" data-emoji="💀">💀</button>
          <button class="reaction-btn" data-emoji="😬">😬</button>
          <button class="reaction-btn" data-emoji="🦍">🦍</button>
          <button class="reaction-btn" data-emoji="6️⃣7️⃣">6️⃣7️⃣</button>
        </div>
        <div class="board" id="my-board"></div>
      </div>

      <div id="view-only-banner" class="view-only-banner hidden">
        <span>Viewing final board</span>
        <button class="btn btn-secondary" id="back-results-btn">← Results</button>
      </div>
    `;

    // Wire draw buttons
    $("draw-deck-btn").addEventListener("click", () => {
      const loc = local();
      if (!loc.isMyTurn || loc.turnPhase !== "draw") return;
      setDrawButtonsEnabled(false);
      socket.emit("drawCard", { roomId: loc.roomId, source: "deck" });
    });

    $("draw-discard-btn").addEventListener("click", () => {
      const loc = local();
      if (!loc.isMyTurn || loc.turnPhase !== "draw") return;
      if (!loc.topDiscard) return;
      setDrawButtonsEnabled(false);
      socket.emit("drawCard", { roomId: loc.roomId, source: "discard" });
    });

    // Wire view-cards back button
    $("back-results-btn").addEventListener("click", () => {
      const loc = local();
      loc.viewingCards = false;
      $("view-only-banner").classList.add("hidden");
      shared().showScreen("end-screen");
    });

    // Wire reaction buttons inside trash-ui
    container.querySelectorAll(".reaction-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        const loc = local();
        if (!loc.roomId) return;
        socket.emit("sendReaction", { roomId: loc.roomId, emoji: btn.dataset.emoji });
      });
    });
  }

  // ═══ SOCKET HANDLERS ═══
  function registerSocketHandlers() {
    socket.on("boardUpdated", ({ playerIndex, slotIndex, card, wildcardFilled, deckCount }) => {
      const loc = local();
      if (!loc.gameType.startsWith("trash")) return;
      const prevSlot = loc.boards[playerIndex][slotIndex];
      const wasHidden = prevSlot.card && !prevSlot.card.faceUp;

      prevSlot.card = card;
      prevSlot.filled = true;
      prevSlot.wildcardFilled = wildcardFilled || false;
      if (deckCount !== undefined) updateDeckCount(deckCount);

      playCardPlace();
      const isMe = playerIndex === loc.myPlayerIndex;
      const boardId = isMe ? "my-board" : "opponent-board";

      if (wasHidden) {
        const slotEl = $(boardId).querySelector('[data-slot-index="' + slotIndex + '"]');
        if (slotEl) {
          slotEl.innerHTML = "";
          slotEl.classList.add("filled");
          if (wildcardFilled) slotEl.classList.add("wildcard-filled");
          shared().animateFlip(slotEl, card);
        }
      } else {
        renderBoard(playerIndex, loc.boards[playerIndex]);
        const slotEl = $(boardId).querySelector('[data-slot-index="' + slotIndex + '"]');
        if (slotEl) {
          const cardEl = slotEl.querySelector(".card");
          if (cardEl) cardEl.classList.add("card-animate-in");
        }
      }
    });

    socket.on("lastCard", ({ playerIndex }) => {
      const loc = local();
      if (!loc.gameType.startsWith("trash")) return;
      const isMe = playerIndex === loc.myPlayerIndex;
      const name = isMe ? "You" : (loc.opponentName || "Opponent");
      const area = document.querySelector(isMe ? ".my-area" : ".opponent-area");
      if (!area) return;
      const banner = document.createElement("div");
      banner.className = "last-card-alert";
      banner.textContent = `${name} — LAST CARD!`;
      area.appendChild(banner);
      shared().sfxTone(880, 0.12, 0.14, 'sine');
      shared().sfxTone(1100, 0.15, 0.12, 'sine', 0.12);
      setTimeout(() => banner.remove(), 2500);
    });

    socket.on("chainCard", ({ playerIndex, card }) => {
      const loc = local();
      if (!loc.gameType.startsWith("trash")) return;
      const isMe = playerIndex === loc.myPlayerIndex;
      if (isMe) {
        loc.turnPhase = "chain";
        showChainCard(card);
        updateTurnIndicator("Chain — place or discard");
      } else {
        updateTurnIndicator(`${loc.opponentName}'s chain...`);
      }
    });

    socket.on("chooseWildcardSlot", ({ card, validSlots }) => {
      const loc = local();
      if (!loc.gameType.startsWith("trash")) return;
      if (validSlots.length === 1) {
        showChainCard(card);
        setTimeout(() => socket.emit("placeWildcard", { roomId: loc.roomId, slotIndex: validSlots[0] }), 300);
        return;
      }
      loc.pendingWildcard = card;
      loc.validSlots = validSlots;
      loc.turnPhase = "place-wildcard";
      showChainCard(card);
      const isAceChoice = card.rank !== 11 && card.rank !== 13;
      updateTurnIndicator(isAceChoice
        ? "Ace in A or ★? — tap a glowing slot"
        : `Place ${shared().RANK_LABEL(card.rank)} — tap a glowing slot`);
      renderBoard(loc.myPlayerIndex, loc.boards[loc.myPlayerIndex]);
    });

    socket.on("discarded", ({ card, playerIndex, deckCount, topDiscard }) => {
      const loc = local();
      if (!loc.gameType.startsWith("trash")) return;
      playDiscard();
      if (deckCount !== undefined) updateDeckCount(deckCount);
      renderDiscardPile(topDiscard !== undefined ? topDiscard : card);
      showChainCard(null);
    });

    socket.on("deckReshuffled", ({ deckCount }) => {
      const loc = local();
      if (!loc.gameType.startsWith("trash")) return;
      updateDeckCount(deckCount);
      updateTurnIndicator("Deck reshuffled!");
      setTimeout(() => updateTurnIndicator(), 1500);
    });

    socket.on("turnEnded", ({ nextPlayerIndex, topDiscard, deckCount }) => {
      const loc = local();
      if (!loc.gameType.startsWith("trash")) return;
      loc.currentPlayerIndex = nextPlayerIndex;
      loc.isMyTurn = nextPlayerIndex === loc.myPlayerIndex;
      loc.turnPhase = "draw";
      loc.pendingWildcard = null;
      loc.validSlots = [];

      if (deckCount !== undefined) updateDeckCount(deckCount);
      if (topDiscard !== undefined) renderDiscardPile(topDiscard);

      showChainCard(null);
      setDrawButtonsEnabled(loc.isMyTurn);
      updateTurnIndicator();

      renderBoard(loc.myPlayerIndex, loc.boards[loc.myPlayerIndex]);

      if (loc.isMyTurn) { shared().notifyMyTurn(); playTurnStart(); }
      else document.title = "Tiny Tiny Games";
    });

    socket.on("aiThinking", () => {
      const loc = local();
      if (!loc.gameType.startsWith("trash")) return;
      updateTurnIndicator(`${loc.opponentName} is thinking...`);
    });
  }

  // Register socket handlers immediately
  registerSocketHandlers();

  // ═══ REGISTER GAME CLIENT ═══
  window.gameClients = window.gameClients || {};

  const trashClient = {
    onGameStart(data) {
      const loc = local();
      const container = $("trash-ui");
      buildUI(container);

      const { boards, currentPlayerIndex, deckCount, myPlayerIndex, players } = data;
      loc.boards = boards;
      loc.currentPlayerIndex = currentPlayerIndex;
      loc.isMyTurn = myPlayerIndex === currentPlayerIndex;
      loc.turnPhase = "draw";
      loc.pendingWildcard = null;
      loc.validSlots = [];
      loc.topDiscard = null;
      shared().recalcCardSizes();

      const me = players[myPlayerIndex];
      const opp = players.length > 1 ? players[1 - myPlayerIndex] : null;
      $("my-label").textContent = me.name;
      $("opponent-label").textContent = (opp ? opp.name : "Opponent") + (opp && opp.isAI ? " 🤖" : "");

      updateDeckCount(deckCount);
      renderBothBoards();
      renderDiscardPile(null);
      setDrawButtonsEnabled(loc.isMyTurn);
      updateTurnIndicator();
      showChainCard(null);

      // Deal animation
      const da = shared().dealAnimate;
      if (da) da(container, ".card-slot .card", 40);
    },

    onReconnect(data) {
      const loc = local();
      const container = $("trash-ui");
      buildUI(container);

      const { boards, currentPlayerIndex, deckCount, myPlayerIndex, players,
              turnPhase, topDiscard, pendingWildcard, pendingValidSlots } = data;
      loc.boards = boards;
      loc.currentPlayerIndex = currentPlayerIndex;
      loc.isMyTurn = myPlayerIndex === currentPlayerIndex;
      loc.turnPhase = turnPhase;
      loc.topDiscard = topDiscard;
      loc.pendingWildcard = pendingWildcard || null;
      loc.validSlots = pendingValidSlots || [];
      shared().recalcCardSizes();

      const me = players[myPlayerIndex];
      const opp = players.length > 1 ? players[1 - myPlayerIndex] : null;
      $("my-label").textContent = me.name;
      $("opponent-label").textContent = (opp ? opp.name : "Opponent") + (opp && opp.isAI ? " 🤖" : "");

      updateDeckCount(deckCount);
      renderBothBoards();
      renderDiscardPile(topDiscard || null);
      setDrawButtonsEnabled(loc.isMyTurn && turnPhase === "draw");

      if (turnPhase === "place-wildcard" && loc.isMyTurn && pendingWildcard) {
        renderBoard(myPlayerIndex, boards[myPlayerIndex]);
        const isAceChoice = pendingWildcard.rank !== 11 && pendingWildcard.rank !== 13;
        updateTurnIndicator(isAceChoice
          ? "Ace in A or ★? — tap a glowing slot"
          : `Place ${shared().RANK_LABEL(pendingWildcard.rank)} — tap a glowing slot`);
      } else {
        updateTurnIndicator();
      }
    },

    cleanup() {
      // Nothing to clean up — socket handlers persist and self-filter via gameType check
    },

    // Expose for game.js resize/rowOrder callbacks
    renderBothBoards,
  };

  window.gameClients.trash = trashClient;
  window.gameClients["trash-eleven"] = trashClient;
})();
