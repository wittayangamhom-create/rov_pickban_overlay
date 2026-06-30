const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = socketIO(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Game State
let gameState = {
  teamBlue: {
    name: 'FW',
    score: 0,
    logo: 'blue-team.png',
    picks: [null, null, null, null, null],
    bans: [null, null, null, null],
    players: ['NAILIU', 'ZHAN', 'ZHENZHE', 'VUXIANG(C)', 'WETZ']
  },
  teamRed: {
    name: 'EA',
    score: 2,
    logo: 'red-team.png',
    picks: [null, null, null, null, null],
    bans: [null, null, null, null],
    players: ['PICHU(C)', 'NEGAN', 'QQ', 'NBANK', 'SRY']
  },
  currentPhase: 'BAN', // BAN or PICK
  timer: '00:17',
  draftPhaseIndex: -1,  // -1 = ยังไม่เริ่ม
  draftLabel: '',       // label ของ phase ปัจจุบัน เช่น "Blue Ban 1"
  draftActiveSlots: [], // slots ที่ active ใน phase นี้
  draftRunning: false,
  matchInfo: {
    title: 'FW VS EA : GAME 3 [BO7]',
    tournament: 'ROV Premier League'
  }
};

// Load heroes data
const heroesData = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'heroes.json'), 'utf8'));

// Draft Phase Sequence
// activeSlots: array of slot IDs ที่ต้อง fill ก่อนข้ามไปเฟสถัดไป
const DRAFT_SEQUENCE = [
  { label: 'Blue Ban 1',    seconds: 40, slots: ['blueBan0'] },
  { label: 'Red Ban 1',     seconds: 40, slots: ['redBan0'] },
  { label: 'Blue Ban 2',    seconds: 40, slots: ['blueBan1'] },
  { label: 'Red Ban 2',     seconds: 40, slots: ['redBan1'] },
  { label: 'Blue Pick 1',   seconds: 60, slots: ['bluePick0'] },
  { label: 'Red Pick 1+2',  seconds: 60, slots: ['redPick0', 'redPick1'] },
  { label: 'Blue Pick 2+3', seconds: 60, slots: ['bluePick1', 'bluePick2'] },
  { label: 'Red Pick 3',    seconds: 60, slots: ['redPick2'] },
  { label: 'Red Ban 3',     seconds: 40, slots: ['redBan2'] },
  { label: 'Blue Ban 3',    seconds: 40, slots: ['blueBan2'] },
  { label: 'Red Ban 4',     seconds: 40, slots: ['redBan3'] },
  { label: 'Blue Ban 4',    seconds: 40, slots: ['blueBan3'] },
  { label: 'Red Pick 4',    seconds: 60, slots: ['redPick3'] },
  { label: 'Blue Pick 4+5', seconds: 60, slots: ['bluePick3', 'bluePick4'] },
  { label: 'Red Pick 5',    seconds: 60, slots: ['redPick4'] },
  { label: 'Waiting',       seconds: 60, slots: [] },
];

let draftInterval = null;
let draftSeconds = 0;

function stopDraftTimer() {
  if (draftInterval) {
    clearInterval(draftInterval);
    draftInterval = null;
  }
  gameState.draftRunning = false;
}

function startDraftPhase(index) {
  stopDraftTimer();
  if (index >= DRAFT_SEQUENCE.length) {
    // หมด sequence ทั้งหมด -> coming soon
    gameState.draftPhaseIndex = index;
    gameState.draftLabel = 'coming soon';
    gameState.draftActiveSlots = [];
    gameState.timer = '';
    gameState.draftRunning = false;
    io.emit('stateUpdate', gameState);
    return;
  }
  const phase = DRAFT_SEQUENCE[index];
  gameState.draftPhaseIndex = index;
  gameState.draftLabel = phase.label;
  gameState.draftActiveSlots = phase.slots || [];
  draftSeconds = phase.seconds;

  const pad = (n) => String(n).padStart(2, '0');
  gameState.timer = `${pad(Math.floor(draftSeconds/60))}:${pad(draftSeconds%60)}`;
  gameState.draftRunning = true;
  io.emit('stateUpdate', gameState);

  draftInterval = setInterval(() => {
    draftSeconds--;
    gameState.timer = `${pad(Math.floor(draftSeconds/60))}:${pad(draftSeconds%60)}`;
    io.emit('stateUpdate', gameState);
    if (draftSeconds <= 0) {
      // ไปเฟสถัดไปอัตโนมัติ
      startDraftPhase(gameState.draftPhaseIndex + 1);
    }
  }, 1000);
}

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'control.html'));
});

app.get('/overlay', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'overlay.html'));
});

app.get('/result', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'result.html'));
});

app.get('/api/heroes', (req, res) => {
  res.json(heroesData);
});

app.get('/api/state', (req, res) => {
  res.json(gameState);
});

