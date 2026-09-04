import { describe, expect, it } from 'vitest'
import {
  attachKind,
  clampCardPos,
  dropAt,
  fitWithin,
  imageCardSize,
  scatterPos,
  CARD_CHROME,
  IMAGE_MAX_W,
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

  it('瀑布向下且错列：前三张横排起点，第四张回左列但更低；20 张两两不同点', () => {
    expect(scatterPos(0)).toEqual({ x: 24, y: 24 })
    expect(scatterPos(1)).toEqual({ x: 172, y: 264 })
    expect(scatterPos(2)).toEqual({ x: 320, y: 504 })
    expect(scatterPos(3)).toEqual({ x: 24, y: 744 })
    const seen = new Set<string>()
    for (let i = 0; i < 20; i++) seen.add(JSON.stringify(scatterPos(i)))
    expect(seen.size).toBe(20)
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

  it('fitWithin 宽封顶 420 保比例；小图原样通过；退化尺寸不出 0', () => {
    expect(fitWithin(800, 600)).toEqual({ w: 420, h: 315 })
    expect(fitWithin(300, 200)).toEqual({ w: 300, h: 200 })
    expect(fitWithin(0, 0)).toEqual({ w: 1, h: 1 })
    expect(fitWithin(4000, 1000)).toEqual({ w: IMAGE_MAX_W, h: 105 })
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
