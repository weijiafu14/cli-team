# 开源计划：双轨策略与当前状态分析 (Claude Code)

## 当前状态诊断

### Git 拓扑
```
origin  → https://github.com/iOfficeAI/AionUi.git  (上游)
myfork  → https://github.com/weijiafu14/AionUi.git  (fork)

分支：
  main                → 跟踪 origin/main (ccb8261)
  feature/agent-team  → 基于 main 的 12 个提交 (74dfaf2)
  myfork/feature/agent-team → 已推送到 fork
```

### 已有 PR 状态
- **PR #1634** (OPEN): `feature/agent-team → main` on `iOfficeAI/AionUi`
  - 标题: `[Feature] Agent Team + Workspace-first sidebar`
  - 50 个文件改动, +3946/-95
  - 包含完整 README Agent Team 章节（约 65 行产品描述）
  - PR body 写得很好，但 **分支包含了所有改动**（README + 代码 + docs + PM2 配置等）

### 当前问题
1. **PR #1634 混合了两个用途**：既含产品化 README（适合独立仓库），又含上游代码贡献。上游维护者不太可能接受一个改了他们 README 的 PR。
2. **fork 的 main 还跟踪 origin/main**：没有变成独立产品主线。feature/agent-team 分支承载了所有改动，但不是默认分支。
3. **缺少上游 PR 拆分**：50 个文件一个 PR 太大，上游大概率不会合并。

## 推荐方案

### 第一轨：独立仓库（产品主线）

**目标**：让 weijiafu14/AionUi 成为可独立运营的开源产品。

**操作步骤**：
1. 将 fork 的默认分支从 `main` 改为... 不对，更好的方式是：
   - 将 `feature/agent-team` 合并到 fork 的 `main`
   - 在 GitHub Settings 中确认 `main` 是默认分支
   - 这样用户访问 https://github.com/weijiafu14/AionUi 直接看到 Agent Team 版本

2. **README 策略**：
   - fork/main 的 README 自由维护，包含 Agent Team 介绍、截图、安装指南
   - 明确标注 "Fork of iOfficeAI/AionUi with Agent Team collaboration feature"
   - 添加上游链接和致谢

3. **保持同步**：
   - 保留 `origin` remote 指向上游
   - 定期 fetch + rebase/merge 上游变更到自己的 main
   - 或保留一个 `upstream-sync` 分支专门跟踪上游

### 第二轨：上游 PR（贡献代码）

**目标**：将 Agent Team 的核心能力贡献回上游，以小 PR 的形式逐步合并。

**操作步骤**：

1. **关闭或更新现有 PR #1634**：
   - 选择 A：关闭 #1634，说明将拆分为多个小 PR
   - 选择 B：保留 #1634 作为 RFC/tracking issue，在 body 里添加拆分计划链接

2. **PR 拆分建议**（每个都从 `origin/main` 新拉分支）：

   | 序号 | PR 范围 | 大致文件数 | 前置依赖 |
   |------|---------|-----------|---------|
   | 1 | 数据模型：`agent-team` 会话类型 + DB schema/migration | ~5 | 无 |
   | 2 | IPC Bridge：`agentTeam` namespace 定义 | ~3 | PR 1 |
   | 3 | 后端核心：AgentTeamService + CoordDispatcher + CoordFileWatcher | ~6 | PR 1+2 |
   | 4 | 前端 UI：TeamBuilder + AgentTeamChat + 侧边栏集成 | ~10 | PR 1+2+3 |
   | 5 | Codex ACP resume：acpConnectors 二进制覆盖 | ~3 | 独立 |
   | 6 | 任务路由保护：conversationBridge + cron guard | ~4 | PR 1 |

3. **每个 PR 的注意事项**：
   - 不改 README（上游自己决定怎么文档化）
   - 不含 ecosystem.pm2.config.cjs（本地开发工具）
   - 不含 docs/local-dev-playbook.md 等个人工作流文档
   - 保留 docs/tech/agent-team/ 设计文档（上游需要理解架构）
   - 补充单元测试（当前这些 commit 没有新测试）

### 关于现有 PR #1634

**现状分析**：PR body 写得很真诚，表达了正确的产品观点（cross-vendor teaming 是差异化方向）。但按上游维护者视角：
- 50 文件改动太大，review 成本高
- README 改动包含个人产品叙事，不适合直接合入
- 缺少测试覆盖
- `ecosystem.pm2.config.cjs` 等本地配置不应提到上游

**建议处理**：
- 在 PR #1634 留一个评论，说明计划拆分为更小的 PR
- 保留 #1634 open 作为 feature 讨论的入口（RFC 性质）
- 或者关闭后用 Issue 替代

## 与 Codex 建议的对比

Codex 建议的核心方向（产品主线 vs 上游 PR 分离）完全正确。我补充的要点：
1. **具体操作路径**：需要先处理现有 PR #1634，而不是忽略它
2. **PR 拆分粒度**：给出了 6 个具体 PR 的拆分建议
3. **每个 PR 的排除清单**：明确哪些文件不应出现在上游 PR 中
4. **fork/main 的具体操作**：merge feature/agent-team 到 main，而不是创建新分支
