# 来源与许可（worklog-cli）

| 项 | 值 |
|---|---|
| 工具 | `worklog-cli` |
| 版本 | `tool_version 0.1.0` / `contract_version 0.1` |
| 仓库 | https://github.com/uilz/uilz.github.io |
| 目录 | `tools/worklog-cli/` |
| 锁定标签（推荐） | `worklog-cli-v0.1.0` |
| 许可证 | **MIT**（见同目录 `LICENSE`，仅覆盖 `tools/worklog-cli/`） |
| 第三方依赖 | **无**（仅 Node 内置模块：fs / path / zlib / crypto / child_process） |

## vendored 说明

- 可整目录复制到平台仓库的 `tools/worklog-cli/`，**不需要修改代码**。
- 推荐按标签取版本，避免后续提交漂移：

```bash
# 方式 A：从标签导出（只取该目录）
git archive --remote=git@github.com:uilz/uilz.github.io.git worklog-cli-v0.1.0 tools/worklog-cli | tar -x
# 或先 clone，再本地导出
git clone https://github.com/uilz/uilz.github.io.git
cd uilz.github.io && git archive worklog-cli-v0.1.0 tools/worklog-cli | tar -x -C /path/to/platform
```

- 校验（vendored 后）：

```bash
cd tools/worklog-cli
node contract-test.mjs   # 期望：TOTAL 19  PASS 19  FAIL 0
```

- 请求：vendored 后**不要修改代码**；如需新增命令或调整行为，请以补丁/PR 回报，保持 `contract_version 0.1` 的既有行为不变。

## 版本记录

- 本目录代码与 `sample/worklog-sample.zip` 一并纳入版本控制。
- 冻结的 bundle 哈希算法见 `README.md` §3；样例 golden vectors 见交付文档 §6。
