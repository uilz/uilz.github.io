// @vitest-environment jsdom
// 夹带管线（attachPipeline）单元面：ghost 生平（挂出→熄灭）、addAsset→addCard 的逐字草稿、
// 失败回执文案。UI 端到端三面（attach.test/dayview/live）已在；这里钉单元契约不回归。
import { describe, expect, it, vi } from 'vitest'
import type { AssetInput, AssetRecord, BanjiApp } from '../../src/application'
import type { Card, CardId } from '../../src/domain/types'
import type { Action, DayState } from '../../src/ui/dayState'
import { createAttachPipeline } from '../../src/ui/attachPipeline'
import { sha256Hex } from '../../src/archive/hash'
import { initialDayState } from '../../src/ui/dayState'

type SeamPick = Pick<BanjiApp, 'addAsset' | 'addCard'>

const DAY = '2026-01-15'

function mkFile(name: string, type: string, bytes: number[]): File {
  return new File([Uint8Array.from(bytes)], name, { type })
}

async function drain(chainQ: (() => Promise<unknown>)[]): Promise<void> {
  let task: (() => Promise<unknown>) | undefined
  while ((task = chainQ.shift()) !== undefined) await task()
}

function harness(over: Partial<SeamPick> = {}, state: DayState = { ...initialDayState, date: DAY, loaded: true }): {
  actions: Action[]
  app: SeamPick
  chainQ: (() => Promise<unknown>)[]
  pipeline: ReturnType<typeof createAttachPipeline>
} {
  const actions: Action[] = []
  const chainQ: (() => Promise<unknown>)[] = []
  const app: SeamPick = {
    addAsset: vi.fn(async (file: AssetInput): Promise<AssetRecord> => ({
      hash: await sha256Hex(new Uint8Array(await file.arrayBuffer())),
      mime: file.type ?? 'application/octet-stream',
      size: file.size,
      addedAt: '',
      blob: file,
      ...(file.name === undefined ? {} : { name: file.name }),
    })),
    addCard: vi.fn(async (_date: string, draft: Parameters<SeamPick['addCard']>[1]): Promise<Card> => ({
      id: 'made-1' as CardId,
      kind: draft.kind,
      pos: draft.pos ?? { x: 0, y: 0 },
      size: draft.size ?? { w: 320, h: 200 },
      props: structuredClone(draft.props),
      createdAt: '',
      updatedAt: '',
      ...(draft.z === undefined ? {} : { z: draft.z }),
    })),
    ...over,
  }
  const pipeline = createAttachPipeline({
    app,
    chain: (fn) => {
      chainQ.push(fn)
    },
    dispatch: (a) => actions.push(a),
    getState: () => state,
    probe: async () => ({ w: 800, h: 600 }),
    nextNoteId: () => 7,
  })
  return { actions, app, chainQ, pipeline }
}

const ghosts = (as: Action[]): number[] => as.flatMap((a) => (a.type === 'ghost/add' ? [a.ghost.token] : []))
const notes = (as: Action[]): string[] => as.flatMap((a) => (a.type === 'note/set' ? [a.msg] : []))

describe('夹带管线（单元面）', () => {
  it('图片：挂虚影→(链上)addAsset→addCard 草稿逐字→虚影熄灭→card/added(edit=false)', async () => {
    const h = harness()
    const f = mkFile('甲.png', 'image/png', [1, 2, 3, 4])
    h.pipeline.attach([f], { x: 320, y: 380 })
    expect(ghosts(h.actions)).toEqual([1]) // token 从管线私号递增、虚影先于缝挂出
    expect(h.app.addCard).not.toHaveBeenCalled() // 链还没排空：诚实等待
    await drain(h.chainQ)
    expect(h.app.addAsset).toHaveBeenCalledWith(f)
    const [day, draft] = vi.mocked(h.app.addCard).mock.calls[0] ?? []
    expect(day).toBe(DAY)
    const hash = await sha256Hex(Uint8Array.from([1, 2, 3, 4]))
    expect(draft).toMatchObject({ kind: 'image', props: { hash, w: 420, h: 315 }, pos: { x: 320, y: 380 }, size: { w: 448, h: 341 }, z: 1 })
    expect(h.actions.some((a) => a.type === 'ghost/remove')).toBe(true)
    expect(h.actions.some((a) => a.type === 'card/added' && a.edit === false)).toBe(true)
  })

  it('多份落定错位：无指针走瀑布、24px 阶梯、z 每张 +0.5 分层', async () => {
    const h = harness()
    h.pipeline.attach([mkFile('a.png', 'image/png', [1]), mkFile('b.png', 'image/png', [2])], null)
    await drain(h.chainQ)
    const drafts = vi.mocked(h.app.addCard).mock.calls.map(([, d]) => d)
    expect(new Set(drafts.map((d) => JSON.stringify(d.pos))).size).toBe(2)
    expect(drafts.map((d) => d.z)).toEqual([1, 1.5])
  })

  it('addAsset 拒绝：虚影照样熄灭、回执走 attachFailureCopy 文案、addCard 一字不派', async () => {
    const h = harness({ addAsset: vi.fn(async (): Promise<AssetRecord> => {
      throw new DOMException('quota', 'QuotaExceededError')
    }) })
    h.pipeline.attach([mkFile('大.png', 'image/png', [9])], { x: 1, y: 2 })
    await drain(h.chainQ)
    expect(ghosts(h.actions)).toEqual([1])
    expect(notes(h.actions)).toEqual(['这一份没夹上 · 手机的存储空间不够了，先导出或清理一些吧'])
    expect(h.actions.some((a) => a.type === 'ghost/remove')).toBe(true)
    expect(h.app.addCard).not.toHaveBeenCalled()
  })

  it('空文件单/未开窗（date=null）：零动作（连虚影也不许挂）', async () => {
    const h = harness({}, { ...initialDayState, loaded: true }) // date null
    h.pipeline.attach([], { x: 0, y: 0 })
    h.pipeline.attach([mkFile('x.png', 'image/png', [1])], { x: 0, y: 0 })
    await drain(h.chainQ)
    expect(h.actions).toHaveLength(0)
  })
})
