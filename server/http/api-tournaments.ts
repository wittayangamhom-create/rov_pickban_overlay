// API ของทัวร์นาเมนต์
//
// ตัวเพดาน 128 ทีมกับกติการูปแบบการแข่งอยู่ในชั้น store/domain แล้ว
// ที่นี่ทำหน้าที่แปลงผลลัพธ์เป็น HTTP status เท่านั้น ไม่ตัดสินกติกาเอง
//
// เลือกใช้ 400 กับข้อผิดพลาดจากกติกา (เช่น ทีมเต็ม) และ 404 เมื่อหาไม่เจอ
// หน้าเว็บเอาข้อความจาก error ไปแสดงตรงๆ ได้เลย

import express, { Router } from 'express';
// เขียน '../store/index' ให้ครบตามกฎเดียวกับ './server/index' ในไฟล์ราก
import { getStores } from '../store/index';
import { FORMATS, BEST_OF_OPTIONS, STATUSES, MAX_TEAMS } from '../domain/tournament';
import { requireControl } from './auth';

const NOT_FOUND = /not found/i;

export function tournamentRoutes(): Router {
  const router = express.Router();

  // ข้อมูลอ้างอิงให้หน้าเว็บสร้างฟอร์มได้โดยไม่ต้องฝังค่าซ้ำ
  // เพิ่มรูปแบบใหม่ใน domain แล้วหน้าเว็บได้ตามเอง ไม่ต้องแก้สองที่
  router.get('/api/tournament-options', (_req, res) => {
    res.json({
      formats: Object.entries(FORMATS).map(([id, spec]) => ({
        id,
        label: spec.label,
        minTeams: spec.minTeams,
        maxTeams: spec.maxTeams
      })),
      bestOf: BEST_OF_OPTIONS,
      statuses: STATUSES,
      maxTeams: MAX_TEAMS
    });
  });

  router.get('/api/tournaments', (_req, res) => {
    res.json({ tournaments: getStores().tournaments.list() });
  });

  router.post('/api/tournaments', requireControl, (req, res) => {
    const result = getStores().tournaments.create(req.body);
    if (result.error !== undefined) {
      res.status(400).json({ error: result.error });
      return;
    }
    res.json({ ok: true, tournament: result.tournament });
  });

  router.get('/api/tournaments/:id', (req, res) => {
    const { tournaments } = getStores();
    const tournament = tournaments.get(req.params.id);
    if (!tournament) {
      res.status(404).json({ error: 'Tournament not found' });
      return;
    }
    res.json({ tournament, teams: tournaments.teams(req.params.id) });
  });

  router.put('/api/tournaments/:id', requireControl, (req, res) => {
    const result = getStores().tournaments.update(req.params.id, req.body);
    if (result.error !== undefined) {
      res.status(NOT_FOUND.test(result.error) ? 404 : 400).json({ error: result.error });
      return;
    }
    res.json({ ok: true, tournament: result.tournament });
  });

  // ปิดทัวร์นาเมนต์ / เปิดกลับมาแก้ต่อ แยกจาก update
  // เพราะหน้ารายการต้องกดสลับได้โดยไม่ต้องส่งฟอร์มทั้งก้อนมา
  router.post('/api/tournaments/:id/status', requireControl, (req, res) => {
    const body = (req.body || {}) as { status?: unknown };
    const result = getStores().tournaments.setStatus(req.params.id, body.status);
    if (result.error !== undefined) {
      res.status(404).json({ error: result.error });
      return;
    }
    res.json({ ok: true, tournament: result.tournament });
  });

  router.delete('/api/tournaments/:id', requireControl, (req, res) => {
    const result = getStores().tournaments.remove(req.params.id);
    if (result.error !== undefined) {
      res.status(404).json({ error: result.error });
      return;
    }
    res.json({ ok: true });
  });

  return router;
}
