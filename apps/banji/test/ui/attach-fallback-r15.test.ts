// R15·D1 探针能力回落（钉「不可解码图的洞」）：探不出=这台机器展不开，≠这文件不能收。
// 规格第 6 条「支持任意文件作为附件，未知类型至少可保存和导出」——image/video mime 下
// probe 返回 null（真 probeImageSize/probeVideoSize 解不开的落点）或直接 reject（注入探针
// 的同义信号），管线一律落**文件卡**收原件：同一条链上 addCard 一字不少、note/set 一笔不见
// （安静成交，无回执戏）、hash/name/mime 全归资产记录（资产库按契约 mime 中立）。
// 探测成功（可解码）分毫不动；addAsset 真失败（配额/读盘）仍是响亮的错误回执——回落的只有能力。
// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import type { AssetInput, AssetRecord, BanjiApp } from '../../src/application'
import type { Card, CardId } from '../../src/domain/types'
import type { CardSize } from '../../src/domain/types'
import type { Action, DayState } from '../../src/ui/dayState'
import { createAttachPipeline } from '../../src/ui/attachPipeline'
import { initialDayState } from '../../src/ui/dayState'
import { sha256Hex } from '../../src/archive/hash'

type SeamPick = Pick<BanjiApp, 'addAsset' | 'addCard'>
const DAY = '2026-01-15'
const PROBE_FAIL = new TypeError('This image could not be decoded')

function mkFile(name: string, type: string, bytes: number[]): File {
  return new File([Uint8Array.from(bytes)], name, { type })
}

function harness(probe: (file: Blob) => Promise<CardSize | null>, probeVideo: (file: Blob) => Promise<CardSize | null>, state: DayState = { ...initialDayState, date: DAY, loaded: true }) {
  const actions: Action[] = []
  const chainQ: (() => Promise<unknown>)[] = []
  const app: SeamPick = {
    addAsset: async (file: AssetInput): Promise<AssetRecord> => ({
      hash: await sha256Hex(new Uint8Array(await file.arrayBuffer())),
      mime: file.type ?? 'application/octet-stream',
      size: file.size,
      addedAt: '',
      blob: file,
      ...(file.name === undefined ? {} : { name: file.name }),
    }),
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
  }
  const pipeline = createAttachPipeline({
    app,
    flushNow: () => undefined,
    chain: (fn) => { chainQ.push(fn) },
    dispatch: (a) => { actions.push(a) },
    getState: () => state,
    probe,
    probeVideo,
    nextNoteId: () => 7,
  })
  const drain = async (): Promise<void> => {
    let task: (() => Promise<unknown>) | undefined
    while ((task = chainQ.shift()) !== undefined) await task()
  }
  return { actions, app, pipeline, drain, drafts: () => vi.mocked(app.addCard).mock.calls.map(([, d]) => d) }
}

const notes = (as: Action[]): string[] => as.flatMap((a) => (a.type === 'note/set' ? [a.msg] : []))
const rejects = (file: Blob): Promise<CardSize | null> => { void file; return Promise.reject(PROBE_FAIL) }
const undecodable = (file: Blob): Promise<CardSize | null> => { void file; return Promise.resolve(null) }
const decodable: (file: Blob) => Promise<CardSize | null> = async () => ({ w: 800, h: 600 })

