import type { ReactElement } from 'react'
import type { ImageProps } from '../../domain/types'
import type { CardRenderer, RenderCtx } from './types'
import { isPlainObject } from '../../domain/validation'
import { useAssetUrl } from './asset'
import { deriveInitialSize } from './md'

function readImage(raw: unknown): ImageProps {
  if (!isPlainObject(raw)) return { hash: '' }
  const out: ImageProps = { hash: typeof raw['hash'] === 'string' ? raw['hash'] : '' }
  if (typeof raw['w'] === 'number') out.w = raw['w']
  if (typeof raw['h'] === 'number') out.h = raw['h']
  return out
}

function ImageView({ raw, ctx }: { readonly raw: unknown; readonly ctx: RenderCtx }): ReactElement {
  const p = readImage(raw)
  const { url, missing } = useAssetUrl(ctx.app, p.hash)
  if (p.hash === '' || missing) {
    return <div className="bj-img-quiet">这张图片的原件不在了</div>
  }
  if (url === null) {
    return <div className="bj-img-quiet">正在取出…</div>
  }
  return (
    <img
      className="bj-img"
      src={url}
      alt=""
      draggable={false}
      onLoad={(e) => {
        const img = e.currentTarget
        if (p.w === undefined && p.h === undefined && img.naturalWidth > 0) {
          ctx.setProps(deriveInitialSize(img.naturalWidth, img.naturalHeight, 520))
        }
      }}
    />
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
