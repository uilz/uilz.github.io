// @vitest-environment jsdom
// 债#6（R5 揪出）：debounce 窗内 删除/编辑 → 立刻导入宇宙替换 —— 旧世界的在途意图绝不许开火进新宇宙。
// 托盘作废在 undo-lifecycle.test.tsx；这里钉另外三条腿：pending 意图、failedRef、拖拽瞬态。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { App } from '../../src/ui/App'
import type { MockSeam } from './mocks'
import { makeMockApp } from './mocks'
import { pointer, tap } from './pointer'
import { containerCard, textCard } from '../helpers'
import type { Card, CardId } from '../../src/domain/types'

const DAY = '2026-01-15'
const settle = async (ms = 620): Promise<void> => await new Promise((r) => setTimeout(r, ms))

let seam: MockSeam
let el: HTMLElement | null = null

const cid = (v: string): CardId => v as CardId
const node = (id: string): HTMLElement => {
  const q = el?.querySelector<HTMLElement>(`[data-card-id="${id}"]`)
  if (q == null) throw new Error(`卡片未渲染: ${id}`)
  return q
}

function text(id: string, pos: { readonly x: number; readonly y: number } = { x: 10, y: 20 }): Card {
  return textCard(id, { id: cid(id), pos, size: { w: 240, h: 150 }, z: 7.5, props: { text: id, format: 'plain' } })
}
function mat(id: string, children: CardId[], pos: { readonly x: number; readonly y: number } = { x: 400, y: 400 }): Card {
  return containerCard(children, { id: cid(id), pos, size: { w: 340, h: 260 }, props: {} })
}

function openDay(cards: Card[]): void {
  seam.putDay(DAY, cards)
  window.location.hash = `#/d/${DAY}`
  el = render(<App app={seam.app} initialTheme="light" now={() => new Date(2026, 0, 15)} />).container
}

async function waitForCard(id: string): Promise<void> {
  await waitFor(() => {
    if (el?.querySelector(`[data-card-id="${id}"]`) == null) throw new Error(`卡片未渲染: ${id}`)
  })
}

async function deleteCard(id: string): Promise<void> {
  await waitForCard(id)
  tap(node(id), { x: 30, y: 30 })
  fireEvent.click(await screen.findByLabelText('卡片菜单'))
  fireEvent.click(screen.getByText('删除'))
  fireEvent.click(screen.getByText('确认删除'))
  await settle(80) // 撕下回执已挂出、strip 意图已排进 debounce 窗（450ms 未到）
}

// 抽屉三段确认：只推到 ack 开火（不 settle 过 debounce 窗——窗内的旧意图才是本 Suite 的靶子）。
async function triggerAck(): Promise<void> {
  fireEvent.click(el!.querySelector<HTMLElement>('.bj-day-head [aria-label="设置"]')!)
  const fileInput = document.querySelector<HTMLInputElement>('input.bj-hidden-file')
  if (fileInput === null) throw new Error('导入文件输入未挂出')
  fireEvent.change(fileInput, { target: { files: [new File(['archive'], 'backup.banjizip')] } })
  fireEvent.click(screen.getByText('继续'))
  fireEvent.click(screen.getByText('确认替换'))
  await waitFor(() => {
    if (document.querySelector('.bj-confirm') !== null) throw new Error('导入 ack 未落定')
  })
}

const updateCalls = (): number => vi.mocked(seam.app.updateCard).mock.calls.length
const dumpJournals = (): string => JSON.stringify([...seam.journals.entries()])

