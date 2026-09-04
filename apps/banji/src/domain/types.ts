// 伴记领域类型 —— 锁定数据契约 v1。纯类型定义，零 I/O。
// 字段名与 store 名是对外承诺，不得随意增删（updatedAt/edges/staging/rot 是防破坏升级的保险）。

export type CardId = string & { readonly __brand: 'CardId' }

/**
 * 开放联合：已知 kind 在渲染期查注册表；未登记的 kind 必须原样保留
 * （导入器不得拒绝未知 kind，见 ARCHITECTURE.md「兼容策略」）。
 */
export type CardKind =
  | 'text'
  | 'image'
  | 'file'
  | 'audio'
  | 'video'
  | 'pdf'
  | 'markdown'
  | 'code'
  | 'link'
  | 'container'
  | (string & {})

/** 画布绝对坐标；嵌套在容器内时依然存绝对值（容器移动的平移在后续实现处理）。 */
export interface CardPos {
  readonly x: number
  readonly y: number
}

export interface CardSize {
  readonly w: number
  readonly h: number
}

export interface Card<P = unknown> {
  id: CardId
  kind: CardKind
  pos: CardPos
  size: CardSize
  /** 允许小数，优先留间隙。 */
  z?: number
  /** 预留字段，默认 0；v1 无 UI 读取。 */
  rot?: number
  /** 核心字段（不在 props 里）；仅当 kind==='container' 有意义；顺序即视觉/语义顺序。 */
  children?: CardId[]
  /** 与 kind 无关的装饰属性：颜色/折叠等。 */
  meta?: Record<string, unknown>
  /** 按 kind 判别的载荷。 */
  props: P
  createdAt: string
  /** 合并保险字段；暂无 UI 读取。 */
  updatedAt: string
}

export interface TextProps {
  text: string
  format?: 'plain' | 'md'
}

/** 权威的名称/mime 住在 asset 记录上，卡片只引 hash。 */
export interface ImageProps {
  hash: string
  w?: number
  h?: number
}

export interface FileProps {
  hash: string
}

/** 容器无载荷：子卡片住在 core 的 children 里。 */
export type ContainerProps = Record<string, never>

export interface JournalDoc {
  /** 'YYYY-MM-DD'；文档键即日期归属，Card 上没有 date 字段。 */
  date: string
  cards: Card[]
  updatedAt: string
}

export interface AssetRecord {
  /** sha256 十六进制小写（算法冻结）。 */
  hash: string
  mime: string
  name?: string
  size: number
  addedAt: string
  /** 必须存 Blob 对象，绝不存 ArrayBuffer。 */
  blob: Blob
}

export interface EdgeRecord {
  id: string
  source: CardId
  target: CardId
  role?: string
  createdAt: string
  updatedAt: string
}

export interface SettingsRecord {
  key: string
  value: unknown
  updatedAt: string
}

/**
 * staging 仓库的 out-of-line 键（导入草稿区）。
 * 契约原文只列了 j/a/e 三类；设置也必须活过导入（HERO 要求），故内部补 s: 前缀。
 * 见 docs/ARCHITECTURE.md 的偏差记录——这是对内部草稿键的扩展，不触碰对外格式。
 */
export type StagingKey = `j:${string}` | `a:${string}` | `e:${string}` | `s:${string}`
