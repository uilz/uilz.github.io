# worklog-cli

Worklog 工具接入契约 **v0.1**（data-only / 只读）。零依赖 Node ≥ 18。

- `tool_version`：`0.1.0`
- `contract_version`：`0.1`
- 接口形态：CLI（需求书 §1.2 A）
- 数据来源：Worklog 完整备份（ZIP）或解包后的快照目录
- 不联网、不写回浏览器存储、不依赖任何第三方包

> `transcribe` / `summarize` 由平台侧实现；本 CLI 对这两个命令返回 `UNSUPPORTED`。

---

## 1. 运行

```bash
node worklog.mjs --version
node worklog.mjs health --json
node worklog.mjs list   --json --from <snapshot.zip|snapshot-dir>
node worklog.mjs export --workblock <id> --out <dir> --json
```

要求 Node ≥ 18（开发/验证使用 v22）。`--json` 可省略（输出始终为 JSON）。

### 1.1 默认快照解析（`--from` 省略时）

按顺序：

1. 环境变量 `WORKLOG_SNAPSHOT`
2. `<cwd>/snapshots/worklog-backup-*.zip` 中 **mtime 最新** 的一个
3. `<cwd>/worklog-backup-*.zip` 中 **mtime 最新** 的一个
4. 都没有 → `SNAPSHOT_NOT_FOUND`（`retryable: true`）

### 1.2 快照来源

- **推荐**：在 Worklog 应用里点「导出完整备份」，得到 `worklog-backup-YYYY-MM-DD.zip`（含 `manifest.json` + `attachments/`）。
- 也支持解包后的目录（`manifest.json` 与 `attachments/` 同级）。
- 分卷备份（`backupMode: split-*`）不支持，会返回 `INVALID_INPUT`。

---

## 2. 命令

### 2.1 `--version`

```json
{
  "ok": true,
  "tool_version": "0.1.0",
  "contract_version": "0.1",
  "result": {
    "tool": "worklog",
    "capabilities": ["list", "export", "health", "version"],
    "unsupported": ["transcribe", "summarize"]
  }
}
```

### 2.2 `health --json`

```json
{
  "ok": true,
  "tool_version": "0.1.0",
  "contract_version": "0.1",
  "result": {
    "snapshot_readable": true,
    "snapshot_path": "/…/worklog-backup-2026-10-20.zip",
    "snapshot_kind": "zip",
    "snapshot_exported_at": "2026-10-20T00:00:00.000Z",
    "snapshot_schema": 6,
    "blocks": 2,
    "attachments": 2,
    "attachment_bytes": 265,
    "asr": { "available": false, "reason": "platform-side" },
    "model": { "available": false, "reason": "platform-side" },
    "checked_at": "2026-10-20T03:04:05.678Z"
  }
}
```

无快照时：

```json
{
  "ok": false,
  "code": "SNAPSHOT_NOT_FOUND",
  "message": "no snapshot provided and none found (searched $WORKLOG_SNAPSHOT, ./snapshots, .)",
  "retryable": true,
  "tool_version": "0.1.0",
  "contract_version": "0.1",
  "result": {
    "snapshot_readable": false,
    "asr": { "available": false, "reason": "platform-side" },
    "model": { "available": false, "reason": "platform-side" },
    "checked_at": "…"
  }
}
```

### 2.3 `list --json`

```json
{
  "ok": true,
  "tool_version": "0.1.0",
  "contract_version": "0.1",
  "result": {
    "snapshot_path": "/…/worklog-backup-2026-10-20.zip",
    "count": 2,
    "workblocks": [
      {
        "workblock_id": "ws_demo::2026-10-19_09:00",
        "title": "整理季度报告",
        "date": "2026-10-19",
        "start": "09:00",
        "end": "10:00",
        "tags": ["报告", "会议"],
        "status": "已完成",
        "priority": "高",
        "location": "",
        "workspace": "示例工作区",
        "attachment_count": 1,
        "updated_at": "2026-10-19T02:00:00.000Z"
      }
    ]
  }
}
```

