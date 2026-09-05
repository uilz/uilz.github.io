// 搜索内核（R8·D2）：大小写不敏感子串、rank=首行>后行/链接>资产名、并列 createdAt 降、
// snippet ±40 + 省略号 + [start,end) 码元下标（CJK 直接钉死）、cap 50、空白查询恒空。
// 纯函数、零 I/O——语料用手搭 CardAt[] + AssetMeta[]，容器孩子平摊输入即自成一行。
import { describe, expect, it } from 'vitest'
import { searchCards, type AssetMeta, type CardRow } from '../src/domain/search'
import type { CardId, Card } from '../src/domain/types'
import { isoAt } from './helpers'

const cid = (v: string): CardId => v as CardId

function card(id: string, over: Partial<Card> = {}): Card {
  return {
    id: cid(id),
    kind: 'text',
    pos: { x: 0, y: 0 },
    size: { w: 100, h: 60 },
    props: { text: '' },
    createdAt: isoAt(0),
    updatedAt: isoAt(0),
    ...over,
  }
}

const row = (date: string, c: Card): CardRow => ({ date, card: c })

function meta(hash: string, name: string): AssetMeta {
  return { hash, name, mime: 'image/png', size: 1 }
}

describe('searchCards：匹配语料', () => {
  it('英文大小写不敏感子串', () => {
    const hits = searchCards([row('2026-01-10', card('a', { props: { text: 'Hello World' } }))], [], 'wORL')
    expect(hits).toHaveLength(1)
    const h = hits[0]!
    expect(h.snippet.slice(h.start, h.end)).toBe('Worl')
  })

  it('中文（CJK）子串天然成立', () => {
    const hits = searchCards([row('2026-01-10', card('a', { props: { text: '雨后。楼下槐花开了。' } }))], [], '槐花')
    expect(hits).toHaveLength(1)
    expect(hits[0]?.snippet.slice(hits[0]!.start, hits[0]!.end)).toBe('槐花')
  })

  it('markdown/code kind 的 props.text 同被搜索（按字段不按 kind）', () => {
    const rows = [row('2026-01-10', card('md', { kind: 'markdown', props: { text: '### 标题行' } }))]
    expect(searchCards(rows, [], '标题')).toHaveLength(1)
  })

  it('link 的 props.url 是语料', () => {
    const rows = [row('2026-01-10', card('lk', { kind: 'link', props: { url: 'https://example.com/notes' } }))]
    const hits = searchCards(rows, [], 'EXAMPLE')
    expect(hits[0]?.field).toBe('link')
  })

  it('image/file 经 hash 联结资产名命中', () => {
    const rows = [row('2026-01-10', card('img', { kind: 'image', props: { hash: 'aa' } }))]
    const names = searchCards(rows, [meta('aa', '槐花特写.png')], '槐花')
    expect(names).toHaveLength(1)
    expect(names[0]?.field).toBe('asset')
    expect(searchCards(rows, [meta('bb', '别的.png')], '槐花')).toHaveLength(0)
  })

  it('容器孩子作为独立卡各成一行（输入平摊，行指向孩子）', () => {
    const kid = card('kid', { props: { text: '藏在叠里的字' } })
    const mat = card('mat', { kind: 'container', props: {}, children: [kid.id] })
    const hits = searchCards([row('2026-01-10', mat), row('2026-01-10', kid)], [], '藏在')
    expect(hits.map((h) => h.cardId)).toEqual([cid('kid')])
  })
})

describe('searchCards：排名', () => {
  it('首行命中先于后行命中', () => {
    const first = card('top', { props: { text: '槐花在楼上\n楼下是别的' } })
    const later = card('late', { props: { text: '第一行无\n第二行有槐花' } })
    const hits = searchCards([row('2026-01-10', first), row('2026-01-10', later)], [], '槐花')
    expect(hits.map((h) => h.cardId)).toEqual([cid('top'), cid('late')])
    expect(hits.map((h) => h.rank)).toEqual([0, 1])
  })

  it('正文后行先于资产名（rank 1 < 2）', () => {
    const textHit = card('body', { props: { text: '头行\n次行槐花' } })
    const assetHit = card('att', { kind: 'image', props: { hash: 'aa' } })
    const hits = searchCards([row('2026-01-10', textHit), row('2026-01-10', assetHit)], [meta('aa', '槐花.png')], '槐花')
    expect(hits.map((h) => h.cardId)).toEqual([cid('body'), cid('att')])
  })

  it('一张卡正文与资产名都中时取正文行（体面的那次命中说话）', () => {
    const both = card('both', { kind: 'image', props: { hash: 'aa', text: '图注有槐花' } })
    const hits = searchCards([row('2026-01-10', both)], [meta('aa', '槐花.png')], '槐花')
    expect(hits[0]?.field).toBe('text')
    expect(hits[0]?.rank).toBe(0)
  })

  it('同 rank 并列按 createdAt 降序（新纸在前）', () => {
    const old = card('old', { props: { text: '槐花旧' }, createdAt: isoAt(1) })
    const fresh = card('new', { props: { text: '槐花新' }, createdAt: isoAt(2) })
    const hits = searchCards([row('2026-01-10', old), row('2026-01-10', fresh)], [], '槐花')
    expect(hits.map((h) => h.cardId)).toEqual([cid('new'), cid('old')])
  })

  it('createdAt 完全同刻再按 id 定序——排序是全序，结果可复现', () => {
    const a = card('a', { props: { text: '槐花' } })
    const b = card('b', { props: { text: '槐花' } })
    const one = searchCards([row('2026-01-10', a), row('2026-01-10', b)], [], '槐花').map((h) => h.cardId)
    const two = searchCards([row('2026-01-10', b), row('2026-01-10', a)], [], '槐花').map((h) => h.cardId)
    expect(one).toEqual([cid('a'), cid('b')])
    expect(two).toEqual(one)
  })
})

