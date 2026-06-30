# ROV Pick & Ban Overlay Tool

A real-time draft pick and ban phase overlay for **Arena of Valor (ROV)** tournaments, built to integrate with OBS Studio via browser source.

---

## Features

- Real-time draft pick and ban phase display synced across all connected browsers
- Searchable hero dropdowns for all 125 ROV heroes — type to filter instantly
- 5 pick slots and 4 ban slots per team (Blue & Red)
- Hero icon display for ban phase, full art for picks
- Customizable team names, scores, and player names (with swap buttons)
- Team logo support
- Countdown timer with pause/resume
- Switch Teams button to swap all team data at once
- Clean 1920×1080 Full HD overlay layout

---

## Tech Stack

- **Node.js** + **Express** — HTTP server & static file serving
- **Socket.IO** — real-time two-way communication between control panel and overlay
- **Vanilla JS / HTML / CSS** — no frontend framework needed

---

## Requirements

- Node.js v16 or higher
- npm

---

## Installation

**1. Clone or extract the project**

```bash
cd rov-overlay-tool
```

**2. Install dependencies**

```bash
npm install
```

**3. Add hero images**

Place hero artwork in `public/images/heroes/` using lowercase filenames:

```
public/images/heroes/nakroth.png
public/images/heroes/violet.png
public/images/heroes/tel'annas.png
public/images/heroes/bolt baron.png   # spaces are fine
```

> Images should be **240×390px**. Filenames must be all lowercase.

Place hero icons (for ban phase) in `public/images/heroes-icons/` at **80×80px**.

Place team logos in `public/images/team-logos/` at **200×200px** (optional).

**4. Start the server**

```bash
# Production
npm start

# Development (auto-restarts on file changes)
npm run dev
```

The server runs at `http://localhost:3000`.

---

## How to Use

### Control Panel

Open in your browser:

```
http://localhost:3000
```

From here you can:

- Set tournament name and match label
- Set team names, scores, and player names (5 per team)
- Select heroes for each pick and ban slot using the searchable dropdowns
- Use the **swap player** buttons to reorder positions within a team
- Use the **Switch Teams** button to swap all Blue/Red data
- Set and control the countdown timer

**Using the searchable dropdowns:**

1. Click a dropdown to open it
2. Type part of a hero name (e.g., `nak`, `tel`)
3. The list filters in real time — click or press Enter to confirm
4. Press Esc to close, or click the X button to clear a slot

### Overlay (for OBS)

Open in a browser or add as a Browser Source in OBS:

```
http://localhost:3000/overlay
```

**OBS setup:**
1. Add a **Browser Source**
2. Set URL: `http://localhost:3000/overlay`
3. Set width: `1920`, height: `1080`
4. (Optional) Enable "Refresh browser when scene becomes active"

### Result Screen

```
http://localhost:3000/result
```

A post-draft result view showing both teams' picks and bans.

---

## Project Structure

```
rov-overlay-tool/
├── server.js                 # Express + Socket.IO server
├── package.json
├── data/
│   └── heroes.json           # Hero list (all lowercase)
└── public/
    ├── control.html          # Control panel UI
    ├── overlay.html          # OBS overlay
    ├── result.html           # Result screen
    ├── css/
    │   ├── control.css
    │   ├── overlay.css
    │   └── result.css
    ├── js/
    │   ├── control.js
    │   ├── overlay.js
    │   └── result.js
    └── images/
        ├── heroes/           # Full art (240×390px)
        ├── heroes-icons/     # Ban phase icons (80×80px)
        └── team-logos/       # Team logos (200×200px)
```

---

## Customization

**Change team colors** — edit `public/css/overlay.css`:

```css
.blue-team .pick-slot { border-color: #00bfff; }
.red-team .pick-slot  { border-color: #ff4444; }
```

**Check for missing hero images:**

```bash
npm run check-heroes
```

---

## Troubleshooting

| Problem | Solution |
|---|---|
| Hero image not showing | Check that the filename is lowercase and matches the hero name in `heroes.json` |
| Overlay not updating | Make sure the server is running and both pages are on the same `localhost:3000` |
| Port already in use | Change the port in `server.js` and update your OBS URL accordingly |

---

## License

MIT