- 排序：`date` → `start` → `workblock_id`。
- `workblock_id` 即快照内的块主键 `"{workspaceId}::{YYYY-MM-DD}_{HH:MM}"`，稳定、可直接传给 `export --workblock`。
- **时间口径**：`date` / `start` / `end` 是工作日志的**本地墙钟**（按原样保留，日历语义，不做时区换算）；所有机器时间戳（`updated_at`、`snapshot_exported_at`、`checked_at`）统一为 **ISO-8601 UTC**（`…Z`）。

### 2.4 `export --workblock <id> --out <dir> --json`

产出（全部位于 `--out` 内）：

```text
<dir>/
├── wb_2026-10-19_0900_a4db50.json     # 结构化工作块（确定性，无 wall-clock）
├── wb_2026-10-19_0900_a4db50.md       # 正文（Markdown）
└── attachments/
    └── 会议纪要.txt                   # 附件（原名清洗后；同名自动 -2/-3）
```

```json
{
  "ok": true,
  "tool_version": "0.1.0",
  "contract_version": "0.1",
  "result": {
    "workblock_id": "ws_demo::2026-10-19_09:00",
    "json_path": "/abs/out/wb_2026-10-19_0900_a4db50.json",
    "json_rel": "wb_2026-10-19_0900_a4db50.json",
    "md_path": "/abs/out/wb_2026-10-19_0900_a4db50.md",
    "md_rel": "wb_2026-10-19_0900_a4db50.md",
    "body_sha256": "847e…3468",
    "sha256": "847e…3468",
    "attachments": [
      {
        "name": "会议纪要.txt",
        "original_name": "会议纪要.txt",
        "path": "attachments/会议纪要.txt",
        "abs_path": "/abs/out/attachments/会议纪要.txt",
        "size": 135,
        "sha256": "eb08…e23e"
      }
    ],
    "bundle_sha256": "f6e0…61ba",
    "bundle_manifest": "PAPBUNDLE1\nbody 847e…3468\nfile 会议纪要.txt eb08…e23e 135\n"
  }
}
```

- `json_rel` / `md_rel` / `attachments[].path` 均为**相对 `--out`** 的路径；同时提供绝对路径 `json_path` / `md_path` / `abs_path`。
- `sha256` 与 `body_sha256` 相同（兼容单值字段）；平台登记请用 `bundle_sha256`。
- **幂等**：同一快照 + 同一 workblock → `body_sha256` / 附件 `sha256` / `bundle_sha256` 完全一致；重复导出覆盖同名文件。
- `json` 内容不含导出时刻（使用快照的 `exportedAt`），保证可复现。

---

## 3. 哈希口径（冻结）

```text
body_sha256 = sha256(md_bytes)

manifest = "PAPBUNDLE1\n"
         + "body " + body_sha256 + "\n"
         + 对每个附件按 name 的 UTF-8 字节序排序：
             "file " + name + " " + sha256_hex + " " + size + "\n"

bundle_sha256 = sha256(manifest.encode("utf-8"))
```

- `name` 为**导出后的附件文件名**（清洗、去重后，不含目录）；`path` 为其相对路径 `attachments/<name>`。
- 排序使用 **UTF-8 字节序**（非 `localeCompare`）。
- 平台登记 artifact 用 `bundle_sha256`；单文件校验用分项 `sha256`。
- 导出的 `bundle_manifest` 字段便于平台直接核对。

已用 Node 与 Python 两套实现独立复算，结果一致。

---

## 4. 错误码与退出码

| code | 含义 | retryable | 典型场景 |
|---|---|---|---|
| `INVALID_INPUT` | 参数/结构非法 | false | 缺 `--workblock`/`--out`、快照结构异常、超限、ZIP 路径穿越 |
| `SNAPSHOT_NOT_FOUND` | 快照不存在/不可读 | true | `--from` 指向不存在路径、默认解析无结果 |
| `WORKBLOCK_NOT_FOUND` | 指定工作块不存在 | false | `--workblock` 传错 |
| `STORAGE_ERROR` | 写盘/磁盘错误 | true | `--out` 不可写、未预期异常 |
| `UNSUPPORTED` | 本期不实现 | false | `transcribe` / `summarize` |

