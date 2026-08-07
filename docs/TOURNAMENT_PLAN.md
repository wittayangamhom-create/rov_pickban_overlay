# Tournament Management Upgrade — Plan and Decisions

This is the working design document for turning the ROV pick/ban overlay into a
full tournament management app in the spirit of Challonge, with **every piece of
user data stored locally on the user's device**. No accounts, no cloud, no hosting.

It is written to stand alone: if you pick this up in a fresh session, with no
conversation history, everything needed to continue is here or in `CLAUDE.md`.

---

## 0. Where things stand

**Last updated 2026-08-07.** Phases 0–3 are merged into `main`. Not pushed to
`origin` yet — `origin/main` is still at `34ea94f`.

| Commit | What |
|---|---|
| `07914a2` | Phase 0 — split `server.js` into modules, shared client lib, 23 tests, `npm run check` |
| `168e21b` | Phase 1 — SQLite data layer for tournaments and teams, 16 more tests |
| `8f57759` | TypeScript conversion of `server/` and `tests/` |
| `7b00e06` | This document brought up to date |
| `bf76d9e` | Phase 2 — home is the tournament list, `/tournament/:id` detail page |
| `16fe9bb` | Phase 3 — team registry UI, per-team logos, rosters, cap in the UI |

Current state: **0 type errors under `strict`, 56 tests passing, packaged
`.exe` verified correct.** Creating a tournament, adding teams from the
registry or inline, editing rosters, uploading team logos and deleting all work
end to end in the browser.

`tournament.db` is created on first use of a tournament feature, not at
startup, so anyone using only the overlay never grows a database file. It is
gitignored — it is user data, not source.

**Next up: Phase 4** — bracket generation and random matching. The roster is
now fillable, so there are teams to draw against each other.

---

## 1. Confirmed decisions

Decided with the user. Do not re-open without a reason.

| Decision | Choice | Why |
|---|---|---|
| Storage | Local only, SQLite | Matches the free non-commercial license; no ops cost |
| Round robin size | Capped 24 teams; group stage above that | 128-team RR is 8,128 matches — unusable as one bracket |
| Concurrent matches | One live match at a time | There is one overlay; other matches keep their own saved drafts |
| Existing presets | Kept as standalone quick-match | Still useful outside tournaments; nothing migrated |
| Teams | Global registry + per-game snapshot | See §4 |
| Team logos | Global, keyed by server-generated team id | Never named from user-typed team names |
| 128 limit | Per-tournament roster, not the registry | The directory may hold hundreds over time |
| Operator UI stack | Stay on Electron/Node + HTML | See Appendix A |
| Language | TypeScript, `strict` | The id graph ahead is where types earn their keep |

---

## 2. Tech stack decisions and the reasoning

**SQLite via `node:sqlite`, not `better-sqlite3`.** `better-sqlite3` is a native
module that needs rebuilding for each Electron version — historically the step
that breaks on upgrade. `node:sqlite` ships inside Node itself. Verified working
in Electron 43 (Node 24.17) by direct probe before committing to it. Zero
dependencies, nothing extra for electron-builder to get wrong. `DatabaseSync` is
synchronous, matching the existing `readFileSync` style, so no async rewrite.

**TypeScript 5.9, deliberately not 7.x.** npm installs 7.x by default now; it
failed immediately because TS 7 (the Go rewrite) has already removed
`moduleResolution: node10`. Too new to sit under a tool used live on stream.

**Compiler output is `build/`, not `dist/`.** `dist/` is electron-builder's
output directory. Sharing it would have the two build systems overwriting each
other.

**`@types/express` pinned to `^4.17`.** npm installs v5 by default, which
describes Express 5 — the project runs Express 4.22.

**Only `server/` and `tests/` are TypeScript.** `public/js/` is still plain
JavaScript, served as classic `<script>` tags with no bundler. See §8.

---

## 3. Data layout

```
DATA_DIR/
  state.json       live broadcast match   (existing, unchanged)
  presets.json     quick-match presets    (existing, unchanged)
  tournament.db    SQLite: tournaments, teams, rosters     <- added Phase 1
```

**Tournament data must never live inside `state.json`.** `sanitizeState` rebuilds
state from a fixed key list, so unknown keys are dropped on the next save. A
separate file means an older build simply ignores it instead of erasing it.

No migration script is needed for existing users. `sanitizeState` already fills
missing keys from defaults, which is why today's older `state.json` still loads.

**Schema** lives in `server/store/migrations.ts` as numbered steps tracked in
`PRAGMA user_version`. Append new steps only — never edit a released one, or
machines that upgraded and machines that installed fresh end up with different
schemas. Current step 1 creates: `teams`, `team_players`, `tournaments`,
`tournament_teams`. `matches` and `games` arrive in Phases 4–5.

