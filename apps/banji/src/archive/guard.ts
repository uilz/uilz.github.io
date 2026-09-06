// R13 敌手闸词表：.banjizip 条目在解压/哈希/暂存之前先过名册闸。全部纯数据/纯函数，
// 违规以 GateFailure 抛出（携带新拒绝码，人话住 rejectCopy，raw 只住 detail）。
// 零魔数纪律：尺寸封顶=manifest 承诺+一片交付窗的松弛；条目封顶=五年日记尺度的常识余量。
import { ASSET_DIR, FILE_EDGES, FILE_JOURNALS, FILE_MANIFEST, FILE_SETTINGS, narrowAssetEntry, type ArchiveAssetIndexEntry } from './format'
import type { PreflightCode } from './preflight'

// 防漂移保险：任何闸码必须是注册在案（rejectCopy 有人话）的 PreflightCode——
// 加了闸忘了登文案，编译期即红（R1「文案即产品」铁律的类型侧兑现）。
const _gateCodesArePreflightCodes: [GateCode] extends [PreflightCode] ? true : never = true
void _gateCodesArePreflightCodes

// 名册白名单 = v1 §4 归档布局的镜像。逐字符锚定：`../`、绝对路径、空名、反斜杠、NUL、
// URL 转义、大小写花招、全角/西里尔同形字——一律落不进 [0-9a-f]{64} 与小写定名，无需逐型设防。
export const ENTRY_NAME_RE = /^(?:manifest\.json|journals\.json|edges\.json|settings\.json|assets\/[0-9a-f]{64})$/

const FIELD_NAMES: ReadonlySet<string> = new Set<string>([FILE_MANIFEST, FILE_JOURNALS, FILE_EDGES, FILE_SETTINGS])
const HEX64_RE = /^[0-9a-f]{64}$/

export const isFieldName = (name: string): boolean => FIELD_NAMES.has(name)

/** 封顶松弛量：一段解压交付窗的物理误差，不是信任额度。 */
export const SIZE_SLACK = 1024

/** 条目数天花板：一天一叠纸、五年日记、每页若干附件，仍余一个数量级。 */
export const MAX_ZIP_ENTRIES = 20_000

export type GateCode =
  | 'archive.entry_name'
  | 'archive.entry_dupe'
  | 'archive.entry_count'
  | 'archive.entry_oversize'
  | 'asset.orphan_body'
  | 'archive.manifest_missing'
  | 'archive.pages_missing'

export class GateFailure extends Error {
  constructor(
    readonly code: GateCode,
    readonly detail: string,
  ) {
    super(`[${code}] ${detail}`)
    this.name = 'GateFailure'
  }

  static entryName(name: string): GateFailure {
    return new GateFailure('archive.entry_name', `名不合册 ${JSON.stringify(name.slice(0, 80))}`)
  }

  static entryDupe(name: string): GateFailure {
    return new GateFailure('archive.entry_dupe', `同名两条 ${JSON.stringify(name.slice(0, 80))}`)
  }

  static entryCount(seen: number): GateFailure {
    return new GateFailure('archive.entry_count', `已见 ${String(seen)} 条，超上限 ${String(MAX_ZIP_ENTRIES)}`)
  }

  /** 册上无名的资产正文：收进来就是「manifest 不是唯一名册」的谎——拒于解压之前。 */
  static orphanBody(hash: string): GateFailure {
    return new GateFailure('asset.orphan_body', `资产 ${hash.slice(0, 12)} 未在册上登记`)
  }

  /** 闸一（快路）：本地头自报超过「承诺+松弛」⇒ 压缩区整段不解，零字节代价。 */
  static headerOversize(hash: string, promised: number, headerSize: number): GateFailure {
    return new GateFailure('archive.entry_oversize', `资产 ${hash.slice(0, 12)} 承诺 ${String(promised)} 字节，头里自称 ${String(headerSize)}`)
  }

