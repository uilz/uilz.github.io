// R13·D2 敌手电池 · 下篇（名册说谎/垃圾/缺页/重名/空宇宙/超额资产）。
// 断言纪律同上篇（四证）；裸历史码（archive_shape/zip_unreadable）的人话本家住
// migration/importArchive，rejectCopy 逐码验身只对预检/闸码家族跑。两条真路特别钉：
// 空宇宙成功经 BanjiApp 缝 + 注册提交门（R10 屏障原样搭乘），敌手拒信走同一条缝时
// 门一次都不该被敲。
import { afterEach, describe, expect, it } from 'vitest'
import { deleteDatabase, openRepo } from '../../src/repository/repo'
import type { CommitGate, Repo } from '../../src/repository/types'
import { createBanjiApp } from '../../src/application'
import { exportArchive } from '../../src/archive/exportArchive'
import { importArchive, type ImportResult } from '../../src/archive/importArchive'
import { rejectCopy } from '../../src/archive/rejectCopy'
import type { PreflightCode } from '../../src/archive/preflight'
import { sha256Hex } from '../../src/archive/hash'
import { ASSET_DIR, FILE_EDGES, FILE_JOURNALS, FILE_SETTINGS } from '../../src/archive/format'
import { buildWorld, FIXED_NOW, repackZip, seedRepoWorld, snapshotRepo, unzipAll, withManifest } from '../archiveFixtures'
import { buildArchive, concatArchives, emptyUniverse, manifestBytes, seededRandom, text, type Craft } from './zipcraft'

const FAIL = 5_000
let seq = 0
const tracked: Array<() => Promise<void>> = []
afterEach(async () => {
  while (tracked.length > 0) await tracked.pop()?.()
})

async function seeded(): Promise<Repo> {
  const name = `banji-hos2-${String(++seq)}`
  const repo = await openRepo({ name })
  tracked.push(async () => {
    repo.close()
    await deleteDatabase(name)
  })
  await seedRepoWorld(repo, await buildWorld())
  return repo
}

type Fail = Extract<ImportResult, { ok: false }>
type Files = Array<{ name: string; data: Uint8Array }>

function assertCopied(reason: string): void {
  const line = rejectCopy({ code: reason as PreflightCode }, '证据')
  expect(line.length, `${reason} 无人话`).toBeGreaterThan(4)
  expect(line, `${reason} 走了兜底门`).not.toContain('没通过核对')
  expect(line, `${reason} 裸奔`).not.toContain(reason)
}

function firstAssetOf(files: Files): string {
  const hit = files.find((f) => f.name.startsWith(ASSET_DIR))
  if (hit === undefined) throw new Error('夹具缺资产条目')
  return hit.name
}

async function assertRejected(r: ImportResult, reason: string, before: Record<string, unknown>, repo: Repo, t0: number, detailRx?: RegExp): Promise<Fail> {
  const ms = performance.now() - t0
  if (r.ok) throw new Error(`应拒 ${reason}，却导入成功`)
  expect(r.reason).toBe(reason)
  if (detailRx !== undefined) expect(r.detail).toMatch(detailRx)
  expect(r.userMessage).toContain('完好')
  expect(ms, `无界工：${String(ms)}ms`).toBeLessThan(FAIL)
  expect(await snapshotRepo(repo)).toEqual(before)
  console.log(`[R13·D2] ${reason} 拒于 ${String(Math.round(ms))}ms`)
  return r
}

function humanLine(reason: string): void {
  assertCopied(reason)
}

async function expectZipRejected(zip: Uint8Array, reason: string, detailRx?: RegExp, copyCheck = true): Promise<Fail> {
  const repo = await seeded()
  const before = await snapshotRepo(repo)
  const t0 = performance.now()
  const r = await assertRejected(await importArchive(zip, { repo }), reason, before, repo, t0, detailRx)
  if (copyCheck) humanLine(r.reason)
  return r
}

