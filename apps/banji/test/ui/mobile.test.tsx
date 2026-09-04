/// <reference types="vite/client" />
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactElement } from 'react'
import { App } from '../../src/ui/App'
import type { MockSeam } from './mocks'
import { makeMockApp } from './mocks'
import type { ImageProber } from '../../src/ui/probe'
import type { DayStoreOptions } from '../../src/ui/store'
import { revealInViewport } from '../../src/ui/focus'

const DAY = '2026-01-15'

// 源码扫描走 vite ?raw 编译期 glob（不开 node:fs、不装 @types/node —— src 的真相在构建图里）。
const cssSources = import.meta.glob('../../src/ui/styles/*.css', { query: '?raw', import: 'default', eager: true }) as Readonly<Record<string, string>>
const uiSources = import.meta.glob('../../src/ui/**/*.{ts,tsx}', { query: '?raw', import: 'default', eager: true }) as Readonly<Record<string, string>>

let seam: MockSeam

function mkFile(name: string, type: string, bytes: number[] = [1, 2, 3, 4]): File {
  return new File([Uint8Array.from(bytes)], name, { type })
}

function renderDay(probeSize: { w: number; h: number }): void {
  const fakeProbe: ImageProber = async () => probeSize
  window.location.hash = `#/d/${DAY}`
  const opts: DayStoreOptions = { probe: fakeProbe }
  const ui: ReactElement = <App app={seam.app} initialTheme="light" now={() => new Date(2026, 0, 15)} storeOptions={opts} />
  render(ui)
}

const clipInput = (): HTMLInputElement => document.querySelector<HTMLInputElement>('input[aria-label="夹带"]') ?? ({} as HTMLInputElement)

const setViewportWidth = (w: number): void => {
  Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: w })
}

let scrollSpy: ReturnType<typeof vi.fn>

beforeEach(() => {
  seam = makeMockApp()
  setViewportWidth(390)
  scrollSpy = vi.fn()
  Object.defineProperty(Element.prototype, 'scrollIntoView', { configurable: true, writable: true, value: scrollSpy })
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, writable: true, value: vi.fn((): string => 'blob:mock') })
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, writable: true, value: vi.fn() })
})

afterEach(() => {
  cleanup()
  window.location.hash = ''
  setViewportWidth(1024)
  Reflect.deleteProperty(Element.prototype, 'scrollIntoView')
})

describe('手机视口下的创建管线（vw=390）', () => {
  it('1200x900 大图：整卡收进 390 屏且留呼吸，props=290x218、size=318x244、落点 x=24 单列', async () => {
    renderDay({ w: 1200, h: 900 })
    await screen.findByText('这一天还是空白。落一笔吧。')
    fireEvent.change(clipInput(), { target: { files: [mkFile('大图.png', 'image/png')] } })
    await waitFor(() => expect(seam.app.addCard).toHaveBeenCalled())
    const [, draft] = vi.mocked(seam.app.addCard).mock.calls[0] ?? []
    expect(draft).toMatchObject({
      kind: 'image',
      props: { w: 290, h: 218 },
      size: { w: 318, h: 244 },
      pos: { x: 24 },
    })
  })

  it('小图不放大：自然 200x100 原样通过', async () => {
    renderDay({ w: 200, h: 100 })
    await screen.findByText('这一天还是空白。落一笔吧。')
    fireEvent.change(clipInput(), { target: { files: [mkFile('小图.png', 'image/png')] } })
    await waitFor(() => expect(seam.app.addCard).toHaveBeenCalled())
    const [, draft] = vi.mocked(seam.app.addCard).mock.calls[0] ?? []
    expect(draft).toMatchObject({ props: { w: 200, h: 100 }, size: { w: 228, h: 126 } })
  })

  it('桌面 1024 视口：封顶回到常量 420，行为与 R2 逐像素一致', async () => {
    setViewportWidth(1024)
    renderDay({ w: 1200, h: 900 })
    await screen.findByText('这一天还是空白。落一笔吧。')
    fireEvent.change(clipInput(), { target: { files: [mkFile('大图.png', 'image/png')] } })
    await waitFor(() => expect(seam.app.addCard).toHaveBeenCalled())
    const [, draft] = vi.mocked(seam.app.addCard).mock.calls[0] ?? []
    expect(draft).toMatchObject({ props: { w: 420, h: 315 }, size: { w: 448, h: 341 } })
  })
})

describe('键盘避让：聚焦卡片进视口（mock 元素，jsdom 安全）', () => {
  it('textarea focus→center、blur→nearest 并退出编辑', async () => {
    seam.putDay(DAY, [])
    renderDay({ w: 10, h: 10 })
    await screen.findByText('这一天还是空白。落一笔吧。')
    fireEvent.click(screen.getByRole('button', { name: '添一张卡' }))
    const ta = await screen.findByPlaceholderText('落一笔…')
    fireEvent.focus(ta)
    expect(scrollSpy).toHaveBeenCalledWith({ block: 'center' })
    scrollSpy.mockClear()
    fireEvent.blur(ta)
    expect(scrollSpy).toHaveBeenCalledWith({ block: 'nearest' })
    await waitFor(() => expect(screen.queryByPlaceholderText('落一笔…')).toBeNull())
  })

  it('revealInViewport：无 scrollIntoView 的元素静默空转、有则原样带 block 调用', () => {
    expect(() => revealInViewport({} as Element, 'center')).not.toThrow()
    const fn = vi.fn()
    revealInViewport({ scrollIntoView: fn } as unknown as Element, 'nearest')
    expect(fn).toHaveBeenCalledWith({ block: 'nearest' })
  })
})

describe('视口高度与单一真相（源码扫描）', () => {
  it('styles/*.css 里每个 100vh 都紧跟 100dvh 覆写：URL 栏伸缩不跳版', () => {
    const offenders: string[] = []
    for (const [path, src] of Object.entries(cssSources)) {
      const lines = src.split('\n')
      lines.forEach((line, i) => {
        if (/:\s*[\d.]+vh\b/.test(line)) {
          const next = lines[i + 1] ?? ''
          const paired = /^\s*height:\s*100dvh;/.test(next) && /^\s*height:\s*100vh;/.test(line)
          if (!paired) offenders.push(`${path}:${String(i + 1)} ${line.trim()}`)
        }
      })
    }
    expect(offenders).toEqual([])
  })

  it('src/ui 无 520 残留；420 代码字面量只住在 MAX_CARD_IMAGE_W 定义行（注释散文豁免）', () => {
    const stray520: string[] = []
    const stray420: string[] = []
    for (const [path, src] of Object.entries(uiSources)) {
      src.split('\n').forEach((raw, i) => {
        if (/^\s*(\/\/|\*|\/\*)/.test(raw)) return
        const note = `${path}:${String(i + 1)}`
        if (/\b520\b/.test(raw)) stray520.push(note)
        if (/\b420\b/.test(raw) && !/export const MAX_CARD_IMAGE_W = 420/.test(raw)) stray420.push(note)
      })
    }
    expect(stray520).toEqual([])
    expect(stray420).toEqual([])
  })
})
