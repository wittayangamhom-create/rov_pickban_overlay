// จุดเริ่มของเซิร์ฟเวอร์
//
// ตัวโค้ดจริงถูกแยกเป็นโมดูลใน server/ แล้ว ไฟล์นี้เหลือแค่ปุ่มสตาร์ท
// ห้ามย้ายไฟล์นี้และห้ามเปลี่ยนพฤติกรรม "require แล้วเซิร์ฟเวอร์ทำงานทันที"
// เพราะ electron-main.js เรียกด้วย require(path.join(__dirname, 'server.js'))
// หลังตั้ง ROV_USER_DATA_DIR / ROV_USER_MEDIA_DIR เสร็จ
//
// อยากได้ app หรือ server ไปเขียนเทสต์ ให้ require('./server/index') แทน
// ตัวนั้นแยก createApp / createServer / start ออกจากกันไว้แล้ว

// ต้องเขียน './server/index' ให้ครบ ห้ามย่อเป็น './server'
// เพราะ node หาไฟล์ก่อนโฟลเดอร์ './server' จะวนกลับมาเจอ server.js ตัวเอง
const { start } = require('./server/index');

module.exports = start();
