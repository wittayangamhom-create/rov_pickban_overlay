const socket = io();

socket.on('connect', () => {
    console.log('Result overlay connected');
});

socket.on('stateUpdate', (state) => {
    updateResult(state);
});

function heroImageUrl(hero) {
    return 'images/heroes/' + encodeURIComponent(hero) + '.png';
}

function heroIconUrl(hero) {
    return 'images/heroes-icons/' + encodeURIComponent(hero) + '.png';
}

function logoUrl(logo) {
    if (!logo || typeof logo !== 'string') return '';
    return 'images/team-logos/' + encodeURIComponent(logo);
}

function updateResult(state) {
    // Blue team name + logo
    const blueNameEl = document.getElementById('blueNameResult');
    if (blueNameEl) blueNameEl.textContent = state.teamBlue.name;

    const blueLogoEl = document.getElementById('blueLogoResult');
    if (blueLogoEl && state.teamBlue.logo) {
        blueLogoEl.src = logoUrl(state.teamBlue.logo);
        blueLogoEl.style.display = '';
    }

    // Red team name + logo
    const redNameEl = document.getElementById('redNameResult');
    if (redNameEl) redNameEl.textContent = state.teamRed.name;

    const redLogoEl = document.getElementById('redLogoResult');
    if (redLogoEl && state.teamRed.logo) {
        redLogoEl.src = logoUrl(state.teamRed.logo);
        redLogoEl.style.display = '';
    }

    // Blue picks
    state.teamBlue.picks.forEach((hero, i) => {
        const card = document.getElementById(`bluePick${i}Result`);
        const artEl = document.getElementById(`blueHeroArt${i}`);
        if (!card || !artEl) return;
        if (hero) {
            card.classList.add('filled');
            artEl.style.display = '';
            if (card.dataset.hero !== hero) {
                artEl.removeAttribute('src');
                card.dataset.hero = hero;
            }
            artEl.src = heroImageUrl(hero);
            artEl.onerror = () => { artEl.style.display = 'none'; };
        } else {
            card.classList.remove('filled');
            card.dataset.hero = '';
            artEl.src = '';
            artEl.style.display = '';
        }
    });

    // Red picks
    state.teamRed.picks.forEach((hero, i) => {
        const card = document.getElementById(`redPick${i}Result`);
        const artEl = document.getElementById(`redHeroArt${i}`);
        if (!card || !artEl) return;
        if (hero) {
            card.classList.add('filled');
            artEl.style.display = '';
            if (card.dataset.hero !== hero) {
                artEl.removeAttribute('src');
                card.dataset.hero = hero;
            }
            artEl.src = heroImageUrl(hero);
            artEl.onerror = () => { artEl.style.display = 'none'; };
        } else {
            card.classList.remove('filled');
            card.dataset.hero = '';
            artEl.src = '';
            artEl.style.display = '';
        }
    });

    // Blue bans
    state.teamBlue.bans.forEach((hero, i) => {
        const slot = document.getElementById(`blueResultBan${i}`);
        if (!slot) return;
        slot.innerHTML = '';
        if (hero) {
            const img = document.createElement('img');
            img.src = heroIconUrl(hero);
            img.onerror = () => { img.src = heroImageUrl(hero); };
            slot.appendChild(img);
        }
    });

    // Red bans
    state.teamRed.bans.forEach((hero, i) => {
        const slot = document.getElementById(`redResultBan${i}`);
        if (!slot) return;
        slot.innerHTML = '';
        if (hero) {
            const img = document.createElement('img');
            img.src = heroIconUrl(hero);
            img.onerror = () => { img.src = heroImageUrl(hero); };
            slot.appendChild(img);
        }
    });

    // Player names
    state.teamBlue.players.forEach((player, i) => {
        const el = document.getElementById(`blueResultPlayer${i}`);
        if (el) el.textContent = player || `Player ${i + 1}`;
    });

    state.teamRed.players.forEach((player, i) => {
        const el = document.getElementById(`redResultPlayer${i}`);
        if (el) el.textContent = player || `Player ${i + 1}`;
    });
}

socket.on('disconnect', () => {
    console.log('Result overlay disconnected');
});
