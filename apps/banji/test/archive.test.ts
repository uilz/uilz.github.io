// 归档核心证明（契约 §8 之 1/2/4/5/6）。损坏电池与配额在 archive-corruption.test.ts。
import { afterEach, describe, expect, it } from 'vitest'
import type { Card, JournalDoc } from '../src/domain/types'
import { deleteDatabase, openRepo } from '../src/repository/repo'
import type { Repo } from '../src/repository/types'
import { exportArchive } from '../src/archive/exportArchive'
import { importArchive } from '../src/archive/importArchive'
import { ASSET_DIR, FILE_EDGES, FILE_JOURNALS, FILE_MANIFEST, FILE_SETTINGS } from '../src/archive/format'
import { ARCHIVE_SCHEMA_CURRENT, ArchiveRejectedError, checkArchiveGates, migrateArchive, validateIdbVersion } from '../src/archive/migration'
import { sha256Hex } from '../src/archive/hash'
import { doc, isoAt, mysteryCard, textCard, tid } from './helpers'
import { buildWorld, FIXED_EXPORTED_AT, FIXED_NOW, seedRepoWorld, unzipAll, wipeAll } from './archiveFixtures'

let seq = 0
const open = async (): Promise<{ repo: Repo; name: string }> => {
  const name = `banji-arc-${String(++seq)}`
  const repo = await openRepo({ name })
  return { repo, name }
}
const tracked: Array<() => Promise<void>> = []
afterEach(async () => {
  while (tracked.length > 0) await tracked.pop()?.()
})
const track = (repo: Repo, name: string): void => {
  tracked.push(async () => {
    repo.close()
    await deleteDatabase(name)
  })
}

const readField = (entries: Array<{ name: string; data: Uint8Array }>, name: string): unknown => {
  const hit = entries.find((e) => e.name === name)
  if (hit === undefined) throw new Error(`ZIP 缺少 ${name}`)
  return JSON.parse(new TextDecoder().decode(hit.data)) as unknown
}

describe('archive: export', () => {
  it('manifest counts 与实际相符；共享资产一份；未引用资产不入档；journals 按日期升序', async () => {
    const { repo, name } = await open()
    track(repo, name)
    const world = await buildWorld()
    await seedRepoWorld(repo, world)
    const out = await exportArchive(repo, { now: () => FIXED_NOW })
    if (!out.ok) throw new Error(out.userMessage)
    const entries = unzipAll(out.zip)
    const manifest = readField(entries, FILE_MANIFEST) as {
      app: string
      schemaVersion: number
      hashAlgo: string
      exportedAt: string
      counts: Record<string, number>
      assets: Array<{ hash: string }>
    }
    expect(manifest.app).toBe('banji')
    expect(manifest.schemaVersion).toBe(ARCHIVE_SCHEMA_CURRENT)
    expect(manifest.hashAlgo).toBe('sha256')
    expect(manifest.exportedAt).toBe(FIXED_EXPORTED_AT)
    expect(manifest.counts).toEqual({ journals: 2, cards: 8, edges: 0, assets: 2 })
    const assetNames = entries.filter((e) => e.name.startsWith(ASSET_DIR)).map((e) => e.name.slice(ASSET_DIR.length))
    const hashes = world.referenced.map((a) => a.hash).sort()
    expect(assetNames.slice().sort()).toEqual(hashes) // 共享=1 份，孤儿=不在
    expect(manifest.assets.map((a) => a.hash).sort()).toEqual(hashes)
    // edges.json 必须永远存在（P1 为空数组）
    expect(entries.map((e) => e.name)).toContain(FILE_EDGES)
    expect(entries.map((e) => e.name)).toContain(FILE_SETTINGS)
    expect(readField(entries, FILE_EDGES)).toEqual([])
    const journals = readField(entries, FILE_JOURNALS) as JournalDoc[]
    expect(journals.map((j) => j.date)).toEqual(['2026-01-15', '2026-01-16'])
    // 设置归档为 [{key,value}]（updatedAt 不入档）且按 key 升序
    expect(readField(entries, FILE_SETTINGS)).toEqual([
      { key: 'firstDayOfWeek', value: 1 },
      { key: 'theme', value: { mode: 'ink', fontSize: 14 } },
    ])
  })
})

