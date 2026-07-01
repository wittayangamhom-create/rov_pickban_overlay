const params = new URLSearchParams(window.location.search);
const controlToken = params.get('token') || localStorage.getItem('rovControlToken') || '';
if (controlToken) localStorage.setItem('rovControlToken', controlToken);

const socket = io({ auth: { token: controlToken }, query: controlToken ? { token: controlToken } : {} });

let heroes = [];
let draftSequence = [];
let presetNames = [];
let latestState = null;
let uiBuilt = false;
let swPl = null;
let swPk = null;

socket.on('connect', () => showToast('Connected', 'green'));
socket.on('disconnect', () => showToast('Disconnected', 'red'));
socket.on('connect_error', (error) => showToast(error.message || 'Connection error', 'red'));
socket.on('controlError', (error) => showToast(error.message || 'Control blocked', 'red'));
socket.on('stateUpdate', (state) => {
  latestState = state;
  if (uiBuilt) {
    loadState(state);
    updateDraftUI(state);
  }
});

async function boot() {
  const [heroesResult, draftResult, presetsResult, stateResult] = await Promise.allSettled([
    fetchJson('/api/heroes'),
    fetchJson('/api/draft-sequence'),
    fetchJson('/api/presets'),
    fetchJson('/api/state')
  ]);

  heroes = valueOf(heroesResult)?.heroes || [];
  draftSequence = valueOf(draftResult)?.sequence || [];
  presetNames = valueOf(presetsResult)?.presets || [];
  latestState = valueOf(stateResult) || latestState;

  const failedLoad = [heroesResult, draftResult, presetsResult, stateResult]
    .find((result) => result.status === 'rejected');
  if (failedLoad) showToast(failedLoad.reason?.message || 'Control data failed to load', 'red');

  buildAllUI();
  uiBuilt = true;
  renderPresetList();

  if (latestState) {
    loadState(latestState);
    updateDraftUI(latestState);
  }
}

function valueOf(result) {
  return result.status === 'fulfilled' ? result.value : null;
}

async function fetchJson(url, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (controlToken) headers.Authorization = `Bearer ${controlToken}`;
  const response = await fetch(withToken(url), { ...options, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || response.statusText);
  return data;
}

function withToken(url) {
  if (!controlToken) return url;
  const joiner = url.includes('?') ? '&' : '?';
  return `${url}${joiner}token=${encodeURIComponent(controlToken)}`;
}

function buildAllUI() {
  buildHeroDatalist();
  ['blue', 'red'].forEach((color) => {
    buildPPTable(color);
    buildBans(color);
  });
  buildDraftBadges();
}

function buildHeroDatalist() {
  let list = document.getElementById('heroSearchList');
  if (!list) {
    list = document.createElement('datalist');
    list.id = 'heroSearchList';
    document.body.appendChild(list);
  }
  list.textContent = '';
  heroes.forEach((hero) => list.appendChild(new Option(hero, hero)));
}

function buildPPTable(color) {
  const team = color === 'blue' ? 'teamBlue' : 'teamRed';
  const tbody = document.getElementById(`${color}_pp`);
  if (!tbody) return;
  tbody.textContent = '';

  for (let i = 0; i < 5; i++) {
    const tr = document.createElement('tr');
    tr.className = 'pp-row';
    tr.id = `${color}_row${i}`;

    tr.appendChild(cellWithNumber(i + 1));
    tr.appendChild(cellWithPlayerInput(color, team, i));
    tr.appendChild(cellWithButton('SW', `btn-sw`, `${color}_psw${i}`, () => swapPlayer(color, i, document.getElementById(`${color}_psw${i}`))));
    tr.appendChild(cellWithHeroSelect(color, team, 'pick', i));
    tr.appendChild(cellWithButton('SW', `btn-sw`, `${color}_hsw${i}`, () => swapHero(color, i, document.getElementById(`${color}_hsw${i}`))));

    tbody.appendChild(tr);
  }
}

function cellWithNumber(number) {
  const td = document.createElement('td');
  const span = document.createElement('span');
  span.style.color = 'var(--muted2)';
  span.style.fontSize = '12px';
  span.style.fontWeight = '700';
  span.textContent = number;
  td.appendChild(span);
  return td;
}

function cellWithPlayerInput(color, team, index) {
  const td = document.createElement('td');
  const input = document.createElement('input');
  input.className = 'player-input';
  input.id = `${color}Player${index}`;
  input.placeholder = `Player ${index + 1}`;
  input.addEventListener('change', () => emitPlayerName(team, index, input.value));
  td.appendChild(input);
  return td;
}

function cellWithButton(text, className, id, handler) {
  const td = document.createElement('td');
  const button = document.createElement('button');
  button.className = className;
  button.id = id;
  button.type = 'button';
  button.textContent = text;
  button.addEventListener('click', handler);
  td.appendChild(button);
  return td;
}

function cellWithHeroSelect(color, team, type, index) {
  const td = document.createElement('td');
  td.className = type === 'pick' ? 'hero-select-wrap' : 'ban-select-wrap';
  td.id = `${color}_${type}_wrap${index}`;
  td.appendChild(makeHeroSearchInput(`${color}${type === 'pick' ? 'Pick' : 'Ban'}${index}`, type, (hero) => {
    socket.emit(type === 'pick' ? 'updatePick' : 'updateBan', { team, index, hero });
  }));
  return td;
}

function makeHeroSearchInput(id, type, onCommit) {
  const input = document.createElement('input');
  input.id = id;
  input.className = 'hero-search-input';
  input.setAttribute('list', 'heroSearchList');
  input.autocomplete = 'off';
  input.placeholder = type === 'pick' ? 'Type hero...' : 'Type ban...';

  input.addEventListener('input', () => {
    input.dataset.pendingValue = input.value;
  });
  input.addEventListener('change', () => commitHeroInput(input, onCommit));
  input.addEventListener('blur', () => commitHeroInput(input, onCommit));
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      commitHeroInput(input, onCommit, true);
    }
    if (event.key === 'Escape') {
      input.value = input.dataset.lastHero || '';
      input.blur();
    }
  });

  return input;
}

