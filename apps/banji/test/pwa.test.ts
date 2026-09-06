// R14 可安装与离线的构建面闸：壳快照纯函数（版本/清单/渲染）、manifest 形状、
// 外部资源零容忍扫描、注册三重闸。运行时真相（SW 真的离线伺候）由 e2e 的 airplane 段钉，
// 这里钉的是「构建产物别先烂」。
import { describe, expect, it } from 'vitest'
import { buildShellSnapshot, type ShellFile } from '../scripts/swPlugin.ts'
import { THEME_PAPER } from '../src/ui/theme'
import { registerShellSw, type SwNavigatorLike } from '../src/ui/registerSw'
import manifestRaw from '../public/manifest.json?raw'
import indexHtml from '../index.html?raw'

// 全部样式表一网打尽（glob 是编译期宏，必须住在模块顶层；新增 css 自动在册）。
const styles = import.meta.glob('../src/ui/styles/*.css', { query: '?raw', import: 'default', eager: true }) as Record<string, string>

const enc = (s: string): Uint8Array => new TextEncoder().encode(s)
const file = (path: string, body: string): ShellFile => ({ path, bytes: enc(body) })

describe('壳快照 buildShellSnapshot', () => {
  const base = [file('index.html', '<html>壳</html>'), file('assets/a-1.js', 'console.log(1)'), file('manifest.json', '{}')]

  it('同一文件表双跑逐字相等（版本确定，发布可复秤）', async () => {
    const x = await buildShellSnapshot(base)
    const y = await buildShellSnapshot(base)
    expect(x).toEqual(y)
  })

  it('乱序输入不扰版本（版本是内容指纹不是遍历运气）', async () => {
    const a = await buildShellSnapshot(base)
    const b = await buildShellSnapshot([...base].reverse())
    expect(b.version).toBe(a.version)
    expect(b.precache).toEqual(a.precache)
  })

  it('同名文件改一个字节即换版本（原地腐页逃不掉轮换）', async () => {
    const a = await buildShellSnapshot(base)
    const b = await buildShellSnapshot(base.map((f) => (f.path === 'index.html' ? file('index.html', '<html>壳改</html>') : f)))
    expect(b.version).not.toBe(a.version)
  })

  it('多一个文件即换版本且入册（新增产物不会游离在壳缓存外）', async () => {
    const a = await buildShellSnapshot(base)
    const b = await buildShellSnapshot([...base, file('assets/font-2.woff2', 'x')])
    expect(b.version).not.toBe(a.version)
    expect(b.precache).toContain('assets/font-2.woff2')
  })

  it('预缓存清单：./ 与 index.html 永远在列且不重名，其余按路径定序', async () => {
    const { precache } = await buildShellSnapshot(base)
    expect(precache[0]).toBe('./')
    expect(precache.filter((p) => p === 'index.html')).toEqual(['index.html'])
    expect(precache.slice(2)).toEqual([...precache.slice(2)].sort())
  })

  it('重名文件直接构建失败（不带病发布）', async () => {
    await expect(buildShellSnapshot([file('a.js', '1'), file('a.js', '2')])).rejects.toThrow('重名')
  })

  it('渲染出的 sw.js：占位符洗净、语法可编译', async () => {
    const { sw } = await buildShellSnapshot(base)
    expect(sw).not.toMatch(/__VERSION__|__PRECACHE__/)
    expect(() => new Function(sw)).not.toThrow()
  })

  it('sw.js 纪律闸：不催更、不抢占、不出本源、导航不信 HTTP 缓存', async () => {
    const { sw } = await buildShellSnapshot(base)
    expect(sw).not.toMatch(/\.skipWaiting\s*\(/) // 只禁调用，不禁“为何不调用”的注释
    expect(sw).not.toMatch(/clients\.claim\s*\(/)
    expect(sw).not.toMatch(/https?:\/\//) // 壳里不许埋任何绝对外部资源
    expect(sw).toContain('url.origin !== self.location.origin') // 册外之事概不代理
    expect(sw).toContain("cache: 'reload'") // 在线导航连浏览器 HTTP 缓存都不信——旧壳指新页/新页指旧壳的砖法第一步即死
    expect(sw).not.toMatch(/indexedDB\s*\.\s*open|IDBDatabase/i) // 数据层从不过这道门
  })
})

describe('manifest 形状（诚实身份）', () => {
  const m = JSON.parse(manifestRaw) as {
    name: string
    short_name: string
    description: string
    lang: string
    start_url: string
    scope: string
    display: string
    background_color: string
    theme_color: string
    icons: Array<{ src: string; sizes: string; type: string; purpose?: string }>
  }

  it('名与言简：伴记 / 纸感一句话 / zh-CN', () => {
    expect(m.name).toBe('伴记')
    expect(m.short_name).toBe('伴记')
    expect(m.description).toContain('纸感')
    expect(m.lang).toBe('zh-CN')
  })

  it('start_url 与 scope 都是相对 ./（发布在 /i/banji/ 子路径的命根子）', () => {
    expect(m.start_url).toBe('./')
    expect(m.scope).toBe('./')
  })

  it('standalone 全屏立纸；颜色 = 白班宣纸令牌（与 theme.ts 单一出处对账，夜读翻转仍走运行时 meta）', () => {
    expect(m.display).toBe('standalone')
    expect(m.theme_color).toBe(THEME_PAPER.light)
    expect(m.background_color).toBe(THEME_PAPER.light)
  })

  it('图标 192/512 各一枚 + maskable 一枚；src 全相对（不吃死发布路径）', () => {
    const sizes = m.icons.map((i) => i.sizes).sort()
    expect(sizes).toEqual(['192x192', '512x512', '512x512'])
    expect(m.icons.some((i) => i.purpose === 'maskable')).toBe(true)
    for (const icon of m.icons) {
      expect(icon.src).toMatch(/^icons\/[\w.-]+\.png$/)
      expect(icon.type).toBe('image/png')
    }
  })
})

describe('外部资源零容忍（离线立身法，防 CDN 偷渡回魂）', () => {
  it('index.html 无绝对/协议相对的资源 URL（src=、href=、url()）', () => {
    expect(indexHtml).not.toMatch(/(src|href)\s*=\s*["'](?:https?:)?\/\//i)
    expect(indexHtml).not.toMatch(/url\(\s*["']?(?:https?:)?\/\//i)
  })

  it('全部样式表无 @import http、无 url(http)、无协议相对', () => {
    const files = Object.entries(styles)
    expect(files.length).toBeGreaterThan(0)
    for (const [path, css] of files) {
      expect(css, path).not.toMatch(/@import\s+(?:url\()?\s*["']?(?:https?:)?\/\//i)
      expect(css, path).not.toMatch(/url\(\s*["']?(?:https?:)?\/\//i)
    }
  })

  it('壳引用的三个 link 全走相对（manifest/icon/apple-touch-icon）', () => {
    expect(indexHtml).toMatch(/rel="manifest" href="\.\/manifest\.json"/)
    expect(indexHtml).toMatch(/rel="apple-touch-icon" href="\.\/icons\//)
    expect(indexHtml).toMatch(/rel="icon"[^>]*href="\.\/icons\//)
  })
})

describe('注册三重闸 registerShellSw', () => {
  const makeNav = (reject = false): { nav: SwNavigatorLike; calls: Array<[string, { scope: string }]> } => {
    const calls: Array<[string, { scope: string }]> = []
    return {
      nav: {
        serviceWorker: {
          register(url, opts) {
            calls.push([url, opts])
            return reject ? Promise.reject(new Error('offline first open')) : Promise.resolve({})
          },
        },
      },
      calls,
    }
  }

  it('dev 构建不注册（dev 与 SW 抢页面是经典酷刑）', () => {
    const { nav, calls } = makeNav()
    let armed = 0
    registerShellSw({ prod: false, nav, onIdle: () => { armed += 1 } })
    expect(armed).toBe(0)
    expect(calls).toHaveLength(0)
  })

  it('浏览器没有 serviceWorker 就静默出局（在线照常用）', () => {
    const calls: Array<[string, { scope: string }]> = []
    let armed = 0
    registerShellSw({ prod: true, nav: {}, onIdle: () => { armed += 1 } })
    registerShellSw({ prod: true, nav: undefined, onIdle: () => { armed += 1 } })
    expect(armed).toBe(0)
    expect(calls).toHaveLength(0)
  })

  it('注册排在 load 之后、URL/scope 定死 ./sw.js 与 ./', async () => {
    const { nav, calls } = makeNav()
    const waiters: Array<() => void> = []
    registerShellSw({ prod: true, nav, onIdle: (fn) => { waiters.push(fn) } })
    expect(calls).toHaveLength(0) // 未 load 不动手
    waiters.forEach((fire) => fire())
    expect(calls).toEqual([['./sw.js', { scope: './' }]])
  })

  it('注册失败吞声（离线首开是契约内的事，零打扰法不发回执）', async () => {
    const { nav } = makeNav(true)
    registerShellSw({ prod: true, nav, onIdle: (fn) => { fn() } })
    await Promise.resolve()
    await Promise.resolve() //  rejection 若未就地消化，此处即炸 unhandled
  })
})
