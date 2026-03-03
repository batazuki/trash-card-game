// games/war-client.js — War card game client

(function() {
  const { makeCard, makeCardBack } = window._gameShared;

  let state = {
    pileCounts: [26, 26],
    lastResult: null,
    animating: false,
  };

  function buildUI(container) {
    container.innerHTML = `
      <div class="war-layout">
        <div class="war-opponent">
          <div class="war-pile-info">
            <span class="war-pile-label" id="war-opp-name">Opponent</span>
            <span class="war-pile-count" id="war-opp-count">26</span>
          </div>
          <div class="war-card-area" id="war-opp-card"></div>
        </div>

        <div class="war-center">
          <div id="war-message" class="war-message"></div>
          <div class="war-battle-area">
            <div class="war-battle-card" id="war-battle-opp"></div>
            <div class="war-vs">VS</div>
            <div class="war-battle-card" id="war-battle-me"></div>
          </div>
          <div id="war-war-cards" class="war-war-cards"></div>
        </div>

        <div class="war-me">
          <div class="war-card-area" id="war-my-card"></div>
          <div class="war-pile-info">
            <span class="war-pile-label" id="war-my-name">You</span>
            <span class="war-pile-count" id="war-my-count">26</span>
          </div>
        </div>

        <button class="btn btn-primary war-flip-btn" id="war-flip-btn">Flip!</button>
      </div>
    `;
  }

  function updateCounts() {
    const myIdx = window._gameLocal.myPlayerIndex;
    document.getElementById("war-my-count").textContent = state.pileCounts[myIdx] + " cards";
    document.getElementById("war-opp-count").textContent = state.pileCounts[1 - myIdx] + " cards";
  }

  function clearBattle() {
    document.getElementById("war-battle-opp").innerHTML = "";
    document.getElementById("war-battle-me").innerHTML = "";
    document.getElementById("war-war-cards").innerHTML = "";
    document.getElementById("war-message").textContent = "";
  }

  window.gameClients = window.gameClients || {};
  window.gameClients.war = {
    onGameStart(data) {
      const container = document.getElementById("game-container");
      buildUI(container);
      state.pileCounts = data.pileCounts || [26, 26];
      state.animating = false;

      const myIdx = data.myPlayerIndex;
      document.getElementById("war-my-name").textContent = data.players[myIdx].name;
      document.getElementById("war-opp-name").textContent = data.players[1 - myIdx].name +
        (data.players[1 - myIdx].isAI ? " 🤖" : "");
      updateCounts();

      // Pile visuals
      document.getElementById("war-my-card").appendChild(makeCardBack());
      document.getElementById("war-opp-card").appendChild(makeCardBack());

      document.getElementById("war-flip-btn").addEventListener("click", () => {
        if (state.animating) return;
        state.animating = true;
        document.getElementById("war-flip-btn").disabled = true;
        clearBattle();
        socket.emit("war:flip", { roomId: window._gameLocal.roomId });
      });

      document.getElementById("war-message").textContent = "Tap Flip to play!";
    },

    onReconnect(data) {
      this.onGameStart({ ...data, pileCounts: data.pileCounts || [26, 26] });
    },

    cleanup() {
      state = { pileCounts: [26, 26], lastResult: null, animating: false };
    },
  };

  // Socket handlers
  socket.on("war:result", ({ faceUp, winnerIndex, pileCounts, warCards }) => {
    const myIdx = window._gameLocal.myPlayerIndex;
    state.pileCounts = pileCounts;

    const battleOpp = document.getElementById("war-battle-opp");
    const battleMe = document.getElementById("war-battle-me");
    const flip = window._gameShared && window._gameShared.animateFlip;
    if (battleOpp && battleMe) {
      if (flip) {
        flip(battleOpp, faceUp[1 - myIdx]);
        flip(battleMe, faceUp[myIdx]);
      } else {
        battleOpp.innerHTML = "";
        battleMe.innerHTML = "";
        battleOpp.appendChild(makeCard(faceUp[1 - myIdx]));
        battleMe.appendChild(makeCard(faceUp[myIdx]));
      }
    }

    // Show war cards if any
    if (warCards && warCards.length > 0) {
      const warArea = document.getElementById("war-war-cards");
      if (warArea) {
        warArea.innerHTML = "";
        warCards.forEach((round, ri) => {
          const row = document.createElement("div");
          row.className = "war-war-row";
          row.innerHTML = `<span class="war-war-label">War ${ri + 1}: ${round.down[0]} down, ${round.down[1]} down</span>`;
          const cards = document.createElement("div");
          cards.className = "war-war-reveal";
          cards.appendChild(makeCard(round.faceUp[1 - myIdx]));
          const vs = document.createElement("span");
          vs.className = "war-vs-small";
          vs.textContent = "vs";
          cards.appendChild(vs);
          cards.appendChild(makeCard(round.faceUp[myIdx]));
          row.appendChild(cards);
          warArea.appendChild(row);
        });
      }
    }

    const msg = document.getElementById("war-message");
    if (msg) {
      const winnerName = winnerIndex === myIdx ? "You" : (window._gameLocal.opponentName || "Opponent");
      msg.textContent = `${winnerName} won this round!`;
      msg.className = "war-message " + (winnerIndex === myIdx ? "war-win" : "war-lose");
    }

    updateCounts();

    setTimeout(() => {
      state.animating = false;
      const btn = document.getElementById("war-flip-btn");
      if (btn) btn.disabled = false;
    }, 1200);
  });

  socket.on("war:tie", ({ faceUp, warDown, pileCounts }) => {
    const myIdx = window._gameLocal.myPlayerIndex;
    state.pileCounts = pileCounts;

    const battleOpp = document.getElementById("war-battle-opp");
    const battleMe = document.getElementById("war-battle-me");
    const flip = window._gameShared && window._gameShared.animateFlip;
    if (battleOpp && battleMe) {
      if (flip) {
        flip(battleOpp, faceUp[1 - myIdx]);
        flip(battleMe, faceUp[myIdx]);
      } else {
        battleOpp.innerHTML = "";
        battleMe.innerHTML = "";
        battleOpp.appendChild(makeCard(faceUp[1 - myIdx]));
        battleMe.appendChild(makeCard(faceUp[myIdx]));
      }
    }

    const msg = document.getElementById("war-message");
    if (msg) {
      msg.textContent = "TIE — WAR!";
      msg.className = "war-message war-tie";
    }

    updateCounts();
  });
})();
