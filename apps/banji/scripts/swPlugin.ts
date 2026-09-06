// R14 壳缓存服务工作者（hand-roll 拍板：vite-plugin-pwa 需 workbox-build+workbox-window
// 两枚 peer，实测拉进 229 包/106MB，只为描述这 60 行 fetch 模型——零依赖法的纸册不配这个排场。
// 证据与取舍记 ROUNDS Round-14）。
//
// 职责：构建时把壳（index.html + 哈希资产 + 图标 + manifest）逐文件 sha256 汇成一个版本号，
// 连同精确的预缓存清单注入下面的模板，产出 outDir 根上的 sw.js（定名，注册 URL 恒定）。
// 与 emptyOutDir: true + outDir ../../i/banji 的发布形状同生共死：sw.js 是 bundle 的一个
// asset，跟别的产物一起被清空、被写出、被编排者提交——没有“手工维护清单”这回事。
//
// 更新模型（诚实且无聊）：不 skipWaiting、不 clients.claim——新版本只在下次冷启动接管，
// 纸册不催更。已开页面继续由旧壳伺候到卸装为止。

import { readFile, readdir, writeFile } from 'node:fs/promises'
import { sha256Hex } from '../src/archive/hash.ts'
import type { Plugin, ResolvedConfig } from 'vite'

export interface ShellFile {
  /** 相对壳根的 POSIX 路径，如 'index.html'、'assets/index-<hash>.js'、'icons/icon-192.png' */
  path: string
  bytes: Uint8Array
}

export interface ShellSnapshot {
  /** 预缓存清单（相对 sw.js 所在目录解析）；'./' 与 'index.html' 永远在列 */
  precache: string[]
  /** 壳内容指纹：任一字节变化即换缓存，同名文件原地改内容也逃不掉 */
  version: string
  /** 渲染好的 sw.js 源码 */
  sw: string
}

const SW_TEMPLATE = `'use strict';
// 伴记壳缓存（构建生成，勿手改——源在 apps/banji/scripts/swPlugin.ts）。
// 只伺候本机同源的壳文件；IndexedDB 与数据从不过这道门。
var VERSION = "__VERSION__";
var CACHE = 'banji-shell-' + VERSION;
var PRECACHE = __PRECACHE__;
var PRECACHE_HREFS = PRECACHE.map(function (p) { return new URL(p, self.location).href; });

self.addEventListener('install', function (event) {
  // addAll 全有或全无：清单里缺一个字节就不装——旧壳继续在岗，宁可不换新，不带病上岗。
  event.waitUntil(caches.open(CACHE).then(function (cache) { return cache.addAll(PRECACHE); }));
  // 不 skipWaiting：新版本安静候着，下次冷启动自然接管。纸册不催更。
});

self.addEventListener('activate', function (event) {
  // 只清自家前缀的旧壳缓存。已开页面手上的旧资产走浏览器 HTTP 缓存与内存，不回头要账；
  // 本壳无懒加载分片（单 bundle），构造上不存在“半路资产被删”的断头路。
  event.waitUntil(caches.keys().then(function (names) {
    return Promise.all(names.filter(function (n) {
      return n.indexOf('banji-shell-') === 0 && n !== CACHE;
    }).map(function (n) { return caches.delete(n); }));
  }));
  // 不 clients.claim：把没被伺候过的页面硬拉进新壳，是催更之外的第二桩不安静。
});

self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // 册外之事，概不代理

  if (req.mode === 'navigate') {
    // 在线永远先取真页（cache:'reload' 连浏览器 HTTP 缓存都不信——旧壳指新页、新页指旧壳
    // 的经典砖法，第一步就被这行掐死）；断网才落回本版本壳里自洽的快照。
    event.respondWith(fetch(req, { cache: 'reload' }).catch(function () {
      return caches.open(CACHE).then(function (cache) {
        return cache.match(req).then(function (hit) {
          if (hit) return hit;
          return cache.match('index.html').then(function (shell) {
            if (!shell) throw new Error('banji: 本机还没有存档的壳（首开需要一次网络）');
            return shell;
          });
        });
      });
    }));
    return;
  }

  if (PRECACHE_HREFS.indexOf(url.href) === -1) return; // 册外资源：不碰、不缓存、放行
  event.respondWith(caches.match(req).then(function (hit) {
    // 命中即缓存优先（哈希名=内容不可变）；未命中直连网络且不回填——运行时缓存永不生长，
    // 旧壳带新页在线照常开机，砖就没有可乘之机。
    return hit || fetch(req);
  }));
});
`

/** 纯函数：文件表 → 预缓存清单 + 内容指纹 + sw 源码。构建与单测共用这一扇门。 */
export async function buildShellSnapshot(files: readonly ShellFile[]): Promise<ShellSnapshot> {
  const sorted = [...files].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
  const seen = new Set(sorted.map((f) => f.path))
  if (seen.size !== sorted.length) throw new Error('壳清单出现重名文件：构建即失败，不带病发布')
  const lines: string[] = []
  for (const f of sorted) lines.push(`${f.path}:${await sha256Hex(f.bytes)}`)
  const version = (await sha256Hex(new TextEncoder().encode(lines.join('\n')))).slice(0, 12)
  const precache = ['./', 'index.html', ...sorted.map((f) => f.path).filter((p) => p !== 'index.html')]
  const sw = SW_TEMPLATE.replace('__VERSION__', version).replace('__PRECACHE__', JSON.stringify(precache))
  if (sw.includes('__VERSION__') || sw.includes('__PRECACHE__')) throw new Error('sw 模板占位符未替换干净')
  return { precache, version, sw }
}

/** public/ 直通进 outDir 的壳文件（定名）。少一个就在 writeBundle 里点名报错——
 *  不做静默缺席：缺席=离线安装时 addAll 才炸，那已经是用户设备上才发病的债。 */
const EXPECTED_SHELL_FILES = [
  'index.html',
  'manifest.json',
  'icons/apple-touch-icon.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
] as const

export function banjiShellSw(): Plugin {
  let config: ResolvedConfig
  return {
    name: 'banji-shell-sw',
    apply: 'build', // dev 不产 sw.js、不碰注册（main.tsx 侧还有 PROD 闸，双保险）
    configResolved(resolved) {
      config = resolved
    },
    // Vite 8（ Rolldown ）的 index.html 不过 bundle——落盘后的 outDir 才是构建真相。
    // 整目录收编（sw.js 自身除外）：将来多一类产物也自动在壳内，永无“游离资产离线变砖”。
    async writeBundle() {
      const outDir = config.build.outDir
      const all = (await readdir(outDir, { recursive: true }))
        .map((p) => p.replaceAll('\\', '/'))
        .filter((p) => p !== 'sw.js')
      // recursive readdir 连目录本身也点名：凡是有子项的路径都是目录，剔掉只留文件。
      const dirs = new Set(
        all.flatMap((p) => {
          const parts = p.split('/')
          return parts.slice(0, -1).map((_, i) => parts.slice(0, i + 1).join('/'))
        }),
      )
      const rels = all.filter((p) => !dirs.has(p))
      const present = new Set(rels)
      const missing = EXPECTED_SHELL_FILES.filter((f) => !present.has(f))
      if (missing.length > 0) throw new Error(`壳清单缺文件：${missing.join(', ')}——构建形状变了，先修再发`)
      const files: ShellFile[] = []
      for (const rel of rels) {
        files.push({ path: rel, bytes: await readFile(`${outDir}/${rel}`) })
      }
      const snap = await buildShellSnapshot(files)
      await writeFile(`${outDir}/sw.js`, snap.sw)
    },
  }
}
