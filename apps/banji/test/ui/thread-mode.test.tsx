// @vitest-environment jsdom
// 线模式（D5）：串珠子不是网——层=链距、层内日期升序、日期换组一枚墨印、点珠翻日子回到卡片模式。
// 瞬态纪律：目光与锚点永不过缝（刷新即无账）。BeadRun 分层与 snippet 是纯函数，单独钉。
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { App } from '../../src/ui/App'
import type { MockSeam } from './mocks'
import { makeMockApp } from './mocks'
import { tap } from './pointer'
import { threadBeads } from '../../src/ui/components/ThreadPanel'
import { edgeOf, textCard } from '../helpers'
import type { Card, CardId } from '../../src/domain/types'

const DAY = '2026-01-15'
const settle = async (ms = 620): Promise<void> => await new Promise((r) => setTimeout(r, ms))
const cid = (v: string): CardId => v as CardId

let seam: MockSeam
let el: HTMLElement

function openDay(cards: Card[]): void {
  seam.putDay(DAY, cards)
  window.location.hash = `#/d/${DAY}`
  el = render(<App app={seam.app} initialTheme="light" now={() => new Date(2026, 0, 15)} />).container
}

beforeEach(() => {
  seam = makeMockApp()
})
afterEach(() => {
  cleanup()
  window.location.hash = ''
})

describe('串珠布局（纯函数）', () => {
  const beads = [
    { cardId: cid('anchor'), date: '2026-01-15', snippet: '锚' },
    { cardId: cid('near'), date: '2026-01-14', snippet: '近日' },
    { cardId: cid('far'), date: '2026-01-10', snippet: '远日' },
  ]
  const edges = [edgeOf(cid('anchor'), cid('near')), edgeOf(cid('anchor'), cid('far'))]

  it('锚点居首（depth 0），同层按日期升序排', () => {
    const runs = threadBeads(beads, edges, cid('anchor'))
    expect(runs).toHaveLength(2)
    expect(runs[0]?.beads.map((b) => b.cardId)).toEqual([cid('anchor')])
    expect(runs[1]?.beads.map((b) => b.date)).toEqual(['2026-01-10', '2026-01-14'])
  })

  it('端点无卡的病态边逐珠跳过——线不认幽灵', () => {
    const runs = threadBeads(beads, [...edges, edgeOf(cid('anchor'), cid('ghost'))], cid('anchor'))
    const flat = runs.flatMap((r) => r.beads.map((b) => b.cardId))
    expect(flat).not.toContain(cid('ghost'))
    expect(flat).toHaveLength(3)
  })
})

describe('线模式（D5 交互）', () => {
  it('没挑纸时耳语「挑一张纸，看它牵过的线」', async () => {
    openDay([textCard('甲', { id: cid('t-a') })])
    await screen.findByText('甲')
    fireEvent.click(screen.getByText('线'))
    await screen.findByText('挑一张纸，看它牵过的线')
    expect(el.querySelector('[data-thread]')).not.toBeNull()
  })

  it('选中牵过线的纸再切线：串出珠子+跨日墨印；点珠翻回卡片模式并开那一天', async () => {
    const a = textCard('甲', { id: cid('t2-a'), pos: { x: 20, y: 20 } })
    const b = textCard('乙', { id: cid('t2-b'), pos: { x: 300, y: 20 } })
    seam.putDay('2026-01-14', [textCard('昨日帖', { id: cid('t2-prev') })])
    seam.putEdge(edgeOf(a.id, b.id))
    seam.putEdge(edgeOf(a.id, cid('t2-prev')))
    openDay([a, b])
    await screen.findByText('甲')
    // 选中甲（单次点选，不经双击——双击进编辑是产品既有手势）。
    tap(el.querySelector<HTMLElement>('[data-card-id="t2-a"]')!, { x: 24, y: 32 })
    await settle(60)
    fireEvent.click(screen.getByText('线'))
    await screen.findByText('昨日帖')
    const nodes = [...el.querySelectorAll('[data-thread-node]')]
    expect(nodes.map((n) => n.getAttribute('data-thread-node'))).toEqual([cid('t2-a'), cid('t2-prev'), cid('t2-b')])
    expect(el.querySelector('[data-thread-day]')?.getAttribute('data-thread-day')).toBe('2026-01-14')
    fireEvent.click(el.querySelector('[data-thread-node="t2-prev"]')!)
    await waitFor(() => expect(window.location.hash).toBe('#/d/2026-01-14'))
  })

  it('目光是瞬态：切去线模式不写任何库（journals/edges/keys 不变），线模式只读无拖把手', async () => {
    const a = textCard('甲', { id: cid('t3-a'), pos: { x: 20, y: 20 } })
    seam.putDay('2026-01-14', [textCard('昨', { id: cid('t3-p') })])
    seam.putEdge(edgeOf(a.id, cid('t3-p')))
    openDay([a])
    await screen.findByText('甲')
    const before = JSON.stringify([...seam.journals.values()])
    fireEvent.click(screen.getByText('线'))
    await screen.findByText('挑一张纸，看它牵过的线')
    expect(JSON.stringify([...seam.journals.values()])).toBe(before)
    expect(seam.app.addCard).not.toHaveBeenCalled()
    expect(seam.app.updateCard).not.toHaveBeenCalled()
  })
})
