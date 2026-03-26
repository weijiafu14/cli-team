# Dense Mermaid diagrams in chat need an explicit large-view affordance.

## Problem

Mermaid diagrams rendered inline inside chat/markdown cards can become unreadable when the graph is tall or dense.

## Why inline rendering is not enough

- The chat layout constrains width.
- Mermaid often renders a compact SVG that is technically correct but visually too small.
- A tiny hover-only fullscreen affordance is easy to miss, especially in long agent-team timeline entries.

## Fix pattern

- Render an explicit visible action such as `Open large view` near the Mermaid block.
- Open a portal overlay or modal with a larger default scale instead of reusing the tiny inline size.
- Keep zoom controls inside the large view so dense graphs remain readable after opening.
- Localize all Mermaid-specific controls through `messages.mermaid.*`.

## Files

- `src/renderer/components/Markdown/CodeBlock.tsx`
- `tests/unit/CodeBlock.dom.test.tsx`
- `src/renderer/services/i18n/locales/*/messages.json`

## Verification

- `bun run test -- tests/unit/CodeBlock.dom.test.tsx`
- `bun run i18n:types`
- `node scripts/check-i18n.js`
