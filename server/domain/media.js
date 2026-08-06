// ภาพที่ผู้ใช้อัปโหลด: ตารางช่อง, ที่อยู่ไฟล์, และการตรวจชนิดไฟล์
//
// กฎเหล็กของไฟล์นี้: ชื่อไฟล์ต้องมาจากตารางที่กำหนดไว้ในโค้ดเท่านั้น
// ห้ามเอาข้อความจากผู้ใช้มาต่อเป็น path ไม่ว่ากรณีใด
//
// ตอนทำโลโก้ทีมสำหรับทัวร์นาเมนต์ (128 ทีม) จะใช้ตารางตายตัวไม่ได้แล้ว
// ให้ตั้งชื่อไฟล์จาก id ที่ "ฝั่งเซิร์ฟเวอร์เป็นคนสร้าง" แล้วตรวจด้วย
// isSafeMediaId ก่อนใช้เสมอ ห้ามใช้ชื่อทีมที่ผู้ใช้พิมพ์มาเป็นชื่อไฟล์

const fs = require('fs');
const path = require('path');
const { USER_MEDIA_DIR } = require('../config');

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

// โลโก้ทีม แยกจาก skin เพราะผูกกับทีม ไม่ได้ผูกกับขนาดจอ
// ชื่อไฟล์มาจากตารางนี้เท่านั้น ไม่เอาค่าจากผู้ใช้มาต่อ path
const LOGO_SLOTS = { teamBlue: 'blue-team', teamRed: 'red-team' };

const SKIN_DIR = path.join(USER_MEDIA_DIR, 'skins');
const LOGO_DIR = path.join(USER_MEDIA_DIR, 'team-logos');

const SKIN_MAX_BYTES = 8 * 1024 * 1024;
const LOGO_MAX_BYTES = 4 * 1024 * 1024;
const SKIN_TYPES = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };

// ตรวจสามชั้น: ชื่อ slot ต้องอยู่ในตารางที่กำหนด, content-type ต้องเป็นภาพ
// ที่รองรับ และ magic bytes ต้องตรงกับชนิดที่บอกมาจริงๆ
const SKIN_MAGIC = {
  png: (b) => b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47,
  jpg: (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  webp: (b) => b.length > 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP'
};

// id ที่เอาไปเป็นชื่อไฟล์ได้ ไว้ใช้ตอนโลโก้ต่อทีมในโหมดทัวร์นาเมนต์
// ยอมเฉพาะ a-z 0-9 และ - เท่านั้น ไม่มีจุด ไม่มี slash จึงออกนอกโฟลเดอร์ไม่ได้
function isSafeMediaId(value) {
  return typeof value === 'string' && /^[a-z0-9][a-z0-9-]{0,63}$/.test(value);
}

function skinFilePath(slot, ext) {
  return path.join(SKIN_DIR, `${SKIN_SLOTS[slot]}.${ext}`);
}

function logoFilePath(team, ext) {
  return path.join(LOGO_DIR, `${LOGO_SLOTS[team]}.${ext}`);
}

function removeSkinFiles(slot) {
  Object.values(SKIN_TYPES).forEach((ext) => {
    try { fs.unlinkSync(skinFilePath(slot, ext)); } catch { /* ไม่มีไฟล์ก็ข้ามไป */ }
  });
}

function removeLogoFiles(team) {
  Object.values(SKIN_TYPES).forEach((ext) => {
    try { fs.unlinkSync(logoFilePath(team, ext)); } catch { /* ไม่มีไฟล์ก็ข้ามไป */ }
  });
}

// นามสกุลต้องเป็นค่าที่รู้จักเท่านั้น เพราะถูกเอาไปต่อเป็นชื่อไฟล์
function sanitizeLogo(value) {
  const source = value && typeof value === 'object' ? value : {};
  const v = Number(source.v);
  const ext = Object.values(SKIN_TYPES).includes(source.ext) ? source.ext : '';
  if (!Number.isFinite(v) || v <= 0 || !ext) return { v: 0, ext: '' };
  return { v: Math.trunc(v), ext };
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

module.exports = {
  SKIN_SLOTS,
  LOGO_SLOTS,
  SKIN_DIR,
  LOGO_DIR,
  SKIN_MAX_BYTES,
  LOGO_MAX_BYTES,
  SKIN_TYPES,
  SKIN_MAGIC,
  isSafeMediaId,
  skinFilePath,
  logoFilePath,
  removeSkinFiles,
  removeLogoFiles,
  sanitizeLogo,
  sanitizeSkin
};