function buildBans(color) {
  const team = color === 'blue' ? 'teamBlue' : 'teamRed';
  const el = document.getElementById(`${color}_bans`);
  if (!el) return;
  el.textContent = '';

  for (let i = 0; i < 4; i++) {
    const wrap = document.createElement('div');
    wrap.className = 'ban-slot-wrap';

    const label = document.createElement('span');
    label.className = 'ban-slot-label';
    label.textContent = `Ban ${i + 1}`;

    const selectWrap = document.createElement('div');
    selectWrap.className = 'ban-select-wrap';
    selectWrap.id = `${color}_ban_wrap${i}`;
    selectWrap.appendChild(makeHeroSearchInput(`${color}Ban${i}`, 'ban', (hero) => {
      socket.emit('updateBan', { team, index: i, hero });
    }));

    const clear = document.createElement('button');
    clear.className = 'ban-clear';
    clear.type = 'button';
    clear.textContent = 'clear';
    clear.addEventListener('click', () => clearBanSlot(team, i));

    wrap.append(label, selectWrap, clear);
    el.appendChild(wrap);
  }
}

function renderPresetList() {
  const select = document.getElementById('presetList');
  if (!select) return;
  const current = select.value;
  select.textContent = '';
  select.appendChild(new Option('-- Preset --', ''));
  presetNames.forEach((name) => select.appendChild(new Option(name, name)));
  if (presetNames.includes(current)) select.value = current;
}

function loadState(state) {
  if (state.matchInfo) {
    setVal('tournamentName', state.matchInfo.tournament || '');
    setVal('matchTitle', state.matchInfo.title || '');
  }

  setVal('blueTeamName', state.teamBlue.name);
  setVal('blueScore', state.teamBlue.score);
  state.teamBlue.players.forEach((p, i) => setVal(`bluePlayer${i}`, p));
  state.teamBlue.picks.forEach((h, i) => setSelect(`bluePick${i}`, h));
  state.teamBlue.bans.forEach((h, i) => setSelect(`blueBan${i}`, h));

  setVal('redTeamName', state.teamRed.name);
  setVal('redScore', state.teamRed.score);
  state.teamRed.players.forEach((p, i) => setVal(`redPlayer${i}`, p));
  state.teamRed.picks.forEach((h, i) => setSelect(`redPick${i}`, h));
  state.teamRed.bans.forEach((h, i) => setSelect(`redBan${i}`, h));

  const td = document.getElementById('timerDisplay');
  if (td && state.draftLabel !== 'coming soon') td.textContent = state.timer || '--';
}

function setVal(id, val) {
  const el = document.getElementById(id);
  if (el && document.activeElement !== el) el.value = val ?? '';
}

function setSelect(id, val) {
  const el = document.getElementById(id);
  if (el && document.activeElement !== el) {
    el.value = val || '';
    el.dataset.lastHero = val || '';
  }
}

