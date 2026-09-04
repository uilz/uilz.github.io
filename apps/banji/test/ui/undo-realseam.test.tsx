// @vitest-environment jsdom
// 经真应用缝（createBanjiApp + fake-indexeddb）走一遍 UI 删除→再想想：
// 写回必须逐字（id/时间戳/props/pos/size/children 引用一项不重生），只 bump 文档 updatedAt。
// 缝自身的五Invariant（幂等/钳制/建档/校验拒垃圾）已由 application.test.ts 钉死，此处不重复。
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { App } from '../../src/ui/App'
import { createBanjiApp } from '../../src/application'
import { deleteDatabase, openRepo } from '../../src/repository/repo'
import type { Repo } from '../../src/repository/types'
import { tap } from './pointer'
import { containerCard, isoAt, textCard, tid } from '../helpers'
import type { Card, CardId } from '../../src/domain/types'

const DAY = '2026-01-15'
const FIXED_NOW = new Date(Date.UTC(2026, 0, 15, 9, 0, 0))
const settle = async (ms = 620): Promise<void> => await new Promise((r) => setTimeout(r, ms))

let seq = 0
let repo: Repo
let dbName: string

const cid = (v: string): CardId => v as CardId
const stripZ = (c: Card): Card => {
  const copy = structuredClone(c)
  delete copy.z
  return copy
}

beforeEach(async () => {
  dbName = `banji-undo-seam-${String(++seq)}`
  repo = await openRepo({ name: dbName })
})
afterEach(async () => {
  cleanup()
  window.location.hash = ''
  repo.close()
  await deleteDatabase(dbName)
})

describe('撕下→再想想 过真缝（唯一数据门）', () => {
  it('given 库内带幸存父引用的三卡 when UI 删除→点「再想想」then 库文档逐字复活且 updatedAt 只认注入时钟', async () => {
    const victim = textCard('过缝的纸', { id: tid('rs-v'), pos: { x: 33, y: 77 }, size: { w: 210, h: 90 }, props: { text: '过缝的纸', format: 'md' } })
    const parent = containerCard([victim.id], { id: tid('rs-p'), pos: { x: 500, y: 20 } })
    const other = textCard('无恙', { id: tid('rs-o') })
    const original = [victim, parent, other]
    await repo.journals.put({ date: DAY, cards: structuredClone(original), updatedAt: isoAt(0) })

    const app = createBanjiApp(repo, { now: () => FIXED_NOW })
    window.location.hash = `#/d/${DAY}`
    const el = render(<App app={app} initialTheme="light" now={() => FIXED_NOW} />).container
    await waitFor(() => {
      if (el.querySelector(`[data-card-id="${victim.id}"]`) == null) throw new Error('卡未从真库挂出')
    })

    tap(el.querySelector<HTMLElement>(`[data-card-id="${victim.id}"]`)!, { x: 30, y: 30 })
    fireEvent.click(await screen.findByLabelText('卡片菜单'))
    fireEvent.click(screen.getByText('删除'))
    fireEvent.click(screen.getByText('确认删除'))
    await waitFor(() => {
      if (el.querySelector('.bj-toast') == null) throw new Error('便签没出现')
    })
    expect(el.querySelector('.bj-toast')?.textContent).toBe('已撕下 1 张，再想想')
    expect((await repo.journals.get(DAY))?.cards.map((c) => c.id)).not.toContain(victim.id)

    fireEvent.click(el.querySelector<HTMLElement>('.bj-toast .bj-toast-action')!)
    await settle(300)

    const after = await repo.journals.get(DAY)
    if (after === undefined) throw new Error('文档没了')
    expect(after.updatedAt).toBe(FIXED_NOW.toISOString())
    expect(after.cards.map((c) => c.id).sort()).toEqual(original.map((c) => c.id).sort())
    // 逐字：pos/size/props/kind/时间戳全等；z 只要求点选抬举后的值一致可查（抬举本身过 updateCard）
    expect(after.cards.map(stripZ).sort((a, b) => a.id.localeCompare(b.id))).toEqual(
      original.map(stripZ).sort((a, b) => a.id.localeCompare(b.id)),
    )
    const back = after.cards.find((c) => c.id === victim.id)
    expect(back?.createdAt).toBe(victim.createdAt)
    expect(back?.updatedAt).toBe(victim.updatedAt)
    expect(after.cards.find((c) => c.id === parent.id)?.children).toEqual([victim.id])
    // 复活后继续可编辑：纸不是标本
    const patched = await app.updateCard(DAY, victim.id, { props: { text: '又写了字' } })
    expect(patched.props).toEqual({ text: '又写了字' })
  })
})
