# dsh-session-delete（会话清理与撤销）

一个 DeepSeek Harness **bundle 插件**，提供两类功能：

- **删除会话**：在侧栏右键菜单删除单个会话，或在工作区右键批量清理；连同会话产物一起清除，并可选做「参考计数式」附件回收。
- **撤销一轮对话**：在每条助手消息的操作条上加一个 ↶ 图标，点击后还原该轮改过的文件（之后被改过的跳过）、在当前会话原地回退对话、把提示词放回输入框（思路同 opencode `/undo` 与 Antigravity rewind）。

插件装在 profile 里，位于 Harness 仓库**之外**：拉取官方更新不会影响它。

```
右键会话       → 删除会话
右键工作区     → 批量清理会话
助手消息操作条 → ↶ 回退此轮
```

「删除会话」位于内置「归档会话」正下方，红色危险样式。

## 删除会清除什么

删除是永久的，没有回收站。仅针对目标会话：

| 产物 | 位置 |
|---|---|
| 会话日志（全部历史世代与压缩副本） | `$DSH_HOME/projects/<项目>/sessions/<id>/` |
| 投影缓存文档 | 存储域 `session_projcache`，表 `sessions` |
| 工具大输出 spill 文件 | `<tmp>/dsh-spill-*/session-<hash>/` |
| 工作树 worktree | 走官方回收：仅在干净且无其他引用时删除，**分支保留** |
| 工作区归属、置顶、归档记录 | `workspaceRegistry` |
| 指向该会话的定时任务 | 删除前先停止 |

## 删除会保留什么

| 保留 | 原因 |
|---|---|
| 共享附件与上传文件（`attachments/v1/objects|files`） | 内容寻址、跨会话共享；官方暂无引用计数回收，按会话删会破坏其他会话 |
| 工作区目录、代码、用户文件 | 与会话记录无关 |
| 其他会话 | 只动目标目录 |

## 删除的守卫

- 本次运行打开过的会话**也能删**：先停止其工作、归档挡住新轮次、等在途轮次落盘后再删目录，避免「复活」。
- 仍有运行中工作 → 先询问「停止并删除」。
- 旧格式日志（需迁移）→ 拒绝，提示先打开一次完成迁移。
- 仅支持官方默认 JSONL 持久化后端。
- 单删**不设天数门槛**（手动点名删除是明确意图）；天数门槛用于批量清理。

## 批量清理

工作区右键「批量清理会话」打开选择器：

- 复选框多选；**全选 / 清空 / 选择 N 天以上**。
- 每行显示标题、占用、最后活动、运行中标记。
- **深度清理附件**（默认关）：删除所选会话后，回收「这些会话引用、且剩余会话都不再引用」的附件对象；其他会话或工作区仍在用的一律保留。
- 点「删除所选」→ **二次确认**（数量、附件选项、所选清单）→ 执行，报告删除数与释放空间。

## 撤销一轮对话

每条助手消息操作条上的 ↶ 图标，确认后：

1. **只还原该轮改过的文件**。每轮记录开始+结束两个快照，撤销时对比得出该轮自己的改动，再逐个还原——且仅当文件当前内容仍等于该轮结束时的内容才还原。
2. **原地回退对话**（opencode 式）：用一次表面替换把该轮及其之后从模型可见视图里遮掉，**仍在当前会话**。append-only 持久日志不动；不新建会话/窗口。一个 `[rewound]` 标记标示回退点。
3. **回填提示词**：把被撤那轮的提示词放回当前会话输入框。

**你的最新代码是安全的**：在该轮**之后**被改过的文件会跳过并报告冲突（保持不动）；该轮没碰过的文件绝不修改。所以撤销一个旧轮次也不会覆盖你后来的工作。完成弹窗会报告还原了几个文件、跳过了几个冲突。

快照采用**影子 git 仓库**（opencode 的做法），建在插件数据目录下，因此 **git 与非 git 工作区都能撤销**，且绝不碰你自己的仓库。会尊重工作区的 `.gitignore`，外加 `snapshotExcludes`（node_modules 等重目录）。运行中的轮次拒绝（`session-busy`）；需二次确认。限制：快照从安装/重启后开始记录、按 `retentionDays` 清理；子代理会话不打快照；本身是 git 仓库的嵌套目录按 gitlink 记录（不逐文件）。

## 配置

bundle 补丁挂载一行。在 profile 的 `cordis.patch.yml` 覆盖其 `config`：

```yaml
- id: session-delete
  config:
    requireTitleConfirmation: false  # true 时在弹窗之上再加「输入标题」确认
    deleteSpillArtifacts: true
    worktreeTimeoutMs: 20000         # 等待官方 worktree 回收的时长
    stopSettleMs: 8000               # 删除前等待被停轮次收尾的时长
    spillRoots: []                   # 额外 spill 根（除自动发现的 dsh-spill-*）
    snapshotEnabled: true            # 为撤销记录每轮 git 快照
    retentionDays: 7                 # N 天后清理撤销快照元数据
    timeoutMs: 30000                 # 撤销快照的单条 git 命令超时
    outputMaxBytes: 8388608          # 撤销快照的 git 输出上限
    dataRoot: ''                     # 撤销数据根；空 = ~/.dsh/session-undo
    snapshotExcludes:                # 撤销快照排除的重目录
      - node_modules/
      - .git/
      - __pycache__/
      - .venv/
      - venv/
      - .next/
      - .cache/
      - .turbo/
```

## 安装

```sh
dsh plugin install <本目录的绝对路径>
```

或通过插件管理器（`install_bundle`，target 为本目录）。**安装/更新后重启一次 DeepSeek Harness**，让 Host 加载记录器与路由；之后刷新页面，撤销图标即出现在助手消息上。

## 两半如何通信

- Host：监听 `turn/start` 打快照（私有 git 对象库，仓库对象库作只读 alternate，不动仓库 index/refs）；owner-only 路由 `POST /session-delete/inspect|delete|batch-inspect|batch-delete` 与 `POST /session-undo/prepare|snapshots|purge`。
- Web：注册会话/工作区右键菜单、`shell.overlay` 确认弹窗，以及 `conversation.chat.assistant-actions` 槽的撤销图标。撤销确认后调 `prepare`，再用官方客户端 `sessions.fork({ atSeq })` 分叉、打开子会话、经 conversation 输入面回填提示词。

## 已知限制

- 共享附件默认不删（官方无引用计数回收）；深度清理仅删无人引用者。
- 撤销用影子 git 仓库，git/非 git 工作区均可；快照自安装/重启起记录；嵌套 git 目录按 gitlink 记录。
- 回退用表面替换原地遮掉该轮（同一会话；持久日志保留被撤轮次）；只还原该轮自己的改动，之后被改过的文件跳过。需会话处于打开（活）状态才能撤销。
- 撤销图标在**助手消息**操作条（复制旁）；用户消息图标行无插件槽。

## 开发

```sh
node tests/host.test.mjs   # 删除/批量（13 项）
node tests/undo.test.mjs   # 撤销，含真实 git 与非 git 还原安全测试（7 项）
```

## 许可

MIT