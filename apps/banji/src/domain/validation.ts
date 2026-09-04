// 校验共用件：结构化报告（永不抛异常）+ 形状窄化小件。archive 预检与 UI 表单共用。

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

/** 资产引用 hash 的形状（sha256 十六进制小写）。 */
export function isHex64(value: unknown): value is string {
  return typeof value === 'string' && HEX64_RE.test(value)
}

/** 宽容的 ISO 时间串形状检查（结构正则，不做 Date 解析避免时区语义）。 */
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}(:\d{2}(:\d{2}(\.\d+)?)?)?(Z|[+-]\d{2}(:?\d{2})?)?$/

export function isIsoStamp(value: unknown): value is string {
  return typeof value === 'string' && ISO_RE.test(value)
}

export function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
