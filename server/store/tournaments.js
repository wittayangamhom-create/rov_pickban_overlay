// ทัวร์นาเมนต์และรายชื่อทีมที่ลงแข่ง อ่าน/เขียนฐานข้อมูล
//
// เพดาน 128 ทีมถูกบังคับที่นี่ ไม่ใช่ที่หน้าเว็บ
// หน้าเว็บควรกันไว้ด้วยเพื่อ UX ที่ดี แต่ห้ามเชื่อว่าหน้าเว็บกันแล้วพอ

const { newId } = require('../domain/ids');
const {
  sanitizeTournamentInput,
  sanitizeStatus,
  canAddTeams,
  canUseFormat,
  maxTeamsFor
} = require('../domain/tournament');
const { sanitizeSeed } = require('../domain/team');

function rowToTournament(row, teamCount) {
  return {
    id: row.id,
    name: row.name,
    status: row.status,
    format: row.format,
    bestOf: row.best_of,
    note: row.note,
    teamCount,
    maxTeams: maxTeamsFor(row.format),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function createTournamentStore(db, teamStore) {
  const q = {
    insert: db.prepare(
      'INSERT INTO tournaments (id, name, status, format, best_of, note, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ),
    update: db.prepare(
      'UPDATE tournaments SET name = ?, status = ?, format = ?, best_of = ?, note = ?, updated_at = ? WHERE id = ?'
    ),
    setStatus: db.prepare('UPDATE tournaments SET status = ?, updated_at = ? WHERE id = ?'),
    remove: db.prepare('DELETE FROM tournaments WHERE id = ?'),
    byId: db.prepare('SELECT * FROM tournaments WHERE id = ?'),
    all: db.prepare('SELECT * FROM tournaments ORDER BY created_at DESC'),

    addTeam: db.prepare(
      'INSERT INTO tournament_teams (tournament_id, team_id, seed, added_at) VALUES (?, ?, ?, ?)'
    ),
    removeTeam: db.prepare('DELETE FROM tournament_teams WHERE tournament_id = ? AND team_id = ?'),
    hasTeam: db.prepare('SELECT 1 AS x FROM tournament_teams WHERE tournament_id = ? AND team_id = ?'),
    countTeams: db.prepare('SELECT COUNT(*) AS n FROM tournament_teams WHERE tournament_id = ?'),
    teamIds: db.prepare(
      'SELECT team_id, seed FROM tournament_teams WHERE tournament_id = ? ORDER BY seed, added_at'
    ),
    setSeed: db.prepare('UPDATE tournament_teams SET seed = ? WHERE tournament_id = ? AND team_id = ?')
  };

  const teamCountOf = (id) => q.countTeams.get(id).n;

  return {
    get(id) {
      const row = q.byId.get(id);
      return row ? rowToTournament(row, teamCountOf(id)) : null;
    },

    list() {
      return q.all.all().map((row) => rowToTournament(row, teamCountOf(row.id)));
    },

    create(input) {
      const checked = sanitizeTournamentInput(input);
      if (checked.error) return checked;

      const id = newId('tournament');
      const now = Date.now();
      const { name, status, format, bestOf, note } = checked.tournament;
      q.insert.run(id, name, status, format, bestOf, note, now, now);
      return { tournament: this.get(id) };
    },

    update(id, input) {
      const existing = q.byId.get(id);
      if (!existing) return { error: 'Tournament not found' };

      const checked = sanitizeTournamentInput(input);
      if (checked.error) return checked;

      // เปลี่ยนรูปแบบทั้งที่ทีมเกินเพดานของรูปแบบใหม่ไม่ได้
      // เช่น มี 40 ทีมแล้วจะเปลี่ยนเป็นพบกันหมด (รับได้ 24)
      const { format } = checked.tournament;
      const allowed = canUseFormat(format, teamCountOf(id));
      if (!allowed.ok) return { error: allowed.error };

      const { name, status, bestOf, note } = checked.tournament;
      q.update.run(name, status, format, bestOf, note, Date.now(), id);
      return { tournament: this.get(id) };
    },

    // ปิดทัวร์นาเมนต์ / เปิดกลับมาแก้ต่อ
    setStatus(id, status) {
      if (!q.byId.get(id)) return { error: 'Tournament not found' };
      q.setStatus.run(sanitizeStatus(status), Date.now(), id);
      return { tournament: this.get(id) };
    },

    remove(id) {
      if (!q.byId.get(id)) return { error: 'Tournament not found' };
      q.remove.run(id);
      return { ok: true };
    },

    // ทีมที่ลงแข่ง พร้อมข้อมูลทีมเต็มจากทะเบียนกลาง
    teams(id) {
      return q.teamIds.all(id)
        .map((row) => {
          const team = teamStore.get(row.team_id);
          return team ? { ...team, seed: row.seed } : null;
        })
        .filter(Boolean);
    },

    teamCount(id) {
      return teamCountOf(id);
    },

    // คืน { ok: true } หรือ { error }
    addTeam(id, teamId, seed = 0) {
      const tournament = q.byId.get(id);
      if (!tournament) return { error: 'Tournament not found' };
      if (!teamStore.get(teamId)) return { error: 'Team not found' };
      if (q.hasTeam.get(id, teamId)) return { error: 'Team is already in this tournament' };

      const room = canAddTeams(tournament.format, teamCountOf(id), 1);
      if (!room.ok) return { error: room.error, limit: room.limit };

      q.addTeam.run(id, teamId, sanitizeSeed(seed), Date.now());
      return { ok: true, teamCount: teamCountOf(id) };
    },

    removeTeam(id, teamId) {
      if (!q.byId.get(id)) return { error: 'Tournament not found' };
      if (!q.hasTeam.get(id, teamId)) return { error: 'Team is not in this tournament' };
      q.removeTeam.run(id, teamId);
      return { ok: true, teamCount: teamCountOf(id) };
    },

    setSeed(id, teamId, seed) {
      if (!q.hasTeam.get(id, teamId)) return { error: 'Team is not in this tournament' };
      q.setSeed.run(sanitizeSeed(seed), id, teamId);
      return { ok: true };
    }
  };
}

module.exports = { createTournamentStore };
