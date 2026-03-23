# AionUi Local Dev Playbook

This document captures the practical local-development tricks, pitfalls, and
runtime facts verified while developing AionUi itself.

## Baseline

- Repo: `AionUi/`
- Node: `>=22 <25`
- Dev WebUI command: `npm run webui:remote`
- PM2 config: `ecosystem.pm2.config.cjs`

## Recommended Daily Workflow

### Run AionUi under PM2

Use PM2 instead of a foreground shell so the WebUI stays alive while you are
testing from another terminal or browser.

```bash
cd AionUi
pm2 startOrReload ecosystem.pm2.config.cjs --only aionui-webui
pm2 logs aionui-webui --lines 120 --nostream
```

### Quick health checks

```bash
lsof -iTCP:5173 -sTCP:LISTEN -n -P
lsof -iTCP:25809 -sTCP:LISTEN -n -P
curl -I http://127.0.0.1:25809/
```

Expected:

- `5173` = Vite renderer dev server
- `25809` = WebUI proxy in development
- `curl` returns `HTTP 200`

## Dev vs Packaged Runtime Separation

### What is already isolated

Development mode calls:

- `app.setName('AionUi-Dev')`

Source:

- `src/utils/configureChromium.ts`

That means dev and packaged app use different `userData` roots, so their local
DB/config/runtime state is isolated by default.

### WebUI ports

Source:

- `src/common/constants.ts`
- `src/webserver/config/constants.ts`

Default ports:

- development: `25809`
- production/packaged: `25808`

So the WebUI ports already avoid direct collision by default.

### CDP ports

Source:

- `src/utils/configureChromium.ts`

Default CDP port starts at `9230`, but AionUi has a file-backed multi-instance
registry and scans `9230-9250`, so multiple instances can coexist without
hard-failing on the same CDP port.

### Single-instance lock

Source:

- `src/index.ts`

AionUi still uses `app.requestSingleInstanceLock(...)`. In practice:

- two dev instances will fight each other
- two packaged instances will fight each other
- dev and packaged are much safer together because app identity and `userData`
  are separated

## Can a Packaged Build Be Used to Develop AionUi Itself?

Yes, with constraints.

### Recommended setup

- keep the packaged app as your stable daily driver
- use it to open and work inside the `AionUi/` workspace itself
- run the dev build only when changing AionUi code and needing hot reload or
  direct source-level debugging

### Safe coexistence

This is acceptable when:

- packaged app stays on default packaged port `25808`
- dev app stays on `25809`
- you do not intentionally force both onto the same custom port

### What can still conflict

- if you run packaged and dev with the same manually configured WebUI port
- if you force the same CDP port through environment/config
- if you accidentally start multiple dev copies or multiple packaged copies

## Login / Test Account

Local WebUI login used during validation:

- username: `admin`
- password: `T$6*LVc2EGmS107a`

## Agent Team Runtime Facts

### Team runtime location

Each Agent Team stores coordination assets under:

```text
<workspace>/.agents/teams/<teamId>/coord/
```

Key files:

- `messages.jsonl`
- `TEAM.md`
- `protocol.md`
- `attachments/`
- `locks/`
- `state/`
- `scripts/coord_read.py`
- `scripts/coord_write.py`

### Important boundary

Do not write engineering coordination messages into an AionUi runtime team
unless you really want to affect the product state. Use the root project coord
stream for developer-to-developer coordination instead.

## Codex ACP Resume Fix

### Real root cause

The npm-published `@zed-industries/codex-acp@0.7.4` is too old for stable
cross-process session restore. Its real upstream `v0.7.4` only supports
in-process `session/load`.

### Local remediation used here

We patched AionUi to support an override binary:

- env var: `AIONUI_CODEX_ACP_BINARY`

PM2 now points Codex ACP to the official `v0.10.0` release binary, which
implements disk-backed restore.

Relevant files:

- `src/agent/acp/acpConnectors.ts`
- `ecosystem.pm2.config.cjs`
- `docs/plans/2026-03-23-agent-team-codex-routing.md`

### Verified effect

For the real affected team session:

- team: `33b64c4e`
- child conversation: `a70e33f7`

Codex ACP now logs:

- `Using local Codex ACP binary override`
- `session/load completed`

instead of silently creating a fresh session.

## Useful Commands

### Rebuild / restart dev app

```bash
cd AionUi
pm2 startOrReload ecosystem.pm2.config.cjs --only aionui-webui
pm2 logs aionui-webui --lines 120 --nostream
```

### Type check

```bash
cd AionUi
npx tsc --noEmit --pretty false
```

### Build local package

```bash
cd AionUi
npm run dist:mac
```

Expected artifacts go under:

```text
AionUi/out/
```

Common outputs:

- `.dmg`
- `.zip`
- `.app` inside the mac build directory

## Packaging Notes

- local packaging is fine for your own machine and local dogfooding
- if packaging fails on DMG creation, the build script already contains retry
  logic for DMG
- packaged app is suitable as a stable “use this app to work on AionUi itself”
  environment

## Bottom Line

The recommended local setup is:

1. use the packaged app as the stable daily driver
2. open the `AionUi/` workspace inside it
3. use the dev build only when actively changing AionUi source
4. keep packaged and dev ports separate
5. keep the Codex ACP binary override enabled until upstream npm catches up
