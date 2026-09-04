// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { App } from '../../src/ui/App'
import type { MockSeam } from './mocks'
import { makeMockApp } from './mocks'
import { textCard } from '../helpers'
import type { Card, CardId } from '../../src/domain/types'

const DAY = '2026-01-15'
const settle = async (ms = 620): Promise<void> => await new Promise((r) => setTimeout(r, ms))

let el: HTMLElement | null = null
let seam: MockSeam
const cid = (v: string): CardId => v as CardId

function textCardFixture(id: string, text = '旧文'): Card {
  return textCard(text, { id: cid(id), pos: { x: 10, y: 10 }, size: { w: 240, h: 150 }, props: { text, format: 'plain' } })
}

function openDay(cards: Card[]): void {
  seam.putDay(DAY, cards)
  window.location.hash = `#/d/${DAY}`
  el = render(<App app={seam.app} initialTheme="light" now={() => new Date(2026, 0, 15)} />).container
}

async function hasText(text: string): Promise<void> {
  await waitFor(() => {
    if (el?.textContent?.includes(text) !== true) throw new Error(`回执里没有: ${text}`)
  })
}

const receiptIn = (): Element | null => el?.querySelector('.bj-toast-alert') ?? null

// 真实编辑路径：双击进编辑 → 改文字（调度落盘）→ 失焦立即结算。
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

beforeEach(() => {
  seam = makeMockApp()
})
afterEach(() => {
  cleanup()
  window.location.hash = ''
})

describe('保存失败回执（error channel → 便签，last-intent-wins 不丢意图）', () => {
  it('given 缝拒绝 updateCard when 失焦落盘 then 出现「这一笔没存上 · 再试」且库内文档未脏', async () => {
    openDay([textCardFixture('se-1')])
    vi.mocked(seam.app.updateCard).mockRejectedValueOnce(new Error('boom'))
    await typeIntoCard('se-1', '存不上的字')
    await settle()
    await hasText('这一笔没存上')
    expect(receiptIn()).not.toBeNull()
    expect(el?.querySelector('.bj-toast-action')?.textContent).toBe('再试')
    expect(seam.journals.get(DAY)?.cards.at(0)?.props).toEqual({ text: '旧文', format: 'plain' })
  })

  it('given 回执挂着 when 下一次落盘成功 then 旧意图搭车落定、回执熄灭', async () => {
    openDay([textCardFixture('se-2')])
    vi.mocked(seam.app.updateCard).mockRejectedValueOnce(new Error('boom'))
    await typeIntoCard('se-2', '第一笔失败')
    await settle()
    expect(receiptIn()).not.toBeNull()
    await typeIntoCard('se-2', '第二笔会成功')
    await settle()
    await waitFor(() => expect(receiptIn()).toBeNull())
    expect(seam.journals.get(DAY)?.cards.at(0)?.props).toEqual({ text: '第二笔会成功', format: 'plain' })
  })

  it('given 两笔都失败 when 同一趟落盘 then 一张回执合并计数', async () => {
    openDay([textCardFixture('se-3', '甲文'), textCardFixture('se-4', '乙文')])
    vi.mocked(seam.app.updateCard).mockRejectedValue(new Error('boom'))
    await typeIntoCard('se-3', '甲改动')
    await settle()
    await hasText('这一笔没存上')
    await typeIntoCard('se-4', '乙改动')
    await settle()
    const toasts = el?.querySelectorAll('.bj-toast') ?? []
    expect(toasts).toHaveLength(1)
    expect(toasts[0]?.textContent).toContain('这 2 笔没存上')
  })

  it('given 回执挂着 when 点「再试」then 意图重上链并落定', async () => {
    openDay([textCardFixture('se-5')])
    vi.mocked(seam.app.updateCard).mockRejectedValueOnce(new Error('disk hiccup'))
    await typeIntoCard('se-5', '再试就能成')
    await settle()
    expect(receiptIn()).not.toBeNull()
    const retry = el?.querySelector('.bj-toast-action')
    if (retry === null || retry === undefined) throw new Error('没有再试按钮')
    fireEvent.click(retry)
    await waitFor(() => expect(receiptIn()).toBeNull(), { timeout: 3000 })
    expect(seam.journals.get(DAY)?.cards.at(0)?.props).toEqual({ text: '再试就能成', format: 'plain' })
  })

  it('given 缝持续生病 when 换到别的日期 then 回执仍在（失败意图绝不静默蒸发）', async () => {
    openDay([textCardFixture('se-6')])
    vi.mocked(seam.app.updateCard).mockRejectedValue(new Error('disk full'))
    await typeIntoCard('se-6', '没救回来的字')
    await settle()
    expect(receiptIn()).not.toBeNull()
    window.location.hash = '#/d/2026-01-16'
    await settle()
    expect(receiptIn()).not.toBeNull()
    expect(seam.journals.get(DAY)?.cards.at(0)?.props).toEqual({ text: '旧文', format: 'plain' })
  })
})
