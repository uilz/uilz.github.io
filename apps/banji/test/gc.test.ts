import { describe, expect, it } from 'vitest'
import { cardsByIdOf, collectCardHashRefs, collectReachableHashes, collectSubtreeIds } from '../src/domain/gc'
import { isUuidV7Shape, newCardId } from '../src/domain/id'
import { containerCard, fakeHex64, fileCard, imageCard, makeCard, textCard, tid } from './helpers'

describe('gc: props 泛型 hash 引用收集', () => {
  it('文本/未知结构里的 hash 键都算引用', () => {
    const known = fakeHex64(1)
    const nested = fakeHex64(2)
    expect(collectCardHashRefs(textCard('x').props)).toEqual(new Set())
    expect(collectCardHashRefs(imageCard(known).props)).toEqual(new Set([known]))
    const weird = { items: [{ hash: nested }, 'hash', { hash: fakeHex64(99) }, { hash: 'short' }] }
    const got = collectCardHashRefs(weird)
    expect([...got].sort()).toEqual([nested, fakeHex64(99)].sort())
  })

  it('大写 hex 不算引用（冻结的小写约定）', () => {
    expect(collectCardHashRefs({ hash: 'DEADBEEF'.padStart(64, '0') })).toEqual(new Set())
  })

  it('未知 kind 的容器子树与 hash 一并可达', () => {
    const kid = tid('k')
    const childHash = fakeHex64(7)
    const parent = makeCard({
      kind: 'container',
      children: [kid],
      props: { groups: [{ hash: fakeHex64(8) }] },
    })
    const all = collectReachableHashes([
      parent,
      textCard('n', { id: kid }),
      imageCard(childHash, { id: tid('i') }),
    ])
    expect(all).toEqual(new Set([fakeHex64(8), childHash]))
  })

  it('collectSubtreeIds 含自身、递归子级、对环安全', () => {
    const a = tid('a')
    const b = tid('b')
    const c = tid('c')
    const cards = [containerCard([b], { id: a }), containerCard([c, a], { id: b }), textCard('leaf', { id: c })]
    const byA = collectSubtreeIds(cardsByIdOf(cards), a)
    expect([...byA].sort()).toEqual([a, b, c].sort())
    expect([...collectSubtreeIds(cardsByIdOf(cards), c)]).toEqual([c])
  })

  it('makeCard 与断言辅助保持一致（防止夹具漂移）', () => {
    expect(makeCard({ kind: 'container', children: [] }).children).toEqual([])
    expect(fileCard(fakeHex64(5)).kind).toBe('file')
  })
})

describe('id: uuid v7', () => {
  it('newCardId 产出 v7 形状且互不相同', () => {
    const ids = new Set([newCardId(), newCardId(), newCardId()])
    expect(ids.size).toBe(3)
    for (const id of ids) expect(isUuidV7Shape(id)).toBe(true)
  })
})
