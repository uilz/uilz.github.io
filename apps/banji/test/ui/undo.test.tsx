// @vitest-environment jsdom
// 撕下→再想想 的托盘面：便签文面、串行往返、快照前摄、单级顶替、与失败回执共存。
// 生命周期面（过期/换日/导入作废）在 undo-lifecycle.test.tsx；真缝往返在 undo-realseam.test.tsx。
// 真实删除路径：点选 → ⋯ → 删除 → 确认删除（与 dayview.test 同一套 pointer 把手）。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { App } from '../../src/ui/App'
import type { MockSeam } from './mocks'
import { makeMockApp } from './mocks'
import { tap } from './pointer'
import { buildDeleteSnapshot, stripDoomedRefs } from '../../src/ui/undoSnapshot'
import { containerCard, textCard } from '../helpers'
import type { Card, CardId } from '../../src/domain/types'

const DAY = '2026-01-15'
const settle = async (ms = 620): Promise<void> => await new Promise((r) => setTimeout(r, ms))

let seam: MockSeam
let el: HTMLElement | null = null

const cid = (v: string): CardId => v as CardId

function card(id: string, text: string, over: Partial<Card> = {}): Card {
  return textCard(text, { id: cid(id), pos: { x: 10, y: 20 }, size: { w: 240, h: 150 }, z: 7.5, props: { text, format: 'plain' }, ...over })
}

function openDay(cards: Card[]): void {
  seam.putDay(DAY, cards)
  window.location.hash = `#/d/${DAY}`
  el = render(<App app={seam.app} initialTheme="light" now={() => new Date(2026, 0, 15)} />).container
}

async function waitForCard(id: string): Promise<void> {
  await waitFor(() => {
    if (el?.querySelector(`[data-card-id="${id}"]`) == null) throw new Error(`卡片未渲染: ${id}`)
  })
}

async function deleteCard(id: string): Promise<void> {
  await waitForCard(id)
  tap(el!.querySelector<HTMLElement>(`[data-card-id="${id}"]`)!, { x: 30, y: 30 })
  fireEvent.click(await screen.findByLabelText('卡片菜单'))
  fireEvent.click(screen.getByText('删除'))
  fireEvent.click(screen.getByText('确认删除'))
  await settle(80)
}

/** 撕下回执独有的把手：非警报便签上的动作按钮（与「再试」回执相区分）。 */
const undoToast = (): Element | null => el?.querySelector('.bj-toast:not(.bj-toast-alert) .bj-toast-action') ?? null
const undoText = (): string =>
  [...(el?.querySelectorAll('.bj-toast') ?? [])].find((t) => !t.classList.contains('bj-toast-alert'))?.textContent ?? ''

beforeEach(() => {
  seam = makeMockApp()
})
afterEach(() => {
  cleanup()
  window.location.hash = ''
})

describe('撕下的便签（文案即产品：发丝边、不警报）', () => {
  it('given 确认删除 when 撕下单卡 then 便签「已撕下 1 张，再想想」且卡从纸上消失', async () => {
    openDay([card('un-1', '独张')])
    await deleteCard('un-1')
    expect(el?.querySelector('[data-card-id="un-1"]')).toBeNull()
    await waitFor(() => expect(undoToast()).not.toBeNull())
    expect(undoText()).toBe('已撕下 1 张，再想想')
    expect(el?.querySelector('.bj-toast-alert')).toBeNull() // 行动回执不是警报
  })

  it('given 容器带两张子卡 when 撕下 then 级联全记、文面报总数「已撕下 3 张，再想想」', async () => {
    const kid1 = card('un-k1', '子一')
    const kid2 = card('un-k2', '子二')
    const box = containerCard([kid1.id, kid2.id], { id: cid('un-b'), props: {} })
    openDay([box, kid1, kid2])
    await deleteCard('un-b')
    await waitFor(() => expect(undoToast()).not.toBeNull())
    expect(undoText()).toBe('已撕下 3 张，再想想')
  })
})

