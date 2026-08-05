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

// ที่เก็บภาพที่ผู้ใช้อัปโหลด (โลโก้ทีม + ภาพพื้นหลัง)
//
// ตอนแพ็กเป็น .exe โค้ดทั้งก้อนอยู่ใน app.asar ซึ่งเป็น "ไฟล์" ไม่ใช่โฟลเดอร์
// เขียนไฟล์ลง __dirname/public/... จึงพังด้วย ENOTDIR
// เหมือนกับ state/presets ที่ย้ายไป ROV_USER_DATA_DIR ภาพก็ต้องออกมาอยู่นอก
// asar เช่นกัน ตอนรันจาก source (ไม่ได้ตั้ง env) ใช้ public/images ตามเดิม
// ของเก่าที่มีอยู่แล้วจะได้ยังใช้ได้
const USER_MEDIA_DIR = process.env.ROV_USER_MEDIA_DIR || path.join(PUBLIC_DIR, 'images');

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

// ภาพที่ผู้ใช้อัปโหลดต้องมาก่อน static ของ public
// URL ยังเป็น /images/team-logos/... กับ /images/skins/... เหมือนเดิม
// หน้าเว็บจึงไม่ต้องรู้ว่าไฟล์จริงย้ายออกไปนอก asar แล้ว
app.use('/images/team-logos', express.static(path.join(USER_MEDIA_DIR, 'team-logos')));
app.use('/images/skins', express.static(path.join(USER_MEDIA_DIR, 'skins')));

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

// Declared up here, not next to sanitizeOverlaySize: gameState is built by
// sanitizeState during module init, so anything it reaches must already exist.
const OVERLAY_SIZES = ['1080', '1440'];

// ภาพพื้นหลังที่ผู้ใช้ออกแบบเอง แยกเป็นส่วนบน/ส่วนล่าง และแยกตามขนาดจอ
// overlay: บน = แถบ ban/score/timer, ล่าง = การ์ด pick
// result:  บน = ฝั่งน้ำเงิน, ล่าง = ฝั่งแดง
//
// แยก 1080p กับ 1440p คนละไฟล์ เพราะขนาดที่วาดจริงไม่เท่ากัน
// ถ้าใช้ไฟล์เดียวกัน ภาพ 1080p จะถูกขยายขึ้นไปใช้กับ 1440p แล้วเบลอ
const SKIN_SLOTS = {
  overlayTop1080: 'overlay-top-1080',
  overlayTop1440: 'overlay-top-1440',
  overlayBottom1080: 'overlay-bottom-1080',
  overlayBottom1440: 'overlay-bottom-1440',
  resultTop1080: 'result-top-1080',
  resultTop1440: 'result-top-1440',
  resultBottom1080: 'result-bottom-1080',
  resultBottom1440: 'result-bottom-1440'
};
const SKIN_DIR = path.join(USER_MEDIA_DIR, 'skins');
const SKIN_MAX_BYTES = 8 * 1024 * 1024;
const SKIN_TYPES = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };

// โลโก้ทีม แยกจาก skin เพราะผูกกับทีม ไม่ได้ผูกกับขนาดจอ
// ชื่อไฟล์มาจากตารางนี้เท่านั้น ไม่เอาค่าจากผู้ใช้มาต่อ path
const LOGO_SLOTS = { teamBlue: 'blue-team', teamRed: 'red-team' };
const LOGO_DIR = path.join(USER_MEDIA_DIR, 'team-logos');
const LOGO_MAX_BYTES = 4 * 1024 * 1024;

// ธีมของ overlay ทุกค่าตรงกับ CSS custom property ใน overlay.css
// ค่า default ต้องตรงกับ :root ในไฟล์นั้นเป๊ะๆ ไม่งั้นกด Reset แล้วหน้าตาเปลี่ยน
const THEME_DEFAULTS = {
  blue: '#38bdf8',
  red: '#f87171',
  accent: '#f59e0b',
  text: '#ffffff',
  label: '#c0c0c0',
  typeCaption: 14,
  typePlayer: 18,
  typeTournament: 18,
  typeTitle: 24,
  typeScore: 42,
  typeTimer: 40,
  logoSize: 138,
  logoInset: 10
};

