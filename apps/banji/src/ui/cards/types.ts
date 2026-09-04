import type { ReactElement } from 'react'
import type { BanjiApp } from '../../application'
import type { Card, CardPos } from '../../domain/types'

export type IconKind = 'text' | 'image' | 'file' | 'mystery'

/** 渲染器能向中介索取的全部能力。setProps 是增量合并，不是整包替换。 */
export interface RenderCtx {
  readonly app: BanjiApp
  readonly date: string
  readonly card: Card
  readonly selected: boolean
  readonly editing: boolean
  enterEdit(): void
  exitEdit(): void
  setProps(patch: Record<string, unknown>): void
}

export interface CardRenderer {
  readonly displayName: string
  readonly iconKind: IconKind
  readonly editable: boolean
  readonly defaultSize: { readonly w: number; readonly h: number }
  emptyDraft(pos: CardPos): Record<string, unknown>
  render(props: unknown, ctx: RenderCtx): ReactElement
}
