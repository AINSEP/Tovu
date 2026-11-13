# Terra job dedupe-07: Jini agent-runtime + integrations

READY (2026-11-13; revised after review d3r: J25 shared signatures get the defaulted options object; size rule). Self-contained. Background and the reason for every decision: `development/refactor-patterns/dedupe/PLAN.md` (Tovu repo). Repo: the Jini clone you are given (Jini only; paths below are relative to the Jini repo root).

## Rules for every group in this job (read before editing)
- HARD: stop before ~250k tokens of context. If you get close: commit what is done (by explicit paths), list the groups you did not finish under "REMAINING" in your report, and stop.
- Do exactly the recipe. If a recipe's "before" text is not in the file (code moved or changed), search the same file for the same code by content; if it is gone or differs in behavior, SKIP that group and report it as `STALE <id>: <what you saw>`. Never improvise a different design.
- No `eslint-disable`, no `as any`, no non-null `!`, no `@ts-ignore`.
- Signatures: every function this job creates or gives a new shared home takes `(required: {...}, optional: {...} = {})`; with nothing optional write `_optional: Record<string, never> = {}`, with nothing required `_required: Record<string, never> = {}`. A defaulted trailing object never breaks an existing caller. Where an existing exported name has a different shape and callers exist, keep that name as a one-line adapter over the new function. Only three shapes are exempt: React components (one props object), callbacks whose shape a library fixes (e.g. DataTable compare `(a, b)`), and the positional type guards owner decision O2 covers. Each recipe that uses an exemption names it.
- Size: every function you create, move or merge is at most 50 lines, with cyclomatic AND cognitive complexity at most 10 (at most 9/9 under Tovu `apps/admin`). A recipe that moves code says how to split it when needed. If a body you move is still over a limit, split it only by pure extract-function: the same statements in the same order, locals passed in one object, and each comment moving with its lines. If that cannot be done without changing behavior, SKIP the group and report `OVER-LIMIT <id>: <function> <lines>/<complexity>`.
- "Why" comments are never deleted: when code moves, its comment moves with it to the survivor; when two copies carry different why-comments, the survivor keeps both.
- Do not change response text, status codes, error messages, defaults or ordering unless the recipe says so. Where a recipe says "behavior differs", write the failing test first (run it, see it RED), then make the change, then see it GREEN.
- Plugins never import each other (`packages/agent-plugins/src/<id>/`, `content/agent-plugins/<id>/`); no new package; a shared helper goes only where the recipe says.
- Tests: run ONLY the single files the recipe lists (and any test file you edit), one at a time. No suites, no full `tsc`, no watch modes; vitest always `--maxWorkers=2`; Tovu node tests always `--test-concurrency=1`. Leave no process running. Jini: after editing a package, type-check that package only, no emit (`cd packages/<pkg> && npx tsc --noEmit -p tsconfig.json`), and do NOT rebuild/publish it.
- Tovu single-file test command: `TSX_TSCONFIG_PATH=apps/site-chat/tsconfig.json node --import tsx --import ./development/test-support/composed-bundle-env.ts --test --test-concurrency=1 --experimental-test-module-mocks <file>`.
- Commit once per group (or once per job if the groups are tiny), by explicit paths: `git add -- <paths> && git commit -F msg -- <paths>`. Never `git add -A`, never stash/checkout/reset, never push.
- Report: per group `DONE | STALE | SKIPPED` + lines removed (from `git diff --stat`), tests run with pass/fail counts, anything that looked like a bug (do not fix bugs that are not in the recipe; list them).

## Groups in this job (decision, risk, expected saving, divergence, tests)
- **J10** EXTRACT SHARED HELPER — risk L; est. −25 lines; divergence: YES, kept: OpenAI/Azure path sets isError also when content starts with TOOL_ERROR_PREFIX (foldToolError) -> errorFromContentPrefix:true only there; maxTokens option shapes stay at call sites
  - tests: cd packages/agent-runtime && npx vitest run --maxWorkers=2 src/providers/__tests__/tool-turn.test.ts src/providers/__tests__/tool-turn-images.test.ts
- **J11** MERGE INTO EXISTING — risk L; est. −40 lines; divergence: none (PiModelOption {id,label} becomes alias of RuntimeModelOption)
  - tests: cd packages/agent-runtime && npx vitest run --maxWorkers=2 src/agent-protocol/pi-rpc/__tests__/models.test.ts src/agent-protocol/pi-rpc/__tests__/index.test.ts