// ช่วงที่ยอมให้ปรับ กว้างพอให้เล่นได้ แต่ไม่ถึงขั้นทำ layout พัง
const THEME_NUMBER_RANGE = {
  typeCaption: [8, 40],
  typePlayer: [10, 48],
  typeTournament: [10, 48],
  typeTitle: [10, 60],
  typeScore: [12, 96],
  typeTimer: [12, 96],
  logoSize: [40, 260],
  logoInset: [-40, 200]
};
const THEME_COLOR_KEYS = ['blue', 'red', 'accent', 'text', 'label'];

// คีย์ลัดของหน้า Control Panel ตั้งค่าได้จากหน้า /hotkeys
//
// code = event.code ของปุ่มจริง เช่น 'Space', 'KeyZ', 'ArrowLeft'
// ยกเว้นปุ่ม modifier ล้วน เก็บเป็นชื่อจาก event.key ('Alt', 'Control', ...)
// เพราะจะถูกดักตอน "แตะเดี่ยวๆ" ไม่ใช่ตอนกดค้างเป็นคีย์ผสม
const HOTKEY_MODIFIER_CODES = ['Alt', 'Control', 'Shift', 'Meta'];
const HOTKEY_DEFAULTS = {
  toggleBanner: { code: 'Alt', ctrl: false, shift: false, alt: false, meta: false },
  pauseResume: { code: 'Space', ctrl: false, shift: false, alt: false, meta: false },
  prevPhase: { code: 'ArrowLeft', ctrl: false, shift: false, alt: false, meta: false },
  nextPhase: { code: 'ArrowRight', ctrl: false, shift: false, alt: false, meta: false },
  undo: { code: 'KeyZ', ctrl: true, shift: false, alt: false, meta: false }
};

// ค่าที่เป็น "การตั้งค่าเครื่องมือ" ไม่ใช่ข้อมูลของแมตช์
//
// โหลดพรีเซ็ตหรือกด RESET MATCH คือการเปลี่ยน "แมตช์" ไม่ใช่การล้างค่าที่
// ตั้งไว้ ธีมที่ปรับทั้งวัน คีย์ลัดที่ผูกไว้ ภาพพื้นหลังที่อัปโหลด และขนาดจอ
// ต้องอยู่เหมือนเดิม ไม่งั้นโหลดพรีเซ็ตกลางอากาศทีเดียวหน้าตาเปลี่ยนหมด
const CARRIED_OVER_KEYS = ['overlayVisible', 'overlaySize', 'theme', 'hotkeys', 'skin'];

function carryOverSettings(nextState, previous) {
  CARRIED_OVER_KEYS.forEach((key) => {
    if (previous && previous[key] !== undefined) nextState[key] = deepClone(previous[key]);
  });
  return nextState;
}

// logo: v = 0 คือยังไม่มีภาพ, ตัวเลขอื่นคือเวอร์ชันไว้กัน cache
// เก็บนามสกุลไว้ด้วย overlay จะได้ประกอบ URL ได้เลย ไม่ต้องลองโหลดทีละแบบ
// อย่าง skin (หน้า overlay เป็นภาพออกอากาศ ลองผิดลองถูกแล้วภาพกระพริบ)
const defaultState = {
  teamBlue: {
    name: 'BLUE',
    score: 0,
    logo: { v: 0, ext: '' },
    picks: [null, null, null, null, null],
    bans: [null, null, null, null],
    players: ['Player 1', 'Player 2', 'Player 3', 'Player 4', 'Player 5']
  },
  teamRed: {
    name: 'RED',
    score: 0,
    logo: { v: 0, ext: '' },
    picks: [null, null, null, null, null],
    bans: [null, null, null, null],
    players: ['Player 1', 'Player 2', 'Player 3', 'Player 4', 'Player 5']
  },
  currentPhase: 'BAN',
  timer: '00:00',
  draftPhaseIndex: -1,
  draftLabel: '',
  draftActiveSlots: [],
  draftRunning: false,
  // เลือกครั้งเดียว มีผลกับทุกหน้าจอ overlay และ result
  overlaySize: '1080',
  // ซ่อน/แสดงแถบ overlay ทั้งแถบ ไว้ตัดเข้าเกมโดยไม่ต้องปิด source ใน OBS
  overlayVisible: true,
  theme: { ...THEME_DEFAULTS },
  hotkeys: deepClone(HOTKEY_DEFAULTS),
  skin: {
    enabled: false,     // ใช้ภาพที่อัปโหลดเป็นพื้นหลังหรือไม่
    showPanels: true,   // ยังวาดกรอบ/พื้นหลังแบบเดิมของแอพอยู่หรือไม่
    // 0 = ยังไม่มีภาพ, ตัวเลขอื่น = เวอร์ชันไว้กัน cache
    // เติมจาก SKIN_SLOTS ตอนโหลด จะได้ไม่ต้องมาไล่แก้สองที่
    slots: {}
  },
  matchInfo: {
    title: 'BLUE VS RED',
    tournament: 'ROV Tournament'
  }
};

