# Terra job dedupe-05: Jini core-level helpers (land first among Jini jobs)

READY (2026-11-13). Self-contained. Background and the reason for every decision: `development/refactor-patterns/dedupe/PLAN.md` (Tovu repo). Repo: the Jini clone you are given (Jini only; paths below are relative to the Jini repo root).

TR04 has a Jini half (core helper) and a Tovu half. Do ONLY the Jini half here; the Tovu half runs after the coordinator rebuilds/links Jini (report it as `PENDING-TOVU TR04`).

## Rules for every group in this job (read before editing)
- HARD: stop before ~250k tokens of context. If you get close: commit what is done (by explicit paths), list the groups you did not finish under "REMAINING" in your report, and stop.
- Do exactly the recipe. If a recipe's "before" text is not in the file (code moved or changed), search the same file for the same code by content; if it is gone or differs in behavior, SKIP that group and report it as `STALE <id>: <what you saw>`. Never improvise a different design.
- No `eslint-disable`, no `as any`, no non-null `!`, no `@ts-ignore`. New functions take `(required: {...}, optional: {...} = {})`.
- "Why" comments are never deleted: when code moves, its comment moves with it to the survivor; when two copies carry different why-comments, the survivor keeps both.
- Do not change response text, status codes, error messages, defaults or ordering unless the recipe says so. Where a recipe says "behavior differs", write the failing test first (run it, see it RED), then make the change, then see it GREEN.
- Plugins never import each other (`packages/agent-plugins/src/<id>/`, `content/agent-plugins/<id>/`); no new package; a shared helper goes only where the recipe says.
- Tests: run ONLY the single files the recipe lists (and any test file you edit), one at a time. No suites, no full `tsc`, no watch modes; vitest always `--maxWorkers=2`; Tovu node tests always `--test-concurrency=1`. Leave no process running. Jini: after editing a package, type-check that package only, no emit (`cd packages/<pkg> && npx tsc --noEmit -p tsconfig.json`), and do NOT rebuild/publish it.
- Tovu single-file test command: `TSX_TSCONFIG_PATH=apps/site-chat/tsconfig.json node --import tsx --import ./development/test-support/composed-bundle-env.ts --test --test-concurrency=1 --experimental-test-module-mocks <file>`.
- Commit once per group (or once per job if the groups are tiny), by explicit paths: `git add -- <paths> && git commit -F msg -- <paths>`. Never `git add -A`, never stash/checkout/reset, never push.
- Report: per group `DONE | STALE | SKIPPED` + lines removed (from `git diff --stat`), tests run with pass/fail counts, anything that looked like a bug (do not fix bugs that are not in the recipe; list them).

## Groups in this job (decision, risk, expected saving, divergence, tests)
- **J03** MERGE INTO EXISTING — risk M; est. −12 lines; divergence: none for URL.hostname input (WHATWG brackets IPv6 and canonicalizes IPv4; looksLikeIpLiteral only differs on unbracketed ":" hosts and >255 octets, which URL.hostname never yields)
  - tests: cd packages/agent-runtime && npx vitest run --maxWorkers=2 src/providers/__tests__/connection-guard.test.ts ; cd packages/integrations && npx vitest run --maxWorkers=2 src/media-providers/dispatch/__tests__/ssrf-guard.test.ts
- **J05** EXTRACT SHARED HELPER — risk M; est. −95 lines; divergence: State machine identical. Signatures differ (artifacts object args, agent-runtime positional) - survivor uses object args. DIVERGENT tool_call regex: artifacts TOOL_CALL_OPEN_RE=/(?:<\s*tool_call\b[^>]*>|<\s*edit\s*>)/i hides prose like "x < tool_call.count && y > 0"; agent-runtime has the hardened one. Regexes stay per package (not merged); artifacts bug reported separately
  - tests: cd packages/core && npx vitest run --maxWorkers=2 src/text/__tests__/tagged-text-suppression.test.ts ; cd packages/artifacts && npx vitest run --maxWorkers=2 src/__tests__/text-suppression.test.ts ; cd packages/agent-runtime && npx vitest run --maxWorkers=2 src/agent-protocol/acp/__tests__/text-suppression.test.ts src/agent-protocol/acp/__tests__/session.handlers.unit.test.ts
