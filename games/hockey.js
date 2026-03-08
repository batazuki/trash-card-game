// games/hockey.js — Cat Paw Hockey server logic

module.exports = function(io, helpers) {
  const { endGame } = helpers;

  // Physics constants (normalized 0–1 coordinate space)
  const BALL_R    = 0.025;
  const PADDLE_R  = 0.055;
  const MOUSE_R   = 0.02;
  const GOAL_W    = 0.35;   // goal width centered
  const MAX_SPEED = 0.025;
  const FRICTION  = 0.9993;
  const WIN_SCORE = 7;
  const TICK_MS   = 16;     // ~60fps
  const BROADCAST_EVERY = 2; // broadcast every 2nd tick (~30Hz)

  // Paddle bounds
  const P0_Y_MIN = 0.52, P0_Y_MAX = 0.95;
  const P1_Y_MIN = 0.05, P1_Y_MAX = 0.48;

  function initHockeyState() {
    return {
      ball:    { x: 0.5, y: 0.5, vx: 0, vy: 0 },
      paddles: [{ x: 0.5, y: 0.85 }, { x: 0.5, y: 0.15 }],
      prevPaddles: [{ x: 0.5, y: 0.85 }, { x: 0.5, y: 0.15 }],
      score:   [0, 0],
      mouse:   null,
      paused:  true,
      pauseTimer: 0,
      loopRef: null,
      tick:    0,
      mouseTimer: 0,
      nextMouseTime: randomMouseDelay(),
    };
  }

  function randomMouseDelay() {
    return Math.floor(480 + Math.random() * 420); // 8–15 seconds in ticks
  }

  function resetBall(h, towardPlayer) {
    h.ball.x = 0.5;
    h.ball.y = 0.5;
    const angle = (Math.random() * 0.6 - 0.3); // slight random x
    const speed = 0.008;
    h.ball.vx = Math.sin(angle) * speed;
    h.ball.vy = towardPlayer === 0 ? speed : -speed;
    h.paused = true;
    h.pauseTimer = 90; // 1.5 seconds at 60fps
  }

  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }

  function dist(a, b) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function clampSpeed(ball) {
    const spd = Math.sqrt(ball.vx * ball.vx + ball.vy * ball.vy);
    if (spd > MAX_SPEED) {
      ball.vx = (ball.vx / spd) * MAX_SPEED;
      ball.vy = (ball.vy / spd) * MAX_SPEED;
    }
  }

  function collidePaddle(ball, paddle, prevPaddle) {
    const d = dist(ball, paddle);
    const minDist = BALL_R + PADDLE_R;
    if (d >= minDist || d === 0) return false;

    // Normal from paddle to ball
    const nx = (ball.x - paddle.x) / d;
    const ny = (ball.y - paddle.y) / d;

    // Push ball out of paddle
    ball.x = paddle.x + nx * (minDist + 0.001);
    ball.y = paddle.y + ny * (minDist + 0.001);

    // Reflect velocity
    const dot = ball.vx * nx + ball.vy * ny;
    ball.vx -= 2 * dot * nx;
    ball.vy -= 2 * dot * ny;

    // Add paddle velocity influence (directional push)
    const pvx = (paddle.x - prevPaddle.x) * 0.35;
    const pvy = (paddle.y - prevPaddle.y) * 0.35;
    ball.vx += pvx;
    ball.vy += pvy;

    // Ensure minimum speed after paddle hit
    const spd = Math.sqrt(ball.vx * ball.vx + ball.vy * ball.vy);
    if (spd < 0.004) {
      ball.vx = nx * 0.005;
      ball.vy = ny * 0.005;
    }

    clampSpeed(ball);
    return true;
  }

  function isInGoal(x) {
    const goalLeft = 0.5 - GOAL_W / 2;
    const goalRight = 0.5 + GOAL_W / 2;
    return x >= goalLeft && x <= goalRight;
  }

  function updateMouse(h) {
    if (h.mouse) {
      h.mouse.x += h.mouse.vx;
      h.mouse.y += h.mouse.vy;
      // Remove if off-screen
      if (h.mouse.x < -0.05 || h.mouse.x > 1.05 || h.mouse.y < -0.05 || h.mouse.y > 1.05) {
        h.mouse = null;
      }
    }

    if (!h.mouse && !h.paused) {
      h.mouseTimer++;
      if (h.mouseTimer >= h.nextMouseTime) {
        // Spawn mouse
        const fromLeft = Math.random() > 0.5;
        const my = 0.3 + Math.random() * 0.4;
        h.mouse = {
          x: fromLeft ? -0.03 : 1.03,
          y: my,
          vx: fromLeft ? 0.004 : -0.004,
          vy: (Math.random() - 0.5) * 0.001,
        };
        h.mouseTimer = 0;
        h.nextMouseTime = randomMouseDelay();
      }
    }
  }

  function collideMouse(ball, mouse) {
    if (!mouse) return false;
    const d = dist(ball, mouse);
    if (d >= BALL_R + MOUSE_R) return false;

    // Deflect ball in a random direction
    const angle = Math.random() * Math.PI * 2;
    const spd = Math.sqrt(ball.vx * ball.vx + ball.vy * ball.vy);
    const newSpd = Math.max(spd, 0.008);
    ball.vx = Math.cos(angle) * newSpd;
    ball.vy = Math.sin(angle) * newSpd;
    clampSpeed(ball);
    return true;
  }

  function updateAI(h, aiIndex) {
    const paddle = h.paddles[aiIndex];
    const ball = h.ball;

    // Predict where ball will be at AI's y level
    let targetX = ball.x;
    const aiY = aiIndex === 1 ? 0.15 : 0.85;

    // Simple prediction: if ball is moving toward AI, predict intercept
    const movingTowardAI = (aiIndex === 1 && ball.vy < 0) || (aiIndex === 0 && ball.vy > 0);
    if (movingTowardAI && Math.abs(ball.vy) > 0.001) {
      const ticksToReach = (aiY - ball.y) / ball.vy;
      if (ticksToReach > 0 && ticksToReach < 200) {
        targetX = ball.x + ball.vx * ticksToReach;
        // Handle wall bounces in prediction
        while (targetX < 0 || targetX > 1) {
          if (targetX < 0) targetX = -targetX;
          if (targetX > 1) targetX = 2 - targetX;
        }
      }
    }

    // Add slight randomness
    targetX += (Math.random() - 0.5) * 0.04;

    // Move toward target
    const maxAISpeed = 0.012;
    const dx = targetX - paddle.x;
    paddle.x += clamp(dx, -maxAISpeed, maxAISpeed);
    paddle.x = clamp(paddle.x, PADDLE_R, 1 - PADDLE_R);

    // Slight y movement toward resting position
    const restY = aiIndex === 1 ? 0.15 : 0.85;
    const dy = restY - paddle.y;
    paddle.y += clamp(dy, -0.003, 0.003);
    paddle.y = clamp(paddle.y, aiIndex === 1 ? P1_Y_MIN : P0_Y_MIN,
                               aiIndex === 1 ? P1_Y_MAX : P0_Y_MAX);
  }

  function physicsTick(state, roomId) {
    const h = state.hockey;
    if (!h) return;
    h.tick++;

    // Handle pause (after goal)
    if (h.paused) {
      h.pauseTimer--;
      if (h.pauseTimer <= 0) {
        h.paused = false;
      }
      // Still broadcast during pause so clients see score/positions
      if (h.tick % BROADCAST_EVERY === 0) {
        broadcast(state, roomId);
      }
      return;
    }

    // AI paddle
    if (state.players[1] && state.players[1].isAI) {
      updateAI(h, 1);
    }

    // Store previous paddle positions for velocity calc
    for (let i = 0; i < 2; i++) {
      h.prevPaddles[i] = { x: h.paddles[i].x, y: h.paddles[i].y };
    }

    // Ball movement
    h.ball.x += h.ball.vx;
    h.ball.y += h.ball.vy;
    h.ball.vx *= FRICTION;
    h.ball.vy *= FRICTION;

    // Side wall bounces
    if (h.ball.x - BALL_R < 0) {
      h.ball.x = BALL_R;
      h.ball.vx = Math.abs(h.ball.vx);
    } else if (h.ball.x + BALL_R > 1) {
      h.ball.x = 1 - BALL_R;
      h.ball.vx = -Math.abs(h.ball.vx);
    }

    // Top/bottom walls & goals
    let scored = -1;
    if (h.ball.y - BALL_R < 0) {
      if (isInGoal(h.ball.x)) {
        scored = 0; // Player 0 scores (ball went into P1's goal at top)
      } else {
        h.ball.y = BALL_R;
        h.ball.vy = Math.abs(h.ball.vy);
      }
    } else if (h.ball.y + BALL_R > 1) {
      if (isInGoal(h.ball.x)) {
        scored = 1; // Player 1 scores (ball went into P0's goal at bottom)
      } else {
        h.ball.y = 1 - BALL_R;
        h.ball.vy = -Math.abs(h.ball.vy);
      }
    }

    if (scored >= 0) {
      h.score[scored]++;
      io.to(roomId).emit("hockey:goal", { scorerIndex: scored, score: [...h.score] });

      if (h.score[scored] >= WIN_SCORE) {
        clearInterval(h.loopRef);
        h.loopRef = null;
        endGame(state, roomId, scored);
        return;
      }

      // Reset ball toward the player who was scored on
      resetBall(h, scored === 0 ? 1 : 0);
      broadcast(state, roomId);
      return;
    }

    // Paddle collisions
    for (let i = 0; i < 2; i++) {
      collidePaddle(h.ball, h.paddles[i], h.prevPaddles[i]);
    }

    // Mouse NPC
    updateMouse(h);
    if (h.mouse && collideMouse(h.ball, h.mouse)) {
      io.to(roomId).emit("hockey:mousehit");
      h.mouse = null;
    }

    // Broadcast state
    if (h.tick % BROADCAST_EVERY === 0) {
      broadcast(state, roomId);
    }
  }

  function broadcast(state, roomId) {
    const h = state.hockey;
    io.to(roomId).emit("hockey:state", {
      ball: { x: h.ball.x, y: h.ball.y },
      paddles: h.paddles.map(p => ({ x: p.x, y: p.y })),
      score: h.score,
      mouse: h.mouse ? { x: h.mouse.x, y: h.mouse.y } : null,
      paused: h.paused,
      tick: h.tick,
    });
  }

  return {
    startGame(state, roomId) {
      state.hockey = initHockeyState();
      state.phase = "playing";

      state.players.forEach((player, i) => {
        if (!player.isAI) {
          io.to(player.id).emit("gameStart", {
            roomId,
            myPlayerIndex: i,
            players: state.players.map(p => ({ name: p.name, isAI: p.isAI })),
            game: state.game,
            hockey: {
              ball: { ...state.hockey.ball },
              paddles: state.hockey.paddles.map(p => ({ ...p })),
              score: [...state.hockey.score],
              mouse: null,
              paused: true,
            },
          });
        }
      });

      // Start with a pause then launch ball
      resetBall(state.hockey, Math.random() > 0.5 ? 0 : 1);

      // Start physics loop
      state.hockey.loopRef = setInterval(() => {
        if (state.phase !== "playing") {
          clearInterval(state.hockey.loopRef);
          state.hockey.loopRef = null;
          return;
        }
        physicsTick(state, roomId);
      }, TICK_MS);
    },

    registerEvents(socket, rooms) {
      socket.on("hockey:paddle", ({ roomId, x, y }) => {
        const state = rooms.get(roomId);
        if (!state || state.phase !== "playing" || !state.hockey) return;
        const pi = state.players.findIndex(p => p.id === socket.id);
        if (pi === -1) return;

        // Clamp to player's half
        const px = clamp(x, PADDLE_R, 1 - PADDLE_R);
        let py;
        if (pi === 0) {
          py = clamp(y, P0_Y_MIN, P0_Y_MAX);
        } else {
          py = clamp(y, P1_Y_MIN, P1_Y_MAX);
        }
        state.hockey.paddles[pi].x = px;
        state.hockey.paddles[pi].y = py;
      });
    },

    getReconnectData(state, playerIndex) {
      if (!state.hockey) return {};
      const h = state.hockey;
      return {
        hockey: {
          ball: { x: h.ball.x, y: h.ball.y },
          paddles: h.paddles.map(p => ({ x: p.x, y: p.y })),
          score: [...h.score],
          mouse: h.mouse ? { x: h.mouse.x, y: h.mouse.y } : null,
          paused: h.paused,
        },
      };
    },
  };
};
