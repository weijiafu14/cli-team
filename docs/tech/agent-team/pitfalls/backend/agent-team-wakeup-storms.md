# Agent-team wakeup storms come from broadcast coord writes plus visible internal wakeups.

## Problem

In noisy team runs, Codex could appear to "reply many times" and repeat previously handled content.

## Root causes

- Some agents explicitly wrote `ack` or broadcast-style `claim`/`intent`/`update`/`done` messages with `dispatch=all`, which re-woke the whole team and created coordination storms.
- Child ACP sessions displayed internal team wakeups and preset-injected prompts as normal right-side user messages, so the storm looked like repeated visible replies.

## Fix pattern

- In generated `coord_write.py`, force `ack` messages to `dispatch=none`, and downgrade broadcast `claim`/`intent`/`update`/`done` entries to `dispatch=none` when they target `["*"]`.
- In `CoordDispatcher`, send team wakeups with `internal=true`.
- In `AcpAgentManager`, skip persisting or emitting `user_content` for `internal` inputs, while still forwarding them to the agent runtime.

## Affected files

- `src/process/services/agentTeam/AgentTeamService.ts`
- `src/process/services/agentTeam/CoordDispatcher.ts`
- `src/process/task/AcpAgentManager.ts`
- `tests/unit/coordDispatcher.test.ts`
- `tests/unit/process/acpAgentManager.internal.test.ts`
- `tests/unit/process/agentTeamService.test.ts`

## Verification

- `bun run test -- tests/unit/coordDispatcher.test.ts tests/unit/process/acpAgentManager.internal.test.ts tests/unit/process/agentTeamService.test.ts`
- `bun run lint:fix`
- `bun run format`

## Notes

- `bunx tsc --noEmit` still fails on pre-existing repo-wide issues unrelated to this fix, so use the focused regression tests to validate this area until the global type baseline is repaired.
