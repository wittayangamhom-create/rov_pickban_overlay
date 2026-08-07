// ตารางแข่ง อ่าน/เขียนฐานข้อมูล
//
// การสร้างสายเป็นการ "แทนที่ทั้งชุด" ไม่ใช่การเติม
// สร้างใหม่ = ลบของเดิมทิ้งหมดแล้ววางชุดใหม่ ในทรานแซกชันเดียว
// จึงไม่มีสถานะครึ่งๆ ที่มีสายเก่าปนสายใหม่

import type { DatabaseSync } from 'node:sqlite';
import { newId } from '../domain/ids';
import type { BestOf } from '../domain/tournament';
import { seriesWinner } from '../domain/bracket';
import type { PlannedMatch, Rng } from '../domain/bracket';
import { generateMatches, shuffle } from '../domain/bracket';
import type { TournamentStore } from './tournaments';

export type MatchStatus = 'pending' | 'live' | 'complete';

export interface Match {
  id: string;
  tournamentId: string;
  bracket: string;
  round: number;
  slot: number;
  teamAId: string | null;
  teamBId: string | null;
  bestOf: BestOf;
  status: MatchStatus;
  scoreA: number;
  scoreB: number;
  winnerId: string | null;
  isBye: boolean;
  nextRound: number | null;
  nextSlot: number | null;
  nextSide: number | null;
}

export type MatchResult = { match: Match; error?: undefined } | { error: string; match?: undefined };
export type GenerateOutcome =
  | { matches: Match[]; error?: undefined }
  | { error: string; matches?: undefined };

interface MatchRow {
  id: string; tournament_id: string; bracket: string; round: number; slot: number;
  team_a_id: string | null; team_b_id: string | null; best_of: number;
  status: string; score_a: number; score_b: number; winner_id: string | null;
  is_bye: number; next_round: number | null; next_slot: number | null; next_side: number | null;
}

function rowToMatch(row: MatchRow): Match {
  return {
    id: row.id,
    tournamentId: row.tournament_id,
    bracket: row.bracket,
    round: row.round,
    slot: row.slot,
    teamAId: row.team_a_id,
    teamBId: row.team_b_id,
    bestOf: row.best_of as BestOf,
    status: row.status as MatchStatus,
    scoreA: row.score_a,
    scoreB: row.score_b,
    winnerId: row.winner_id,
    isBye: row.is_bye === 1,
    nextRound: row.next_round,
    nextSlot: row.next_slot,
    nextSide: row.next_side
  };
}

export interface MatchStore {
  list(tournamentId: string): Match[];
  get(id: string): Match | null;
  generate(tournamentId: string, options?: { randomise?: boolean; rng?: Rng }): GenerateOutcome;
  clear(tournamentId: string): void;
  setResult(id: string, scoreA: unknown, scoreB: unknown): MatchResult;
}

