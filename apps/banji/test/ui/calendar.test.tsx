// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { App } from '../../src/ui/App'
import type { MockSeam } from './mocks'
import { makeMockApp } from './mocks'
import { textCard, imageCard } from '../helpers'
import type { Card } from '../../src/domain/types'

const TODAY = '2026-01-15'
const now = (): Date => new Date(2026, 0, 15, 9, 0, 0)
const cards = (n: number, tag: string): Card[] => Array.from({ length: n }, (_, i) => textCard(`${tag}${String(i)}`))
const cell = (date: string): HTMLElement | null => document.querySelector<HTMLElement>(`.bj-cell[data-date="${date}"]`)

let seam: MockSeam

beforeEach(() => {
  seam = makeMockApp()
  window.location.hash = ''
})
afterEach(() => {
  cleanup()
  window.location.hash = ''
})

describe('月历首页', () => {
  it('开屏即本月：getMonthSummary(2026,1)；今天有环、有内容的日子有墨点且按卡数分层', async () => {
    seam.putDay('2026-01-02', cards(1, 'a'))
    seam.putDay('2026-01-11', cards(2, 'b'))
    seam.putDay(TODAY, cards(5, 'c'))
    seam.putDay('2026-02-01', cards(3, 'd')) // 别月不得混入
    render(<App app={seam.app} initialTheme="light" now={now} />)
    await vi.waitFor(() => expect(seam.app.getMonthSummary).toHaveBeenCalledWith(2026, 1), { timeout: 2000 })
    await vi.waitFor(() => expect(cell(TODAY)?.querySelector('.bj-dot')).not.toBeNull(), { timeout: 2000 })
    expect(cell(TODAY)?.dataset['today']).toBe('true')
    expect(cell(TODAY)?.querySelector('.bj-dot')?.getAttribute('data-tier')).toBe('l')
    expect(cell('2026-01-02')?.querySelector('.bj-dot')?.getAttribute('data-tier')).toBe('s')
    expect(cell('2026-01-11')?.querySelector('.bj-dot')?.getAttribute('data-tier')).toBe('m')
    expect(cell('2026-01-05')?.querySelector('.bj-dot')).toBeNull()
    expect(document.querySelector('.bj-wordmark')?.textContent).toBe('伴记')
  })

  it('月份切换：‹ 走到 2025年12月（跨年）并重新取数；回到今天复位', async () => {
    render(<App app={seam.app} initialTheme="light" now={now} />)
    await vi.waitFor(() => expect(seam.app.getMonthSummary).toHaveBeenCalledWith(2026, 1), { timeout: 2000 })
    fireEvent.click(screen.getByLabelText('上一月'))
    await vi.waitFor(() => expect(seam.app.getMonthSummary).toHaveBeenCalledWith(2025, 12), { timeout: 2000 })
    expect(screen.getByText('2025年12月')).toBeDefined()
    fireEvent.click(screen.getByText('回到今天'))
    await vi.waitFor(() => expect(vi.mocked(seam.app.getMonthSummary).mock.calls.filter((c) => c[0] === 2026 && c[1] === 1).length).toBeGreaterThanOrEqual(2), { timeout: 2000 })
    expect(screen.getByText('2026年1月')).toBeDefined()
  })

  it('点一格（哪怕空白日）→ 深链 #/d/YYYY-MM-DD；浏览器返回键由 hashchange 接管', async () => {
    render(<App app={seam.app} initialTheme="light" now={now} />)
    await vi.waitFor(() => expect(cell('2026-01-15')).not.toBeNull(), { timeout: 2000 })
    const target = cell('2026-01-20')
    if (target === null) throw new Error('格子上未渲染')
    fireEvent.click(target)
    expect(window.location.hash).toBe('#/d/2026-01-20')
    await vi.waitFor(() => expect(seam.app.getJournal).toHaveBeenCalledWith('2026-01-20'), { timeout: 2000 })
    await vi.waitFor(() => expect(document.querySelector('[data-day-view]')).not.toBeNull(), { timeout: 2000 })
    expect(await screen.findByText('这一天还是空白。落一笔吧。')).toBeDefined()
  })
})

// —— V2-Iter2：今日面三态 / 时间账 / 折角 / 翻到 / 首页一次读 ——
const bandText = (): string => document.querySelector('[data-today-band]')?.textContent ?? ''
const footText = (): string => document.querySelector('[data-journal-foot]')?.textContent ?? ''
const must = (sel: string): HTMLElement => {
  const el = document.querySelector<HTMLElement>(sel)
  if (el === null) throw new Error(`元素缺席: ${sel}`)
  return el
}

