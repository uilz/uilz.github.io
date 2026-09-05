import type { ReactElement } from 'react'
import type { Ghost } from '../store'
import { IconPaperclip } from './icons'

/** 夹带在途的虚影：资产未落定前的安静占位，只活在 UI 内存，落定即换真纸。 */
export function GhostCard({ ghost }: { readonly ghost: Ghost }): ReactElement {
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
