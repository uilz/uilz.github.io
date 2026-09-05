import type { ReactElement } from 'react'
import type { CardRenderer, RenderCtx } from './types'
import { isPlainObject } from '../../domain/validation'
import { linkHostname, safeHttpUrl } from '../../domain/link'
import { revealInViewport } from '../focus'
import { IconLinkSign } from '../components/icons'

// 题签纸（R9·D2）：题面（title 或 hostname）+ 网址细线——不是超链接蓝。
// 纵深防御两道闸：创建/编辑期提交时 safeHttpUrl 才写 props（半途草稿连 props 都不进）；
// 渲染期再走一次——库里的 url 若不合格（手改档案、旧版本），连一条 <a> 都换不来，只以文本现形。

const WHISPER_URL = '写个完整网址，比如 https://…'

function readLink(raw: unknown): { readonly url: string; readonly title?: string } {
  if (!isPlainObject(raw)) return { url: '' }
  const url = typeof raw['url'] === 'string' ? raw['url'] : ''
  const title = typeof raw['title'] === 'string' && raw['title'] !== '' ? raw['title'] : undefined
  return { url, ...(title === undefined ? {} : { title }) }
}

function LinkView({ raw, ctx }: { readonly raw: unknown; readonly ctx: RenderCtx }): ReactElement {
  const p = readLink(raw)
  if (ctx.editing) {
    const commit = (value: string): boolean => {
      const clean = safeHttpUrl(value)
      if (clean === null) return false
      ctx.setProps({ url: clean })
      return true
    }
    return (
      <div className="bj-link-edit" onMouseDown={(e) => e.preventDefault()}>
        <span className="bj-file-ico"><IconLinkSign /></span>
        <input
          className="bj-link-input"
          data-nodrag
          data-link-field
          type="text"
          inputMode="url"
          defaultValue={p.url === '' ? undefined : p.url}
          placeholder={WHISPER_URL}
          autoFocus
          onFocus={(e) => revealInViewport(e.currentTarget, 'center')}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              if (commit(e.currentTarget.value)) ctx.exitEdit()
              else ctx.whisper(WHISPER_URL)
            }
            if (e.key === 'Escape') ctx.exitEdit()
          }}
          onBlur={(e) => {
            revealInViewport(e.currentTarget, 'nearest')
            if (commit(e.currentTarget.value)) ctx.exitEdit()
            else if (e.currentTarget.value.trim() !== '') ctx.whisper(WHISPER_URL)
            else ctx.exitEdit()
          }}
        />
      </div>
    )
  }
  const href = safeHttpUrl(p.url)
  if (href === null) {
    return p.url === ''
      ? <div className="bj-img-quiet" data-link-empty onDoubleClick={() => ctx.enterEdit()}>这张题签还没写上网址</div>
      : <div className="bj-link-failed" data-link-hosted onDoubleClick={() => ctx.enterEdit()} title="这串网址不可信，点两下重写">{p.url}</div>
  }
  return (
    <div className="bj-link-chip" data-link-card>
      <p className="bj-link-face" data-link-display title={p.title ?? linkHostname(href)}>
        <span className="bj-file-ico"><IconLinkSign /></span>{p.title ?? linkHostname(href)}
      </p>
      <a className="bj-link-hair" data-nodrag href={href} target="_blank" rel="noopener" title={href}>{linkHostname(href)}</a>
    </div>
  )
}

export const linkRenderer: CardRenderer = {
  displayName: '题签纸',
  iconKind: 'link',
  editable: true,
  defaultSize: { w: 300, h: 84 },
  emptyDraft: () => ({ url: '' }),
  render: (props, ctx) => <LinkView raw={props} ctx={ctx} />,
}
