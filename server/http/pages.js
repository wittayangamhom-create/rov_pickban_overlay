// เส้นทางของหน้าเว็บ (ไม่ใช่ API)
//
// เพิ่มหน้าใหม่ที่นี่ที่เดียว เช่น หน้าทัวร์นาเมนต์ / รายชื่อทีม / สถิติ
// แล้วเพิ่มไฟล์ html ใน public/

const path = require('path');
const express = require('express');
const { PUBLIC_DIR } = require('../config');

// route -> ไฟล์ใน public/
const PAGES = {
  // / เป็นหน้าแรกแล้ว ไม่ใช่ control panel
  // control ย้ายไป /control ส่วน /index.html ทิ้ง redirect ไว้ให้ของเก่าที่ bookmark ไว้
  '/': 'home.html',
  '/control': 'control.html',
  '/overlay': 'overlay.html',
  '/overlay-1440': 'overlay-1440.html',
  '/result': 'result.html',
  // หน้าตั้งค่าภาพพื้นหลัง แยกจาก Control Panel เพราะเป็นงานก่อนแข่ง
  '/design': 'design.html',
  '/hotkeys': 'hotkeys.html',
  '/presets': 'presets.html'
};

function pageRoutes() {
  const router = express.Router();

  Object.entries(PAGES).forEach(([route, file]) => {
    router.get(route, (req, res) => res.sendFile(path.join(PUBLIC_DIR, file)));
  });

  router.get('/index.html', (req, res) => res.redirect('/control'));

  return router;
}

module.exports = { PAGES, pageRoutes };
