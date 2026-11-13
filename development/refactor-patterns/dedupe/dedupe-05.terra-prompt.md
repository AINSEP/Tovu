# Terra job dedupe-05: Jini core-level helpers (land first among Jini jobs)

READY (2026-11-13, revised for gates). Self-contained. Background and the reason for every decision: `development/refactor-patterns/dedupe/PLAN.md` (Tovu repo). Repo: the Jini clone you are given (Jini only; paths below are relative to the Jini repo root).

## Two phases (PLAN.md "Coordinator gates")
Other packages type-check against the BUILT `@jini-ai/core`, so a package cannot import a core name this job adds until core is reviewed and built.
- **Phase A (run now):** every core addition (J05 step 1, J09 core file, J32/J53/J56 core functions, TR04 core function, J45 core index additions if needed) plus the groups that use only names core ALREADY exports: J03, J45 (cms side, when no new core export is needed), JR07. Type-check core and each touched package, run the listed tests, commit, and report `05A DONE (needs H1)`. Stop there.
- **Phase B (run ONLY when the dispatch says "H1 done: @jini-ai/core built"):** consumer repoints of the NEW core names: J05 steps 2-3 (artifacts, agent-runtime), J09 repoints, J32 repoints + deletes, J53 repoints, J56 repoints, and the cms re-export half of J45 if Phase A had to add core exports.
- TR04's Tovu half is NOT in this job. It needs the Jini release (gate R1) and runs in `dedupe-11`. Report `TR04 JINI DONE; Tovu half = job 11`.

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
- **J03** MERGE INTO EXISTING (Phase A) — risk M; est. −12 lines; divergence: none for URL.hostname input (WHATWG brackets IPv6 and canonicalizes IPv4; looksLikeIpLiteral only differs on unbracketed ":" hosts and >255 octets, which URL.hostname never yields)
  - tests: cd packages/agent-runtime && npx vitest run --maxWorkers=2 src/providers/__tests__/connection-guard.test.ts ; cd packages/integrations && npx vitest run --maxWorkers=2 src/media-providers/dispatch/__tests__/ssrf-guard.test.ts
- **J05** EXTRACT SHARED HELPER (step 1 Phase A; steps 2-3 Phase B) — risk M; est. −95 lines; divergence: State machine identical. Signatures differ (artifacts object args, agent-runtime positional) - survivor uses object args. DIVERGENT tool_call regex: artifacts TOOL_CALL_OPEN_RE=/(?:<\s*tool_call\b[^>]*>|<\s*edit\s*>)/i hides prose like "x < tool_call.count && y > 0"; agent-runtime has the hardened one. Regexes stay per package (not merged); artifacts bug reported separately
  - tests: cd packages/core && npx vitest run --maxWorkers=2 src/text/__tests__/tagged-text-suppression.test.ts ; cd packages/artifacts && npx vitest run --maxWorkers=2 src/__tests__/text-suppression.test.ts ; cd packages/agent-runtime && npx vitest run --maxWorkers=2 src/agent-protocol/acp/__tests__/text-suppression.test.ts src/agent-protocol/acp/__tests__/session.handlers.unit.test.ts
- **J09** EXTRACT SHARED HELPER (core file Phase A; repoints Phase B) — risk L; est. −35 lines; divergence: none (identical bodies)
  - tests: cd packages/core && npx vitest run --maxWorkers=2 src/primitives/__tests__/errors.test.ts ; cd packages/sidecar && npx vitest run --maxWorkers=2 src/__tests__/json-ipc.test.ts src/__tests__/port.test.ts ; cd packages/platform && npx vitest run --maxWorkers=2 src/__tests__/fs.test.ts src/__tests__/process.test.ts
- **J32** EXTRACT SHARED HELPER (core function Phase A; 16 repoints Phase B) — risk L; est. −44 lines; divergence: none (5 identical copies; ui copy not in jscpd input but identical name - Terra must diff it first)
  - tests: cd packages/core && npx vitest run --maxWorkers=2 src/records.test.ts
