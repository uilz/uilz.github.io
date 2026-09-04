// 损坏电池（契约 §8 之 3）+ 配额预检：每个用例都必须 ①给出编码拒绝 ②库内字节级原封不动。
// 快照 before/after 深相等是这里的硬断言——“失败不动数据”不是口头承诺。
// 每个测试自持一份 buildWorld()（tid 是全局序列，跨夹具引用 id 会错位）。
import { afterEach, describe, expect, it } from 'vitest'
import type { Card, JournalDoc } from '../src/domain/types'
import { deleteDatabase, openRepo } from '../src/repository/repo'
import type { Repo } from '../src/repository/types'
import { exportArchive } from '../src/archive/exportArchive'
import { importArchive, type ImportResult } from '../src/archive/importArchive'
import { ASSET_DIR, FILE_SETTINGS } from '../src/archive/format'
import { containerCard, tid } from './helpers'
import { buildWorld, FIXED_NOW, repackZip, seedRepoWorld, snapshotRepo, unzipAll, utf8, withJournals, withManifest, type World } from './archiveFixtures'

let seq = 0
const open = async (): Promise<{ repo: Repo; name: string }> => {
  const name = `banji-cor-${String(++seq)}`
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

type Files = Array<{ name: string; data: Uint8Array }>
type Fail = Extract<ImportResult, { ok: false }>

async function corrupted(world: World, mutate: (files: Files) => Files): Promise<{ outcome: Fail | null; before: Record<string, unknown>; after: Record<string, unknown> }> {
  const { repo, name } = await open()
  track(repo, name)
  await seedRepoWorld(repo, world)
  const before = await snapshotRepo(repo)
  const out = await exportArchive(repo, { now: () => FIXED_NOW })
  if (!out.ok) throw new Error(`夹具导出失败: ${out.userMessage}`)
  const zip = repackZip(mutate(unzipAll(out.zip)))
  const outcome = await importArchive(zip, { repo })
  const after = await snapshotRepo(repo)
  return { outcome: outcome.ok ? null : outcome, before, after }
}

/** 断言三件事：被拒、拒因为 reason（detail 子串可选）、库快照逐字节不变。 */
function assertRejected(r: Awaited<ReturnType<typeof corrupted>>, reason: string, detailIncludes?: string): Fail {
  if (r.outcome === null) throw new Error('应当拒绝导入，却成功')
  expect(r.outcome.reason).toBe(reason)
  if (detailIncludes !== undefined) expect(r.outcome.detail).toContain(detailIncludes)
  expect(r.after).toEqual(r.before)
  return r.outcome
}

const pick = (world: World, docIdx: number, cardIdx: number): Card => {
  const c = world.journals[docIdx]?.cards[cardIdx]
  if (c === undefined) throw new Error('夹具缺卡片')
  return c
}
const refHash = (world: World, i: 0 | 1): string => {
  const a = world.referenced[i]
  if (a === undefined) throw new Error('夹具缺资产')
  return a.hash
}
const stamp = FIXED_NOW.toISOString()
const emptyDoc = (date: string): JournalDoc => ({ date, cards: [], updatedAt: stamp })

describe('损坏电池（七连）', () => {
  it('1/7 篡改资产正文 → asset.hash_mismatch，库不变', async () => {
    const world = await buildWorld()
    let hit = false
    const r = await corrupted(world, (files) =>
      files.map((e) => {
        if (!hit && e.name.startsWith(ASSET_DIR)) {
          hit = true
          return { ...e, data: utf8.encode('篡改后的字节') }
        }
        return e
      }),
    )
    assertRejected(r, 'asset.hash_mismatch')
    expect(hit).toBe(true)
  })

  it('2/7 被引用的资产整个缺失（manifest+正文同删）→ card.dangling_asset，库不变', async () => {
    const world = await buildWorld()
    const gone = refHash(world, 0)
    const r = await corrupted(world, (files) =>
      withManifest(files, (m) => ({ ...m, assets: (m['assets'] as Array<{ hash: string }>).filter((a) => a.hash !== gone) })).filter((e) => e.name !== `${ASSET_DIR}${gone}`),
    )
    assertRejected(r, 'card.dangling_asset')
  })

  it('3/7 schemaVersion 999 → archive_too_new，userMessage 读得出“数据还在”', async () => {
    const world = await buildWorld()
    const r = await corrupted(world, (files) => withManifest(files, (m) => ({ ...m, schemaVersion: 999 })))
    const fail = assertRejected(r, 'archive_too_new')
    expect(fail.userMessage).toBe('此档案来自更新版本的伴记，请更新伴记后再导入（你的日记数据完好无损）。')
  })

  it('4/7 非法日期 2026-02-30 → journal.invalid(journal.date)，库不变', async () => {
    const world = await buildWorld()
    const r = await corrupted(world, (files) => withJournals(files, (js) => js.map((j, i) => (i === 0 ? { ...j, date: '2026-02-30' } : j))))
    assertRejected(r, 'journal.invalid', 'journal.date')
  })

  it('5/7 跨日志克隆卡片 → card.duplicate_id，库不变', async () => {
    const world = await buildWorld()
    const stolen = structuredClone(pick(world, 1, 0)) // docA(2026-01-15) 的首卡
    const r = await corrupted(world, (files) =>
      withJournals(files, (js) => [js[0] ?? emptyDoc('2026-01-15'), { ...(js[1] ?? emptyDoc('2026-01-16')), cards: [...(js[1] ?? emptyDoc('2026-01-16')).cards, stolen] }]),
    )
    assertRejected(r, 'card.duplicate_id')
  })

  it('6/7 容器环 A→B→A → journal.invalid(container.cycle)，库不变', async () => {
    const world = await buildWorld()
    const a = tid('cycA')
    const b = tid('cycB')
    const r = await corrupted(world, (files) =>
      withJournals(files, (js) => js.map((j, i) => (i === 0 ? { ...j, cards: [...j.cards, containerCard([b], { id: a }), containerCard([a], { id: b })] } : j))),
    )
    assertRejected(r, 'journal.invalid', 'container.cycle')
  })

  it('7/7 一子两父 → container.duplicate_parent，库不变', async () => {
    const world = await buildWorld()
    const child = pick(world, 1, 0)
    const r = await corrupted(world, (files) =>
      withJournals(files, (js) =>
        js.map((j, i) => (i === 0 ? { ...j, cards: [...j.cards, containerCard([child.id], { id: tid('p1') }), containerCard([child.id], { id: tid('p2') })] } : j)),
      ),
    )
    assertRejected(r, 'journal.invalid', 'container.duplicate_parent')
  })
})

describe('门禁补充', () => {
  it('manifest 有记录、ZIP 无正文 → asset.missing_body，库不变', async () => {
    const world = await buildWorld()
    const gone = refHash(world, 0)
    const r = await corrupted(world, (files) => files.filter((e) => e.name !== `${ASSET_DIR}${gone}`))
    assertRejected(r, 'asset.missing_body')
  })

  it('app 字段不是 banji → archive_gate，库不变', async () => {
    const world = await buildWorld()
    const r = await corrupted(world, (files) => withManifest(files, (m) => ({ ...m, app: 'other-app' })))
    assertRejected(r, 'archive_gate')
  })

  it('settings 缺 value 字段 → setting.invalid，库不变', async () => {
    const world = await buildWorld()
    const r = await corrupted(world, (files) =>
      files.map((e) => (e.name === FILE_SETTINGS ? { ...e, data: utf8.encode(JSON.stringify([{ key: 'orphan', updatedAt: '2026-01-01T00:00:00Z' }])) } : e)),
    )
    assertRejected(r, 'setting.invalid', 'setting.value')
  })
})

describe('导入：配额预检（阶段 0，先于一切写盘）', () => {
  const exportFreshZip = async (): Promise<{ repo: Repo; zip: Uint8Array }> => {
    const { repo, name } = await open()
    track(repo, name)
    await seedRepoWorld(repo, await buildWorld())
    const out = await exportArchive(repo, { now: () => FIXED_NOW })
    if (!out.ok) throw new Error(out.userMessage)
    return { repo, zip: out.zip }
  }

  it('空间不足（×1.2 余量算式）→ quota_exceeded 且零写入', async () => {
    const { repo, zip } = await exportFreshZip()
    const before = await snapshotRepo(repo)
    const r = await importArchive(zip, { repo, estimate: async () => ({ quota: 40, usage: 30 }) })
    const fail = r.ok === true ? null : r
    if (fail === null) throw new Error('应当因配额不足而拒绝')
    expect(fail.reason).toBe('quota_exceeded')
    expect(fail.userMessage).toContain('完好无损')
    expect(await snapshotRepo(repo)).toEqual(before)
  })

  it('空间充裕 → 正常走完三阶段', async () => {
    const { repo, zip } = await exportFreshZip()
    const r = await importArchive(zip, { repo, estimate: async () => ({ quota: 10_000_000, usage: 0 }) })
    expect(r.ok).toBe(true)
  })

  it('环境不支持 storage.estimate（探针 undefined）→ 跳过预检不阻断', async () => {
    const { repo, zip } = await exportFreshZip()
    const r = await importArchive(zip, { repo, estimate: async () => undefined })
    expect(r.ok).toBe(true)
  })
})
