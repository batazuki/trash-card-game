# Trash Card Game — CLAUDE.md

## Project Overview
A multiplayer browser game hub built with Node.js + Express + Socket.io. Players join rooms and choose from several mini-games. The app is served as a PWA (manifest, service worker).

## Architecture

### Server
- `server.js` — Express + Socket.io server. Hosts all game logic modules.
- `games/*.js` — Server-side game logic, one file per game. Each module exports a handler that attaches socket listeners.
  - `ghost.js` — Ghost Detective: cooperative multiplayer ghost hunting. Real-time tick-based (100ms). Manages ghost AI, collision, signal computation, Ouija board sequences.
  - `trash.js`, `war.js`, `hockey.js`, `solitaire.js`, `sketch.js` — Other games.

### Client
- `public/index.html` — Single-page shell; all games rendered into `#game-container`.
- `public/style.css` — Global styles + per-game UI styles. Uses CSS custom properties.
- `public/game.js` — Lobby, room management, socket setup, game switching.
- `public/games/*-client.js` — Client-side game modules. Each exposes `window.gameClients.<game>` with `onGameStart(data)`, `onReconnect(data)`, `cleanup()`.

## Lobby UI

### Two-phase flow
- `#lobby-main-view` — always visible in lobby: player name input, "Choose a Game" button, join-by-code input.
- `#lobby-game-view` — revealed after clicking "Choose a Game": game grid, game-specific options, action bar (Play Solo / Create Lobby / room code).
- `showLobbyScreen()` in `game.js` resets to main view before showing lobby (prevents getting stuck in game-view).
- `gameOver` handler has a `if (!local.roomId) return` guard to prevent end-screen showing after quit.

### Game selection grid
- 2-column CSS grid; last odd card spans full width (Ghost Detective).
- Each `.game-card` has `data-game` attribute + `--gc` CSS variable for per-game accent color.
- `updateLobbyForGame(game)` toggles game-specific option rows (sketch rounds/time, ghost area, ghost avatar).

### Ghost-specific lobby options
- `#ghost-area-row` — 2×2 grid of location pills (Random / Graveyard / Garden / Old House).
- `#ghost-avatar-row` — 3×2 grid of avatar picker buttons (built once by `buildGhostAvatarPicker()`).
  - Avatar selection persists in `localStorage` as `"ghostAvatar"` (index 0–5).
  - Selected avatar index stored in `window._ghostAvatarSelection` for ghost-client.js to read on game start.
  - `_ghostAvatar` is clamped to `[0, GHOST_AVATAR_DEFS.length - 1]` to protect against corrupted localStorage.

## Ghost Game (`ghost.js` + `ghost-client.js`)

### Key Constants
- `TILE = 32` (pixels per tile, used on both server and client)
- `PLAYER_R = 14`, `ghostRadius = 16`
- Tools: `flashlight` (cone, 280px range, π/2.8 angle), `emf` (radial, 250px), `sound` (radial, 350px)

### Levels
Three areas, each defined in both files (must stay in sync):
- **Graveyard** — 80×60 tiles (2560×1920px), dark olive green
- **Garden** — 100×70 tiles (3200×2240px), deep forest green. `playerStart: { x: 1120, y: 1120 }` (tile 35,35 — clear of fountain obstacle).
- **Old House** — 60×80 tiles (1920×2560px), near-black brown

### Obstacle Types (server + client must match)
Each obstacle: `{ x, y, w, h, type }` in pixels.
- `stone` — walls, tombstones, well bases
- `tree` — dead/live trees
- `hedge` — garden maze walls
- `flower` — flower beds
- `wood` / `table` / `chair` / `shelf` — house furniture
- `cross` — grave markers (graveyard)
- `fence` — iron fence sections (graveyard)
- `well` — stone well (graveyard)
- `torch` / `candle` — non-collidable light sources
- `shrub` — small collidable bushes
- `arch` — archway/gate structure
- `bench` — garden bench
- `lamp` — gas lamp post (also acts as ambient light source in darkness)
- `statue` — stone statue/pedestal
- `birdbath` — garden birdbath
- `pillar` — gazebo column
- `fireplace` — house fireplace
- `clock` — grandfather clock
- `mirror` — ornate mirror
- `stairs` — staircase section

