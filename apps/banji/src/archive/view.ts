// R13·D1/D2 敌手加固的导入读取：封面遍（名册闸 + 四个 JSON 字段，零字节资产解压）→
// 配额门（拿 manifest 承诺字节说话，诚实的大档案在解压任何东西之前就被拒）→
// 正文遍（名册上有名的资产才解，双闸封顶：本地头自报 vs 承诺+松弛 走闸一零代价，
// 谎报头则边解边数走闸二停喂）。校验本体仍住 preflight；这里只管「字节如何进内存」。
// R1 顺延债「真·流式解析大 ZIP 留给规模轮」随 streamZipEntries 闭账。
import { ASSET_DIR, FILE_EDGES, FILE_JOURNALS, FILE_MANIFEST, FILE_SETTINGS } from './format'
import { createHashSubtle, type ChunkedHasher } from './hash'
import { assetHashOf, declareAssets, GateFailure, isFieldName, nameLedger, SIZE_SLACK, type Declaration } from './guard'
import { chunksToBlob, joinChunks, streamZipEntries, type ZipSink } from './zip'
import type { AssetBody } from './preflight'

export interface Cover {
  readonly fields: ReadonlyMap<string, string>
  readonly declaration: Declaration | null
}

const utf8DecodeFatal = (bytes: Uint8Array): string => new TextDecoder('utf-8', { fatal: true }).decode(bytes)

/** 封面遍：条目名过账簿（非法/重名/爆数即在解压前拒），非定名字段（含全部资产正文）整段跳过不解。 */
export function readCover(zip: Uint8Array): Cover {
  const ledger = nameLedger()
  const buckets = new Map<string, Uint8Array<ArrayBuffer>[]>()
  streamZipEntries(zip, (head) => {
    ledger.claim(head.name)
    if (!isFieldName(head.name)) return null
    const chunks: Uint8Array<ArrayBuffer>[] = []
    buckets.set(head.name, chunks)
    const sink: ZipSink = { chunk: (d) => { chunks.push(d) } }
    return sink
  })
  const page = (name: string, where: 'manifest' | 'page'): string => {
    const chunks = buckets.get(name)
    if (chunks === undefined) {
      // 一条都未见 ⇒ 根本不是 ZIP 流：留白给 zip_unreadable（R1 锁定的垃圾输入话术，既有测试钉死）；
      // 见过条目却无名册才是「缺封面」这一独立病根。
      if (where === 'manifest' && ledger.seen() === 0) throw new Error('ZIP 中找不到 manifest.json（这不是伴记档案）')
      throw where === 'manifest' ? GateFailure.manifestMissing(ledger.seen()) : GateFailure.pagesMissing(name)
    }
    return utf8DecodeFatal(joinChunks(chunks))
  }
  const fields = new Map<string, string>()
  fields.set(FILE_MANIFEST, page(FILE_MANIFEST, 'manifest'))
  for (const name of [FILE_JOURNALS, FILE_EDGES, FILE_SETTINGS]) fields.set(name, page(name, 'page'))
  return { fields, declaration: declareAssets(fields.get(FILE_MANIFEST) ?? '') }
}

interface BodyBucket {
  readonly hash: string
  readonly chunks: Uint8Array<ArrayBuffer>[]
  readonly hasher: ChunkedHasher
  readonly promised: number
  counted: number
}

/**
 * 正文遍：册上无名的资产正文 = 谎言入场，解之前拒（orphan）；有名的先过闸一
 * （本地头自报 > 承诺+松弛 ⇒ 压缩区一字不解），再挂流式计数尺过闸二
 * （实解越界 ⇒ 该条即刻停喂、全场中止）。hash 随解随喂，事后仅终结一次。
 */
export async function readAssetBodies(zip: Uint8Array, declaration: Declaration): Promise<Map<string, AssetBody>> {
  const ledger = nameLedger()
  const buckets: BodyBucket[] = []
  streamZipEntries(zip, (head) => {
    ledger.claim(head.name)
    if (!head.name.startsWith(ASSET_DIR)) return null
    const hash = assetHashOf(head.name)
    if (hash === null) throw GateFailure.entryName(head.name)
    const promised = declaration.sizes.get(hash)
    if (promised === undefined) throw GateFailure.orphanBody(hash)
    if (head.declaredSize >= 0 && head.declaredSize > promised + SIZE_SLACK) throw GateFailure.headerOversize(hash, promised, head.declaredSize)
    const bucket: BodyBucket = { hash, chunks: [], hasher: createHashSubtle(), promised, counted: 0 }
    buckets.push(bucket)
    const limit = promised + SIZE_SLACK
    const sink: ZipSink = {
      chunk: (d) => {
        bucket.counted += d.byteLength
        if (bucket.counted > limit) throw GateFailure.streamOversize(hash, promised, bucket.counted)
        bucket.chunks.push(d)
        bucket.hasher.push(d)
      },
    }
    return sink
  })
  const assets = new Map<string, AssetBody>()
  for (const b of buckets) {
    assets.set(b.hash, { actualHash: await b.hasher.digestHex(), blob: chunksToBlob(b.chunks), size: b.counted })
  }
  return assets
}
