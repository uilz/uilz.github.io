// 添卡种类纸单（R9·D3）：「添一张卡」的一 tap 正文口径一字不动（hero 回归闸），
// 旁边一枚发丝 caret 掀开纸单——正文/手记/代码/链接/垫纸，各走既有动作，零新编排。
// 开合是纯屏幕瞬态：不落库、不进中介状态（R7 瞬态纪律）；Esc/点单外即收。
import { useEffect, useState } from 'react'
import type { ReactElement } from 'react'
import type { DayActions } from '../store'
import type { IconKind } from '../cards/types'
import { CardTypeIcon, IconCaretDown } from './icons'

interface KindRow {
  readonly label: string
  readonly icon: IconKind
  readonly pick: (actions: KindSheetActions) => void
}

type KindSheetActions = Pick<DayActions, 'addTextCard' | 'addCardOf' | 'createContainer'>

// 顺序即决策路径：先最常用的正文，重器（垫纸）压底。
const ROWS: readonly KindRow[] = [
  { label: '正文', icon: 'text', pick: (a) => a.addTextCard() },
  { label: '手记', icon: 'md', pick: (a) => a.addCardOf('markdown') },
  { label: '代码', icon: 'code', pick: (a) => a.addCardOf('code') },
  { label: '链接', icon: 'link', pick: (a) => a.addCardOf('link') },
  { label: '垫纸', icon: 'stack', pick: (a) => a.createContainer() },
]

interface KindSheetProps {
  readonly actions: KindSheetActions
  /** 牵线黄昏里整排底栏退出击线（与回形针/造叠同口径：点纸才是手势）。 */
  readonly linking: boolean
}

export function KindSheet({ actions, linking }: KindSheetProps): ReactElement {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent): void => {
      const t = e.target
      if (t instanceof Element && t.closest('[data-kind-wrap]') === null) setOpen(false)
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('pointerdown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])
  useEffect(() => {
    if (linking) setOpen(false)
  }, [linking])
  return (
    <div className="bj-kind-wrap" data-kind-wrap>
      {open ? (
        <div className="bj-kind-sheet" data-kind-sheet role="menu" aria-label="添一张卡的种类">
          {ROWS.map((r) => (
            <button
              key={r.label}
              type="button"
              role="menuitem"
              className="bj-kind-row"
              data-kind-row={r.label}
              onClick={() => {
                setOpen(false)
                r.pick(actions)
              }}
            >
              <CardTypeIcon kind={r.icon} />
              <span>{r.label}</span>
            </button>
          ))}
        </div>
      ) : null}
      <button
        type="button"
        className="bj-clip bj-kind-caret"
        aria-label="添一张卡·种类"
        aria-expanded={open}
        title="还想落别的纸？掀开这张纸单"
        tabIndex={linking ? -1 : 0}
        onClick={() => setOpen((v) => !v)}
      >
        <IconCaretDown />
      </button>
    </div>
  )
}
