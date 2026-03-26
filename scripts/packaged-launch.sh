#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname "$0")" && pwd)
PROJECT_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)
LOG_FILE="${AIONUI_PACKAGED_LOG_FILE:-$PROJECT_ROOT/logs/packaged-app.log}"

mkdir -p "$(dirname "$LOG_FILE")"
: >"$LOG_FILE"

printf '[packaged-launch] log file: %s\n' "$LOG_FILE"

exec node "$SCRIPT_DIR/packaged-launch.mjs" "$@" >>"$LOG_FILE" 2>&1
