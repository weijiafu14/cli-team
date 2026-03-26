#!/usr/bin/env bash
# 启动打包后的 AionUi.app 并将日志写入文件（每次启动覆盖上次日志）
# Usage: bash scripts/run-app.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

APP_BINARY="$PROJECT_ROOT/out/mac-arm64/AionUi.app/Contents/MacOS/AionUi"
LOG_FILE="$PROJECT_ROOT/app-run.log"

if [[ ! -x "$APP_BINARY" ]]; then
  echo "错误: 找不到 App 二进制文件: $APP_BINARY"
  echo "请先运行打包命令构建 App"
  exit 1
fi

echo "启动 AionUi..."
echo "日志文件: $LOG_FILE"
echo "---"

# 使用 > 覆盖（不是 >>追加），每次启动只保留本次日志
"$APP_BINARY" > "$LOG_FILE" 2>&1 &
APP_PID=$!

echo "App PID: $APP_PID"
echo "查看日志: tail -f $LOG_FILE"
echo "停止 App: kill $APP_PID"

wait "$APP_PID" 2>/dev/null || true
