const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '127.0.0.1';
const CONTROL_TOKEN = process.env.CONTROL_TOKEN || '';
const APP_DATA_DIR = path.join(__dirname, 'data');
const DATA_DIR = process.env.ROV_USER_DATA_DIR || APP_DATA_DIR;
const STATE_PATH = path.join(DATA_DIR, 'state.json');
const PRESETS_PATH = path.join(DATA_DIR, 'presets.json');
const PUBLIC_DIR = path.join(__dirname, 'public');

function isAllowedOrigin(origin, callback) {
  if (!origin) return callback(null, true);

  try {
    const url = new URL(origin);
    const host = url.hostname;
    const allowed =
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '::1';

    return callback(allowed ? null : new Error('Origin not allowed'), allowed);
  } catch {
    return callback(new Error('Invalid origin'), false);
  }
}

const io = socketIO(server, {
  cors: {
    origin: isAllowedOrigin,
    methods: ['GET', 'POST']
  }
});

app.use(cors({ origin: isAllowedOrigin }));
app.use(express.json({ limit: '64kb' }));
app.use(express.static(PUBLIC_DIR));

const HERO_IMAGE_DIR = path.join(PUBLIC_DIR, 'images', 'heroes');
const heroesData = normalizeHeroesData(loadJson(path.join(APP_DATA_DIR, 'heroes.json'), { heroes: [] }));
const heroSet = new Set(heroesData.heroes);

const DRAFT_SEQUENCE = [
  { label: 'Blue Ban 1', seconds: 40, slots: ['blueBan0'] },
  { label: 'Red Ban 1', seconds: 40, slots: ['redBan0'] },
  { label: 'Blue Ban 2', seconds: 40, slots: ['blueBan1'] },
  { label: 'Red Ban 2', seconds: 40, slots: ['redBan1'] },
  { label: 'Blue Pick 1', seconds: 60, slots: ['bluePick0'] },
  { label: 'Red Pick 1+2', seconds: 60, slots: ['redPick0', 'redPick1'] },
  { label: 'Blue Pick 2+3', seconds: 60, slots: ['bluePick1', 'bluePick2'] },
  { label: 'Red Pick 3', seconds: 60, slots: ['redPick2'] },
  { label: 'Red Ban 3', seconds: 40, slots: ['redBan2'] },
  { label: 'Blue Ban 3', seconds: 40, slots: ['blueBan2'] },
  { label: 'Red Ban 4', seconds: 40, slots: ['redBan3'] },
  { label: 'Blue Ban 4', seconds: 40, slots: ['blueBan3'] },
  { label: 'Red Pick 4', seconds: 60, slots: ['redPick3'] },
  { label: 'Blue Pick 4+5', seconds: 60, slots: ['bluePick3', 'bluePick4'] },
  { label: 'Red Pick 5', seconds: 60, slots: ['redPick4'] },
  { label: 'Waiting', seconds: 60, slots: [] }
];

const defaultState = {
  teamBlue: {
    name: 'FW',
    score: 0,
    picks: [null, null, null, null, null],
    bans: [null, null, null, null],
    players: ['NAILIU', 'ZHAN', 'ZHENZHE', 'VUXIANG(C)', 'WETZ']
  },
  teamRed: {
    name: 'EA',
    score: 2,
    picks: [null, null, null, null, null],
    bans: [null, null, null, null],
    players: ['PICHU(C)', 'NEGAN', 'QQ', 'NBANK', 'SRY']
  },
  currentPhase: 'BAN',
  timer: '00:17',
  draftPhaseIndex: -1,
  draftLabel: '',
  draftActiveSlots: [],
  draftRunning: false,
  matchInfo: {
    title: 'FW VS EA : GAME 3 [BO7]',
    tournament: 'ROV Premier League'
  }
};

let gameState = sanitizeState(loadJson(STATE_PATH, defaultState));
let draftInterval = null;
let draftSeconds = parseTimeToSeconds(gameState.timer);
let saveTimer = null;

function loadJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    if (filePath !== STATE_PATH && filePath !== PRESETS_PATH) {
      console.warn(`Could not load ${filePath}: ${error.message}`);
    }
    return deepClone(fallback);
  }
}

function readPresets() {
  const presets = loadJson(PRESETS_PATH, {});
  return presets && typeof presets === 'object' && !Array.isArray(presets) ? presets : {};
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function clampNumber(value, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, Math.trunc(n)));
}

function sanitizeText(value, maxLength) {
  if (typeof value !== 'string') return '';
  return value.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, maxLength);
}

function sanitizeHero(value) {
  if (value === null || value === '') return null;
  if (typeof value !== 'string') return null;
  return heroSet.has(value) ? value : null;
}