- **J14** EXTRACT SHARED HELPER — risk L; est. −22 lines; divergence: none for the 3; ollama-chat.ts:255 differs (error is a string, no trim) -> stays
  - tests: cd packages/agent-runtime && npx vitest run --maxWorkers=2 src/providers/__tests__/anthropic-messages.test.ts src/providers/__tests__/openai-chat.test.ts src/providers/__tests__/google-messages.test.ts
- **J15** EXTRACT SHARED HELPER — risk L; est. −28 lines; divergence: none
  - tests: cd packages/agent-runtime && npx vitest run --maxWorkers=2 src/providers/__tests__/anthropic-messages.test.ts src/providers/__tests__/openai-chat.test.ts src/providers/__tests__/ollama-chat.test.ts src/providers/__tests__/google-messages.test.ts
- **J16** EXTRACT SHARED HELPER — risk L; est. −8 lines; divergence: none
  - tests: cd packages/agent-runtime && npx vitest run --maxWorkers=2 src/providers/__tests__/anthropic-messages.test.ts src/providers/__tests__/openai-chat.test.ts
- **J19** EXTRACT SHARED HELPER — risk L; est. −14 lines; divergence: none
  - tests: cd packages/agent-runtime && npx vitest run --maxWorkers=2 src/__tests__/mmd-routes.test.ts
- **J21** EXTRACT SHARED HELPER — risk L; est. −65 lines; divergence: none (all pass timeoutMs 15_000 + DEFAULT_MODEL_OPTION; args differ per CLI and stay at call sites)
  - tests: cd packages/agent-runtime && npx vitest run --maxWorkers=2 src/defs/__tests__/acp-defs.test.ts
- **J25** MERGE INTO EXISTING (Phase A here; Phase B after gate H3) — risk M; est. −110 lines; divergence: YES: image-part pick uses || (agent-runtime) vs ?? (integrations); survivor keeps || (falls through an empty inlineData to inline_data). Header builder identical
  - tests: cd packages/integrations && npx vitest run --maxWorkers=2 src/media-providers/dispatch/providers/__tests__/aihubmix.test.ts ; cd packages/agent-runtime && npx vitest run --maxWorkers=2 src/providers/__tests__/aihubmix.test.ts src/providers/__tests__/model-catalog.test.ts
- **J30** EXTRACT SHARED HELPER — risk L; est. −60 lines; divergence: none if applied only where headers are exactly {authorization: Bearer apiKey, content-type: application/json}
  - tests: cd packages/integrations && npx vitest run --maxWorkers=2 src/media-providers/dispatch/__tests__/openai-compatible.test.ts src/media-providers/dispatch/providers/__tests__
- **J38** EXTRACT SHARED HELPER — risk L; est. −22 lines; divergence: none (identical messages)
  - tests: cd packages/integrations && npx vitest run --maxWorkers=2 src/webhooks
- **J58** EXTRACT SHARED HELPER — risk L; est. −12 lines; divergence: none. #323 KEEP (networkErrorToKind code lists differ)
  - tests: cd packages/agent-runtime && npx vitest run --maxWorkers=2 src/providers/__tests__/connection-test.test.ts src/providers/__tests__/model-catalog.test.ts

## Recipes (exact before → after)

## J10 tool-turn event forwarder (EXTRACT, local)
In tool-turn.ts add:
```ts
type AdapterLoopEvent = Parameters<Parameters<ProviderTurnAdapters['anthropic']>[0]['onEvent']>[0]
  | Parameters<Parameters<ProviderTurnAdapters['openai']>[0]['onEvent']>[0]
  | Parameters<Parameters<ProviderTurnAdapters['google']>[0]['onEvent']>[0];
/** Projects one adapter loop event onto the turn's public events, remembering the adapter's end reason (it wins over a raw provider stop code). */
function forwardAdapterEvents({ input, projection }: { input: InternalTurnInput; projection: ReturnType<typeof createToolProjection> }, { errorFromContentPrefix = false }: { errorFromContentPrefix?: boolean } = {}) {
  let endReason: string | null = null;
  const onEvent = (event: AdapterLoopEvent): void => {
    if (event.type === 'fabricated_role_marker') return;
    if (event.type === 'end') endReason = event.reason;
    if (event.type === 'tool_result') {
      const content = describeToolResultContent(event.content);
      input.onEvent({ type: 'tool_result', toolUseId: event.toolUseId, content, isError: event.isError || (errorFromContentPrefix && content.startsWith(TOOL_ERROR_PREFIX.trimEnd())) });
      return;
    }
    projection.onEvent(event as ProviderTurnEvent);
  };
  return { onEvent, endReason: () => endReason };
}
```
In runAnthropicTurn/runGoogleTurn: `const forward = forwardAdapterEvents({ input, projection });`, pass `onEvent: forward.onEvent`, return `normalizeTurnResult(result, forward.endReason())`, delete `capturedEndReason`. runOpenAiCompatibleTurn: same with `{ errorFromContentPrefix: true }`. Keep the existing `event as ProviderTurnEvent` cast only if it already compiles there (it does today).

