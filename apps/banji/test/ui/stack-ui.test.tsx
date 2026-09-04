// @vitest-environment jsdom
// 纸叠的手势面：造叠入口、拖入/拖出过缝的逐字数据、瞬态高亮永不落库、拓扑闸回执、删除→再想想的嵌套复原。
// jsdom 里 getBoundingClientRect 全零 → ox=0 → 指针 client 坐标即画布坐标（placement 拖拽同一口径）。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { App } from '../../src/ui/App'
import type { MockSeam } from './mocks'
import { makeMockApp } from './mocks'
import { dragFrom, pointer, tap } from './pointer'
import { containerCard, textCard } from '../helpers'
import type { Card, CardId } from '../../src/domain/types'

const DAY = '2026-01-15'
const settle = async (ms = 700): Promise<void> => await new Promise((r) => setTimeout(r, ms))
const cid = (v: string): CardId => v as CardId
// Card 契约字段全集（ARCHITECTURE §3）：存出来的卡永远只戴这几枚徽章。
const CONTRACT_KEYS: readonly string[] = ['id', 'kind', 'pos', 'size', 'z', 'rot', 'children', 'meta', 'props', 'createdAt', 'updatedAt']

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
function stored(id: string): Card {
  const c = seam.journals.get(DAY)?.cards.find((x) => x.id === cid(id))
  if (c === undefined) throw new Error(`缝里没有: ${id}`)
  return c
}
const whisper = (): Element | null => el.querySelector('.bj-stack-whisper')
const droponCount = (): number => el.querySelectorAll('.bj-card.be-container.is-dropon').length

function kid(id: string, pos: { x: number; y: number }, over: Partial<Card> = {}): Card {
  return textCard(id, { id: cid(id), pos, size: { w: 120, h: 60 }, ...over })
}

beforeEach(() => {
  seam = makeMockApp()
})
afterEach(() => {
  cleanup()
  window.location.hash = ''
})

describe('造叠（D1）', () => {
  it('底栏第三枚把手落一张空垫纸：props 全空、220×160、即刻选中且耳语等着', async () => {
    openDay([kid('d1-k', { x: 20, y: 20 })])
    await screen.findByText('d1-k')
    fireEvent.click(screen.getByRole('button', { name: '造叠' }))
    await settle()
    expect(seam.app.addCard).toHaveBeenCalledWith(DAY, expect.objectContaining({ kind: 'container', props: {}, size: { w: 220, h: 160 } }))
    const box = el.querySelector<HTMLElement>('.bj-card.be-container')
    if (box === null) throw new Error('垫纸没上来')
    expect(box.classList.contains('is-sel')).toBe(true) // 立刻选中，耳语可见
    expect(whisper()?.textContent).toBe('拖一张纸进来，它们就是一叠了')
    const storedMat = seam.journals.get(DAY)!.cards.find((c) => c.kind === 'container')
    expect(storedMat!.props).toEqual({})
    expect(droponCount()).toBe(0) // 没在拖任何东西
  })
})

