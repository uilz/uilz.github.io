// R15·D2 跨端回看兜底：iPhone 存的图纸（或任何存成 image/video 后本机解不开的原件），
// <img>/<video> 解码失败（onError）不再挂碎图标——原地换纸的从容 quiet 签：
// 「这台机器展不开这张纸」+ 发丝「开新页试试」（blob 原件交新页，交棒沿用 R14 火漆宽限）。
// 题签名一行照旧在列（assetLabel 链不动）；卡片全能（重命名/删除/牵线/挪移住 CardFrame，
// 渲染器换的只是画面区）。这不是错误态：此处展不开、原件在。
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { App } from '../../src/ui/App'
import type { MockSeam } from './mocks'
import { makeMockApp } from './mocks'
import type { AssetRecord, Card, CardId } from '../../src/domain/types'
import { PDF_OPEN_HOLD_MS } from '../../src/ui/cards/pdf'

const DAY = '2026-01-15'
const HEX = '5bad'.padEnd(64, '0')
const URL_A = `blob:mock-${HEX.slice(0, 8)}`
let seam: MockSeam

function card(kind: string, props: Record<string, unknown>): Card {
  return { id: 'c-1' as CardId, kind, pos: { x: 40, y: 60 }, size: { w: 320, h: 210 }, props, createdAt: '', updatedAt: '' }
}
const rec = (name: string, type: string): AssetRecord => ({
  hash: HEX, mime: type, size: 2048, addedAt: '', name, blob: new File([new Uint8Array(16)], name, { type }),
})

function renderDay(): void {
  window.location.hash = `#/d/${DAY}`
  render(<App app={seam.app} initialTheme="light" now={() => new Date(2026, 0, 15)} />)
}
const settle = async (ms = 700): Promise<void> => {
  await new Promise((r) => setTimeout(r, ms))
}

beforeEach(() => {
  seam = makeMockApp()
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, writable: true, value: vi.fn((): string => URL_A) })
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, writable: true, value: vi.fn() })
})
afterEach(() => {
  cleanup()
  window.location.hash = ''
  vi.useRealTimers()
})

