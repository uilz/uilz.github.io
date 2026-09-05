// @vitest-environment jsdom
// 牵线/撕线的交互面（D1/D3）走 mock 缝：菜单入口、纸黄昏、靶纸点名成线、落定、
// dedup 静默、跨日「牵给近日」、撕线签退场；瞬态永不过缝（键集 ⊆ 契约钉死）。
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { App } from '../../src/ui/App'
import type { MockSeam } from './mocks'
import { makeMockApp } from './mocks'
import { tap } from './pointer'
import { edgeOf, textCard } from '../helpers'
import type { Card, CardId } from '../../src/domain/types'

const DAY = '2026-01-15'
const PREV = '2026-01-14'
const settle = async (ms = 700): Promise<void> => await new Promise((r) => setTimeout(r, ms))
const cid = (v: string): CardId => v as CardId
const CONTRACT_CARD_KEYS: readonly string[] = ['id', 'kind', 'pos', 'size', 'z', 'rot', 'children', 'meta', 'props', 'createdAt', 'updatedAt']
const CONTRACT_EDGE_KEYS: readonly string[] = ['id', 'source', 'target', 'role', 'createdAt', 'updatedAt']

let seam: MockSeam
let el: HTMLElement

function openDay(cards: Card[]): void {
  seam.putDay(DAY, cards)
  window.location.hash = `#/d/${DAY}`
  el = render(<App app={seam.app} initialTheme="light" now={() => new Date(2026, 0, 15)} />).container
}
function cardEl(id: string): HTMLElement {
  const q = el.querySelector<HTMLElement>(`[data-card-id="${id}"]`)
  if (q === null) throw new Error(`卡片未渲染: ${id}`)
  return q
}
function lineCount(): number {
  return el.querySelectorAll('g.bj-line').length
}
async function startLink(id: string): Promise<void> {
  // 已选中的卡不再补点：双击进编辑是产品既有手势，测试不该误触。
  if (!cardEl(id).classList.contains('is-sel')) {
    tap(cardEl(id), { x: 20, y: 12 })
    await settle(60)
  }
  fireEvent.click(screen.getByLabelText('卡片菜单'))
  fireEvent.click(screen.getByText('牵线'))
}

beforeEach(() => {
  seam = makeMockApp()
})
afterEach(() => {
  cleanup()
  window.location.hash = ''
})

