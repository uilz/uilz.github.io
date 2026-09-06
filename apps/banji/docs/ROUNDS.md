# 伴记 · 迭代日志

> 每轮结束追加。新会话接手先读:本文 → ARCHITECTURE.md → 代码。

## Round 1 — 2026-09-04 · 基座 + Phase-1 竖切（已发布）

**完成**
- 工具链:Vite + TS strict + Vitest + fflate + uuid;源码 `apps/banji/`,产物 `i/banji/`(无 CI,产物入库发布)。
- 基座(契约见 ARCHITECTURE.md):5 store IDB(journals/assets/edges/settings/staging)、Card 开放 kind、三阶段原子导入(preflight→staging→单事务 commit)、ZIP 归档 `.banjizip`、migration 表、GC-on-export。
- UI:日历首页(墨点/今天细环/周一起)→ 日手札纸面画布(拖拽/缩放/自动保存 450ms/删除二次确认)→ text/image/file 渲染器 + registry(未知 kind 兜底原样保留)→ 设置抽屉(宣纸/夜读、导出、双确认导入)。
- 测试:99 单测 + 真浏览器 E2E 14 项(0 console error):首屏/落笔/刷新/墨点/导出→wipe→导入→deep-equal 恢复/夜读持久化/移动端导入。E2E 脚本在 `/tmp/opencode/banji-e2e/hero.mjs`(临时,下轮应固化进 repo)。

**已知债(下轮候选)**
1. 图片/文件**上传入口**未接(addAsset 缝已就绪已测,UI 缺触发面)——附件闭环不完整。
2. 保存失败静默吞进队列,无用户可见回执(数据反馈通道)。
3. 新卡永远 (24,24) 排队;卡片纸/页纸色差弱;夜读墨点对比弱。
4. 无 undo;删除级联仅"无法找回"提示。
5. hero.mjs 未入库;theme-color meta 不随主题翻转。
6. 设置 store 已通,但 UI 只有 theme 一个键;搜索/关系/线/图模式 = Phase 3+。

**决策记录**
- 导入=全量替换(档案即宇宙快照);merge 需求将来走新 schemaVersion,禁止 UI 层偷合并。
- 卡片位置永远画布绝对坐标(嵌套平移子树,不改坐标系)。
- 资产永不自动删;GC 只发生在导出。sha256 冻结。
- 文案即产品:所有 ImportResult.reason 有 zh-CN 人话;错误不能读成"日记没了"。

## Round 2 — 2026-09-04 · 附件闭环 + 保存回执 + 视觉债(已完成,待发布)

