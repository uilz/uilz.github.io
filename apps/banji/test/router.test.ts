import { describe, expect, it } from 'vitest'
import { dayHref, parseHash } from '../src/ui/router'

describe('hash 路由：一切解析都是纯函数（back-safe 的地基）', () => {
  it('given 合法深链 when 解析 then 命中当天路由', () => {
    expect(parseHash('#/d/2026-01-15')).toEqual({ name: 'day', date: '2026-01-15' })
    expect(dayHref('2026-01-15')).toBe('#/d/2026-01-15')
  })

  it('given 空/未知/畸形 hash when 解析 then 一律回落月历、绝不抛', () => {
    expect(parseHash('')).toEqual({ name: 'calendar' })
    expect(parseHash('#/')).toEqual({ name: 'calendar' })
    expect(parseHash('#/whatever')).toEqual({ name: 'calendar' })
    expect(parseHash('#/d/2026-13-40')).toEqual({ name: 'calendar' })
    expect(parseHash('#/d/2026-1-5')).toEqual({ name: 'calendar' })
    expect(parseHash('#/d/2026-01-15/extra')).toEqual({ name: 'calendar' })
  })
})
