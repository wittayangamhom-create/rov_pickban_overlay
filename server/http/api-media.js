// API อัปโหลดภาพ: ภาพพื้นหลังที่ออกแบบเอง (skin) และโลโก้ทีม
//
// รับ body เป็นไฟล์ดิบ ไม่ใช้ multipart จะได้ไม่ต้องเพิ่ม dependency
// ตรวจสามชั้น: ชื่อ slot ต้องอยู่ในตารางที่กำหนด, content-type ต้องเป็นภาพ
// ที่รองรับ และ magic bytes ต้องตรงกับชนิดที่บอกมาจริงๆ

const fs = require('fs');
const express = require('express');
const {
  SKIN_SLOTS,
  LOGO_SLOTS,
  SKIN_DIR,
  LOGO_DIR,
  SKIN_MAX_BYTES,
  LOGO_MAX_BYTES,
  SKIN_TYPES,
  SKIN_MAGIC,
  skinFilePath,
  logoFilePath,
  removeSkinFiles,
  removeLogoFiles
} = require('../domain/media');
const { getState, emitState } = require('../store/live-state');
const { requireControl } = require('./auth');

// คืน { ext } เมื่อผ่าน หรือ { status, error } เมื่อไม่ผ่าน
// ใช้ร่วมกันทั้ง skin และโลโก้ เพราะกฎการตรวจไฟล์เหมือนกันเป๊ะ
function validateUpload(req) {
  const ext = SKIN_TYPES[String(req.get('content-type')).split(';')[0].trim()];
  if (!ext) return { status: 415, error: 'Use a PNG, JPG or WEBP image' };

  const body = req.body;
  if (!Buffer.isBuffer(body) || body.length === 0) {
    return { status: 400, error: 'Empty upload' };
  }
  if (!SKIN_MAGIC[ext](body)) {
    return { status: 400, error: 'File contents do not match its type' };
  }
  return { ext, body };
}

function mediaRoutes() {
  const router = express.Router();
  const rawImage = (limit) => express.raw({ type: Object.keys(SKIN_TYPES), limit });

  router.post('/api/skin/:slot', requireControl, rawImage(SKIN_MAX_BYTES), (req, res) => {
    const slot = req.params.slot;
    if (!Object.prototype.hasOwnProperty.call(SKIN_SLOTS, slot)) {
      return res.status(400).json({ error: 'Unknown skin slot' });
    }

    const checked = validateUpload(req);
    if (checked.error) return res.status(checked.status).json({ error: checked.error });

    try {
      fs.mkdirSync(SKIN_DIR, { recursive: true });
      removeSkinFiles(slot); // กันกรณีเปลี่ยนนามสกุล จะได้ไม่เหลือไฟล์เก่าค้าง
      fs.writeFileSync(skinFilePath(slot, checked.ext), checked.body);
    } catch (error) {
      return res.status(500).json({ error: `Could not save image: ${error.message}` });
    }

    const state = getState();
    state.skin.slots[slot] = Date.now();
    state.skin.enabled = true;
    emitState();
    res.json({ ok: true, slot, ext: checked.ext, bytes: checked.body.length, skin: state.skin });
  });

  router.delete('/api/skin/:slot', requireControl, (req, res) => {
    const slot = req.params.slot;
    if (!Object.prototype.hasOwnProperty.call(SKIN_SLOTS, slot)) {
      return res.status(400).json({ error: 'Unknown skin slot' });
    }
    removeSkinFiles(slot);
    const state = getState();
    state.skin.slots[slot] = 0;
    emitState();
    res.json({ ok: true, skin: state.skin });
  });

  // ตรวจแบบเดียวกับ skin: ชื่อทีมต้องอยู่ในตาราง, content-type ต้องรองรับ
  // และ magic bytes ต้องตรงกับชนิดที่บอกมาจริงๆ
  router.post('/api/team-logo/:team', requireControl, rawImage(LOGO_MAX_BYTES), (req, res) => {
    const team = req.params.team;
    if (!Object.prototype.hasOwnProperty.call(LOGO_SLOTS, team)) {
      return res.status(400).json({ error: 'Unknown team' });
    }

    const checked = validateUpload(req);
    if (checked.error) return res.status(checked.status).json({ error: checked.error });

    try {
      fs.mkdirSync(LOGO_DIR, { recursive: true });
      removeLogoFiles(team); // กันไฟล์นามสกุลเดิมค้างอยู่ตอนเปลี่ยนชนิดภาพ
      fs.writeFileSync(logoFilePath(team, checked.ext), checked.body);
    } catch (error) {
      return res.status(500).json({ error: `Could not save logo: ${error.message}` });
    }

    const state = getState();
    state[team].logo = { v: Date.now(), ext: checked.ext };
    emitState();
    res.json({ ok: true, team, ext: checked.ext, bytes: checked.body.length, logo: state[team].logo });
  });

  router.delete('/api/team-logo/:team', requireControl, (req, res) => {
    const team = req.params.team;
    if (!Object.prototype.hasOwnProperty.call(LOGO_SLOTS, team)) {
      return res.status(400).json({ error: 'Unknown team' });
    }
    removeLogoFiles(team);
    const state = getState();
    state[team].logo = { v: 0, ext: '' };
    emitState();
    res.json({ ok: true, team, logo: state[team].logo });
  });

  return router;
}

module.exports = { mediaRoutes };