- **J45** MERGE INTO EXISTING (Phase A; its optional re-export of newly added core names is Phase B) — risk L; est. −12 lines; divergence: none (verbatim)
  - tests: cd packages/cms && npx vitest run --maxWorkers=2 src/entries/__tests__/write-service.test.ts src/content-types/__tests__/write-service.test.ts
- **J53** EXTRACT SHARED HELPER (core function Phase A; 9 repoints Phase B) — risk L; est. −24 lines; divergence: none ("not valid JSON" / "schemaVersion must be 1" kept; each caller keeps its own array/length check and message)
  - tests: cd packages/core && npx vitest run --maxWorkers=2 src/records.test.ts ; then, for each of the 9 files in the J53 recipe, the `__tests__` file beside it that imports its parse function (`rg -l "<parseFunctionName>" <package>/src --glob '*.test.ts'`, run each alone)
- **J56** EXTRACT SHARED HELPER (core function Phase A; repoints Phase B) — risk L; est. −15 lines; divergence: none (same filter + cast)
  - tests: cd packages/core && npx vitest run --maxWorkers=2 src/records.test.ts ; cd packages/mcp && npx vitest run --maxWorkers=2 src/server/__tests__/run-tool-host.test.ts
- **JR07** MERGE INTO EXISTING (Phase A) — risk L; est. −10 lines; divergence: none (types are equal; cards-contracts.typecheck.ts already asserts it)
  - tests: cd packages/ui && npx tsc --noEmit -p tsconfig.json && npx vitest run --maxWorkers=2 src/features/mcp-ui/__tests__/secret-card.unit.test.ts src/features/mcp-ui/__tests__/sign-in-card.unit.test.ts src/features/mcp-ui/__tests__/cards.unit.test.ts
- **TR04** EXTRACT SHARED HELPER (Jini core function only, Phase A; Tovu half = job 11) — risk L; est. −10 lines; divergence: phase 1 none. Phase 2 sites always wrap; with toMsClock a clock carrying BOTH nowMs and nowIso would use nowMs instead of parsing nowIso (only test fakes have both) - OWNER DECISION whether to do phase 2
  - tests: cd packages/core && npx vitest run --maxWorkers=2 src/primitives/__tests__/time.test.ts (add 2 cases: Clock passes through; IsoClock parses). The Tovu tests belong to job 11.

## Recipes (exact before → after)

## J03 IP-literal check (MERGE INTO EXISTING core)
In connection-guard.ts and ssrf-guard.ts: delete `function looksLikeIpLiteral`; add `import { isIpLiteralHostname } from '@jini-ai/core';`; replace `looksLikeIpLiteral(hostname)` with `isIpLiteralHostname({ hostname })`. Update the ssrf-guard.test.ts:143 comment "looksLikeIpLiteral's bracket-stripping branch" -> "isIpLiteralHostname's bracketed-IPv6 branch".

## J05 tagged text suppressor (EXTRACT to @jini-ai/core/text)
1. (Phase A) New packages/core/src/text/tagged-text-suppression.ts: move from packages/artifacts/src/text-suppression.ts verbatim: `StreamTextEvent`, `StreamEventSink`, `ArtifactTextSuppressor` (export also as `TaggedTextSuppressor` alias), `ArtifactTextSuppressorStats`, `MAX_CANDIDATE_LENGTH`, `createTaggedTextSuppressor` (object-arg form, with its doc comment), `emitWithTextSuppressor` (object-arg form), `possibleTagStart`. Export all from packages/core/src/text/index.ts. Add packages/core/src/text/__tests__/tagged-text-suppression.test.ts by moving the createTaggedTextSuppressor/emit cases from artifacts' test.
2. (Phase B, after H1) artifacts/src/text-suppression.ts: delete the moved code; `import { createTaggedTextSuppressor, type ArtifactTextSuppressor } from '@jini-ai/core/text';` and `export { createTaggedTextSuppressor, emitWithTextSuppressor, type ArtifactTextSuppressor, type ArtifactTextSuppressorStats, type StreamTextEvent, type StreamEventSink } from '@jini-ai/core/text';` (public names unchanged). Keep compactTagCandidate, createXmlTagTextSuppressor, tool-call regexes/predicates and their comments.
3. (Phase B, after H1) agent-runtime/src/agent-protocol/acp/text-suppression.ts: delete its `createTaggedTextSuppressor`, `possibleTagStart`, `MAX_CANDIDATE_LENGTH`, `ArtifactTextSuppressor`, `ArtifactTextSuppressorStats`, `EventSink`, `emitWithTextSuppressor`; import them from '@jini-ai/core/text'; keep the DSML/tool_call regexes + `isPossible*` predicates, wrapping them as `isPossibleOpen: ({ text }) => isPossibleDsmlArtifactOpen(text)` etc. Re-export `emitWithTextSuppressor` and the types for session.ts. In session.ts change `suppressor.strip(text)` -> `suppressor.strip({ text })` and `emitWithTextSuppressor(s, onEvent, text)` -> `emitWithTextSuppressor({ suppressor: s, onEvent, text })`; same in its tests.
Do NOT change the artifacts tool_call regex here (separate bug, see report).