async function expectExportRejected(mutate: (files: Files) => Files, reason: string, detailRx?: RegExp, copyCheck = true): Promise<Fail> {
  const repo = await seeded()
  const before = await snapshotRepo(repo)
  const out = await exportArchive(repo, { now: () => FIXED_NOW })
  if (!out.ok) throw new Error(out.userMessage)
  const zip = repackZip(mutate(unzipAll(out.zip)))
  const t0 = performance.now()
  const r = await assertRejected(await importArchive(zip, { repo }), reason, before, repo, t0, detailRx)
  if (copyCheck) humanLine(r.reason)
  return r
}

const counts = (journals: number, cards: number, edges: number, assets: number): Record<string, number> => ({ journals, cards, edges, assets })

describe('R13·D2 下篇 · 名册说谎与缺页', () => {
  it('LIE-a counts 说谎（cards 999）→ archive.counts_mismatch', async () => {
    await expectExportRejected((fs) => withManifest(fs, (m) => ({ ...m, counts: { ...(m['counts'] as Record<string, number>), cards: 999 } })), 'archive.counts_mismatch', /cards 封面点 999、内页实 8/)
  })

  it('LIE-b 在册正文从名册除名（正文留在档里）→ asset.orphan_body（册上无名不配解压）', async () => {
    const repo = await seeded()
    const before = await snapshotRepo(repo)
    const out = await exportArchive(repo, { now: () => FIXED_NOW })
    if (!out.ok) throw new Error(out.userMessage)
    const files = unzipAll(out.zip)
    const ghost = firstAssetOf(files)
    const hash = ghost.slice(ASSET_DIR.length)
    const zip = repackZip(withManifest(files, (m) => ({ ...m, counts: counts(2, 8, 0, 1), assets: (m['assets'] as Array<{ hash: string }>).filter((a) => a.hash !== hash) })))
    const t0 = performance.now()
    const r = await assertRejected(await importArchive(zip, { repo }), 'asset.orphan_body', before, repo, t0, /未在册上登记/)
    humanLine(r.reason)
  })

  it('LIE-c 名册点了不存在的正文 → asset.missing_body（既有闸在流形改造后复秤）', async () => {
    const repo = await seeded()
    const out = await exportArchive(repo, { now: () => FIXED_NOW })
    if (!out.ok) throw new Error(out.userMessage)
    const gone = firstAssetOf(unzipAll(out.zip))
    const files = unzipAll(out.zip)
    const before = await snapshotRepo(repo)
    const zip = repackZip(files.filter((f) => f.name !== gone))
    const t0 = performance.now()
    const r = await assertRejected(await importArchive(zip, { repo }), 'asset.missing_body', before, repo, t0)
    humanLine(r.reason)
  })

  it('LIE-d 索引 hash 非十六进制 + 正文随撤 → asset.entry_invalid（既有闸）', async () => {
    await expectExportRejected((fs) => withManifest(fs.filter((f) => !f.name.startsWith(ASSET_DIR)), (m) => ({ ...m, counts: counts(2, 8, 0, 1), assets: [{ hash: 'nope-not-hex', mime: 'image/png', size: 9 }] })), 'asset.entry_invalid')
  })

  it('LIE-e schemaVersion 写成字符串 "1" → archive_shape（门禁闸健在；人话本家住 migration）', async () => {
    await expectExportRejected((fs) => withManifest(fs, (m) => ({ ...m, schemaVersion: '1' })), 'archive_shape', undefined, false)
  })

  it('NO-MANIFEST：合式 ZIP 缺封面 → archive.manifest_missing（与垃圾输入分道扬镳）', async () => {
    const crafts: Craft[] = [
      { name: FILE_JOURNALS, data: text('[]') },
      { name: FILE_EDGES, data: text('[]') },
      { name: FILE_SETTINGS, data: text('[]') },
    ]
    await expectZipRejected(buildArchive(crafts), 'archive.manifest_missing', /无 manifest\.json/)
  })

  it('MISSING-JOURNALS：封面在、账页缺 → archive.pages_missing（指名缺哪页）', async () => {
    const crafts: Craft[] = [
      { name: 'manifest.json', data: manifestBytes() },
      { name: FILE_EDGES, data: text('[]') },
      { name: FILE_SETTINGS, data: text('[]') },
    ]
    await expectZipRejected(buildArchive(crafts), 'archive.pages_missing', /档案缺页 journals\.json/)
  })

  it('DUPE：同名条目两份（拼接手造）→ entry_dupe（数据不赌 ZIP 排列运气）', async () => {
    const one = buildArchive(emptyUniverse())
    await expectZipRejected(concatArchives(one, one), 'archive.entry_dupe', /同名两条 "manifest\.json"/)
  })

  it('GARBAGE：512KB 确定性伪随机 → zip_unreadable（连条目都数不出——R1 老话术原样健在）', async () => {
    await expectZipRejected(seededRandom(0xb05, 512 * 1024), 'zip_unreadable', undefined, false)
  })
})

