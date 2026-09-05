// 夹带路由表（R9·D1）：mime → 卡型的唯一判据。纯函数，attachPipeline 只消费不判型；
// placement 曾有的「image 与其余」二分流口径由本表全面接管（见 ROUNDS R9 决策）。

/** 夹带可产的卡型全集 —— 恰好也是有「重命名此纸」资格的资产类（R9·D6）。 */
export type AttachKind = 'image' | 'file' | 'audio' | 'video' | 'pdf'

const ATTACH_KINDS: ReadonlySet<string> = new Set(['image', 'file', 'audio', 'video', 'pdf'])

/** 该 kind 是否资产卡（有名可改、原件在库里）。 */
export function isAttachKind(kind: string): kind is AttachKind {
  return ATTACH_KINDS.has(kind)
}

/** mime 基类型（去参数、小写）→ 卡型。application/pdf 精确点名；未知一律文件卡。 */
export function routeAttach(mime: string): AttachKind {
  const base = mime.trim().toLowerCase().split(';')[0] ?? ''
  if (base === 'application/pdf') return 'pdf'
  if (base.startsWith('image/')) return 'image'
  if (base.startsWith('audio/')) return 'audio'
  if (base.startsWith('video/')) return 'video'
  return 'file'
}
