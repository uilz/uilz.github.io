import { useEffect, useRef, useState } from 'react'
import type { AssetRecord } from '../../domain/types'
import type { BanjiApp } from '../../application'
import { isPlainObject } from '../../domain/validation'

export interface AssetView {
  readonly url: string | null
  readonly asset: AssetRecord | undefined
  readonly missing: boolean
  /** 原件即将交给新页（点击那一拍调用）：本 URL 的释放从「立即」改判为「宽限后」。 */
  readonly holdForHandoff: () => void
}

export interface AssetUrlOptions {
  readonly handoffHoldMs?: number
}

// Object URL 生命周期与卡片同生死：挂载取资产建 URL，卸载/换 hash 即 revoke。
// 建好的 url 住 ref（而非 effect 闭包里的 state），cleanup 永远拿得到最新那个去释放。
// （jsdom 无 createObjectURL，测试里 stub。）
// R13·D3 例外通道「交棒宽限」（handoffHoldMs）：火漆签把原件递给新页后，页内首屏还在
// 从这条 blob: 取数——卡片此刻换日/卸载就地 revoke 会掐死初载。拍板政策（假计时器可测）：
// 交过棒的 URL 不再立即 revoke，改挂 holdMs 超时释放；同纸再次交棒时旧棒由新棒顶替。
// 未交棒的卡（图/影/声/件）不配宽限，一字仍是即刻放——R9 原纪律原样。
export function useAssetUrl(app: BanjiApp, hash: string, options?: AssetUrlOptions): AssetView {
  const holdMs = options?.handoffHoldMs ?? 0
  const [url, setUrl] = useState<string | null>(null)
  const [asset, setAsset] = useState<AssetRecord | undefined>(undefined)
  const [missing, setMissing] = useState(false)
  const urlRef = useRef<string | null>(null)
  const openedRef = useRef(false)
  const holdRef = useRef<{ readonly timer: number; readonly url: string } | null>(null)
  useEffect(() => {
    let alive = true
    setMissing(false)
    void app.getAsset(hash).then((found) => {
      if (!alive) return
      if (found === undefined) {
        setMissing(true)
        return
      }
      const objectUrl = URL.createObjectURL(found.blob)
      if (!alive) {
        URL.revokeObjectURL(objectUrl)
        return
      }
      urlRef.current = objectUrl
      openedRef.current = false
      setAsset(found)
      setUrl(objectUrl)
    })
    return () => {
      alive = false
      const pending = urlRef.current
      urlRef.current = null
      const stale = holdRef.current
      if (stale !== null) {
        window.clearTimeout(stale.timer)
        holdRef.current = null
        URL.revokeObjectURL(stale.url)
      }
      if (pending === null) return
      if (holdMs > 0 && openedRef.current) {
        const held = pending
        holdRef.current = {
          timer: window.setTimeout(() => {
            URL.revokeObjectURL(held)
            if (holdRef.current?.url === held) holdRef.current = null
          }, holdMs),
          url: held,
        }
      } else {
        URL.revokeObjectURL(pending)
      }
    }
  }, [app, hash, holdMs])
  const holdForHandoff = (): void => {
    if (urlRef.current !== null) openedRef.current = true
  }
  return { url, asset, missing, holdForHandoff }
}

export function humanSize(bytes: number): string {
  if (bytes < 1024) return `${String(bytes)} B`
  if (bytes < 1024 * 1024) return `${String(Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/**
 * 资产卡的展示名唯一口径（R9·D6）：本纸覆盖名 → 原始入库名 → hash 前 8 位。
 * props.name 空串视同没有（撤销改名的落点）；资产记录 name 仍是原件名的权威，二者互不改写。
 */
export function assetLabel(propsName: unknown, asset: AssetRecord | undefined, hash: string): string {
  if (typeof propsName === 'string' && propsName !== '') return propsName
  if (asset !== undefined && asset.name !== undefined && asset.name !== '') return asset.name
  return `${hash.slice(0, 8)}…`
}

/** 资产 chip props 的唯一读形：hash 主键 + 保险字段逐项窄化（w/h 建议尺寸、name 展示覆盖）。 */
export function readAssetProps(raw: unknown): { readonly hash: string; readonly name?: string; readonly w?: number; readonly h?: number } {
  if (!isPlainObject(raw)) return { hash: '' }
  const hash = typeof raw['hash'] === 'string' ? raw['hash'] : ''
  const name = typeof raw['name'] === 'string' && raw['name'] !== '' ? raw['name'] : undefined
  const w = typeof raw['w'] === 'number' && Number.isFinite(raw['w']) ? raw['w'] : undefined
  const h = typeof raw['h'] === 'number' && Number.isFinite(raw['h']) ? raw['h'] : undefined
  return { hash, ...(name === undefined ? {} : { name }), ...(w === undefined ? {} : { w }), ...(h === undefined ? {} : { h }) }
}
