// Block/Inline → React 元素。文本永远以 React 子节点落地（自动转义），无 innerHTML。
import type { ReactElement, ReactNode } from 'react'
import type { Block, Inline } from './md'

function inlineNodes(runs: readonly Inline[], key: string): ReactNode[] {
  return runs.map((run, i): ReactNode => {
    const k = `${key}:${String(i)}`
    switch (run.t) {
      case 'text':
        return run.s
      case 'strong':
        return (
          <strong key={k}>{inlineNodes(run.c, k)}</strong>
        )
      case 'em':
        return (
          <em key={k}>{inlineNodes(run.c, k)}</em>
        )
      case 'code':
        return (
          <code key={k} className="bj-md-code">
            {run.s}
          </code>
        )
      case 'a':
        return (
          <a key={k} className="bj-md-a" href={run.href} target="_blank" rel="noreferrer noopener">
            {inlineNodes(run.c, k)}
          </a>
        )
    }
  })
}

export function MdView({ blocks }: { readonly blocks: readonly Block[] }): ReactElement {
  return (
    <div className="bj-md">
      {blocks.map((block, i): ReactNode => {
        const k = `b${String(i)}`
        switch (block.t) {
          case 'h': {
            const inner = inlineNodes(block.c, k)
            if (block.level === 1) return <h3 key={k}>{inner}</h3>
            if (block.level === 2) return <h4 key={k}>{inner}</h4>
            return <h5 key={k}>{inner}</h5>
          }
          case 'p':
            return <p key={k}>{inlineNodes(block.c, k)}</p>
          case 'ul':
            return (
              <ul key={k}>
                {block.items.map((item, j) => (
                  <li key={`i${String(j)}`}>{inlineNodes(item, `${k}:${String(j)}`)}</li>
                ))}
              </ul>
            )
          case 'ol':
            return (
              <ol key={k}>
                {block.items.map((item, j) => (
                  <li key={`i${String(j)}`}>{inlineNodes(item, `${k}:${String(j)}`)}</li>
                ))}
              </ol>
            )
          case 'pre':
            return (
              <pre key={k}>
                <code>{block.code}</code>
              </pre>
            )
        }
      })}
    </div>
  )
}
