import type { ReactElement } from 'react'
import type { CardRenderer, RenderCtx } from './types'
import { assetLabel, readAssetProps, useAssetUrl } from './asset'
import { deriveInitialSize } from './md'
import { imageFitMaxW, viewportWidthNow } from '../placement'

// R11·D2 题签统一：「影纸常挂」口径胜出——图纸与共型资产卡都永显 assetLabel 一行小名
// （props.name → 资产原名 → hash 前八），未改名不再藏签；展示链只住 asset.ts 一家。
function ImageView({ raw, ctx }: { readonly raw: unknown; readonly ctx: RenderCtx }): ReactElement {
  const p = readAssetProps(raw)
  const { url, asset, missing } = useAssetUrl(ctx.app, p.hash)
  if (p.hash === '' || missing) {
    return <div className="bj-img-quiet">这张图片的原件不在了</div>
  }
  const label = assetLabel(p.name, asset, p.hash)
  return (
    <>
      {url === null ? (
        <div className="bj-img-quiet">正在取出…</div>
      ) : (
        <img
          className="bj-img"
          src={url}
          alt=""
          draggable={false}
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