describe('R15·D2 图纸解不开的 quiet 折签', () => {
  it('iPhone 存的 HEIC 图纸在安卓上开：onError → 「这台机器展不开这张纸」+ 开新页发丝，碎图标退场', async () => {
    seam.assets.set(HEX, rec('IMG_0001.HEIC', 'image/heic'))
    seam.putDay(DAY, [card('image', { hash: HEX, w: 420, h: 315 })])
    renderDay()
    await settle()
    const img = document.querySelector('img.bj-img')
    expect(img).not.toBeNull()
    fireEvent(img as Element, new Event('error'))
    expect((await screen_find('这台机器展不开这张纸')).textContent).toBe('这台机器展不开这张纸')
    expect(document.querySelector('img.bj-img')).toBeNull()
  })

  it('折签三件套：开新页= blob 原件 _blank+noopener 交棒、题签名一行仍在、卡壳功能在场', async () => {
    seam.assets.set(HEX, rec('IMG_0001.HEIC', 'image/heic'))
    seam.putDay(DAY, [card('image', { hash: HEX })])
    renderDay()
    await settle()
    fireEvent(document.querySelector('img.bj-img') as Element, new Event('error'))
    await screen_find('开新页试试')
    const a = document.querySelector('a[data-img-handoff]')
    expect(a).not.toBeNull()
    expect(a?.getAttribute('href')).toBe(URL_A)
    expect(a?.getAttribute('target')).toBe('_blank')
    expect((a?.getAttribute('rel') ?? '').split(' ')).toContain('noopener')
    expect(document.querySelector('[data-asset-name]')?.textContent).toBe('IMG_0001.HEIC')
    expect(document.querySelector('[data-card-id]')).not.toBeNull()
  })

  it('交棒宽限沿用 R14 火漆政策：点开折签再卸载，URL 不即刻放，10 分钟到点恰放一次', async () => {
    vi.useFakeTimers()
    try {
      seam.assets.set(HEX, rec('IMG_0001.HEIC', 'image/heic'))
      seam.putDay(DAY, [card('image', { hash: HEX })])
      renderDay()
      await vi.advanceTimersByTimeAsync(800)
      fireEvent(document.querySelector('img.bj-img') as Element, new Event('error'))
      await vi.advanceTimersByTimeAsync(0)
      fireEvent.click(document.querySelector('a[data-img-handoff]') as Element)
      cleanup()
      await vi.advanceTimersByTimeAsync(0)
      expect(vi.mocked(URL.revokeObjectURL)).not.toHaveBeenCalled()
      await vi.advanceTimersByTimeAsync(PDF_OPEN_HOLD_MS - 1)
      expect(vi.mocked(URL.revokeObjectURL)).not.toHaveBeenCalled()
      await vi.advanceTimersByTimeAsync(2)
      expect(vi.mocked(URL.revokeObjectURL)).toHaveBeenCalledTimes(1)
      expect(vi.mocked(URL.revokeObjectURL)).toHaveBeenCalledWith(URL_A)
    } finally {
      vi.useRealTimers()
    }
  })

  it('没点开就卸载：即刻放——未交棒路径的 R9 纪律一字不动（折签不豁免）', async () => {
    seam.assets.set(HEX, rec('IMG_0001.HEIC', 'image/heic'))
    seam.putDay(DAY, [card('image', { hash: HEX })])
    renderDay()
    await settle()
    fireEvent(document.querySelector('img.bj-img') as Element, new Event('error'))
    await screen_find('这台机器展不开这张纸')
    cleanup()
    expect(vi.mocked(URL.revokeObjectURL)).toHaveBeenCalledTimes(1)
    expect(vi.mocked(URL.revokeObjectURL)).toHaveBeenCalledWith(URL_A)
  })

  it('影纸同款自家 onError：解不开换同一枚纸语折签，名一行照挂', async () => {
    seam.assets.set(HEX, rec('片段.mkv', 'video/x-matroska'))
    seam.putDay(DAY, [card('video', { hash: HEX })])
    renderDay()
    await settle()
    fireEvent(document.querySelector('video.bj-video') as Element, new Event('error'))
    await screen_find('这台机器展不开这张纸')
    expect(document.querySelector('video.bj-video')).toBeNull()
    expect(document.querySelector('a[data-img-handoff]')).not.toBeNull()
    expect(document.querySelector('[data-asset-name]')?.textContent).toBe('片段.mkv')
  })

  it('R16 声音纸同款parity onError：解不开换同一枚纸语折签，题头一行照挂', async () => {
    seam.assets.set(HEX, rec('现场.m4a', 'audio/mp4'))
    seam.putDay(DAY, [card('audio', { hash: HEX })])
    renderDay()
    await settle()
    fireEvent(document.querySelector('audio.bj-audio') as Element, new Event('error'))
    await screen_find('这台机器展不开这张纸')
    expect(document.querySelector('audio.bj-audio')).toBeNull()
    const a = document.querySelector('a[data-img-handoff]')
    expect(a?.getAttribute('href')).toBe(URL_A)
    expect(a?.getAttribute('target')).toBe('_blank')
    expect((a?.getAttribute('rel') ?? '').split(' ')).toContain('noopener')
    expect(document.querySelector('[data-asset-name]')?.textContent).toBe('现场.m4a')
  })

  it('可解码纸不受害：onError 从未开火则 <img> 恒在，quiet 折签永不抢戏', async () => {
    seam.assets.set(HEX, rec('雨后.png', 'image/png'))
    seam.putDay(DAY, [card('image', { hash: HEX })])
    renderDay()
    await settle()
    expect(document.querySelector('img.bj-img')).not.toBeNull()
    expect(document.body.textContent ?? '').not.toContain('展不开')
  })

  it('原件真没了走旧文案（「这张图片的原件不在了」），折签只在原件在而展不开时现身', async () => {
    seam.putDay(DAY, [card('image', { hash: HEX })]) // 库里无此资产
    renderDay()
    await settle()
    expect(await screen_find('这张图片的原件不在了')).toBeDefined()
    expect(document.body.textContent ?? '').not.toContain('展不开')
  })
})

async function screen_find(text: string): Promise<Element> {
  const t0 = Date.now()
  for (;;) {
    const hit = [...document.querySelectorAll('div, span, a, p')].find((el) => (el.textContent ?? '').trim() === text)
    if (hit !== undefined) return hit
    if (Date.now() - t0 > 2000) throw new Error(`找不到文面「${text}」`)
    await new Promise((r) => setTimeout(r, 50))
  }
}
