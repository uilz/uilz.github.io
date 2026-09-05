import type { CardId } from './types'
import { v7 as uuidv7 } from 'uuid'

const UUID_V7_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

/** 新建卡片 id：uuid v7（时间有序）。品牌转换是 NewType 惯用法，不是错误抑制。 */
export function newCardId(): CardId {
  return uuidv7() as CardId
}

/** 校验既有的 CardId 字符串：非空即可（未知来源的 id 必须原样保留，不做 uuid 强校验）。 */
export function isNonEmptyId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

/** 新建边 id：与卡片同为 uuid v7；契约里 EdgeRecord.id 是普通字符串（不带 CardId 品牌）。 */
export function newEdgeId(): string {
  return uuidv7()
}

/** 仅用于测试/自检：确认 newCardId 产出 v7 形状。 */
export function isUuidV7Shape(value: string): boolean {
  return UUID_V7_SHAPE.test(value)
}
