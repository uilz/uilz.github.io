import type { ReactElement } from 'react'
import type { ImageProps } from '../../domain/types'
import type { CardRenderer, RenderCtx } from './types'
import { isPlainObject } from '../../domain/validation'
import { useAssetUrl } from './asset'
import { deriveInitialSize } from './md'
import { imageFitMaxW, viewportWidthNow } from '../placement'

function readImage(raw: unknown): ImageProps {
  if (!isPlainObject(raw)) return { hash: '' }
  const hash = typeof raw['hash'] === 'string' ? raw['hash'] : ''
  const w = typeof raw['w'] === 'number' ? raw['w'] : undefined
  const h = typeof raw['h'] === 'number' ? raw['h'] : undefined
  const name = typeof raw['name'] === 'string' ? raw['name'] : undefined
  return { hash, ...(w === undefined ? {} : { w }), ...(h === undefined ? {} : { h }), ...(name === undefined ? {} : { name }) }
}

function ImageView({ raw, ctx }: { readonly raw: unknown; readonly ctx: RenderCtx }): ReactElement {
  const p = readImage(raw)
  const { url, missing } = useAssetUrl(ctx.app, p.hash)
  if (p.hash === '' || missing) {
    return <div className="bj-img-quiet">这张图片的原件不在了</div>
  }
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
      {p.name === undefined || p.name === '' ? null : (
        <p className="bj-img-name" title={p.name}>{p.name}</p>
      )}
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
