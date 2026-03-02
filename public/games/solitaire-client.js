// games/solitaire-client.js — Klondike Solitaire client (client-authoritative)

(function() {
  const RANK_LABEL = r => r === 1 ? "A" : r === 11 ? "J" : r === 12 ? "Q" : r === 13 ? "K" : String(r);
  const SUIT_SYMBOL = { hearts: "♥", diamonds: "♦", clubs: "♣", spades: "♠" };
  const isRed = suit => suit === "hearts" || suit === "diamonds";
  const SUIT_ORDER = { hearts: 0, diamonds: 1, clubs: 2, spades: 3 };

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
  };

  function makeCard(card, small) {
    const el = document.createElement("div");
    if (!card.faceUp) {
      el.className = "card card-back" + (small ? " sol-small" : "");
      return el;
    }
    el.className = `card ${isRed(card.suit) ? "red" : "black"}` + (small ? " sol-small" : "");
    const rank = RANK_LABEL(card.rank);
    const sym = SUIT_SYMBOL[card.suit];
    el.innerHTML = `
      <span class="card-corner tl">${rank}</span>
      <span class="card-center">${sym}</span>
      <span class="card-corner br">${rank}</span>
    `;
    return el;
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

        const isSelected = state.selected &&
          state.selected.source === "tableau" &&
          state.selected.colIdx === ci &&
          ri >= state.selected.cardIdx;
        if (isSelected) cardEl.classList.add("sol-selected");

        if (card.faceUp) {
          cardEl.addEventListener("click", (e) => {
            e.stopPropagation();
            handleTableauClick(ci, ri);
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
        if (state.wasteFlip && flip) {
          state.wasteFlip = false;
          flip(wasteEl, { ...top, faceUp: true });
          // Add click handlers after flip
          wasteEl.addEventListener("click", () => handleWasteClick());
          wasteEl.addEventListener("dblclick", () => autoFoundation(top, "waste"));
        } else {
          state.wasteFlip = false;
          const cardEl = makeCard({ ...top, faceUp: true });
          const isSelected = state.selected && state.selected.source === "waste";
          if (isSelected) cardEl.classList.add("sol-selected");
          cardEl.addEventListener("click", () => handleWasteClick());
          cardEl.addEventListener("dblclick", () => autoFoundation(top, "waste"));
          wasteEl.appendChild(cardEl);
        }
      }
    }

    // Foundations
    const foundContainer = document.getElementById("sol-foundations");
    if (foundContainer) {
      foundContainer.querySelectorAll(".sol-foundation").forEach((el, i) => {
        const pile = state.foundations[i];
        // Keep the label, add top card if any
        el.innerHTML = "";
        if (pile.length > 0) {
          el.appendChild(makeCard({ ...pile[pile.length - 1], faceUp: true }));
        } else {
          const label = document.createElement("span");
          label.className = "sol-foundation-label";
          label.textContent = ["♥", "♦", "♣", "♠"][i];
          el.appendChild(label);
        }
        el.addEventListener("click", () => handleFoundationClick(i));
      });
    }
  }

  function handleStockClick() {
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
  }

  function handleWasteClick() {
    if (state.waste.length === 0) return;
    if (state.selected && state.selected.source === "waste") {
      state.selected = null;
    } else {
      state.selected = { source: "waste" };
    }
    render();
  }

  function handleTableauClick(colIdx, cardIdx) {
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
          if (checkWin()) onWin();
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
          if (checkWin()) onWin();
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
    if (checkWin()) onWin();
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
    if (checkWin()) onWin();
  }

  function onWin() {
    clearInterval(state.timerInterval);
    socket.emit("solitaire:win", { roomId: window._gameLocal.roomId });
  }

  window.gameClients = window.gameClients || {};
  window.gameClients.solitaire = {
    onGameStart(data) {
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
      startTimer();
      render();
    },

    onReconnect(data) {
      this.onGameStart(data);
    },

    cleanup() {
      clearInterval(state.timerInterval);
      state = {
        tableau: [], foundations: [[], [], [], []], stock: [], waste: [],
        selected: null, moves: 0, startTime: 0, timerInterval: null, wasteFlip: false,
      };
    },
  };
})();
