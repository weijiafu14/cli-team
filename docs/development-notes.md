# AionUi Development Notes

Lessons learned from developing Agent Team and related features. Read this before making changes.

## Build & Run

### Dev vs Production coexistence
- `pnpm run dev` uses port **25809**, packaged app uses **25808**
- Dev app name is `Electron`, packaged is `AionUi` — single instance locks are independent
- userData paths are separate: dev at `~/Library/Application Support/Electron/`, packaged at `~/Library/Application Support/AionUi/`
- DB files (`aionui.db`) are independent — no data conflicts
- You can run both simultaneously

### Build commands
```bash
pnpm install
pnpm run dev          # dev mode with hot reload
pnpm run build        # build frontend
pnpm run build:mac    # package for macOS via electron-builder
```

### Code quality checks
```bash
bun run lint:fix      # oxlint
bun run format        # oxfmt
bunx tsc --noEmit     # type check (must pass before every commit)
```

## Architecture Gotchas

### Three process types — never mix their APIs
- `src/process/` — main process (Node.js APIs, no DOM)
- `src/renderer/` — renderer (DOM APIs, no Node.js)
- `src/worker/` — fork workers (Node.js, no Electron)
- Cross-process communication only through IPC bridge (`src/common/ipcBridge.ts`)

### Adding a new conversation type
When adding a type like `agent-team`, you need to update ALL of these:
1. `src/common/storage.ts` — `TChatConversation` union
2. `src/process/task/agentTypes.ts` — `AgentType`
3. `src/process/database/schema.ts` — CHECK constraint + migration
4. `src/process/database/types.ts` — `IConversationRow.type` + `rowToConversation()`
5. `src/common/ipcBridge.ts` — `ICreateConversationParams.type`
6. Exhaustiveness checks across the codebase (tsc will tell you):
   - `ActivitySnapshotBuilder.ts`
   - `AgentSetupCard.tsx`
   - `useSendBoxDraft.ts`
   - `ConversationTabsContext.tsx`
   - Any `conversation.type` switch/if

### Runtime guards for non-agent types
`agent-team` is NOT a real agent — it has no CLI process. Guard these paths:
- `conversationBridge.ts` `sendMessage` — route to `AgentTeamService` instead of `workerTaskManager`
- `conversationBridge.ts` `createWithConversation` — skip `getOrBuildTask`
- `cron executor` — don't schedule agent-team
- `WorkerTaskManager factory` — don't register a creator for agent-team

## CSS & Layout Pitfalls

### Arco Tabs breaks flex height chain
Do NOT use Arco `<Tabs>` when you need the tab content to fill available height. Arco Tabs uses `position: absolute` for tab switching animation, which breaks `flex: 1 + overflow-y: auto` chains. Use a custom tab bar with conditional rendering instead.

### Flex scrolling requires min-height: 0
When using `flex: 1` + `overflow-y: auto`, every ancestor in the flex chain needs `min-height: 0`. Without it, content overflows instead of scrolling. Common fix:
```css
.parent { display: flex; flex-direction: column; min-height: 0; }
.child  { flex: 1; min-height: 0; overflow-y: auto; }
```

### ChatLayout modifications affect ALL conversation types
`ChatLayout/index.tsx` wraps every conversation. Changes to its flex/min-height/overflow affect ACP, Gemini, Codex, OpenClaw, NanoBot, and Agent Team. Test all types before committing layout changes.

## Input & IME

### Always use SendBox or useCompositionInput
Never write a bare `<Input.TextArea>` with `onKeyDown` Enter handler. Chinese/Japanese/Korean IME composition will conflict — Enter during composition confirms the candidate, not sends. Use:
- `SendBox` component (`src/renderer/components/chat/sendbox.tsx`) — full-featured, IME-safe
- `useCompositionInput` hook — if you need custom input behavior

### SendBox has everything
`SendBox` already handles: IME composition, focus ring, single/multi-line toggle, slash commands, drag-drop upload, paste images, file preview. Don't reinvent.

## File Upload

### Use existing components
- `FileAttachButton` — the "+" upload button
- `FilePreview` — image thumbnail / file card with remove button (supports readonly mode)
- `HorizontalFileList` — horizontal scrollable container for file previews
- `useOpenFileSelector` — native file dialog via IPC (note: `onFilesSelected` receives `string[]` paths, not `FileMetadata[]`)