describe('再想想（串行往返：快照先于缝、逐字回位、单级顶替）', () => {
  it('given 撕下 when 按「再想想」then restoreCards 收到删除前快照、卡回到原 pos/size 且 id/时间戳逐字未重生', async () => {
    const victim = card('u-1', '回来吧')
    const witness = card('u-w', '旁观')
    const parent = containerCard([victim.id, witness.id], { id: cid('u-p'), props: {}, pos: { x: 400, y: 400 } })
    openDay([parent, victim, witness])
    await deleteCard('u-1')
    await waitFor(() => expect(undoToast()).not.toBeNull())
    // prune-at-delete-commit：幸存父卡的剥离意图与撕下同批发车（同一条 debounce 串行链）——窗过之后，悬空引用不入档。
    await settle(550)
    expect(seam.journals.get(DAY)?.cards.find((c) => c.id === parent.id)?.children).toEqual([witness.id])
    vi.mocked(seam.app.restoreCards).mockClear()
    fireEvent.click(undoToast()!)
    await settle(80)
    const calls = vi.mocked(seam.app.restoreCards).mock.calls
    expect(calls).toHaveLength(1)
    const [date, snapshot] = calls[0] ?? []
    expect(date).toBe(DAY)
    const back = snapshot?.cards.find((c) => c.id === victim.id)
    expect(back).toBeDefined()
    if (back === undefined) throw new Error('快照里没有撕下的卡')
    const { z: _backZ, ...restBack } = back
    const { z: _wantZ, ...verbatim } = victim // 点选抬起过 z；其余（时间戳/位置/尺寸/props）必须逐字
    expect(restBack).toEqual(verbatim)
    expect(snapshot?.parentPatches).toEqual([{ parentId: parent.id, childId: victim.id, index: 0 }])
    // 回到纸面：同一块 DOM 重新挂出，几何原样
    const node = el?.querySelector<HTMLElement>(`[data-card-id="${victim.id}"]`)
    expect(node).not.toBeNull()
    expect(node?.style.left).toBe('10px')
    expect(node?.style.top).toBe('20px')
    expect(node?.style.width).toBe('240px')
    expect(seam.journals.get(DAY)?.cards.find((c) => c.id === victim.id)).toBeDefined()
    // 剥离之后撤销照旧逐字：parentPatches 按记录 index 重插，删除圈的账平了。
    expect(seam.journals.get(DAY)?.cards.find((c) => c.id === parent.id)?.children).toEqual([victim.id, witness.id])
  })

  it('given 撕的是居中那张 when 剥离过缝后按「再想想」then 按记录 index=1 精确回位：UI 内存与库内同数同席（贴尾/抢头皆错）', async () => {
    const first = card('mi-1', '先')
    const victim = card('mi-2', '居中之纸')
    const last = card('mi-3', '后')
    const parent = containerCard([first.id, victim.id, last.id], { id: cid('mi-p'), props: {}, pos: { x: 620, y: 620 } })
    openDay([parent, first, victim, last])
    await deleteCard('mi-2')
    await waitFor(() => expect(undoToast()).not.toBeNull())
    await settle(550)
    // 剥离同批过缝：居中幽灵即刻请走，库与 UI 内存（小注）同数
    expect(seam.journals.get(DAY)?.cards.find((c) => c.id === parent.id)?.children).toEqual([first.id, last.id])
    expect(el?.querySelector('.bj-card.be-container .bj-stack-note')?.textContent).toBe('2 张')
    vi.mocked(seam.app.restoreCards).mockClear()
    fireEvent.click(undoToast()!)
    await settle(80)
    // 快照记的是出生席位（index 1），不是尾巴也不是头
    expect(vi.mocked(seam.app.restoreCards).mock.calls[0]?.[1]?.parentPatches).toEqual([{ parentId: parent.id, childId: victim.id, index: 1 }])
    expect(seam.journals.get(DAY)?.cards.find((c) => c.id === parent.id)?.children).toEqual([first.id, victim.id, last.id])
    expect(el?.querySelector('[data-card-id="mi-2"]')).not.toBeNull()
    // reducer 的 cards/restored 也按 record 席位回填 UI 内存（dayState 与 restoreCards 同一把尺）
    expect(el?.querySelector('.bj-card.be-container .bj-stack-note')?.textContent).toBe('3 张')
  })

  it('given 缝开火 when deleteCardCascade 被调用的当拍 then 纸面仍挂着将被撕的卡（快照摄于乐观移除之前）', async () => {
    openDay([card('u-2', '趁还在')])
    await waitForCard('u-2')
    const original = vi.mocked(seam.app.deleteCardCascade).getMockImplementation()
    if (original === undefined) throw new Error('mock 实现丢失')
    const seen: string[] = []
    vi.mocked(seam.app.deleteCardCascade).mockImplementation(async (date, id) => {
      // 链上异步执行到此：cards/removed 尚未 dispatch，纸面必须还完整
      if (el?.querySelector('[data-card-id="u-2"]') !== null) seen.push('alive-at-seam')
      await original(date, id)
    })
    await deleteCard('u-2')
    expect(seen).toEqual(['alive-at-seam'])
    expect(seam.app.deleteCardCascade).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(undoToast()).not.toBeNull()) // 缝之后才撤托盘，不乱序
  })

  it('given 已有一张待撤 when 再撕第二张 then 新撕顶替旧承诺、旧卡从此不可撤', async () => {
    openDay([card('u-3', '先撕'), card('u-4', '后撕')])
    await deleteCard('u-3')
    await waitFor(() => expect(undoToast()).not.toBeNull())
    vi.mocked(seam.app.restoreCards).mockClear()
    await deleteCard('u-4')
    await waitFor(() => expect(undoToast()).not.toBeNull())
    expect(undoText()).toBe('已撕下 1 张，再想想')
    fireEvent.click(undoToast()!)
    await settle(80)
    const calls = vi.mocked(seam.app.restoreCards).mock.calls
    expect(calls).toHaveLength(1)
    expect(calls[0]?.[1]?.cards.map((c) => c.id)).toEqual(['u-4'])
    expect(seam.journals.get(DAY)?.cards.map((c) => c.id)).toEqual(['u-4'])
    expect(el?.querySelector('[data-card-id="u-3"]')).toBeNull() // 被顶掉的旧承诺不再复活
  })

  it('given 保存失败回执挂着 when 撕下另一张 then 两张便签各居其位（发丝边+温赭边，不堆墙）', async () => {
    openDay([card('u-5', '将撕'), card('u-6', '难存')])
    await deleteCard('u-5')
    await waitFor(() => expect(undoToast()).not.toBeNull())
    const read = await waitFor(() => {
      const q = el?.querySelector<HTMLElement>(`[data-card-id="u-6"] .bj-text-read`)
      if (q == null) throw new Error('没有阅读态')
      return q
    })
    fireEvent.dblClick(read)
    const ta = await waitFor(() => {
      const q = el?.querySelector<HTMLTextAreaElement>(`[data-card-id="u-6"] textarea`)
      if (q == null) throw new Error('没有编辑框')
      return q
    })
    vi.mocked(seam.app.updateCard).mockRejectedValueOnce(new Error('boom'))
    fireEvent.change(ta, { target: { value: '存不上的字' } })
    fireEvent.blur(ta)
    await settle()
    const toasts = el?.querySelectorAll('.bj-toast') ?? []
    expect(toasts).toHaveLength(2)
    expect(el?.querySelector('.bj-toast-alert')?.textContent).toContain('没存上')
    expect(undoText()).toBe('已撕下 1 张，再想想')
    expect(el?.querySelector('.bj-toast-up2')).toBeNull() // 至多两张，绝不叠墙
  })
})