describe('R15·D1 探针能力回落：展不开≠收不下', () => {
  it('图纸 probe 返回 null（真 HEIC 落点）：落文件卡收原件，零回执戏', async () => {
    const h = harness(undecodable, undecodable)
    const f = mkFile('IMG_0001.HEIC', 'image/heic', [1, 2, 3, 4])
    h.pipeline.attach([f], { x: 40, y: 60 })
    await h.drain()
    expect(notes(h.actions)).toEqual([])
    const [draft] = h.drafts()
    expect(draft?.kind).toBe('file')
    const hash = await sha256Hex(Uint8Array.from([1, 2, 3, 4]))
    expect(draft?.props).toEqual({ hash })
    expect(draft?.size).toEqual({ w: 260, h: 64 }) // 文件渲染器默认身量，不再冒充图纸
    expect(h.actions.some((a) => a.type === 'card/added')).toBe(true)
  })

  it('图纸 probe 直接 reject（注入探针的同义信号）：同一落点，错误不吞 addAsset 的账', async () => {
    const h = harness(rejects, rejects)
    h.pipeline.attach([mkFile('假图.png', 'image/png', [1])], { x: 1, y: 2 })
    await h.drain()
    expect(notes(h.actions)).toEqual([])
    expect(h.drafts()[0]?.kind).toBe('file')
  })

  it('影纸 probe null / reject 同归文件卡（表亲同款）', async () => {
    const a = harness(decodable, undecodable)
    a.pipeline.attach([mkFile('片段.mkv', 'video/x-matroska', [7])], { x: 0, y: 0 })
    await a.drain()
    expect(notes(a.actions)).toEqual([])
    expect(a.drafts()[0]?.kind).toBe('file')

    const b = harness(decodable, rejects)
    b.pipeline.attach([mkFile('片段2.mkv', 'video/x-matroska', [8])], { x: 0, y: 0 })
    await b.drain()
    expect(notes(b.actions)).toEqual([])
    expect(b.drafts()[0]?.kind).toBe('file')
  })

  it('声音纸不过探针：audio 照常落声音卡（能力回落在探得动的型上）', async () => {
    const spy = vi.fn(rejects)
    const h = harness(spy, spy)
    h.pipeline.attach([mkFile('晨曲.wav', 'audio/wav', [1])], { x: 0, y: 0 })
    await h.drain()
    expect(spy).not.toHaveBeenCalled()
    expect(h.drafts()[0]?.kind).toBe('audio')
  })

  it('探测成功=旧行为一字不动：image/video 各归各型、w/h 封顶照旧', async () => {
    const h = harness(decodable, decodable)
    h.pipeline.attach([mkFile('雨后.png', 'image/png', [1, 2, 3, 4])], { x: 320, y: 380 })
    await h.drain()
    const hash = await sha256Hex(Uint8Array.from([1, 2, 3, 4]))
    expect(h.drafts()[0]).toMatchObject({ kind: 'image', props: { hash, w: 420, h: 315 }, size: { w: 448, h: 341 } })
    const v = harness(decodable, decodable)
    v.pipeline.attach([mkFile('庭院.webm', 'video/webm', [1])], { x: 0, y: 0 })
    await v.drain()
    expect(v.drafts()[0]?.kind).toBe('video')
  })

  it('pdf/未知 mime 不探不解：路由表 purity 不被回流动机污染', async () => {
    const spy = vi.fn(rejects)
    const h = harness(spy, spy)
    h.pipeline.attach([mkFile('合同.pdf', 'application/pdf', [1]), mkFile('神秘.bin', '', [2])], { x: 0, y: 0 })
    await h.drain()
    expect(spy).not.toHaveBeenCalled()
    expect(h.drafts().map((d) => d.kind)).toEqual(['pdf', 'file'])
  })

  it('addAsset 真失败（配额）仍是响亮错误回执——回落只救能力，不吞账', async () => {
    const actions: Action[] = []
    const chainQ: (() => Promise<unknown>)[] = []
    const app: SeamPick = {
      addAsset: async (): Promise<AssetRecord> => { throw new DOMException('quota', 'QuotaExceededError') },
      addCard: vi.fn(async (): Promise<Card> => { throw new Error('unreachable') }),
    }
    const pipeline = createAttachPipeline({
      app, flushNow: () => undefined, chain: (fn) => { chainQ.push(fn) }, dispatch: (a) => { actions.push(a) },
      getState: (): DayState => ({ ...initialDayState, date: DAY, loaded: true }),
      probe: decodable, probeVideo: decodable, nextNoteId: () => 7,
    })
    pipeline.attach([mkFile('大.png', 'image/png', [9])], { x: 1, y: 2 })
    let task: (() => Promise<unknown>) | undefined
    while ((task = chainQ.shift()) !== undefined) await task()
    expect(notes(actions)).toEqual(['这一份没夹上 · 手机的存储空间不够了，先导出或清理一些吧'])
    expect(app.addCard).not.toHaveBeenCalled()
  })
})