describe('拖入（D3）', () => {
  it('按住纸拖进垫纸：悬停亮起 is-dropon，抬手过缝 children 尾挂、纸落释放点、存储永不带瞬态字段', async () => {
    const m = containerCard([], { id: cid('d3-m'), pos: { x: 400, y: 400 }, size: { w: 300, h: 260 }, z: 5 })
    const k = kid('d3-k', { x: 20, y: 20 }, { z: 1 }) // 子纸存储 z 故意低于垫纸：渲染序必须反过来教它做人
    openDay([m, k])
    await screen.findByText('d3-k')
    const kEl = cardEl('d3-k')
    pointer(kEl, 'pointerdown', { x: 40, y: 30 })
    pointer(kEl, 'pointermove', { x: 240, y: 230 })
    pointer(kEl, 'pointermove', { x: 450, y: 450 })
    await waitFor(() => expect(cardEl('d3-m').classList.contains('is-dropon')).toBe(true)) // 悬停：B 的落点态
    pointer(kEl, 'pointerup', { x: 450, y: 450 })
    await waitFor(() => expect(droponCount()).toBe(0)) // 抬手即熄
    await settle()
    expect(stored('d3-m').children).toEqual([cid('d3-k')])
    expect(stored('d3-k').pos).toEqual({ x: 430, y: 440 }) // 画布绝对=释放点位移，不折进垫纸坐标系
    expect(stored('d3-m').size).toEqual({ w: 300, h: 260 }) // 界内不乱收呼吸
    for (const c of seam.journals.get(DAY)!.cards) {
      for (const key of Object.keys(c)) expect(CONTRACT_KEYS).toContain(key) // dropTargetId/dragFollow 永不过缝
    }
    const mats = [...el.querySelectorAll<HTMLElement>('.bj-card')]
    const zOf = (id: string): number => Number(mats.find((n) => n.getAttribute('data-card-id') === id)?.style.zIndex ?? -1)
    expect(zOf('d3-k')).toBeGreaterThan(zOf('d3-m')) // 子纸永远浮在垫纸上
    expect(stored('d3-m').z).toBe(5)
    expect(stored('d3-k').z).toBe(1) // ……而存储的 z 一个字没被动过
    const childrenPatches = vi.mocked(seam.app.updateCard).mock.calls.filter(([, , p]) => 'children' in p)
    expect(childrenPatches).toHaveLength(1)
    expect(childrenPatches[0]?.[2]).toEqual({ children: ['d3-k'] })
  })

  it('旧叠让渡：从 A 叠拖进 B 叠，一子一父当场成立', async () => {
    const k = kid('d32-k', { x: 430, y: 430 })
    const a = containerCard([k.id], { id: cid('d32-a'), pos: { x: 380, y: 360 }, size: { w: 300, h: 260 } })
    const b = containerCard([], { id: cid('d32-b'), pos: { x: 900, y: 900 }, size: { w: 300, h: 260 } })
    openDay([a, b, k])
    await screen.findByText('d32-k')
    dragFrom(cardEl('d32-k'), { x: 440, y: 440 }, { x: 950, y: 950 }, 6)
    await settle()
    expect(stored('d32-a').children).toEqual([])
    expect(stored('d32-b').children).toEqual([cid('d32-k')])
  })
})

describe('拖出与界内挪（D4）', () => {
  it('在垫纸界内挪纸：还是叠里的（同父重挂幂等，children 一笔都不许多写）', async () => {
    const k = kid('d41-k', { x: 430, y: 430 })
    const m = containerCard([k.id], { id: cid('d41-m'), pos: { x: 400, y: 400 }, size: { w: 300, h: 260 } })
    openDay([m, k])
    await screen.findByText('d41-k')
    dragFrom(cardEl('d41-k'), { x: 440, y: 435 }, { x: 500, y: 500 }, 4)
    await settle()
    expect(stored('d41-m').children).toEqual([cid('d41-k')])
    expect(stored('d41-k').pos).toEqual({ x: 490, y: 495 })
    expect(vi.mocked(seam.app.updateCard).mock.calls.filter(([, , p]) => 'children' in p)).toHaveLength(0)
  })

  it('拖出垫纸边界：断奶独立落定；旧垫纸只扩不缩、数张便签退回耳语', async () => {
    const k = kid('d42-k', { x: 430, y: 430 })
    const m = containerCard([k.id], { id: cid('d42-m'), pos: { x: 400, y: 400 }, size: { w: 300, h: 260 } })
    openDay([m, k])
    await screen.findByText('d42-k')
    dragFrom(cardEl('d42-k'), { x: 440, y: 440 }, { x: 200, y: 200 }, 6)
    await settle()
    expect(stored('d42-m').children).toEqual([])
    expect(stored('d42-m').size).toEqual({ w: 300, h: 260 }) // 诚实：纸走了，垫子不自动缩水
    expect(stored('d42-k').pos).toEqual({ x: 190, y: 190 })
    expect(whisper()?.textContent).toBe('拖一张纸进来，它们就是一叠了')
  })
})

