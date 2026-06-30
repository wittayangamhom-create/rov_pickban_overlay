const socket = io();
let heroes = [];

// ── Connect ──
socket.on('connect', () => { showToast('Connected ✓', 'green'); });
socket.on('disconnect', () => { showToast('Disconnected', 'red'); });

// ── Load heroes ──
fetch('/api/heroes')
  .then(r => r.json())
  .then(data => { heroes = data.heroes; buildAllUI(); })
  .catch(() => { heroes = []; buildAllUI(); });

// ── Load state ──
fetch('/api/state')
  .then(r => r.json())
  .then(state => loadState(state))
  .catch(() => {});

// ── State updates ──
socket.on('stateUpdate', (state) => {
  loadState(state);
  updateDraftUI(state);
});

// ══════════════════════════════════════
// BUILD UI
// ══════════════════════════════════════
function buildAllUI() {
  ['blue','red'].forEach(t => {
    buildPPTable(t);
    buildBans(t);
  });
  buildDraftBadges();
}

function buildPPTable(color) {
  const team = color === 'blue' ? 'teamBlue' : 'teamRed';
  const tbody = document.getElementById(color + '_pp');
  if (!tbody) return;
  tbody.innerHTML = '';
  for (let i = 0; i < 5; i++) {
    const tr = document.createElement('tr');
    tr.className = 'pp-row'; tr.id = `${color}_row${i}`;
    tr.innerHTML = `
      <td><span style="color:var(--muted2);font-size:12px;font-weight:700">${i+1}</span></td>
      <td><input class="player-input" id="${color}Player${i}" placeholder="Player ${i+1}"
          onchange="emitPlayerName('${team}',${i},this.value)"></td>
      <td><button class="btn-sw" id="${color}_psw${i}" onclick="swapPlayer('${color}',${i},this)">SW</button></td>
      <td class="hero-select-wrap" id="${color}_pick_wrap${i}">
        <select id="${color}Pick${i}"><option value="">— Hero —</option></select>
      </td>
      <td><button class="btn-sw" id="${color}_hsw${i}" onclick="swapHero('${color}',${i},this)">SW</button></td>`;
    tbody.appendChild(tr);
    initHeroSelect(`${color}Pick${i}`, team, 'pick', i);
  }
}

function buildBans(color) {
  const team = color === 'blue' ? 'teamBlue' : 'teamRed';
  const el = document.getElementById(color + '_bans');
  if (!el) return;
  el.innerHTML = '';
  for (let i = 0; i < 4; i++) {
    const wrap = document.createElement('div');
    wrap.className = 'ban-slot-wrap';
    wrap.innerHTML = `
      <span class="ban-slot-label">Ban ${i+1}</span>
      <div class="ban-select-wrap" id="${color}_ban_wrap${i}">
        <select id="${color}Ban${i}"><option value="">— Ban —</option></select>
      </div>
      <button class="ban-clear" onclick="clearBanSlot('${team}',${i})">✕ clear</button>`;
    el.appendChild(wrap);
    initHeroSelect(`${color}Ban${i}`, team, 'ban', i);
  }
}

function initHeroSelect(selectId, team, type, index) {
  const select = document.getElementById(selectId);
  if (!select) return;
  select.innerHTML = '<option value="">— ' + (type==='pick'?'Hero':'Ban') + ' —</option>';
  heroes.forEach(h => {
    const o = document.createElement('option');
    o.value = h; o.textContent = h;
    select.appendChild(o);
  });
  $(select).select2({
    placeholder: 'ค้นหาฮีโร่...',
    allowClear: true,
    width: '100%',
    dropdownAutoWidth: true,
    matcher: (params, data) => {
      if (!params.term || params.term.trim() === '') return data;
      return data.text.toLowerCase().includes(params.term.toLowerCase()) ? data : null;
    }
  }).on('change', function() {
    const hero = this.value;
    if (type === 'pick') {
      socket.emit('updatePick', { team, index, hero: hero || null });
      if (hero) checkPhaseComplete();
    } else {
      socket.emit('updateBan', { team, index, hero: hero || null });
      if (hero) checkPhaseComplete();
    }
  });
}

// ══════════════════════════════════════
// LOAD STATE INTO UI
// ══════════════════════════════════════
function loadState(state) {
  // Match info
  if (state.matchInfo) {
    const t = document.getElementById('tournamentName');
    const m = document.getElementById('matchTitle');
    if (t) t.value = state.matchInfo.tournament || '';
    if (m) m.value = state.matchInfo.title || '';
  }

  // Blue team
  setVal('blueTeamName', state.teamBlue.name);
  setVal('blueScore', state.teamBlue.score);
  setVal('blueTeamLogo', state.teamBlue.logo || '');
  state.teamBlue.players.forEach((p, i) => setVal(`bluePlayer${i}`, p));
  state.teamBlue.picks.forEach((h, i) => setSelect(`bluePick${i}`, h));
  state.teamBlue.bans.forEach((h, i)  => setSelect(`blueBan${i}`, h));

  // Red team
  setVal('redTeamName', state.teamRed.name);
  setVal('redScore', state.teamRed.score);
  setVal('redTeamLogo', state.teamRed.logo || '');
  state.teamRed.players.forEach((p, i) => setVal(`redPlayer${i}`, p));
  state.teamRed.picks.forEach((h, i) => setSelect(`redPick${i}`, h));
  state.teamRed.bans.forEach((h, i)  => setSelect(`redBan${i}`, h));

  // Timer
  const td = document.getElementById('timerDisplay');
  if (td && state.draftLabel !== 'coming soon') {
    td.textContent = state.timer || '—';
  }
}

