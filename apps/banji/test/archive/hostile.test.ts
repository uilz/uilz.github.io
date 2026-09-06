// R13·D2 敌手电池 · 上篇（结构敌手与炸弹）。.banjizip 是伴记唯一「用户数据越过代码」的
// 信任边界，历轮只挨过逻辑损坏（R2 七连），没挨过敌手构造——本轮补挨。每案四证：
// (a) typed rejection 带对闸码；(b) snapshotRepo 前后逐字节相等（§14 失败不破现有数据）；
// (c) 时长有界（无界工即 bug）；(d) rejectCopy 人话在册、raw 码只住 detail。
import { afterEach, describe, expect, it } from 'vitest'
import { deleteDatabase, openRepo } from '../../src/repository/repo'
import type { Repo } from '../../src/repository/types'
import { exportArchive } from '../../src/archive/exportArchive'
import { importArchive, type ImportResult } from '../../src/archive/importArchive'
import { rejectCopy } from '../../src/archive/rejectCopy'
import type { PreflightCode } from '../../src/archive/preflight'
import { ASSET_DIR } from '../../src/archive/format'
import { buildWorld, FIXED_NOW, seedRepoWorld, snapshotRepo, unzipAll } from '../archiveFixtures'
import { buildArchive, emptyUniverse, flipEntryBytes, manifestBytes, text, withLyingEntrySize } from './zipcraft'

const FAIL = 5_000 // 时长上界（ms）：无界工作一律算失败
let seq = 0
const tracked: Array<() => Promise<void>> = []
afterEach(async () => {
  while (tracked.length > 0) await tracked.pop()?.()
})

async function seeded(): Promise<Repo> {
  const name = `banji-hostile-${String(++seq)}`
  const repo = await openRepo({ name })
  tracked.push(async () => {
    repo.close()
    await deleteDatabase(name)
  })
  await seedRepoWorld(repo, await buildWorld())
  return repo
}

type Fail = Extract<ImportResult, { ok: false }>

function assertCopied(reason: string): void {
  const line = rejectCopy({ code: reason as PreflightCode }, '证据')
  expect(line.length, `${reason} 无人话`).toBeGreaterThan(4)
  expect(line, `${reason} 走了兜底门`).not.toContain('没通过核对')
  expect(line, `${reason} 裸奔`).not.toContain(reason)
}

async function expectRejected(zip: Uint8Array, reason: string, detailRx?: RegExp): Promise<Fail> {
  const repo = await seeded()
  const before = await snapshotRepo(repo)
  const t0 = performance.now()
  const r = await importArchive(zip, { repo })
  const ms = performance.now() - t0
  if (r.ok) throw new Error(`应拒 ${reason}，却导入成功`)
  expect(r.reason).toBe(reason)
  if (detailRx !== undefined) expect(r.detail).toMatch(detailRx)
  expect(r.userMessage).toContain('完好无损')
  expect(ms, `无界工：${String(ms)}ms`).toBeLessThan(FAIL)
  expect(await snapshotRepo(repo)).toEqual(before)
  assertCopied(reason)
  console.log(`[R13] ${reason} 拒于 ${String(Math.round(ms))}ms`)
  return r
}

// —— 炸弹主体：200 MB 全零资产（deflate 后 ~200 KB）。全电池共用一次构造。 ——
const BOMB_SIZE = 200 * 1024 * 1024
const BOMB_HASH = 'b'.repeat(64)
const bombCraft = [
  { name: 'manifest.json', data: manifestBytes({ counts: { journals: 0, cards: 0, edges: 0, assets: 1 }, assets: [{ hash: BOMB_HASH, mime: 'application/octet-stream', size: BOMB_SIZE }] }) },
  { name: 'journals.json', data: text('[]') },
  { name: 'edges.json', data: text('[]') },
  { name: 'settings.json', data: text('[]') },
  { name: `${ASSET_DIR}${BOMB_HASH}`, data: new Uint8Array(BOMB_SIZE), store: false },
]
let bombZipPromise: Promise<Uint8Array> | null = null
const bombZip = async (): Promise<Uint8Array> => {
  if (bombZipPromise === null) bombZipPromise = Promise.resolve(buildArchive(bombCraft))
  return bombZipPromise
}
const lieManifest = (declared: number): Uint8Array =>
  manifestBytes({ counts: { journals: 0, cards: 0, edges: 0, assets: 1 }, assets: [{ hash: BOMB_HASH, mime: 'application/octet-stream', size: declared }] })