## J11 pi models (MERGE)
packages/agent-runtime/src/agent-protocol/pi-rpc/models.ts -> keep the module doc + the parsePiModels JSDoc text (move the JSDoc onto pi-models.ts#parsePiModels if richer), body becomes:
```ts
import type { RuntimeModelOption } from '../../types.js';
/** A single model entry for the daemon's model-picker: an opaque id and a display label. */
export type PiModelOption = RuntimeModelOption;
export { parsePiModels } from '../../pi-models.js';
```

## J14/J15/J16 provider helpers (EXTRACT, agent-runtime/providers)
- response-text.ts: add `export function extractProviderErrorDetail({ rawText }: { rawText: string }, _optional: Record<string, never> = {}): string` with anthropic's body (inline `typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)` checks or import the package's existing isRecord; keep the "Non-JSON error body" comment). anthropic: `export const extractAnthropicErrorDetail = extractProviderErrorDetail;` openai: `export const extractOpenAiErrorDetail = extractProviderErrorDetail;` google: delete extractGoogleErrorDetail, call `extractProviderErrorDetail({ rawText })`. Ollama unchanged.
- role-marker-guard.ts: add `export function emitGuardedTextDelta({ state, text, onEvent }: { state: { guard: ReturnType<typeof createRoleMarkerGuard>; fullText: string }; text: string; onEvent: (event: { type: 'text_delta'; delta: string } | RoleMarkerWarningEvent) => void }, _optional: Record<string, never> = {}): 'continue' | 'break'` with the shared 9-line body. Replace the bodies of handleOpenAiTextContentDelta, handleOllamaTextContent, handleGoogleTextPart with `return emitGuardedTextDelta({ state, text: content|text, onEvent });`; handleAnthropicTextDelta keeps its blockState lines + its "No guard.contaminated pre-check" comment, then the same return. If `warningEvent()`'s return type is not assignable, widen the onEvent param type to that return type.
- sse-decode.ts: add `export function parseSseJsonRecord({ raw }: { raw: string }, _optional: Record<string, never> = {}): Record<string, unknown> | null` (body of parseAnthropicSseData). anthropic/openai: `export const parseAnthropicSseData = parseSseJsonRecord;` / `export const parseOpenAiSseData = parseSseJsonRecord;`.

## J19 mmd routes file read (EXTRACT, local)
mmd-routes.ts: add `async function readMmdRoutesJson({ env }: { env: RuntimeEnv }, _optional: Record<string, never> = {}): Promise<{ raw: unknown } | null>` containing resolveMmdRoutesFile + readFile + JSON.parse with both `catch { return null; }`. Both callers: `const routes = await readMmdRoutesJson({ env }); if (!routes) return null;` then use `routes.raw`.

## J21 ACP model fetcher (EXTRACT, agent-runtime/defs)
defs/shared.ts:
```ts
/** The `fetchModels` every ACP def shares: probe the CLI's ACP session for models, default option first. */
export function acpModelFetcher({ args }: { args: readonly string[] }, { timeoutMs = 15_000 }: { timeoutMs?: number } = {}): NonNullable<RuntimeAgentDef['fetchModels']> {
  return async ({ resolvedBin, env }, { acpModelProbe } = {}) => detectAcpModels(
    { bin: resolvedBin, args: [...args] },
    { ...(acpModelProbe ? { probe: acpModelProbe } : {}), env, timeoutMs, defaultModelOption: DEFAULT_MODEL_OPTION },
  );
}
```
(import type RuntimeAgentDef from '../types.js'; check for an import cycle shared.ts<->types.ts: types are type-only, fine.) In auggie, cline, devin, goose, kilo, kimi, kiro, reasonix, trae-cli, vibe: `fetchModels: acpModelFetcher({ args: [<existing args>] }),`, drop `detectAcpModels` from their imports.

