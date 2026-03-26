# 外部 AI 工具能力核验要先分清“原生内置”还是“扩展接入”。

## 适用场景

当团队回答外部 AI 产品是否“支持某能力”时，尤其是 CLI、IDE agent、MCP 客户端这类可扩展工具。

## 核验步骤

1. 先查官方产品 README / 官方文档，确认产品本体的原生能力边界。
2. 再查官方扩展、MCP、插件、sample agent，确认是否存在“可接入但非内置”的实现。
3. 对外表述必须拆开：
   - `原生内置支持`
   - `通过官方支持的 MCP / Extension / Plugin 接入后支持`
4. 不要把 sample、扩展或第三方接入表述成“默认自带”。

## 这次案例

- `Gemini CLI` 官方 README 将媒体生成放在 `MCP servers` 扩展能力下。
- Google 官方 Genmedia 示例给 `Gemini CLI` 配置了 `nanobanana` MCP server。
- 因此准确说法是：`Gemini CLI 可以接入 Nano Banana`，但不应简化成“裸装 Gemini CLI 原生自带 Nano Banana”。

## 输出要求

- 只引用一手来源。
- 如果是最新能力，必须重新核实。
- 给用户的最终话术里要明确写出“内置”还是“扩展接入”。