describe('searchCards：snippet 与高亮坐标', () => {
  const textOf = (n: number): string => 'x'.repeat(n) + '槐花'
  it('命中深处：前窗 40 码元 + 前省略号，高亮平移进 snippet 坐标系', () => {
    const hit = textOf(50)
    const hits = searchCards([row('2026-01-10', card('a', { props: { text: hit } }))], [], '槐花')
    const h = hits[0]!
    expect(h.snippet.startsWith('…')).toBe(true)
    expect(h.snippet.slice(h.start, h.end)).toBe('槐花')
    expect(h.snippet).toBe('…' + hit.slice(10))
  })

  it('短文本两头都不出省略号', () => {
    const h = searchCards([row('2026-01-10', card('a', { props: { text: '槐花开了' } }))], [], '槐花')[0]!
    expect(h.snippet).toBe('槐花开了')
    expect(h.snippet.slice(h.start, h.end)).toBe('槐花')
  })

  it('后窗满 40 才补尾省略号', () => {
    const tail = '槐花' + 'y'.repeat(40) + '终'
    const h = searchCards([row('2026-01-10', card('a', { props: { text: tail } }))], [], '槐花')[0]!
    expect(h.snippet.startsWith('槐花')).toBe(true)
    expect(h.snippet.endsWith('…')).toBe(true)
    expect(h.snippet.slice(h.start, h.end)).toBe('槐花')
  })

  it('多字节（CJK）下标与 slice 同一套码元坐标——逐字节钉死', () => {
    const src = '雨后。楼下槐花开了。'
    const h = searchCards([row('2026-01-10', card('a', { props: { text: src } }))], [], '楼下')[0]!
    expect(h.start).toBe(3)
    expect(h.end).toBe(5)
    expect(h.snippet.slice(h.start, h.end)).toBe('楼下')
  })

  it('英文命中按大小写原样展示（toLowerCase 不改展示），高亮覆盖原形', () => {
    const h = searchCards([row('2026-01-10', card('a', { props: { text: 'BanJi Journal' } }))], [], 'journal')[0]!
    expect(h.snippet.slice(h.start, h.end)).toBe('Journal')
  })
})

describe('searchCards：边界', () => {
  const many = (n: number): CardRow[] =>
    Array.from({ length: n }, (_, i) => row('2026-01-10', card(`c${String(i).padStart(3, '0')}`, { props: { text: `槐花第${String(i)}页` } })))

  it('结果封顶 50', () => {
    expect(searchCards(many(80), [], '槐花')).toHaveLength(50)
  })

  it('cap 可经 opts 覆写', () => {
    expect(searchCards(many(10), [], '槐花', { cap: 3 })).toHaveLength(3)
  })

  it('around 可覆写 snippet 窗宽', () => {
    const h = searchCards([row('2026-01-10', card('a', { props: { text: '一二三四槐花五六七八九十' } }))], [], '槐花', { around: 2 })[0]!
    expect(h.snippet).toBe('…三四槐花五六…')
    expect(h.snippet.slice(h.start, h.end)).toBe('槐花')
  })

  it('空查询与纯空白查询恒空', () => {
    const rows = many(3)
    expect(searchCards(rows, [], '')).toEqual([])
    expect(searchCards(rows, [], '   \n ')).toEqual([])
  })

  it('查询首尾空白被裁：「 槐花 」照常命中', () => {
    expect(searchCards(many(3), [], '槐 花')).toHaveLength(0)
    expect(searchCards(many(3), [], ' 槐花 ')).toHaveLength(3)
  })
})
