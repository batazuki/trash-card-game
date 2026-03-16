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
- `public/games/*-client.js` — Client-side game modules. Each exposes `init(socket, roomCode, playerIndex)` and `cleanup()`.

## Ghost Game (`ghost.js` + `ghost-client.js`)

### Key Constants
- `TILE = 32` (pixels per tile, used on both server and client)
- `PLAYER_R = 14`, `ghostRadius = 16`
- Tools: `flashlight` (cone, 280px range, π/2.8 angle), `emf` (radial, 250px), `sound` (radial, 350px)

### Levels
Three areas, each defined in both files (must stay in sync):
- **Graveyard** — 80×60 tiles (2560×1920px), dark olive green
- **Garden** — 100×70 tiles (3200×2240px), deep forest green
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
- Two canvases: `canvas` (main world) + `darkCanvas` (darkness/light overlay)
- DPR-aware: canvas pixel dimensions = CSS dimensions × `devicePixelRatio`. Logic uses CSS pixel values (`cssW`, `cssH`).
- Camera: smooth follow (0.12 easing), clamped to world bounds.
- `drawWorld()` renders background + all obstacles via `drawObstacle(ob, area)` which branches by type for custom shapes.
- `applyDarkness()` cuts light sources (flashlight cone, EMF glow, sound ambient, lamp posts) from a full-screen dark overlay using `destination-out`.

### Minimap (Fog of War)
- Width: 70px max; togglable via a small map button.
- `fogGrid` — `Float32Array` of size `gridW × gridH` (64px cells). Persists for the session.
- Updated each frame: cells within active tool's visibility radius set to 1. Multiplayer: teammate positions also reveal cells.
- Rendering layers: dark base → revealed terrain (bgColor) at fog opacity → obstacle rects in revealed cells → fog overlay on partial cells → viewport rect → ghost dots → player dots → self dot.

### Ghost AI (6 personalities)
`shy`, `dramatic`, `goofy`, `grumpy`, `regal`, `confused` — each has speed, ouijaTime, diversions, fleeRange, color, planchette stiffness/damping/dwellMs.

### Socket Events (ghost: namespace prefix)
`ghost:move`, `ghost:signals`, `ghost:found`, `ghost:position`, `ghost:place_board`, `ghost:ouija_start`, `ghost:submit_name`, `ghost:identified`, `ghost:claimed`, `ghost:released`, `ghost:respawn`

## Development Notes
- No build step — vanilla JS served directly from `public/`.
- Run: `node server.js` (default port in server.js).
- Obstacle arrays are defined separately in `ghost.js` (server, for collision) and `ghost-client.js` (client, for rendering). Both must stay in sync when adding new objects.
- Non-collidable decorations (torches, candles) are included in the client obstacle array but should be omitted from the server's obstacle array (no collision needed).
- Animated objects (torches, fireplaces, lamps) use `Date.now()` in `drawWorld()` for flicker effects.
- Touch input: left 50% of screen = joystick, right 50% = tool/action buttons. Do not break this split when resizing HUD elements.
