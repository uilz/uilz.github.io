// V2 Iter2·#3 首页消化账 —— 「这是我的时间」的纯函数口径：今日面摘录、上次落笔、
// 时间账、每日一角（墨点/折角底料）。输入全是已过闸的域值（JournalDoc/Card），零 I/O；
// props 是 unknown：字段逐项窄化（parse, don't assert），绝不对卡片本体做断言。
import type { Card, CardKind, JournalDoc } from './types'

/** 一句摘录：来自哪一路（正文首行 / 题签名 / 型别耳语）。 */
export interface DayExcerpt {
  readonly text: string
  readonly source: 'text' | 'name' | 'kind'
}

/** 一天的账：几张纸、头一句、最新一笔的时间戳。空日 count=0、其余缺席。 */
export interface DayDigest {
  readonly count: number
  readonly excerpt: DayExcerpt | null
  readonly newestAt: string | null
}

/** 最近一个有纸的日子（日期即归属；「上次落笔 · M月D日」的那一笔）。 */
export interface RecentDigest extends DayDigest {
  readonly date: string
}

/** 时间账：整册记了多少天、最后一日记在哪天（无史为 null）。 */
export interface JournalStats {
  readonly totalDays: number
  readonly lastDate: string | null
}

/** 每日一角：墨点档位底料（张数）+ 是否贴过照片（折角底料）。 */
export interface DayMark {
  readonly date: string
  readonly count: number
  readonly hasImage: boolean
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null

const nonBlank = (v: unknown): string | null =>
  typeof v === 'string' && v.trim() !== '' ? v.trim() : null

/** 型别耳语：无名无正文的纸，替它说一句人话（纸语，非数据面板腔）。 */
export function kindWhisper(kind: CardKind): string | null {
  switch (kind) {
    case 'text':
      return '添了一张白纸'
    case 'markdown':
      return '写了一段手记'
    case 'code':
      return '留了几行代码'
    case 'image':
      return '夹了一张照片'
    case 'file':
      return '夹了一份文件'
    case 'audio':
      return '存了一段声音'
    case 'video':
      return '留了一段影像'
    case 'pdf':
      return '压了一页文书'
    case 'link':
      return '存了一张题签'
    case 'container':
      return null // 垫纸不是落笔
    default:
      return '夹了一张纸'
  }
}

/** 单纸摘录：正文首行 → 题签（纸面名/题面）→ 型别耳语。 */
function excerptOfCard(card: Card): DayExcerpt | null {
  const props = card.props
  if (isRecord(props)) {
    const text = nonBlank(props['text'])
    if (text !== null) {
      const line = (text.split('\n')[0] ?? '').trim()
      if (line !== '') return { text: line, source: 'text' }
    }
    const name = nonBlank(props['name']) ?? nonBlank(props['title'])
    if (name !== null) return { text: name, source: 'name' }
  }
  const whisper = kindWhisper(card.kind)
  return whisper === null ? null : { text: whisper, source: 'kind' }
}

/** 最新一笔（updatedAt 降序，ISO 字典序=历法序；并列看 createdAt，再按 id 定序）。垫纸不算落笔。 */
function newestStroke(cards: readonly Card[]): Card | null {
  let best: Card | null = null
  for (const card of cards) {
    if (card.kind === 'container') continue
    if (best === null || card.updatedAt > best.updatedAt) best = card
    else if (card.updatedAt === best.updatedAt) {
      if (card.createdAt > best.createdAt) best = card
      else if (card.createdAt === best.createdAt && card.id > best.id) best = card
    }
  }
  return best
}

/** 一天的账（无档=空日）。 */
export function dayDigest(doc: JournalDoc | undefined): DayDigest {
  if (doc === undefined || doc.cards.length === 0) {
    return { count: 0, excerpt: null, newestAt: null }
  }
  const newest = newestStroke(doc.cards)
  return {
    count: doc.cards.length,
    excerpt: newest === null ? null : excerptOfCard(newest),
    newestAt: newest === null ? null : newest.updatedAt,
  }
}

const hasContent = (doc: JournalDoc): boolean => doc.cards.length > 0

/** 整册时间账：有纸的天数 + 最后一笔住哪天（日期字符串序，零时区）。 */
export function journalStatsOf(docs: readonly JournalDoc[]): JournalStats {
  let lastDate: string | null = null
  let totalDays = 0
  for (const doc of docs) {
    if (!hasContent(doc)) continue
    totalDays += 1
    if (lastDate === null || doc.date > lastDate) lastDate = doc.date
  }
  return { totalDays, lastDate }
}

/** 上次落笔：最晚一个有纸之日的全账（摘录同款三口径）。全空为 null。 */
export function recentOf(docs: readonly JournalDoc[]): RecentDigest | null {
  let best: JournalDoc | null = null
  for (const doc of docs) {
    if (!hasContent(doc)) continue
    if (best === null || doc.date > best.date) best = doc
  }
  if (best === null) return null
  return { date: best.date, ...dayDigest(best) }
}

/** 每日一角（升序）：墨点与折角的底料，供任意年月自取（翻到门不再二次扫库）。 */
export function dayMarksOf(docs: readonly JournalDoc[]): DayMark[] {
  return docs
    .filter(hasContent)
    .map((doc): DayMark => ({
      date: doc.date,
      count: doc.cards.length,
      hasImage: doc.cards.some((c) => c.kind === 'image'),
    }))
    .sort((a, b) => (a.date < b.date ? -1 : 1))
}
