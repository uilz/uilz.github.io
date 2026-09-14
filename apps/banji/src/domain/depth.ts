// 时间纵深（V2-Iter1·F2）：日子离「今天」有多远的耳语口径。
// 纯字符串日序运算（diffDays），零 I/O 零本地时区——与 domain/date.ts 同一条铁律。
import { diffDays } from './date'

/** 纵深耳语：今天 → null（今天不需要自我介绍）；昨天 → 「昨天」；过去 N 日 → 「N 天前」；未来 → 「N 天后」。 */
export function depthLabel(date: string, today: string): string | null {
  const d = diffDays(today, date)
  if (d === 0) return null
  if (d === -1) return '昨天'
  if (d < -1) return `${String(-d)} 天前`
  return `${String(d)} 天后`
}
