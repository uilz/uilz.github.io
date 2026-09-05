// 影纸的自然尺寸探测（R9）：与 probe.ts 同一条纪律——唯一触碰 DOM 位图/媒体 API 的 UI 缝，可注入。
// <video preload="metadata"> 读到 loadedmetadata 即取 videoWidth/Height（不播、不解码整片）；
// 探测失败返回 null → 卡片以渲染器默认尺寸落纸，渲染器在 loadedmetadata 里仍会自愈补全（图片同款双保险）。
import type { CardSize } from '../domain/types'

export type VideoProber = (file: Blob) => Promise<CardSize | null>

export const probeVideoSize: VideoProber = (file) =>
  new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const video = document.createElement('video')
    video.preload = 'metadata'
    const done = (size: CardSize | null): void => {
      URL.revokeObjectURL(url)
      video.removeAttribute('src')
      resolve(size)
    }
    video.onloadedmetadata = () => {
      const w = video.videoWidth
      const h = video.videoHeight
      done(w > 0 && h > 0 ? { w, h } : null)
    }
    video.onerror = () => done(null)
    video.src = url
  })
