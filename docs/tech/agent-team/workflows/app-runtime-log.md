# App 运行时日志查看

## 概述

推荐入口改为 `scripts/packaged-launch.sh`。它会把打包后的 AionUi.app 运行时 stdout/stderr 写入项目根目录的 `logs/packaged-app.log`，并在每次启动时覆盖旧日志。
Agent 需要查看用户使用时的日志时，直接读取这个文件即可，无需让用户手动复制粘贴。

## 使用方式

### 启动 App 并记录日志

```bash
sh scripts/packaged-launch.sh
```

- 日志文件: `<项目根目录>/logs/packaged-app.log`
- 每次启动会**覆盖**上次的日志（不是追加）
- `logs/` 已在 `.gitignore` 中，不会被提交

### Agent 查看日志

```bash
# 查看最近的日志
cat logs/packaged-app.log

# 实时跟踪日志
tail -f logs/packaged-app.log

# 搜索特定错误
grep -i "error\|warn\|fail" logs/packaged-app.log
```

## 注意事项

- 日志文件只在使用 `scripts/packaged-launch.sh` 启动时才会生成
- 如果用户直接双击 .app 启动，日志不会写入此文件
- `scripts/run-app.sh` 可继续用于兼容旧流程，但新约定统一查看 `logs/packaged-app.log`
