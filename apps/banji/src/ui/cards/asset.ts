import { useEffect, useRef, useState } from 'react'
import type { AssetRecord } from '../../domain/types'
import type { BanjiApp } from '../../application'

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