- **J09** EXTRACT SHARED HELPER — risk L; est. −35 lines; divergence: none (identical bodies)
  - tests: cd packages/core && npx vitest run --maxWorkers=2 src/primitives/__tests__/errors.test.ts ; cd packages/sidecar && npx vitest run --maxWorkers=2 src/__tests__/json-ipc.test.ts src/__tests__/port.test.ts ; cd packages/platform && npx vitest run --maxWorkers=2 src/__tests__/fs.test.ts src/__tests__/process.test.ts
- **J32** EXTRACT SHARED HELPER — risk L; est. −44 lines; divergence: none (5 identical copies; ui copy not in jscpd input but identical name - Terra must diff it first)
  - tests: cd packages/core && npx vitest run --maxWorkers=2 src/records.test.ts
- **J45** MERGE INTO EXISTING — risk L; est. −12 lines; divergence: none (verbatim)
  - tests: cd packages/cms && npx vitest run --maxWorkers=2 src/entries/__tests__/write-service.test.ts src/content-types/__tests__/write-service.test.ts
- **J53** EXTRACT SHARED HELPER — risk L; est. −24 lines; divergence: none ("not valid JSON" / "schemaVersion must be 1" kept; each caller keeps its own array/length check and message)
  - tests: cd packages/core && npx vitest run --maxWorkers=2 src/records.test.ts ; then each package's descriptor test file
- **J56** EXTRACT SHARED HELPER — risk L; est. −15 lines; divergence: none (same filter + cast)
  - tests: cd packages/core && npx vitest run --maxWorkers=2 src/records.test.ts ; cd packages/mcp && npx vitest run --maxWorkers=2 src/server/__tests__/run-tool-host.test.ts
- **JR07** MERGE INTO EXISTING — risk L; est. −10 lines; divergence: none (types are equal; cards-contracts.typecheck.ts already asserts it)
  - tests: cd packages/ui && npx tsc --noEmit -p tsconfig.json && npx vitest run --maxWorkers=2 src/features/mcp-ui/__tests__/secret-card.unit.test.ts src/features/mcp-ui/__tests__/sign-in-card.unit.test.ts src/features/mcp-ui/__tests__/cards.unit.test.ts
- **TR04** EXTRACT SHARED HELPER — risk L (phase 1) / M (phase 2); est. −10 lines; divergence: phase 1 none. Phase 2 sites always wrap; with toMsClock a clock carrying BOTH nowMs and nowIso would use nowMs instead of parsing nowIso (only test fakes have both) - OWNER DECISION whether to do phase 2
  - tests: cd packages/core (Jini) && npx vitest run --maxWorkers=2 src/primitives/__tests__/time.test.ts (add 2 cases: Clock passes through; IsoClock parses) ; Tovu: npx tsx --test --test-concurrency=1 apps/website/src/features/comments/__tests__/settings.test.ts apps/website/src/features/comments/__tests__/provider-selection.test.ts apps/website/src/features/seo/__tests__/settings.test.ts apps/website/src/features/identity/__tests__/wiring.test.ts

## Recipes (exact before → after)

## J03 IP-literal check (MERGE INTO EXISTING core)
In connection-guard.ts and ssrf-guard.ts: delete `function looksLikeIpLiteral`; add `import { isIpLiteralHostname } from '@jini-ai/core';`; replace `looksLikeIpLiteral(hostname)` with `isIpLiteralHostname({ hostname })`. Update the ssrf-guard.test.ts:143 comment "looksLikeIpLiteral's bracket-stripping branch" -> "isIpLiteralHostname's bracketed-IPv6 branch".

