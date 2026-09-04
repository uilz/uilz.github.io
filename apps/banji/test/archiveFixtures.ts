// 归档测试夹具：一个构造调用产出完整世界（两份日志/真实 Blob 资产/设置/共享引用），
// 加 ZIP 拆装与库快照工具。归档测试全部从这里出发。
import type { AssetRecord, EdgeRecord, JournalDoc, SettingsRecord } from '../src/domain/types'
import type { Repo } from '../src/repository/types'
import { sha256Hex } from '../src/archive/hash'
import { buildZip, joinChunks, parseZipEntries, type ZipFileSpec } from '../src/archive/zip'
import { containerCard, doc, fileCard, imageCard, isoAt, mysteryCard, textCard, tid } from './helpers'

export const FIXED_NOW = new Date(Date.UTC(2026, 1, 20, 3, 4, 5))
export const FIXED_EXPORTED_AT = FIXED_NOW.toISOString()
export const utf8 = new TextEncoder()

const hashOf = async (text: string): Promise<string> => sha256Hex(utf8.encode(text))

async function asset(text: string, mime: string, name?: string): Promise<AssetRecord> {
  const bytes = utf8.encode(text)
  const hash = await hashOf(text)
  const base: AssetRecord = { hash, mime, size: bytes.byteLength, addedAt: isoAt(5), blob: new Blob([bytes]) }
  if (name !== undefined) base.name = name
  return base
}

export interface World {
  readonly journals: JournalDoc[]
  readonly assets: AssetRecord[]
  readonly settings: SettingsRecord[]
  readonly edges: EdgeRecord[]
  /** 被卡片引用的资产（导出应含且仅含这些）；orphan 永不入档。 */
  readonly referenced: AssetRecord[]
  readonly orphan: AssetRecord
}

/**
 * HERO 世界：文本+图片+文件+嵌套容器+未知 kind 混排，资产跨卡片/跨日志共享，
 * 外加一个刻意不被引用的孤儿资产。日期乱序放入，检验排序与检索。
 */
export async function buildWorld(): Promise<World> {
  const shared1 = await asset('IMG-content-alpha-α', 'image/png', '照片-α.png')
  const shared2 = await asset('DATA-content-beta', 'application/pdf')
  const orphan = await asset('ORPHAN-never-referenced', 'text/plain', '孤儿.txt')

  const t0 = textCard('清晨的公园', { id: tid('t0'), meta: { color: 'ink' }, rot: 45 })
  const img = imageCard(shared1.hash, { id: tid('img'), z: 1.5 })
  const myst = mysteryCard({ verdict: 'unknown', tags: ['a', 'b'], nested: { level: 2, ok: true } }, { id: tid('mys'), z: 0.25 })
  const inner = containerCard([myst.id], { id: tid('ctn1') })
  const outer = containerCard([img.id, inner.id], { id: tid('ctn2') })
  const docA = doc('2026-01-15', [t0, img, inner, outer, myst])
  const t1 = textCard('次日的雨', { id: tid('t1') })
  const pdf = fileCard(shared2.hash, { id: tid('pdf') })
  const img2 = imageCard(shared2.hash, { id: tid('img2') })
  const docB = doc('2026-01-16', [t1, pdf, img2])

  const settings: SettingsRecord[] = [
    { key: 'theme', value: { mode: 'ink', fontSize: 14 }, updatedAt: isoAt(10) },
    { key: 'firstDayOfWeek', value: 1, updatedAt: isoAt(11) },
  ]
  return {
    journals: [docB, docA],
    assets: [shared1, shared2, orphan],
    settings,
    edges: [],
    referenced: [shared1, shared2],
    orphan,
  }
}

export async function seedRepoWorld(repo: Repo, world: World): Promise<void> {
  for (const j of world.journals) await repo.journals.put(j)
  for (const a of world.assets) await repo.assets.put(a)
  for (const s of world.settings) await repo.settings.put(s)
  for (const e of world.edges) await repo.edges.put(e)
}

/** 五 store 快照（blob 以字节呈现），损坏电池用它证明“失败的导入不留痕迹”。 */
export async function snapshotRepo(repo: Repo): Promise<Record<string, unknown>> {
  const assets = []
  for (const a of await repo.assets.list()) {
    const { blob, name, ...rest } = a
    assets.push(name === undefined ? { ...rest, bytes: new Uint8Array(await blob.arrayBuffer()) } : { ...rest, name, bytes: new Uint8Array(await blob.arrayBuffer()) })
  }
  return {
    journals: (await repo.journals.list()).sort((x, y) => x.date.localeCompare(y.date)),
    assets: assets.sort((x, y) => x.hash.localeCompare(y.hash)),
    edges: (await repo.edges.list()).sort((x, y) => x.id.localeCompare(y.id)),
    settings: (await repo.settings.list()).sort((x, y) => x.key.localeCompare(y.key)),
  }
}

export async function wipeAll(repo: Repo): Promise<void> {
  await repo.journals.clear()
  await repo.assets.clear()
  await repo.edges.clear()
  await repo.settings.clear()
  await repo.clearStaging()
}

export function unzipAll(zip: Uint8Array): Array<{ name: string; data: Uint8Array }> {
  const out: Array<{ name: string; data: Uint8Array }> = []
  parseZipEntries(zip, (entry) => {
    out.push({ name: entry.name, data: joinChunks(entry.chunks) })
    return 'continue'
  })
  return out
}

export function repackZip(entries: readonly { name: string; data: Uint8Array }[]): Uint8Array {
  const specs: ZipFileSpec[] = entries.map((e) => ({ name: e.name, data: e.data }))
  return buildZip(specs)
}

/** 取出 manifest.json 的可编辑副本（测试端故意损坏，允许任意 JSON 形态）。 */
export function manifestOf(entries: Array<{ name: string; data: Uint8Array }>): Record<string, unknown> {
  const hit = entries.find((e) => e.name === 'manifest.json')
  if (hit === undefined) throw new Error('档案缺少 manifest.json')
  return JSON.parse(new TextDecoder().decode(hit.data)) as Record<string, unknown>
}

export function withManifest(entries: Array<{ name: string; data: Uint8Array }>, mutate: (m: Record<string, unknown>) => Record<string, unknown>): Array<{ name: string; data: Uint8Array }> {
  return entries.map((e) => (e.name === 'manifest.json' ? { name: e.name, data: utf8.encode(JSON.stringify(mutate(JSON.parse(new TextDecoder().decode(e.data)) as Record<string, unknown>))) } : e))
}

export function withJournals(entries: Array<{ name: string; data: Uint8Array }>, mutate: (js: JournalDoc[]) => JournalDoc[]): Array<{ name: string; data: Uint8Array }> {
  return entries.map((e) => (e.name === 'journals.json' ? { name: e.name, data: utf8.encode(JSON.stringify(mutate(JSON.parse(new TextDecoder().decode(e.data)) as JournalDoc[]))) } : e))
}
