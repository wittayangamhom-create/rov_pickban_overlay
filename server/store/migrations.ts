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
  `,

  // 2 - ตารางแข่ง
  `
  CREATE TABLE matches (
    id            TEXT PRIMARY KEY,
    tournament_id TEXT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
    -- 'main' สำหรับสายเดียว หรือชื่อกลุ่ม ('A','B',...) ตอนแบ่งสาย
    bracket       TEXT NOT NULL DEFAULT 'main',
    round         INTEGER NOT NULL,
    slot          INTEGER NOT NULL,

    -- ON DELETE SET NULL ไม่ใช่ CASCADE ตั้งใจ
    -- ลบทีมทิ้งกลางทัวร์นาเมนต์ ตารางแข่งต้องไม่หายตามไปด้วย
    -- ช่องนั้นกลายเป็นว่างแทน ประวัติที่เหลือยังอยู่ครบ
    team_a_id     TEXT REFERENCES teams(id) ON DELETE SET NULL,
    team_b_id     TEXT REFERENCES teams(id) ON DELETE SET NULL,

    best_of       INTEGER NOT NULL DEFAULT 3,
    status        TEXT NOT NULL DEFAULT 'pending',
    score_a       INTEGER NOT NULL DEFAULT 0,
    score_b       INTEGER NOT NULL DEFAULT 0,
    winner_id     TEXT,
    is_bye        INTEGER NOT NULL DEFAULT 0,

    -- ผู้ชนะไปคู่ไหนต่อ เก็บเป็นตำแหน่ง ไม่ใช่ id ของคู่ถัดไป
    -- สร้างสายใหม่แล้ว id เปลี่ยนหมด แต่ตำแหน่งยังเหมือนเดิม
    next_round    INTEGER,
    next_slot     INTEGER,
    next_side     INTEGER,

    created_at    INTEGER NOT NULL
  );

  CREATE INDEX idx_matches_tid ON matches(tournament_id);
  -- หนึ่งตำแหน่งมีได้คู่เดียว กันการสร้างสายซ้อนกันสองรอบ
  CREATE UNIQUE INDEX idx_matches_pos ON matches(tournament_id, bracket, round, slot);
  `
];
