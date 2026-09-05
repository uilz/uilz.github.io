// 搜索行/图 chip 落点的暖脉冲（R8·D1/D3 共用通道）：hop（App 级瞬态，到点由 App 计时熄灭）
// 命中当前日子时把那张纸 scrollIntoView 带到眼前、点亮 is-pulse。住 UI 内存，不进 dayState、不过缝。
import { useEffect } from 'react'
import type { CardId } from '../domain/types'
import type { CardHop } from './cardHop'
import { FLASH_OFF_MS } from './cardHop'
import { revealInViewport } from './focus'

/** hop 属本日且纸已齐 → 滚到那张纸、返回应脉冲的卡片 id；放完 FLASH_OFF_MS 后请 App 收灯（onExpire）。 */
export function useCardPulse(hop: CardHop | null, date: string, loaded: boolean, onExpire: () => void): CardId | null {
  const flashed = hop !== null && hop.date === date ? hop.cardId : null
  useEffect(() => {
    if (flashed === null || !loaded) return
    const el = document.querySelector<HTMLElement>(`[data-card-id="${flashed}"]`)
    if (el !== null) revealInViewport(el, 'center')
    const t = window.setTimeout(onExpire, FLASH_OFF_MS)
    return () => {
      window.clearTimeout(t)
    }
  }, [flashed, loaded, onExpire])
  return flashed
}
