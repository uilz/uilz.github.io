import type { Card, CardId, JournalDoc } from '../src/domain/types'

// 测试夹具：一次构造调用产出一张合法卡片/一份合法文档，测试保持单行可读。

let seq = 0
export function tid(label = 'c'): CardId {
  return `${label}#${String(++seq)}` as CardId
}

export function isoAt(ms = 0): string {
  return new Date(Date.UTC(2026, 0, 15, 8, 0, 0) + ms).toISOString()
}

export function baseCard(): Card {
  return {
    id: tid(),
    kind: 'text',
    pos: { x: 0, y: 0 },
    size: { w: 120, h: 60 },
    props: { text: 'hello' },
    createdAt: isoAt(0),
    updatedAt: isoAt(0),
  }
}

export function makeCard(over: Partial<Card> = {}): Card {
  return { ...structuredClone(baseCard()), ...over }
}

export function textCard(text: string, over: Partial<Card> = {}): Card {
  return makeCard({ props: { text }, ...over })
}

export function containerCard(children: CardId[], over: Partial<Card> = {}): Card {
  return makeCard({ kind: 'container', props: {}, children, ...over })
}

export function imageCard(hash: string, over: Partial<Card> = {}): Card {
  return makeCard({ kind: 'image', props: { hash }, ...over })
}

export function fileCard(hash: string, over: Partial<Card> = {}): Card {
  return makeCard({ kind: 'file', props: { hash }, ...over })
}

export function mysteryCard(props: Record<string, unknown>, over: Partial<Card> = {}): Card {
  return makeCard({ kind: 'mystery', props, ...over })
}

export function doc(date: string, cards: Card[], updatedAt = isoAt(1)): JournalDoc {
  return { date, cards, updatedAt }
}

export const T0 = '2026-01-15'
export const T1 = '2026-01-16'

/** 64 位小写十六进制串（按种子确定性生成，供伪造 hash 引用）。 */
export function fakeHex64(seed: number): string {
  return seed.toString(16).padStart(64, '0')
}
