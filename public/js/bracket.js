// หน้าสายการแข่งแบบเห็นภาพ
//
// อ่าน id จาก /tournament/:id/bracket
// จัดกลุ่มคู่ตาม bracket แล้วตามรอบ แล้วปล่อยให้ CSS จัดตำแหน่งเอง
// (ทุกรอบสูงเท่ากัน + flex:1 ต่อช่อง = คู่รอบถัดไปไปอยู่กึ่งกลางของสองคู่ที่ป้อนเข้ามา)
//
// ตอนนี้ยังไม่มีสายแพ้ เพราะยังไม่ได้ทำระบบแพ้สองครั้งคัดออก
// แต่ตัวเรนเดอร์แยกตามค่า bracket อยู่แล้ว วันที่ทำเสร็จสายแพ้จะโผล่มาเอง
// เป็นอีกหัวข้อหนึ่งใต้สายชนะ โดยไม่ต้องแก้ไฟล์นี้

const { controlToken, socket, fetchJson, withToken, showToast } = window.RovClient;

const parts = window.location.pathname.split('/').filter(Boolean);
const tournamentId = decodeURIComponent(parts[1] || '');

let tournament = null;
let roster = [];
let liveMatchId = null;

// สูงต่อหนึ่งช่องของรอบแรก ใช้คำนวณความสูงรวมของสาย
//
// ต้องมากกว่าความสูงของกล่อง (สองแถว ราว 54px) พอสมควร
// ส่วนต่างคือช่องว่างระหว่างคู่ ถ้าตั้งเท่ากับความสูงกล่อง กล่องจะชนกันหมด
// จนดูเป็นรายการก้อนเดียว ไม่ใช่สายการแข่ง
const SLOT_HEIGHT = 78;

function badge(text, cls = '') {
  const el = document.createElement('span');
  el.className = `badge ${cls}`.trim();
  el.textContent = text;
  return el;
}

function teamOf(id) {
  return roster.find((t) => t.id === id) || null;
}

// ROW ----------------------------------------------------------------

function teamRow(match, which) {
  const id = which === 'a' ? match.teamAId : match.teamBId;
  const team = teamOf(id);

  const row = document.createElement('div');
  row.className = 'mrow';

  const seed = document.createElement('span');
  seed.className = 'seed';
  seed.textContent = team ? String(team.seed || '') : '';

  const name = document.createElement('span');
  name.className = 'nm';
  if (team) {
    name.textContent = team.name;
  } else {
    name.classList.add('tbd');
    // บายไม่มีคู่ต่อสู้ ส่วนรอบหลังคือยังไม่รู้ว่าใครชนะมา
    name.textContent = match.isBye ? 'bye' : 'to be decided';
  }

  const score = document.createElement('span');
  score.className = 'sc';
  score.textContent = String(which === 'a' ? match.scoreA : match.scoreB);

  if (match.winnerId) row.classList.add(match.winnerId === id ? 'won' : 'lost');

  row.append(seed, name, score);
  return row;
}

function matchBox(match, number) {
  const box = document.createElement('div');
  box.className = `mbox ${match.status}`;
  if (match.isBye) box.classList.add('bye');
  if (liveMatchId === match.id) box.classList.add('live');

  const playable = Boolean(match.teamAId && match.teamBId) && !match.isBye;
  if (playable) {
    box.classList.add('playable');
    box.title = 'Put this match on air and open the Control Panel';
    box.addEventListener('click', () => openInControl(match));
  }

  box.append(teamRow(match, 'a'), teamRow(match, 'b'));

  if (number !== null) {
    const no = document.createElement('div');
    no.className = 'mno';
    no.textContent = String(number);
    box.appendChild(no);
  }
  return box;
}

// LAYOUT --------------------------------------------------------------

function roundColumn(title, matches, numbers, elimination) {
  const round = document.createElement('div');
  round.className = 'round';

  const head = document.createElement('div');
  head.className = 'round-title';
  head.textContent = title;
  round.appendChild(head);

  const body = document.createElement('div');
  body.className = 'round-body';

  matches.forEach((match, index) => {
    const slot = document.createElement('div');
    slot.className = 'slot';
    // คู่บน/คู่ล่างของแต่ละคู่ที่จะไหลไปรวมกันในรอบถัดไป
    if (elimination) slot.classList.add(index % 2 === 0 ? 'pair-top' : 'pair-bottom');
    slot.appendChild(matchBox(match, numbers.get(match.id) ?? null));
    body.appendChild(slot);
  });

  round.appendChild(body);
  return round;
}

