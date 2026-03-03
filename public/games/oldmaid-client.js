// games/oldmaid-client.js — Old Maid card game client

(function() {
  const { makeCard, RANK_LABEL } = window._gameShared;

  let state = {
    hand: [],
    opponentCardCount: 0,
    pairs: [[], []],
    currentPlayerIndex: 0,
  };

  function buildUI(container) {
    container.innerHTML = `
      <div class="oldmaid-layout">
        <div class="oldmaid-opponent">
          <div class="oldmaid-player-info">
            <span class="oldmaid-name" id="oldmaid-opp-name">Opponent</span>
            <span class="oldmaid-info" id="oldmaid-opp-pairs">0 pairs</span>
          </div>
          <div class="oldmaid-opp-hand" id="oldmaid-opp-hand"></div>
        </div>

        <div class="oldmaid-center">
          <div id="oldmaid-turn" class="oldmaid-turn"></div>
          <div id="oldmaid-log" class="oldmaid-log"></div>
        </div>

        <div class="oldmaid-me">
          <div class="oldmaid-player-info">
            <span class="oldmaid-name" id="oldmaid-my-name">You</span>
            <span class="oldmaid-info" id="oldmaid-my-pairs">0 pairs</span>
          </div>
          <div class="oldmaid-hand" id="oldmaid-my-hand"></div>
          <div id="oldmaid-hint" class="oldmaid-hint">Tap a card from opponent's hand to draw</div>
        </div>
      </div>
    `;
  }

  function renderMyHand() {
    const container = document.getElementById("oldmaid-my-hand");
    if (!container) return;
    container.innerHTML = "";
    const sorted = [...state.hand].sort((a, b) => a.rank - b.rank);
    sorted.forEach(card => {
      container.appendChild(makeCard(card));
    });
  }

  function renderOppHand() {
    const container = document.getElementById("oldmaid-opp-hand");
    if (!container) return;
    container.innerHTML = "";
    const myIdx = window._gameLocal.myPlayerIndex;
    const isMyTurn = state.currentPlayerIndex === myIdx;

    for (let i = 0; i < state.opponentCardCount; i++) {
      const el = document.createElement("div");
      el.className = "card card-back oldmaid-opp-card" + (isMyTurn ? " oldmaid-drawable" : "");
      if (isMyTurn) {
        el.addEventListener("click", () => {
          // Server picks randomly regardless of which card we tap
          socket.emit("oldmaid:draw", {
            roomId: window._gameLocal.roomId,
            cardIndex: i,
          });
          // Disable further clicks
          document.querySelectorAll(".oldmaid-drawable").forEach(c => {
            c.classList.remove("oldmaid-drawable");
            c.replaceWith(c.cloneNode(true));
          });
        });
      }
      container.appendChild(el);
    }
  }

  function updateInfo() {
    const myIdx = window._gameLocal.myPlayerIndex;
    const el = id => document.getElementById(id);
    if (el("oldmaid-opp-pairs")) el("oldmaid-opp-pairs").textContent = state.pairs[1 - myIdx].length + " pairs";
    if (el("oldmaid-my-pairs")) el("oldmaid-my-pairs").textContent = state.pairs[myIdx].length + " pairs";

    const turn = el("oldmaid-turn");
    if (turn) {
      const isMyTurn = state.currentPlayerIndex === myIdx;
      turn.textContent = isMyTurn
        ? "Your turn — draw from opponent"
        : `${window._gameLocal.opponentName}'s turn`;
      turn.className = "oldmaid-turn " + (isMyTurn ? "my-turn" : "their-turn");
    }

    const hint = el("oldmaid-hint");
    if (hint) hint.style.display = state.currentPlayerIndex === myIdx ? "" : "none";
  }

  function addLog(msg) {
    const log = document.getElementById("oldmaid-log");
    if (!log) return;
    const entry = document.createElement("div");
    entry.className = "oldmaid-log-entry";
    entry.textContent = msg;
    log.appendChild(entry);
    log.scrollTop = log.scrollHeight;
    while (log.children.length > 6) log.removeChild(log.firstChild);
  }

  window.gameClients = window.gameClients || {};
  window.gameClients.oldmaid = {
    onGameStart(data) {
      const container = document.getElementById("game-container");
      buildUI(container);
      const myIdx = data.myPlayerIndex;
      state.hand = data.hand || [];
      state.opponentCardCount = data.opponentCardCount || 0;
      state.pairs = data.pairs || [[], []];
      state.currentPlayerIndex = data.currentPlayerIndex;

      document.getElementById("oldmaid-my-name").textContent = data.players[myIdx].name;
      document.getElementById("oldmaid-opp-name").textContent = data.players[1 - myIdx].name +
        (data.players[1 - myIdx].isAI ? " 🤖" : "");

      renderMyHand();
      renderOppHand();
      updateInfo();
      addLog("Pairs removed. Draw from your opponent!");
    },

    onReconnect(data) {
      this.onGameStart(data);
    },

    cleanup() {
      state = { hand: [], opponentCardCount: 0, pairs: [[], []], currentPlayerIndex: 0 };
    },
  };

  // Socket handlers
  socket.on("oldmaid:state", (data) => {
    state.hand = data.hand;
    state.opponentCardCount = data.opponentCardCount;
    state.pairs = data.pairs;
    state.currentPlayerIndex = data.currentPlayerIndex;
    renderMyHand();
    renderOppHand();
    updateInfo();
  });

  socket.on("oldmaid:drew", ({ drawerIndex, drawerName, paired, pairRank }) => {
    const myIdx = window._gameLocal.myPlayerIndex;
    const name = drawerIndex === myIdx ? "You" : drawerName;
    if (paired) {
      addLog(`${name} drew and paired ${RANK_LABEL(pairRank)}s!`);
    } else {
      addLog(`${name} drew a card.`);
    }
  });
})();
