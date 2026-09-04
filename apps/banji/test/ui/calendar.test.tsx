// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { App } from '../../src/ui/App'
import type { MockSeam } from './mocks'
import { makeMockApp } from './mocks'
import { textCard } from '../helpers'
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
    expect(cell(TODAY)?.querySelector('.bj-dot')?.getAttribute('data-tier')).toBe('3')
    expect(cell('2026-01-02')?.querySelector('.bj-dot')?.getAttribute('data-tier')).toBe('1')
    expect(cell('2026-01-11')?.querySelector('.bj-dot')?.getAttribute('data-tier')).toBe('2')
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
