import type { ReactElement } from 'react'
import type { FileProps } from '../../domain/types'
import type { CardRenderer, RenderCtx } from './types'
import { isPlainObject } from '../../domain/validation'
import { humanSize, useAssetUrl } from './asset'
import { IconFile } from '../components/icons'

function readFile(raw: unknown): FileProps {
  if (!isPlainObject(raw)) return { hash: '' }
  return typeof raw['hash'] === 'string' ? { hash: raw['hash'] } : { hash: '' }
}

function FileView({ raw, ctx }: { readonly raw: unknown; readonly ctx: RenderCtx }): ReactElement {
  const p = readFile(raw)
  const { url, asset, missing } = useAssetUrl(ctx.app, p.hash)
  const label = asset?.name ?? (p.hash === '' ? '（无原件)' : `${p.hash.slice(0, 10)}…`)
  return (
    <div className="bj-file-chip" data-nodrag>
      <span className="bj-file-ico">
        <IconFile />
      </span>
      <span className="bj-file-name">{label}</span>
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
