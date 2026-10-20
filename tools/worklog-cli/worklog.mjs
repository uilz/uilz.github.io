#!/usr/bin/env node
// Worklog tool contract v0.1 — data-only, read-only CLI over a Worklog full backup.
// Zero dependencies. Node >= 18.
import fs from 'node:fs/promises';
import path from 'node:path';
import { ToolError, CODES } from './lib/errors.mjs';
import { openSnapshot, isoUtc, normalizeIso } from './lib/snapshot.mjs';
import { sha256Hex, buildBundleManifest, bundleSha256, compareUtf8 } from './lib/hash.mjs';

const TOOL_VERSION = '0.1.0';
const CONTRACT_VERSION = '0.1';
const ATTACHMENT_DIR = 'attachments';

// ---------------------------------------------------------------------------
// Output / args
// ---------------------------------------------------------------------------

function emit(payload, exitCode = 0) {
  process.stdout.write(JSON.stringify(payload, null, 2) + '\n');
  process.exitCode = exitCode;
}

function parseArgs(argv) {
  const positional = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--version' || arg === '-v') {
      flags.version = true;
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      flags.help = true;
      continue;
    }
    if (arg === '--json') {
      flags.json = true;
      continue;
    }
    if (arg.startsWith('--')) {
      const eq = arg.indexOf('=');
      if (eq > 2) {
        flags[arg.slice(2, eq)] = arg.slice(eq + 1);
        continue;
      }
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (next != null && !next.startsWith('--')) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = true;
      }
      continue;
    }
    positional.push(arg);
  }
  return { positional, flags };
}

function printHelp() {
  process.stdout.write(
    [
      'worklog — Worklog tool contract v0.1 (data-only)',
      '',
      'Usage:',
      '  worklog --version',
      '  worklog health  --json',
      '  worklog list    --json [--from <snapshot.zip|snapshot-dir>]',
      '  worklog export  --workblock <id> --out <dir> --json',
      '',
      'Env:',
      '  WORKLOG_SNAPSHOT   default snapshot path (used when --from is omitted)',
      '',
      'Default snapshot resolution: $WORKLOG_SNAPSHOT, then newest ./snapshots/worklog-backup-*.zip,',
      'then newest ./worklog-backup-*.zip; otherwise SNAPSHOT_NOT_FOUND.',
      '',
      'Output: JSON on stdout. Exit code 0 = ok, 1 = ok:false, 2 = unexpected error.',
      'transcribe / summarize are provided by the platform and return UNSUPPORTED.',
      '',
    ].join('\n'),
  );
}

// ---------------------------------------------------------------------------
// Path safety helpers
// ---------------------------------------------------------------------------

function assertInside(root, target) {
  const rel = path.relative(root, target);
  if (rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))) return;
  throw new ToolError(CODES.INVALID_INPUT, `refusing to write outside --out: ${target}`);
}

