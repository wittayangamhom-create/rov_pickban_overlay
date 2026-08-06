// การตั้งค่าเครื่องมือ: ธีม, คีย์ลัด, ขนาดจอ
//
// ต่างจากข้อมูลแมตช์ตรงที่ "ไม่หาย" เวลาโหลดพรีเซ็ตหรือกด RESET MATCH
// ดูที่ CARRIED_OVER_KEYS ท้ายไฟล์

const { deepClone } = require('../lib/json');

// เลือกครั้งเดียว มีผลกับทุกหน้าจอ overlay และ result
const OVERLAY_SIZES = ['1080', '1440'];
// เขียนเป็นค่าคงที่ตรงนี้ ไม่อ้าง defaultState เพราะ match.js เรียกใช้ไฟล์นี้
// ถ้าอ้างกลับไปจะกลายเป็น require วนกัน
const DEFAULT_OVERLAY_SIZE = '1080';

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

function sanitizeOverlaySize(value) {
  return OVERLAY_SIZES.includes(String(value)) ? String(value) : DEFAULT_OVERLAY_SIZE;
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

// ค่าที่เป็น "การตั้งค่าเครื่องมือ" ไม่ใช่ข้อมูลของแมตช์
//
// โหลดพรีเซ็ตหรือกด RESET MATCH คือการเปลี่ยน "แมตช์" ไม่ใช่การล้างค่าที่
// ตั้งไว้ ธีมที่ปรับทั้งวัน คีย์ลัดที่ผูกไว้ ภาพพื้นหลังที่อัปโหลด และขนาดจอ
// ต้องอยู่เหมือนเดิม ไม่งั้นโหลดพรีเซ็ตกลางอากาศทีเดียวหน้าตาเปลี่ยนหมด
//
// ตอนทำโหมดทัวร์นาเมนต์ การกดเลือกแมตช์ก็คือการเปลี่ยนแมตช์เหมือนกัน
// ให้ใช้ทางนี้ อย่าเขียนทับ state ทั้งก้อน
const CARRIED_OVER_KEYS = ['overlayVisible', 'overlaySize', 'theme', 'hotkeys', 'skin'];

function carryOverSettings(nextState, previous) {
  CARRIED_OVER_KEYS.forEach((key) => {
    if (previous && previous[key] !== undefined) nextState[key] = deepClone(previous[key]);
  });
  return nextState;
}

module.exports = {
  OVERLAY_SIZES,
  DEFAULT_OVERLAY_SIZE,
  THEME_DEFAULTS,
  THEME_NUMBER_RANGE,
  THEME_COLOR_KEYS,
  HOTKEY_MODIFIER_CODES,
  HOTKEY_DEFAULTS,
  CARRIED_OVER_KEYS,
  sanitizeOverlaySize,
  sanitizeThemeColor,
  sanitizeTheme,
  sanitizeHotkeyBinding,
  sanitizeHotkeys,
  carryOverSettings
};
