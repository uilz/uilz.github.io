// 日手札画布：纸、线、串珠子的总装。三种目光——卡片（过日子）、牵线（纸黄昏）、线（串珠子），
// 目光与撕线签都住中介 dayState（R7 瞬态账），本层只负责摆纸、挂线、请出招呼。
import { useEffect, useMemo, useRef, useState } from 'react'
import type { ChangeEvent, DragEvent as ReactDragEvent, ReactElement } from 'react'
import type { DayStore } from '../store'
import type { BanjiApp } from '../../application'
import type { Card, CardPos } from '../../domain/types'
import { dateTitle } from '../labels'
import { CardFrame } from './CardFrame'
import { GhostCard } from './GhostCard'
import { LinesLayer } from './LinesLayer'
import { Linker } from './Linker'
import { ThreadPanel } from './ThreadPanel'
import { DayHead } from './DayHead'
import { linkPhases } from '../linkage'
import { useWideCanvasWhisper, WIDE_HINT_KEY } from '../useWideCanvasWhisper'
import { IconPaperclip, IconStack } from './icons'
import { dayHref } from '../router'
import { viewportWidthNow } from '../placement'
import { renderStackOrder, subtreeIds } from '../stackGeometry'
import { useAutoScrollWhileDragging } from '../useAutoScroll'

export { WIDE_HINT_KEY }

interface DayViewProps {
  readonly app: BanjiApp
  readonly date: string
  readonly store: DayStore
  readonly onOpenSettings: () => void
}

