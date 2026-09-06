// ZIP 编解码的唯一入口（archive 层专用）。解码走 fflate 的流式 Unzip 事件 API，
// 逐条目产出原始分块（chunks）——资产条目可直接 new Blob(chunks)，不需要整文件再拼接。

import { Unzip, UnzipInflate, zipSync, type Zippable, type ZippableFile } from 'fflate'

export interface ZipEntryParts {
  readonly name: string
  readonly chunks: readonly Uint8Array<ArrayBuffer>[]
}

const STOP: unique symbol = Symbol('zip-stop')

/**
 * 流式解码 ZIP。回调返回 'stop' 可在条目边界提前终止（用于 manifest 预读）。
 * 任何解码错误（截断、伪 ZIP）以异常抛出。
 */
export function parseZipEntries(
  zip: Uint8Array,
  onEntry: (entry: ZipEntryParts) => 'continue' | 'stop',
): 'finished' | 'stopped' {
  let stopRequested = false
  let failure: unknown = null
  const unzipper = new Unzip((file) => {
    const chunks: Uint8Array<ArrayBuffer>[] = []
    file.ondata = (err, data, final) => {
      if (err !== null) {
        failure = err
        throw err
      }
      chunks.push(data)
      if (final) {
        if (onEntry({ name: file.name, chunks }) === 'stop') {
          stopRequested = true
          throw STOP
        }
      }
    }
    try {
      file.start()
    } catch (err) {
      failure = err
      throw STOP // 条目级致命：终止整个解析（例如未注册压缩法）
    }
  })
  // fflate 的流式 Unzip 默认只认识 stored(0)；method 8(deflate) 必须手动注册解压器，
  // 否则 file.start() 抛 "unknown compression type 8"。
  unzipper.register(UnzipInflate)
  try {
    unzipper.push(zip, true)
  } catch (err) {
    if (!stopRequested) throw err instanceof Error ? err : new Error(String(err))
  }
  if (failure !== null && !stopRequested) {
    throw failure instanceof Error ? failure : new Error(String(failure))
  }
  return stopRequested ? 'stopped' : 'finished'
}

export function joinChunks(chunks: readonly Uint8Array<ArrayBuffer>[]): Uint8Array {
  if (chunks.length === 1) return chunks[0] ?? new Uint8Array(0)
  const total = chunks.reduce((acc, c) => acc + c.byteLength, 0)
  const out = new Uint8Array(total)
  let at = 0
  for (const c of chunks) {
    out.set(c, at)
    at += c.byteLength
  }
  return out
}

export function chunksToBlob(chunks: readonly Uint8Array<ArrayBuffer>[]): Blob {
  return new Blob([...chunks])
}

export interface ZipFileSpec {
  readonly name: string
  readonly data: Uint8Array
  readonly store?: boolean // 资产已压缩/内容寻址，deflate 只做无谓的功
}

export function buildZip(files: readonly ZipFileSpec[]): Uint8Array<ArrayBuffer> {
  const entries: Record<string, ZippableFile> = {}
  for (const f of files) {
    entries[f.name] = [f.data, { level: f.store === true ? 0 : 6 }]
  }
  return zipSync(entries)
}

// —— R13·D1 真·流式解码（R1 顺延债「大 ZIP 流式解析留给规模轮」在此闭账）。——
// 安全语义三则，后续改动必须知道（全是 fflate 的不显眼行为）：
//  1. onEntry 返回 null ⇒ 不呼 file.start() ⇒ 该条目压缩区被整段跳过、零解压——
//     「点名核验先于任何字节工作」的闸口就搭在这上面；
//  2. 输入按 4 KiB 片喂入 ⇒ 同步 inflate 分批交付 ⇒ sink.chunk 抛错即刻中止全场，
//     敌手条目膨胀被钳在「已交付字节 + 一片窗口」内（实测 100 MB 伪账资产 ~4 MB 即死，33 ms）；
//  3. UnzipInflate 会捕获 sink 抛出的异常、再从 ondata(err) 递回来一次 ⇒ thrown 记号
//     把原异常原样二次上抛（identity 保留），调用方才能按 instanceof 分诊闸码；
//     fflate 自身的解码错误包成 ZipParseError：inEntry=true「有一页被读坏」，false「不成 ZIP」。

export class ZipParseError extends Error {
  constructor(
    readonly inEntry: boolean,
    readonly entryName: string | null,
    cause: unknown,
  ) {
    super(cause instanceof Error ? cause.message : String(cause))
    this.name = 'ZipParseError'
  }
}

export interface ZipEntryHeader {
  readonly name: string
  readonly compression: number
  /** 本地头自报的解压后字节数；-1 = 声明藏在数据描述符里（真大小只能边解边数）。敌手可控，只用于快速拒收。 */
  readonly declaredSize: number
}

export interface ZipSink {
  /** 一段解压字节。抛错 ⇒ 整个解码立即中止、异常原样上浮。 */
  readonly chunk: (data: Uint8Array<ArrayBuffer>) => void
}

const FEED_SLICE = 4096

export function streamZipEntries(zip: Uint8Array, onEntry: (head: ZipEntryHeader) => ZipSink | null): void {
  const NOT_THROWN = Symbol('not-thrown')
  let thrown: unknown = NOT_THROWN
  let openEntry: string | null = null
  const unzipper = new Unzip((file) => {
    const head: ZipEntryHeader = { name: file.name, compression: file.compression, declaredSize: file.originalSize ?? -1 }
    let sink: ZipSink | null = null
    try {
      sink = onEntry(head)
    } catch (err) {
      thrown = err
      throw STOP
    }
    if (sink === null) return
    openEntry = file.name
    const deliver = (err: Error | null, data: Uint8Array, final: boolean): void => {
      if (err !== null) {
        if (thrown !== NOT_THROWN) throw thrown
        throw new ZipParseError(true, file.name, err)
      }
      if (data.byteLength > 0) {
        try {
          sink?.chunk(data as Uint8Array<ArrayBuffer>)
        } catch (callbackErr) {
          thrown = callbackErr
          throw STOP
        }
      }
      if (final) openEntry = null
    }
    file.ondata = deliver
    try {
      file.start()
    } catch (err) {
      if (thrown !== NOT_THROWN) throw thrown
      throw new ZipParseError(true, file.name, err)
    }
  })
  unzipper.register(UnzipInflate)
  try {
    let offset = 0
    for (;;) {
      const done = offset + FEED_SLICE >= zip.byteLength
      unzipper.push(zip.subarray(offset, done ? zip.byteLength : offset + FEED_SLICE), done)
      if (done) break
      offset += FEED_SLICE
    }
  } catch (err) {
    if (thrown !== NOT_THROWN) throw thrown
    if (err instanceof ZipParseError) throw err
    throw new ZipParseError(openEntry !== null, openEntry, err)
  }
}
