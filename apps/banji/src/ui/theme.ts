import type { BanjiApp } from '../application'

export type ThemeId = 'light' | 'night'

export const THEME_KEY = 'theme'
// localStorage 只作主题镜像（首帧前同步可读，防夜间用户开屏闪白）；IndexedDB 仍是权威存储。
export const THEME_MIRROR = 'banji:theme'

export function themeFromStored(value: unknown): ThemeId {
  return value === 'night' ? 'night' : 'light'
}

// 主题底色与 index.html 的静态 theme-color / 内联守卫保持同值。
export const THEME_PAPER: Record<ThemeId, string> = { light: '#f2ecdf', night: '#171310' }

export function applyThemeColor(theme: ThemeId): void {
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta !== null) meta.setAttribute('content', THEME_PAPER[theme])
}

export function applyTheme(theme: ThemeId): void {
  document.documentElement.setAttribute('data-bj-theme', theme)
  applyThemeColor(theme)
  try {
    window.localStorage.setItem(THEME_MIRROR, theme)
  } catch {
    /* 无痕模式等写不进镜像 —— 权威副本仍在 IDB，刷新即可恢复 */
  }
}

export function syncThemeFromStore(app: BanjiApp): Promise<ThemeId> {
  return app.getSetting(THEME_KEY).then((v) => themeFromStored(v))
}
