import { describe, expect, it } from 'vitest'
import { attachFailureCopy } from '../../src/ui/probe'

describe('夹带失败回执：根因分三条人话（复用同一 Toast 通道）', () => {
  it('配额满：给出路（先导出或清理），不复用旧"纸面快满了"含糊文案', () => {
    const msg = attachFailureCopy(new DOMException('quota', 'QuotaExceededError'))
    expect(msg).toContain('手机的存储空间不够了')
    expect(msg).toContain('导出')
  })

  it('读失败（NotReadableError）：只说"没能读进来·再试"，不误报空间不足', () => {
    const msg = attachFailureCopy(new DOMException('read', 'NotReadableError'))
    expect(msg).toBe('这一份没能读进来 · 再试一次')
    expect(msg).not.toContain('空间')
  })

  it('读失败的 TypeError 呈现也归"读不进来"', () => {
    expect(attachFailureCopy(new TypeError('blob revoked'))).toBe('这一份没能读进来 · 再试一次')
  })

  it('未知根因：保守兜底，三种文案两两不同', () => {
    const quota = attachFailureCopy(new DOMException('q', 'QuotaExceededError'))
    const read = attachFailureCopy(new DOMException('r', 'NotReadableError'))
    const unknown = attachFailureCopy(new Error('炸了'))
    expect(unknown).toBe('这一份没夹上 · 再试一次')
    expect(new Set([quota, read, unknown]).size).toBe(3)
  })
})
