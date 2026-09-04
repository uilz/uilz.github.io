import type { BanjiApp } from '../application'

export type ThemeId = 'light' | 'night'

export const THEME_KEY = 'theme'
// localStorage 只作主题镜像（首帧前同步可读，防夜间用户开屏闪白）；IndexedDB 仍是权威存储。
export const THEME_MIRROR = 'banji:theme'

export function themeFromStored(value: unknown): ThemeId {
  return value === 'night' ? 'night' : 'light'
}

export function applyTheme(theme: ThemeId): void {
  document.documentElement.setAttribute('data-bj-theme', theme)
  try {
    window.localStorage.setItem(THEME_MIRROR, theme)
  } catch {
    /* 无痕模式等写不进镜像 —— 权威副本仍在 IDB，刷新即可恢复 */
  }
}

export function syncThemeFromStore(app: BanjiApp): Promise<ThemeId> {
  return app.getSetting(THEME_KEY).then((v) => themeFromStored(v))
}
