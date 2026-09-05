// 搜索底料缝（R8·D2）：loadAllAssetMeta 交出 {hash,name?,mime,size} 投影——blob 一字不过缝。
// 真 repo（fake-indexeddb）+ 真 createBanjiApp：不是对着 mock 自证。
import { afterEach, describe, expect, it } from 'vitest'
import { deleteDatabase, openRepo } from '../src/repository/repo'
import type { Repo } from '../src/repository/types'
import { createBanjiApp } from '../src/application'
import { FIXED_NOW } from './archiveFixtures'

let seq = 0
const open = async (): Promise<{ repo: Repo; name: string }> => {
  const name = `banji-meta-${String(++seq)}`
  return { repo: await openRepo({ name }), name }
}
const tracked: Array<() => Promise<void>> = []
afterEach(async () => {
  while (tracked.length > 0) await tracked.pop()?.()
})
const protect = (repo: Repo, name: string): void => {
  tracked.push(async () => {
    repo.close()
    await deleteDatabase(name)
  })
}

const fileOf = (name: string, bytes: number, type = 'image/png'): Blob & { name: string } => {
  const b = new Blob([new Uint8Array(bytes)], { type }) as Blob & { name: string }
  Object.defineProperty(b, 'name', { value: name })
  return b
}

describe('loadAllAssetMeta', () => {
  it('返回全量资产投影：字段 ⊆ {hash,name?,mime,size}，blob 绝不在返回记录里', async () => {
    const { repo, name } = await open()
    protect(repo, name)
    const app = createBanjiApp(repo, { now: () => FIXED_NOW })
    await app.addAsset(fileOf('槐花.png', 8))
    await app.addAsset(fileOf('合同.pdf', 16, 'application/pdf'))
    const metas = await app.loadAllAssetMeta()
    expect(metas).toHaveLength(2)
    for (const m of metas) {
      expect(Object.keys(m).sort()).toEqual(['hash', 'mime', 'name', 'size'])
      expect('blob' in m).toBe(false)
      expect('addedAt' in m).toBe(false)
    }
    expect(metas.map((m) => m.name).sort()).toEqual(['合同.pdf', '槐花.png'])
  })

  it('无名资产 name 键整个缺席（exactOptional 纪律）；空库返回空表', async () => {
    const { repo, name } = await open()
    protect(repo, name)
    const app = createBanjiApp(repo, { now: () => FIXED_NOW })
    expect(await app.loadAllAssetMeta()).toEqual([])
    await app.addAsset(new Blob([new Uint8Array(4)], { type: 'image/png' }))
    const [only] = await app.loadAllAssetMeta()
    expect(only).toBeDefined()
    expect('name' in (only ?? {})).toBe(false)
    expect(only?.mime).toBe('image/png')
  })
})
