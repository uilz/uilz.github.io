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
