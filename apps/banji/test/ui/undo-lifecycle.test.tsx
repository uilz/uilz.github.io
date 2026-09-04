// @vitest-environment jsdom
// undo 的生命周期面：10s 静默过期（假计时器）、换日存活认出生日、导入成功即作废（安全不变量）。
// 托盘/往返/顶替在 undo.test.tsx；真缝往返在 undo-realseam.test.tsx。
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

// React 19 的 act 需要显式声明测试环境；pump() 里的 act 负责冲刷 dispatch。
;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

import { App } from '../../src/ui/App'
import type { MockSeam } from './mocks'
import { makeMockApp } from './mocks'
import { tap } from './pointer'
import { textCard } from '../helpers'
import type { Card, CardId } from '../../src/domain/types'

const DAY = '2026-01-15'
const OTHER = '2026-01-16'
const settle = async (ms = 620): Promise<void> => await new Promise((r) => setTimeout(r, ms))
const pump = async (ms: number): Promise<void> => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

let seam: MockSeam
let el: HTMLElement | null = null

const cid = (v: string): CardId => v as CardId

function card(id: string, text: string): Card {
  return textCard(text, { id: cid(id), pos: { x: 10, y: 20 }, size: { w: 240, h: 150 }, z: 7.5, props: { text, format: 'plain' } })
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
  tap(el!.querySelector<HTMLElement>(`[data-card-id="${id}"]`)!, { x: 30, y: 30 })
  fireEvent.click(await screen.findByLabelText('卡片菜单'))
  fireEvent.click(screen.getByText('删除'))
  fireEvent.click(screen.getByText('确认删除'))
  await settle(80)
}

const undoToast = (): Element | null => el?.querySelector('.bj-toast:not(.bj-toast-alert) .bj-toast-action') ?? null
const undoText = (): string =>
  [...(el?.querySelectorAll('.bj-toast') ?? [])].find((t) => !t.classList.contains('bj-toast-alert'))?.textContent ?? ''

// 设置抽屉三段确认：选档 → 继续 → 确认替换（mock 缝的 importFromFile 默认为成功）。
async function runImportToSuccess(): Promise<void> {
  fireEvent.click(el!.querySelector<HTMLElement>('.bj-day-head [aria-label="设置"]')!)
  const fileInput = document.querySelector<HTMLInputElement>('input.bj-hidden-file')
  if (fileInput === null) throw new Error('导入文件输入未挂出')
  fireEvent.change(fileInput, { target: { files: [new File(['archive'], 'backup.banjizip')] } })
  fireEvent.click(screen.getByText('继续'))
  fireEvent.click(screen.getByText('确认替换'))
  await settle()
}

beforeEach(() => {
  seam = makeMockApp()
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  window.location.hash = ''
})

describe('撕下的十秒窗口', () => {
  it('given 假计时器 when 静置满 10s then 便签安静退场、restoreCards 一次未派、无残影提醒', async () => {
    vi.useFakeTimers()
    // 假计时器环境下全程不用 RTL waitFor（它会代拨时钟、污染 10s 窗口），
    // 数据路径纯微任务：pump(0) 即冲刷 getJournal/deleteCardCascade 两跳。
    openDay([card('lc-1', '归尘')])
    await pump(0)
    const target = (): HTMLElement | null => el?.querySelector<HTMLElement>(`[data-card-id="lc-1"]`) ?? null
    const node = target()
    if (node === null) throw new Error('假计时器下卡未挂出：微任务未冲刷')
    tap(node, { x: 30, y: 30 })
    await pump(0) // 假计时器下 React 渲染要过 act 冲刷（真计时器的 fireEvent 自带这层）
    fireEvent.click(screen.getByLabelText('卡片菜单'))
    await pump(0)
    fireEvent.click(screen.getByText('删除'))
    await pump(0)
    fireEvent.click(screen.getByText('确认删除'))
    await pump(20)
    expect(undoToast()).not.toBeNull()
    expect(undoText()).toBe('已撕下 1 张，再想想')
    await pump(9_000)
    expect(undoToast()).not.toBeNull() // 九秒还守着窗口
    await pump(1_100)
    expect(undoToast()).toBeNull()
    expect(el?.querySelectorAll('.bj-toast')).toHaveLength(0) // 过期是寂静的
    expect(vi.mocked(seam.app.restoreCards)).not.toHaveBeenCalled()
    expect(target()).toBeNull() // 纸片归尘，不留残影
  })
})

