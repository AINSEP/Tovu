# Terra job dedupe-10: OWNER-GATED (run only the groups the owner approved)

READY (2026-11-13). Self-contained. Background and the reason for every decision: `development/refactor-patterns/dedupe/PLAN.md` (Tovu repo). Repo: the Tovu+Jini clone you are given.

Each group below needs the owner's yes first (see PLAN.md, Owner decisions). Skip every group the dispatch does not name as approved.

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
- **JR01** EXTRACT SHARED HELPER — risk L; est. −80 lines; divergence: none for the 26 replaced copies (all are non-null + non-array). Excluded on purpose: array-permissive copies (agent-runtime claude-segment-usage, qoder-stream, pi-rpc/internal, elevenlabs; agentic a2ui/surface-properties; chat run-activity; search registry), shape-typed guards (commerce Candidate, search contribution Shape, agent-runtime json-event-stream JsonObject export), protocol/delegated-result (protocol has no core dependency)
  - tests: cd packages/core && npx vitest run --maxWorkers=2 src/records.test.ts ; then npx tsc --noEmit -p packages/<pkg>/tsconfig.json for each touched package ; per touched file run its colocated test: cd packages/<pkg> && npx vitest run --maxWorkers=2 $(rg -l '<basename-without-ext>' src --glob '*.test.ts' | head -3)
- **T11** EXTRACT SHARED HELPER (Jini home; Tovu adoption in job 11 after R1) — risk M; est. +40 Jini, −75 Tovu; divergence: none
  - tests: cd packages/ui && npx vitest run --maxWorkers=2 src/features/admin-widgets/components/Lightbox/__tests__/use-native-modal-dialog.hooks.test.tsx
- **T33** moved to job dedupe-03.

## Recipes (exact before → after)

## JR01 isRecord copies -> core `isObjectRecord` (EXTRACT, core + 11 packages) - OWNER DECISION O2: positional guard
Phase A = step 1 (core only; commit; report `JR01 PHASE A DONE (needs H6)`). Phase B = steps 2-4, only after the dispatch says "H6 done: @jini-ai/core built".
1. `packages/core/src/records.ts`, after `isNonArrayRecord`:
```ts
/**
 * Positional twin of {@link isNonArrayRecord}. TypeScript narrows only the argument a guard names,
 * so the object-arg form cannot narrow a caller's own variable in place; this one can.
 * Same check: non-null, non-array object (class instances and null-prototype records included).
 * @complexity O(1) time and space.
 * @example isObjectRecord([]); // false
 */
export function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return isNonArrayRecord({ value });
}
```
Add to `src/records.test.ts`: `{}` true, `[]` false, `null` false, `Object.create(null)` true.
2. In each of these 26 files delete the local `isRecord` (function or const), add `isObjectRecord` to the file's `@jini-ai/core/records` import (or add `import { isObjectRecord } from '@jini-ai/core/records';`), and rename `isRecord(` to `isObjectRecord(` inside that file only:
agent-plugins/src/admin-surfaces/{surface-capabilities,surface-handlers,delivery-bindings}.ts; agent-plugins/src/lifecycle/tools/manifest.ts; agent-runtime/src/{claude-stream,mmd-routes}.ts; agent-runtime/src/ai-trace/usage.ts; agent-runtime/src/providers/{anthropic-messages,google-messages,google-schema,operation-schema,ollama-chat,openai-chat}.ts; agentic/src/core/mcp-ui-apps.ts; chat/src/core/run-events/entry.ts; cms/src/widgets/markers/gallery.ts; desktop-host/src/bridge.ts; integrations/src/api-connections/descriptor.ts; integrations/src/api-connections/token-store/record.ts; mcp/src/server/{schema-ref-scope,tools/delegated-tool}.ts; platform/src/mail/provider-setup.ts; platform/src/secrets/passphrase-envelope.ts; plugins/src/host/declarative-content-types.ts; ui/src/features/mcp-ui/resource.ts; ui/src/features/mcp-ui/surfaces/structured-details.ts.
   - `agentic/src/core/mcp-ui-apps.ts`: its "Arrays excluded deliberately: …" comment moves to sit above the first `isObjectRecord(` call.
   - The 4 `Readonly<Record<…>>` copies (3 admin-surfaces, provider-setup) narrow to `Record<string, unknown>` now; that is assignable everywhere the readonly form was.