## J25 aihubmix (MERGE into integrations) — Phase A in this job, Phase B only after gate H3
Phase A (integrations only):
1. `packages/integrations/src/media-providers/dispatch/providers/aihubmix-shared.ts`: change the exported positional functions to EXACTLY these signatures: agent-runtime's current public ones (`packages/agent-runtime/src/providers/aihubmix.ts` at 48e6159a4) plus a defaulted trailing options object, `_optional: Record<string, never> = {}` (and `_required: Record<string, never> = {}` for the zero-argument `aihubmixAppCodeHeader`). The defaults keep every existing call compiling unchanged: agent-runtime's `aihubmixAppCodeHeader()` calls and its tests, and agent-runtime's own one-object callers. So agent-runtime's re-export in Phase B is source-compatible for its public consumers, and no legacy adapter is needed. Copy agent-runtime's bodies and JSDoc; `aihubmixHeaders` spreads `aihubmixAppCodeHeader()`; the Gemini image-part pick uses `||`. `AIHUBMIX_APP_CODE`, `AIHUBMIX_DEFAULT_BASE_URL`, `AIHubMixProtocol`, `AIHubMixGeminiImageRequest` stay as they are.
```ts
export function aihubmixHeaders({ apiKey }: { apiKey: string }, _optional: Record<string, never> = {}): Record<string, string>
export function aihubmixAppCodeHeader(_required: Record<string, never> = {}, _optional: Record<string, never> = {}): Record<string, string>
export function classifyAIHubMixModel({ model }: { model: string }, _optional: Record<string, never> = {}): AIHubMixProtocol
export function aihubmixOriginFromBase({ baseUrl }: { baseUrl: string }, _optional: Record<string, never> = {}): string
export function aihubmixGeminiImageUrl({ baseUrl, wireModel }: { baseUrl: string; wireModel: string }, _optional: Record<string, never> = {}): string
export async function aihubmixGeminiImageBytes({ req, doFetch }: { req: AIHubMixGeminiImageRequest; doFetch: (requiredArgs: { url: string; init: RequestInit }) => Promise<Response> }, _optional: Record<string, never> = {}): Promise<Buffer>
export function aihubmixWireModel({ catalogId }: { catalogId: string }, _optional: Record<string, never> = {}): string
```
   Keep this file's module doc (APP-Code paragraph, "Simplified from the origin", "Not ported"); add any sentence of agent-runtime's module doc about APP-Code that it lacks. Update the only callers: `providers/aihubmix.ts` (import at ~line 63; switch each call to the object form) and `providers/__tests__/aihubmix-shared.test.ts`.
2. Narrow subpath (do NOT export these from the `./media-providers` barrel): create `packages/integrations/src/media-providers/aihubmix.ts` containing a one-line doc and `export * from './dispatch/providers/aihubmix-shared.js';`. In `packages/integrations/package.json` add, next to each `./media-providers/catalog` entry: `jini.entries["./media-providers/aihubmix"] = "node"`; `exports["./media-providers/aihubmix"] = { "types": "./dist/media-providers/aihubmix.d.ts", "import": "./dist/media-providers/aihubmix.js", "default": "./dist/media-providers/aihubmix.js" }`; `typesVersions["*"]["media-providers/aihubmix"] = ["./dist/media-providers/aihubmix.d.ts"]`. Why narrow: `aihubmix-shared.ts` has no imports, while the `./media-providers` barrel re-exports the SQLite task store, staging and dispatch; agent-runtime loads integrations lazily today (`model-discovery-adapters.ts:309-321`), so its provider path must not start loading that whole barrel.
3. Type-check integrations only; run its aihubmix tests. Commit. Report `J25 PHASE A DONE (needs H3)`. Stop J25 here.

