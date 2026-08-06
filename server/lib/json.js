// อ่าน/เขียนไฟล์ JSON แบบไม่โยน exception ออกไปข้างนอก
//
// loadJson คืนค่า fallback เสมอเมื่ออ่านไม่ได้ ผู้เรียกจึงไม่ต้อง try/catch
// quiet = true สำหรับไฟล์ที่ "ยังไม่มี" เป็นเรื่องปกติ (state/presets ครั้งแรก)
// จะได้ไม่รกคอนโซลตอนเปิดแอพครั้งแรก

const fs = require('fs');
const path = require('path');

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function loadJson(filePath, fallback, { quiet = false } = {}) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    if (!quiet) {
      console.warn(`Could not load ${filePath}: ${error.message}`);
    }
    return deepClone(fallback);
  }
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

module.exports = { deepClone, loadJson, writeJson };
