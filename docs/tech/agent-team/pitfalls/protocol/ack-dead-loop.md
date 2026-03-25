# ACK 死循环

## 问题
/consensus 后 agent 不断互发 ACK 但共识永远结束不了。

## 根因
- `enforceConsensusIfNeeded` 选最后一个 decision 作为 `finalDecisionId`
- 如果有 agent 连续发多个 decision，每个新 decision 让之前的 ACK 全部失效
- conclusion 类型也会抢占 finalDecisionId

## 修复方案
- 遍历所有 scoped decision，只要任一被全员 ACK 就返回 `reached`
- conclusion 不再作为 ACK 目标（只有 decision 类型才算）
- 没有全员 ACK 的 decision 时，用最后一个作为 reminder 目标

## 影响范围
- `src/process/services/agentTeam/CoordDispatcher.ts` (`evaluateConsensusProgress`)
