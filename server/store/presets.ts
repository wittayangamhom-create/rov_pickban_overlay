// พรีเซ็ตแมตช์: ชุดข้อมูลทีมที่พิมพ์เตรียมไว้ล่วงหน้า
//
// เก็บเป็น object เดียว key = ชื่อพรีเซ็ต
// ชื่อถูกใช้เป็น key ของ object เท่านั้น ไม่ได้เอาไปต่อเป็น path
//
// โหมดทัวร์นาเมนต์ที่จะทำต่อ "ไม่" มาแทนที่พรีเซ็ต
// พรีเซ็ตยังใช้กับแมตช์เดี่ยวที่ไม่ได้อยู่ในทัวร์นาเมนต์ต่อไป
//
// ชนิดของพรีเซ็ตเป็น unknown ตั้งใจ: ไฟล์นี้ผู้ใช้แก้เองได้ และพรีเซ็ตเก่า
// อาจมาจากสคีมาคนละรุ่น ทุกครั้งที่จะเอาไปใช้จริงต้องผ่าน sanitizeState ก่อน

import { PRESETS_PATH } from '../config';
import { loadJson, writeJson } from '../lib/json';

export type PresetMap = Record<string, unknown>;

export interface PresetTeamSummary {
  name: string;
  score: number;
  players: unknown[];
  picks: number;
  bans: number;
}

export interface PresetSummary {
  name: string;
  tournament: string;
  title: string;
  blue: PresetTeamSummary;
  red: PresetTeamSummary;
}

export interface PresetListPayload {
  presets: string[];
  details: PresetSummary[];
}

export function readPresets(): PresetMap {
  // ยังไม่เคยเซฟพรีเซ็ตเลยก็ไม่ต้องเตือน
  const presets = loadJson(PRESETS_PATH, {}, { quiet: true });
  return presets && typeof presets === 'object' && !Array.isArray(presets)
    ? (presets as PresetMap)
    : {};
}

export function writePresets(presets: PresetMap): void {
  writeJson(PRESETS_PATH, presets);
}

export function hasPreset(presets: PresetMap, name: string): boolean {
  return Boolean(name) && Object.prototype.hasOwnProperty.call(presets, name);
}

// ย่อพรีเซ็ตให้เหลือเท่าที่หน้า /presets ต้องใช้แสดงการ์ด
// ไม่ส่ง state ทั้งก้อนกลับไป เพราะรายการเดียวก็ใหญ่แล้ว
export function presetSummary(name: string, preset: unknown): PresetSummary {
  const countFilled = (list: unknown): number => (
    Array.isArray(list) ? list.filter(Boolean).length : 0
  );

  const p = (preset || {}) as {
    matchInfo?: { tournament?: string; title?: string };
    teamBlue?: { name?: string; score?: number; players?: unknown; picks?: unknown; bans?: unknown };
    teamRed?: { name?: string; score?: number; players?: unknown; picks?: unknown; bans?: unknown };
  };

  const side = (team: typeof p.teamBlue): PresetTeamSummary => ({
    name: team?.name || '',
    score: team?.score ?? 0,
    players: Array.isArray(team?.players) ? (team.players as unknown[]) : [],
    picks: countFilled(team?.picks),
    bans: countFilled(team?.bans)
  });

  return {
    name,
    tournament: p.matchInfo?.tournament || '',
    title: p.matchInfo?.title || '',
    blue: side(p.teamBlue),
    red: side(p.teamRed)
  };
}

// presets = ชื่อล้วน ของเดิม ไม่แตะ / details = ข้อมูลย่อสำหรับหน้าใหม่
// ทุก endpoint ที่แก้รายการส่งชุดนี้กลับไป หน้าเว็บจะได้ไม่ต้องยิงซ้ำ
export function presetListPayload(presets: PresetMap): PresetListPayload {
  const names = Object.keys(presets).sort((a, b) => a.localeCompare(b));
  return { presets: names, details: names.map((name) => presetSummary(name, presets[name])) };
}