describe('archive: HERO 全量往返', () => {
  it('export → 清空全部五个 store → import → 逐 store 深相等还原，Blob sha256 自证', async () => {
    const { repo, name } = await open()
    track(repo, name)
    const world = await buildWorld()
    await seedRepoWorld(repo, world)
    const out = await exportArchive(repo, { now: () => FIXED_NOW })
    if (!out.ok) throw new Error(out.userMessage)

    await wipeAll(repo)
    expect(await repo.journals.list()).toEqual([])

    const r = await importArchive(out.zip, { repo })
    if (!r.ok) throw new Error(`${r.reason}: ${r.detail ?? ''}`)
    expect(r.stats).toEqual({ journals: 2, cards: 8, edges: 0, settings: 2, assets: 2 })

    const journals = await repo.journals.list()
    expect(journals).toEqual(world.journals.slice().sort((a, b) => a.date.localeCompare(b.date)))

    expect(await repo.edges.list()).toEqual([])
    expect(await repo.settings.list()).toEqual([
      { key: 'firstDayOfWeek', value: 1, updatedAt: FIXED_EXPORTED_AT },
      { key: 'theme', value: { mode: 'ink', fontSize: 14 }, updatedAt: FIXED_EXPORTED_AT },
    ])

    const assets = await repo.assets.list()
    expect(assets.map((a) => a.hash).sort()).toEqual(world.referenced.map((a) => a.hash).sort())
    for (const exp of world.referenced) {
      const got = assets.find((a) => a.hash === exp.hash)
      if (got === undefined) throw new Error(`资产未还原: ${exp.hash}`)
      expect(got.mime).toBe(exp.mime)
      expect(got.size).toBe(exp.size)
      expect(got.addedAt).toBe(FIXED_EXPORTED_AT)
      if (exp.name === undefined) expect('name' in got).toBe(false)
      else expect(got.name).toBe(exp.name)
      const bytes = new Uint8Array(await got.blob.arrayBuffer())
      expect(await sha256Hex(bytes)).toBe(exp.hash) // Blob 存活 + 字节级一致
      expect(await sha256Hex(new Uint8Array(await exp.blob.arrayBuffer()))).toBe(exp.hash)
    }

    // staging 已排干的活证据：空 staging 上再 commit 一次 → 活动 store 被清且不复活任何残留
    await repo.journals.put({ date: '2099-01-01', cards: [], updatedAt: isoAt() })
    await repo.commitStaging()
    expect(await repo.journals.list()).toEqual([])
  })
})

