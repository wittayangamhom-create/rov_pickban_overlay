# Tournament Management Upgrade — Plan and Decisions

Status as of **2026-08-06**: Phase 0 complete, Phase 1 not started.

Goal: grow the ROV pick/ban overlay into a full tournament management app in the
spirit of Challonge, with **every piece of user data stored locally on the
user's device**. No accounts, no cloud, no hosting.

---

## 1. Confirmed decisions

These were decided with the user and should not be re-opened without a reason.

| Decision | Choice | Why |
|---|---|---|
| Storage | Local files only | Matches the free non-commercial license; no ops cost |
| Round robin size | Capped ~16–24 teams; group-stage pools above that | 128-team RR is 8,128 matches — unusable as one bracket |
| Concurrent matches | One live match at a time | There is one overlay; other matches keep their own saved drafts |
| Existing presets | Kept as standalone quick-match | Still useful outside tournaments; nothing migrated |
| Teams | Global registry + per-game snapshot | See §3 |
| Team logos | Global, keyed by server-generated team id | Never named from user-typed team names |
| 128 limit | Per-tournament roster, not the registry | The directory may hold hundreds over time |
| Operator UI stack | Stay on Electron/Node + HTML | See Appendix A |

---

## 2. Data layout

```
DATA_DIR/
  state.json            live broadcast match (existing, unchanged)
  presets.json          quick-match presets (existing, unchanged)
  teams.json            global team registry              <- new
  tournaments/
    index.json          id, name, status, format          <- new
    <id>.json           teams, matches, games             <- new
```

**Tournament data must never live inside `state.json`.** `sanitizeState` rebuilds
state from a fixed key list, so unknown keys are dropped on the next save.
Keeping tournaments in separate files means an older build simply ignores them
instead of erasing them.

No migration script is needed. `sanitizeState` already fills missing keys from
defaults, which is why today's older `state.json` still loads.

---

## 3. Teams: registry plus snapshot

`teams.json` is the canonical, editable team profile:

```
{ "t3f9a2c81": { id, name, tag, logo: {v, ext}, players: [{name, role, isCaptain}], createdAt, updatedAt } }
```

Each **game record** stores a frozen copy of `{teamId, name, logo, players}` as
they were at that match.

The reason for both: the registry is the team *as it is today*; the snapshot is
*who actually played*. Without the snapshot, editing a roster next season
silently rewrites last season's match pages and corrupts the pick/ban
statistics that depend on them.

Team ids are generated server-side and validated with `isSafeMediaId` before
being used as a filename. Logos live at `media/team-logos/<teamId>.<ext>`.

---

## 4. Formats

- Single elimination, double elimination, round robin, group stage
- Series length per match: Bo1 / Bo3 / Bo5 / Bo7
- Random seeding uses a shuffle; **round robin uses the circle method**, which
  makes "no team appears twice in a round" true by construction rather than by
  retrying until it looks right.

`DRAFT_SEQUENCE` in `server/domain/draft.js` is currently a fixed 16-phase,
4-ban sequence. Draft format needs to become per-tournament configuration
before match records start referencing it. Add new sequences as separate
tables — do not edit the existing one, because saved matches reference it.

---

## 5. Analytics

**Capture continuously, not at the end.** Today every RESET MATCH and preset
load destroys the current pick/ban data. Mirror each pick and ban into the
game record as it happens, so nothing is lost if the operator forgets to save,
and "real time" needs no extra machinery.

This must ship with or before the first playable match. Games drafted before
capture exists are unrecoverable.

**Denominator is games, not draft slots.** Dividing by slots makes every hero's
share sum to 100%, which answers no useful question.

| Metric | Meaning |
|---|---|
| Pick rate | games picked ÷ games |
| Ban rate | games banned ÷ games |
| Presence | games picked **or** banned ÷ games — the metric to lead with |
| Win rate | wins ÷ games picked |
| Ban priority | restricted to first-phase bans |

Averages for scale: 129 heroes, 18 consumed per game, so a typical hero sits
near 7.8% pick / 6.2% ban / 14% presence. Signal is in the top ~30.

Only count games whose draft is **locked**; render an in-progress draft as a
separate live layer, never folded into the percentages, or every hero's rate
lurches downward mid-draft.

Three traps:

1. **Hero identity is an image filename.** Renaming a hero image makes
   `sanitizeHero` return `null` for it. Stored history must be treated as
   opaque strings and never re-sanitized against the live roster.
2. **`switchTeams` swaps sides wholesale.** Any blue/red split statistic needs
   side recorded at capture time.
3. **Small samples lie.** Show raw counts beside every percentage and mark
   heroes below ~5 games.

Cost is negligible — 300 games × 18 slots is a sub-millisecond loop, so
recompute on read rather than maintaining incremental counters. Broadcast the
result to a Socket.IO **room** so only the analytics page pays for the payload.

---

## 6. Phases

| Phase | Work | Status |
|---|---|---|
| 0 | Modularize `server.js`, shared client lib, tests, `npm run check` | done 2026-08-06 |
| 1 | Tournament + team data layer | |
| 2 | Home becomes the tournament list; `/tournament/:id` | |
| 3 | Team registry, logos, rosters, 128 cap | |
| 4 | Formats, bracket generation, random matching | |
| 5 | Match to control panel, live-match pointer, results write back | |
| 6 | `/teams` directory and `/teams/:id` profile with history | |
| 7 | Team-list overlay with staggered slide-in | |
| 8 | Pick/ban analytics, live, per tournament and per team | |

Agreed alongside these: **global hotkeys via Electron's `globalShortcut`**, and
settling on **SQLite + TypeScript** before the tournament data format is locked.

The team-list overlay must not rely on `animationend` alone — OBS freezes
browser sources that are off-scene, so the event may never fire. Use the timer
fallback pattern already in `public/js/overlay.js`.

---

## Appendix A — the C# native option (deferred, not rejected)

Considered on 2026-08-06: build every operator page in C# and keep only the
overlays in HTML/CSS/JS.

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
permanently; the state contract becomes an API boundary where one
`sanitizeState` serves both sides today; Windows-only unless Avalonia.

**The split is not clean.** Data entry and large grids favour C#; brackets and
analytics charts are easier in HTML/SVG. A 128-team bracket with connector
lines is harder in XAML than in SVG.

**Timing:** the cheap moment to switch is *before* the tournament UI exists.
Afterwards, switching discards far more than the control panel does today.

**Deferred because** the deciding factor is C#/XAML proficiency, and learning
WPF while designing a tournament system means two hard problems at once. The
module boundaries from Phase 0 map onto C# almost 1:1 (`domain/` → domain
classes, `store/` → repositories, `sockets/` → SignalR hubs), so this document
and that structure are the starting point if it is ever picked up.

**Revisit if:** C# fluency arrives, Electron install size becomes a real
complaint, or operator UI performance suffers at 128 teams.
