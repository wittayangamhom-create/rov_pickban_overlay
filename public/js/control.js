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
let lastFocusedPhase = null;

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

function overlayUrl(path) {
  const url = new URL(path, window.location.origin);
  if (controlToken) url.searchParams.set('token', controlToken);
  return url.toString();
}

async function copyOverlayUrl(path) {
  const url = overlayUrl(path);
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(url);
    } else {
      const input = document.createElement('input');
      input.value = url;
      input.setAttribute('readonly', '');
      input.style.position = 'fixed';
      input.style.left = '-9999px';
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      input.remove();
    }
    showToast('URL copied', 'green');
  } catch (error) {
    showToast('Copy failed', 'red');
  }
}

function buildAllUI() {
  buildDesignGrid();

  ['blue', 'red'].forEach((color) => {
    buildPPTable(color);
    buildBans(color);
  });
  buildDraftBadges();
}

// One shared dropdown, moved under whichever hero box has focus.
// A native <datalist> cannot be ranked or filtered from script, so the
// suggestion list is built by hand.
let ddEl = null;
let ddInput = null;
let ddItems = [];
let ddIndex = -1;

function ensureDropdown() {
  if (ddEl) return ddEl;
  ddEl = document.createElement('div');
  ddEl.className = 'hero-dd';
  ddEl.hidden = true;
  // mousedown, not click: click would land after blur has already closed us.
  ddEl.addEventListener('mousedown', (event) => {
    const item = event.target.closest('.hero-dd-item');
    if (!item) return;
    event.preventDefault();
    chooseSuggestion(Number(item.dataset.index));
  });
  document.body.appendChild(ddEl);

  // It is placed at page coordinates, so anything that moves the input out
  // from under it must dismiss it rather than leave it floating.
  window.addEventListener('scroll', closeDropdown, true);
  window.addEventListener('resize', closeDropdown);

  return ddEl;
}

function openDropdown(input) {
  const el = ensureDropdown();
  ddInput = input;
  ddItems = matchHeroes(input.value, input.id);

  if (ddItems.length === 0) {
    closeDropdown();
    return;
  }

  ddIndex = 0;
  el.textContent = '';
  ddItems.forEach((hero, index) => {
    const item = document.createElement('div');
    item.className = `hero-dd-item${index === 0 ? ' active' : ''}`;
    item.dataset.index = index;
    item.textContent = hero;
    el.appendChild(item);
  });

  const box = input.getBoundingClientRect();
  el.style.left = `${box.left + window.scrollX}px`;
  el.style.top = `${box.bottom + window.scrollY + 2}px`;
  el.style.minWidth = `${box.width}px`;
  el.hidden = false;
  el.scrollTop = 0;
}

function closeDropdown() {
  if (!ddEl) return;
  ddEl.hidden = true;
  ddInput = null;
  ddItems = [];
  ddIndex = -1;
}

function moveDropdown(step) {
  if (ddEl?.hidden || ddItems.length === 0) return;
  ddIndex = (ddIndex + step + ddItems.length) % ddItems.length;
  Array.from(ddEl.children).forEach((child, index) => {
    child.classList.toggle('active', index === ddIndex);
  });
  ddEl.children[ddIndex]?.scrollIntoView({ block: 'nearest' });
}

function chooseSuggestion(index) {
  const input = ddInput;
  const hero = ddItems[index];
  if (!input || !hero) return;
  input.value = hero;
  closeDropdown();
  commitHeroInput(input, input._onCommit, true);
}

