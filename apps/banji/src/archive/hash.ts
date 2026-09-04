// sha256（冻结算法）。WebCrypto 的 subtle.digest 需要完整缓冲，因此采用
// createHashSubtle 的“分块喂入 + 终结一次摘要”形态：读取端（blob.slice / zip chunk）
// 保持有界分块，聚合缓冲仅在单资产生命周期内存在。Vitest/fake-indexeddb 环境 blob 很小；
// 真·流式摘要要等换实现，这里如实记录边界。

const DIGEST = 'SHA-256'
export const CHUNK_BYTES = 64 * 1024

export function bytesToHex(buf: ArrayBuffer | Uint8Array): string {
  const view = buf instanceof Uint8Array ? buf : new Uint8Array(buf)
  let out = ''
  for (const byte of view) out += byte.toString(16).padStart(2, '0')
  return out
}

export interface ChunkedHasher {
  push(chunk: Uint8Array): void
  digestHex(): Promise<string>
}

export function createHashSubtle(): ChunkedHasher {
  const parts: Uint8Array[] = []
  let total = 0
  return {
    push(chunk) {
      parts.push(chunk)
      total += chunk.byteLength
    },
    async digestHex() {
      const joined = new Uint8Array(total)
      let at = 0
      for (const p of parts) {
        joined.set(p, at)
        at += p.byteLength
      }
      const digest = await crypto.subtle.digest(DIGEST, joined)
      return bytesToHex(digest)
    },
  }
}

export async function sha256Hex(data: Uint8Array): Promise<string> {
  // slice() 得到 ArrayBuffer 支撑的拷贝：满足 BufferSource，且免疫 SharedArrayBuffer 输入。
  const digest = await crypto.subtle.digest(DIGEST, data.slice())
  return bytesToHex(digest)
}

/** 按 64KiB 切片读取 Blob 并喂给 hasher，聚合仍在 hasher 内部（见顶部边界说明）。 */
export async function hashBlob(blob: Blob): Promise<string> {
  const hasher = createHashSubtle()
  for (let offset = 0; offset < blob.size; offset += CHUNK_BYTES) {
    const slice = blob.slice(offset, Math.min(offset + CHUNK_BYTES, blob.size))
    hasher.push(new Uint8Array(await slice.arrayBuffer()))
  }
  return hasher.digestHex()
}

export async function blobBytes(blob: Blob): Promise<Uint8Array> {
  return new Uint8Array(await blob.arrayBuffer())
}