describe('R13 真路三钉（R10 屏障原样搭乘）', () => {
  function gated(repo: Repo): { app: ReturnType<typeof createBanjiApp>; gateCalls: () => number } {
    let calls = 0
    const gate: CommitGate = <T>(task: () => Promise<T>): Promise<T> => {
      calls += 1
      return task()
    }
    const app = createBanjiApp(repo, { now: () => FIXED_NOW })
    app.setCommitGate(gate)
    return { app, gateCalls: () => calls }
  }

  it('EMPTY-UNIVERSE 合法新鲜导出 → 必须成功（诚实的空册也是册，别拿敌手闸掐死正字）', async () => {
    const repo = await seeded()
    const { app, gateCalls } = gated(repo)
    const r = await app.importFromFile(new Blob([buildArchive(emptyUniverse())]))
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.stats).toEqual({ journals: 0, cards: 0, edges: 0, settings: 0, assets: 0 })
    expect(gateCalls()).toBe(1)
    expect(await repo.journals.list()).toEqual([])
    expect(await repo.assets.list()).toEqual([])
  })

  it('敌手拒信走同一条 app 缝：提交门零敲、库逐字不动（敌手轮不开屏障旁路）', async () => {
    const repo = await seeded()
    const { app, gateCalls } = gated(repo)
    const before = await snapshotRepo(repo)
    const zip = buildArchive([...emptyUniverse(), { name: 'assets/./../../boot.ini', data: text('x') }])
    const r = await app.importFromFile(new Blob([zip]))
    if (r.ok) throw new Error('敌手档被收')
    expect(r.reason).toBe('archive.entry_name')
    expect(gateCalls()).toBe(0)
    expect(await snapshotRepo(repo)).toEqual(before)
  })

  it('QUOTA：4MB 诚实 stored 资产 × 注入小配额 → quota_exceeded；needed 由承诺说话（正文一字未读）', async () => {
    const blob = seededRandom(0xd0d, 4 * 1024 * 1024)
    const hash = await sha256Hex(blob)
    const zip = buildArchive([
      { name: 'manifest.json', data: manifestBytes({ counts: counts(0, 0, 0, 1), assets: [{ hash, mime: 'application/octet-stream', size: blob.byteLength }] }) },
      { name: FILE_JOURNALS, data: text('[]') },
      { name: FILE_EDGES, data: text('[]') },
      { name: FILE_SETTINGS, data: text('[]') },
      { name: `assets/${hash}`, data: blob, store: true },
    ])
    const repo = await seeded()
    const before = await snapshotRepo(repo)
    const t0 = performance.now()
    const r = await assertRejected(await importArchive(zip, { repo, estimate: async () => ({ quota: 1_000_000, usage: 0 }) }), 'quota_exceeded', before, repo, t0)
    expect(r.detail).toContain('needed=4194304')
  })
})
