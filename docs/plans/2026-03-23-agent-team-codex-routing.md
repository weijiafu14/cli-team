# Agent Team Codex ACP Resume Note

## Final Root Cause

The real problem is not missing persistence inside AionUi. The problem is the
specific upstream bridge version currently used by this fork:

- AionUi resolves Codex ACP through `@zed-industries/codex-acp@0.7.4`
- The npm package is only a thin wrapper
- The real bridge logic comes from upstream `codex-acp` tag `v0.7.4`

That upstream `v0.7.4` implementation only supports `session/load` for sessions
that are still present in the current process memory. It does **not** implement
cross-process disk-backed restore.

In practice that means:

1. AionUi persists `acpSessionId`
2. A later task rebuild calls ACP `session/load`
3. `codex-acp v0.7.4` cannot reload old sessions from disk
4. The bridge returns `Resource not found`
5. AionUi creates a fresh session

So the resume failure is a real upstream bridge limitation, not just a local
data issue.

## Evidence

### Upstream `v0.7.4`

Direct source inspection of upstream `codex-acp` tag `v0.7.4` shows
`load_session()` only checks the in-memory `self.sessions` map and returns
`resource_not_found` when the session is not already loaded in the same process.

### Newer upstream

Upstream `codex-acp` mainline (`0.10.0`) already contains disk-backed restore
logic:

- searches rollout files by session/thread id
- reconstructs rollout history from disk
- resumes the thread from rollout data

That means the capability exists upstream, but the npm-published version used by
this fork is too old.

## Product Decision

Keep Codex on ACP, but stop relying on the npm `0.7.4` bridge for resume.

For local development and verification, route Codex ACP to the official
`v0.10.0` release binary through environment override:

- `AIONUI_CODEX_ACP_BINARY=/tmp/codex-acp-release-v0100/codex-acp`

This keeps the AionUi integration shape unchanged while swapping in a bridge
binary that actually implements disk-backed restore.

## Implementation in This Fork

### AionUi change

`src/agent/acp/acpConnectors.ts` now supports a local binary override via:

- `AIONUI_CODEX_ACP_BINARY`

If present, Codex ACP is spawned from that binary directly. If not, AionUi falls
back to the old npm bridge path.

### PM2 setup

`ecosystem.pm2.config.cjs` sets:

- `PATH` to the intended Node version
- `AIONUI_CODEX_ACP_BINARY` to the local official `v0.10.0` bridge binary

## Follow-up

Longer term, the clean fix is to move the published Codex ACP dependency forward
once npm catches up or upstream ships a newer package version. At that point the
local binary override can be removed.
