// ทีมในทะเบียนกลาง ใช้ซ้ำได้ทุกทัวร์นาเมนต์
//
// ทะเบียนนี้คือ "ทีมตอนนี้" แก้ได้ตลอด เปลี่ยนชื่อ เปลี่ยนโลโก้ เปลี่ยนตัวผู้เล่น
//
// สำคัญ: ตอนบันทึกผลเกม ห้ามเก็บแค่ team_id
// ต้องก็อปชื่อ/โลโก้/รายชื่อผู้เล่น ณ ตอนนั้นแนบไปกับเกมด้วย
// ไม่งั้นพอทีมเปลี่ยนตัวผู้เล่นปีหน้า ประวัติแมตช์เก่าจะเปลี่ยนตาม
// กลายเป็นว่าคนที่ไม่ได้ลงแข่งโผล่ไปอยู่ในผลเมื่อปีที่แล้ว
// และสถิติ pick/ban ที่อ้างอิงผลพวกนั้นก็เพี้ยนตามไปด้วย

const { sanitizeText, clampNumber } = require('../lib/sanitize');
const { sanitizeLogo } = require('./media');
const { PICK_COUNT } = require('./draft');

// ชื่อทีมยาวเท่ากับที่ overlay รองรับ (sanitizeTeam ใน match.js ใช้ 24 เท่ากัน)
// ถ้าให้ยาวกว่านั้น พอโหลดขึ้น overlay จะถูกตัดอยู่ดี แต่ผู้ใช้ไม่รู้ตัว
const NAME_MAX = 24;
const TAG_MAX = 6;
const ROLE_MAX = 16;
const PLAYER_NAME_MAX = 24;

const ROSTER_SIZE = PICK_COUNT;

function sanitizePlayer(player, index) {
  const source = player && typeof player === 'object' ? player : {};
  return {
    slot: index,
    name: sanitizeText(source.name, PLAYER_NAME_MAX),
    role: sanitizeText(source.role, ROLE_MAX),
    isCaptain: source.isCaptain === true
  };
}

// รายชื่อผู้เล่นมี 5 ช่องเสมอ ปล่อยว่างได้
// ต่างจาก match.js ที่เติม 'Player 1' ให้ เพราะตรงนั้นต้องมีอะไรขึ้นจอ
// ส่วนทะเบียนทีมปล่อยว่างไว้ได้ ยังไม่รู้ตัวจริงก็กรอกทีหลัง
function sanitizeRoster(players) {
  const input = Array.isArray(players) ? players : [];
  const roster = Array.from({ length: ROSTER_SIZE }, (_, i) => sanitizePlayer(input[i], i));

  // กัปตันมีได้คนเดียว เอาคนแรกที่ติ๊กมา
  let captainSeen = false;
  roster.forEach((player) => {
    if (player.isCaptain && !captainSeen) {
      captainSeen = true;
    } else {
      player.isCaptain = false;
    }
  });

  return roster;
}

// คืน { team } เมื่อผ่าน หรือ { error } เมื่อไม่ผ่าน
// ชื่อทีมว่างไม่ได้ อย่างอื่นปล่อยว่างได้หมด
function sanitizeTeamInput(input) {
  const source = input && typeof input === 'object' ? input : {};
  const name = sanitizeText(source.name, NAME_MAX);
  if (!name) return { error: 'Team name is required' };

  return {
    team: {
      name,
      tag: sanitizeText(source.tag, TAG_MAX),
      logo: sanitizeLogo(source.logo),
      players: sanitizeRoster(source.players)
    }
  };
}

function sanitizeSeed(value) {
  return clampNumber(value, 0, 9999);
}

module.exports = {
  NAME_MAX,
  TAG_MAX,
  ROSTER_SIZE,
  sanitizeTeamInput,
  sanitizeRoster,
  sanitizePlayer,
  sanitizeSeed
};