// ชื่อรอบท้ายๆ เรียกตามที่คนเรียกกันจริง ไม่ใช่ "รอบที่ 5"
function roundTitle(roundNo, totalRounds, bracketName) {
  if (bracketName !== 'main') return `Round ${roundNo}`;
  const fromEnd = totalRounds - roundNo;
  if (fromEnd === 0) return 'Final';
  if (fromEnd === 1) return 'Semifinals';
  if (fromEnd === 2) return 'Quarterfinals';
  return `Round ${roundNo}`;
}

function render(matches) {
  const body = document.getElementById('bracketBody');
  body.textContent = '';

  if (matches.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'bracket-empty';
    empty.textContent = 'No matches drawn yet. Go back to the tournament and use DRAW MATCHES.';
    body.appendChild(empty);
    return;
  }

  const elimination = tournament?.format === 'single_elim' || tournament?.format === 'double_elim';

  // เลขคู่ไล่ตามลำดับที่แข่งจริง ไว้อ้างอิงเวลาคุยกัน
  const numbers = new Map();
  matches.forEach((m, i) => numbers.set(m.id, i + 1));

  // จัดกลุ่มตามสายก่อน (main / A / B / losers ในอนาคต)
  const brackets = new Map();
  matches.forEach((m) => {
    if (!brackets.has(m.bracket)) brackets.set(m.bracket, []);
    brackets.get(m.bracket).push(m);
  });

  brackets.forEach((list, name) => {
    const section = document.createElement('div');
    section.className = 'bracket-section';

    if (brackets.size > 1 || name !== 'main') {
      const title = document.createElement('div');
      title.className = 'bracket-section-title';
      title.textContent = name === 'main' ? 'Main bracket' : `Group ${name}`;
      section.appendChild(title);
    }

    const rounds = new Map();
    list.forEach((m) => {
      if (!rounds.has(m.round)) rounds.set(m.round, []);
      rounds.get(m.round).push(m);
    });

    const wrap = document.createElement('div');
    wrap.className = `bracket${elimination ? '' : ' flat'}`;

    const roundNumbers = [...rounds.keys()].sort((a, b) => a - b);
    const total = roundNumbers.length;

    if (elimination) {
      // ความสูงรวมมาจากรอบแรก ทุกรอบสูงเท่ากันจึงเรียงตรงกันเอง
      const first = rounds.get(roundNumbers[0]) || [];
      wrap.style.height = `${Math.max(first.length, 1) * SLOT_HEIGHT + 40}px`;
    }

    roundNumbers.forEach((roundNo, index) => {
      const isLast = index === total - 1;
      wrap.appendChild(roundColumn(
        roundTitle(roundNo, total, name),
        (rounds.get(roundNo) || []).sort((a, b) => a.slot - b.slot),
        numbers,
        elimination && !isLast
      ));
    });

    section.appendChild(wrap);
    body.appendChild(section);
  });
}

// ACTIONS -------------------------------------------------------------

async function openInControl(match) {
  try {
    const data = await fetchJson(`/api/matches/${encodeURIComponent(match.id)}/live`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    showToast(`Game ${data.live?.gameNo ?? 1} is on air`, 'green');
    window.location.href = withToken('/control');
  } catch (error) {
    showToast(error.message || 'Could not put this match on air', 'red');
  }
}

async function load() {
  const [detail, matchData, liveData] = await Promise.all([
    fetchJson(`/api/tournaments/${encodeURIComponent(tournamentId)}`),
    fetchJson(`/api/tournaments/${encodeURIComponent(tournamentId)}/matches`),
    fetchJson('/api/live-match').catch(() => ({ live: {} }))
  ]);

  tournament = detail.tournament;
  roster = detail.teams || [];
  liveMatchId = liveData.live?.matchId || null;

  document.getElementById('headName').textContent = tournament.name;
  document.title = `${tournament.name} bracket - ROV Overlay Tool`;
  document.getElementById('backLink').href = withToken(`/tournament/${encodeURIComponent(tournamentId)}`);

  const badges = document.getElementById('headBadges');
  badges.textContent = '';
  badges.appendChild(badge(tournament.status === 'finished' ? 'Finished' : 'Active', tournament.status));
  badges.appendChild(badge(`Bo${tournament.bestOf}`));
  badges.appendChild(badge(`${tournament.teamCount} teams`, 'count'));

  render(matchData.matches || []);
}

socket.on('connect_error', (error) => showToast(error.message || 'Connection error', 'red'));

(async () => {
  if (!tournamentId) {
    document.getElementById('headName').textContent = 'Tournament not found';
    return;
  }
  try {
    await load();
  } catch (error) {
    document.getElementById('headName').textContent = 'Could not load this bracket';
    showToast(error.message || 'Could not load the bracket', 'red');
  }
})();
