// หน้ารายละเอียดของทัวร์นาเมนต์หนึ่งรายการ
//
// เสิร์ฟที่ /tournament/:id หน้าเดียวใช้กับทุก id
// อ่าน id จาก URL เอง ไม่ได้รับมาจากเซิร์ฟเวอร์ตอน render
//
// ทุกอย่างในหน้านี้ประกอบด้วย textContent / value ไม่มีการต่อ innerHTML
// เพราะชื่อทัวร์นาเมนต์กับโน้ตเป็นข้อความที่ผู้ใช้พิมพ์เอง

// controlToken ต้องมีด้วย ใช้ตอนอัปโหลดโลโก้ ซึ่งส่ง body เป็นไฟล์ดิบ
// จึงใช้ fetchJson (ที่แนบ header ให้เอง) ไม่ได้ ต้องประกอบ header เอง
const { controlToken, socket, fetchJson, absoluteUrl, withToken, showToast } = window.RovClient;

// /tournament/g3a1b2c3  ->  g3a1b2c3
const tournamentId = decodeURIComponent(window.location.pathname.split('/').filter(Boolean)[1] || '');

let options = null;
let current = null;   // ทัวร์นาเมนต์ที่โหลดมาล่าสุด ใช้ตอนกด REVERT
let roster = [];      // ทีมที่ลงแข่งในทัวร์นาเมนต์นี้
let registry = [];    // ทีมทั้งหมดในทะเบียนกลาง ไว้ใส่ใน dropdown

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

// โลโก้: v = 0 คือยังไม่มีภาพ ตัวเลขอื่นคือเวลาที่อัปโหลด ใช้กัน cache
function logoImage(team) {
  if (team.logo?.v && team.logo?.ext) {
    const img = document.createElement('img');
    img.className = 'team-logo';
    img.alt = '';
    img.src = `/images/team-logos/${encodeURIComponent(team.id)}.${team.logo.ext}?v=${team.logo.v}`;
    return img;
  }
  const box = document.createElement('div');
  box.className = 'team-logo placeholder';
  box.textContent = (team.tag || team.name || '?').slice(0, 3).toUpperCase();
  return box;
}

function renderTeams(t, teams) {
  roster = teams;

  const wrap = document.getElementById('teamBadges');
  wrap.textContent = '';
  const full = t.teamCount >= t.maxTeams;
  wrap.appendChild(badge(`${t.teamCount} / ${t.maxTeams} teams`, full ? 'full' : 'count'));

  // เต็มแล้วก็ปิดปุ่มไปเลย พร้อมบอกเหตุผลที่ tooltip
  // เซิร์ฟเวอร์ก็ปฏิเสธอยู่แล้ว แต่ปุ่มที่กดไม่ได้ชัดกว่าปุ่มที่กดแล้วขึ้น error
  const addBtn = document.getElementById('addTeamBtn');
  addBtn.disabled = full;
  addBtn.style.opacity = full ? '0.45' : '';
  addBtn.style.cursor = full ? 'not-allowed' : '';
  addBtn.title = full ? `This tournament is full (${t.maxTeams} teams max)` : '';

  const body = document.getElementById('teamsBody');
  body.textContent = '';

  if (teams.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = `No teams yet. This format holds up to ${t.maxTeams} teams.`;
    body.appendChild(empty);
    return;
  }

  teams.forEach((team) => body.appendChild(teamCard(team)));
}

function teamCard(team) {
  const card = document.createElement('div');
  card.className = 'team';

  const row = document.createElement('div');
  row.className = 'team-row';

  const id = document.createElement('div');
  id.className = 'team-id';
  const name = document.createElement('div');
  name.className = 'team-name';
  name.textContent = team.name;
  const sub = document.createElement('div');
  sub.className = 'team-sub';
  if (team.tag) sub.appendChild(badge(team.tag));
  sub.appendChild(badge(`Seed ${team.seed}`));
  const named = team.players.filter((p) => p.name).length;
  sub.appendChild(badge(`${named} / ${team.players.length} players`));
  id.append(name, sub);

  const actions = document.createElement('div');
  actions.className = 'team-actions';

  const editBtn = document.createElement('button');
  editBtn.type = 'button';
  editBtn.className = 'tlink';
  editBtn.textContent = 'EDIT';

  const removeBtn = document.createElement('button');
  removeBtn.type = 'button';
  removeBtn.className = 'tlink danger';
  removeBtn.textContent = 'REMOVE';
  removeBtn.title = 'Take this team out of the tournament. The team stays in the registry.';
  removeBtn.addEventListener('click', () => removeFromTournament(team));

  actions.append(editBtn, removeBtn);
  row.append(logoImage(team), id, actions);
  card.appendChild(row);

  const editor = document.createElement('div');
  editor.className = 'team-edit';
  editor.hidden = true;
  card.appendChild(editor);

  editBtn.addEventListener('click', () => {
    editor.hidden = !editor.hidden;
    editBtn.textContent = editor.hidden ? 'EDIT' : 'CLOSE';
    if (!editor.hidden && editor.childElementCount === 0) buildEditor(editor, team);
  });

  return card;
}

