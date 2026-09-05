import { useEffect, useRef, useState } from 'react'
import type { AssetRecord } from '../../domain/types'
import type { BanjiApp } from '../../application'
import { isPlainObject } from '../../domain/validation'

export interface AssetView {
  readonly url: string | null
  readonly asset: AssetRecord | undefined
  readonly missing: boolean
}

// Object URL 生命周期与卡片同生死：挂载取资产建 URL，卸载/换 hash 即 revoke。
// 建好的 url 住 ref（而非 effect 闭包里的 state），cleanup 永远拿得到最新那个去释放。
// （jsdom 无 createObjectURL，测试里 stub。）
export function useAssetUrl(app: BanjiApp, hash: string): AssetView {
  const [url, setUrl] = useState<string | null>(null)
  const [asset, setAsset] = useState<AssetRecord | undefined>(undefined)
  const [missing, setMissing] = useState(false)
  const urlRef = useRef<string | null>(null)
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
      setAsset(found)
      setUrl(objectUrl)
    })
    return () => {
      alive = false
      if (urlRef.current !== null) {
        URL.revokeObjectURL(urlRef.current)
        urlRef.current = null
      }
    }
  }, [app, hash])
  return { url, asset, missing }
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
