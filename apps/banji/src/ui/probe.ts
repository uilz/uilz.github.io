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

// FileReader 读盘失败在浏览器间以 name 或 TypeError 呈现，两种都归"读不进来"。
const READ_FAIL_NAMES: ReadonlySet<string> = new Set(['NotReadableError', 'EncodingError'])

/** 夹带失败回执：按根因分三条人话（配额给出路、读失败给重试、其余保守兜底）。 */
export function attachFailureCopy(err: unknown): string {
  const name = err instanceof DOMException || err instanceof Error ? err.name : ''
  if (name === 'QuotaExceededError') return '这一份没夹上 · 手机的存储空间不够了，先导出或清理一些吧'
  if (READ_FAIL_NAMES.has(name) || err instanceof TypeError) return '这一份没能读进来 · 再试一次'
  return '这一份没夹上 · 再试一次'
}