## J05 tagged text suppressor (EXTRACT to @jini-ai/core/text)
1. New packages/core/src/text/tagged-text-suppression.ts: move from packages/artifacts/src/text-suppression.ts verbatim: `StreamTextEvent`, `StreamEventSink`, `ArtifactTextSuppressor` (export also as `TaggedTextSuppressor` alias), `ArtifactTextSuppressorStats`, `MAX_CANDIDATE_LENGTH`, `createTaggedTextSuppressor` (object-arg form, with its doc comment), `emitWithTextSuppressor` (object-arg form), `possibleTagStart`. Export all from packages/core/src/text/index.ts. Add packages/core/src/text/__tests__/tagged-text-suppression.test.ts by moving the createTaggedTextSuppressor/emit cases from artifacts' test.
2. artifacts/src/text-suppression.ts: delete the moved code; `import { createTaggedTextSuppressor, type ArtifactTextSuppressor } from '@jini-ai/core/text';` and `export { createTaggedTextSuppressor, emitWithTextSuppressor, type ArtifactTextSuppressor, type ArtifactTextSuppressorStats, type StreamTextEvent, type StreamEventSink } from '@jini-ai/core/text';` (public names unchanged). Keep compactTagCandidate, createXmlTagTextSuppressor, tool-call regexes/predicates and their comments.
3. agent-runtime/src/agent-protocol/acp/text-suppression.ts: delete its `createTaggedTextSuppressor`, `possibleTagStart`, `MAX_CANDIDATE_LENGTH`, `ArtifactTextSuppressor`, `ArtifactTextSuppressorStats`, `EventSink`, `emitWithTextSuppressor`; import them from '@jini-ai/core/text'; keep the DSML/tool_call regexes + `isPossible*` predicates, wrapping them as `isPossibleOpen: ({ text }) => isPossibleDsmlArtifactOpen(text)` etc. Re-export `emitWithTextSuppressor` and the types for session.ts. In session.ts change `suppressor.strip(text)` -> `suppressor.strip({ text })` and `emitWithTextSuppressor(s, onEvent, text)` -> `emitWithTextSuppressor({ suppressor: s, onEvent, text })`; same in its tests.
Do NOT change the artifacts tool_call regex here (separate bug, see report).

## J09 errorCode/errorMessage (EXTRACT to @jini-ai/core/primitives)
New packages/core/src/primitives/errors.ts:
```ts
/** A Node-style `error.code` as a string, or `null` when the thrown value carries none. */
export function errorCodeOf({ error }: { error: unknown }, _optional: Record<string, never> = {}): string | null {
  if (typeof error !== 'object' || error === null || !('code' in error)) return null;
  const { code } = error;
  return code === null || code === undefined ? null : String(code);
}
/** A human-readable message from an unknown thrown value. */
export function errorMessageOf({ error }: { error: unknown }, _optional: Record<string, never> = {}): string {
  return error instanceof Error ? error.message : String(error);
}
```
Export from primitives/index.ts. Replace the private copies in sidecar/src/json-ipc.ts, sidecar/src/port.ts, platform/src/process.ts, platform/src/fs.ts, platform/src/download.ts (call `errorCodeOf({ error: x })`). If `packages/core/src/primitives/errors.ts` already exports an equivalent pair (another job may have added it), reuse those exports under their existing names and do not create a second copy.

