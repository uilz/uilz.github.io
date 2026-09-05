// @vitest-environment jsdom
// R10·债#5 提交屏障：导入 commit 走中介同一条串行链——「库中永不存谎言档案」第一次罩住导入本身。
// A 面（主证）：已开火卡在 app 层缝里的意图（updateCard 悬挂）——commit 必须等它落定在先（其写被
//   commit 整斧抹掉）、屏障排入后出队的意图弃权、ack 后绝无旧世界之笔能落在新宇宙上。
// B 面（失败复活）：commit 失败 = 旧世界还活着——被屏障弃权的意图逐笔复活重上链，一笔不吞、旧宇宙一字不换。
// R6 四面（ack 整斧作废）在 import-discard.test.tsx 原样重跑，一字未动。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { App } from '../../src/ui/App'
import type { CommitGate } from '../../src/application'
import type { MockSeam } from './mocks'
import { makeMockApp } from './mocks'
import { textCard } from '../helpers'
import type { Card, CardId, JournalDoc } from '../../src/domain/types'

const DAY = '2026-01-15'
const settle = (ms = 620): Promise<void> => new Promise((r) => setTimeout(r, ms))

let seam: MockSeam
let el: HTMLElement | null = null
let order: string[] = []

const cid = (v: string): CardId => v as CardId
const text = (id: string): Card => textCard(id, { id: cid(id), pos: { x: 20, y: 20 + Math.random() }, size: { w: 240, h: 150 }, props: { text: id, format: 'plain' } })

function openDay(cards: Card[]): void {
  seam.putDay(DAY, cards)
  window.location.hash = `#/d/${DAY}`
  el = render(<App app={seam.app} initialTheme="light" now={() => new Date(2026, 0, 15)} />).container
}

const dumpJournals = (): string => JSON.stringify([...seam.journals.entries()])
const updateCalls = (): number => vi.mocked(seam.app.updateCard).mock.calls.length

function requireGate(): CommitGate {
  const last = [...vi.mocked(seam.app.setCommitGate).mock.calls].reverse().find((c) => c[0] !== null)
  const gate = last?.[0]
  if (gate === undefined || gate === null) throw new Error('中介未注册 commit 门')
  return gate
}

/** commit 走真屏障（与 importArchive 阶段 3 同一扇门）：body 抛错 = commit_failed（同档案层语义）。 */
function barrierImport(archive: JournalDoc): void {
  vi.mocked(seam.app.importFromFile).mockImplementation(async () => {
    order.push('import-arrived')
    try {
      await requireGate()(async () => {
        order.push('commit')
        seam.journals.clear()
        seam.journals.set(archive.date, archive)
      })
      return { ok: true, stats: { journals: 1, cards: archive.cards.length, edges: 0, settings: 0, assets: 0 } }
    } catch {
      return { ok: false, reason: 'commit_failed', userMessage: '提交导入事务时出错，已整体回滚；你现有的日记保持导入原样。', detail: 'boom' }
    }
  })
}

/** 把 updateCard 的第一笔卡死在「已过链头闸口、事务未落定」的 app 层缝隙里（R6 最深测试同款开火台）。 */
function hangFirstUpdate(tag: string): () => void {
  let release = (): void => undefined
  const hanging = new Promise<void>((r) => {
    release = r
  })
  vi.mocked(seam.app.updateCard).mockImplementationOnce(async (date, id, patch) => {
    order.push(`${tag}:in-flight`)
    await hanging
    const doc = seam.journals.get(date)
    if (doc !== undefined) {
      const cards = doc.cards.map((c) => (c.id === id ? { ...c, ...patch, id: c.id, createdAt: c.createdAt } : c))
      seam.journals.set(date, { date, cards, updatedAt: doc.updatedAt })
    }
    order.push(`${tag}:landed`)
    return text(tag)
  })
  return release
}

async function waitForOrder(entry: string): Promise<void> {
  await waitFor(() => {
    if (order.indexOf(entry) === -1) throw new Error(`编排日志还没走到 ${entry}：${JSON.stringify(order)}`)
  })
}

function typeIntoCard(id: string, to: string): void {
  const node = el?.querySelector<HTMLElement>(`[data-card-id="${id}"]`)
  if (node == null) throw new Error(`卡片未渲染: ${id}`)
  const read = node.querySelector<HTMLElement>('.bj-text-read')
  if (read === null) throw new Error(`没有阅读态: ${id}`)
  fireEvent.dblClick(read)
  const ta = node.querySelector<HTMLTextAreaElement>('textarea')
  if (ta === null) throw new Error(`没有编辑框: ${id}`)
  fireEvent.change(ta, { target: { value: to } })
  fireEvent.blur(ta) // exitEdit → flushNow：这一笔即刻上链
}

/** 抽屉推过三道闸直到「确认替换」落手（不等 ack——ack 由屏障的放行时刻决定）。 */
async function clickImportToConfirm(): Promise<void> {
  fireEvent.click(el!.querySelector<HTMLElement>('.bj-day-head [aria-label="设置"]')!)
  const fileInput = document.querySelector<HTMLInputElement>('input.bj-hidden-file')
  if (fileInput === null) throw new Error('导入文件输入未挂出')
  fireEvent.change(fileInput, { target: { files: [new File(['archive'], 'backup.banjizip')] } })
  fireEvent.click(screen.getByText('继续'))
  fireEvent.click(screen.getByText('确认替换'))
}

beforeEach(() => {
  seam = makeMockApp()
  order = []
})
afterEach(() => {
  cleanup()
  window.location.hash = ''
})

