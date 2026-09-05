// R11·D5 快捷键补全：⌘N/⌘⇧K/⌘E + 守门矩阵（写字第上不抢键——Esc 与 ⌘F 是仅有的例外）+ 退场纪律。
// Esc 巡检结论：搜索纸片/种类纸单/牵线/撕线签/改名浮笺早有自持出口（各组件挂载期自听），
// 本章补抽屉这一扇漏门，并把全部出口在同一文件里成矩阵钉死。
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { App } from '../../src/ui/App'
import type { MockSeam } from './mocks'
import { makeMockApp } from './mocks'
import { tap } from './pointer'
import { textCard } from '../helpers'
import type { Card, CardId } from '../../src/domain/types'

const DAY = '2026-01-15'
let seam: MockSeam
let view: ReturnType<typeof render>

const settle = async (ms = 650): Promise<void> => {
  await new Promise((r) => setTimeout(r, ms))
}

function openDay(): void {
  const card: Card = textCard('旧文', { id: 'sc-1' as CardId, pos: { x: 10, y: 10 }, size: { w: 240, h: 150 } })
  seam.putDay(DAY, [card])
  window.location.hash = `#/d/${DAY}`
  view = render(<App app={seam.app} initialTheme="light" now={() => new Date(2026, 0, 15)} />)
}

function openCalendar(): void {
  window.location.hash = ''
  view = render(<App app={seam.app} initialTheme="light" now={() => new Date(2026, 0, 15)} />)
}

const addKinds = (): string[] =>
  vi.mocked(seam.app.addCard).mock.calls.map((c) => c[1].kind)

beforeEach(() => {
  seam = makeMockApp()
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, writable: true, value: vi.fn((): string => 'blob:x') })
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, writable: true, value: vi.fn() })
})
afterEach(() => {
  cleanup()
  window.location.hash = ''
})

describe('⌘ 键补全（守门矩阵：写字第上不开火，Esc 与 ⌘F 是仅有的两条例外）', () => {
  it('⌘N = 添一张卡（与同一枚 pill 同口径：落笔即进编辑聚焦）', async () => {
    openDay()
    await settle(300)
    fireEvent.keyDown(window, { key: 'n', metaKey: true })
    await settle()
    expect(addKinds()).toEqual(['text'])
    expect(document.querySelectorAll('textarea').length).toBeGreaterThanOrEqual(1)
  })

  it('⌘⇧K = 造叠；Ctrl 变体同样开闸', async () => {
    openDay()
    await settle(300)
    fireEvent.keyDown(window, { key: 'K', metaKey: true, shiftKey: true })
    await settle()
    expect(addKinds().filter((k) => k === 'container')).toHaveLength(1)
  })

  it('given 编辑框持焦 when ⌘N/⌘⇧K then 一律不开火（打字是写字，不是下命令）', async () => {
    openDay()
    await settle(300)
    fireEvent.dblClick(document.querySelector('[data-card-id="sc-1"] .bj-text-read')!)
    const ta = document.querySelector<HTMLTextAreaElement>('textarea')!
    fireEvent.keyDown(ta, { key: 'n', metaKey: true })
    fireEvent.keyDown(ta, { key: 'K', metaKey: true, shiftKey: true })
    fireEvent.keyDown(ta, { key: 'e', ctrlKey: true })
    await settle()
    expect(addKinds()).toHaveLength(0)
    expect(document.querySelector('.bj-drawer')).toBeNull()
  })

  it('given 编辑框正持焦 when ⌘F then 搜索纸片照样开闸（唯一在字上仍开的键）', async () => {
    openDay()
    await settle(300)
    fireEvent.dblClick(document.querySelector('[data-card-id="sc-1"] .bj-text-read')!)
    const ta = document.querySelector('textarea')!
    fireEvent.keyDown(ta, { key: 'f', metaKey: true })
    await settle(300)
    expect(document.querySelector('[data-search-sheet]')).not.toBeNull()
  })

  it('⌘E = 导出备份：抽屉开门直发（只读动作零确认），exportToFile 被调', async () => {
    openDay()
    await settle(300)
    fireEvent.keyDown(window, { key: 'e', metaKey: true })
    await settle()
    expect(document.querySelector('.bj-drawer')).not.toBeNull()
    expect(vi.mocked(seam.app.exportToFile)).toHaveBeenCalledTimes(1)
  })

  it('月历上没有添卡 pill：⌘N/⌘⇧K 让位浏览器（不 preventDefault 也不落卡），⌘E 照常', async () => {
    openCalendar()
    await settle(300)
    fireEvent.keyDown(window, { key: 'n', metaKey: true })
    fireEvent.keyDown(window, { key: 'K', metaKey: true, shiftKey: true })
    await settle()
    expect(addKinds()).toHaveLength(0)
    fireEvent.keyDown(window, { key: 'e', metaKey: true })
    await settle()
    expect(vi.mocked(seam.app.exportToFile)).toHaveBeenCalledTimes(1)
  })
})