Foreign keys and WAL are enabled on open. `openDatabase(path)` takes a path so
tests use `':memory:'` and never touch the user's file.

---

## 4. Teams: registry plus snapshot

`teams` is the canonical, editable team profile — name, tag, logo, current roster
of five slots with one captain.

Each **game record** (Phase 5+) must store a frozen copy of
`{teamId, name, logo, players}` as they were at that match.

The reason for both: the registry is the team *as it is today*; the snapshot is
*who actually played*. Without the snapshot, editing a roster next season
silently rewrites last season's match pages and corrupts the pick/ban statistics
that depend on them.

Team ids are generated server-side (`server/domain/ids.ts`) and validated with
`isSafeMediaId` before being used as a filename. Logos live at
`media/team-logos/<teamId>.<ext>`, alongside the live match's `blue-team` and
`red-team` slot logos.

Sharing that folder is safe because the two naming schemes cannot collide —
slot logos are fixed words, registry logos are `t` + hex — but `isTeamLogoId`
rejects the reserved slot names anyway, in case the id format ever changes.
A test creates a team literally named `../../evil name` and asserts the file
still lands as `<id>.png`.

---

## 5. Formats and limits

Implemented in `server/domain/tournament.ts`, enforced in
`server/store/tournaments.ts` — **in the store, not the page.** The UI should
also block it for good UX, but the rule holds even if the page is bypassed.

| Format | Min | Max |
|---|---|---|
| `single_elim` | 2 | 128 |
| `double_elim` | 2 | 128 |
| `round_robin` | 2 | **24** |
| `group_stage` | 4 | 128 |

Series length per match: Bo1 / Bo3 / Bo5 / Bo7. Bo2 and Bo4 are rejected — they
cannot decide a winner.

**Changing to a format with a lower cap is refused, not truncated.** 30 teams
switching to round robin returns an error and drops nobody. Silently deleting
six teams because someone changed a dropdown is the worse failure.

Random seeding uses a shuffle; **round robin uses the circle method**, which
makes "no team appears twice in a round" true by construction rather than by
retrying until it looks right. (Phase 4.)

`DRAFT_SEQUENCE` in `server/domain/draft.ts` is still a fixed 16-phase, 4-ban
sequence. Draft format needs to become per-tournament configuration before match
records reference it. Add new sequences as separate tables — do not edit the
existing one, because saved matches will reference it.

---

## 6. Analytics

**Capture continuously, not at the end.** Today every RESET MATCH and preset load
destroys the current pick/ban data. Mirror each pick and ban into the game record
as it happens, so nothing is lost if the operator forgets to save, and
"real time" needs no extra machinery.

This must ship with or before the first playable match. Games drafted before
capture exists are unrecoverable.

**Denominator is games, not draft slots.** Dividing by slots makes every hero's
share sum to 100%, which answers no useful question.

| Metric | Meaning |
|---|---|
| Pick rate | games picked ÷ games |
| Ban rate | games banned ÷ games |
| Presence | games picked **or** banned ÷ games — lead with this |
| Win rate | wins ÷ games picked |
| Ban priority | restricted to first-phase bans |

Scale: 129 heroes, 18 consumed per game, so a typical hero sits near 7.8% pick /
6.2% ban / 14% presence. Signal is in the top ~30.

Only count games whose draft is **locked**; render an in-progress draft as a
separate live layer, never folded into the percentages, or every hero's rate
lurches downward mid-draft.

Cost is negligible — 300 games × 18 slots is a sub-millisecond loop, so recompute
on read rather than maintaining incremental counters. Broadcast to a Socket.IO
**room** so only the analytics page pays for the payload.

---

## 7. Phases

| Phase | Work | Status |
|---|---|---|
| 0 | Modularize `server.js`, shared client lib, tests, `npm run check` | done `07914a2` |
| — | TypeScript conversion | done `8f57759` |
| 1 | Tournament + team data layer (SQLite) | done `168e21b` |
| 2 | Home becomes the tournament list; `/tournament/:id` | done `bf76d9e` |
| 3 | Team registry UI, logos, rosters, 128 cap in the UI | done `16fe9bb` |
| 4 | Formats, bracket generation, random matching | **next** |
| 5 | Match → control panel, live-match pointer, results write back | |
| 6 | `/teams` directory and `/teams/:id` profile with history | |
| 7 | Team-list overlay with staggered slide-in | |
| 8 | Pick/ban analytics, live, per tournament and per team | |