function sanitizeTimer(value) {
  const timer = sanitizeText(value, 8);
  return /^\d{1,2}:\d{2}$/.test(timer) || /^\d{1,3}$/.test(timer) ? timer : '00:00';
}

function normalizeArray(values, length, sanitizer) {
  const input = Array.isArray(values) ? values : [];
  return Array.from({ length }, (_, index) => sanitizer(input[index], index));
}

function sanitizeTeam(team, fallback) {
  const source = team && typeof team === 'object' ? team : {};
  return {
    name: sanitizeText(source.name, 24) || fallback.name,
    score: clampNumber(source.score, 0, 99),
    picks: normalizeArray(source.picks, 5, sanitizeHero),
    bans: normalizeArray(source.bans, 4, sanitizeHero),
    players: normalizeArray(source.players, 5, (name, index) => (
      sanitizeText(name, 24) || `Player ${index + 1}`
    ))
  };
}

function sanitizeState(state) {
  const source = state && typeof state === 'object' ? state : {};
  const phaseIndex = clampNumber(source.draftPhaseIndex, -1, DRAFT_SEQUENCE.length);
  const phase = DRAFT_SEQUENCE[phaseIndex];
  return {
    teamBlue: sanitizeTeam(source.teamBlue, defaultState.teamBlue),
    teamRed: sanitizeTeam(source.teamRed, defaultState.teamRed),
    currentPhase: source.currentPhase === 'PICK' ? 'PICK' : 'BAN',
    timer: sanitizeTimer(source.timer || defaultState.timer),
    draftPhaseIndex: phaseIndex,
    draftLabel: phaseIndex >= DRAFT_SEQUENCE.length ? 'coming soon' : sanitizeText(source.draftLabel || phase?.label || '', 32),
    draftActiveSlots: Array.isArray(source.draftActiveSlots) ? source.draftActiveSlots.filter(isSlotId).slice(0, 2) : [],
    draftRunning: false,
    matchInfo: {
      title: sanitizeText(source.matchInfo?.title, 80) || defaultState.matchInfo.title,
      tournament: sanitizeText(source.matchInfo?.tournament, 50) || defaultState.matchInfo.tournament
    }
  };
}

function saveStateSoon() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      writeJson(STATE_PATH, gameState);
    } catch (error) {
      console.warn(`Could not save state: ${error.message}`);
    }
  }, 150);
}

function emitState() {
  io.emit('stateUpdate', gameState);
  saveStateSoon();
}

function isTeamKey(team) {
  return team === 'teamBlue' || team === 'teamRed';
}

function isSlotId(slotId) {
  if (typeof slotId !== 'string') return false;
  const match = slotId.match(/^(blue|red)(Pick|Ban)(\d)$/);
  if (!match) return false;
  const index = Number(match[3]);
  return match[2] === 'Pick' ? isPickIndex(index) : isBanIndex(index);
}

function isPickIndex(index) {
  return Number.isInteger(index) && index >= 0 && index < 5;
}

function isBanIndex(index) {
  return Number.isInteger(index) && index >= 0 && index < 4;
}

function parseTimeToSeconds(timer) {
  if (!timer) return 0;
  const parts = String(timer).split(':').map(Number);
  if (parts.length === 2 && parts.every(Number.isFinite)) {
    return Math.max(0, parts[0] * 60 + parts[1]);
  }
  const seconds = Number(timer);
  return Number.isFinite(seconds) ? Math.max(0, Math.trunc(seconds)) : 0;
}

function formatSeconds(seconds) {
  const n = Math.max(0, Math.trunc(seconds));
  const minutes = String(Math.floor(n / 60)).padStart(2, '0');
  const secs = String(n % 60).padStart(2, '0');
  return `${minutes}:${secs}`;
}

function stopDraftTimer() {
  if (draftInterval) {
    clearInterval(draftInterval);
    draftInterval = null;
  }
  gameState.draftRunning = false;
}

function runDraftInterval() {
  if (draftInterval) clearInterval(draftInterval);
  draftInterval = setInterval(() => {
    draftSeconds -= 1;
    gameState.timer = formatSeconds(draftSeconds);
    emitState();
    if (draftSeconds <= 0) {
      startDraftPhase(gameState.draftPhaseIndex + 1);
    }
  }, 1000);
}

function startDraftPhase(index) {
  stopDraftTimer();
  const safeIndex = clampNumber(index, 0, DRAFT_SEQUENCE.length);
  if (safeIndex >= DRAFT_SEQUENCE.length) {
    gameState.draftPhaseIndex = safeIndex;
    gameState.draftLabel = 'coming soon';
    gameState.draftActiveSlots = [];
    gameState.timer = '';
    gameState.draftRunning = false;
    emitState();
    return;
  }

  const phase = DRAFT_SEQUENCE[safeIndex];
  gameState.draftPhaseIndex = safeIndex;
  gameState.draftLabel = phase.label;
  gameState.draftActiveSlots = phase.slots || [];
  draftSeconds = phase.seconds;
  gameState.timer = formatSeconds(draftSeconds);
  gameState.draftRunning = true;
  emitState();
  runDraftInterval();
}

