// หน้าตั้งค่าภาพพื้นหลังที่ออกแบบเอง
//
// แยกจาก Control Panel เพราะเป็นงานที่ทำก่อนแข่ง ไม่ใช่ตอนคุมไฟท์
// ไฟล์นี้ยืนอยู่ได้ด้วยตัวเอง ไม่ต้องพึ่ง control.js

const params = new URLSearchParams(window.location.search);
const controlToken = params.get('token') || localStorage.getItem('rovControlToken') || '';
if (controlToken) localStorage.setItem('rovControlToken', controlToken);

const socket = io({ auth: { token: controlToken }, query: controlToken ? { token: controlToken } : {} });

// ขนาดจริงของแต่ละพื้นที่ วัดจาก layout ที่ใช้อยู่จริง
// ภาพถูกยืดเต็มพื้นที่ (background-size: 100% 100%) ไม่ได้ครอบตัด
// ถ้าอัตราส่วนไม่ตรง ภาพจะบิด จึงต้องบอกขนาดเป็น px ตรงๆ
//
// แยก 1080p กับ 1440p คนละไฟล์ ขนาดที่วาดจริงไม่เท่ากัน
// หน้า result ถึงจะ layout เหมือนกัน แต่ตอน 1440p ถูกขยาย 4/3
// ภาพ 1080p ที่เอาไปใช้กับ 1440p จึงถูกขยายตามแล้วเบลอ
//
// ถ้าแก้ layout ใน overlay.css / overlay-1440.css / result.css
// อย่าลืมแก้ตัวเลขตรงนี้ และใน public/images/skins/README.md ด้วย
const SKIN_SLOTS = [
  { key: 'overlayBottom1080', size: '1080', group: 'Overlay', part: 'Banner', w: 1920, h: 430, note: 'แถบเดียวรวม ban + pick + score' },
  { key: 'resultTop1080', size: '1080', group: 'Result', part: 'Top', w: 1920, h: 540, note: 'ครึ่งบน: ทีมน้ำเงิน' },
  { key: 'resultBottom1080', size: '1080', group: 'Result', part: 'Bottom', w: 1920, h: 540, note: 'ครึ่งล่าง: ทีมแดง' },

  { key: 'overlayBottom1440', size: '1440', group: 'Overlay', part: 'Banner', w: 2560, h: 573, note: 'แถบเดียวรวม ban + pick + score' },
  { key: 'resultTop1440', size: '1440', group: 'Result', part: 'Top', w: 2560, h: 720, note: 'ครึ่งบน: ทีมน้ำเงิน' },
  { key: 'resultBottom1440', size: '1440', group: 'Result', part: 'Bottom', w: 2560, h: 720, note: 'ครึ่งล่าง: ทีมแดง' }
];
const SKIN_FILES = {
  overlayTop1080: 'overlay-top-1080',
  overlayTop1440: 'overlay-top-1440',
  overlayBottom1080: 'overlay-bottom-1080',
  overlayBottom1440: 'overlay-bottom-1440',
  resultTop1080: 'result-top-1080',
  resultTop1440: 'result-top-1440',
  resultBottom1080: 'result-bottom-1080',
  resultBottom1440: 'result-bottom-1440'
};
const EXTS = ['png', 'jpg', 'webp'];

socket.on('connect', () => showToast('Connected', 'green'));
socket.on('disconnect', () => showToast('Disconnected', 'red'));
socket.on('controlError', (error) => showToast(error.message || 'Control blocked', 'red'));
socket.on('stateUpdate', (state) => renderSkin(state && state.skin));

function withToken(url) {
  if (!controlToken) return url;
  return `${url}${url.includes('?') ? '&' : '?'}token=${encodeURIComponent(controlToken)}`;
}

function buildDesignGrid() {
  const grid = document.getElementById('designGrid');
  if (!grid) return;
  grid.textContent = '';

  let lastSize = null;
  SKIN_SLOTS.forEach(({ key, size, group, part, note, w, h }) => {
    if (size !== lastSize) {
      lastSize = size;
      const banner = document.createElement('div');
      banner.className = 'dsize-banner';
      banner.innerHTML = `<span class="dsize-chip">${size}p</span>` +
        `<span>สำหรับ Browser Source ขนาด <b>${size === '1080' ? '1920 x 1080' : '2560 x 1440'}</b></span>`;
      grid.appendChild(banner);
    }

    const card = document.createElement('div');
    card.className = 'dslot';

    const title = document.createElement('div');
    title.className = 'dslot-title';
    title.innerHTML = `${group} <b>${part}</b>`;
    card.dataset.size = size;

    const noteEl = document.createElement('div');
    noteEl.className = 'dslot-note';
    noteEl.textContent = note;

    // ขนาดที่ต้องทำ บอกเป็น px ตรงๆ พร้อมอัตราส่วนและชื่อไฟล์
    const sizeBox = document.createElement('div');
    sizeBox.className = 'dslot-size';
    sizeBox.innerHTML =
      `<div class="dsize-row">` +
      `<span class="dsize-px"><b>W ${w}</b> &times; <b>H ${h}</b> px</span>` +
      `<span class="dsize-ratio">${(w / h).toFixed(2)} : 1</span>` +
      `</div>` +
      `<div class="dsize-file">${SKIN_FILES[key]}.png</div>`;

    const preview = document.createElement('div');
    preview.className = 'dslot-preview';
    preview.id = `skinPreview_${key}`;
    preview.textContent = 'ยังไม่มีภาพ';

    // input file ซ่อนไว้ ให้ปุ่มปกติเป็นตัวกด หน้าตาจะได้เข้าชุดกัน
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

    card.append(title, noteEl, sizeBox, preview, actions, file);
    grid.appendChild(card);
  });
}

async function uploadSkin(slot, file) {
  if (file.size > 8 * 1024 * 1024) {
    showToast('ไฟล์ใหญ่เกิน 8 MB', 'red');
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
    showToast('อัปโหลดแล้ว', 'green');
  } catch (error) {
    showToast(error.message || 'Upload failed', 'red');
  }
}

async function clearSkin(slot) {
  try {
    const response = await fetch(withToken(`/api/skin/${slot}`), {
      method: 'DELETE',
      headers: controlToken ? { Authorization: `Bearer ${controlToken}` } : {}
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || response.statusText);
    showToast('ลบภาพแล้ว', 'red');
  } catch (error) {
    showToast(error.message || 'Clear failed', 'red');
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

  SKIN_SLOTS.forEach(({ key, w, h }) => {
    const preview = document.getElementById(`skinPreview_${key}`);
    if (!preview) return;
    const version = skin.slots?.[key] || 0;

    if (!version) {
      preview.style.backgroundImage = '';
      preview.classList.remove('filled');
      preview.dataset.version = '';
      preview.textContent = 'ยังไม่มีภาพ';
      return;
    }
    if (preview.dataset.version === String(version)) return;
    preview.dataset.version = String(version);
    preview.textContent = '';
    preview.classList.add('filled');

    // นามสกุลไม่ได้เก็บไว้ใน state จึงลองทีละแบบจนกว่าจะโหลดได้
    EXTS.reduce((chain, ext) => chain.then((found) => {
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

buildDesignGrid();
fetch(withToken('/api/state'))
  .then((r) => r.json())
  .then((state) => renderSkin(state.skin))
  .catch(() => showToast('โหลดสถานะไม่สำเร็จ', 'red'));
