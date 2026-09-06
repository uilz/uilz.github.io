import { useState, type ReactElement } from 'react'
import type { CardRenderer, RenderCtx } from './types'
import { assetLabel, readAssetProps, useAssetUrl } from './asset'
import { PDF_OPEN_HOLD_MS } from './pdf'
import { deriveInitialSize } from './md'
import { imageFitMaxW, viewportWidthNow } from '../placement'

// 影纸（R9·D2）：一枚原生 <video controls>（不造假 poster——原生首帧够了）。
// 创建期封顶与图片共一条血脉（管线 probeVideoSize + imageFitMaxW 落 w/h）；
// 这里 loadedmetadata 自愈补全，未定尺的老纸也按视口封顶落定。
// R15·D2 同款折签：异机存的影纸本机 codec 解不开时 onError 上桌——不挂碎控件，
// 「这台机器展不开这张纸」+ 交棒宽限同一路政策（见 image.tsx 头注）。
function VideoView({ raw, ctx }: { readonly raw: unknown; readonly ctx: RenderCtx }): ReactElement {
  const p = readAssetProps(raw)
  const { url, asset, missing, holdForHandoff } = useAssetUrl(ctx.app, p.hash, { handoffHoldMs: PDF_OPEN_HOLD_MS })
  const [folded, setFolded] = useState(false)
  if (p.hash === '') return <div className="bj-img-quiet">这段影像的原件没夹上</div>
  if (missing) return <div className="bj-img-quiet">这段影像的原件不在了</div>
  const label = assetLabel(p.name, asset, p.hash)
  return (
    <div className="bj-video-wrap" data-nodrag>
      {url === null ? <div className="bj-img-quiet">正在取出…</div> : folded ? (
        <div className="bj-img-fold" data-nodrag>
          <div className="bj-img-quiet">这台机器展不开这张纸</div>
          <a className="bj-img-handoff" data-img-handoff href={url} target="_blank" rel="noopener" onClick={holdForHandoff}>
            开新页试试
          </a>
        </div>
      ) : (
        <video
          className="bj-video"
          controls
          preload="metadata"
          src={url}
          onError={() => { setFolded(true) }}
          onLoadedMetadata={(e) => {
            const v = e.currentTarget
            if (p.w === undefined && p.h === undefined && v.videoWidth > 0 && v.videoHeight > 0) {
              ctx.setProps(deriveInitialSize(v.videoWidth, v.videoHeight, imageFitMaxW(viewportWidthNow())))
            }
          }}
        />
      )}
      <p className="bj-video-name bj-asset-name" data-asset-name title={label}>{label}</p>
    </div>
  )
}

export const videoRenderer: CardRenderer = {
  displayName: '影纸',
  iconKind: 'video',
  editable: false,
  defaultSize: { w: 320, h: 208 },
  emptyDraft: () => ({ hash: '' }),
  render: (props, ctx) => <VideoView raw={props} ctx={ctx} />,
}
