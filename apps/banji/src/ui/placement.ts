// 新卡落纸的位置学 —— 纯函数，UI 私有（不涉及存储契约）。
// 等差散布取代 R1 的 (24,24) 排队：i = 当日卡片数，同一天的落点确定可复现。
import type { CardPos, CardSize } from '../domain/types'

export const SCATTER_X0 = 24
export const SCATTER_Y0 = 24
const X_STEP = 148
const X_SPAN = 444
const Y_STEP = 240

/** 之字形瀑布：横向三段漂移 × 纵向逐档下沉，新卡永远落在上一张下方，不盖住刚落过的字。 */
export function scatterPos(i: number): CardPos {
  return {
    x: SCATTER_X0 + ((i * X_STEP) % X_SPAN),
    y: SCATTER_Y0 + i * Y_STEP,
  }
}

/** 一次夹带多张：绕落点小幅错位，纸片之间留出可辨的边缘。 */
export function dropAt(pos: CardPos, index: number): CardPos {
  return { x: pos.x + index * 24, y: pos.y + index * 24 }
}

function clampPos(v: number): number {
  return Math.max(0, Math.round(v))
}

export function clampCardPos(pos: CardPos): CardPos {
  return { x: clampPos(pos.x), y: clampPos(pos.y) }
}

/** 夹带图片的落定尺寸上限（宽）。 */
export const IMAGE_MAX_W = 420

/** .bj-card 的内衬（左右 14 / 上 12 下 14 的近似体感取整）：图片本体之外加的边框余量。 */
export const CARD_CHROME: CardSize = { w: 28, h: 26 }

/** 自然尺寸 → 建议展示尺寸：宽封顶 IMAGE_MAX_W，保持长宽比。 */
export function fitWithin(natW: number, natH: number, maxW: number = IMAGE_MAX_W): CardSize {
  const w = Math.max(1, natW)
  const h = Math.max(1, natH)
  const scale = Math.min(1, maxW / w)
  return { w: Math.round(w * scale), h: Math.round(h * scale) }
}

/** 探测到自然宽高后，图片卡的整体尺寸（含卡片边框余量）。 */
export function imageCardSize(natW: number, natH: number): CardSize {
  const fit = fitWithin(natW, natH)
  return { w: fit.w + CARD_CHROME.w, h: fit.h + CARD_CHROME.h }
}

/** kind 判别只有一条规则：mime 以 image/ 开头者成图片卡，其余一律文件卡（未知类型至少存得下）。 */
export function attachKind(mime: string): 'image' | 'file' {
  return mime.startsWith('image/') ? 'image' : 'file'
}
