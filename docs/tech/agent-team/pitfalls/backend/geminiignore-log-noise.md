Summary: The `.geminiignore` missing message is benign Gemini runtime noise and should be filtered at the worker console boundary.

# Gemini `.geminiignore` Log Noise

## Symptom

Users may see:

`Ignore file not found: /path/to/workspace/.geminiignore, continue without it.`

This message does not block Gemini requests, but it pollutes user-visible logs.

## Root Cause

- The message is emitted inside the Gemini runtime/CLI, not by AionUi business logic.
- The Gemini worker inherits console output, so benign runtime messages leak into the app log stream.
- `.geminiignore` is optional, so the missing-file line is informational noise rather than an actionable error.

## Fix Pattern

- Install a targeted console filter in `src/worker/gemini.ts` before loading `@/agent/gemini`.
- Match only messages that include all of:
  - `Ignore file not found:`
  - `.geminiignore`
  - `continue without it`
- Do not mute broader Gemini logs or unrelated file-not-found errors.

## Verification

- Unit coverage lives in `tests/unit/gemini/workerLogFilter.test.ts`.
- The filter must suppress the benign `.geminiignore` message while preserving unrelated warnings and errors.
