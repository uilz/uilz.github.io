// 卡上浮笺三枚（R9·D6 自 CardFrame 析出）：种类菜单、撕下确认、重命名。
// 都是纸面原地的浮笺（复用 .bj-menu 一脉的样式），不引对话框——手札里没有 modal。
import { useState } from 'react'
import type { ReactElement } from 'react'

interface CardMenuProps {
  hasRename: boolean
  onRename(): void
  onLink(): void
  onDelete(): void
}

export function CardMenu({ hasRename, onRename, onLink, onDelete }: CardMenuProps): ReactElement {
  return (
    <div className="bj-menu">
      {hasRename ? (
        <button type="button" className="bj-menu-item" data-menu-rename onClick={onRename}>
          重命名此纸
        </button>
      ) : null}
      <button type="button" className="bj-menu-item" onClick={onLink}>
        牵线
      </button>
      <button type="button" className="bj-menu-item" onClick={onDelete}>
        删除
      </button>
    </div>
  )
}

interface DeleteConfirmPanelProps {
  copy: string
  onCancel(): void
  onConfirm(): void
}

export function DeleteConfirmPanel({ copy, onCancel, onConfirm }: DeleteConfirmPanelProps): ReactElement {
  return (
    <div className="bj-menu bj-menu-confirm" data-confirm-panel>
      <p>{copy}</p>
      <p className="bj-menu-note">撕下后十秒内可以再想想</p>
      <div className="bj-menu-row">
        <button type="button" onClick={onCancel}>
          取消
        </button>
        <button type="button" className="bj-danger" onClick={onConfirm}>
          确认删除
        </button>
      </div>
    </div>
  )
}

interface RenamePanelProps {
  /** 现名（仅本纸覆盖名 props.name；原件名/哈希是渲染期兜底，不进这里）。 */
  initial: string
  onCancel(): void
  /** 落笔：trim 后的覆盖名；空串=清除覆盖（assetLabel 语义），回到原件名。 */
  onCommit(name: string): void
}

export function RenamePanel({ initial, onCancel, onCommit }: RenamePanelProps): ReactElement {
  const [value, setValue] = useState(initial)
  const commit = (): void => onCommit(value.trim())
  return (
    <div className="bj-menu bj-menu-confirm" data-rename-panel>
      <p>重命名此纸</p>
      <input
        className="bj-rename-input"
        data-rename-input
        type="text"
        value={value}
        placeholder="留空回到原件名"
        autoFocus
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit()
          if (e.key === 'Escape') onCancel()
        }}
      />
      <p className="bj-menu-note">只改这张纸上的叫法 · 原件与同字的别纸都不动</p>
      <div className="bj-menu-row">
        <button type="button" onClick={onCancel}>
          取消
        </button>
        <button type="button" data-rename-commit onClick={commit}>
          署名
        </button>
      </div>
    </div>
  )
}
