import { describe, expect, it } from 'vitest'
import {
  containerIssues,
  validateArchiveSetting,
  validateCard,
  validateEdge,
  validateJournalDoc,
  validateSettingsRecord,
} from '../src/domain/validate'
import { containerCard, doc, fileCard, isoAt, makeCard, mysteryCard, textCard, tid } from './helpers'

const codesOf = (v: ReturnType<typeof validateJournalDoc>): string[] =>
  v.ok ? [] : v.issues.map((i) => i.code)

describe('validate: 卡片', () => {
  it('形状齐全的卡通过', () => {
    expect(validateCard(textCard('hi'))).toEqual({ ok: true })
    expect(validateCard(mysteryCard({ anything: [1, 2, 'x'] }, { z: 2.5 }))).toEqual({ ok: true })
  })

  it('未知 kind / 小数 z / 缺省可选字段都合法', () => {
    expect(validateCard(makeCard({ kind: 'brand_new_kind', z: 0.125, rot: 0.5 }))).toEqual({ ok: true })
  })

  it('拒绝：非对象、缺 props、pos 坏、空 id', () => {
    expect(codesOf(validateCard('nope'))).toContain('card.not_object')
    const noProps = { ...structuredClone(makeCard()) } as Record<string, unknown>
    delete noProps['props']
    expect(codesOf(validateCard(noProps))).toContain('card.props')
    expect(codesOf(validateCard(makeCard({ pos: { x: NaN, y: 0 } })))).toContain('card.pos')
    const badId = { ...structuredClone(makeCard()), id: '' }
    expect(codesOf(validateCard(badId))).toContain('card.id')
    const badTime = { ...structuredClone(makeCard()), updatedAt: '昨天' }
    expect(codesOf(validateCard(badTime))).toContain('card.updatedAt')
  })
})

describe('validate: 日志文档', () => {
  it('合法文档通过；空卡列表也合法', () => {
    expect(validateJournalDoc(doc('2026-01-15', []))).toEqual({ ok: true })
    expect(validateJournalDoc(doc('2026-01-15', [textCard('a'), fileCard('f'.padStart(64, '0'))]))).toEqual({ ok: true })
  })

  it('拒绝：畸形日期', () => {
    const v = validateJournalDoc({ date: '2026-1-15', cards: [], updatedAt: isoAt() })
    expect(codesOf(v)).toContain('journal.date')
  })

  it('拒绝：文档内重复 id', () => {
    const same = tid('dup')
    const v = validateJournalDoc(doc('2026-01-15', [textCard('a', { id: same }), textCard('b', { id: same })]))
    expect(codesOf(v)).toContain('journal.duplicate_id')
  })

  it('拒绝：children 引用缺失、双父认领、环', () => {
    const ghost = tid('ghost')
    expect(codesOf(validateJournalDoc(doc('2026-01-15', [containerCard([ghost])])))).toContain('journal.child_missing')
    const kid = tid('kid')
    const twoParents = validateJournalDoc(doc('2026-01-15', [textCard('k', { id: kid }), containerCard([kid]), containerCard([kid])]))
    expect(codesOf(twoParents)).toContain('container.duplicate_parent')
    const a = tid('a')
    const b = tid('b')
    const cycle = validateJournalDoc(doc('2026-01-15', [containerCard([b], { id: a }), containerCard([a], { id: b })]))
    expect(codesOf(cycle)).toContain('container.cycle')
  })

  it('containerIssues 对无环森林不误报', () => {
    const kid = tid('kid')
    const cards = [textCard('k', { id: kid }), containerCard([kid]), makeCard()]
    expect(containerIssues(cards, 'x')).toEqual([])
  })

  it('未知 kind 卡片在文档校验中原样通过（props 不检查语义）', () => {
    const m = mysteryCard({ weird: { deep: [1, { hash: 'not-really-hex' }] } })
    expect(validateJournalDoc(doc('2026-01-15', [m]))).toEqual({ ok: true })
  })
})

describe('validate: 边与设置', () => {
  const goodEdge = {
    id: 'e1',
    source: tid('s'),
    target: tid('t'),
    createdAt: isoAt(),
    updatedAt: isoAt(),
  }
  it('合法边通过；role 可选', () => {
    expect(validateEdge(goodEdge)).toEqual({ ok: true })
    expect(validateEdge({ ...goodEdge, role: 'ref' })).toEqual({ ok: true })
  })
  it('拒绝：自环、缺 source、坏时间', () => {
    const loop = tid('same')
    expect(codesOf(validateEdge({ ...goodEdge, source: loop, target: loop }))).toContain('edge.self_loop')
    expect(codesOf(validateEdge({ ...goodEdge, source: '' }))).toContain('edge.source')
    const badTime = { ...structuredClone(goodEdge), createdAt: 5 }
    expect(codesOf(validateEdge(badTime))).toContain('edge.createdAt')
    expect(codesOf(validateEdge(null))).toContain('edge.not_object')
  })

  it('settings：记录带 updatedAt；归档条目只要求 key/value', () => {
    expect(validateSettingsRecord({ key: 'theme', value: { dark: true }, updatedAt: isoAt() })).toEqual({ ok: true })
    expect(codesOf(validateSettingsRecord({ key: '', value: 1, updatedAt: isoAt() }))).toContain('setting.key')
    expect(validateArchiveSetting({ key: 'theme', value: null })).toEqual({ ok: true })
    expect(codesOf(validateArchiveSetting({ key: 'k' }))).toContain('setting.value')
  })
})
