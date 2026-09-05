// 全局搜索的纯函数内核（R8·D2）：大小写不敏感的子串匹配，中日文天然按码元成立。
// 零 I/O、零 DOM、零 HTML 字符串——snippet 只交原文切片与 [start,end) 下标，高亮由渲染层切 React 文本节点。
// 语料口径：正文=text/markdown/code 的 props.text、链接=props.url、附件名=image/file 的 props.hash
// 联结资产元数据（无 blob 的 {hash,name?,mime,size}）；容器孩子本就是平摊的独立卡，各成一行。
import type { Card, CardId } from './types'
import { isPlainObject } from './validation'

/** 资产元数据（搜索语料用的投影，绝不含 blob）。 */
export interface AssetMeta {
  readonly hash: string
  readonly name?: string
  readonly mime: string
  readonly size: number
}

/** 搜索的输入行：日期归属 + 卡片本体（与 application 的 CardAt 结构相容）。 */
export interface CardRow {
  readonly date: string
  readonly card: Card
}

export interface SearchOpts {
  /** 结果上限，默认 50。 */
  readonly cap?: number
  /** 命中前后各留多少字符，默认 40。 */
  readonly around?: number
}

/** 一行命中：字段类别 + 排名 + snippet（带省略号）+ 高亮下标（相对 snippet，码元计）。 */
export interface SearchHit {
  readonly date: string
  readonly cardId: CardId
  readonly field: 'text' | 'link' | 'asset'
  readonly rank: 0 | 1 | 2
  readonly snippet: string
  readonly start: number
  readonly end: number
}

const DEFAULT_CAP = 50
const DEFAULT_AROUND = 40

/** 折叠大小写找子串：返回 [startIndex, endIndex)（原始串的码元坐标），找不到 null。
 *  快路走整串 toLowerCase（CJK/常见字符保码元长度）；不规则折叠（如 İ）长度错位时退回逐码元比对——
 *  宁可少匹配，绝不返回错位的下标。 */
function foldFind(haystack: string, needleLower: string): readonly [number, number] | null {
  if (needleLower.length === 0) return null
  const lowered = haystack.toLowerCase()
  for (let i = lowered.indexOf(needleLower); i !== -1; i = lowered.indexOf(needleLower, i + 1)) {
    if (sliceFoldEquals(haystack, i, needleLower)) return [i, i + needleLower.length]
  }
  return null
}

function sliceFoldEquals(haystack: string, at: number, needleLower: string): boolean {
  if (at < 0 || at + needleLower.length > haystack.length) return false
  for (let j = 0; j < needleLower.length; j++) {
    if (haystack.charAt(at + j).toLowerCase() !== needleLower.charAt(j)) return false
  }
  return true
}

interface FieldMatch {
  readonly field: 'text' | 'link' | 'asset'
  readonly rank: 0 | 1 | 2
  readonly line: string
  readonly at: number
  readonly len: number
}

/** 一行里最体面的命中：首行正文 > 后行正文/链接 > 资产名。 */
function bestMatchInCard(card: Card, assetName: string | undefined, q: string): FieldMatch | null {
  const props = card.props
  let best: FieldMatch | null = null
  const offer = (m: FieldMatch): void => {
    if (best === null || m.rank < best.rank) best = m
  }
  if (isPlainObject(props)) {
    const text = typeof props['text'] === 'string' ? props['text'] : undefined
    if (text !== undefined) {
      const lines = text.split('\n')
      for (let i = 0; i < lines.length; i++) {
        const found = foldFind(lines[i] ?? '', q)
        if (found === null) continue
        offer({ field: 'text', rank: i === 0 ? 0 : 1, line: lines[i] ?? '', at: found[0], len: found[1] - found[0] })
        break
      }
    }
    const url = typeof props['url'] === 'string' ? props['url'] : undefined
    if (url !== undefined) {
      const found = foldFind(url, q)
      if (found !== null) offer({ field: 'link', rank: 1, line: url, at: found[0], len: found[1] - found[0] })
    }
    if ((card.kind === 'image' || card.kind === 'file') && typeof props['hash'] === 'string' && assetName !== undefined) {
      const found = foldFind(assetName, q)
      if (found !== null) offer({ field: 'asset', rank: 2, line: assetName, at: found[0], len: found[1] - found[0] })
    }
  }
  return best
}

/** snippet = 命中行上 ±around 码元的窗口；越界处补省略号；高亮下标平移进 snippet 坐标系。 */
function makeSnippet(match: FieldMatch, around: number): Pick<SearchHit, 'snippet' | 'start' | 'end'> {
  const { line, at, len } = match
  const from = Math.max(0, at - around)
  const to = Math.min(line.length, at + len + around)
  const head = from > 0 ? '…' : ''
  const tail = to < line.length ? '…' : ''
  return {
    snippet: `${head}${line.slice(from, to)}${tail}`,
    start: head.length + (at - from),
    end: head.length + (at - from) + len,
  }
}

/**
 * 全库子串搜索（D2 拍板：无历史、无模糊、无分词）。排序=rank 升 → createdAt 降（并列按 id 定序，
 * 结果可复现）；空查询与纯空白查询恒空；容器孩子作为独立卡各成一行（输入已平摊，不特判）。
 */
export function searchCards(cards: readonly CardRow[], assetMeta: readonly AssetMeta[], query: string, opts: SearchOpts = {}): SearchHit[] {
  const q = query.trim().toLowerCase()
  if (q === '') return []
  const cap = opts.cap ?? DEFAULT_CAP
  const around = opts.around ?? DEFAULT_AROUND
  const nameByHash = new Map(assetMeta.map((a): [string, string | undefined] => [a.hash, a.name]))
  const hits: (SearchHit & { readonly createdAt: string })[] = []
  for (const row of cards) {
    const props = row.card.props
    const hash = isPlainObject(props) && (row.card.kind === 'image' || row.card.kind === 'file') && typeof props['hash'] === 'string' ? props['hash'] : undefined
    const assetName = hash === undefined ? undefined : nameByHash.get(hash)
    const match = bestMatchInCard(row.card, assetName, q)
    if (match === null) continue
    const cut = makeSnippet(match, around)
    hits.push({
      date: row.date,
      cardId: row.card.id,
      field: match.field,
      rank: match.rank,
      createdAt: row.card.createdAt,
      ...cut,
    })
  }
  hits.sort((a, b) =>
    a.rank !== b.rank
      ? a.rank - b.rank
      : a.createdAt !== b.createdAt
        ? a.createdAt < b.createdAt
          ? 1
          : -1
        : a.cardId < b.cardId
          ? -1
          : a.cardId === b.cardId
            ? 0
            : 1,
  )
  return hits.slice(0, cap).map(({ createdAt: _createdAt, ...hit }) => hit)
}
