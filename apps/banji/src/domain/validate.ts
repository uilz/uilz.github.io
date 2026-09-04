import type { CardId, CardKind } from './types'
import { isValidDateString } from './date'
import { isNonEmptyId } from './id'
import { containerIssues, validateCard, type TopoNode } from './cardShape'
import { ok, isIsoStamp, isPlainObject, type Validation, type ValidationIssue } from './validation'

// 文档级校验器集合。卡片形状与拓扑见 cardShape.ts，共用件见 validation.ts；
// 本文件同时是全验证面的对外桶（archive/UI 都只 import 'domain/validate'）。
export * from './validation'
export * from './cardShape'
export { readCard, type CardView } from './cardView'

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
