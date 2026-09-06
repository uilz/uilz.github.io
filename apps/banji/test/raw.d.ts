// vitest/vite 的 ?raw 导入是构建管线特性，tsc 只需知道它的形状（整文件字符串）。
declare module '*?raw' {
  const content: string
  export default content
}
