# coord 脚本写到错误 team

## 问题

Gemini 的 coord 消息写到了错误的 messages.jsonl，导致 timeline 中看不到它的消息。

## 根因

- `coord_write.py` 的 `--messages` 参数默认值是 `.agents/coord/messages.jsonl`
- 但 team 的消息应该写到 `.agents/teams/<teamId>/coord/messages.jsonl`
- 如果 agent 忘记传 `--messages` 参数，消息就写到了根目录的 coord

## 修复方案

- `AgentTeamService.ts` 的 `writeCoordScripts` 方法接收 `teamId` 参数
- 写入每个 team 的脚本副本时，动态替换默认路径为团队专属路径
- 这样即使 agent 不传 `--messages`，也会写到正确的 team 目录

## 影响范围

- `src/process/services/agentTeam/AgentTeamService.ts` (`writeCoordScripts`)
