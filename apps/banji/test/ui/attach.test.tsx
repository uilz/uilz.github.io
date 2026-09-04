// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactElement } from 'react'
import { App } from '../../src/ui/App'
import type { MockSeam } from './mocks'
import { makeMockApp } from './mocks'
import { sha256Hex } from '../../src/archive/hash'
import type { AssetRecord } from '../../src/domain/types'
import type { ImageProber } from '../../src/ui/probe'
import type { DayStoreOptions } from '../../src/ui/store'

const DAY = '2026-01-15'
let seam: MockSeam
const probeCalls: string[] = []

const fakeProbe: ImageProber = async (file) => {
  probeCalls.push(file instanceof File ? file.name : 'blob')
  return { w: 800, h: 600 }
}

function mkFile(name: string, type: string, bytes: number[] = [1, 2, 3, 4]): File {
  return new File([Uint8Array.from(bytes)], name, { type })
}

function renderDay(): { container: HTMLElement } {
  window.location.hash = `#/d/${DAY}`
  const opts: DayStoreOptions = { probe: fakeProbe }
  const ui: ReactElement = <App app={seam.app} initialTheme="light" now={() => new Date(2026, 0, 15)} storeOptions={opts} />
  return render(ui)
}

const clipInput = (): HTMLInputElement => document.querySelector<HTMLInputElement>('input[aria-label="夹带"]') ?? ({} as HTMLInputElement)

beforeEach(() => {
  seam = makeMockApp()
  probeCalls.length = 0
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, writable: true, value: vi.fn((): string => 'blob:mock') })
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, writable: true, value: vi.fn() })
})

afterEach(() => {
  cleanup()
  window.location.hash = ''
})

