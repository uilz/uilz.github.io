import type { ReactElement } from 'react'
import type { CardRenderer, RenderCtx } from './types'
import { isPlainObject } from '../../domain/validation'
import { revealInViewport } from '../focus'

// 代码纸（R9·D2）：暖墨等宽——不是终端黑块，零依赖法下没有语法高亮。
// 编辑与正文同款 textarea（blur 落笔）；读侧 white-space:pre + overflow-x auto，长行横向推纸不折行。
function readText(raw: unknown): string {
  if (!isPlainObject(raw)) return ''
  return typeof raw['text'] === 'string' ? raw['text'] : ''
}

function CodeView({ raw, ctx }: { readonly raw: unknown; readonly ctx: RenderCtx }): ReactElement {
  const text = readText(raw)
  if (ctx.editing) {
    return (
      <div className="bj-text-edit">
        <textarea
          className="bj-textarea bj-code-area"
          value={text}
          data-nodrag
          data-code-edit
          placeholder="贴上或敲进一段代码…"
          spellCheck={false}
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
    <pre className="bj-code-read" data-code-view onDoubleClick={() => ctx.enterEdit()}>
      {text === '' ? <span className="bj-code-quiet">这张纸在等一段代码</span> : text}
    </pre>
  )
}

export const codeRenderer: CardRenderer = {
  displayName: '代码纸',
  iconKind: 'code',
  editable: true,
  defaultSize: { w: 300, h: 170 },
  emptyDraft: () => ({ text: '' }),
  render: (props, ctx) => <CodeView raw={props} ctx={ctx} />,
}
