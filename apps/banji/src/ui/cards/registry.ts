// 卡片注册表：kind → 渲染器。新增卡片类型 = 在这里挂一行，核心（frame/day/store）零改动。
// 注册表外的 kind 走兜底渲染器：显示「暂不支持」，数据原样保留。
import type { CardRenderer } from './types'
import { textRenderer } from './text'
import { imageRenderer } from './image'
import { fileRenderer } from './file'
import { fallbackRenderer } from './fallback'

export type { CardRenderer, IconKind, RenderCtx } from './types'

const registry: ReadonlyMap<string, CardRenderer> = new Map([
  ['text', textRenderer],
  ['image', imageRenderer],
  ['file', fileRenderer],
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
