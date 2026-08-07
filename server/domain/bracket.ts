// การจับคู่และสร้างตารางแข่ง
//
// ไฟล์นี้เป็นฟังก์ชันบริสุทธิ์ล้วน ไม่แตะฐานข้อมูล ไม่สุ่มเอง
// ตัวสุ่มรับเข้ามาเป็นพารามิเตอร์ เทสต์จึงส่งตัวสุ่มแบบกำหนดผลได้เข้ามา
// แล้วตรวจผลลัพธ์ที่แน่นอนได้ ไม่ใช่ "รันหลายรอบแล้วหวังว่าจะไม่พัง"
//
// กฎที่ห้ามพังเด็ดขาด: ในหนึ่งรอบ ทีมเดียวห้ามลงแข่งเกินหนึ่งคู่
// แบบพบกันหมดใช้วิธี circle method ซึ่งกฎนี้เป็นจริงโดยโครงสร้าง
// ไม่ใช่ด้วยการสุ่มใหม่จนกว่าจะไม่ชน

import type { BestOf, TournamentFormat } from './tournament';

export interface PlannedMatch {
  // 'main' สำหรับสายเดียว หรือชื่อกลุ่ม ('A', 'B', ...) ตอนแบ่งสาย
  bracket: string;
  round: number;      // เริ่มที่ 1
  slot: number;       // ลำดับในรอบนั้น เริ่มที่ 0
  teamAId: string | null;
  teamBId: string | null;
  // ผู้ชนะไปคู่ไหนต่อ (เฉพาะแพ้คัดออก) null = จบสาย
  nextRound: number | null;
  nextSlot: number | null;
  nextSide: 0 | 1 | null;
  // คู่ที่มีทีมเดียว = บาย ผู้ชนะรู้ผลตั้งแต่ยังไม่แข่ง
  isBye: boolean;
  winnerId: string | null;
}

export type Rng = () => number;

// Fisher-Yates สลับที่ ตัวสุ่มรับเข้ามาเพื่อให้เทสต์กำหนดผลได้
export function shuffle<T>(items: readonly T[], rng: Rng = Math.random): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j] as T, out[i] as T];
  }
  return out;
}

// จำนวนเกมที่ต้องชนะถึงจะจบซีรีส์ Bo3 = 2, Bo5 = 3
export function winsNeeded(bestOf: BestOf): number {
  return Math.floor(bestOf / 2) + 1;
}

// ซีรีส์จบหรือยัง และใครชนะ
export function seriesWinner(
  bestOf: BestOf,
  scoreA: number,
  scoreB: number
): 'a' | 'b' | null {
  const need = winsNeeded(bestOf);
  if (scoreA >= need && scoreA > scoreB) return 'a';
  if (scoreB >= need && scoreB > scoreA) return 'b';
  return null;
}

// ---- ROUND ROBIN ----------------------------------------------------
//
// circle method: ตรึงทีมแรกไว้ แล้วหมุนที่เหลือทีละตำแหน่งในแต่ละรอบ
// ทีมจำนวนคี่เติมช่องว่างเข้าไปหนึ่งช่อง ใครจับคู่กับช่องว่างคือได้พักรอบนั้น
//
// ผลลัพธ์: n-1 รอบ (n คู่) ทุกคู่เจอกันครั้งเดียวพอดี
// และในแต่ละรอบทีมหนึ่งโผล่ได้ครั้งเดียว ซึ่งเป็นจริงจากตัวโครงสร้างเอง
export function roundRobinRounds(teamIds: readonly string[]): (readonly [string, string])[][] {
  const list: (string | null)[] = teamIds.slice();
  if (list.length % 2 === 1) list.push(null); // ช่องพัก

  const n = list.length;
  if (n < 2) return [];

  const rounds: (readonly [string, string])[][] = [];
  let arr = list.slice();

  for (let r = 0; r < n - 1; r += 1) {
    const pairs: (readonly [string, string])[] = [];
    for (let i = 0; i < n / 2; i += 1) {
      const a = arr[i];
      const b = arr[n - 1 - i];
      // สลับฝั่งตามรอบ ทีมเดิมจะได้ไม่อยู่ฝั่งน้ำเงินทุกนัด
      if (a !== null && a !== undefined && b !== null && b !== undefined) {
        pairs.push(r % 2 === 0 ? [a, b] : [b, a]);
      }
    }
    rounds.push(pairs);

    // หมุน: ตรึง arr[0] เอาตัวท้ายมาไว้ตำแหน่งที่ 1
    arr = [arr[0] as string | null, arr[n - 1] as string | null, ...arr.slice(1, n - 1)];
  }

  return rounds;
}

