// @vitest-environment jsdom
// 竖向切片：真 createBanjiApp + 真 IndexedDB（fake-indexeddb）+ UI —— 不 mock 任何缝。
// 证明“今晚手机上能用”这条最低线：落笔、自动保存、回月历见墨点、换设备式再进同一天数据仍在。
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { App } from '../../src/ui/App'
import { createBanjiApp } from '../../src/application'
import { deleteDatabase, openRepo } from '../../src/repository/repo'
import type { Repo } from '../../src/repository/types'

const DAY = '2026-01-15'
const now = (): Date => new Date(2026, 0, 15, 22, 30, 0)
const settle = async (ms = 650): Promise<void> => await new Promise((r) => setTimeout(r, ms))

const DB = 'banji-e2e-smoke'
let repo: Repo

beforeAll(async () => {
  repo = await openRepo({ name: DB })
})
afterAll(async () => {
  repo.close()
  await deleteDatabase(DB)
})

describe('e2e：空白日 → 落笔 → 月历见墨点', () => {
  it('真库写读全链路（debounce 自动保存生效，UI 全程只走缝）', async () => {
    const app = createBanjiApp(repo, { now })
    window.location.hash = `#/d/${DAY}`
    render(<App app={app} initialTheme="light" now={now} />)
    expect(await screen.findByText('这一天还是空白。落一笔吧。')).toBeDefined()

    fireEvent.click(screen.getByText('添一张卡'))
    const ta = await screen.findByPlaceholderText('落一笔…')
    fireEvent.change(ta, { target: { value: '今夜灯火下落一笔。' } })
    fireEvent.blur(ta)
    await settle()
    expect(screen.getByText('今夜灯火下落一笔。')).toBeDefined()

    const doc = await app.getJournal(DAY)
    expect(doc?.cards).toHaveLength(1)
    expect(doc?.cards[0]?.props).toEqual({ text: '今夜灯火下落一笔。', format: 'plain' })
    expect(doc?.cards[0]?.id).toMatch(/^[0-9a-f-]{36}$/)

    cleanup()
    window.location.hash = ''
    render(<App app={app} initialTheme="light" now={now} />)
    await vi.waitFor(() => expect(document.querySelector('[data-tier]')).not.toBeNull(), { timeout: 2000 })
    const marked = document.querySelector<HTMLElement>('[data-tier]')
    if (marked === null) throw new Error('墨点未出现')
    expect(marked.getAttribute('data-tier')).toBe('1')
    expect(marked.closest<HTMLElement>('.bj-cell')?.dataset['date']).toBe(DAY)

    cleanup()
    window.location.hash = `#/d/${DAY}`
    render(<App app={app} initialTheme="light" now={now} />)
    expect(await screen.findByText('今夜灯火下落一笔。')).toBeDefined()
    app.close()
  })
})
