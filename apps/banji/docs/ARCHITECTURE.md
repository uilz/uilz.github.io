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
- `edges`/`staging` 在 v1 **刻意建空**：IDB 升版本会阻塞其他连接，早建早免痛；staging 是导入第 2 阶段的草稿区，必须与活动 store 同库同事务才能做单事务提交。**R7 起 edges 已接线**（牵线/撕线/级联剪边/线模式/归档往返），契约字段一字未动。**R8 拍板（销 R6/R7「role 去留」债）：`Edge.role` 保留为契约内 schema 保险字段**——与 `Card.rot` 同一性质：未来的关系类型留位、零编辑 UI、零校验语义（可选字符串即合法）；哪天真做关系类型，升 schemaVersion + 迁移表补行，绝不偷改。dedup 仍以「一根线就够」为口径（同对卡至多一根线）。
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
   **边端点必须指向档内存在的卡（R7，`edge.dangling_endpoint`——自家导出同批剪边产不出悬空，此闸拦第三方/手改档案偷渡）**、
   每个 props hash ∈ manifest 且 ZIP 正文 sha256 实算相等、size 相等、settings 形状；
   未知 kind 原样保留、永不因此拒绝。
   失败 ⇒ 返回 problems ⇒ 写盘代码路径根本无从执行（结构保证，不是运行时保证）。
2. CHUNKED STAGE：txn clear staging → 批次 ≤200 `put(value, 'j:'|'a:'|'e:'|'s:'+key)`；zip 条目 → new Blob → staging。
3. COMMIT：恰好一个 readwrite 事务横跨 journals/assets/settings/edges/staging：clear 四个活动
   store → staging 游标排干（键前缀↔内联键不一致即刻 abort）→ 每行 delete。**成功当且仅当 tx.oncomplete**。