失败输出：

```json
{ "ok": false, "code": "INVALID_INPUT", "message": "…", "retryable": false, "tool_version": "0.1.0", "contract_version": "0.1" }
```

退出码：`0` = `ok:true`；`1` = `ok:false`；`2` = 未预期异常（归一为 `STORAGE_ERROR`）。

---

## 5. 安全边界

- **路径穿越**：ZIP 条目名与 manifest 内的附件路径，拒绝绝对路径（`/…`、`C:…`）、反斜杠、`.`/`..` 段；附件路径必须以 `attachments/` 开头。
- **写盘范围**：所有写入前校验落在 `--out` 解析后的目录内；越界直接 `INVALID_INPUT`。
- **资源上限**：附件 ≤ 100 个；单附件 ≤ 10 MB；附件总量 ≤ 200 MB；`manifest.json` ≤ 10 MB；ZIP 文件 ≤ 256 MB。
- **ZIP bomb**：解压使用 `maxOutputLength` 硬限，并校验解压后大小与中央目录声明一致。
- **只读/离线**：不发起任何网络请求；不写浏览器存储；不读取/打印任何凭据。

> 说明：CLI 参数 `--from` / `--out` 按平台约定接受**绝对路径**（平台给受控目录）；"拒绝绝对路径与 `..`" 施加在 **归档条目名** 与 **manifest 内的附件相对路径** 上。

---

## 6. 样例与测试

```bash
# 生成样例快照（确定性，schema 6）
node make-sample.mjs
# → sample/worklog-sample.zip（2 个工作块 / 2 个附件）

# 契约测试（零依赖，19 项）
node contract-test.mjs
```

样例：

```bash
node worklog.mjs list --json --from sample/worklog-sample.zip
node worklog.mjs export --workblock 'ws_demo::2026-10-19_09:00' --out ./out --json --from sample/worklog-sample.zip
```

契约测试覆盖：版本、list（ZIP/目录）、export（相对路径 + 三处哈希独立复算）、幂等、默认快照解析、health（有/无快照）、`UNSUPPORTED`、`..`/绝对路径穿越、超 100 附件、单附件 >10 MB、总量 >200 MB、ZIP bomb、未知 workblock、help。

---

## 7. 目录结构

```text
tools/worklog-cli/
├── worklog.mjs          # CLI 入口
├── lib/
│   ├── errors.mjs       # 错误码
│   ├── zip.mjs          # ZIP 读写（STORE/DEFLATE，ZIP64 读取）
│   ├── snapshot.mjs     # 快照打开/校验/限流
│   └── hash.mjs         # 冻结的 bundle 哈希
├── make-sample.mjs      # 生成样例快照
├── contract-test.mjs    # 契约测试（19 项）
├── sample/
│   └── worklog-sample.zip
└── README.md
```

---

## 8. 平台集成提示

- 平台侧写 MCP 薄包装即可，Worklog 不实现 MCP。
- 建议以 `bundle_sha256` 登记 artifact；收到后复算，不一致直接拒绝登记。
- `transcribe` / `summarize` 由平台承担；如需把结果回写为 Worklog 记录，需走应用内导入（CLI 不写 IndexedDB）。
- 快照为时点数据：需要更新时重新从应用导出（后续可评估「导出到指定目录」的 FSA 增强，非 MVP）。

---

## 9. 许可与来源

- **许可证**：MIT — 见 [`LICENSE`](./LICENSE)（仅覆盖 `tools/worklog-cli/`）
- **来源**：https://github.com/uilz/uilz.github.io → `tools/worklog-cli/`
- **锁定标签**：`worklog-cli-v0.1.0`
- 详见 [`SOURCE.md`](./SOURCE.md)（vendored 方式与校验）