describe('archive: 兼容与迁移', () => {
  it('未知 kind "mystery" 连同 props 原样往返（开放联合不拒绝）', async () => {
    const { repo, name } = await open()
    track(repo, name)
    const original = mysteryCard({ schema: 'alien/2', deep: { list: [1, '二', true], nil: null }, hash: '不是引用' }, { id: tid('m1'), z: 7.5 })
    await repo.journals.put(doc('2026-03-03', [original], isoAt(3)))
    const out = await exportArchive(repo, { now: () => FIXED_NOW })
    if (!out.ok) throw new Error(out.userMessage)
    await wipeAll(repo)
    const r = await importArchive(out.zip, { repo })
    if (!r.ok) throw new Error(`${r.reason}: ${r.detail ?? ''}`)
    const got = await repo.journals.get('2026-03-03')
    expect(got?.cards).toEqual([original]) // props 含键序不同的自由结构也必须等值
  })

  it('migrate(CURRENT) 恒等：migrateArchive 输出 deep-equal 输入且与之深度隔离', async () => {
    const world = await buildWorld()
    const sets = {
      journalDocs: world.journals as unknown[],
      edges: world.edges as unknown[],
      settings: world.settings as unknown[],
      assetIndex: world.referenced.map((a) => ({ hash: a.hash, mime: a.mime, size: a.size })),
    }
    const out = migrateArchive({ schemaVersion: ARCHIVE_SCHEMA_CURRENT, ...sets })
    expect(out).toEqual({ schemaVersion: ARCHIVE_SCHEMA_CURRENT, ...sets })
    expect(out.journalDocs).not.toBe(sets.journalDocs)
    sets.journalDocs.push({ poison: true })
    expect(out.journalDocs).toHaveLength(2) // 事后污染输入不影响输出
    const same = migrateArchive({ schemaVersion: ARCHIVE_SCHEMA_CURRENT, journalDocs: [doc('2026-04-04', [], isoAt())], edges: [], settings: [], assetIndex: [] })
    expect(same.journalDocs[0]).toEqual(doc('2026-04-04', [], isoAt()))
  })

  it('版本双闸：999 拒绝+文案完好感；未知算法拒绝；IDB v2 拒绝；非法版本 archive_shape', async () => {
    let tooNew: unknown
    try {
      checkArchiveGates(999, 'sha256')
    } catch (err) {
      tooNew = err
    }
    expect(tooNew).toBeInstanceOf(ArchiveRejectedError)
    const e = tooNew as ArchiveRejectedError
    expect(e.code).toBe('archive_too_new')
    expect(e.userMessage).toContain('此档案来自更新版本的伴记，请更新伴记后再导入')
    expect(e.userMessage).toMatch(/完好无损/)
    expect(() => checkArchiveGates(1, 'sm3')).toThrowError(/hashAlgo=sm3/)
    expect(() => checkArchiveGates(0, 'sha256')).toThrowError(/schemaVersion/)
    expect(() => checkArchiveGates(1.5, 'sha256')).toThrowError(/schemaVersion/)
    validateIdbVersion(ARCHIVE_SCHEMA_CURRENT)
    expect(() => validateIdbVersion(2)).toThrowError(/schemaVersion=2/)
    expect(() => validateIdbVersion(2)).toThrowError(ArchiveRejectedError)
  })
})

describe('archive: 规模护栏', () => {
  it('40 日志 × 15 卡片 export+import < 15s（顺带证明 200/批的暂存分批真实生效）', async () => {
    const { repo, name } = await open()
    track(repo, name)
    const journals: JournalDoc[] = []
    for (let d = 0; d < 40; d++) {
      const day = `2026-${d < 31 ? '01' : '02'}-${String((d % 31) + 1).padStart(2, '0')}`
      const cards: Card[] = Array.from({ length: 15 }, (_, i) => textCard(`日志${String(d)}-卡${String(i)}`, { id: tid(`s${String(d)}c${String(i)}`), pos: { x: i * 10, y: d * 10 } }))
      journals.push(doc(day, cards, isoAt(d)))
    }
    for (const j of journals) await repo.journals.put(j)
    expect(journals.length).toBe(40)

    const started = performance.now()
    const out = await exportArchive(repo, { now: () => FIXED_NOW })
    if (!out.ok) throw new Error(out.userMessage)
    await wipeAll(repo)
    const r = await importArchive(out.zip, { repo })
    const secs = performance.now() - started
    if (!r.ok) throw new Error(`${r.reason}: ${r.detail ?? ''}`)
    expect(r.stats).toEqual({ journals: 40, cards: 600, edges: 0, settings: 0, assets: 0 })
    expect(secs).toBeLessThan(15_000)
    expect(await repo.journals.get('2026-02-09')).toEqual(journals[39])
    expect((await repo.journals.list()).length).toBeGreaterThan(39)
  })
})
