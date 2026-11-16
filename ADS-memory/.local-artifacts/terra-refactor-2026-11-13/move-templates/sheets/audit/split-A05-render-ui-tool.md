# SP-audit-A05-1: one-shot A2UI render with renderer-refusal grace -> `@jini-ai/agentic/core` (template T-SPLIT)

Source: AUDIT-ADDITIONS `audit:A05` (ACCEPT, startable now). Written 2026-11-16 from Tovu `refactor/terra` b28d38c6 / Jini `refactor/terra` b7666092.
untangle_overlap: YES -> **execute after wave B merge (needs C10 + C2 landed)**. `C10.repoint.tsv:138` repoints `render-ui-tool.ts` line 2 (`@jini-ai/agentic/a2ui` -> `@jini-ai/protocol/a2ui`), `C10.repoint.tsv:119` and `C11.repoint.tsv:65` repoint `__tests__/render-ui-tool.test.ts` (not edited here). C10 deletes agentic's `./a2ui` subpath and moves the A2UI wire to `@jini-ai/protocol/a2ui`; C2 and C10 both edit `packages/agentic/src/core/index.ts`. So every guard below is a POST-WAVE text/derived guard, never a today-blob.
paths: TOVU_CLONE=/Users/la/Programming/tovu-codex-trial-terra  JINI_CLONE=/Users/la/Programming/jini-terra-base  BRANCH=refactor/terra (after the wave B merge)
Order: J (one commit) -> T (one commit). Tier: Sonnet 5.5 high. est. executor tokens: ~40k.

