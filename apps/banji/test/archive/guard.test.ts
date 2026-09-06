// R13·D1 单元面：名册正则的敌手花样表、账簿封顶数学、承诺窄化、封面账、
// 流式解码的拒收/停喂/异常身份——闸的每个零件单独立秤（组合效果住 hostile 电池）。
import { describe, expect, it } from 'vitest'
import { assetHashOf, declareAssets, countLies, ENTRY_NAME_RE, GateFailure, MAX_ZIP_ENTRIES, nameLedger, SIZE_SLACK } from '../../src/archive/guard'
import { readAssetBodies, readCover } from '../../src/archive/view'
import { streamZipEntries, ZipParseError, type ZipEntryHeader } from '../../src/archive/zip'
import { strToU8, zipSync } from 'fflate'
import { rejectCopy } from '../../src/archive/rejectCopy'
import type { PreflightCode } from '../../src/archive/preflight'
import { findEntry } from './zipcraft'

const utf8 = new TextEncoder()

const hex64 = (seed: string): string => {
  let s = ''
  for (let i = 0; i < 64; i += 1) s += ((seed.charCodeAt(i % seed.length) * (i + 7) + i) % 16).toString(16)
  return s
}

describe('D1 名册正则 · 合法面', () => {
  const legal = ['manifest.json', 'journals.json', 'edges.json', 'settings.json', `assets/${'0a9a'.padEnd(64, '0')}`, `assets/${'f'.repeat(64)}`]
  for (const name of legal) {
    it(`收：${name.slice(0, 40)}`, () => expect(ENTRY_NAME_RE.test(name)).toBe(true))
  }
})

describe('D1 名册正则 · 敌手花样全落网', () => {
  const evil = [
    'assets/../../../etc/passwd',
    'assets/..%2f..%2fwindows',
    '../manifest.json',
    '/manifest.json',
    'assets/',
    'assets',
    '',
    'manifest.json ',
    'manifest.json\n',
    'MANIFEST.JSON',
    'Settings.json',
    'assets/ABCD',
    `assets/${'A'.repeat(64)}`,
    `assets/${'0'.repeat(63)}`,
    `assets/${'0'.repeat(65)}`,
    `assets/${'１'.repeat(64)}`,
    'assets/ааaa',
    `${'a'.repeat(64)}\u0301`,
    'assets/\u0000x',
    'assets\\evil.bin',
    './manifest.json',
    'assets//etc',
    'journals.json.json',
    'xjournals.json',
    'manifest.json\u200b',
  ]
  for (const name of evil) {
    it(`拒：${JSON.stringify(name).slice(0, 44)}`, () => expect(ENTRY_NAME_RE.test(name)).toBe(false))
  }
  it('assetHashOf 与名册同源：合式名必出 hash，敌手名必 null', () => {
    expect(assetHashOf(`assets/${'f'.repeat(64)}`)).toBe('f'.repeat(64))
    expect(assetHashOf('assets/FFFF')).toBeNull()
    expect(assetHashOf('manifest.json')).toBeNull()
  })
})

