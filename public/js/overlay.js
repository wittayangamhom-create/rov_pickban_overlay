const socket = io();

// Connect to server
socket.on('connect', () => {
    console.log('Connected to server');
});

// Update overlay when state changes
socket.on('stateUpdate', (state) => {
    updateOverlay(state);
});

function imageUrl(folder, name) {
    if (!name || typeof name !== 'string') return '';
    return `images/${folder}/${encodeURIComponent(name)}.png`;
}

// "00:09" -> 9. รองรับกรณีส่งมาเป็นวินาทีล้วนด้วย
function timerToSeconds(timer) {
    if (!timer) return 0;
    const parts = String(timer).split(':');
    if (parts.length === 2) {
        const minutes = Number(parts[0]);
        const seconds = Number(parts[1]);
        return Number.isFinite(minutes) && Number.isFinite(seconds) ? minutes * 60 + seconds : 0;
    }
    const asNumber = Number(timer);
    return Number.isFinite(asNumber) ? asNumber : 0;
}

function updateOverlay(state) {
    // Update team names
    document.getElementById('blueTeamName').textContent = state.teamBlue.name;
    document.getElementById('redTeamName').textContent = state.teamRed.name;
    
    // Update center team names
    document.getElementById('blueCenterName').textContent = state.teamBlue.name;
    document.getElementById('redCenterName').textContent = state.teamRed.name;
    
    // Update scores
    document.getElementById('blueScore').textContent = state.teamBlue.score;
    document.getElementById('redScore').textContent = state.teamRed.score;
    
    // Update timer + draft label
    const timerEl = document.getElementById('timer');
    const draftLabelEl = document.getElementById('draftLabel');
    if (timerEl) {
        if (state.draftLabel === 'coming soon') {
            timerEl.textContent = '';
            timerEl.classList.remove('urgent');
        } else {
            timerEl.textContent = state.timer || '';
            const seconds = timerToSeconds(state.timer);
            timerEl.classList.toggle('urgent', seconds > 0 && seconds <= 10);
        }
    }
    if (draftLabelEl) {
        draftLabelEl.textContent = state.draftLabel || '';
    }
    
    // Update match info
    if (state.matchInfo) {
        document.getElementById('tournamentName').textContent = state.matchInfo.tournament || 'ROV Premier League';
        document.getElementById('matchTitle').textContent = state.matchInfo.title || '';
    }
    
    // Update player names
    state.teamBlue.players.forEach((player, index) => {
        const element = document.getElementById(`bluePlayer${index}`);
        if (element) {
            element.textContent = player || `Player ${index + 1}`;
        }
    });
    
    state.teamRed.players.forEach((player, index) => {
        const element = document.getElementById(`redPlayer${index}`);
        if (element) {
            element.textContent = player || `Player ${index + 1}`;
        }
    });
    
    // Update active slots highlight
    updateActiveSlots(state.draftActiveSlots || []);

    // Update bans
    updateBans('teamBlue', state.teamBlue.bans);
    updateBans('teamRed', state.teamRed.bans);
    
    // Update picks
    updatePicks('teamBlue', state.teamBlue.picks);
    updatePicks('teamRed', state.teamRed.picks);
}

function updateActiveSlots(activeSlots) {
    // clear all active classes
    document.querySelectorAll('.ban-slot.active, .pick-slot.active').forEach(el => {
        el.classList.remove('active');
    });

    if (!activeSlots || activeSlots.length === 0) return;

    // slotId format: blueBan0, redPick2, etc.
    activeSlots.forEach(slotId => {
        const m = slotId.match(/^(blue|red)(Pick|Ban)(\d)$/);
        if (!m) return;
        const teamAttr = m[1] === 'blue' ? 'teamBlue' : 'teamRed';
        const type = m[2];   // 'Pick' or 'Ban'
        const idx = m[3];    // '0','1',...

        if (type === 'Ban') {
            const slot = document.querySelector(`.ban-slot[data-team="${teamAttr}"][data-index="${idx}"]`);
            if (slot) slot.classList.add('active');
        } else {
            const slot = document.querySelector(`.pick-slot[data-team="${teamAttr}"][data-index="${idx}"]`);
            if (slot) slot.classList.add('active');
        }
    });
}