function checkAndAdvancePhase() {
  const slots = gameState.draftActiveSlots;
  if (!slots || slots.length === 0) return;
  const allFilled = slots.every((slotId) => {
    const match = slotId.match(/^(blue|red)(Pick|Ban)(\d)$/);
    if (!match) return false;
    const team = match[1] === 'blue' ? 'teamBlue' : 'teamRed';
    const type = match[2] === 'Pick' ? 'picks' : 'bans';
    const index = Number(match[3]);
    return Boolean(gameState[team][type][index]);
  });
  if (allFilled) startDraftPhase(gameState.draftPhaseIndex + 1);
}

function isAuthorized(socket) {
  if (!CONTROL_TOKEN) return true;
  return socket.handshake.auth?.token === CONTROL_TOKEN || socket.handshake.query?.token === CONTROL_TOKEN;
}

function isAuthorizedRequest(req) {
  if (!CONTROL_TOKEN) return true;
  const auth = req.get('authorization') || '';
  const bearer = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  return req.query.token === CONTROL_TOKEN || bearer === CONTROL_TOKEN;
}

function requireControl(req, res, next) {
  if (isAuthorizedRequest(req)) return next();
  return res.status(401).json({ error: 'Unauthorized control request' });
}

function listImageFiles(dir) {
  try {
    return fs.readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name)
      .filter((name) => /\.(png|jpg|jpeg|webp)$/i.test(name))
      .sort((a, b) => a.localeCompare(b));
  } catch {
    return [];
  }
}

function normalizeHeroesData(data) {
  const imageHeroes = listImageFiles(HERO_IMAGE_DIR)
    .map((name) => name.replace(/\.(png|jpg|jpeg|webp)$/i, ''));
  let heroes = imageHeroes.length > 0 ? imageHeroes : (Array.isArray(data?.heroes) ? data.heroes : []);
  heroes = heroes.filter((hero) => typeof hero === 'string' && hero.trim()).map((hero) => hero.trim());
  return {
    heroes: Array.from(new Set(heroes)).sort((a, b) => a.localeCompare(b))
  };
}

function controlEvent(socket, eventName, handler) {
  socket.on(eventName, (payload) => {
    if (!isAuthorized(socket)) {
      socket.emit('controlError', { message: 'Unauthorized control request' });
      return;
    }
    handler(payload || {});
  });
}

app.get('/', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'control.html'));
});

app.get('/overlay', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'overlay.html'));
});

app.get('/overlay-1440', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'overlay-1440.html'));
});

app.get('/result', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'result.html'));
});

app.get('/api/heroes', (req, res) => {
  res.json(heroesData);
});

app.get('/api/state', (req, res) => {
  res.json(gameState);
});

app.get('/api/draft-sequence', (req, res) => {
  res.json({ sequence: DRAFT_SEQUENCE });
});

app.get('/api/presets', (req, res) => {
  res.json({ presets: Object.keys(readPresets()).sort((a, b) => a.localeCompare(b)) });
});

app.post('/api/presets', requireControl, (req, res) => {
  const name = sanitizeText(req.body?.name, 40);
  if (!name) return res.status(400).json({ error: 'Preset name is required' });
  const presets = readPresets();
  const sourceState = req.body?.state && typeof req.body.state === 'object' ? req.body.state : gameState;
  presets[name] = sanitizeState(sourceState);
  writeJson(PRESETS_PATH, presets);
  res.json({ ok: true, presets: Object.keys(presets).sort((a, b) => a.localeCompare(b)) });
});

app.post('/api/presets/load', requireControl, (req, res) => {
  const name = sanitizeText(req.body?.name, 40);
  const preset = readPresets()[name];
  if (!preset) return res.status(404).json({ error: 'Preset not found' });
  stopDraftTimer();
  gameState = sanitizeState(preset);
  draftSeconds = parseTimeToSeconds(gameState.timer);
  emitState();
  res.json({ ok: true, state: gameState });
});

