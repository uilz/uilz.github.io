import type { ReactElement } from 'react'
import type { CardRenderer, RenderCtx } from './types'
import { assetLabel, readAssetProps, useAssetUrl } from './asset'
import { deriveInitialSize } from './md'
import { imageFitMaxW, viewportWidthNow } from '../placement'

// 影纸（R9·D2）：一枚原生 <video controls>（不造假 poster——原生首帧够了）。
// 创建期封顶与图片共一条血脉（管线 probeVideoSize + imageFitMaxW 落 w/h）；
// 这里 loadedmetadata 自愈补全，未定尺的老纸也按视口封顶落定。
function VideoView({ raw, ctx }: { readonly raw: unknown; readonly ctx: RenderCtx }): ReactElement {
  const p = readAssetProps(raw)
  const { url, asset, missing } = useAssetUrl(ctx.app, p.hash)
  if (p.hash === '') return <div className="bj-img-quiet">这段影像的原件没夹上</div>
  if (missing) return <div className="bj-img-quiet">这段影像的原件不在了</div>
  const label = assetLabel(p.name, asset, p.hash)
  return (
    <div className="bj-video-wrap" data-nodrag data-asset-name>
      {url === null ? <div className="bj-img-quiet">正在取出…</div> : (
        <video
          className="bj-video"
          controls
          preload="metadata"
          src={url}
          onLoadedMetadata={(e) => {
            const v = e.currentTarget
            if (p.w === undefined && p.h === undefined && v.videoWidth > 0 && v.videoHeight > 0) {
              ctx.setProps(deriveInitialSize(v.videoWidth, v.videoHeight, imageFitMaxW(viewportWidthNow())))
            }
          }}
        />
      )}
      <p className="bj-video-name" title={label}>{label}</p>
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