describe('牵线（D1）', () => {
  it('⋯ 菜单出「牵线」；起牵后纸黄昏：靶纸亮、垫纸家眷与起点各居其位', async () => {
    const a = textCard('a纸', { id: cid('l1-a'), pos: { x: 20, y: 20 }, size: { w: 120, h: 60 } })
    const b = textCard('b纸', { id: cid('l1-b'), pos: { x: 300, y: 20 }, size: { w: 120, h: 60 } })
    openDay([a, b])
    await screen.findByText('a纸')
    await startLink('l1-a')
    await waitFor(() => expect(el.querySelector('[data-linking]')).not.toBeNull())
    expect(cardEl('l1-a').classList.contains('bj-link-origin')).toBe(true)
    expect(cardEl('l1-b').classList.contains('bj-link-target')).toBe(true)
    expect(el.textContent).toContain('再点原纸收线')
    expect(el.textContent).toContain('牵给近日…')
  })

  it('点中靶纸：成线、两纸同落定 180ms、收线复位；再走一遍同对=静默不加第二根', async () => {
    const a = textCard('a纸', { id: cid('l2-a'), pos: { x: 20, y: 20 }, size: { w: 120, h: 60 } })
    const b = textCard('b纸', { id: cid('l2-b'), pos: { x: 300, y: 20 }, size: { w: 120, h: 60 } })
    openDay([a, b])
    await screen.findByText('a纸')
    await startLink('l2-a')
    await waitFor(() => expect(el.querySelector('[data-linking]')).not.toBeNull())
    tap(cardEl('l2-b'), { x: 320, y: 40 })
    await waitFor(() => expect(lineCount()).toBe(1))
    expect(seam.edges.size).toBe(1)
    expect(cardEl('l2-a').classList.contains('bj-settle')).toBe(true) // 落定两纸
    expect(cardEl('l2-b').classList.contains('bj-settle')).toBe(true)
    await waitFor(() => expect(cardEl('l2-b').classList.contains('bj-settle')).toBe(false), { timeout: 1500 }) // 180ms 后熄
    await startLink('l2-a') // 对家此刻是 blocked：点了也不动
    tap(cardEl('l2-b'), { x: 320, y: 40 })
    await settle(80)
    expect(seam.edges.size).toBe(1) // 缝的 dedup 闸 + UI blocked 双保险
  })

  it('三扇门收线：再点原纸 / Escape / 点空纸面', async () => {
    const a = textCard('a纸', { id: cid('l3-a'), pos: { x: 20, y: 20 }, size: { w: 120, h: 60 } })
    openDay([a])
    await screen.findByText('a纸')
    await startLink('l3-a')
    await waitFor(() => expect(cardEl('l3-a').classList.contains('bj-link-origin')).toBe(true))
    tap(cardEl('l3-a'), { x: 40, y: 30 }) // 再点原纸
    await waitFor(() => expect(el.querySelector('[data-linking]')).toBeNull())
    await startLink('l3-a')
    await waitFor(() => expect(cardEl('l3-a').classList.contains('bj-link-origin')).toBe(true))
    fireEvent.keyDown(window, { key: 'Escape' }) // Escape
    await waitFor(() => expect(el.querySelector('[data-linking]')).toBeNull())
    await startLink('l3-a')
    await waitFor(() => expect(cardEl('l3-a').classList.contains('bj-link-origin')).toBe(true))
    fireEvent.pointerDown(el.querySelector('.bj-scroll')!, { clientX: 5, clientY: 5, button: 0 }) // 点空
    await waitFor(() => expect(el.querySelector('[data-linking]')).toBeNull())
  })

  it('垫纸牵自己的子纸不行（blocked）；子纸也不能反过来牵垫纸', async () => {
    const kid = textCard('子', { id: cid('l4-k'), pos: { x: 50, y: 50 }, size: { w: 100, h: 50 } })
    const mat = textCard('垫', { id: cid('l4-m'), kind: 'container', props: {}, children: [kid.id], pos: { x: 0, y: 0 }, size: { w: 300, h: 300 } })
    openDay([mat, kid])
    await screen.findByText('子')
    await startLink('l4-m')
    await waitFor(() => expect(cardEl('l4-m').classList.contains('bj-link-origin')).toBe(true))
    expect(cardEl('l4-k').classList.contains('bj-link-dim')).toBe(true)
    tap(cardEl('l4-k'), { x: 60, y: 60 })
    await settle(80)
    expect(seam.edges.size).toBe(0)
  })

  it('牵给近日：跨日纸单列出昨日纸+日期签，点中=跨日成线（本日照旧不画跨日线的影）', async () => {
    const a = textCard('今日纸', { id: cid('l5-a'), pos: { x: 20, y: 20 }, size: { w: 120, h: 60 } })
    seam.putDay(PREV, [textCard('昨日帖', { id: cid('l5-p') })])
    openDay([a])
    await screen.findByText('今日纸')
    await startLink('l5-a')
    await waitFor(() => expect(cardEl('l5-a').classList.contains('bj-link-origin')).toBe(true))
    fireEvent.click(screen.getByText('牵给近日…'))
    await screen.findByText('昨日帖')
    expect(el.textContent).toContain('1月14日') // 日期签
    fireEvent.click(screen.getByText('昨日帖'))
    await waitFor(() => expect(seam.edges.size).toBe(1))
    await settle(80)
    expect(lineCount()).toBe(0) // D2 只画同日两端都在场的线
  })
})

