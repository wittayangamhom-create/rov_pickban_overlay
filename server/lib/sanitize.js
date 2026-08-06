// ตัวกรองค่าพื้นฐาน ใช้ซ้ำทุกที่ที่รับค่าจากผู้ใช้
//
// หลักการ: ทุกค่าที่เข้ามาจาก socket / HTTP body ต้องผ่านตัวใดตัวหนึ่งในนี้ก่อน
// ไม่มีการเชื่อค่าที่ส่งมาแล้วเอาไปใช้ตรงๆ

function clampNumber(value, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, Math.trunc(n)));
}

// อักขระควบคุม C0 (0x00-0x1f) กับ DEL (0x7f)
//
// เขียนเป็นการเทียบรหัสตัวอักษรแทน regex ตั้งใจ ไม่ใช่ความชอบส่วนตัว
// regex ตัวเดิมต้องใส่ escape ของช่วงอักขระควบคุม ซึ่งพอไฟล์ถูกแก้ผ่าน
// เครื่องมือที่ตีความ escape ผิด จะกลายเป็นอักขระควบคุมจริงฝังในซอร์ส
// (รวมถึงไบต์ 0x00) แล้ว editor/diff/git พังตามกันหมด
// วิธีนี้ไม่มี escape ให้พังตั้งแต่แรก
function isControlCharCode(code) {
  return code < 0x20 || code === 0x7f;
}

function stripControlChars(value) {
  let out = '';
  for (let i = 0; i < value.length; i += 1) {
    if (!isControlCharCode(value.charCodeAt(i))) out += value[i];
  }
  return out;
}

// ค่านี้ถูกเอาไปแสดงบนหน้าออกอากาศ ตัดอักขระควบคุมทิ้งก่อนเสมอ
function sanitizeText(value, maxLength) {
  if (typeof value !== 'string') return '';
  return stripControlChars(value).trim().slice(0, maxLength);
}

function normalizeArray(values, length, sanitizer) {
  const input = Array.isArray(values) ? values : [];
  return Array.from({ length }, (_, index) => sanitizer(input[index], index));
}

module.exports = { clampNumber, sanitizeText, normalizeArray, stripControlChars };
