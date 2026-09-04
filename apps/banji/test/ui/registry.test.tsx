// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { fallbackRenderer, rendererFor, resolveRenderer } from '../../src/ui/cards/registry'
import { App } from '../../src/ui/App'
import type { MockSeam } from './mocks'
import { makeMockApp } from './mocks'
import { dragFrom, tap } from './pointer'
import type { Card, CardId } from '../../src/domain/types'

const DAY = '2026-01-15'
const settle = async (ms = 620): Promise<void> => await new Promise((r) => setTimeout(r, ms))

describe('卡片注册表', () => {
  it('已知 kind 解析到各自渲染器；未登记 kind 返回 undefined', () => {
    expect(rendererFor('text')?.iconKind).toBe('text')
    expect(rendererFor('image')?.iconKind).toBe('image')
    expect(rendererFor('file')?.iconKind).toBe('file')
    expect(rendererFor('mystery-kind')).toBeUndefined()
    expect(resolveRenderer('image')).toBe(rendererFor('image'))
  })

  it('未知 kind 解析到兜底渲染器（显示层永不拿到 undefined）', () => {
    expect(resolveRenderer('mystery-kind')).toBe(fallbackRenderer)
    expect(resolveRenderer('container')).toBe(fallbackRenderer)
  })
})

describe('未知 kind 卡片上纸的现场表现', () => {
  let seam: MockSeam
  const mystery: Card = {
    id: 'mx-1' as CardId,
    kind: 'voice-note-2027',
    pos: { x: 40, y: 60 },
    size: { w: 220, h: 100 },
    props: { answer: 42, nested: { list: [1, 2, 3], uni: '保留我' } },
    createdAt: '',
    updatedAt: '',
  }

  const openWithMystery = async (): Promise<HTMLElement> => {
    seam.putDay(DAY, [mystery])
    window.location.hash = `#/d/${DAY}`
    const view = render(<App app={seam.app} initialTheme="light" now={() => new Date(2026, 0, 15)} />).container
    await screen.findByText('暂不支持的卡片 · 原样保留')
    const el = view.querySelector<HTMLElement>('[data-card-id="mx-1"]')
    if (el === null) throw new Error('兜底卡未渲染')
    return el
  }

  beforeEach(() => {
    seam = makeMockApp()
  })
  afterEach(() => {
    cleanup()
    window.location.hash = ''
  })

  it('渲染安静兜底条：不崩、不外泄载荷', async () => {
    await openWithMystery()
    expect(document.querySelector('img')).toBeNull()
    expect(screen.queryByText(/voice-note/)).toBeNull()
    expect(screen.queryByText(/42/)).toBeNull()
  })

  it('given 兜底卡 when 选中(置顶)+拖拽(落位) then updateCard 的 patch 永不含 props 且拖拽走 moveCard', async () => {
    const el = await openWithMystery()
    tap(el, { x: 50, y: 70 })
    dragFrom(el, { x: 50, y: 70 }, { x: 90, y: 130 }, 4)
    await settle()
    for (const [, id, patch] of vi.mocked(seam.app.updateCard).mock.calls) {
      expect(id).toBe(mystery.id)
      expect('props' in patch).toBe(false)
    }
    expect(vi.mocked(seam.app.updateCard).mock.calls.length > 0).toBe(true) // z 置顶确实发生了
    expect(seam.app.moveCard).toHaveBeenCalledWith(DAY, mystery.id, { x: 80, y: 120 })
    expect(seam.journals.get(DAY)?.cards.find((c) => c.id === mystery.id)?.props).toEqual(mystery.props)
  })
})
