// 导入 = 严格三阶段（契约 §7）：0 配额预检 → 1 纯内存预检 → 2 分批暂存 → 3 单事务提交。
// 前两阶段的任何失败都发生在第一次写入之前——“失败不动现有数据”由执行顺序结构性保证，
// 第 3 阶段要么整体生效（oncomplete）要么整体回滚（onabort），中间态不可被观察到。
import type { Repo } from '../repository/types'
import { MAX_STAGE_BATCH } from '../repository/types'
import { isHex64 } from '../domain/validate'
import { ASSET_DIR, FILE_EDGES, FILE_JOURNALS, FILE_MANIFEST, FILE_SETTINGS } from './format'
import { createHashSubtle } from './hash'
import { chunksToBlob, joinChunks, parseZipEntries } from './zip'
import { preflightArchive, type AssetBody, type PreflightCode, type PreflightProblem, type PreflightStats } from './preflight'
import type { ArchiveRejectCode, SchemaMigration } from './migration'

export type ImportFailReason =
  | 'zip_unreadable'
  | 'quota_exceeded'
  | 'staging_failed'
  | 'commit_failed'
  | 'unknown'
  | ArchiveRejectCode
  | PreflightCode

export interface ImportResultOk {
  readonly ok: true
  readonly stats: PreflightStats
}

export interface ImportResultFail {
  readonly ok: false
  readonly reason: ImportFailReason
  readonly userMessage: string
  readonly detail?: string
}

export type ImportResult = ImportResultOk | ImportResultFail

export interface ImportArchiveOptions {
  readonly repo: Repo
  /** 每批暂存条数上限（默认 MAX_STAGE_BATCH=200，repo 层同时强制）。 */
  readonly batchLimit?: number
  readonly migrationTable?: readonly SchemaMigration[]
  /** 注入配额探针（测试缝）。生产默认走 navigator.storage.estimate；环境不支持则跳过。 */
  readonly estimate?: () => Promise<StorageEstimate | undefined>
}

const utf8DecodeFatal = (bytes: Uint8Array): string => new TextDecoder('utf-8', { fatal: true }).decode(bytes)

interface ZipView {
  readonly fields: Map<string, string>
  readonly assets: Map<string, AssetBody>
}

/** 流式解码 ZIP：四个 JSON 定名字段 + assets/<hash> 正文（增量 sha256，绝不信任条目名）。 */
async function readZipView(zip: Uint8Array): Promise<ZipView> {
  const fields = new Map<string, string>()
  const rawAssets = new Map<string, readonly Uint8Array<ArrayBuffer>[]>()
  parseZipEntries(zip, (entry) => {
    if (entry.name.startsWith(ASSET_DIR)) {
      const hash = entry.name.slice(ASSET_DIR.length)
      if (isHex64(hash)) rawAssets.set(hash, entry.chunks)
      return 'continue'
    }
    if (entry.name === FILE_MANIFEST || entry.name === FILE_JOURNALS || entry.name === FILE_EDGES || entry.name === FILE_SETTINGS) {
      fields.set(entry.name, utf8DecodeFatal(joinChunks(entry.chunks)))
    }
    return 'continue'
  })
  if (!fields.has(FILE_MANIFEST)) throw new Error('ZIP 中找不到 manifest.json（这不是伴记档案）')
  const assets = new Map<string, AssetBody>()
  for (const [hash, chunks] of rawAssets) {
    const hasher = createHashSubtle()
    let size = 0
    for (const c of chunks) {
      hasher.push(c)
      size += c.byteLength
    }
    assets.set(hash, { actualHash: await hasher.digestHex(), blob: chunksToBlob(chunks), size })
  }
  return { fields, assets }
}

const CORRUPT_PREFIX = '资料校验未通过，导入已中止；你现有的日记完好无损。问题：'

