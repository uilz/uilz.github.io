// 极小 hash 路由：#/ = 月历首页，#/d/YYYY-MM-DD = 当日手札。
// 无法识别的 hash 一律回落到月历（深链永远 back-safe）。
import { useEffect, useState } from 'react'
import { isValidDateString } from '../domain/date'

export type Route = { readonly name: 'calendar' } | { readonly name: 'day'; readonly date: string }

export function parseHash(hash: string): Route {
  const m = /^#\/d\/(\d{4}-\d{2}-\d{2})$/.exec(hash)
  const date = m?.[1]
  if (date !== undefined && isValidDateString(date)) return { name: 'day', date }
  return { name: 'calendar' }
}

export function dayHref(date: string): string {
  return `#/d/${date}`
}

export function subscribeHash(fn: () => void): () => void {
  window.addEventListener('hashchange', fn)
  return () => window.removeEventListener('hashchange', fn)
}

export function useHashRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash))
  useEffect(() => subscribeHash(() => setRoute(parseHash(window.location.hash))), [])
  return route
}