Object.keys(SKIN_SLOTS).forEach((key) => { defaultState.skin.slots[key] = 0; });

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

function sanitizeOverlaySize(value) {
  return OVERLAY_SIZES.includes(String(value)) ? String(value) : defaultState.overlaySize;
}

function sanitizeSkin(value) {
  const source = value && typeof value === 'object' ? value : {};
  const slotsIn = source.slots && typeof source.slots === 'object' ? source.slots : {};
  const slots = {};
  Object.keys(SKIN_SLOTS).forEach((key) => {
    const n = Number(slotsIn[key]);
    slots[key] = Number.isFinite(n) && n > 0 ? Math.trunc(n) : 0;
  });
  return {
    enabled: source.enabled === true,
    showPanels: source.showPanels !== false,
    slots
  };
}

// ชื่อไฟล์มาจากตารางที่กำหนดไว้เท่านั้น ไม่เอาค่าจากผู้ใช้มาต่อ path ตรงๆ
function skinFilePath(slot, ext) {
  return path.join(SKIN_DIR, `${SKIN_SLOTS[slot]}.${ext}`);
}

function removeSkinFiles(slot) {
  Object.values(SKIN_TYPES).forEach((ext) => {
    try { fs.unlinkSync(skinFilePath(slot, ext)); } catch { /* ไม่มีไฟล์ก็ข้ามไป */ }
  });
}

function logoFilePath(team, ext) {
  return path.join(LOGO_DIR, `${LOGO_SLOTS[team]}.${ext}`);
}

function removeLogoFiles(team) {
  Object.values(SKIN_TYPES).forEach((ext) => {
    try { fs.unlinkSync(logoFilePath(team, ext)); } catch { /* ไม่มีไฟล์ก็ข้ามไป */ }
  });
}

function sanitizeTimer(value) {
  const timer = sanitizeText(value, 8);
  return /^\d{1,2}:\d{2}$/.test(timer) || /^\d{1,3}$/.test(timer) ? timer : '00:00';
}

function normalizeArray(values, length, sanitizer) {
  const input = Array.isArray(values) ? values : [];
  return Array.from({ length }, (_, index) => sanitizer(input[index], index));
}

// สีต้องเป็น #rrggbb เท่านั้น ค่านี้ถูกเอาไปยัดใส่ CSS custom property
// ตรงๆ ปล่อยให้กรอกอะไรก็ได้เท่ากับเปิดช่องให้แทรก CSS
function sanitizeThemeColor(value, fallback) {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value.trim())
    ? value.trim().toLowerCase()
    : fallback;
}

function sanitizeTheme(value) {
  const source = value && typeof value === 'object' ? value : {};
  const theme = {};

  THEME_COLOR_KEYS.forEach((key) => {
    theme[key] = sanitizeThemeColor(source[key], THEME_DEFAULTS[key]);
  });

  Object.entries(THEME_NUMBER_RANGE).forEach(([key, [min, max]]) => {
    const n = Number(source[key]);
    theme[key] = Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : THEME_DEFAULTS[key];
  });

  return theme;
}

