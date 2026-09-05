import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent, ReactElement } from 'react'
import type { BanjiApp } from '../../application'
import type { ImportFailReason } from '../../archive/importArchive'
import type { ThemeId } from '../theme'
import { applyTheme } from '../theme'

type ImportStep = 'idle' | 'warn' | 'final' | 'running' | 'failed'

const REASON_COPY: Readonly<Partial<Record<ImportFailReason, string>>> = {
  zip_unreadable: '这个文件读不出伴记档案的样子（可能不完整），导入已止步；你现有的手札原样未动。',
  quota_exceeded: '浏览器留给伴记的存储不够放下这份档案，导入已止步；你现有的手札原样未动。',
  staging_failed: '档案数据暂存时出错，导入已止步；你现有的手札原样未动。',
  commit_failed: '最后写入时出错，已全部回滚；你现有的手札保持导入原样。',
  archive_too_new: '这份档案来自更新版本的伴记。先更新伴记，再导入即可；你的日记数据完好无损。',
  unknown_hash_algo: '这份档案用了伴记不认识的算法，为安全起见未导入；你现有的手札原样未动。',
  archive_shape: '档案结构与预期不符，未导入；你现有的手札原样未动。',
  migration_chain_broken: '档案的迁移路径不完整，未导入；你现有的手札原样未动。',
}

function failureCopy(reason: ImportFailReason, userMessage: string): string {
  const own = userMessage.trim()
  if (own !== '') return own
  return REASON_COPY[reason] ?? '导入未能完成；你现有的手札原样未动。'
}

interface SettingsDrawerProps {
  readonly app: BanjiApp
  readonly theme: ThemeId
  readonly onTheme: (t: ThemeId) => void
  readonly onImported: () => void
  readonly notify: (msg: string) => void
  readonly onClose: () => void
  /** ⌘E 直发导出：只读动作不给确认（R11·D5），开门即交卷。 */
  readonly autoExport?: boolean
}

export function SettingsDrawer({ app, theme, onTheme, onImported, notify, onClose, autoExport = false }: SettingsDrawerProps): ReactElement {
  const fileRef = useRef<HTMLInputElement>(null)
  const [picked, setPicked] = useState<File | null>(null)
  const [step, setStep] = useState<ImportStep>('idle')
  const [failure, setFailure] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // Esc 退场（R11·D5 巡检补的门）：纸片/纸单/牵线早有各自的出口，抽屉是最后一块漏的。
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  const pickFile = (e: ChangeEvent<HTMLInputElement>): void => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (f === undefined) return
    setPicked(f)
    setFailure(null)
    setStep('warn')
  }

  const runImport = async (): Promise<void> => {
    if (picked === null) return
    setStep('running')
    setBusy(true)
    try {
      const result = await app.importFromFile(picked)
      if (result.ok) {
        setStep('idle')
        setPicked(null)
        onImported()
        notify(`已导入：${String(result.stats.journals)} 天手札 · ${String(result.stats.cards)} 张卡片`)
      } else {
        setFailure(failureCopy(result.reason, result.userMessage))
        setStep('failed')
      }
    } finally {
      setBusy(false)
    }
  }

  const doExport = async (): Promise<void> => {
    setBusy(true)
    try {
      const { filename, archive } = await app.exportToFile()
      if (!archive.ok) {
        notify(archive.userMessage)
        return
      }
      const url = URL.createObjectURL(new Blob([archive.zip], { type: 'application/zip' }))
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      a.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
      notify('已保存到下载文件夹')
      setStep('idle')
    } finally {
      setBusy(false)
    }
  }

  const switchTheme = (t: ThemeId): void => {
    applyTheme(t)
    onTheme(t)
  }

  // autoExport 只在开门那一拍生效一次（挂载 effect、无重跑路径）：App 侧每次关闭都会归零。
  useEffect(() => {
    if (autoExport) void doExport()
  }, [])

  return (
    <>
      <div className="bj-scrim" onClick={onClose} />
      <aside className="bj-drawer" role="dialog" aria-label="设置">
        <header className="bj-drawer-head">
          <h2>设置</h2>
          <button type="button" className="bj-quiet-btn" aria-label="关闭设置" onClick={onClose}>
            合上
          </button>
        </header>

        <section className="bj-sec" aria-label="主题">
          <h3>纸色</h3>
          <div className="bj-seg">
            <button type="button" className={`bj-seg-btn${theme === 'light' ? ' is-on' : ''}`} onClick={() => switchTheme('light')}>
              宣纸
            </button>
            <button type="button" className={`bj-seg-btn${theme === 'night' ? ' is-on' : ''}`} onClick={() => switchTheme('night')}>
              夜读
            </button>
          </div>
        </section>

        <section className="bj-sec" aria-label="备份">
          <h3>手札档案</h3>
          <p className="bj-sec-note">档案是全量备份，换设备时可整本带走。</p>
          <button type="button" className="bj-btn" disabled={busy} onClick={() => void doExport()}>
            导出备份
          </button>
          {step === 'idle' || step === 'running' ? (
            <button type="button" className="bj-btn bj-btn-quiet" disabled={busy} onClick={() => fileRef.current?.click()}>
              导入备份
            </button>
          ) : null}
          <input ref={fileRef} type="file" accept=".banjizip" className="bj-hidden-file" onChange={pickFile} />

          {step === 'warn' || step === 'final' ? (
            <div className="bj-confirm">
              <p>导入的档案将完全替换现在的伴记，建议先导出一份旧手札。</p>
              {step === 'warn' ? (
                <div className="bj-menu-row">
                  <button type="button" onClick={() => setStep('idle')}>
                    再想想
                  </button>
                  <button type="button" className="bj-btn" onClick={() => setStep('final')}>
                    继续
                  </button>
                </div>
              ) : (
                <div className="bj-menu-row">
                  <button type="button" onClick={() => setStep('idle')}>
                    取消
                  </button>
                  <button type="button" className="bj-btn bj-danger" onClick={() => void runImport()}>
                    确认替换
                  </button>
                </div>
              )}
            </div>
          ) : null}
          {step === 'failed' && failure !== null ? (
            <div className="bj-confirm">
              <p>{failure}</p>
              <div className="bj-menu-row">
                <button type="button" onClick={() => setStep('idle')}>
                  知道了
                </button>
              </div>
            </div>
          ) : null}
        </section>

        <section className="bj-sec" aria-label="键术">
          <h3>键术</h3>
          <ul className="bj-keylist" data-keylist>
            <li><span>添一张卡</span><kbd>⌘/Ctrl N</kbd></li>
            <li><span>造一叠</span><kbd>⌘/Ctrl ⇧K</kbd></li>
            <li><span>搜遍全册</span><kbd>⌘/Ctrl F</kbd></li>
            <li><span>带走整册</span><kbd>⌘/Ctrl E</kbd></li>
            <li><span>退场 · 取消</span><kbd>Esc</kbd></li>
          </ul>
        </section>

        <p className="bj-drawer-foot">别的，以后慢慢来。</p>
      </aside>
    </>
  )
}