**完成**
- 附件闭环:底栏「夹带」回形针(OS 选择器 accept="*/*" multiple)、画布拖放(暖棕虚线提示、指针处落卡、多份 24px 阶梯)、桌面图片粘贴(纯文本不劫持)。管线=addAsset(hash/去重已由 R1 测死)→ 图片 createImageBitmap 探尺(宽封顶 420 保比例,size=建议尺寸+边框)→ addCard;在途为纯 UI ghost 虚影(不进 meta/存储,熄灭即落定),失败虚影熄灭 + 赭色便签给原因(QuotaExceeded 单列「纸面快满了」)。
- 保存失败回执(债2):串行链失败不再吞——未落盘意图住 failedRef(last-intent-wins,新编辑覆盖旧意图),回执「这一笔没存上 · 再试」驻留;随下一次落盘/换日自动陪跑,多失败合并计数,成功即熄;换日期不蒸发。夹带/保存/抽屉共用同一 Toast 通道(便签组件)。
- 视觉债(债3/5):新卡之字瀑布落点(x=24+((i·148)%444), y=24+i·240 纯函数,不再压最近一笔);卡片纸vs页纸对比走新令牌 --bj-card/--bj-card-edge(亮 #faf5e9→#fffdf4/边缘 0.34→0.45;夜 #211b14→2a2318 边缘 0.2→0.34);夜读墨点令牌 0.62→0.88;theme-color 随宣纸/夜读翻转(首帧守卫同名一致);.bj-scroll 自成叠层,浮钮永压纸。
- E2E 固化(债5):hero.mjs → `e2e/live.mjs`(BASE 可用 BJ_BASE 覆盖;playwright-core devDep,浏览器走 ~/.cache/ms-playwright 缓存),R1 全 14 项 + R2 新增:夹带 800x600 PNG→图片卡(420x315)→刷新仍在→导出→wipe→导入→**IDB 资产字节实算 sha256 ≡ 源文件**→DOM 可见;真 DataTransfer 拖放落点 (320,380) 验证;theme-color 双帧断言。23 项 ALL-PASS,0 console error。

**已知债(R3 候选)**
1. 无 undo(自 R1 顺延;删除级联仍只有"无法找回"提示)——现存最值钱的洞。
2. 触屏拖放不成立(HTML5 DnD 桌面语义);移动端入口=选择器+系统分享式粘贴。长按拖拽 = Phase 3。
3. 同字节改名的第二张卡显示首次入库的文件名(内容寻址的自然结果,非 bug,文案可再解释)。
4. 探尺失败退默认尺寸 by 渲染器 onLoad 自愈 —— 双真相轻微重复(420 vs 520 上限),R3 可统一到一个令牌。
5. "这一笔没存上"无离线/存储满根因区分(在线检测可加)。
6. 设置仍只有 theme 一键;搜索/关系/线/图 = Phase 3+。

**决策记录(R2 增量)**
- ghost 是 UI 内存态,不写 meta(meta 是存储数据);诚实路线=等 addAsset 解析后才 addCard,虚影只做视觉陪伴。
- 保存回执按"意图条数"计数而非"失败次数":重试不放大恐慌。
- 夹带/拖放/粘贴三入口全走同一个 actions.attach(day, files, at?)——一个管线,三个把手。

## Round 3 — 2026-09-04 · 移动端主屏(已完成,待发布)

**完成**
- 主屏适配(T1):瀑布落点视口感知——<480px 收进单列(x≡24,y 阶梯不变),宽屏漂移钳制 x ≤ vw-24-300,默认卡右缘永不越屏;纯函数 scatterPos(i, vw),同 (i,vw) 恒同点。图片卡创建期定宽:本体封顶 = min(420, vw-72-28),手机整卡 ≤ vw-72(屏幕左右各留 24 呼吸),桌面 ≤420 逐像素不变;渲染器 onLoad 兜底同式派生。键盘避让:focus → scrollIntoView({block:'center'})、blur → nearest 收回视野,typeof 守卫 jsdom 空转。空画布最小宽改为 min(600, vw-48≥320),390 屏不再横滚死纸边;100vh+100dvh 配对既有、测试锁死;手机 <480 格式 chip 热区抬至 44px(桌面视觉不动)。
- 必要修复(T2):420/520 双真相归一——MAX_CARD_IMAGE_W=420 唯住 placement.ts,源码扫描测试禁 src/ui 第二处字面量(420 只在定义行,520 零残留);夹带回执按根因三分——配额「这一份没夹上 · 手机的存储空间不够了,先导出或清理一些吧」/ 读失败「这一份没能读进来 · 再试一次」(NotReadableError、TypeError 归此)/ 未知原样保守,仍走唯一 Toast 通道(R2 债4 清偿;债5 文案侧清偿、探测侧顺延)。
- 测试(T3):单测 119→138——placement 视口段(窄列确定性/右缘不变量 i∈0..20 × vw∈{320..1280}/钳制逐点复算/封顶恒等 imageFitMaxW(∞)≡MAX_CARD_IMAGE_W)、probe 三分文案 4、mobile 管线 7(390 下 1200x900→size 318x244·props 290x218·x=24;小图不放大;1024 封顶回 420;focus/blur mock 元素;dvh 配对与单一真相源码扫描);attach 配额文案断言随文案更新。
- e2e(T4,+5=28 ALL-PASS,0 console error):手机上下文夹带 800x600 → 图片卡 bbox ≤350 且滚动可达完整在屏、IDB 存储即窄屏数、添卡聚焦编辑器实测进视口、reload 仍在。

**已知债(R4 候选)**
1. 无 undo(自 R1 顺延)+ 卡片嵌套 UI —— R4 主线,现存最值钱的洞。
2. 触屏拖放不成立(长按拖拽 = Phase 3);桌面时代的卡导入到手机保留绝对坐标、不自动回流(契约决定),用户手动拖即可。
3. headless 无法模拟软键盘:dvh + focus-center 以几何近似验证;iPad/iPhone 真机 visualViewport 未抽验。
4. 同字节改名的第二张卡显示首次入库文件名(R2 债3 原样顺延)。
5. 「这一笔没存上」仍无离线/存储满探测根因(夹带文案 R3 已分根因;保存侧探测未做)。
6. 设置仍 theme 一键;搜索/关系/线/图模式 = Phase 3+。

**决策记录(R3 增量)**
- 图片封顶单值住 `MAX_CARD_IMAGE_W`(420);手机呼吸预算 = 画布页缘 24 + 散点留白 24 + 右呼吸 24,故整卡上限取 vw-72——比任务字面 vw-48 更严 24:48 只数卡片两侧、漏了 .bj-canvas 自身 margin,按 48 卡会贴死屏右缘,违背"呼吸留白"本意。
- 窄屏落点单列:手机上横向漂移 = 越屏,纸的边距比花样重要;x 钳制按默认卡宽 300 计,真实宽卡靠定宽公式保证。
- 桌面卡导入手机不回流不缩卡:位置=画布绝对坐标是 R1 契约,重排等于偷改用户数据;画布横滚即达。

## Round 4 — 2026-09-04 · 删除撤销 + 宽画布耳语(已完成,待发布)

**完成**
- 撤销缝(T0):application 新增 `restoreCards(date, snapshot)`(+ `DeleteSnapshot`/`ParentPatch`,契约偏差记 ARCHITECTURE §8-4)——级联集逐字写回(id/时间戳/props/z/pos/size 一件不重生)、幸存父卡 children 按记录 index 重插(越界钳制、已有引用跳过=双次幂等)、无档自动建档、文档级校验器把住每一笔写回;只有文档 `updatedAt` 前进。UI 永不碰 IDB,undo 也只过这一扇门。
- store 中介的撕下-再想想(T1):`remove` 在乐观移除**之前**同步拍快照(级联集+幸存父卡悬空引用原位),restore 排同一条串行链(绝不与在途编辑抢跑;已许诺的 restore 只在链上排队、绝不插队)。单级托盘一格:新撕下顶替旧承诺、10s 静默过期(无提醒无残影)、换日存活但认出生日(恢复不硬塞进眼前之日,回生日原样可见)、导入成功即作废(安全不变量:旧宇宙的纸片绝不恢复进新宇宙,连"在途已排队"的承诺也作废)。行动回执走既有 Toast 通道的便签变体:「已撕下 N 张,再想想」发丝边不警报;删除确认文案改口「撕下后十秒内可以再想想」,不再谎称无法找回。
- 宽画布耳语(R3 顺延债):纯几何 `hasOffscreenRight`(卡右缘 > vw−48)判手机上桌面时代的纸越屏,纸边低语「纸比屏宽 · 左右推移可看」;横向推移(≥4px 判据)第一次即淡出(≤220ms)并 `setSetting('hint_wide_canvas')` 记档、终生不再扰;纵向键盘避让滚动不误伤。
- 修复(e2e 真触摸抓出的实锤):`.bj-text-read` 补自带 `touch-action:none`——Blink 以最深命中节点的 touch-action 起手触摸手势,`.bj-card` 的 none 罩不住文字行,不补则"按住卡片正文拖动"在触摸端被判成滚读文字而 pointercancel(图片卡/卡边拖得动而文字卡身拖不动的割裂就此消除;编辑态 textarea 的 caret 与桌面滚轮不受影响)。
- 测试(T3):单测 143→164——undo 托盘面(便签文面 1/3 张、快照先于缝+逐字回位、单级顶替、纯函数簿记、与失败回执两张各居其位不堆墙)、生命周期面(10s 假计时器静默过期、换日认生日、import-invalidation 含"已许诺且在途排队"的最深一层)、真缝往返(jsdom + fake-indexeddb + createBanjiApp:逐字复活、updatedAt 只认注入时钟)、耳语显现/噤声/纵滚不误伤/横推恰一次记档、placement 边界几何(vw 390/1280/∞)。e2e 28→36 ALL-PASS 0 console error:桌面 撕下→回执「已撕下 1 张,再想想」→再想想→pos/size 逐像素 ±2 回位→reload 仍在;手机 CDP 真 touch 序列拖卡 (+40,−120) 过缝落库 reload 仍在;桌面时代日子耳语→横推淡出+settings store 记档→reload 终生不再响。

**已知债(R5 候选)**
1. 容器嵌套"拖入卡内"UI 仍未做(children/级联/undo 记录全通了,缺指认容器的手势与视觉)——R4 铺垫只兑现了地基。
2. 实机键盘证据:iPad/iPhone 真机 visualViewport 与软键盘仍未抽验(headless 只能几何近似,R3 债原样顺延)。
3. undo 后导出字节回归:restore 只 bump 文档 updatedAt,但它是要入档的字段——撕下再想想一圈后导出,该日 journals.json 字节必变(内容等价、时间戳漂移);"undo 圈内导出字节不变量"要不要保,待产品拍板。
4. 搜索/关系/线/图模式 = Phase 3+ 未动;设置键两枚(theme、hint_wide_canvas)。
5. 同字节改名的第二张卡显示首次入库文件名(R2 债3,三度顺延)。
6. 「这一笔没存上」保存侧仍无离线/配额根因探测(R3 债5 顺延;夹带侧 R3 已分)。

**决策记录(R4 增量)**
- 单级 undo:一格托盘,新撕下直接顶替旧承诺,不另发声——两级栈的收益付不起"旧悄悄滚出窗口"的解释成本。
- 10s 窗口:比常见系统 Toast 宽裕,给"确认删除"后回神的时间;过期绝对静默,追补提醒即警报,违背便签气质。
- 命令历史住 UI 内存:刷新即弃是接受的取舍——撤销是"这一口气的回心转意",不是跨会话审计日志(那要操作日志层,契约与归档格式都得动,不值)。
- 导入成功即作废(含已许诺在途的 restore):档案即宇宙,旧宇宙的纸片绝不许复活进新宇宙——安全不变量优先于兑现单个承诺。
- restore 走同一条串行链不抢跑:undo 不是旁门左道,它排在用户自己的在途编辑之后执行;链头到达时若承诺已作废则静默弃权。
- 耳语判据纯几何、记档以库内为准:宁可不响不错闪,换设备也记得"已见过"。
- 触摸拖卡修复落在最深命中节点而非手势层兜圈:浏览器手势规则要求的最小诚实,代码侧零改动。

## Round 5 — 2026-09-04 · 纸叠（容器拖入/拖出）(已完成,待发布)

**完成**
- 纸叠几何(T1):纯函数面 `stackGeometry.ts`(171 行,placement 同风)——认领索引(只有 container 的 children 算数)、可达子树(环安全)、`canNest`/`hitTestContainer`(D3 命中排除拖拽卡自身的整棵子树;「最上面」按派生渲染序算、不按存储 z)、`fitContainerBounds`(孩子+24px 呼吸收进最小纸面、地板 220×160、只扩不缩、左上钳进纸内)、`fitStacks`(叠中叠级联到不动点,**轮数封顶:病态环永不收敛即原样交出——扩边只是修饰,绝不让坏数据的无限膨胀落库**)、`subtreeTranslate`(拖垫纸=整树同 delta,坐标仍画布绝对)、`renderStackOrder`(沿祖先链前置垫纸,D2)。计划层 `stackOps.ts`:planAttach/planDetach/planMove/planResize 全是 cards→cards' 纯判别式,diffIntents 只点名真变了的字段。
- 手势与中介(T2/T3):D1 底栏第三枚把手「造叠」(手绘虚线矩形 svg,与夹带/添一张卡同热区)→ 空垫纸(props {})散点落位、即刻选中、耳语候着,无对话。D3/D4 复用既有 pointer-drag:拖拽中 `hitTestContainer` 判落点、`dropTargetId` 住 dayState(纯瞬态,永不过缝——e2e 实 dump IDB 钉死「全部卡片键 ⊆ 契约字段」);释放→ attachChild(尾挂、旧叠让渡、B 自动扩边、A 保持画布绝对)或 detachChild(出界断奶、旧垫只扩不缩)或界内挪(同父幂等、children 一笔不许多写)。三式全走串行链 last-intent-wins 同一扇门;拓扑闸(containerIssues,复用 domain)拦下的意图丢弃+赭边便签给人话「这张纸没能放进去 · 别让叠套进自己的怀里」,落库零污染。
- 容器视觉(T3):`be-container` = 半透深纸 `--bj-mat`(比 --bj-card 更深一档)+ 40% 虚线发丝 `--bj-mat-edge` + 不投影(影是面上纸片的);落点态 `is-dropon` = 虚线收实 + 纸色微抬 120ms ease-out,不发光;空叠耳语「拖一张纸进来，它们就是一叠了」居中,有叠左上「N 张」铅笔小注。子纸永远浮在垫纸上:渲染序派生(DayView),存储 z 一个字节不动(与「置顶」互不干涉)。拖垫纸时子纸实时跟移(dragFollow,抬手即熄)。
- 删除与 undo(D6):垫纸 ⋯ 删除沿用 deleteCardCascade 级联,N>0 确认文案「连纸带叠，一起撕下？」;托盘计数=删除前子树快照大小(`collectSubtreeIds`),「已撕下 N 张」报的是整叠;撕内垫→再想想沿 parentPatches 把嵌套按出生 index 逐字复原(测试三面钉死:计数、复原、双次幂等)。
- 承接中断工(T0):前一位 builder 的 partial 全部收编——registry 挂 container 但未知 kind 兜底不遮蔽(mystery→fallback 仍钉死);修其 hitTest 按存储 z 蒙序(叠中叠会点错垫纸)、fitStacks 无界环死循环、瞬态跟移缺失、**整套容器 CSS 一行没落笔(本笔补齐)**;对齐两枚陈锈断言(container≠fallback、连同卡内→连纸带叠,spec 改口径而非改产品)。
- 测试(T4/T5):单测 164→198(+34:geometry 16、ops 10、手势过缝面 8, plus two rusty assertions aligned per spec)——叠护栏环数据双面(子树遍历终止/fit 到期原样)、attach/detach 过 mock 缝逐字、fit 钳制、子树平移、dropTargetId 永不在存储键、闸拒写+回执、容器删除→undo 嵌套复原、mat-below-children 派生零 z 改写、子树计数。e2e 36→49 全绿 0 console error:桌面 造叠图标/耳语/悬停 is-dropon/children 过缝落库 reload 仍在/键集 ⊆ 契约/界内压上渲染/空处拖垫整树 +140px 跟移/拖出断奶持久;手机 390 CDP 真 touch 造叠+拖入(「1 张」上纸、reload 仍在)。

**已知债(R6 候选)**
1. 单卡删除的幸存父卡悬空引用长尾(R4 记录语义) — 已拍板随本轮清偿:**prune-at-delete-commit 胜 prune-at-expiry**。删除提交就在 remove 的同一条串行链上同批改写幸存父卡 children(stripDoomedRefs 走 commitStack→diffIntents→updateCard 现成通道)——库中永不存谎言档案:「N 张」不数幽灵、含该日的档案再导入不再死在 child_missing(e2e 真浏览器判死:撕子纸→10s 过期→导出→wipe→重导过闸→开日对账)。**undo 机制零改动**:快照仍记原 index,再想想按出生席位逐字插回,撤销抢在剥离落盘前开机时 pruneStripIntent 撤回首尚未过缝的剥离意图(逐字复原才是最新意图,其余字段不连坐);无过期定时器耦合、无异步二次写。候选方案 prune-at-expiry 落选:过期侧另起写盘既添第二条时序通道,又留窗口让谎言档案在 10s 里出门。
2. `store.ts` 360 纯行(HEAD 已 304,超 250 天花板):R6 拆 undo 托盘机与夹带管线为独立编排单元。
3. 叠中叠手势已几何正确(D3 命中天然允许、cycle-guard 兜底)但零 UI 提示;跨屏远垫拖入不自动滚屏。
4. 实机键盘/visualViewport 抽验(R3 起顺延)、undo 圈内导出字节回归(R4 债)、同字节改名第二张卡(R2 债)原样还在。
5. 搜索/关系/线/图模式 = Phase 3+;设置键仍两枚。
6. (R5 收尾揪出) 450ms debounce 窗内 删除→立刻导入宇宙替换:pending 的剥离补丁会陪跑进新宇宙,可致合法 children 被抹平+同 id 冲突 skip 成孤儿(flatten+orphan,不产生悬空、不过不了任何闸、无 phantom——但 R4「导入作废在途承诺」只治 restore 不治 pending edits)。候选:导入 ack 时清空 pending intents 或按新宇宙重算。

**决策记录(R5 增量)**
- attach/detach 不入 undo 托盘:同一手势自我反悔(再拖进/再拖出即可),而托盘只有一格——低风险可逆行不许顶掉「撕下」的高风险承诺(任务书 D7,兑现为记录)。
- 垫纸只扩不缩、手工 resize 也钳在「纸+呼吸」之上:缩到纸下=吞用户的纸;抽走一张也不回缩——用户亲手扩出来的纸面得留着(「N 张」缩排即谎言)。
- 落点态与拖拽跟移住 dayState 瞬态,永不进 Card/props/meta:e2e 以「存储键集 ⊆ 契约字段全集」钉死,刷新即无痕。
- 拖入命中按渲染序而非存储 z:D2 的「垫纸恒below子纸」使两个序本就不是一回事,按 z 蒙会在叠中叠上点错纸。
- 环护栏分三道各司其职:hit-test 子树排除(手势)、canNest+stackIssues(写闸)、gc/fit 遍历去重(病态数据存活);域校验器仍是唯一真口径,UI 不自造第二套。

## Round 6 — 2026-09-05 · 数据可靠性长尾（债#6 ack 作废 + store 拆分 + 债#3 滚屏）(已完成，待发布)

**完成**
- 债#6 导入 ack 作废在途一切（T1，本轮核心）：R5 收尾揪出的窗洞补死——撕纸的 prune-strip 或任何编辑意图住在 450ms debounce 窗时用户完成全量替换 import，旧世界的补丁会开火进新宇宙（抹平 legitimate children、同 id 卡鬼移位）。修法把 R4 的「导入成功即作废托盘」扩成整斧：**ack 信号点 = 抽屉 success → App.onImported 里同步调用的 store 动作 `onUniverseReplaced()`**（原 `invalidateUndo` 升格改名），一次弃世：debounce 定时器 + pendingRef/failedRef 两箱 + save/clear 陈旧回执 + 托盘/已许诺在途 restore（原有腿）+ dropTargetId/dragFollow 瞬态。原子性两条：①动作全同步无 await、且先于 reloadKey bump——换日 effect 的 flushNow 只能在清空后跑，绝无半排半弃；②链上新「宇宙代数 worldGen」——flushNow 出队时盖代数，链头到达见 ack 落斧即弃权，堵死「已排水、未开火」的最后一指宽。反向竞态核验：**只弃旧不毒全**——ack 后新 schedule 拿新代数照常过缝（单测 (c) + e2e 当场添卡落库双钉）。测试：jsdom 四面（strip 窗内 ack→过缝零调用+全库 dump 逐字不动 / failedRef 清箱无陈回执重试 / ack 后编辑照常 / 双瞬态同拍熄灭，mock 的 importFromFile 真换宇宙让旧 strip 现形）+ e2e 桌面真时序（收编过缝→导出定档→老世界撕子纸+拖散纸重置单计时器保证 ack 一瞬必有在途→抢先重导→**重导日逐字节 ≡ 定档档案**）。
- 债#2 store.ts 拆分（T2，纯 refactor 零行为差）：373 纯行 → 两台一等编排机独立成模块＋测试——**undoTray.ts**（票据面：arm 顶替/claim 出口/consumeIntent 链头一票一销/disarmTimer/discard；pruneStripIntent 以「配方+核心递箱」落位，不碰意图箱所有权）与 **attachPipeline.ts**（夹带面：ghost 私号生平、addAsset→探尺→addCard 逐字草稿、失败文案映射；chain/dispatch/getState/nextNoteId 全注入，落笔前 settle 仍归核心动作层）。唯一共享核心留下：串行链 + schedule/diff/commitStack + worldGen + 动作表——**绝无第二条链**。三处零风险收拢凑数：runPlan（四式手势共用落笔口径）、haltDebounce、spawn（添卡/造叠同款十行×2）；sortByZ 归 stackGeometry 独此一家。既有 18 套件断言一字未动全绿；新加 9 台面单元测（托盘五态+prune 幂等+管线四态）。
- 债#3 拖入远垫自动滚屏（T3，tier-2 也兑现了）：**edgeScrollStep 纯几何**（滚动窗缘 48px 带宽、速度 =12·(深度/带宽)²——平方缓入是纸的惯性不是机械追帧、封顶 12px/帧、出缘钳顶、带沿浅处取整归零「进带不即弹」）+ **useAutoScrollWhileDragging** rAF 圈贴 DayView 局部态：CardFrame 越阈真拖才上报（点选不算）、capture pointermove 采样、位移走原生 scroll、prefers-reduced-motion **根本不起圈**（让位而非打折）。store/dayState/契约一字不碰。「该不该动」以几何单测为主证（e2e 只证布线活着：底缘静置 700ms 自走 172px≈缓入档）——headless 证不了手感，诚实记档。
- 测试净增：单测 202→219（+17），e2e 50→54 全绿 0 console error；LOC 闸：store.ts 250 恰达标、undoTray 80、attachPipeline 63、useAutoScroll 35，无一超 250。

## Round 7 — 2026-09-05 · 关系系统最小闭环（牵线/同日线/撕线/删卡剪边/线模式/归档往返）(已完成，待发布)

**完成**
- 域与应用缝（T0-T1）：`domain/edges.ts`（pairKey——无序配对键 dedup 口径、edgesTouching——级联选边、threadOrder——BFS 连通分量：链距升序、同层日期升序、id 定序兜底、环安全）；application 拆 `types.ts`+`edgeCases.ts` 守 250 天花板（`src/application/index.ts` 只剩编排）：addEdge 三道静默闸（自牵/端点无卡全库扫描/任一向已连）、deleteEdge 幂等、listEdgesForCards 两向并集、getRecentCards 窗=[anchor−14,anchor) 垫纸出局附资产名、loadAllCards/loadAllEdges（线模式档案尺度底料）；**D4**：deleteCardCascade 同一提交批内 by_source/by_target 剪净触及子树的边（跨日边也剪）并返回逐字副本，restoreCards 凭 snapshot.edgePatches（DeleteSnapshot 新可选字段，R4-R6 构造点零改动）按原 id 重插、已存在者跳过=双次幂等——悬空边构造上不可达。预检补边端点闸 `edge.dangling_endpoint`（R4-R6 只有 validateEdge 形状校验、**端点从未对卡核验**；自家导出已同批剪边产不出悬空，此闸专拦第三方/手改档案偷渡——双向各测一毒+正例放行，失败库内分毫不动）。
- 牵线与同日渲染（T2，D1/D2）：⋯ 菜单加「牵线」→ 黄昏态：非靶 45% 压暗（纸落暮色）、起点抬纸 + 穿针 cursor、家眷（子树+父链）与已连对出图拒（linkage.ts 纯函数，复用 stackGeometry 口径）；三道收线之门（再点原纸/Escape/点空）；「牵给近日…」纸单跨日牵手=跨时间探索种子。线画在纸下页上：每边一条二次贝塞尔（控制点垂距 8%、弯曲方向按两端 id 定号——刷新不跳相），暖棕发丝 1px 40%、端点选中/悬停醒到 70%；无箭头无辉光无 dash。DayView 守 250：DayHead（卡片/线段切——图模式 R8 不留桩）、useWideCanvasWhisper 出山、GhostCard 独立；线账/黄昏/串珠目光全住 dayState 瞬态（e2e+单测键集钉死：卡片键 ⊆ 契约、边键 ⊆ 契约）。
- 编排与撤销（T3，D3/D4 UI 腿）：第三台一等单元 `lineOps.ts`（loadForDay 开日拉线账随纸进门、linkTo 过唯一链+180ms 双纸落定、removeLine）；`undoSnapshot` 的 buildDeleteSnapshot 加收 links 参数——**parentPatches 管「卡内席位」、edgePatches 管「线的两端」，既在叠里又牵着线的纸两样同框**（单测+真浏览器双证：撕→再想想，卡回席位、线回原 id 一字不重生）。撕线无托盘——重新牵一根就是同一只手反过来（R5 D7 口径，兑现为记录）。
- 归档与拍板（T4，D6/D7）：edges 全程骑既有机械（manifest counts/staging e:/edges.json/三阶段），e2e 真跑 导出→wipe→重导→边逐字回魂、线重新画上。D7 债终结：见决策记录。
- 测试净增：单测 219→257（+38 = `edges-domain` 8 + `edges-application` 17 + `test/ui/links-mode.test.tsx` 8 + `test/ui/thread-mode.test.tsx` 5）；既有 219 一字未动全绿。e2e 54→70（+16：桌面 D1-D6 全程含撕线/剪边反悔/点珠翻页/归档往返、手机 390 真触摸起牵-成线-reload），0 console error。真浏览器揪出并修两个产品级缺陷：近日纸单 veil 继承 pointer-events:none 真人点不动、串珠发丝只画组间不画珠间。
- LOC 闸（awk 纯行，全数 ≤250）：domain/edges 58、application/index 143、application/types 127、application/edgeCases 113、linkage 82、lineOps 73、useWideCanvasWhisper 52、DayHead 31、GhostCard 19、LinesLayer 76、Linker 82、ThreadPanel 113、DayView 212、dayState 218、store 244、undoSnapshot 38；application/index.ts 由 355→143（types/edgeCases 拆分）。

**已知债(R8 候选)**
1. 图模式与全局搜索（Phase 3 剩的两座）+ **role 去留**：字段与校验休眠两版了，R8 拍板——做关系类型编辑就加 UI+迁移校验，不做就从契约摘除（留着一枚没人认的 `role?` 是谎言字段）。
2. 实机证据长队（自 R3 顺延）：iPad/iPhone 软键盘 visualViewport、滚屏缓入手感、滚屏中 hitTest 采样漂移；叠中叠零 UI 提示（R5 尾）。
3. 同字节改名第二张卡显示首入库文件名（R2 债，五度顺延）。
4. 「这一笔没存上」保存侧仍无离线/配额根因探测（R3 债5 顺延）。
5. 线模式 BFS 每次入场全扫（loadAllCards+loadAllEdges 各一次）；档案到万级卡时要改成增量账——目前千级诚实可负担。
6. 跨日线在卡片模式完全无形（只有线模式看得见）；若用户实测「找不到昨日的线」再议角标提示，R7 不加装饰。

**决策记录(R7 增量)**
- undo 圈导出「字节回归」债拍板：**语义回归，不字节回归**——时间戳是诚实数据，为字节恒定去冻结/回拨时间戳是撒谎式优化；撕→再想想→导出的档案与 pristine 深相等（strip updatedAt/addedAt/exportedAt、卡按 id 归序后），由 edges-application 钉死、随轮销账。
- dedup 以「role 休眠、一根线就够」为口径：**同对卡任一方向已有线即静默拒**，正反各一根的假多元素不存；role 上线那天再议改契约（升 schemaVersion，绝不偷改）。
- 剪边焊在删除提交点（prune-at-delete-commit 前例延伸）：过期侧/导入侧都不再补刀——线跟纸同批走、跟 undo 同批回，「库中永不存谎言档案」连边也算档案。
- 线模式**只读串珠**：不拖珠、不存目光偏好、不给图模式留占位桩——R8 做真图模式时瞬态账目原样可续。
- 撕线不进托盘：同手势自我反悔（再牵一根即撤销），单格托盘只许给「撕下」这种要回头的账（R5 D7 口径兑现）。
- UI 瞬态三件套（黄昏锚点/目光/撕线签/落定）全走 dayState reducer，不过缝不落库——键集断言 + e2e IDB dump 双保险，契约字段全集仍是唯一真相。

**已知债(R7 候选)**（R7 注：第 2 项 undo 圈内导出字节回归已 D7 拍板销账——语义回归非字节回归，详见 Round 7 决策记录；第 5 项关系/线由 Round 7 交付）
1. 实机证据长队（自 R3 顺延）：iPad/iPhone 软键盘 visualViewport、自动滚屏缓入手感（48/12 系几何正确、体感待拍）、**拖拽滚屏时 hitTest 落点仍按落指时采样的画布原点算——滚屏位移会让入叠判定漂移，是否每帧重取 rect，实机定夺**；叠中叠手势几何已对但零 UI 提示（R5 尾）。
3. 同字节改名第二张卡显示首入库文件名（R2 债，四度顺延）。
4. 「这一笔没存上」保存侧仍无离线/配额根因探测（R3 债5 顺延）。
5. 搜索/关系/线/图模式 = Phase 3+；设置键仍两枚（theme、hint_wide_canvas）。
6. D1 的 e2e 竞态夹具是「定档+计时器重置」的尽力而为（import 若慢过 450ms 旧意图会良性开火在旧世界、被整斧抹掉——检测不到≠没修，回归防护的确定性主证在 jsdom 四面）；档案显著变大后再议加探针，暂不立项。

**决策记录(R6 增量)**
- 导入 ack = 世界尽头的整斧：pending/failed/瞬态与托盘同批弃世——用户选「档案即宇宙」那一刻，旧世界未记账的编辑即被放弃的编辑；这是 R4 托盘作废同一被接受取舍的补齐，不是新增风险。反向不变量同钉：**作废只弃旧、不毒新**（世界代数出队盖章，新意图拿新代数照常排链）。
- 拆分只搬机器、不搬纪律：undo 的 restore 排链、attach 的落笔前 settle、prune 的意图箱所有权都留在核心——「无第二链」是拆分红线，注入接口（chain/dispatch/getState/nextNoteId）是两台机与核心的全部接触面。
- 自动滚屏的『该不该动』归纯几何（可测）、「动起来像什么」归实机；reduced-motion 时循环压根不建，无新 UI 元素，存储侧不留痕。
- e2e 夹具三纪律被真跑揪出、立为样板：滚动会骗过 rect（同屏才按坐标拖）、乐观 DOM≠过缝证据（等真 IDB dump 再定档）、探测别用 rAF 频率轰炸 IDB 连接队列（有界单次开库轮询）。

## Round 8 — 2026-09-05 · 跨时间探索：全局搜索 + 图模式（时间轴纸聚）+ role 拍板（已完成，待发布）

**完成**
- 搜索内核（T0·D2）：域内纯函数 `searchCards(cards, assetMeta, query, opts)`——大小写不敏感子串（fold 走码元 1:1，CJK 天然成立；整串 toLowerCase 快路 + 逐码元核验兜底，宁可不匹配不给错位下标）；语料=按字段不按 kind（一切 props.text 正文行、link 的 url、image/file 的 hash→资产名联结），容器孩子平摊自成一行；rank=首行>后行/链接>资产名、并列 createdAt 降、id 全序兜底=结果可复现；snippet 命中行 ±40 码元、越界补省略号、高亮交付 [start,end) 下标（渲染层切 React 文本节点——XSS 从构造上无路）；cap 50、空白查询恒空、无历史无模糊无持久化。新读缝 `loadAllAssetMeta(): Promise<AssetMeta[]>`（`{hash,name?,mime,size}`，blob 一字不过缝，无名资产 name 键整个缺席）。
- 搜索纸面（T1·D1）：月历页眉齿轮旁一枚发丝放大镜（手绘 svg）+ 全局 ⌘F/Ctrl+F → 纸片自下升起（≤160ms transform 入场、下滑/Esc 退场）、输入即持焦（16px 字号=手机理智缩放线）、250ms debounce（house style）、结果按日分组新日在前、日期如书口题签、赭底淡高亮非霓虹；行点=hop 瞬态（App 级）： router hash 跳那天 → 卡片模式 → 那张纸 scrollIntoView ≤200ms 暖脉冲（纸色一暖非描边闪烁；熄灭走落点侧认领主路、App 4s 只兜孤儿 hop——e2e/jsdom 假计时器双钉）。空语「想找哪一笔？」、无果「没有哪页纸写过这个。」。
- 图模式（T2·D3）：DayHead 卡片/线/图 三段；Time-axis 纸聚非物理网——`graphLayout(entries, edges, opts)` 纯函数（日期列历法升序、日内 createdAt 堆叠、容器孩子缩进悬母片之下、隔代封顶、病态环漏网纸兜底上柱不吞纸、边=两端活 chip 才落笔的二次贝塞尔——画法复用 lineShape 同一支笔）；确定性别钉：双跑深相等 + 乱序输入不动几何。GraphPanel 入场读一遍 loadAllCards/loadAllEdges（非每帧）；chip=缩小纸片（8 字 snippet、附件换 kind 图标）；横扫逛时间、无 zoom 无拖拽重排无 animation loop；点 chip=退图模式回那天卡片并脉冲那张纸。空账本耳语「笔还没落，纸串自然是空的」。
- D4 纪律与 D5 拍板：三目光与搜索纸片的一切（查询词、debounce、开合、hop、layout 账）全住组件/App 瞬态——切换零写库（jsdom 写侧计数+存储 JSON 逐字双钉）、键集纪律 e2e 复验（卡片键/边键 ⊆ 契约全集，跳转历遍后依旧）。`Edge.role` **拍板保留**为契约内 schema 保险字段（与 Card.rot 同性质：未来关系类型留位、零 UI、零校验语义）——ARCHITECTURE §2 落字，R6/R7「role 去留」债销账。
- 测试：单测 257→305（+48=内核 22+seam 2+布局 11+搜索纸面 8+图模式 5，含 D4 三目光往返零写笔面）；e2e 70→87（+17：桌面搜索全程/⌘F/Esc/行点脉冲起熄/键集、图模式 chips+跨日发丝+chip 翻页+三段来回、夜读搜索纸片与图模式深底浅墨机判+双截图、手机 390 输入≥16px/行≥44px/行点脉冲）。真跑揪出两条 e2e 时序债立为纪律：**debounce 窗内旧行不作数**（每次输入等「这一问自己的行」再断言/点击）、**脉冲采样勿落在熄灭窗沿**（waitForFunction 见起再见底）。0 console error。
- LOC 闸（awk 纯行，全数 ≤250）：domain/search 133、graphLayout 133、SearchSheet 132、GraphPanel 89、cardHop 7、useCardPulse 13、DayHead 33、App 169→176、dayState 204→206、storeTypes 36、store 244（未动）、DayView 212→229、CardFrame 244（+2）、application/index 153、main 27。

**已知债(R9 候选)**
1. 实机证据长队（自 R3 顺延）：iPad/iPhone 软键盘 visualViewport、滚屏缓入手感、滚屏 hitTest 采样漂移、搜索纸片在真软键盘下的顶托（headless 只会几何近似）。
2. 同字节改名的第二张卡显示首入库文件名（R2 债，**六度顺延**）。
3. BFS/搜索规模化前奏：loadAllCards/loadAllEdges/loadAllAssetMeta 每次入场全扫（万级卡改增量账；R7 债5 的续命）。
4. undo 导出字节已销账确认（R4 债、R7 D7 拍板语义回归——本轮无新增证据需求，仅复述在账）。
5. 图模式只画「两端都是活 chip」的线；跨日线的角标提示仍议而未决（R7 债6 原样）；children 跨日引用（病态）在图上母片下不出子片（byId 同日限定），静默跳过。
6. 搜索不认多词 AND/OR、不搜 meta、不搜未知 kind 的非规范字段——按最小契约交付，实测有需求再议。

**决策记录(R8 增量)**
- role 去留拍板：**保留为契约保险字段**（与 rot 同性质）——schema 保险的价值恰在没人需要它的日子里最低；摘除它是省一行类型、赔一次升版本，不值。哪天真用再升 schemaVersion 配校验，契约纪律不变。
- 图模式弃力导向取时间轴纸串：x=日期 y=日内时序，布局是纯函数不是模拟——用户要的是「串起来翻」不是「弹来弹去找」；确定性=可测、可复现、刷新不跳相。
- 搜索无历史无持久化无模糊：本地私册，「搜过什么」本身是隐私；翻旧纸的手感来自即时高亮与按日回跳，不来自搜索引擎的联想 machinery。
- hop 熄灯主路移到落点侧：脉冲的 200ms 该从「纸到齐」起算——从点击起算会让慢加载吞掉那一眼暖；App 4s 兜底只收无人认领的孤儿瞬态。
- snippet 高亮契约=「原文切片+[start,end) 码元下标」：域算坐标、渲染层切文本节点，HTML 注入路在架构上不存在（MdView 纪律延伸）；e2e + jsdom 双面判死 XSS。

## Round 9 — 2026-09-05 · 卡型补齐（六渲染器 + mime 路由表 + 添卡纸单 + 改名债销）(已完成，待发布)

**完成**
- D1 mime 路由表（T1）：`ui/attachRoute.ts`（纯函数，穷测 20 路）——`application/pdf` 精确点名、`image/ audio/ video/` 前缀归号、参数尾巴与小写噪音先洗、其余一律文件卡（未知类型至少存得下）；`placement.attachKind` 二分流退役，夹带管线与 Ghost kind 谱（dayState 窄化为 AttachKind）只消费这一张判据表。
- D2 六渲染器落位（T2）：registry 挂上 v1 联合自始预声明的六槽——声音纸（纸上一枚原生 `<audio controls>`，不画假波形）、影纸（原生 `<video>`，创建期与图片共一条 `imageFitMaxW` 封顶血脉：`videoProbe.ts` 的 `<video preload=metadata>` 探尺，失败退默认尺寸、渲染期 loadedmetadata 自愈补全——图片同款双保险）、火漆签（chip 一点 = `target=_blank rel=noopener` 新页开 blob 原件；内嵌预览明确不做，零依赖法没有 PDF.js，R10 候选）、代码纸（暖墨等宽无高亮，长行横向推纸）、题签纸（题面 host/title + 网址发丝，不是超链接蓝）、手记纸（text 渲染器的 md 别名槽，正文卡两路并存）。资产全系共骑 `useAssetUrl`：objectURL 与卡片同生死，卸载/换 hash 即 revoke（jsdom 直钉 revoke 调用）。
- 链接闸与安全（T2·D4）：`domain/link.ts` `safeHttpUrl` 孤闸——WHATWG http(s) 规范形独认、控制字符零容忍、无协议/协议相对一律 null；创建/编辑提交才写 props（半途草稿连 props 都不进，拒签配「写个完整网址，比如 https://…」耳语），渲染期同一实现再走一遍（库里的 javascript: 换不来一条 `<a>`，只以文本现形）——两处都不是孤闸。D4 形状闸挂进既有 `validateCard`：资产类 hash=64hex（sha 冻结小写，大写即畸形）、code/markdown text 必字符串、markdown 只认 format=md、link 空串容草稿（新建未落笔）非空必过闸。**契约零变更零迁移**：props 形状本就按 kind 判别，未知 kind 原样保留一字未动。
- D3 添卡种类纸单（T3）：底栏「添一张卡」一 tap 正文口径一字不动（hero 回归闸 jsdom+e2e 双钉），旁缀一枚发丝 caret 掀开纸单——正文/手记/代码/链接/垫纸，垫纸即造叠旧动作，三新型走 spawn 全谱；Esc/点单外/选毕即收，开合纯屏幕瞬态零写库。手机 caret/行热区 ≥44px（格式 chip 同闸）。
- D6 改名债终结（T4，R2 债·六度顺延后首破）：`props.name` 纸面展示覆盖（可选 additive JSON，键集 ⊆ 契约断言带 name 照常过秤）——⋯ 菜单「重命名此纸」只对资产五型现身（`isAttachKind` 同一张表做资格闸），浮笺落笔经唯一串行链 `schedule→updateCard` patch.props；展示链 `props.name ?? asset.name ?? hash前8` 唯住 `assetLabel`（空串署名=撤下覆盖，视同没有），图纸改名后纸下小名一行、影音声纸题签常挂；**资产记录永不改写**（内容寻址的权威名与纸面私名互不连坐）——同哈希两张纸各显其名，jsdom + e2e 真浏览器双终判（雨后槐花/同名副本同屏互见、导档案 wipe 重导名随身走）。
- e2e 纪律两则（本轮真跑揪出）：①R6 债#6 竞态夹具从「抢先机开盲盒」改为确定性排序——旧世界 strip/move 先在盘上落定再重导，「全量替换必赢」这杆秤不再掷硬币（R6 尾注「尽力而为」债兑现；ack 一瞬在途即弃的主证仍在 jsdom 四面）；②headless chromium 无 PDF viewer，blob `<a target=_blank>` 走下载管线——火漆签断言改为「新页必开 且 真 PDF 字节以 uuid.pdf 交还（扩展名=真 MIME，proof-of-pdf）」，真 viewer 环境走 blob: 导航路。R9 新检 9 枚：真 RIFF/WAVE 夹带→声音纸真解码 readyState≥1、页内 canvas+MediaRecorder 真 webm→影纸、纸单代码打字 reload 排 pre、纸单链接 javascript: 拒签+https 过缝全页零脏 href、改名债死双名同屏、导出→wipe→重导 name 逐字回魂+键集复秤、夜读五型机判（名题面零 ink-faint，R8 法律延伸；`.bj-file-size/.bj-file-quiet` 顺手 ink-faint→ink-soft——尺寸与状态是可读信息不是装饰）+逐纸截图取证 33-r9-night-{audio,video,pdf,code,link}.png、手机 390 纸单真触摸落链接。**96/96 ALL-PASS 连跑两遍，0 console error。**
- 测试：单测 305→370（继承工 48 = 链接闸 24 + 路由 20 + props 形闸 4；收尾补 17 = 纸单 5 + 改名 5 + 渲染器面 7）；e2e 87→96。LOC 闸（awk 纯行，全数 ≤250）：store 247（在顶下走，R10 若再触先拆）、CardFrame 244→246（浮笺析出 CardMenus 82 抵账）、DayView 229→232（纸单独立成组件 KindSheet 79）、attachPipeline 82、attachRoute 22、link.ts 28、videoProbe 25、六渲染器 34-83、cardShape 161。

**已知债(R10 候选)**
1. 实机证据长队（自 R3 顺延）：iPad/iPhone 软键盘 visualViewport、滚屏缓入手感、hitTest 采样漂移、代码纸 tab 键与横推体感。
2. PDF 内嵌预览：chip 已闭环，页内翻页需 PDF.js（新依赖）或另案——待产品拍板再上。
3. BFS/搜索规模化 + loadAll 系列每入场全扫（R7 债5/R8 债3 原样顺延，三处投影缝同批改增量账）。
4. 「这一笔没存上」保存侧根因探测（R3 债5 原样顺延）。
5. （R9 新立）导入 commit 与中介串行链不同门：旧世界意图若已开火、其 IDB 事务排在 ack 之后过锁，worldGen 的链头弃权管不到那一指宽（R6 治的是「已排水未开火」）——候选解：导入 commit 走 store 同一条链排队；e2e 侧已确定性化，窗口实机复现前不立法。
6. 影纸无名时题签常挂（与图纸「改名才显名」不对称）——下轮视觉拍板统一口径。

**决策记录(R9 增量)**
- 注册表兑现「新增卡型不重构系统」：六槽 v1 联合自始预声明，本轮填槽零 schemaVersion 零迁移；`props.name` 走 kind 内 JSON additive，旧档案无此键照常读——契约的预留位第一次真被用到，且用到即验证了预留的价值。
- pdf 是签不是页：零依赖法排除内嵌预览；新页开原件=浏览器全权，blob 同源、`rel=noopener` 断反向句柄，攻击面为零。
- 改名走 props 覆盖、不动资产：内容寻址下同字节共享同一份原件记录，资产名是「原始入库时的叫法」（权威、恒定），纸面名是「这张纸上的叫法」（私有、可空）——R2 债三六度顺延的根因是把两件事记成了同一件，分开记账即债消。
- 添卡不叠新交互：一 tap 正文是肌肉记忆承诺，种类入口压在一枚 caret 之后——纸单五行全是既有动作，零新编排、零新状态。
- mime 判别、改名资格、Ghost 卡型谱三件事共吃 attachRoute 一张表：判据只住一处，placement 从此只谈几何。
- 链接 sanitizer 双闸同实现（domain 纯函数）：表单与渲染共骑一个 `safeHttpUrl`，永远不漂移；纵深防御≠两套代码。

## Round 10 — 2026-09-05 · 导入 commit 走中介同一条链（债#5 死：提交屏障——「库中永不存谎言档案」第一次罩住导入本身）(已完成，待发布)

**完成**
- 债#5 死（T1-T3，本轮核心）：数据可靠性最后一扇窗关门——importArchive 阶段 3 的 commit 事务自此是中介串行链上的**一个排队环节**（writeChain 提交屏障 runBarrier），所谓「第二道门」从未存在：CommitGate 只是排他执行权的注入缝，事务本体一字未动（恰好一个 readwrite 横跨五 store、oncomplete-only、游标内零 await——契约 §7 三纪律与六陷阱原样）。屏障四段纪律：**①排入时刻同步代数 ++**（比 R6 的 ack 落斧更早一截：管住「commit 已排上、ack 未至」窗口里的一切后继——已出队未开火者链头弃权，屏障后排队的意图入 armed 账、绝不复活盖新笔）；**②在途开火者由链前缀静等结算**——任务书说的「get 已 resolve、put 未发」在真实代码里其实宽得多：withStore 每仓库调用各成一事，updateCard 是两事务序列、deleteCardCascade 四个以上，所有 await 缝都在危险区，屏障的解法是把 commit 排在它们全部落定之后（旧世界迟到的写先落盘→被 commit 的 clear 整体抹掉，IDB 同 store readwrite 按创建先后过锁，构造上无可交错）；**③成功时弃世整斧在链环内先落、后放 ack**——brief 未列的第二洞：import promise 结算与 React ack 之间有一微任务缝，链上后继若抢先开火就能把旧笔落进新宇宙，onSwap 在 settle 之前即焊死；**④commit 失败复活弃权者**（排入时刻的代数 ++ 引入的新代价自己接住）：rescued/armed 字段并集重上链、last-intent-wins、一笔不吞不双写不毒链、旧宇宙一字不换。jsdom 对抗面 + 失败面 + 「只弃旧不毒新」面全钉。
- T0 先拆后建（纯 refactor 独立提交）：store.ts（248 纯行、R9 报告「再触 store 必须先拆」兑现）把 schedule/diff/flush/worldGen/两箱/串行队列整块搬出成 **writeChain.ts**——370 测不动一字全绿后方在核心上建屏障；落成 store 189 纯行、writeChain 167，双双在 250 内带。
- 测试（T4）：单测 370→373——`import-barrier.test.tsx` 三面（A：updateCard 悬挂开火 + ack 后才排队一笔，编排日志定死 in-flight→landed→commit、抹除后库逐字=新宇宙、ack 后零过缝；B：commit 失败复活 c-2 过缝、旧宇宙不换、失败人话上抽屉、不双写；C：新宇宙新笔照常过缝），**R6 四面（import-discard）一字未动原样全绿**；e2e 96→97——R9 的「确定性绕行（先落定再重导）」退休为本轮真对抗夹具：一次性挂起闸钉在 `IDBObjectStore.get`（撕下链上意图卡在事务序列半路）、5-store readwrite 诞生计数器钉在 `IDBDatabase.transaction`（commitStaging 独此一家）——修后 1500ms 探针窗内 commit 事务零诞生（屏障正证）+ 放行后重导日逐字节 ≡ staged + children 依档还原 + 队列不毒，**连跑两遍 97/97、0 console error**；阴性对照：临时还原 R9 旁路则诞生探针与逐字节双 FAIL——窗口真存在，非虚构威胁。
- 文档：ARCHITECTURE §7 阶段 3 补屏障归属一行、§8 偏差表补第 6 行（setCommitGate/commitGate 全 additive）、§9 基线、§10 缝清单补齐。用户可见增量为零（纸下管道轮，UI/文案一字未动）。

**已知债(R11 候选)**
1. 实机证据长队（自 R3 顺延七度）：iPad/iPhone 软键盘 visualViewport、滚屏缓入手感、hitTest 采样漂移、代码纸 tab 键与横推体感。
2. PDF 内嵌预览（R9 原样）：chip 已闭环，页内翻页需 PDF.js（新依赖）或另案——待产品拍板再上。
3. BFS/搜索规模化 + loadAll 系列每入场全扫（R7 债5/R8 债3 原样顺延，三处投影缝同批改增量账）。
4. 「这一笔没存上」保存侧根因探测（R3 债5 原样顺延）。
5. 影纸无名时题签常挂 vs 图纸改名才显名（R9 债6 原样）——下轮视觉拍板统一口径。

**决策记录(R10 增量)**
- 导入 commit 无第二道门：屏障是那条唯一链的排队环节——红线证据=代码里不存在第二个队列，门的签名只是 `<T>(task)=>Promise<T>` 透传；弃权/结算/整斧/复活四段全长在 R6 现成机制（代数盖章、两箱、托盘兴废）上，零新状态机。
- 已提交事务不回滚是正解而非妥协：IDB 承诺写回滚不了，屏障把它转化为「先到先得、整体抹除」——与 R4「档案即宇宙」的取舍同源，全量替换语义天然收编。
- 排入时刻代数 ++（非 ack 时刻）+ 链环内整斧（先于 ack 放行）= 两记组合拳各堵一分钟任务书没写的窗：前者堵「commit 已排队、ack 未至」的后继开火，后者堵 promise 结算与 React 落斧之间的微任务缝；其代价（commit 失败会吞弃权笔）由 rescued/armed 复活路径自己接住，失败面也有诚实账。
- setSetting 侧（主题、宽画布耳语）保持链外直通：单事务、无读-改-写，先至被抹、后至即新宇宙真话——不存在谎言窗，屏障只管 RMW；诚实记档不扩张战线。
- 先拆后建为硬序：R9 报告点到的 250 天花板在 T0 兑现后才动 store 语义——纯搬运一个测不改，行为等价由全量 370 绿背书，屏障的问题域自此有独立可测宿主（writeChain）。

## Round 11 — 2026-09-05 · 长期使用体验打磨：六桩长尾债一轮收口（已完成，待发布）

**完成（三笔销账：pdf 内嵌 by-decision / 增量账本 by-evidence / 保存根因 by-code）**
- D1 保存侧根因探测（R3 债5·七度顺延死）：writeChain 落 `classifySaveError(err)` 纯函数，链条 catch 边界三分——quota（真 DOMException name + Firefox/Blink 全引擎名 + legacy `{code:22}/{code:1014}` 裸形状全收）/ drift（InvalidDate/NotFound/Constraint 一族=程序或数据漂移，不甩给用户「满了」）/ unknown passthrough。dayState 回执带 cause、day/open 携日同携因；App 唯一便签通道的落盘回执按类配文案：配额=「手机纸不多了 · 导出旧手札」＋「再试」补句尾（出路不是警报），漂移/未知走 R2 既有通用一字不改——保守不猜根因。零新 UI 通道。
- D2 题签对称（R9 债6/R10 债5 视觉债死）：**拍板影纸「常挂」口径胜出**——chip 的行内名是题签的本相（未改名也显资产原名/hash 前缀给的是「这是哪件东西」的诚实账，藏签反而让图纸像没署名的信）；改判图纸：`readAssetProps+assetLabel` 共一家（手搓解析退役），未改名亦纸下一行常显。四类（含声音纸五类）name 元素同挂一枚 `.bj-asset-name`+`data-asset-name`，版位（画面在下/chip 在内联）随纸面、排印口径一个（13px/1.4/ink-soft/ellipsis 唯一出处）；既有类名保留双挂，机器检=e2e 图/影/火漆/文件各改名→reload→四型全显纸面名+同 class 断言。
- D3 PDF 内嵌预览：**CLOSED-BY-DECISION——不做**。PDF.js 体积违背零依赖+离线轻的立身法；新页翻开原件=浏览器全权的诚实长期行为，移动端原生 PDF 就地可読。账上自此无此项。火漆签「翻开」一字继续。（纯拍板零代码）
- D4 规模预算测（R7 债5/R8 债3/R10 债3 三度顺延·**CLOSED-BY-EVIDENCE**）：2000 卡/600 边/200 天真缝宇宙（批量落档+读侧全走 BanjiApp 缝）钉四条热路径——searchCards 1.9ms<50 / graphLayout 39.8ms<150 / threadOrder BFS 分量 0.5ms<150 / exportArchive 全趟 74ms<2000。余量皆一个数量级：**数千卡在设计尺度内，增量账本在 10× 前是过度工程**。预算测只防锈不压榨：越线才重开立项。
- D5 快捷键补全（spec Phase-4 余账）：⌘/Ctrl+N 添一张卡（与 pill 同口径、新纸持焦）·⌘⇧K 造叠 ·⌘E 导出备份（抽屉开门直发=只读零确认，月历同样可用）⌘F 原位保留。守门纪律：写字第（input/textarea/contentEditable）持焦一律不开火，例外仅 Esc 与 ⌘F（就地换一问）；月历无 pill=无 ⌘N/⌘⇧K（让位浏览器，不吞键做哑巴）。Esc 巡检矩阵：搜索纸片/种类纸单/牵线/撕线签/改名浮笺早有自持出口（R7-R9 各就），**漏的只有抽屉**——补上即收口。键术五行小字（添/叠/寻/卷/退）住进设置抽屉发丝 list，零 modal 零 toast；无注册框架无新依赖。
- D6 空/错状态巡检（spec Phase-4「全面打磨」）：**巡检账——1 处改文案、3 处补证、空态零改**。错误面查出一处裸奔：预检拒信的 userMessage 直排 raw enum（「问题：edge.dangling_endpoint 边…」）违背 R1「每个 reason 有人话」铁律——`archive/rejectCopy.ts` 补 16 预检码+26 validate 形状码人话表（inner 有专属话点名更细；`code @ path` 形状碎语不上用户脸、raw 证据只住 detail 支持位），悬空端点读得出「有根线牵着不在档案里的纸」，超新档旧规矩原样。空态六面（日历首开/footer「翻开即今日，落笔即永远」即耳语、空白日、搜索、串珠、图、空托盘本就不渲染）皆纸语——零改动诚实报。可达性补票：悬空端点/超新档两道拒信走 jsdom 抽屉双检；键术矩阵/根因三分/题签对称各有专属测。
- 测试：单测 373→408（+35：根因 8+D2 类 5+键 10+预算 5+D6 7）、既有 373 一字未动全绿（D2 全程 class 双挂，e2e 与单测选择器零调整）。e2e 97→103（+6），103/103 连跑两遍 0 console error；e2e 夹具自纠一处：chip 体 data-nodrag 点不中是 R4 既有纪律（点它=不选卡），R11 新检落点走卡片纸边留白——非回归。
- LOC 闸（awk 纯行，全数 ≤250）：writeChain 218（classify 落此）、dayState 223、App 200、store 190、SettingsDrawer 184、image 42/video 39/pdf 36/file 33/audio 29、importArchive 137、rejectCopy 60、DayView 235（未触）、perf-budget 152。

**已知债(R12 候选)**
1. 实机证据长队（自 R3 顺延八度）：iPad/iPhone 软键盘 visualViewport、滚屏缓入手感、hitTest 采样漂移、代码纸 tab 键与横推体感。
2. e2e 长跑环境敏感：R11 首跑 R8「图↔卡片」4s 超时机再现、复跑即绿——graph 入场重渲染与时序赛跑，可考虑收紧既有 waitForSelector 预算或加轮询（既有检不许改数字则按纪律复跑为准）。
3. 键术覆盖面下一步（若用户要）：⌘Z 撤销？现在 undo 只走回执按钮；牵线/撕线无键入口——加键=加账，等实测需求。
4. 图模式只画「两端活 chip」线、跨日线卡片模式仍无形（R7 债6/R8 债5 原样）——实测「找不到昨日的线」再议角标。
5. 月历页 ⌘N 让位浏览器的口径若惹恼用户，备选=月历按 N 跳今日再落笔（一步变两步，产品未拍板）。

**决策记录(R11 增量)**
- 题签对称拍板：影纸常挂胜出、图纸对齐——「改名才显名」把题签定成了隐私声明，但题签的本相是「这是哪件东西」的诚实账；未改名显资产原名/hash 前缀与 chip 三型同律，五型一枚 `.bj-asset-name` 类+链只住 assetLabel 一家。版位差（画面在下/chip 在内联）是纸面形状决定的合法方言，不是口径分裂。
- PDF 内嵌 by-decision 销账：做与不做的裁决已下——不做；PDF.js 违背零依赖+离线轻，新页翻开的原件由浏览器全权，此项永不再开账。
- 增量账本 by-evidence 销账：debate 用数字关门——四热路径在 10× 目标规模下余量皆一个数量级，账本在 10× 前是过度工程；预算测永驻防锈，越线才重立。
- 快捷键零打扰三律：无 toast 庆祝按键、无 onboarding 弹窗、写字第上不开火（例外仅 Esc/⌘F）；键术单住抽屉几行小字不住 modal。⌘E 直发导出合法——只读动作无确认负担，抽屉开门交卷由「确认替换」的双确认纪律反证（写才拦，读放行）。
- 保存根因配额话术定性：「手机纸不多了 · 导出旧手札再试」——根因说设备事实、出路给旧手札导出，无警报无技术名；漂移/未知不猜根因是保守也是诚实（猜错一次的代价=用户不再信回执）。
- e2e 夹具纪律延伸：chip 卡（data-nodrag）的选中落点=卡片纸边留白带（padding 12/14px），像素纪律写进夹具注释——R4 触摸修复的另一面。

## Round 12 — 2026-09-05 · SMALL 收口轮：两桩债一处死、实机长队转人交清单（已完成，待发布）

**完成（小轮三件：e2e 时序债死 · 跨日线角标 · 交接文档）**
- e2e graph 入场时序敏感（R11 债2）死在根因上：R8「图↔卡片」往返回程那一笔「图」点击，落的正是 chip 跳纸后 App 级瞬态 hop 的 260ms 灯亮窗（FLASH_OFF_MS）——灯亮期间 DayView 按 R8·D4 落点语义把本日目光强制收回 'cards'，往返点击被 effect 收走、[data-graph] 永不现身、4s waitForSelector 超时。旧夹具 waitForFunction 只等到「灯点亮」即起跑，等于把断言掷给调度运气。修法是等真条件：is-pulse 从 DOM 消失 ⇔ React 已提交 hop=null、effect 从此哑火，零 sleep、既有检一字未动。**全量 e2e 连跑三遍 106/106 全绿 0 console**——三次连绿即时序销账的凭据，不是复跑即绿的心态账。
- 跨日线角标（R11 债4 图模式半）：graphLayout 落纯谓词 `lineDayBadge(fromDate,toDate)`——同日=null（角标绝不悄悄上线），跨日=历法较晚端（「远端」，字典序在 ISO 上=历法序）；GraphLine 携 badge 几何，GraphPanel 把「9月4日」式日子签钉在远端纸角（`.bj-line-badge`：ink-soft 淡墨·纸色底·pointer-events 穿透不抢 chip 点击·aria-hidden），同日线渲染零变化。夜读法律延伸机判：该面永住 ink-soft（可再读的信息不许 faint 到消失）、底落真夜纸令牌；e2e 判族自 DOM 自立——chip 的 data-graph-date 对照线段两端算 cross/same，不信渲染谓词自报的账，跨日线恰一枚/同日线零枚/文字=远端日三面共 3 新检。
- 实机长队（R3 起八度顺延）转正：docs/REAL-DEVICE-CHECKLIST.md（56 行·十节·主人语气）——加主屏/软键盘打字避让/拖卡长摺/夹带相册（HEIC·实况·短视频）/粘贴/导出分享面板/导入双确认/夜读观感/自动滚屏手感/代码纸 tab，每笔=做什么→期望什么→不符记什么回来。无头永远修不了的账，自此由人收。
- 测试：单测 408→414（+6：谓词三面〔同日隐/跨日显且两端登记序无关/跨年历法序〕+落位两面〔远端纸角界内/登记序反钉照旧〕+混线账〔同日 null·跨日显形同图共存〕）；e2e 103→106（角标白班令牌/判族自立/夜读令牌三面）。既有 408/103 一字未动全绿。
- LOC 闸（awk 纯行 ≤250）：graphLayout 149→169、GraphPanel 99→114、graph.css 123→141、live.mjs 1666→1712（e2e 不设闸）、ROUNDS/新文档不设闸。契约零变更、依赖零新增、UI 除角标外零变化。

**已知债(R13 候选)**
1. 实机清点回执（交接即挂账）：清单上任何一行 ✗ 回到仓库，就是 R13 的工作账——八度顺延债自此改由人驱动，不再由轮次顺延。
2. 卡片模式的跨日线仍无形（R7 债6/R8 债5 后半）：角标立的是图模式的账；日画布上跨日「这一根线去昨天」的显形方案，等实机清单或真实用户先喊疼。
3. 键术下一步（R11 债3 原样）：⌘Z/牵线撕线键入口——加键=加账，等实测需求。
4. 月历 ⌘N 让位口径（R11 债5 原样）：惹恼用户再拍板。

**决策记录(R12 增量)**
- 时序债的修法只有「等真条件」没有「改预算」：4s→8s 是把硬币掷得更远，is-pulse 熄灯=hop 已 null 是状态机的公开结账面——夹具从此对齐语义而非对齐运气。effect 本身（跳纸落图即收回目光）是 R8·D4 拍板过的落点语义，不动。
- 角标的「远端」=历法较晚端，不是登记源端：判据必须是日历事实而非记账顺序，否则同一条线换个 from/to 写法角标搬家——谓词独立测钉死这一点（反着登记照旧钉同一端）。
- 判族住在 e2e 的 DOM 侧：cross/same 由 chip 日期对照线段两端自立算出，再对照角标集合——渲染器的谓词与断言者的谓词互为镜面，一漂移即红。JS 里那句 max(字典序) 就是全部信任的额度。
- 实机债的诚实终局是转手不是硬修：无头环境模拟软键盘/相册私有 MIME/分享面板都是自欺的夹具；写清「做什么→期望什么→记什么回来」，让人成为传感器，账才真能平。

## Round 13 — 2026-09-06 · 敌手加固导入闸（R1 顺延债「真·流式解析大 ZIP」并案闭账）(已完成，待发布)

**完成（一轮四仗：封顶 D1 · 电池 D2 · objectURL D3 · 10× 证据 D4，零新功能零契约变更）**
- D1 流式封顶（R1 顺延债死）：zip 层新增 `streamZipEntries` 逐块交付流解（fflate 未显眼纪律三则全测钉：拒收=不呼 start() 压缩区整段跳过零解压；1 KiB 馈片使 deflate 输出分批交付、sink 抛错即全场死停；UnzipInflate 会接住回调抛错再从 ondata(err) 递回一次，thrown 记号保异常 identity 上浮供 instanceof 分诊）。`guard.ts`（纯词表）+`view.ts`（两遍流式）：名册白名单正则钉死 v1 §4 形状（`../`、绝对路径、空名、反斜杠、NUL、% 转义、大小写花招、全角/西里尔同形字——25 发敌手子弹逐发验）；条目重名=第二次出现即拒（不赌 ZIP 排列运气）；总数封顶 20000。**承诺制双闸**：manifest.assets[] 的 size 是档案自报的承诺——闸一看本地头自报尺寸超「承诺+1 KiB 松弛」即整段不解（0 字节代价）；谎过头 THEN 闸二边解边数、越界停喂。实测取证：64MB 真身/承诺 1KB 的双谎档，闸二停在 3.7MB（1/57）、23ms；配额门改在读正文之前用承诺字节算账——诚实 200MB 炸弹 `quota_exceeded` 于 2s 内（旧码先全量解压再算账的洞随之死）。counts{} 对账入预检（放末位 say 不抢既有病根首位，封面数目说谎=archive.counts_mismatch）。新闸码 9 枚（entry_name/dupe/count/oversize、asset.orphan_body 册上无名正文、manifest_missing 与 pages_missing 分道、archive.corrupt 解坏≠非档案、counts_mismatch）全登 rejectCopy（16→25 行、纸语零裸奔、互不撞文案有专测）。既有面诚实记：资产名「不合式即静默忽略」早已存在（敌手名进不了 rawAssets 但也不拒）——本轮把容忍升为 typed 拒绝；fflate 流解不验 stored 的 CRC（纵深防线=内容寻址 hash 实算，电池有专行：偷改 stored 一字→asset.hash_mismatch 兜杀）。
- D2 敌手档案库：test/archive/zipcraft.ts 作坊（zipSync 主建 + LFH 解析手术：翻字节/改头尺寸/拼接造重名/确定性伪随机——零二进制入库全可复跑）；hostile 上篇 8 案+下篇 12 案每案四证（a 闸码 typed、b snapshotRepo 前后逐字节相等、c 时长有界 5s、d 人话在册 raw 不上脸）：炸弹 a/b/c、穿越、25k 爆量、封蜡裂(corrupt 1ms)、stored 偷改(hash 兜)、混档(名字先死哈希没跑)、counts 谎/孤本/缺文/非hex/字符串版本、垃圾字节、缺封vs缺页两样病各说各话、重名、空宇宙（诚实空册必须成功——别拿敌手闸掐死正字）、超额资产。R10 真路三钉：敌手拒信与空宇宙成功全走 BanjiApp 缝 + 注册提交门——成功恰敲一次、失败零敲、库逐字不动（屏障不旁路）。
- D3 objectURL 生命周期审计（站点→政策→测试）：`probe.ts` <img> 兜底路=成功/失败双事件即放（既有）；`videoProbe.ts` metadata/error 双路即放（既有）；`useAssetUrl` 卸载/换 hash/建而未及三径即 revoke（R9 钉在 cards-r9，复验不动）；夹带 GhostCard 纯占位零 URL（核过）；抽屉导出下载=60s 定时放（既有）；**本轮唯一修正=火漆签新页**：卡一卸载就 revoke 会掐死刚翻开、还在取首屏的那一页，永不放又漏到整页关闭——拍板「交棒宽限」：点开翻开即把该 URL 的释放改挂 10 分钟超时（够首屏落地、已载入页对 revoke 免疫、超时自放零积压），同纸再翻旧棒由新棒顶替；未交棒一秒仍走 R9 即刻放原纪律（影纸/声音纸/图纸钉死零例外）。假计时器三拍验：不点=即放、点=10 分钟到点恰放一次、差一拍不提前。
- D4 10× 规模证据（R11 预算宇宙 ×10：19800 卡/5000 边/1800 天，常跑不 skip——实测整文件墙钟 ~3.1s 不触 60s 慢轮线）：searchCards 37.8ms（预算×4=200）、graphLayout 336.4ms（<600）、threadOrder 1.3ms（<600）、exportArchive 全趟 333ms（<8000）。四线全守且皆 ~1× 数据比近线性：**「数千卡在设计尺度内」判定在万级卡仍然成立，增量账本 by-evidence 再钉一轮、零热路径手术**。
- e2e 106→110：R13 四检全在真浏览器真 IDB 上——64MB 伪账炸弹过抽屉双确认死于闸下（拒信上屏 ≤5s）、穿越档名不合册、敌手两轮后 dump 逐字复秤、reload 一纸不少。**110/110 连跑两遍 0 console error**；三笔测试 fixture（r13-*.banjizip）现场构造走既有 gitignore 纪律。闸码拒信上抽屉的纸面可达性两判入 jsdom（mock 缝直供 entry_oversize/corrupt 真拒信）。
- 测试：单测 414→487（+73 = hostile 8 + lies 12 + guard 单元 43 + objecturl/ui 5 + scale10x 5）；既有 414 一字未动全绿（quota 门次序改造由「空间不足/充裕/探针缺失」三既有案复秤原行为）。
- LOC 闸（awk 纯行 ≤250）：zip 149、guard 126、view 77、importArchive 122、preflight 248（新并 GateCode 回顶内——下一轮再触 preflight 先拆）、rejectCopy 69、asset 94、pdf 37、e2e 不设闸。**契约零变更**（v1 档案形状未动一寸——收紧的只是「什么算合法档案」的验收面），依赖零新增（fflate 已有一等公民用满），UI 除 rejectCopy 新行外零改动。

**已知债(R14 候选)**
1. 实机清点回执（R12 交接单）：任何一行 ✗ 回仓即 R14 工作账——自此由人驱动。
2. （R13 新立·诚实余量）四个 JSON 定名页无字节可承诺（名册只许承诺资产）——敌手若往 journals.json 灌 200MB 零体，膨胀受「馈片×deflate 极限比」逐窗钳制且 decode/parse 必死，但**页级承诺只能等 schemaVersion 升版时补 shape**（v1 冻结期内无法加字段先记在案）。数据描述符头（-1 自报）条目同走流路闸（闸一不可用），已是该情形最硬的一道。
3. 卡片模式跨日线仍无形（R7 债6/R8 债5/R12 后半，图模式角标已立）；键术 ⌘Z/牵线撕线入口（等实测）；月历 ⌘N 让位口径（惹恼再拍板）。
4. preflight 248 纯行顶格：闸字表(countLies/rejectCopy 装配)可析出独立册；store.ts/writeChain 未触。
5. （小账）stored 条目 CRC 流层不验（fflate 特性）——纵深靠 hash 实算已够严；若换校验器须整包复秤电池（e2e 与单测两层钉着，不会静默漏）。

**决策记录(R13 增量)**
- 敌手加固不加新功能、不改格式：.banjizip 是数据越过代码的唯一信任边界，收紧的是「验收的手」不是「契约的纸」——所有新闸码走既有 rejectCopy 人话表、既有 ImportResult 形状、既有导入三阶段与屏障，UI 一行没挪。
- 流式封顶的优雅在「用敌手自己的承诺钉他」：manifest.size 说 1KB 就只许解 1KB+窗；说 200MB（诚实）就配额先行拒收——零魔数只在页级留下诚实空白（R14 债 2 记档），不在闸上掺感情用事的常数。松弛量 1024 是 deflate 交付窗的物理误差，不是信任额度，注释与测试两头都这么记账。
- 拒绝家族各归各病根：缺封面（manifest_missing）≠缺账页（pages_missing）≠不是 ZIP（zip_unreadable）≠封蜡裂（corrupt，解到一半读坏）——R14 复看时这四张脸必须还能各自说出不同的话（电池各有一案看门）。
- counts 对账放末位 say：既有七连损坏电池的「首条病根」语义一字不搬——新闸给档案加严，不给老判定抢镜。
- 空宇宙必须成功：敌手轮的闸只咬谎，不咬诚实——0 卡 0 边 0 资产的合式档案是「新册初页」的正常形状，拿它试闸=拿用户数据试闸。
- pdf 交棒宽限两头都不输：即刻 revoke 掐死正在翻开的那页，永不 revoke 漏到关页为止；10 分钟超时 + 再翻顶替 = 首屏稳落地、有界不留尸。
- 10× 的墙钟 3.1s 让「慢轮开关」成了多余的礼节：不触线的证据天天跑，skip 只留给真慢的——证据常绿比 CI 客气值钱。

## Round 14 — 2026-09-06 · 可安装与离线（PWA 诚实落地：manifest + 图标 + 版本化壳缓存 SW；已完成，待发布）

**完成（一轮一件：修掉「清单让你加主屏、应用却没壳」的自相矛盾，用户可见功能零新增）**
- D1 安装身份（T1）：`public/manifest.json` 静态入册——name/short_name「伴记」、纸感一句话描述、`start_url:'./'` + `scope:'./'` 全相对（发布在 /i/banji/ 子路径的命根子，单测钉死）、standalone、lang zh-CN、background/theme_color=白班宣纸（与 theme.ts `THEME_PAPER.light` 对账同一枚 #f2ecdf——夜读翻转仍走运行时 meta，manifest 不抢戏）。图标四枚 `scripts/make-icons.mjs` 作坊产出（playwright-core 无头 Chromium canvas 落墨，确定性画序可复跑）：宣纸底+金角纤维淡丝+发丝内框+宋体「伴」光学校正，192/512/maskable（无框缩字进安全区）/apple-touch-icon 180，PNG 作源文件入库、public 直通发布；index.html 补三枚 link（manifest/icon/apple-touch-icon 全相对）。
- D2 版本化壳缓存（T2，本轮核心）：**手 roll 拍板**——vite-plugin-pwa 的 peer 实测拉 229 包/106MB（workbox-build+workbox-window），只为描述这 60 行 fetch 模型，零依赖法不配这个排场；且图标定名（public 直通）令 manifest 无需任何构建期注入，插件剩下的唯一价值（精确预缓存清单）不过是一次 readdir+摘要。`scripts/swPlugin.ts`：`writeBundle` 整目录收编 outDir（Vite8 Rolldown 的 index.html 不过 bundle，落盘才是构建真相；将来多一类产物自动入册，构造上无“游离资产离线变砖”），逐文件 sha256 汇成一枚 12 位壳版本（内容指纹：注释改动被 minify 吞掉=字节不变成不轮换，真改一个常量即换版+清单随哈希名走——两版实建取证 `634bc0916bb9→c7b19f4f7251`），渲染进定名 `sw.js`（注册 URL 恒定，与 emptyOutDir 发布形状同生共死）。fetch 模型：GET+同源+在册才应、导航 network-first 且 `fetch(req,{cache:'reload'})`（连浏览器 HTTP 缓存都不信）、断网落本版本自洽快照、册外放行零代理零缓存、跨源不碰。**IndexedDB 从不过这道门**（纪律 grep 入单测）。更新模型不 skipWaiting 不 clients.claim：新版本冷装、候着，下次冷开转正——纸册不催更。注册闸 `src/ui/registerSw.ts`：PROD 独占（dev 不抢）/无 SW 静默出局/load 后动手/失败吞声（离线首开注册不上是契约内的事）。
- 外部资源审计（T3）：**零发现**——index.html 无外链、CSS 无 url()/@import、字体全系统栈（`--bj-display` Georgia/Songti/Noto Serif CJK 本地解析）、无 favicon 网络请求（本地 PNG 顶上）；无需自托任何东西。防回魂双秤：单测扫 index.html+全表 CSS（glob 一网打尽新增文件）零绝对/协议相对 URL；e2e 运行时秤「页面全部网络请求同源」。
- D3 离线诚实（T4）：导出=blob 下载、导入=文件选择器+本地解析，全程零网络——e2e 飞行模式段实跑钉死（含离线重导自家档案的完整闭环）；首开无缓存=浏览器自出错误页，不装 offline 假页、不演戏，清单写明「只有一次：首开需要一次网络」。
- 砖法反证（T5，一次性取证脚本，未入库）：旧壳在岗时发布新版、旧哈希资产从源站消失——三态各跑：①在线 reload：network-first 取到新页、新哈希不在旧册→放行直连网络，开成新版（旧 SW 伺候也不砖）；②断网+旧 SW：落回旧版自洽快照（旧而完整，零半砖）；③关页冷开：waiting 晋升、旧缓存清光、断网开的是新版快照（采样时间线全程留档）。**在线开机永远不依赖 SW 缓存，离线开机永远吃自洽快照**——经典「stale index.html 指向已删资产」无路可走。真机更新节奏（诚实记档）：冷载 register() 做字节比对更新检查（导航顺带检查 Chromium 只承诺 24h 窗口），故新版本至多落后一次冷开：在线用户当场见新页（network-first），壳缓存随后一次冷开追平。
- 测试：单测 487→506（+19：壳快照纯函数 6〔双跑确定/乱序不动/单字节换版/新增入册/重名拒建/清单恒列 ./+index.html〕+ sw 渲染纪律 2〔占位符净+new Function 可编译；无 skipWaiting·claim 调用、无绝对 URL、origin 闸与 cache:'reload' 在场、IDB 不越界〕+ manifest 形状 4 + 外部资源零容忍 3 + registerSw 四闸 4）；e2e 110→120（+10：出身同源/manifest 真析/图标真 PNG/SW 认册/壳缓存自洽在册/断网冷开在线笔在眼/离线添笔落 IDB/离线导出成档/离线重导+再离线 reload 两笔俱在〔同秤开两次离线机〕）。**120/120 连跑两遍 0 console error**；既有 487/110 一字未动。
- LOC 闸（awk 纯行 ≤250）：swPlugin 111、registerSw 21、pwa.test 159、make-icons 51、main 35；preflight 248 本轮未触。零新依赖（Node API 用 3 行手写 `scripts/node-fs.d.ts` 顶上，仓规禁请 @types/node）；tsconfig 补 `allowImportingTsExtensions`（Vite8 configLoader 点名要求带扩展名的 config 链 import）。

**已知债(R15 候选)**
1. 实机清点回执（R12 交接单，现含第 11 笔离线开关机取证 + 第 1 笔 standalone 真身）：任何一行 ✗ 回仓即 R15 工作账。iOS 16.4 前「加主屏=书签」的系统现实无法代测——清单已按实说。
2. 卡片模式跨日线仍无形（R7 债6/R8 债5/R12 后半原样）；键术 ⌘Z/牵线撕线入口（等实测）；月历 ⌘N 让位口径（惹恼再拍板）；R13 债2 页级无承诺诚实余量（待 schemaVersion 升版补 shape）。
3. preflight 248 纯行顶格（R13 债4 原样）：下一轮再触先拆。
4. （小账，记而不立）壳版本是全有全无轮换：任一字節变→整壳重取（~340KB gzip 106KB）。对纸册这是诚实的简单；若未来资产膨涨再议逐文件 revision。

**决策记录(R14 增量)**
- 可安装性不是新功能是对账：R3 起清单喊「加主屏」、R12 白纸黑字——没有 manifest/SW 的主屏图标是打不开断网的手办书签。本轮零新面只补这一句真话。
- 手 roll 过插件的判据是重量与诚实：106MB 依赖树 vs 60 行可全读的 fetch 模型；定名图标让 manifest 注入价值归零；workbox 的 runtimeCaching 反而是「NEVER cache anything else」要绕开的东西。证据（npm 实测包数体积）记档，将来壳复杂化再重议。
- 版本住在字节里不住在时钟里：buildTime 版本每次构建都换缓存（空跑也催更）；内容指纹让「没改就是不轮换」成立——注释被 minify 吞掉即字节不变，真改才换版，两版实建取证。
- 不催更的代价明码标价并核销：无 skipWaiting=旧壳最多再伺候一次冷开；反证脚本钉死三态皆不砖——在线靠 network-first+册外放行（旧 SW 新发布也开成新版），离线靠自洽快照（旧版旧资产同穴而眠）。砖的根因「HTML 与资产不同源不同版本」被「同一版本同一缓存穴」的构造掐死，不靠运气不靠催。
- 离线首开不装死也不装活：浏览器错误页就是最诚实的页；文档一句「首开需要一次网络」胜过一切 offline 假面剧场。
- 图标即纸面：宣纸底/发丝框/宋体「伴」，令牌镜像自 base.css；安装体验是纸册的封面，不是软件 onboarding。

## Round 15 — 2026-09-06 · 不可解码图的洞（规格第 6 条收口：展不开≠收不下，D1 回落 + D2 折签 + D4 运转账）(已完成，待发布)

**完成（一轮两洞一账：敌手面的「解不开的图」从报错/碎图标双坑改判成安静成交，顺手把 14 轮手工发布仪式誊进仓）**
- 复核定罪（trust-but-verify 的诚实账）：任务书说「probe REJECT → 错误回执、文件没收」——真探针对症在案但机理差一格：`probeImageSize`/`probeVideoSize` 把解码失败**自吞成 null**（R9「退默认尺寸、渲染期自愈」的既拍政策），所以线上现实是「文件以 image 型入库、渲染器挂碎 `<img>` 无兜底」；reject 路径只在注入探针（ImageProber 契约允许）上成立。两格都是洞：D1 一律按「落空=抛∨null 同义『这台机器解不开』」双保险收口——真浏览器与可注入缝两条路同一个落点。红测三先发制：`expected 'image' to be 'file'`（null 路）、`expected ['这一份没能读进来 · 再试一次'] to deeply equal []`（reject 路=用户看错误、文件没入库的实锤）、`expected 'video' to be 'file'`（影纸表亲）。
- D1 attach 能力回落：`attachPipeline.attachOne` 结算段重铸——image/video 探失败（null 或抛）→ 落 `file` 卡安静收原件：hash/name/mime 全归资产记录（契约 mime 中立），props 只 {hash}、尺寸取文件渲染器默认身量（260×64），零 toast、零回执戏，card/added 照常过缝。**attachRoute 一字未动**：判据表永驻 mime 纯函数，「这台机器解不开」是运行时事实只配住管线落点（分离纪律写进代码注释）。成功路分毫未动（w/h 封顶、imageCardSize 血脉原样）；探针不过境（audio/pdf/未知型）与 addAsset 真失败（配额/读盘=响亮错误回执）三案各有回归钉——回落只救能力，不吞账。
- D2 渲染期折签（跨向毒兜底）：他机存成 image/video 的纸本机 `<img>`/`<video>` 解不开 → 自家 onError 上桌换纸语：「这台机器展不开这张纸」（`.bj-img-quiet` 血脉）+ 发丝「开新页试试」（blob 原件 `_blank+noopener`，**R14 交棒宽限原政策复用**——同一个 `PDF_OPEN_HOLD_MS`、同一个 `holdForHandoff`，点过即挂 10 分钟缓释、未点卸载即刻放一字不动）。题签一行照挂、卡照常全能（改名/删除/牵线住 CardFrame 不受渲染器换脸牵累）。不是错误态：无红、无警报形、原件在。CSS 两枚新类（`.bj-img-fold/.bj-img-handoff`，chip pill 与存一份/翻开同族）。data-nodrag 一笔 e2e 揪出（见测试节）：折签区不吃拖拽但不许吞选中。
- D3 e2e 判死（全新冷上下文，桌面形）5 枚：冒充 image/png 的垃圾字节真浏览器夹带 → 文件卡安静落库（碎图标零、错误回执零）→ 导出→wipe→重导 → 文件卡+资产名/mime 复原+IDB 字节**实算** sha256=原字节（规格 6「至少可保存和导出」端到端）；契约形状直写种一张「iPhone 存的 HEIC 图纸」→ 真解码失败 → quiet 折签+开新页发丝上屏、改名过缝落库、reload 折而不散题签新名在列、点开=popup/下载管道接走原件。R2/R9 可解码图纸各检原样全绿（零行为变更由既有电池把关）。
- D4 运转账：`apps/banji/README.md`（单页接手账：环境/开发/测试三道门+e2e 终端判死实相〔built 产物、仓根 4321、BJ_BASE、playwright-core 缓存浏览器现况、按 PID 收场禁 pattern-kill〕/发布/文档地图/红线，57 行内）+ `apps/banji/publish.sh`（手工 6 次仪式的代码化：三门不过即不发、非 main 拒发、暂存区混入非 i/banji 之物拒发、无货跳空提交、发后打印线上验尸 curl；脚本住 apps/banji 而 git 跑仓根，户口在注释里自证。本轮未跑——orchestrator 照旧手发 R15）。
- 测试：单测 506→520（+14 = D1 回落矩阵 7〔图 null/图抛/影双路/audio 过境/成功路分毫未动/pdf+未知不探/addAsset 配额仍响亮〕+ D2 折签 7〔换脸文案逐字/发丝三属性+名行/交棒宽限假计时 10 分钟恰放一次/未点即刻放 R9 纪律/影纸 onError/可解码不受害/原件真不在走旧文案〕）；e2e 120→125。**125/125 连跑两遍 0 console error**、既有 506/120 一字未动。e2e 夹具纪律再下一城：折签首版没挂 data-nodrag，卡拖拽的 pointerdown cancel 了原生 click——jsdom fireEvent 永远测不到这一格，真浏览器一把过秤；选中落点按 R11 纸边留白带纪律改 (7,6)。
- LOC 闸（awk 纯行 ≤250）：attachPipeline 97（总 111）、image 52、video 49、测试 136/130、publish.sh 42（总 64）、README 纯 37（57 行内）；attachRoute/asset/pdf/store/probe 一字未触、card.css +18（不设闸）。契约零变更（文件卡收解不开之图=规格 6 本意，不新增 kind）、零新依赖、路由表签名一字未动。

**已知债(R16 候选)**
1. 实机清点回执（R12 交接单，第 11 笔离线开关机之外）：安卓 Chrome 夹 iPhone HEIC 相片的真机回执=R15 双保险的正主验收——清单第 4 笔（夹带相册）按此追认 ✗/✓。
2. 卡片模式跨日线仍无形（R7 债6/R8 债5/R12 后半原样）；键术 ⌘Z/牵线撕线入口（等实测）；月历 ⌘N 让位口径（惹恼再拍板）；R13 债2 页级无承诺诚实余量（待 schemaVersion 升版补 shape）。
3. preflight 248 纯行顶格（R13 债4/R14 债3 三度原样）：下一轮再触先拆。
4. （小账，记而不立）壳版本全有全无轮换（R14 债4 原样）；D2 折签对 audio 未设——声音纸的 `<audio controls>` 解不开只显灰控件无文案，等实机清单喊疼再拍板（clip 面 audio 无探针、D1 无从回落，洞只开在「他机存成声卡本机无 codec」的跨向一格）。

**决策记录(R15 增量)**
- 回落住管线不住路由表：mime 判据是文件的身份，探测成败是**这台机器此刻**的能力——把「HEIC 在安卓解不开」写进 attachRoute 等于把运行时事实伪装成文件属性，表就脏了。attachRoute 保持纯函数的代价是 null 与抛两种失败都要在落点合流，这个合流买的是契约的干净。
- 「解不开」的纸面语言只说一句：「这台机器展不开这张纸」。不解释 HEIC、不骂浏览器、不给红——quiet 血脉（正在取出…/原件不在了）的同族只是把「没取到」改判成「取到了，这里摊不开」。开新页把 OS 处置权整个交出去，R14 的宽限复用=政策不再长新常数。
- 任务书的机理账要复核再记账：真探针自吞成 null，「错误回执」只在注入缝成立——两格都修才是修洞，只修 reject 那格等于按简报写了个线上永不开火的保险丝。红测阶段把两种失败各钉一枚，账目对得上现实。
- D4 是运营债不是功能账：README 单入口把六轮口口相传的起服/杀进程/缓存浏览器现况写成纸，publish.sh 把护栏（暂存区/分支）固化成代码——未来会话跑现成的，不再靠 orchestrator 记忆。脚本自己本轮未跑：手发最后一回，R16 起以它为准（自证清白的方式=R15 报告逐行读）。