// code มาจากผู้ใช้กดปุ่มอะไรก็ได้ จำกัดรูปแบบไว้ให้เป็นชื่อ code ของ DOM
// เท่านั้น ค่านี้ถูกเอาไปเทียบกับ event.code ตรงๆ ไม่ได้เอาไปต่อเป็น HTML
function sanitizeHotkeyBinding(value, fallback) {
  const source = value && typeof value === 'object' ? value : {};
  const code = typeof source.code === 'string' ? source.code.trim() : '';
  if (!/^[A-Za-z][A-Za-z0-9]{0,19}$/.test(code)) return { ...fallback };
  return {
    code,
    ctrl: source.ctrl === true,
    shift: source.shift === true,
    alt: source.alt === true,
    meta: source.meta === true
  };
}

function sanitizeHotkeys(value) {
  const source = value && typeof value === 'object' ? value : {};
  const hotkeys = {};
  Object.entries(HOTKEY_DEFAULTS).forEach(([action, fallback]) => {
    hotkeys[action] = sanitizeHotkeyBinding(source[action], fallback);
  });
  return hotkeys;
}

// นามสกุลต้องเป็นค่าที่รู้จักเท่านั้น เพราะถูกเอาไปต่อเป็นชื่อไฟล์
function sanitizeLogo(value) {
  const source = value && typeof value === 'object' ? value : {};
  const v = Number(source.v);
  const ext = Object.values(SKIN_TYPES).includes(source.ext) ? source.ext : '';
  if (!Number.isFinite(v) || v <= 0 || !ext) return { v: 0, ext: '' };
  return { v: Math.trunc(v), ext };
}

function sanitizeTeam(team, fallback) {
  const source = team && typeof team === 'object' ? team : {};
  return {
    name: sanitizeText(source.name, 24) || fallback.name,
    score: clampNumber(source.score, 0, 99),
    logo: sanitizeLogo(source.logo),
    picks: normalizeArray(source.picks, 5, sanitizeHero),
    bans: normalizeArray(source.bans, 4, sanitizeHero),
    players: normalizeArray(source.players, 5, (name, index) => (
      sanitizeText(name, 24) || `Player ${index + 1}`
    ))
  };
}

// A hero can only appear once in a draft. Once banned or picked by either
// team it is gone, so the same name must never occupy two slots.
// slotOwner is the one slot allowed to already hold it - the slot being edited.
function isHeroTaken(state, hero, slotOwner) {
  if (!hero) return false;

  return ['teamBlue', 'teamRed'].some((teamKey) => (
    ['picks', 'bans'].some((type) => (
      state[teamKey][type].some((value, index) => {
        if (value !== hero) return false;
        const isOwnSlot = slotOwner &&
          slotOwner.team === teamKey &&
          slotOwner.type === type &&
          slotOwner.index === index;
        return !isOwnSlot;
      })
    ))
  ));
}

// Presets and hand-edited state files can still contain duplicates.
// Keep the first occurrence and drop the rest so the invariant always holds.
function dropDuplicateHeroes(state) {
  const seen = new Set();

  ['teamBlue', 'teamRed'].forEach((teamKey) => {
    ['bans', 'picks'].forEach((type) => {
      state[teamKey][type] = state[teamKey][type].map((hero) => {
        if (!hero) return null;
        if (seen.has(hero)) return null;
        seen.add(hero);
        return hero;
      });
    });
  });

  return state;
}