// Every hero already banned or picked is gone for the rest of the draft.
// exceptSlotId lets the slot being edited keep its own hero.
function takenHeroes(exceptSlotId) {
  const taken = new Set();
  if (!latestState) return taken;

  [['blue', 'teamBlue'], ['red', 'teamRed']].forEach(([color, teamKey]) => {
    [['Pick', 'picks'], ['Ban', 'bans']].forEach(([kind, field]) => {
      (latestState[teamKey]?.[field] || []).forEach((hero, index) => {
        if (!hero) return;
        if (`${color}${kind}${index}` === exceptSlotId) return;
        taken.add(hero);
      });
    });
  });

  return taken;
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
  input.autocomplete = 'off';
  input.placeholder = type === 'pick' ? 'Type hero...' : 'Type ban...';
  input._onCommit = onCommit;

  // Opens on typing or ArrowDown, never on plain focus: the draft auto-focuses
  // a slot after every phase, and a full-height list popping open over the
  // panel each time would just be in the way.
  input.addEventListener('input', () => {
    input.dataset.pendingValue = input.value;
    openDropdown(input);
  });
  input.addEventListener('change', () => commitHeroInput(input, onCommit));
  input.addEventListener('blur', () => {
    closeDropdown();
    commitHeroInput(input, onCommit);
  });

  input.addEventListener('keydown', (event) => {
    const open = ddInput === input && ddEl && !ddEl.hidden;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (open) moveDropdown(1); else openDropdown(input);
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (open) moveDropdown(-1);
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      // Take the highlighted suggestion when the list is showing.
      if (open && ddIndex >= 0) chooseSuggestion(ddIndex);
      else commitHeroInput(input, onCommit, true);
      return;
    }
    if (event.key === 'Escape') {
      if (open) {
        closeDropdown();
        return;
      }
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
  renderOverlaySize(state.overlaySize);
  renderSkin(state.skin);
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

// Ranking: exact name, then names starting with what was typed, then names
// whose second word starts with it ("baron" still finds "bolt baron").
// Loose substring matches are deliberately not offered - typing "b" should
// never surface "ilumia" just because it contains a b somewhere.
function startsWithAnyWord(hero, lower) {
  return hero.toLowerCase().split(/\s+/).some((word) => word.startsWith(lower));
}

function normalizeHeroInput(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const lower = raw.toLowerCase();
  return heroes.find((hero) => hero.toLowerCase() === lower) ||
    heroes.find((hero) => hero.toLowerCase().startsWith(lower)) ||
    heroes.find((hero) => startsWithAnyWord(hero, lower)) ||
    null;
}

// Suggestions for the dropdown: available heroes only, prefix matches first.
// Returns [] when nothing matches, which hides the dropdown entirely.
function matchHeroes(query, exceptSlotId) {
  const taken = takenHeroes(exceptSlotId);
  const available = heroes.filter((hero) => !taken.has(hero));
  const lower = String(query || '').trim().toLowerCase();
  if (!lower) return available;

  const prefix = [];
  const wordStart = [];
  available.forEach((hero) => {
    if (hero.toLowerCase().startsWith(lower)) prefix.push(hero);
    else if (startsWithAnyWord(hero, lower)) wordStart.push(hero);
  });
  return prefix.concat(wordStart);
}

function commitHeroInput(input, onCommit, preferMatch = false) {
  const previous = input.dataset.lastHero || '';
  const hero = normalizeHeroInput(input.value);
  if (input.value.trim() && !hero) {
    input.value = previous;
    showToast('Hero not found', 'red');
    return;
  }
  // The server enforces this too; checking here just makes the feedback instant.
  if (hero && takenHeroes(input.id).has(hero)) {
    input.value = previous;
    showToast(`${hero} is already used`, 'red');
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

// --- Custom design (skin) uploads -------------------------------------
const SKIN_SLOTS = [
  { key: 'overlayTop', page: 'Overlay', part: 'Top', note: 'ban / score / timer' },
  { key: 'overlayBottom', page: 'Overlay', part: 'Bottom', note: 'pick cards' },
  { key: 'resultTop', page: 'Result', part: 'Top', note: 'blue team half' },
  { key: 'resultBottom', page: 'Result', part: 'Bottom', note: 'red team half' }
];
const SKIN_FILES = {
  overlayTop: 'overlay-top',
  overlayBottom: 'overlay-bottom',
  resultTop: 'result-top',
  resultBottom: 'result-bottom'
};

function buildDesignGrid() {
  const grid = document.getElementById('designGrid');
  if (!grid) return;
  grid.textContent = '';

  SKIN_SLOTS.forEach(({ key, page, part, note }) => {
    const card = document.createElement('div');
    card.className = 'dslot';

    const title = document.createElement('div');
    title.className = 'dslot-title';
    title.innerHTML = `${page} <b>${part}</b>`;

    const preview = document.createElement('div');
    preview.className = 'dslot-preview';
    preview.id = `skinPreview_${key}`;
    preview.textContent = note.toUpperCase();

    // ปุ่มเลือกไฟล์ซ่อนไว้ ให้ปุ่มปกติเป็นตัวกด เพื่อให้หน้าตาเข้าชุดกัน
    const file = document.createElement('input');
    file.type = 'file';
    file.accept = 'image/png,image/jpeg,image/webp';
    file.style.display = 'none';
    file.addEventListener('change', () => {
      if (file.files[0]) uploadSkin(key, file.files[0]);
      file.value = '';
    });

    const upload = document.createElement('button');
    upload.className = 'tlink';
    upload.type = 'button';
    upload.textContent = 'UPLOAD';
    upload.addEventListener('click', () => file.click());

    const clear = document.createElement('button');
    clear.className = 'tlink danger';
    clear.type = 'button';
    clear.textContent = 'CLEAR';
    clear.addEventListener('click', () => clearSkin(key));

    const actions = document.createElement('div');
    actions.className = 'dslot-actions';
    actions.append(upload, clear);

    card.append(title, preview, actions, file);
    grid.appendChild(card);
  });
}

async function uploadSkin(slot, file) {
  if (file.size > 8 * 1024 * 1024) {
    showToast('Image is over 8 MB', 'red');
    return;
  }
  try {
    const response = await fetch(withToken(`/api/skin/${slot}`), {
      method: 'POST',
      headers: {
        'Content-Type': file.type,
        ...(controlToken ? { Authorization: `Bearer ${controlToken}` } : {})
      },
      body: file
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || response.statusText);
    showToast(`${slot} design uploaded`, 'green');
  } catch (error) {
    showToast(error.message || 'Upload failed', 'red');
  }
}

async function clearSkin(slot) {
  try {
    await fetchJson(`/api/skin/${slot}`, { method: 'DELETE' });
    showToast(`${slot} design cleared`, 'red');
  } catch (error) {
    showToast(error.message, 'red');
  }
}

function updateSkinOptions() {
  socket.emit('updateSkinOptions', {
    enabled: document.getElementById('skinEnabled')?.checked,
    showPanels: document.getElementById('skinShowPanels')?.checked
  });
}

function renderSkin(skin) {
  if (!skin) return;
  const enabled = document.getElementById('skinEnabled');
  const panels = document.getElementById('skinShowPanels');
  if (enabled && document.activeElement !== enabled) enabled.checked = skin.enabled === true;
  if (panels && document.activeElement !== panels) panels.checked = skin.showPanels !== false;

  SKIN_SLOTS.forEach(({ key, note }) => {
    const preview = document.getElementById(`skinPreview_${key}`);
    if (!preview) return;
    const version = skin.slots?.[key] || 0;

    if (!version) {
      preview.style.backgroundImage = '';
      preview.classList.remove('filled');
      preview.textContent = note.toUpperCase();
      return;
    }
    if (preview.dataset.version === String(version)) return;
    preview.dataset.version = String(version);
    preview.textContent = '';
    preview.classList.add('filled');
    // นามสกุลไม่ได้เก็บใน state ลองทีละแบบจนกว่าจะเจอ
    ['png', 'jpg', 'webp'].reduce((chain, ext) => chain.then((found) => {
      if (found) return found;
      const url = `images/skins/${SKIN_FILES[key]}.${ext}?v=${version}`;
      return new Promise((res) => {
        const img = new Image();
        img.onload = () => res(url);
        img.onerror = () => res(null);
        img.src = url;
      });
    }), Promise.resolve(null)).then((url) => {
      if (url) preview.style.backgroundImage = `url("${url}")`;
    });
  });
}

function setOverlaySize(size) {
  socket.emit('updateOverlaySize', { size });
  showToast(`Overlay size set to ${size}p`, 'blue');
}

function renderOverlaySize(size) {
  const active = size === '1440' ? '1440' : '1080';
  document.getElementById('sizeBtn1080')?.classList.toggle('active', active === '1080');
  document.getElementById('sizeBtn1440')?.classList.toggle('active', active === '1440');
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

  // Only when the phase actually changes. stateUpdate fires every second while
  // the clock runs, and grabbing focus on every tick would make typing impossible.
  if (idx !== lastFocusedPhase) {
    lastFocusedPhase = idx;
    focusActiveSlot(state);
  }
}

function focusActiveSlot(state) {
  const slots = state.draftActiveSlots || [];
  if (slots.length === 0) return;

  // Leave the operator alone if they are filling in team or player names.
  const active = document.activeElement;
  const inHeroField = active?.classList?.contains('hero-search-input');
  if (active && active.tagName === 'INPUT' && !inHeroField) return;

  // A phase can own two slots (e.g. "Red Pick 1+2"); go to the first empty one.
  const targetId = slots.find((slotId) => {
    const el = document.getElementById(slotId);
    return el && !el.value;
  }) || slots[0];

  const target = document.getElementById(targetId);
  if (!target) return;
  target.focus();
  target.select();

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

function undoLast() { socket.emit('undo'); }

function isTypingField(el) {
  if (!el) return false;
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT';
}

// The draft auto-focuses an empty hero box after every phase, so a plain
// "is the cursor in a field" check would kill the shortcuts exactly when they
// are needed. An empty hero box has nothing to edit, so let them through.
// Once something is typed the keys go back to normal editing - which matters
// for hero names containing a space, like "bolt baron".
function shortcutsAllowed() {
  const el = document.activeElement;
  if (!isTypingField(el)) return true;
  return el.classList.contains('hero-search-input') && el.value === '';
}

// Shortcuts stay out of the way while the operator is typing a name.
// Press Escape to leave a hero box, then Space / arrows work.
document.addEventListener('keydown', (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
    const el = document.activeElement;
    // Inside a box with text, Ctrl+Z should undo the typing, not the draft.
    if (isTypingField(el) && el.value) return;
    event.preventDefault();
    undoLast();
    return;
  }

  if (!shortcutsAllowed()) return;

  if (event.code === 'Space') {
    event.preventDefault();
    if (latestState?.draftRunning) draftPause(); else draftResume();
    return;
  }

  if (event.key === 'ArrowRight') {
    event.preventDefault();
    draftNext();
    return;
  }

  if (event.key === 'ArrowLeft') {
    event.preventDefault();
    draftPrev();
  }
});

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
