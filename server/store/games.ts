// เกมแต่ละเกมในซีรีส์ พร้อมดราฟต์ที่บันทึกไว้
//
// หลักการที่สำคัญที่สุดของไฟล์นี้: บันทึกดราฟต์ "ระหว่างเล่น" ไม่ใช่ตอนจบ
//
// ทุกวันนี้กด RESET MATCH หรือโหลดพรีเซ็ตทีเดียว pick/ban ที่อยู่บนจอหายหมด
// ถ้ารอให้คนกดเซฟตอนจบ วันไหนลืมกดก็คือไม่มีข้อมูลเกมนั้นตลอดไป
// จึงมิเรอร์ทุกครั้งที่ดราฟต์เปลี่ยน แล้วสถิติแบบเรียลไทม์ก็ได้มาฟรีๆ
// เพราะข้อมูลถูกเขียนไว้แล้วตั้งแต่แรก ไม่ต้องมีขั้นตอน "ปิดงาน"

import type { DatabaseSync } from 'node:sqlite';
import { newId } from '../domain/ids';
import type { GameState } from '../domain/match';

export interface GameSlot {
  side: 'blue' | 'red';
  kind: 'pick' | 'ban';
  idx: number;
  hero: string;
}

export interface Game {
  id: string;
  matchId: string;
  gameNo: number;
  blueTeamId: string | null;
  redTeamId: string | null;
  blueName: string;
  redName: string;
  draftLocked: boolean;
  winner: 'blue' | 'red' | null;
  slots: GameSlot[];
}

interface GameRow {
  id: string; match_id: string; game_no: number;
  blue_team_id: string | null; red_team_id: string | null;
  blue_name: string; red_name: string;
  draft_locked: number; winner: string | null;
}

interface SlotRow { side: string; kind: string; idx: number; hero: string }

// ดราฟต์ครบ = แบนครบทั้งสองฝั่ง และเลือกครบทั้งสองฝั่ง
function isDraftComplete(state: GameState): boolean {
  return (['teamBlue', 'teamRed'] as const).every((team) => (
    state[team].picks.every(Boolean) && state[team].bans.every(Boolean)
  ));
}

function stateToSlots(state: GameState): GameSlot[] {
  const slots: GameSlot[] = [];
  ([['blue', 'teamBlue'], ['red', 'teamRed']] as const).forEach(([side, team]) => {
    state[team].picks.forEach((hero, idx) => {
      if (hero) slots.push({ side, kind: 'pick', idx, hero });
    });
    state[team].bans.forEach((hero, idx) => {
      if (hero) slots.push({ side, kind: 'ban', idx, hero });
    });
  });
  return slots;
}

export interface GameStore {
  get(id: string): Game | null;
  forMatch(matchId: string): Game[];
  ensure(matchId: string, gameNo: number, snapshot: {
    blueTeamId: string | null; redTeamId: string | null;
    blueName: string; redName: string;
  }): Game;
  captureDraft(gameId: string, state: GameState): Game | null;
  setWinner(gameId: string, winner: 'blue' | 'red' | null): Game | null;
}

export function createGameStore(db: DatabaseSync): GameStore {
  const q = {
    insert: db.prepare(
      `INSERT INTO games (id, match_id, game_no, blue_team_id, red_team_id,
                          blue_name, red_name, draft_locked, winner, started_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, NULL, ?, ?)`
    ),
    byId: db.prepare('SELECT * FROM games WHERE id = ?'),
    byMatchNo: db.prepare('SELECT * FROM games WHERE match_id = ? AND game_no = ?'),
    byMatch: db.prepare('SELECT * FROM games WHERE match_id = ? ORDER BY game_no'),
    slotsFor: db.prepare('SELECT side, kind, idx, hero FROM game_slots WHERE game_id = ? ORDER BY kind, side, idx'),
    clearSlots: db.prepare('DELETE FROM game_slots WHERE game_id = ?'),
    insertSlot: db.prepare('INSERT INTO game_slots (game_id, side, kind, idx, hero) VALUES (?, ?, ?, ?, ?)'),
    setLocked: db.prepare('UPDATE games SET draft_locked = ?, updated_at = ? WHERE id = ?'),
    setWinner: db.prepare('UPDATE games SET winner = ?, updated_at = ? WHERE id = ?')
  };

  function hydrate(row: GameRow): Game {
    const slots = (q.slotsFor.all(row.id) as unknown as SlotRow[]).map((s) => ({
      side: s.side as 'blue' | 'red',
      kind: s.kind as 'pick' | 'ban',
      idx: s.idx,
      hero: s.hero
    }));
    return {
      id: row.id,
      matchId: row.match_id,
      gameNo: row.game_no,
      blueTeamId: row.blue_team_id,
      redTeamId: row.red_team_id,
      blueName: row.blue_name,
      redName: row.red_name,
      draftLocked: row.draft_locked === 1,
      winner: (row.winner as 'blue' | 'red' | null) ?? null,
      slots
    };
  }

  const store: GameStore = {
    get(id) {
      const row = q.byId.get(id) as GameRow | undefined;
      return row ? hydrate(row) : null;
    },

    forMatch(matchId) {
      return (q.byMatch.all(matchId) as unknown as GameRow[]).map(hydrate);
    },

    // เกมเดิมมีอยู่แล้วก็ใช้ตัวเดิม ไม่สร้างซ้ำ
    // กดเปิดแมตช์เดิมอีกรอบจึงกลับไปต่อของเดิม ไม่ใช่เริ่มใหม่แล้วทิ้งดราฟต์เก่า
    ensure(matchId, gameNo, snapshot) {
      const existing = q.byMatchNo.get(matchId, gameNo) as GameRow | undefined;
      if (existing) return hydrate(existing);

      const id = newId('game');
      const now = Date.now();
      q.insert.run(
        id, matchId, gameNo,
        snapshot.blueTeamId, snapshot.redTeamId,
        snapshot.blueName, snapshot.redName,
        now, now
      );
      return hydrate(q.byId.get(id) as unknown as GameRow);
    },

    // เขียนทับช่องทั้งหมดของเกมนี้ด้วยสิ่งที่อยู่บนจอตอนนี้
    // ถูกเรียกทุกครั้งที่ดราฟต์เปลี่ยน จึงต้องถูกและเร็ว
    // ช่องมีไม่เกิน 18 ช่อง การลบแล้วเขียนใหม่ถูกกว่าการไล่เทียบทีละช่อง
    captureDraft(gameId, state) {
      const row = q.byId.get(gameId) as GameRow | undefined;
      if (!row) return null;

      const slots = stateToSlots(state);
      const now = Date.now();

      db.exec('BEGIN');
      try {
        q.clearSlots.run(gameId);
        slots.forEach((s) => q.insertSlot.run(gameId, s.side, s.kind, s.idx, s.hero));
        // ล็อกเมื่อครบ และไม่ปลดล็อกเองถ้าคนลบ pick ออกทีหลัง
        // ปลดล็อกอัตโนมัติจะทำให้เกมหลุดออกจากสถิติแบบเงียบๆ
        if (isDraftComplete(state) && row.draft_locked !== 1) {
          q.setLocked.run(1, now, gameId);
        }
        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }

      return store.get(gameId);
    },

    setWinner(gameId, winner) {
      if (!q.byId.get(gameId)) return null;
      q.setWinner.run(winner, Date.now(), gameId);
      return store.get(gameId);
    }
  };

  return store;
}