// ตัวแก้ไขทีม สร้างตอนกดเปิดครั้งแรกเท่านั้น
// ทัวร์นาเมนต์ที่มี 128 ทีมจะได้ไม่ต้องสร้าง input 128 x 5 ช่องทิ้งไว้ตั้งแต่ต้น
function buildEditor(editor, team) {
  const nameRow = document.createElement('div');
  nameRow.className = 'frow';

  const nameFld = document.createElement('div');
  nameFld.className = 'fld';
  const nameLabel = document.createElement('label');
  nameLabel.textContent = 'Team name';
  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.maxLength = 24;
  nameInput.value = team.name;
  nameFld.append(nameLabel, nameInput);

  const tagFld = document.createElement('div');
  tagFld.className = 'fld';
  tagFld.style.flex = '0 0 130px';
  const tagLabel = document.createElement('label');
  tagLabel.textContent = 'Tag';
  const tagInput = document.createElement('input');
  tagInput.type = 'text';
  tagInput.maxLength = 6;
  tagInput.value = team.tag || '';
  tagFld.append(tagLabel, tagInput);

  const seedFld = document.createElement('div');
  seedFld.className = 'fld';
  seedFld.style.flex = '0 0 110px';
  const seedLabel = document.createElement('label');
  seedLabel.textContent = 'Seed';
  const seedInput = document.createElement('input');
  seedInput.type = 'number';
  seedInput.min = '0';
  seedInput.max = '9999';
  seedInput.value = String(team.seed ?? 0);
  seedFld.append(seedLabel, seedInput);

  nameRow.append(nameFld, tagFld, seedFld);

  const playersWrap = document.createElement('div');
  const playersLabel = document.createElement('label');
  playersLabel.className = 'section-title';
  playersLabel.textContent = 'Players';
  playersLabel.style.display = 'block';
  playersLabel.style.marginBottom = '8px';
  playersWrap.appendChild(playersLabel);

  const playerInputs = team.players.map((player, i) => {
    const row = document.createElement('div');
    row.className = 'player-row';

    const slot = document.createElement('div');
    slot.className = 'slot';
    slot.textContent = String(i + 1);

    const pname = document.createElement('input');
    pname.type = 'text';
    pname.className = 'pname';
    pname.maxLength = 24;
    pname.placeholder = `Player ${i + 1}`;
    pname.value = player.name || '';

    const prole = document.createElement('input');
    prole.type = 'text';
    prole.className = 'prole';
    prole.maxLength = 16;
    prole.placeholder = 'Role';
    prole.value = player.role || '';

    const capLabel = document.createElement('label');
    capLabel.className = 'cap';
    const cap = document.createElement('input');
    cap.type = 'radio';
    cap.name = `captain-${team.id}`;
    cap.checked = player.isCaptain === true;
    capLabel.append(cap, document.createTextNode('Captain'));

    row.append(slot, pname, prole, capLabel);
    playersWrap.appendChild(row);
    return { pname, prole, cap };
  });

  // LOGO ---------------------------------------------------------------
  const logoRow = document.createElement('div');
  logoRow.className = 'frow';
  logoRow.style.alignItems = 'center';

  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = 'image/png,image/jpeg,image/webp';
  fileInput.hidden = true;
  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    if (file) uploadLogo(team, file);
    fileInput.value = '';
  });

  const uploadBtn = document.createElement('button');
  uploadBtn.type = 'button';
  uploadBtn.className = 'tlink';
  uploadBtn.textContent = 'UPLOAD LOGO';
  uploadBtn.addEventListener('click', () => fileInput.click());

  const clearLogoBtn = document.createElement('button');
  clearLogoBtn.type = 'button';
  clearLogoBtn.className = 'tlink';
  clearLogoBtn.textContent = 'CLEAR LOGO';
  clearLogoBtn.addEventListener('click', () => clearLogo(team));

  const hint = document.createElement('span');
  hint.className = 'hint';
  hint.style.color = 'var(--muted)';
  hint.textContent = 'PNG, JPG or WEBP, up to 4 MB';

  logoRow.append(fileInput, uploadBtn, clearLogoBtn, hint);

  // SAVE / DELETE ------------------------------------------------------
  const saveRow = document.createElement('div');
  saveRow.className = 'frow';
  saveRow.style.marginBottom = '0';

  const saveBtn = document.createElement('button');
  saveBtn.type = 'button';
  saveBtn.className = 'tlink primary';
  saveBtn.textContent = 'SAVE TEAM';
  saveBtn.addEventListener('click', () => saveTeam(team, {
    name: nameInput.value,
    tag: tagInput.value,
    seed: Number(seedInput.value),
    players: playerInputs.map((p) => ({
      name: p.pname.value,
      role: p.prole.value,
      isCaptain: p.cap.checked
    }))
  }));

  const spacer = document.createElement('div');
  spacer.className = 'spacer';
  spacer.style.marginLeft = 'auto';

  const deleteBtn = document.createElement('button');
  deleteBtn.type = 'button';
  deleteBtn.className = 'tlink danger';
  deleteBtn.textContent = 'DELETE FROM REGISTRY';
  deleteBtn.title = 'Remove the team everywhere, including other tournaments';
  deleteBtn.addEventListener('click', () => deleteTeam(team));

  saveRow.append(saveBtn, spacer, deleteBtn);

  editor.append(nameRow, playersWrap, logoRow, saveRow);
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

