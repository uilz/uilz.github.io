// 日期工具 —— 关键铁律：'YYYY-MM-DD' 字符串永远只做字符串操作，
// 绝不 `new Date(s)` 解析（UTC 偏移会导致 off-by-one 日期错位）。
// 所有日历运算先把年月日拆成组件、用 Date.UTC 求日序、再用 getUTC* 还原组件，
// 全程不触碰本地时区语义（todayLocal 例外：它读的是本地时钟组件，本就是本地日期）。

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/

export interface YMD {
  readonly y: number
  readonly m: number
  readonly d: number
}

/** 'YYYY-MM-DD' 纯字符串+范围校验（闰年由月天数表兜底）。 */
export function isValidDateString(value: unknown): value is string {
  if (typeof value !== 'string') return false
  const m = DATE_RE.exec(value)
  if (m === null) return false
  const y = Number(m[1])
  const mo = Number(m[2])
  const d = Number(m[3])
  if (y < 1 || mo < 1 || mo > 12 || d < 1) return false
  return d <= daysInMonth(y, mo)
}

export function daysInMonth(y: number, m: number): number {
  // Date.UTC 的“第 0 天”= 上个月最后一天；组件构造，无字符串解析。
  if (m < 1 || m > 12) return 0
  return new Date(Date.UTC(y, m, 0)).getUTCDate()
}

/** 组件 → 'YYYY-MM-DD'。不校验范围（调用方保证）。 */
export function formatDate(y: number, m: number, d: number): string {
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

/** 'YYYY-MM-DD' → 组件；非法返回 null。纯字符串拆分。 */
export function parseDateString(value: string): YMD | null {
  if (!isValidDateString(value)) return null
  const parts = DATE_RE.exec(value)
  if (parts === null) return null
  return { y: Number(parts[1]), m: Number(parts[2]), d: Number(parts[3]) }
}

/** 今天（本地）的 'YYYY-MM-DD'，只取本地时钟组件。 */
export function todayLocal(): string {
  const now = new Date()
  return formatDate(now.getFullYear(), now.getMonth() + 1, now.getDate())
}

function toEpochDays(y: number, m: number, d: number): number {
  return Math.round(Date.UTC(y, m - 1, d) / 86_400_000)
}

function fromEpochDays(days: number): YMD {
  const dt = new Date(days * 86_400_000)
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() }
}

/** 日期字符串加减天数（跨月/跨年安全，内部是日序整数运算）。 */
export function addDays(date: string, n: number): string {
  const ymd = parseDateString(date)
  if (ymd === null) throw new Error(`addDays: 非法日期字符串: ${JSON.stringify(date)}`)
  const next = fromEpochDays(toEpochDays(ymd.y, ymd.m, ymd.d) + n)
  return formatDate(next.y, next.m, next.d)
}

/** 星期几：0=周一 … 6=周日（ISO 周，周一为一周之始）。 */
export function weekdayMondayIndex(date: string): number {
  const ymd = parseDateString(date)
  if (ymd === null) throw new Error(`weekdayMondayIndex: 非法日期字符串: ${JSON.stringify(date)}`)
  const dow = new Date(Date.UTC(ymd.y, ymd.m - 1, ymd.d)).getUTCDay()
  return (dow + 6) % 7
}

/**
 * 月历矩阵：6 行 × 7 列的 'YYYY-MM-DD'，周一开头，含相邻月填充。
 * 恒为 6×7=42 格（渲染层不需要处理行数变化）。
 */
export function monthMatrix(y: number, m: number): string[][] {
  if (!Number.isInteger(m) || m < 1 || m > 12) {
    throw new Error(`monthMatrix: 月份越界: ${String(m)}`)
  }
  if (!Number.isInteger(y) || y < 1) {
    throw new Error(`monthMatrix: 年份越界: ${String(y)}`)
  }
  const first = formatDate(y, m, 1)
  const offset = weekdayMondayIndex(first)
  const start = addDays(first, -offset)
  const grid: string[][] = []
  for (let row = 0; row < 6; row++) {
    const week: string[] = []
    for (let col = 0; col < 7; col++) {
      week.push(addDays(start, row * 7 + col))
    }
    grid.push(week)
  }
  return grid
}

/** 该日期所属月份（'YYYY-MM' 前缀比较，仍是字符串操作）。 */
export function monthOf(date: string): string {
  return date.slice(0, 7)
}
