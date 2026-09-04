import type { CardId, CardKind } from './types'
import { isValidDateString } from './date'
import { isNonEmptyId } from './id'

// 纯校验器：结构化报告（不抛异常），archive 预检与 UI 表单共用同一套规则。

export interface ValidationIssue {
  readonly path: string
  readonly code: string
  readonly message: string
}

export type Validation = { readonly ok: true } | { readonly ok: false; readonly issues: ValidationIssue[] }

export function ok(issues: readonly ValidationIssue[]): Validation {
  return issues.length === 0
    ? { ok: true }
    : { ok: false, issues: issues.map((i) => ({ ...i })) }
}

const HEX64_RE = /^[0-9a-f]{64}$/

/** 宽容的 ISO 时间串形状检查（结构正则，不做 Date 解析避免时区语义）。 */
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}(:\d{2}(:\d{2}(\.\d+)?)?)?(Z|[+-]\d{2}(:?\d{2})?)?$/

function isIsoStamp(value: unknown): value is string {
  return typeof value === 'string' && ISO_RE.test(value)
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function checkCardCore(card: unknown, path: string, issues: ValidationIssue[]): void {
  if (!isPlainObject(card)) {
    issues.push({ path, code: 'card.not_object', message: 'card 必须是对象' })
    return
  }
  if (!isNonEmptyId(card['id'])) {
    issues.push({ path: `${path}.id`, code: 'card.id', message: 'id 必须是非空字符串' })
  }
  if (typeof card['kind'] !== 'string' || card['kind'].length === 0) {
    // 注意：未知 kind 字符串是合法的（开放联合，导入须原样保留），只拒绝缺失/非字符串。
    issues.push({ path: `${path}.kind`, code: 'card.kind', message: 'kind 必须是非空字符串' })
  }
  const pos = card['pos']
  if (!isPlainObject(pos) || !isFiniteNumber(pos['x']) || !isFiniteNumber(pos['y'])) {
    issues.push({ path: `${path}.pos`, code: 'card.pos', message: 'pos 必须是 {x,y} 有限数' })
  }
  const size = card['size']
  if (!isPlainObject(size) || !isFiniteNumber(size['w']) || !isFiniteNumber(size['h'])) {
    issues.push({ path: `${path}.size`, code: 'card.size', message: 'size 必须是 {w,h} 有限数' })
  }
  if (card['z'] !== undefined && !isFiniteNumber(card['z'])) {
    issues.push({ path: `${path}.z`, code: 'card.z', message: 'z 若存在必须是有限数（允许小数）' })
  }
  if (card['rot'] !== undefined && !isFiniteNumber(card['rot'])) {
    issues.push({ path: `${path}.rot`, code: 'card.rot', message: 'rot 若存在必须是有限数' })
  }
  if (card['createdAt'] !== undefined && !isIsoStamp(card['createdAt'])) {
    issues.push({ path: `${path}.createdAt`, code: 'card.createdAt', message: 'createdAt 必须是 ISO 时间串' })
  }
  if (card['updatedAt'] !== undefined && !isIsoStamp(card['updatedAt'])) {
    issues.push({ path: `${path}.updatedAt`, code: 'card.updatedAt', message: 'updatedAt 必须是 ISO 时间串' })
  }
  const meta = card['meta']
  if (meta !== undefined && !isPlainObject(meta)) {
    issues.push({ path: `${path}.meta`, code: 'card.meta', message: 'meta 若存在必须是对象' })
  }
}

/** 单卡形状校验（不含拓扑：children 存在性/环路由 containerIssues / archive 预检负责）。 */
export function validateCard(card: unknown): Validation {
  const issues: ValidationIssue[] = []
  checkCardCore(card, 'card', issues)
  if (isPlainObject(card)) {
    if (!('props' in card) || !isPlainObject(card['props'])) {
      // v1 契约：三种已知 kind 的 props 都是对象；未知 kind 同样要求结构上可原样搬运。
      issues.push({ path: 'card.props', code: 'card.props', message: 'props 必须存在且为对象' })
    }
    const children = card['children']
    if (children !== undefined) {
      if (!Array.isArray(children) || children.some((c: unknown) => !isNonEmptyId(c))) {
        issues.push({ path: 'card.children', code: 'card.children', message: 'children 必须是 CardId 数组' })
      }
    }
  }
  return ok(issues)
}

/** 拓扑校验只看这三个字段，用结构子类型避免对未验证数据做类型断言。 */
export interface TopoNode {
  readonly id: string
  readonly kind: CardKind
  readonly children?: readonly CardId[]
}

/** 容器的局部拓扑校验（作用于同一卡片集合内）：同一 child 只允许一个父、容器图无环。 */
export function containerIssues(cards: readonly TopoNode[], pathPrefix: string): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const parentOf = new Map<string, string>()
  for (const card of cards) {
    if (card.kind !== 'container' || card.children === undefined) continue
    for (const child of card.children) {
      const claimed = parentOf.get(child)
      if (claimed !== undefined) {
        issues.push({
          path: `${pathPrefix}.${card.id}.children`,
          code: 'container.duplicate_parent',
          message: `卡片 ${child} 同时被容器 ${claimed} 和 ${card.id} 认领`,
        })
      } else {
        parentOf.set(child, card.id)
      }
    }
  }
  // 三色 DFS 找环
  const byId = new Map(cards.map((c) => [c.id as string, c]))
  const state = new Map<string, 0 | 1 | 2>() // 0/未记录=白, 1=灰, 2=黑
  const visit = (id: string, trail: string[]): boolean => {
    const s = state.get(id) ?? 0
    if (s === 1) {
      issues.push({
        path: `${pathPrefix}.${id}`,
        code: 'container.cycle',
        message: `容器嵌套存在环: ${[...trail, id].join(' -> ')}`,
      })
      return true
    }
    if (s === 2) return false
    state.set(id, 1)
    const node = byId.get(id)
    if (node !== undefined) {
      for (const child of node.children ?? []) {
        if (visit(child as string, [...trail, id])) {
          state.set(id, 2)
          return true
        }
      }
    }
    state.set(id, 2)
    return false
  }
  for (const card of cards) {
    if (card.kind === 'container') void visit(card.id as string, [])
  }
  return issues
}