The team-list overlay must not rely on `animationend` alone — OBS freezes browser
sources that are off-scene, so the event may never fire. Use the timer fallback
pattern already in `public/js/overlay.js`.

---

## 8. Open items

- **A relative asset path on `/tournament/:id` breaks silently** — see §9. Any new nested page must use absolute `/js/` and `/css/` paths.
- **`public/js/` is not TypeScript, and it has now cost a real bug.** Phase 3
  shipped `tournament.js` referencing `controlToken` without destructuring it
  from `window.RovClient`. Logo upload threw `ReferenceError`, the `catch`
  turned it into a toast, and it looked like an upload failure. A compiler would
  have caught it before the browser did. Converting needs a second tsconfig
  (browser target, no module syntax, `window.RovClient` globals) and a serving
  strategy for the output. This is the strongest remaining argument for doing it.
- **Global hotkeys via Electron `globalShortcut`.** Agreed but not built. Lets a
  caster drive the draft while OBS has focus. The app's own hotkeys page
  currently implies this is impossible — true for a browser page, not for the
  Electron main process.
- **Push to `origin`.** Phases 0–3 are merged into local `main`, but
  `origin/main` is still at `34ea94f`. Nothing is on the remote yet.
- **Test goals 2–4** (game modes consistent, no overlapping random matches,
  room for future development) land with Phase 4. Goal 1 (128-team cap) is done
  and tested.

---

## 9. Traps already paid for

Each of these cost real debugging time. They are also in `CLAUDE.md`.

- **`config.ts` computes `ROOT_DIR` two levels up**, because at runtime it lives
  at `build/server/config.js`. Get it wrong and `public/`, hero images and the
  data directory resolve to nowhere *while the server still starts*.
- **`build.files` ships `build/server/**/*`, not `server/**/*`** — the compiled
  output, never the source. A missing entry builds a clean `.exe` that dies on
  launch.
- **`require('./server/index')` never `require('./server')`.** Node resolves
  files before folders, so the short form loads `server.js` into itself.
- **`getState()`/`setState()`, never a captured reference.** State is replaced
  wholesale on preset load and reset.
- **No escape sequences for control characters in source.** Some tooling turns
  them into real bytes, including NUL. `npm run check` fails the build if raw
  control bytes appear anywhere.
- **Hero identity is an image filename.** Renaming a hero image voids historical
  records referencing the old name. Stored history is opaque — never re-sanitize
  it against the live roster.
- **`switchTeams` swaps sides wholesale.** Side-split statistics need the side
  recorded at capture time.
- **`/tournament/:id` sits a level deeper than every other page.** Its HTML must
  use absolute `/js/…` and `/css/…` paths; a relative `js/x.js` resolves to
  `/tournament/js/x.js` and 404s. Covered by a test in `tournament-api.test.ts`.
- **Closing a SQLite database before deleting its folder** — Windows refuses the
  delete while WAL handles are open. Test cleanup calls `closeDatabase()` first.

---

## Appendix A — the C# native option (deferred, not rejected)

Considered 2026-08-06: build every operator page in C# and keep only the overlays
in HTML/CSS/JS.

```
C# desktop app (WPF / WinUI 3 / Avalonia)
   ├── operator UI: tournaments, teams, brackets, control panel, analytics
   ├── data: SQLite
   └── embedded ASP.NET Core (Kestrel) + SignalR
          └── serves only /overlay, /overlay-1440, /result, /teams
```

**Gains:** native global hotkeys, virtualized grids for 128-team rosters, typing
throughout, far smaller install than Electron, faster startup. Use **WebView2**
for the Design page preview so the overlay CSS is never re-implemented in XAML.

**Costs:** rewriting ~4,000 lines of working operator UI; two languages
permanently; the state contract becomes an API boundary where one `sanitizeState`
serves both sides today; Windows-only unless Avalonia.

**The split is not clean.** Data entry and large grids favour C#; brackets and
analytics charts are easier in HTML/SVG. A 128-team bracket with connector lines
is harder in XAML than in SVG.

**Timing:** the cheap moment to switch is *before* the tournament UI exists.
Afterwards, switching discards far more than the control panel does today.

**Deferred because** the deciding factor is C#/XAML proficiency, and learning WPF
while designing a tournament system means two hard problems at once. The module
boundaries map onto C# almost 1:1 (`domain/` → domain classes, `store/` →
repositories, `sockets/` → SignalR hubs), so this document and that structure are
the starting point if it is ever picked up.

**Revisit if:** C# fluency arrives, Electron install size becomes a real
complaint, or operator UI performance suffers at 128 teams.