function sanitizeState(state) {
  const source = state && typeof state === 'object' ? state : {};
  const phaseIndex = clampNumber(source.draftPhaseIndex, -1, DRAFT_SEQUENCE.length);
  const phase = DRAFT_SEQUENCE[phaseIndex];
  return dropDuplicateHeroes({
    teamBlue: sanitizeTeam(source.teamBlue, defaultState.teamBlue),
    teamRed: sanitizeTeam(source.teamRed, defaultState.teamRed),
    currentPhase: source.currentPhase === 'PICK' ? 'PICK' : 'BAN',
    timer: sanitizeTimer(source.timer || defaultState.timer),
    draftPhaseIndex: phaseIndex,
    draftLabel: phaseIndex >= DRAFT_SEQUENCE.length ? 'coming soon' : sanitizeText(source.draftLabel || phase?.label || '', 32),
    draftActiveSlots: Array.isArray(source.draftActiveSlots) ? source.draftActiveSlots.filter(isSlotId).slice(0, 2) : [],
    draftRunning: false,
    overlaySize: sanitizeOverlaySize(source.overlaySize),
    overlayVisible: source.overlayVisible !== false,
    theme: sanitizeTheme(source.theme),
    hotkeys: sanitizeHotkeys(source.hotkeys),
    skin: sanitizeSkin(source.skin),
    matchInfo: {
      title: sanitizeText(source.matchInfo?.title, 80) || defaultState.matchInfo.title,
      tournament: sanitizeText(source.matchInfo?.tournament, 50) || defaultState.matchInfo.tournament
    }
  });
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

// Undo only covers the teams, never the clock. Rewinding the timer mid-draft
// would be worse than the mistake being undone.
const UNDO_LIMIT = 40;
const undoStack = [];

function pushUndo() {
  undoStack.push({
    teamBlue: deepClone(gameState.teamBlue),
    teamRed: deepClone(gameState.teamRed)
  });
  if (undoStack.length > UNDO_LIMIT) undoStack.shift();
}

function popUndo() {
  const previous = undoStack.pop();
  if (!previous) return false;
  gameState.teamBlue = previous.teamBlue;
  gameState.teamRed = previous.teamRed;
  return true;
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

// / เป็นหน้าแรกแล้ว ไม่ใช่ control panel
// control ย้ายไป /control ส่วน /index.html ทิ้ง redirect ไว้ให้ของเก่าที่ bookmark ไว้
app.get('/', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'home.html'));
});

app.get('/control', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'control.html'));
});

app.get('/index.html', (req, res) => res.redirect('/control'));

app.get('/overlay', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'overlay.html'));
});

app.get('/overlay-1440', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'overlay-1440.html'));
});

app.get('/result', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'result.html'));
});

// หน้าตั้งค่าภาพพื้นหลัง แยกจาก Control Panel เพราะเป็นงานก่อนแข่ง
app.get('/design', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'design.html'));
});

app.get('/hotkeys', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'hotkeys.html'));
});

app.get('/presets', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'presets.html'));
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

// ย่อพรีเซ็ตให้เหลือเท่าที่หน้า /presets ต้องใช้แสดงการ์ด
// ไม่ส่ง state ทั้งก้อนกลับไป เพราะรายการเดียวก็ใหญ่แล้ว
function presetSummary(name, preset) {
  const countFilled = (list) => (Array.isArray(list) ? list.filter(Boolean).length : 0);
  return {
    name,
    tournament: preset?.matchInfo?.tournament || '',
    title: preset?.matchInfo?.title || '',
    blue: {
      name: preset?.teamBlue?.name || '',
      score: preset?.teamBlue?.score ?? 0,
      players: Array.isArray(preset?.teamBlue?.players) ? preset.teamBlue.players : [],
      picks: countFilled(preset?.teamBlue?.picks),
      bans: countFilled(preset?.teamBlue?.bans)
    },
    red: {
      name: preset?.teamRed?.name || '',
      score: preset?.teamRed?.score ?? 0,
      players: Array.isArray(preset?.teamRed?.players) ? preset.teamRed.players : [],
      picks: countFilled(preset?.teamRed?.picks),
      bans: countFilled(preset?.teamRed?.bans)
    }
  };
}

// presets = ชื่อล้วน ของเดิม ไม่แตะ / details = ข้อมูลย่อสำหรับหน้าใหม่
// ทุก endpoint ที่แก้รายการส่งชุดนี้กลับไป หน้าเว็บจะได้ไม่ต้องยิงซ้ำ
function presetListPayload(presets) {
  const names = Object.keys(presets).sort((a, b) => a.localeCompare(b));
  return { presets: names, details: names.map((name) => presetSummary(name, presets[name])) };
}

app.get('/api/presets', (req, res) => {
  res.json(presetListPayload(readPresets()));
});