## Design decisions made here (executor makes none)
- Target: the md's "`agentic/a2ui`" no longer exists after C10 (wire -> protocol, agentic's `./a2ui` subpath deleted). A tool HANDLER is not wire vocabulary, so it does not go to protocol. It goes to a NEW leaf `packages/agentic/src/core/render-surface.ts`, exported from the existing `@jini-ai/agentic/core` (universal) index. Imports: `@jini-ai/core` (types) and `@jini-ai/protocol/a2ui` only (COMMON rule 5 (c)).
- Jini exports one function `renderA2uiSurface(required, optional = {})` returning a typed outcome; it carries no tool id default, no permission, no model-facing notes. The host passes its tool id (used as the exchange binding's `toolId`) and maps each outcome to its own model-facing result + notes.
- The 4000 ms grace default moves with its why-comment (generic UX tradeoff; this is new Jini API, so no existing caller changes). The `"The browser rejected this surface."` fallback detail is generic and moves.
- `setTimeout` stays (universal; not a Node built-in). The losing timer of the race is not cleared today; the move keeps that (pure move).
- Tovu keeps: `RENDER_UI_TOOL_ID`, the catalog entry (description, permission `admin.assistant.use`, input schema), `renderUiDerivedRisk`, `buildRenderUiRegistrations` (same signature and test seam `rejectionGraceMs`), the three result notes, the no-surface-channel result. Every Tovu test stays byte-identical and keeps passing through `buildRenderUiRegistrations`.

## Guards (post-wave B)
Jini: `packages/protocol/src/a2ui/index.ts` exists and `rg -n "createLabCatalog|parseAgentToRendererMessage|A2UI_DISPLAY_ONLY_PROPERTY|AgentToRendererMessage" packages/protocol/src/a2ui` prints at least one declaration for each of the 4 names (else STOP: C10 not landed). `packages/agentic/src/core/render-surface.ts` and `packages/agentic/src/core/__tests__/render-surface.test.ts` absent; `rg -n "renderA2uiSurface" packages` prints nothing. `packages/agentic/src/core/index.ts` contains the exact line `export * from './page-publication.js';` exactly once.
Tovu: derived blob guard (C10 only changed one specifier): `sed 's#@jini-ai/protocol/a2ui#@jini-ai/agentic/a2ui#' apps/website/src/assistant/render-ui-tool.ts | git hash-object --stdin` must print `9895432be95a7698590e62e5f1ceb0218d0b947d`. If it does not, SKIP (the file changed beyond the C10 repoint).

## split (`apps/website/src/assistant/render-ui-tool.ts`, every top-level declaration)
  - RENDER_UI_TOOL_ID (23), renderUiAgentToolCatalog (25), renderUiDerivedRisk (56), CATALOG_BY_ID (58) | STAY-PRODUCT
  - RENDER_REJECTION_GRACE_MS (73) | MOVE -> `DEFAULT_RENDER_REJECTION_GRACE_MS` (comment reworded neutral)
  - receiveRejectionWithGrace (78), rejectionMessageOf (85) | MOVE verbatim (comment reworded neutral)
  - buildRenderUiRegistrations (93) | SPLIT: catalog/exchange/emit/create/update/grace -> `renderA2uiSurface`; handler shell, notes, registration STAY
ports: none beyond values: `exchanges: SurfaceExchangeStore`, `emitSurface: SurfaceEmitter`, `toolId`, `principalId`, `components` (all core types or plain values).

## J. Jini (commit 1)

### J1. NEW `packages/agentic/src/core/render-surface.ts` (exact content)
```ts
/**
 * @file Draw one arbitrary A2UI component tree on a live surface channel, once, with no scripted
 * follow-up, and report whether the renderer refused it. The caller passes a flat `components` array
 * (`{id, component, ...props}`, children referenced by id, exactly one `root`) learned from its own
 * component search/describe tools. The host owns the tool id, permission and model-facing notes.
 */
import type { SurfaceEmitter, SurfaceExchange, SurfaceExchangeStore, SurfaceMessage } from '@jini-ai/core';
import { A2UI_DISPLAY_ONLY_PROPERTY, createLabCatalog, parseAgentToRendererMessage, type AgentToRendererMessage } from '@jini-ai/protocol/a2ui';

/**
 * How long to wait, after sending a surface's components, for the renderer to report it rejected them
 * before giving up waiting and assuming the render succeeded.
 *
 * There is no success acknowledgment on this channel: only a renderer relaying a catalog-validation
 * refusal (through the same action pipe a button click uses) ever sends anything back. So
 * `exchange.receive()` alone would hang for the full idle TTL on every successful render. Racing it
 * against a short timer turns "wait forever for a message that isn't coming" into "wait a bit, then
 * assume the silence means it worked": long enough for a same-origin round trip (interpreter
 * validation is synchronous; the only latency is the relay POST), short enough not to stall the
 * model on every ordinary, successful draw.
 */
export const DEFAULT_RENDER_REJECTION_GRACE_MS = 4000;

export type RenderA2uiSurfaceOutcome =
  | { readonly rendered: true }
  | { readonly rendered: false; readonly reason: 'schema-rejected' | 'rejected-by-renderer'; readonly detail: string };

/** Resolves with the next inbound message, or `null` if none arrives within `graceMs`. The loser of the
 * race is not cancelled: the caller's `exchange.close()` resolves any still-pending `receive()` with
 * `{status: "abandoned"}` moments later, which nothing here reads. */
function receiveRejectionWithGrace({ exchange, graceMs }: { exchange: SurfaceExchange; graceMs: number }, _optional = {}): Promise<SurfaceMessage | null> {
  return Promise.race([exchange.receive({}), new Promise<null>((resolve) => setTimeout(() => resolve(null), graceMs))]);
}

/** `ack.params.message` is the renderer's relayed `RendererToAgentMessage`. Only its `error` shape means
 * "refused"; an `action`/`functionResponse` can never mean refusal here (this renders once and never
 * asks a question a click would answer). */
function rejectionMessageOf({ ack }: { ack: SurfaceMessage | null }, _optional = {}): string | undefined {
  if (ack?.status !== 'received') return undefined;
  const inbound = ack.params['message'];
  if (typeof inbound !== 'object' || inbound === null || !('error' in inbound)) return undefined;
  const error = (inbound as { error?: { message?: unknown } }).error;
  return typeof error?.message === 'string' ? error.message : 'The browser rejected this surface.';
}

/**
 * Opens one exchange bound to `toolId`/`principalId` on the `a2ui` channel, creates a display-only
 * surface, sends `components`, then waits up to the grace period for a renderer refusal. Always closes
 * the exchange.
 * @complexity O(components) validation; one exchange and one timer per call.
 */
export async function renderA2uiSurface(
  { exchanges, emitSurface, toolId, principalId, components }: {
    exchanges: SurfaceExchangeStore; emitSurface: SurfaceEmitter; toolId: string; principalId: string; components: unknown[];
  },
  { rejectionGraceMs = DEFAULT_RENDER_REJECTION_GRACE_MS }: { rejectionGraceMs?: number } = {},
): Promise<RenderA2uiSurfaceOutcome> {
  const catalog = createLabCatalog({});
  const exchange = exchanges.open({ binding: { toolId, principalId, channel: 'a2ui' }, emit: emitSurface });
  const surfaceId = exchange.id;

  const emitA2ui = async (message: AgentToRendererMessage): Promise<{ ok: true } | { ok: false; reason: string }> => {
    const validated = parseAgentToRendererMessage({ raw: message });
    if (!validated.ok) return { ok: false, reason: validated.message };
    await emitSurface({ channel: 'a2ui', payload: { message: validated.message } });
    return { ok: true };
  };

  try {
    // Display-only: this draws and asks nothing, so a chat must not read the surface as a question
    // while the call waits out its refusal grace period. `surfaceProperties` is an open record;
    // renderers ignore it.
    const created = await emitA2ui({
      version: 'v1.0',
      createSurface: { surfaceId, catalogId: catalog.catalogId, surfaceProperties: { [A2UI_DISPLAY_ONLY_PROPERTY]: true }, dataModel: {} },
    });
    if (!created.ok) return { rendered: false, reason: 'schema-rejected', detail: created.reason };

    const updated = await emitA2ui({ version: 'v1.0', updateComponents: { surfaceId, components: components as never } });
    if (!updated.ok) return { rendered: false, reason: 'schema-rejected', detail: updated.reason };

    const rejection = rejectionMessageOf({ ack: await receiveRejectionWithGrace({ exchange, graceMs: rejectionGraceMs }) });
    return rejection ? { rendered: false, reason: 'rejected-by-renderer', detail: rejection } : { rendered: true };
  } finally {
    exchange.close({});
  }
}
```
(If `SurfaceEmitter`, `SurfaceExchange`, `SurfaceExchangeStore` or `SurfaceMessage` is not exported from the `@jini-ai/core` root: STOP.)

### J2. `packages/agentic/src/core/index.ts`: after the exact line `export * from './page-publication.js';` insert
```ts
export * from './render-surface.js';
```

### J3. NEW `packages/agentic/src/core/__tests__/render-surface.test.ts` (exact content)
```ts
import { describe, expect, test } from 'vitest';
import type { SurfaceEmission, SurfaceExchangeStore } from '@jini-ai/core';
import { renderA2uiSurface } from '../render-surface.js';

/** Minimal exchange double: records emissions, answers `receive` with a scripted message or never. */
function exchangesWith(answer?: unknown): { exchanges: SurfaceExchangeStore; closed: () => number } {
  let closed = 0;
  const exchange = {
    id: 'surface-1',
    receive: () => answer === undefined ? new Promise(() => undefined) : Promise.resolve(answer),
    close: () => { closed += 1; },
  };
  return { exchanges: { open: () => exchange } as unknown as SurfaceExchangeStore, closed: () => closed };
}

const tree = [{ id: 'root', component: 'Text', text: 'hi' }];

describe('renderA2uiSurface', () => {
  test('silence within the grace period means rendered; the surface is display-only and the exchange closes', async () => {
    const emitted: SurfaceEmission[] = [];
    const { exchanges, closed } = exchangesWith();
    const outcome = await renderA2uiSurface({ exchanges, emitSurface: async (emission) => { emitted.push(emission); }, toolId: 't', principalId: 'p', components: tree }, { rejectionGraceMs: 5 });
    expect(outcome).toEqual({ rendered: true });
    expect(emitted).toHaveLength(2);
    expect(JSON.stringify(emitted[0])).toContain('createSurface');
    expect(closed()).toBe(1);
  });

  test('a relayed renderer error is reported with its message, or a generic detail', async () => {
    const withMessage = exchangesWith({ status: 'received', params: { message: { error: { message: 'missing prop' } } } });
    await expect(renderA2uiSurface({ exchanges: withMessage.exchanges, emitSurface: async () => undefined, toolId: 't', principalId: 'p', components: tree }))
      .resolves.toEqual({ rendered: false, reason: 'rejected-by-renderer', detail: 'missing prop' });
    const bare = exchangesWith({ status: 'received', params: { message: { error: {} } } });
    await expect(renderA2uiSurface({ exchanges: bare.exchanges, emitSurface: async () => undefined, toolId: 't', principalId: 'p', components: tree }))
      .resolves.toEqual({ rendered: false, reason: 'rejected-by-renderer', detail: 'The browser rejected this surface.' });
  });

  test('a non-error answer settles at once as rendered; a schema-invalid tree is schema-rejected and still closes', async () => {
    const action = exchangesWith({ status: 'received', params: { message: { action: {} } } });
    await expect(renderA2uiSurface({ exchanges: action.exchanges, emitSurface: async () => undefined, toolId: 't', principalId: 'p', components: tree }))
      .resolves.toEqual({ rendered: true });
    const empty = exchangesWith();
    const outcome = await renderA2uiSurface({ exchanges: empty.exchanges, emitSurface: async () => undefined, toolId: 't', principalId: 'p', components: [] }, { rejectionGraceMs: 5 });
    expect(outcome).toMatchObject({ rendered: false, reason: 'schema-rejected' });
    expect(empty.closed()).toBe(1);
  });
});
```
(The empty-array case mirrors the Tovu test "an input without components is treated as an empty list, which the A2UI schema refuses"; if it resolves `{ rendered: true }` the schema changed in C10: STOP.)

### J4. Changeset `.changeset/agentic-render-a2ui-surface.md`
```
---
"@jini-ai/agentic": minor
---

`@jini-ai/agentic/core` adds `renderA2uiSurface`: draw one A2UI component tree on a live surface channel as a display-only surface and report a renderer refusal relayed within a grace period (`DEFAULT_RENDER_REJECTION_GRACE_MS`), as a typed outcome.
```

### J5. Checks + commit
Rule checks (2: no `tovu|admin` text — note the Tovu comment's "admin" wording was removed; rule 5: only `@jini-ai/core`, `@jini-ai/protocol/a2ui`). eslint the 3 files. Commit: render-surface.ts, index.ts, the test, the changeset.
jini_msg: `feat(agentic): renderA2uiSurface one-shot draw with renderer-refusal grace` | body: "Moved from a host's render-UI tool. The host keeps its tool id, permission, catalog text and model-facing notes."

## T. Tovu (commit 2)

### T1. `apps/website/src/assistant/render-ui-tool.ts` (each OLD exactly once)
1. OLD `import { A2UI_DISPLAY_ONLY_PROPERTY, createLabCatalog, parseAgentToRendererMessage, type AgentToRendererMessage } from "@jini-ai/protocol/a2ui";` NEW `import { renderA2uiSurface } from "@jini-ai/agentic/core";`
2. OLD `import type { AssistantSurfaceDeps, SurfaceExchange, SurfaceMessage } from "@jini-ai/daemon/surface-exchanges";` NEW `import type { AssistantSurfaceDeps } from "@jini-ai/daemon/surface-exchanges";`
3. DELETE from the line `/**` that directly precedes ` * How long to wait, after sending a surface's components, for the browser to report it rejected` through the line `  return typeof error?.message === "string" ? error.message : "The browser rejected this surface.";` and the `}` after it (old lines 60-91), and insert in their place:
```ts
// The one-shot draw, display-only marking and renderer-refusal grace live in `@jini-ai/agentic/core`
// (`renderA2uiSurface`, default grace 4 s). The refusal relay is `A2uiSurfaceCard.tsx` posting to
// `a2ui-actions-route.ts`. Tovu keeps the tool id, permission, catalog text and model-facing notes.
```
4. In `buildRenderUiRegistrations`: OLD `  const rejectionGraceMs = options.rejectionGraceMs ?? RENDER_REJECTION_GRACE_MS;` NEW `  const graceOptions = options.rejectionGraceMs === undefined ? {} : { rejectionGraceMs: options.rejectionGraceMs };`
   and in the test-seam comment OLD `   * applies for real; a test that needs to prove the grace period itself elapses (rather than` stays; OLD `so \`RENDER_REJECTION_GRACE_MS\` always` -> NEW `so Jini's default grace always`.
5. Replace the handler body from the line `      const components = (ctx.input as { components?: unknown[] }).components ?? [];` through the line `        exchange.close({});` plus the two lines after it (`      }` closing finally) — i.e. old lines 108-152 — with:
```ts
      const components = (ctx.input as { components?: unknown[] }).components ?? [];
      const outcome = await renderA2uiSurface({ exchanges: surfaces.surfaceExchanges, emitSurface, toolId: RENDER_UI_TOOL_ID,
        principalId: ctx.principal.id, components }, graceOptions);
      if (outcome.rendered) {
        return {
          rendered: true,
          note:
            "The surface is now visible to the administrator: on this screen's canvas or in the chat, as the Current admin screen " +
            "block's 'Where drawings appear' line says (in the chat when there is no such line). Briefly describe what it shows and say where it is.",
        };
      }
      if (outcome.reason === "schema-rejected") return { rendered: false, reason: "schema-rejected", detail: outcome.detail };
      return {
        rendered: false,
        reason: "rejected-by-renderer",
        detail: outcome.detail,
        note: "The browser refused to render this — it was NOT drawn and is not visible anywhere. Fix the reported prop and try again; do not tell the user it rendered.",
      };
```
After T1, `rg -n "createLabCatalog|parseAgentToRendererMessage|A2UI_DISPLAY_ONLY_PROPERTY|receiveRejectionWithGrace|rejectionMessageOf|RENDER_REJECTION_GRACE_MS|exchange\." apps/website/src/assistant/render-ui-tool.ts` prints nothing. The handler returns objects byte-identical in shape and key order to today's (the Tovu tests assert them with deepEqual).

### T2. Census + checks + commit
Census: `rg -n "RENDER_REJECTION_GRACE_MS|receiveRejectionWithGrace|rejectionMessageOf" apps development --glob '!**/node_modules/**'` | allowed: `assistant/__tests__/render-ui-tool.test.ts` comment mentions of `RENDER_REJECTION_GRACE_MS` only (comment text, not an import: leave it). Any import hit: STOP.
tests_split: `assistant/__tests__/render-ui-tool.test.ts` (10 tests) stays byte-identical (C10 already repointed its import); `cross-site-read-catalog.test.ts`, `tool-registrations.contracts.test.ts` untouched.
eslint render-ui-tool.ts (`renderA2uiSurface` unresolved until D1 link: record). Commit: render-ui-tool.ts only.
tovu_msg: `refactor(assistant): render-UI tool draws through @jini-ai/agentic renderA2uiSurface` | body: "Tovu keeps the tool id, permission, catalog description, derived risk, the no-channel result and the model-facing notes."
extra_stops: the Tovu handler's `if (!emitSurface)` block changed shape -> STOP. A Tovu test fails to typecheck against the reduced file -> STOP.
Cloud run owes: Jini vitest `render-surface.test.ts`; agentic typecheck + subpath isolation (`./core` universal). Tovu: node:test `render-ui-tool.test.ts` (all 10 green, including the production-grace test which now exercises Jini's default), website typecheck.
