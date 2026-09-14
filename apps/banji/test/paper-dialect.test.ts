// V2-Iter3 设计系统看门测：纸的方言三账——
// ①chipMaterial 纯映射（图模式身份化的算术面）②paper.css 材质覆盖（每型一纸、每材质一笔，缺账即红）
// ③色相纪律（paper.css 零色值字面量——颜色只许指认令牌）+ 影子纪律（抬升之外不 mint 新影）。
import { describe, expect, it } from 'vitest'
import { chipMaterial, type PaperMaterial } from '../src/ui/graphLayout'

// ?raw 的 css 走 glob 编译期宏（与 pwa/mobile 同款——css 直 import 会被 vitest 的 css 管道掏空）。
const styles = import.meta.glob('../src/ui/styles/*.css', { query: '?raw', import: 'default', eager: true }) as Readonly<Record<string, string>>
const paperCss = styles['../src/ui/styles/paper.css'] ?? ''
const baseCss = styles['../src/ui/styles/base.css'] ?? ''

const ALL_KINDS = ['text', 'markdown', 'image', 'video', 'audio', 'file', 'pdf', 'code', 'link', 'container'] as const

describe('chipMaterial：卡型 → 材质（D5 的纯函数半）', () => {
  const MAP: ReadonlyArray<readonly [string, PaperMaterial]> = [
    ['text', 'plain'],
    ['markdown', 'zhu'],
    ['image', 'photo'],
    ['video', 'photo'],
    ['audio', 'ruled'],
    ['file', 'doc'],
    ['pdf', 'doc'],
    ['code', 'grid'],
    ['link', 'strip'],
    ['container', 'mat'],
  ]

  it.each(MAP)('%s 落 %s 纸', (kind, material) => {
    expect(chipMaterial(kind)).toBe(material)
  })

  it('未知型归宣纸：基线即身份，未来的型回到这版伴记不着饰', () => {
    expect(chipMaterial('yet-unknown')).toBe('plain')
    expect(chipMaterial('')).toBe('plain')
  })

  it('映射与纸面族谱一字不多：每味材质都有卡型认亲', () => {
    const materials = new Set(MAP.map(([, m]) => m))
    expect([...materials].sort()).toEqual(['doc', 'grid', 'mat', 'photo', 'plain', 'ruled', 'strip', 'zhu'])
  })
})

describe('paper.css：材质账本完整（每型一纸）', () => {
  it.each(ALL_KINDS)('data-paper="%s" 有材质笔', (kind) => {
    expect(paperCss).toContain(`[data-paper="${kind}"]`)
  })

  it('每一味 chip 材质都上得了色（plain 之外零漏网）', () => {
    for (const m of ['photo', 'doc', 'ruled', 'grid', 'mat', 'strip', 'zhu'] as const) {
      expect(paperCss).toContain(`[data-material="${m}"]`)
    }
  })

  it('宣纸不着一饰：text 材质笔里只有底色，无纹理无衬距改动', () => {
    const textRule = /data-paper="text"\]\s*\{([^}]*)\}/.exec(paperCss)?.[1] ?? ''
    expect(textRule.replace(/\/\*[^*]*\*\//g, '').trim()).toBe('background-color: var(--bj-card);')
  })
})

describe('色相纪律：paper.css 是令牌的文件，不是色板', () => {
  it('零色值字面量：不许出现 #hex / rgb() / rgba() / hsl()——一切颜色指认 var() 令牌', () => {
    const offenders = [
      ...paperCss.matchAll(/#[0-9a-fA-F]{3,8}\b/g),
      ...paperCss.matchAll(/(?<!s)\brgba?\(/g),
      ...paperCss.matchAll(/\bhsla?\(/g),
    ].map((m) => m[0])
    expect(offenders).toEqual([])
  })

  it('影子纪律：paper.css 里唯一的 box-shadow 是拖拽抬升令牌（材质是面，不添影）', () => {
    const shadows = [...paperCss.matchAll(/box-shadow:\s*([^;]+);/g)].map((m) => m[1]?.trim() ?? '<空>')
    expect(shadows).toEqual(['var(--bj-lift)'])
  })
})

describe('base.css：新材质令牌两班都有班值（夜读材质必须成色）', () => {
  const MATERIAL_TOKENS = ['--bj-paper-photo', '--bj-paper-doc', '--bj-zhu', '--bj-rule', '--bj-grid', '--bj-lift'] as const

  it.each(MATERIAL_TOKENS)('%s 在白班 :root 与夜班 night 块各定义一次', (token) => {
    const nightBlock = baseCss.slice(baseCss.indexOf('[data-bj-theme="night"]'))
    const dayBlock = baseCss.slice(0, baseCss.indexOf('[data-bj-theme="night"]'))
    expect([...dayBlock.matchAll(new RegExp(`${token}:`, 'g'))]).toHaveLength(1)
    expect([...nightBlock.matchAll(new RegExp(`${token}:`, 'g'))]).toHaveLength(1)
  })
})
