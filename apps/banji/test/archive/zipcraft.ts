// R13·D2 敌手档案作坊：字节级现构造，零二进制夹具入库（fflate zipSync 主建 +
// LFH 解析改造）。zipSync 吃 Record 会折叠重名 ⇒ 重名档用两份档案字节拼接手造
// （fflate 流式 Unzip 按本地头顺序读取，同名重现是拼接的既成事实）；
// 头尺寸伪造/CRC 破坏 = 解析出条目数据区后精确翻字节。所有构造确定性、可复跑。
import { strToU8, zipSync } from 'fflate'
import { sha256Hex } from '../../src/archive/hash'

export const utf8c = new TextEncoder()

export interface Craft {
  readonly name: string
  readonly data: Uint8Array
  readonly store?: boolean
}

export function buildArchive(crafts: readonly Craft[]): Uint8Array<ArrayBuffer> {
  const entries: Record<string, [Uint8Array, { level: number }]> = {}
  for (const c of crafts) entries[c.name] = [c.data, { level: c.store === true ? 0 : 6 }]
  return zipSync(entries)
}

export const text = (s: string): Uint8Array => utf8c.encode(s)

/** 名册合法（ENTRY_NAME_RE 能进）但内容敌手的名字由调用方自定；此处只做正文的诚实拼装。 */
export async function assetCraft(content: Uint8Array): Promise<{ name: string; data: Uint8Array; hash: string; size: number }> {
  const hash = await sha256Hex(content)
  return { name: `assets/${hash}`, data: content, hash, size: content.byteLength }
}

export interface ManifestParts {
  readonly counts?: Record<string, unknown>
  readonly assets?: readonly unknown[]
  readonly schemaVersion?: unknown
  readonly hashAlgo?: unknown
  readonly app?: unknown
}

export function manifestBytes(over: ManifestParts = {}): Uint8Array {
  return text(JSON.stringify({
    app: 'banji',
    schemaVersion: 1,
    hashAlgo: 'sha256',
    appVersion: '9.9.9',
    exportedAt: '2026-09-06T00:00:00.000Z',
    counts: over.counts ?? { journals: 0, cards: 0, edges: 0, assets: 0 },
    assets: over.assets ?? [],
  }))
}

/** 最小合式空宇宙（四个定名 JSON 全齐，counts 诚实为 0）。 */
export function emptyUniverse(): Craft[] {
  return [
    { name: 'manifest.json', data: manifestBytes() },
    { name: 'journals.json', data: text('[]') },
    { name: 'edges.json', data: text('[]') },
    { name: 'settings.json', data: text('[]') },
  ]
}

export function concatArchives(...zips: readonly Uint8Array[]): Uint8Array<ArrayBuffer> {
  const total = zips.reduce((acc, z) => acc + z.byteLength, 0)
  const out = new Uint8Array(total)
  let at = 0
  for (const z of zips) {
    out.set(z, at)
    at += z.byteLength
  }
  return out
}

export interface EntryLocation {
  readonly headerStart: number
  readonly dataStart: number
  readonly compressedSize: number
  readonly method: number
  readonly uncompressedSize: number
}

function viewOf(zip: Uint8Array): DataView {
  return new DataView(zip.buffer, zip.byteOffset, zip.byteLength)
}

/** 从首个本地头起链式走位，找指定条目的字节坐标（本项目档案连续成串；找不到返回 null）。 */
export function findEntry(zip: Uint8Array, name: string): EntryLocation | null {
  const v = viewOf(zip)
  let i = 0
  while (i + 30 <= zip.byteLength && v.getUint32(i, true) === 0x04034b50) {
    const flags = v.getUint16(i + 6, true)
    const method = v.getUint16(i + 8, true)
    const csz = v.getUint32(i + 18, true)
    const usz = v.getUint32(i + 22, true)
    const fnl = v.getUint16(i + 26, true)
    const esl = v.getUint16(i + 28, true)
    const nm = new TextDecoder().decode(zip.subarray(i + 30, i + 30 + fnl))
    const dataStart = i + 30 + fnl + esl
    if (nm === name) return { headerStart: i, dataStart, compressedSize: csz, method, uncompressedSize: usz }
    if (csz === 0 && method === 0) return null
    i = dataStart + csz + ((flags & 8) !== 0 ? 16 : 0)
  }
  return null
}

/** 复制并篡改指定条目的数据区字节（CRC/正文破坏的确定性手术）。 */
export function flipEntryBytes(zip: Uint8Array, name: string, offsets: readonly number[], xor = 0x3f): Uint8Array<ArrayBuffer> {
  const loc = findEntry(zip, name)
  if (loc === null) throw new Error(`作坊：档案里找不到条目 ${name}`)
  const out = zip.slice()
  for (const off of offsets) out[loc.dataStart + off] ^= xor
  return out
}

/** 谎言手术：把指定条目的本地头「解压后尺寸」改写为任意值（头对名册的二次账）。 */
export function withLyingEntrySize(zip: Uint8Array, name: string, lieBytes: number): Uint8Array<ArrayBuffer> {
  const loc = findEntry(zip, name)
  if (loc === null) throw new Error(`作坊：档案里找不到条目 ${name}`)
  const out = zip.slice()
  new DataView(out.buffer, out.byteOffset, out.byteLength).setUint32(loc.headerStart + 22, lieBytes, true)
  return out
}

/** 确定性伪随机字节（垃圾档夹具：种子定、可复跑）。 */
export function seededRandom(seed: number, length: number): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(length)
  let state = seed >>> 0
  for (let i = 0; i < length; i += 4) {
    state ^= state << 13
    state ^= state >>> 17
    state ^= state << 5
    state >>>= 0
    out[i] = state & 0xff
    out[i + 1] = (state >>> 8) & 0xff
    out[i + 2] = (state >>> 16) & 0xff
    out[i + 3] = (state >>> 24) & 0xff
  }
  return out
}
