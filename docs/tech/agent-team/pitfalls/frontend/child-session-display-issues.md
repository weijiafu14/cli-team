# Agent Team 子会话展示问题合集

## 问题1：历史消息大量缺失

### 症状

打开 Codex 子 agent 会话时，历史消息不完整，缺失大量内容。

### 根因

- `useMessageLstCache` 硬编码 `pageSize: 10000`（hooks.ts:290）
- 活跃的 Codex 子 agent 可产生 40000+ 条消息
- 只有最新 10000 条被加载，更早的消息被截掉
- 已有修复（ASC→DESC）只改变了截断方向，未解决容量上限

### 修复方向

- 实现分页加载（向上滚动加载更多）
- 或显著增大 pageSize 作为临时方案

### 影响范围

- `src/renderer/pages/conversation/Messages/hooks.ts:290-296`

---

## 问题2：初始滚动不到底部

### 症状

从 Team Roster 点击进入子会话后，视图停在中间而非最新位置。

### 根因

`useAutoScroll.ts:111-143` 有两个 bug：

1. **streaming 竞态**：agent 活跃时，IPC streaming 消息先于 DB 查询到达，`prevLength` 已从 0 变为 N（streaming batch），DB 查询返回时 `isInitialLoad` 永远不为 true。

2. **闭包过期**：`useEffect` 依赖数组 `[messages]`（第144行）不包含 `initialScrollTargetIndex`，可能使用过期闭包值。

3. **latest-right 策略**：`initialScrollTargetOnLoad='latest-right'` 滚动到最后一条 right 消息（通常是 wakeup 调度消息），而非真正的最新内容。

### 修复方向

- 方案A：子会话使用 `'bottom'` 替代 `'latest-right'`
- 方案B：修复 useAutoScroll 依赖 + streaming 竞态处理
- 方案C：添加加载状态标志，DB 加载完成前不处理 streaming batch

### 影响范围

- `src/renderer/pages/conversation/Messages/useAutoScroll.ts:111-144`
- `src/renderer/pages/conversation/Messages/MessageList.tsx:236-254`
- `src/renderer/pages/conversation/components/ChatConversation.tsx:198`

---

## 问题3：Codex 300 秒超时

### 症状

Codex agent 报错 "LLM request timed out after 300 seconds" 后卡死。

### 根因

- `AcpConnection.ts:462` 硬编码 session/prompt 超时 300 秒
- 超时重置（`resetSessionPromptTimeouts`）仅在 `SESSION_UPDATE` 通知到达时触发
- Codex (`codex-acp` bridge v0.7.4) 在执行长时间操作时可能超过 300 秒不发送 SESSION_UPDATE

### 修复方向

- 为 Codex 后端增大超时（如 600s）
- 或实现超时后自动重连/重试

### 影响范围

- `src/agent/acp/AcpConnection.ts:462, 562-579`
