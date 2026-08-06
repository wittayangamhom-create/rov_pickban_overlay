// กติกาของทัวร์นาเมนต์: รูปแบบการแข่ง, จำนวนทีมที่รับได้, สถานะ
//
// ไฟล์นี้เป็นฟังก์ชันบริสุทธิ์ล้วน ไม่แตะฐานข้อมูล
// ตัวที่เขียนลงฐานอยู่ที่ store/tournaments.js
// แยกกันเพื่อให้เขียนเทสต์กติกาได้โดยไม่ต้องเปิดฐานข้อมูล

const { sanitizeText, clampNumber } = require('../lib/sanitize');

const NAME_MAX = 60;
const NOTE_MAX = 500;

// เพดานของทั้งระบบ: หนึ่งทัวร์นาเมนต์รับได้ 128 ทีม
// ทะเบียนทีมกลางไม่จำกัด เก็บได้เรื่อยๆ ข้ามปี
const MAX_TEAMS = 128;

// พบกันหมดที่ 128 ทีม = 8,128 คู่ ตารางแข่งใหญ่เกินกว่าจะใช้งานจริงได้
// เกินเพดานนี้ให้ไปใช้แบ่งสายแทน (group_stage)
const ROUND_ROBIN_MAX_TEAMS = 24;

const FORMATS = {
  single_elim: { label: 'Single elimination', minTeams: 2, maxTeams: MAX_TEAMS },
  double_elim: { label: 'Double elimination', minTeams: 2, maxTeams: MAX_TEAMS },
  round_robin: { label: 'Round robin', minTeams: 2, maxTeams: ROUND_ROBIN_MAX_TEAMS },
  group_stage: { label: 'Group stage', minTeams: 4, maxTeams: MAX_TEAMS }
};

const STATUSES = ['active', 'finished'];
const BEST_OF_OPTIONS = [1, 3, 5, 7];

const DEFAULT_FORMAT = 'single_elim';
const DEFAULT_STATUS = 'active';
const DEFAULT_BEST_OF = 3;

function isFormat(value) {
  return Object.prototype.hasOwnProperty.call(FORMATS, value);
}

function sanitizeFormat(value) {
  return isFormat(value) ? value : DEFAULT_FORMAT;
}

function sanitizeStatus(value) {
  return STATUSES.includes(value) ? value : DEFAULT_STATUS;
}

// Bo ต้องเป็นเลขคี่ที่กำหนดไว้เท่านั้น Bo2 หรือ Bo4 ตัดสินผู้ชนะไม่ได้
function sanitizeBestOf(value) {
  const n = clampNumber(value, 1, 7);
  return BEST_OF_OPTIONS.includes(n) ? n : DEFAULT_BEST_OF;
}

// จำนวนทีมสูงสุดที่รูปแบบนี้รับได้
function maxTeamsFor(format) {
  return FORMATS[sanitizeFormat(format)].maxTeams;
}

// เช็คก่อนเพิ่มทีมเข้าทัวร์นาเมนต์
// currentCount = จำนวนทีมที่มีอยู่แล้ว, adding = จำนวนที่กำลังจะเพิ่ม
// คืน { ok: true } หรือ { ok: false, error }
function canAddTeams(format, currentCount, adding = 1) {
  const limit = maxTeamsFor(format);
  if (currentCount + adding > limit) {
    const label = FORMATS[sanitizeFormat(format)].label;
    return {
      ok: false,
      limit,
      error: currentCount >= limit
        ? `This tournament is full (${limit} teams max for ${label})`
        : `Only ${limit - currentCount} slot(s) left (${limit} teams max for ${label})`
    };
  }
  return { ok: true, limit };
}

// เช็คว่าเปลี่ยนรูปแบบได้ไหม เมื่อมีทีมอยู่แล้ว
// เช่น มี 40 ทีมอยู่ แล้วจะเปลี่ยนไป round_robin (เพดาน 24) ต้องห้ามไว้
function canUseFormat(format, teamCount) {
  const limit = maxTeamsFor(format);
  if (teamCount > limit) {
    const label = FORMATS[sanitizeFormat(format)].label;
    return {
      ok: false,
      limit,
      error: `${label} allows at most ${limit} teams, but this tournament has ${teamCount}`
    };
  }
  return { ok: true, limit };
}

// พร้อมเริ่มจับคู่หรือยัง
function canGenerateMatches(format, teamCount) {
  const spec = FORMATS[sanitizeFormat(format)];
  if (teamCount < spec.minTeams) {
    return { ok: false, error: `${spec.label} needs at least ${spec.minTeams} teams` };
  }
  return canUseFormat(format, teamCount);
}

// คืน { tournament } เมื่อผ่าน หรือ { error } เมื่อไม่ผ่าน
function sanitizeTournamentInput(input) {
  const source = input && typeof input === 'object' ? input : {};
  const name = sanitizeText(source.name, NAME_MAX);
  if (!name) return { error: 'Tournament name is required' };

  return {
    tournament: {
      name,
      status: sanitizeStatus(source.status),
      format: sanitizeFormat(source.format),
      bestOf: sanitizeBestOf(source.bestOf),
      note: sanitizeText(source.note, NOTE_MAX)
    }
  };
}

module.exports = {
  NAME_MAX,
  NOTE_MAX,
  MAX_TEAMS,
  ROUND_ROBIN_MAX_TEAMS,
  FORMATS,
  STATUSES,
  BEST_OF_OPTIONS,
  DEFAULT_FORMAT,
  DEFAULT_STATUS,
  DEFAULT_BEST_OF,
  isFormat,
  sanitizeFormat,
  sanitizeStatus,
  sanitizeBestOf,
  maxTeamsFor,
  canAddTeams,
  canUseFormat,
  canGenerateMatches,
  sanitizeTournamentInput
};
