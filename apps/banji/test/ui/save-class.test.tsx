// R11·D1 保存侧根因探测（七度债收口）：链条 catch 边界的纯分类 + 回执按类配文案。
// 形状证据用真 DOMException（Blink/Firefox/legacy 数字 code 三态）与 application 层真错误类。
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { App } from '../../src/ui/App'
import type { MockSeam } from './mocks'
import { makeMockApp } from './mocks'
import { classifySaveError } from '../../src/ui/writeChain'
import { CardNotFoundError, InvalidDateError, JournalNotFoundError } from '../../src/application'
import { textCard } from '../helpers'
import type { Card, CardId } from '../../src/domain/types'

const DAY = '2026-01-15'
const settle = async (ms = 620): Promise<void> => {
  await new Promise((r) => setTimeout(r, ms))
}
let el: HTMLElement | null = null
let seam: MockSeam

function openDay(): void {
  const card: Card = textCard('旧文', { id: 'sc-1' as CardId, pos: { x: 10, y: 10 }, size: { w: 240, h: 150 } })
  seam.putDay(DAY, [card])
  window.location.hash = `#/d/${DAY}`
  el = render(<App app={seam.app} initialTheme="light" now={() => new Date(2026, 0, 15)} />).container
}

async function failOnce(err: unknown): Promise<void> {
  await waitFor(() => expect(el?.querySelector(`[data-card-id="sc-1"] .bj-text-read`)).not.toBeNull())
  vi.mocked(seam.app.updateCard).mockRejectedValueOnce(err)
  fireEvent.dblClick(el!.querySelector(`[data-card-id="sc-1"] .bj-text-read`)!)
  const ta = el!.querySelector<HTMLTextAreaElement>(`[data-card-id="sc-1"] textarea`)!
  fireEvent.change(ta, { target: { value: '新文' } })
  fireEvent.blur(ta)
  await settle()
}

const receiptTxt = (): string => el?.querySelector('.bj-toast-alert')?.textContent ?? ''

beforeEach(() => {
  seam = makeMockApp()
})
afterEach(() => {
  cleanup()
  window.location.hash = ''
})

describe('classifySaveError（纯分类：真错误形状全收，绝不吞类）', () => {
  it('Blink 现形：DOMException name=QuotaExceededError → quota', () => {
    expect(classifySaveError(new DOMException('The quota has been exceeded.', 'QuotaExceededError'))).toBe('quota')
  })
  it('Firefox 现形：同 name 的 DOMException → quota（引擎差异不挑形状）', () => {
    const err = new DOMException('Maximum storage size allowed by a user', 'QuotaExceededError')
    Object.defineProperty(err, 'name', { value: 'QuotaExceededError' })
    expect(classifySaveError(err)).toBe('quota')
  })
  it('legacy 形状：只有 {name}、只有 {code:22}/{code:1014}、裸对象都归 quota', () => {
    expect(classifySaveError({ name: 'QuotaExceededError' })).toBe('quota')
    expect(classifySaveError({ name: 'NS_ERROR_DOM_QUOTA_REACHED' })).toBe('quota')
    expect(classifySaveError({ code: 22 })).toBe('quota')
    expect(classifySaveError({ code: 1014, message: 'legacy' })).toBe('quota')
  })
  it('漂移类：application 三兄弟与 IDB NotFound/Constraint 归 drift', () => {
    expect(classifySaveError(new InvalidDateError('bad'))).toBe('drift')
    expect(classifySaveError(new JournalNotFoundError('2026-01-01'))).toBe('drift')
    expect(classifySaveError(new CardNotFoundError('2026-01-01', 'x' as CardId))).toBe('drift')
    expect(classifySaveError(new DOMException('nope', 'NotFoundError'))).toBe('drift')
    expect(classifySaveError(new DOMException('dup', 'ConstraintError'))).toBe('drift')
  })
  it('未知 passthrough：普通 Error / 字符串 / null 全归 unknown，不误报配额', () => {
    expect(classifySaveError(new Error('disk hiccup'))).toBe('unknown')
    expect(classifySaveError('boom')).toBe('unknown')
    expect(classifySaveError(null)).toBe('unknown')
    expect(classifySaveError(undefined)).toBe('unknown')
  })
})

describe('保存失败回执按类配文案（R2 唯一便签通道，零新 UI）', () => {
  it('given 配额爆 when 失焦落盘 then 回执「手机纸不多了 · 导出旧手札」（按钮再试补齐句尾）', async () => {
    openDay()
    await failOnce(new DOMException('The quota has been exceeded.', 'QuotaExceededError'))
    const txt = receiptTxt()
    expect(txt).toContain('手机纸不多了 · 导出旧手札')
    expect(txt).toContain('再试')
    expect(txt).not.toContain('没存上')
  })
  it('given 数据漂移 when 落盘 then 仍走通用回执「这一笔没存上」，不吓人', async () => {
    openDay()
    await failOnce(new CardNotFoundError('2026-02-30', 'sc-1' as CardId))
    const txt = receiptTxt()
    expect(txt).toContain('这一笔没存上')
    expect(txt).not.toContain('纸不多')
  })
  it('given 未知失败 when 落盘 then 通用回执原样（unknown passthrough 不猜根因）', async () => {
    openDay()
    await failOnce(new Error('mystery'))
    const txt = receiptTxt()
    expect(txt).toContain('这一笔没存上')
    expect(txt).not.toContain('纸不多')
  })
})
