import { describe, expect, it } from 'vitest'
import {
  addDays,
  daysInMonth,
  diffDays,
  formatDate,
  isValidDateString,
  monthMatrix,
  parseDateString,
  todayLocal,
  weekdayMondayIndex,
} from '../src/domain/date'
import { depthLabel } from '../src/domain/depth'
import { dateParts } from '../src/ui/labels'

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

// V2-Iter1·F2 时间纵深的算尺：diffDays 纯日序 + depthLabel 耳语矩阵（月/年边界实弹）。
describe('date: diffDays 纯字符串日序（V2-F2）', () => {
  it('同日=0；相邻=±1（方向：b − a）', () => {
    expect(diffDays('2026-01-15', '2026-01-15')).toBe(0)
    expect(diffDays('2026-01-15', '2026-01-16')).toBe(1)
    expect(diffDays('2026-01-16', '2026-01-15')).toBe(-1)
  })

  it('跨月/跨年/闰日边界不 off-by-one', () => {
    expect(diffDays('2026-02-28', '2026-03-01')).toBe(1) // 平年 2 月 28 天
    expect(diffDays('2024-02-28', '2024-02-29')).toBe(1) // 闰年 2 月 29 日存在
    expect(diffDays('2024-02-29', '2024-03-01')).toBe(1)
    expect(diffDays('2026-12-31', '2027-01-01')).toBe(1)
    expect(diffDays('2027-01-01', '2026-12-31')).toBe(-1)
    expect(diffDays('2026-01-01', '2026-12-31')).toBe(364)
    expect(() => diffDays('2026-01-15', '2026-01-45')).toThrowError(/非法日期/)
  })
})

describe('depth: 纵深耳语矩阵（V2-F2）', () => {
  const today = '2026-03-15'
  it('今天不自述；昨天一字；过去 N 天前；未来 N 天后', () => {
    expect(depthLabel(today, today)).toBeNull()
    expect(depthLabel('2026-03-14', today)).toBe('昨天')
    expect(depthLabel('2026-03-13', today)).toBe('2 天前')
    expect(depthLabel('2026-03-16', today)).toBe('1 天后')
    expect(depthLabel('2026-04-14', today)).toBe('30 天后')
  })

  it('月/年边界：跨月跨年的「昨天」与「N 天前」', () => {
    expect(depthLabel('2026-02-28', '2026-03-01')).toBe('昨天') // 跨月昨天
    expect(depthLabel('2025-12-31', '2026-01-01')).toBe('昨天') // 跨年昨天
    expect(depthLabel('2026-01-31', '2026-03-01')).toBe('29 天前')
    expect(depthLabel('2024-02-29', '2024-03-01')).toBe('昨天') // 闰日即昨天
    expect(depthLabel('2024-02-28', '2024-03-01')).toBe('2 天前') // 闰年多出一天
    expect(depthLabel('2027-01-01', '2026-12-31')).toBe('1 天后') // 跨年明天
  })
})

// V2-Iter1·F1 窄页眉的日期零件：同年 drop 年、异年留年、星期恒在（让位是 CSS 的事）。
describe('labels: dateParts 紧凑日期（V2-F1）', () => {
  it('同年：无年；异年：年现身；月日去零；星期在尾', () => {
    const same = dateParts('2026-09-06', '2026-03-15')
    expect(same.year).toBeNull()
    expect(same.md).toBe('9月6日')
    expect(same.weekday).toBe('· 周日')
    const other = dateParts('2025-12-28', '2026-03-15')
    expect(other.year).toBe('2025年')
    expect(other.md).toBe('12月28日')
    expect(other.weekday).toBe('· 周日')
  })
})
