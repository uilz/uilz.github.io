import { describe, expect, it } from 'vitest'
import {
  attachKind,
  clampCardPos,
  dropAt,
  fitWithin,
  imageCardSize,
  imageFitMaxW,
  scatterPos,
  CARD_CHROME,
  DEFAULT_CARD_W,
  EDGE_MARGIN,
  MAX_CARD_IMAGE_W,
  NARROW_VW,
  SCATTER_X0,
  SCATTER_Y0,
} from '../../src/ui/placement'

describe('新卡落纸位置学（纯函数）', () => {
  it('scatterPos 确定性：同 i 永远同点，之字瀑布公式可复算', () => {
    const a = scatterPos(7)
    const b = scatterPos(7)
    expect(a).toEqual(b)
    for (let i = 0; i < 40; i++) {
      expect(scatterPos(i)).toEqual({ x: 24 + ((i * 148) % 444), y: 24 + i * 240 })
    }
  })

  it('宽视口（1280）与无约束公式逐点相等：桌面落纸一寸不让', () => {
    for (let i = 0; i < 40; i++) {
      expect(scatterPos(i, 1280)).toEqual(scatterPos(i))
    }
  })

  it('瀑布向下且错列：前三张横排起点，第四张回左列但更低；20 张两两不同点', () => {
    expect(scatterPos(0)).toEqual({ x: 24, y: 24 })
    expect(scatterPos(1)).toEqual({ x: 172, y: 264 })
    expect(scatterPos(2)).toEqual({ x: 320, y: 504 })
    expect(scatterPos(3)).toEqual({ x: 24, y: 744 })
    const seen = new Set<string>()
    for (let i = 0; i < 20; i++) seen.add(JSON.stringify(scatterPos(i)))
    expect(seen.size).toBe(20)
  })

  it('窄屏 <480：单列瀑布 x≡24，y 阶梯独走；同 (i,390) 永远同点', () => {
    for (let i = 0; i <= 20; i++) {
      const p = scatterPos(i, 390)
      expect(p).toEqual({ x: SCATTER_X0, y: SCATTER_Y0 + i * 240 })
      expect(scatterPos(i, 390)).toEqual(p)
    }
  })

  it('窄屏与宽屏分层：同一 i 在 390/1280 下 x 不同（漂移只属于宽屏）', () => {
    expect(scatterPos(4, 390).x).not.toBe(scatterPos(4, 1280).x)
  })

  it('右缘钳制真触发：480/520 屏上 x=320 的漂移被收进 vw-24-300', () => {
    expect(scatterPos(2, 1280)).toEqual({ x: 320, y: 504 })
    expect(scatterPos(2, NARROW_VW)).toEqual({ x: 156, y: 504 })
    expect(scatterPos(2, 520)).toEqual({ x: 196, y: 504 })
    expect(scatterPos(2, 520).x + DEFAULT_CARD_W).toBeLessThanOrEqual(520 - EDGE_MARGIN)
  })

  it('右缘不变量：i∈0..20 × vw∈{320,390,520,768,1280}，默认卡右缘 ≤ vw-24 或在 x=0 兜底', () => {
    for (const vw of [320, 390, 520, 768, 1280]) {
      for (let i = 0; i <= 20; i++) {
        const p = scatterPos(i, vw)
        const fits = p.x + DEFAULT_CARD_W <= vw - EDGE_MARGIN
        expect(fits || p.x === 0, `i=${i} vw=${vw} -> ${JSON.stringify(p)}`).toBe(true)
      }
    }
  })

  it('dropAt：多文件绕落点每份错位 24px', () => {
    const base = { x: 320, y: 180 }
    expect(dropAt(base, 0)).toEqual(base)
    expect(dropAt(base, 1)).toEqual({ x: 344, y: 204 })
    expect(dropAt(base, 2)).toEqual({ x: 368, y: 228 })
  })

  it('clampCardPos 取整且不落入负坐标', () => {
    expect(clampCardPos({ x: -13.6, y: 40.4 })).toEqual({ x: 0, y: 40 })
    expect(clampCardPos({ x: 100.7, y: 200.2 })).toEqual({ x: 101, y: 200 })
  })

  it('fitWithin 宽封顶 MAX_CARD_IMAGE_W 保比例；小图原样通过；退化尺寸不出 0', () => {
    expect(fitWithin(800, 600)).toEqual({ w: 420, h: 315 })
    expect(fitWithin(300, 200)).toEqual({ w: 300, h: 200 })
    expect(fitWithin(0, 0)).toEqual({ w: 1, h: 1 })
    expect(fitWithin(4000, 1000)).toEqual({ w: MAX_CARD_IMAGE_W, h: 105 })
  })

  it('imageFitMaxW 单一真相：无限宽恒等于封顶常量；手机屏收进 vw-72-边框；极小屏有底', () => {
    expect(imageFitMaxW()).toBe(MAX_CARD_IMAGE_W)
    expect(imageFitMaxW(Number.POSITIVE_INFINITY)).toBe(MAX_CARD_IMAGE_W)
    expect(imageFitMaxW(1024)).toBe(MAX_CARD_IMAGE_W)
    expect(imageFitMaxW(390)).toBe(390 - EDGE_MARGIN * 3 - CARD_CHROME.w)
    expect(imageFitMaxW(160)).toBe(80)
    expect(imageFitMaxW(128)).toBe(80)
  })

  it('整卡宽不变量：任意 vw∈{390,768,1280} 下（本体+边框）≤ vw-48', () => {
    for (const vw of [390, 768, 1280]) {
      const full = imageCardSize(1200, 900, imageFitMaxW(vw))
      expect(full.w).toBeLessThanOrEqual(vw - EDGE_MARGIN * 2)
    }
  })

  it('手机创建链公式：1200x900 @390 → 本体 290x218、整卡 318x244（屏上左右各留 24）', () => {
    const maxW = imageFitMaxW(390)
    expect(maxW).toBe(290)
    expect(fitWithin(1200, 900, maxW)).toEqual({ w: 290, h: 218 })
    expect(imageCardSize(1200, 900, maxW)).toEqual({ w: 318, h: 244 })
  })

  it('imageCardSize = 建议尺寸 + 卡片边框余量', () => {
    const fit = fitWithin(800, 600)
    expect(imageCardSize(800, 600)).toEqual({ w: fit.w + CARD_CHROME.w, h: fit.h + CARD_CHROME.h })
  })

  it('attachKind：唯 mime 前缀是从，未知类型一律文件卡', () => {
    expect(attachKind('image/png')).toBe('image')
    expect(attachKind('image/svg+xml')).toBe('image')
    expect(attachKind('application/pdf')).toBe('file')
    expect(attachKind('')).toBe('file')
    expect(attachKind('application/x-unknown')).toBe('file')
  })
})
