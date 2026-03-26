# ACP codex stale session resume

## Problem

`ACP + codex` can look "restarted" but still recover the same broken thread.

Typical symptoms:

- `ContextWindowExceeded`
- `Custom tool call output is missing`
- interrupt/reset appears to run, but the next message still fails immediately

## Root cause

- `AcpAgent.createOrResumeSession()` uses `session/load` for backend `codex` when persisted `acpSessionId` exists.
- Killing the worker process alone does not remove that persisted resume state.
- The next bootstrap can therefore load the same already-full or corrupted Codex thread back into memory.

This is different from the legacy native Codex path that uses `codexNativeSessionId`.

## Fix pattern

- Detect fatal Codex stderr on the ACP path and mark the session poisoned.
- Clear persisted `acpSessionId` and `acpSessionUpdatedAt` immediately in `AcpAgentManager`.
- Clear the same persisted resume state again in `CoordDispatcher` before poisoned re-dispatch.
- Keep regression coverage for both:
  - poisoned re-entry clears ACP resume state
  - Codex resume routing uses `session/load` only when `acpSessionId` still exists

## Files

- `src/agent/acp/index.ts`
- `src/process/task/AcpAgentManager.ts`
- `src/process/services/agentTeam/CoordDispatcher.ts`
- `tests/unit/acpSessionCapabilities.test.ts`
- `tests/unit/process/coordDispatcher.codexAcpRecovery.test.ts`

## Review rule

When a user reports Codex recovery failures, verify the active path first:

- ACP codex: `acpSessionId`
- native Codex: `codexNativeSessionId`

Do not assume a fix on one path protects the other.
