// ประกอบทุกส่วนเข้าด้วยกันแล้วเปิดเซิร์ฟเวอร์
//
// ลำดับใน createApp สำคัญ: static ของภาพที่ผู้ใช้อัปโหลดต้องมาก่อน
// express.static(PUBLIC_DIR) ไม่งั้นภาพเดิมที่อยู่ใน asar จะบังภาพใหม่

const path = require('path');
const http = require('http');
const express = require('express');
const socketIO = require('socket.io');
const cors = require('cors');

const { PORT, HOST, CONTROL_TOKEN, PUBLIC_DIR, USER_MEDIA_DIR } = require('./config');
const { attachIo } = require('./store/live-state');
const { pageRoutes } = require('./http/pages');
const { stateRoutes } = require('./http/api-state');
const { presetRoutes } = require('./http/api-presets');
const { mediaRoutes } = require('./http/api-media');
const { registerHandlers } = require('./sockets/handlers');

function isAllowedOrigin(origin, callback) {
  if (!origin) return callback(null, true);

  try {
    const url = new URL(origin);
    const host = url.hostname;
    const allowed =
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '::1';

    return callback(allowed ? null : new Error('Origin not allowed'), allowed);
  } catch {
    return callback(new Error('Invalid origin'), false);
  }
}

function createApp() {
  const app = express();

  app.use(cors({ origin: isAllowedOrigin }));
  app.use(express.json({ limit: '64kb' }));

  // ภาพที่ผู้ใช้อัปโหลดต้องมาก่อน static ของ public
  // URL ยังเป็น /images/team-logos/... กับ /images/skins/... เหมือนเดิม
  // หน้าเว็บจึงไม่ต้องรู้ว่าไฟล์จริงย้ายออกไปนอก asar แล้ว
  app.use('/images/team-logos', express.static(path.join(USER_MEDIA_DIR, 'team-logos')));
  app.use('/images/skins', express.static(path.join(USER_MEDIA_DIR, 'skins')));

  app.use(express.static(PUBLIC_DIR));

  app.use(pageRoutes());
  app.use(stateRoutes());
  app.use(presetRoutes());
  app.use(mediaRoutes());

  return app;
}

function createServer() {
  const app = createApp();
  const server = http.createServer(app);

  const io = socketIO(server, {
    cors: {
      origin: isAllowedOrigin,
      methods: ['GET', 'POST']
    }
  });

  attachIo(io);
  io.on('connection', registerHandlers);

  return { app, server, io };
}

function start({ port = PORT, host = HOST } = {}) {
  const { server, io } = createServer();

  server.listen(port, host, () => {
    console.log('===========================================');
    console.log('ROV Overlay Tool Server Running');
    console.log('===========================================');
    console.log(`Home: http://${host}:${port}`);
    console.log(`Control Panel: http://${host}:${port}/control`);
    console.log(`Presets: http://${host}:${port}/presets`);
    console.log(`Overlay 1920x1080: http://${host}:${port}/overlay`);
    console.log(`Overlay 2560x1440: http://${host}:${port}/overlay-1440`);
    console.log(`Result: http://${host}:${port}/result`);
    console.log('===========================================');
    if (CONTROL_TOKEN) {
      console.log('Control token protection is enabled.');
    }
  });

  return { server, io };
}

module.exports = { createApp, createServer, start, isAllowedOrigin };
