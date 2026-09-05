import { createRoot } from 'react-dom/client'
import { createBanjiApp } from './application'
import { openRepo } from './repository/repo'
import { App } from './ui/App'
import { applyTheme, themeFromStored } from './ui/theme'
import './ui/styles/base.css'
import './ui/styles/calendar.css'
import './ui/styles/journal.css'
import './ui/styles/card.css'
import './ui/styles/lines.css'
import './ui/styles/search.css'
import './ui/styles/graph.css'

// 首帧前定色：镜像值同步可得（夜读用户不闪白）；IndexedDB 的权威值随后校正。
const mirrored = (() => {
  try {
    return window.localStorage.getItem('banji:theme')
  } catch {
    return null
  }
})()
applyTheme(themeFromStored(mirrored))

const app = createBanjiApp(await openRepo())
const theme = themeFromStored(await app.getSetting('theme'))
applyTheme(theme)

const container = document.getElementById('root')
if (container !== null) {
  createRoot(container).render(<App app={app} initialTheme={theme} />)
}
