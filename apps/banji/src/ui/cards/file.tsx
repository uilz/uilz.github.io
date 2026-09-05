import type { ReactElement } from 'react'
import type { CardRenderer, RenderCtx } from './types'
import { assetLabel, humanSize, readAssetProps, useAssetUrl } from './asset'
import { IconFile } from '../components/icons'

function FileView({ raw, ctx }: { readonly raw: unknown; readonly ctx: RenderCtx }): ReactElement {
  const p = readAssetProps(raw)
  const { url, asset, missing } = useAssetUrl(ctx.app, p.hash)
  const label = assetLabel(p.name, asset, p.hash)
  return (
    <div className="bj-file-chip" data-nodrag>
      <span className="bj-file-ico">
        <IconFile />
      </span>
      <span className="bj-file-name" data-file-name>{label}</span>
      {asset !== undefined ? <span className="bj-file-size">{humanSize(asset.size)}</span> : null}
      {url !== null ? (
        <a className="bj-file-save" href={url} download={asset?.name ?? true}>
          存一份
        </a>
      ) : missing ? (
        <span className="bj-file-quiet">原件不在了</span>
      ) : null}
    </div>
  )
}

export const fileRenderer: CardRenderer = {
  displayName: '文件',
  iconKind: 'file',
  editable: false,
  defaultSize: { w: 260, h: 64 },
  emptyDraft: () => ({ hash: '' }),
  render: (props, ctx) => <FileView raw={props} ctx={ctx} />,
}
