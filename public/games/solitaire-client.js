// games/solitaire-client.js — Klondike Solitaire client (client-authoritative)

(function() {
  const { makeCard: _makeCard, makeCardBack, isRed } = window._gameShared;

  let state = {
    tableau: [],       // 7 columns of cards
    foundations: [[], [], [], []], // 4 piles (one per suit)
    stock: [],
    waste: [],
    selected: null,    // { source, colIdx, cardIdx } or null
    moves: 0,
    startTime: 0,
    timerInterval: null,
    wasteFlip: false,  // true when waste card should animate a flip
    autoCompleting: false,
    dragging: null,    // { source, colIdx, cardIdx, cards, startX, startY, ghostEl, pointerId }
  };

  function makeCard(card) {
    if (!card.faceUp) return makeCardBack();
    return _makeCard(card);
  }

  function buildUI(container) {
    container.innerHTML = `
      <div class="sol-layout">
        <div class="sol-top">
          <div class="sol-stock-waste">
            <div class="sol-stock" id="sol-stock">
              <div class="card card-back"><span class="deck-count" id="sol-stock-count">0</span></div>
            </div>
            <div class="sol-waste" id="sol-waste"></div>
          </div>
          <div class="sol-foundations" id="sol-foundations">
            <div class="sol-foundation" data-idx="0"><span class="sol-foundation-label">♥</span></div>
            <div class="sol-foundation" data-idx="1"><span class="sol-foundation-label">♦</span></div>
            <div class="sol-foundation" data-idx="2"><span class="sol-foundation-label">♣</span></div>
            <div class="sol-foundation" data-idx="3"><span class="sol-foundation-label">♠</span></div>
          </div>
        </div>
        <div class="sol-tableau" id="sol-tableau"></div>
        <div class="sol-status">
          <span id="sol-moves">Moves: 0</span>
          <span id="sol-timer">Time: 0:00</span>
        </div>
      </div>
    `;
  }

  function canPlaceOnFoundation(card, foundIdx) {
    const pile = state.foundations[foundIdx];
    if (pile.length === 0) return card.rank === 1; // only Ace starts
    const top = pile[pile.length - 1];
    return card.suit === top.suit && card.rank === top.rank + 1;
  }

  function canPlaceOnTableau(card, colIdx) {
    const col = state.tableau[colIdx];
    if (col.length === 0) return card.rank === 13; // only King on empty
    const top = col[col.length - 1];
    return top.faceUp && isRed(card.suit) !== isRed(top.suit) && card.rank === top.rank - 1;
  }

  function getFoundationIndex(card) {
    // Try to auto-place on correct foundation
    for (let i = 0; i < 4; i++) {
      if (canPlaceOnFoundation(card, i)) return i;
    }
    return -1;
  }

  function flipTopCard(colIdx) {
    const col = state.tableau[colIdx];
    if (col.length > 0 && !col[col.length - 1].faceUp) {
      col[col.length - 1].faceUp = true;
    }
  }

  function checkWin() {
    return state.foundations.every(f => f.length === 13);
  }

  function hasAnyMoves() {
    // Can we flip stock or recycle waste?
    if (state.stock.length > 0) return true;
    if (state.stock.length === 0 && state.waste.length > 0) return true;

    // Check waste top card
    if (state.waste.length > 0) {
      const w = state.waste[state.waste.length - 1];
      // Can waste card go to any foundation?
      for (let i = 0; i < 4; i++) {
        if (canPlaceOnFoundation(w, i)) return true;
      }
      // Can waste card go to any tableau column?
      for (let i = 0; i < 7; i++) {
        if (canPlaceOnTableau(w, i)) return true;
      }
      // King to empty column
      if (w.rank === 13 && state.tableau.some(c => c.length === 0)) return true;
    }

    // Check tableau moves
    for (let ci = 0; ci < 7; ci++) {
      const col = state.tableau[ci];
      if (col.length === 0) continue;
      const top = col[col.length - 1];
      if (!top.faceUp) continue;

      // Top card to foundation?
      for (let fi = 0; fi < 4; fi++) {
        if (canPlaceOnFoundation(top, fi)) return true;
      }

      // Any face-up run to another column?
      for (let ri = 0; ri < col.length; ri++) {
        if (!col[ri].faceUp) continue;
        const card = col[ri];
        for (let tj = 0; tj < 7; tj++) {
          if (tj === ci) continue;
          if (state.tableau[tj].length === 0) {
            // King to empty — only useful if it reveals a card
            if (card.rank === 13 && ri > 0) return true;
          } else if (canPlaceOnTableau(card, tj)) {
            return true;
          }
        }
      }
    }

    return false;
  }

  function canAutoComplete() {
    if (state.stock.length > 0 || state.waste.length > 0) return false;
    return state.tableau.every(col => col.every(c => c.faceUp));
  }

  function doAutoComplete() {
    if (state.autoCompleting) return;
    state.autoCompleting = true;
    state.selected = null;

    function step() {
      if (checkWin()) {
        state.autoCompleting = false;
        onWin();
        return;
      }
      // Find a card to move to foundation
      for (let ci = 0; ci < 7; ci++) {
        const col = state.tableau[ci];
        if (col.length === 0) continue;
        const card = col[col.length - 1];
        const fi = getFoundationIndex(card);
        if (fi !== -1) {
          col.pop();
          state.foundations[fi].push(card);
          incrementMoves();
          render();
          setTimeout(step, 80);
          return;
        }
      }
      // Shouldn't reach here, but safety
      state.autoCompleting = false;
    }
    step();
  }

  function checkStuck() {
    if (checkWin() || state.autoCompleting) return;
    if (canAutoComplete()) {
      doAutoComplete();
      return;
    }
    if (!hasAnyMoves()) {
      clearInterval(state.timerInterval);
      const status = document.querySelector(".sol-status");
      if (status) {
        status.innerHTML = `
          <span class="sol-stuck-msg">No moves left!</span>
          <button class="btn btn-primary sol-new-game-btn" id="sol-new-game">New Game</button>
        `;
        document.getElementById("sol-new-game").addEventListener("click", () => {
          socket.emit("playVsAI", {
            playerName: window._gameLocal.myName || "Player",
            game: "solitaire",
          });
        });
      }
    }
  }

  function incrementMoves() {
    state.moves++;
    const el = document.getElementById("sol-moves");
    if (el) el.textContent = `Moves: ${state.moves}`;
  }

  function startTimer() {
    state.startTime = Date.now();
    state.timerInterval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - state.startTime) / 1000);
      const min = Math.floor(elapsed / 60);
      const sec = String(elapsed % 60).padStart(2, "0");
      const el = document.getElementById("sol-timer");
      if (el) el.textContent = `Time: ${min}:${sec}`;
    }, 1000);
  }

  function startDrag(e, source, colIdx, cardIdx) {
    if (state.autoCompleting) return;
    state.dragging = {
      source,
      colIdx,
      cardIdx,
      cards: source === "waste"
        ? [state.waste[state.waste.length - 1]]
        : state.tableau[colIdx].slice(cardIdx),
      startX: e.clientX,
      startY: e.clientY,
      ghostEl: null,
      pointerId: e.pointerId,
    };
  }

  function updateDragGhost(e) {
    if (!state.dragging) return;
    const drag = state.dragging;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    const dist = Math.hypot(dx, dy);

    if (dist < 6) {
      // Below threshold, don't start drag yet
      return false;
    }

    if (!drag.ghostEl) {
      // First movement above threshold: create ghost
      const ghost = document.createElement("div");
      ghost.className = "sol-drag-ghost";
      ghost.style.position = "fixed";
      ghost.style.pointerEvents = "none";
      ghost.style.zIndex = "1000";
      ghost.style.filter = "drop-shadow(0 8px 20px rgba(0,0,0,0.4))";

      drag.cards.forEach((card, i) => {
        const cardEl = makeCard({ ...card, faceUp: true });
        cardEl.style.position = "absolute";
        cardEl.style.top = `${i * 22}px`;
        ghost.appendChild(cardEl);
      });

      document.body.appendChild(ghost);
      drag.ghostEl = ghost;

      // Hide source cards
      if (drag.source === "waste") {
        const wasteEl = document.getElementById("sol-waste");
        if (wasteEl) wasteEl.style.opacity = "0.35";
      } else {
        const col = state.tableau[drag.colIdx];
        for (let i = drag.cardIdx; i < col.length; i++) {
          const cardEl = document.querySelector(
            `[data-col="${drag.colIdx}"] .card[data-card-idx="${i}"]`
          );
          if (cardEl) cardEl.style.opacity = "0.35";
        }
      }
    }

    // Update ghost position
    const rect = drag.ghostEl.children[0].getBoundingClientRect();
    const offsetX = 70; // Approximate card width / 2
    const offsetY = 100; // Approximate card height / 2
    drag.ghostEl.style.left = e.clientX - offsetX + "px";
    drag.ghostEl.style.top = e.clientY - offsetY + "px";

    // Highlight drop target
    const targets = document.elementsFromPoint(e.clientX, e.clientY);
    document.querySelectorAll(".sol-col, .sol-foundation").forEach(el => {
      el.classList.remove("sol-drop-hover");
    });
    for (const target of targets) {
      if (target.classList.contains("sol-col")) {
        target.classList.add("sol-drop-hover");
        break;
      }
      if (target.classList.contains("sol-foundation")) {
        target.classList.add("sol-drop-hover");
        break;
      }
    }

    return true;
  }

  function endDrag(e) {
    if (!state.dragging) return;

    const drag = state.dragging;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    const dist = Math.hypot(dx, dy);

    // Remove ghost
    if (drag.ghostEl) {
      drag.ghostEl.remove();
    }

    // Unhide source
    if (drag.source === "waste") {
      const wasteEl = document.getElementById("sol-waste");
      if (wasteEl) wasteEl.style.opacity = "";
    } else {
      const col = state.tableau[drag.colIdx];
      for (let i = drag.cardIdx; i < col.length; i++) {
        const cardEl = document.querySelector(
          `[data-col="${drag.colIdx}"] .card[data-card-idx="${i}"]`
        );
        if (cardEl) cardEl.style.opacity = "";
      }
    }

    // Clear drop highlights
    document.querySelectorAll(".sol-col, .sol-foundation").forEach(el => {
      el.classList.remove("sol-drop-hover");
    });

    // If drag didn't start (< threshold), treat as click
    if (dist < 6) {
      state.dragging = null;
      if (drag.source === "waste") {
        handleWasteClick();
      } else {
        handleTableauClick(drag.colIdx, drag.cardIdx);
      }
      return;
    }

    // Find drop target
    const targets = document.elementsFromPoint(e.clientX, e.clientY);
    let dropCol = -1;
    let dropFound = -1;

    for (const target of targets) {
      const col = target.closest(".sol-col");
      if (col) {
        dropCol = parseInt(col.dataset.col);
        break;
      }
      const found = target.closest(".sol-foundation");
      if (found) {
        dropFound = parseInt(found.dataset.idx);
        break;
      }
    }

    state.dragging = null;

    // Try to place cards
    if (dropCol !== -1) {
      // Tableau drop
      const topCard = drag.cards[0];
      const targetCol = state.tableau[dropCol];
      if (targetCol.length === 0 ? topCard.rank === 13 : canPlaceOnTableau(topCard, dropCol)) {
        // Valid move
        if (drag.source === "waste") {
          state.waste.pop();
        } else {
          state.tableau[drag.colIdx] = state.tableau[drag.colIdx].slice(0, drag.cardIdx);
          flipTopCard(drag.colIdx);
        }
        targetCol.push(...drag.cards);
        incrementMoves();
        render();
        if (checkWin()) onWin(); else checkStuck();
        return;
      }
    } else if (dropFound !== -1) {
      // Foundation drop - only single card allowed
      if (drag.cards.length === 1) {
        const card = drag.cards[0];
        if (canPlaceOnFoundation(card, dropFound)) {
          // Valid move
          if (drag.source === "waste") {
            state.waste.pop();
          } else {
            state.tableau[drag.colIdx].pop();
            flipTopCard(drag.colIdx);
          }
          state.foundations[dropFound].push(card);
          incrementMoves();
          render();
          if (checkWin()) onWin(); else checkStuck();
          return;
        }
      }
    }

    // Invalid drop, re-render to snap back
    render();
  }

  function render() {
    // Tableau
    const tableau = document.getElementById("sol-tableau");
    if (!tableau) return;
    tableau.innerHTML = "";
    state.tableau.forEach((col, ci) => {
      const colEl = document.createElement("div");
      colEl.className = "sol-col";
      colEl.dataset.col = ci;

      if (col.length === 0) {
        const empty = document.createElement("div");
        empty.className = "sol-empty-slot";
        empty.addEventListener("click", () => handleTableauClick(ci, -1));
        colEl.appendChild(empty);
      }

      col.forEach((card, ri) => {
        const cardEl = makeCard(card);
        cardEl.style.top = `${ri * 22}px`;
        cardEl.classList.add("sol-stacked");
        cardEl.dataset.cardIdx = ri;

        const isSelected = state.selected &&
          state.selected.source === "tableau" &&
          state.selected.colIdx === ci &&
          ri >= state.selected.cardIdx;
        if (isSelected) cardEl.classList.add("sol-selected");

        if (card.faceUp) {
          cardEl.classList.add("sol-draggable");
          cardEl.style.touchAction = "none";

          cardEl.addEventListener("pointerdown", (e) => {
            e.stopPropagation();
            startDrag(e, "tableau", ci, ri);
            cardEl.setPointerCapture(e.pointerId);
          });

          cardEl.addEventListener("pointermove", (e) => {
            if (state.dragging && state.dragging.pointerId === e.pointerId) {
              updateDragGhost(e);
            }
          });

          cardEl.addEventListener("pointerup", (e) => {
            if (state.dragging && state.dragging.pointerId === e.pointerId) {
              endDrag(e);
            }
          });

          cardEl.addEventListener("click", (e) => {
            // Short click (no drag) - already handled in endDrag
          });

          // Double-click to auto-send to foundation
          cardEl.addEventListener("dblclick", (e) => {
            e.stopPropagation();
            if (ri === col.length - 1) autoFoundation(card, "tableau", ci);
          });
        }
        colEl.appendChild(cardEl);
      });

      // Click empty area at bottom of column
      colEl.addEventListener("click", () => handleTableauClick(ci, -1));
      tableau.appendChild(colEl);
    });

    // Stock
    const stockEl = document.getElementById("sol-stock");
    if (stockEl) {
      const count = document.getElementById("sol-stock-count");
      if (count) count.textContent = state.stock.length;
      stockEl.onclick = handleStockClick;
      stockEl.style.opacity = state.stock.length > 0 ? "1" : "0.4";
    }

    // Waste
    const wasteEl = document.getElementById("sol-waste");
    if (wasteEl) {
      wasteEl.innerHTML = "";
      if (state.waste.length > 0) {
        const top = state.waste[state.waste.length - 1];
        const flip = window._gameShared && window._gameShared.animateFlip;
        wasteEl.ondblclick = () => autoFoundation(top, "waste");
        if (state.wasteFlip && flip) {
          state.wasteFlip = false;
          flip(wasteEl, { ...top, faceUp: true });
        } else {
          state.wasteFlip = false;
          const cardEl = makeCard({ ...top, faceUp: true });
          const isSelected = state.selected && state.selected.source === "waste";
          if (isSelected) cardEl.classList.add("sol-selected");
          cardEl.classList.add("sol-draggable");
          cardEl.style.touchAction = "none";

          cardEl.addEventListener("pointerdown", (e) => {
            e.stopPropagation();
            startDrag(e, "waste", -1, -1);
            cardEl.setPointerCapture(e.pointerId);
          });

          cardEl.addEventListener("pointermove", (e) => {
            if (state.dragging && state.dragging.pointerId === e.pointerId) {
              updateDragGhost(e);
            }
          });

          cardEl.addEventListener("pointerup", (e) => {
            if (state.dragging && state.dragging.pointerId === e.pointerId) {
              endDrag(e);
            }
          });

          cardEl.addEventListener("click", (e) => {
            // Short click handled in endDrag
          });

          wasteEl.appendChild(cardEl);
        }
      } else {
        wasteEl.onclick = null;
      }
    }

    // Foundations
    const foundContainer = document.getElementById("sol-foundations");
    if (foundContainer) {
      foundContainer.querySelectorAll(".sol-foundation").forEach((el, i) => {
        const pile = state.foundations[i];
        el.innerHTML = "";
        if (pile.length > 0) {
          el.appendChild(makeCard({ ...pile[pile.length - 1], faceUp: true }));
        } else {
          const label = document.createElement("span");
          label.className = "sol-foundation-label";
          label.textContent = ["♥", "♦", "♣", "♠"][i];
          el.appendChild(label);
        }
        el.onclick = () => handleFoundationClick(i);
      });
    }
  }

  function handleStockClick() {
    if (state.autoCompleting) return;
    if (state.stock.length === 0) {
      // Recycle waste back to stock
      if (state.waste.length === 0) return;
      state.stock = state.waste.reverse();
      state.stock.forEach(c => { c.faceUp = false; });
      state.waste = [];
    } else {
      const card = state.stock.pop();
      card.faceUp = true;
      state.waste.push(card);
      state.wasteFlip = true;
    }
    state.selected = null;
    incrementMoves();
    render();
    checkStuck();
  }

  function handleWasteClick() {
    if (state.autoCompleting) return;
    if (state.waste.length === 0) return;
    if (state.selected && state.selected.source === "waste") {
      state.selected = null;
    } else {
      state.selected = { source: "waste" };
    }
    render();
  }

  function handleTableauClick(colIdx, cardIdx) {
    if (state.autoCompleting) return;
    const col = state.tableau[colIdx];

    if (state.selected) {
      // Try to place selected cards here
      if (state.selected.source === "waste") {
        const card = state.waste[state.waste.length - 1];
        if (col.length === 0 ? card.rank === 13 : canPlaceOnTableau(card, colIdx)) {
          state.waste.pop();
          col.push(card);
          incrementMoves();
          state.selected = null;
          render();
          if (checkWin()) onWin(); else checkStuck();
          return;
        }
      } else if (state.selected.source === "tableau") {
        const srcCol = state.tableau[state.selected.colIdx];
        const movingCards = srcCol.slice(state.selected.cardIdx);
        const topMoving = movingCards[0];
        if (col.length === 0 ? topMoving.rank === 13 : canPlaceOnTableau(topMoving, colIdx)) {
          state.tableau[state.selected.colIdx] = srcCol.slice(0, state.selected.cardIdx);
          col.push(...movingCards);
          flipTopCard(state.selected.colIdx);
          incrementMoves();
          state.selected = null;
          render();
          if (checkWin()) onWin(); else checkStuck();
          return;
        }
      }
      state.selected = null;
      render();
      return;
    }

    // Select a face-up card
    if (cardIdx >= 0 && col[cardIdx] && col[cardIdx].faceUp) {
      state.selected = { source: "tableau", colIdx, cardIdx };
      render();
    }
  }

  function handleFoundationClick(foundIdx) {
    if (state.autoCompleting) return;
    if (!state.selected) return;

    let card;
    if (state.selected.source === "waste") {
      card = state.waste[state.waste.length - 1];
      if (card && canPlaceOnFoundation(card, foundIdx)) {
        state.foundations[foundIdx].push(state.waste.pop());
        incrementMoves();
      }
    } else if (state.selected.source === "tableau") {
      const col = state.tableau[state.selected.colIdx];
      // Only top card can go to foundation
      if (state.selected.cardIdx === col.length - 1) {
        card = col[col.length - 1];
        if (card && canPlaceOnFoundation(card, foundIdx)) {
          col.pop();
          state.foundations[foundIdx].push(card);
          flipTopCard(state.selected.colIdx);
          incrementMoves();
        }
      }
    }
    state.selected = null;
    render();
    if (checkWin()) onWin(); else checkStuck();
  }

  function autoFoundation(card, source, colIdx) {
    const foundIdx = getFoundationIndex(card);
    if (foundIdx === -1) return;
    if (source === "waste") {
      state.waste.pop();
    } else if (source === "tableau") {
      state.tableau[colIdx].pop();
      flipTopCard(colIdx);
    }
    state.foundations[foundIdx].push(card);
    state.selected = null;
    incrementMoves();
    render();
    if (checkWin()) onWin(); else checkStuck();
  }

  function onWin() {
    clearInterval(state.timerInterval);
    socket.emit("solitaire:win", { roomId: window._gameLocal.roomId });
  }

  window.gameClients = window.gameClients || {};
  window.gameClients.solitaire = {
    onGameStart(data) {
      clearInterval(state.timerInterval);
      const container = document.getElementById("game-container");
      buildUI(container);

      if (data.solitaire) {
        state.tableau = data.solitaire.tableau;
        state.foundations = data.solitaire.foundations;
        state.stock = data.solitaire.stock;
        state.waste = data.solitaire.waste;
      }
      state.selected = null;
      state.moves = 0;
      state.wasteFlip = false;
      state.autoCompleting = false;
      startTimer();
      render();

      // Deal animation — stagger tableau cards
      const da = window._gameShared && window._gameShared.dealAnimate;
      if (da) {
        const tableau = document.getElementById("sol-tableau");
        if (tableau) da(tableau, ".sol-stacked", 35);
      }
    },

    onReconnect(data) {
      this.onGameStart(data);
    },

    cleanup() {
      clearInterval(state.timerInterval);
      if (state.dragging && state.dragging.ghostEl) {
        state.dragging.ghostEl.remove();
      }
      state = {
        tableau: [], foundations: [[], [], [], []], stock: [], waste: [],
        selected: null, moves: 0, startTime: 0, timerInterval: null, wasteFlip: false, autoCompleting: false,
        dragging: null,
      };
    },
  };
})();
