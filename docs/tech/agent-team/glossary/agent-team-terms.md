# Agent Team 专有名词

## coord / coordination
Agent Team 成员之间通过 `messages.jsonl` 进行的协调通信。

## dispatch
消息的路由方式：`all`（广播唤醒所有人）、`targets`（只唤醒指定成员）、`none`（不唤醒，仅写入 timeline）。

## wakeup
CoordDispatcher 向 agent 发送的唤醒消息，触发 agent 读取最新 coord 消息并继续工作。

## consensus
用户发 `/consensus` 后进入的共识模式。所有 agent 必须对同一个 `decision` 发送 `ack`（reply_to 匹配）才能结束。

## decision
agent 在共识模式中提出的正式决策方案。是 ACK 的目标——全员 ACK 同一个 decision 才能关闭共识。

## conclusion
人类可读的总结性消息。不作为 ACK 目标（只有 decision 类型才算）。

## busy gate
CoordDispatcher 的忙碌门控：agent 正在执行任务时不会收到新的 wakeup，消息排队等待。

## shellToolInactivityTimeout
Gemini CLI 的 shell 命令超时配置（默认 180 秒）。超时后自动 kill 阻塞的子进程。