describe('D1 账簿与封顶数学', () => {
  it('MAX_ZIP_ENTRIES：恰满放行、越一即拒', () => {
    const ledger = nameLedger()
    const names = Array.from({ length: MAX_ZIP_ENTRIES + 1 }, (_, i) => `assets/${i.toString(16).padStart(64, '0')}`)
    for (const n of names.slice(0, MAX_ZIP_ENTRIES)) ledger.claim(n)
    const overflow = names[MAX_ZIP_ENTRIES]
    if (overflow === undefined) throw new Error('夹具坏')
    expect(() => ledger.claim(overflow)).toThrow(/已见 20001 条/)
  })
  it('病根有秩：合法重名第二笔即拒、非法名同样即拒——各归各码', () => {
    const ledger = nameLedger()
    ledger.claim('journals.json')
    expect(() => ledger.claim('journals.json')).toThrow(/同名两条/)
    expect(() => ledger.claim('../x')).toThrow(/名不合册/)
  })
  it('SIZE_SLACK 语义：承诺+松弛恰内放行、越一格即拒（诚实头走闸一零代价）', async () => {
    const probe = async (declared: number, real: number): Promise<{ ok: true } | { ok: false; reason: string; detail: string }> => {
      const h = hex64(`cap${String(declared)}-${String(real)}`)
      const zip = zipSync({
        'manifest.json': utf8.encode(JSON.stringify({ app: 'banji', schemaVersion: 1, hashAlgo: 'sha256', appVersion: 'x', exportedAt: '2026-01-01T00:00:00.000Z', counts: { journals: 0, cards: 0, edges: 0, assets: 1 }, assets: [{ hash: h, mime: 'application/octet-stream', size: declared }] })),
        'journals.json': utf8.encode('[]'),
        'edges.json': utf8.encode('[]'),
        'settings.json': utf8.encode('[]'),
        [`assets/${h}`]: [new Uint8Array(real), { level: 0 }],
      })
      const cover = readCover(zip)
      if (cover.declaration === null) throw new Error('夹具封面坏')
      try {
        await readAssetBodies(zip, cover.declaration)
        return { ok: true }
      } catch (err) {
        if (err instanceof GateFailure) return { ok: false, reason: err.code, detail: err.detail }
        throw err
      }
    }
    expect((await probe(100, 100 + SIZE_SLACK)).ok).toBe(true)
    const over = await probe(100, 100 + SIZE_SLACK + 1)
    if (over.ok) throw new Error('越界未拒')
    expect(over.reason).toBe('archive.entry_oversize')
    expect(over.detail).toMatch(/头里自称 1125/)
  })
  it('零字节承诺：正文恰 1024 放行、1025 拒（松弛窗边界）', async () => {
    const probe = async (real: number): Promise<boolean> => {
      const h = hex64(`zero-${String(real)}`)
      const zip = zipSync({
        'manifest.json': utf8.encode(JSON.stringify({ counts: { journals: 0, cards: 0, edges: 0, assets: 1 }, assets: [{ hash: h, size: 0, mime: 'm' }] })),
        'journals.json': utf8.encode('[]'),
        'edges.json': utf8.encode('[]'),
        'settings.json': utf8.encode('[]'),
        [`assets/${h}`]: [new Uint8Array(real), { level: 0 }],
      })
      const cover = readCover(zip)
      if (cover.declaration === null) throw new Error('夹具坏')
      try {
        await readAssetBodies(zip, cover.declaration)
        return true
      } catch (err) {
        if (err instanceof GateFailure && err.code === 'archive.entry_oversize') return false
        throw err
      }
    }
    expect(await probe(SIZE_SLACK)).toBe(true)
    expect(await probe(SIZE_SLACK + 1)).toBe(false)
  })
})

describe('D1 名册承诺窄化与封面账', () => {
  it('declareAssets：形状非法的索引条目静默缺席（权威判定住 preflight）、neededBytes 只加合式者', () => {
    const json = JSON.stringify({ assets: [{ hash: 'f'.repeat(64), mime: 'm', size: 10 }, { hash: 'nope', mime: 'm', size: 999 }, { hash: 'a'.repeat(64), mime: 'm', size: 'big' }, 7, null] })
    const d = declareAssets(json)
    expect(d?.neededBytes).toBe(10)
    expect(d?.sizes.size).toBe(1)
    expect(declareAssets('{oops')).toBeNull()
    expect(declareAssets(JSON.stringify({ assets: 5 }))).toBeNull()
  })
  it('countLies：全符 null；一项不符逐条点名', () => {
    const actual = { journals: 2, cards: 8, edges: 0, assets: 2 }
    expect(countLies({ counts: { ...actual } }, actual)).toBeNull()
    expect(countLies({ counts: { journals: 2, cards: 9, edges: 0, assets: 2 } }, actual)).toMatch(/cards 封面点 9、内页实 8/)
    expect(countLies({}, actual)).toMatch(/counts 缺失/)
    expect(countLies({ counts: { journals: 2.5, cards: 8, edges: 0, assets: 2 } }, actual)).toMatch(/journals=2\.5/)
  })
  it('readCover：诚实四页收齐、资产正文一字不解（封面不碰正文）', () => {
    const zip = zipSync({
      'manifest.json': [utf8.encode('{"counts":{"journals":0,"cards":0,"edges":0,"assets":1},"assets":[{"hash":"' + 'e'.repeat(64) + '","mime":"m","size":4}]}'), { level: 6 }],
      'journals.json': [utf8.encode('[]'), { level: 6 }],
      'edges.json': [utf8.encode('[]'), { level: 6 }],
      'settings.json': [utf8.encode('[]'), { level: 6 }],
      [`assets/${'e'.repeat(64)}`]: [strToU8('bodyy'), { level: 0 }],
    })
    const cover = readCover(zip)
    expect(cover.fields.get('manifest.json')).toContain('"assets"')
    expect(cover.declaration?.neededBytes).toBe(4)
    expect(cover.fields.get('journals.json')).toBe('[]')
  })
})

