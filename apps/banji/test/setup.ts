import 'fake-indexeddb/auto'
import { afterEach } from 'vitest'

// jsdom 测试之间清场；node 环境无 document，天然跳过。
afterEach(() => {
  if (typeof document !== 'undefined') document.body.innerHTML = ''
})