describe('换日不换账（undo 认出生日）', () => {
  it('given DAY 撕下 when 翻到别的日子再按「再想想」then restoreCards 收到出生日、卡回 DAY 而别日无影', async () => {
    openDay([card('lc-2', '昨日之纸'), card('lc-3', '同伴')])
    await deleteCard('lc-2')
    await waitFor(() => expect(undoToast()).not.toBeNull())
    window.location.hash = `#/d/${OTHER}`
    await settle()
    expect(undoToast()).not.toBeNull() // 托盘跨日存活
    fireEvent.click(undoToast()!)
    await settle()
    expect(seam.app.restoreCards).toHaveBeenCalledWith(DAY, expect.objectContaining({ cards: expect.any(Array) }))
    expect(seam.journals.get(DAY)?.cards.map((c) => c.id)).toContain('lc-2')
    expect(el?.querySelector('[data-card-id="lc-2"]')).toBeNull() // 不在眼前的纸不硬塞进当前日
    window.location.hash = `#/d/${DAY}`
    await settle()
    await waitForCard('lc-2') // 回到出生日，纸在原处
  })
})

describe('导入成功即作废（安全不变量：旧宇宙的纸片绝不恢复进新宇宙）', () => {
  it('given 待撤便签挂着 when 导入三段确认成功 then 便签退场、restoreCards 永不派发', async () => {
    openDay([card('lc-4', '作废吧'), card('lc-5', '留着')])
    await deleteCard('lc-4')
    await waitFor(() => expect(undoToast()).not.toBeNull())
    await runImportToSuccess()
    expect(undoToast()).toBeNull()
    expect(vi.mocked(seam.app.restoreCards)).not.toHaveBeenCalled()
    expect(seam.journals.get(DAY)?.cards.map((c) => c.id)).not.toContain('lc-4')
  })

  it('given 已按「再想想」且恢复正排在在途编辑之后 when 导入作废 then 链头到达时承诺被取消、restoreCards 仍零次', async () => {
    openDay([card('lc-6', '在途'), card('lc-7', '已许诺')])
    await deleteCard('lc-7')
    await waitFor(() => expect(undoToast()).not.toBeNull())
    let release!: () => void
    const hang = new Promise<void>((r) => {
      release = r
    })
    vi.mocked(seam.app.updateCard).mockImplementation(async () => {
      await hang
      return card('lc-6', '在途')
    })
    const read = await waitFor(() => {
      const q = el?.querySelector<HTMLElement>(`[data-card-id="lc-6"] .bj-text-read`)
      if (q == null) throw new Error('没有阅读态')
      return q
    })
    fireEvent.dblClick(read)
    const ta = await waitFor(() => {
      const q = el?.querySelector<HTMLTextAreaElement>(`[data-card-id="lc-6"] textarea`)
      if (q == null) throw new Error('没有编辑框')
      return q
    })
    fireEvent.change(ta, { target: { value: '堵住链头的编辑' } })
    fireEvent.blur(ta) // exitEdit → flushNow：updateCard 开火并挂起，串行链被占住
    await settle()
    expect(seam.app.updateCard).toHaveBeenCalled()
    fireEvent.click(undoToast()!) // 承诺出口：restore 排在挂起的编辑之后
    await settle(100)
    expect(vi.mocked(seam.app.restoreCards)).not.toHaveBeenCalled() // 排队证明：还没轮到它
    await runImportToSuccess() // 宇宙整体替换 → 作废
    release()
    await settle()
    expect(vi.mocked(seam.app.restoreCards)).not.toHaveBeenCalled() // 链头到达时承诺已作废，静默弃权
    expect(undoToast()).toBeNull()
    expect(seam.journals.get(DAY)?.cards.map((c) => c.id)).not.toContain('lc-7')
  })
})
