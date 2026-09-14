// V2-Iter1·F3 落纸回执：success 侧的耳语，骑 dayState 瞬态车道、与失败回执两不相见。
// 状态机三面（合流/失败/换日）reducer 直测；兴灭两拍走真时钟 jsdom（house 口径），
// 瞬态永不过缝：库内序列化里找不见它的任何一个字。
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { App } from '../../src/ui/App'
import type { MockSeam } from './mocks'
import { makeMockApp } from './mocks'
import { dayReducer, initialDayState } from '../../src/ui/dayState'
import { textCard } from '../helpers'
import type { Card, CardId } from '../../src/domain/types'

const DAY = '2026-01-15'
let seam: MockSeam
let el: HTMLElement | null = null
const settle = async (ms = 620): Promise<void> => {
  await new Promise((r) => setTimeout(r, ms))
}

function openDay(cards: Card[]): void {
  seam.putDay(DAY, cards)
  window.location.hash = `#/d/${DAY}`
  el = render(<App app={seam.app} initialTheme="light" now={() => new Date(2026, 0, 15)} />).container
}

function fixture(id: string, text = '旧文'): Card {
  return textCard(text, { id: id as CardId, pos: { x: 10, y: 10 }, size: { w: 240, h: 150 }, props: { text, format: 'plain' } })
}

async function typeIntoCard(id: string, to: string): Promise<void> {
  const read = await waitFor(() => {
    const q = el?.querySelector<HTMLElement>(`[data-card-id="${id}"] .bj-text-read`)
    if (q === null || q === undefined) throw new Error(`没有阅读态节点: ${id}`)
    return q
  })
  fireEvent.dblClick(read)
  const ta = await waitFor(() => {
    const q = el?.querySelector<HTMLTextAreaElement>(`[data-card-id="${id}"] textarea`)
    if (q === null || q === undefined) throw new Error(`没有编辑框: ${id}`)
    return q
  })
  fireEvent.change(ta, { target: { value: to } })
  fireEvent.blur(ta)
}

const stamp = (): Element | null => el?.querySelector('[data-stamp]') ?? null

describe('落纸耳语状态机（reducer 直测）', () => {
  const open = dayReducer(initialDayState, { type: 'day/open', date: DAY })

  it('一次 dirty→clean 一声：挂着的耳语不叠第二盏灯（合流）', () => {
    let s = dayReducer(open, { type: 'save/landed', date: DAY })
    expect(s.stampSeq).toBe(1)
    s = dayReducer(s, { type: 'save/landed', date: DAY })
    expect(s.stampSeq).toBe(1)
    s = dayReducer(s, { type: 'stamp/dismiss' })
    expect(s.stampSeq).toBe(0)
    s = dayReducer(s, { type: 'save/landed', date: DAY })
    expect(s.stampSeq).toBe(1)
    s = dayReducer(s, { type: 'stamp/dismiss' })
    s = dayReducer(s, { type: 'stamp/dismiss' })
    expect(s.stampSeq).toBe(0)
  })

  it('旧日批次的落定不在新日耳语：save/landed 认日，错日即拒', () => {
    const s = dayReducer(open, { type: 'save/landed', date: '2026-01-14' })
    expect(s.stampSeq).toBe(0)
  })

  it('换日即清账：day/open 把在挂的耳语一并收回（与 note 同纪律）', () => {
    const lit = dayReducer(open, { type: 'save/landed', date: DAY })
    const nextDay = dayReducer(lit, { type: 'day/open', date: '2026-01-16' })
    expect(nextDay.stampSeq).toBe(0)
  })
})

describe('落纸耳语上屏（真缝编排 + 失败/换日/键集三面）', () => {
  beforeEach(() => {
    seam = makeMockApp()
  })
  afterEach(() => {
    cleanup()
    window.location.hash = ''
  })

  it('given 失焦落盘成功 when 批次落定 then 「已落纸」现身并于 ≤1.4s 自灭', async () => {
    openDay([fixture('st-1')])
    await settle(300)
    await typeIntoCard('st-1', '落了的一笔')
    await waitFor(() => expect(stamp()).not.toBeNull(), { timeout: 1000 })
    expect(stamp()?.textContent).toBe('已落纸')
    await settle(1600)
    expect(stamp()).toBeNull()
  })

  it('given 耳语正挂 when 又一笔落定 then 灯不叠：屏上恒只一枚', async () => {
    openDay([fixture('st-2')])
    await settle(300)
    await typeIntoCard('st-2', '第一笔')
    await waitFor(() => expect(stamp()).not.toBeNull(), { timeout: 1000 })
    await typeIntoCard('st-2', '第二笔')
    await settle(700)
    expect(el?.querySelectorAll('[data-stamp]')).toHaveLength(1)
  })

  it('given 落盘失败 when 批次结算 then 只有失败回执亮——两不相见', async () => {
    openDay([fixture('st-3')])
    await settle(300)
    vi.mocked(seam.app.updateCard).mockRejectedValueOnce(new Error('boom'))
    await typeIntoCard('st-3', '存不上的')
    await settle()
    await waitFor(() => expect(el?.textContent).toContain('这一笔没存上'))
    expect(stamp()).toBeNull()
  })

  it('given 旧日有在途 when 换日 then 旧批次落定不在新日耳语（换日清账）', async () => {
    openDay([fixture('st-4')])
    await settle(300)
    const read = el?.querySelector<HTMLElement>('[data-card-id="st-4"] .bj-text-read')!
    fireEvent.dblClick(read)
    const ta = el?.querySelector<HTMLTextAreaElement>('[data-card-id="st-4"] textarea')!
    fireEvent.change(ta, { target: { value: '没及落定就走' } })
    window.location.hash = '#/d/2026-01-16'
    await settle(900)
    expect(stamp()).toBeNull()
    expect(seam.journals.get(DAY)?.cards.at(0)?.props).toEqual({ text: '没及落定就走', format: 'plain' })
  })

  it('耳语永不过缝：落定一轮后库内序列化无 stampSeq/已落纸 的只言片语', async () => {
    openDay([fixture('st-5')])
    await settle(300)
    await typeIntoCard('st-5', '过缝的是字，不是耳语')
    await waitFor(() => expect(stamp()).not.toBeNull(), { timeout: 1000 })
    await settle(1600)
    const stored = JSON.stringify(seam.journals.get(DAY))
    expect(stored).not.toContain('stamp')
    expect(stored).not.toContain('已落纸')
  })
})
