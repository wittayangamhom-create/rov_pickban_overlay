# ROV Overlay Tool

Local-first Arena of Valor draft pick/ban overlay for OBS. Node + Express + Socket.IO,
wrapped in Electron. **All user data stays on the user's device** — no accounts, no cloud.

## Commands

```bash
npm start          # run the server only
npm run app        # run the Electron app
npm test           # node --test over tests/
npm run check      # every JS file parses + no stray control characters
npm run dist       # build the Windows installer + portable exe
```

## Layout

`server.js` is a two-line entry point. The real code is in `server/`:

| Folder | Holds | Depends on |
|---|---|---|
| `config.js` | ports, token, all directory paths | nothing |
| `lib/` | `json`, `sanitize` — no app knowledge | nothing |
| `domain/` | `heroes`, `draft`, `match`, `settings`, `media` — pure rules | `lib` |
| `store/` | `live-state`, `presets` — things with state | `domain` |
| `services/` | `draft-engine` — the running clock | `store` |
| `http/`, `sockets/` | transport only, no rules | everything |

Dependencies point one way, downward. Anything in `domain/` must stay pure and testable
without starting a server — that is what makes the test suite cheap to extend.

Browser pages are classic scripts (no bundler, no modules). Shared client code follows the
IIFE-plus-global pattern: `public/js/lib/app-client.js` exports `window.RovClient`,
`public/js/hotkey-utils.js` exports `window.HotkeyUtils`. New control pages load
`socket.io.js`, then `app-client.js`, then their own script.

## Rules that are not obvious

**`server.js` must keep starting the server when required.** `electron-main.js` does
`require(path.join(__dirname, 'server.js'))` right after setting `ROV_USER_DATA_DIR` and
`ROV_USER_MEDIA_DIR`. Config reads those at require time. Import it earlier and the paths
come out empty.

**Write `require('./server/index')`, never `require('./server')`.** Node resolves files
before folders, so the short form loads `server.js` into itself.

**New folders must be added to `build.files` in `package.json`.** electron-builder lists
paths explicitly. A missing entry builds a clean `.exe` that crashes on launch.

**`sanitizeState` is a whitelist.** It rebuilds state from a fixed key list, so unknown keys
are dropped on the next save. Old save files upgrade themselves for free — but it also means
**tournament data must live in its own file**, never inside `state.json`, or opening the app
with an older build would erase it.

**`getState()` / `setState()`, never a captured reference.** State is *replaced* wholesale on
preset load and reset. A module holding the old object keeps mutating a detached copy: the UI
updates while the file on disk quietly goes stale.

**Media filenames never come from user text.** `domain/media.js` maps fixed slot names to
fixed filenames. For per-team logos, derive the name from a server-generated id and check it
with `isSafeMediaId` — never from a team name someone typed.

**Hero identity is an image filename** (`public/images/heroes/airi.png` → `"airi"`), and
`sanitizeHero` returns `null` for anything unknown. Renaming a hero image silently voids
historical records that reference the old name. Stored game history must be treated as opaque
strings and **not** re-sanitized against the live roster.

**OBS freezes browser sources that are off-scene**, so `animationend` may never fire. Any
entrance animation needs a timer fallback — see `public/js/overlay.js`.

**No escape sequences for control characters in source.** Writing them as backslash-u
escapes through some tooling turns them into real bytes in the file. `lib/sanitize.js`
compares char codes instead, and `npm run check` fails the build if raw control bytes
appear anywhere.

## Where new work goes

- new page → `public/<name>.html` + `public/js/<name>.js`, route in `server/http/pages.js`
- new API → a new `server/http/api-<thing>.js`, mounted in `server/index.js`
- new rules → `server/domain/`, with tests in `tests/`
- new persisted data → its own file under `DATA_DIR` and its own module in `server/store/`

## Conventions

Comments explain *why*, in Thai, and are load-bearing — several encode bugs that already
happened. Keep them when moving code. Two-space indent, single quotes, semicolons.
