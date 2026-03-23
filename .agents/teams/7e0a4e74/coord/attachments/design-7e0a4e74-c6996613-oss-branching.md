# 设计说明：Agent Team 开源仓库与上游 PR 的分支策略

## Problem Statement

用户准备把当前工作开源，一方面想把 Agent Team 作为独立仓库长期迭代，另一方面又希望向原始 AionUi 仓库持续提交 PR。需要判断独立仓库是否应直接使用当前 fork 的 `main` 作为默认分支，以及如何避免独立演进和上游可合并性相互干扰。

## Chosen Approach

基于当前 git 形态判断角色分离策略：

- 当前 `main` 与 `origin/main` 完全一致。
- 当前功能工作位于 `feature/agent-team`，相对 `origin/main` 领先 12 个提交。

因此建议把“独立产品主线”和“上游贡献分支”分开管理，而不是让同一条长期分支同时承担两个目标。

## Alternatives Considered

- 方案 A：直接把 fork 的 `main` 改造成产品主线，并且所有上游 PR 都从它发出。
  - 优点：README 和默认分支展示最清晰。
  - 缺点：PR diff 会混入品牌化 README、规划文档、实验性提交和上游不愿接受的改动，后续维护成本高。

- 方案 B：保留 fork 的 `main` 接近上游，只把功能放在 feature 分支。
  - 优点：上游 PR 最干净。
  - 缺点：作为独立开源仓库时，默认分支和 README 无法准确表达项目定位，不利于持续运营。

- 方案 C：角色分离。
  - 独立仓库默认分支服务于产品叙事和持续迭代。
  - 上游 PR 从 `upstream/main` 派生的专用分支提出。
  - 这是推荐方案。

## Affected Files And Interfaces

- git 分支策略与远程配置，不涉及产品代码接口变更。
- 受影响的主要是仓库默认分支、README 维护方式、PR 基线选择和提交拆分方式。

## Risks And Follow-up Checks

- 若继续复用“同一个 fork”承担两种角色，仓库叙事会清晰，但 PR 清洁度容易下降。
- 若未来 Agent Team 演进明显偏离 AionUi 主线，长期维护 fork 关系的收益会下降，届时应考虑迁移为独立非 fork 仓库。
- 当前 `feature/agent-team` 中混有 docs/snapshot 类提交；在向上游提交前，需要按主题重新整理为更小的 commit/branch。

## Verification Performed

- `git branch -vv`
- `git branch -r -vv`
- `git rev-list --left-right --count origin/main...HEAD`
- `git merge-base origin/main HEAD`

## Recommendation

推荐优先采用“角色分离”：

1. 如果你要把这个仓库当作独立开源项目经营，默认分支应该是你自己的产品主线，可以叫 `main`，README 也应该围绕 Agent Team 来写。
2. 但不要直接从这个长期演进的 `main` 向上游发 PR。
3. 向原仓库提 PR 时，应始终从 `origin/main`（或单独的 `upstream-main` 同步分支）切出专用 PR 分支，再从产品分支中 `cherry-pick` 可合并的最小提交集合。
4. 这样 README、路线图、实验性文档可以留在独立仓库主线，而上游 PR 只携带他们可能接受的代码和必要说明。

如果资源允许，最干净的做法其实是：

- 一个 fork：专门跟上游交互，尽量保持接近 AionUi。
- 一个独立仓库：专门做 Agent Team 产品化演进。

如果你暂时只想维护一个仓库，也仍然建议：

- `main`：独立开源产品主线
- `origin/main`：上游基线
- `pr/<topic>`：每个上游 PR 的专用分支，始终从上游基线派生

这样能同时满足“README 清楚”和“上游 PR 可合并”两个目标。
