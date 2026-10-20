// Snapshot access layer: opens a Worklog full-backup ZIP or an unpacked snapshot
// directory, validates the manifest, and enforces the security limits from the
// contract (attachment count/size/total, safe relative paths).
import fs from 'node:fs/promises';
import path from 'node:path';
import { ToolError } from './errors.mjs';
import { readZip, isUnsafeName } from './zip.mjs';

export const LIMITS = Object.freeze({
  maxAttachments: 100,
  maxAttachmentBytes: 10 * 1024 * 1024,
  maxTotalAttachmentBytes: 200 * 1024 * 1024,
  maxManifestBytes: 10 * 1024 * 1024,
  maxArchiveBytes: 256 * 1024 * 1024,
});

const ATTACHMENT_PREFIX = 'attachments/';

export function isoUtc(ms) {
  const n = Number(ms);
  if (!Number.isFinite(n) || n <= 0) return null;
  const d = new Date(n);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function normalizeIso(value) {
  if (typeof value !== 'string' || !value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** Resolves the default snapshot: $WORKLOG_SNAPSHOT, then newest ./snapshots/*.zip, then newest ./worklog-backup-*.zip. */
export async function resolveDefaultSnapshot(cwd = process.cwd()) {
  const fromEnv = process.env.WORKLOG_SNAPSHOT;
  if (fromEnv) return path.resolve(cwd, fromEnv);

  const candidates = [];
  for (const dir of [path.join(cwd, 'snapshots'), cwd]) {
    let names = [];
    try {
      names = await fs.readdir(dir);
    } catch {
      continue;
    }
    for (const name of names) {
      if (!/^worklog-backup-.*\.zip$/i.test(name)) continue;
      const full = path.join(dir, name);
      try {
        const st = await fs.stat(full);
        if (st.isFile()) candidates.push({ full, mtime: st.mtimeMs });
      } catch {
        /* ignore */
      }
    }
  }
  if (!candidates.length) return null;
  candidates.sort((a, b) => b.mtime - a.mtime);
  return candidates[0].full;
}

function parseManifest(raw) {
  let manifest;
  try {
    manifest = JSON.parse(raw.toString('utf8'));
  } catch {
    throw new ToolError('INVALID_INPUT', 'manifest.json is not valid JSON');
  }
  if (!manifest || typeof manifest !== 'object') {
    throw new ToolError('INVALID_INPUT', 'manifest.json must be an object');
  }
  if (manifest.app !== 'worklog') {
    throw new ToolError('INVALID_INPUT', `not a Worklog snapshot (app=${JSON.stringify(manifest.app)})`);
  }
  if (!Array.isArray(manifest.workspaces) || !Array.isArray(manifest.blocks) || !Array.isArray(manifest.files)) {
    throw new ToolError('INVALID_INPUT', 'manifest.json is missing workspaces/blocks/files arrays');
  }
  const schema = Number(manifest.schema);
  if (!Number.isFinite(schema) || schema < 4) {
    throw new ToolError('INVALID_INPUT', `unsupported snapshot schema: ${manifest.schema}`);
  }
  if (manifest.backupMode && /split/i.test(String(manifest.backupMode))) {
    throw new ToolError('INVALID_INPUT', 'split ZIP backups are not supported; export a single full backup (ZIP)');
  }
  return manifest;
}

function normalizeBlock(raw) {
  const key = String(raw && raw.key ? raw.key : '');
  const slotKey = String((raw && raw.slotKey) || (key.includes('::') ? key.split('::').pop() : key) || '');
  const idx = slotKey.lastIndexOf('_');
  const date = idx >= 0 ? slotKey.slice(0, idx) : '';
  const time = idx >= 0 ? slotKey.slice(idx + 1) : '';
  const tags = Array.isArray(raw && raw.tags) ? raw.tags.map((t) => String(t)).filter(Boolean) : [];
  const fileIds = Array.isArray(raw && raw.fileIds) ? raw.fileIds.map((id) => String(id)) : [];
  return {
    key,
    slotKey,
    workspaceId: raw && raw.workspaceId ? String(raw.workspaceId) : '',
    title: String((raw && raw.title) || ''),
    body: String((raw && raw.body) || ''),
    tags,
    prio: String((raw && raw.prio) || ''),
    status: String((raw && raw.status) || ''),
    loc: String((raw && raw.loc) || ''),
    startTime: String((raw && raw.startTime) || ''),
    endTime: String((raw && raw.endTime) || ''),
    fileIds,
    updatedAt: Number((raw && raw.updatedAt) || 0) || 0,
    version: (raw && raw.version) || null,
    filesPurgedAt: Number((raw && raw.filesPurgedAt) || 0) || 0,
    date,
    time,
  };
}

function buildFileIndex(manifest) {
  if (manifest.files.length > LIMITS.maxAttachments) {
    throw new ToolError(
      'INVALID_INPUT',
      `snapshot has ${manifest.files.length} attachments; limit is ${LIMITS.maxAttachments}`,
    );
  }
  const byId = new Map();
  let total = 0;
  for (const raw of manifest.files) {
    const id = String((raw && raw.id) || '');
    if (!id) throw new ToolError('INVALID_INPUT', 'attachment entry without id');
    if (byId.has(id)) throw new ToolError('INVALID_INPUT', `duplicate attachment id: ${id}`);

    const rel = String((raw && raw.path) || '');
    if (isUnsafeName(rel) || !rel.startsWith(ATTACHMENT_PREFIX)) {
      throw new ToolError('INVALID_INPUT', `unsafe attachment path in manifest: ${JSON.stringify(rel)}`);
    }
    const size = Number((raw && raw.size) || 0);
    if (!Number.isFinite(size) || size < 0) {
      throw new ToolError('INVALID_INPUT', `invalid attachment size for ${id}`);
    }
    if (size > LIMITS.maxAttachmentBytes) {
      throw new ToolError(
        'INVALID_INPUT',
        `attachment ${raw.name || id} is ${size} bytes; per-file limit is ${LIMITS.maxAttachmentBytes}`,
      );
    }
    total += size;
    if (total > LIMITS.maxTotalAttachmentBytes) {
      throw new ToolError(
        'INVALID_INPUT',
        `snapshot attachments total ${total} bytes; limit is ${LIMITS.maxTotalAttachmentBytes}`,
      );
    }
    byId.set(id, {
      id,
      name: String((raw && raw.name) || id),
      type: String((raw && raw.type) || 'application/octet-stream'),
      size,
      path: rel,
      workspaceId: raw && raw.workspaceId ? String(raw.workspaceId) : '',
    });
  }
  return { byId, total };
}

function assemble({ absolutePath, kind, manifest, fileById, attachmentBytes, readBytes }) {
  const blocks = manifest.blocks.map(normalizeBlock);
  const workspaces = new Map(
    manifest.workspaces.map((w) => [String((w && w.id) || ''), String((w && w.name) || '')]),
  );
  let consumed = 0;
  return {
    path: absolutePath,
    kind,
    manifest,
    blocks,
    workspaces,
    files: [...fileById.values()],
    fileById,
    stats: { blocks: blocks.length, attachments: fileById.size, attachmentBytes },
    async readAttachment(fileId) {
      const meta = fileById.get(String(fileId));
      if (!meta) throw new ToolError('INVALID_INPUT', `attachment not present in snapshot manifest: ${fileId}`);
      const buf = await readBytes(meta);
      consumed += buf.length;
      if (consumed > LIMITS.maxTotalAttachmentBytes) {
        throw new ToolError(
          'INVALID_INPUT',
          `attachments read exceed total limit (${LIMITS.maxTotalAttachmentBytes} bytes)`,
        );
      }
      if (meta.size > 0 && buf.length !== meta.size) {
        throw new ToolError(
          'INVALID_INPUT',
          `attachment size mismatch for ${meta.name}: manifest ${meta.size}, actual ${buf.length}`,
        );
      }
      return buf;
    },
  };
}

async function openZipSnapshot(absolutePath, buf) {
  const zip = readZip(buf, { maxArchiveBytes: LIMITS.maxArchiveBytes });
  if (!zip.has('manifest.json')) {
    throw new ToolError('INVALID_INPUT', 'snapshot ZIP does not contain manifest.json');
  }
  const rawManifest = zip.read('manifest.json', { maxOutputLength: LIMITS.maxManifestBytes });
  const manifest = parseManifest(rawManifest);
  const { byId, total } = buildFileIndex(manifest);

  // Every referenced attachment must exist in the archive (checked lazily, but
  // fail fast for obvious omissions so `health` is meaningful).
  for (const meta of byId.values()) {
    if (!zip.has(meta.path)) {
      throw new ToolError('INVALID_INPUT', `snapshot ZIP is missing attachment: ${meta.path}`);
    }
  }

  return assemble({
    absolutePath,
    kind: 'zip',
    manifest,
    fileById: byId,
    attachmentBytes: total,
    readBytes: async (meta) => zip.read(meta.path, { maxOutputLength: LIMITS.maxAttachmentBytes }),
  });
}

async function openDirSnapshot(absolutePath) {
  const manifestPath = path.join(absolutePath, 'manifest.json');
  let st;
  try {
    st = await fs.stat(manifestPath);
  } catch {
    throw new ToolError('SNAPSHOT_NOT_FOUND', `snapshot directory has no manifest.json: ${absolutePath}`, true);
  }
  if (!st.isFile()) throw new ToolError('INVALID_INPUT', 'manifest.json is not a file');
  if (st.size > LIMITS.maxManifestBytes) {
    throw new ToolError('INVALID_INPUT', `manifest.json too large: ${st.size} bytes`);
  }
  const manifest = parseManifest(await fs.readFile(manifestPath));
  const { byId, total } = buildFileIndex(manifest);

  for (const meta of byId.values()) {
    const full = path.join(absolutePath, meta.path);
    const rel = path.relative(absolutePath, full);
    if (rel.startsWith('..') || path.isAbsolute(rel)) {
      throw new ToolError('INVALID_INPUT', `attachment path escapes snapshot directory: ${meta.path}`);
    }
    let fst;
    try {
      fst = await fs.stat(full);
    } catch {
      throw new ToolError('INVALID_INPUT', `snapshot directory is missing attachment: ${meta.path}`);
    }
    if (!fst.isFile()) throw new ToolError('INVALID_INPUT', `attachment is not a file: ${meta.path}`);
    if (fst.size > LIMITS.maxAttachmentBytes) {
      throw new ToolError('INVALID_INPUT', `attachment too large: ${meta.path} (${fst.size} bytes)`);
    }
  }

  return assemble({
    absolutePath,
    kind: 'dir',
    manifest,
    fileById: byId,
    attachmentBytes: total,
    readBytes: async (meta) => {
      const full = path.join(absolutePath, meta.path);
      const rel = path.relative(absolutePath, full);
      if (rel.startsWith('..') || path.isAbsolute(rel)) {
        throw new ToolError('INVALID_INPUT', `attachment path escapes snapshot directory: ${meta.path}`);
      }
      return fs.readFile(full);
    },
  });
}

/**
 * Opens a snapshot by path (ZIP file or directory). Falls back to the default
 * resolution when `fromPath` is empty.
 */
export async function openSnapshot(fromPath, { cwd = process.cwd() } = {}) {
  const target = fromPath ? path.resolve(cwd, fromPath) : await resolveDefaultSnapshot(cwd);
  if (!target) {
    throw new ToolError(
      'SNAPSHOT_NOT_FOUND',
      'no snapshot provided and none found (searched $WORKLOG_SNAPSHOT, ./snapshots, .)',
      true,
    );
  }
  let st;
  try {
    st = await fs.stat(target);
  } catch {
    throw new ToolError('SNAPSHOT_NOT_FOUND', `snapshot not found: ${target}`, true);
  }
  if (st.isDirectory()) return openDirSnapshot(target);
  if (!st.isFile()) throw new ToolError('SNAPSHOT_NOT_FOUND', `snapshot is not a file or directory: ${target}`, true);
  if (st.size > LIMITS.maxArchiveBytes) {
    throw new ToolError('INVALID_INPUT', `snapshot archive too large: ${st.size} bytes`);
  }
  const buf = await fs.readFile(target);
  return openZipSnapshot(target, buf);
}
