// 搜索/图模式共用的「跳纸」瞬态（R8·D4）：目标日子+卡片，住在 App 级，刷新即无痕，永不过缝；
// 脉冲时长预算 ≤200ms（纸色一暖，不是描边闪烁），App 计时到点即清，DayView 侧 class 随渲染来去。
import type { CardId } from '../domain/types'

export interface CardHop {
  readonly date: string
  readonly cardId: CardId
}

export const PULSE_MS = 200
export const HOP_MS = PULSE_MS + 60
