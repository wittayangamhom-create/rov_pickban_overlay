// พรีเซ็ตแมตช์: ชุดข้อมูลทีมที่พิมพ์เตรียมไว้ล่วงหน้า
//
// เก็บเป็น object เดียว key = ชื่อพรีเซ็ต
// ชื่อถูกใช้เป็น key ของ object เท่านั้น ไม่ได้เอาไปต่อเป็น path
//
// โหมดทัวร์นาเมนต์ที่จะทำต่อ "ไม่" มาแทนที่พรีเซ็ต
// พรีเซ็ตยังใช้กับแมตช์เดี่ยวที่ไม่ได้อยู่ในทัวร์นาเมนต์ต่อไป

const { PRESETS_PATH } = require('../config');
const { loadJson, writeJson } = require('../lib/json');

function readPresets() {
  // ยังไม่เคยเซฟพรีเซ็ตเลยก็ไม่ต้องเตือน
  const presets = loadJson(PRESETS_PATH, {}, { quiet: true });
  return presets && typeof presets === 'object' && !Array.isArray(presets) ? presets : {};
}

function writePresets(presets) {
  writeJson(PRESETS_PATH, presets);
}

function hasPreset(presets, name) {
  return Boolean(name) && Object.prototype.hasOwnProperty.call(presets, name);
}

// ย่อพรีเซ็ตให้เหลือเท่าที่หน้า /presets ต้องใช้แสดงการ์ด
// ไม่ส่ง state ทั้งก้อนกลับไป เพราะรายการเดียวก็ใหญ่แล้ว
function presetSummary(name, preset) {
  const countFilled = (list) => (Array.isArray(list) ? list.filter(Boolean).length : 0);
  return {
    name,
    tournament: preset?.matchInfo?.tournament || '',
    title: preset?.matchInfo?.title || '',
    blue: {
      name: preset?.teamBlue?.name || '',
      score: preset?.teamBlue?.score ?? 0,
      players: Array.isArray(preset?.teamBlue?.players) ? preset.teamBlue.players : [],
      picks: countFilled(preset?.teamBlue?.picks),
      bans: countFilled(preset?.teamBlue?.bans)
    },
    red: {
      name: preset?.teamRed?.name || '',
      score: preset?.teamRed?.score ?? 0,
      players: Array.isArray(preset?.teamRed?.players) ? preset.teamRed.players : [],
      picks: countFilled(preset?.teamRed?.picks),
      bans: countFilled(preset?.teamRed?.bans)
    }
  };
}

// presets = ชื่อล้วน ของเดิม ไม่แตะ / details = ข้อมูลย่อสำหรับหน้าใหม่
// ทุก endpoint ที่แก้รายการส่งชุดนี้กลับไป หน้าเว็บจะได้ไม่ต้องยิงซ้ำ
function presetListPayload(presets) {
  const names = Object.keys(presets).sort((a, b) => a.localeCompare(b));
  return { presets: names, details: names.map((name) => presetSummary(name, presets[name])) };
}

module.exports = { readPresets, writePresets, hasPreset, presetSummary, presetListPayload };