app.post('/api/presets', requireControl, (req, res) => {
  const name = sanitizeText(req.body?.name, 40);
  if (!name) return res.status(400).json({ error: 'Preset name is required' });
  const presets = readPresets();
  const sourceState = req.body?.state && typeof req.body.state === 'object' ? req.body.state : gameState;
  // พรีเซ็ตเก็บเฉพาะข้อมูลแมตช์ ตัดการตั้งค่าเครื่องมือทิ้ง
  // ตอนโหลดก็ไม่ได้เอาไปใช้อยู่แล้ว เก็บไว้มีแต่จะทำให้เข้าใจผิดว่ามันผูกกัน
  const preset = sanitizeState(sourceState);
  CARRIED_OVER_KEYS.forEach((key) => { delete preset[key]; });
  presets[name] = preset;
  writeJson(PRESETS_PATH, presets);
  res.json({ ok: true, ...presetListPayload(presets) });
});

// ชื่อพรีเซ็ตถูกใช้เป็น key ของ object เท่านั้น ไม่ได้เอาไปต่อเป็น path
// เช็คด้วย hasOwnProperty กัน key อย่าง __proto__ ที่ไม่ใช่ของจริง
app.delete('/api/presets/:name', requireControl, (req, res) => {
  const name = sanitizeText(req.params.name, 40);
  const presets = readPresets();
  if (!name || !Object.prototype.hasOwnProperty.call(presets, name)) {
    return res.status(404).json({ error: 'Preset not found' });
  }
  delete presets[name];
  writeJson(PRESETS_PATH, presets);
  res.json({ ok: true, ...presetListPayload(presets) });
});

// พรีเซ็ตเต็มก้อน ไว้ให้หน้าแก้ไขดึงค่าเดิมมาใส่ฟอร์ม
// ต้องเป็นก้อนเต็มเพราะตอนเซฟกลับต้องรักษา pick/ban ที่ฟอร์มไม่ได้แตะไว้ด้วย
app.get('/api/presets/:name', (req, res) => {
  const name = sanitizeText(req.params.name, 40);
  const presets = readPresets();
  if (!name || !Object.prototype.hasOwnProperty.call(presets, name)) {
    return res.status(404).json({ error: 'Preset not found' });
  }
  res.json({ name, state: presets[name] });
});

app.post('/api/presets/load', requireControl, (req, res) => {
  const name = sanitizeText(req.body?.name, 40);
  const preset = readPresets()[name];
  if (!preset) return res.status(404).json({ error: 'Preset not found' });
  stopDraftTimer();
  const previous = gameState;
  gameState = carryOverSettings(sanitizeState(preset), previous);
  draftSeconds = parseTimeToSeconds(gameState.timer);
  emitState();
  res.json({ ok: true, state: gameState });
});

