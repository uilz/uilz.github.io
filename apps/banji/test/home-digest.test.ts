// V2 Iter2·#3 首页缝的取数纪律：getHomeDigest 一次 journals.list() 交出四账——
// 每次进月历恰一读（loadAll 纪律），且 InvalidDate 入参照章拒收。
import { afterEach, describe, expect, it } from 'vitest'
import { deleteDatabase, openRepo } from '../src/repository/repo'
import type { Repo } from '../src/repository/types'
import { createBanjiApp, InvalidDateError } from '../src/application'
import { imageCard, textCard } from './helpers'

let seq = 0
const tracked: Array<() => Promise<void>> = []
afterEach(async () => {
  while (tracked.length > 0) await tracked.pop()?.()
})

const openTracked = async (): Promise<Repo> => {
  const name = `banji-home-${String(++seq)}`
  const repo = await openRepo({ name })
  tracked.push(async () => {
    repo.close()
    await deleteDatabase(name)
  })
  return repo
}

describe('application: getHomeDigest（首页一次读）', () => {
  it('恰一次 journals.list()：today/recent/stats/days 四账同源', async () => {
    const repo = await openTracked()
    const iso = new Date(Date.UTC(2026, 8, 14, 8)).toISOString()
    await repo.journals.put({ date: '2026-09-02', cards: [imageCard('h', { createdAt: iso, updatedAt: iso })], updatedAt: iso })
    await repo.journals.put({ date: '2026-09-14', cards: [textCard('今日正文', { createdAt: iso, updatedAt: iso }), textCard('另一张', { createdAt: iso, updatedAt: iso })], updatedAt: iso })
    let listCalls = 0
    let otherReads = 0
    const origList = repo.journals.list.bind(repo.journals)
    repo.journals.list = async () => {
      listCalls += 1
      return origList()
    }
    const origGet = repo.journals.get.bind(repo.journals)
    repo.journals.get = async (d) => {
      otherReads += 1
      return origGet(d)
    }
    const app = createBanjiApp(repo)
    const digest = await app.getHomeDigest('2026-09-14')
    expect(listCalls).toBe(1)
    expect(otherReads).toBe(0)
    expect(digest.today.count).toBe(2)
    expect(digest.recent?.date).toBe('2026-09-14')
    expect(digest.stats).toEqual({ totalDays: 2, lastDate: '2026-09-14' })
    expect(digest.days).toEqual([
      { date: '2026-09-02', count: 1, hasImage: true },
      { date: '2026-09-14', count: 2, hasImage: false },
    ])
  })

  it('非法 today 照章拒收（requireDate 唯一口径）', async () => {
    const repo = await openTracked()
    const app = createBanjiApp(repo)
    await expect(app.getHomeDigest('2026-9-14')).rejects.toBeInstanceOf(InvalidDateError)
  })
})