Phase B (run ONLY when the dispatch says "H3 done: @jini-ai/integrations built"):
4. `packages/agent-runtime/src/providers/aihubmix.ts`: delete `AIHUBMIX_APP_CODE` … `aihubmixWireModel` (lines ~30-192) and put in their place:
```ts
import { aihubmixOriginFromBase } from '@jini-ai/integrations/media-providers/aihubmix';
export { AIHUBMIX_APP_CODE, AIHUBMIX_DEFAULT_BASE_URL, aihubmixHeaders, aihubmixAppCodeHeader, classifyAIHubMixModel, aihubmixOriginFromBase, aihubmixGeminiImageUrl, aihubmixGeminiImageBytes, aihubmixWireModel, type AIHubMixProtocol, type AIHubMixGeminiImageRequest } from '@jini-ai/integrations/media-providers/aihubmix';
```
   The `import` line is required: `aihubmixCatalogUrl` (kept, ~line 226) calls `aihubmixOriginFromBase`, and `export … from` creates no local binding. At 48e6159a4 that is the only deleted name used below line 192 (checked); if `rg -n "aihubmixHeaders|aihubmixAppCodeHeader|classifyAIHubMixModel|aihubmixGeminiImageUrl|aihubmixGeminiImageBytes|aihubmixWireModel|AIHUBMIX_APP_CODE|AIHUBMIX_DEFAULT_BASE_URL" packages/agent-runtime/src/providers/aihubmix.ts` shows another use after your edit, add that name to the `import` line too. Keep the module doc and everything from `AIHUBMIX_VIDEO_SECONDS` on.
5. `cd packages/agent-runtime && npx tsc --noEmit -p tsconfig.json`, then its two aihubmix tests. Commit.

## J30 JSON POST init (EXTRACT, integrations)
openai-compatible.ts next to withRequestInit:
```ts
/** `withRequestInit` for the common JSON POST: bearer auth when `apiKey` is given, JSON content type, serialized `body`. */
export function jsonPostInit({ ctx, body }: { ctx: Pick<RenderContext, 'requestInit'>; body: unknown }, { apiKey, headers = {} }: { apiKey?: string; headers?: Readonly<Record<string, string>> } = {}): RequestInit {
  return withRequestInit(ctx, { method: 'POST', headers: { ...(apiKey === undefined ? {} : { authorization: `Bearer ${apiKey}` }), 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
}
```
Replace only `init: withRequestInit(ctx, { method: 'POST', headers: { authorization: \`Bearer ${apiKey}\`, 'content-type': 'application/json' }, body: JSON.stringify(body) })` exactly (grep that shape) with `init: jsonPostInit({ ctx, body }, { apiKey })`.

## J38 webhooks subscriptions (EXTRACT, local)
subscriptions.ts, add two file-private helpers:
```ts
async function validateSubscriptionFields(
  { deps, input }: { deps: WebhookSubscriptionDeps; input: { label: string; targetUrl: string; topics: readonly WebhookTopic[] } },
  _optional: Record<string, never> = {},
): Promise<{ label: string; targetUrl: Awaited<ReturnType<typeof validateTargetUrl>>; topics: ReturnType<typeof normalizeTopics> }> {
  const label = input.label.trim();
  if (!label) throw new WebhookSubscriptionValidationError({ message: "label is required" });
  const targetUrl = await validateTargetUrl({ targetUrl: input.targetUrl, isAllowedTarget: deps.isAllowedTarget });
  const topics = normalizeTopics(input.topics);
  if (topics.length === 0) throw new WebhookSubscriptionValidationError({ message: "at least one topic is required" });
  return { label, targetUrl, topics };
}
async function requireSubscription({ deps, workspaceId, id }: { deps: WebhookSubscriptionDeps; workspaceId: UUID; id: UUID }, _optional: Record<string, never> = {}): Promise<WebhookSubscriptionRecord> {
  const existing = await deps.repo.findById({ workspaceId, id });
  if (!existing) throw new WebhookSubscriptionNotFoundError({ message: `webhook subscription '${id}' was not found` });
  return existing;
}
```
createSubscription and updateSubscription use `const { label, targetUrl, topics } = await validateSubscriptionFields({ deps, input });`. update/pause/delete use `const existing = await requireSubscription({ deps, workspaceId: input.workspaceId, id: input.id });`. The disabled checks and their why-comments stay where they are.

## J58 provider URL/abort helpers (EXTRACT, agent-runtime)
New `providers/provider-url.ts` with `appendVersionedApiPath({ baseUrl, suffix })` (the body of the connection-test copy) and `linkedTimeoutController({ timeoutMs }, { signal })`. The latter returns `{ controller, dispose }`; dispose does clearTimeout plus `signal?.removeEventListener('abort', abortFromParent)`. First read both callers' `finally` blocks and copy their exact cleanup. Callers: `const { controller, dispose } = linkedTimeoutController({ timeoutMs: input.timeoutMs ?? CONNECTION_TEST_TIMEOUT_MS }, { signal: input.signal });` and the model-catalog equivalent with PROVIDER_MODELS_TIMEOUT_MS. KEEP model-catalog's coverage-artifact comment block where it is.
