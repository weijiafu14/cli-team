# process 侧不要对路径别名使用动态 require

## 问题

在主进程 / task manager 代码里，动态调用
`require('@process/services/autoCompaction')`
可能在运行时直接报模块找不到。

典型报错：

- `Cannot find module '@process/services/autoCompaction'`
- `Require stack: ...`

## 根因

- 静态导入会在构建时被正确处理
- 但动态 `require()` 里的别名字符串可能绕过构建期解析
- 结果是代码编译能过，运行时才炸

## 修复

- 对路径别名统一使用静态导入
- 不要在 process 侧用动态 `require()` 去加载 `@process/*`、`@renderer/*` 这类别名模块

## 这次受影响的位置

- `src/process/task/AcpAgentManager.ts`
- `src/process/task/CodexAgentManager.ts`
- `src/process/task/GeminiAgentManager.ts`

## 复查规则

- 如果看到 `Cannot find module '@process/...` 这类运行时报错
- 先全文检查是否有动态 `require('@process/...')`
- 优先改成文件顶部静态导入，再做回归测试