## J09 errorCode/errorMessage (EXTRACT to @jini-ai/core/primitives)
Phase A. New packages/core/src/primitives/errors.ts:
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
Export both from primitives/index.ts. Add `src/primitives/__tests__/errors.test.ts` (string code; numeric code stringified; missing or null code -> null; non-object -> null; Error -> its message; non-Error -> `String(value)`). If `packages/core/src/primitives/errors.ts` already exports an equivalent pair (the Jini error-helper design may have added it), reuse those exports under their existing names and do not create a second copy.

Phase B (after H1). Exact manifest (line numbers as of Jini 48e6159a4; locate by content). Every copy below has the body `typeof error !== "object" || error == null || !("code" in error)` then `code == null ? null : String(code)` (errorCode), or `error instanceof Error ? error.message : String(error)` (errorMessage). In each file: delete the private function, import from `@jini-ai/core/primitives`, and rewrite every call in that file: `errorCode(x)` -> `errorCodeOf({ error: x })`, `errorMessage(x)` -> `errorMessageOf({ error: x })`. If a copy's body differs from the text above, keep it and report `STALE J09 <file>`.

| file | errorCode | errorMessage |
|---|---|---|
| `packages/sidecar/src/port.ts` | :30 | :39 |
| `packages/sidecar/src/json-ipc.ts` | :89 | :98 |
| `packages/platform/src/download.ts` | :232 | :238 |
| `packages/platform/src/process.ts` | :91 | — |
| `packages/platform/src/fs.ts` | :16 | :23 |
| `packages/platform/src/http.ts` | — | :30 |

KEEP `packages/platform/src/web/web-page.ts#errorCode`: it returns the raw `unknown` code, a different contract. sidecar and platform already list `@jini-ai/core` in `dependencies`.
Tests: core `src/primitives/__tests__/errors.test.ts`; sidecar `src/__tests__/json-ipc.test.ts`, `src/__tests__/port.test.ts`; platform `src/__tests__/fs.test.ts`, `src/__tests__/process.test.ts`, and the test files in `packages/platform/src/__tests__/` whose names start with `download` or `http` (list the folder; run each alone).

