// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { App } from '../../src/ui/App'
import type { MockSeam } from './mocks'
import { makeMockApp } from './mocks'
import { textCard } from '../helpers'
import type { CardId } from '../../src/domain/types'

const DAY = '2026-01-15'
const settle = async (ms = 620): Promise<void> => await new Promise((r) => setTimeout(r, ms))

let seam: MockSeam

const cid = (value: string): CardId => value as CardId

const propsOf = (id: CardId): unknown => seam.journals.get(DAY)?.cards.find((x) => x.id === id)?.props
const propsPatches = (id: CardId): unknown[][] =>
  vi.mocked(seam.app.updateCard).mock.calls.filter((call) => call[1] === id && 'props' in call[2])

beforeEach(() => {
  seam = makeMockApp()
})
afterEach(() => cleanup())

function openDay(id: CardId): void {
  seam.putDay(DAY, [
    textCard('旧文', {
      id,
      pos: { x: 10, y: 10 },
      size: { w: 220, h: 140 },
      props: { text: '旧文', format: 'plain' },
    }),
  ])
  window.location.hash = `#/d/${DAY}`
  render(<App app={seam.app} initialTheme="light" now={() => new Date(2026, 0, 15)} />)
}

describe('文字卡自动保存（缝=mock BanjiApp，无 IDB）', () => {
  it('given 编辑中连改多次 when debounce 到点 then 只落一次 updateCard 且带最终 props', async () => {
    openDay(cid('tx-1'))
    fireEvent.dblClick(await screen.findByText('旧文'))
    const ta = await screen.findByRole('textbox')
    fireEvent.change(ta, { target: { value: '新' } })
    fireEvent.change(ta, { target: { value: '新内容' } })
    await settle()
    const calls = propsPatches(cid('tx-1'))
    expect(calls).toHaveLength(1) // debounce 合并：z 置顶与文字在同一次落盘
    expect(calls[0]?.[2]).toEqual({ z: 0.5, props: { text: '新内容', format: 'plain' } })
    expect(propsOf(cid('tx-1'))).toEqual({ text: '新内容', format: 'plain' })
  })

  it('given 编辑中 when 移焦（blur）then 立即落盘并回到阅读态', async () => {
    openDay(cid('tx-2'))
    fireEvent.dblClick(await screen.findByText('旧文'))
    const ta = await screen.findByRole('textbox')
    fireEvent.change(ta, { target: { value: '快存' } })
    fireEvent.blur(ta)
    await settle(80)
    expect(propsPatches(cid('tx-2')).at(-1)?.[2]).toEqual({ z: 0.5, props: { text: '快存', format: 'plain' } })
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(screen.getByText('快存')).toBeDefined()
  })

  it('格式切换 正文/手记 持久 props.format，md 下渲染标题', async () => {
    openDay(cid('tx-3'))
    fireEvent.dblClick(await screen.findByText('旧文'))
    fireEvent.click(await screen.findByText('手记'))
    const ta = screen.getByRole('textbox')
    fireEvent.change(ta, { target: { value: '# 标题一' } })
    fireEvent.blur(ta)
    await settle(80)
    expect(propsOf(cid('tx-3'))).toEqual({ text: '# 标题一', format: 'md' })
    expect(await screen.findByText('标题一')).toBeDefined()
    expect(document.querySelector('h3')).not.toBeNull()
  })

  it('手记(md) 排印中的 HTML 注入只作为文字出现，不生成元素', async () => {
    const evil = '<img src=x onerror=1>'
    seam.putDay(DAY, [textCard(evil, { id: cid('tx-4'), props: { text: evil, format: 'md' } })])
    window.location.hash = `#/d/${DAY}`
    render(<App app={seam.app} initialTheme="light" now={() => new Date(2026, 0, 15)} />)
    expect(await screen.findByText(evil)).toBeDefined()
    expect(document.querySelector('img')).toBeNull()
  })
})
