// V2-Iter1·F4 纸贴内容：纯闸（死区/钳位/空意图拒写）+ jsdom 编排面（克隆无布局即哑火、
// 挂载永不触发、只动正在被写的那张纸）。真浏览器里的真实量高归 e2e 判死。
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { App } from '../../src/ui/App'
import type { MockSeam } from './mocks'
import { makeMockApp } from './mocks'
import { HUG_GATE, HUG_MAX_H, HUG_MIN_H, hugTarget, measureReadHeight } from '../../src/ui/cards/hug'
import { textCard } from '../helpers'
import type { Card, CardId } from '../../src/domain/types'

const DAY = '2026-01-15'
let seam: MockSeam
let el: HTMLElement | null = null
const settle = async (ms = 620): Promise<void> => {
  await new Promise((r) => setTimeout(r, ms))
}

describe('hugTarget 纯闸（>24 死区 / min 96 / max 1200 / 空意图拒写）', () => {
  it('差不过死区一律不动纸', () => {
    expect(HUG_GATE).toBe(24)
    expect(hugTarget(150, 150 + HUG_GATE)).toBeNull()
    expect(hugTarget(150, 150 - HUG_GATE)).toBeNull()
    expect(hugTarget(150, 150 + HUG_GATE + 1)).toBe(175)
  })

  it('钳进地板/天花板；钳后与现高相同则拒写空意图', () => {
    expect(HUG_MIN_H).toBe(96)
    expect(HUG_MAX_H).toBe(1200)
    expect(hugTarget(500, 10)).toBe(96)
    expect(hugTarget(96, 10)).toBeNull()
    expect(hugTarget(3000, 9000)).toBe(1200)
    expect(hugTarget(1200, 9000)).toBeNull()
  })

  it('jsdom 无布局：measureReadHeight 量得 0（调用方据此哑火，绝不虚写）', () => {
    const host = document.createElement('div')
    const read = document.createElement('div')
    host.appendChild(read)
    document.body.appendChild(host)
    expect(measureReadHeight(read, 272)).toBe(0)
    host.remove()
  })
})

describe('贴高编排（挂载不动纸；内容编辑落回才量；只碰被写的那张）', () => {
  let mockReadH = 0
  const realOffset = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight')

  beforeEach(() => {
    seam = makeMockApp()
    mockReadH = 0
    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
      configurable: true,
      get(this: HTMLElement) {
        return this.classList?.contains('bj-text-read') === true ? mockReadH : 0
      },
    })
  })
  afterEach(() => {
    cleanup()
    window.location.hash = ''
    if (realOffset !== undefined) Object.defineProperty(HTMLElement.prototype, 'offsetHeight', realOffset)
  })

  function put(id: string, text: string, h: number): Card {
    return textCard(text, { id: id as CardId, pos: { x: 10, y: 10 }, size: { w: 240, h }, props: { text, format: 'plain' } })
  }

  function open(cards: Card[]): void {
    seam.putDay(DAY, cards)
    window.location.hash = `#/d/${DAY}`
    el = render(<App app={seam.app} initialTheme="light" now={() => new Date(2026, 0, 15)} />).container
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

  it('given 载日挂载（哪怕量尺有料）when 无人落笔 then resizeCard 一笔不发——既有版面纹丝不动', async () => {
    mockReadH = 240
    open([put('hg-1', '旧纸一', 150)])
    await settle()
    expect(seam.app.resizeCard).not.toHaveBeenCalled()
  })

  it('given 内容编辑落回 when 量得差过死区 then resizeCard 收到贴内容的 h（宽照旧）', async () => {
    open([put('hg-2', '短文', 150)])
    await settle(300)
    mockReadH = 240 // 240+26=266 vs 150 → 过闸
    await typeIntoCard('hg-2', '添了长长的一段新字，纸该跟着长了。')
    await waitFor(() => expect(seam.app.resizeCard).toHaveBeenCalledWith(DAY, 'hg-2', { w: 240, h: 266 }), { timeout: 2000 })
  })

  it('given 量得差没过多死区 when 编辑落回 then 不动纸', async () => {
    open([put('hg-3', '短文', 150)])
    await settle(300)
    mockReadH = 140 // 140+26=166 vs 150 → 死区内
    await typeIntoCard('hg-3', '换了几个字')
    await settle()
    expect(seam.app.resizeCard).not.toHaveBeenCalled()
  })

  it('given 两张纸 when 只写一张 then 另一张尺寸一字不动', async () => {
    open([put('hg-4', '甲纸', 150), put('hg-5', '乙纸', 170)])
    await settle(300)
    mockReadH = 240
    await typeIntoCard('hg-4', '甲纸添了长长的一段新字该长了')
    await waitFor(() => expect(seam.app.resizeCard).toHaveBeenCalled(), { timeout: 2000 })
    const ids = vi.mocked(seam.app.resizeCard).mock.calls.map((c) => c[1])
    expect(ids.every((i) => i === 'hg-4')).toBe(true)
    await settle()
    expect(seam.journals.get(DAY)?.cards.find((c) => c.id === 'hg-5')?.size).toEqual({ w: 240, h: 170 })
  })
})
