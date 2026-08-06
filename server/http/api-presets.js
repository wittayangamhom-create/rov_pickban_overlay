// API ของพรีเซ็ตแมตช์

const express = require('express');
const { sanitizeText } = require('../lib/sanitize');
const { sanitizeState } = require('../domain/match');
const { CARRIED_OVER_KEYS, carryOverSettings } = require('../domain/settings');
const { getState, setState, emitState } = require('../store/live-state');
const { stopDraftTimer, syncSecondsFromState } = require('../services/draft-engine');
const { readPresets, writePresets, hasPreset, presetListPayload } = require('../store/presets');
const { requireControl } = require('./auth');

const NAME_MAX = 40;

function presetRoutes() {
  const router = express.Router();

  router.get('/api/presets', (req, res) => {
    res.json(presetListPayload(readPresets()));
  });

  router.post('/api/presets', requireControl, (req, res) => {
    const name = sanitizeText(req.body?.name, NAME_MAX);
    if (!name) return res.status(400).json({ error: 'Preset name is required' });
    const presets = readPresets();
    const sourceState = req.body?.state && typeof req.body.state === 'object' ? req.body.state : getState();
    // พรีเซ็ตเก็บเฉพาะข้อมูลแมตช์ ตัดการตั้งค่าเครื่องมือทิ้ง
    // ตอนโหลดก็ไม่ได้เอาไปใช้อยู่แล้ว เก็บไว้มีแต่จะทำให้เข้าใจผิดว่ามันผูกกัน
    const preset = sanitizeState(sourceState);
    CARRIED_OVER_KEYS.forEach((key) => { delete preset[key]; });
    presets[name] = preset;
    writePresets(presets);
    res.json({ ok: true, ...presetListPayload(presets) });
  });

  // ชื่อพรีเซ็ตถูกใช้เป็น key ของ object เท่านั้น ไม่ได้เอาไปต่อเป็น path
  // เช็คด้วย hasOwnProperty กัน key อย่าง __proto__ ที่ไม่ใช่ของจริง
  router.delete('/api/presets/:name', requireControl, (req, res) => {
    const name = sanitizeText(req.params.name, NAME_MAX);
    const presets = readPresets();
    if (!hasPreset(presets, name)) {
      return res.status(404).json({ error: 'Preset not found' });
    }
    delete presets[name];
    writePresets(presets);
    res.json({ ok: true, ...presetListPayload(presets) });
  });

  // พรีเซ็ตเต็มก้อน ไว้ให้หน้าแก้ไขดึงค่าเดิมมาใส่ฟอร์ม
  // ต้องเป็นก้อนเต็มเพราะตอนเซฟกลับต้องรักษา pick/ban ที่ฟอร์มไม่ได้แตะไว้ด้วย
  router.get('/api/presets/:name', (req, res) => {
    const name = sanitizeText(req.params.name, NAME_MAX);
    const presets = readPresets();
    if (!hasPreset(presets, name)) {
      return res.status(404).json({ error: 'Preset not found' });
    }
    res.json({ name, state: presets[name] });
  });

  router.post('/api/presets/load', requireControl, (req, res) => {
    const name = sanitizeText(req.body?.name, NAME_MAX);
    const preset = readPresets()[name];
    if (!preset) return res.status(404).json({ error: 'Preset not found' });
    stopDraftTimer();
    const previous = getState();
    setState(carryOverSettings(sanitizeState(preset), previous));
    syncSecondsFromState();
    emitState();
    res.json({ ok: true, state: getState() });
  });

  return router;
}

module.exports = { presetRoutes };
