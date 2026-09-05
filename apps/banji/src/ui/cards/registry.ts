// 卡片注册表：kind → 渲染器。新增卡片类型 = 在这里挂一行，核心（frame/day/store）零改动。
// 注册表外的 kind 走兜底渲染器：显示「暂不支持」，数据原样保留。
// R9 卡型补齐：v1 契约 kind 联合自始声明的 6 个槽位（audio/video/pdf/markdown/code/link）在此落位——填槽不改契约。
import type { CardRenderer } from './types'
import { textRenderer } from './text'
import { imageRenderer } from './image'
import { fileRenderer } from './file'
import { audioRenderer } from './audio'
import { videoRenderer } from './video'
import { pdfRenderer } from './pdf'
import { markdownRenderer } from './markdown'
import { codeRenderer } from './code'
import { linkRenderer } from './link'
import { containerRenderer } from './container'
import { fallbackRenderer } from './fallback'

export type { CardRenderer, IconKind, RenderCtx } from './types'
export { fallbackRenderer } from './fallback'

const registry: ReadonlyMap<string, CardRenderer> = new Map([
  ['text', textRenderer],
  ['image', imageRenderer],
  ['file', fileRenderer],
  ['audio', audioRenderer],
  ['video', videoRenderer],
  ['pdf', pdfRenderer],
  ['markdown', markdownRenderer],
  ['code', codeRenderer],
  ['link', linkRenderer],
  ['container', containerRenderer],
])

/** 已知 kind 返回其渲染器；未登记 kind 返回 undefined（调用方决定是否报错——显示层不要）。 */
export function rendererFor(kind: string): CardRenderer | undefined {
  return registry.get(kind)
}

/** 显示层唯一入口：任何 kind 都能得到可渲染的东西。 */
export function resolveRenderer(kind: string): CardRenderer {
  const found = rendererFor(kind)
  return found ?? fallbackRenderer
}
