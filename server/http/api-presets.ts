// API ของพรีเซ็ตแมตช์

import express, { Router } from 'express';
import { sanitizeText } from '../lib/sanitize';
import { sanitizeState } from '../domain/match';
import { CARRIED_OVER_KEYS, carryOverSettings } from '../domain/settings';
import { getState, setState, emitState } from '../store/live-state';
import { stopDraftTimer, syncSecondsFromState } from '../services/draft-engine';
import { readPresets, writePresets, hasPreset, presetListPayload } from '../store/presets';
import { requireControl } from './auth';

const NAME_MAX = 40;

export function presetRoutes(): Router {
  const router = express.Router();

  router.get('/api/presets', (_req, res) => {
    res.json(presetListPayload(readPresets()));
  });

  router.post('/api/presets', requireControl, (req, res) => {
    const body = (req.body || {}) as { name?: unknown; state?: unknown };
    const name = sanitizeText(body.name, NAME_MAX);
    if (!name) {
      res.status(400).json({ error: 'Preset name is required' });
      return;
    }
    const presets = readPresets();
    const sourceState = body.state && typeof body.state === 'object' ? body.state : getState();
    // พรีเซ็ตเก็บเฉพาะข้อมูลแมตช์ ตัดการตั้งค่าเครื่องมือทิ้ง
    // ตอนโหลดก็ไม่ได้เอาไปใช้อยู่แล้ว เก็บไว้มีแต่จะทำให้เข้าใจผิดว่ามันผูกกัน
    const preset = sanitizeState(sourceState) as unknown as Record<string, unknown>;
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
      res.status(404).json({ error: 'Preset not found' });
      return;
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
      res.status(404).json({ error: 'Preset not found' });
      return;
    }
    res.json({ name, state: presets[name] });
  });

  router.post('/api/presets/load', requireControl, (req, res) => {
    const body = (req.body || {}) as { name?: unknown };
    const name = sanitizeText(body.name, NAME_MAX);
    const preset = readPresets()[name];
    if (!preset) {
      res.status(404).json({ error: 'Preset not found' });
      return;
    }
    stopDraftTimer();
    const previous = getState();
    setState(carryOverSettings(sanitizeState(preset), previous));
    syncSecondsFromState();
    emitState();
    res.json({ ok: true, state: getState() });
  });

  return router;
}
