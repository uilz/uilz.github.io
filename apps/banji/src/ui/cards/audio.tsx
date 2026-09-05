import type { ReactElement } from 'react'
import type { CardRenderer, RenderCtx } from './types'
import { assetLabel, humanSize, readAssetProps, useAssetUrl } from './asset'
import { IconAudio } from '../components/icons'

// 声音纸（R9·D2）：纸上一枚原生控件，不装样子——没有假波形艺术。
// chip：角标 + 名（D6 优先级链）+ 尺寸 + <audio controls>（objectURL 与卡片同生死）。
function AudioView({ raw, ctx }: { readonly raw: unknown; readonly ctx: RenderCtx }): ReactElement {
  const p = readAssetProps(raw)
  const { url, asset, missing } = useAssetUrl(ctx.app, p.hash)
  if (p.hash === '') return <div className="bj-img-quiet">这段声音的原件没夹上</div>
  if (missing) return <div className="bj-img-quiet">这页声音的原件不在了</div>
  const label = assetLabel(p.name, asset, p.hash)
  return (
    <div className="bj-audio-chip" data-nodrag>
      <p className="bj-audio-head">
        <span className="bj-file-ico"><IconAudio /></span>
        <span className="bj-file-name bj-asset-name" data-asset-name>{label}</span>
        {asset !== undefined ? <span className="bj-file-size">{humanSize(asset.size)}</span> : null}
      </p>
      {url === null ? <p className="bj-img-quiet">正在取出…</p> : <audio className="bj-audio" controls preload="metadata" src={url} />}
    </div>
  )
}

export const audioRenderer: CardRenderer = {
  displayName: '声音纸',
  iconKind: 'audio',
  editable: false,
  defaultSize: { w: 320, h: 96 },
  emptyDraft: () => ({ hash: '' }),
  render: (props, ctx) => <AudioView raw={props} ctx={ctx} />,
}
