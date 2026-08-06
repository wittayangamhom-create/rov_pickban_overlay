// state ของแมตช์ที่กำลังออกอากาศ มีก้อนเดียวทั้งแอพ
//
// เข้าถึงผ่าน getState()/setState() เท่านั้น ห้าม export ตัวแปรออกไปตรงๆ
// เพราะ setState เป็นการ "แทนที่ทั้งก้อน" (โหลดพรีเซ็ต / RESET MATCH)
// โมดูลที่เก็บ reference ไว้ตั้งแต่ตอน require จะชี้ไปที่ก้อนเก่าทันที
// อาการคือหน้าเว็บอัปเดต แต่ค่าที่เซฟลงไฟล์เป็นของเก่า หาสาเหตุยากมาก
//
// ตอนทำโหมดทัวร์นาเมนต์: ตัวนี้ยังคงเป็น "แมตช์ที่ออกอากาศอยู่" เหมือนเดิม
// การกดเลือกแมตช์จากตารางแข่ง = setState(แมตช์นั้น) + จำว่ามาจากแมตช์ไหน
// ไม่ใช่การสร้าง state ก้อนที่สอง

const { STATE_PATH } = require('../config');
const { loadJson, writeJson, deepClone } = require('../lib/json');
const { defaultState, sanitizeState } = require('../domain/match');

// ไฟล์ยังไม่มีตอนเปิดแอพครั้งแรกเป็นเรื่องปกติ ไม่ต้องเตือน
let gameState = sanitizeState(loadJson(STATE_PATH, defaultState, { quiet: true }));

let io = null;
let saveTimer = null;

function attachIo(instance) {
  io = instance;
}

function getState() {
  return gameState;
}

function setState(next) {
  gameState = next;
  return gameState;
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
  if (io) io.emit('stateUpdate', gameState);
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

module.exports = {
  UNDO_LIMIT,
  attachIo,
  getState,
  setState,
  saveStateSoon,
  emitState,
  pushUndo,
  popUndo
};
