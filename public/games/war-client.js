// games/war-client.js — War card game client

(function() {
  const { makeCard, makeCardBack } = window._gameShared;

  let state = {
    pileCounts: [26, 26],
    lastResult: null,
    flipTimeout: null,
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
            <div class="war-battle-slot">
              <span class="war-battle-label" id="war-label-opp"></span>
              <div class="war-battle-card" id="war-battle-opp"></div>
            </div>
            <div class="war-vs">VS</div>
            <div class="war-battle-slot">
              <div class="war-battle-card" id="war-battle-me"></div>
              <span class="war-battle-label" id="war-label-me">You</span>
            </div>
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
      </div>
    `;
  }

  function updateCounts() {
    // M6: guard against being called while a different game is active (elements won't exist)
    const myEl  = document.getElementById("war-my-count");
    const oppEl = document.getElementById("war-opp-count");
    if (!myEl || !oppEl) return;
    const myIdx = window._gameLocal && window._gameLocal.myPlayerIndex;
    if (myIdx == null) return;
    myEl.textContent  = state.pileCounts[myIdx]       + " cards";
    oppEl.textContent = state.pileCounts[1 - myIdx]   + " cards";
  }

  function clearBattle() {
    // M6: guard against missing DOM elements when game is not active
    const bo = document.getElementById("war-battle-opp");
    const bm = document.getElementById("war-battle-me");
    const wc = document.getElementById("war-war-cards");
    const wm = document.getElementById("war-message");
    if (bo) bo.innerHTML = "";
    if (bm) bm.innerHTML = "";
    if (wc) wc.innerHTML = "";
    if (wm) wm.textContent = "";
  }

  window.gameClients = window.gameClients || {};
  window.gameClients.war = {
    onGameStart(data) {
      const container = document.getElementById("game-container");
      buildUI(container);
      state.pileCounts = data.pileCounts || [26, 26];
      state.flipTimeout = null;

      const myIdx = data.myPlayerIndex;
      document.getElementById("war-my-name").textContent = data.players[myIdx].name;
      document.getElementById("war-opp-name").textContent = data.players[1 - myIdx].name +
        (data.players[1 - myIdx].isAI ? " 🤖" : "");

      // Battle card labels
      document.getElementById("war-label-opp").textContent = data.players[1 - myIdx].name +
        (data.players[1 - myIdx].isAI ? " 🤖" : "");
      document.getElementById("war-label-me").textContent = data.players[myIdx].name;

      updateCounts();

      // Pile visuals
      document.getElementById("war-my-card").appendChild(makeCardBack());
      document.getElementById("war-opp-card").appendChild(makeCardBack());

      document.getElementById("war-message").textContent = "Ready...";

      // Auto-flip after 1.2s delay
      state.flipTimeout = setTimeout(() => emitFlip(), 1200);

      // Deal animation
      const da = window._gameShared && window._gameShared.dealAnimate;
      if (da) da(container, ".war-card-area .card, .war-pile-info", 120);
    },

    onReconnect(data) {
      this.onGameStart({ ...data, pileCounts: data.pileCounts || [26, 26] });
    },

    cleanup() {
      clearTimeout(state.flipTimeout);
      state = { pileCounts: [26, 26], lastResult: null, flipTimeout: null };
    },
  };

  function emitFlip() {
    if (!window._gameLocal.roomId) return;
    clearBattle();
    socket.emit("war:flip", { roomId: window._gameLocal.roomId });
  }

  // Socket handlers
  socket.on("war:result", ({ faceUp, winnerIndex, pileCounts, warCards }) => {
    // M6: these handlers are always registered; ignore if we're not in a war game
    if (!window._gameLocal || window._gameLocal.gameType !== "war") return;
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

    // Play sound effect
    const sfxTone = window._gameShared && window._gameShared.sfxTone;
    if (warCards && warCards.length > 0) {
      // War chain result: fanfare
      const playWinFanfare = window._gameShared && window._gameShared.playWinFanfare;
      if (playWinFanfare) playWinFanfare();
    } else {
      // Normal result: soft card-place sound
      if (sfxTone) {
        sfxTone(600, 0.08, 0.15, "sine");
        sfxTone(400, 0.1, 0.08, "triangle", 0.02);
      }
    }

    updateCounts();

    // Schedule next flip after showing result
    clearTimeout(state.flipTimeout);
    state.flipTimeout = setTimeout(() => emitFlip(), 2500);
  });

  socket.on("war:tie", ({ faceUp, warDown, pileCounts }) => {
    if (!window._gameLocal || window._gameLocal.gameType !== "war") return; // M6
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
      msg.textContent = "⚔️ WAR! ⚔️";
      msg.className = "war-message war-tie";
      // Add shake animation to layout
      const layout = document.querySelector(".war-layout");
      if (layout) {
        layout.classList.add("war-tie-shake");
        setTimeout(() => layout.classList.remove("war-tie-shake"), 550);
      }
    }

    // Play dramatic WAR sound
    const sfxTone = window._gameShared && window._gameShared.sfxTone;
    if (sfxTone) {
      sfxTone(165, 0.5, 0.25, "sawtooth");
      sfxTone(220, 0.5, 0.2, "sawtooth", 0.06);
      sfxTone(277, 0.4, 0.12, "square", 0.12);
    }

    updateCounts();
  });
})();
