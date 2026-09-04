import type { ReactElement } from 'react'
import type { CardRenderer } from './types'
import { MAT_MIN } from '../stackGeometry'

export const containerRenderer: CardRenderer = {
  displayName: '一叠',
  iconKind: 'stack',
  editable: false,
  defaultSize: MAT_MIN,
  emptyDraft: () => ({}),
  render: (_props, ctx): ReactElement => {
    const count = ctx.card.children?.length ?? 0
    return count === 0 ? (
      <p className="bj-stack-whisper">拖一张纸进来，它们就是一叠了</p>
    ) : (
      <p className="bj-stack-note">{`${String(count)} 张`}</p>
    )
  },
}
