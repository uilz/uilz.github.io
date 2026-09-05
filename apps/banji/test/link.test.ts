// 链接卡的 XSS 闸门（R9 本轮的命门）：safeHttpUrl 纯函数——只放行 http(s)，
// 创建期与渲染期共用同一道闸（纵深防御）；协议相对、无协议、控制字符、杂协议一律拒。
import { describe, expect, it } from 'vitest'
import { linkHostname, safeHttpUrl } from '../src/domain/link'

const REJECTS: readonly (readonly [string, string])[] = [
  ['javascript 协议', 'javascript:alert(1)'],
  ['javascript 大写混合', 'JaVaScRiPt:alert(1)'],
  ['javascript 前导空白', '   javascript:alert(1)'],
  ['javascript 内含制表', 'java\tscript:alert(1)'],
  ['javascript 内含换行', 'java\nscript:alert(document.cookie)'],
  ['data 协议', 'data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg=='],
  ['vbscript 协议', 'vbscript:msgbox'],
  ['file 协议', 'file:///etc/passwd'],
  ['blob 协议', 'blob:https://evil.example/uuid'],
  ['协议相对 //evil', '//evil.com/x'],
  ['裸域名无协议', 'evil.com/x'],
  ['mailto 不在允许之列', 'mailto:a@b.c'],
  ['空串', ''],
  ['纯空白', '   '],
  ['https 冒充前缀', 'httpsevil.com/a'],
  ['非字符串: 数字', 42 as unknown as string],
  ['非字符串: null', null as unknown as string],
  ['含尖括号的伪网址', '<script>alert(1)</script>'],
]

describe('safeHttpUrl：链接只认 http(s)', () => {
  it.each(REJECTS)('拒绝 %s', (_label, input) => {
    expect(safeHttpUrl(input)).toBeNull()
  })

  it('接受 https 带路径/查询/锚点', () => {
    expect(safeHttpUrl('https://example.com/a/b?q=1&r=2#frag')).toBe('https://example.com/a/b?q=1&r=2#frag')
  })

  it('接受 http 根地址（规范形补斜杠）', () => {
    expect(safeHttpUrl('http://example.com')).toBe('http://example.com/')
  })

  it('两侧空白先行裁掉再判', () => {
    expect(safeHttpUrl('  https://example.com/x  ')).toBe('https://example.com/x')
  })

  it('拒绝 https:// 无主机', () => {
    expect(safeHttpUrl('https://')).toBeNull()
  })

  it('拒绝混入控制字符的串（含 \\\\x0c 等不可打印位）', () => {
    expect(safeHttpUrl('http://a\x0cb-x')).toBeNull()
  })
})

describe('linkHostname：题签兜底的主机名', () => {
  it('www 前缀去掉，其余原样', () => {
    expect(linkHostname('https://www.example.com/a')).toBe('example.com')
    expect(linkHostname('https://blog.example.co.uk')).toBe('blog.example.co.uk')
  })
})
