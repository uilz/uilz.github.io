// @vitest-environment jsdom
// 宽画布耳语（DayView 侧）：390 屏上桌面时代的日子在纸边低语一次；
// 横推第一次即淡出并 setSetting 记档（终生不再扰）；纵向滚动（键盘避让）不误伤。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { App } from '../../src/ui/App'
import type { MockSeam } from './mocks'
import { makeMockApp } from './mocks'
import { WIDE_HINT_KEY } from '../../src/ui/components/DayView'
import { textCard } from '../helpers'
import type { Card, CardId } from '../../src/domain/types'

const DAY = '2026-01-15'
const settle = async (ms = 620): Promise<void> => await new Promise((r) => setTimeout(r, ms))

let seam: MockSeam
let el: HTMLElement | null = null

const cid = (v: string): CardId => v as CardId

// 桌面时代卡：abs(x)+w 越过 390-48=342 的可见纸宽 —— 手机上右边有屏外之纸。
function wideDay(): Card[] {
  return [textCard('旧desktop卡', { id: cid('wc-far'), pos: { x: 300, y: 60 }, size: { w: 240, h: 150 } })]
}

function setViewportWidth(w: number): void {
  Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: w })
}

function openDay(cards: Card[]): void {
  seam.putDay(DAY, cards)
  window.location.hash = `#/d/${DAY}`
  el = render(<App app={seam.app} initialTheme="light" now={() => new Date(2026, 0, 15)} />).container
}

const hint = (): Element | null => el?.querySelector('.bj-wide-hint') ?? null
const scroller = (): HTMLElement | null => el?.querySelector<HTMLElement>('.bj-scroll') ?? null

// jsdom 不做布局：scrollLeft 只读为 0，按元素覆写为可写挡块（与 mobile.test 的 scrollIntoView mock 同族）。
function setScrollLeft(v: number): void {
  const s = scroller()
  if (s === null) throw new Error('没有滚动容器')
  Object.defineProperty(s, 'scrollLeft', { configurable: true, writable: true, value: v })
}

beforeEach(() => {
  seam = makeMockApp()
  setViewportWidth(390)
})
afterEach(() => {
  cleanup()
  window.location.hash = ''
  setViewportWidth(1024)
})

describe('纸比屏宽的耳语', () => {
  it('given 手机屏上的桌面时代日子 when 载入完成 then 纸边低语「纸比屏宽 · 左右推移可看」', async () => {
    openDay(wideDay())
    await screen.findByText('旧desktop卡')
    await waitFor(() => expect(hint()).not.toBeNull())
    expect(hint()?.textContent).toBe('纸比屏宽 · 左右推移可看')
    expect(seam.app.setSetting).not.toHaveBeenCalled()
  })

  it('given 屏内纸 or 已见过耳语 when 载入 then 绝不低语', async () => {
    openDay([textCard('窄卡', { id: cid('wc-fit'), pos: { x: 24, y: 60 }, size: { w: 318, h: 150 } })])
    await screen.findByText('窄卡')
    await settle(300)
    expect(hint()).toBeNull()
    cleanup()
    seam = makeMockApp()
    seam.settings.set(WIDE_HINT_KEY, true)
    openDay(wideDay())
    await screen.findByText('旧desktop卡')
    await settle(300)
    expect(hint()).toBeNull() // 设置记档 = 终生不再扰
    expect(seam.app.setSetting).not.toHaveBeenCalled()
  })

  it('given 耳语挂着 when 纵向滚动（键盘避让）then 不误伤：低语仍在、不记档', async () => {
    openDay(wideDay())
    await screen.findByText('旧desktop卡')
    await waitFor(() => expect(hint()).not.toBeNull())
    setScrollLeft(0)
    fireEvent.scroll(scroller()!) // scrollLeft 未变：纯纵滚
    fireEvent.scroll(scroller()!)
    await settle(300)
    expect(hint()).not.toBeNull()
    expect(hint()?.classList.contains('is-fading')).toBe(false)
    expect(seam.app.setSetting).not.toHaveBeenCalled()
  })

  it('given 耳语挂着 when 首次横推 then 淡出退场、setSetting 恰一次；再推不再重复记档', async () => {
    openDay(wideDay())
    await screen.findByText('旧desktop卡')
    await waitFor(() => expect(hint()).not.toBeNull())
    setScrollLeft(0)
    setScrollLeft(160) // 推过 4px 判据线
    fireEvent.scroll(scroller()!)
    expect(hint()?.classList.contains('is-fading')).toBe(true) // 先淡（≤220ms），后撤
    await settle(300)
    expect(hint()).toBeNull()
    expect(seam.app.setSetting).toHaveBeenCalledTimes(1)
    expect(seam.app.setSetting).toHaveBeenCalledWith(WIDE_HINT_KEY, true)
    setScrollLeft(320)
    fireEvent.scroll(scroller()!)
    await settle(80)
    expect(seam.app.setSetting).toHaveBeenCalledTimes(1) // 第二推不再发声
  })

  it('given 桌面 1280 屏 when 同一日子载入 then 1200 右缘在屏内：耳语噤声', async () => {
    setViewportWidth(1280)
    openDay([textCard('宽屏卡', { id: cid('wc-desk'), pos: { x: 300, y: 60 }, size: { w: 900, h: 200 } })])
    await screen.findByText('宽屏卡')
    await settle(300)
    expect(hint()).toBeNull()
  })
})
