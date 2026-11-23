# dsh-session-delete（会话清理与撤销）

一个 DeepSeek Harness **bundle 插件**，提供两类功能：

- **删除会话**：在侧栏右键菜单删除单个会话，或在工作区右键批量清理；连同会话产物一起清除，并可选做「参考计数式」附件回收。
- **对话回退**：在每条用户消息操作行上加 ↶ 图标（「回退到此处」），点击选模式（仅对话 / 对话+文件，后者先列文件清单），在当前会话原地撤回该消息及之后的对话、冲突感知地还原文件、把提示词放回输入框；也可敲 `/rewind` 用候选选择器（带键盘导航）。思路同 opencode `/undo`、Claude Code `/rewind` 与 Antigravity rewind。

插件装在 profile 里，位于 Harness 仓库**之外**：拉取官方更新不会影响它。

```
右键会话       → 删除会话
右键工作区     → 批量清理会话
用户消息操作行 → ↶ 回退到此处（选模式：仅对话 / 对话+文件）
输入框 /rewind → 候选选择器（↑↓/Enter/Esc）
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

## 对话回退（opencode / Claude Code 式）

每条**用户消息**操作行上有 ↶ 图标（「回退到此处」）。点击弹出模式选择：

- **仅回退对话**：撤回这条消息及之后的对话，文件不动。
- **回退对话和文件**：先列出该轮改过的文件清单（还原 / 删除，之后被改过的标「跳过」），确认后才连同对话一起还原。

也可在输入框敲 **`/rewind`**：弹出候选选择器，列出可回退的用户消息（最新在前、可搜索），自带 **↑/↓ / Enter / Esc** 键盘导航；选中后打开同样的模式选择。参数式 `/rewind @<seq> chat|both` 直接执行。

实现原理（两半）：

1. **模型上下文**：Host append 一条表面替换标记，把目标消息及其之后遮掉，**仍在当前会话**。append-only 持久日志不改写；不分叉、不新建窗口。
2. **渲染转录**：客户端包裹 chat 视图构建器，把被撤回的行隐藏（DSH 的表面替换本身只切模型上下文）。隐藏区间从持久的回退命令节点推导，**刷新页面后仍生效**。
3. **回填提示词**：把被撤消息的文本放回输入框（facade `setDraft`，DOM 兜底），可编辑重发。

**你的最新代码是安全的**：文件还原是冲突感知的——只考虑该轮改过的文件，且该轮**之后**被改过的文件跳过（保持不动）；该轮没碰过的文件绝不修改。回退旧轮次不会覆盖你后来的工作。

快照采用**影子 git 仓库**（opencode 的做法），建在插件数据目录下，因此 **git 与非 git 工作区都能还原文件**，且绝不碰你自己的仓库。尊重 `.gitignore` 与 `snapshotExcludes`（node_modules 等重目录）。运行中的轮次会先停止再回退；子代理会话不支持回退。限制：快照从安装/重启后开始记录、按 `retentionDays` 清理；已被压缩（compaction）遮掉的消息无法回退到它（已不在模型上下文）；嵌套 git 目录按 gitlink 记录（不逐文件）。

转录隐藏与用户行挂载用的是 DSH 私有接缝：均做形状校验并在卸载时还原，DSH 升级时优雅降级（模型回退+文件还原+提示词回填仍工作），不会弄坏插件或连累删除功能。

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

- Host：监听 `turn/start`/`turn/end` 打快照（私有 git 对象库，不动仓库 index/refs）；注册 `/rewind` 命令（append 表面替换标记切模型上下文 + 冲突感知还原文件）；owner-only 路由 `POST /session-delete/inspect|delete|batch-inspect|batch-delete` 与 `POST /session-undo/preview|candidates|snapshots|purge|clear-queue`。
- Web：注册会话/工作区右键菜单与 `shell.overlay` 确认弹窗；接管用户/steering 行组件挂 ↶；包裹 chat 视图构建器按命令节点推导的区间隐藏被撤行。点 ↶ 或 `/rewind` 选目标与模式后执行 `/rewind @<seq> chat|both`，读命令实际 outcome 判成败，再经输入面 `setDraft`（DOM 兜底）回填提示词。全程同一会话，不分叉。

## 已知限制

- 共享附件默认不删（官方无引用计数回收）；深度清理仅删无人引用者。
- 撤销用影子 git 仓库，git/非 git 工作区均可；快照自安装/重启起记录，按 retentionDays 自动清理元数据**并 git gc 回收对应对象**，删除会话时一并清除其快照与对象。嵌套 git 目录（gitlink）无法逐文件还原，列为冲突跳过。
- 回退用表面替换切模型上下文 + 客户端隐藏转录（同一会话；持久日志保留被撤轮次）；只还原该轮自己的改动，之后被改过的文件跳过。已被压缩遮掉的消息无法回退到它。steering 插话目标仅支持回退对话。
- 早期 prepare 路径写入的旧 `[rewound]` 标记无命令节点，升级后其被撤行可能重新显示（模型上下文仍已切）；新回退均走命令节点，刷新后仍隐藏。
- ↶ 通过接管用户/steering 行组件挂载（私有接缝，形状校验+卸载还原）；转录隐藏包裹 chat 视图构建器（亦私有）。DSH 升级改变其形状时优雅降级。

## 开发

```sh
node tests/host.test.mjs   # 删除/批量 + 路由/命令注册（13 项）
node tests/undo.test.mjs   # 回退规划、真实 git/非 git 冲突感知还原（15 项）
node tests/client.test.mjs # chat 可见性区间推导 + 隐藏（4 项）
```

## 致谢

会话删除 / 批量清理 / 引用计数附件 GC，以及 git 影子快照冲突感知文件还原，为本插件原创。

原地对话回退机制改编自 [`SiriLee/dsh-rewind`](https://github.com/SiriLee/dsh-rewind)（MIT）：chat 快照可见性包装、用户/steering 行操作挂载、`/rewind` popupSelect 命令装饰、表面替换标记思路，均遵循其设计与代码。依 MIT 许可使用并署名。

## 许可

MIT