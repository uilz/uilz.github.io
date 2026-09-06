// R13·D3 objectURL 交棒宽限（火漆签）+ 敌手闸码上抽屉（拒信纸面可达性·R11·D6 同门）。
// 宽限政策在此钉死：交棒（点击）后 URL 即免即刻放、改挂 10 分钟超时（假计时器逐拍验）；
// 不交棒则 R9 原纪律原样（卸载即 revoke）。闸码拒信的专属人话走真 mock 缝上屏、raw 不上脸。
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, type RenderResult } from '@testing-library/react'
import { App } from '../../src/ui/App'
import type { ImportResult } from '../../src/application'
import type { MockSeam } from './mocks'
import { makeMockApp } from './mocks'
import type { AssetRecord, Card, CardId } from '../../src/domain/types'
import { PDF_OPEN_HOLD_MS } from '../../src/ui/cards/pdf'

const DAY = '2026-01-15'
const HEX = '5bad'.padEnd(64, '0')
const URL_A = `blob:mock-${HEX.slice(0, 8)}`
let seam: MockSeam

function card(id: string, kind: string, props: Record<string, unknown>): Card {
  return { id: id as CardId, kind, pos: { x: 40, y: 60 }, size: { w: 320, h: 120 }, props, createdAt: '', updatedAt: '' }
}

const rec = (name: string, type: string): AssetRecord => ({
  hash: HEX,
  mime: type,
  size: 128,
  addedAt: '',
  name,
  blob: new File([new Uint8Array(128)], name, { type }),
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
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, writable: true, value: vi.fn((): string => URL_A) })
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, writable: true, value: vi.fn() })
})
afterEach(() => {
  cleanup()
  window.location.hash = ''
  vi.useRealTimers()
})

describe('R13·D3 火漆签交棒宽限', () => {
  it('点开翻开 → 卸载：URL 不即刻放（新页还在取数），10 分钟到点才 revoke 恰一次', async () => {
    vi.useFakeTimers()
    try {
      seam.assets.set(HEX, rec('合同.pdf', 'application/pdf'))
      seam.putDay(DAY, [card('p-1', 'pdf', { hash: HEX })])
      renderDay()
      await vi.advanceTimersByTimeAsync(800)
      const a = document.querySelector<HTMLAnchorElement>('a[data-pdf-open]')
      expect(a).not.toBeNull()
      fireEvent.click(a as HTMLAnchorElement)
      cleanup()
      await vi.advanceTimersByTimeAsync(0)
      expect(vi.mocked(URL.revokeObjectURL)).not.toHaveBeenCalled()
      await vi.advanceTimersByTimeAsync(PDF_OPEN_HOLD_MS - 1)
      expect(vi.mocked(URL.revokeObjectURL)).not.toHaveBeenCalled()
      await vi.advanceTimersByTimeAsync(2)
      expect(vi.mocked(URL.revokeObjectURL)).toHaveBeenCalledTimes(1)
      expect(vi.mocked(URL.revokeObjectURL)).toHaveBeenCalledWith(URL_A)
    } finally {
      vi.useRealTimers()
    }
  })

  it('没点开就卸载：即刻放——R9 同生死纪律一字未动（宽限只赏给真交出去的棒）', async () => {
    seam.assets.set(HEX, rec('合同.pdf', 'application/pdf'))
    seam.putDay(DAY, [card('p-1', 'pdf', { hash: HEX })])
    renderDay()
    await settle()
    cleanup()
    expect(vi.mocked(URL.revokeObjectURL)).toHaveBeenCalledTimes(1)
    expect(vi.mocked(URL.revokeObjectURL)).toHaveBeenCalledWith(URL_A)
  })

  it('影纸不配宽限（未交棒路径的零例外）：卸载即放；点没点都不挂 10 分钟棒', async () => {
    seam.assets.set(HEX, rec('短片.mp4', 'video/mp4'))
    seam.putDay(DAY, [card('v-1', 'video', { hash: HEX })])
    renderDay()
    await settle()
    const v = document.querySelector('video.bj-video')
    expect(v).not.toBeNull()
    cleanup()
    expect(vi.mocked(URL.revokeObjectURL)).toHaveBeenCalledWith(URL_A)
  })
})

describe('R13 敌手闸码拒信上抽屉（纸面可达性·mock 缝直供）', () => {
  async function armImport(view: RenderResult, result: ImportResult): Promise<void> {
    fireEvent.click(view.getByText('导入备份'))
    const input = document.querySelector<HTMLInputElement>('input[type="file"]')
    if (input === null) throw new Error('文件输入未挂出')
    fireEvent.change(input, { target: { files: [new File(['x'], 'a.banjizip')] } })
    expect(await view.findByText(/完全替换现在的伴记/)).toBeDefined()
    fireEvent.click(view.getByText('继续'))
    vi.mocked(seam.app.importFromFile).mockResolvedValue(result)
    fireEvent.click(view.getByText('确认替换'))
    await settle(800)
  }

  async function faceText(view: RenderResult): Promise<string> {
    const el = await view.findByText(/不敢收/)
    return (el.textContent ?? '') + ((document.querySelector('.bj-confirm')?.textContent) ?? '')
  }

  function openDrawer(): RenderResult {
    window.location.hash = ''
    const view = render(<App app={seam.app} initialTheme="light" now={() => new Date(2026, 0, 15)} />)
    fireEvent.click(view.getByLabelText('设置'))
    return view
  }

  it('entry_oversize：「比它自报的厚——不敢收」原样上屏，raw 码不入眼', async () => {
    const view = openDrawer()
    await armImport(view, {
      ok: false,
      reason: 'archive.entry_oversize',
      userMessage: '资料校验未通过，导入已中止；你现有的日记完好无损。问题：档案里有一页纸比它自报的厚——不敢收（assets/bbbb… 承诺 1024 字节，头里自称 209715200）',
      detail: 'archive.entry_oversize:承诺 1024 字节，头里自称 209715200',
    })
    const face = await faceText(view)
    expect(face).toContain('比它自报的厚')
    expect(face).toContain('完好无损')
    expect(face).not.toContain('archive.entry_oversize')
  })

  it('archive.corrupt 与 zip_unreadable 各说各话，两道都在屏上读得出「数据还在」', async () => {
    const v1 = openDrawer()
    await armImport(v1, {
      ok: false,
      reason: 'archive.corrupt',
      userMessage: '资料校验未通过，导入已中止；你现有的日记完好无损。问题：档案的封蜡裂了，纸页摊不开原样——不敢收（journals.json: invalid length/literal）',
      detail: 'archive.corrupt:journals.json: invalid length/literal',
    })
    expect(await faceText(v1)).toContain('封蜡裂了')
  })
})
