// R11·D6 巡检可达性补票：悬空端点/超新档两份拒信从「真拒绝结果」一路走到抽屉纸面——
// 专属暖话上屏、raw enum 不露脸（机器判死 jargon 禁律）。
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, type RenderResult, waitFor } from '@testing-library/react'
import { App } from '../../src/ui/App'
import type { ImportResult } from '../../src/application'
import type { MockSeam } from './mocks'
import { makeMockApp } from './mocks'

const settle = async (ms = 150): Promise<void> => {
  await new Promise((r) => setTimeout(r, ms))
}
let seam: MockSeam

function openDrawer(): RenderResult {
  window.location.hash = ''
  const view = render(<App app={seam.app} initialTheme="light" now={() => new Date(2026, 0, 15)} />)
  fireEvent.click(view.getByLabelText('设置'))
  return view
}

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

beforeEach(() => {
  seam = makeMockApp()
})
afterEach(() => cleanup())

describe('导入拒画上抽屉（R11·D6 可达性钉）', () => {
  it('悬空端点：拒信说得出是线的病，且「数据还在」读得出来', async () => {
    const view = openDrawer()
    await armImport(view, {
      ok: false,
      reason: 'edge.dangling_endpoint',
      userMessage: '资料校验未通过，导入已中止；你现有的日记完好无损。问题：有根线牵着不在档案里的纸',
      detail: 'edge.dangling_endpoint:边 e9 端点无卡 c#3↔c#x',
    })
    const face = await waitFor(() => {
      const el = document.querySelector('.bj-confirm')
      if (el === null) throw new Error('拒信封没落抽屉')
      return el.textContent ?? ''
    })
    expect(face).toContain('有根线牵着不在档案里的纸')
    expect(face).toContain('完好无损')
    expect(face).not.toContain('edge.dangling_endpoint')
  })

  it('超新档案：专属话原样上屏（R3 立的规矩一字不动地活到 R11）', async () => {
    const view = openDrawer()
    await armImport(view, {
      ok: false,
      reason: 'archive_too_new',
      userMessage: '此档案来自更新版本的伴记，请更新伴记后再导入（你的日记数据完好无损）。',
    })
    const face = await waitFor(() => {
      const el = document.querySelector('.bj-confirm')
      if (el === null) throw new Error('拒信封没落抽屉')
      return el.textContent ?? ''
    })
    expect(face).toContain('更新伴记后再导入')
    expect(face).not.toContain('archive_too_new')
  })
})