describe('R13·D2 上篇 · 炸弹/路径/爆量/封蜡', () => {
  it('BOMB-a 200MB 诚实承诺 + 配额不足 → quota_exceeded：正文一字未解（承诺先行算账）', async () => {
    const zip = await bombZip()
    const repo = await seeded()
    const before = await snapshotRepo(repo)
    const t0 = performance.now()
    const r = await importArchive(zip, { repo, estimate: async () => ({ quota: 10_000_000, usage: 0 }) })
    const ms = performance.now() - t0
    if (r.ok) throw new Error('200MB 诚实炸弹竟被收下')
    expect(r.reason).toBe('quota_exceeded')
    expect(r.detail).toContain(`needed=${String(BOMB_SIZE)}`)
    expect(ms, `配额门未跑在解压前：${String(Math.round(ms))}ms`).toBeLessThan(1500)
    expect(await snapshotRepo(repo)).toEqual(before)
  })

  it('BOMB-b 承诺 1KB 实为 200MB（头也诚实）→ entry_oversize 于闸一，零字节解压', async () => {
    const lied = buildArchive([
      { name: 'manifest.json', data: lieManifest(1024) },
      ...bombCraft.slice(1),
    ])
    await expectRejected(lied, 'archive.entry_oversize', /头里自称 209715200/)
  })

  it('BOMB-c 双重谎（名册+本地头都报小）→ 闸二流路停喂：实解字节 ≪ 200MB', async () => {
    const lied = buildArchive([
      { name: 'manifest.json', data: lieManifest(1024) },
      ...bombCraft.slice(1),
    ])
    const doubleLie = withLyingEntrySize(lied, `${ASSET_DIR}${BOMB_HASH}`, 1024)
    const repo = await seeded()
    const before = await snapshotRepo(repo)
    const t0 = performance.now()
    const r = await importArchive(doubleLie, { repo })
    const ms = performance.now() - t0
    if (r.ok) throw new Error('双谎炸弹被收下')
    expect(r.reason).toBe('archive.entry_oversize')
    const counted = Number(/解压 (\d+) 字节/.exec(String(r.detail))?.[1] ?? Number.NaN)
    expect(counted).toBeLessThan(8_000_000) // 流停证据：越界即死，不是全量展开（200MB=209715200）
    console.log(`[R13] 闸二取证：停喂时计得 ${String(counted)} 字节 vs 真身 209,715,200 字节 · ${String(Math.round(ms))}ms`)
    expect(ms).toBeLessThan(FAIL)
    expect(await snapshotRepo(repo)).toEqual(before)
  })

  it('TRAVERSAL assets/../../../etc/passwd → entry_name（名不合册，零字节陪葬）', async () => {
    const zip = buildArchive([...emptyUniverse(), { name: 'assets/../../../etc/passwd', data: text(' passwd') }])
    await expectRejected(zip, 'archive.entry_name', /名不合册/)
  })

  it('EXPLOSION 25000 条合法名册小条目 → entry_count 封顶', async () => {
    const crafts = [...emptyUniverse()]
    for (let i = 0; i < 25_000; i += 1) crafts.push({ name: `assets/${String(i.toString(16).padStart(64, '0'))}`, data: new Uint8Array(0) })
    const zip = buildArchive(crafts)
    await expectRejected(zip, 'archive.entry_count', /已见 20001 条/)
  })

  it('CRC·封蜡裂：翻转 deflate 页字节 → archive.corrupt 干净拒（fflate 之疯被接住，不当场爆炸）', async () => {
    const repo = await seeded()
    const out = await exportArchive(repo, { now: () => FIXED_NOW })
    if (!out.ok) throw new Error(out.userMessage)
    await expectRejected(flipEntryBytes(out.zip, 'journals.json', [5]), 'archive.corrupt', /journals\.json: invalid (length\/literal|distance code)/)
  })

  it('CRC·纵深：stored 资产偷改一字（流层无感）→ 内容寻址闸（hash_mismatch）兜杀', async () => {
    const repo0 = await seeded()
    const out = await exportArchive(repo0, { now: () => FIXED_NOW })
    if (!out.ok) throw new Error(out.userMessage)
    const firstName = unzipAll(out.zip).find((e) => e.name.startsWith(ASSET_DIR))?.name
    if (firstName === undefined) throw new Error('夹具缺资产条目')
    await expectRejected(flipEntryBytes(out.zip, firstName, [1]), 'asset.hash_mismatch')
  })

  it('MIXED：合式名册 + 一张敌手名（还有真资产）→ entry_name 抢先，哈希工作一秒没跑', async () => {
    const zip = buildArchive([
      ...emptyUniverse(),
      { name: `assets/${'a'.repeat(63)}f`, data: new Uint8Array(64) },
      { name: 'assets/..%2f..%2fjournals.json', data: text('{}') },
    ])
    await expectRejected(zip, 'archive.entry_name', /名不合册/)
  })
})
