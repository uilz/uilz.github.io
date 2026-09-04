import type { ReactElement } from 'react'
import type { CardRenderer, RenderCtx } from './types'
import type { TextProps } from '../../domain/types'
import { isPlainObject } from '../../domain/validation'
import { revealInViewport } from '../focus'
import { parseMd } from './md'
import { MdView } from './MdView'

interface NormalizedText extends TextProps {
  readonly text: string
}

function normalizeText(raw: unknown): NormalizedText {
  if (!isPlainObject(raw)) return { text: '', format: 'plain' }
  const text = typeof raw['text'] === 'string' ? raw['text'] : ''
  return raw['format'] === 'md' ? { text, format: 'md' } : { text, format: 'plain' }
}

function formatSwitch(ctx: RenderCtx, current: 'plain' | 'md'): ReactElement {
  const pick = (format: 'plain' | 'md'): void => {
    ctx.setProps({ format })
  }
  return (
    <div className="bj-fmt-row" onMouseDown={(e) => e.preventDefault()}>
      <button type="button" data-nodrag className={`bj-fmt${current === 'plain' ? ' bj-fmt-on' : ''}`} onClick={() => pick('plain')}>
        正文
      </button>
      <button type="button" data-nodrag className={`bj-fmt${current === 'md' ? ' bj-fmt-on' : ''}`} onClick={() => pick('md')}>
        手记
      </button>
    </div>
  )
}

function TextView({ raw, ctx }: { readonly raw: unknown; readonly ctx: RenderCtx }): ReactElement {
  const p = normalizeText(raw)
  if (ctx.editing) {
    return (
      <div className="bj-text-edit">
        <textarea
          className="bj-textarea"
          value={p.text}
          data-nodrag
          placeholder="落一笔…"
          autoFocus
          onFocus={(e) => revealInViewport(e.currentTarget, 'center')}
          onBlur={(e) => {
            revealInViewport(e.currentTarget, 'nearest')
            ctx.exitEdit()
          }}
          onChange={(e) => ctx.setProps({ text: e.target.value })}
        />
        {formatSwitch(ctx, p.format ?? 'plain')}
      </div>
    )
  }
  return (
    <div className="bj-text-read" onDoubleClick={() => ctx.enterEdit()}>
      {p.format === 'md' ? <MdView blocks={parseMd(p.text)} /> : p.text}
    </div>
  )
}

export const textRenderer: CardRenderer = {
  displayName: '文字',
  iconKind: 'text',
  editable: true,
  defaultSize: { w: 300, h: 170 },
  emptyDraft: () => ({ text: '', format: 'plain' }),
  render: (props, ctx) => <TextView raw={props} ctx={ctx} />,
}
