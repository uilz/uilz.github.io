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

**已知债(R7 候选)**
1. 实机证据长队（自 R3 顺延）：iPad/iPhone 软键盘 visualViewport、自动滚屏缓入手感（48/12 系几何正确、体感待拍）、**拖拽滚屏时 hitTest 落点仍按落指时采样的画布原点算——滚屏位移会让入叠判定漂移，是否每帧重取 rect，实机定夺**；叠中叠手势几何已对但零 UI 提示（R5 尾）。
2. undo 圈内导出字节回归（R4 债，三度顺延）：restore 只 bump 文档 updatedAt，但要入档——撕下再想想一圈后该日 journals.json 字节必变；保不保「undo 圈字节不变量」待产品拍板。
3. 同字节改名第二张卡显示首入库文件名（R2 债，四度顺延）。
4. 「这一笔没存上」保存侧仍无离线/配额根因探测（R3 债5 顺延）。
5. 搜索/关系/线/图模式 = Phase 3+；设置键仍两枚（theme、hint_wide_canvas）。
6. D1 的 e2e 竞态夹具是「定档+计时器重置」的尽力而为（import 若慢过 450ms 旧意图会良性开火在旧世界、被整斧抹掉——检测不到≠没修，回归防护的确定性主证在 jsdom 四面）；档案显著变大后再议加探针，暂不立项。

**决策记录(R6 增量)**
- 导入 ack = 世界尽头的整斧：pending/failed/瞬态与托盘同批弃世——用户选「档案即宇宙」那一刻，旧世界未记账的编辑即被放弃的编辑；这是 R4 托盘作废同一被接受取舍的补齐，不是新增风险。反向不变量同钉：**作废只弃旧、不毒新**（世界代数出队盖章，新意图拿新代数照常排链）。
- 拆分只搬机器、不搬纪律：undo 的 restore 排链、attach 的落笔前 settle、prune 的意图箱所有权都留在核心——「无第二链」是拆分红线，注入接口（chain/dispatch/getState/nextNoteId）是两台机与核心的全部接触面。
- 自动滚屏的『该不该动』归纯几何（可测）、「动起来像什么」归实机；reduced-motion 时循环压根不建，无新 UI 元素，存储侧不留痕。
- e2e 夹具三纪律被真跑揪出、立为样板：滚动会骗过 rect（同屏才按坐标拖）、乐观 DOM≠过缝证据（等真 IDB dump 再定档）、探测别用 rAF 频率轰炸 IDB 连接队列（有界单次开库轮询）。
