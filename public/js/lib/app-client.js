// ของที่ทุกหน้าฝั่งควบคุมต้องใช้เหมือนกันหมด: โทเคน, socket, fetch, toast
//
// เดิมโค้ดก้อนนี้ถูกคัดลอกไว้ใน home.js / control.js / presets.js /
// design.js / hotkeys.js ไฟล์ละชุด แก้ทีต้องไล่แก้ห้าที่
//
// วิธีใช้ในหน้าใหม่ (เช่น หน้าทัวร์นาเมนต์ / รายชื่อทีม / สถิติ):
//   <script src="/socket.io/socket.io.js"></script>
//   <script src="js/lib/app-client.js"></script>
//   <script src="js/หน้าใหม่.js"></script>
// แล้วในไฟล์ js ขึ้นต้นด้วย
//   const { socket, fetchJson, showToast } = window.RovClient;
//
// หมายเหตุ: หน้า overlay กับ result ไม่ใช้ไฟล์นี้ เพราะเป็นหน้าดูอย่างเดียว
// ต่อ socket เปล่าๆ ไม่ต้องมีโทเคน และไม่มีกล่อง toast ให้แสดง

(function (global) {
  const params = new URLSearchParams(window.location.search);
  const controlToken = params.get('token') || localStorage.getItem('rovControlToken') || '';
  if (controlToken) localStorage.setItem('rovControlToken', controlToken);

  const socket = global.io
    ? global.io({ auth: { token: controlToken }, query: controlToken ? { token: controlToken } : {} })
    : null;

  // แนบโทเคนไปกับ URL ไว้ให้ลิงก์ที่เปิดหน้าต่างใหม่ยังคุมได้
  function withToken(url) {
    if (!controlToken) return url;
    return `${url}${url.includes('?') ? '&' : '?'}token=${encodeURIComponent(controlToken)}`;
  }

  // URL เต็มรวมโดเมน ไว้ก๊อปไปวางใน OBS
  function absoluteUrl(path) {
    const url = new URL(path, window.location.origin);
    if (controlToken) url.searchParams.set('token', controlToken);
    return url.toString();
  }

  async function fetchJson(url, options = {}) {
    const headers = { ...(options.headers || {}) };
    if (controlToken) headers.Authorization = `Bearer ${controlToken}`;
    const response = await fetch(withToken(url), { ...options, headers });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || response.statusText);
    return data;
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

  global.RovClient = { controlToken, socket, withToken, absoluteUrl, fetchJson, showToast };
})(window);
