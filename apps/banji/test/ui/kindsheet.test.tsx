// R9·D3 添卡种类纸单：hero 回归闸（「添一张卡」一 tap 直通正文、零弹单）+ caret 掀单五路各走原动作。
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { App } from '../../src/ui/App'
import type { MockSeam } from './mocks'
import { makeMockApp } from './mocks'

const DAY = '2026-01-15'
let seam: MockSeam

function renderDay(): void {
  window.location.hash = `#/d/${DAY}`
  render(<App app={seam.app} initialTheme="light" now={() => new Date(2026, 0, 15)} />)
}

const settle = async (ms = 700): Promise<void> => {
  await new Promise((r) => setTimeout(r, ms))
}

const lastDraft = (): { kind: string; props: unknown } => {
  const calls = vi.mocked(seam.app.addCard).mock.calls
  const pair = calls[calls.length - 1]
  if (pair === undefined) throw new Error('addCard 没被调用')
  return { kind: String(pair[1].kind), props: pair[1].props }
}

beforeEach(() => {
  seam = makeMockApp()
})
afterEach(() => {
  cleanup()
  window.location.hash = ''
})

describe('添卡种类纸单（R9·D3）', () => {
  it('hero 回归闸：「添一张卡」一 tap 直接落正文并进编辑，纸单不掀、addCard 一次不停', async () => {
    renderDay()
    await settle()
    expect(document.querySelector('[data-kind-sheet]')).toBeNull()
    fireEvent.click(screen.getByText('添一张卡'))
    await waitFor(() => expect(seam.app.addCard).toHaveBeenCalledTimes(1))
    expect(lastDraft()).toMatchObject({ kind: 'text', props: { text: '' } })
    expect(await screen.findByText('添一张卡')).toBeDefined()
    expect(document.querySelector('[data-kind-sheet]')).toBeNull()
    const ta = await screen.findByRole('textbox')
    expect(ta).toBeDefined()
  })

  it('caret 掀纸单：正文/手记/代码/链接/垫纸 五路齐', async () => {
    renderDay()
    await settle()
    fireEvent.click(screen.getByLabelText('添一张卡·种类'))
    const sheet = await screen.findByRole('menu')
    expect([...sheet.querySelectorAll('[data-kind-row]')].map((b) => b.textContent?.replace(/\s/g, ''))).toEqual([
      '正文', '手记', '代码', '链接', '垫纸',
    ])
  })

  it('纸单·手记 → markdown 空稿落纸即编辑；再点不重开（选完收单）', async () => {
    renderDay()
    await settle()
    fireEvent.click(screen.getByLabelText('添一张卡·种类'))
    fireEvent.click(await screen.findByRole('menuitem', { name: '手记' }))
    await waitFor(() => expect(seam.app.addCard).toHaveBeenCalledTimes(1))
    expect(lastDraft()).toMatchObject({ kind: 'markdown', props: { text: '', format: 'md' } })
    expect(document.querySelector('[data-kind-sheet]')).toBeNull()
  })

  it('纸单·代码 → { text: "" } 落纸；纸单·链接 → { url: "" } 空草稿（渲染期孤闸兜底）', async () => {
    renderDay()
    await settle()
    fireEvent.click(screen.getByLabelText('添一张卡·种类'))
    fireEvent.click(await screen.findByRole('menuitem', { name: '代码' }))
    await waitFor(() => expect(seam.app.addCard).toHaveBeenCalledTimes(1))
    expect(lastDraft()).toMatchObject({ kind: 'code', props: { text: '' } })
    fireEvent.click(screen.getByLabelText('添一张卡·种类'))
    fireEvent.click(await screen.findByRole('menuitem', { name: '链接' }))
    await waitFor(() => expect(seam.app.addCard).toHaveBeenCalledTimes(2))
    expect(lastDraft()).toMatchObject({ kind: 'link', props: { url: '' } })
    expect(document.activeElement?.getAttribute('data-link-field')).not.toBeNull()
  })

  it('Esc 收单不落卡；纸单开着再按 Esc = 只收单', async () => {
    renderDay()
    await settle()
    fireEvent.click(screen.getByLabelText('添一张卡·种类'))
    await screen.findByRole('menu')
    fireEvent.keyDown(window, { key: 'Escape' })
    await waitFor(() => expect(document.querySelector('[data-kind-sheet]')).toBeNull())
    expect(seam.app.addCard).not.toHaveBeenCalled()
  })
})
