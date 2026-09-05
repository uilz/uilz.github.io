import type { CardId, CardKind } from './types'
import { isNonEmptyId } from './id'
import { safeHttpUrl } from './link'
import { ok, isFiniteNumber, isHex64, isIsoStamp, isPlainObject, type Validation, type ValidationIssue } from './validation'

// 单卡形状 + 容器局部拓扑校验。导入预检与 UI 表单共用同一套规则。

// —— R9·D4：新 kind 的 props 形状闸。未知 kind 绝不来这里（原样保留是契约），
//    既有 text/image/file/container 也维持 R1 口径（只查「props 是对象」）——本表只管本轮填槽的类型。
function propsIssues(kind: string, props: Record<string, unknown>): string | null {
  const hexHash = typeof props['hash'] === 'string' && isHex64(props['hash'])
  const nameOk = props['name'] === undefined || typeof props['name'] === 'string'
  switch (kind) {
    case 'audio':
    case 'pdf':
      return hexHash && nameOk ? null : `props.${kind}`
    case 'video': {
      const whOk = (props['w'] === undefined || isFiniteNumber(props['w'])) && (props['h'] === undefined || isFiniteNumber(props['h']))
      return hexHash && whOk && nameOk ? null : 'props.video'
    }
    case 'code':
      return typeof props['text'] === 'string' && nameOk ? null : 'props.code'
    case 'markdown':
      return typeof props['text'] === 'string' && (props['format'] === undefined || props['format'] === 'md') ? null : 'props.markdown'
    case 'link': {
      const url = props['url']
      // 空串容空白草稿（新建未落笔）；非空必须过 http(s) 闸——渲染期还有同一道孤闸兜底
      const urlOk = url === '' || (typeof url === 'string' && safeHttpUrl(url) !== null)
      const titleOk = props['title'] === undefined || typeof props['title'] === 'string'
      return urlOk && titleOk ? null : 'props.link'
    }
    default:
      return null
  }
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
    // 未知 kind 字符串是合法的（开放联合，导入须原样保留），只拒绝缺失/非字符串。
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
    } else if (typeof card['kind'] === 'string') {
      const bad = propsIssues(card['kind'], card['props'])
      if (bad !== null) issues.push({ path: `card.${bad}`, code: bad, message: `${String(card['kind'])} 的 props 形状不合契约` })
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

export interface CardView {
  readonly id: string
  readonly kind: string
  readonly children: readonly string[]
  readonly props: unknown
}

/** 已验证卡片的只读视图（无断言：字段逐项窄化）。archive 遍历导入 JSON 时使用。 */
export function readCard(raw: unknown): { readonly ok: true; readonly card: CardView } | { readonly ok: false; readonly issues: ValidationIssue[] } {
  const v = validateCard(raw)
  if (!v.ok) return { ok: false, issues: v.issues }
  if (!isPlainObject(raw)) return { ok: false, issues: [{ path: 'card', code: 'card.not_object', message: 'card 必须是对象' }] }
  const id = raw['id']
  const kind = raw['kind']
  const props = raw['props']
  if (typeof id !== 'string' || id.length === 0 || typeof kind !== 'string') {
    return { ok: false, issues: [{ path: 'card', code: 'card.view', message: 'id/kind 必须是字符串' }] }
  }
  if (typeof props !== 'object' || props === null) {
    return { ok: false, issues: [{ path: 'card.props', code: 'card.props', message: 'props 必须是对象' }] }
  }
  const rawChildren = raw['children']
  const children = Array.isArray(rawChildren) ? rawChildren.filter((c: unknown): c is string => isNonEmptyId(c)) : []
  return { ok: true, card: { id, kind, children, props } }
}
