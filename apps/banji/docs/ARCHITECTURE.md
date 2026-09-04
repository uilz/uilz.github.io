# 伴记 BanJi — 架构基线（LOCKED）

> **本文件是后续所有单元（UI、编辑、同步实验…）的第一必读。**
> 这里的契约是"对外承诺"：字段名、store 名、归档路径、错误语义一经 v1 发布即冻结。
> 改契约 = 升 schemaVersion + 在迁移表补一行；**绝不改写历史行**。

---

## 1. 分层与依赖方向

```
┌────────────────────────────┐
│  UI（React，后续单元）      │  只 import application / domain
└─────────────┬──────────────┘
              ▼
┌────────────────────────────┐
│  application/（薄用例层）   │  createBanjiApp(repo)：卡片 CRUD/级联/月历/导入导出编排
└─────────────┬──────────────┘     零 React、零 DOM（importFromFile 兼容 Blob/File）
              ▼
┌────────────────────────────┐        ┌───────────────────────────┐
│  domain/（纯类型+纯函数）    │ ◄───── │  archive/（导入导出/ZIP/    │
│  类型·日期·校验·GC·id        │        │  迁移表·hash·预检·三阶段）  │
└─────────────┬──────────────┘        └────────────┬──────────────┘
              ▼                                    ▼
┌────────────────────────────────────────────────────────────┐
│  repository/（手写 IndexedDB 薄壳：idb/schema/repo/types）  │
└─────────────┬──────────────────────────────────────────────┘
              ▼
        IndexedDB "banji-journal" (five stores)
```

铁律：
- **UI → Application → Domain ← Repository ← IndexedDB**；archive 横向吃 Repository 的接口、复用 Domain 的校验器。
- Domain 零 I/O；Archive 的预检（preflight/migration）零 I/O；只有 repository/ 和 archive 的 import/export 编排碰字节。
- archive 层的 `migration/` 是唯一迁移表（见 §5），被 IDB 升级和归档导入**共用**——两份真相必腐坏，一张表只写一次。

---

## 2. IndexedDB `banji-journal` version **1**，五个 store

| store | 键 | 值 |
|---|---|---|
| `settings` | keyPath `key` | `{ key: string, value: unknown, updatedAt: string }` |
| `journals` | keyPath `date` | `{ date: string /* YYYY-MM-DD */, cards: Card[], updatedAt: string }` |
| `assets` | keyPath `hash` | `{ hash /*sha256 hex, 算法冻结*/, mime, name?, size, addedAt, blob: Blob }` |
| `edges` | keyPath `id`，索引 `by_source`/`by_target` | `{ id(uuidv7), source, target, role?, createdAt, updatedAt }` |
| `staging` | **out-of-line** 键 `j:<date> \| a:<hash> \| e:<id> \| s:<key>` | 对应上表的整条记录 |

- **Blob 必须存 Blob 对象，绝不存 ArrayBuffer**（结构化克隆后可直接用，且避免 detach 风险）。
- `edges`/`staging` 在 v1 **刻意建空**：IDB 升版本会阻塞其他连接，早建早免痛；staging 是导入第 2 阶段的草稿区，必须与活动 store 同库同事务才能做单事务提交。
- `staging` 的 `s:` 前缀是对契约原文三类的**内部扩批**：settings 必须活过导入三阶段（HERO 要求），而契约的 commit 清空四个活动 store；没有第四类暂存键则 settings 无处过桥。对外归档格式不受影响（settings.json 仍 `{key,value}`）。见 §8 偏差记录。

## 3. Card（锁定）

```ts
type CardId = string & { readonly __brand: 'CardId' }   // uuidv7

interface Card<P = unknown> {
  id: CardId
  kind: string            // 开放联合：'text'|'image'|'file'|'audio'|'video'|'pdf'|'markdown'|'code'|'link'|'container'|…
                          // 渲染期查注册表；未知 kind 必须原样往返，永不拒绝
  pos: { x: number; y: number }   // 画布绝对坐标；嵌套在容器内也存绝对值
  size: { w: number; h: number }
  z?: number              // 允许小数（层间留缝）
  rot?: number            // 保险字段，v1 无 UI 读取
  children?: CardId[]     // CORE，仅 container 有意义，顺序即视觉/语义顺序
  meta?: Record<string, unknown>
  props: P                // 按 kind 判别的载荷
  createdAt: string
  updatedAt: string       // 保险字段
}
// 无 date 字段：journal 文档键即日期归属。
// TextProps{text, format?:'plain'|'md'} · ImageProps{hash, w?, h?} · FileProps{hash} · ContainerProps{}
```

