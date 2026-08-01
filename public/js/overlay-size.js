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

    applySize(locked || '1080');
    if (locked) return; // หน้าที่ล็อกไว้ ไม่ต้องฟัง state

    // socket ถูกสร้างไว้แล้วในไฟล์หลักของแต่ละหน้า
    if (typeof socket !== 'undefined') {
        socket.on('stateUpdate', (state) => applySize(state && state.overlaySize));
    }
})();