```

- **R10·债#5（commit 的排他归位）**：第 3 阶段的**调度权**属宿主中介的唯一串行链（`ui/writeChain.ts` 提交屏障）：
  UI 中介挂载时把 `<T>(task)=>Promise<T>` 的排他执行权经 `BanjiApp.setCommitGate` 注入缝——排入时刻宇宙代数 ++
  （已排水未开火者链头弃权、屏障后排队者入 armed 账）、在途开火的读-改-写序列由链前缀静等结算（其全部事务
  先于 commit 事务诞生→被 clear 抹除）、成功在链环内先落弃世整斧再放 ack、失败复活弃权者一笔不吞。
  **事务本体一字未动**——上面三纪律与六陷阱原样；门只管排队，绝无第二道门（单链红线）。未注册（无头调用者）=
  直通立即提交，与注册前一字不差。

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
| 4 | R4：应用缝新增 `restoreCards(date, snapshot)`（+ `DeleteSnapshot`/`ParentPatch`） | 删除撤销需要"逐字写回"（id/时间戳一件不重生），addCard 的重生语义给不了；卡片级操作在既有缝里也没有恢复之路。快照与撤销历史全部住 UI 内存（刷新即无、单级一格、导入成功即作废），数据契约不动 | §10 的 `BanjiApp` 接口加一员（additive，无既有签名改动）；写回仍走文档级校验器，只 bump 文档 `updatedAt`；对 IDB/store schema/归档格式零变化 |
| 5 | R7：关系缝上架（`addEdge/deleteEdge/listEdgesForCards/getRecentCards/loadAllCards/loadAllEdges`，全 additive）；`deleteCardCascade` 返回被剪边清单（原 `Promise<void>`）；`DeleteSnapshot` 增 **可选** `edgePatches`（R4-R6 旧构造点零改动） | 关系闭环是 v1 契约内承诺（edges store/edges.json/staging e: 键早已备好），应用层只是第一次有人用；剪边必须与删除同一提交批（「库中永不存谎言档案」前例），deleteCardCascade 是唯一知道被剪了谁的口。边恢复复用 restoreCards 同一扇门，不另开第二张 undo | 数据契约/IDB schema/归档格式零变化（role 仍休眠、字段一字不动）；undo 只多记一页边账；UI 瞬态（目光/撕线签/落定）永不过缝 |
| 6 | R10：`BanjiApp.setCommitGate(gate \| null)` + `ImportArchiveOptions.commitGate?`（全 additive，类型 `CommitGate=<T>(task)=>Promise<T>` 住 repository/types）；UI 中介析出 `ui/writeChain.ts`（纯拆解零行为差） | 债#5：导入 commit 与串行链不同门，开火中途的旧世界意图可把写落在刚替换的宇宙上（R9 e2e 抓到真竞态、阴性对照双 FAIL 实锤）；屏障只在唯一链上排队 commit（单链红线），不重排事务 | 数据契约/IDB schema/归档格式/commit 事务语义零变化；无头 importFromFile 未注册门 = 与 R9 一字不差；UI 视觉零变化 |

## 9. 测试基线（`apps/banji/test/`，vitest + fake-indexeddb/auto）

- `date/validate/gc/repo` 35：域与仓库层（首开、CRUD、staging、commit、版本闸）。
- `archive.test.ts`：export counts/GC/共享去重、**HERO 五 store 全清全还**（Blob sha256 自证）、未知 kind 原样往返、`migrate(CURRENT)` 恒等、双版本闸、40×15 规模护栏（<2s）。
- `archive-corruption.test.ts`：**七连损坏电池**（字节≠名字 hash、引用资产缺失、schemaVersion 999+文案、非法日期、跨日志重复卡 id、容器环、一子两父）+ 缺正文/错 app/坏 settings 补充闸 + 配额三态。每案都断言"库快照 before≡after"。
- `application.test.ts`：UI 缝（addCard/updateCard/move/resize/cascade/getMonth/exportToFile/importFromFile/close）。
- R7 关系面：`edges-domain.test.ts`（pairKey/edgesTouching/threadOrder 跨日平序+环安全）、`edges-application.test.ts`（三闸、dedup 双向、撕线幂等、级联剪边含跨日边、edgePatches 逐字双幂等、预检悬空端点双向+正例放行、D6 归档往返、D7 语义等价导出拍板），UI：`links-mode.test.tsx`（纸黄昏、三道收线、落定熄灭、dedup 目击、跨日「牵给近日」、撕线反悔分界、edgePatches∩parentPatches 经托盘逐字同回、键集纪律）、`thread-mode.test.tsx`（串珠纯算+线模式交互+点珠翻页+瞬态不写库）。
- R8 跨时间探索面（305 基线）：`search.test.ts`（22：EN/CJK fold 子串、rank 三档 + createdAt 降 + id 全序、snippet 省略号界、[start,end) 码元坐标、cap/around 覆写、空白恒空、容器孩子自成行）、`search-seam.test.ts`（2：loadAllAssetMeta 无 blob/无 addedAt、无名资产 name 键整个缺席——真 repo 非 mock）、`graph-layout.test.ts`（11：双跑深相等确定性、乱序不动几何、日期列历法升序、createdAt 堆叠、孩子缩进悬母片下、边只认活 chip、柱内无重叠、病态环不吞纸、空图/单纸边角）、UI `search.test.tsx`（8：入口/持焦/耳语/分组高亮/孩子行/XSS 文本节点判死/假计时器脉冲起熄+零写库/底料一入一读）、`graph-mode.test.tsx`（5：三段、全日记 chips、跨日线、点 chip 翻页脉冲、D4 三目光往返零写笔键账逐字）。e2e 70→87（搜索全程/图模式/夜读双取证/手机 390），0 console。
- R11 长尾打磨面（408 基线）：UI `save-class.test.tsx`（8：classifySaveError 真 DOMException name/legacy code 22/1014/裸 {name} 形状/漂移三兄弟/unknown passthrough + 回执按类配文案三面 quota「手机纸不多了 · 导出旧手札」/drift·unknown 通用原样）、`asset-name.test.tsx`（5：五型 name 元素同类同链常挂、覆盖名/资产名/hash 前八三档、全集恰五枚）、`shortcuts.test.tsx`（10：⌘N/⌘⇧K/⌘E 开火+写字第守卫矩阵+⌘F 例外+月历让位纪律+Esc 矩阵〔抽屉/纸单/浮笺/纸片〕）、`perf-budget.test.ts`（5：2000 卡/600 边/200 天真缝宇宙四预算 search 1.9<50ms·layout 39.8<150ms·BFS 0.5<150ms·export 74<2000ms 钉死——增量账本 CLOSED-BY-EVIDENCE 的证据本体）、`reject-copy.test.ts`（5：16 预检码+inner 形状码人话表无一生裸 enum 互不撞文案，形状碎语不上脸）、UI `import-rejection-copy.test.tsx`（2：悬空端点/超新档两道拒信真走抽屉上屏）。e2e 97→103：R11·D5 ⌘E/⌘N/⌘⇧K/Esc 合抽屉真键盘四检 + R11·D2 四型改名 reload 全显纸面名与同 class 双检。既有 373/97 全数一字未动。
- R10 提交屏障面（373 基线）：UI `import-barrier.test.tsx`（3：A 面悬挂开火定序 in-flight→landed→commit + 新宇宙逐字 + ack 后零过缝、B 面 commit 失败复活不吞不毒旧宇宙不换、C 面只弃旧不毒新）；R6 四面（import-discard）原样重跑。e2e 96→97：债#6 夹具改真对抗（journals.get 一次性挂起闸 + 5-store readwrite 诞生计数器：屏障下 commit 事务 1500ms 零诞生、放行后逐字节 ≡ staged；阴性对照还原旁路则双 FAIL），连跑两遍 0 console。

```
cd apps/banji && npm run typecheck && npm run test && npm run build   # 三闸全绿才算完成
```

构建产物 `i/banji/`（vite outDir），入口占位 `src/main.tsx` 不渲染任何 UI。

## 10. 下一单元（UI）的接口面

`src/application/index.ts` 的 `createBanjiApp(repo, { now? })` 是唯一入口；
所有失败经 `ImportResult/ExportResult` 判别联合返回（带 zh-CN `userMessage`，直接可渲染）；
卡片级操作抛 `InvalidDateError | JournalNotFoundError | CardNotFoundError`（同步 API 语义）。
R7 关系缝清单（§8 偏差 5）：`addEdge`（自牵/无卡/dedup 三道静默闸，成功返回落库边）、`deleteEdge`（幂等）、`listEdgesForCards`（渲染账本）、`getRecentCards(anchor, days)`（「牵给近日」窗 [anchor−days, anchor)，垫纸出局、附 assetName）、`loadAllCards`/`loadAllEdges`（线模式 BFS 底料）。全 additive，无既有签名破坏（除偏差 5 记录的两处）。

**R8 跨时间探索缝（全 read-only，零新存储字段/零迁移——不占 §8 偏差表）**：`loadAllAssetMeta(): Promise<AssetMeta[]>`——全量资产的 `{hash,name?,mime,size}` 投影，**blob 一字不过缝**（IDB 递来整条记录，过缝第一刻剥成投影；无名资产 name 键整个缺席）；域内纯函数 `searchCards(cards, assetMeta, query, opts)`——大小写不敏感子串（fold 走码元 1:1，CJK 天然成立）、rank=首行>后行/链接>资产名、并列 createdAt 降、cap 50、snippet±40 带省略号、高亮以 [start,end) 码元下标交付（渲染层切 React 文本节点，绝无 HTML 注入路）。图模式布局 `graphLayout(entries, edges, opts)` 住 UI（视图几何非领域规则）：时间轴纸聚、纯函数、双跑深相等。三目光（卡片/线/图）、搜索瞬态（查询词、纸片开合）、hop 跳纸脉冲全不住 store 串行链——e2e 键集断言（卡片键/边键 ⊆ 契约全集）随轮复验。

**R10 提交门（§8 偏差 6）**：`BanjiApp.setCommitGate(gate: CommitGate | null): void`——`CommitGate = <T>(task: () => Promise<T>) => Promise<T>`（repository/types，archive 与 seam 共享）。持链宿主（useDayStore→writeChain 屏障）挂载注册、卸载交还；`importFromFile→importArchive` 阶段 3 永远过门——注册后端到端与抽屉同保证，未注册直通。UI 侧 `actions.onUniverseReplaced` 语义不变（幂等整斧，链环内与抽屉 ack 双落一次无害）；store.ts 的链核心住 `ui/writeChain.ts`（纯拆解），两台编排机注入面不变。