// อัปโหลดภาพพื้นหลังที่ออกแบบเอง
//
// รับ body เป็นไฟล์ดิบ ไม่ใช้ multipart จะได้ไม่ต้องเพิ่ม dependency
// ตรวจสามชั้น: ชื่อ slot ต้องอยู่ในตารางที่กำหนด, content-type ต้องเป็นภาพ
// ที่รองรับ และ magic bytes ต้องตรงกับชนิดที่บอกมาจริงๆ
const SKIN_MAGIC = {
  png: (b) => b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47,
  jpg: (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  webp: (b) => b.length > 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP'
};

app.post(
  '/api/skin/:slot',
  requireControl,
  express.raw({ type: Object.keys(SKIN_TYPES), limit: SKIN_MAX_BYTES }),
  (req, res) => {
    const slot = req.params.slot;
    if (!Object.prototype.hasOwnProperty.call(SKIN_SLOTS, slot)) {
      return res.status(400).json({ error: 'Unknown skin slot' });
    }

    const ext = SKIN_TYPES[String(req.get('content-type')).split(';')[0].trim()];
    if (!ext) return res.status(415).json({ error: 'Use a PNG, JPG or WEBP image' });

    const body = req.body;
    if (!Buffer.isBuffer(body) || body.length === 0) {
      return res.status(400).json({ error: 'Empty upload' });
    }
    if (!SKIN_MAGIC[ext](body)) {
      return res.status(400).json({ error: 'File contents do not match its type' });
    }

    try {
      fs.mkdirSync(SKIN_DIR, { recursive: true });
      removeSkinFiles(slot); // กันกรณีเปลี่ยนนามสกุล จะได้ไม่เหลือไฟล์เก่าค้าง
      fs.writeFileSync(skinFilePath(slot, ext), body);
    } catch (error) {
      return res.status(500).json({ error: `Could not save image: ${error.message}` });
    }

    gameState.skin.slots[slot] = Date.now();
    gameState.skin.enabled = true;
    emitState();
    res.json({ ok: true, slot, ext, bytes: body.length, skin: gameState.skin });
  }
);

app.delete('/api/skin/:slot', requireControl, (req, res) => {
  const slot = req.params.slot;
  if (!Object.prototype.hasOwnProperty.call(SKIN_SLOTS, slot)) {
    return res.status(400).json({ error: 'Unknown skin slot' });
  }
  removeSkinFiles(slot);
  gameState.skin.slots[slot] = 0;
  emitState();
  res.json({ ok: true, skin: gameState.skin });
});

// ตรวจแบบเดียวกับ skin: ชื่อทีมต้องอยู่ในตาราง, content-type ต้องรองรับ
// และ magic bytes ต้องตรงกับชนิดที่บอกมาจริงๆ
app.post(
  '/api/team-logo/:team',
  requireControl,
  express.raw({ type: Object.keys(SKIN_TYPES), limit: LOGO_MAX_BYTES }),
  (req, res) => {
    const team = req.params.team;
    if (!Object.prototype.hasOwnProperty.call(LOGO_SLOTS, team)) {
      return res.status(400).json({ error: 'Unknown team' });
    }

    const ext = SKIN_TYPES[String(req.get('content-type')).split(';')[0].trim()];
    if (!ext) return res.status(415).json({ error: 'Use a PNG, JPG or WEBP image' });

    const body = req.body;
    if (!Buffer.isBuffer(body) || body.length === 0) {
      return res.status(400).json({ error: 'Empty upload' });
    }
    if (!SKIN_MAGIC[ext](body)) {
      return res.status(400).json({ error: 'File contents do not match its type' });
    }

    try {
      fs.mkdirSync(LOGO_DIR, { recursive: true });
      removeLogoFiles(team); // กันไฟล์นามสกุลเดิมค้างอยู่ตอนเปลี่ยนชนิดภาพ
      fs.writeFileSync(logoFilePath(team, ext), body);
    } catch (error) {
      return res.status(500).json({ error: `Could not save logo: ${error.message}` });
    }

    gameState[team].logo = { v: Date.now(), ext };
    emitState();
    res.json({ ok: true, team, ext, bytes: body.length, logo: gameState[team].logo });
  }
);

app.delete('/api/team-logo/:team', requireControl, (req, res) => {
  const team = req.params.team;
  if (!Object.prototype.hasOwnProperty.call(LOGO_SLOTS, team)) {
    return res.status(400).json({ error: 'Unknown team' });
  }
  removeLogoFiles(team);
  gameState[team].logo = { v: 0, ext: '' };
  emitState();
  res.json({ ok: true, team, logo: gameState[team].logo });
});

app.post('/api/reset-state', requireControl, (req, res) => {
  stopDraftTimer();
  const previous = gameState; // RESET MATCH ล้างแมตช์ ไม่ใช่ล้างการตั้งค่า
  gameState = carryOverSettings(sanitizeState(defaultState), previous);
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
    const next = sanitizeHero(hero);
    if (isHeroTaken(gameState, next, { team, type: 'picks', index })) {
      socket.emit('controlError', { message: `${next} is already used in this draft` });
      socket.emit('stateUpdate', gameState);
      return;
    }
    pushUndo();
    gameState[team].picks[index] = next;
    emitState();
    checkAndAdvancePhase();
  });

  controlEvent(socket, 'updateBan', ({ team, index, hero }) => {
    if (!isTeamKey(team) || !isBanIndex(index)) return;
    const next = sanitizeHero(hero);
    if (isHeroTaken(gameState, next, { team, type: 'bans', index })) {
      socket.emit('controlError', { message: `${next} is already used in this draft` });
      socket.emit('stateUpdate', gameState);
      return;
    }
    pushUndo();
    gameState[team].bans[index] = next;
    emitState();
    checkAndAdvancePhase();
  });

  controlEvent(socket, 'clearPick', ({ team, index }) => {
    if (!isTeamKey(team) || !isPickIndex(index)) return;
    pushUndo();
    gameState[team].picks[index] = null;
    emitState();
  });

  controlEvent(socket, 'clearBan', ({ team, index }) => {
    if (!isTeamKey(team) || !isBanIndex(index)) return;
    pushUndo();
    gameState[team].bans[index] = null;
    emitState();
  });

  controlEvent(socket, 'clearAll', () => {
    pushUndo();
    gameState.teamBlue.picks = [null, null, null, null, null];
    gameState.teamBlue.bans = [null, null, null, null];
    gameState.teamRed.picks = [null, null, null, null, null];
    gameState.teamRed.bans = [null, null, null, null];
    emitState();
  });

  controlEvent(socket, 'undo', () => {
    if (!popUndo()) {
      socket.emit('controlError', { message: 'Nothing to undo' });
      return;
    }
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

  controlEvent(socket, 'updateSkinOptions', (data) => {
    if (typeof data?.enabled === 'boolean') gameState.skin.enabled = data.enabled;
    if (typeof data?.showPanels === 'boolean') gameState.skin.showPanels = data.showPanels;
    emitState();
  });

  // เลือกขนาดครั้งเดียว ทุกหน้าที่เปิดอยู่จะสลับตามทันที
  controlEvent(socket, 'updateOverlaySize', (data) => {
    const size = typeof data === 'string' ? data : data?.size;
    gameState.overlaySize = sanitizeOverlaySize(size);
    emitState();
  });

  // ส่ง visible มาเป็น true/false ก็ตั้งค่าตามนั้น ไม่ส่งมาคือสลับ
  // ปุ่มบนหน้า control ส่งค่ามาตรงๆ ส่วนคีย์ลัดปล่อยให้ฝั่งนี้สลับให้
  // เพราะถ้าเปิด control ไว้หลายเครื่อง ต่างเครื่องอาจเห็นสถานะไม่ตรงกัน
  // patch ทีละคีย์ หน้า design ส่งมาเฉพาะตัวที่เพิ่งลาก
  // ค่าที่ไม่รู้จักถูก sanitizeTheme ตัดทิ้งเอง
  controlEvent(socket, 'updateTheme', (data) => {
    if (!data || typeof data !== 'object') return;
    gameState.theme = sanitizeTheme({ ...gameState.theme, ...data });
    emitState();
  });

  controlEvent(socket, 'updateHotkeys', (data) => {
    if (!data || typeof data !== 'object') return;
    gameState.hotkeys = sanitizeHotkeys({ ...gameState.hotkeys, ...data });
    emitState();
  });

  controlEvent(socket, 'resetHotkeys', () => {
    gameState.hotkeys = deepClone(HOTKEY_DEFAULTS);
    emitState();
  });

  controlEvent(socket, 'resetTheme', () => {
    gameState.theme = { ...THEME_DEFAULTS };
    emitState();
  });

  controlEvent(socket, 'setOverlayVisible', (data) => {
    const next = typeof data?.visible === 'boolean' ? data.visible : !gameState.overlayVisible;
    gameState.overlayVisible = next;
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
    pushUndo();
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
    pushUndo();
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
  console.log(`Home: http://${HOST}:${PORT}`);
  console.log(`Control Panel: http://${HOST}:${PORT}/control`);
  console.log(`Presets: http://${HOST}:${PORT}/presets`);
  console.log(`Overlay 1920x1080: http://${HOST}:${PORT}/overlay`);
  console.log(`Overlay 2560x1440: http://${HOST}:${PORT}/overlay-1440`);
  console.log(`Result: http://${HOST}:${PORT}/result`);
  console.log('===========================================');
  if (CONTROL_TOKEN) {
    console.log('Control token protection is enabled.');
  }
});