describe('R10·债#5 导入 commit 走中介同一条链（提交屏障）', () => {
  it('A面 given 一笔 updateCard 卡在开火中途 when 导入 ack 经屏障 then commit 必等其落定（写被抹掉）、其后出队的意图弃权、库逐字=新宇宙', async () => {
    openDay([text('b-1'), text('b-2')])
    await waitFor(() => expect(el?.querySelector('[data-card-id="b-2"]')).not.toBeNull())
    const releaseVictim = hangFirstUpdate('b-1')
    typeIntoCard('b-1', '在途一笔')
    await waitForOrder('b-1:in-flight') // 链头已过、事务未落定——正是 R9 抓到的那一指宽
    barrierImport({ date: DAY, cards: [text('n-1')], updatedAt: '2026-02-01T00:00:00.000Z' })
    await clickImportToConfirm()
    await waitForOrder('import-arrived')
    // 屏障证据：commit 还在链上等挂死的那笔——旧世界此刻早已旁路开 commit 了。
    expect(order).toEqual(['b-1:in-flight', 'import-arrived'])
    typeIntoCard('b-2', 'ack 才排队的一笔') // 代数已是屏障后的：注定在 ack 时弃权（R6 口径）
    releaseVictim()
    await waitFor(() => {
      if (document.querySelector('.bj-confirm') !== null) throw new Error('ack 未放行')
    })
    // 落笔次序定死：在途者先落（其写随旧宇宙被 commit 抹掉），commit 在后，ack 前绝无第三笔。
    expect(order.filter((e) => e !== 'import-arrived')).toEqual(['b-1:in-flight', 'b-1:landed', 'commit'])
    expect(updateCalls()).toBe(1) // b-2 那笔连缝都没过（弃权），更谈不上落在新宇宙之后
    expect((seam.journals.get(DAY)?.cards.at(0)?.props as { text?: string } | undefined)?.text).toBe('n-1')
    const finalDump = dumpJournals()
    await settle(750) // 未弃权/未抹除的意图会在这 450ms 窗外现形
    expect(dumpJournals()).toBe(finalDump)
    expect(updateCalls()).toBe(1)
    expect(el?.querySelector('.bj-toast-alert')).toBeNull() // 复活账不欠、回执不谎
  })

  it('B面 given 开火中途+一笔已排链 when commit 失败 then 弃权者复活过缝、旧宇宙一字不换、失败人话上抽屉', async () => {
    openDay([text('c-1'), text('c-2')])
    await waitFor(() => expect(el?.querySelector('[data-card-id="c-2"]')).not.toBeNull())
    const releaseVictim = hangFirstUpdate('c-1')
    typeIntoCard('c-1', '开火的一笔')
    await waitForOrder('c-1:in-flight')
    typeIntoCard('c-2', '排链的一笔') // 屏障前出队：commit 若成则弃权被抹，若败则必须复活
    vi.mocked(seam.app.importFromFile).mockImplementation(async () => {
      order.push('import-arrived')
      try {
        await requireGate()(async () => {
          order.push('commit-fail')
          throw new Error('simulated commit abort')
        })
        return { ok: true, stats: { journals: 1, cards: 1, edges: 0, settings: 0, assets: 0 } }
      } catch {
        return { ok: false, reason: 'commit_failed', userMessage: '提交导入事务时出错，已整体回滚；你现有的日记保持导入原样。', detail: 'boom' }
      }
    })
    await clickImportToConfirm()
    await waitForOrder('import-arrived')
    releaseVictim()
    await waitFor(() => {
      if (!(el?.textContent ?? '').includes('提交导入事务时出错')) throw new Error('失败人话未上抽屉')
    })
    await waitFor(() => expect(updateCalls()).toBe(2)) // 在途落定 + 弃权复活（一笔不吞）
    const doc = seam.journals.get(DAY)
    expect(doc?.cards.map((c) => c.id)).toEqual([cid('c-1'), cid('c-2')]) // 宇宙未换
    expect((doc?.cards.at(0)?.props as { text?: string }).text).toBe('开火的一笔')
    expect((doc?.cards.at(1)?.props as { text?: string }).text).toBe('排链的一笔')
    const midDump = dumpJournals()
    await settle(750) // 复活无重影：不双写、不毒链
    expect(dumpJournals()).toBe(midDump)
    expect(updateCalls()).toBe(2)
    expect(el?.querySelector('.bj-toast-alert')).toBeNull()
  })

  it('C面 given 屏障成功 when 新宇宙落定后立刻编辑 then 队列不毒：新笔照常过缝落在档案宇宙上（只弃旧不毒新）', async () => {
    openDay([text('d-1')])
    await waitFor(() => expect(el?.querySelector('[data-card-id="d-1"]')).not.toBeNull())
    barrierImport({ date: DAY, cards: [text('m-1')], updatedAt: '2026-02-01T00:00:00.000Z' })
    await clickImportToConfirm()
    await waitFor(() => {
      if (document.querySelector('.bj-confirm') !== null) throw new Error('ack 未放行')
    })
    await waitFor(() => expect(el?.querySelector('[data-card-id="m-1"]')).not.toBeNull())
    typeIntoCard('m-1', '新宇宙第一笔')
    await settle(750)
    expect(updateCalls()).toBeGreaterThan(0)
    expect((seam.journals.get(DAY)?.cards.at(0)?.props as { text?: string }).text).toBe('新宇宙第一笔')
  })
})
