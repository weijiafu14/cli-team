# 开源双轨计划：独立仓库 + 上游 PR

## 现状分析

### 当前 Git 状态
- **upstream**: `origin` → `iOfficeAI/AionUi.git`
- **fork**: `myfork` → `weijiafu14/AionUi.git`
- **当前分支**: `feature/agent-team`（12 commits ahead of origin/main）
- **已有 PR**: #1634 `[Feature] Agent Team + Workspace-first sidebar`（OPEN，从 `weijiafu14:feature/agent-team` → `iOfficeAI:main`）

### README 问题
当前 feature/agent-team 上的 `readme.md` 新增了 65 行 Agent Team 介绍，使用了 fork 视角语言（"This fork adds..."），不适合作为上游 PR 的一部分。

### 提交历史问题
12 个提交中包含 snapshot/chore 类提交（`9ea6819 Save agent team snapshot`, `21c2cea chore: snapshot`），这些不适合直接进入上游。

---

## 双轨方案

### 轨道一：独立开源仓库（weijiafu14/AionUi fork）

**目标**：让用户可以直接试用 Agent Team，作为产品化的独立仓库持续迭代。

**分支策略**：
- 将 fork 的 `main` 分支更新为当前 `feature/agent-team` 的内容
- fork/main 成为产品主线，README 使用产品视角（不是"This fork adds..."，而是作为 AionUi 增强版的定位）
- 后续 Agent Team 迭代直接在 fork/main 上开发
- 定期从 `origin/main` rebase/merge 保持与上游同步

**README 策略**：
- fork/main 的 README 完整展示 Agent Team 能力
- 语言调整：从"This fork adds"改为正面描述（"AionUi with Agent Team"或"AionUi Enhanced"）
- 可以加 badge 说明是 iOfficeAI/AionUi 的增强 fork

**具体操作**：
```bash
# 在 fork 上将 feature/agent-team 合并到 main
git checkout main
git merge feature/agent-team
git push myfork main
```

### 轨道二：上游 PR（提交到 iOfficeAI/AionUi）

**目标**：将 Agent Team 核心功能贡献回上游，争取被采纳。

**分支策略**（同意 Codex 的方向）：
- 从 `origin/main` 新拉干净分支（如 `upstream/agent-team`）
- 从 feature/agent-team 精选 cherry-pick 可上游化的提交
- 排除 snapshot 类提交、fork 特有的文档改动
- README 改动最小化：只在上游 README 中加一小段功能说明，不使用 fork 视角语言

**提交整理建议**：
- 合并 snapshot 提交为有意义的逻辑提交
- 移除 fork 特有内容（PM2 config、local-dev-playbook 中的个人工作流）
- 保留核心：Agent Team 服务层、前端 UI、IPC bridge、协调协议

**PR 策略**：
- 关闭当前 #1634（太大、包含 fork 特有内容）
- 考虑拆分为多个更小的 PR：
  1. **PR-1**: 数据模型扩展 + IPC bridge（agent-team 类型定义）
  2. **PR-2**: AgentTeamService + CoordDispatcher + 协调脚本
  3. **PR-3**: 前端 UI（TeamBuilder + AgentTeamChat + 侧边栏集成）
  4. **PR-4**: 文档（overview、protocol、frontend-ui）
- 或者如果上游维护者接受大 PR，整理为一个干净的 squash PR

**README 处理**：
- 上游 PR 的 README 变更应该很少
- 只添加简短的功能描述（2-3 行），不包含 fork 链接
- 详细文档放在 docs/ 目录

---

## 当前 PR #1634 处理

### 选项 A：保留但更新（推荐）
- 不关闭 #1634，而是从 `origin/main` 新建干净分支
- force-push 到 `weijiafu14:feature/agent-team` 更新 PR
- 移除 README 的 fork 视角语言
- 整理提交历史

### 选项 B：关闭并新开
- 关闭 #1634
- 从 `origin/main` 新建分支，cherry-pick 后开新 PR
- 更新 PR 描述

### 选项 C：拆分为多个 PR
- 关闭 #1634
- 按上面的拆分策略开 3-4 个独立 PR

---

## 执行顺序建议

1. **先处理 fork/main**：将 feature/agent-team 合并到 fork/main，调整 README 语言
2. **再处理上游 PR**：从 origin/main 新建干净分支，整理提交，更新或新开 PR
3. **持续维护**：fork/main 持续迭代，定期尝试向上游贡献

---

## Risks

1. force-push 更新 PR 会丢失 PR 上已有的评论/讨论上下文（如果有的话）
2. 拆分 PR 可能增加上游维护者审查负担
3. fork/main 和 origin/main 长期分叉后合并成本增加