describe('首页 V2-Iter2', () => {
  it('今天有纸 → 今日面「今天 · N 张纸」+ 首行摘录，整脊点进今天', async () => {
    seam.putDay(TODAY, [
      textCard('雨后。楼下槐花开了。\n第二行不算数', { updatedAt: '2026-01-15T10:00:00.000Z' }),
      textCard('旧笔一', { updatedAt: '2026-01-15T09:00:00.000Z' }),
      textCard('旧笔二', { updatedAt: '2026-01-15T08:00:00.000Z' }),
    ])
    render(<App app={seam.app} initialTheme="light" now={now} />)
    await vi.waitFor(() => expect(bandText()).toContain('今天·3 张纸'), { timeout: 2000 })
    expect(bandText()).toContain('雨后。楼下槐花开了。')
    expect(bandText()).not.toContain('第二行')
    fireEvent.click(must('[data-band="paper"] button'))
    expect(window.location.hash).toBe('#/d/2026-01-15')
  })

  it('今天未落笔有史 → 「未落笔 + 上次落笔 · 1月11日…」，点那行落到那一天（回到过去不设按钮）', async () => {
    seam.putDay('2026-01-11', [textCard('一页旧纸')])
    render(<App app={seam.app} initialTheme="light" now={now} />)
    await vi.waitFor(() => expect(bandText()).toContain('未落笔'), { timeout: 2000 })
    expect(bandText()).toContain('上次落笔 · 1月11日「一页旧纸」')
    fireEvent.click(must("[data-band-jump]"))
    expect(window.location.hash).toBe('#/d/2026-01-11')
  })

  it('新册无史 → 「今天 · 空着」，时间账退为耳语原句（唯一的呼唤）', async () => {
    render(<App app={seam.app} initialTheme="light" now={now} />)
    await vi.waitFor(() => expect(bandText()).toContain('空着'), { timeout: 2000 })
    expect(document.querySelector('[data-band]')?.getAttribute('data-band')).toBe('fresh')
    expect(footText()).toBe('翻开即今日，落笔即永远。')
  })

  it('时间账：本月「此册已记 N 日 · 最近 M月D日」；翻到别月追加「· 该月 N 日」', async () => {
    seam.putDay('2026-01-02', cards(1, 'a'))
    seam.putDay('2025-12-20', cards(1, 'z'))
    render(<App app={seam.app} initialTheme="light" now={now} />)
    await vi.waitFor(() => expect(footText()).toBe('此册已记 2 日 · 最近 1月2日'), { timeout: 2000 })
    fireEvent.click(screen.getByLabelText('上一月'))
    await vi.waitFor(() => expect(seam.app.getMonthSummary).toHaveBeenCalledWith(2025, 12), { timeout: 2000 })
    expect(footText()).toBe('此册已记 2 日 · 最近 1月2日 · 该月 1 日')
  })

  it('贴过照片的日子挂纸角折痕，寻常日子与空格不挂', async () => {
    seam.putDay('2026-01-04', [imageCard('h1')])
    seam.putDay('2026-01-06', cards(1, 't'))
    render(<App app={seam.app} initialTheme="light" now={now} />)
    await vi.waitFor(() => expect(cell('2026-01-04')?.querySelector('.bj-fold')).not.toBeNull(), { timeout: 2000 })
    expect(cell('2026-01-06')?.querySelector('.bj-fold')).toBeNull()
    expect(cell('2026-01-08')?.querySelector('.bj-fold')).toBeNull()
  })

  it('月题点开「翻到」：有纸月份挂墨点，跨年走门→导航成立、纸片合上', async () => {
    seam.putDay('2025-12-20', cards(1, 'z'))
    render(<App app={seam.app} initialTheme="light" now={now} />)
    await vi.waitFor(() => expect(footText()).toContain('此册已记'), { timeout: 2000 })
    fireEvent.click(screen.getByText('2026年1月'))
    const sheet = await screen.findByLabelText('翻到')
    expect(sheet.querySelectorAll('[data-jump-month]')).toHaveLength(12)
    expect(sheet.querySelector('[data-jump-month="2026-01"]')).not.toBeNull()
    fireEvent.click(within(sheet).getByLabelText('上一年'))
    await vi.waitFor(() => expect(sheet.textContent).toContain('2025年'), { timeout: 2000 })
    expect(sheet.querySelector('[data-jump-month="2025-12"] .bj-jump-dot')).not.toBeNull()
    expect(sheet.querySelector('[data-jump-month="2025-05"] .bj-jump-dot')).toBeNull()
    const decCell = sheet.querySelector<HTMLElement>('[data-jump-month="2025-12"]')
    if (decCell === null) throw new Error('十二月之门缺席')
    fireEvent.click(decCell)
    await vi.waitFor(() => expect(seam.app.getMonthSummary).toHaveBeenCalledWith(2025, 12), { timeout: 2000 })
    expect(screen.getByText('2025年12月')).toBeDefined()
    await vi.waitFor(() => expect(document.querySelector('[data-jump-sheet]')).toBeNull(), { timeout: 2000 })
  })

  it('一次读纪律：进月历 getHomeDigest 恰一次，翻两个来回月不复扫', async () => {
    render(<App app={seam.app} initialTheme="light" now={now} />)
    await vi.waitFor(() => expect(seam.app.getHomeDigest).toHaveBeenCalledTimes(1), { timeout: 2000 })
    expect(seam.app.getHomeDigest).toHaveBeenCalledWith(TODAY)
    fireEvent.click(screen.getByLabelText('上一月'))
    fireEvent.click(screen.getByLabelText('下一月'))
    await vi.waitFor(() => expect(seam.app.getMonthSummary).toHaveBeenCalledWith(2026, 1), { timeout: 2000 })
    expect(seam.app.getHomeDigest).toHaveBeenCalledTimes(1)
  })
})
