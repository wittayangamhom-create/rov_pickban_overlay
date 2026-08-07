// หน้ารายละเอียดของทัวร์นาเมนต์หนึ่งรายการ
//
// เสิร์ฟที่ /tournament/:id หน้าเดียวใช้กับทุก id
// อ่าน id จาก URL เอง ไม่ได้รับมาจากเซิร์ฟเวอร์ตอน render
//
// ทุกอย่างในหน้านี้ประกอบด้วย textContent / value ไม่มีการต่อ innerHTML
// เพราะชื่อทัวร์นาเมนต์กับโน้ตเป็นข้อความที่ผู้ใช้พิมพ์เอง

const { socket, fetchJson, absoluteUrl, withToken, showToast } = window.RovClient;

// /tournament/g3a1b2c3  ->  g3a1b2c3
const tournamentId = decodeURIComponent(window.location.pathname.split('/').filter(Boolean)[1] || '');

let options = null;
let current = null;   // ทัวร์นาเมนต์ที่โหลดมาล่าสุด ใช้ตอนกด REVERT

// ขนาดหน้าจอเลือกที่ control panel หน้านี้แค่บอกว่า URL ไหนคู่กับขนาดไหน
const SOURCES = [
  { name: 'Overlay 1080p', path: '/overlay', size: '1920 x 1080' },
  { name: 'Overlay 1440p', path: '/overlay-1440', size: '2560 x 1440' },
  { name: 'Result', path: '/result', size: 'matches overlay size' }
];

// HELPERS ------------------------------------------------------------

function badge(text, cls = '') {
  const el = document.createElement('span');
  el.className = `badge ${cls}`.trim();
  el.textContent = text;
  return el;
}

function formatSpec(id) {
  return options?.formats.find((f) => f.id === id) || null;
}

function fillSelect(select, items, value) {
  select.textContent = '';
  items.forEach((item) => {
    const opt = document.createElement('option');
    opt.value = String(item.value);
    opt.textContent = item.label;
    if (String(item.value) === String(value)) opt.selected = true;
    select.appendChild(opt);
  });
}

// RENDER -------------------------------------------------------------

function renderHead(t) {
  document.getElementById('headName').textContent = t.name;
  document.title = `${t.name} - ROV Overlay Tool`;

  const wrap = document.getElementById('headBadges');
  wrap.textContent = '';
  wrap.appendChild(badge(t.status === 'finished' ? 'Finished' : 'Active', t.status));
  wrap.appendChild(badge(formatSpec(t.format)?.label || t.format));
  wrap.appendChild(badge(`Bo${t.bestOf}`));
}

function renderForm(t) {
  document.getElementById('fName').value = t.name;
  document.getElementById('fNote').value = t.note || '';

  fillSelect(
    document.getElementById('fFormat'),
    options.formats.map((f) => ({ value: f.id, label: f.label })),
    t.format
  );
  fillSelect(
    document.getElementById('fBestOf'),
    options.bestOf.map((n) => ({ value: n, label: `Best of ${n}` })),
    t.bestOf
  );
  document.getElementById('fStatus').value = t.status;

  renderFormatHint();
}

// เตือนตั้งแต่ตอนเลือก ถ้ารูปแบบใหม่รับทีมได้น้อยกว่าที่มีอยู่
// เซิร์ฟเวอร์ปฏิเสธอยู่แล้ว แต่รู้ก่อนกดเซฟย่อมดีกว่ารู้ตอนโดนปฏิเสธ
function renderFormatHint() {
  const spec = formatSpec(document.getElementById('fFormat').value);
  const hint = document.getElementById('formatHint');
  if (!spec) {
    hint.textContent = '';
    return;
  }

  const teams = current?.teamCount ?? 0;
  if (teams > spec.maxTeams) {
    hint.textContent = `${spec.label} allows ${spec.maxTeams}, this has ${teams}`;
    hint.style.color = 'var(--red)';
  } else {
    hint.textContent = `${spec.minTeams}-${spec.maxTeams} teams`;
    hint.style.color = '';
  }
}

function renderTeams(t, teams) {
  const wrap = document.getElementById('teamBadges');
  wrap.textContent = '';
  wrap.appendChild(badge(
    `${t.teamCount} / ${t.maxTeams} teams`,
    t.teamCount >= t.maxTeams ? 'full' : 'count'
  ));

  const body = document.getElementById('teamsBody');
  body.textContent = '';

  if (teams.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent =
      `No teams in this tournament yet. This format holds up to ${t.maxTeams} teams. ` +
      'Adding and editing teams arrives with the team registry.';
    body.appendChild(empty);
    return;
  }

  const list = document.createElement('div');
  list.className = 'tlist';
  teams.forEach((team) => {
    const card = document.createElement('div');
    card.className = 'tcard';

    const top = document.createElement('div');
    top.className = 'tcard-top';
    const name = document.createElement('div');
    name.className = 'tcard-name';
    name.textContent = team.name;
    top.appendChild(name);

    const meta = document.createElement('div');
    meta.className = 'tcard-meta';
    if (team.tag) meta.appendChild(badge(team.tag));
    meta.appendChild(badge(`Seed ${team.seed}`));
    const named = team.players.filter((p) => p.name).length;
    meta.appendChild(badge(`${named} / ${team.players.length} players`));

    card.append(top, meta);
    list.appendChild(card);
  });
  body.appendChild(list);
}

