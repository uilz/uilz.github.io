// 最小 Node API 声明（仓规禁新增依赖，@types/node 不在其列可请）：只声明本仓构建脚本
// 真正碰到的那几个函数，签名与 Node 24 文档一致（Buffer 是 Uint8Array 的子类）。
declare module 'node:fs/promises' {
  export function readFile(path: string | URL): Promise<Uint8Array>
  export function writeFile(path: string | URL, data: string | Uint8Array): Promise<void>
  export function readdir(path: string | URL, opts: { recursive: true }): Promise<string[]>
}
