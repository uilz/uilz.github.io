// V2 Iter2·#3 首页消化账（domain/digest 纯函数）：摘录三口径、最新一笔、时间账、每日一角。
import { describe, expect, it } from 'vitest'
import {
  dayDigest,
  dayMarksOf,
  journalStatsOf,
  kindWhisper,
  recentOf,
} from '../src/domain/digest'
import type { JournalDoc } from '../src/domain/types'
import { doc, imageCard, makeCard, textCard, tid } from './helpers'

describe('digest: dayDigest 摘录三口径（正文 → 题签 → 型别耳语）', () => {
  it('空日（无档 / 空卡集）：count 0、摘录与时间戳缺席', () => {
    expect(dayDigest(undefined)).toEqual({ count: 0, excerpt: null, newestAt: null })
    expect(dayDigest(doc('2026-01-15', []))).toEqual({ count: 0, excerpt: null, newestAt: null })
  })

  it('正文优先：最新一笔的 text 只取首行', () => {
    const d = doc('2026-01-15', [textCard('雨后。楼下槐花开了。\n第二行不算数', { updatedAt: 'x1' })])
    expect(dayDigest(d)).toEqual({ count: 1, excerpt: { text: '雨后。楼下槐花开了。', source: 'text' }, newestAt: 'x1' })
  })

  it('最新一笔按 updatedAt 挑（新纸盖旧纸），并列再按 createdAt、id 定序', () => {
    const old = textCard('旧的正文', { updatedAt: '2026-01-01T00:00:00.000Z' })
    const fresh = makeCard({ kind: 'image', props: { hash: 'h', name: '雨后槐花' }, updatedAt: '2026-01-02T00:00:00.000Z' })
    const d = doc('2026-01-15', [fresh, old])
    const g = dayDigest(d)
    expect(g.newestAt).toBe('2026-01-02T00:00:00.000Z')
    expect(g.excerpt).toEqual({ text: '雨后槐花', source: 'name' })
    const tied = [
      makeCard({ kind: 'text', props: { text: '' }, id: tid('b'), updatedAt: 'T', createdAt: 'C1' }),
      makeCard({ kind: 'text', props: { text: '' }, id: tid('a'), updatedAt: 'T', createdAt: 'C2' }),
    ]
    expect(dayDigest(doc('2026-01-15', tied)).newestAt).toBe('T')
    const byId = [
      makeCard({ kind: 'image', props: { name: '甲' }, id: tid('a'), updatedAt: 'T', createdAt: 'C' }),
      makeCard({ kind: 'image', props: { name: '乙' }, id: tid('b'), updatedAt: 'T', createdAt: 'C' }),
    ]
    expect(dayDigest(doc('2026-01-15', byId)).excerpt?.text).toBe('乙')
  })

  it('无名图片落型别耳语；题签纸的 title 也算题面', () => {
    expect(dayDigest(doc('2026-01-15', [imageCard('h', { updatedAt: 'u' })])).excerpt).toEqual({ text: '夹了一张照片', source: 'kind' })
    const link = makeCard({ kind: 'link', props: { url: 'https://example.com', title: '半页网站' }, updatedAt: 'u' })
    expect(dayDigest(doc('2026-01-15', [link])).excerpt).toEqual({ text: '半页网站', source: 'name' })
  })

  it('垫纸不是落笔：最新是容器时摘旧正文；整日只有容器则无摘录', () => {
    const text = textCard('正文在旧纸上', { updatedAt: '2026-01-01T00:00:00.000Z' })
    const mat = makeCard({ kind: 'container', props: {}, updatedAt: '2026-01-05T00:00:00.000Z' })
    const g = dayDigest(doc('2026-01-15', [text, mat]))
    expect(g.count).toBe(2)
    expect(g.excerpt).toEqual({ text: '正文在旧纸上', source: 'text' })
    const only = dayDigest(doc('2026-01-15', [mat]))
    expect(only.count).toBe(1)
    expect(only.excerpt).toBeNull()
  })

  it('畸形 props 不炸：非对象/空白正文各落各的兜底', () => {
    expect(dayDigest(doc('2026-01-15', [makeCard({ props: null as unknown as object, updatedAt: 'u' })])).excerpt?.source).toBe('kind')
    expect(dayDigest(doc('2026-01-15', [textCard('   ', { updatedAt: 'u' })])).excerpt).toEqual({ text: '添了一张白纸', source: 'kind' })
  })

  it('kindWhisper 各型有人话、容器无话、未知型保守', () => {
    expect(kindWhisper('image')).toBe('夹了一张照片')
    expect(kindWhisper('audio')).toBe('存了一段声音')
    expect(kindWhisper('container')).toBeNull()
    expect(kindWhisper('mystery')).toBe('夹了一张纸')
  })
})

describe('digest: 整册账（时间账 / 上次落笔 / 每日一角）', () => {
  const days: JournalDoc[] = [
    doc('2026-01-03', [textCard('三号的纸')]),
    doc('2026-01-02', [imageCard('h'), textCard('二号的字')]),
    doc('2026-01-05', []),
    doc('2025-12-28', [textCard('旧册')]),
  ]

  it('journalStatsOf：有纸天数 + 最后一日（空文档不计）', () => {
    expect(journalStatsOf(days)).toEqual({ totalDays: 3, lastDate: '2026-01-03' })
    expect(journalStatsOf([doc('2026-01-05', [])])).toEqual({ totalDays: 0, lastDate: null })
  })

  it('recentOf：最晚有纸之日的全账；全空为 null', () => {
    const r = recentOf(days)
    expect(r?.date).toBe('2026-01-03')
    expect(r?.count).toBe(1)
    expect(r?.excerpt).toEqual({ text: '三号的纸', source: 'text' })
    expect(recentOf([])).toBeNull()
    expect(recentOf([doc('2026-01-01', [])])).toBeNull()
  })

  it('dayMarksOf：升序每日一角，贴过照的挂折角旗（空文档出局）', () => {
    expect(dayMarksOf(days)).toEqual([
      { date: '2025-12-28', count: 1, hasImage: false },
      { date: '2026-01-02', count: 2, hasImage: true },
      { date: '2026-01-03', count: 1, hasImage: false },
    ])
  })
})