## J32 omitKeys (EXTRACT to @jini-ai/core/records)
Phase A. Add to core/src/records.ts (the copies' doc sentence "what `const { a: _a, ...rest } = source` does, without binding a throwaway name" moves onto the new function):
```ts
export function omitKeys<T extends object, K extends keyof T>({ source, keys }: { source: T; keys: readonly K[] }, _optional: Record<string, never> = {}): Omit<T, K> {
  const copy: Partial<Record<PropertyKey, unknown>> = { ...source };
  for (const key of keys) delete copy[key];
  return copy as Omit<T, K>;
}
```
(the final cast already exists in all copies; keep it). Add a case to core/src/records.test.ts.

Phase B (after H1). Delete the five copies: `packages/admin/src/core/omit-keys.ts`, `packages/agent-runtime/src/core/omit-keys.ts`, `packages/agentic/src/core/omit-keys.ts`, `packages/daemon/src/core/omit-keys.ts`, `packages/ui/src/utils/omit-keys.ts` (diff ui's against the others first; if its body differs, keep it and report `STALE J32-ui`). None is exported from a package entry. Repoint exactly these 16 calls (as of Jini 48e6159a4): import `omitKeys` from `@jini-ai/core/records` and rewrite `omitKeys(x, [...])` -> `omitKeys({ source: x, keys: [...] })`.

| package | file (under `packages/<package>/src/`) | calls |
|---|---|---|
| admin | `media/react/hooks/LibraryTab.hooks.ts` | 1 |
| admin | `react/components/ConfirmDialog/confirm-dialog-attrs.ts` | 1 |
| admin | `seo/adapters/memory.ts` | 1 |
| agent-runtime | `detection.ts` | 1 |
| agent-runtime | `providers/anthropic-messages.ts` | 1 |
| agent-runtime | `providers/openai-chat.ts` | 3 |
| agentic | `core/handle.ts` | 1 |
| daemon | `agent-executor/codex/home-staging.ts` | 1 |
| daemon | `agent-executor/live-session-state.ts` | 1 |
| daemon | `delegated-result-correlation.ts` | 1 |
| ui | `features/connectors/rules.ts` | 2 |
| ui | `features/memory/rules.ts` | 1 |
| ui | `features/skills/dependencies.ts` | 1 |

A test file that imports a deleted copy repoints to `@jini-ai/core/records` and switches to object args too. Type-check each of the 5 packages.

## J45 cms authorization types (MERGE into core)
Replace the body of cms/src/core/authorization.ts with the existing first doc line plus `export type { ToolPermissionAuthorizationPort as AuthorizationPort } from "@jini-ai/core";`. First run `rg -n "AuthorizationRequired|AuthorizationOptional" packages/cms/src`. If anything in cms uses them, add `type AuthorizationRequired as ToolPermissionAuthorizationRequired, type AuthorizationOptional as ToolPermissionAuthorizationOptional` to core/src/index.ts's tool-permissions export and re-export those from cms too. The `AuthorizationPort` re-export uses an existing core name (Phase A). If the two extra core index exports are needed, adding them to core is Phase A and the cms re-export of them is Phase B (after H1).

## J53 schema-v1 contribution files (EXTRACT to core/records)
Phase A. Add to core/src/records.ts:
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
`isNonArrayRecord` vs the sites' `isPlainObject` / `object` / `isObject`: `JSON.parse` yields only plain objects, arrays and primitives, so the checks agree on every input. Add records.test.ts cases: invalid JSON, a JSON array, `schemaVersion: 2`, a valid document.

Phase B (after H1). Exact manifest (as of Jini 48e6159a4; no search command needed). At each site replace the `let value` / `JSON.parse` try-catch / `schemaVersion !== 1` lines with `const parsed = parseSchemaV1Document({ raw: <local raw> }); if (!parsed.ok) return parsed; const value = parsed.document;` and import from `@jini-ai/core/records`. Delete a local `isPlainObject` / `object` / `isObject` / `parseJson` / `INVALID_JSON` only if it becomes unused in that file.

| # | file (under `packages/`) | function | local raw | notes |
|---|---|---|---|---|
| 1 | `devops/src/source-control/registry.ts:67` | parseSourceControlProvidersFile | `required.raw` | |
| 2 | `platform/src/object-store/descriptors.ts:41` | parseObjectStoresFile | `required.raw` | |
| 3 | `devops/src/deploy/target-descriptors.ts:39` | parseDeployTargetsFile | `raw` | |
| 4 | `devops/src/deploy/ops-descriptors.ts:16` | parseDeployOpsFile | `raw` | |
| 5 | `devops/src/deploy/config-descriptors.ts:55` | parseDeployConfigsFile | `raw` | |
| 6 | `cms/src/forms/destination-descriptors.ts:41` | parseFormDestinationsFile | `required.raw` | |
| 7 | `agent-plugins/src/admin-surfaces/descriptor.ts:98` | parseAdminSurfacesFile | `required.raw` | KEEP the `MAX_RAW_BYTES` ("larger than 64 KiB") check FIRST, before the parse |
| 8 | `integrations/src/credentialed-http/auth-schemes.ts:47` | parseCredentialSchemesFile | `required.raw` | |
| 9 | `integrations/src/api-connections/declarations.ts:171` | parseApiConnectionsFile | `required.raw` | KEEP `const namespace = checkedNamespace(...)` FIRST (it throws on host misconfiguration before any parse); the helper replaces the `parseJson` / `INVALID_JSON` lines |

EXCLUDED (different contract, do not touch): `agent-plugins/src/lifecycle/mail/adapter-descriptors.ts` (accepts schemaVersion 1 or 2) and `agent-plugins/src/lifecycle/tools/manifest.ts` (returns a bare string, not a result object). All five packages (devops, platform, cms, agent-plugins, integrations) already list `@jini-ai/core` in `dependencies`.

## J56 withoutUndefined (EXTRACT to core/records)
Phase A: core/src/records.ts: `export type DefinedFields<T> = { [K in keyof T]?: Exclude<T[K], undefined> };` and `export function withoutUndefined<T extends object>({ source }: { source: T }, _optional: Record<string, never> = {}): DefinedFields<T> { return Object.fromEntries(Object.entries(source).filter(([, value]) => value !== undefined)) as DefinedFields<T>; }`. MOVE the doc from daemon resource-request.ts ("Copies `fields` without its `undefined`-valued keys…") and mcp's "required under `exactOptionalPropertyTypes`…" sentence. Phase B (after H1): replace definedOnly (mcp serve.ts, run-tool-host.ts, daemon terminal-session.ts), definedFields (agent-plugins lifecycle/manifest.ts), the chat run-activity.ts copy (same body, ~line 210) and daemon resource-request withoutUndefined/DefinedFields. Calls become `withoutUndefined({ source: x })`. Also export the mcp `DelegatedGatewayOptions` from run-tool-host.ts and reuse it in serve.ts.

## JR07 card state unions (MERGE into core contract)
`ui/src/features/mcp-ui/secret-card.ts`: replace the 7-line `export type SecretCardRun<Saved> = | …` with `export type SecretCardRun<Saved> = SurfaceCardSecretRun<Saved>;` and add `SurfaceCardSecretRun` to its existing `import type { … } from '@jini-ai/core/contracts/cards'`. `sign-in-card.ts`: replace the 3-line `SignInCardState` union with `export type SignInCardState = SurfaceCardSignInState;` plus `import type { SurfaceCardSignInState } from '@jini-ai/core/contracts/cards';`. Leave `SignInCardSpec` (its `uri`/`app` types are ui-local). cards-contracts.typecheck.ts keeps passing unchanged.

## TR04 ISO clock adapter -> Jini core `toMsClock` (EXTRACT; Jini half only)
Phase A. Jini `packages/core/src/primitives/time.ts`, after `Clock`:
```ts
/** A host clock that reads ISO strings, the shape older host ports (Tovu's) expose. */
export interface IsoClock { nowIso(): string }

/** Adapts an ISO-string clock to {@link Clock}; a `Clock` passes through unchanged.
 * @complexity O(1); each `nowMs()` parses one ISO string. */
export function toMsClock({ clock }: { clock: Clock | IsoClock }, _optional: Record<string, never> = {}): Clock {
  return "nowMs" in clock ? clock : { nowMs: () => Date.parse(clock.nowIso()) };
}
```
Export both from primitives/index.ts. New test `src/primitives/__tests__/time.test.ts`: a Clock is returned as-is; an IsoClock yields `Date.parse` of its string.
The Tovu phase 1 repoints and the owner-gated phase 2 (O5) are in `dedupe-11.terra-prompt.md`; they need the Jini release (gate R1). Jini `cms/src/seo/sitemap.ts:156` (an always-wrap site) belongs to phase 2 and stays untouched here.

