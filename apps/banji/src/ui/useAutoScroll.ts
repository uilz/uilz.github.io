// 拖入远垫的自动滚屏 —— 纸面惯性的唯一计时器：拖卡进行中，指针逼近滚动窗缘时缓缓推纸。
// 零新 UI、零 store 触点：指针位置走 capture 阶段的 pointermove 采样，位移全交给原生滚动。
// reduced-motion 让位：用户要安静时，这个循环根本不起（屏让位于约定，不是折中实现）。
import { useEffect } from 'react'
import { edgeScrollStep } from './placement'

export interface ScrollHost {
  readonly current: HTMLElement | null
}

export function useAutoScrollWhileDragging(scrollEl: ScrollHost, active: boolean): void {
  useEffect(() => {
    if (!active) return
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true) return
    let raf = 0
    const pointer = { x: 0, y: 0, live: false }
    const track = (e: PointerEvent): void => {
      pointer.x = e.clientX
      pointer.y = e.clientY
      pointer.live = true
    }
    window.addEventListener('pointermove', track, true)
    const tick = (): void => {
      const el = scrollEl.current
      if (el !== null && pointer.live) {
        const r = el.getBoundingClientRect()
        const dx = edgeScrollStep(pointer.x, r.left, r.right)
        const dy = edgeScrollStep(pointer.y, r.top, r.bottom)
        if (dx !== 0) el.scrollLeft += dx
        if (dy !== 0) el.scrollTop += dy
      }
      raf = window.requestAnimationFrame(tick)
    }
    raf = window.requestAnimationFrame(tick)
    return () => {
      window.cancelAnimationFrame(raf)
      window.removeEventListener('pointermove', track, true)
    }
  }, [scrollEl, active])
}
