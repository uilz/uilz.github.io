import { useState, type ReactElement } from 'react'
import type { CardRenderer, RenderCtx } from './types'
import { assetLabel, readAssetProps, useAssetUrl } from './asset'
import { PDF_OPEN_HOLD_MS } from './pdf'
import { deriveInitialSize } from './md'
import { imageFitMaxW, viewportWidthNow } from '../placement'

// R11·D2 题签统一：「影纸常挂」口径胜出——图纸与共型资产卡都永显 assetLabel 一行小名
// （props.name → 资产原名 → hash 前八），未改名不再藏签；展示链只住 asset.ts 一家。
// R15·D2 跨端回看兜底：iPhone 存的图纸（HEIC）在解不开的机器上 <img> 会 onError——这不是
// 错误态，是「此处展不开、原件在」：换同一血脉的 quiet 折签 + 开新页发丝（交棒宽限沿用
// R14 火漆政策，同一个 PDF_OPEN_HOLD_MS，不重造）。卡照常全能（改名/删除/牵线住 CardFrame）。
function ImageView({ raw, ctx }: { readonly raw: unknown; readonly ctx: RenderCtx }): ReactElement {
  const p = readAssetProps(raw)
  const { url, asset, missing, holdForHandoff } = useAssetUrl(ctx.app, p.hash, { handoffHoldMs: PDF_OPEN_HOLD_MS })
  const [folded, setFolded] = useState(false)
  if (p.hash === '' || missing) {
    return <div className="bj-img-quiet">这张图片的原件不在了</div>
  }
  const label = assetLabel(p.name, asset, p.hash)
  return (
    <>
      {url === null ? (
        <div className="bj-img-quiet">正在取出…</div>
      ) : folded ? (
        <div className="bj-img-fold" data-nodrag>
          <div className="bj-img-quiet">这台机器展不开这张纸</div>
          <a className="bj-img-handoff" data-img-handoff href={url} target="_blank" rel="noopener" onClick={holdForHandoff}>
            开新页试试
          </a>
        </div>
      ) : (
        <img
          className="bj-img"
          src={url}
          alt=""
          draggable={false}
          onError={() => { setFolded(true) }}
          onLoad={(e) => {
            const img = e.currentTarget
            if (p.w === undefined && p.h === undefined && img.naturalWidth > 0) {
              ctx.setProps(deriveInitialSize(img.naturalWidth, img.naturalHeight, imageFitMaxW(viewportWidthNow())))
            }
          }}
        />
      )}
      <p className="bj-img-name bj-asset-name" data-asset-name title={label}>{label}</p>
    </>
  )
}

export const imageRenderer: CardRenderer = {
  displayName: '图片',
  iconKind: 'image',
  editable: false,
  defaultSize: { w: 280, h: 210 },
  emptyDraft: () => ({ hash: '' }),
  render: (props, ctx) => <ImageView raw={props} ctx={ctx} />,
}