// ---- SINGLE ELIMINATION ---------------------------------------------

// ลำดับ seed มาตรฐานของสายขนาด size (ต้องเป็นกำลังของสอง)
// 8 ทีม -> [1,8,5,4,3,6,7,2] คือ 1 เจอ 8, 5 เจอ 4, ...
// ทำให้ทีมวางอันดับต้นๆ ไม่เจอกันเองจนกว่าจะรอบท้ายๆ
export function seedOrder(size: number): number[] {
  let order = [1];
  while (order.length < size) {
    const next = order.length * 2 + 1;
    const grown: number[] = [];
    order.forEach((seed) => {
      grown.push(seed, next - seed);
    });
    order = grown;
  }
  return order;
}

function nextPowerOfTwo(n: number): number {
  let size = 1;
  while (size < n) size *= 2;
  return size;
}

// สร้างสายแพ้คัดออก teamIds เรียงตามลำดับวาง (คนแรก = seed 1)
// ทีมไม่ครบกำลังสอง ช่องที่เหลือเป็นบาย และบายตกกับทีมวางอันดับต้น
export function singleElimination(teamIds: readonly string[]): PlannedMatch[] {
  if (teamIds.length < 2) return [];

  const size = nextPowerOfTwo(teamIds.length);
  const order = seedOrder(size);
  // order เก็บเป็นเลข seed เริ่มที่ 1 แปลงเป็น index แล้วดึงทีม (เกินมา = บาย)
  const positioned = order.map((seed) => teamIds[seed - 1] ?? null);

  const matches: PlannedMatch[] = [];
  const totalRounds = Math.log2(size);

  // ค่า null ในสองบริบทนี้ไม่เหมือนกัน และเคยทำให้เกิดบั๊กมาแล้ว:
  //   รอบแรก null = ไม่มีทีมในช่องนั้นจริงๆ (ทีมไม่ครบกำลังสอง) -> เป็นบาย
  //   รอบหลัง null = ยังไม่รู้ว่าใครชนะมา                        -> ไม่ใช่บาย
  // ถ้าเหมารวมว่า null คือบายเหมือนกันหมด ทีมที่ได้บายรอบแรกจะถูกดันเข้ารอบ
  // ต่อไปเรื่อยๆ โดยไม่ต้องแข่งเลย เพราะคู่ต่อสู้ยัง null อยู่
  // สรุป: บายเกิดได้เฉพาะรอบแรกเท่านั้น
  let previousWinners: (string | null)[] = [];

  for (let round = 1; round <= totalRounds; round += 1) {
    const slots = size / 2 ** round;
    const winners: (string | null)[] = [];
    const isFirst = round === 1;
    const isFinal = round === totalRounds;

    for (let slot = 0; slot < slots; slot += 1) {
      const source = isFirst ? positioned : previousWinners;
      const teamAId = source[slot * 2] ?? null;
      const teamBId = source[slot * 2 + 1] ?? null;

      const isBye = isFirst && (teamAId === null) !== (teamBId === null);
      const winnerId = isBye ? (teamAId ?? teamBId) : null;

      matches.push({
        bracket: 'main',
        round,
        slot,
        teamAId,
        teamBId,
        nextRound: isFinal ? null : round + 1,
        nextSlot: isFinal ? null : Math.floor(slot / 2),
        nextSide: isFinal ? null : ((slot % 2) as 0 | 1),
        isBye,
        winnerId
      });

      // บายรู้ผู้ชนะทันที ส่งต่อให้รอบถัดไปได้เลย ไม่ต้องให้คนกดผ่าน
      // นัดจริงส่ง null ไป แปลว่า "รอผลอยู่"
      winners.push(winnerId);
    }

    previousWinners = winners;
  }

  // ช่องที่ว่างทั้งคู่ในรอบแรก (ไม่เกิดขึ้นเมื่อ size เป็นกำลังสองถัดไปของ n
  // เพราะจะมีทีมอย่างน้อยหนึ่งทีมต่อคู่เสมอ) กันไว้เผื่อ
  return matches.filter((m) => !(isFirstRoundEmpty(m)));
}