/** 完整日志文档校验：日期格式（纯字符串）、卡片形状、文档内 id 唯一、children 指向同文档卡片、拓扑合法。 */
export function validateJournalDoc(doc: unknown): Validation {
  const issues: ValidationIssue[] = []
  if (!isPlainObject(doc)) {
    issues.push({ path: 'journal', code: 'journal.not_object', message: 'journal 必须是对象' })
    return ok(issues)
  }
  if (!isValidDateString(doc['date'])) {
    issues.push({ path: 'journal.date', code: 'journal.date', message: `日期必须为合法 YYYY-MM-DD: ${String(doc['date'])}` })
  }
  if (!isIsoStamp(doc['updatedAt'])) {
    issues.push({ path: 'journal.updatedAt', code: 'journal.updatedAt', message: 'updatedAt 必须是 ISO 时间串' })
  }
  const rawCards = doc['cards']
  if (!Array.isArray(rawCards)) {
    issues.push({ path: 'journal.cards', code: 'journal.cards', message: 'cards 必须是数组' })
    return ok(issues)
  }
  const seen = new Set<string>()
  const topo: TopoNode[] = []
  for (const i in rawCards) {
    const card = rawCards[i]
    const v = validateCard(card)
    if (!v.ok) issues.push(...v.issues.map((is) => ({ ...is, path: `journal.cards[${i}].${is.path}` })))
    if (isPlainObject(card) && isNonEmptyId(card['id'])) {
      const id = card['id'] as CardId
      const kind = typeof card['kind'] === 'string' ? (card['kind'] as CardKind) : 'text'
      const rawChildren = card['children']
      const children: CardId[] | undefined = Array.isArray(rawChildren)
        ? rawChildren.filter((c: unknown): c is CardId => isNonEmptyId(c))
        : undefined
      if (seen.has(id)) {
        issues.push({ path: `journal.cards[${i}].id`, code: 'journal.duplicate_id', message: `文档内重复卡片 id: ${id}` })
      }
      seen.add(id)
      topo.push(children === undefined ? { id, kind } : { id, kind, children })
    }
  }
  for (const card of topo) {
    for (const child of card.children ?? []) {
      if (!seen.has(child)) {
        issues.push({
          path: `journal.cards.${card.id}.children`,
          code: 'journal.child_missing',
          message: `children 引用了不存在的卡片 id: ${child}`,
        })
      }
    }
  }
  issues.push(...containerIssues(topo, 'journal.cards'))
  return ok(issues)
}