### Image display in renderer
Don't use `file://` URLs — unstable in WebUI mode. Use `FilePreview` component which loads images via IPC `readFileBuffer` → base64 data URL.

## Timeline & Sorting

### Timestamp format must be consistent
`coord_write.py` outputs local timezone ISO (`2026-03-23T16:30:00+08:00`). JavaScript `new Date().toISOString()` outputs UTC (`2026-03-23T08:30:00.000Z`). String comparison (`localeCompare`) sorts these wrong — `08` < `16` puts UTC timestamps before local ones.

**Always sort by `new Date(ts).getTime()`**, not string comparison.

When writing timestamps from Node.js, match coord_write.py's format (local timezone ISO).

## Coord Protocol — Team Isolation

### Every team gets its own coord directory
```
<workspace>/.agents/teams/<teamId>/coord/
```
NOT `<workspace>/.agents/coord/` (that's the old path, causes cross-team pollution).

### All paths in prompts must be team-relative
When generating `presetPrompt`, `SKILL.md`, `TEAM.md`, wakeup messages — use `getRelativeCoordDir(teamId)` which returns `.agents/teams/<teamId>/coord`. Never hardcode `.agents/coord/`.

### Script calls must include explicit paths
```bash
# WRONG — uses default .agents/coord/ which is wrong for teams
python3 .agents/teams/<id>/coord/scripts/coord_read.py --agent-id xxx

# RIGHT — explicit paths override defaults
python3 .agents/teams/<id>/coord/scripts/coord_read.py \
  --messages .agents/teams/<id>/coord/messages.jsonl \
  --state-dir .agents/teams/<id>/coord/state \
  --agent-id xxx
```

### No workspace-root shared files
Don't write `TEAM.md` or `SKILL.md` to workspace root — multiple teams overwrite each other. Write everything inside `<coordDir>/`. Clean up legacy root files in `ensureTeamWorkspace`.

## Sidebar / Workspace Grouping

### All conversations group by workspace
The `customWorkspace` filter was removed. Every conversation with a `workspace` is grouped under a workspace header. Users manage noise via hide/unhide.

### Team children are nested, not siblings
Conversations with `extra.teamId` are excluded from top-level rendering. They appear indented under their team parent via `WorkspaceNode` types (`ConversationNode | TeamNode`).

### Hidden workspaces filter both timeline AND pinned
If you hide a workspace, its conversations must disappear from both `timelineSections` and `pinnedConversations`. Easy to forget the pinned section.

## Codex ACP Resume

### v0.7.4 cannot resume across processes
npm `@zed-industries/codex-acp@0.7.4` only supports in-process `session/load`. Cross-process resume requires v0.10.0 which has `find_thread_path_by_id_str` + `resume_thread_from_rollout`.

### Use local v0.10.0 binary
`connectCodex()` in `acpConnectors.ts` auto-discovers local binary at:
- `~/.aionui-dev/bin/codex-acp-0.10.0`
- `~/.aionui/bin/codex-acp`
- Or set `AIONUI_CODEX_ACP_BINARY` env var

Download from: `gh release download v0.10.0 --repo zed-industries/codex-acp --pattern "*darwin*arm64*"`

## Consensus Protocol

### ACK must include reply_to
`enforceConsensusIfNeeded` only counts ACKs whose `reply_to` matches the final decision ID. Bare ACKs (without `reply_to`) are NOT counted. Prompt text and wakeup messages must tell agents to use `--reply-to <decision-id>`.

## Git Workflow

### AionUi is a sub-directory with its own git
AionUi has its own `.git` inside the parent project. Always `cd AionUi` before git operations. Never `git add -A` from the parent project — it would expose everything.

### Push to fork
```bash
cd AionUi
TOKEN=$(gh auth token)
git remote add myfork "https://x-access-token:${TOKEN}@github.com/weijiafu14/AionUi.git"
export https_proxy=http://127.0.0.1:7897  # if needed
git push myfork feature/agent-team
```

## Agent Team Coord with Codex (via project-level .agents/coord/)

The project-level `.agents/coord/` (where Claude and Codex coordinate during development) is separate from AionUI's Agent Team coord directories. Don't confuse them:
- Project coord: `.agents/coord/` at repo root — used by Claude Code + Codex during development
- Team coord: `<workspace>/.agents/teams/<teamId>/coord/` — used by AionUI Agent Team feature at runtime
