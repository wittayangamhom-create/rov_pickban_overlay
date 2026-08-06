// ลำดับการแบน/เลือก และตัวช่วยเรื่องเวลา
//
// ส่วนนี้เป็นฟังก์ชันบริสุทธิ์ล้วน ไม่แตะ state และไม่ตั้งนาฬิกา
// ตัวที่เดินนาฬิกาจริงอยู่ที่ services/draft-engine.js
// แยกกันเพื่อให้เขียนเทสต์ลำดับดราฟต์ได้โดยไม่ต้องเปิดเซิร์ฟเวอร์
//
// เวลาจะรองรับ Bo3/Bo5 หรือกติกาที่ลำดับแบนต่างออกไป
// ให้เพิ่มเป็นชุดลำดับใหม่ในไฟล์นี้ แล้วเลือกชุดตามโหมด
// อย่าไปแก้ DRAFT_SEQUENCE ตรงๆ ของเดิมยังต้องใช้กับแมตช์ที่บันทึกไว้แล้ว

const { sanitizeText } = require('../lib/sanitize');

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

const PICK_COUNT = 5;
const BAN_COUNT = 4;

const SLOT_PATTERN = /^(blue|red)(Pick|Ban)(\d)$/;

function isPickIndex(index) {
  return Number.isInteger(index) && index >= 0 && index < PICK_COUNT;
}

function isBanIndex(index) {
  return Number.isInteger(index) && index >= 0 && index < BAN_COUNT;
}

function isSlotId(slotId) {
  if (typeof slotId !== 'string') return false;
  const match = slotId.match(SLOT_PATTERN);
  if (!match) return false;
  const index = Number(match[3]);
  return match[2] === 'Pick' ? isPickIndex(index) : isBanIndex(index);
}

// 'bluePick2' -> { team: 'teamBlue', type: 'picks', index: 2 }
// คืน null เมื่อรูปแบบไม่ถูก ผู้เรียกต้องเช็คก่อนใช้
function parseSlotId(slotId) {
  if (typeof slotId !== 'string') return null;
  const match = slotId.match(SLOT_PATTERN);
  if (!match) return null;
  return {
    team: match[1] === 'blue' ? 'teamBlue' : 'teamRed',
    type: match[2] === 'Pick' ? 'picks' : 'bans',
    index: Number(match[3])
  };
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

function sanitizeTimer(value) {
  const timer = sanitizeText(value, 8);
  return /^\d{1,2}:\d{2}$/.test(timer) || /^\d{1,3}$/.test(timer) ? timer : '00:00';
}

module.exports = {
  DRAFT_SEQUENCE,
  PICK_COUNT,
  BAN_COUNT,
  isPickIndex,
  isBanIndex,
  isSlotId,
  parseSlotId,
  parseTimeToSeconds,
  formatSeconds,
  sanitizeTimer
};
