# Multi-Agent Coordination Protocol

## Purpose

This protocol is for multi-agent coordination in a shared workspace.

Goals:

1. Read only new messages.
2. Keep messages short.
3. Move large content into attachment files.
4. Make mutually exclusive work explicit before editing.
5. Avoid returning to the user until agents either finish the task or jointly agree on a conclusion or blocker.
6. Allow the user to participate directly in the same coordination stream.
7. When the user explicitly requires consensus, enforce explicit multi-agent ACK before any agent returns to the user.

## Files

- Message stream: `.agents/teams/<teamId>/coord/messages.jsonl`
- Attachments: `.agents/teams/<teamId>/coord/attachments/`
- Reader state: `.agents/teams/<teamId>/coord/state/<agent_id>.cursor.json`
- Locks: `.agents/teams/<teamId>/coord/locks/<lock_key>.json`

## Roles

Participants are identified by `from` and described by `role`.

- `system`: protocol bootstrap or global notices
- `user`: product direction, priorities, corrections, acceptance signals
- `agent`: implementation, testing, critique, design, and delivery work

User messages are first-class inputs. Agents must respond to them seriously and explicitly. Agents should:

1. acknowledge the direction in the coordination stream,
2. evaluate it against evidence and constraints,
3. execute it objectively when sound, or
4. challenge it with concrete evidence when it is risky or incorrect.

Agents must not ignore user guidance, and must not flatter the user instead of doing objective engineering work.

## Message Rules

1. Append-only. Never rewrite old JSONL lines.
2. Every write should go through `coord_write.py`.
3. Every read should go through `coord_read.py`.
4. If a task is mutually exclusive, acquire a lock before starting work.
5. If content is longer than the inline threshold, store it as an attachment and only keep a short preview inline.
6. Development work is claim-based. Before starting implementation work, the agent should write `intent` or `claim`, and acquire a lock when the work is mutually exclusive.
7. After finishing development work, the agent must publish a design document and attach it in the coordination stream before marking the work as complete.
8. If the user says the team must reach consensus, no agent may stop at a private judgment. The team must continue until explicit ACK messages are exchanged on the same final conclusion.

## Required Fields

- `id`: unique message id
- `ts`: ISO timestamp
- `from`: writer agent id
- `role`: `system`, `user`, or `agent`
- `to`: `["*"]` or a list of target agent ids
- `topic`: topic or feature name, for example `browser-debug`
- `task_id`: optional task id
- `type`: one of `claim`, `intent`, `update`, `question`, `challenge`, `finding`, `design`, `decision`, `conclusion`, `ack`, `done`, `system`, `direction`
- `summary`: short message summary

## Optional Fields

- `body`: short inline detail
- `attachment`: object with `path`, `bytes`, `sha256`
- `reply_to`: message id being answered
- `lock`: object with `key`, `action`, `status`
- `meta`: free-form metadata
- `consensus`: object for consensus tracking, for example `{"required": true, "status": "in_progress" | "reached", "decision_id": "<msg-id>" }`
- `dispatch`: transport routing (`all` = broadcast and wake all members, `targets` = wake only members listed in `to`, `none` = append to timeline only, do not wake any agent). Default is `all`.

## Dispatch Rules

The `dispatch` field controls which agents are woken up when a message is appended:

- User messages always wake all agents regardless of `dispatch`.
- `dispatch=all`: wake every member except the sender. Use `to: ["*"]`.
- `dispatch=targets`: wake only the members listed in `to`. Use `to: ["<memberId>", ...]`.
- `dispatch=none`: do not wake any agent. Use `to: ["user"]`. The message is visible in the timeline but no agent is interrupted.

Use `--dispatch` flag with `coord_write.py` to set this field.

## Lock Rules

Use locks for mutually exclusive work such as:

- editing the same file
- changing the same integration point
- rewriting the same test
- implementing the same claimed development task

Lock actions:

- `acquire`
- `release`

Lock statuses:

- `acquired`
- `released`
- `blocked`

If a lock is blocked, the agent should not proceed with that exclusive task until it either:

1. coordinates a handoff, or
2. chooses a different task branch

Claimed development work should normally use the same `task_id` and `lock.key` so other agents can see who is actively changing that area.

## Reader Rules

Each agent has an independent cursor file.

`coord_read.py` reads only messages after that agent's last cursor position.

Default behavior:

1. read new messages
2. print compact summaries
3. advance the cursor

Use `--peek` to inspect without moving the cursor.

## Writer Rules

Use `coord_write.py` for every protocol write.

The writer script:

1. assigns ids and timestamps
2. enforces short summaries
3. moves long bodies into attachments
4. records lock acquire and release attempts
5. records the writer role

## Design Document Rule

Implementation is not complete when code lands. The claiming agent must publish a short design document after development and before `done`.

Minimum design document content:

1. problem statement
2. chosen approach
3. alternatives considered or rejected
4. affected files and interfaces
5. risks and follow-up checks
6. verification performed

Recommended path format:

- `.agents/teams/<teamId>/coord/attachments/design-<task_id>-<agent_id>.md`

The completion message should either:

1. use `type=design` and attach the design document, or
2. reference an earlier `design` message before sending `done`

## Collaboration Rule

After the user gives a task, agents should continue coordinating through this protocol and should not come back to the user until:

1. the task is completed, or
2. all active agents agree on the same blocker or conclusion

One agent disagreement means the task is not yet settled.

If the user explicitly says that agents must reach consensus, the task enters `consensus-required` mode. In this mode:

1. agents must keep working and exchanging evidence until a final `decision` or `conclusion` message exists,
2. every active agent must send an explicit `ack` that references that exact final message via `reply_to`,
3. the ACK must state whether the agent agrees, what evidence supports the agreement, or why it still disagrees,
4. no agent may return to the user before all active agents have ACKed the same final message,
5. silence is not agreement, and partial implementation is not completion,
6. if any active agent has not ACKed, the task is still open.

`ack` is not optional politeness. It is the protocol-level proof that consensus has been reached.

When a consensus-required task is active, agents must not:

1. stop after their own local conclusion,
2. report “done” before all active agents ACK the same conclusion,
3. treat “I already fixed my part” as completion,
4. drop back to the user for narration unless there is already a shared ACKed conclusion or a shared ACKed blocker.

When the user sends a `direction` message, the active agents should respond in-stream before continuing. At least one response should state:

1. what the user asked for,
2. whether the team accepts, adjusts, or challenges it, and
3. what concrete next action follows.

If the user's direction explicitly says “达成共识”, “共识后再来”, “直到都同意”, or equivalent intent, agents should immediately write:

1. an `update` or `decision` marking the task as `consensus.required=true`,
2. the planned investigation branches,
3. and later a chain of explicit `ack` messages that close the task.