## 4. 归档 = ZIP（fflate），条目名**永远不含用户文件名**

```
manifest.json  { app:'banji', schemaVersion:1, hashAlgo:'sha256', appVersion,
                 exportedAt, counts:{journals,cards,edges,assets}, assets:[{hash,mime,name?,size}] }
journals.json  JournalDoc[]（按 date 升序）
edges.json     Edge[]        —— [] 也必须存在于每一份档案
settings.json  [{key,value}] —— updatedAt 不入档（导入时以 exportedAt 重建）
assets/<hash>  blob 原始字节，无扩展名 —— 内容寻址，CJK/转义问题从根上消失
```

- JSON 一律**确定性序列化**（`canonicalJson`：对象键排序、数组保序，字节可复现）。
- 资产条目 STORE（level 0）存储：已是二进制/内容寻址，deflate 纯属浪费；JSON 用 deflate。
- 读取端：`Unzip` 流式解码。**fflate 陷阱：`new Unzip()` 默认只认 store(0)，解 deflate(method 8) 前必须 `unzipper.register(UnzipInflate)`**，否则 `file.start()` 抛 `unknown compression type 8`（zip.ts 已处理，勿回退）。

## 5. 迁移：两个整数，一张表

- **IDB version**（整型，管库结构）与 **archive schemaVersion**（管归档 JSON）是两个独立整数，永不混用。
- `src/archive/migration/index.ts` 的 `MIGRATIONS` 是唯一转换表：`{ from, to, topology?, records? }`，`to` 强制 `= from + 1`（代码有运行时守卫），只 append、永不改写旧行。
- IDB 侧：`onupgradeneeded` 沿同一张表逐跳跑 `cursor.update(fn(value))`（assetRecords 通道不得动 blob）。
- 归档侧：`migrateArchive(migratable)` 纯函数（structuredClone 隔离，恒等性可测试）。
- 当前 = 1，接受区间 [1,1]。**NEWER schemaVersion / 未知 hashAlgo → 编码失败 + zh-CN userMessage**：
  「此档案来自更新版本的伴记，请更新伴记后再导入（你的日记数据完好无损）。」
  产品文案铁律：拒绝消息必须读得出"数据还在、更新伴记即可"，绝不可像"日记没了"。
- IDB version 超前（> `IDB_VERSION_CURRENT`）同样硬拒：静默半升级 = 中心腐坏，见 `validateIdbVersion`（openRepo 第一件事）。

## 6. 导出 = 规范化 + GC

- 只收录**被引用**资产：凡 props 树中 key 为 `hash` 且值为 64 位小写十六进制者为引用（泛型遍历 → 未知 kind 的引用也被追踪）；容器 children 传递性由"扫描整文档全部卡片"天然覆盖。
- **库内资产永不自动删除**（删除 UI 卡片、级联、失败导入都不动 assets）。GC 只发生在导出这一站（未引用者不入档）。用户数据宁可磁盘垃圾，不可档案缺页。
- 引用缺失时导出**中止**并返回 `missing_asset` + 缺失清单（不产半档）。

## 7. 导入 = 严格三阶段（顺序即安全）

```
0. 配额预检：navigator.storage.estimate（可选守卫，Node/测试注入），Σ资产字节 ×1.2 余量，不足即 fail fast——零写入
1. PREFLIGHT：纯内存、零写盘。ZIP 流式解析 → 两道闸（schemaVersion/hashAlgo/app=banji）→ 迁移 → 校验：
   日期字符串格式、卡片 id 全局唯一、children 存在/一子一父/容器无环、
   每个 props hash ∈ manifest 且 ZIP 正文 sha256 实算相等、size 相等、settings 形状；
   未知 kind 原样保留、永不因此拒绝。
   失败 ⇒ 返回 problems ⇒ 写盘代码路径根本无从执行（结构保证，不是运行时保证）。
2. CHUNKED STAGE：txn clear staging → 批次 ≤200 `put(value, 'j:'|'a:'|'e:'|'s:'+key)`；zip 条目 → new Blob → staging。
3. COMMIT：恰好一个 readwrite 事务横跨 journals/assets/settings/edges/staging：clear 四个活动
   store → staging 游标排干（键前缀↔内联键不一致即刻 abort）→ 每行 delete。**成功当且仅当 tx.oncomplete**。
```