// TEAM ACTIONS -------------------------------------------------------

// ผลลัพธ์จาก endpoint ของ roster ส่ง tournament กับ teams กลับมาพร้อมกัน
// จะได้ไม่ต้องยิงซ้ำเพื่ออัปเดตตัวเลข x / y teams
function applyRoster(data) {
  if (data.tournament) {
    current = data.tournament;
    renderHead(current);
    renderFormatHint();
  }
  renderTeams(current, data.teams || []);
}

async function refreshRegistry() {
  try {
    registry = (await fetchJson('/api/teams')).teams || [];
  } catch (error) {
    showToast(error.message || 'Could not load the team registry', 'red');
    registry = [];
  }
  renderPicker();
}

// เอาเฉพาะทีมที่ยังไม่ได้อยู่ในทัวร์นาเมนต์นี้
function renderPicker() {
  const picker = document.getElementById('pickTeam');
  const inRoster = new Set(roster.map((t) => t.id));
  const available = registry.filter((t) => !inRoster.has(t.id));

  picker.textContent = '';
  if (available.length === 0) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = registry.length === 0
      ? 'No teams in the registry yet'
      : 'Every registered team is already in';
    picker.appendChild(opt);
    picker.disabled = true;
    document.getElementById('addExistingBtn').disabled = true;
    return;
  }

  picker.disabled = false;
  document.getElementById('addExistingBtn').disabled = false;
  available.forEach((team) => {
    const opt = document.createElement('option');
    opt.value = team.id;
    opt.textContent = team.tag ? `${team.name} (${team.tag})` : team.name;
    picker.appendChild(opt);
  });
}

async function addTeamToTournament(teamId) {
  const data = await fetchJson(`/api/tournaments/${encodeURIComponent(tournamentId)}/teams`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ teamId })
  });
  applyRoster(data);
  renderPicker();
}

async function addExisting() {
  const teamId = document.getElementById('pickTeam').value;
  if (!teamId) return;
  try {
    await addTeamToTournament(teamId);
    showToast('Team added', 'green');
  } catch (error) {
    showToast(error.message || 'Could not add the team', 'red');
  }
}

async function createAndAdd() {
  const nameInput = document.getElementById('newTeamName');
  const tagInput = document.getElementById('newTeamTag');
  const name = nameInput.value.trim();
  if (!name) {
    showToast('Team name is required', 'red');
    nameInput.focus();
    return;
  }

  try {
    const { team } = await fetchJson('/api/teams', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, tag: tagInput.value })
    });
    await refreshRegistry();
    await addTeamToTournament(team.id);
    nameInput.value = '';
    tagInput.value = '';
    nameInput.focus();
    showToast(`${team.name} added`, 'green');
  } catch (error) {
    // ทีมถูกสร้างในทะเบียนแล้วแต่ใส่เข้าทัวร์นาเมนต์ไม่ได้ (เช่นเต็ม)
    // ไม่ลบทีมทิ้ง เพราะผู้ใช้ตั้งใจสร้างมันจริงๆ แค่ยังใส่ไม่ได้
    await refreshRegistry();
    showToast(error.message || 'Could not create the team', 'red');
  }
}