describe('Esc 退场矩阵（R11·D5：每扇自持出口，一处一纪律）', () => {
  it('抽屉：Esc 合上；设置里能看见五行键术单', async () => {
    openCalendar()
    await settle(200)
    fireEvent.click(view.getByLabelText('设置'))
    expect(document.querySelector('[data-keylist]')).not.toBeNull()
    expect(document.querySelectorAll('[data-keylist] li')).toHaveLength(5)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(document.querySelector('.bj-drawer')).toBeNull()
  })

  it('种类纸单：Esc 收单不落卡（出口自持，与 R9 一致）', async () => {
    openDay()
    await settle(300)
    fireEvent.click(document.querySelector('[aria-label="添一张卡·种类"]')!)
    expect(document.querySelector('[data-kind-sheet]')).not.toBeNull()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(document.querySelector('[data-kind-sheet]')).toBeNull()
  })

  it('改名浮笺：浮笺持焦按 Esc 收笺（出口自持于浮笺），覆盖名一笔不写', async () => {
    const hex = '7d2e'.padEnd(64, 'd0')
    seam.assets.set(hex, { hash: hex, mime: 'text/plain', size: 8, addedAt: '', name: '底稿.txt', blob: new File(['xxxxxxxx'], '底稿.txt') })
    seam.putDay(DAY, [
      { id: 'f-1' as CardId, kind: 'file', pos: { x: 20, y: 20 }, size: { w: 260, h: 64 }, props: { hash: hex }, createdAt: '', updatedAt: '' },
    ])
    window.location.hash = `#/d/${DAY}`
    render(<App app={seam.app} initialTheme="light" now={() => new Date(2026, 0, 15)} />)
    await settle()
    const before = vi.mocked(seam.app.updateCard).mock.calls.length
    const paper = document.querySelector('[data-card-id="f-1"]')!
    tap(paper, { x: 20, y: 10 })
    await waitFor(() => expect(paper.classList.contains('is-sel')).toBe(true))
    fireEvent.click(document.querySelector('[aria-label="卡片菜单"]')!)
    fireEvent.click(document.querySelector('[data-menu-rename]')!)
    const input = document.querySelector<HTMLInputElement>('[data-rename-input]')!
    fireEvent.change(input, { target: { value: '半途的名字' } })
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(document.querySelector('[data-rename-input]')).toBeNull()
    expect(vi.mocked(seam.app.updateCard).mock.calls.length).toBe(before)
  })

  it('搜索纸片：⌘F 开、Esc 退场（退场动画窗后离屏）', async () => {
    openCalendar()
    await settle(200)
    fireEvent.keyDown(window, { key: 'f', ctrlKey: true })
    expect(document.querySelector('[data-search-sheet]')).not.toBeNull()
    fireEvent.keyDown(window, { key: 'Escape' })
    await settle(400)
    expect(document.querySelector('[data-search-sheet]')).toBeNull()
  })
})