describe('夹带闭环（附件管线，缝=mock BanjiApp，无 IDB）', () => {
  it('图片文件：addAsset→addCard，props 含 hash+封顶 w/h，大小为建议尺寸+边框', async () => {
    renderDay()
    await screen.findByText('这一天还是空白。落一笔吧。')
    const f = mkFile('照片.png', 'image/png')
    fireEvent.change(clipInput(), { target: { files: [f] } })
    const expectedHash = await sha256Hex(Uint8Array.from([1, 2, 3, 4]))
    await waitFor(() => expect(seam.app.addCard).toHaveBeenCalled())
    const [day, draft] = vi.mocked(seam.app.addCard).mock.calls[0] ?? []
    expect(day).toBe(DAY)
    expect(draft).toMatchObject({
      kind: 'image',
      props: { hash: expectedHash, w: 420, h: 315 },
      size: { w: 448, h: 341 },
    })
    expect(probeCalls).toEqual(['照片.png'])
    expect(seam.assets.get(expectedHash)?.name).toBe('照片.png')
    await waitFor(() => expect(document.querySelector('.bj-ghost')).toBeNull())
    expect(document.querySelector('[data-card-id]')).not.toBeNull()
  })

  it('application/pdf：建文件卡，props 只带 hash（名字住资产记录，渲染器自取）', async () => {
    renderDay()
    const f = mkFile('合同.pdf', 'application/pdf')
    fireEvent.change(clipInput(), { target: { files: [f] } })
    await waitFor(() => expect(seam.app.addCard).toHaveBeenCalled())
    const [, draft] = vi.mocked(seam.app.addCard).mock.calls[0] ?? []
    expect(draft).toMatchObject({ kind: 'file', props: { hash: await sha256Hex(Uint8Array.from([1, 2, 3, 4])) } })
    expect(probeCalls).toEqual([])
  })

  it('未知类型（mime 空串）也必须收：落文件卡，绝不静默丢', async () => {
    renderDay()
    const f = new File([Uint8Array.from([9, 9])], '神秘.bin')
    fireEvent.change(clipInput(), { target: { files: [f] } })
    await waitFor(() => expect(seam.app.addCard).toHaveBeenCalled())
    const [, draft] = vi.mocked(seam.app.addCard).mock.calls[0] ?? []
    expect(draft?.kind).toBe('file')
  })

  it('addAsset 失败（配额）：无卡产生、虚影熄灭、回执给原因', async () => {
    renderDay()
    vi.mocked(seam.app.addAsset).mockImplementationOnce(async () => {
      throw new DOMException('quota', 'QuotaExceededError')
    })
    const f = mkFile('大照片.png', 'image/png')
    fireEvent.change(clipInput(), { target: { files: [f] } })
    expect(await screen.findByText('这一份没夹上 · 纸面快满了')).toBeDefined()
    await new Promise((r) => setTimeout(r, 120))
    expect(seam.app.addCard).not.toHaveBeenCalled()
    expect(document.querySelector('.bj-ghost')).toBeNull()
  })

  it('多文件同落：落点阶梯错开，每份都成卡', async () => {
    renderDay()
    const a = mkFile('a.png', 'image/png', [1])
    const b = mkFile('b.png', 'image/png', [2])
    const c = mkFile('c.png', 'image/png', [3])
    fireEvent.change(clipInput(), { target: { files: [a, b, c] } })
    await waitFor(() => expect(seam.app.addCard).toHaveBeenCalledTimes(3))
    const positions = vi.mocked(seam.app.addCard).mock.calls.map(([, d]) => JSON.stringify(d?.pos)).sort()
    expect(new Set(positions).size).toBe(3)
    expect(document.querySelectorAll('[data-card-id]')).toHaveLength(3)
    expect(document.querySelector('.bj-ghost')).toBeNull()
  })

  it('拖放到画布：dragover 可阻止默认且有提示态，drop 在指针处落卡', async () => {
    const { container } = renderDay()
    const canvas = container.querySelector<HTMLElement>('.bj-canvas')
    if (canvas === null) throw new Error('no canvas')
    const f = mkFile('拖入.png', 'image/png')
    const dt = () => ({ files: [f], types: ['Files'], dropEffect: '' })
    // jsdom 的 DragEvent 不吃 MouseEvent 字段：以通用 Event 为壳、dataTransfer/坐标为肉。
    const drag = (type: string, extra: Record<string, unknown>): Event => {
      const ev = new Event(type, { bubbles: true, cancelable: true })
      Object.assign(ev, { dataTransfer: dt() }, extra)
      act(() => {
        canvas.dispatchEvent(ev)
      })
      return ev
    }
    drag('dragenter', {})
    const over = drag('dragover', {})
    expect(over.defaultPrevented).toBe(true)
    expect(canvas.classList.contains('is-drop')).toBe(true)
    drag('drop', { clientX: 320, clientY: 380 })
    await waitFor(() => expect(seam.app.addCard).toHaveBeenCalled())
    const [, draft] = vi.mocked(seam.app.addCard).mock.calls[0] ?? []
    expect(draft).toMatchObject({ kind: 'image', pos: { x: 320, y: 380 } })
    expect(canvas.classList.contains('is-drop')).toBe(false)
  })

  it('粘贴带图：同管线；纯文本粘贴不劫持', async () => {
    renderDay()
    const img = mkFile('剪贴板.png', 'image/png')
    const paste = new Event('paste', { cancelable: true })
    Object.assign(paste, { clipboardData: { files: [img], types: ['Files'] } })
    window.dispatchEvent(paste)
    await waitFor(() => expect(seam.app.addCard).toHaveBeenCalled())
    expect(paste.defaultPrevented).toBe(true)

    const textPaste = new Event('paste', { cancelable: true })
    Object.assign(textPaste, { clipboardData: { files: [], types: ['text/plain'] } })
    window.dispatchEvent(textPaste)
    expect(textPaste.defaultPrevented).toBe(false)
    expect(vi.mocked(seam.app.addCard).mock.calls).toHaveLength(1)
  })

  it('虚影生命周期：资产在途时可见，落定即熄灭', async () => {
    let release!: () => void
    const gate = new Promise<void>((res) => {
      release = res
    })
    const file = mkFile('缓.png', 'image/png')
    const hash = await sha256Hex(Uint8Array.from([1, 2, 3, 4]))
    vi.mocked(seam.app.addAsset).mockImplementationOnce(async (): Promise<AssetRecord> => {
      await gate
      const rec: AssetRecord = { hash, mime: 'image/png', size: file.size, addedAt: '', blob: file, name: file.name }
      seam.assets.set(hash, rec)
      return rec
    })
    renderDay()
    fireEvent.change(clipInput(), { target: { files: [file] } })
    expect(await screen.findByText('落纸中 · 缓.png')).toBeDefined()
    expect(document.querySelector('.bj-ghost[data-ghost="image"]')).not.toBeNull()
    release()
    await waitFor(() => expect(document.querySelector('.bj-ghost')).toBeNull(), { timeout: 3000 })
    expect(seam.app.addCard).toHaveBeenCalled()
    await waitFor(() => expect(document.querySelector('[data-card-id]')).not.toBeNull())
  })
})
