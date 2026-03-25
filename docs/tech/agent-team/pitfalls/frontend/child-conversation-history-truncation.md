# 子会话历史消息截断

## 问题
打开 Codex/Claude 子会话时看不到最新消息，只显示最旧的内容。

## 根因
- `useMessageLstCache` 用 `pageSize=10000 + ORDER BY created_at ASC` 加载消息
- ASC 从最旧开始取，只取前 10000 条
- 活跃的 Codex 子会话可能有 40000+ 条消息
- 最新的 30000+ 条消息被截掉

## 修复方案
- `hooks.ts` 改为 `order: 'DESC'` 取最新 10000 条
- 返回后 `[...messages].reverse()` 恢复时间顺序
- `databaseBridge.ts` 支持传入 `order` 参数

## 影响范围
- `src/renderer/pages/conversation/Messages/hooks.ts`
- `src/process/bridge/databaseBridge.ts`
- `src/process/database/index.ts`
