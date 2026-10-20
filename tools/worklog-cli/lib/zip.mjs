// Minimal, dependency-free ZIP reader/writer.
// Reader supports STORE (0) and DEFLATE (8), ZIP64 sizes/offsets.
// Writer is STORE-only and used for the bundled sample and contract tests.
import zlib from 'node:zlib';
import { ToolError } from './errors.mjs';

const SIG_LOCAL = 0x04034b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_EOCD = 0x06054b50;
const SIG_EOCD64 = 0x06064b50;
const SIG_EOCD64_LOC = 0x07064b50;

/** Rejects absolute paths, drive letters, backslashes, "." and ".." segments. */
export function isUnsafeName(name) {
  if (typeof name !== 'string' || name.length === 0) return true;
  if (name.includes('\\')) return true;
  if (name.startsWith('/')) return true;
  if (/^[A-Za-z]:/.test(name)) return true;
  return name.split('/').some((part) => part === '..' || part === '.');
}

function u64(buf, off) {
  const value = buf.readBigUInt64LE(off);
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new ToolError('INVALID_INPUT', 'ZIP field exceeds safe integer range');
  }
  return Number(value);
}

function findEocd(buf) {
  const min = Math.max(0, buf.length - 22 - 0xffff);
  for (let i = buf.length - 22; i >= min; i--) {
    if (buf.readUInt32LE(i) === SIG_EOCD) return i;
  }
  return -1;
}

function readZip64Eocd(buf, eocd) {
  let locator = -1;
  for (let i = eocd - 20; i >= Math.max(0, eocd - 20 - 8); i--) {
    if (i + 4 <= buf.length && buf.readUInt32LE(i) === SIG_EOCD64_LOC) {
      locator = i;
      break;
    }
  }
  if (locator < 0) return null;
  const eocd64Offset = u64(buf, locator + 8);
  if (eocd64Offset + 56 > buf.length) {
    throw new ToolError('INVALID_INPUT', 'ZIP64 end-of-central-directory out of bounds');
  }
  if (buf.readUInt32LE(eocd64Offset) !== SIG_EOCD64) {
    throw new ToolError('INVALID_INPUT', 'ZIP64 end-of-central-directory signature mismatch');
  }
  return {
    count: u64(buf, eocd64Offset + 32),
    cdSize: u64(buf, eocd64Offset + 40),
    cdOffset: u64(buf, eocd64Offset + 48),
  };
}

function readZip64Extra(extra, needSize, needComp, needOffset) {
  let p = 0;
  while (p + 4 <= extra.length) {
    const id = extra.readUInt16LE(p);
    const len = extra.readUInt16LE(p + 2);
    const body = extra.subarray(p + 4, p + 4 + len);
    if (id === 0x0001) {
      let q = 0;
      const out = {};
      if (needSize) {
        if (q + 8 > body.length) throw new ToolError('INVALID_INPUT', 'ZIP64 extra field truncated (size)');
        out.size = Number(body.readBigUInt64LE(q));
        q += 8;
      }
      if (needComp) {
        if (q + 8 > body.length) throw new ToolError('INVALID_INPUT', 'ZIP64 extra field truncated (compressed size)');
        out.compSize = Number(body.readBigUInt64LE(q));
        q += 8;
      }
      if (needOffset) {
        if (q + 8 > body.length) throw new ToolError('INVALID_INPUT', 'ZIP64 extra field truncated (offset)');
        out.localOffset = Number(body.readBigUInt64LE(q));
      }
      return out;
    }
    p += 4 + len;
  }
  return {};
}

function readEntry(buf, entry, maxOutputLength) {
  const lo = entry.localOffset;
  if (lo + 30 > buf.length) throw new ToolError('INVALID_INPUT', 'ZIP local header out of bounds');
  if (buf.readUInt32LE(lo) !== SIG_LOCAL) throw new ToolError('INVALID_INPUT', 'ZIP local header signature mismatch');
  const nameLen = buf.readUInt16LE(lo + 26);
  const extraLen = buf.readUInt16LE(lo + 28);
  const start = lo + 30 + nameLen + extraLen;
  if (start + entry.compSize > buf.length) throw new ToolError('INVALID_INPUT', 'ZIP entry data out of bounds');
  const data = buf.subarray(start, start + entry.compSize);

  if (entry.method === 0) {
    if (maxOutputLength != null && data.length > maxOutputLength) {
      throw new ToolError('INVALID_INPUT', `archive entry exceeds size limit: ${entry.name}`);
    }
    if (maxOutputLength != null && data.length !== entry.size) {
      throw new ToolError('INVALID_INPUT', `archive entry size mismatch: ${entry.name}`);
    }
    return Buffer.from(data);
  }

  if (entry.method === 8) {
    let out;
    try {
      out = zlib.inflateRawSync(data, maxOutputLength != null ? { maxOutputLength } : undefined);
    } catch (err) {
      if (err && (err.code === 'ERR_BUFFER_TOO_LARGE' || /maxOutputLength/i.test(String(err && err.message)))) {
        throw new ToolError('INVALID_INPUT', `archive entry exceeds size limit (possible ZIP bomb): ${entry.name}`);
      }
      throw new ToolError('INVALID_INPUT', `cannot inflate archive entry: ${entry.name}`);
    }
    if (maxOutputLength != null && out.length > maxOutputLength) {
      throw new ToolError('INVALID_INPUT', `archive entry exceeds size limit: ${entry.name}`);
    }
    if (out.length !== entry.size) {
      throw new ToolError('INVALID_INPUT', `archive entry size mismatch: ${entry.name}`);
    }
    return out;
  }

  throw new ToolError('INVALID_INPUT', `unsupported ZIP compression method ${entry.method}: ${entry.name}`);
}

