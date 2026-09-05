// 日手札画布：纸、线、串珠子的总装。三种目光——卡片（过日子）、牵线（纸黄昏）、线（串珠子）。
// 目光切换是瞬态（刷新即忘）；线住纸下、页上（LinesLayer）；撕线签、近日单都只在该出现时出现。
import { useEffect, useMemo, useRef, useState } from 'react'
import type { ChangeEvent, DragEvent as ReactDragEvent, ReactElement } from 'react'
import type { DayStore } from '../store'
import type { BanjiApp } from '../../application'
import type { Card, CardId } from '../../domain/types'
import { dateTitle } from '../labels'
import { CardFrame } from './CardFrame'
import { GhostCard } from './GhostCard'
import { LinesLayer } from './LinesLayer'
import { Linker } from './Linker'
import { ThreadPanel } from './ThreadPanel'
import { linkPhases } from '../linkage'
import { IconChevronLeft, IconGear, IconPaperclip, IconStack } from './icons'
import { dayHref } from '../router'
import { hasOffscreenRight, viewportWidthNow } from '../placement'
import { renderStackOrder, subtreeIds } from '../stackGeometry'
import { useAutoScrollWhileDragging } from '../useAutoScroll'

/** 设置键一次读穿：耳语终生只耳语一次（“见过”以库内记录为准，换设备也记得）。 */
export const WIDE_HINT_KEY = 'hint_wide_canvas'

