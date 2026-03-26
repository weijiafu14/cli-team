# Codex 页面单测通过但浏览器端仍失败

## 问题

仅靠 DOM 单测通过，不能证明真实 `Codex` 会话页已经修好。

本次真实浏览器侧验证中：

- 单测 `11/11` 通过
- 但在用户指定的 `pm2` 开发环境里，真实 `Codex` 会话页仍然没有落到底部

## 现场证据

验证对象：

- WebUI: `http://127.0.0.1:25809`
- conversation: `1b79160c`
- backend: `ACP + codex`
- note: this is a team child conversation (`teamId=5092a344`)

浏览器侧量到的主消息滚动容器状态：

- `scrollTop = 230497`
- `scrollHeight = 285721`
- `clientHeight = 656`
- `distanceToBottom = 54568`

这说明页面首屏离底部仍有五万多像素，不是“差一点”，而是明显没有到达底部。

但这里还有一个更重要的修正：

- `1b79160c` 是 team 子会话
- 当前产品代码对这类会话的首屏策略不是“绝对到底部”
- 而是优先跳到 `latest-right`

所以浏览器门禁不能只写成“distanceToBottom < N”。
它至少必须验证：

1. 最新右侧消息可见

## 为什么单测不够

当前新增单测覆盖的是两个局部入口：

1. `useAutoScroll`
   - 首次挂载时已预载消息的初始滚动

2. `useMessageLstCache`
   - DB hydration 阶段的 `msg_id` 去重

它们可以证明某两个局部逻辑被修正了，但还不能覆盖：

- 真实会话页的完整装载顺序
- `Virtuoso` 虚拟列表在大消息量下的实际首屏定位
- `MessageList` 预处理汇总后与原始列表长度差异
- 工作区、预览区、消息区同时渲染时的布局竞争
- 以及 team 子会话“latest-right 首屏策略”是否真的生效

## 本次会话的额外风险

会话 `1b79160c` 的数据量异常大：

- 总消息数：`20935`
- `acp_tool_call`：`14851`
- 去重后的消息身份：`8743`

所以这是一个“异常大、异常脏”的真实会话页，最容易暴露：

- 初始定位错误
- 虚拟列表滚动异常
- 重复快照带来的渲染膨胀

## 实践规则

当用户报告“页面滚不到底 / 循环滚动”时，不能只做：

- 局部 hook 单测

还必须补至少一条真实浏览器侧验证：

1. 进入指定会话页
2. 等页面稳定
3. 直接量主滚动容器的 `distanceToBottom`
4. 若明显大于阈值，则不能放行

## 当前浏览器门禁

当前浏览器门禁至少应包含一条：

1. `latest-right` 可见
   - 对 team 子会话，打开页面后应该至少能看到最新右侧消息

## 验收标准修正

后续这条问题的主验收标准改成：

1. `distanceToBottom < 200`

原因不是实现细节，而是用户原始投诉就是：

- `进页面根本滚动不到最下面`

所以真正需要验证的是：

- 首屏是否已经落到底部附近

而不是：

- 某条右侧消息是否进入首屏 DOM

`latest-right` 是否可见仍然可以作为辅助观察，但不再作为这条缺陷的最终放行条件。

## 最新运行时结果

在用户指定的 `pm2` WebUI 环境里，重新抓取真实浏览器控制台后，`MessageList` 的运行时参数已经变成：

- `initialScrollTargetOnLoad = bottom`
- `initialScrollTargetIndex = LAST`
- `processedListLength = 3235`
- `computedInitialIndex = 3234`
- `key = loaded`

同一轮真实浏览器采样里，主消息滚动容器为：

- `scrollTop = 284342`
- `scrollHeight = 284878`
- `clientHeight = 476`
- `distanceToBottom = 60`

这说明当前真实页面已经落到底部附近，按修正后的主验收标准已经通过。

对应的正式浏览器规格：

- `tests/e2e/specs/conversation/codex-page-scroll-webui.e2e.ts`

最新复跑结果为：

- `1 passed`

## 环境陷阱补充

这轮还有一个容易误导结论的运行时坑：

- `pm2 status aionui-webui` 可能显示 `waiting restart`
- 同时 `5173` 端口可能已经被其他 `vite --host` 进程占住
- 但旧的 `electron-vite dev -- --webui --remote` 进程及其 `Electron` 子进程仍然可能继续服务 `25809`

也就是说：

- 只看 `pm2 status`，不够
- 还必须同时核对：
  - `5173` 的监听进程
  - `25809` 的实际监听进程
  - 浏览器控制台里的 `[MessageList] scroll debug`

否则很容易把“重启失败的 pm2 状态”误判成“当前页面仍然没修好”。

## 不应误用的门禁

本次还额外澄清了一点：

- `Internal error`
- `Disconnected from Codex`

在会话 `1b79160c` 里是**历史持久化消息**
，不是本轮页面渲染时新生成的前端错误。

也就是说：

- 用户看到这些内容，说明这条坏会话以前确实挂过
- 但这本身不能再直接作为“前端渲染仍坏”的唯一门禁
- 否则会把历史数据问题和当前渲染问题混在一起

## 结论

这次问题后续的经验应该写死成两条：

- 局部单测通过，不代表真实会话页通过
- 浏览器门禁也必须先确认自己测到的是对的运行时，再下结论
