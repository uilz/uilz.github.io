import { describe, expect, it } from 'vitest'
import {
  addDays,
  daysInMonth,
  formatDate,
  isValidDateString,
  monthMatrix,
  parseDateString,
  todayLocal,
  weekdayMondayIndex,
} from '../src/domain/date'

describe('date: 字符串日历（禁止 Date 解析路径）', () => {
  it('format/parse 往返', () => {
    for (const s of ['2026-01-15', '2028-02-29', '0001-01-01', '9999-12-31']) {
      const p = parseDateString(s)
      expect(p).not.toBeNull()
      expect(formatDate(p?.y ?? 0, p?.m ?? 0, p?.d ?? 0)).toBe(s)
    }
  })

  it('日期形状+范围校验', () => {
    expect(isValidDateString('2026-02-30')).toBe(false)
    expect(isValidDateString('2026-02-29')).toBe(false) // 2026 非闰年
    expect(isValidDateString('2028-02-29')).toBe(true)
    expect(isValidDateString('2026-13-01')).toBe(false)
    expect(isValidDateString('2026-1-1')).toBe(false)
    expect(isValidDateString('26-01-01')).toBe(false)
    expect(isValidDateString('2026-01-01T00:00')).toBe(false)
    expect(isValidDateString(42)).toBe(false)
    expect(isValidDateString('2026-04-31')).toBe(false)
    expect(daysInMonth(2026, 2)).toBe(28)
    expect(daysInMonth(2100, 2)).toBe(28) // 世纪非闰
    expect(daysInMonth(2000, 2)).toBe(29) // 四百年闰
  })

  it('todayLocal 与本地时钟组件一致', () => {
    const now = new Date()
    expect(todayLocal()).toBe(
      formatDate(now.getFullYear(), now.getMonth() + 1, now.getDate()),
    )
    expect(isValidDateString(todayLocal())).toBe(true)
  })

  it('addDays 跨月/跨年/闰日/回拨', () => {
    expect(addDays('2025-12-31', 1)).toBe('2026-01-01')
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31')
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29')
    expect(addDays('2028-02-29', 1)).toBe('2028-03-01')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
    expect(addDays('2026-01-15', 7 * 52)).toBe('2027-01-14')
    expect(addDays('2026-01-15', 0)).toBe('2026-01-15')
  })

  it('addDays 往返恒等（无时区漂移）', () => {
    for (const d of ['2026-03-08', '2026-11-01', '2026-12-31', '2027-01-01']) {
      expect(addDays(addDays(d, 1), -1)).toBe(d)
      expect(addDays(addDays(d, -1), 1)).toBe(d)
    }
  })

  it('monthMatrix 2026-09：周一开头、6×7、含八月填充', () => {
    const g = monthMatrix(2026, 9)
    expect(g).toHaveLength(6)
    for (const w of g) expect(w).toHaveLength(7)
    expect(g[0]?.[0]).toBe('2026-08-31') // 9-01 是周二，前一天是周一
    const flat = g.flat()
    expect(flat[1]).toBe('2026-09-01')
    expect(flat.some((d) => d.startsWith('2026-10'))).toBe(true)
    for (const w of g) {
      w.forEach((d, idx) => expect(weekdayMondayIndex(d)).toBe(idx))
    }
  })

  it('monthMatrix 行内连续且每周都从周一起', () => {
    for (const [y, m] of [[2026, 1], [2026, 2], [2027, 12], [2028, 2]] as const) {
      const g = monthMatrix(y, m)
      for (const w of g) {
        expect(weekdayMondayIndex(w[0] ?? '')).toBe(0)
        for (let i = 1; i < 7; i++) expect(addDays(w[0] ?? '', i)).toBe(w[i])
      }
    }
  })

  it('monthMatrix 越界月份抛错', () => {
    expect(() => monthMatrix(2026, 0)).toThrow()
    expect(() => monthMatrix(2026, 13)).toThrow()
    expect(() => addDays('不是日期', 1)).toThrow()
  })

  it('时区切换不改变任何日历输出（无 Date-parsing 依赖）', () => {
    const env = globalThis as unknown as { process: { env: Record<string, string | undefined> } }
    const before = env.process.env['TZ']
    const samples = {
      jan: monthMatrix(2026, 1),
      dec: monthMatrix(2026, 12),
      add: addDays('2026-12-31', 1),
      wd: weekdayMondayIndex('2026-09-04'),
    }
    env.process.env["TZ"] = 'America/New_York'
    const ny = {
      jan: monthMatrix(2026, 1),
      dec: monthMatrix(2026, 12),
      add: addDays('2026-12-31', 1),
      wd: weekdayMondayIndex('2026-09-04'),
    }
    env.process.env["TZ"] = 'Asia/Shanghai'
    const sh = {
      jan: monthMatrix(2026, 1),
      dec: monthMatrix(2026, 12),
      add: addDays('2026-12-31', 1),
      wd: weekdayMondayIndex('2026-09-04'),
    }
    env.process.env["TZ"] = before ?? "UTC"
    expect(ny).toEqual(samples)
    expect(sh).toEqual(samples)
    expect(samples.jan[0]?.[0]).toBe('2025-12-29') // 2026-01-01 周四 → 12-29 是当周周一
    expect(samples.dec[0]?.[0]).toBe('2026-11-30') // 2026-12-01 周二
    expect(samples.add).toBe('2027-01-01')
    expect(samples.wd).toBe(4) // 2026-09-04 周五
  })
})
