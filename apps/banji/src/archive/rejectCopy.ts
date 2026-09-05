// R11·D6 空/错状态巡检的落笔之一：预检拒绝码的用户话表（R1「文案即产品」铁律补齐最后一块）。
// 拒信三段式：先结论 → 安抚数据（前缀）→ 点名病根。raw enum/路径碎片只住 ImportResult.detail（支持排障），
// 用户脸一行只说人话；validate 形状碎语（`journal.date @ …`）不上脸。
import type { PreflightCode } from './preflight'

export interface ProblemLike {
  readonly code: PreflightCode
  readonly inner?: string
}

const OUTER_COPY: Readonly<Partial<Record<PreflightCode, string>>> = {
  archive_gate: '档案的门禁没对上',
  'json.unparsable': '有一页账目糊了，读不成字',
  'journal.invalid': '有一天的纸不合这本的规矩',
  'journal.duplicate_date': '同一天在这本档案里出现了两次',
  'card.duplicate_id': '两张纸刻着同一个编号',
  'card.dangling_asset': '有张纸引用的附件没随档案来',
  'edge.invalid': '有根线的形状不对',
  'edge.duplicate_id': '两根线刻着同一个编号',
  'edge.dangling_endpoint': '有根线牵着不在档案里的纸',
  'setting.invalid': '有一页设置读不成字',
  'setting.duplicate_key': '同名设置在这本里出现了两次',
  'asset.entry_invalid': '资产册上有一行抄歪了',
  'asset.duplicate_entry': '同一件原件在资产册上记了两遍',
  'asset.hash_mismatch': '有件原件的指纹和册上登记的对不上',
  'asset.size_mismatch': '有件原件的轻重和册上登记的对不上',
  'asset.missing_body': '资产册点名的原件没在档案里',
}

/** validate 形状码的专属病根话——inner 有专属话时点名比外层细。 */
const INNER_COPY: Readonly<Record<string, string>> = {
  'journal.not_object': '有一天不是一页账',
  'journal.date': '日子记成了不认识的写法',
  'journal.updatedAt': '某天的落款不是认得的时间',
  'journal.cards': '某天的纸片名册散了形',
  'journal.duplicate_id': '同一天里两张纸编号重了',
  'journal.child_missing': '垫纸怀里抱着一张不在名册的纸片',
  'container.cycle': '纸叠绕成了圈，套进了自己的怀里',
  'container.duplicate_parent': '一张纸被两叠纸同时认作己有',
  'edge.not_object': '有根线连形状都不是',
  'edge.id': '有根线没有编号',
  'edge.source': '有根线忘了从哪张纸出发',
  'edge.target': '有根线没写下要牵向谁',
  'edge.self_loop': '有根线自己牵向了自己',
  'edge.role': '线上的名目写成了不认得的字',
  'edge.createdAt': '有线落款不是认得的时间',
  'edge.updatedAt': '有线改期不是认得的时间',
  'setting.not_object': '有页设置不是一行设置',
  'setting.key': '有页设置没有名头',
  'setting.value': '有页设置空着没写字',
  'card.not_object': '有一张纸不是一张纸',
  'card.id': '有张纸的编号没刻对',
  'card.kind': '有张纸没写清自己是什么',
  'card.pos': '有张纸的落点是笔糊涂账',
  'card.size': '有张纸的尺寸是笔糊涂账',
  'card.props': '有张纸的心事不合形状',
  'card.children': '有叠纸的孩子名册散了形',
}

/** 形状碎语（`journal.date @ journal.cards[3]`）只配住 detail，不上用户脸。 */
const RAW_SHAPE_TRACE = /^[a-z][-\w.]* @ /

/** 一句病根人话：inner 有专属话用 inner 的，否则外层码；已知中文 detail 作括注给证据。 */
export function rejectCopy(problem: ProblemLike, detail: string): string {
  const inner = problem.inner === undefined ? undefined : INNER_COPY[problem.inner]
  const phrase = inner ?? OUTER_COPY[problem.code] ?? '有一处纸页没通过核对'
  return RAW_SHAPE_TRACE.test(detail) ? phrase : `${phrase}（${detail}）`
}