3. `mcp/src/server/tool-arguments.ts` exports `isRecord`: replace its definition with `export { isObjectRecord as isRecord } from '@jini-ai/core/records';` so its importers stay unchanged.
4. J46a (same owner gate O2; runs with JR01): new `daemon/src/core/is-record.ts` containing `export { isObjectRecord as isRecord } from '@jini-ai/core/records';` plus this moved comment: "Positional on purpose: TypeScript narrows only the argument a guard names, so core's object-arg `isNonArrayRecord` cannot narrow `input.body` in place." Then, in each of these 22 files, delete the local `isRecord` (all have the body `typeof value === 'object' && value !== null && !Array.isArray(value)` or the same with operands reordered) and import `isRecord` from the new module by relative path: `run-lifecycle.ts`, `tool-result-surfaces.ts`, `tool-result-media.ts`, `terminal-session.ts`, `remote-tool-executor.ts`, `http/remote-run-events.ts`, `http/media.ts`, `http/research.ts`, `http/db-ops.ts`, `http/frontend-sessions.ts`, `http/routines.ts`, `http/memory.ts`, `http/tool-execution-routes.ts`, `http/runs.ts`, `http/attachment-lookup-routes.ts`, `http/xai.ts`, `http/connectors.ts`, `http/delegated-tools.ts`, `http/frontend-request-route.ts` (all under `packages/daemon/src/`). The three EXPORTED copies keep their export so importers stay unchanged: `http/model-proxy-fields.ts`, `http/resource-request.ts`, `agent-executor/values.ts` each become `export { isRecord } from '<relative>/core/is-record.js';`.
NOT touched (one line each): array-permissive copies (agent-runtime claude-segment-usage, qoder-stream, pi-rpc/internal, elevenlabs; agentic a2ui/surface-properties; chat run-activity; search registry) change behavior if replaced; shape-typed guards (commerce `Candidate`, search contribution `Shape`, agent-runtime json-event-stream `JsonObject` export); protocol/delegated-result.ts (protocol does not depend on core).

### T11 (ONLY if the owner approves O3): `useNativeModalDialog` gets a Jini home
Why Jini: a native-`<dialog>` open/close lifecycle with Escape and backdrop dismissal is a generic UI mechanism (owner rule: generic -> Jini). Its pieces already live in `@jini-ai/ui/admin-widgets` (`openLightboxDialog` / `closeLightboxDialog`, which Tovu adopts in T10), so the hook goes beside them. Tovu adopts it in job dedupe-11 after the Jini release (gate R1).
1. Jini: new `packages/ui/src/features/admin-widgets/components/Lightbox/use-native-modal-dialog.hooks.ts`:
   - `export interface NativeModalDialogController` = Tovu `MessageOverflowModalController` (apps/admin/src/components/AssistantDock/MessageOverflowModal.hooks.tsx), field docs included.
   - `export function useNativeModalDialog({ open, onClose }: { open: boolean; onClose: () => void }, _optional: Record<string, never> = {}): NativeModalDialogController` with the body of Tovu `useMessageOverflowModal`, calling `openLightboxDialog` / `closeLightboxDialog` from `./Lightbox.hooks.js`, and its doc block (rename only identifiers).
   - Export both from `packages/ui/src/features/admin-widgets/index.ts` next to `openLightboxDialog`.
   - Test `.../Lightbox/__tests__/use-native-modal-dialog.hooks.test.tsx`: open=true opens the dialog once; open=false closes it; a native `cancel` event is prevented and calls `onClose`; a click whose target is the dialog itself calls `onClose`, a click on a child does not.
   - Type-check ui; run the test; commit; report `T11 JINI DONE (Tovu half = job 11 after R1)`.
2. Tovu: nothing in this job. The three components switch in `dedupe-11.terra-prompt.md` (T11).

### T33
Moved to job dedupe-03 (both launch-gate bindings are now passed in explicitly, so the merge no longer needs O4's answer). Nothing to do here.
