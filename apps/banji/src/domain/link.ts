// 链接卡的协议闸（R9）：一切链接载荷过这道门才有 href 资格。
// 纯函数、零 DOM：创建期（表单）与渲染期（href 生成）共用同一实现——纵深防御，两处都不是孤闸。
// 口径：只放行 WHATWG 规范形 http(s)；无协议/协议相对/控制字符/其余 scheme 一律 null。

// ASCII 控制位（含 \t\n\r 与 \x00-\x1f）：内嵌一个都不放行——解析器的剥糖衣路径从此无路。
const CONTROL_RE = /[\u0000-\u001f\u007f]/

/** 把未信任的字符串窄化成安全的 http(s) 规范形 URL；不合格返回 null（绝不返回半个坏串）。 */
export function safeHttpUrl(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const t = raw.trim()
  if (t === '' || CONTROL_RE.test(t)) return null
  let url: URL
  try {
    url = new URL(t) // 无协议与 '//host' 协议相对式在这里自然抛——一并拒
  } catch {
    return null
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
  return url.toString()
}

/** 题签兜底的主机名（www. 前缀是噪声，其余原样）。仅接受 safeHttpUrl 的产物。 */
export function linkHostname(url: string): string {
  const parsed = safeHttpUrl(url)
  if (parsed === null) return ''
  return new URL(parsed).hostname.replace(/^www\./i, '')
}