function isFirstRoundEmpty(m: PlannedMatch): boolean {
  return m.round === 1 && m.teamAId === null && m.teamBId === null;
}

// ---- GROUP STAGE ----------------------------------------------------

const GROUP_NAMES = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

// แบ่งทีมลงกลุ่มแบบงูสวัด (1,2,3,4 / 4,3,2,1) เพื่อให้แต่ละกลุ่มแข็งใกล้กัน
// แล้วแต่ละกลุ่มแข่งพบกันหมดภายในกลุ่ม
export function groupStage(teamIds: readonly string[], groupCount: number): PlannedMatch[] {
  const groups: string[][] = Array.from({ length: groupCount }, () => []);

  teamIds.forEach((id, index) => {
    const row = Math.floor(index / groupCount);
    const position = index % groupCount;
    const target = row % 2 === 0 ? position : groupCount - 1 - position;
    (groups[target] as string[]).push(id);
  });

  const matches: PlannedMatch[] = [];
  groups.forEach((members, groupIndex) => {
    const name = GROUP_NAMES[groupIndex] ?? `G${groupIndex + 1}`;
    roundRobinRounds(members).forEach((pairs, roundIndex) => {
      pairs.forEach(([a, b], slot) => {
        matches.push({
          bracket: name,
          round: roundIndex + 1,
          slot,
          teamAId: a,
          teamBId: b,
          nextRound: null,
          nextSlot: null,
          nextSide: null,
          isBye: false,
          winnerId: null
        });
      });
    });
  });

  return matches;
}

// ---- ENTRY POINT ----------------------------------------------------

export interface GeneratePlan {
  format: TournamentFormat;
  teamIds: readonly string[];
  groupCount?: number;
}

export type GenerateResult =
  | { matches: PlannedMatch[]; error?: undefined }
  | { error: string; matches?: undefined };

export function generateMatches(plan: GeneratePlan): GenerateResult {
  const { format, teamIds } = plan;

  if (format === 'round_robin') {
    const matches: PlannedMatch[] = [];
    roundRobinRounds(teamIds).forEach((pairs, roundIndex) => {
      pairs.forEach(([a, b], slot) => {
        matches.push({
          bracket: 'main',
          round: roundIndex + 1,
          slot,
          teamAId: a,
          teamBId: b,
          nextRound: null,
          nextSlot: null,
          nextSide: null,
          isBye: false,
          winnerId: null
        });
      });
    });
    return { matches };
  }

  if (format === 'single_elim') {
    return { matches: singleElimination(teamIds) };
  }

  if (format === 'group_stage') {
    const count = Math.max(2, Math.min(plan.groupCount ?? 4, Math.floor(teamIds.length / 2)));
    return { matches: groupStage(teamIds, count) };
  }

  // แพ้สองครั้งคัดออกยังไม่รองรับ สายแพ้มีกติกาการไหลของตัวเองที่ซับซ้อนกว่ามาก
  // ทำครึ่งๆ กลางๆ แล้วปล่อยออกไปอันตรายกว่าบอกตรงๆ ว่ายังไม่มี
  return { error: 'Double elimination brackets are not generated yet. Use single elimination, round robin or group stage.' };
}
