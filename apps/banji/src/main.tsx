import { createRoot } from 'react-dom/client'

// 占位入口：真正的界面由后续 UI 单元实现，这里不渲染任何有意义的内容。
const container = document.getElementById('root')
if (container !== null) createRoot(container).render(null)
