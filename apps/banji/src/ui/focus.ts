// 移动端键盘避让：聚焦即把卡片滚进视口，失焦收回视野。
// jsdom 无 scrollIntoView 实现 —— typeof 守卫让测试环境自然空转。
export type RevealBlock = 'center' | 'nearest'

export function revealInViewport(el: Element, block: RevealBlock): void {
  if (typeof el.scrollIntoView === 'function') el.scrollIntoView({ block })
}
