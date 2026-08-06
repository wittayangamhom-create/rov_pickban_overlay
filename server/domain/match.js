// รูปร่างของ "แมตช์หนึ่งแมตช์" และตัวกรองให้ state อยู่ในรูปที่ถูกต้องเสมอ
//
// sanitizeState คือประตูเดียวที่ state จะเข้ามาได้ ไม่ว่าจะมาจากไฟล์ที่เซฟไว้
// พรีเซ็ต หรือค่าที่ผู้ใช้ส่งมา ทุกทางต้องผ่านตัวนี้
//
// สำคัญ: sanitizeState สร้าง object ใหม่จากรายการคีย์ที่รู้จักเท่านั้น
// คีย์แปลกปลอมจึงถูกทิ้งตอนเซฟรอบถัดไป
// ข้อมูลทัวร์นาเมนต์จึงต้องอยู่คนละไฟล์ ห้ามยัดมาไว้ใน state.json
// ไม่งั้นเปิดด้วยเวอร์ชันเก่าทีเดียวข้อมูลหายทั้งหมด

const { deepClone } = require('../lib/json');
const { clampNumber, sanitizeText, normalizeArray } = require('../lib/sanitize');
const { sanitizeHero } = require('./heroes');
const { DRAFT_SEQUENCE, PICK_COUNT, BAN_COUNT, isSlotId, sanitizeTimer } = require('./draft');
const {
  DEFAULT_OVERLAY_SIZE,
  THEME_DEFAULTS,
  HOTKEY_DEFAULTS,
  sanitizeOverlaySize,
  sanitizeTheme,
  sanitizeHotkeys
} = require('./settings');
const { SKIN_SLOTS, sanitizeLogo, sanitizeSkin } = require('./media');

const TEAM_KEYS = ['teamBlue', 'teamRed'];

function emptyTeam(name) {
  return {
    name,
    score: 0,
    // logo: v = 0 คือยังไม่มีภาพ, ตัวเลขอื่นคือเวอร์ชันไว้กัน cache
    // เก็บนามสกุลไว้ด้วย overlay จะได้ประกอบ URL ได้เลย ไม่ต้องลองโหลดทีละแบบ
    // อย่าง skin (หน้า overlay เป็นภาพออกอากาศ ลองผิดลองถูกแล้วภาพกระพริบ)
    logo: { v: 0, ext: '' },
    picks: Array.from({ length: PICK_COUNT }, () => null),
    bans: Array.from({ length: BAN_COUNT }, () => null),
    players: Array.from({ length: PICK_COUNT }, (_, i) => `Player ${i + 1}`)
  };
}

const defaultState = {
  teamBlue: emptyTeam('BLUE'),
  teamRed: emptyTeam('RED'),
  currentPhase: 'BAN',
  timer: '00:00',
  draftPhaseIndex: -1,
  draftLabel: '',
  draftActiveSlots: [],
  draftRunning: false,
  // เลือกครั้งเดียว มีผลกับทุกหน้าจอ overlay และ result
  overlaySize: DEFAULT_OVERLAY_SIZE,
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

function isTeamKey(team) {
  return team === 'teamBlue' || team === 'teamRed';
}

function sanitizeTeam(team, fallback) {
  const source = team && typeof team === 'object' ? team : {};
  return {
    name: sanitizeText(source.name, 24) || fallback.name,
    score: clampNumber(source.score, 0, 99),
    logo: sanitizeLogo(source.logo),
    picks: normalizeArray(source.picks, PICK_COUNT, sanitizeHero),
    bans: normalizeArray(source.bans, BAN_COUNT, sanitizeHero),
    players: normalizeArray(source.players, PICK_COUNT, (name, index) => (
      sanitizeText(name, 24) || `Player ${index + 1}`
    ))
  };
}

// A hero can only appear once in a draft. Once banned or picked by either
// team it is gone, so the same name must never occupy two slots.
// slotOwner is the one slot allowed to already hold it - the slot being edited.
function isHeroTaken(state, hero, slotOwner) {
  if (!hero) return false;

  return TEAM_KEYS.some((teamKey) => (
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

  TEAM_KEYS.forEach((teamKey) => {
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

module.exports = {
  TEAM_KEYS,
  defaultState,
  isTeamKey,
  sanitizeTeam,
  sanitizeState,
  isHeroTaken,
  dropDuplicateHeroes
};
