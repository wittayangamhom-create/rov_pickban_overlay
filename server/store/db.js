// การเชื่อมต่อฐานข้อมูล SQLite
//
// ใช้ node:sqlite ที่ติดมากับ Node เลย ไม่ใช่ better-sqlite3
// เหตุผล: better-sqlite3 เป็น native module ต้อง rebuild ตอนแพ็กเป็น exe
// ซึ่งเป็นจุดที่พังบ่อยเวลาเปลี่ยนเวอร์ชัน Electron
// ตรวจแล้วว่า node:sqlite ใช้ได้ทั้งใน Node และใน Electron 43 (node 24.17)
//
// DatabaseSync เป็น API แบบ synchronous ตรงกับสไตล์เดิมของโปรเจกต์
// ที่ใช้ fs.readFileSync / writeFileSync อยู่แล้ว ไม่ต้องแปลงเป็น async ทั้งสาย
//
// openDatabase รับ path ได้ เพื่อให้เทสต์เปิดฐานใน ':memory:' ได้
// ห้ามให้เทสต์ไปแตะไฟล์จริงของผู้ใช้

const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const { TOURNAMENT_DB_PATH } = require('../config');
const { MIGRATIONS } = require('./migrations');

function migrate(db) {
  const current = db.prepare('PRAGMA user_version').get().user_version;

  for (let version = current; version < MIGRATIONS.length; version += 1) {
    db.exec('BEGIN');
    try {
      db.exec(MIGRATIONS[version]);
      // user_version รับพารามิเตอร์ผูกค่าไม่ได้ ต้องต่อสตริง
      // ตัวเลขมาจาก index ของอาเรย์ในโค้ด ไม่ได้มาจากผู้ใช้ จึงปลอดภัย
      db.exec(`PRAGMA user_version = ${version + 1}`);
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw new Error(`Migration ${version + 1} failed: ${error.message}`);
    }
  }
}

function openDatabase(dbPath = TOURNAMENT_DB_PATH) {
  if (dbPath !== ':memory:') {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  }

  const db = new DatabaseSync(dbPath);

  // ON DELETE CASCADE ใน migrations จะไม่ทำงานถ้าไม่เปิดตัวนี้
  // SQLite ปิดไว้เป็นค่าเริ่มต้นเพื่อความเข้ากันได้กับของเก่า
  db.exec('PRAGMA foreign_keys = ON');
  // WAL ทนไฟดับกว่า และอ่านพร้อมเขียนได้ เหมาะกับตอนถ่ายทอดสด
  if (dbPath !== ':memory:') db.exec('PRAGMA journal_mode = WAL');

  migrate(db);
  return db;
}

// ตัวที่แอพใช้จริง เปิดครั้งเดียวตอนเรียกใช้ครั้งแรก
let appDb = null;

function getDatabase() {
  if (!appDb) appDb = openDatabase();
  return appDb;
}

function closeDatabase() {
  if (appDb) {
    appDb.close();
    appDb = null;
  }
}

module.exports = { openDatabase, getDatabase, closeDatabase, migrate };
