// R9·D2 六渲染器面：objectURL 同生死（卸载必 revoke）、pdf 新页开（_blank+noopener）、
// 链接渲染期孤闸——库中 javascript: 换不来一条 <a>；编辑提交只收 safeHttpUrl 且半途草稿配一句耳语。
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { App } from '../../src/ui/App'
import type { MockSeam } from './mocks'
import { makeMockApp } from './mocks'
import type { AssetRecord, Card, CardId } from '../../src/domain/types'

const DAY = '2026-01-15'
const HEX = '5bad'.padEnd(64, '0')
let seam: MockSeam

function card(id: string, kind: string, props: Record<string, unknown>): Card {
  return { id: id as CardId, kind, pos: { x: 40, y: 60 }, size: { w: 320, h: 120 }, props, createdAt: '', updatedAt: '' }
}

const rec = (name: string, type: string): AssetRecord => ({
  hash: HEX, mime: type, size: 128, addedAt: '', name, blob: new File([new Uint8Array(128)], name, { type }),
})

function renderDay(): void {
  window.location.hash = `#/d/${DAY}`
  render(<App app={seam.app} initialTheme="light" now={() => new Date(2026, 0, 15)} />)
}

const settle = async (ms = 700): Promise<void> => {
  await new Promise((r) => setTimeout(r, ms))
}

beforeEach(() => {
  seam = makeMockApp()
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, writable: true, value: vi.fn((): string => `blob:mock-${HEX.slice(0, 8)}`) })
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, writable: true, value: vi.fn() })
})
afterEach(() => {
  cleanup()
  window.location.hash = ''
})

describe('声音纸/影纸（R9）', () => {
  it('audio：原生 <audio controls> 挂 blob URL；卸载即 revoke（objectURL 同生死）', async () => {
    seam.assets.set(HEX, rec('晨曲.wav', 'audio/wav'))
    seam.putDay(DAY, [card('a-1', 'audio', { hash: HEX })])
    renderDay()
    await settle()
    const el = document.querySelector('audio.bj-audio')
    expect(el).not.toBeNull()
    expect(el?.getAttribute('controls')).not.toBeNull()
    expect(el?.getAttribute('src')).toBe(`blob:mock-${HEX.slice(0, 8)}`)
    cleanup()
    expect(vi.mocked(URL.revokeObjectURL)).toHaveBeenCalledWith(`blob:mock-${HEX.slice(0, 8)}`)
  })

  it('video：原生 <video controls> 挂 blob URL，题签行走展示链（覆盖名优先）', async () => {
    seam.assets.set(HEX, rec('短片.mp4', 'video/mp4'))
    seam.putDay(DAY, [card('v-1', 'video', { hash: HEX, name: '庭院短片' })])
    renderDay()
    await settle()
    expect(document.querySelector('video.bj-video[controls]')).not.toBeNull()
    expect(document.querySelector('.bj-video-name')?.textContent).toBe('庭院短片')
  })
})

describe('火漆签（R9）', () => {
  it('pdf chip = <a target=_blank rel=noopener> 开 blob 原件；名行走 D6 链', async () => {
    seam.assets.set(HEX, rec('合同.pdf', 'application/pdf'))
    seam.putDay(DAY, [card('p-1', 'pdf', { hash: HEX })])
    renderDay()
    await settle()
    const a = document.querySelector<HTMLAnchorElement>('a[data-pdf-open]')
    expect(a).not.toBeNull()
    expect(a?.target).toBe('_blank')
    expect(a?.rel).toContain('noopener')
    expect(a?.href).toBe(`blob:mock-${HEX.slice(0, 8)}`)
    expect(a?.textContent).toContain('合同.pdf')
  })
})

describe('手记纸/代码纸（R9）', () => {
  it('markdown 空稿即排 md 块（# 题→h3），代码纸 white-space:pre 原样保行', async () => {
    seam.putDay(DAY, [
      card('m-1', 'markdown', { text: '# 雨后立单\n- 收衫', format: 'md' }),
      card('c-1', 'code', { text: 'fn main() {\n  你好();\n}' }),
    ])
    renderDay()
    await settle()
    expect(document.querySelector('[data-md-view] h3')?.textContent).toBe('雨后立单')
    expect(document.querySelector('pre[data-code-view]')?.textContent).toContain('fn main() {')
  })
})

describe('题签纸（R9）：两处都不是孤闸', () => {
  it('库中 javascript: 脏 url 换不来一条 <a>——只以文本现形', async () => {
    seam.putDay(DAY, [card('l-1', 'link', { url: 'javascript:alert(1)' })])
    renderDay()
    await settle()
    expect(document.querySelector('[data-card-id="l-1"] a')).toBeNull()
    expect(document.querySelector('[data-card-id="l-1"] [data-link-hosted]')?.textContent).toBe('javascript:alert(1)')
  })

  it('https 渲染成题面+发丝 href（_blank+noopener、host 兜底题面）', async () => {
    seam.putDay(DAY, [card('l-2', 'link', { url: 'https://example.com/a' })])
    renderDay()
    await settle()
    const a = document.querySelector<HTMLAnchorElement>('[data-card-id="l-2"] a.bj-link-hair')
    expect(a?.href).toBe('https://example.com/a')
    expect(a?.target).toBe('_blank')
    expect(a?.rel).toContain('noopener')
    expect(document.querySelector('[data-card-id="l-2"] [data-link-display]')?.textContent).toContain('example.com')
  })

  it('编辑提交：半途垃圾只配耳语不落库；合格串以 WHATWG 规范形落笔', async () => {
    seam.putDay(DAY, [card('l-3', 'link', { url: '' })])
    renderDay()
    await settle()
    const empty = document.querySelector('[data-link-empty]')
    if (empty === null) throw new Error('题签纸没上纸（空题面不在）')
    fireEvent.doubleClick(empty)
    const input = await screen.findByPlaceholderText('写个完整网址，比如 https://…')
    fireEvent.change(input, { target: { value: 'javascript:alert(1)' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(await screen.findByText('写个完整网址，比如 https://…')).toBeDefined()
    expect((seam.journals.get(DAY)?.cards.find((c) => c.id === 'l-3')?.props ?? null)).toEqual({ url: '' })
    fireEvent.change(input, { target: { value: ' https://ex.com/ok?1 ' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await settle()
    expect(seam.app.updateCard).toHaveBeenCalled()
    expect((seam.journals.get(DAY)?.cards.find((c) => c.id === 'l-3')?.props as { url: string }).url).toBe('https://ex.com/ok?1')
  })
})
