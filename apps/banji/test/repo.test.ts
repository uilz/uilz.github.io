import { afterEach, describe, expect, it } from 'vitest'
import { deleteDatabase, MAX_STAGE_BATCH, openRepo } from '../src/repository/repo'
import type { Repo, StagedEntry } from '../src/repository/types'
import type { SchemaMigration } from '../src/archive/migration'
import { sha256Hex } from '../src/archive/hash'
import { fileCard, isoAt, textCard, tid } from './helpers'

let seq = 0
const open = async (): Promise<{ repo: Repo; name: string }> => {
  const name = `banji-test-${String(++seq)}`
  const repo = await openRepo({ name })
  return { repo, name }
}

const repos: Array<() => Promise<void>> = []
const track = (repo: Repo, name: string): void => {
  repos.push(async () => {
    repo.close()
    await deleteDatabase(name)
  })
}
afterEach(async () => {
  while (repos.length > 0) await repos.pop()?.()
})

describe('repository: 基本 CRUD', () => {
  it('journal put/get/list/remove，updatedAt 原样保留', async () => {
    const { repo, name } = await open()
    track(repo, name)
    const card = textCard('今天去了公园', { id: tid('p'), z: 1.5 })
    await repo.journals.put({ date: '2026-01-15', cards: [card], updatedAt: isoAt(42) })
    const got = await repo.journals.get('2026-01-15')
    expect(got?.cards).toEqual([card])
    expect(got?.updatedAt).toBe(isoAt(42))
    expect(await repo.journals.get('2026-01-16')).toBeUndefined()
    await repo.journals.put({ date: '2026-01-16', cards: [], updatedAt: isoAt(1) })
    expect((await repo.journals.list()).map((d) => d.date)).toEqual(['2026-01-15', '2026-01-16'])
    await repo.journals.remove('2026-01-15')
    expect((await repo.journals.list()).map((d) => d.date)).toEqual(['2026-01-16'])
    await repo.journals.remove('不存在的日期')
  })

  it('asset 存真 Blob，字节级往返一致', async () => {
    const { repo, name } = await open()
    track(repo, name)
    const bytes = new Uint8Array([0x42, 0x61, 0x6e, 0x4a, 0x69, 0, 255, 128])
    const hash = await sha256Hex(bytes)
    await repo.assets.put({ hash, mime: 'application/octet-stream', name: '笔记.bin', size: bytes.byteLength, addedAt: isoAt(), blob: new Blob([bytes]) })
    const back = await repo.assets.get(hash)
    if (!back) throw new Error('asset 丢失')
    expect(back.blob instanceof Blob).toBe(true)
    expect(new Uint8Array(await back.blob.arrayBuffer())).toEqual(bytes)
    expect(back.name).toBe('笔记.bin')
    expect((await repo.assets.list()).map((a) => a.hash)).toEqual([hash])
    // Blob 对象（而非 ArrayBuffer）存活于 store：再次读出仍可哈希
    expect(await sha256Hex(new Uint8Array(await back.blob.arrayBuffer()))).toBe(hash)
  })

  it('edge 走 by_source / by_target 索引', async () => {
    const { repo, name } = await open()
    track(repo, name)
    const a = tid('a')
    const b = tid('b')
    const c = tid('c')
    const e1 = { id: 'e1', source: a, target: b, createdAt: isoAt(), updatedAt: isoAt() }
    const e2 = { id: 'e2', source: c, target: a, role: 'ref', createdAt: isoAt(), updatedAt: isoAt() }
    const e3 = { id: 'e3', source: a, target: c, createdAt: isoAt(), updatedAt: isoAt() }
    for (const e of [e1, e2, e3]) await repo.edges.put(e)
    expect((await repo.edges.bySource(a)).map((e) => e.id).sort()).toEqual(['e1', 'e3'])
    expect((await repo.edges.byTarget(a)).map((e) => e.id)).toEqual(['e2'])
    expect((await repo.edges.bySource(tid('孤')))).toEqual([])
    await repo.edges.remove('e1')
    expect(await repo.edges.get('e1')).toBeUndefined()
  })

  it('settings put/get/list/删除不存在项安全', async () => {
    const { repo, name } = await open()
    track(repo, name)
    await repo.settings.put({ key: 'theme', value: { mode: 'ink' }, updatedAt: isoAt() })
    expect((await repo.settings.get('theme'))?.value).toEqual({ mode: 'ink' })
    await repo.settings.remove('nope')
    expect((await repo.settings.list()).map((s) => s.key)).toEqual(['theme'])
  })
})