function setVal(id, val) {
  const el = document.getElementById(id);
  if (el && document.activeElement !== el) el.value = val ?? '';
}

function setSelect(id, val) {
  const el = document.getElementById(id);
  if (!el) return;
  if ($(el).data('select2')) {
    $(el).val(val || '').trigger('change.select2');
  } else {
    el.value = val || '';
  }
}

// ══════════════════════════════════════
// EMIT HELPERS
// ══════════════════════════════════════
function emitPlayerName(team, index, name) {
  socket.emit('updatePlayerName', { team, index, name });
}

function updateTeam(team) {
  const color = team === 'teamBlue' ? 'blue' : 'red';
  socket.emit('updateTeamName', { team, name: document.getElementById(color+'TeamName').value });
  socket.emit('updateScore',    { team, score: parseInt(document.getElementById(color+'Score').value)||0 });
  socket.emit('updateTeamLogo', { team, logo: document.getElementById(color+'TeamLogo').value });
  // save players too
  for (let i = 0; i < 5; i++) {
    const v = document.getElementById(color+'Player'+i)?.value;
    if (v !== undefined) socket.emit('updatePlayerName', { team, index: i, name: v });
  }
  showToast(`${color==='blue'?'🔵 Blue':'🔴 Red'} team saved ✓`, 'blue');
}

function updateMatchInfo() {
  const tournament = document.getElementById('tournamentName').value;
  const title = document.getElementById('matchTitle').value;
  socket.emit('updateMatchInfo', { tournament, title });
  showToast('Match info saved ✓', 'blue');
}

function switchTeams() {
  socket.emit('switchTeams');
  showToast('Teams switched ↔', 'blue');
}

function clearAll() {
  socket.emit('clearAll');
  showToast('All picks & bans cleared', 'red');
}

function clearBanSlot(team, index) {
  socket.emit('clearBan', { team, index });
}

// ══════════════════════════════════════
// SWAP LOGIC
// ══════════════════════════════════════
let swPl = null, swPk = null;

function cancelSwap(type) {
  const sw = type === 'pl' ? swPl : swPk;
  if (!sw) return;
  sw.btn.textContent = 'SW';
  sw.btn.classList.remove('cancel-mode');
  document.getElementById(`${sw.color}_row${sw.idx}`)?.classList.remove('active-row');
  if (type === 'pl') swPl = null; else swPk = null;
}

function swapPlayer(color, idx, btn) {
  const team = color === 'blue' ? 'teamBlue' : 'teamRed';
  if (swPl) {
    if (swPl.color === color && swPl.idx === idx) { cancelSwap('pl'); return; }
    if (swPl.color === color) {
      const a = document.getElementById(`${color}Player${swPl.idx}`);
      const b = document.getElementById(`${color}Player${idx}`);
      if (a && b) { const tmp = a.value; a.value = b.value; b.value = tmp; }
      socket.emit('updatePlayerName', { team, index: swPl.idx, name: document.getElementById(`${color}Player${swPl.idx}`).value });
      socket.emit('updatePlayerName', { team, index: idx, name: document.getElementById(`${color}Player${idx}`).value });
      cancelSwap('pl');
      showToast(`Player ${swPl?.idx+1} ↔ ${idx+1} swapped`, 'green'); return;
    }
    cancelSwap('pl');
  }
  swPl = { color, idx, btn };
  btn.textContent = 'CANCEL'; btn.classList.add('cancel-mode');
  document.getElementById(`${color}_row${idx}`)?.classList.add('active-row');
}

function swapHero(color, idx, btn) {
  const team = color === 'blue' ? 'teamBlue' : 'teamRed';
  if (swPk) {
    if (swPk.color === color && swPk.idx === idx) { cancelSwap('pk'); return; }
    if (swPk.color === color) {
      socket.emit('swapPicks', { team, index1: swPk.idx, index2: idx });
      // also swap player names
      const a = document.getElementById(`${color}Player${swPk.idx}`);
      const b = document.getElementById(`${color}Player${idx}`);
      if (a && b) {
        const tmp = a.value; a.value = b.value; b.value = tmp;
        socket.emit('updatePlayerName', { team, index: swPk.idx, name: a.value });
        socket.emit('updatePlayerName', { team, index: idx, name: b.value });
      }
      const pi = swPk.idx;
      cancelSwap('pk');
      showToast(`Pick ${pi+1} ↔ ${idx+1} swapped`, 'green'); return;
    }
    cancelSwap('pk');
  }
  swPk = { color, idx, btn };
  btn.textContent = 'CANCEL'; btn.classList.add('cancel-mode');
  document.getElementById(`${color}_row${idx}`)?.classList.add('active-row');
}