### Canvas / Rendering
- Two canvases: `canvas` (main world) + `darkCanvas` (darkness/light overlay).
- **No DPR scaling** — canvas pixel dimensions = CSS dimensions (no `devicePixelRatio` multiplication). Canvas is sized via `inset: 0` style. Do NOT re-add DPR scaling.
- Camera: smooth follow (0.12 easing), clamped to world bounds.
- `drawWorld()` renders background + all obstacles via `drawObstacle(ob, area)` which branches by type for custom shapes.
- `applyDarkness()` cuts light sources (flashlight cone, EMF glow, sound ambient, lamp posts) from a full-screen dark overlay using `destination-out`.

### Avatar System
Players are rendered as procedural Canvas 2D sprites (not colored circles).

**6 avatars** (index 0–5): Detective, Witch, Explorer, Hunter, Scientist, Kid.

Each avatar:
- `AVATARS[idx]` = `{ name, body, hat, acc }` — color palette
- Drawn via `drawAvatar(ctx, cx, cy, dir, wPhase, bob, avatarIdx, isMe)`:
  - Shadow ellipse at fixed y=13 (does not bob — stays grounded)
  - Body circle (r=12) with white outline (brighter for self)
  - Head circle (skin tone) offset toward facing direction
  - Eyes (hidden when facing up)
  - Hat drawn by `drawAvatarHat(ctx, idx, av, dir)` — uses `ctx.save()/restore()` wrapper in `drawAvatar`
- Direction: `facingToDir(angle)` → `'right'/'down'/'left'/'up'` based on angle quadrant
- Walk animation: module-level `walkPhase` increments with `spd * dt * 0.12` while joystick active; drives `Math.abs(Math.sin(wPhase * π * 2)) * 1.5` vertical bounce
- Idle animation: `Math.sin(Date.now() / 1000 * 1.8) * 1.2` vertical bob when not moving
- `walkPhase` is reset to 0 in `init()` on each new game start
- Other players: `p.walkPhase` incremented from received position deltas in `ghost:player_pos` handler

**Avatar selection** in lobby (`game.js`):
- `window._ghostAvatarSelection` — set at load from localStorage, updated on picker click
- `S.me.avatar` — initialized from `window._ghostAvatarSelection || 0` in `init()`

### Socket Events (ghost: namespace prefix)
- `ghost:move` — client→server: `{ roomId, x, y, facing, avatar }` — now includes facing direction and avatar index
- `ghost:player_pos` — server→other clients: `{ playerIndex, x, y, facing, avatar }` — now forwards facing and avatar (facing was previously stored but not forwarded — this was a bug, now fixed)
- `ghost:signals`, `ghost:found`, `ghost:position`, `ghost:place_board`, `ghost:ouija_start`, `ghost:submit_name`, `ghost:identified`, `ghost:claimed`, `ghost:released`, `ghost:respawn`

### Ouija Board
- No countdown timer — removed entirely from both server and client.
- When Ouija sequence completes, an HTML `<input>` overlay (`#ouija-name-input`) appears via `openNameInput()`.
- Player types the ghost's name (using scrambled letters shown at top as clues) and submits with "Identify!" button or Enter key.
- `closeNameInput()` called by `cleanup()` and `closeOuija()`.
- No `ghost:ouija_tick` or `ghost:ouija_timeout` events exist.

### Minimap (Fog of War)
- Width: 70px max; togglable via a small map button.
- `fogGrid` — `Float32Array` of size `gridW × gridH` (64px cells). Persists for the session.
- Updated each frame: cells within active tool's visibility radius set to 1. Multiplayer: teammate positions also reveal cells.
- Rendering layers: dark base → revealed terrain (bgColor) at fog opacity → obstacle rects in revealed cells → fog overlay on partial cells → viewport rect → ghost dots → player dots → self dot.

### Ghost AI (6 personalities)
`shy`, `dramatic`, `goofy`, `grumpy`, `regal`, `confused` — each has speed, ouijaTime, diversions, fleeRange, color, planchette stiffness/damping/dwellMs.

## Development Notes
- No build step — vanilla JS served directly from `public/`.
- Run: `node server.js` (default port in server.js).
- Obstacle arrays are defined separately in `ghost.js` (server, for collision) and `ghost-client.js` (client, for rendering). Both must stay in sync when adding new objects.
- Non-collidable decorations (torches, candles) are included in the client obstacle array but should be omitted from the server's obstacle array (no collision needed). Ensured via `NON_COLLIDABLE = new Set(['torch','candle'])`.
- Animated objects (torches, fireplaces, lamps) use `Date.now()` in `drawWorld()` for flicker effects.
- Touch input: left 50% of screen = joystick, right 50% = tool/action buttons. Do not break this split when resizing HUD elements.
- `gameOver` socket event has a `if (!local.roomId) return` guard — do not remove this, it prevents the end screen from appearing after the player quits.