## J32 omitKeys (EXTRACT to @jini-ai/core/records)
Add to core/src/records.ts (keep the file doc sentence "what `const { a: _a, ...rest } = source` does, without binding a throwaway name"):
```ts
export function omitKeys<T extends object, K extends keyof T>({ source, keys }: { source: T; keys: readonly K[] }, _optional: Record<string, never> = {}): Omit<T, K> {
  const copy: Partial<Record<PropertyKey, unknown>> = { ...source };
  for (const key of keys) delete copy[key];
  return copy as Omit<T, K>;
}
```
(the final cast already exists in all copies; keep it). Delete admin/src/core/omit-keys.ts, agent-runtime/src/core/omit-keys.ts, agentic/src/core/omit-keys.ts, daemon/src/core/omit-keys.ts, ui/src/utils/omit-keys.ts (diff ui's first). Repoint the 16 call sites (`rg -n "omitKeys\(" packages`) to `import { omitKeys } from '@jini-ai/core/records'` and `omitKeys({ source: x, keys: [...] })`. Add a case to core/src/records.test.ts.

## J45 cms authorization types (MERGE into core)
Replace the body of cms/src/core/authorization.ts with the existing first doc line plus `export type { ToolPermissionAuthorizationPort as AuthorizationPort } from "@jini-ai/core";`. First run `rg -n "AuthorizationRequired|AuthorizationOptional" packages/cms/src`. If anything in cms uses them, add `type AuthorizationRequired as ToolPermissionAuthorizationRequired, type AuthorizationOptional as ToolPermissionAuthorizationOptional` to core/src/index.ts's tool-permissions export and re-export those from cms too.

## J53 schema-v1 contribution files (EXTRACT to core/records)
```ts
/** Parse a plugin contribution file and require `schemaVersion: 1`; callers validate their own list key. */
export function parseSchemaV1Document({ raw }: { raw: string }, _optional: Record<string, never> = {}): { ok: true; document: Readonly<Record<string, unknown>> } | { ok: false; reason: string } {
  let value: unknown;
  try { value = JSON.parse(raw); } catch { return { ok: false, reason: "not valid JSON" }; }
  const holder = { value };
  if (!isNonArrayRecord(holder) || holder.value.schemaVersion !== 1) return { ok: false, reason: "schemaVersion must be 1" };
  return { ok: true, document: holder.value };
}
```
At the 6 sites (`rg -n 'reason: "schemaVersion must be 1"' packages`), replace the try/parse/schemaVersion lines with `const parsed = parseSchemaV1Document({ raw }); if (!parsed.ok) return parsed; const value = parsed.document;` (use `required.raw` where that is the local name). Delete a local `isPlainObject`/`object` only if it becomes unused. Add a records.test.ts case.

## J56 withoutUndefined (EXTRACT to core/records)
core/src/records.ts: `export type DefinedFields<T> = { [K in keyof T]?: Exclude<T[K], undefined> };` and `export function withoutUndefined<T extends object>({ source }: { source: T }, _optional: Record<string, never> = {}): DefinedFields<T> { return Object.fromEntries(Object.entries(source).filter(([, value]) => value !== undefined)) as DefinedFields<T>; }`. MOVE the doc from daemon resource-request.ts ("Copies `fields` without its `undefined`-valued keys…") and mcp's "required under `exactOptionalPropertyTypes`…" sentence. Replace definedOnly (mcp serve.ts, run-tool-host.ts, daemon terminal-session.ts), definedFields (agent-plugins lifecycle/manifest.ts), the chat run-activity.ts copy (same body, ~line 210) and daemon resource-request withoutUndefined/DefinedFields. Calls become `withoutUndefined({ source: x })`. Also export the mcp `DelegatedGatewayOptions` from run-tool-host.ts and reuse it in serve.ts.

## JR07 card state unions (MERGE into core contract)
`ui/src/features/mcp-ui/secret-card.ts`: replace the 7-line `export type SecretCardRun<Saved> = | …` with `export type SecretCardRun<Saved> = SurfaceCardSecretRun<Saved>;` and add `SurfaceCardSecretRun` to its existing `import type { … } from '@jini-ai/core/contracts/cards'`. `sign-in-card.ts`: replace the 3-line `SignInCardState` union with `export type SignInCardState = SurfaceCardSignInState;` plus `import type { SurfaceCardSignInState } from '@jini-ai/core/contracts/cards';`. Leave `SignInCardSpec` (its `uri`/`app` types are ui-local). cards-contracts.typecheck.ts keeps passing unchanged.

## TR04 ISO clock adapter -> Jini core `toMsClock` (EXTRACT)
Jini `packages/core/src/primitives/time.ts`, after `Clock`:
```ts
/** A host clock that reads ISO strings, the shape older host ports (Tovu's) expose. */
export interface IsoClock { nowIso(): string }

/** Adapts an ISO-string clock to {@link Clock}; a `Clock` passes through unchanged.
 * @complexity O(1); each `nowMs()` parses one ISO string. */
export function toMsClock({ clock }: { clock: Clock | IsoClock }, _optional: Record<string, never> = {}): Clock {
  return "nowMs" in clock ? clock : { nowMs: () => Date.parse(clock.nowIso()) };
}
```
New test `src/primitives/__tests__/time.test.ts`: a Clock is returned as-is; an IsoClock yields `Date.parse` of its string.
Tovu phase 1 (same semantics): comments/settings.ts and seo/settings.ts delete `jiniClock` and its comment ("Tovu's ISO-clock adapter; the shared clock contract/rationale lives in Jini core/primitives" now lives on core's doc), replace `jiniClock(x)` with `toMsClock({ clock: x })`, and use `ClockPort | IsoClock` in the two deps types. comments/provider-selection.ts (2 inline), identity/wiring.ts:186, identity/tool-registrations.ts:209: `'nowMs' in c ? c : { nowMs: () => Date.parse(c.nowIso()) }` -> `toMsClock({ clock: c })`. Import from `@jini-ai/core/primitives`.
Phase 2 (OWNER DECISION, not in the estimate): the 16 always-wrap `{ nowMs: () => Date.parse(X.nowIso()) }` sites (webhooks, newsletter, publish-trust, dev-auth, api-keys/users/settings deps, serving-app, agent-plugin-service-ports, smtp.nodemailer, import-media-entity) and Jini cms/src/seo/sitemap.ts:156.