/**
 * Reads a ZIP archive in memory.
 * @returns {{entries: Map<string, object>, has: (n:string)=>boolean, read: (n:string, opt?:{maxOutputLength?:number})=>Buffer, list: ()=>string[]}}
 */
export function readZip(buf, { maxArchiveBytes = 256 * 1024 * 1024 } = {}) {
  if (!Buffer.isBuffer(buf) || buf.length < 22) throw new ToolError('INVALID_INPUT', 'not a ZIP archive');
  if (buf.length > maxArchiveBytes) {
    throw new ToolError('INVALID_INPUT', `snapshot archive too large (${buf.length} > ${maxArchiveBytes} bytes)`);
  }

  const eocd = findEocd(buf);
  if (eocd < 0) throw new ToolError('INVALID_INPUT', 'not a ZIP archive (end of central directory not found)');

  let count = buf.readUInt16LE(eocd + 10);
  let cdSize = buf.readUInt32LE(eocd + 12);
  let cdOffset = buf.readUInt32LE(eocd + 16);

  if (count === 0xffff || cdSize === 0xffffffff || cdOffset === 0xffffffff) {
    const z = readZip64Eocd(buf, eocd);
    if (!z) throw new ToolError('INVALID_INPUT', 'ZIP64 locator missing');
    count = z.count;
    cdSize = z.cdSize;
    cdOffset = z.cdOffset;
  }

  if (cdOffset + cdSize > buf.length) {
    throw new ToolError('INVALID_INPUT', 'ZIP central directory out of bounds');
  }

  const entries = new Map();
  let p = cdOffset;
  for (let i = 0; i < count; i++) {
    if (p + 46 > buf.length) throw new ToolError('INVALID_INPUT', 'ZIP central directory truncated');
    if (buf.readUInt32LE(p) !== SIG_CENTRAL) {
      throw new ToolError('INVALID_INPUT', 'ZIP central directory signature mismatch');
    }
    const method = buf.readUInt16LE(p + 10);
    const crc = buf.readUInt32LE(p + 16);
    let compSize = buf.readUInt32LE(p + 20);
    let size = buf.readUInt32LE(p + 24);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    let localOffset = buf.readUInt32LE(p + 42);

    const name = buf.subarray(p + 46, p + 46 + nameLen).toString('utf8');
    const extra = buf.subarray(p + 46 + nameLen, p + 46 + nameLen + extraLen);

    const needSize = size === 0xffffffff;
    const needComp = compSize === 0xffffffff;
    const needOffset = localOffset === 0xffffffff;
    if (needSize || needComp || needOffset) {
      const z = readZip64Extra(extra, needSize, needComp, needOffset);
      if (needSize) size = z.size;
      if (needComp) compSize = z.compSize;
      if (needOffset) localOffset = z.localOffset;
    }

    if (isUnsafeName(name)) {
      throw new ToolError('INVALID_INPUT', `unsafe archive entry name: ${JSON.stringify(name)}`);
    }
    if (entries.has(name)) throw new ToolError('INVALID_INPUT', `duplicate archive entry: ${name}`);

    entries.set(name, { name, method, crc, compSize, size, localOffset });
    p += 46 + nameLen + extraLen + commentLen;
  }

  return {
    entries,
    has(name) {
      return entries.has(name);
    },
    list() {
      return [...entries.keys()];
    },
    read(name, opt = {}) {
      const entry = entries.get(name);
      if (!entry) throw new ToolError('INVALID_INPUT', `archive entry not found: ${name}`);
      return readEntry(buf, entry, opt.maxOutputLength);
    },
  };
}

// ---------------------------------------------------------------------------
// Writer (STORE only) — used by make-sample and contract tests.
// ---------------------------------------------------------------------------

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/**
 * Writes a STORE-only ZIP. Deterministic timestamps (2026-01-01T00:00:00Z).
 * @param {Array<{name: string, data: Buffer|string}>} entries
 */
export function writeZip(entries, { deflate = false } = {}) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  const dosTime = 0;
  const dosDate = ((2026 - 1980) & 127) << 9 | (1 << 5) | 1; // 2026-01-01 00:00:00

  for (const entry of entries) {
    const nameBuf = Buffer.from(entry.name, 'utf8');
    const data = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(String(entry.data), 'utf8');
    const payload = deflate ? zlib.deflateRawSync(data) : data;
    const method = deflate ? 8 : 0;
    const crc = crc32(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(SIG_LOCAL, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6); // UTF-8 names
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(dosTime, 10);
    local.writeUInt16LE(dosDate, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(payload.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);

    localParts.push(local, nameBuf, payload);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(SIG_CENTRAL, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt16LE(dosTime, 12);
    central.writeUInt16LE(dosDate, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(payload.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);

    centralParts.push(central, nameBuf);
    offset += local.length + nameBuf.length + payload.length;
  }

  const centralBuf = Buffer.concat(centralParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(SIG_EOCD, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, centralBuf, eocd]);
}
