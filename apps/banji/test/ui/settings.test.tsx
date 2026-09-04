// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, type RenderResult } from '@testing-library/react'
import { App } from '../../src/ui/App'
import type { ImportResult } from '../../src/application'
import type { MockSeam } from './mocks'
import { makeMockApp } from './mocks'

const settle = async (ms = 120): Promise<void> => await new Promise((r) => setTimeout(r, ms))

let seam: MockSeam

function openDrawer(): RenderResult {
  window.location.hash = ''
  const view = render(<App app={seam.app} initialTheme="light" now={() => new Date(2026, 0, 15)} />)
  fireEvent.click(view.getByLabelText('设置'))
  return view
}

function pickArchiveFile(view: RenderResult, name = 'a.banjizip'): void {
  fireEvent.click(view.getByText('导入备份'))
  const input = document.querySelector<HTMLInputElement>('input[type="file"]')
  if (input === null) throw new Error('文件输入未挂出')
  fireEvent.change(input, { target: { files: [new File(['x'], name)] } })
}

async function armImport(view: RenderResult, result: ImportResult): Promise<void> {
  pickArchiveFile(view)
  expect(await view.findByText(/完全替换现在的伴记/)).toBeDefined()
  fireEvent.click(view.getByText('继续'))
  vi.mocked(seam.app.importFromFile).mockResolvedValue(result) // 先装好返回值，再按最后一道闸
  fireEvent.click(view.getByText('确认替换'))
  await settle(800)
}

beforeEach(() => {
  seam = makeMockApp()
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, writable: true, value: vi.fn((): string => 'blob:dl') })
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, writable: true, value: vi.fn() })
})
afterEach(() => cleanup())

describe('设置抽屉', () => {
  it('两段确认前一步写入都不发生（导入是全量替换，必须拦两道）', async () => {
    const view = openDrawer()
    pickArchiveFile(view)
    expect(await view.findByText(/完全替换现在的伴记/)).toBeDefined()
    expect(vi.mocked(seam.app.importFromFile)).not.toHaveBeenCalled()
    fireEvent.click(view.getByText('继续'))
    expect(view.getByText('确认替换')).toBeDefined()
    expect(vi.mocked(seam.app.importFromFile)).not.toHaveBeenCalled()
  })

  it('导入成功：importFromFile 收到所选文件；回执报数；月历打点重新取数', async () => {
    const ok: ImportResult = { ok: true, stats: { journals: 3, cards: 9, edges: 0, settings: 1, assets: 2 } }
    const view = openDrawer()
    await armImport(view, ok)
    expect(vi.mocked(seam.app.importFromFile)).toHaveBeenCalledTimes(1)
    const arg = vi.mocked(seam.app.importFromFile).mock.calls[0]?.[0]
    expect(arg).toBeInstanceOf(File)
    expect(view.getByText('已导入：3 天手札 · 9 张卡片')).toBeDefined()
    expect(vi.mocked(seam.app.getMonthSummary).mock.calls.length).toBeGreaterThanOrEqual(2)
  })

  it('导入失败：档案太新 → 专属 zh-CN 文案，读得出「数据还在」', async () => {
    const view = openDrawer()
    await armImport(view, {
      ok: false,
      reason: 'archive_too_new',
      userMessage: '此档案来自更新版本的伴记，请更新伴记后再导入（你的日记数据完好无损）。',
    })
    expect(view.getByText(/更新伴记后再导入（你的日记数据完好无损）/)).toBeDefined()
  })

  it('导入失败·userMessage 为空时按 reason 兜底（staging_failed 与 unknown_hash_algo 文案不同）', async () => {
    const v1 = openDrawer()
    await armImport(v1, { ok: false, reason: 'staging_failed', userMessage: '' })
    expect(v1.getByText(/暂存/)).toBeDefined()
    expect(v1.getByText(/原样未动/)).toBeDefined()
    cleanup()
    const v2 = openDrawer()
    await armImport(v2, { ok: false, reason: 'unknown_hash_algo', userMessage: '' })
    expect(v2.getByText(/不认识的算法/)).toBeDefined()
  })

  it('主题：夜读=换肤+setSetting 持久化；宣纸拨回', async () => {
    const view = openDrawer()
    fireEvent.click(view.getByText('夜读'))
    expect(document.documentElement.getAttribute('data-bj-theme')).toBe('night')
    await settle()
    expect(vi.mocked(seam.app.setSetting)).toHaveBeenCalledWith('theme', 'night')
    fireEvent.click(view.getByText('宣纸'))
    expect(document.documentElement.getAttribute('data-bj-theme')).toBe('light')
  })

  it('导出备份：exportToFile → Object URL → 安静回执', async () => {
    const view = openDrawer()
    fireEvent.click(view.getByText('导出备份'))
    await settle(400)
    expect(vi.mocked(seam.app.exportToFile)).toHaveBeenCalled()
    expect(URL.createObjectURL).toHaveBeenCalled()
    expect(view.getByText('已保存到下载文件夹')).toBeDefined()
  })
})
