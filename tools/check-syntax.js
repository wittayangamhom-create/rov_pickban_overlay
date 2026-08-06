// ตรวจไฟล์ JS ทุกไฟล์ในโปรเจกต์: parse ผ่านไหม และมีอักขระควบคุมหลงมาไหม
//
// ที่ต้องเช็คอักขระควบคุม เพราะ regex ที่เขียนช่วงอักขระควบคุมด้วย escape
// ถ้าถูกแก้ผ่านเครื่องมือที่ตีความ escape ผิด จะกลายเป็นไบต์จริงฝังในซอร์ส
// โค้ดยังรันได้ปกติ แต่ diff/editor/git จะเริ่มเพี้ยนแบบหาสาเหตุไม่เจอ
//
// tab กับ CR ปล่อยผ่าน ในโปรเจกต์นี้มีทั้งไฟล์ LF และ CRLF ปนกันอยู่แล้ว

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const SKIP_DIRS = new Set(['node_modules', 'dist', '.git', 'backups', '_archive']);
const SKIP_FILES = new Set(['__oracle.js', '__original-server.js']);
const ALLOWED_CONTROL = new Set([9, 13]); // tab, CR

let checked = 0;
const problems = [];

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name) || entry.name.startsWith('__')) continue;
      walk(path.join(dir, entry.name));
      continue;
    }
    if (!entry.name.endsWith('.js') || SKIP_FILES.has(entry.name)) continue;

    const full = path.join(dir, entry.name);
    const rel = path.relative(ROOT, full);
    checked += 1;

    fs.readFileSync(full, 'utf8').split('\n').forEach((line, i) => {
      const codes = [...line]
        .map((c) => c.charCodeAt(0))
        .filter((c) => (c < 32 || c === 127) && !ALLOWED_CONTROL.has(c));
      if (codes.length) problems.push(`${rel}:${i + 1} control chars ${JSON.stringify(codes)}`);
    });

    try {
      execFileSync(process.execPath, ['--check', full], { stdio: 'pipe' });
    } catch (error) {
      problems.push(`${rel} syntax error\n${error.stderr.toString().split('\n').slice(0, 3).join('\n')}`);
    }
  }
}

walk(ROOT);

if (problems.length) {
  console.error(`${problems.length} problem(s):`);
  problems.forEach((p) => console.error(`  ${p}`));
  process.exit(1);
}
console.log(`check: ${checked} JS files parse cleanly, no stray control characters`);
