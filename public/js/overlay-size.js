// ขนาดหน้าจอ overlay เลือกครั้งเดียวจาก Control Panel แล้วทุกหน้าตามทันที
//
// หน้าไหนที่ถูกล็อกขนาดไว้แล้ว (เช่น /overlay-1440 ที่ยังมีคนใส่ไว้ใน OBS)
// ให้ใส่ data-lock-size ไว้ที่ <body> หน้านั้นจะไม่เปลี่ยนตาม
(function () {
    const body = document.body;
    const locked = body.dataset.lockSize;

    // ลิงก์ CSS ของ 1440 จะถูกเปิด/ปิดตามขนาดที่เลือก
    const sheet1440 = document.getElementById('size1440');

    function applySize(size) {
        const next = size === '1440' ? '1440' : '1080';
        const wantDisabled = next !== '1440';

        // แต่ละอย่างเช็คแยกกัน ไม่ใช้ตัวเดียวคุมทั้งคู่
        // ถ้าเช็คแค่ dataset แล้วรีเทิร์นทิ้ง เวลาที่ dataset กับ stylesheet
        // ไม่ตรงกัน (เช่นถูกสลับจากที่อื่น) จะกลับมาตรงกันไม่ได้เลย
        if (body.dataset.size !== next) body.dataset.size = next;
        if (sheet1440 && sheet1440.disabled !== wantDisabled) sheet1440.disabled = wantDisabled;
    }

    window.applyOverlaySize = applySize;

    // --- ภาพพื้นหลังที่ผู้ใช้ออกแบบเอง ------------------------------
    // แต่ละหน้าบอกไว้ที่ <body data-skin-slots> ว่าใช้ slot ไหนกับ element ไหน
    // เช่น "overlayTop:.ban-section, overlayBottom:.pick-section"
    const SKIN_FILES = {
        overlayTop: 'overlay-top',
        overlayBottom: 'overlay-bottom',
        resultTop: 'result-top',
        resultBottom: 'result-bottom'
    };
    const skinTargets = (body.dataset.skinSlots || '').split(',')
        .map((pair) => pair.split(':').map((s) => s.trim()))
        .filter(([slot, sel]) => slot && sel && SKIN_FILES[slot]);

    // นามสกุลไฟล์ไม่ได้เก็บไว้ใน state จึงลองทีละแบบจนกว่าจะโหลดได้
    const EXTS = ['png', 'jpg', 'webp'];
    const resolved = {};

    function findSkinUrl(slot, version) {
        const cacheKey = slot + ':' + version;
        if (resolved[cacheKey]) return Promise.resolve(resolved[cacheKey]);

        return EXTS.reduce((chain, ext) => chain.then((found) => {
            if (found) return found;
            const url = `images/skins/${SKIN_FILES[slot]}.${ext}?v=${version}`;
            return new Promise((res) => {
                const img = new Image();
                img.onload = () => res(url);
                img.onerror = () => res(null);
                img.src = url;
            });
        }), Promise.resolve(null)).then((url) => {
            if (url) resolved[cacheKey] = url;
            return url;
        });
    }

    function applySkin(skin) {
        const on = Boolean(skin && skin.enabled);
        body.classList.toggle('skin-on', on);
        body.classList.toggle('panels-off', Boolean(skin) && skin.showPanels === false);

        skinTargets.forEach(([slot, selector]) => {
            const el = document.querySelector(selector);
            if (!el) return;
            const version = (skin && skin.slots && skin.slots[slot]) || 0;

            if (!on || !version) {
                el.style.backgroundImage = '';
                el.classList.remove('has-skin');
                return;
            }
            findSkinUrl(slot, version).then((url) => {
                if (!url) return;
                el.style.backgroundImage = `url("${url}")`;
                el.classList.add('has-skin');
            });
        });
    }

    applySize(locked || '1080');
    if (locked) {
        // หน้าที่ล็อกขนาดไว้ ยังต้องรับภาพพื้นหลังตามปกติ
        if (typeof socket !== 'undefined') socket.on('stateUpdate', (s) => applySkin(s && s.skin));
        return;
    }

    // socket ถูกสร้างไว้แล้วในไฟล์หลักของแต่ละหน้า
    if (typeof socket !== 'undefined') {
        socket.on('stateUpdate', (state) => {
            applySize(state && state.overlaySize);
            applySkin(state && state.skin);
        });
    }
})();
