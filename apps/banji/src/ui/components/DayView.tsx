import { useEffect, useMemo, useRef, useState } from 'react'
import type { ChangeEvent, DragEvent as ReactDragEvent, ReactElement } from 'react'
import type { DayStore } from '../store'
import type { Ghost } from '../store'
import type { BanjiApp } from '../../application'
import type { Card, CardPos } from '../../domain/types'
import { weekdayMondayIndex } from '../../domain/date'
import { WEEKDAYS_MONDAY } from '../labels'
import { CardFrame } from './CardFrame'
import { IconChevronLeft, IconGear, IconPaperclip, IconStack } from './icons'
import { hasOffscreenRight, viewportWidthNow } from '../placement'
import { renderStackOrder, subtreeIds } from '../stackGeometry'

/** 设置键一次读穿：耳语终生只耳语一次（“见过”以库内记录为准，换设备也记得）。 */
export const WIDE_HINT_KEY = 'hint_wide_canvas'

function dateTitle(date: string): string {
  const y = date.slice(0, 4)
  const m = String(Number(date.slice(5, 7)))
  const d = String(Number(date.slice(8, 10)))
  const w = WEEKDAYS_MONDAY[weekdayMondayIndex(date)]
  return `${y}年${m}月${d}日 · 周${w ?? ''}`
}

function GhostCard({ ghost }: { readonly ghost: Ghost }): ReactElement {
  return (
    <div
      className={`bj-card bj-ghost be-${ghost.kind}`}
      style={{ left: ghost.pos.x, top: ghost.pos.y, width: ghost.size.w, height: ghost.size.h }}
      data-ghost={ghost.kind}
      aria-hidden
    >
      <span className="bj-ghost-inner">
        <IconPaperclip size={15} />
        <span className="bj-ghost-text">{ghost.name === '' ? '落纸中…' : `落纸中 · ${ghost.name}`}</span>
      </span>
    </div>
  )
}

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
  const canvasPoint = (e: ReactDragEvent): CardPos | null => {
    const canvas = canvasRef.current
    if (canvas === null) return null
    const r = canvas.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }

  const filesOf = (e: ReactDragEvent): readonly File[] =>
    e.dataTransfer === null ? [] : [...e.dataTransfer.files]

  return (
    <div className="bj-day" data-day-view>
      <header className="bj-day-head">
        <a className="bj-back" href="#/" aria-label="回到月历">
          <IconChevronLeft size={18} />
          <span>手札</span>
        </a>
        <h2 className="bj-day-title">{dateTitle(date)}</h2>
        <button type="button" className="bj-quiet-btn" aria-label="设置" onClick={onOpenSettings}>
          <IconGear />
        </button>
      </header>
      <div
        className="bj-scroll"
        ref={scrollRef}
        onPointerDown={(e) => {
          const t = e.target
          if (t instanceof Element && t.closest('[data-card]') === null) {
            if (state.editingId !== null) actions.exitEdit()
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
          className={`bj-canvas${dragging ? ' is-drop' : ''}`}
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
              justBorn={state.lastAddedId === card.id}
            />
          ))}
          {state.ghosts.map((g) => (
            <GhostCard key={g.token} ghost={g} />
          ))}
        </div>
      </div>
      <div className="bj-add-wrap">
        <button type="button" className="bj-clip" aria-label="夹带" title="夹带一张照片或文件" onClick={() => fileRef.current?.click()}>
          <IconPaperclip size={17} />
        </button>
        <button type="button" aria-label="造叠" className="bj-clip" title="造一叠：拖一张纸进来就是一叠" onClick={() => actions.createContainer()}>
          <IconStack />
        </button>
        <button type="button" className="bj-add" onClick={() => actions.addTextCard()}>
          添一张卡
        </button>
      </div>
      <input ref={fileRef} type="file" accept="*/*" multiple className="bj-attach-file" aria-label="夹带" onChange={onPicked} />
      {whisper === 'off' ? null : (
        <p className={`bj-wide-hint${whisper === 'fading' ? ' is-fading' : ''}`} aria-hidden>
          纸比屏宽 · 左右推移可看
        </p>
      )}
    </div>
  )
}