describe('repository: staging 与提交事务', () => {
  it('stageBatch 上限强制为 200', async () => {
    const { repo, name } = await open()
    track(repo, name)
    const datesFor = (n: number): StagedEntry[] =>
      Array.from({ length: n }, (_, i) => {
        const date = `2026-03-${String((i % 28) + 1).padStart(2, '0')}-s${String(i)}`
        return { key: `j:${date}`, value: { date, cards: [], updatedAt: isoAt() } }
      })
    await expect(repo.stageBatch(datesFor(MAX_STAGE_BATCH + 1))).rejects.toThrow(/200/)
    await expect(repo.stageBatch(datesFor(0))).rejects.toThrow()
    const ok = datesFor(MAX_STAGE_BATCH)
    await repo.stageBatch(ok)
    await repo.clearStaging()
  })

  it('commitStaging：单事务替换四个活动 store 并排干 staging', async () => {
    const { repo, name } = await open()
    track(repo, name)
    const stale = fileCard('f'.padStart(64, '0'))
    await repo.journals.put({ date: '2020-01-01', cards: [stale], updatedAt: isoAt() })
    await repo.assets.put({ hash: 's'.repeat(64), mime: 'text/plain', size: 1, addedAt: isoAt(), blob: new Blob(['old']) })
    await repo.edges.put({ id: 'old-edge', source: stale.id, target: stale.id, createdAt: isoAt(), updatedAt: isoAt() })
    await repo.settings.put({ key: 'old', value: 1, updatedAt: isoAt() })

    const keep = textCard('新内容')
    const assetHash = 'a'.repeat(64)
    const batch: StagedEntry[] = [
      { key: 'j:2026-05-01', value: { date: '2026-05-01', cards: [keep], updatedAt: isoAt() } },
      { key: `a:${assetHash}`, value: { hash: assetHash, mime: 'image/png', size: 3, addedAt: isoAt(), blob: new Blob([new Uint8Array([1, 2, 3])]) } },
      { key: 'e:e-new', value: { id: 'e-new', source: keep.id, target: keep.id, role: 'dup', createdAt: isoAt(), updatedAt: isoAt() } },
      { key: 's:welcome', value: { key: 'welcome', value: true, updatedAt: isoAt() } },
    ]
    await repo.stageBatch(batch)
    await repo.commitStaging()

    expect(await repo.journals.get('2020-01-01')).toBeUndefined()
    expect(await repo.assets.get('s'.repeat(64))).toBeUndefined()
    expect(await repo.edges.get('old-edge')).toBeUndefined()
    expect(await repo.settings.get('old')).toBeUndefined()
    expect((await repo.journals.get('2026-05-01'))?.cards).toEqual([keep])
    const stagedAsset = await repo.assets.get(assetHash)
    if (!stagedAsset) throw new Error('staged asset 丢失')
    expect(new Uint8Array(await stagedAsset.blob.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]))
    expect((await repo.edges.list()).map((e) => e.id)).toEqual(['e-new'])
    expect((await repo.settings.list()).map((s) => s.key)).toEqual(['welcome'])
    // staging 已排干：空事务里再 clear 也无残留
    await repo.clearStaging()
  })

  it('commitStaging：staging 键与内联键不一致 → 整个事务回滚，旧数据原封不动', async () => {
    const { repo, name } = await open()
    track(repo, name)
    await repo.journals.put({ date: '2026-06-01', cards: [], updatedAt: isoAt() })
    await repo.stageBatch([
      { key: 'j:2026-06-02', value: { date: '2026-06-02', cards: [], updatedAt: isoAt() } },
      { key: 'j:坏键', value: { date: '2026-06-03', cards: [], updatedAt: isoAt() } },
    ])
    await expect(repo.commitStaging()).rejects.toThrow()
    expect(await repo.journals.get('2026-06-01')).toBeDefined()
    expect(await repo.journals.get('2026-06-02')).toBeUndefined()
  })

  it('onupgradeneeded 共用迁移表：v1→v2 记录转换落到每个 store', async () => {
    const { repo, name } = await open()
    await repo.journals.put({ date: '2026-07-01', cards: [], updatedAt: isoAt() })
    repo.close()
    const table: readonly SchemaMigration[] = [
      { from: 1, to: 2, records: { journals: (raw) => ({ ...(raw as Record<string, unknown>), upgraded: true }) } },
    ]
    const repo2 = await openRepo({ name, version: 2, migrationTable: table })
    track(repo2, name)
    const doc = await repo2.journals.get('2026-07-01')
    expect((doc as unknown as Record<string, unknown>)?.['upgraded']).toBe(true)
  })
})
