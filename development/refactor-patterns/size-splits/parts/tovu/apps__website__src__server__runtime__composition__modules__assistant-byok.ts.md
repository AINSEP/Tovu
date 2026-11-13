### tovu:apps/website/src/server/runtime/composition/modules/assistant-byok.ts
- **Over:** `createAssistantByokModule` 231 (file 498 — at the limit, so helpers need room: see split 1)
- **Phase:** now (label ?) · **Batch:** size-01
- **Tests:** `apps/website/src/server/runtime/composition/modules/__tests__/assistant-byok.history-and-surfaces.unit.test.ts`, `.../assistant-byok.inputs-pin.test.ts`, `.../assistant-byok.error-report.test.ts`, `.../assistant-byok.tool-access-lowering.integration.test.ts`, `.../assistant-byok.ai-generations.test.ts`, `apps/website/src/assistant/__tests__/credential-noise.unit.test.ts`, `apps/website/src/server/runtime/composition/__tests__/site-guide-tools.test.ts`. No test mocks this module.
- **Responsibility map:**

| unit | declarations / statements | job |
|---|---|---|
| A history | `MAX_HISTORY_MESSAGES`, `isPlainMessage`, `readByokHistoryMessage`, `lastUserMessageIndex`, `toByokChatMessage`, `resolveMessages` | validate + bound the client-supplied chat history |
| B guidance | nested `loadPinnedPluginGuidance`, `appendAutomaticPluginGuidance`, `preparePluginGuidance` | pinned + automatic plugin guidance for a turn |
| C turn | nested `handleTurn` | one BYOK turn: gates, stream, provider loop |
| D lowering | nested `lowerLocal` | abort live tool runs when access is lowered |
| E (stays) | constants, SSE/trace/outcome helpers, `resolveTurnInputsOrRespond`, `attachTurnMessagesOrRespond`, `createAssistantByokModule` composition | build the BYOK module |

- **Splits:**
  1. NEW `assistant-byok-history.ts` (same folder) — job: client history validation/bounding. Moves unit A word for word (the `MAX_HISTORY_MESSAGES` comment about `assistant-transport.ts` moves). Exports `resolveMessages` (+ `MAX_HISTORY_MESSAGES` only if something else in the original still reads it — the outline says only `resolveMessages` does). Imports nothing from the original. Original imports `resolveMessages` back (used by `resolveTurnInputsOrRespond`).
  2. HELPERS in `assistant-byok.ts`, module level directly above `createAssistantByokModule`, in run order:
     - `lowerLocalToolAccess({ change, liveToolRuns }: LowerLocalToolAccessInput): Promise<void>` ← `lowerLocal` body; caller passes `lowerLocal: (change) => lowerLocalToolAccess({ change, liveToolRuns })` where it was used.
     - `loadPinnedPluginGuidance({ pinned, routeDeps }: LoadPinnedPluginGuidanceInput)`, `appendAutomaticPluginGuidance({ run, principal, conversationId, pluginBody, …existing fields, automaticPluginRuns }: AppendAutomaticPluginGuidanceInput)`, `preparePluginGuidance({ req, res, run, principal, messages, abort, system, routeDeps, automaticPluginRuns }: PreparePluginGuidanceInput)` ← unit B (same return types as today; copy them).
     - `handleByokTurn({ req, res, credentialPort, routeDeps, toolSurface, liveToolRuns, automaticPluginRuns }: HandleByokTurnInput): Promise<void>` ← `handleTurn` body; its `preparePluginGuidance(...)` call gains `routeDeps, automaticPluginRuns`. In the module keep `const handleTurn = (req: Request, res: Response) => handleByokTurn({ req, res, credentialPort, routeDeps, toolSurface: resolvedToolSurface, liveToolRuns, automaticPluginRuns });` — `automaticPluginRuns` is a `let` assigned before routes register, read per request as today.
  All long comments inside `handleTurn` (the `ready` paragraph etc.) move with it.
- **Importers to update:** `resolveMessages` → `assistant-byok-history.js` in `apps/website/src/assistant/__tests__/credential-noise.unit.test.ts` and `apps/website/src/server/runtime/composition/modules/__tests__/assistant-byok.history-and-surfaces.unit.test.ts` (that one keeps `toWireSurfacePayload` from `../assistant-byok.js`).
- **After:** `assistant-byok.ts` ~485; `createAssistantByokModule` ~95; `handleByokTurn` ~88; `assistant-byok-history.ts` ~50.
- **Risks / notes:** the file must end ≤500 — if the helper Input interfaces push it over, inline the input types as `{ … }` literals instead of named interfaces. `automaticPluginRuns`/`serverFederation` are `let`s assigned after the surface is built: pass them at call time inside closures, never capture them at module-build time.
