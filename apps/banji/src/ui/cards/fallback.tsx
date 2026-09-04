import type { ReactElement } from 'react'
import type { CardRenderer } from './types'

// 兜底渲染器：不读也不写 props —— 任何持久化只会触碰 pos/size/z 这些与载荷无关的字段，
// 未来的卡片类型回到这版伴记时，载荷必须一字不差。
export const fallbackRenderer: CardRenderer = {
  displayName: '未知卡片',
  iconKind: 'mystery',
  editable: false,
  defaultSize: { w: 240, h: 72 },
  emptyDraft: () => ({}),
  render: (): ReactElement => <div className="bj-unknown">暂不支持的卡片 · 原样保留</div>,
}