export function DayView({ app, date, store, onOpenSettings }: DayViewProps): ReactElement {
  const { state, actions } = store
  const fileRef = useRef<HTMLInputElement>(null)
  const canvasRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const dragDepthRef = useRef(0)
  const [dragging, setDragging] = useState(false)
  const [cardDrag, setCardDrag] = useState(false)
  useAutoScrollWhileDragging(scrollRef, cardDrag)
  const { whisper, onScrolled } = useWideCanvasWhisper(app, scrollRef, state.loaded, state.cards)
  const sorted = renderStackOrder(state.cards)
  const followSet = useMemo<Set<string> | null>(
    () => (state.dragFollow === null ? null : subtreeIds(state.cards, state.dragFollow.rootId)),
    [state.dragFollow, state.cards],
  )
  const followFor = (id: Card['id']): { dx: number; dy: number } | null =>
    state.dragFollow !== null && followSet?.has(id) === true && state.dragFollow.rootId !== id
      ? { dx: state.dragFollow.dx, dy: state.dragFollow.dy }
      : null
  const linking = state.linkFromId !== null
  const phases = linkPhases(state.cards, state.links, state.linkFromId)
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return
      if (state.linkFromId !== null) actions.cancelLinking()
      if (state.lineChipId !== null) actions.setLineChip(null)
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
    }
  }, [state.linkFromId, state.lineChipId, actions])
  const minCanvasW = Math.min(600, Math.max(320, viewportWidthNow() - 48))
  const canvasW = Math.max(minCanvasW, ...sorted.map((c) => c.pos.x + c.size.w + 200))
  const canvasH = Math.max(480, ...sorted.map((c) => c.pos.y + c.size.h + 200))

  // 桌面端粘贴：只劫持有文件的粘贴；纯文本粘贴原样交给 textarea 的本地行为。
  useEffect(() => {
    const onPaste = (e: ClipboardEvent): void => {
      const files = e.clipboardData?.files
      if (files === undefined || files.length === 0) return
      e.preventDefault()
      actions.attach([...files])
    }
    window.addEventListener('paste', onPaste)
    return () => {
      window.removeEventListener('paste', onPaste)
    }
  }, [actions])

  const onPicked = (e: ChangeEvent<HTMLInputElement>): void => {
    const files = e.target.files === null ? [] : [...e.target.files]
    e.target.value = ''
    if (files.length > 0) actions.attach(files)
  }

  /** 落点 = 指针在画布坐标系中的位置（卡片坐标即画布绝对坐标）。 */
  const canvasPoint = (e: ReactDragEvent): CardPos | null => {
    const canvas = canvasRef.current
    if (canvas === null) return null
    const r = canvas.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }

  const filesOf = (e: ReactDragEvent): readonly File[] =>
    e.dataTransfer === null ? [] : [...e.dataTransfer.files]

  return (
    <div className="bj-day" data-day-view data-gaze={state.gaze} data-linking={linking || undefined}>
      <DayHead
        title={dateTitle(date)}
        gaze={state.gaze}
        onGaze={(g) => actions.setGaze(g, g === 'thread' ? state.selectedId : null)}
        onOpenSettings={onOpenSettings}
      />
      {state.gaze === 'thread' ? (
        <ThreadPanel
          app={app}
          anchor={state.threadAnchor}
          onOpenDate={(d) => {
            actions.setGaze('cards', null)
            window.location.hash = dayHref(d)
          }}
        />
      ) : (
        <>
          <div
            className="bj-scroll"
            ref={scrollRef}
            onPointerDown={(e) => {
              const t = e.target
              if (t instanceof Element && t.closest('[data-card]') === null && t.closest('.bj-line-chip') === null) {
                if (linking) actions.cancelLinking()
                else if (state.editingId !== null) actions.exitEdit()
                else actions.select(null)
                actions.setLineChip(null)
              }
            }}
            onScroll={onScrolled}
          >
            <div
              className={`bj-canvas${dragging ? ' is-drop' : ''}${linking ? ' is-linking' : ''}`}
              ref={canvasRef}
              style={{ width: canvasW, height: canvasH }}
              onDragOver={(e) => {
                if (e.dataTransfer === null || !Array.from(e.dataTransfer.types).includes('Files')) return
                e.preventDefault()
                e.dataTransfer.dropEffect = 'copy'
              }}
              onDragEnter={(e) => {
                if (e.dataTransfer === null || !Array.from(e.dataTransfer.types).includes('Files')) return
                dragDepthRef.current += 1
                setDragging(true)
              }}
              onDragLeave={() => {
                dragDepthRef.current = Math.max(0, dragDepthRef.current - 1)
                if (dragDepthRef.current === 0) setDragging(false)
              }}
              onDrop={(e) => {
                if (e.dataTransfer === null || !Array.from(e.dataTransfer.types).includes('Files')) return
                e.preventDefault()
                dragDepthRef.current = 0
                setDragging(false)
                const files = filesOf(e)
                if (files.length === 0) return
                const at = canvasPoint(e)
                actions.attach(files, at ?? undefined)
              }}
            >
              <LinesLayer
                cards={state.cards}
                links={state.links}
                hotId={state.selectedId}
                chipId={state.lineChipId}
                onChip={actions.setLineChip}
                onRemoveLine={actions.removeLine}
                linking={linking}
              />
              {state.loaded && sorted.length === 0 && state.ghosts.length === 0 ? (
                <div className="bj-empty">
                  <p className="bj-empty-main">这一天还是空白。落一笔吧。</p>
                  <p className="bj-empty-sub">夹带或拖入一张照片，也算落过笔</p>
                </div>
              ) : null}
              {sorted.map((card, i) => (
                <CardFrame
                  key={card.id}
                  card={card}
                  cards={state.cards}
                  app={app}
                  date={date}
                  actions={actions}
                  selected={state.selectedId === card.id}
                  editing={state.editingId === card.id}
                  dropOn={state.dropTargetId === card.id}
                  follow={followFor(card.id)}
                  z={i + 1}
                  justBorn={state.lastAddedId === card.id || state.settleIds.includes(card.id)}
                  linkMode={linking ? (phases.get(card.id) ?? 'blocked') : 'off'}
                  onDragActiveChange={setCardDrag}
                />
              ))}
              {state.ghosts.map((g) => (
                <GhostCard key={g.token} ghost={g} />
              ))}
            </div>
          </div>
          <div className="bj-add-wrap" data-add-wrap={linking ? 'hidden' : undefined}>
            <button type="button" className="bj-clip" aria-label="夹带" title="夹带一张照片或文件" onClick={() => fileRef.current?.click()} tabIndex={linking ? -1 : 0}>
              <IconPaperclip size={17} />
            </button>
            <button type="button" aria-label="造叠" className="bj-clip" title="造一叠：拖一张纸进来就是一叠" onClick={() => actions.createContainer()} tabIndex={linking ? -1 : 0}>
              <IconStack />
            </button>
            <button type="button" className="bj-add" onClick={() => actions.addTextCard()} tabIndex={linking ? -1 : 0}>
              添一张卡
            </button>
          </div>
        </>
      )}
      <input ref={fileRef} type="file" accept="*/*" multiple className="bj-attach-file" aria-label="夹带" onChange={onPicked} />
      {whisper === 'off' || state.gaze !== 'cards' ? null : (
        <p className={`bj-wide-hint${whisper === 'fading' ? ' is-fading' : ''}`} aria-hidden>
          纸比屏宽 · 左右推移可看
        </p>
      )}
      {state.linkFromId === null ? null : (
        <Linker app={app} date={date} originId={state.linkFromId} links={state.links} onLink={actions.linkTo} />
      )}
    </div>
  )
}