async function removeFromTournament(team) {
  if (!window.confirm(`Take "${team.name}" out of this tournament?\n\nThe team stays in the registry.`)) return;
  try {
    const data = await fetchJson(
      `/api/tournaments/${encodeURIComponent(tournamentId)}/teams/${encodeURIComponent(team.id)}`,
      { method: 'DELETE' }
    );
    applyRoster(data);
    renderPicker();
    showToast('Removed from tournament', 'blue');
  } catch (error) {
    showToast(error.message || 'Could not remove the team', 'red');
  }
}

async function saveTeam(team, values) {
  try {
    await fetchJson(`/api/teams/${encodeURIComponent(team.id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: values.name, tag: values.tag, players: values.players })
    });
    if (values.seed !== team.seed) {
      await fetchJson(
        `/api/tournaments/${encodeURIComponent(tournamentId)}/teams/${encodeURIComponent(team.id)}/seed`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ seed: values.seed })
        }
      );
    }
    await reloadTeams();
    await refreshRegistry();
    showToast('Team saved', 'green');
  } catch (error) {
    showToast(error.message || 'Could not save the team', 'red');
  }
}

async function deleteTeam(team) {
  if (!window.confirm(
    `Delete "${team.name}" from the registry?\n\n` +
    'It is removed from every tournament it entered, not just this one.'
  )) return;

  try {
    await fetchJson(`/api/teams/${encodeURIComponent(team.id)}`, { method: 'DELETE' });
    await reloadTeams();
    await refreshRegistry();
    showToast('Team deleted', 'blue');
  } catch (error) {
    showToast(error.message || 'Could not delete the team', 'red');
  }
}

// อัปโหลดไฟล์ดิบ ไม่ใช้ multipart ให้ตรงกับที่ฝั่งเซิร์ฟเวอร์รับ
async function uploadLogo(team, file) {
  if (file.size > 4 * 1024 * 1024) {
    showToast('Logo must be 4 MB or smaller', 'red');
    return;
  }
  try {
    const response = await fetch(withToken(`/api/teams/${encodeURIComponent(team.id)}/logo`), {
      method: 'POST',
      headers: {
        'Content-Type': file.type,
        ...(controlToken ? { Authorization: `Bearer ${controlToken}` } : {})
      },
      body: file
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || response.statusText);
    await reloadTeams();
    await refreshRegistry();
    showToast('Logo uploaded', 'green');
  } catch (error) {
    showToast(error.message || 'Upload failed', 'red');
  }
}

async function clearLogo(team) {
  try {
    await fetchJson(`/api/teams/${encodeURIComponent(team.id)}/logo`, { method: 'DELETE' });
    await reloadTeams();
    await refreshRegistry();
    showToast('Logo cleared', 'blue');
  } catch (error) {
    showToast(error.message || 'Could not clear the logo', 'red');
  }
}

// MATCHES ------------------------------------------------------------

function teamName(id) {
  if (!id) return null;
  return roster.find((t) => t.id === id)?.name || registry.find((t) => t.id === id)?.name || 'Unknown team';
}

function side(match, which) {
  const id = which === 'a' ? match.teamAId : match.teamBId;
  const el = document.createElement('div');
  el.className = `match-side${which === 'b' ? ' right' : ''}`;
  const name = teamName(id);
  if (!name) {
    el.classList.add('tbd');
    el.textContent = match.isBye ? 'bye' : 'to be decided';
  } else {
    el.textContent = name;
    if (match.winnerId === id) el.classList.add('winner');
  }
  return el;
}

function matchRow(match) {
  const row = document.createElement('div');
  row.className = `match ${match.status}${match.isBye ? ' bye' : ''}`;

  const score = document.createElement('div');
  score.className = 'match-score';

  const bothKnown = Boolean(match.teamAId && match.teamBId) && !match.isBye;
  const a = document.createElement('input');
  const b = document.createElement('input');
  [a, b].forEach((input) => {
    input.type = 'number';
    input.min = '0';
    input.max = String(Math.floor(match.bestOf / 2) + 1);
    input.disabled = !bothKnown;
  });
  a.value = String(match.scoreA);
  b.value = String(match.scoreB);

  const commit = () => recordResult(match, Number(a.value), Number(b.value));
  a.addEventListener('change', commit);
  b.addEventListener('change', commit);

  const dash = document.createElement('span');
  dash.className = 'dash';
  dash.textContent = '-';
  score.append(a, dash, b);

  row.append(side(match, 'a'), score, side(match, 'b'));
  return row;
}

function renderMatches(list) {
  const badges = document.getElementById('matchBadges');
  badges.textContent = '';
  const played = list.filter((m) => m.status === 'complete' && !m.isBye).length;
  const total = list.filter((m) => !m.isBye).length;
  if (total > 0) badges.appendChild(badge(`${played} / ${total} played`, played === total ? 'active' : 'count'));

  document.getElementById('clearMatchesBtn').hidden = list.length === 0;

  const body = document.getElementById('matchesBody');
  body.textContent = '';

  if (list.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = current && current.teamCount < 2
      ? 'Add at least two teams, then draw the matches.'
      : 'No matches drawn yet. Use DRAW MATCHES to build the schedule.';
    body.appendChild(empty);
    return;
  }

  // จัดกลุ่มตามสายและรอบ ตามลำดับที่เซิร์ฟเวอร์ส่งมา
  let currentHead = '';
  list.forEach((match) => {
    const head = match.bracket === 'main' ? `Round ${match.round}` : `Group ${match.bracket} - round ${match.round}`;
    if (head !== currentHead) {
      currentHead = head;
      const title = document.createElement('div');
      title.className = 'round-head';
      title.textContent = head;
      body.appendChild(title);
    }
    body.appendChild(matchRow(match));
  });
}

async function loadMatches() {
  try {
    const data = await fetchJson(`/api/tournaments/${encodeURIComponent(tournamentId)}/matches`);
    renderMatches(data.matches || []);
  } catch (error) {
    showToast(error.message || 'Could not load matches', 'red');
  }
}

async function drawMatches() {
  const randomise = document.getElementById('randomiseDraw').checked;
  const existing = document.getElementById('matchesBody').querySelector('.match');
  if (existing && !window.confirm('Draw again?\n\nThe current schedule and every score recorded on it are replaced.')) {
    return;
  }

  try {
    const data = await fetchJson(`/api/tournaments/${encodeURIComponent(tournamentId)}/matches`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ randomise })
    });
    renderMatches(data.matches || []);
    showToast(randomise ? 'Matches drawn at random' : 'Matches drawn by seed', 'green');
  } catch (error) {
    showToast(error.message || 'Could not draw matches', 'red');
  }
}

async function clearMatches() {
  if (!window.confirm('Clear the schedule?\n\nEvery match and score is removed.')) return;
  try {
    await fetchJson(`/api/tournaments/${encodeURIComponent(tournamentId)}/matches`, { method: 'DELETE' });
    renderMatches([]);
    showToast('Schedule cleared', 'blue');
  } catch (error) {
    showToast(error.message || 'Could not clear the schedule', 'red');
  }
}

async function recordResult(match, scoreA, scoreB) {
  try {
    const data = await fetchJson(`/api/matches/${encodeURIComponent(match.id)}/result`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scoreA, scoreB })
    });
    renderMatches(data.matches || []);
  } catch (error) {
    showToast(error.message || 'Could not record the result', 'red');
    loadMatches();
  }
}

async function reloadTeams() {
  const data = await fetchJson(`/api/tournaments/${encodeURIComponent(tournamentId)}`);
  current = data.tournament;
  renderHead(current);
  renderTeams(current, data.teams || []);
}

async function load() {
  const data = await fetchJson(`/api/tournaments/${encodeURIComponent(tournamentId)}`);
  current = data.tournament;
  renderHead(current);
  renderForm(current);
  renderTeams(current, data.teams || []);
  renderSources();
  await refreshRegistry();
  await loadMatches();

  ['detailSection', 'teamsSection', 'matchesSection', 'obsSection'].forEach((id) => {
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

document.getElementById('addTeamBtn').addEventListener('click', () => {
  const panel = document.getElementById('addPanel');
  panel.hidden = !panel.hidden;
  if (!panel.hidden) {
    renderPicker();
    document.getElementById('newTeamName').focus();
  }
});
document.getElementById('closeAddBtn').addEventListener('click', () => {
  document.getElementById('addPanel').hidden = true;
});
document.getElementById('drawBtn').addEventListener('click', drawMatches);
document.getElementById('clearMatchesBtn').addEventListener('click', clearMatches);
document.getElementById('addExistingBtn').addEventListener('click', addExisting);
document.getElementById('createTeamBtn').addEventListener('click', createAndAdd);
document.getElementById('newTeamName').addEventListener('keydown', (event) => {
  if (event.key === 'Enter') createAndAdd();
});

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