// Socket.IO Events
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  
  // Send current state to newly connected client
  socket.emit('stateUpdate', gameState);
  
  // Update team name
  socket.on('updateTeamName', (data) => {
    const { team, name } = data;
    if (gameState[team]) {
      gameState[team].name = name;
      io.emit('stateUpdate', gameState);
    }
  });
  
  // Update score
  socket.on('updateScore', (data) => {
    const { team, score } = data;
    if (gameState[team]) {
      gameState[team].score = score;
      io.emit('stateUpdate', gameState);
    }
  });
  
  // Update team logo
  socket.on('updateTeamLogo', (data) => {
    const { team, logo } = data;
    if (gameState[team]) {
      gameState[team].logo = logo;
      io.emit('stateUpdate', gameState);
    }
  });
  
  // Update player name
  socket.on('updatePlayerName', (data) => {
    const { team, index, name } = data;
    if (gameState[team] && gameState[team].players[index] !== undefined) {
      gameState[team].players[index] = name;
      io.emit('stateUpdate', gameState);
    }
  });
  
  // Helper: check if all active slots are filled -> advance phase
  function checkAndAdvancePhase() {
    const slots = gameState.draftActiveSlots;
    if (!slots || slots.length === 0) return;
    const allFilled = slots.every(slotId => {
      const m = slotId.match(/^(blue|red)(Pick|Ban)(\d)$/);
      if (!m) return false;
      const team = m[1] === 'blue' ? 'teamBlue' : 'teamRed';
      const type = m[2] === 'Pick' ? 'picks' : 'bans';
      const idx = parseInt(m[3]);
      return gameState[team][type][idx];
    });
    if (allFilled) {
      startDraftPhase(gameState.draftPhaseIndex + 1);
    }
  }

  // Update pick
  socket.on('updatePick', (data) => {
    const { team, index, hero } = data;
    if (gameState[team] && gameState[team].picks[index] !== undefined) {
      gameState[team].picks[index] = hero;
      io.emit('stateUpdate', gameState);
      checkAndAdvancePhase();
    }
  });
  
  // Update ban
  socket.on('updateBan', (data) => {
    const { team, index, hero } = data;
    if (gameState[team] && gameState[team].bans[index] !== undefined) {
      gameState[team].bans[index] = hero;
      io.emit('stateUpdate', gameState);
      checkAndAdvancePhase();
    }
  });
  
  // Clear pick
  socket.on('clearPick', (data) => {
    const { team, index } = data;
    if (gameState[team] && gameState[team].picks[index] !== undefined) {
      gameState[team].picks[index] = null;
      io.emit('stateUpdate', gameState);
    }
  });
  
  // Clear ban
  socket.on('clearBan', (data) => {
    const { team, index } = data;
    if (gameState[team] && gameState[team].bans[index] !== undefined) {
      gameState[team].bans[index] = null;
      io.emit('stateUpdate', gameState);
    }
  });
  
  // Clear all picks and bans
  socket.on('clearAll', () => {
    gameState.teamBlue.picks = [null, null, null, null, null];
    gameState.teamBlue.bans = [null, null, null, null];
    gameState.teamRed.picks = [null, null, null, null, null];
    gameState.teamRed.bans = [null, null, null, null];
    io.emit('stateUpdate', gameState);
  });
  
  // Update phase
  socket.on('updatePhase', (phase) => {
    gameState.currentPhase = phase;
    io.emit('stateUpdate', gameState);
  });
  
  // Update timer
  socket.on('updateTimer', (timer) => {
    gameState.timer = timer;
    io.emit('stateUpdate', gameState);
  });
  
  // Update match info
  socket.on('updateMatchInfo', (data) => {
    gameState.matchInfo = { ...gameState.matchInfo, ...data };
    io.emit('stateUpdate', gameState);
  });
  
  // Switch teams
  socket.on('switchTeams', () => {
    const tempTeam = JSON.parse(JSON.stringify(gameState.teamBlue));
    gameState.teamBlue = JSON.parse(JSON.stringify(gameState.teamRed));
    gameState.teamRed = tempTeam;
    io.emit('stateUpdate', gameState);
  });
  
  // Draft Timer Controls
  socket.on('draftStart', () => {
    startDraftPhase(0);
  });
  socket.on('draftNext', () => {
    const next = gameState.draftPhaseIndex + 1;
    startDraftPhase(next);
  });
  socket.on('draftPrev', () => {
    const prev = Math.max(0, gameState.draftPhaseIndex - 1);
    startDraftPhase(prev);
  });
  socket.on('draftPause', () => {
    stopDraftTimer();
    io.emit('stateUpdate', gameState);
  });
  socket.on('draftResume', () => {
    if (!gameState.draftRunning && gameState.draftPhaseIndex >= 0) {
      const pad = (n) => String(n).padStart(2, '0');
      const secs = draftSeconds > 0 ? draftSeconds : DRAFT_SEQUENCE[gameState.draftPhaseIndex]?.seconds || 60;
      draftSeconds = secs;
      gameState.draftRunning = true;
      io.emit('stateUpdate', gameState);
      draftInterval = setInterval(() => {
        draftSeconds--;
        gameState.timer = `${pad(Math.floor(draftSeconds/60))}:${pad(draftSeconds%60)}`;
        io.emit('stateUpdate', gameState);
        if (draftSeconds <= 0) {
          startDraftPhase(gameState.draftPhaseIndex + 1);
        }
      }, 1000);
    }
  });
  socket.on('draftReset', () => {
    stopDraftTimer();
    gameState.draftPhaseIndex = -1;
    gameState.draftLabel = '';
    gameState.draftActiveSlots = [];
    gameState.draftRunning = false;
    gameState.timer = '00:00';
    io.emit('stateUpdate', gameState);
  });

  // Swap two picks (and their associated player names if needed)
  socket.on('swapPicks', (data) => {
    const { team, index1, index2 } = data;
    if (gameState[team]) {
      const picks = gameState[team].picks;
      const tmp = picks[index1];
      picks[index1] = picks[index2];
      picks[index2] = tmp;
      io.emit('stateUpdate', gameState);
    }
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

server.listen(PORT, () => {
  console.log(`===========================================`);
  console.log(`ROV Overlay Tool Server Running`);
  console.log(`===========================================`);
  console.log(`Control Panel: http://localhost:${PORT}`);
  console.log(`Overlay: http://localhost:${PORT}/overlay`);
  console.log(`===========================================`);
});
