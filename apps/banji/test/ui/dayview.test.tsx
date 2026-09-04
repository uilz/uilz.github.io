// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ReactElement } from 'react'
import { App } from '../../src/ui/App'
import type { MockSeam } from './mocks'
import { makeMockApp } from './mocks'
import { dragFrom, tap } from './pointer'
import { imageCard, textCard } from '../helpers'
import type { Card, CardId } from '../../src/domain/types'

const DAY = '2026-01-15'

// debounce 450ms + 串行链：真实时钟下一拍足够落定（比假计时器与 RTL waitFor 少一层纠缠）。
const settle = async (ms = 620): Promise<void> => await new Promise((r) => setTimeout(r, ms))

function cardOf(container: HTMLElement, id: string): HTMLElement | null {
  return container.querySelector<HTMLElement>(`[data-card-id="${id}"]`)
}
function mustCard(container: HTMLElement, id: string): HTMLElement {
  const el = cardOf(container, id)
  if (el === null) throw new Error(`卡片未渲染: ${id}`)
  return el
}

let seam: MockSeam

function renderDay(): { container: HTMLElement } {
  window.location.hash = `#/d/${DAY}`
  const ui: ReactElement = <App app={seam.app} initialTheme="light" now={() => new Date(2026, 0, 15)} />
  return render(ui)
}

beforeEach(() => {
  seam = makeMockApp()
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, writable: true, value: vi.fn((): string => 'blob:mock-img') })
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, writable: true, value: vi.fn() })
})

afterEach(() => {
  cleanup()
  window.location.hash = ''
})

describe('当日手札视图', () => {
  it('文字卡与图片卡都渲染：图片经 app.getAsset → Object URL', async () => {
    const a = textCard('庭有枇杷树', { id: 'a-1' as CardId, pos: { x: 20, y: 40 }, size: { w: 220, h: 120 } })
    const img = imageCard('a'.repeat(64), { id: 'i-1' as CardId, pos: { x: 300, y: 40 } })
    seam.putDay(DAY, [a, img])
    seam.assets.set('a'.repeat(64), {
      hash: 'a'.repeat(64),
      mime: 'image/png',
      size: 8,
      addedAt: '',
      blob: new Blob(['pngpng!!'], { type: 'image/png' }),
    })
    const { container } = renderDay()
    expect(await screen.findByText('庭有枇杷树')).toBeDefined()
    expect(seam.app.getAsset).toHaveBeenCalledWith('a'.repeat(64))
    await settle()
    expect(container.querySelector<HTMLImageElement>('img.bj-img')?.src).toBe('blob:mock-img')
  })

  it('given 卡片在纸面 when 拖拽卡身 then moveCard 收到新坐标并写回文档', async () => {
    const b = textCard('乙卡', { id: 'b-1' as CardId, pos: { x: 200, y: 300 }, size: { w: 180, h: 100 } })
    seam.putDay(DAY, [b])
    const { container } = renderDay()
    await screen.findByText('乙卡')
    dragFrom(mustCard(container, 'b-1'), { x: 210, y: 310 }, { x: 260, y: 370 }, 4)
    await settle()
    expect(seam.app.moveCard).toHaveBeenCalledWith(DAY, b.id, { x: 250, y: 360 })
    expect(seam.journals.get(DAY)?.cards.find((c) => c.id === b.id)?.pos).toEqual({ x: 250, y: 360 })
  })

  it('点按选中 → ⋯ 删除走二次确认；容器给出级联提示', async () => {
    const child = textCard('子卡', { id: 'kid-1' as CardId, pos: { x: 400, y: 420 } })
    const box: Card = {
      id: 'box-1' as CardId,
      kind: 'container',
      pos: { x: 10, y: 10 },
      size: { w: 200, h: 200 },
      props: {},
      children: [child.id],
      createdAt: '',
      updatedAt: '',
    }
    seam.putDay(DAY, [box, child])
    const { container } = renderDay()
    await screen.findByText('子卡')
    tap(mustCard(container, 'box-1'), { x: 30, y: 20 })
    fireEvent.click(await screen.findByLabelText('卡片菜单'))
    fireEvent.click(screen.getByText('删除'))
    expect(screen.getByText(/连纸带叠/)).toBeDefined()
    fireEvent.click(screen.getByText('确认删除'))
    await settle()
    expect(seam.app.deleteCardCascade).toHaveBeenCalledWith(DAY, box.id)
    expect(cardOf(container, 'box-1')).toBeNull()
    expect(cardOf(container, 'kid-1')).toBeNull()
  })

  it('given 空白日 when 打开 then 只有一行安静与添卡按钮', async () => {
    renderDay()
    expect(await screen.findByText('这一天还是空白。落一笔吧。')).toBeDefined()
    expect(screen.getByText('添一张卡')).toBeDefined()
  })

  it('添一张卡 → addCard 走缝、自动进入编辑、纸落定动效只标记新卡', async () => {
    const a: Card = { ...textCard('旧卡', { id: 'old-1' as CardId, size: { w: 100, h: 100 } }), z: 1 }
    seam.putDay(DAY, [a])
    const { container } = renderDay()
    await screen.findByText('旧卡')
    expect(container.querySelector('.bj-settle')).toBeNull()
    fireEvent.click(screen.getByText('添一张卡'))
    await settle()
    expect(seam.app.addCard).toHaveBeenCalledWith(DAY, expect.objectContaining({ kind: 'text' }))
    expect(await screen.findByPlaceholderText('落一笔…')).toBeDefined()
    expect(container.querySelectorAll('[data-card]')).toHaveLength(2)
    expect(container.querySelector('.bj-settle')).not.toBeNull()
  })
})
