import { useCallback, useEffect, useState } from 'react'
import type { ReactElement } from 'react'
import type { BanjiApp } from '../application'
import { formatDate } from '../domain/date'
import { useHashRoute } from './router'
import { useDayStore } from './store'
import { THEME_KEY, applyTheme, syncThemeFromStore } from './theme'
import type { ThemeId } from './theme'
import { CalendarView } from './components/CalendarView'
import { DayView } from './components/DayView'
import { SettingsDrawer } from './components/SettingsDrawer'

function todayOf(now: () => Date): string {
  const d = now()
  return formatDate(d.getFullYear(), d.getMonth() + 1, d.getDate())
}

interface Toast {
  readonly id: number
  readonly msg: string
}

interface AppProps {
  readonly app: BanjiApp
  readonly initialTheme: ThemeId
  readonly now?: () => Date
}

export function App({ app, initialTheme, now = () => new Date() }: AppProps): ReactElement {
  const route = useHashRoute()
  const [theme, setTheme] = useState<ThemeId>(initialTheme)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [toast, setToast] = useState<Toast | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const date = route.name === 'day' ? route.date : null
  const store = useDayStore(app, date, reloadKey)
  const today = todayOf(now)

  useEffect(() => {
    if (toast === null) return
    const t = window.setTimeout(() => setToast(null), 2600)
    return () => window.clearTimeout(t)
  }, [toast])

  const notify = useCallback((msg: string): void => setToast({ id: Date.now(), msg }), [])

  const changeTheme = useCallback(
    (t: ThemeId): void => {
      setTheme(t)
      applyTheme(t)
      void app.setSetting(THEME_KEY, t)
    },
    [app],
  )

  const onImported = useCallback((): void => {
    // 档案即宇宙：全量替换后，月历打点、当日文档、主题都以库内新状态为准。
    setReloadKey((k) => k + 1)
    void syncThemeFromStore(app).then((t) => {
      applyTheme(t)
      setTheme(t)
    })
  }, [app])

  return (
    <div className="bj-app" data-route={route.name}>
      {route.name === 'calendar' ? (
        <CalendarView app={app} today={today} reloadKey={reloadKey} onOpenSettings={() => setDrawerOpen(true)} />
      ) : (
        <DayView key={route.date} app={app} date={route.date} store={store} onOpenSettings={() => setDrawerOpen(true)} />
      )}
      {drawerOpen ? (
        <SettingsDrawer
          app={app}
          theme={theme}
          onTheme={changeTheme}
          onImported={onImported}
          notify={notify}
          onClose={() => setDrawerOpen(false)}
        />
      ) : null}
      {toast !== null ? (
        <div className="bj-toast" key={toast.id} role="status">
          {toast.msg}
        </div>
      ) : null}
    </div>
  )
}
