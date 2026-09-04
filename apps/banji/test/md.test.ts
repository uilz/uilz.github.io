import { describe, expect, it } from 'vitest'
import { deriveInitialSize, parseInline, parseMd } from '../src/ui/cards/md'

describe('迷你 md 解析器 —— 产出纯数据，无 HTML 字符串', () => {
  it('标题分级 #/** ### → level 1/2/3', () => {
    expect(parseMd('# 一').at(0)).toMatchObject({ t: 'h', level: 1 })
    expect(parseMd('## 二').at(0)).toMatchObject({ t: 'h', level: 2 })
    expect(parseMd('### 三').at(0)).toMatchObject({ t: 'h', level: 3 })
    expect(parseMd('#### 四').at(0)).toMatchObject({ t: 'p' }) // 四级不是标题，落回正文
  })

  it('粗体/斜体/行内码 → 结构化 run', () => {
    expect(parseInline('风是**紧**的*细*线`c`')).toEqual([
      { t: 'text', s: '风是' },
      { t: 'strong', c: [{ t: 'text', s: '紧' }] },
      { t: 'text', s: '的' },
      { t: 'em', c: [{ t: 'text', s: '细' }] },
      { t: 'text', s: '线' },
      { t: 'code', s: 'c' },
    ])
  })

  it('列表：-/* 归并为一个 ul；1. 归并为 ol', () => {
    expect(parseMd('- 甲\n- 乙\n\n内容')).toEqual([
      { t: 'ul', items: [[{ t: 'text', s: '甲' }], [{ t: 'text', s: '乙' }]] },
      { t: 'p', c: [{ t: 'text', s: '内容' }] },
    ])
    expect(parseMd('1. 甲\n2) 乙')).toEqual([{ t: 'ol', items: [[{ t: 'text', s: '甲' }], [{ t: 'text', s: '乙' }]] }])
  })

  it('链接：白名单协议保留 href；javascript:/data: 整段降级为字面文本（不吞右括号）', () => {
    expect(parseInline('[山](https://x.cn/a)')).toEqual([
      { t: 'a', href: 'https://x.cn/a', c: [{ t: 'text', s: '山' }] },
    ])
    expect(parseInline('[山](javascript:alert(1))')).toEqual([
      { t: 'text', s: '[山](javascript:alert(1)' },
      { t: 'text', s: ')' },
    ])
    expect(parseInline('[山](data:text-html)')).toEqual([{ t: 'text', s: '[山](data:text-html)' }])
  })

  it('围栏代码逐字保留（含未闭合围栏到文末）', () => {
    expect(parseMd('```js\nconst a = 1\n```')).toEqual([{ t: 'pre', lang: 'js', code: 'const a = 1' }])
    expect(parseMd('```\n<b>\n未闭合')).toEqual([{ t: 'pre', lang: '', code: '<b>\n未闭合' }])
  })

  it('HTML 注入案例：<img onerror> 只能作为纯 text run 存在（无强/斜/码/链接语义）', () => {
    const evil = '<img src=x onerror=1>'
    const blocks = parseMd(evil)
    expect(blocks).toEqual([{ t: 'p', c: [{ t: 'text', s: evil }] }])
    expect(JSON.stringify(blocks)).not.toMatch(/"t":"(html|raw|img|script)/) // 树里没有任何标签型节点，只有 text
  })
})

describe('deriveInitialSize：只缩不放、保纵横比', () => {
  it('800×600 限宽 400 → 400×300；小于限宽的不动', () => {
    expect(deriveInitialSize(800, 600, 400)).toEqual({ w: 400, h: 300 })
    expect(deriveInitialSize(200, 100, 400)).toEqual({ w: 200, h: 100 })
    expect(deriveInitialSize(0, 0, 400)).toEqual({ w: 0, h: 0 })
  })
})
