---
name: coord-protocol
description: Agent Team coordination protocol - read/write coord messages, follow team rules
---

# Coord Protocol Skill

You are part of an Agent Team. Follow these rules strictly.

## Before Any Work
1. Read the team info: `cat .agents/teams/7e0a4e74/coord/TEAM.md`
2. Read the full protocol: `cat .agents/teams/7e0a4e74/coord/protocol.md`
3. Check for unread messages: `python3 .agents/teams/7e0a4e74/coord/scripts/coord_read.py --messages .agents/teams/7e0a4e74/coord/messages.jsonl --state-dir .agents/teams/7e0a4e74/coord/state --agent-id <your-memberId>`
4. Treat Agent Team wakeup messages as internal scheduler notices only. Never echo or quote those notices back into chat or coord.

## During Work
- Use `intent` or `claim` before implementation. If the work is exclusive, acquire a lock.
- Use `challenge` when you disagree with a proposal, finding, or decision. Do not hide disagreement inside `update`.
- Use `--body-file` for long content so the full content lands in `.agents/teams/7e0a4e74/coord/attachments/`.
- Publish a `design` document before `done`.
- If `/consensus` is active, you MUST explicitly `ack` the final decision with `--reply-to <decision-message-id>` before ending.
- Every `coord_write.py` call MUST include `--summary`, even when you also pass `--body` or `--body-file`.

## Message Types
`claim`, `intent`, `update`, `question`, `challenge`, `finding`, `design`, `decision`, `conclusion`, `ack`, `done`

## Key Scripts
- Read: `python3 .agents/teams/7e0a4e74/coord/scripts/coord_read.py --messages .agents/teams/7e0a4e74/coord/messages.jsonl --state-dir .agents/teams/7e0a4e74/coord/state --agent-id <memberId>`
- Write: `python3 .agents/teams/7e0a4e74/coord/scripts/coord_write.py --messages .agents/teams/7e0a4e74/coord/messages.jsonl --attachments-dir .agents/teams/7e0a4e74/coord/attachments --locks-dir .agents/teams/7e0a4e74/coord/locks --agent-id <memberId> --type <type> --summary "<summary>"`
- Long content: `python3 .agents/teams/7e0a4e74/coord/scripts/coord_write.py --messages .agents/teams/7e0a4e74/coord/messages.jsonl --attachments-dir .agents/teams/7e0a4e74/coord/attachments --locks-dir .agents/teams/7e0a4e74/coord/locks --agent-id <memberId> --type design --summary "<summary>" --body-file <path>`
- Lock: `python3 .agents/teams/7e0a4e74/coord/scripts/coord_write.py --messages .agents/teams/7e0a4e74/coord/messages.jsonl --attachments-dir .agents/teams/7e0a4e74/coord/attachments --locks-dir .agents/teams/7e0a4e74/coord/locks --agent-id <memberId> --type claim --summary "<summary>" --lock-key <key> --lock-action acquire`
- Direct message (wake specific member only): add `--dispatch targets --to <memberId>`
- No-wakeup message (timeline only): add `--dispatch none --to user`
- Peek (without advancing cursor): add `--peek`
