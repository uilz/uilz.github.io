import { isNonEmptyId } from './id'
import { isPlainObject, type ValidationIssue } from './validation'
import { validateCard } from './cardShape'

// 已验证卡片的“窄化视图”：validateCard 通过后，调用方仍拿到 unknown 形态的原始 JSON；
// 这里用逐项 typeof 收窄出 id/kind/children/props，archive 预检禁止再写断言。

export interface CardView {
  readonly id: string
  readonly kind: string
  readonly children: readonly string[]
  readonly props: unknown
}

export function readCard(raw: unknown): { readonly ok: true; readonly card: CardView } | { readonly ok: false; readonly issues: ValidationIssue[] } {
  const v = validateCard(raw)
  if (!v.ok) return { ok: false, issues: v.issues }
  if (!isPlainObject(raw)) return { ok: false, issues: [{ path: 'card', code: 'card.not_object', message: 'card 必须是对象' }] }
  const id = raw['id']
  const kind = raw['kind']
  if (typeof id !== 'string' || id.length === 0 || typeof kind !== 'string') {
    return { ok: false, issues: [{ path: 'card', code: 'card.view', message: 'id/kind 必须是字符串' }] }
  }
  const props = raw['props']
  if (typeof props !== 'object' || props === null) {
    return { ok: false, issues: [{ path: 'card.props', code: 'card.props', message: 'props 必须是对象' }] }
  }
  const rawChildren = raw['children']
  const children = Array.isArray(rawChildren) ? rawChildren.filter((c: unknown): c is string => isNonEmptyId(c)) : []
  return { ok: true, card: { id, kind, children, props } }
}
