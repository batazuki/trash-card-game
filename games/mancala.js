// games/mancala.js — Mancala server logic

module.exports = function(io, helpers) {
  const { endGame } = helpers;

  // Circular distribution order (counter-clockwise from P0's perspective):
  // P0 pits: 0-5, P0 store: 6, P1 pits: 12,11,10,9,8,7 (visual order), P1 store: 13
  const CIRCLE = [0, 1, 2, 3, 4, 5, 6, 12, 11, 10, 9, 8, 7, 13];
  const CIRCLE_POS = new Array(14);
  CIRCLE.forEach((v, i) => { CIRCLE_POS[v] = i; });

  const P0_PITS = [0, 1, 2, 3, 4, 5];
  const P1_PITS = [7, 8, 9, 10, 11, 12];

  function initPits() {
    const p = new Array(14).fill(0);
    for (let i = 0; i < 6; i++) { p[i] = 4; p[i + 7] = 4; }
    return p;
  }

  function getValidMoves(pits, player) {
    return (player === 0 ? P0_PITS : P1_PITS).filter(i => pits[i] > 0);
  }

  function distribute(pits, pitIdx, player) {
    let stones = pits[pitIdx];
    pits[pitIdx] = 0;
    const oppStore = player === 0 ? 13 : 6;
    let pos = CIRCLE_POS[pitIdx];
    let lastIdx = pitIdx;
    while (stones > 0) {
      pos = (pos + 1) % 14;
      const idx = CIRCLE[pos];
      if (idx === oppStore) continue;
      pits[idx]++;
      stones--;
      lastIdx = idx;
    }
    return lastIdx;
  }

  function tryCapture(pits, lastIdx, player) {
    const myPits = player === 0 ? P0_PITS : P1_PITS;
    const myStore = player === 0 ? 6 : 13;
    if (!myPits.includes(lastIdx) || pits[lastIdx] !== 1) return false;
    const opposite = 12 - lastIdx;
    if (pits[opposite] <= 0) return false;
    pits[myStore] += pits[opposite] + 1;
    pits[opposite] = 0;
    pits[lastIdx] = 0;
    return true;
  }

  function isGameOver(pits) {
    return P0_PITS.every(i => pits[i] === 0) || P1_PITS.every(i => pits[i] === 0);
  }

  function collectRemaining(pits) {
    P0_PITS.forEach(i => { pits[6]  += pits[i]; pits[i] = 0; });
    P1_PITS.forEach(i => { pits[13] += pits[i]; pits[i] = 0; });
  }

  function applyMove(pits, pitIdx, player) {
    const p = pits.slice();
    const lastIdx  = distribute(p, pitIdx, player);
    const captured = tryCapture(p, lastIdx, player);
    const myStore  = player === 0 ? 6 : 13;
    const extraTurn = lastIdx === myStore;
    const nextPlayer = extraTurn ? player : 1 - player;
    return { pits: p, nextPlayer, captured, extraTurn, lastIdx };
  }

  // ── Minimax AI (P1 maximizes pits[13] - pits[6]) ────────────

  function evaluate(pits) {
    return pits[13] - pits[6];
  }

  function minimax(pits, player, depth, alpha, beta) {
    if (depth === 0 || isGameOver(pits)) {
      const p = pits.slice();
      if (isGameOver(p)) collectRemaining(p);
      return evaluate(p);
    }
    const moves = getValidMoves(pits, player);
    if (!moves.length) {
      const p = pits.slice(); collectRemaining(p); return evaluate(p);
    }
    const maximize = player === 1;
    let best = maximize ? -Infinity : Infinity;
    for (const move of moves) {
      const r = applyMove(pits, move, player);
      const score = minimax(r.pits, r.nextPlayer, depth - 1, alpha, beta);
      if (maximize) { best = Math.max(best, score); alpha = Math.max(alpha, best); }
      else          { best = Math.min(best, score); beta  = Math.min(beta, best);  }
      if (beta <= alpha) break;
    }
    return best;
  }

  function chooseBestMove(pits, player) {
    const moves = getValidMoves(pits, player);
    if (!moves.length) return null;
    const maximize = player === 1;
    let bestMove = moves[0];
    let bestScore = maximize ? -Infinity : Infinity;
    for (const move of moves) {
      const r = applyMove(pits, move, player);
      const score = minimax(r.pits, r.nextPlayer, 7, -Infinity, Infinity);
      if (maximize ? score > bestScore : score < bestScore) {
        bestScore = score; bestMove = move;
      }
    }
    return bestMove;
  }

  // ── Game flow ────────────────────────────────────────────────

  function processMove(state, roomId, player, pitIdx) {
    const m = state.mancala;
    if (m.currentPlayer !== player) return;
    if (!getValidMoves(m.pits, player).includes(pitIdx)) return;

    const result = applyMove(m.pits, pitIdx, player);
    m.pits = result.pits;
    m.currentPlayer = result.nextPlayer;

    const over = isGameOver(m.pits);
    if (over) collectRemaining(m.pits);

    io.to(roomId).emit("mancala:state", {
      pits: [...m.pits],
      currentPlayer: m.currentPlayer,
      lastMove: { pitIdx, lastIdx: result.lastIdx, captured: result.captured, extraTurn: result.extraTurn, gameOver: over },
    });

    if (over) {
      const s0 = m.pits[6], s1 = m.pits[13];
      // Pass 0 for ties (avoid crash); client detects tie via equal stores
      endGame(state, roomId, s0 >= s1 ? 0 : 1);
      return;
    }

    if (state.players[result.nextPlayer] && state.players[result.nextPlayer].isAI) {
      setTimeout(() => {
        if (state.phase !== "playing" || !state.mancala) return;
        const aiMove = chooseBestMove(m.pits, result.nextPlayer);
        if (aiMove !== null) processMove(state, roomId, result.nextPlayer, aiMove);
      }, 650 + Math.random() * 400);
    }
  }

  return {
    startGame(state, roomId) {
      state.mancala = { pits: initPits(), currentPlayer: 0 };
      state.phase = "playing";

      state.players.forEach((player, i) => {
        if (!player.isAI) {
          io.to(player.id).emit("gameStart", {
            roomId,
            myPlayerIndex: i,
            players: state.players.map(p => ({ name: p.name, isAI: p.isAI })),
            game: state.game,
            mancala: { pits: [...state.mancala.pits], currentPlayer: 0 },
          });
        }
      });

      // P0 always goes first; trigger AI if P0 is AI (edge case)
      if (state.players[0] && state.players[0].isAI) {
        setTimeout(() => {
          if (state.phase !== "playing") return;
          const aiMove = chooseBestMove(state.mancala.pits, 0);
          if (aiMove !== null) processMove(state, roomId, 0, aiMove);
        }, 1000);
      }
    },

    registerEvents(socket, rooms) {
      socket.on("mancala:move", ({ roomId, pit }) => {
        const state = rooms.get(roomId);
        if (!state || state.phase !== "playing" || !state.mancala) return;
        const pi = state.players.findIndex(p => p.id === socket.id);
        if (pi === -1) return;
        processMove(state, roomId, pi, pit);
      });
    },

    getReconnectData(state) {
      if (!state.mancala) return {};
      return { mancala: { pits: [...state.mancala.pits], currentPlayer: state.mancala.currentPlayer } };
    },
  };
};
