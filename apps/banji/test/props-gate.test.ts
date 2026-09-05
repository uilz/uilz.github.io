// D4：新卡型的 props 形状闸（挂在既有 validateCard 路上）——资产类 hash=64hex、
// 链接 url 只认 safeHttpUrl（空串容空白草稿）、代码/手记 text 必须字符串；未知 kind 依旧原样放行。
import { describe, expect, it } from 'vitest'
import { containerCard, makeCard, mysteryCard, textCard, fileCard } from './helpers'
import { validateCard } from '../src/domain/validate'

const HEX = 'a'.repeat(64)
const codes = (props: Record<string, unknown>, kind: string): string[] => {
  const v = validateCard(makeCard({ kind, props }))
  return v.ok ? [] : v.issues.map((i) => i.code)
}

describe('props 形状闸（R9 新 kind）', () => {
  it('audio/video/pdf：hash 齐备通过；hash 畸形点名拒绝；name 可选字符串合法', () => {
    expect(codes({ hash: HEX }, 'audio')).toEqual([])
    expect(codes({ hash: HEX, name: '晨曲.mp3' }, 'audio')).toEqual([])
    expect(codes({ hash: HEX, w: 420, h: 236, name: '短片.mp4' }, 'video')).toEqual([])
    expect(codes({ hash: HEX.toUpperCase() }, 'pdf')).toEqual(['props.pdf']) // sha 冻结小写：大写即畸形
    expect(codes({ hash: 'zz' }, 'audio')).toEqual(['props.audio'])
    expect(codes({ }, 'pdf')).toEqual(['props.pdf'])
    expect(codes({ hash: HEX, name: 7 }, 'video')).toEqual(['props.video'])
    expect(codes({ hash: HEX, w: '420' }, 'video')).toEqual(['props.video'])
  })

  it('code/markdown：text 必须字符串；缺 text 拒绝；markdown 只认 format=md', () => {
    expect(codes({ text: 'fn main(){}' }, 'code')).toEqual([])
    expect(codes({ text: '', name: 'x.rs' }, 'code')).toEqual([])
    expect(codes({ }, 'code')).toEqual(['props.code'])
    expect(codes({ text: '# 标题' }, 'markdown')).toEqual([])
    expect(codes({ text: '# 标题', format: 'md' }, 'markdown')).toEqual([])
    expect(codes({ text: 'x', format: 'plain' }, 'markdown')).toEqual(['props.markdown'])
    expect(codes({ text: 3 }, 'markdown')).toEqual(['props.markdown'])
  })

  it('link：https 网址通过；空草稿通过（渲染期孤闸兜底）；javascript:/裸域名/缺键拒绝', () => {
    expect(codes({ url: 'https://example.com/a?b=1' }, 'link')).toEqual([])
    expect(codes({ url: 'https://example.com/a?b=1', title: '示例' }, 'link')).toEqual([])
    expect(codes({ url: '' }, 'link')).toEqual([])
    expect(codes({ url: 'javascript:alert(1)' }, 'link')).toEqual(['props.link'])
    expect(codes({ url: 'evil.com/x' }, 'link')).toEqual(['props.link'])
    expect(codes({ url: null }, 'link')).toEqual(['props.link'])
    expect(codes({ }, 'link')).toEqual(['props.link'])
  })

  it('既有锁定行为一字不动：image/file 不设 hash 闸、未知 kind 原样放行、text/container 如旧', () => {
    expect(validateCard(fileCard('not-hex'))).toEqual({ ok: true })
    expect(validateCard(makeCard({ kind: 'image', props: { hash: 'x', w: 10 } }))).toEqual({ ok: true })
    expect(validateCard(mysteryCard({ audio: { hash: 'whatever' } }))).toEqual({ ok: true })
    expect(validateCard(textCard('hi'))).toEqual({ ok: true })
    expect(validateCard(containerCard([]))).toEqual({ ok: true })
  })
})
