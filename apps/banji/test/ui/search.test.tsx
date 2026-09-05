// 全局搜索界面（R8·D1）：放大镜/⌘F 请出上升纸片、空语耳语、debounce 出结果（按日分组赭底高亮）、
// 行点=跳转+暖脉冲（瞬态到点即熄，假计时器钉死）、Esc 退场、snippet 只走 React 文本节点（XSS 判死）。
// 瞬态纪律：搜索纸片的一切永不写库——mock 缝写侧计数全程为 0。
// @vitest-environment jsdom
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

import { App } from '../../src/ui/App'
import type { MockSeam } from './mocks'
import { makeMockApp } from './mocks'
import { containerCard, imageCard, isoAt, textCard } from '../helpers'
import type { AssetRecord, CardId } from '../../src/domain/types'

const DAY = '2026-01-15'
const YESTERDAY = '2026-01-14'
const OLDER = '2026-01-13'
const cid = (v: string): CardId => v as CardId
const settle = async (ms = 350): Promise<void> => await new Promise((r) => setTimeout(r, ms))

let seam: MockSeam
let el: HTMLElement | null = null

function openCalendar(): void {
  window.location.hash = '#/'
  el = render(<App app={seam.app} initialTheme="light" now={() => new Date(2026, 0, 15)} />).container
}

function putAsset(hash: string, name: string): void {
  const rec: AssetRecord = { hash, mime: 'image/png', name, size: 4, addedAt: isoAt(0), blob: new Blob(['x']) }
  seam.assets.set(hash, rec)
}

const sheetOpen = (): boolean => el?.querySelector('[data-search-sheet]') !== null

async function openSheet(): Promise<void> {
  fireEvent.click(el!.querySelector('[data-search-open]')!)
  const input = await screen.findByLabelText('搜索笔记')
  expect(input).toBe(document.activeElement)
}

function seedWorld(): void {
  seam.putDay(DAY, [textCard('槐花帖', { id: cid('t1'), pos: { x: 20, y: 20 } })])
  const kid = textCard('藏在叠里的槐花', { id: cid('kid') })
  seam.putDay(YESTERDAY, [containerCard([kid.id], { id: cid('mat') }), kid])
  seam.putDay(OLDER, [imageCard('h1', { id: cid('img') }), textCard('旧页', { id: cid('old') })])
  putAsset('h1', '槐花特写.png')
}

beforeEach(() => {
  seam = makeMockApp()
  seedWorld()
})
afterEach(() => {
  cleanup()
  el = null
  window.location.hash = ''
  vi.useRealTimers()
})

describe('搜索入口与纸面', () => {
  it('月历页眉放大镜请出纸片；输入即刻持焦；空查询耳语「想找哪一笔？」', async () => {
    openCalendar()
    await openSheet()
    expect(sheetOpen()).toBe(true)
    expect(screen.getByText('想找哪一笔？')).not.toBeNull()
  })

  it('⌘F 全局开纸（桌面键位，Ctrl 等价）', async () => {
    openCalendar()
    fireEvent.keyDown(window, { key: 'f', ctrlKey: true })
    await screen.findByLabelText('搜索笔记')
    expect(sheetOpen()).toBe(true)
  })

  it('Esc 退场', async () => {
    openCalendar()
    await openSheet()
    fireEvent.keyDown(window, { key: 'Escape' })
    await waitFor(() => expect(sheetOpen()).toBe(false), { timeout: 1500 })
  })
})

describe('结果：分组、高亮、行点', () => {
  it('debounce 后出结果：新日在前、行=日期签+高亮；容器孩子自成一行；附件名经 hash 联结', async () => {
    openCalendar()
    await openSheet()
    fireEvent.change(screen.getByLabelText('搜索笔记'), { target: { value: '槐花' } })
    await waitFor(() => expect(el!.querySelectorAll('[data-search-row]').length).toBe(3), { timeout: 2000 })
    const rows = [...el!.querySelectorAll('[data-search-row]')]
    expect(rows.map((r) => r.getAttribute('data-search-date'))).toEqual([DAY, YESTERDAY, OLDER])
    expect(rows[1]?.getAttribute('data-search-card')).toBe('kid')
    const hl = rows[0]?.querySelector('[data-search-hl]') as HTMLElement | null
    expect(hl?.tagName).toBe('SPAN')
    expect(hl?.textContent).toBe('槐花')
  })

  it('无结果说「没有哪页纸写过这个。」', async () => {
    openCalendar()
    await openSheet()
    fireEvent.change(screen.getByLabelText('搜索笔记'), { target: { value: '绝不存在的字句' } })
    await screen.findByText('没有哪页纸写过这个。', {}, { timeout: 2000 })
  })

  it('XSS：snippet 是 React 文本节点——投毒文本原样可读、行内绝不生长 <img>', async () => {
    seam.putDay(DAY, [textCard('<img src=x onerror=1>槐花', { id: cid('xss') })])
    openCalendar()
    await openSheet()
    fireEvent.change(screen.getByLabelText('搜索笔记'), { target: { value: 'onerror' } })
    await waitFor(() => expect(el!.querySelectorAll('[data-search-row]').length).toBe(1), { timeout: 2000 })
    const row = el!.querySelector('[data-search-row]')!
    expect(row.querySelector('img')).toBeNull()
    expect(row.textContent).toContain('<img src=x onerror=1>')
  })

  it('行点：跳那天的卡片模式 + 目标纸暖脉冲，假计时器到点即熄；全程零写库', async () => {
    vi.useFakeTimers()
    try {
      openCalendar()
      fireEvent.click(el!.querySelector('[data-search-open]')!)
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0)
      })
      const input = screen.getByLabelText('搜索笔记') as HTMLInputElement
      fireEvent.change(input, { target: { value: '槐花特写' } })
      await act(async () => {
        await vi.advanceTimersByTimeAsync(300)
      })
      const row = el!.querySelector('[data-search-row][data-search-date="2026-01-13"]') as HTMLElement | null
      expect(row).not.toBeNull()
      fireEvent.click(row!)
      expect(window.location.hash).toBe(`#/d/${OLDER}`)
      await act(async () => {
        await vi.advanceTimersByTimeAsync(50) // 开日加载落账、卡片挂载（链=微任务+小计时冲刷）
      })
      expect(el!.querySelector('[data-card-id="img"].is-pulse')).not.toBeNull()
      await act(async () => {
        await vi.advanceTimersByTimeAsync(300) // hop 的 260ms 到点 → App 熄灯
      })
      expect(el!.querySelector('[data-card-id="img"].is-pulse')).toBeNull()
      expect(seam.app.addCard).not.toHaveBeenCalled()
      expect(seam.app.updateCard).not.toHaveBeenCalled()
      expect(seam.app.setSetting).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('底料纪律', () => {
  it('一次入场读一遍底料：连续敲字不重复 loadAll', async () => {
    openCalendar()
    await openSheet()
    const input = screen.getByLabelText('搜索笔记')
    for (const v of ['槐', '槐花', '槐花帖']) {
      fireEvent.change(input, { target: { value: v } })
      await settle()
    }
    expect(seam.app.loadAllCards).toHaveBeenCalledTimes(1)
    expect(seam.app.loadAllAssetMeta).toHaveBeenCalledTimes(1)
  })
})
