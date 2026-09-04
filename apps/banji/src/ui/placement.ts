// 新卡落纸的位置学 —— 纯函数，UI 私有（不涉及存储契约）。
// 等差散布取代 R1 的 (24,24) 排队：i = 当日卡片数，同一天的落点确定可复现。
// R3 视口感知：窄屏（<480 CSS px）收进单列（x 不漂移，y 阶梯独走）；
// 任何屏宽下，新卡右缘（按默认卡宽 300 计）绝不越出 vw-24 —— 手机不是小号桌面。
import type { CardPos, CardSize } from '../domain/types'

export const SCATTER_X0 = 24
export const SCATTER_Y0 = 24
const X_STEP = 148
const X_SPAN = 444
const Y_STEP = 240

/** 窄屏判定线（CSS px）：<480 走手机单列瀑布。 */
export const NARROW_VW = 480
/** 默认卡宽（文字卡）：落点右缘钳制按它计。 */
export const DEFAULT_CARD_W = 300
/** 卡片与视口边缘的呼吸留白（每侧）。 */
export const EDGE_MARGIN = 24

/** 读当前视口宽。非浏览器环境（Node 预渲染等）回退 Infinity=不加钳制。 */
export function viewportWidthNow(): number {
  const vw = typeof window !== 'undefined' ? window.innerWidth : 0
  return vw > 0 && Number.isFinite(vw) ? vw : Number.POSITIVE_INFINITY
}

/** 之字形瀑布（宽屏）/ 单列瀑布（窄屏）：viewportW 缺省 = 无约束（宽屏公式原样）。
 *  纯函数：同一 (i, viewportW) 永远同点；横向漂移钳到 vw - 24 - 默认卡宽以内。 */
export function scatterPos(i: number, viewportW: number = Number.POSITIVE_INFINITY): CardPos {
  const drift = viewportW < NARROW_VW ? 0 : ((i * X_STEP) % X_SPAN)
  const xLimit = viewportW - EDGE_MARGIN - DEFAULT_CARD_W
  return {
    x: Math.max(0, Math.min(SCATTER_X0 + drift, xLimit)),
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

/** 夹带图片的宽封顶（图片本体，不含卡片边框）。全仓唯一定义处：
 *  创建期（store 管线）与渲染期兜底（cards/image onLoad）都必须从这里派生，禁第二处字面量。 */
export const MAX_CARD_IMAGE_W = 420
/** 图片本体封顶的下限：再窄的屏也要留得住一张可辨的纸片。 */
const IMAGE_FLOOR_W = 80

/** .bj-card 的内衬（左右 14 / 上 12 下 14 的近似体感取整）：图片本体之外加的边框余量。 */
export const CARD_CHROME: CardSize = { w: 28, h: 26 }

/** 图片卡创建期的本体封顶 = min(420, vw - 24 画布页缘 - 24 散点留白 - 24 右呼吸 - 28 卡框)。
 *  手机上整卡（+CARD_CHROME）落在屏内且左右各留 24：桌面 room 溢出不受钳。 */
export function imageFitMaxW(viewportW: number = Number.POSITIVE_INFINITY): number {
  const room = viewportW - EDGE_MARGIN * 3 - CARD_CHROME.w
  return Math.max(IMAGE_FLOOR_W, Math.min(MAX_CARD_IMAGE_W, room))
}

/** 自然尺寸 → 建议展示尺寸：宽封顶 maxW（缺省桌面 420），保持长宽比。 */
export function fitWithin(natW: number, natH: number, maxW: number = MAX_CARD_IMAGE_W): CardSize {
  const w = Math.max(1, natW)
  const h = Math.max(1, natH)
  const scale = Math.min(1, maxW / w)
  return { w: Math.round(w * scale), h: Math.round(h * scale) }
}

/** 探测到自然宽高后，图片卡的整体尺寸（含卡片边框余量）。 */
export function imageCardSize(natW: number, natH: number, maxW: number = MAX_CARD_IMAGE_W): CardSize {
  const fit = fitWithin(natW, natH, maxW)
  return { w: fit.w + CARD_CHROME.w, h: fit.h + CARD_CHROME.h }
}

/** kind 判别只有一条规则：mime 以 image/ 开头者成图片卡，其余一律文件卡（未知类型至少存得下）。 */
export function attachKind(mime: string): 'image' | 'file' {
  return mime.startsWith('image/') ? 'image' : 'file'
}

export interface CanvasSized {
  readonly pos: { readonly x: number }
  readonly size: { readonly w: number }
}

/** 宽画布耳语的判据（纯几何）：任一卡右缘（画布绝对系）越过视口可见纸宽 = 屏外还压着纸。
 *  可见纸宽 = vw − 画布页缘 24 − 贴边呼吸 24；非浏览器（vw=∞）恒 false。 */
export function hasOffscreenRight(cards: readonly CanvasSized[], viewportW: number): boolean {
  if (!Number.isFinite(viewportW)) return false
  const visibleW = viewportW - EDGE_MARGIN * 2
  return cards.some((c) => c.pos.x + c.size.w > visibleW)
}
