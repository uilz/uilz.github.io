import type { ReactElement } from 'react'
import type { CardRenderer, RenderCtx } from './types'
import { isPlainObject } from '../../domain/validation'
import { parseMd } from './md'
import { MdView } from './MdView'
import { revealInViewport } from '../focus'

// 手记纸（R9·D2）：text 渲染器的 md 别名槽——parseMd/MdView 两支笔早已存在，
// 这一格只是把 v1 契约里的 'markdown' 挂上。正文卡的手记/正文 chip 原样只在 text 路走，两路并存。
function readText(raw: unknown): string {
  if (!isPlainObject(raw)) return ''
  return typeof raw['text'] === 'string' ? raw['text'] : ''
}

function MarkdownView({ raw, ctx }: { readonly raw: unknown; readonly ctx: RenderCtx }): ReactElement {
  const text = readText(raw)
  if (ctx.editing) {
    return (
      <div className="bj-text-edit">
        <textarea
          className="bj-textarea"
          value={text}
          data-nodrag
          data-md-edit
          placeholder="立个标题、列几条、记一段…"
          autoFocus
          onFocus={(e) => revealInViewport(e.currentTarget, 'center')}
          onBlur={(e) => {
            revealInViewport(e.currentTarget, 'nearest')
            ctx.exitEdit()
          }}
          onChange={(e) => ctx.setProps({ text: e.target.value })}
        />
      </div>
    )
  }
  return (
    <div className="bj-text-read" data-md-view onDoubleClick={() => ctx.enterEdit()}>
      <MdView blocks={parseMd(text)} />
    </div>
  )
}

export const markdownRenderer: CardRenderer = {
  displayName: '手记纸',
  iconKind: 'md',
  editable: true,
  defaultSize: { w: 300, h: 170 },
  emptyDraft: () => ({ text: '', format: 'md' }),
  render: (props, ctx) => <MarkdownView raw={props} ctx={ctx} />,
}
