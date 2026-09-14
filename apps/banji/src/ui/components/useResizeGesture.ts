// 手工 resize 的手势面（自 CardFrame 析出，V2-F4 腾顶账——纯搬运，行为一字不差）：
// 量出虚尺寸即时回显（size state 覆盖渲染），抬手一笔过 actions.resize 的唯一链通道。
import { useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import type { CardSize } from '../../domain/types'

interface SizeDrag {
  readonly pid: number
  readonly sx: number
  readonly sy: number
  readonly w: number
  readonly h: number
}

const MIN_W = 72
const MIN_H = 44

function nextSize(r: SizeDrag, clientX: number, clientY: number): CardSize {
  return { w: Math.max(MIN_W, Math.round(r.w + clientX - r.sx)), h: Math.max(MIN_H, Math.round(r.h + clientY - r.sy)) }
}

export function useResizeGesture(start: CardSize, onCommit: (size: CardSize) => void) {
  const [live, setLive] = useState<CardSize | null>(null)
  const ref = useRef<SizeDrag | null>(null)

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>): void => {
    e.stopPropagation()
    e.currentTarget.setPointerCapture?.(e.pointerId)
    ref.current = { pid: e.pointerId, sx: e.clientX, sy: e.clientY, w: start.w, h: start.h }
    setLive(null)
  }
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>): void => {
    const r = ref.current
    if (r === null || r.pid !== e.pointerId) return
    setLive(nextSize(r, e.clientX, e.clientY))
  }
  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>): void => {
    const r = ref.current
    if (r === null || r.pid !== e.pointerId) return
    ref.current = null
    const size = nextSize(r, e.clientX, e.clientY)
    setLive(null)
    onCommit(size)
  }

  return { live, handlers: { onPointerDown, onPointerMove, onPointerUp } }
}
