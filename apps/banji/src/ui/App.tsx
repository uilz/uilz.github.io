import { useCallback, useEffect, useState } from 'react'
import type { ReactElement } from 'react'
import type { BanjiApp } from '../application'
import { formatDate } from '../domain/date'
import { useHashRoute } from './router'
import { useDayStore } from './store'
import type { DayStoreOptions } from './store'
import { THEME_KEY, applyTheme, syncThemeFromStore } from './theme'
import type { ThemeId } from './theme'
import { CalendarView } from './components/CalendarView'
import { DayView } from './components/DayView'
import { SettingsDrawer } from './components/SettingsDrawer'

function todayOf(now: () => Date): string {
  const d = now()
  return formatDate(d.getFullYear(), d.getMonth() + 1, d.getDate())
}

interface ToastProps {
  readonly msg: string
  readonly actionLabel: string | null
  readonly onAction: (() => void) | null
  readonly alert: boolean
  readonly raised: boolean
}

// 全应用唯一回执通道：夹带没夹上、导入导出回话、保存失败回执共用这只“便签”。
// alert = 温赭描边（出事了但安静），plain = 发丝边（回话）。
function Toast({ msg, actionLabel, onAction, alert, raised }: ToastProps): ReactElement {
  return (
    <div className={`bj-toast${alert ? ' bj-toast-alert' : ''}${raised ? ' bj-toast-raised' : ''}`} role="status">
      <span>{msg}</span>
      {actionLabel !== null && onAction !== null ? (
        <button type="button" className="bj-toast-action" onClick={onAction}>
          {actionLabel}
        </button>
      ) : null}
    </div>
  )
}

interface AppProps {
  readonly app: BanjiApp
  readonly initialTheme: ThemeId
  readonly now?: () => Date
  readonly storeOptions?: DayStoreOptions
}

export function App({ app, initialTheme, now = () => new Date(), storeOptions }: AppProps): ReactElement {
  const route = useHashRoute()
  const [theme, setTheme] = useState<ThemeId>(initialTheme)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [toast, setToast] = useState<{ id: number; msg: string } | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const date = route.name === 'day' ? route.date : null
  const store = useDayStore(app, date, reloadKey, storeOptions)
  const today = todayOf(now)
  const { saveFailed, note } = store.state

  useEffect(() => {
    if (toast === null) return
    const t = window.setTimeout(() => setToast(null), 2600)
    return () => window.clearTimeout(t)
  }, [toast])

  useEffect(() => {
    if (note === null) return
    const t = window.setTimeout(() => store.actions.dismissNote(), 3200)
    return () => window.clearTimeout(t)
  }, [note, store.actions])

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

  const receipt =
    saveFailed > 0
      ? { msg: `${saveFailed === 1 ? '这一笔' : `这 ${String(saveFailed)} 笔`}没存上`, label: '再试' as const }
      : null
  const transient = note !== null ? note.msg : toast !== null ? toast.msg : null

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
      {receipt !== null ? (
        <Toast msg={receipt.msg} actionLabel={receipt.label} onAction={store.actions.retrySave} alert raised={false} />
      ) : null}
      {transient !== null ? (
        <Toast msg={transient} actionLabel={null} onAction={null} alert={note !== null} raised={receipt !== null} />
      ) : null}
    </div>
  )
}