describe('D1 streamZipEntries 语义钉', () => {
  it('跳过（onEntry 返回 null）⇒ 该条目一字节不交付；本地头尺寸在拒收前就可读；后续条目照常过列', () => {
    const zip = zipSync({ 'a.json': [utf8.encode('{}'), { level: 6 }], 'b.bin': [new Uint8Array(64 * 1024).fill(7), { level: 9 }], 'c.json': [utf8.encode('[]'), { level: 6 }] })
    const seen: string[] = []
    let deliveredBig = 0
    streamZipEntries(zip, (head: ZipEntryHeader) => {
      seen.push(head.name)
      if (head.name === 'b.bin') {
        expect(head.declaredSize).toBe(65536)
        return null
      }
      return { chunk: () => undefined }
    })
    expect(seen).toEqual(['a.json', 'b.bin', 'c.json'])
    expect(deliveredBig).toBe(0)
  })
  it('sink 中途抛错 ⇒ 全场即刻中止、异常原物上浮（identity 是 instanceof 分诊的底座）；膨胀止于窗', () => {
    const zip = zipSync({ 'z.bin': [new Uint8Array(32 * 1024 * 1024), { level: 9 }] })
    const sentinel = new Error('STOP-ME')
    let chunks = 0
    let escaped: unknown = null
    try {
      streamZipEntries(zip, () => ({
        chunk: (d) => {
          chunks += d.byteLength
          throw sentinel
        },
      }))
    } catch (err) {
      escaped = err
    }
    expect(escaped).toBe(sentinel)
    expect(chunks).toBeGreaterThanOrEqual(1024)
    expect(chunks).toBeLessThan(8 * 1024 * 1024) // 32 MB 真身在第一片窗就死，不是全量之后
  })
  it('deflate 破坏（保留块头型必炸）→ ZipParseError inEntry=true 点名条目；无头垃圾安静完成（缺封面判罚归 readCover，两闸各司其职）', () => {
    const real = zipSync({ 'journals.json': [utf8.encode(JSON.stringify([{ date: 'x', cards: [], updatedAt: '2026-01-01T00:00:00.000Z' }])), { level: 6 }] })
    const cursed = real.slice()
    const loc = findEntry(real, 'journals.json')
    if (loc === null) throw new Error('夹具坏')
    cursed[loc.dataStart] = 0x06 // BFINAL=0, BTYPE=11（deflate 保留块型）⇒ inflate 必抛
    let err: unknown = null
    try {
      streamZipEntries(cursed, () => ({ chunk: () => undefined }))
    } catch (e) {
      err = e
    }
    expect(err).toBeInstanceOf(ZipParseError)
    if (!(err instanceof ZipParseError)) throw new Error('类型窄化')
    expect(err.inEntry).toBe(true)
    expect(err.entryName).toBe('journals.json')
    let completed = false
    try {
      streamZipEntries(utf8.encode('这不是ZIP'), () => null)
      completed = true
    } catch {
      completed = false
    }
    expect(completed).toBe(true)
  })
})

describe('R13 闸码人话在册（rejectCopy 表补登，raw 只住 detail）', () => {
  const newCodes: PreflightCode[] = ['archive.entry_name', 'archive.entry_dupe', 'archive.entry_count', 'archive.entry_oversize', 'asset.orphan_body', 'archive.manifest_missing', 'archive.pages_missing', 'archive.corrupt', 'archive.counts_mismatch']
  it('九码各有专属人话、互不撞、零裸奔', () => {
    const seen = new Map<string, string>()
    for (const code of newCodes) {
      const line = rejectCopy({ code }, '证据')
      expect(line.length, code).toBeGreaterThan(6)
      expect(line, code).not.toContain(code)
      expect(line, code).not.toContain('没通过核对')
      const clash = seen.get(line)
      expect(clash, `${code} 与 ${String(clash)} 撞文案`).toBeUndefined()
      seen.set(line, code)
    }
  })
})
