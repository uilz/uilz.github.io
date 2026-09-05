// 搜索/图模式共用的「跳纸」瞬态（R8·D4）：目标日子+卡片，住在 App 级，刷新即无痕，永不过缝；
// 脉冲时长预算 ≤200ms（纸色一暖，不是描边闪烁），App 计时到点即清，DayView 侧 class 随渲染来去。
import type { CardId } from '../domain/types'

export interface CardHop {
  readonly date: string
  readonly cardId: CardId
}

export const PULSE_MS = 200
/** 落点侧从「纸已到齐」起算的熄灭窗（脉冲放完即熄）。 */
export const FLASH_OFF_MS = PULSE_MS + 60
/** App 兜底：hop 若始终无人认领（目标日没打开/纸已不在），4s 弃世——瞬态不许过夜。 */
export const HOP_MAX_MS = 4000
