// 图模式交互与三目光纪律（R8·D3/D4）：卡片→图 入场读一遍底料（非每帧）、全日记的柱与发丝线、
// 点异日 chip=回卡片模式开那天+暖脉冲、来回切目光缝上零写笔。布局纯算另在 graph-layout.test.ts 钉死。
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

import { App } from '../../src/ui/App'
import type { MockSeam } from './mocks'
import { makeMockApp } from './mocks'
import { containerCard, edgeOf, imageCard, isoAt, textCard } from '../helpers'
import type { Card } from '../../src/domain/types'

const DAY = '2026-01-15'
const PREV = '2026-01-14'
const cid = (v: string): Card['id'] => v as Card['id']
const settle = async (ms = 420): Promise<void> => await new Promise((r) => setTimeout(r, ms))

let seam: MockSeam
let el: HTMLElement | null = null

function openDay(cards: Card[]): void {
  seam.putDay(DAY, cards)
  window.location.hash = `#/d/${DAY}`
  el = render(<App app={seam.app} initialTheme="light" now={() => new Date(2026, 0, 15)} />).container
}

beforeEach(() => {
  seam = makeMockApp()
  seam.assets.set('gh', { hash: 'gh', mime: 'image/png', size: 2, addedAt: isoAt(0), blob: new Blob(['x']) })
})
afterEach(() => {
  cleanup()
  el = null
  window.location.hash = ''
})

describe('图模式（时间轴纸聚）', () => {
  it('页眉三段：卡片/线/图并排，点「图」进图模式并铺全日记的纸片；附件 chip 亮 kind 图标', async () => {
    openDay([textCard('今日纸', { id: cid('g-a'), pos: { x: 20, y: 20 } })])
    seam.putDay(PREV, [textCard('昨日纸', { id: cid('g-b') }), imageCard('gh', { id: cid('g-c') })])
    await screen.findByText('今日纸')
    expect(document.querySelector('[data-mode="graph"]')).not.toBeNull()
    fireEvent.click(screen.getByText('图'))
    await waitFor(() => expect(el!.querySelectorAll('[data-graph-chip]').length).toBe(3), { timeout: 2000 })
    expect(el!.querySelector('[data-graph]')).not.toBeNull()
    const dates = new Set([...el!.querySelectorAll('[data-graph-chip]')].map((c) => c.getAttribute('data-graph-date')))
    expect([...dates].sort()).toEqual([PREV, DAY])
    expect(el!.querySelector('[data-graph-chip="g-c"] svg')).not.toBeNull()
    expect(el!.querySelector('[data-graph-chip="g-b"] svg')).toBeNull() // 文字 chip 只有 snippet
  })

  it('跨日线画上发丝贝塞尔；点异日 chip：回卡片模式、翻开那天、那纸暖脉冲到点熄', async () => {
    const a = textCard('今日纸', { id: cid('g1-a'), pos: { x: 20, y: 20 } })
    const b = textCard('昨日纸', { id: cid('g1-b') })
    seam.putDay(PREV, [b])
    seam.putEdge(edgeOf(a.id, b.id))
    openDay([a])
    await screen.findByText('今日纸')
    fireEvent.click(screen.getByText('图'))
    await waitFor(() => expect(el!.querySelectorAll('[data-graph-line]')).toHaveLength(1), { timeout: 2000 })
    const d = el!.querySelector('[data-graph-line]')!.getAttribute('d') ?? ''
    expect(d.startsWith('M ')).toBe(true)
    fireEvent.click(el!.querySelector('[data-graph-chip="g1-b"]')!)
    await waitFor(() => expect(window.location.hash).toBe(`#/d/${PREV}`))
    await screen.findByText('昨日纸')
    await settle(60)
    expect(el!.querySelector('[data-card-id="g1-b"].is-pulse')).not.toBeNull()
    await settle(420)
    expect(el!.querySelector('[data-card-id="g1-b"].is-pulse')).toBeNull()
  })

  it('空账本耳语：笔没落，纸串自然是空的', async () => {
    openDay([])
    fireEvent.click(screen.getByText('图'))
    await screen.findByText('笔还没落，纸串自然是空的。', undefined, { timeout: 2000 })
  })

  it('底料一次入场读一遍：入场渲染多轮不重扫，两次入场各读一遍', async () => {
    openDay([textCard('甲', { id: cid('g3-a'), pos: { x: 20, y: 20 } })])
    await screen.findByText('甲')
    fireEvent.click(screen.getByText('图'))
    await waitFor(() => expect(el!.querySelectorAll('[data-graph-chip]')).toHaveLength(1), { timeout: 2000 })
    fireEvent.click(screen.getByText('卡片'))
    await screen.findByText('甲')
    fireEvent.click(screen.getByText('图'))
    await waitFor(() => expect(el!.querySelectorAll('[data-graph-chip]')).toHaveLength(1), { timeout: 2000 })
    expect(seam.app.loadAllCards).toHaveBeenCalledTimes(2)
    expect(seam.app.loadAllEdges).toHaveBeenCalledTimes(2)
  })
})

describe('三目光的瞬态纪律（D4）', () => {
  it('卡片→图→线→卡片往返：缝上零写笔，存储账目逐字不动', async () => {
    const a = textCard('甲', { id: cid('g4-a'), pos: { x: 20, y: 20 } })
    const kid = textCard('叠中纸', { id: cid('g4-kid') })
    seam.putDay(PREV, [containerCard([kid.id], { id: cid('g4-mat') }), kid])
    seam.putEdge(edgeOf(a.id, cid('g4-kid')))
    openDay([a])
    await screen.findByText('甲')
    const before = JSON.stringify({ j: [...seam.journals.values()], e: [...seam.edges.values()] })
    fireEvent.click(screen.getByText('图'))
    await settle(500)
    fireEvent.click(screen.getByText('线'))
    await settle(500)
    fireEvent.click(screen.getByText('卡片'))
    await settle(500)
    expect(JSON.stringify({ j: [...seam.journals.values()], e: [...seam.edges.values()] })).toBe(before)
    const writes = [seam.app.addCard, seam.app.updateCard, seam.app.moveCard, seam.app.resizeCard, seam.app.deleteCardCascade, seam.app.addEdge, seam.app.deleteEdge, seam.app.setSetting]
    for (const fn of writes) expect(fn).not.toHaveBeenCalled()
  })
})
