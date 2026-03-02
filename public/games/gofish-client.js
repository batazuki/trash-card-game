// games/gofish-client.js — Go Fish card game client

(function() {
  const RANK_LABEL = r => r === 1 ? "A" : r === 11 ? "J" : r === 12 ? "Q" : r === 13 ? "K" : String(r);
  const SUIT_SYMBOL = { hearts: "♥", diamonds: "♦", clubs: "♣", spades: "♠" };
  const isRed = suit => suit === "hearts" || suit === "diamonds";

  let state = {
    hand: [],
    opponentCardCount: 0,
    sets: [[], []],
    deckCount: 0,
    currentPlayerIndex: 0,
    selectedRank: null,
  };

  function makeCard(card, clickable) {
    const el = document.createElement("div");
    el.className = `card ${isRed(card.suit) ? "red" : "black"}${clickable ? " gofish-clickable" : ""}`;
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
      <div class="gofish-layout">
        <div class="gofish-opponent">
          <div class="gofish-player-info">
            <span class="gofish-name" id="gofish-opp-name">Opponent</span>
            <span class="gofish-info" id="gofish-opp-cards">0 cards</span>
            <span class="gofish-info" id="gofish-opp-sets">0 sets</span>
          </div>
          <div class="gofish-opp-hand" id="gofish-opp-hand"></div>
        </div>

        <div class="gofish-center">
          <div id="gofish-turn" class="gofish-turn"></div>
          <div id="gofish-log" class="gofish-log"></div>
          <div class="gofish-deck-area">
            <div class="card card-back gofish-deck-card">
              <span class="deck-count" id="gofish-deck-count">0</span>
            </div>
            <span class="gofish-deck-label">Deck</span>
          </div>
        </div>

        <div class="gofish-me">
          <div class="gofish-player-info">
            <span class="gofish-name" id="gofish-my-name">You</span>
            <span class="gofish-info" id="gofish-my-sets">0 sets</span>
          </div>
          <div class="gofish-hand" id="gofish-my-hand"></div>
          <div id="gofish-ask-hint" class="gofish-ask-hint">Tap a card to ask for that rank</div>
        </div>
      </div>
    `;
  }

  function renderHand() {
    const container = document.getElementById("gofish-my-hand");
    if (!container) return;
    container.innerHTML = "";
    const myIdx = window._gameLocal.myPlayerIndex;
    const isMyTurn = state.currentPlayerIndex === myIdx;

    // Sort hand by rank
    const sorted = [...state.hand].sort((a, b) => a.rank - b.rank);
    sorted.forEach(card => {
      const el = makeCard(card, isMyTurn);
      if (isMyTurn) {
        el.addEventListener("click", () => {
          socket.emit("gofish:ask", {
            roomId: window._gameLocal.roomId,
            rank: card.rank,
          });
        });
      }
      container.appendChild(el);
    });

    const hint = document.getElementById("gofish-ask-hint");
    if (hint) hint.style.display = isMyTurn && state.hand.length > 0 ? "" : "none";
  }

  function renderOppHand() {
    const container = document.getElementById("gofish-opp-hand");
    if (!container) return;
    container.innerHTML = "";
    for (let i = 0; i < Math.min(state.opponentCardCount, 13); i++) {
      const el = document.createElement("div");
      el.className = "card card-back gofish-opp-card";
      container.appendChild(el);
    }
  }

  function updateInfo() {
    const myIdx = window._gameLocal.myPlayerIndex;
    const el = id => document.getElementById(id);
    if (el("gofish-opp-cards")) el("gofish-opp-cards").textContent = state.opponentCardCount + " cards";
    if (el("gofish-opp-sets")) el("gofish-opp-sets").textContent = state.sets[1 - myIdx].length + " sets";
    if (el("gofish-my-sets")) el("gofish-my-sets").textContent = state.sets[myIdx].length + " sets";
    if (el("gofish-deck-count")) el("gofish-deck-count").textContent = state.deckCount;

    const turn = el("gofish-turn");
    if (turn) {
      const isMyTurn = state.currentPlayerIndex === myIdx;
      turn.textContent = isMyTurn ? "Your Turn" : `${window._gameLocal.opponentName}'s Turn`;
      turn.className = "gofish-turn " + (isMyTurn ? "my-turn" : "their-turn");
    }
  }

  function addLog(msg) {
    const log = document.getElementById("gofish-log");
    if (!log) return;
    const entry = document.createElement("div");
    entry.className = "gofish-log-entry";
    entry.textContent = msg;
    log.appendChild(entry);
    log.scrollTop = log.scrollHeight;
    // Keep only last 8 entries
    while (log.children.length > 8) log.removeChild(log.firstChild);
  }

  window.gameClients = window.gameClients || {};
  window.gameClients.gofish = {
    onGameStart(data) {
      const container = document.getElementById("game-container");
      buildUI(container);
      const myIdx = data.myPlayerIndex;
      state.hand = data.hand || [];
      state.opponentCardCount = data.opponentCardCount || 0;
      state.sets = data.sets || [[], []];
      state.deckCount = data.deckCount || 0;
      state.currentPlayerIndex = data.currentPlayerIndex;

      document.getElementById("gofish-my-name").textContent = data.players[myIdx].name;
      document.getElementById("gofish-opp-name").textContent = data.players[1 - myIdx].name +
        (data.players[1 - myIdx].isAI ? " 🤖" : "");

      renderHand();
      renderOppHand();
      updateInfo();
    },

    onReconnect(data) {
      this.onGameStart(data);
    },

    cleanup() {
      state = { hand: [], opponentCardCount: 0, sets: [[], []], deckCount: 0, currentPlayerIndex: 0 };
    },
  };

  // Socket handlers
  socket.on("gofish:handUpdate", (data) => {
    state.hand = data.hand;
    state.opponentCardCount = data.opponentCardCount;
    state.sets = data.sets;
    state.deckCount = data.deckCount;
    state.currentPlayerIndex = data.currentPlayerIndex;
    renderHand();
    renderOppHand();
    updateInfo();
  });

  socket.on("gofish:result", ({ askerIndex, askerName, rankLabel, count, gotFish }) => {
    const myIdx = window._gameLocal.myPlayerIndex;
    const name = askerIndex === myIdx ? "You" : askerName;
    if (gotFish) {
      addLog(`${name} asked for ${rankLabel}s — Go Fish!`);
    } else {
      addLog(`${name} got ${count} ${rankLabel}${count > 1 ? "s" : ""}!`);
    }
  });

  socket.on("gofish:setComplete", ({ playerIndex, ranks, sets }) => {
    const myIdx = window._gameLocal.myPlayerIndex;
    const name = playerIndex === myIdx ? "You" : (window._gameLocal.opponentName || "Opponent");
    state.sets = sets;
    ranks.forEach(r => addLog(`${name} completed a set of ${RANK_LABEL(r)}s!`));
    updateInfo();
  });

  socket.on("gofish:luckyDraw", ({ playerIndex }) => {
    const myIdx = window._gameLocal.myPlayerIndex;
    const name = playerIndex === myIdx ? "You" : (window._gameLocal.opponentName || "Opponent");
    addLog(`${name} drew the card they asked for! Go again!`);
  });
})();