/** 目光：卡片=过日子；线=串珠（锚点定在切换一瞬的选中，瞬态不落库）。 */
type Gaze = { readonly kind: 'cards' } | { readonly kind: 'thread'; readonly anchor: CardId | null }

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
  const [gaze, setGaze] = useState<Gaze>({ kind: 'cards' })
  const [chipId, setChipId] = useState<string | null>(null)
  // 拖入远垫：拖卡时指针压到滚动窗缘 48px 内就缓缓推纸（reduced-motion 让位，见 useAutoScroll）。
  useAutoScrollWhileDragging(scrollRef, cardDrag)
  // 宽画布耳语：设置未读回前按“见过”处理（宁可不响，不错闪）。
  const [whisper, setWhisper] = useState<'off' | 'on' | 'fading'>('off')
  const [hintProbeTick, setHintProbeTick] = useState(0)
  const whisperSeenRef = useRef(true)
  const whisperBaseXRef = useRef(0)
  // 垫纸永远压在自己的纸下（D2）：渲染序由 z 升序 + 祖先链前置推导，存储的 z 原封不动。
  const sorted = renderStackOrder(state.cards)
  const followSet = useMemo<Set<string> | null>(
    () => (state.dragFollow === null ? null : subtreeIds(state.cards, state.dragFollow.rootId)),
    [state.dragFollow, state.cards],
  )
  const followFor = (id: Card['id']): { dx: number; dy: number } | null =>
    state.dragFollow !== null && followSet?.has(id) === true && state.dragFollow.rootId !== id
      ? { dx: state.dragFollow.dx, dy: state.dragFollow.dy }
      : null
  // 牵线靶子（D1）：谁能被牵全由纯函数判；起牵一瞬撕线签退场（两个手势不叠影）。
  const linking = state.linkFromId !== null
  const phases = linkPhases(state.cards, state.links, state.linkFromId)
  useEffect(() => {
    if (!linking) return
    setChipId(null)
  }, [linking])
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return
      if (state.linkFromId !== null) actions.cancelLinking()
      setChipId(null)
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
    }
  }, [state.linkFromId, actions])
  // 空画布最小宽随视口收缩（390 屏上不再横向滚一条 600px 的"死纸边"），桌面 min 600 不变。
  const minCanvasW = Math.min(600, Math.max(320, viewportWidthNow() - 48))
  const canvasW = Math.max(minCanvasW, ...sorted.map((c) => c.pos.x + c.size.w + 200))
  const canvasH = Math.max(480, ...sorted.map((c) => c.pos.y + c.size.h + 200))

  useEffect(() => {
    let live = true
    void app.getSetting(WIDE_HINT_KEY).then((v) => {
      if (!live) return
      whisperSeenRef.current = v === true
      setHintProbeTick((t) => t + 1)
    })
    return () => {
      live = false
    }
  }, [app])

  useEffect(() => {
    if (!state.loaded || whisper !== 'off' || whisperSeenRef.current) return
    if (hasOffscreenRight(state.cards, viewportWidthNow())) {
      whisperBaseXRef.current = scrollRef.current?.scrollLeft ?? 0
      setWhisper('on')
    }
  }, [state.loaded, state.cards, hintProbeTick, whisper])

  useEffect(() => {
    if (whisper !== 'fading') return
    const t = window.setTimeout(() => setWhisper('off'), 220)
    return () => window.clearTimeout(t)
  }, [whisper])

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
  const canvasPoint = (e: ReactDragEvent): Card['pos'] | null => {
    const canvas = canvasRef.current
    if (canvas === null) return null
    const r = canvas.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }

  const filesOf = (e: ReactDragEvent): readonly File[] =>
    e.dataTransfer === null ? [] : [...e.dataTransfer.files]

  const emptyCanvas = (
    <div className="bj-thread" data-thread data-empty>
      <p className="bj-thread-whisper">这一天还没有纸。落一笔，再来看线。</p>
    </div>
  )

  return (
    <div className="bj-day" data-day-view data-gaze={gaze.kind} data-linking={linking || undefined}>
      <header className="bj-day-head">
        <a className="bj-back" href="#/" aria-label="回到月历">
          <IconChevronLeft size={18} />
          <span>手札</span>
        </a>
        <h2 className="bj-day-title">{dateTitle(date)}</h2>
        <div className="bj-mode-seg" role="group" aria-label="日视图模式">
          <button
            type="button"
            className={`bj-mode-seg-btn${gaze.kind === 'cards' ? ' is-on' : ''}`}
            onClick={() => {
              actions.cancelLinking()
              setGaze({ kind: 'cards' })
            }}
          >
            卡片
          </button>
          <button
            type="button"
            data-mode="thread"
            className={`bj-mode-seg-btn${gaze.kind === 'thread' ? ' is-on' : ''}`}
            onClick={() => {
              actions.cancelLinking()
              setGaze({ kind: 'thread', anchor: state.selectedId })
            }}
          >
            线
          </button>
        </div>
        <button type="button" className="bj-quiet-btn" aria-label="设置" onClick={onOpenSettings}>
          <IconGear />
        </button>
      </header>
      {gaze.kind === 'thread' ? (
        state.loaded && state.cards.length === 0 ? (
          emptyCanvas
        ) : (
          <ThreadPanel
            app={app}
            anchor={gaze.anchor}
            onOpenDate={(d) => {
              setGaze({ kind: 'cards' })
              window.location.hash = dayHref(d)
            }}
          />
        )
      ) : (
        <>
          <div
            className="bj-scroll"
            ref={scrollRef}
            onPointerDown={(e) => {
              const t = e.target
              if (t instanceof Element && t.closest('[data-card]') === null && t.closest('.bj-line-chip') === null) {
                setChipId(null)
                if (linking) actions.cancelLinking()
                else if (state.editingId !== null) actions.exitEdit()
                else actions.select(null)
              }
            }}
            onScroll={() => {
              if (whisper !== 'on') return
              const el = scrollRef.current
              // 只认横移：键盘避让的纵向 scrollIntoView 不算“推移可看”。
              if (el === null || Math.abs(el.scrollLeft - whisperBaseXRef.current) < 4) return
              whisperSeenRef.current = true
              void app.setSetting(WIDE_HINT_KEY, true)
              setWhisper('fading')
            }}
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
                chipId={chipId}
                onChip={setChipId}
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
      {whisper === 'off' || gaze.kind !== 'cards' ? null : (
        <p className={`bj-wide-hint${whisper === 'fading' ? ' is-fading' : ''}`} aria-hidden>
          纸比屏宽 · 左右推移可看
        </p>
      )}
      {state.linkFromId === null ? null : (
        <Linker
          app={app}
          date={date}
          originId={state.linkFromId}
          links={state.links}
          onLink={actions.linkTo}
        />
      )}
    </div>
  )
}