/** 边校验：id/source/target 非空字符串，时间戳 ISO，source≠target。 */
export function validateEdge(edge: unknown): Validation {
  const issues: ValidationIssue[] = []
  if (!isPlainObject(edge)) {
    issues.push({ path: 'edge', code: 'edge.not_object', message: 'edge 必须是对象' })
    return ok(issues)
  }
  if (!isNonEmptyId(edge['id'])) {
    issues.push({ path: 'edge.id', code: 'edge.id', message: 'edge id 必须是非空字符串' })
  }
  if (!isNonEmptyId(edge['source'])) {
    issues.push({ path: 'edge.source', code: 'edge.source', message: 'edge source 必须是非空字符串' })
  }
  if (!isNonEmptyId(edge['target'])) {
    issues.push({ path: 'edge.target', code: 'edge.target', message: 'edge target 必须是非空字符串' })
  }
  if (isNonEmptyId(edge['source']) && edge['source'] === edge['target']) {
    issues.push({ path: 'edge.target', code: 'edge.self_loop', message: '不允许自环边' })
  }
  if (edge['role'] !== undefined && typeof edge['role'] !== 'string') {
    issues.push({ path: 'edge.role', code: 'edge.role', message: 'role 若存在必须是字符串' })
  }
  if (!isIsoStamp(edge['createdAt'])) {
    issues.push({ path: 'edge.createdAt', code: 'edge.createdAt', message: 'createdAt 必须是 ISO 时间串' })
  }
  if (!isIsoStamp(edge['updatedAt'])) {
    issues.push({ path: 'edge.updatedAt', code: 'edge.updatedAt', message: 'updatedAt 必须是 ISO 时间串' })
  }
  return ok(issues)
}

/** 设置项校验：key 非空字符串、updatedAt ISO、value 任意 unknown（JSON 域内）。 */
export function validateSettingsRecord(setting: unknown): Validation {
  const issues: ValidationIssue[] = []
  if (!isPlainObject(setting)) {
    issues.push({ path: 'setting', code: 'setting.not_object', message: 'setting 必须是对象' })
    return ok(issues)
  }
  if (!isNonEmptyId(setting['key'])) {
    issues.push({ path: 'setting.key', code: 'setting.key', message: 'key 必须是非空字符串' })
  }
  if (!('value' in setting)) {
    issues.push({ path: 'setting.value', code: 'setting.value', message: 'value 字段必须存在（可为任意 JSON 值）' })
  }
  if (!isIsoStamp(setting['updatedAt'])) {
    issues.push({ path: 'setting.updatedAt', code: 'setting.updatedAt', message: 'updatedAt 必须是 ISO 时间串' })
  }
  return ok(issues)
}

/** 归档 settings.json 的 [{key,value}] 形状（updatedAt 不在归档里）。 */
export function validateArchiveSetting(setting: unknown): Validation {
  const issues: ValidationIssue[] = []
  if (!isPlainObject(setting)) {
    issues.push({ path: 'setting', code: 'setting.not_object', message: 'setting 必须是对象' })
    return ok(issues)
  }
  if (!isNonEmptyId(setting['key'])) {
    issues.push({ path: 'setting.key', code: 'setting.key', message: 'key 必须是非空字符串' })
  }
  if (!('value' in setting)) {
    issues.push({ path: 'setting.value', code: 'setting.value', message: 'value 字段必须存在' })
  }
  return ok(issues)
}

/** 资产引用 hash 的形状（sha256 十六进制小写）。 */
export function isHex64(value: unknown): value is string {
  return typeof value === 'string' && HEX64_RE.test(value)
}
