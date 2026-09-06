import type { ReactElement } from 'react'
import type { CardRenderer, RenderCtx } from './types'
import { assetLabel, humanSize, readAssetProps, useAssetUrl } from './asset'
import { IconPdf } from '../components/icons'

// 火漆小签（R9·D2）：pdf 角标 + 名 + 尺寸，tap = 原件在新页读（_blank + noopener）。
// 内嵌预览 R11·D3 拍板不做（CLOSED-BY-DECISION：PDF.js 违背零依赖+离线轻；新页翻开=浏览器全权）——永不再开账。
// R13·D3：新页初载还在从这条 blob: 取数时掐 URL 会翻出白页，永不掐又漏到整页关掉为止。
// 拍板「交棒宽限」：点翻开即把这条 URL 的释放改挂 10 分钟超时（首屏早够时间落地；
// 超时释放对已载入的页无伤），同纸再翻时旧棒由新棒顶替——两头都不输。
export const PDF_OPEN_HOLD_MS = 600_000

function PdfView({ raw, ctx }: { readonly raw: unknown; readonly ctx: RenderCtx }): ReactElement {
  const p = readAssetProps(raw)
  const { url, asset, missing, holdForHandoff } = useAssetUrl(ctx.app, p.hash, { handoffHoldMs: PDF_OPEN_HOLD_MS })
  if (p.hash === '') return <div className="bj-img-quiet">这份文书的原件没夹上</div>
  const label = assetLabel(p.name, asset, p.hash)
  const seal = <span className="bj-pdf-seal" aria-hidden><IconPdf /></span>
  if (missing) {
    return (
      <div className="bj-file-chip bj-pdf-chip">
        {seal}
        <span className="bj-file-name bj-asset-name" data-asset-name>{label}</span>
        <span className="bj-file-quiet">原件不在了</span>
      </div>
    )
  }
  return (
    <a className="bj-file-chip bj-pdf-chip" data-nodrag data-pdf-open href={url ?? undefined} target="_blank" rel="noopener" onClick={holdForHandoff}>
      {seal}
      <span className="bj-file-name bj-asset-name" data-asset-name>{label}</span>
      {asset !== undefined ? <span className="bj-file-size">{humanSize(asset.size)}</span> : null}
      {url === null ? <span className="bj-file-quiet">正在取出</span> : <span className="bj-pdf-open">翻开</span>}
    </a>
  )
}

export const pdfRenderer: CardRenderer = {
  displayName: '火漆签',
  iconKind: 'pdf',
  editable: false,
  defaultSize: { w: 260, h: 56 },
  emptyDraft: () => ({ hash: '' }),
  render: (props, ctx) => <PdfView raw={props} ctx={ctx} />,
}
