// ~60 行安全迷你 md 解析器：标题/粗体/斜体/行内码/列表/链接/围栏代码。
// 关键安全决策：产出的是纯数据结构（下方 Block/Inline），渲染层逐节点映射为 React 元素；
// 全文不存在 HTML 字符串，也就没有 innerHTML 注入面 —— 任何 <tag> 只会以字面文本出现。

export type Inline =
  | { readonly t: 'text'; readonly s: string }
  | { readonly t: 'strong'; readonly c: readonly Inline[] }
  | { readonly t: 'em'; readonly c: readonly Inline[] }
  | { readonly t: 'code'; readonly s: string }
  | { readonly t: 'a'; readonly href: string; readonly c: readonly Inline[] }

export type Block =
  | { readonly t: 'h'; readonly level: 1 | 2 | 3; readonly c: readonly Inline[] }
  | { readonly t: 'p'; readonly c: readonly Inline[] }
  | { readonly t: 'ul'; readonly items: readonly (readonly Inline[])[] }
  | { readonly t: 'ol'; readonly items: readonly (readonly Inline[])[] }
  | { readonly t: 'pre'; readonly lang: string; readonly code: string }

// 仅放行这些协议；javascript:、data: 等一律降级为普通文本（渲染进不了 href 属性）。
function safeHref(url: string): string | null {
  const u = url.trim()
  if (/^(https?:\/\/|mailto:|#|\/)/i.test(u) && !/[<>"'\s]/.test(u)) return u
  return null
}

const TOKEN = /\*\*([^*]+)\*\*|\*([^*]+)\*|`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\)/

export function parseInline(src: string): Inline[] {
  const out: Inline[] = []
  let rest = src
  while (rest.length > 0) {
    const m = TOKEN.exec(rest)
    const at = m?.index ?? -1
    if (m === null || at < 0) {
      out.push({ t: 'text', s: rest })
      break
    }
    if (at > 0) out.push({ t: 'text', s: rest.slice(0, at) })
    if (m[1] !== undefined) out.push({ t: 'strong', c: parseInline(m[1]) })
    else if (m[2] !== undefined) out.push({ t: 'em', c: parseInline(m[2]) })
    else if (m[3] !== undefined) out.push({ t: 'code', s: m[3] })
    else if (m[4] !== undefined && m[5] !== undefined) {
      const href = safeHref(m[5])
      const label = parseInline(m[4])
      if (href === null) out.push({ t: 'text', s: `${m[4]}(${m[5]})` })
      else out.push({ t: 'a', href, c: label })
    }
    rest = rest.slice(at + m[0].length)
  }
  return out
}

const H_RE = /^(#{1,3})\s+(.*)$/
const UL_RE = /^[-*]\s+(.*)$/
const OL_RE = /^\d+[.)]\s+(.*)$/
const FENCE_RE = /^```(\S*)\s*$/

export function parseMd(src: string): Block[] {
  const blocks: Block[] = []
  const lines = src.split(/\r?\n/)
  let para: string[] = []
  let fence: { lang: string; body: string[] } | null = null
  const flushPara = (): void => {
    if (para.length > 0) {
      blocks.push({ t: 'p', c: parseInline(para.join(' ')) })
      para = []
    }
  }
  for (const line of lines) {
    if (fence !== null) {
      const close = FENCE_RE.exec(line.trim())
      if (close !== null) {
        blocks.push({ t: 'pre', lang: fence.lang, code: fence.body.join('\n') })
        fence = null
      } else fence.body.push(line)
      continue
    }
    const open = FENCE_RE.exec(line.trim())
    if (open !== null) {
      flushPara()
      fence = { lang: open[1] ?? '', body: [] }
      continue
    }
    if (line.trim() === '') {
      flushPara()
      continue
    }
    const h = H_RE.exec(line)
    if (h !== null && h[1] !== undefined && h[2] !== undefined) {
      flushPara()
      blocks.push({ t: 'h', level: h[1].length as 1 | 2 | 3, c: parseInline(h[2]) })
      continue
    }
    const li = UL_RE.exec(line)
    if (li !== null && li[1] !== undefined) {
      flushPara()
      const last = blocks[blocks.length - 1]
      if (last !== undefined && last.t === 'ul') blocks[blocks.length - 1] = { t: 'ul', items: [...last.items, parseInline(li[1])] }
      else blocks.push({ t: 'ul', items: [parseInline(li[1])] })
      continue
    }
    const oi = OL_RE.exec(line)
    if (oi !== null && oi[1] !== undefined) {
      flushPara()
      const last = blocks[blocks.length - 1]
      if (last !== undefined && last.t === 'ol') blocks[blocks.length - 1] = { t: 'ol', items: [...last.items, parseInline(oi[1])] }
      else blocks.push({ t: 'ol', items: [parseInline(oi[1])] })
      continue
    }
    para.push(line)
  }
  if (fence !== null) blocks.push({ t: 'pre', lang: fence.lang, code: fence.body.join('\n') })
  flushPara()
  return blocks
}

/** ImageProps 的 w/h 是“建议尺寸”保险字段：仅在两值都未写时才用自然尺寸补全。 */
export function deriveInitialSize(w: number, h: number, maxW: number): { readonly w: number; readonly h: number } {
  const scale = Math.min(1, maxW / Math.max(1, w))
  return { w: Math.round(w * scale), h: Math.round(h * scale) }
}
