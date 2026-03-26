Summary: Use scripts/packaged-launch.sh to launch the packaged desktop app and collect the latest user-run log in logs/packaged-app.log.

# Packaged App Log Capture

## Goal

Give users and agents a stable place to find the latest packaged-app log without asking the user to paste terminal output every time.

## Launch Command

Run from the repo root:

```bash
sh scripts/packaged-launch.sh
```

## Log Location

- Latest launch log: `logs/packaged-app.log`
- `logs/` is already ignored by `.gitignore`, so the runtime log should not be committed.

## Behavior

- Each launch truncates `logs/packaged-app.log` before starting the packaged app.
- Launcher stdout/stderr and packaged app stdout/stderr are written into the same file.
- The wrapper still uses `scripts/packaged-launch.mjs` for packaged-app discovery and process cleanup.

## Optional Overrides

- `AIONUI_PACKAGED_EXECUTABLE=/custom/path/to/AionUi`
- `AIONUI_PACKAGED_CWD=/custom/working/dir`
- `AIONUI_PACKAGED_LOG_FILE=/custom/path/to/packaged-app.log`

These overrides are mainly for tests or special local debugging cases.