const ILLEGAL_FILENAME = /[<>:"/\\|?*\u0000-\u001f]/g;
const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

function safeFileName(input, fallback) {
  let base = String(input || '').replace(/\\/g, '/');
  base = base.split('/').pop() || '';
  base = base.replace(ILLEGAL_FILENAME, '_').replace(/^\.+/, '').trim();
  if (!base) base = fallback;
  const stem = base.replace(/\.[^.]*$/, '');
  if (WINDOWS_RESERVED.test(stem)) base = '_' + base;
  if (base.length > 120) {
    const dot = base.lastIndexOf('.');
    base = dot > 0 ? base.slice(0, 100) + base.slice(dot) : base.slice(0, 120);
  }
  return base;
}

function uniqueName(name, used) {
  let candidate = name;
  let n = 2;
  while (used.has(candidate.toLowerCase())) {
    const dot = name.lastIndexOf('.');
    candidate = dot > 0 ? `${name.slice(0, dot)}-${n}${name.slice(dot)}` : `${name}-${n}`;
    n++;
  }
  used.add(candidate.toLowerCase());
  return candidate;
}

function fileBaseFor(block) {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(block.date) ? block.date : 'undated';
  const timeRaw = block.startTime || block.time || '';
  const time = (timeRaw.replace(/[^0-9]/g, '') || '0000').slice(0, 4).padEnd(4, '0');
  const suffix = sha256Hex(Buffer.from(block.key, 'utf8')).slice(0, 6);
  return `wb_${date}_${time}_${suffix}`;
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function buildMarkdown(block, workspaceName) {
  const lines = [];
  lines.push(`# ${block.title || '未命名'}`);
  lines.push('');

  const meta = [];
  if (block.date) meta.push(`- 日期：${block.date}`);
  if (block.startTime || block.endTime) {
    const range = block.startTime && block.endTime
      ? `${block.startTime}–${block.endTime}`
      : block.startTime || `—${block.endTime}`;
    meta.push(`- 时间：${range}`);
  }
  if (block.status) meta.push(`- 状态：${block.status}`);
  if (block.prio) meta.push(`- 优先级：${block.prio}`);
  if (block.loc) meta.push(`- 地点：${block.loc}`);
  if (block.tags.length) meta.push(`- 标签：${block.tags.join('、')}`);
  if (workspaceName) meta.push(`- 工作区：${workspaceName}`);
  const updated = isoUtc(block.updatedAt);
  if (updated) meta.push(`- 更新：${updated}`);
  lines.push(...meta);
  lines.push('');

  const body = String(block.body || '').replace(/\r\n?/g, '\n').replace(/\s+$/, '');
  if (body) {
    lines.push(body);
    lines.push('');
  }

  lines.push('---');
  lines.push(`workblock_id: ${block.key}`);
  return lines.join('\n') + '\n';
}

function listItem(block, workspaceName) {
  return {
    workblock_id: block.key,
    title: block.title,
    date: block.date,
    start: block.startTime || block.time || '',
    end: block.endTime || '',
    tags: block.tags,
    status: block.status,
    priority: block.prio,
    location: block.loc,
    workspace: workspaceName,
    attachment_count: block.fileIds.length,
    updated_at: isoUtc(block.updatedAt),
  };
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

async function cmdHealth(flags, cwd) {
  const base = { tool_version: TOOL_VERSION, contract_version: CONTRACT_VERSION };
  const statics = {
    asr: { available: false, reason: 'platform-side' },
    model: { available: false, reason: 'platform-side' },
    checked_at: new Date().toISOString(),
  };
  try {
    const snap = await openSnapshot(flags.from, { cwd });
    emit({
      ok: true,
      ...base,
      result: {
        snapshot_readable: true,
        snapshot_path: snap.path,
        snapshot_kind: snap.kind,
        snapshot_exported_at: normalizeIso(snap.manifest.exportedAt),
        snapshot_schema: Number(snap.manifest.schema) || null,
        blocks: snap.stats.blocks,
        attachments: snap.stats.attachments,
        attachment_bytes: snap.stats.attachmentBytes,
        ...statics,
      },
    });
  } catch (err) {
    if (err instanceof ToolError && err.code === CODES.SNAPSHOT_NOT_FOUND) {
      emit(
        {
          ok: false,
          code: err.code,
          message: err.message,
          retryable: true,
          ...base,
          result: { snapshot_readable: false, ...statics },
        },
        1,
      );
      return;
    }
    throw err;
  }
}

async function cmdList(flags, cwd) {
  const snap = await openSnapshot(flags.from, { cwd });
  const items = snap.blocks
    .map((b) => listItem(b, snap.workspaces.get(b.workspaceId) || ''))
    .sort(
      (a, b) =>
        a.date.localeCompare(b.date) ||
        String(a.start).localeCompare(String(b.start)) ||
        a.workblock_id.localeCompare(b.workblock_id),
    );
  emit({
    ok: true,
    tool_version: TOOL_VERSION,
    contract_version: CONTRACT_VERSION,
    result: { snapshot_path: snap.path, count: items.length, workblocks: items },
  });
}

async function cmdExport(flags, cwd) {
  const workblockId = flags.workblock;
  if (!workblockId || workblockId === true) {
    throw new ToolError(CODES.INVALID_INPUT, '--workblock <id> is required');
  }
  const out = flags.out;
  if (!out || out === true) {
    throw new ToolError(CODES.INVALID_INPUT, '--out <dir> is required');
  }

  const snap = await openSnapshot(flags.from, { cwd });
  const block = snap.blocks.find((b) => b.key === String(workblockId));
  if (!block) throw new ToolError(CODES.WORKBLOCK_NOT_FOUND, `workblock not found: ${workblockId}`);

  const outDir = path.resolve(cwd, String(out));
  await fs.mkdir(outDir, { recursive: true });
  const outStat = await fs.stat(outDir);
  if (!outStat.isDirectory()) {
    throw new ToolError(CODES.STORAGE_ERROR, `--out is not a directory: ${outDir}`, true);
  }

  const attDir = path.join(outDir, ATTACHMENT_DIR);
  await fs.mkdir(attDir, { recursive: true });
  assertInside(outDir, attDir);

  const workspaceName = snap.workspaces.get(block.workspaceId) || '';
  const base = fileBaseFor(block);

  // ---- attachments (deterministic naming, case-insensitive de-duplication) ----
  const ids = [...new Set(block.fileIds)];
  const metas = [];
  for (const id of ids) {
    const meta = snap.fileById.get(id);
    if (!meta) {
      throw new ToolError(
        CODES.INVALID_INPUT,
        `workblock references an attachment missing from the snapshot: ${id}`,
      );
    }
    metas.push(meta);
  }
  metas.sort((a, b) => compareUtf8(a.name, b.name) || compareUtf8(a.id, b.id));

  const used = new Set();
  const exportedAttachments = [];
  for (const meta of metas) {
    const name = uniqueName(safeFileName(meta.name, `attachment-${meta.id}`), used);
    const buf = await snap.readAttachment(meta.id);
    const full = path.join(attDir, name);
    assertInside(outDir, full);
    await fs.writeFile(full, buf);
    exportedAttachments.push({
      name,
      original_name: meta.name,
      path: `${ATTACHMENT_DIR}/${name}`,
      abs_path: full,
      size: buf.length,
      sha256: sha256Hex(buf),
    });
  }

  // ---- markdown body ----
  const mdText = buildMarkdown(block, workspaceName);
  const mdBytes = Buffer.from(mdText, 'utf8');
  const bodySha256 = sha256Hex(mdBytes);
  const mdPath = path.join(outDir, `${base}.md`);
  assertInside(outDir, mdPath);
  await fs.writeFile(mdPath, mdBytes);

  // ---- structured json (deterministic: no wall-clock in payload) ----
  const jsonDoc = {
    schema: 'worklog-workblock/1',
    contract_version: CONTRACT_VERSION,
    workblock_id: block.key,
    source: { snapshot_exported_at: normalizeIso(snap.manifest.exportedAt) },
    workspace: { id: block.workspaceId, name: workspaceName },
    block: {
      key: block.key,
      slot_key: block.slotKey,
      workspace_id: block.workspaceId,
      title: block.title,
      body: block.body,
      tags: block.tags,
      priority: block.prio,
      status: block.status,
      location: block.loc,
      start: block.startTime || block.time || '',
      end: block.endTime || '',
      updated_at: isoUtc(block.updatedAt),
      version: block.version,
    },
    attachments: exportedAttachments.map((a) => ({
      name: a.name,
      original_name: a.original_name,
      size: a.size,
      sha256: a.sha256,
    })),
  };
  const jsonBytes = Buffer.from(JSON.stringify(jsonDoc, null, 2) + '\n', 'utf8');
  const jsonPath = path.join(outDir, `${base}.json`);
  assertInside(outDir, jsonPath);
  await fs.writeFile(jsonPath, jsonBytes);

  // ---- frozen bundle hash ----
  const bundleManifest = buildBundleManifest(
    bodySha256,
    exportedAttachments.map((a) => ({ name: a.name, sha256: a.sha256, size: a.size })),
  );
  const bundleSha256Value = bundleSha256(bundleManifest);

  emit({
    ok: true,
    tool_version: TOOL_VERSION,
    contract_version: CONTRACT_VERSION,
    result: {
      workblock_id: block.key,
      json_path: jsonPath,
      json_rel: `${base}.json`,
      md_path: mdPath,
      md_rel: `${base}.md`,
      body_sha256: bodySha256,
      sha256: bodySha256,
      attachments: exportedAttachments,
      bundle_sha256: bundleSha256Value,
      bundle_manifest: bundleManifest,
    },
  });
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

async function main() {
  const { positional, flags } = parseArgs(process.argv.slice(2));
  const command = flags.version ? 'version' : positional[0] || '';

  if (flags.help || command === 'help' || !command) {
    printHelp();
    return;
  }

  const cwd = process.cwd();

  switch (command) {
    case 'version': {
      emit({
        ok: true,
        tool_version: TOOL_VERSION,
        contract_version: CONTRACT_VERSION,
        result: {
          tool: 'worklog',
          capabilities: ['list', 'export', 'health', 'version'],
          unsupported: ['transcribe', 'summarize'],
        },
      });
      return;
    }
    case 'health':
      await cmdHealth(flags, cwd);
      return;
    case 'list':
      await cmdList(flags, cwd);
      return;
    case 'export':
      await cmdExport(flags, cwd);
      return;
    case 'transcribe':
    case 'summarize':
      throw new ToolError(
        CODES.UNSUPPORTED,
        `${command} is implemented by the platform; Worklog exposes data-only capabilities`,
        false,
      );
    default:
      throw new ToolError(CODES.INVALID_INPUT, `unknown command: ${command}`);
  }
}

main().catch((err) => {
  if (err instanceof ToolError) {
    emit(
      {
        ok: false,
        code: err.code,
        message: err.message,
        retryable: err.retryable,
        tool_version: TOOL_VERSION,
        contract_version: CONTRACT_VERSION,
      },
      1,
    );
    return;
  }
  emit(
    {
      ok: false,
      code: CODES.STORAGE_ERROR,
      message: String((err && err.message) || err),
      retryable: true,
      tool_version: TOOL_VERSION,
      contract_version: CONTRACT_VERSION,
    },
    2,
  );
});