function normalizeHeroInput(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const lower = raw.toLowerCase();
  return heroes.find((hero) => hero.toLowerCase() === lower) ||
    heroes.find((hero) => hero.toLowerCase().startsWith(lower)) ||
    heroes.find((hero) => hero.toLowerCase().includes(lower)) ||
    null;
}

function commitHeroInput(input, onCommit, preferMatch = false) {
  const previous = input.dataset.lastHero || '';
  const hero = normalizeHeroInput(input.value);
  if (input.value.trim() && !hero) {
    input.value = previous;
    showToast('Hero not found', 'red');
    return;
  }
  const next = hero || null;
  input.value = next || '';
  input.dataset.lastHero = next || '';
  if (preferMatch || next !== (previous || null)) onCommit(next);
}

function emitPlayerName(team, index, name) {
  socket.emit('updatePlayerName', { team, index, name });
}

function updateTeam(team) {
  const color = team === 'teamBlue' ? 'blue' : 'red';
  socket.emit('updateTeamName', { team, name: document.getElementById(`${color}TeamName`).value });
  socket.emit('updateScore', { team, score: parseInt(document.getElementById(`${color}Score`).value, 10) || 0 });

  for (let i = 0; i < 5; i++) {
    const value = document.getElementById(`${color}Player${i}`)?.value;
    if (value !== undefined) socket.emit('updatePlayerName', { team, index: i, name: value });
  }
  showToast(`${color === 'blue' ? 'Blue' : 'Red'} team saved`, 'blue');
}

function updateMatchInfo() {
  socket.emit('updateMatchInfo', {
    tournament: document.getElementById('tournamentName').value,
    title: document.getElementById('matchTitle').value
  });
  showToast('Match info saved', 'blue');
}

function switchTeams() {
  socket.emit('switchTeams');
  showToast('Teams switched', 'blue');
}

function clearAll() {
  socket.emit('clearAll');
  showToast('All picks and bans cleared', 'red');
}

function clearBanSlot(team, index) {
  socket.emit('clearBan', { team, index });
}

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
    if (swPl.color === color && swPl.idx === idx) {
      cancelSwap('pl');
      return;
    }
    if (swPl.color === color) {
      const a = document.getElementById(`${color}Player${swPl.idx}`);
      const b = document.getElementById(`${color}Player${idx}`);
      if (a && b) [a.value, b.value] = [b.value, a.value];
      socket.emit('updatePlayerName', { team, index: swPl.idx, name: a.value });
      socket.emit('updatePlayerName', { team, index: idx, name: b.value });
      const from = swPl.idx;
      cancelSwap('pl');
      showToast(`Player ${from + 1} swapped with ${idx + 1}`, 'green');
      return;
    }
    cancelSwap('pl');
  }
  swPl = { color, idx, btn };
  btn.textContent = 'CANCEL';
  btn.classList.add('cancel-mode');
  document.getElementById(`${color}_row${idx}`)?.classList.add('active-row');
}

function swapHero(color, idx, btn) {
  const team = color === 'blue' ? 'teamBlue' : 'teamRed';
  if (swPk) {
    if (swPk.color === color && swPk.idx === idx) {
      cancelSwap('pk');
      return;
    }
    if (swPk.color === color) {
      socket.emit('swapPicks', { team, index1: swPk.idx, index2: idx });
      const from = swPk.idx;
      cancelSwap('pk');
      showToast(`Pick ${from + 1} swapped with ${idx + 1}`, 'green');
      return;
    }
    cancelSwap('pk');
  }
  swPk = { color, idx, btn };
  btn.textContent = 'CANCEL';
  btn.classList.add('cancel-mode');
  document.getElementById(`${color}_row${idx}`)?.classList.add('active-row');
}

function buildDraftBadges() {
  const el = document.getElementById('draftSequenceList');
  if (!el) return;
  el.textContent = '';
  draftSequence.forEach((phase, i) => {
    const badge = document.createElement('span');
    badge.className = 'seq-badge';
    badge.id = `sb${i}`;
    badge.textContent = `${i + 1}. ${phase.label}`;
    el.appendChild(badge);
  });
}

