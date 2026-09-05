// R9·D6 重命名此纸：⋯ 菜单只对资产类现身、落笔走串行链 updateCard 的 props 覆盖、
// 展示链 props.name ?? 资产名 ?? hash 前八逐档钉死；资产记录一个字节不动（内容寻址红线）。
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { App } from '../../src/ui/App'
import type { MockSeam } from './mocks'
import { makeMockApp } from './mocks'
import { tap } from './pointer'
import type { Card, CardId } from '../../src/domain/types'

const DAY = '2026-01-15'
const HEX = '4fc8'.padEnd(64, '0')
let seam: MockSeam

function assetCard(id: string, kind: string, hash: string, extra: Record<string, unknown> = {}): Card {
  return {
    id: id as CardId, kind, pos: { x: 40, y: 60 }, size: { w: 260, h: 80 },
    props: { hash, ...extra }, createdAt: '', updatedAt: '',
  }
}

function renderDay(): void {
  window.location.hash = `#/d/${DAY}`
  render(<App app={seam.app} initialTheme="light" now={() => new Date(2026, 0, 15)} />)
}

const settle = async (ms = 700): Promise<void> => {
  await new Promise((r) => setTimeout(r, ms))
}

async function selectAndOpenMenu(id: string): Promise<void> {
  const el = document.querySelector(`[data-card-id="${id}"]`)
  if (el === null) throw new Error(`缺纸 ${id}`)
  tap(el, { x: 20, y: 10 })
  await waitFor(() => expect(el.classList.contains('is-sel')).toBe(true))
  fireEvent.click(screen.getByLabelText('卡片菜单'))
}

async function renameFlow(id: string, name: string): Promise<void> {
  await selectAndOpenMenu(id)
  const open = document.querySelector('[data-menu-rename]')
  if (open === null) throw new Error('「重命名此纸」没现身')
  fireEvent.click(open)
  const input = document.querySelector<HTMLInputElement>('[data-rename-input]')
  if (input === null) throw new Error('重命名浮笺没开')
  fireEvent.change(input, { target: { value: name } })
  fireEvent.click(document.querySelector('[data-rename-commit]') ?? input)
  await settle()
}

const labelOf = (id: string): string =>
  document.querySelector<HTMLElement>(`[data-card-id="${id}"] [data-file-name]`)?.textContent ?? ''

beforeEach(() => {
  seam = makeMockApp()
  seam.assets.set(HEX, { hash: HEX, mime: 'text/plain', size: 900, addedAt: '', name: '原件纸.bin', blob: new File(['x'.repeat(900)], '原件纸.bin') })
})
afterEach(() => {
  cleanup()
  window.location.hash = ''
})

describe('重命名此纸（R9·D6）', () => {
  it('菜单资格闸：正文纸不给「重命名此纸」，影纸（资产类）给', async () => {
    seam.putDay(DAY, [
      { ...assetCard('c-1', 'text', ''), props: { text: 'hi' } },
      assetCard('v-1', 'video', HEX),
    ])
    renderDay()
    await settle()
    await selectAndOpenMenu('c-1')
    expect(document.querySelector('[data-menu-rename]')).toBeNull()
    await selectAndOpenMenu('v-1')
    expect(document.querySelector('[data-menu-rename]')).not.toBeNull()
  })

  it('署名过唯一串行链：updateCard 带着 props.name 落库，资产记录不沾一个字', async () => {
    seam.putDay(DAY, [assetCard('f-1', 'file', HEX)])
    renderDay()
    await settle()
    await renameFlow('f-1', '合同·终稿')
    const card = seam.journals.get(DAY)?.cards.find((c) => c.id === 'f-1')
    expect((card?.props as { name?: string }).name).toBe('合同·终稿')
    expect((card?.props as { hash: string }).hash).toBe(HEX)
    let sawPropsPatch = false
    for (const [, , patch] of vi.mocked(seam.app.updateCard).mock.calls) {
      if (patch.props !== undefined && (patch.props as { name?: string }).name === '合同·终稿') sawPropsPatch = true
    }
    expect(sawPropsPatch).toBe(true)
    expect(seam.assets.get(HEX)?.name).toBe('原件纸.bin')
  })

  it('展示链三档：覆盖名 > 资产名 > hash 前八（无资产的孤儿引用也不裸奔）', async () => {
    seam.putDay(DAY, [
      assetCard('f-a', 'file', HEX, { name: '盖了章' }),
      assetCard('f-b', 'file', HEX),
      assetCard('f-c', 'file', 'ffffffff'.padEnd(64, 'f')),
    ])
    renderDay()
    await settle()
    expect(labelOf('f-a')).toBe('盖了章')
    expect(labelOf('f-b')).toBe('原件纸.bin')
    expect(labelOf('f-c')).toBe('ffffffff…')
  })

  it('债·同字节两张纸：各显其名（覆盖不连坐别纸）', async () => {
    seam.putDay(DAY, [assetCard('f-1', 'file', HEX), assetCard('f-2', 'file', HEX)])
    renderDay()
    await settle()
    expect(labelOf('f-2')).toBe('原件纸.bin')
    await renameFlow('f-1', '只此一家')
    expect(labelOf('f-1')).toBe('只此一家')
    expect(labelOf('f-2')).toBe('原件纸.bin')
  })

  it('清空署名 = 撤下覆盖回到资产名；空串 props.name 视同没有', async () => {
    seam.putDay(DAY, [assetCard('f-1', 'file', HEX, { name: '旧覆盖' })])
    renderDay()
    await settle()
    expect(labelOf('f-1')).toBe('旧覆盖')
    await renameFlow('f-1', '   ')
    expect((seam.journals.get(DAY)?.cards.find((c) => c.id === 'f-1')?.props as { name?: string }).name).toBe('')
    expect(labelOf('f-1')).toBe('原件纸.bin')
  })
})
