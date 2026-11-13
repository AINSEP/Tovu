### jini:packages/agent-runtime/src/providers/openai-chat.ts
- **Over:** file 528 lines (no function over 100)
- **Phase:** now · **Batch:** size-20
- **Tests:** `src/providers/__tests__/openai-chat.test.ts`, `src/providers/__tests__/strict-tools.test.ts`, `src/ai-trace/__tests__/providers.test.ts`, `src/ai-trace/__tests__/regressions.test.ts`; smoke for type importers: `rg -l "tool-turn" packages/agent-runtime/src --glob '*.test.*'`. No `vi.mock` of the file.
- **Responsibility map:**

| unit | declarations / statements | job |
|---|---|---|
| A wire types | `OpenAiFunctionToolDef`, `OpenAiToolCallParam`, `OpenAiTextPart`, `OpenAiImageUrlPart`, `OpenAiContentPart`, `OpenAiMessageParam`, `OpenAiToolCall`, `OpenAiToolResult`, `OpenAiToolExecutor`, `OpenAiTurnEndReason`, `OpenAiTurnEvent`, `OpenAiTurnOptions`, `OpenAiTurnResult` (L80-176) | the Chat Completions turn contract |
| B (stays) | request URL/headers/body, error detail, strict-tool retry, SSE reduction, `runOpenAiCompatibleRequest`, `runSingleOpenAiRequest` | one streaming request |
| C (stays) | image limits, `invalidOpenAiContentPartReason`, `sanitizeOpenAiToolResult`, `splitOpenAiToolResultContent`, tool loop helpers, `runOpenAiToolTurn` | tool loop |

- **Splits:**
  1. NEW `openai-chat-types.ts` — job: OpenAI-compatible turn/wire types. Moves unit A verbatim (all `export`, every doc comment moves, incl. the `detail` and `content` comments). Imports nothing from `openai-chat.ts` (unit A references only its own types). `openai-chat.ts` then `import type { … } from './openai-chat-types.js'` for the names it uses.
- **Importers to update:** `src/providers/index.ts` — add `export * from './openai-chat-types.js';` next to `export * from './openai-chat.js';` (keeps the package surface; `providers/index.ts` is re-exported by `src/index.ts`, the `.` entry). `src/providers/tool-turn.ts` (`OpenAiContentPart`, `OpenAiFunctionToolDef`, `OpenAiMessageParam`, `OpenAiToolCall` → `./openai-chat-types.js`; `runOpenAiToolTurn` stays), `src/providers/tool-turn-types.ts` (`OpenAiFunctionToolDef` → types), `src/providers/__tests__/openai-chat.test.ts` (types `OpenAiMessageParam`, `OpenAiTurnEvent`, `OpenAiToolCall`, `OpenAiContentPart` → `../openai-chat-types.js`). `azure-chat.ts`, `anthropic-messages.ts`, `google-messages.ts` unchanged (their names stay).
- **After:** `openai-chat.ts` ~455; `openai-chat-types.ts` ~78.
- **Risks / notes:** `export *` from both files must not produce duplicate names — none, since moved names leave `openai-chat.ts`. Do not leave a re-export in `openai-chat.ts`.