describe('快照簿记（undoSnapshot 纯函数）', () => {
  it('cards 逐字深拷贝：调用之后再改原数组也不污染快照', () => {
    const solo = card('s-1', '原样')
    const doomed = new Set<CardId>([solo.id])
    const { snapshot } = buildDeleteSnapshot([solo], doomed)
    solo.pos = { x: 999, y: 999 }
    ;(solo.props as { text: string }).text = '被改了'
    expect(snapshot.cards[0]?.pos).toEqual({ x: 10, y: 20 })
    expect(snapshot.cards[0]?.props).toEqual({ text: '原样', format: 'plain' })
    expect(snapshot.cards[0]?.z).toBe(7.5)
    expect(snapshot.cards[0]?.id).toBe(solo.id)
  })

  it('幸存父卡按 children[] 原 index 记录悬空引用；无引用的幸存卡不入账', () => {
    const a = card('s-a', '甲')
    const b = card('s-b', '乙')
    const doomedB = card('s-doom', '将死')
    const parent = containerCard([a.id], { id: cid('s-p'), props: {} })
    const refHolder = containerCard([doomedB.id, b.id], { id: cid('s-q'), props: {} })
    const { doomed, snapshot } = buildDeleteSnapshot([parent, refHolder, a, b, doomedB], new Set<CardId>([doomedB.id]))
    expect(doomed).toEqual(['s-doom'])
    expect(snapshot.cards.map((c) => c.id)).toEqual(['s-doom'])
    expect(snapshot.parentPatches).toEqual([{ parentId: refHolder.id, childId: doomedB.id, index: 0 }])
  })

  it('stripDoomedRefs：幸存父卡的 doomed 引用同批滤净；不沾引用的卡原引用交出（diff 零误伤）；删卡本身不归它管', () => {
    const kid = card('sr-k', '将死')
    const keep = card('sr-w', '另存')
    const holder = containerCard([kid.id, keep.id], { id: cid('sr-p'), props: {} })
    const plain = card('sr-o', '素纸')
    const out = stripDoomedRefs([holder, plain, kid, keep], new Set<CardId>([kid.id]))
    expect(out.find((c) => c.id === cid('sr-p'))?.children).toEqual([keep.id])
    expect(out.find((c) => c.id === cid('sr-o'))).toBe(plain)
    expect(out.some((c) => c.id === kid.id)).toBe(true) // 级联删卡归 deleteCardCascade，滤引用归这把尺
  })
})
