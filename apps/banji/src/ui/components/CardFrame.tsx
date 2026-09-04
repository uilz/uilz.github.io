import { useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent, ReactElement } from 'react'
import type { BanjiApp } from '../../application'
import type { Card } from '../../domain/types'
import type { DayActions } from '../store'
import type { RenderCtx } from '../cards/types'
import { resolveRenderer, rendererFor } from '../cards/registry'
import { CardTypeIcon, IconDots, IconPencil } from './icons'

interface CardFrameProps {
  readonly card: Card
  readonly app: BanjiApp
  readonly date: string
  readonly actions: DayActions
  readonly selected: boolean
  readonly editing: boolean
  readonly z: number
  readonly justBorn: boolean
}

interface DragBase {
  readonly pid: number
  readonly sx: number
  readonly sy: number
  readonly x: number
  readonly y: number
  moved: boolean
}

const DRAG_THRESHOLD_SQ = 25

function clampPos(v: number): number {
  return Math.max(0, Math.round(v))
}

export function CardFrame({ card, app, date, actions, selected, editing, z, justBorn }: CardFrameProps): ReactElement {
  const renderer = resolveRenderer(card.kind)
  const editable = rendererFor(card.kind)?.editable ?? false
  const [drag, setDrag] = useState<{ dx: number; dy: number } | null>(null)
  const [size, setSize] = useState<{ w: number; h: number } | null>(null)
  const [menu, setMenu] = useState<'closed' | 'open' | 'confirm'>('closed')
  const dragRef = useRef<DragBase | null>(null)
  const sizeRef = useRef<{ pid: number; sx: number; sy: number; w: number; h: number } | null>(null)
  const lastTapRef = useRef(0)

  const ctx: RenderCtx = {
    app,
    date,
    card,
    selected,
    editing,
    enterEdit: () => actions.enterEdit(card.id),
    exitEdit: () => actions.exitEdit(),
    setProps: (patch) => actions.patchProps(card.id, patch),
  }

  const onBackgroundDown = (e: ReactPointerEvent<HTMLDivElement>): void => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    const t = e.target
    if (t instanceof Element && t.closest('[data-nodrag]') !== null) return
    e.stopPropagation()
    setMenu('closed')
    e.currentTarget.setPointerCapture?.(e.pointerId)
    dragRef.current = { pid: e.pointerId, sx: e.clientX, sy: e.clientY, x: card.pos.x, y: card.pos.y, moved: false }
  }

  const onBackgroundMove = (e: ReactPointerEvent<HTMLDivElement>): void => {
    const d = dragRef.current
    if (d === null || d.pid !== e.pointerId) return
    const dx = e.clientX - d.sx
    const dy = e.clientY - d.sy
    if (!d.moved) {
      if (dx * dx + dy * dy < DRAG_THRESHOLD_SQ) return
      d.moved = true
    }
    setDrag({ dx, dy })
  }

  const onBackgroundUp = (e: ReactPointerEvent<HTMLDivElement>): void => {
    const d = dragRef.current
    if (d === null || d.pid !== e.pointerId) return
    dragRef.current = null
    setDrag(null)
    if (d.moved) {
      actions.move(card.id, { x: clampPos(d.x + e.clientX - d.sx), y: clampPos(d.y + e.clientY - d.sy) })
      return
    }
    const now = Date.now()
    if (selected && editable && now - lastTapRef.current < 350) actions.enterEdit(card.id)
    else actions.select(card.id)
    lastTapRef.current = now
  }

  const onSizeDown = (e: ReactPointerEvent<HTMLDivElement>): void => {
    e.stopPropagation()
    setMenu('closed')
    e.currentTarget.setPointerCapture?.(e.pointerId)
    sizeRef.current = { pid: e.pointerId, sx: e.clientX, sy: e.clientY, w: card.size.w, h: card.size.h }
    setSize(null)
  }
  const onSizeMove = (e: ReactPointerEvent<HTMLDivElement>): void => {
    const r = sizeRef.current
    if (r === null || r.pid !== e.pointerId) return
    setSize({ w: Math.max(72, Math.round(r.w + e.clientX - r.sx)), h: Math.max(44, Math.round(r.h + e.clientY - r.sy)) })
  }
  const onSizeUp = (e: ReactPointerEvent<HTMLDivElement>): void => {
    const r = sizeRef.current
    if (r === null || r.pid !== e.pointerId) return
    sizeRef.current = null
    const next = { w: Math.max(72, Math.round(r.w + e.clientX - r.sx)), h: Math.max(44, Math.round(r.h + e.clientY - r.sy)) }
    setSize(null)
    actions.resize(card.id, next)
  }

  const cascade = card.children !== undefined && card.children.length > 0 ? `连同卡内的 ${String(card.children.length)} 张卡片一起` : ''
  const shown = size ?? card.size

  return (
    <div
      data-card
      data-card-id={card.id}
      className={`bj-card be-${card.kind}${selected ? ' is-sel' : ''}${justBorn ? ' bj-settle' : ''}`}
      style={{
        left: card.pos.x,
        top: card.pos.y,
        width: shown.w,
        height: shown.h,
        zIndex: z,
        transform: drag !== null ? `translate3d(${String(drag.dx)}px, ${String(drag.dy)}px, 0)` : undefined,
      }}
      onPointerDown={onBackgroundDown}
      onPointerMove={onBackgroundMove}
      onPointerUp={onBackgroundUp}
      onPointerCancel={() => {
        dragRef.current = null
        setDrag(null)
      }}
    >
      <div className="bj-card-body">{renderer.render(card.props, ctx)}</div>
      {selected && !editing ? (
        <div className="bj-card-tools" data-nodrag>
          <CardTypeIcon kind={renderer.iconKind} />
          {editable ? (
            <button type="button" className="bj-tool" aria-label="编辑卡片" onClick={() => actions.enterEdit(card.id)}>
              <IconPencil />
            </button>
          ) : null}
          <button
            type="button"
            className="bj-tool"
            aria-label="卡片菜单"
            aria-expanded={menu !== 'closed'}
            onClick={() => setMenu(menu === 'closed' ? 'open' : 'closed')}
          >
            <IconDots />
          </button>
          {menu === 'open' ? (
            <div className="bj-menu">
              <button type="button" className="bj-menu-item" onClick={() => setMenu('confirm')}>
                删除
              </button>
            </div>
          ) : null}
          {menu === 'confirm' ? (
            <div className="bj-menu bj-menu-confirm">
              <p>
                删掉这一张{cascade !== '' ? <>，{cascade}</> : null}？
              </p>
              <p className="bj-menu-note">撕下后十秒内可以再想想</p>
              <div className="bj-menu-row">
                <button type="button" onClick={() => setMenu('closed')}>
                  取消
                </button>
                <button type="button" className="bj-danger" onClick={() => { setMenu('closed'); actions.remove(card.id) }}>
                  确认删除
                </button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
      {selected && !editing ? (
        <div
          className="bj-resize"
          data-nodrag
          aria-hidden
          onPointerDown={onSizeDown}
          onPointerMove={onSizeMove}
          onPointerUp={onSizeUp}
        />
      ) : null}
    </div>
  )
}
