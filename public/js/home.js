// หน้าแรกของแอพ
//
// เป็นทางแยกไปแต่ละเครื่องมือ ไม่ใช่หน้าคุมอะไรเอง คุมจริงอยู่ที่ /control
// แสดงสถานะสดไว้ด้วย จะได้รู้ตั้งแต่หน้านี้ว่าตอนนี้ออกอากาศอะไรอยู่
//
// เวลาจะเพิ่มโหมดจัดการทัวร์นาเมนต์ ให้เพิ่ม section ใหม่ใน home.html
// แล้วเพิ่ม route กับหน้าเว็บของมัน ไม่ต้องแก้ไฟล์นี้

const { socket, withToken, absoluteUrl, showToast } = window.RovClient;

// ขนาดหน้าจอเลือกที่ control panel หน้านี้แค่บอกว่า URL ไหนคู่กับขนาดไหน
const SOURCES = [
  { name: 'Overlay 1080p', path: '/overlay', size: '1920 x 1080' },
  { name: 'Overlay 1440p', path: '/overlay-1440', size: '2560 x 1440' },
  { name: 'Result', path: '/result', size: 'matches overlay size' }
];

function setStatus(online, label) {
  const box = document.getElementById('status');
  box.classList.toggle('online', online === true);
  box.classList.toggle('offline', online === false);
  document.getElementById('statusLabel').textContent = label;
}

socket.on('connect', () => setStatus(true, 'Live'));
socket.on('disconnect', () => setStatus(false, 'Server offline'));
socket.on('connect_error', () => setStatus(false, 'No connection'));

socket.on('stateUpdate', (state) => {
  renderMatch(state);
  renderTags(state);
});

// ประกอบด้วย textContent ทั้งหมด ชื่อทีมมาจากผู้ใช้
function renderMatch(state) {
  const wrap = document.getElementById('statusMatch');
  wrap.textContent = '';

  const blue = document.createElement('span');
  blue.className = 'sm-blue';
  blue.textContent = state.teamBlue?.name || 'BLUE';

  const score = document.createElement('span');
  score.className = 'sm-score';
  score.textContent = `${state.teamBlue?.score ?? 0} - ${state.teamRed?.score ?? 0}`;

  const red = document.createElement('span');
  red.className = 'sm-red';
  red.textContent = state.teamRed?.name || 'RED';

  wrap.append(blue, score, red);
}

function renderTags(state) {
  const wrap = document.getElementById('statusTags');
  wrap.textContent = '';

  const tag = (text, cls = '') => {
    const el = document.createElement('span');
    el.className = `stag ${cls}`.trim();
    el.textContent = text;
    return el;
  };

  const onAir = state.overlayVisible !== false;
  wrap.appendChild(tag(onAir ? 'Banner on air' : 'Banner hidden', onAir ? 'on' : 'off'));
  wrap.appendChild(tag(`${state.overlaySize || '1080'}p`));
  if (state.draftLabel && state.draftLabel !== 'coming soon') {
    wrap.appendChild(tag(state.draftLabel));
  }
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

function renderFoot() {
  document.getElementById('foot').textContent =
    'Add the overlay and result URLs as Browser sources in OBS. ' +
    'Set the source size to match the overlay size chosen in the Control Panel, ' +
    'and tick "Shutdown source when not visible" off so the draft keeps running.';
}

renderSources();
renderFoot();
setStatus(null, 'Connecting');
