// 图片自然尺寸探测 —— 唯一触碰 DOM 位图 API 的 UI 缝，可注入以便测试替换。
// 首选 createImageBitmap（不建 Object URL，无泄漏面）；缺位时退到 <img> 探测。
// 探测失败返回 null：卡片以渲染器默认尺寸落纸，图片加载后渲染器仍会自行补全比例。
import type { CardSize } from '../domain/types'

export type ImageProber = (file: Blob) => Promise<CardSize | null>

async function probeViaBitmap(file: Blob): Promise<CardSize | null> {
  const bmp = await createImageBitmap(file)
  try {
    return { w: bmp.width, h: bmp.height }
  } finally {
    bmp.close()
  }
}

function probeViaImg(file: Blob): Promise<CardSize | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    const done = (size: CardSize | null): void => {
      URL.revokeObjectURL(url)
      resolve(size)
    }
    img.onload = () => done(img.naturalWidth > 0 ? { w: img.naturalWidth, h: img.naturalHeight } : null)
    img.onerror = () => done(null)
    img.src = url
  })
}

export const probeImageSize: ImageProber = async (file) => {
  try {
    if (typeof createImageBitmap === 'function') return await probeViaBitmap(file)
    return await probeViaImg(file)
  } catch {
    return null
  }
}

/** 夹带失败的安静人话（配额是这台浏览器最常见的失败，值得单列）。 */
export function attachFailureCopy(err: unknown): string {
  const name = err instanceof DOMException || err instanceof Error ? err.name : ''
  if (name === 'QuotaExceededError') return '这一份没夹上 · 纸面快满了'
  return '这一份没夹上 · 再试一次'
}
