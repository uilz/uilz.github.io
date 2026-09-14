// 纸贴内容（V2-Iter1·F4 #12）：text/markdown/code 的自动贴高。
// 量法 = 把当前读视图整棵 cloneNode 一枚、挂进同一张 .bj-card-body 的离流位（inline 覆掉
// height:100%/overflow，宽度钉在现纸内容宽），读 offsetHeight 后即刻摘除——克隆只活一记
// 同步拍，测试与用户都从未见它；动手只在「正文变了、读视图落回纸面」那一拍。
// 挂载永不触发（既有版面纹丝不动）；|fit − 现高| ≤ 死区不动纸；手工 resize 供到下次内容编辑。
import { useEffect, useRef } from 'react'
import type { RefObject } from 'react'
import type { RenderCtx } from './types'
import { CARD_CHROME } from '../placement'

/** 贴高地板/天花板：矮不过一张便签，高不越一屏长纸。 */
export const HUG_MIN_H = 96
export const HUG_MAX_H = 1200
/** 死区：差不过 24px 不动纸（抖动阻尼，也是「贴内容」与「像素强迫症」的分界）。 */
export const HUG_GATE = 24

/** 纯闸：fit 与现高差得过死区才给新值；钳进 [min,max] 后与现高相同则不给（拒写空意图）。 */
export function hugTarget(curH: number, fitH: number): number | null {
  if (Math.abs(fitH - curH) <= HUG_GATE) return null
  const next = Math.min(HUG_MAX_H, Math.max(HUG_MIN_H, Math.round(fitH)))
  return next === curH ? null : next
}

/** 离流克隆量高：同字体、同字距、同宽的一瞬替身；jsdom 无布局量得 0（调用方视为量不了）。 */
export function measureReadHeight(read: HTMLElement, contentW: number): number {
  const host = read.parentElement
  if (host === null) return 0
  const twin = read.cloneNode(true) as HTMLElement
  twin.setAttribute('aria-hidden', 'true')
  twin.style.cssText = `position:absolute;top:-99999px;left:0;width:${String(contentW)}px;height:auto;min-height:0;max-height:none;overflow:visible;visibility:hidden;pointer-events:none`
  host.appendChild(twin)
  const h = twin.offsetHeight
  twin.remove()
  return h
}

/** 内容变了一拍、读视图落回纸面——量一次，过闸才上链。返回的 ref 挂在读视图根上。 */
export function useContentHug<E extends HTMLElement>(ctx: RenderCtx, dep: string): RefObject<E | null> {
  const readRef = useRef<E | null>(null)
  const prevDep = useRef(dep)
  const armed = useRef(false)
  const mounted = useRef(false)
  if (prevDep.current !== dep) {
    prevDep.current = dep
    armed.current = true
  }
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true
      return
    }
    if (!armed.current) return
    const el = readRef.current
    if (el === null) return
    armed.current = false
    const fit = measureReadHeight(el, ctx.card.size.w - CARD_CHROME.w)
    if (fit === 0) return
    const next = hugTarget(ctx.card.size.h, fit + CARD_CHROME.h)
    if (next !== null) ctx.hug(next)
  })
  return readRef
}