function failureFromProblems(problems: readonly PreflightProblem[]): ImportResultFail {
  const first = problems[0]
  if (first === undefined) return { ok: false, reason: 'unknown', userMessage: '导入已中止；你现有的日记完好无损。' }
  if (first.gate !== undefined) {
    return { ok: false, reason: first.gate.code, userMessage: first.gate.userMessage, detail: first.gate.message.slice(0, 300) }
  }
  const shown = problems.slice(0, 3).map((p) => `${p.inner ?? p.code} ${p.detail}`)
  const rest = problems.length > 3 ? ` 等共 ${String(problems.length)} 处` : ''
  return { ok: false, reason: first.code, userMessage: CORRUPT_PREFIX + shown.join('；') + rest, detail: problems.map((p) => `${p.code}:${p.detail}`).join(' | ').slice(0, 500) }
}

async function defaultEstimate(): Promise<StorageEstimate | undefined> {
  if (typeof navigator === 'undefined' || navigator.storage?.estimate === undefined) return undefined
  return navigator.storage.estimate()
}

export async function importArchive(zip: Uint8Array, opts: ImportArchiveOptions): Promise<ImportResult> {
  // —— 阶段 0/1：全部在内存里；此刻库中一个字节都未动过。
  let view: ZipView
  try {
    view = await readZipView(zip)
  } catch (err) {
    return { ok: false, reason: 'zip_unreadable', userMessage: '这个文件不是可读取的伴记档案（可能已损坏或不完整），导入已中止；你现有的日记完好无损。', detail: String(err).slice(0, 200) }
  }
  const neededBytes = [...view.assets.values()].reduce((acc, a) => acc + a.size, 0)
  try {
    const est = await (opts.estimate ?? defaultEstimate)()
    if (est?.quota !== undefined && est?.usage !== undefined && est.usage + neededBytes * 1.2 > est.quota) {
      return {
        ok: false,
        reason: 'quota_exceeded',
        userMessage: '本机可用空间可能装不下这份档案，导入已中止；你现有的日记完好无损。可清理浏览器存储后重试。',
        detail: `usage=${String(est.usage)} quota=${String(est.quota)} needed=${String(neededBytes)}`,
      }
    }
  } catch {
    // 配额探针本身失败不构成拒绝理由（沙箱/私有模式常见不可用）。
  }

  const preflighted = preflightArchive({
    manifestJson: view.fields.get(FILE_MANIFEST) ?? '',
    journalsJson: view.fields.get(FILE_JOURNALS) ?? '',
    edgesJson: view.fields.get(FILE_EDGES) ?? '',
    settingsJson: view.fields.get(FILE_SETTINGS) ?? '',
    assets: view.assets,
    batchLimit: opts.batchLimit ?? MAX_STAGE_BATCH,
    ...(opts.migrationTable === undefined ? {} : { migrationTable: opts.migrationTable }),
  })
  if (!preflighted.ok) return failureFromProblems(preflighted.problems)

  // —— 阶段 2：清暂存 + 分批 put（幂等草稿区，永不触碰活动 store）。
  try {
    await opts.repo.clearStaging()
    for (const batch of preflighted.plan.batches) await opts.repo.stageBatch(batch)
  } catch (err) {
    await safeClearStaging(opts.repo)
    return { ok: false, reason: 'staging_failed', userMessage: '暂存导入数据时出错，导入已中止；你现有的日记完好无损。', detail: String(err).slice(0, 200) }
  }

  // —— 阶段 3：唯一提交事务；成功当且仅当 oncomplete（repository 层保证）。
  try {
    await opts.repo.commitStaging()
  } catch (err) {
    return { ok: false, reason: 'commit_failed', userMessage: '提交导入事务时出错，已整体回滚；你现有的日记保持导入原样。', detail: String(err).slice(0, 200) }
  }
  return { ok: true, stats: preflighted.plan.stats }
}

async function safeClearStaging(repo: Repo): Promise<void> {
  try {
    await repo.clearStaging()
  } catch {
    // 提前释放草稿空间（部分批次残留无害但也无用：每次导入的第一步就是 clearStaging）。
  }
}
