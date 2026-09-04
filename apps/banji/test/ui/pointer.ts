// jsdom 无 PointerEvent 构造器：以 MouseEvent 为壳、pointer 属性为肉，
// 事件的 type 仍是 'pointer*'，React 会正常路由到 onPointerDown/Move/Up。
export interface PointerInit {
  readonly x: number
  readonly y: number
  readonly id?: number
  readonly type?: string
}

function fire(el: Element, kind: 'pointerdown' | 'pointermove' | 'pointerup', init: PointerInit): void {
  const ev = new MouseEvent(kind, {
    bubbles: true,
    cancelable: true,
    clientX: init.x,
    clientY: init.y,
    button: 0,
  })
  Object.assign(ev, { pointerId: init.id ?? 1, pointerType: init.type ?? 'mouse', isPrimary: true })
  el.dispatchEvent(ev)
}

/** 单发指针事件：拆解拖拽中途断言（如 is-dropon 瞬态）用，走与 dragFrom 同一管线。 */
export function pointer(el: Element, kind: 'pointerdown' | 'pointermove' | 'pointerup', at: { readonly x: number; readonly y: number }): void {
  fire(el, kind, at)
}

/** 完整拖拽：按下 → 分步移动 → 抬起。threshold/commit 全走真实代码路径。 */
export function dragFrom(el: Element, from: { readonly x: number; readonly y: number }, to: { readonly x: number; readonly y: number }, steps = 4): void {
  fire(el, 'pointerdown', { x: from.x, y: from.y })
  for (let i = 1; i <= steps; i++) {
    fire(el, 'pointermove', { x: from.x + ((to.x - from.x) * i) / steps, y: from.y + ((to.y - from.y) * i) / steps })
  }
  fire(el, 'pointerup', { x: to.x, y: to.y })
}

export function tap(el: Element, at: { readonly x: number; readonly y: number } = { x: 0, y: 0 }): void {
  fire(el, 'pointerdown', at)
  fire(el, 'pointerup', at)
}
