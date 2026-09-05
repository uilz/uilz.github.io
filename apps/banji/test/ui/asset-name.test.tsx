// R11·D2 题签对称：四类（含声音纸共五类）资产卡的 name 元素同类、同优先级链、常挂。
// 拍板口径=影纸「常挂」胜出：未改名也显 assetLabel（props.name → 资产原名 → hash 前八），
// 图纸不再只在改名后露脸。@vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { App } from '../../src/ui/App'
import type { MockSeam } from './mocks'
import { makeMockApp } from './mocks'
import type { AssetRecord, Card, CardId } from '../../src/domain/types'

const DAY = '2026-01-15'
const HEX = '6c1d'.padEnd(64, 'c0')
let seam: MockSeam

function asset(name: string | undefined): AssetRecord {
  const rec: AssetRecord = {
    hash: HEX,
    mime: 'application/octet-stream',
    size: 64,
    addedAt: '',
    blob: new File(['x'.repeat(64)], '原件.bin'),
  }
  return name === undefined ? rec : { ...rec, name }
}

function kinds(cards: Card[]): void {
  seam.putDay(DAY, cards)
  window.location.hash = `#/d/${DAY}`
  render(<App app={seam.app} initialTheme="light" now={() => new Date(2026, 0, 15)} />)
}

const card = (id: string, kind: string, props: Record<string, unknown>): Card => ({
  id: id as CardId, kind, pos: { x: 30, y: 40 }, size: { w: 300, h: 120 }, props, createdAt: '', updatedAt: '',
})

const nameOf = (kind: string): Element | null =>
  document.querySelector(`[data-card-id="k-${kind}"] .bj-asset-name`)

const settle = async (ms = 400): Promise<void> => {
  await new Promise((r) => setTimeout(r, ms))
}

beforeEach(() => {
  seam = makeMockApp()
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, writable: true, value: vi.fn((): string => 'blob:x') })
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, writable: true, value: vi.fn() })
  seam.assets.set(HEX, asset('雨后山.wav'))
})
afterEach(() => {
  cleanup()
  window.location.hash = ''
})

describe('题签同类同链（R11·D2）', () => {
  it('给每一型资产卡 when 渲染 then name 元素同类（.bj-asset-name + data-asset-name）', async () => {
    kinds([
      card('k-image', 'image', { hash: HEX }),
      card('k-video', 'video', { hash: HEX }),
      card('k-pdf', 'pdf', { hash: HEX }),
      card('k-file', 'file', { hash: HEX }),
      card('k-audio', 'audio', { hash: HEX }),
    ])
    await settle()
    for (const kind of ['image', 'video', 'pdf', 'file', 'audio']) {
      const el = nameOf(kind)
      expect(el, kind).not.toBeNull()
      expect(el?.classList.contains('bj-asset-name'), kind).toBe(true)
      expect(el?.getAttribute('data-asset-name'), kind).not.toBeNull()
      expect(el?.textContent, kind).toBe('雨后山.wav')
    }
  })

  it('题签常挂（图纸补齐）：未改名的资产图也显资产原名——改名债的最后一角', async () => {
    seam.assets.set(HEX, asset('晨雾.png'))
    kinds([card('k-image', 'image', { hash: HEX })])
    await settle()
    expect(nameOf('image')?.textContent).toBe('晨雾.png')
    expect(nameOf('image')?.getAttribute('title')).toBe('晨雾.png')
  })

  it('覆盖链第一档：props.name 赢过资产原名（改名即纸上私名，原件不连坐）', async () => {
    kinds([
      card('k-image', 'image', { hash: HEX, name: '雨后槐花' }),
      card('k-file', 'file', { hash: HEX, name: '合同·终稿' }),
    ])
    await settle()
    expect(nameOf('image')?.textContent).toBe('雨后槐花')
    expect(nameOf('file')?.textContent).toBe('合同·终稿')
  })

  it('无权威名的资产（name 缺席）落到 hash 前八兜底，题签绝不裸奔', async () => {
    seam.assets.set(HEX, asset(undefined))
    kinds([card('k-file', 'file', { hash: HEX })])
    await settle()
    expect(nameOf('file')?.textContent).toBe(`${HEX.slice(0, 8)}…`)
  })

  it('五型 name 元素共吃同一排印类且不再有第二口径：查询全集即五枚', async () => {
    kinds([
      card('k-image', 'image', { hash: HEX }),
      card('k-video', 'video', { hash: HEX }),
      card('k-pdf', 'pdf', { hash: HEX }),
      card('k-file', 'file', { hash: HEX }),
      card('k-audio', 'audio', { hash: HEX }),
    ])
    await settle()
    expect(document.querySelectorAll('.bj-card .bj-asset-name')).toHaveLength(5)
  })
})
