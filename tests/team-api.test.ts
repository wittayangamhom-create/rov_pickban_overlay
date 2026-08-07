// เทสต์ HTTP ของทะเบียนทีมและ roster ของทัวร์นาเมนต์
//
// ตั้ง env ก่อน import อะไรก็ตาม เพราะ config อ่านตอน import
// ถ้าตั้งทีหลังจะไปเขียนทับข้อมูลจริงของผู้ใช้

import test from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import os from 'os';
import path from 'path';
import http from 'http';

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'rov-team-test-'));
process.env.ROV_USER_DATA_DIR = path.join(TMP, 'data');
process.env.ROV_USER_MEDIA_DIR = path.join(TMP, 'media');
process.env.CONTROL_TOKEN = '';

const { createApp } = require('../server/index') as typeof import('../server/index');
const { closeDatabase } = require('../server/store/db') as typeof import('../server/store/db');
const { MAX_TEAMS } = require('../server/domain/tournament') as typeof import('../server/domain/tournament');

const app = createApp();
let server: http.Server;
let base = '';

interface Reply { status: number; body: any }

function send(method: string, url: string, payload?: unknown, raw?: { body: Buffer; type: string }): Promise<Reply> {
  return new Promise((resolve, reject) => {
    let data: Buffer | null = null;
    const headers: Record<string, string> = {};
    if (raw) {
      data = raw.body;
      headers['content-type'] = raw.type;
      headers['content-length'] = String(raw.body.length);
    } else if (payload !== undefined) {
      data = Buffer.from(JSON.stringify(payload));
      headers['content-type'] = 'application/json';
      headers['content-length'] = String(data.length);
    }

    const req = http.request(`${base}${url}`, { method, headers }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString();
        let body: any = null;
        try { body = JSON.parse(text); } catch { body = text; }
        resolve({ status: res.statusCode || 0, body });
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(64, 7)
]);
const NOT_PNG = Buffer.concat([Buffer.from('NOPE'), Buffer.alloc(64, 1)]);

async function newTeam(name: string): Promise<string> {
  const res = await send('POST', '/api/teams', { name });
  assert.strictEqual(res.status, 200, `creating ${name}: ${JSON.stringify(res.body)}`);
  return res.body.team.id;
}

async function newTournament(format = 'single_elim'): Promise<string> {
  const res = await send('POST', '/api/tournaments', { name: `Cup ${format}`, format });
  assert.strictEqual(res.status, 200);
  return res.body.tournament.id;
}

test.before(async () => {
  await new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', () => {
      base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
      resolve();
    });
  });
});

test.after(() => {
  server?.close();
  closeDatabase();
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { /* ระบบเก็บเอง */ }
});

test('a team round-trips through the API with its roster', async () => {
  const created = await send('POST', '/api/teams', {
    name: 'Buriram United',
    tag: 'BRU',
    players: [{ name: 'ZHAN', role: 'jungle', isCaptain: true }, { name: 'WETZ' }]
  });
  assert.strictEqual(created.status, 200);
  const id = created.body.team.id;

  const read = await send('GET', `/api/teams/${id}`);
  assert.strictEqual(read.body.team.name, 'Buriram United');
  assert.strictEqual(read.body.team.players.length, 5, 'always five slots');
  assert.strictEqual(read.body.team.players[0].isCaptain, true);
  assert.deepStrictEqual(read.body.team.logo, { v: 0, ext: '' }, 'no logo yet');

  const updated = await send('PUT', `/api/teams/${id}`, {
    name: 'Buriram', tag: 'BRU', players: [{ name: 'ZHAN' }, { name: 'NEW GUY' }]
  });
  assert.strictEqual(updated.body.team.name, 'Buriram');
  assert.strictEqual(updated.body.team.players[1].name, 'NEW GUY');
});

test('a team needs a name', async () => {
  const res = await send('POST', '/api/teams', { name: '  ' });
  assert.strictEqual(res.status, 400);
  assert.match(res.body.error, /name is required/i);
});

// ---- TEST GOAL 1 ผ่าน HTTP: ห้ามเกิน 128 ทีมต่อทัวร์นาเมนต์ ----

test('the API refuses the 129th team with 409, and the count does not move', async () => {
  const tid = await newTournament('single_elim');

  // สร้างทีมล่วงหน้าให้ครบ แล้วค่อยใส่ทีละตัว
  const ids: string[] = [];
  for (let i = 0; i < MAX_TEAMS + 1; i += 1) ids.push(await newTeam(`T${i}`));

  for (let i = 0; i < MAX_TEAMS; i += 1) {
    const res = await send('POST', `/api/tournaments/${tid}/teams`, { teamId: ids[i] });
    assert.strictEqual(res.status, 200, `team ${i + 1}: ${JSON.stringify(res.body)}`);
  }

  const before = (await send('GET', `/api/tournaments/${tid}`)).body.tournament.teamCount;
  assert.strictEqual(before, MAX_TEAMS);

  const overflow = await send('POST', `/api/tournaments/${tid}/teams`, { teamId: ids[MAX_TEAMS] });
  assert.strictEqual(overflow.status, 409, 'full is a conflict, not a bad request');
  assert.match(overflow.body.error, /full|max/i);
  assert.strictEqual(overflow.body.limit, MAX_TEAMS, 'the cap is reported back');

  const after = (await send('GET', `/api/tournaments/${tid}`)).body.tournament.teamCount;
  assert.strictEqual(after, MAX_TEAMS, 'count unchanged after the refusal');
});

