import { Unzip, UnzipInflate, zipSync, type Zippable, type ZippableFile } from 'fflate'

// ZIP 编解码的唯一入口（archive 层专用）。解码走 fflate 的流式 Unzip 事件 API，
// 逐条目产出原始分块（chunks）——资产条目可直接 new Blob(chunks)，不需要整文件再拼接。

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
  const unzipper = new Unzip((file) => {    const chunks: Uint8Array<ArrayBuffer>[] = []
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

export function buildZip(files: readonly ZipFileSpec[]): Uint8Array {
  const entries: Record<string, ZippableFile> = {}
  for (const f of files) {
    entries[f.name] = [f.data, { level: f.store === true ? 0 : 6 }]
  }
  return zipSync(entries)
}
