# 调研设计说明：AionUi fork 改造全景分析 (Claude Code)

## Problem Statement

梳理 feature/agent-team 分支相对 AionUi 上游主干的全部改动，从文档、git 提交和代码三个维度交叉验证。

## Chosen Approach

阅读全部 docs/ 文档（14 篇 markdown），git log 全部 13 个提交，结合关键源码目录的代码探索，按改动层次结构化归纳。

## Alternatives Considered

- 仅读 git diff：缺少产品意图理解
- 仅读文档：不能确认实际实现状态
- 采用三方交叉验证（文档 + 提交 + 代码）

## 核心改造分析

### 一、Agent Team 多智能体协作（主线）

这是分支的核心特性，引入了完整的多 AI 智能体协作能力。

#### 1.1 后端架构

**AgentTeamService** (`src/process/services/agentTeam/AgentTeamService.ts`)
- 团队 CRUD、workspace bootstrap、消息投递
- 创建时在 DB 事务中同时建立 parent + N child conversations
- 部署 coord 目录（scripts、protocol.md、TEAM.md、SKILL.md）
- 注入 presetContext/presetRules 到子 agent

**CoordDispatcher** (`src/process/services/agentTeam/CoordDispatcher.ts`)
- fs.watch + 100ms debounce + byte-offset 增量读取
- 基于 dispatch + to 字段的目标解析，跳过 sender
- 每 agent 串行处理（busy gate），新消息排队
- 共识强制执行（ACK 必须携带 reply_to 匹配 decision ID）

**CoordFileWatcher** (`src/process/services/agentTeam/CoordFileWatcher.ts`)
- 文件系统层面的协调消息监听

#### 1.2 数据模型扩展

- `TChatConversation` union 新增 `agent-team` 类型
- `IConversationRow.type` CHECK 约束 + migration
- `extra.members[]`、`extra.coordDir`、`extra.consensus` 等字段
- `child.extra.teamId` → parent ID 的关联关系

#### 1.3 IPC Bridge

`agentTeam` namespace 新增：
- `agentTeam.create` → 创建团队
- `agentTeam.sendMessage` → 发送消息
- `agentTeam.getTimeline` → 获取时间线
- `agentTeam.getMembers` → 获取成员
- `agentTeam.timelineStream` → 实时事件流

#### 1.4 前端 UI

**TeamBuilder** (`src/renderer/pages/guid/components/TeamBuilder.tsx`)
- 卡片式团队创建表单：团队名、workspace、成员选择、初始 brief
- GuidPage 中 AgentPillBar 末尾增加 "Agent Team" pill

**AgentTeamChat** (`src/renderer/pages/conversation/platforms/agent-team/AgentTeamChat.tsx`)
- 双 Tab（Timeline / Agents），使用自定义 tab bar 而非 Arco Tabs（避免 flex 高度链断裂）
- Timeline 渲染：agent logo、type badge、dispatch label、MarkdownView、FilePreview
- SendBox 集成文件上传（FileAttachButton + HorizontalFileList）

**侧边栏集成** (`GroupedHistory`)
- workspace 分组展示，team children 嵌套在 parent 下
- hide/unhide workspace 机制

#### 1.5 内嵌协调协议

每个团队在 workspace 下生成完整的协调基础设施：
```
<workspace>/.agents/teams/<teamId>/coord/
├── messages.jsonl      # append-only 时间线
├── protocol.md         # 完整协议规则
├── TEAM.md             # 团队花名册
├── SKILL.md            # agent 指令
├── scripts/            # coord_read.py, coord_write.py
├── attachments/        # 大内容存储
├── locks/              # 互斥锁
└── state/              # per-agent cursor
```

消息类型：claim, intent, update, question, challenge, finding, design, decision, conclusion, ack, done
调度策略：all（广播）、targets（定向唤醒）、none（仅追加不唤醒）

### 二、Codex ACP 跨进程 Resume（配套改进）

**问题根因**：npm 发布的 `@zed-industries/codex-acp@0.7.4` 仅支持进程内 session/load，不支持跨进程磁盘恢复。

**解决方案** (`src/agent/acp/acpConnectors.ts`)：
- 新增 `AIONUI_CODEX_ACP_BINARY` 环境变量支持
- `findLocalCodexAcpBinary()` 自动发现本地 v0.10.0 二进制
- 搜索路径：`~/.aionui-dev/bin/codex-acp-0.10.0`、`~/.aionui/bin/codex-acp`
- 回退兼容：无本地二进制时仍使用 npm 包

**Session ID 持久化** (commit 501a561)：
- 持久化 Codex 原生 session ID，跨 rebuild 恢复

### 三、主进程解耦架构（设计文档已落地，代码部分实现）

在 `docs/superpowers/specs/` 中有两份详细设计文档：

**Phase 1**（PR #1402，已合并到主分支）：
- `IAgentManager`、`IWorkerTaskManager`、`IAgentFactory`
- `IAgentEventEmitter`、`IConversationRepository`、`IConversationService`
- `SqliteConversationRepository`、`ConversationServiceImpl`
- `WorkerTaskManager`、`AgentFactory`、`IpcAgentEventEmitter`
- conversationBridge 重构为 thin IPC router

**Phase 2**（设计完成，6 PR 计划）：
- WorkerTaskManager 注入 IConversationRepository
- Bridge 层全部注入 IWorkerTaskManager
- CronService 完全解耦（4 接口注入）
- Channel repository 层
- databaseBridge + extensionsBridge 解耦
- 旧 conversationService 清理

### 四、开发工具链

**PM2 配置** (`ecosystem.pm2.config.cjs`)：
- WebUI 模式运行，端口 25809
- PATH 指向 Node.js v22
- AIONUI_CODEX_ACP_BINARY 指向本地 v0.10.0

**WebUI Favicon 对齐** (docs/plans/2026-03-12)：
- 统一 favicon 资源为 resources/icon.png
- 删除重复的 src/renderer/favicon.png
- 移除不稳定的 /favicon.ico 服务端逻辑

### 五、文档体系

- `docs/tech/agent-team/` — 3 篇架构文档（overview、coordination-protocol、frontend-ui）
- `docs/development-notes.md` — 开发过程中的经验教训集合
- `docs/local-dev-playbook.md` — 本地开发工作流
- `docs/superpowers/specs/` — 主进程解耦设计（Phase 1 + Phase 2）

## Affected Files And Interfaces

与 Codex 的分析一致，补充以下要点：
- 主进程解耦接口文件（6 个 I*.ts 在 src/process/task/ 和 src/process/database/）
- 主进程解耦实现文件（SqliteConversationRepository、ConversationServiceImpl 等）
- WebUI 静态路由变更 (`src/webserver/routes/staticRoutes.ts`)

## Risks And Follow-up Checks

1. 工作树有未提交改动（docs/development.md、ecosystem.pm2.config.cjs、src/index.ts），分析应以已提交历史为准
2. Phase 2 解耦设计已完成但代码未全部落地，后续需评估是否在本分支继续
3. bundled-bun 资源目录（resources/bundled-bun/）为未跟踪状态，用途待确认
4. .agents/ 目录为运行时产物，不应计入代码改动

## Verification Performed

- 阅读全部 14 篇 docs/ markdown 文档
- git log --all --oneline --graph（13 commits）
- 代码探索：agentTeam 服务层、前端组件、ACP connectors、IPC bridge、task interfaces
- 与 Codex 调研结论交叉验证
