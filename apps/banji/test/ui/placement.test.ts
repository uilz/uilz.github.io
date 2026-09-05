import { describe, expect, it } from 'vitest'
import {
  clampCardPos,
  dropAt,
  edgeScrollStep,
  fitWithin,
  hasOffscreenRight,
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

  it('影纸与图片共一条封顶血脉：D1 路由迁 attachRoute 后，封顶公式对两型同值恒等', () => {
    // R9·D1 起 mime→kind 判别全住 attachRoute.test.ts；placement 只管几何——
    // 视频创建期的宽封顶复用 imageFitMaxW（R3 公式一字不动），此处钉死这条复用线不漂移。
    expect(imageFitMaxW(390)).toBe(290) // 手机：390-72-28 收进屏内
    expect(imageFitMaxW(1024)).toBe(MAX_CARD_IMAGE_W) // 桌面：封顶回 420
    expect(imageCardSize(1600, 900, imageFitMaxW(390))).toEqual({ w: 318, h: 189 }) // 900·(290/1600)=163.1→163 +26
  })
})

describe('hasOffscreenRight：宽画布耳语的纯几何判据（右缘 > vw-48）', () => {
  const at = (x: number, w: number): { pos: { x: number }; size: { w: number } } => ({ pos: { x }, size: { w } })

  it('手机屏 390（可见纸宽 342）：桌面时代的越屏卡为真、屏内卡与恰贴右缘者为假', () => {
    expect(hasOffscreenRight([at(300, 240)], 390)).toBe(true) // 540 > 342
    expect(hasOffscreenRight([at(100, 260)], 390)).toBe(true) // 360 > 342
    expect(hasOffscreenRight([at(24, 318)], 390)).toBe(false) // 342 = 342（手机图片卡封顶恰在界上）
    expect(hasOffscreenRight([at(0, 300)], 390)).toBe(false)
  })

  it('桌面屏 1280（可见纸宽 1232）：同几何在该屏内者不误响', () => {
    expect(hasOffscreenRight([at(300, 900)], 1280)).toBe(false) // 1200 ≤ 1232
    expect(hasOffscreenRight([at(400, 900)], 1280)).toBe(true) // 1300 > 1232
    expect(hasOffscreenRight([at(24, 318), at(400, 900)], 1280)).toBe(true) // 任一越界即响
    expect(hasOffscreenRight([at(24, 318), at(100, 200)], 1280)).toBe(false)
  })

  it('边界口径：空画布恒假；非浏览器（vw=∞）恒假；只看横轴不看纵轴', () => {
    expect(hasOffscreenRight([], 390)).toBe(false)
    expect(hasOffscreenRight([at(9_999, 10)], Number.POSITIVE_INFINITY)).toBe(false)
    expect(hasOffscreenRight([{ pos: { x: 0 }, size: { w: 10 } }], 12)).toBe(true)
  })
})

describe('edgeScrollStep：拖卡远垫自动滚屏（纸面惯性=平方缓入，封顶 12px/帧）', () => {
  it('带宽未触 = 0：带内沿恰在边界上不进带（view 0..500，band 48）', () => {
    for (const p of [48, 100, 300, 452]) expect(edgeScrollStep(p, 0, 500)).toBe(0)
  })

  it('左/上缘为负、右/下缘为正；深度 (d/48)² 缓入：¼ 深 1px、半深 3px、满带 12px（取整）', () => {
    expect(edgeScrollStep(36, 0, 500)).toBe(-1) // d=12 → 12·(1/4)²=0.75 → round -1
    expect(edgeScrollStep(24, 0, 500)).toBe(-3) // d=24 → 12·(1/2)²=3
    expect(edgeScrollStep(0, 0, 500)).toBe(-12) // d=48 满带封顶
    expect(edgeScrollStep(500, 0, 500)).toBe(12)
    expect(edgeScrollStep(476, 0, 500)).toBe(3)
  })

  it('出视口钳到封顶不放大：±9999 也只 ±12；全扫描 |step|≤12 且方向恒合法', () => {
    expect(edgeScrollStep(-9_999, 0, 500)).toBe(-12)
    expect(edgeScrollStep(9_999, 0, 500)).toBe(12)
    for (let p = -600; p <= 1_100; p += 5) {
      const s = edgeScrollStep(p, 0, 500)
      expect(Math.abs(s)).toBeLessThanOrEqual(12)
      // 带沿浅处取整归零（<~2px 深推不动纸）：只锁方向，不锁“进带即动”。
      if (p < 48) expect(s).toBeLessThanOrEqual(0)
      else if (p > 452) expect(s).toBeGreaterThanOrEqual(0)
      else expect(s).toBe(0)
      if (p < 24) expect(s).toBeLessThan(0)
      if (p > 476) expect(s).toBeGreaterThan(0)
    }
  })

  it('深度单调：越出缘越深、推得越急（缓入非阶跃）', () => {
    const steps = [47, 40, 30, 20, 10, 0].map((p) => Math.abs(edgeScrollStep(p, 0, 500)))
    for (let i = 1; i < steps.length; i++) expect(steps[i]).toBeGreaterThanOrEqual(steps[i - 1] ?? 0)
    expect(steps.at(-1)).toBe(12)
  })
})
