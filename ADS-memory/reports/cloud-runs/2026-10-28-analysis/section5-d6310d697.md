## §5 Review of Jini `d6310d697` ("WIP for cloud check — unreviewed Codex")

Scope: 13 files, +265/−21 (chat ask-choice replay; cms plugin-export URL strictness). Reviewed against current Jini HEAD
`f68294e6` (follow-ups `2417bbc5`, `866c4f95` have already landed on top: URL_ATTRIBUTES trimmed back to
`href/src/action`; `SurfaceCardContent` split into `answeredSurface`). Findings below are those still true at HEAD. Report only.

### Risky / likely bugs
1. **PLAUSIBLE — outcome/confirmation resources that re-emit under the same `ui://` URI get hidden as "answered".**
   `packages/chat/src/react/hooks/useAnsweredCards.ts` `recordedCardAnswers` (~l.31-49) keys receipts by `surfaceUri` = resource URI.
   `packages/ui/src/features/mcp-ui/surfaces/outcome.ts:22,159` documents re-emitting the outcome "under the SAME `ui://` URI the confirmation used".
   Any surface whose URI is reused (outcome after confirmation, retry of the same entity+version — `form.ts:417` says URIs are keyed by entity/version, not per-instance)
   will match an earlier receipt and render as a closed "Answered" card; `run-activity.ts` `hasSurfaceReceipt` (~l.146) likewise suppresses
   "awaiting-answer" for the second question. The only producer in the monorepos (Tovu `apps/website/src/assistant/ask-choice-tool.ts:199`)
   makes URIs unique with `Date.now()`, so it is safe today only by producer convention — nothing in Jini enforces/documents that
   `surfaceUri` must be instance-unique. Two questions for the same principal within one ms would also collide. Needs a test with a re-emitted URI.
2. **`answeredSurfaces` is computed over ALL events including receipts from earlier turns** (`run-activity.ts:~290-296`, `deriveRunActivity`):
   any receipt anywhere closes every card with that URI, with no ordering check (receipt index must be > card index). Same root cause as #1.
3. **`surfaceQuestionInput` now lets producer `_meta` override the real tool-call `input`** (`mcp-ui-question-input.ts:~36-42`):
   `hasQuestionOptions({input: context})` is tested BEFORE `input`, so a resource's metadata silently replaces the model's actual question
   in transcript labels / answer text. The meta is untrusted-ish display data from the resource; only a shape check (`hasQuestionOptions`) guards it.
   Display-only, but the answer text recorded to history is derived from it (`surfaceAnswerLabel`).
4. **`surfaceQuestionTitle` falls back to `resource.resource.uri`** (`McpUiSurfaceCard.tsx` ~l.175-180) — the doc comment says it keeps
   "opaque resource identity out of the accessible title" but the fallback returns exactly that URI when there is no title. It also runs
   `surfaceQuestionInput` → `DOMParser` parse of the whole HTML (`markupQuestion`) on every render of every card (no `useMemo`), O(html) per render.
5. **`pendingQuestionIndex` reset is over-broad** (`run-activity.ts:~172-181`): ANY `tool_use`/`tool_result` clears the waiting state, including the
   `tool_result` of the ask tool itself if it returns before the user answers, and unrelated parallel tool results while a question is genuinely pending.
   Result: "waiting for you" status flickers off while the card is still unanswered. Not covered by a test (test only covers receipt-closes-card).
6. **cms `plugin-export.ts` is now a behavioural break shipped as a `patch` changeset** (`.changeset/cms-plugin-export-static-urls.md`):
   any existing template with a literal `href="/pricing"`, `href="#top"`, `action="/x"` or `mailto:` now throws and the embed silently falls back
   (`resolvePluginExportEmbeds` swallows every error, l.~140, with no diagnostics hook invoked). Should be minor/major and the swallow should log.
7. **`HOST_URL_SLOT` says "hostLinks or assets" but matches ANY `host.<name>`** (`plugin-export.ts:~46`): `{{host.anything}}` passes the shape check;
   only `assertLocalUrl` (starts with `/`) stops a non-link host value. Error text overstates the guarantee, and `host.hostLinks.<x>` (dotted) does NOT match the regex,
   so a template using the nested `hostLinks` form is refused though the message names it as the allowed form — verify what `host` actually contains.

### Dead / unverified code
8. `AcceptedChatInput.surfaceUri` / `answerText` have no producer inside Jini (grep: only readers in `useAnsweredCards.ts`, `run-activity.ts`); the sole writer is Tovu's ask-choice tool. No Jini-side contract test pins the producer shape.
9. `SURFACE_QUESTION_META_KEY` is exported from `question-answer.ts` and `core/index.ts` via `export *` — widens the public API of `@jini-ai/chat/core` (consumed by Tovu `ask-choice-tool.ts:3` and an admin test).
10. Style: unused `_options = {}` params on new helpers (`hasSurfaceReceipt`, `idleSignal`, `surfaceQuestionTitle`) follow repo convention but are noise; `hasSurfaceReceipt`'s doc says "O(1)" while `answeredSurfaces` building is O(e) per `deriveRunActivity` call (re-scans all events on every call).

### Tests added by the commit
`run-activity.test.ts` (+31), `surface-question-replay.test.tsx` (+87), `plugin-export.unit.test.ts` (+43). None exercises: URI reuse (#1/#2), meta-vs-input precedence (#3), ask-tool tool_result while pending (#5).