// ══════════════════════════════════════
// DRAFT TIMER
// ══════════════════════════════════════
const DRAFT_SEQUENCE = [
  {label:'Blue Ban 1',  seconds:40, slots:['blueBan0']},
  {label:'Red Ban 1',   seconds:40, slots:['redBan0']},
  {label:'Blue Ban 2',  seconds:40, slots:['blueBan1']},
  {label:'Red Ban 2',   seconds:40, slots:['redBan1']},
  {label:'Blue Pick 1', seconds:60, slots:['bluePick0']},
  {label:'Red Pick 1+2',seconds:60, slots:['redPick0','redPick1']},
  {label:'Blue P 2+3',  seconds:60, slots:['bluePick1','bluePick2']},
  {label:'Red Pick 3',  seconds:60, slots:['redPick2']},
  {label:'Red Ban 3',   seconds:40, slots:['redBan2']},
  {label:'Blue Ban 3',  seconds:40, slots:['blueBan2']},
  {label:'Red Ban 4',   seconds:40, slots:['redBan3']},
  {label:'Blue Ban 4',  seconds:40, slots:['blueBan3']},
  {label:'Red Pick 4',  seconds:60, slots:['redPick3']},
  {label:'Blue P 4+5',  seconds:60, slots:['bluePick3','bluePick4']},
  {label:'Red Pick 5',  seconds:60, slots:['redPick4']},
  {label:'Waiting',     seconds:60, slots:[]},
];

function buildDraftBadges() {
  const el = document.getElementById('draftSequenceList');
  if (!el || el.children.length > 0) return;
  DRAFT_SEQUENCE.forEach((p, i) => {
    const s = document.createElement('span');
    s.className = 'seq-badge'; s.id = 'sb' + i;
    s.textContent = `${i+1}. ${p.label}`;
    el.appendChild(s);
  });
}

function updateDraftUI(state) {
  const idx = state.draftPhaseIndex ?? -1;
  const td = document.getElementById('timerDisplay');
  const pl = document.getElementById('draftPhaseLabel');
  const pi = document.getElementById('draftPhaseIndex');

  if (td) {
    if (state.draftLabel === 'coming soon') {
      td.textContent = '—';
    } else {
      td.textContent = state.timer || '—';
      const secs = parseTimeToSecs(state.timer);
      td.classList.toggle('urgent', secs > 0 && secs <= 10);
    }
  }
  if (pl) pl.textContent = (state.draftLabel || 'READY').toUpperCase();
  if (pi) pi.textContent = idx >= 0 ? `Phase ${idx+1} / ${DRAFT_SEQUENCE.length}` : `Phase 0 / ${DRAFT_SEQUENCE.length}`;

  DRAFT_SEQUENCE.forEach((_, i) => {
    const b = document.getElementById('sb' + i);
    if (b) b.className = 'seq-badge' + (i===idx?' current':(i<idx?' done':''));
  });

  // highlight active slots
  document.querySelectorAll('.slot-active').forEach(e => e.classList.remove('slot-active'));
  (state.draftActiveSlots || []).forEach(slotId => {
    const m = slotId.match(/^(blue|red)(Pick|Ban)(\d)$/);
    if (!m) return;
    const wrapId = `${m[1]}_${m[2]==='Pick'?'pick':'ban'}_wrap${m[3]}`;
    document.getElementById(wrapId)?.classList.add('slot-active');
  });

  // status bar
  const bs = document.getElementById('bb_status');
  if (bs) bs.textContent = idx < 0 ? 'Ready' : idx >= DRAFT_SEQUENCE.length ? 'Done' :
    `${state.draftLabel} — ${state.draftRunning ? '▶ Running' : '⏸ Paused'}`;
}

function parseTimeToSecs(t) {
  if (!t) return 0;
  const p = t.split(':');
  return p.length === 2 ? parseInt(p[0])*60 + parseInt(p[1]) : parseInt(t)||0;
}

function checkPhaseComplete() {
  // server handles auto-advance; this is just a hint
}

function draftStart()  { socket.emit('draftStart'); showToast('Draft started ▶', 'green'); }
function draftPause()  { socket.emit('draftPause'); showToast('Paused ⏸'); }
function draftResume() { socket.emit('draftResume'); showToast('Resumed ▶', 'blue'); }
function draftNext()   { socket.emit('draftNext'); }
function draftPrev()   { socket.emit('draftPrev'); }
function draftReset()  { socket.emit('draftReset'); showToast('Timer reset', 'red'); }

// ══════════════════════════════════════
// TOAST
// ══════════════════════════════════════
function showToast(msg, type = 'green') {
  const el = document.getElementById('toast_el');
  if (!el) return;
  const colors = { green: 'var(--green)', blue: 'var(--blue)', red: 'var(--red)' };
  el.style.borderLeftColor = colors[type] || colors.green;
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('show'), 2200);
}

// init
buildDraftBadges();
