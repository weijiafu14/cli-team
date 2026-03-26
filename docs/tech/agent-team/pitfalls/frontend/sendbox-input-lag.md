# SendBox 输入卡顿

## 问题

Team timeline 页面输入框打字极度卡顿。

## 根因

- `SendBox` 每次按键触发 `canvas.measureText` 判断单行/多行切换
- AgentTeamChat 的 `inputValue` 状态在外层，每次按键导致整个组件（含 400+ 条 timeline）重渲染
- Markdown 渲染 + CollapsibleBody 的渲染成本叠加

## 修复方案

- `sendbox.tsx` 加 `lockMultiLine` prop：为 true 时跳过 `canvas.measureText` 宽度测量
- AgentTeamChat 的 SendBox 传 `defaultMultiLine + lockMultiLine`
- `TimelineList` 用 `React.memo` 防止输入时重渲染

## 影响范围

- `src/renderer/components/chat/sendbox.tsx`
- `src/renderer/pages/conversation/platforms/agent-team/AgentTeamChat.tsx`
