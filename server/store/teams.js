// ทะเบียนทีมกลาง อ่าน/เขียนฐานข้อมูล
//
// เขียนเป็น factory ที่รับ db เข้ามา ไม่ได้ไปเรียก getDatabase() เอง
// เทสต์จะได้ส่งฐานแบบ ':memory:' เข้ามาแทน ไม่ไปแตะไฟล์จริงของผู้ใช้

const { newId } = require('../domain/ids');
const { sanitizeTeamInput, sanitizeRoster, ROSTER_SIZE } = require('../domain/team');
const { sanitizeLogo } = require('../domain/media');

// node:sqlite ไม่รับ boolean เป็นพารามิเตอร์ ต้องแปลงเป็น 0/1 เอง
const bit = (value) => (value ? 1 : 0);

function rowToTeam(row, players) {
  return {
    id: row.id,
    name: row.name,
    tag: row.tag,
    logo: { v: row.logo_v, ext: row.logo_ext },
    players,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function createTeamStore(db) {
  const q = {
    insert: db.prepare(
      'INSERT INTO teams (id, name, tag, logo_v, logo_ext, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ),
    update: db.prepare(
      'UPDATE teams SET name = ?, tag = ?, updated_at = ? WHERE id = ?'
    ),
    updateLogo: db.prepare('UPDATE teams SET logo_v = ?, logo_ext = ?, updated_at = ? WHERE id = ?'),
    remove: db.prepare('DELETE FROM teams WHERE id = ?'),
    byId: db.prepare('SELECT * FROM teams WHERE id = ?'),
    all: db.prepare('SELECT * FROM teams ORDER BY name COLLATE NOCASE'),
    insertPlayer: db.prepare(
      'INSERT INTO team_players (team_id, slot, name, role, is_captain) VALUES (?, ?, ?, ?, ?)'
    ),
    clearPlayers: db.prepare('DELETE FROM team_players WHERE team_id = ?'),
    playersFor: db.prepare('SELECT * FROM team_players WHERE team_id = ? ORDER BY slot'),
    countAll: db.prepare('SELECT COUNT(*) AS n FROM teams')
  };

  function readPlayers(teamId) {
    const rows = q.playersFor.all(teamId);
    // ฐานอาจมีไม่ครบ 5 แถวถ้าถูกแก้มาจากข้างนอก เติมให้ครบเสมอ
    return sanitizeRoster(
      Array.from({ length: ROSTER_SIZE }, (_, slot) => {
        const row = rows.find((r) => r.slot === slot);
        return row ? { name: row.name, role: row.role, isCaptain: row.is_captain === 1 } : {};
      })
    );
  }

  function writePlayers(teamId, players) {
    q.clearPlayers.run(teamId);
    players.forEach((player) => {
      q.insertPlayer.run(teamId, player.slot, player.name, player.role, bit(player.isCaptain));
    });
  }

  return {
    count() {
      return q.countAll.get().n;
    },

    get(id) {
      const row = q.byId.get(id);
      return row ? rowToTeam(row, readPlayers(id)) : null;
    },

    list() {
      return q.all.all().map((row) => rowToTeam(row, readPlayers(row.id)));
    },

    // คืน { team } หรือ { error }
    create(input) {
      const checked = sanitizeTeamInput(input);
      if (checked.error) return checked;

      const id = newId('team');
      const now = Date.now();
      const { name, tag, logo, players } = checked.team;

      db.exec('BEGIN');
      try {
        q.insert.run(id, name, tag, logo.v, logo.ext, now, now);
        writePlayers(id, players);
        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        return { error: `Could not create team: ${error.message}` };
      }

      return { team: this.get(id) };
    },

    // แก้ได้เฉพาะชื่อ/แท็ก/ผู้เล่น โลโก้แก้ผ่าน setLogo เพราะผูกกับไฟล์
    update(id, input) {
      if (!q.byId.get(id)) return { error: 'Team not found' };

      const checked = sanitizeTeamInput(input);
      if (checked.error) return checked;

      const { name, tag, players } = checked.team;
      db.exec('BEGIN');
      try {
        q.update.run(name, tag, Date.now(), id);
        writePlayers(id, players);
        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        return { error: `Could not update team: ${error.message}` };
      }

      return { team: this.get(id) };
    },

    setLogo(id, logo) {
      if (!q.byId.get(id)) return { error: 'Team not found' };
      const safe = sanitizeLogo(logo);
      q.updateLogo.run(safe.v, safe.ext, Date.now(), id);
      return { team: this.get(id) };
    },

    // ลบทีมออกจากทะเบียน ทีมหลุดจากทุกทัวร์นาเมนต์ด้วย (ON DELETE CASCADE)
    remove(id) {
      if (!q.byId.get(id)) return { error: 'Team not found' };
      q.remove.run(id);
      return { ok: true };
    }
  };
}

module.exports = { createTeamStore };
