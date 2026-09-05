import { useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent, ReactElement } from 'react'
import type { BanjiApp } from '../../application'
import type { Card } from '../../domain/types'
import type { DayActions } from '../store'
import type { LinkPhase } from '../linkage'
import type { RenderCtx } from '../cards/types'
import { resolveRenderer, rendererFor } from '../cards/registry'
import { hitTestContainer, parentIdOf } from '../stackGeometry'
import { clampCardPos } from '../placement'
import { CardTypeIcon, IconDots, IconPencil } from './icons'

interface Offset {
  readonly dx: number
  readonly dy: number
}

interface CardFrameProps {
  readonly card: Card
  readonly cards: readonly Card[]
  readonly app: BanjiApp
  readonly date: string
  readonly actions: DayActions
  readonly selected: boolean
  readonly editing: boolean
  readonly dropOn: boolean
  readonly follow: Offset | null
  readonly z: number
  readonly justBorn: boolean
  /** 牵线模式中的处境（D1）：origin=起点（再点收线）、target=可牵靶纸、blocked=压暗不迎、off=寻常日子。 */
  readonly linkMode?: LinkMode
  /** 真拖拽（越过阈值）起止上报：DayView 用它起/停远垫自动滚屏。点选不算拖。 */
  readonly onDragActiveChange: (active: boolean) => void
}

type LinkMode = LinkPhase | 'off'

interface DragBase {
  readonly pid: number
  readonly sx: number
  readonly sy: number
  readonly x: number
  readonly y: number
  readonly ox: number
  readonly oy: number
  moved: boolean
}

const DRAG_THRESHOLD_SQ = 25

export function CardFrame({ card, cards, app, date, actions, selected, editing, dropOn, follow, z, justBorn, linkMode = 'off', onDragActiveChange }: CardFrameProps): ReactElement {
  const renderer = resolveRenderer(card.kind)
  const editable = rendererFor(card.kind)?.editable ?? false
  const isMat = card.kind === 'container'
  const [drag, setDrag] = useState<Offset | null>(null)
  const [size, setSize] = useState<{ w: number; h: number } | null>(null)
  const [menu, setMenu] = useState<'closed' | 'open' | 'confirm'>('closed')
  const dragRef = useRef<DragBase | null>(null)
  const linkTapRef = useRef<{ pid: number; sx: number; sy: number } | null>(null)
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
    if (linkMode !== 'off') {
      // 牵线是点确认的手势：按下只记点、不喂拖拽管线（滑动改卷不误牵），抬手在 onBackgroundUp 分流。
      e.currentTarget.setPointerCapture?.(e.pointerId)
      linkTapRef.current = { pid: e.pointerId, sx: e.clientX, sy: e.clientY }
      return
    }
    e.currentTarget.setPointerCapture?.(e.pointerId)
    // 画布原点的屏幕位置在落指一瞬采样；卡片坐标即画布坐标（pos 为绝对纸面系）。
    const host = e.currentTarget.parentElement?.getBoundingClientRect()
    dragRef.current = {
      pid: e.pointerId,
      sx: e.clientX,
      sy: e.clientY,
      x: card.pos.x,
      y: card.pos.y,
      ox: host?.left ?? 0,
      oy: host?.top ?? 0,
      moved: false,
    }
  }

  const onBackgroundMove = (e: ReactPointerEvent<HTMLDivElement>): void => {
    const lt = linkTapRef.current
    if (lt !== null) {
      if (lt.pid === e.pointerId && (e.clientX - lt.sx) * (e.clientX - lt.sx) + (e.clientY - lt.sy) * (e.clientY - lt.sy) >= DRAG_THRESHOLD_SQ) linkTapRef.current = null
      return
    }
    const d = dragRef.current
    if (d === null || d.pid !== e.pointerId) return
    const dx = e.clientX - d.sx
    const dy = e.clientY - d.sy
    if (!d.moved) {
      if (dx * dx + dy * dy < DRAG_THRESHOLD_SQ) return
      d.moved = true
      onDragActiveChange(true)
    }
    setDrag({ dx, dy })
    actions.setDropTarget(hitTestContainer({ x: e.clientX - d.ox, y: e.clientY - d.oy }, cards, card.id))
    // 拖着垫纸走 = 整棵子树实时跟移（纯视觉：存储坐标要等抬手落笔才动）。
    if (isMat && (card.children?.length ?? 0) > 0) actions.setDragFollow({ rootId: card.id, dx, dy })
  }

  const onBackgroundUp = (e: ReactPointerEvent<HTMLDivElement>): void => {
    const lt = linkTapRef.current
    if (lt !== null) {
      if (lt.pid !== e.pointerId) return
      linkTapRef.current = null
      // 抬手即分流：起点再点=收线，靶纸点中=牵过去，压暗的不动（误牵比不牵贵）。
      if (linkMode === 'origin') actions.cancelLinking()
      else if (linkMode === 'target') actions.linkTo(card.id)
      return
    }
    const d = dragRef.current
    if (d === null || d.pid !== e.pointerId) return
    dragRef.current = null
    setDrag(null)
    onDragActiveChange(false)
    actions.setDropTarget(null)
    actions.setDragFollow(null)
    if (d.moved) {
      const pos = clampCardPos({ x: d.x + e.clientX - d.sx, y: d.y + e.clientY - d.sy })
      const target = hitTestContainer({ x: e.clientX - d.ox, y: e.clientY - d.oy }, cards, card.id)
      if (target !== null) actions.attachChild(target, card.id, pos)
      else if (parentIdOf(cards, card.id) !== null) actions.detachChild(card.id, pos)
      else actions.move(card.id, pos)
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

  const childCount = card.children?.length ?? 0
  const confirmCopy = isMat && childCount > 0 ? '连纸带叠，一起撕下？' : `删掉这一张${childCount > 0 ? `，连同卡内的 ${String(childCount)} 张卡片一起` : ''}？`
  const shift = drag ?? follow
  const shown = size ?? card.size
  // 纸黄昏（D1）：压暗 45% 是纸落暮色不是黑幕；起点抬纸候着，靶纸挂着穿针的指针。
  const linkCls =
    linkMode === 'blocked' ? ' bj-link-dim' : linkMode === 'origin' ? ' bj-link-origin' : linkMode === 'target' ? ' bj-link-target' : ''

  return (
    <div
      data-card
      data-card-id={card.id}
      data-link={linkMode === 'off' ? undefined : linkMode}
      className={`bj-card be-${card.kind}${selected ? ' is-sel' : ''}${dropOn ? ' is-dropon' : ''}${justBorn ? ' bj-settle' : ''}${linkCls}`}
      style={{
        left: card.pos.x,
        top: card.pos.y,
        width: shown.w,
        height: shown.h,
        zIndex: z,
        transform: shift !== null ? `translate3d(${String(shift.dx)}px, ${String(shift.dy)}px, 0)` : undefined,
      }}
      onPointerDown={onBackgroundDown}
      onPointerMove={onBackgroundMove}
      onPointerUp={onBackgroundUp}
      onPointerCancel={() => {
        dragRef.current = null
        setDrag(null)
        onDragActiveChange(false)
        actions.setDropTarget(null)
        actions.setDragFollow(null)
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
              <button type="button" className="bj-menu-item" onClick={() => { setMenu('closed'); actions.startLinking(card.id) }}>
                牵线
              </button>
              <button type="button" className="bj-menu-item" onClick={() => setMenu('confirm')}>
                删除
              </button>
            </div>
          ) : null}
          {menu === 'confirm' ? (
            <div className="bj-menu bj-menu-confirm">
              <p>{confirmCopy}</p>
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
