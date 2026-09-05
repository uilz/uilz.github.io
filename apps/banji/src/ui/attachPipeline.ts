// 夹带管线（R2 附件闭环）独立成一等编排单元：ghost 虚影生平、addAsset→探尺→addCard、失败文案归一。
// 全程跑在核心注入的同一条串行链上（chain），绝不另起第二链；落笔前的结算（flushNow）亦由核心注入。
// ghost/回执计数只住 dispatch 与内存：存储契约里没有它们的一行。
import type { BanjiApp } from '../application'
import type { CardPos } from '../domain/types'
import { resolveRenderer } from './cards/registry'
import { attachKind, clampCardPos, dropAt, fitWithin, imageCardSize, imageFitMaxW, scatterPos, viewportWidthNow } from './placement'
import { sortByZ } from './stackGeometry'
import { attachFailureCopy, type ImageProber } from './probe'
import type { Action, DayState } from './dayState'

export interface AttachPipelineDeps {
  readonly app: Pick<BanjiApp, 'addAsset' | 'addCard'>
  readonly chain: (fn: () => Promise<unknown>) => void
  readonly dispatch: (action: Action) => void
  /** 纸面现况的唯一读口径（ghost 占位与 maxZ 抬层都要看当前卡）。 */
  readonly getState: () => DayState
  readonly probe: ImageProber
  /** 回执序号由核心统一发号（夹带与拓扑闸共用一条便签序列，id 永不碰撞）。 */
  readonly nextNoteId: () => number
  /** 落笔前先结算在途编辑（唯一链的排队口径）。 */
  readonly flushNow: () => void
}

export interface AttachPipeline {
  /** 三把手汇成的一条管线：at=null 走瀑布落点，否则指针处落卡（多份 24px 阶梯）。 */
  attach(files: readonly File[], at: CardPos | null): void
  /** 添一张卡/造一张叠共用的新生管线（R7 自 store 迁入，守编排机各归其位的拆分纪律）。 */
  spawn(kind: 'text' | 'container', edit: boolean): void
}

export function createAttachPipeline(deps: AttachPipelineDeps): AttachPipeline {
  const { app, chain, dispatch, getState, probe, flushNow } = deps

  let seq = 0

  const attachOne = (token: number, day: string, file: File, pos: CardPos, order: number): void => {
    const kind = attachKind(file.type)
    dispatch({ type: 'ghost/add', ghost: { token, kind, name: file.name, pos, size: resolveRenderer(kind).defaultSize } })
    chain(async () => {
      const vanish = (): void => {
        dispatch({ type: 'ghost/remove', token })
      }
      try {
        const record = await app.addAsset(file)
        let props: Record<string, unknown> = { hash: record.hash }
        let size = resolveRenderer(kind).defaultSize
        if (kind === 'image') {
          const nat = await probe(file)
          if (nat !== null) {
            // 创建期定宽公式唯一住在 imageFitMaxW：手机收进屏内，桌面封顶不变。
            const maxW = imageFitMaxW(viewportWidthNow())
            const fit = fitWithin(nat.w, nat.h, maxW)
            props = { hash: record.hash, w: fit.w, h: fit.h }
            size = imageCardSize(nat.w, nat.h, maxW)
          }
        }
        const maxZ = sortByZ(getState().cards).at(-1)?.z ?? 0
        const card = await app.addCard(day, { kind, props, pos, size, z: maxZ + 1 + order * 0.5 })
        vanish()
        if (getState().date === day) dispatch({ type: 'card/added', card, edit: false })
      } catch (err) {
        vanish()
        dispatch({ type: 'note/set', id: deps.nextNoteId(), msg: attachFailureCopy(err) })
      }
    })
  }

  return {
    spawn(kind, edit) {
      const current = getState()
      const day = current.date
      if (day === null) return
      flushNow()
      const renderer = resolveRenderer(kind)
      const pos = scatterPos(current.cards.length + current.ghosts.length, viewportWidthNow())
      const maxZ = sortByZ(current.cards).at(-1)?.z ?? 0
      chain(async () => {
        const card = await app.addCard(day, { kind, props: renderer.emptyDraft(pos), pos, size: renderer.defaultSize, z: maxZ + 1 })
        if (getState().date === day) dispatch({ type: 'card/added', card, edit })
      })
    },
    attach(files, at) {
      const state = getState()
      const day = state.date
      if (day === null || files.length === 0) return
      files.forEach((file, k) => {
        const pos = at !== null ? dropAt(clampCardPos(at), k) : scatterPos(state.cards.length + state.ghosts.length + k, viewportWidthNow())
        attachOne(++seq, day, file, pos, k)
      })
    },
  }
}
