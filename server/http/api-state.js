// API ของ state และข้อมูลอ้างอิงที่หน้าเว็บต้องใช้ตอนเปิด

const express = require('express');
const { heroesData } = require('../domain/heroes');
const { DRAFT_SEQUENCE } = require('../domain/draft');
const { defaultState, sanitizeState } = require('../domain/match');
const { carryOverSettings } = require('../domain/settings');
const { getState, setState, emitState } = require('../store/live-state');
const { stopDraftTimer, syncSecondsFromState } = require('../services/draft-engine');
const { requireControl } = require('./auth');

function stateRoutes() {
  const router = express.Router();

  router.get('/api/heroes', (req, res) => {
    res.json(heroesData);
  });

  router.get('/api/state', (req, res) => {
    res.json(getState());
  });

  router.get('/api/draft-sequence', (req, res) => {
    res.json({ sequence: DRAFT_SEQUENCE });
  });

  router.post('/api/reset-state', requireControl, (req, res) => {
    stopDraftTimer();
    const previous = getState(); // RESET MATCH ล้างแมตช์ ไม่ใช่ล้างการตั้งค่า
    setState(carryOverSettings(sanitizeState(defaultState), previous));
    syncSecondsFromState();
    emitState();
    res.json({ ok: true, state: getState() });
  });

  return router;
}

module.exports = { stateRoutes };
