# 设计说明：Agent Team 开源仓库与上游 PR 分支策略

## Problem Statement

用户准备同时做两件事：

1. 把当前成果作为独立开源仓库持续迭代 Agent Team。
2. 向 AionUi 原仓库提交 PR，争取把可合并部分送回上游。

关键问题是：独立仓库的默认分支怎么设，才能既方便维护 README/路线图，又不污染上游 PR。

## Chosen Approach

建议把“产品主线”和“上游同步线”明确分开：

- 独立开源仓库：可以让自己的 `main` 成为 Agent Team 产品主线。
- 上游 PR：不要直接从这个 `main` 发起，而是始终从 `origin/main` 拉出独立 PR 分支，再按需 `cherry-pick` 可上游化提交。

## Alternatives Considered

### 方案 A：继续让 fork/main 跟随上游 main

优点：
- 与上游关系最清晰。

缺点：
- 独立仓库的 README、路线图、issue、发布说明会被迫放到其它分支，不利于开源运营。
- 用户进入仓库默认看到的不是你的产品主线。

### 方案 B：让 fork/main 变成 Agent Team 产品主线

优点：
- README、发布说明、路线图、截图、安装方式都可以围绕你的产品维护。
- 对外传播简单，默认分支就是你真正维护的版本。

缺点：
- 与上游 main 会长期分叉，不能再把 `main` 当作提上游 PR 的直接来源。

最终选择方案 B，但必须配套一条干净的上游 PR 工作流。

## Recommended Repository Model

### 独立仓库

- 默认分支：`main`
- 角色：Agent Team 产品主线
- 内容可以包含：
  - 自己的 README/品牌描述
  - 自己的 roadmap / docs
  - 与上游不一定会接受的产品化改造

### 上游同步参考线

保留一个长期只做同步的分支，例如：

- `upstream-main`
- 或 `sync/origin-main`

它只用于记录上游最新状态，不承载产品开发。

### 提 PR 的工作分支

每次给原仓库提 PR，都这样做：

1. 从 `origin/main` 拉最新代码。
2. 新建短生命周期分支，例如 `pr/agent-team-coord-core`。
3. 从你的产品主线中精确 `cherry-pick` 可合并提交，必要时手工整理成更小的提交。
4. 在这个 PR 分支上补测试、删掉品牌化 README 和不适合上游的内容。
5. 推到 fork，再向 `origin/main` 发 PR。

## Affected Files And Interfaces

这次是策略建议，没有直接修改业务代码。涉及的对象是：

- Git 分支模型
- GitHub 默认分支与 README 呈现
- 上游 PR 切分方式

## Risks And Follow-up Checks

- 如果继续使用 GitHub fork 形态，仓库页面会一直显示“forked from ...”；如果你想把它作为完全独立产品运营，后续可以考虑新建非 fork 仓库并保留 `origin` 作为上游 remote。
- 当前分支里 README 与实现高度耦合，若要提上游 PR，需要先把“通用能力”和“你自己的产品叙事”拆开。
- 一次性提交整套 Agent Team 很可能过大，建议拆成多 PR：数据模型/基础路由、coord 协议、前端 UI、Codex resume、文档。

## Verification Performed

- `git branch -vv`
- `git remote show origin`
- `git remote show myfork`
- 结合当前提交历史判断：`feature/agent-team` 基于 `origin/main` 演进，`main` 仍跟踪上游 `origin/main`

## Recommendation Summary

- 如果你的目标是“把它当成独立项目持续运营”，就让你自己的仓库 `main` 成为产品主线。
- 如果你的目标是“保持向上游持续贡献”，不要直接用这个 `main` 提 PR。
- 正确做法是：产品主线负责演进；上游 PR 永远从最新 `origin/main` 新开分支，按需摘取能被上游接受的最小改动集。