export function createMatchStore(db: DatabaseSync, tournaments: TournamentStore): MatchStore {
  const q = {
    insert: db.prepare(
      `INSERT INTO matches
       (id, tournament_id, bracket, round, slot, team_a_id, team_b_id, best_of,
        status, score_a, score_b, winner_id, is_bye, next_round, next_slot, next_side, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?, ?, ?, ?, ?)`
    ),
    clear: db.prepare('DELETE FROM matches WHERE tournament_id = ?'),
    byTournament: db.prepare(
      'SELECT * FROM matches WHERE tournament_id = ? ORDER BY bracket, round, slot'
    ),
    byId: db.prepare('SELECT * FROM matches WHERE id = ?'),
    atPosition: db.prepare(
      'SELECT * FROM matches WHERE tournament_id = ? AND bracket = ? AND round = ? AND slot = ?'
    ),
    setResult: db.prepare(
      'UPDATE matches SET score_a = ?, score_b = ?, winner_id = ?, status = ? WHERE id = ?'
    ),
    setSide: db.prepare('UPDATE matches SET team_a_id = ? WHERE id = ?'),
    setSideB: db.prepare('UPDATE matches SET team_b_id = ? WHERE id = ?')
  };

  const findRow = (id: string) => q.byId.get(id) as MatchRow | undefined;

  // ผู้ชนะเดินไปคู่ถัดไปตามตำแหน่งที่วางไว้ตอนสร้างสาย
  function advance(match: Match, winnerId: string): void {
    if (match.nextRound === null || match.nextSlot === null || match.nextSide === null) return;
    const next = q.atPosition.get(
      match.tournamentId, match.bracket, match.nextRound, match.nextSlot
    ) as MatchRow | undefined;
    if (!next) return;
    if (match.nextSide === 0) q.setSide.run(winnerId, next.id);
    else q.setSideB.run(winnerId, next.id);
  }

  const store: MatchStore = {
    list(tournamentId) {
      return (q.byTournament.all(tournamentId) as unknown as MatchRow[]).map(rowToMatch);
    },

    get(id) {
      const row = findRow(id);
      return row ? rowToMatch(row) : null;
    },

    clear(tournamentId) {
      q.clear.run(tournamentId);
    },

    generate(tournamentId, options = {}) {
      const tournament = tournaments.get(tournamentId);
      if (!tournament) return { error: 'Tournament not found' };

      const seeded = tournaments.teams(tournamentId);
      if (seeded.length < 2) return { error: 'Add at least two teams before drawing matches' };

      // สุ่ม = ไม่สนลำดับวาง / ไม่สุ่ม = เรียงตาม seed ที่ตั้งไว้
      const ids = seeded.map((t) => t.id);
      const ordered = options.randomise ? shuffle(ids, options.rng) : ids;

      const plan = generateMatches({ format: tournament.format, teamIds: ordered });
      if (plan.error !== undefined) return { error: plan.error };

      const now = Date.now();
      db.exec('BEGIN');
      try {
        // แทนที่ทั้งชุด ไม่ใช่เติมต่อ
        q.clear.run(tournamentId);
        (plan.matches as PlannedMatch[]).forEach((m) => {
          q.insert.run(
            newId('match'), tournamentId, m.bracket, m.round, m.slot,
            m.teamAId, m.teamBId, tournament.bestOf,
            m.isBye ? 'complete' : 'pending',
            m.winnerId, m.isBye ? 1 : 0,
            m.nextRound, m.nextSlot, m.nextSide, now
          );
        });
        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        return { error: `Could not draw matches: ${(error as Error).message}` };
      }

      // บายรู้ผู้ชนะตั้งแต่ต้น ดันเข้ารอบถัดไปให้เลย
      // ทำหลัง COMMIT เพราะต้องอ่าน id ของคู่ถัดไปที่เพิ่งเขียนลงไป
      store.list(tournamentId)
        .filter((m) => m.isBye && m.winnerId)
        .forEach((m) => advance(m, m.winnerId as string));

      return { matches: store.list(tournamentId) };
    },

    setResult(id, scoreA, scoreB) {
      const row = findRow(id);
      if (!row) return { error: 'Match not found' };
      const match = rowToMatch(row);

      if (match.isBye) return { error: 'A bye has no result to record' };
      if (!match.teamAId || !match.teamBId) {
        return { error: 'Both teams must be known before recording a result' };
      }

      const need = Math.floor(match.bestOf / 2) + 1;
      const a = Math.max(0, Math.min(need, Math.trunc(Number(scoreA)) || 0));
      const b = Math.max(0, Math.min(need, Math.trunc(Number(scoreB)) || 0));
      if (a === need && b === need) {
        return { error: `Both teams cannot reach ${need} wins in a Bo${match.bestOf}` };
      }

      const decided = seriesWinner(match.bestOf, a, b);
      const winnerId = decided === 'a' ? match.teamAId : decided === 'b' ? match.teamBId : null;
      const status: MatchStatus = winnerId ? 'complete' : (a + b > 0 ? 'live' : 'pending');

      q.setResult.run(a, b, winnerId, status, id);
      const updated = rowToMatch(findRow(id) as MatchRow);
      if (winnerId) advance(updated, winnerId);

      return { match: updated };
    }
  };

  return store;
}
