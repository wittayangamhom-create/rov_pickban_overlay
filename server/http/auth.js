// การกันสิทธิ์สั่งงาน
//
// ไม่ได้ตั้ง CONTROL_TOKEN = เปิดให้ทุกคนในเครื่องสั่งได้ (โหมดใช้งานคนเดียว)
// ตั้งแล้ว = ต้องมีโทเคนถึงจะสั่งได้ ส่วนหน้าดูอย่าง overlay ยังเปิดได้เสมอ

const { CONTROL_TOKEN } = require('../config');

function isAuthorizedSocket(socket) {
  if (!CONTROL_TOKEN) return true;
  return socket.handshake.auth?.token === CONTROL_TOKEN || socket.handshake.query?.token === CONTROL_TOKEN;
}

function isAuthorizedRequest(req) {
  if (!CONTROL_TOKEN) return true;
  const auth = req.get('authorization') || '';
  const bearer = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  return req.query.token === CONTROL_TOKEN || bearer === CONTROL_TOKEN;
}

function requireControl(req, res, next) {
  if (isAuthorizedRequest(req)) return next();
  return res.status(401).json({ error: 'Unauthorized control request' });
}

module.exports = { isAuthorizedSocket, isAuthorizedRequest, requireControl };
