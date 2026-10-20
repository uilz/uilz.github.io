#!/usr/bin/env node
// Contract tests for worklog-cli v0.1.
// Zero dependencies. Run: node contract-test.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { writeZip } from './lib/zip.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.join(HERE, 'worklog.mjs');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'worklog-cli-test-'));
const WS = 'ws_demo';

let passed = 0;
let failed = 0;
const failures = [];

function check(name, fn) {
  try {
    fn();
    passed++;
    process.stdout.write(`PASS  ${name}\n`);
  } catch (err) {
    failed++;
    failures.push({ name, message: err && err.message });
    process.stdout.write(`FAIL  ${name}\n      ${(err && err.message) || err}\n`);
  }
}

function assert(cond, message) {
  if (!cond) throw new Error(message || 'assertion failed');
}

function eq(actual, expected, message) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${message || 'values differ'}\n        expected: ${JSON.stringify(expected)}\n        actual:   ${JSON.stringify(actual)}`);
  }
}

function run(args, { cwd = TMP, env = {} } = {}) {
  const res = spawnSync(process.execPath, [CLI, ...args], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, WORKLOG_SNAPSHOT: '', ...env },
  });
  let json = null;
  try {
    json = JSON.parse(res.stdout);
  } catch {
    /* not JSON */
  }
  return { status: res.status, stdout: res.stdout, stderr: res.stderr, json };
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function mkBlock(slot, extra = {}) {
  return {
    key: `${WS}::${slot}`,
    slotKey: slot,
    workspaceId: WS,
    title: '',
    body: '',
    tags: [],
    prio: '',
    status: '',
    loc: '',
    fileIds: [],
    startTime: slot.slice(slot.lastIndexOf('_') + 1),
    endTime: '',
    updatedAt: Date.parse('2026-10-19T02:00:00Z'),
    version: 6,
    ...extra,
  };
}

function fileMeta(id, name, data, { path: rel = `attachments/${id}.bin`, workspaceId = WS } = {}) {
  return {
    id,
    workspaceId,
    name,
    type: 'application/octet-stream',
    size: data.length,
    createdAt: Date.parse('2026-10-19T00:00:00Z'),
    updatedAt: Date.parse('2026-10-19T00:00:00Z'),
    path: rel,
  };
}

function buildSnapshot({ blocks = [], files = [], attachments = [], exportedAt = '2026-10-20T00:00:00.000Z' } = {}) {
  const manifest = {
    app: 'worklog',
    schema: 6,
    dataVersion: 2,
    exportedAt,
    exportId: 'test-export',
    appSettings: { theme: 'light' },
    workspaces: [{ id: WS, name: '示例工作区' }],
    blocks,
    files,
    attachmentIdentity: 'uuid-v1',
  };
  const entries = [{ name: 'manifest.json', data: JSON.stringify(manifest, null, 2) }];
  for (const a of attachments) entries.push({ name: a.path, data: a.data });
  return { manifest, zip: writeZip(entries) };
}

const notes = Buffer.from('第一行\n第二行\n', 'utf8');
const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
const baseFiles = [
  fileMeta('f1', '会议纪要.txt', notes, { path: 'attachments/f1.txt' }),
  fileMeta('f2', 'a.png', png, { path: 'attachments/f2.png' }),
];
const baseBlocks = [
  mkBlock('2026-10-19_09:00', {
    title: '整理报告',
    body: '内容 A\n第二行',
    tags: ['报告', '会议'],
    prio: '高',
    status: '已完成',
    fileIds: ['f1'],
  }),
  mkBlock('2026-10-20_14:30', {
    title: '同步进度',
    body: '内容 B',
    tags: ['会议'],
    status: '进行中',
    fileIds: ['f2'],
  }),
];

const base = buildSnapshot({
  blocks: baseBlocks,
  files: baseFiles,
  attachments: [
    { path: 'attachments/f1.txt', data: notes },
    { path: 'attachments/f2.png', data: png },
  ],
});
const zipPath = path.join(TMP, 'base.zip');
fs.writeFileSync(zipPath, base.zip);

const WB1 = `${WS}::2026-10-19_09:00`;

// ---------------------------------------------------------------------------
// 1. version
// ---------------------------------------------------------------------------

check('version returns tool_version + contract_version', () => {
  const r = run(['--version']);
  assert(r.status === 0, `exit ${r.status}`);
  assert(r.json && r.json.ok === true, 'ok must be true');
  eq(r.json.tool_version, '0.1.0', 'tool_version');
  eq(r.json.contract_version, '0.1', 'contract_version');
});

// ---------------------------------------------------------------------------
// 2. list (zip)
// ---------------------------------------------------------------------------

check('list --json returns workblocks with stable fields', () => {
  const r = run(['list', '--json', '--from', zipPath]);
  assert(r.status === 0, `exit ${r.status}: ${r.stdout}`);
  assert(r.json.ok === true);
  eq(r.json.result.workblocks.length, 2, 'workblock count');
  const b = r.json.result.workblocks[0];
  eq(b.workblock_id, WB1, 'workblock_id');
  eq(b.title, '整理报告', 'title');
  eq(b.date, '2026-10-19', 'date');
  eq(b.start, '09:00', 'start');
  eq(b.attachment_count, 1, 'attachment_count');
  eq(b.workspace, '示例工作区', 'workspace');
  assert(/^\d{4}-\d{2}-\d{2}T.*Z$/.test(b.updated_at), `updated_at must be ISO-8601 UTC, got ${b.updated_at}`);
});

// ---------------------------------------------------------------------------
// 3. list (directory snapshot)
// ---------------------------------------------------------------------------

check('list supports an unpacked snapshot directory', () => {
  const dir = path.join(TMP, 'snapdir');
  fs.mkdirSync(path.join(dir, 'attachments'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(base.manifest, null, 2));
  fs.writeFileSync(path.join(dir, 'attachments', 'f1.txt'), notes);
  fs.writeFileSync(path.join(dir, 'attachments', 'f2.png'), png);
  const r = run(['list', '--json', '--from', dir]);
  assert(r.status === 0, `exit ${r.status}: ${r.stdout}`);
  eq(r.json.result.workblocks.length, 2);
});

// ---------------------------------------------------------------------------
// 4. export + independent hash recomputation
// ---------------------------------------------------------------------------

const out1 = path.join(TMP, 'out1');
let exportResult = null;

check('export writes json + md + attachments and reports relative paths', () => {
  const r = run(['export', '--workblock', WB1, '--out', out1, '--json', '--from', zipPath]);
  assert(r.status === 0, `exit ${r.status}: ${r.stdout}`);
  assert(r.json.ok === true);
  exportResult = r.json.result;

  assert(fs.existsSync(path.join(out1, exportResult.md_rel)), 'md file missing');
  assert(fs.existsSync(path.join(out1, exportResult.json_rel)), 'json file missing');
  eq(exportResult.attachments.length, 1, 'attachment count');
  eq(exportResult.attachments[0].path, 'attachments/会议纪要.txt', 'relative attachment path');
  assert(fs.existsSync(path.join(out1, exportResult.attachments[0].path)), 'attachment file missing');

  const md = fs.readFileSync(path.join(out1, exportResult.md_rel), 'utf8');
  assert(md.includes('# 整理报告'), 'md must include title');
  assert(md.includes('workblock_id: ' + WB1), 'md must include workblock_id');
});

check('body / attachment / bundle hashes match an independent recomputation', () => {
  assert(exportResult, 'export did not run');
  const md = fs.readFileSync(path.join(out1, exportResult.md_rel));
  const bodySha = crypto.createHash('sha256').update(md).digest('hex');
  eq(exportResult.body_sha256, bodySha, 'body_sha256');
  eq(exportResult.sha256, bodySha, 'sha256 must equal body_sha256');

  const atts = exportResult.attachments.map((a) => {
    const buf = fs.readFileSync(path.join(out1, a.path));
    return { name: a.name, sha256: crypto.createHash('sha256').update(buf).digest('hex'), size: buf.length };
  });
  atts.sort((a, b) => Buffer.compare(Buffer.from(a.name, 'utf8'), Buffer.from(b.name, 'utf8')));

  let manifest = 'PAPBUNDLE1\n';
  manifest += 'body ' + bodySha + '\n';
  for (const a of atts) manifest += 'file ' + a.name + ' ' + a.sha256 + ' ' + a.size + '\n';
  const bundle = crypto.createHash('sha256').update(Buffer.from(manifest, 'utf8')).digest('hex');

  eq(exportResult.bundle_manifest, manifest, 'bundle manifest');
  eq(exportResult.bundle_sha256, bundle, 'bundle_sha256');
  assert(manifest.startsWith('PAPBUNDLE1\nbody '), 'manifest must start with PAPBUNDLE1 + body line');
});

check('export is idempotent (same hashes on repeated runs)', () => {
  const out2 = path.join(TMP, 'out2');
  const r = run(['export', '--workblock', WB1, '--out', out2, '--json', '--from', zipPath]);
  assert(r.status === 0, `exit ${r.status}: ${r.stdout}`);
  eq(r.json.result.body_sha256, exportResult.body_sha256, 'body hash across runs');
  eq(r.json.result.bundle_sha256, exportResult.bundle_sha256, 'bundle hash across runs');
  eq(
    r.json.result.attachments.map((a) => a.sha256),
    exportResult.attachments.map((a) => a.sha256),
    'attachment hashes across runs',
  );
});

check('export rejects an unknown workblock', () => {
  const r = run(['export', '--workblock', 'ws_demo::2026-10-19_08:00', '--out', path.join(TMP, 'out-x'), '--from', zipPath]);
  assert(r.status === 1, `exit ${r.status}`);
  eq(r.json.code, 'WORKBLOCK_NOT_FOUND');
});

// ---------------------------------------------------------------------------
// 5. default snapshot resolution
// ---------------------------------------------------------------------------

check('--from omitted resolves the newest ./snapshots/worklog-backup-*.zip', () => {
  const cwd = path.join(TMP, 'cwd-default');
  fs.mkdirSync(path.join(cwd, 'snapshots'), { recursive: true });
  fs.copyFileSync(zipPath, path.join(cwd, 'snapshots', 'worklog-backup-2026-10-20.zip'));
  const r = run(['list', '--json'], { cwd });
  assert(r.status === 0, `exit ${r.status}: ${r.stdout}`);
  eq(r.json.result.workblocks.length, 2);
});

// ---------------------------------------------------------------------------
// 6. health
// ---------------------------------------------------------------------------

check('health reports snapshot_readable + asr/model placeholders', () => {
  const r = run(['health', '--json', '--from', zipPath]);
  assert(r.status === 0, `exit ${r.status}: ${r.stdout}`);
  assert(r.json.ok === true);
  eq(r.json.result.snapshot_readable, true, 'snapshot_readable');
  eq(r.json.result.blocks, 2, 'blocks');
  eq(r.json.result.attachments, 2, 'attachments');
  eq(r.json.result.asr.available, false, 'asr.available');
  eq(r.json.result.asr.reason, 'platform-side', 'asr.reason');
  eq(r.json.result.model.available, false, 'model.available');
});

check('health without a snapshot -> SNAPSHOT_NOT_FOUND (retryable)', () => {
  const cwd = path.join(TMP, 'cwd-empty');
  fs.mkdirSync(cwd, { recursive: true });
  const r = run(['health', '--json'], { cwd });
  assert(r.status === 1, `exit ${r.status}`);
  assert(r.json.ok === false);
  eq(r.json.code, 'SNAPSHOT_NOT_FOUND');
  eq(r.json.retryable, true);
  eq(r.json.result.snapshot_readable, false);
});

// ---------------------------------------------------------------------------
// 7. unsupported capabilities
// ---------------------------------------------------------------------------

check('transcribe / summarize return UNSUPPORTED', () => {
  for (const cmd of ['transcribe', 'summarize']) {
    const r = run([cmd, '--input', 'x', '--json']);
    assert(r.status === 1, `${cmd} exit ${r.status}`);
    eq(r.json.code, 'UNSUPPORTED', `${cmd} code`);
    eq(r.json.retryable, false, `${cmd} retryable`);
  }
});

// ---------------------------------------------------------------------------
// 8. path traversal / absolute entries
// ---------------------------------------------------------------------------

check('rejects ".." archive entry names', () => {
  const p = path.join(TMP, 'bad-traversal.zip');
  fs.writeFileSync(p, writeZip([{ name: 'manifest.json', data: '{}' }, { name: '../evil.txt', data: 'x' }]));
  const r = run(['list', '--json', '--from', p]);
  assert(r.status === 1, `exit ${r.status}`);
  eq(r.json.code, 'INVALID_INPUT');
});

check('rejects absolute archive entry names', () => {
  const p = path.join(TMP, 'bad-absolute.zip');
  fs.writeFileSync(p, writeZip([{ name: 'manifest.json', data: '{}' }, { name: '/etc/passwd', data: 'x' }]));
  const r = run(['list', '--json', '--from', p]);
  assert(r.status === 1, `exit ${r.status}`);
  eq(r.json.code, 'INVALID_INPUT');
});

check('rejects manifest attachment paths outside attachments/', () => {
  const manifest = {
    app: 'worklog',
    schema: 6,
    dataVersion: 2,
    exportedAt: '2026-10-20T00:00:00.000Z',
    workspaces: [],
    blocks: [],
    files: [{ id: 'x', name: 'x', size: 1, path: '../x' }],
  };
  const p = path.join(TMP, 'bad-manifest-path.zip');
  fs.writeFileSync(p, writeZip([{ name: 'manifest.json', data: JSON.stringify(manifest) }]));
  const r = run(['health', '--json', '--from', p]);
  assert(r.status === 1, `exit ${r.status}`);
  eq(r.json.code, 'INVALID_INPUT');
});

// ---------------------------------------------------------------------------
// 9. limits
// ---------------------------------------------------------------------------

check('rejects more than 100 attachments', () => {
  const files = [];
  const attachments = [];
  for (let i = 0; i < 101; i++) {
    const d = Buffer.from('x');
    files.push(fileMeta(`f${i}`, `a${i}.bin`, d, { path: `attachments/f${i}.bin` }));
    attachments.push({ path: `attachments/f${i}.bin`, data: d });
  }
  const snap = buildSnapshot({ blocks: [], files, attachments });
  const p = path.join(TMP, 'too-many.zip');
  fs.writeFileSync(p, snap.zip);
  const r = run(['health', '--json', '--from', p]);
  assert(r.status === 1, `exit ${r.status}`);
  eq(r.json.code, 'INVALID_INPUT');
  assert(/limit/i.test(r.json.message), `message should mention limit: ${r.json.message}`);
});

check('rejects a single attachment > 10 MB', () => {
  const files = [
    { id: 'big', workspaceId: WS, name: 'big.bin', type: 'application/octet-stream', size: 10 * 1024 * 1024 + 1, path: 'attachments/big.bin' },
  ];
  const snap = buildSnapshot({ blocks: [], files, attachments: [] });
  const p = path.join(TMP, 'too-big.zip');
  fs.writeFileSync(p, snap.zip);
  const r = run(['health', '--json', '--from', p]);
  assert(r.status === 1, `exit ${r.status}`);
  eq(r.json.code, 'INVALID_INPUT');
});

check('rejects attachments totalling > 200 MB', () => {
  const files = [];
  for (let i = 0; i < 100; i++) {
    files.push({ id: `t${i}`, workspaceId: WS, name: `t${i}.bin`, type: 'application/octet-stream', size: 3 * 1024 * 1024, path: `attachments/t${i}.bin` });
  }
  const snap = buildSnapshot({ blocks: [], files, attachments: [] });
  const p = path.join(TMP, 'too-large-total.zip');
  fs.writeFileSync(p, snap.zip);
  const r = run(['health', '--json', '--from', p]);
  assert(r.status === 1, `exit ${r.status}`);
  eq(r.json.code, 'INVALID_INPUT');
});

check('defends against ZIP bombs (declared size forged small)', () => {
  const manifest = {
    app: 'worklog',
    schema: 6,
    dataVersion: 2,
    exportedAt: '2026-10-20T00:00:00.000Z',
    workspaces: [{ id: WS, name: '示例工作区' }],
    blocks: [mkBlock('2026-10-19_09:00', { title: 'bomb', fileIds: ['bomb'] })],
    files: [{ id: 'bomb', workspaceId: WS, name: 'bomb.bin', size: 1000, path: 'attachments/bomb.bin' }],
  };

  // 20 MB of zeros deflated, with the declared uncompressed size forged to 1000.
  const zeros = Buffer.alloc(20 * 1024 * 1024, 0);
  const zipBuf = writeZip(
    [
      { name: 'manifest.json', data: JSON.stringify(manifest) },
      { name: 'attachments/bomb.bin', data: zeros },
    ],
    { deflate: true },
  );
  const forged = forgeUncompressedSize(zipBuf, 'attachments/bomb.bin', 1000);

  const p = path.join(TMP, 'bomb.zip');
  fs.writeFileSync(p, forged);
  const r = run(['export', '--workblock', `${WS}::2026-10-19_09:00`, '--out', path.join(TMP, 'out-bomb'), '--from', p]);
  assert(r.status === 1, `exit ${r.status}: ${r.stdout}`);
  eq(r.json.code, 'INVALID_INPUT');
  assert(/ZIP bomb|exceeds size limit|size mismatch/i.test(r.json.message), `unexpected message: ${r.json.message}`);
});

// ---------------------------------------------------------------------------
// help
// ---------------------------------------------------------------------------

function forgeUncompressedSize(buf, targetName, fakeSize) {
  const out = Buffer.from(buf);
  const eocd = findEocdSig(out);
  if (eocd < 0) throw new Error('EOCD not found in fixture');
  const count = out.readUInt16LE(eocd + 10);
  let p = out.readUInt32LE(eocd + 16);
  for (let i = 0; i < count; i++) {
    const nameLen = out.readUInt16LE(p + 28);
    const extraLen = out.readUInt16LE(p + 30);
    const commentLen = out.readUInt16LE(p + 32);
    const name = out.subarray(p + 46, p + 46 + nameLen).toString('utf8');
    if (name === targetName) {
      const localOffset = out.readUInt32LE(p + 42);
      out.writeUInt32LE(fakeSize, p + 24); // central uncompressed size
      out.writeUInt32LE(fakeSize, localOffset + 22); // local uncompressed size
      return out;
    }
    p += 46 + nameLen + extraLen + commentLen;
  }
  throw new Error('target entry not found in fixture');
}

function findEocdSig(buf) {
  for (let i = buf.length - 22; i >= 0; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) return i;
  }
  return -1;
}

check('help exits 0', () => {
  const r = run(['--help']);
  assert(r.status === 0, `exit ${r.status}`);
  assert(/worklog — Worklog tool contract/.test(r.stdout), 'help text missing');
});

// ---------------------------------------------------------------------------

process.stdout.write(`\nTOTAL ${passed + failed}  PASS ${passed}  FAIL ${failed}\n`);
if (failed > 0) {
  process.stdout.write(`\nFailures:\n${failures.map((f) => `- ${f.name}: ${f.message}`).join('\n')}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(`\nAll contract tests passed. Temp dir: ${TMP}\n`);
}
