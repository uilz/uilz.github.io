// R11·D6 空/错巡检落笔：预检 16 码 × inner 形状码的用户话表机判——
// 每一码都有专属人话、无一生裸 enum、互不撞文案（「distinct warm copy」的字面兑现）。
import { describe, expect, it } from 'vitest'
import { rejectCopy, type ProblemLike } from '../src/archive/rejectCopy'
import type { PreflightCode } from '../src/archive/preflight'

const ALL_CODES: readonly PreflightCode[] = [
  'archive_gate', 'json.unparsable', 'journal.invalid', 'journal.duplicate_date',
  'card.duplicate_id', 'card.dangling_asset', 'edge.invalid', 'edge.duplicate_id',
  'edge.dangling_endpoint', 'setting.invalid', 'setting.duplicate_key',
  'asset.entry_invalid', 'asset.duplicate_entry', 'asset.hash_mismatch',
  'asset.size_mismatch', 'asset.missing_body',
]

describe('导入拒信人话表（R11·D6）', () => {
  it('16 个预检码逐一生专属人话：非空、互不重复、零 raw enum 裸奔', () => {
    const seen = new Set<string>()
    for (const code of ALL_CODES) {
      const msg = rejectCopy({ code }, '某条中文证据')
      expect(msg.length, code).toBeGreaterThan(3)
      expect(msg, code).not.toContain(code)
      expect(seen.has(msg), `${code} 撞了别码的文案`).toBe(false)
      seen.add(msg)
    }
  })

  it('R7 悬空端点专属话：读得出是线出了问题，不是「档案没了」', () => {
    const msg = rejectCopy({ code: 'edge.dangling_endpoint' }, '边 e1#9 端点无卡: c#1↔c#x')
    expect(msg).toContain('有根线牵着不在档案里的纸')
    expect(msg).toContain('边 e1#9')
  })

  it('validate 形状碎语（code @ path）不上用户脸；inner 码有专属话时点名更细', () => {
    expect(rejectCopy({ code: 'journal.invalid', inner: 'journal.date' }, 'journal.date @ journal.cards[3].date')).toBe('日子记成了不认识的写法')
    expect(rejectCopy({ code: 'journal.invalid', inner: 'container.cycle' }, 'container.cycle @ cards[0]')).toBe('纸叠绕成了圈，套进了自己的怀里')
  })

  it('inner 码无专属话时退外层人话，仍零裸奔', () => {
    const p: ProblemLike = { code: 'edge.invalid', inner: 'edge.brand-new-code' }
    expect(rejectCopy(p, 'edge.brand-new-code @ edges[2]')).toBe('有根线的形状不对')
  })

  it('未知新码走保守门面——加了闸忘了登记文案也不生裸码（R1 铁律的未来保险）', () => {
    const wild = { code: 'json.unparsable' } as ProblemLike
    expect(rejectCopy(wild, '')).toContain('读不成字')
  })
})
