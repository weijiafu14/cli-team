# Gemini Shell 命令卡住

## 问题
Gemini 执行阻塞的 shell 命令（如 `pnpm dev`）后整个 worker 卡死，无法响应新消息。

## 根因
- Gemini CLI 的 `run_shell_command` 工具没有超时机制
- 阻塞命令（需要 Ctrl+C 退出的）会无限等待
- CoordDispatcher 认为 Gemini 仍在 busy 状态，新消息排队等待

## 修复方案
- `runtimeGuards.ts`：设 `DEFAULT_GEMINI_SHELL_INACTIVITY_TIMEOUT_SECONDS = 180`
- `cli/config.ts`：透传 `shellToolInactivityTimeout` 到 Gemini Config
- 180 秒无输出自动 kill 子进程

## 影响范围
- `src/agent/gemini/runtimeGuards.ts`
- `src/agent/gemini/cli/config.ts`