  /** 闸二（流路）：边解边数越界，本条目就地停喂（膨胀钳在计得字节一片窗内）。 */
  static streamOversize(hash: string, promised: number, counted: number): GateFailure {
    return new GateFailure('archive.entry_oversize', `资产 ${hash.slice(0, 12)} 承诺 ${String(promised)} 字节，解压 ${String(counted)} 字节仍未完`)
  }

  static manifestMissing(entriesSeen: number): GateFailure {
    return new GateFailure('archive.manifest_missing', `${String(entriesSeen)} 条在册却无 manifest.json`)
  }

  static pagesMissing(name: string): GateFailure {
    return new GateFailure('archive.pages_missing', `档案缺页 ${name}`)
  }
}

/**
 * 条目账簿（有状态小件）：总数封顶 → 名册语法 → 重名。一笔不对即 GateFailure。
 * 封面遍与正文遍各持一册独立计数——两遍之间若有名不副实的入场，第二册同样当场拦下。
 */
export function nameLedger(): { readonly claim: (name: string) => void; readonly seen: () => number } {
  const seenNames = new Set<string>()
  let total = 0
  return {
    claim(name: string): void {
      total += 1
      if (total > MAX_ZIP_ENTRIES) throw GateFailure.entryCount(total)
      if (!ENTRY_NAME_RE.test(name)) throw GateFailure.entryName(name)
      if (seenNames.has(name)) throw GateFailure.entryDupe(name)
      seenNames.add(name)
    },
    seen: () => total,
  }
}

/**
 * manifest.counts 与内页实数的对账单：不符者逐条点名（全符返回 null）。
 * counts 是封面给读者的第一承诺——数目说谎的档案不收（库中永不存谎言档案的封面侧）。
 * 自家导出恒等；只有手改/第三方档案可能触发。assets 数对名册数组长度，不对正文数
 * （缺正文另有 asset.missing_body 那杆秤，两账不互喂）。
 */
export function countLies(manifest: Record<string, unknown>, actual: { readonly journals: number; readonly cards: number; readonly edges: number; readonly assets: number }): string | null {
  const raw = manifest['counts']
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return `counts 缺失或不成形: ${JSON.stringify(raw).slice(0, 60)}`
  const rec = raw as Record<string, unknown>
  const got: string[] = []
  for (const key of ['journals', 'cards', 'edges', 'assets'] as const) {
    const declared = rec[key]
    const real = actual[key]
    if (typeof declared !== 'number' || !Number.isInteger(declared) || declared < 0) got.push(`${key}=${JSON.stringify(declared)}`)
    else if (declared !== real) got.push(`${key} 封面点 ${String(declared)}、内页实 ${String(real)}`)
  }
  return got.length === 0 ? null : got.join('；')
}

/** 已过 ENTRY_NAME_RE 清洗的名字 → 资产 hash 单源窄化（防第二份正则漂移）。 */
export function assetHashOf(name: string): string | null {
  if (!name.startsWith(ASSET_DIR)) return null
  const hash = name.slice(ASSET_DIR.length)
  return HEX64_RE.test(hash) ? hash : null
}

export interface Declaration {
  /** 名册承诺 hash→size；形状非法的索引条目缺席（权威判定仍住 preflight，两处不互喂假账）。 */
  readonly sizes: ReadonlyMap<string, number>
  /** Σ 承诺字节：配额门在解压任何东西之前拒收「诚实的大档案」。 */
  readonly neededBytes: number
}

/** manifest.assets[] 的宽容窄化（闸用）；null = 封面读不了/无数组，正文阶段整体跳过。 */
export function declareAssets(manifestJson: string): Declaration | null {
  let raw: unknown
  try {
    raw = JSON.parse(manifestJson) as unknown
  } catch {
    return null
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null
  const rawAssets = (raw as Record<string, unknown>)['assets']
  if (!Array.isArray(rawAssets)) return null
  const sizes = new Map<string, number>()
  let neededBytes = 0
  for (const item of rawAssets) {
    const entry: ArchiveAssetIndexEntry | null = narrowAssetEntry(item)
    if (entry === null) continue
    sizes.set(entry.hash, entry.size)
    neededBytes += entry.size
  }
  return { sizes, neededBytes }
}
