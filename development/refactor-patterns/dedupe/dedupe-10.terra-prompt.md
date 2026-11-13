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
- **T11** EXTRACT SHARED HELPER — risk M; est. −35 lines; divergence: none
  - tests: cd apps/admin && npx vitest run --maxWorkers=2 src/components/AssistantDock src/features/pages src/features/media
- **T33** moved to job dedupe-03.

## Recipes (exact before → after)

## JR01 isRecord copies -> core `isObjectRecord` (EXTRACT, core + 11 packages) - OWNER DECISION: positional guard
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
4. J46 step 1: `daemon/src/core/is-record.ts` becomes `export { isObjectRecord as isRecord } from '@jini-ai/core/records';` (the "Positional on purpose" comment now lives on core's doc). J46's 19 import edits stay as written.
NOT touched (one line each): array-permissive copies (agent-runtime claude-segment-usage, qoder-stream, pi-rpc/internal, elevenlabs; agentic a2ui/surface-properties; chat run-activity; search registry) change behavior if replaced; shape-typed guards (commerce `Candidate`, search contribution `Shape`, agent-runtime json-event-stream `JsonObject` export); protocol/delegated-result.ts (protocol does not depend on core).

### T11 (ONLY if the owner approves): `useNativeModalDialog`
1. Create `apps/admin/src/hooks/use-native-modal-dialog.hooks.ts`.
   - Copy `useMessageOverflowModal`'s body (after T10) as `useNativeModalDialog({ open, onClose }: { open: boolean; onClose: () => void }, _optional: Record<string, never> = {}): NativeModalDialogController`.
   - Copy its controller interface as `NativeModalDialogController`, field docs included.
2. Delete the three `*.hooks.tsx`/`.ts` hook bodies. In each component, replace:
   - the import with `import { useNativeModalDialog } from "@/hooks/use-native-modal-dialog.hooks"`;
   - `useModal?: typeof useX` with `useModal?: typeof useNativeModalDialog`;
   - the default `useModal = useNativeModalDialog`;
   - the call with `useModal({ open: …, onClose })`.
3. Move each deleted file's `@file` paragraphs into a "Callers" section of the new file's header: the single-instance notes for ThemePagesTab and Media, and the ImagePreviewModal lineage.
4. Retarget the three hook tests to the new hook.

### T33
Moved to job dedupe-03 (both launch-gate bindings are now passed in explicitly, so the merge no longer needs O4's answer). Nothing to do here.