describe('撕线（D3）', () => {
  it('点线出「撕线」签落线腰；点签=线过缝删净；Esc 也能收签；不占 undo 托盘', async () => {
    const a = textCard('a纸', { id: cid('d3-a'), pos: { x: 20, y: 20 }, size: { w: 120, h: 60 } })
    const b = textCard('b纸', { id: cid('d3-b'), pos: { x: 300, y: 20 }, size: { w: 120, h: 60 } })
    seam.putEdge(edgeOf(a.id, b.id))
    openDay([a, b])
    await screen.findByText('a纸')
    await waitFor(() => expect(lineCount()).toBe(1))
    fireEvent.pointerDown(el.querySelector('.bj-line-hit')!)
    const chip1 = await screen.findByText('撕线')
    expect(chip1.getAttribute('class')).toContain('bj-line-chip')
    fireEvent.keyDown(window, { key: 'Escape' })
    await waitFor(() => expect(el.querySelector('[data-line-chip]')).toBeNull())
    fireEvent.pointerDown(el.querySelector('.bj-line-hit')!)
    const chip2 = await screen.findByText('撕线') // 重新请出的签（旧节点已随 Escape 离场）
    fireEvent.click(chip2)
    await waitFor(() => expect(lineCount()).toBe(0))
    expect(seam.edges.size).toBe(0)
    expect(el.querySelector('.bj-toast')).toBeNull() // 没有「再想想」——重新牵就是同一只手反过来
  })
})

describe('撕线的反悔账（D3/D4 分界）', () => {
  it('撕线不占托盘；但撕掉牵着线的纸，再想想让卡与线一同回位', async () => {
    const a = textCard('甲', { id: cid('u-a'), pos: { x: 20, y: 20 }, size: { w: 120, h: 60 } })
    const b = textCard('乙', { id: cid('u-b'), pos: { x: 300, y: 20 }, size: { w: 120, h: 60 } })
    seam.putEdge(edgeOf(a.id, b.id))
    openDay([a, b])
    await screen.findByText('甲')
    await waitFor(() => expect(lineCount()).toBe(1))
    // 撕线：无托盘（再牵即反悔）
    fireEvent.pointerDown(el.querySelector('.bj-line-hit')!)
    await screen.findByText('撕线')
    fireEvent.click(screen.getByText('撕线'))
    await waitFor(() => expect(lineCount()).toBe(0))
    expect(el.querySelector('.bj-toast')).toBeNull()
    // 牵回一根，再撕整张乙：卡与线同进托盘快照
    await startLink('u-a')
    tap(cardEl('u-b'), { x: 320, y: 40 })
    await waitFor(() => expect(lineCount()).toBe(1))
    tap(cardEl('u-b'), { x: 320, y: 40 }) // 选中乙（非牵线态，寻常点选）
    await settle(60)
    fireEvent.click(screen.getByLabelText('卡片菜单'))
    fireEvent.click(screen.getByText('删除'))
    fireEvent.click(screen.getByText('确认删除'))
    await waitFor(() => expect(el.textContent).toContain('已撕下 1 张，再想想'))
    expect(lineCount()).toBe(0) // 线随纸去（乐观账）
    fireEvent.click(el.querySelector('.bj-toast .bj-toast-action')!)
    await waitFor(() => expect(lineCount()).toBe(1)) // 线回位（edgePatches 同批重接）
    await settle(60)
    // 逐字回位：线 id 与撕下前同一枚（不重生）
    const lineEls = [...el.querySelectorAll('g.bj-line')]
    expect(lineEls).toHaveLength(1)
    expect([...seam.edges.keys()]).toEqual([lineEls[0]?.getAttribute('data-line-id')])
  })
})

describe('瞬态永不过缝（R5 键集纪律）', () => {
  it('牵一割的全旅程后：存储卡片键 ⊆ 契约 ∧ 边键 ⊆ 契约', async () => {
    const a = textCard('a纸', { id: cid('k-a'), pos: { x: 20, y: 20 }, size: { w: 120, h: 60 } })
    const b = textCard('b纸', { id: cid('k-b'), pos: { x: 300, y: 20 }, size: { w: 120, h: 60 } })
    openDay([a, b])
    await screen.findByText('a纸')
    await startLink('k-a')
    tap(cardEl('k-b'), { x: 320, y: 40 })
    await waitFor(() => expect(lineCount()).toBe(1))
    fireEvent.pointerDown(el.querySelector('.bj-line-hit')!)
    await screen.findByText('撕线')
    await settle(80)
    for (const doc of seam.journals.values()) {
      for (const c of doc.cards) {
        for (const k of Object.keys(c)) expect(CONTRACT_CARD_KEYS).toContain(k)
      }
    }
    for (const e of seam.edges.values()) {
      expect(Object.keys(e).every((k) => CONTRACT_EDGE_KEYS.includes(k))).toBe(true)
    }
  })
})
