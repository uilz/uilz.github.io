import type { ReactElement } from 'react'
import type { CardRenderer, RenderCtx } from './types'
import { assetLabel, humanSize, readAssetProps, useAssetUrl } from './asset'
import { IconPdf } from '../components/icons'

// 火漆小签（R9·D2）：pdf 角标 + 名 + 尺寸，tap = 原件在新页读（_blank + noopener）。
// 内嵌预览明确不做（零依赖法，没有 pdf.js）——R10 候选，记在 ROUNDS。
function PdfView({ raw, ctx }: { readonly raw: unknown; readonly ctx: RenderCtx }): ReactElement {
  const p = readAssetProps(raw)
  const { url, asset, missing } = useAssetUrl(ctx.app, p.hash)
  if (p.hash === '') return <div className="bj-img-quiet">这份文书的原件没夹上</div>
  const label = assetLabel(p.name, asset, p.hash)
  const seal = <span className="bj-pdf-seal" aria-hidden><IconPdf /></span>
  if (missing) {
    return (
      <div className="bj-file-chip bj-pdf-chip" data-asset-name>
        {seal}
        <span className="bj-file-name">{label}</span>
        <span className="bj-file-quiet">原件不在了</span>
      </div>
    )
  }
  return (
    <a className="bj-file-chip bj-pdf-chip" data-nodrag data-asset-name data-pdf-open href={url ?? undefined} target="_blank" rel="noopener">
      {seal}
      <span className="bj-file-name">{label}</span>
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
