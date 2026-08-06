// id ที่ฝั่งเซิร์ฟเวอร์เป็นคนสร้าง
//
// ต้องผ่าน isSafeMediaId เสมอ เพราะ id ของทีมถูกเอาไปเป็นชื่อไฟล์โลโก้
// ขึ้นต้นด้วยตัวอักษร ตามด้วยเลขฐานสิบหก จึงไม่มีจุด ไม่มี slash
// ออกนอกโฟลเดอร์ไม่ได้ และไม่ชนกับชื่อไฟล์ระบบ
//
// ห้ามสร้าง id จากชื่อที่ผู้ใช้พิมพ์ ไม่ว่าจะ slugify ดีแค่ไหนก็ตาม

const crypto = require('crypto');
const { isSafeMediaId } = require('./media');

const PREFIX = { team: 't', tournament: 'g', match: 'm', game: 'x' };

function newId(kind) {
  const prefix = PREFIX[kind];
  if (!prefix) throw new Error(`Unknown id kind: ${kind}`);
  const id = `${prefix}${crypto.randomBytes(6).toString('hex')}`;
  // กันพลาดไว้ชั้นหนึ่ง ถ้าวันหลังมีคนแก้รูปแบบแล้วลืมเช็ค
  if (!isSafeMediaId(id)) throw new Error(`Generated unsafe id: ${id}`);
  return id;
}

module.exports = { newId, PREFIX };