function renderSources() {
  const wrap = document.getElementById('sources');
  wrap.textContent = '';

  SOURCES.forEach((source) => {
    const url = absoluteUrl(source.path);

    const row = document.createElement('div');
    row.className = 'src';

    const name = document.createElement('div');
    name.className = 'src-name';
    name.textContent = source.name;

    const urlEl = document.createElement('div');
    urlEl.className = 'src-url';
    urlEl.textContent = url;
    urlEl.title = `${url}  (${source.size})`;

    const actions = document.createElement('div');
    actions.className = 'src-actions';

    const copy = document.createElement('button');
    copy.type = 'button';
    copy.className = 'tlink';
    copy.textContent = 'COPY URL';
    copy.addEventListener('click', () => copyUrl(url));

    const open = document.createElement('a');
    open.className = 'tlink';
    open.href = withToken(source.path);
    open.target = '_blank';
    open.rel = 'noopener';
    open.textContent = 'OPEN';

    actions.append(copy, open);
    row.append(name, urlEl, actions);
    wrap.appendChild(row);
  });
}

async function copyUrl(url) {
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
  } catch {
    showToast('Copy failed', 'red');
  }
}

function showMissing(message) {
  document.getElementById('headName').textContent = 'Tournament not found';
  const body = document.createElement('div');
  body.className = 'empty';
  body.textContent = message;
  document.querySelector('.wrap').appendChild(body);
}

// ACTIONS ------------------------------------------------------------

async function save() {
  try {
    const { tournament } = await fetchJson(`/api/tournaments/${encodeURIComponent(tournamentId)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: document.getElementById('fName').value,
        format: document.getElementById('fFormat').value,
        bestOf: Number(document.getElementById('fBestOf').value),
        status: document.getElementById('fStatus').value,
        note: document.getElementById('fNote').value
      })
    });
    current = tournament;
    renderHead(tournament);
    renderForm(tournament);
    showToast('Saved', 'green');
  } catch (error) {
    // เซิร์ฟเวอร์ปฏิเสธเมื่อรูปแบบใหม่รับทีมได้น้อยกว่าที่มีอยู่
    // ไม่ตัดทีมทิ้งให้เอง ผู้ใช้ต้องเอาทีมออกเองก่อน
    showToast(error.message || 'Could not save', 'red');
  }
}

async function remove() {
  const name = current?.name || 'this tournament';
  if (!window.confirm(`Delete "${name}"?\n\nThe tournament and its team list are removed. Teams themselves stay in the registry.`)) {
    return;
  }
  try {
    await fetchJson(`/api/tournaments/${encodeURIComponent(tournamentId)}`, { method: 'DELETE' });
    window.location.href = '/';
  } catch (error) {
    showToast(error.message || 'Could not delete', 'red');
  }
}

async function load() {
  const data = await fetchJson(`/api/tournaments/${encodeURIComponent(tournamentId)}`);
  current = data.tournament;
  renderHead(current);
  renderForm(current);
  renderTeams(current, data.teams || []);
  renderSources();

  ['detailSection', 'teamsSection', 'obsSection'].forEach((id) => {
    document.getElementById(id).hidden = false;
  });
}

function renderFoot() {
  document.getElementById('foot').textContent =
    'Add the overlay and result URLs as Browser sources in OBS. ' +
    'Set the source size to match the overlay size chosen in the Control Panel, ' +
    'and tick "Shutdown source when not visible" off so the draft keeps running.';
}

// BOOT ---------------------------------------------------------------

document.getElementById('saveBtn').addEventListener('click', save);
document.getElementById('deleteBtn').addEventListener('click', remove);
document.getElementById('revertBtn').addEventListener('click', () => {
  if (current) {
    renderForm(current);
    showToast('Reverted to saved values', 'blue');
  }
});
document.getElementById('fFormat').addEventListener('change', renderFormatHint);

socket.on('connect_error', (error) => showToast(error.message || 'Connection error', 'red'));

renderFoot();

(async () => {
  if (!tournamentId) {
    showMissing('No tournament id in the address.');
    return;
  }
  try {
    options = await fetchJson('/api/tournament-options');
    await load();
  } catch (error) {
    showMissing(error.message || 'Could not load this tournament.');
  }
})();