app.post('/api/reset-state', requireControl, (req, res) => {
  stopDraftTimer();
  gameState = sanitizeState(defaultState);
  draftSeconds = parseTimeToSeconds(gameState.timer);
  emitState();
  res.json({ ok: true, state: gameState });
});

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  socket.emit('stateUpdate', gameState);

  controlEvent(socket, 'updateTeamName', ({ team, name }) => {
    if (!isTeamKey(team)) return;
    gameState[team].name = sanitizeText(name, 24) || gameState[team].name;
    emitState();
  });

  controlEvent(socket, 'updateScore', ({ team, score }) => {
    if (!isTeamKey(team)) return;
    gameState[team].score = clampNumber(score, 0, 99);
    emitState();
  });

  controlEvent(socket, 'updatePlayerName', ({ team, index, name }) => {
    if (!isTeamKey(team) || !isPickIndex(index)) return;
    gameState[team].players[index] = sanitizeText(name, 24) || `Player ${index + 1}`;
    emitState();
  });

  controlEvent(socket, 'updatePick', ({ team, index, hero }) => {
    if (!isTeamKey(team) || !isPickIndex(index)) return;
    gameState[team].picks[index] = sanitizeHero(hero);
    emitState();
    checkAndAdvancePhase();
  });

  controlEvent(socket, 'updateBan', ({ team, index, hero }) => {
    if (!isTeamKey(team) || !isBanIndex(index)) return;
    gameState[team].bans[index] = sanitizeHero(hero);
    emitState();
    checkAndAdvancePhase();
  });

  controlEvent(socket, 'clearPick', ({ team, index }) => {
    if (!isTeamKey(team) || !isPickIndex(index)) return;
    gameState[team].picks[index] = null;
    emitState();
  });

  controlEvent(socket, 'clearBan', ({ team, index }) => {
    if (!isTeamKey(team) || !isBanIndex(index)) return;
    gameState[team].bans[index] = null;
    emitState();
  });

  controlEvent(socket, 'clearAll', () => {
    gameState.teamBlue.picks = [null, null, null, null, null];
    gameState.teamBlue.bans = [null, null, null, null];
    gameState.teamRed.picks = [null, null, null, null, null];
    gameState.teamRed.bans = [null, null, null, null];
    emitState();
  });

  controlEvent(socket, 'updatePhase', (phase) => {
    gameState.currentPhase = phase === 'PICK' ? 'PICK' : 'BAN';
    emitState();
  });

  controlEvent(socket, 'updateTimer', (timer) => {
    gameState.timer = sanitizeTimer(timer);
    draftSeconds = parseTimeToSeconds(gameState.timer);
    emitState();
  });

  controlEvent(socket, 'updateMatchInfo', (data) => {
    gameState.matchInfo = {
      title: sanitizeText(data.title, 80) || gameState.matchInfo.title,
      tournament: sanitizeText(data.tournament, 50) || gameState.matchInfo.tournament
    };
    emitState();
  });

  controlEvent(socket, 'switchTeams', () => {
    const tempTeam = deepClone(gameState.teamBlue);
    gameState.teamBlue = deepClone(gameState.teamRed);
    gameState.teamRed = tempTeam;
    emitState();
  });

  controlEvent(socket, 'draftStart', () => startDraftPhase(0));
  controlEvent(socket, 'draftNext', () => startDraftPhase(gameState.draftPhaseIndex + 1));
  controlEvent(socket, 'draftPrev', () => startDraftPhase(Math.max(0, gameState.draftPhaseIndex - 1)));

  controlEvent(socket, 'draftPause', () => {
    stopDraftTimer();
    emitState();
  });

  controlEvent(socket, 'draftResume', () => {
    if (!gameState.draftRunning && gameState.draftPhaseIndex >= 0) {
      draftSeconds = draftSeconds > 0 ? draftSeconds : DRAFT_SEQUENCE[gameState.draftPhaseIndex]?.seconds || 60;
      gameState.timer = formatSeconds(draftSeconds);
      gameState.draftRunning = true;
      emitState();
      runDraftInterval();
    }
  });

  controlEvent(socket, 'draftReset', () => {
    stopDraftTimer();
    gameState.draftPhaseIndex = -1;
    gameState.draftLabel = '';
    gameState.draftActiveSlots = [];
    gameState.draftRunning = false;
    gameState.timer = '00:00';
    draftSeconds = 0;
    emitState();
  });

  controlEvent(socket, 'swapPicks', ({ team, index1, index2 }) => {
    if (!isTeamKey(team) || !isPickIndex(index1) || !isPickIndex(index2)) return;
    const picks = gameState[team].picks;
    [picks[index1], picks[index2]] = [picks[index2], picks[index1]];
    emitState();
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

server.listen(PORT, HOST, () => {
  console.log('===========================================');
  console.log('ROV Overlay Tool Server Running');
  console.log('===========================================');
  console.log(`Control Panel: http://${HOST}:${PORT}`);
  console.log(`Overlay 1920x1080: http://${HOST}:${PORT}/overlay`);
  console.log(`Overlay 2560x1440: http://${HOST}:${PORT}/overlay-1440`);
  console.log(`Result: http://${HOST}:${PORT}/result`);
  console.log('===========================================');
  if (CONTROL_TOKEN) {
    console.log('Control token protection is enabled.');
  }
});
