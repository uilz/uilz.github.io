// 导入 = 严格三阶段（契约 §7）：0 配额预检 → 1 纯内存预检 → 2 分批暂存 → 3 单事务提交。
// 前两阶段的任何失败都发生在第一次写入之前——“失败不动现有数据”由执行顺序结构性保证，
// 第 3 阶段要么整体生效（oncomplete）要么整体回滚（onabort），中间态不可被观察到。
import type { CommitGate, Repo } from '../repository/types'
import { MAX_STAGE_BATCH } from '../repository/types'
import { FILE_EDGES, FILE_JOURNALS, FILE_MANIFEST, FILE_SETTINGS } from './format'
import { GateFailure } from './guard'
import { rejectCopy } from './rejectCopy'
import { ZipParseError } from './zip'
import { readAssetBodies, readCover, type Cover } from './view'
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
  /** R10·债#5 提交门：把 commit 排进宿主中介的同一条串行链。缺席 = 直通立即执行（headless 无并发对手）。 */
  readonly commitGate?: CommitGate
}

const ZIP_UNREADABLE = '这个文件不是可读取的伴记档案（可能已损坏或不完整），导入已中止；你现有的日记完好无损。'

/** 流读三闸的失败分诊：闸码原样进 reason（人话在 rejectCopy），解坏≠非档案。 */
function failureFromStream(err: unknown): ImportResultFail {
  if (err instanceof GateFailure) return failureFromProblems([{ code: err.code, detail: err.detail }])
  if (err instanceof ZipParseError && err.inEntry) {
    return failureFromProblems([{ code: 'archive.corrupt', detail: `${err.entryName ?? '（条目边界外）'}: ${err.message}` }])
  }
  return { ok: false, reason: 'zip_unreadable', userMessage: ZIP_UNREADABLE, detail: String(err).slice(0, 200) }
}

const CORRUPT_PREFIX = '资料校验未通过，导入已中止；你现有的日记完好无损。问题：'

function failureFromProblems(problems: readonly PreflightProblem[]): ImportResultFail {
  const first = problems[0]
  if (first === undefined) return { ok: false, reason: 'unknown', userMessage: '导入已中止；你现有的日记完好无损。' }
  if (first.gate !== undefined) {
    return { ok: false, reason: first.gate.code, userMessage: first.gate.userMessage, detail: first.gate.message.slice(0, 300) }
  }
  const shown = problems.slice(0, 3).map((p) => rejectCopy(p, p.detail))
  const rest = problems.length > 3 ? ` 等共 ${String(problems.length)} 处` : ''
  return { ok: false, reason: first.code, userMessage: CORRUPT_PREFIX + shown.join('；') + rest, detail: problems.map((p) => `${p.code}:${p.detail}`).join(' | ').slice(0, 500) }
}

async function defaultEstimate(): Promise<StorageEstimate | undefined> {
  if (typeof navigator === 'undefined' || navigator.storage?.estimate === undefined) return undefined
  return navigator.storage.estimate()
}

export async function importArchive(zip: Uint8Array, opts: ImportArchiveOptions): Promise<ImportResult> {
  // —— 阶段 0/1：全部在内存里；此刻库中一个字节都未动过。
  // R13 敌手加固后的次序：封面（名册闸+字段，零字节资产解压）→ 配额（拿 manifest 承诺说话）
  // → 正文（双闸封顶解压）→ 预检（权威校验+分批计划）。诚实的大档案在读到正文之前就被配额拒，
  // 谎报的小承诺在一公里处被停喂；任何失败都发生的第一次写入之前（结构性保证，同 R1）。
  let cover: Cover
  try {
    cover = readCover(zip)
  } catch (err) {
    return failureFromStream(err)
  }
  if (cover.declaration !== null) {
    try {
      const est = await (opts.estimate ?? defaultEstimate)()
      if (est?.quota !== undefined && est?.usage !== undefined && est.usage + cover.declaration.neededBytes * 1.2 > est.quota) {
        return {
          ok: false,
          reason: 'quota_exceeded',
          userMessage: '本机可用空间可能装不下这份档案，导入已中止；你现有的日记完好无损。可清理浏览器存储后重试。',
          detail: `usage=${String(est.usage)} quota=${String(est.quota)} needed=${String(cover.declaration.neededBytes)}`,
        }
      }
    } catch {
      // 配额探针本身失败不构成拒绝理由（沙箱/私有模式常见不可用）。
    }
  }
  let assets: Map<string, AssetBody> = new Map()
  if (cover.declaration !== null) {
    try {
      assets = await readAssetBodies(zip, cover.declaration)
    } catch (err) {
      return failureFromStream(err)
    }
  }

  const preflighted = preflightArchive({
    manifestJson: cover.fields.get(FILE_MANIFEST) ?? '',
    journalsJson: cover.fields.get(FILE_JOURNALS) ?? '',
    edgesJson: cover.fields.get(FILE_EDGES) ?? '',
    settingsJson: cover.fields.get(FILE_SETTINGS) ?? '',
    assets,
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
  // 门只调度不改结构：缺席直通（无头），注册后 commit 作为链上环节执行（R10·债#5）。
  try {
    const commit = (): Promise<void> => opts.repo.commitStaging()
    await (opts.commitGate === undefined ? commit() : opts.commitGate(commit))
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