function updateDraftUI(state) {
  const idx = state.draftPhaseIndex ?? -1;
  const total = draftSequence.length || 16;
  const td = document.getElementById('timerDisplay');
  const pl = document.getElementById('draftPhaseLabel');
  const pi = document.getElementById('draftPhaseIndex');

  if (td) {
    td.textContent = state.draftLabel === 'coming soon' ? '--' : state.timer || '--';
    const secs = parseTimeToSecs(state.timer);
    td.classList.toggle('urgent', secs > 0 && secs <= 10);
  }
  if (pl) pl.textContent = (state.draftLabel || 'READY').toUpperCase();
  if (pi) pi.textContent = idx >= 0 ? `Phase ${idx + 1} / ${total}` : `Phase 0 / ${total}`;

  draftSequence.forEach((_, i) => {
    const b = document.getElementById(`sb${i}`);
    if (b) b.className = `seq-badge${i === idx ? ' current' : i < idx ? ' done' : ''}`;
  });

  document.querySelectorAll('.slot-active').forEach((el) => el.classList.remove('slot-active'));
  (state.draftActiveSlots || []).forEach((slotId) => {
    const match = slotId.match(/^(blue|red)(Pick|Ban)(\d)$/);
    if (!match) return;
    const wrapId = `${match[1]}_${match[2] === 'Pick' ? 'pick' : 'ban'}_wrap${match[3]}`;
    document.getElementById(wrapId)?.classList.add('slot-active');
  });

  const bs = document.getElementById('bb_status');
  if (bs) {
    bs.textContent = idx < 0 ? 'Ready' : idx >= total ? 'Done' :
      `${state.draftLabel} - ${state.draftRunning ? 'Running' : 'Paused'}`;
  }
}

function parseTimeToSecs(t) {
  if (!t) return 0;
  const parts = String(t).split(':');
  return parts.length === 2 ? parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10) : parseInt(t, 10) || 0;
}

function draftStart() { socket.emit('draftStart'); showToast('Draft started', 'green'); }
function draftPause() { socket.emit('draftPause'); showToast('Paused'); }
function draftResume() { socket.emit('draftResume'); showToast('Resumed', 'blue'); }
function draftNext() { socket.emit('draftNext'); }
function draftPrev() { socket.emit('draftPrev'); }
function draftReset() { socket.emit('draftReset'); showToast('Timer reset', 'red'); }

async function refreshPresets() {
  try {
    presetNames = (await fetchJson('/api/presets')).presets || [];
    renderPresetList();
  } catch (error) {
    showToast(error.message, 'red');
  }
}

async function savePreset() {
  const input = document.getElementById('presetName');
  const name = input?.value.trim();
  if (!name) {
    showToast('Preset name required', 'red');
    return;
  }
  try {
    const data = await fetchJson('/api/presets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, state: collectCurrentState() })
    });
    presetNames = data.presets || [];
    renderPresetList();
    const list = document.getElementById('presetList');
    if (list) list.value = name;
    showToast('Preset saved', 'green');
  } catch (error) {
    showToast(error.message, 'red');
  }
}

function collectCurrentState() {
  const state = latestState ? JSON.parse(JSON.stringify(latestState)) : {};
  state.matchInfo = {
    tournament: document.getElementById('tournamentName')?.value || '',
    title: document.getElementById('matchTitle')?.value || ''
  };
  state.teamBlue = collectTeamState('blue', state.teamBlue);
  state.teamRed = collectTeamState('red', state.teamRed);
  return state;
}

function collectTeamState(color, fallback = {}) {
  return {
    ...fallback,
    name: document.getElementById(`${color}TeamName`)?.value || fallback.name || '',
    score: parseInt(document.getElementById(`${color}Score`)?.value, 10) || 0,
    players: Array.from({ length: 5 }, (_, index) => (
      document.getElementById(`${color}Player${index}`)?.value || ''
    )),
    picks: Array.from({ length: 5 }, (_, index) => (
      normalizeHeroInput(document.getElementById(`${color}Pick${index}`)?.value) || null
    )),
    bans: Array.from({ length: 4 }, (_, index) => (
      normalizeHeroInput(document.getElementById(`${color}Ban${index}`)?.value) || null
    ))
  };
}

async function loadPreset() {
  const name = document.getElementById('presetList')?.value;
  if (!name) {
    showToast('Choose a preset', 'red');
    return;
  }
  try {
    const data = await fetchJson('/api/presets/load', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name })
    });
    if (data.state) {
      latestState = data.state;
      loadState(data.state);
      updateDraftUI(data.state);
    }
    showToast('Preset loaded', 'green');
  } catch (error) {
    showToast(error.message, 'red');
  }
}

async function resetMatchState() {
  try {
    const data = await fetchJson('/api/reset-state', { method: 'POST' });
    if (data.state) {
      latestState = data.state;
      loadState(data.state);
      updateDraftUI(data.state);
    }
    showToast('State reset', 'red');
  } catch (error) {
    showToast(error.message, 'red');
  }
}

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

boot();
