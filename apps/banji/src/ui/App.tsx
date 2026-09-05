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
  readonly level: number
}

// 全应用唯一回执通道：撕下回执、夹带没夹上、导入导出回话、保存失败回执共用这只“便签”。
// alert = 温赭描边（出事了但安静），plain = 发丝边（回话/邀请）；level 是叠放席位，至多各一枚，不堆墙。
function Toast({ msg, actionLabel, onAction, alert, level }: ToastProps): ReactElement {
  const up = level === 1 ? ' bj-toast-up1' : level >= 2 ? ' bj-toast-up2' : ''
  return (
    <div className={`bj-toast${alert ? ' bj-toast-alert' : ''}${up}`} role="status">
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
    // 作废动作必须先于 reloadKey bump 同步执行：旧宇宙的待撤快照、debounce 窗里的
    // 编辑/剥离意图、拖拽瞬态全部随宇宙同批弃世（安全不变量，undo-lifecycle/import-discard 钉死）。
    store.actions.onUniverseReplaced()
    setReloadKey((k) => k + 1)
    void syncThemeFromStore(app).then((t) => {
      applyTheme(t)
      setTheme(t)
    })
  }, [app, store.actions])

  const receipt =
    saveFailed > 0
      ? { msg: `${saveFailed === 1 ? '这一笔' : `这 ${String(saveFailed)} 笔`}没存上`, label: '再试' as const }
      : null
  const undo = store.state.undo
  const undoReceipt = undo === null ? null : { msg: `已撕下 ${String(undo.count)} 张，`, label: '再想想' as const }
  const transient = note !== null ? note.msg : toast !== null ? toast.msg : null

  const pills: ReactElement[] = []
  if (undoReceipt !== null) {
    pills.push(
      <Toast key="undo" msg={undoReceipt.msg} actionLabel={undoReceipt.label} onAction={store.actions.undoDelete} alert={false} level={pills.length} />,
    )
  }
  if (receipt !== null) {
    pills.push(
      <Toast key="receipt" msg={receipt.msg} actionLabel={receipt.label} onAction={store.actions.retrySave} alert level={pills.length} />,
    )
  }
  if (transient !== null) {
    pills.push(<Toast key="transient" msg={transient} actionLabel={null} onAction={null} alert={note !== null} level={pills.length} />)
  }

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
      {pills}
    </div>
  )
}
