// สคีมาของฐานข้อมูล เก็บเป็นลำดับขั้น
//
// วิธีใช้: เพิ่มขั้นใหม่ต่อท้าย MIGRATIONS เท่านั้น
// ห้ามแก้ของเดิมที่ปล่อยไปแล้ว เพราะเครื่องผู้ใช้รันขั้นนั้นไปแล้ว
// แก้ของเดิม = เครื่องที่อัปเดตกับเครื่องที่ลงใหม่ได้สคีมาไม่เหมือนกัน
//
// ตัวเลขที่รันไปถึงแล้วเก็บใน PRAGMA user_version ของ SQLite เอง
// ไม่ต้องมีตารางจดเวอร์ชันแยก
//
// ตาราง matches / games จะมาในขั้นถัดไป (Phase 4-5) ตอนทำสายแข่งกับสถิติ
// ยังไม่สร้างตอนนี้ เพราะยังไม่มีอะไรเขียนลงไป

export const MIGRATIONS: readonly string[] = [
  // 1 - ทีมกลาง และทัวร์นาเมนต์
  `
  CREATE TABLE teams (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    tag         TEXT NOT NULL DEFAULT '',
    logo_v      INTEGER NOT NULL DEFAULT 0,
    logo_ext    TEXT NOT NULL DEFAULT '',
    created_at  INTEGER NOT NULL,
    updated_at  INTEGER NOT NULL
  );

  -- ผู้เล่นของทีม slot 0-4 ตรงกับ 5 ช่องในหน้า control
  CREATE TABLE team_players (
    team_id     TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    slot        INTEGER NOT NULL,
    name        TEXT NOT NULL DEFAULT '',
    role        TEXT NOT NULL DEFAULT '',
    is_captain  INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (team_id, slot)
  );

  CREATE TABLE tournaments (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    status      TEXT NOT NULL DEFAULT 'active',
    format      TEXT NOT NULL DEFAULT 'single_elim',
    best_of     INTEGER NOT NULL DEFAULT 3,
    note        TEXT NOT NULL DEFAULT '',
    created_at  INTEGER NOT NULL,
    updated_at  INTEGER NOT NULL
  );

  -- ทีมที่ลงแข่งในทัวร์นาเมนต์นี้ (roster)
  -- เพดาน 128 ทีมคุมที่ระดับนี้ ไม่ใช่ที่ตาราง teams
  -- ทะเบียนทีมกลางเก็บได้ไม่จำกัด แต่ทัวร์นาเมนต์เดียวรับได้ 128
  CREATE TABLE tournament_teams (
    tournament_id TEXT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
    team_id       TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    seed          INTEGER NOT NULL DEFAULT 0,
    added_at      INTEGER NOT NULL,
    PRIMARY KEY (tournament_id, team_id)
  );

  CREATE INDEX idx_tournament_teams_tid ON tournament_teams(tournament_id);
  CREATE INDEX idx_tournaments_status ON tournaments(status);
  `
];