describe('叠中叠护栏（D7）', () => {
  it('拖外垫：指针全程压着自己的内垫也不许自抱成环——只走整树平移', async () => {
    const g = kid('xg', { x: 495, y: 495 })
    const inner = containerCard([g.id], { id: cid('xi'), pos: { x: 470, y: 470 }, size: { w: 240, h: 180 }, z: 2 })
    const outer = containerCard([inner.id], { id: cid('xo'), pos: { x: 400, y: 400 }, size: { w: 300, h: 260 }, z: 1 })
    openDay([outer, inner, g])
    await screen.findByText('xg')
    const oEl = cardEl('xo')
    pointer(oEl, 'pointerdown', { x: 410, y: 410 })
    pointer(oEl, 'pointermove', { x: 450, y: 450 })
    pointer(oEl, 'pointermove', { x: 490, y: 490 })
    expect(droponCount()).toBe(0) // 自己的子孙不作落点
    pointer(oEl, 'pointerup', { x: 490, y: 490 })
    await settle()
    expect(stored('xo').children).toEqual([cid('xi')])
    expect(stored('xi').children).toEqual([cid('xg')])
    expect(stored('xo').pos).toEqual({ x: 480, y: 480 })
    expect(stored('xi').pos).toEqual({ x: 550, y: 550 }) // 子树整棵跟着垫纸走
    expect(stored('xg').pos).toEqual({ x: 575, y: 575 })
    expect(vi.mocked(seam.app.updateCard).mock.calls.filter(([, , p]) => 'children' in p)).toHaveLength(0)
  })

  it('陈旧双开数据已经两父抢一纸时：新收编死在闸前——便签给人话、缝里一个字不写、纸回到原位', async () => {
    const k = kid('wk', { x: 430, y: 430 })
    const p1 = containerCard([k.id], { id: cid('wp1'), pos: { x: 400, y: 400 }, size: { w: 300, h: 260 } })
    const p2 = containerCard([k.id], { id: cid('wp2'), pos: { x: 900, y: 900 }, size: { w: 300, h: 260 } })
    const fresh = kid('wf', { x: 50, y: 50 })
    openDay([p1, p2, k, fresh])
    await screen.findByText('wf')
    dragFrom(cardEl('wf'), { x: 70, y: 60 }, { x: 460, y: 460 }, 6)
    await settle()
    expect(el.querySelector('.bj-toast')?.textContent).toContain('这张纸没能放进去')
    expect(stored('wp1').children).toEqual([cid('wk')]) // 收编没落笔
    expect(stored('wf').pos).toEqual({ x: 50, y: 50 }) // 被拒的意图不污染乐观态
    expect(cardEl('wf').style.left).toBe('50px')
  })
})

describe('连纸带叠的再想想（D6）', () => {
  it('撕内垫报子树总数，再想想连嵌套带 index 逐字复原（parentPatches 之路）', async () => {
    const g = kid('ug', { x: 495, y: 495 })
    const inner = containerCard([g.id], { id: cid('ui'), pos: { x: 470, y: 470 }, size: { w: 240, h: 180 } })
    const other = kid('uo2', { x: 900, y: 900 })
    const outer = containerCard([inner.id, other.id], { id: cid('uo'), pos: { x: 400, y: 400 }, size: { w: 640, h: 560 } })
    openDay([outer, inner, g, other])
    await screen.findByText('ug')
    tap(cardEl('ui'), { x: 480, y: 480 })
    fireEvent.click(await screen.findByLabelText('卡片菜单'))
    fireEvent.click(screen.getByText('删除'))
    expect(screen.getByText('连纸带叠，一起撕下？')).toBeDefined()
    fireEvent.click(screen.getByText('确认删除'))
    await settle(80)
    const toasts = [...el.querySelectorAll('.bj-toast:not(.bj-toast-alert)')]
    expect(toasts[0]?.textContent).toBe('已撕下 2 张，再想想') // 托盘数 = 子树大小
    fireEvent.click(toasts[0]!.querySelector('.bj-toast-action')!)
    await settle(80)
    expect(stored('uo').children).toEqual([cid('ui'), 'uo2']) // 内垫回到外叠的出生席位
    expect(stored('ui').children).toEqual([cid('ug')])
    expect(stored('ug')).toBeDefined()
  })
})
