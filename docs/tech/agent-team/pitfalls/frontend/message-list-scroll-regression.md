# MessageList 滚动回归

## 问题
全局 `MessageList.tsx` 的 `initialTopMostItemIndex` 不能随意修改，否则会回归"点击聊天记录跳到底部"的已修问题。

## 根因
- `MessageList` 是所有会话类型共享的组件（ACP/Codex/Gemini/Agent-team 子会话）
- 在 Virtuoso 上加 `initialTopMostItemIndex={list.length - 1}` 会让所有会话打开时从底部开始
- 但历史导航场景（从聊天记录列表点击跳转）需要从顶部开始
- 这两个需求冲突

## 修复方案
- 不改全局 `MessageList` 的 `initialTopMostItemIndex`
- 通过 `useAutoScroll` 的 `initialScrollTargetIndex` 参数按场景控制
- 只有 agent-team 子会话（AcpChat/CodexChat）才传 `initialScrollTargetIndex='LAST'`

## 影响范围
- `src/renderer/pages/conversation/Messages/MessageList.tsx`
- `src/renderer/pages/conversation/Messages/useAutoScroll.ts`
- `tests/unit/conversation/messageList.dom.test.tsx`
