// D1 夹带 mime 路由表：纯函数穷举。audio/* 与 video/* 归号、application/pdf 点名精确匹配、
// 其余一律文件卡（未知类型至少存得下导出）。application/x-pdf 不是 application/pdf。
import { describe, expect, it } from 'vitest'
import { routeAttach } from '../../src/ui/attachRoute'

describe('routeAttach：mime → 卡型（全类 + 边角）', () => {
  it.each([
    ['audio/mpeg', 'audio'],
    ['audio/wav', 'audio'],
    ['audio/ogg', 'audio'],
    ['Audio/MPEG', 'audio'],
    ['audio/mpeg; codecs="fmd"', 'audio'],
    ['video/webm', 'video'],
    ['video/mp4', 'video'],
    ['video/WEBM;codecs=vp9', 'video'],
    ['application/pdf', 'pdf'],
    ['APPLICATION/PDF', 'pdf'],
    ['image/png', 'image'],
    ['image/webp', 'image'],
    ['image/svg+xml', 'image'],
  ])('已知类型 %s 归其卡型', (mime, kind) => {
    expect(routeAttach(mime)).toBe(kind)
  })

  it.each([
    ['application/x-pdf', 'file'],
    ['application/octet-stream', 'file'],
    ['text/markdown', 'file'],
    ['font/woff2', 'file'],
    ['multipart/form-data', 'file'],
    ['', 'file'],
    ['   ', 'file'],
  ])('未知/近亲类型 %s 一律存得下的文件卡', (mime, kind) => {
    expect(routeAttach(mime)).toBe(kind)
  })
})
