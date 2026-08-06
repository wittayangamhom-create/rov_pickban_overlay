// นาฬิกาดราฟต์ และการเดินไปเฟสถัดไป
//
// แยกจาก domain/draft.js ตรงที่ไฟล์นี้ "มีผลข้างเคียง" ตั้ง interval จริง
// และแก้ state จริง ส่วนตัวลำดับกับตัวแปลงเวลาเป็นฟังก์ชันบริสุทธิ์อยู่ที่โน่น

const { clampNumber } = require('../lib/sanitize');
const {
  DRAFT_SEQUENCE,
  parseSlotId,
  parseTimeToSeconds,
  formatSeconds
} = require('../domain/draft');
const { getState, emitState } = require('../store/live-state');

let draftInterval = null;
let draftSeconds = parseTimeToSeconds(getState().timer);

function getDraftSeconds() {
  return draftSeconds;
}

function setDraftSeconds(value) {
  draftSeconds = value;
}

// เรียกหลังเปลี่ยน state.timer จากทางอื่น เพื่อให้นาฬิกาตรงกับที่แสดง
function syncSecondsFromState() {
  draftSeconds = parseTimeToSeconds(getState().timer);
}

function stopDraftTimer() {
  if (draftInterval) {
    clearInterval(draftInterval);
    draftInterval = null;
  }
  getState().draftRunning = false;
}

function runDraftInterval() {
  if (draftInterval) clearInterval(draftInterval);
  draftInterval = setInterval(() => {
    draftSeconds -= 1;
    getState().timer = formatSeconds(draftSeconds);
    emitState();
    if (draftSeconds <= 0) {
      startDraftPhase(getState().draftPhaseIndex + 1);
    }
  }, 1000);
}

function startDraftPhase(index) {
  stopDraftTimer();
  const state = getState();
  const safeIndex = clampNumber(index, 0, DRAFT_SEQUENCE.length);
  if (safeIndex >= DRAFT_SEQUENCE.length) {
    state.draftPhaseIndex = safeIndex;
    state.draftLabel = 'coming soon';
    state.draftActiveSlots = [];
    state.timer = '';
    state.draftRunning = false;
    emitState();
    return;
  }

  const phase = DRAFT_SEQUENCE[safeIndex];
  state.draftPhaseIndex = safeIndex;
  state.draftLabel = phase.label;
  state.draftActiveSlots = phase.slots || [];
  draftSeconds = phase.seconds;
  state.timer = formatSeconds(draftSeconds);
  state.draftRunning = true;
  emitState();
  runDraftInterval();
}

function checkAndAdvancePhase() {
  const state = getState();
  const slots = state.draftActiveSlots;
  if (!slots || slots.length === 0) return;
  const allFilled = slots.every((slotId) => {
    const parsed = parseSlotId(slotId);
    if (!parsed) return false;
    return Boolean(state[parsed.team][parsed.type][parsed.index]);
  });
  if (allFilled) startDraftPhase(state.draftPhaseIndex + 1);
}

function resetDraft() {
  stopDraftTimer();
  const state = getState();
  state.draftPhaseIndex = -1;
  state.draftLabel = '';
  state.draftActiveSlots = [];
  state.draftRunning = false;
  state.timer = '00:00';
  draftSeconds = 0;
  emitState();
}

function resumeDraft() {
  const state = getState();
  if (!state.draftRunning && state.draftPhaseIndex >= 0) {
    draftSeconds = draftSeconds > 0 ? draftSeconds : DRAFT_SEQUENCE[state.draftPhaseIndex]?.seconds || 60;
    state.timer = formatSeconds(draftSeconds);
    state.draftRunning = true;
    emitState();
    runDraftInterval();
  }
}

module.exports = {
  getDraftSeconds,
  setDraftSeconds,
  syncSecondsFromState,
  stopDraftTimer,
  startDraftPhase,
  checkAndAdvancePhase,
  resetDraft,
  resumeDraft
};