function typeIntoCard(id: string, to: string): void {
  const read = node(id).querySelector<HTMLElement>('.bj-text-read')
  if (read === null) throw new Error(`没有阅读态: ${id}`)
  fireEvent.dblClick(read)
  const ta = node(id).querySelector<HTMLTextAreaElement>('textarea')
  if (ta === null) throw new Error(`没有编辑框: ${id}`)
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

describe('导入 ack 作废在途意图（债#6）', () => {
  it('given 撕子纸的strip排在debounce窗 when ack then ack后过缝零调用、新宇宙逐字（同id垫纸children不被抹平）', async () => {
    const doomed = text('x-k1', { x: 430, y: 430 })
    const kept = text('x-k2', { x: 620, y: 620 })
    openDay([mat('x-m', [doomed.id, kept.id]), doomed, kept])
    await deleteCard('x-k1') // 幸存垫纸的剥离补丁此刻只住在 pendingRef，未过缝
    // 新宇宙：同 id 垫纸合法带着别的子纸 —— strip 若开火就会把它抹平
    const fresh = text('x-new', { x: 430, y: 430 })
    vi.mocked(seam.app.importFromFile).mockImplementation(async () => {
      seam.journals.clear()
      seam.putDay(DAY, [mat('x-m', [fresh.id]), fresh])
      return { ok: true, stats: { journals: 1, cards: 2, edges: 0, settings: 0, assets: 0 } }
    })
    await triggerAck()
    const callsAtAck = updateCalls()
    const dumpAtAck = dumpJournals()
    await settle(750) // 未作废的话 debounce 定时器早已开火
    expect(updateCalls()).toBe(callsAtAck) // ack 后过缝零调用
    expect(dumpJournals()).toBe(dumpAtAck) // 导入的档案一字未动
    expect(seam.journals.get(DAY)?.cards.find((c) => c.id === cid('x-m'))?.children).toEqual([fresh.id])
    await waitForCard('x-new') // 新宇宙照常上纸
  })

  it('given 一笔失败的编辑住在failedRef when ack then 回执熄灭、无陈账重试（ack后过缝零调用）', async () => {
    openDay([text('f-1', { x: 40, y: 40 })])
    await waitForCard('f-1')
    vi.mocked(seam.app.updateCard).mockRejectedValueOnce(new Error('boom'))
    typeIntoCard('f-1', '存不上的字') // blur → exitEdit → flushNow：这一笔落进 failedRef
    await settle()
    expect(el?.querySelector('.bj-toast-alert')).not.toBeNull()
    await triggerAck()
    expect(el?.querySelector('.bj-toast-alert')).toBeNull() // 新宇宙没有旧世界的欠账
    const callsAtAck = updateCalls()
    await settle(750) // 换日 effect 的 flushNow 若还捎上陈失败意图，就会在这里过缝
    expect(updateCalls()).toBe(callsAtAck)
    expect(seam.journals.get(DAY)?.cards.at(0)?.props).toEqual({ text: 'f-1', format: 'plain' })
  })

  it('given ack已落定 when 立刻编辑落笔 then 队列没被毒死：意图照常过缝', async () => {
    openDay([text('q-1', { x: 40, y: 40 })])
    await waitForCard('q-1')
    await triggerAck()
    await waitForCard('q-1')
    typeIntoCard('q-1', '新宇宙的第一笔')
    await settle(750)
    expect(updateCalls()).toBeGreaterThan(0)
    expect(seam.journals.get(DAY)?.cards.at(0)?.props).toEqual({ text: '新宇宙的第一笔', format: 'plain' })
  })

  it('given 拖拽进行中 when ack then dropTargetId与dragFollow同拍熄灭（瞬态不过宇宙替换）', async () => {
    const inner = text('d-k', { x: 430, y: 430 })
    const loner = text('d-k2', { x: 20, y: 20 })
    openDay([mat('d-m', [inner.id]), inner, mat('d-o', [], { x: 900, y: 900 }), loner])
    await waitForCard('d-o')
    // 垫纸 d-m 正被拖着走（子纸 d-k 靠 dragFollow 跟移）
    pointer(node('d-m'), 'pointerdown', { x: 412, y: 412 })
    pointer(node('d-m'), 'pointermove', { x: 440, y: 440 })
    pointer(node('d-m'), 'pointermove', { x: 470, y: 470 })
    await waitFor(() => expect(node('d-k').style.transform).toContain('translate3d'))
    // 另一张纸 loner 正悬在 d-o 上（dropTargetId 在场）
    pointer(node('d-k2'), 'pointerdown', { x: 40, y: 40 })
    pointer(node('d-k2'), 'pointermove', { x: 560, y: 560 })
    pointer(node('d-k2'), 'pointermove', { x: 960, y: 960 })
    await waitFor(() => expect(node('d-o').classList.contains('is-dropon')).toBe(true))
    await triggerAck()
    await settle(200)
    expect(el!.querySelectorAll('.bj-card.be-container.is-dropon')).toHaveLength(0) // 落点态熄
    expect(node('d-k').style.transform).toBe('') // 跟移熄（d-k 只有 store 的 follow，无本地拖拽）
  })
})