导入是**全量替换**语义（档案即宇宙快照），不与现库合并；`ImportResult = {ok:true, stats} | {ok:false, reason, userMessage, detail?}`。

### IndexedDB 陷阱清单（repository/ 已按此实现，改这层的人必须重新过一遍）

1. **事务会死盯微任务栈**：从 `db.transaction(...)` 发出最后一个请求之间，`await` 任何非 IDB 的异步 = 事务静默自动提交（部分写入！）。commitStaging 全程回调驱动（`scanCursor`），游标回调里只发 IDB 请求。
2. **成功信号是 `tx.oncomplete`，不是任何 `request.onsuccess`**。
3. **`onupgradeneeded` 必须容忍首开**：store 存在性检查（`objectStoreNames.contains`）先于创建；共用迁移表逐跳，缺行即拒绝打开。
4. **hash 走 WebCrypto `subtle.digest`** 对条目字节分块喂入后终结一次（Node webcrypto 测试环境同码可跑；真流式实现待换，见 hash.ts 顶部边界说明）。
5. `deleteDatabase`/升级 `onblocked` 显式 reject，不装死。
6. staging 键前缀与记录内联键必须一致，不一致视为中心腐坏 → abort 整个 commit。

## 8. 偏差记录（相对任务契约原文）

| # | 偏差 | 理由 | 影响面 |
|---|---|---|---|
| 1 | staging 键新增 `s:<key>`（契约只列了 j/a/e） | commit 阶段清空四个活动 store 后 settings 须可从 staging 复活；无第四前缀则该要求不可满足 | 纯内部草稿键；归档对外格式零变化 |
| 2 | `settings.addedAt`/asset `addedAt` 在导入后 = manifest.exportedAt；settings `updatedAt` 同理 | 归档 settings.json 只存 `{key,value}`（资产 name/mime/size 已够重建） | 往返非逐字段自等，测试按"时间戳再生"预期断言 |
| 3 | 归档 manifest 校验 `app === 'banji'`（契约暗示） | 拒收他 app 同形档案 | 更严不是更松 |

## 9. 测试基线（`apps/banji/test/`，vitest + fake-indexeddb/auto）

- `date/validate/gc/repo` 35：域与仓库层（首开、CRUD、staging、commit、版本闸）。
- `archive.test.ts`：export counts/GC/共享去重、**HERO 五 store 全清全还**（Blob sha256 自证）、未知 kind 原样往返、`migrate(CURRENT)` 恒等、双版本闸、40×15 规模护栏（<2s）。
- `archive-corruption.test.ts`：**七连损坏电池**（字节≠名字 hash、引用资产缺失、schemaVersion 999+文案、非法日期、跨日志重复卡 id、容器环、一子两父）+ 缺正文/错 app/坏 settings 补充闸 + 配额三态。每案都断言"库快照 before≡after"。
- `application.test.ts`：UI 缝（addCard/updateCard/move/resize/cascade/getMonth/exportToFile/importFromFile/close）。

```
cd apps/banji && npm run typecheck && npm run test && npm run build   # 三闸全绿才算完成
```

构建产物 `i/banji/`（vite outDir），入口占位 `src/main.tsx` 不渲染任何 UI。

## 10. 下一单元（UI）的接口面

`src/application/index.ts` 的 `createBanjiApp(repo, { now? })` 是唯一入口；
所有失败经 `ImportResult/ExportResult` 判别联合返回（带 zh-CN `userMessage`，直接可渲染）；
卡片级操作抛 `InvalidDateError | JournalNotFoundError | CardNotFoundError`（同步 API 语义）。
