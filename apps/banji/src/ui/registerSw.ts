// R14 壳缓存注册闸（唯一入口，main.tsx 只负责递环境）。三道把守，缺一不注册：
// ① 生产构建才注册——dev 与 SW 抢页面是经典酷刑；② 浏览器不支持 serviceWorker 静默出局
// （老引擎照常在线用，只是没有离线壳）；③ load 之后才动手，不与首屏渲染抢带宽。
// 注册失败（离线首开等）吞声：零打扰法不许为一次没成的注册发任何回执。

export interface SwNavigatorLike {
  serviceWorker?: {
    register(scriptUrl: string, options: { scope: string }): Promise<unknown>
  }
}

export interface ShellSwEnv {
  prod: boolean
  nav: SwNavigatorLike | undefined
  /** 空闲时机（生产注入 window load 监听；测试注入即时执行器） */
  onIdle: (fn: () => void) => void
}

export function registerShellSw(env: ShellSwEnv): void {
  if (!env.prod) return
  const sw = env.nav?.serviceWorker
  if (!sw) return
  env.onIdle(() => {
    void sw.register('./sw.js', { scope: './' }).catch(() => {
      /* 离线首开注册不上是契约内的事（文档写明：第一次开需要一次网络），不响 */
    })
  })
}