test('round robin refuses past its own lower cap', async () => {
  const tid = await newTournament('round_robin');
  const ids: string[] = [];
  for (let i = 0; i < 25; i += 1) ids.push(await newTeam(`RR${i}`));

  for (let i = 0; i < 24; i += 1) {
    assert.strictEqual((await send('POST', `/api/tournaments/${tid}/teams`, { teamId: ids[i] })).status, 200);
  }
  const overflow = await send('POST', `/api/tournaments/${tid}/teams`, { teamId: ids[24] });
  assert.strictEqual(overflow.status, 409);
  assert.strictEqual(overflow.body.limit, 24);
});

test('the same team cannot be added twice', async () => {
  const tid = await newTournament();
  const id = await newTeam('Solo');
  assert.strictEqual((await send('POST', `/api/tournaments/${tid}/teams`, { teamId: id })).status, 200);
  const again = await send('POST', `/api/tournaments/${tid}/teams`, { teamId: id });
  assert.strictEqual(again.status, 400, 'a duplicate is a bad request, not a full tournament');
});

test('removing a team from a tournament leaves it in the registry', async () => {
  const tid = await newTournament();
  const id = await newTeam('Stays');
  await send('POST', `/api/tournaments/${tid}/teams`, { teamId: id });

  const removed = await send('DELETE', `/api/tournaments/${tid}/teams/${id}`);
  assert.strictEqual(removed.status, 200);
  assert.strictEqual(removed.body.teamCount, 0);
  assert.strictEqual((await send('GET', `/api/teams/${id}`)).status, 200, 'still in the registry');
});

test('deleting a team from the registry pulls it out of every tournament', async () => {
  const a = await newTournament();
  const b = await newTournament('double_elim');
  const id = await newTeam('Everywhere');
  await send('POST', `/api/tournaments/${a}/teams`, { teamId: id });
  await send('POST', `/api/tournaments/${b}/teams`, { teamId: id });

  assert.strictEqual((await send('DELETE', `/api/teams/${id}`)).status, 200);
  assert.strictEqual((await send('GET', `/api/tournaments/${a}`)).body.tournament.teamCount, 0);
  assert.strictEqual((await send('GET', `/api/tournaments/${b}`)).body.tournament.teamCount, 0);
  assert.strictEqual((await send('GET', `/api/teams/${id}`)).status, 404);
});

test('seeds control the order teams come back in', async () => {
  const tid = await newTournament();
  const first = await newTeam('Alpha');
  const second = await newTeam('Beta');
  await send('POST', `/api/tournaments/${tid}/teams`, { teamId: first });
  await send('POST', `/api/tournaments/${tid}/teams`, { teamId: second });

  await send('PUT', `/api/tournaments/${tid}/teams/${first}/seed`, { seed: 9 });
  const teams = (await send('GET', `/api/tournaments/${tid}/teams`)).body.teams;
  assert.deepStrictEqual(teams.map((t: any) => t.name), ['Beta', 'Alpha']);
});

// ---- LOGO ----

test('a team logo is stored under the team id, never the team name', async () => {
  const id = await newTeam('../../evil name');

  const up = await send('POST', `/api/teams/${id}/logo`, undefined, { body: PNG, type: 'image/png' });
  assert.strictEqual(up.status, 200);
  assert.strictEqual(up.body.team.logo.ext, 'png');
  assert.ok(up.body.team.logo.v > 0, 'version stamped for cache busting');

  const files = fs.readdirSync(path.join(TMP, 'media', 'team-logos'));
  assert.ok(files.includes(`${id}.png`), `saved as ${id}.png, got ${files.join(', ')}`);
  assert.ok(
    files.every((f) => /^[a-z0-9][a-z0-9-]*\.(png|jpg|webp)$/.test(f)),
    'no file name derived from the typed team name'
  );

  const cleared = await send('DELETE', `/api/teams/${id}/logo`);
  assert.strictEqual(cleared.body.team.logo.v, 0);
  assert.ok(!fs.readdirSync(path.join(TMP, 'media', 'team-logos')).includes(`${id}.png`));
});

test('a logo upload must really be the type it claims', async () => {
  const id = await newTeam('Liar');
  const bad = await send('POST', `/api/teams/${id}/logo`, undefined, { body: NOT_PNG, type: 'image/png' });
  assert.strictEqual(bad.status, 400);
  assert.match(bad.body.error, /do not match/i);

  const wrongType = await send('POST', `/api/teams/${id}/logo`, undefined, { body: PNG, type: 'image/gif' });
  assert.strictEqual(wrongType.status, 415);
});

test('logo endpoints 404 for an unknown team', async () => {
  assert.strictEqual(
    (await send('POST', '/api/teams/nope/logo', undefined, { body: PNG, type: 'image/png' })).status,
    404
  );
  assert.strictEqual((await send('DELETE', '/api/teams/nope/logo')).status, 404);
});
