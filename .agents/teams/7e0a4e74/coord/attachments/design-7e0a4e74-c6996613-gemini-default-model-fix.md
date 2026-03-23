# 设计说明：修复 Gemini Google Auth 默认模型 `default` 导致的 404

## Problem Statement

当前 team 中新增的 Gemini CLI 成员调用失败，错误为 `[API Error: Requested entity was not found.]`。需要判断这是 team 数据补录问题，还是 Gemini 运行链路本身的问题，并给出可落地修复。

## Chosen Approach

从三层交叉定位：

1. 检查当前 team 的 SQLite 会话与消息记录，确认错误发生在 Gemini 子会话真正向 API 发起请求之后。
2. 对比历史上的 Gemini team conversation，确认同样错误早已存在，不是当前手工补录成员特有问题。
3. 追踪 Gemini 启动链路，确认 AionUi 把 Google Auth Gemini 的默认模型写成 `useModel="default"`，而 `src/agent/gemini/cli/config.ts` 与 `aioncli-core` 都不识别该值，最终把 `default` 当成模型实体名请求，触发 404。

## Alternatives Considered

- 只修当前数据库记录：能救当前会话，但新建 Gemini 会话还会继续写入坏值。
- 只改创建默认值：能避免以后出错，但历史会话仍然会失败。
- 采用“双修”：
  - 运行时兼容旧值 `default`
  - 新建会话改为写入合法别名 `auto-gemini-2.5`
  - 并顺手迁移当前数据库里的已有 Gemini 记录

## Affected Files And Interfaces

- `src/agent/gemini/cli/config.ts`
  - 将 legacy `default` 映射到 `DEFAULT_GEMINI_MODEL_AUTO`
- `src/process/services/agentTeam/AgentTeamService.ts`
  - Agent Team 默认 Gemini 模型从 `default` 改为 `auto-gemini-2.5`
- `src/renderer/pages/conversation/utils/createConversationParams.ts`
  - 普通 Gemini 新建会话默认模型改为 `auto-gemini-2.5`
- `src/renderer/pages/guid/hooks/useGuidSend.ts`
  - Guid 页 Gemini 占位模型改为 `auto-gemini-2.5`
- 运行数据
  - 更新 `aionui.db` 中现有 `type='gemini'` 且 `useModel='default'` 的记录为 `auto-gemini-2.5`

## Risks And Follow-up Checks

- 当前已经启动的 Gemini worker 可能仍持有旧 bootstrap 配置，因此需要重启应用或重建 worker / dispatcher 后才能稳定验证。
- `AgentSetupCard.tsx` 里仍有一个通用 `useModel: 'default'` 的 fallback，但它使用的是 `platform: 'custom'`，不属于这次 Gemini Google Auth 链路，不在本次修复范围内。
- 如果后续还出现 404，则需要继续追查 Gemini CLI 当前账号的模型可用性或 Google 侧配额/实体权限。

## Verification Performed

- 检查 team conversation 和 gemini child conversation 的 SQLite 记录
- 检查 gemini child messages，确认错误直接落在 API 调用层
- 对比历史 Gemini team conversation `9c4a8f4f`，确认同类错误早已存在
- 检查 `gemini.config`、`~/.gemini/oauth_creds.json`、`~/.gemini/google_accounts.json`
- 直接调用 `getOauthInfoWithCache('')`，确认 OAuth 邮箱可正常解析
- 阅读 `src/agent/gemini/cli/config.ts`
- 阅读 `src/agent/gemini/index.ts`
- 阅读 `node_modules/@office-ai/aioncli-core/dist/src/config/models.js`
- 阅读 `node_modules/@office-ai/aioncli-core/dist/src/utils/retry.test.js`
- 执行 `bunx tsc --noEmit`
- 执行 SQLite 更新后复核当前 Gemini conversations 的 `useModel`

## Conclusion

这次错误的核心不是 team 数据关系本身，而是 Gemini Google Auth 的默认模型值写错了。AionUi 原先把会话默认模型写成 `default`，但 Gemini CLI / aioncli-core 不识别这个值，因此它被当成不存在的模型实体发给 API，最终返回 `Requested entity was not found.`。

修复已包含三部分：

1. 运行时兼容旧值 `default`
2. 新建会话默认改为 `auto-gemini-2.5`
3. 当前数据库中的 Gemini 会话已迁移到 `auto-gemini-2.5`

剩余动作是让运行中的应用/worker 重新加载新配置，然后再重试 Gemini 成员调用。
