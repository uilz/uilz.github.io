// 宽画布耳语的兴褪（R4 机制）从总装里搬出来单独钉：纸比屏宽时低语一次、
// 横推即淡出并记档、终生不再扰。DayView 只留一根指针线与一个淡出时长。
import { useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import type { Card } from '../domain/types'
import { hasOffscreenRight, viewportWidthNow } from './placement'

/** 设置键一次读穿：耳语终生只耳语一次（“见过”以库内记录为准，换设备也记得）。 */
export const WIDE_HINT_KEY = 'hint_wide_canvas'

export type Whisper = 'off' | 'on' | 'fading'

export function useWideCanvasWhisper(
  app: { getSetting(key: string): Promise<unknown>; setSetting(key: string, value: unknown): Promise<void> },
  scrollRef: RefObject<HTMLDivElement | null>,
  loaded: boolean,
  cards: readonly Card[],
): { readonly whisper: Whisper; readonly onScrolled: () => void } {
  const [whisper, setWhisper] = useState<Whisper>('off')
  const [probeTick, setProbeTick] = useState(0)
  const seenRef = useRef(true)
  const baseXRef = useRef(0)
  useEffect(() => {
    let live = true
    void app.getSetting(WIDE_HINT_KEY).then((v) => {
      if (!live) return
      seenRef.current = v === true
      setProbeTick((t) => t + 1)
    })
    return () => {
      live = false
    }
  }, [app])
  useEffect(() => {
    if (!loaded || whisper !== 'off' || seenRef.current) return
    if (hasOffscreenRight(cards, viewportWidthNow())) {
      baseXRef.current = scrollRef.current?.scrollLeft ?? 0
      setWhisper('on')
    }
  }, [loaded, cards, probeTick, whisper, scrollRef])
  useEffect(() => {
    if (whisper !== 'fading') return
    const t = window.setTimeout(() => setWhisper('off'), 220)
    return () => window.clearTimeout(t)
  }, [whisper])
  return {
    whisper,
    onScrolled: () => {
      if (whisper !== 'on') return
      const el = scrollRef.current
      // 只认横移：键盘避让的纵向 scrollIntoView 不算“推移可看”。
      if (el === null || Math.abs(el.scrollLeft - baseXRef.current) < 4) return
      seenRef.current = true
      void app.setSetting(WIDE_HINT_KEY, true)
      setWhisper('fading')
    },
  }
}