// เล่นอนิเมชันครั้งเดียวตอนที่ค่าเปลี่ยนจริงๆ
//
// ห้ามพึ่ง animationend อย่างเดียว OBS จะหยุด browser source ตอนที่ scene
// ไม่ได้ออกอากาศ ทำให้อนิเมชันค้างและ animationend ไม่ยิงเลย
// ถ้าไม่มีตัวสำรอง class จะค้างอยู่ถาวรและไปเล่นผิดจังหวะตอน scene กลับมา
const ANIM_CLEANUP_MS = 1200;

function playOnce(element, className) {
    clearTimeout(element._animTimer);
    element.classList.remove(className);
    void element.offsetWidth; // บังคับ reflow เพื่อให้เริ่มอนิเมชันใหม่ได้
    element.classList.add(className);

    const clear = () => {
        clearTimeout(element._animTimer);
        element.classList.remove(className);
    };

    element.addEventListener('animationend', clear, { once: true });
    element._animTimer = setTimeout(clear, ANIM_CLEANUP_MS);
}

function updateBans(team, bans) {
    bans.forEach((hero, index) => {
        const slot = document.querySelector(`.ban-slot[data-team="${team}"][data-index="${index}"]`);
        if (!slot) return;

        // state ถูกส่งมาทุกวินาทีตอนจับเวลา ถ้าสร้าง img ใหม่ทุกครั้ง
        // รูปจะถูกโหลดใหม่ตลอดและอนิเมชันจะเล่นซ้ำไม่หยุด
        // จึงแตะ DOM เฉพาะตอนฮีโร่เปลี่ยนจริงเท่านั้น
        if (slot.dataset.hero === (hero || '')) return;
        slot.dataset.hero = hero || '';

        const oldImg = slot.querySelector('.ban-icon');
        if (oldImg) oldImg.remove();

        if (!hero) {
            slot.classList.remove('filled');
            return;
        }

        slot.classList.add('filled');
        const img = document.createElement('img');
        img.className = 'ban-icon';
        img.src = imageUrl('heroes-icons', hero);
        img.onerror = function () {
            // ถ้าไม่มีไอคอน ใช้รูปเต็มแทน
            this.src = imageUrl('heroes', hero);
        };
        slot.appendChild(img);
        playOnce(slot, 'just-banned');
    });
}

// โหลดรูปให้เสร็จก่อน แล้วค่อยแสดงพร้อมอนิเมชันในเฟรมเดียวกัน
function showHeroArtWhenReady(slot, heroImage, hero, cssUrl) {
    // onload และ decode() อาจยิงทั้งคู่ ถ้าปล่อยให้เรียกซ้ำ
    // อนิเมชันจะถูกรีสตาร์ทกลางทางและดูสะดุด
    let revealed = false;
    const reveal = () => {
        if (revealed) return;
        revealed = true;
        // ถ้าระหว่างรอ มีการเปลี่ยนฮีโร่อีก ให้ทิ้งผลลัพธ์เก่าไป
        if (slot.dataset.hero !== hero) return;
        heroImage.style.backgroundImage = cssUrl;
        playOnce(slot, 'just-picked');
    };

    const preload = new Image();
    preload.onload = () => {
        // decode() ให้ภาพพร้อมวาดจริงก่อนเฟรมแรกของอนิเมชัน
        if (preload.decode) preload.decode().then(reveal).catch(reveal);
        else reveal();
    };
    preload.onerror = reveal; // รูปหายก็ยังต้องเดินต่อ
    preload.src = imageUrl('heroes', hero);
}

function updatePicks(team, picks) {
    picks.forEach((hero, index) => {
        const slot = document.querySelector(`.pick-slot[data-team="${team}"][data-index="${index}"]`);
        if (slot) {
            const heroImage = slot.querySelector('.hero-image');
            if (hero) {
                slot.classList.add('filled');
                const nextImage = `url("${imageUrl('heroes', hero)}")`;
                if (slot.dataset.hero !== hero) {
                    slot.dataset.hero = hero;
                    // รอให้รูปโหลดเสร็จก่อนค่อยเริ่มอนิเมชัน
                    // ไม่งั้นกล่องเปล่าจะขยับก่อน แล้วรูปเด้งขึ้นมากลางทาง
                    // ทำให้ดูสะดุด ถ้ารูปอยู่ใน cache แล้วจะเริ่มทันที
                    showHeroArtWhenReady(slot, heroImage, hero, nextImage);
                    return;
                }
                heroImage.style.backgroundImage = nextImage;
            } else {
                slot.classList.remove('filled');
                slot.dataset.hero = '';
                heroImage.style.backgroundImage = '';
            }
        }
    });
}

// Handle disconnection
socket.on('disconnect', () => {
    console.log('Disconnected from server');
});
