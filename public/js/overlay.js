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
        } else {
            timerEl.textContent = state.timer || '';
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

function updateBans(team, bans) {
    bans.forEach((hero, index) => {
        const slot = document.querySelector(`.ban-slot[data-team="${team}"][data-index="${index}"]`);
        if (slot) {
            // ลบ img เก่า (ถ้ามี)
            const oldImg = slot.querySelector('.ban-icon');
            if (oldImg) {
                oldImg.remove();
            }
            
            if (hero) {
                slot.classList.add('filled');
                // สร้าง img element ใหม่
                const img = document.createElement('img');
                img.className = 'ban-icon';
                img.src = imageUrl('heroes-icons', hero);
                img.onerror = function() {
                    // ถ้าไม่มีไอคอน ลองใช้รูปเต็มแทน
                    this.src = imageUrl('heroes', hero);
                };
                slot.appendChild(img);
            } else {
                slot.classList.remove('filled');
            }
        }
    });
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
                    heroImage.style.backgroundImage = '';
                    heroImage.offsetHeight;
                    slot.dataset.hero = hero;
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
