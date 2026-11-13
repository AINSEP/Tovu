# Terra job dedupe-08: Jini cms

READY (2026-11-13). Self-contained. Background and the reason for every decision: `development/refactor-patterns/dedupe/PLAN.md` (Tovu repo). Repo: the Jini clone you are given (Jini only; paths below are relative to the Jini repo root).

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
- **J23** EXTRACT SHARED HELPER — risk M; est. −45 lines; divergence: YES (not changed, owner-visible): lifecycle transitions write delegatedBy*=null and never stamp the watermark, while write-service persistWithRevision records delegation and stamps watermark. Kept as-is; flagged as possible bug for owner
  - tests: cd packages/cms && npx vitest run --maxWorkers=2 src/content-types/__tests__/lifecycle.test.ts src/content-types/__tests__/write-service.test.ts
- **J24** EXTRACT SHARED HELPER — risk L; est. −22 lines; divergence: none
  - tests: cd packages/cms && npx vitest run --maxWorkers=2 src/forms/__tests__/write-service.test.ts
- **J36** EXTRACT SHARED HELPER — risk L; est. −30 lines; divergence: none for entries/content-types (byte-identical); taxonomy keeps its own enqueue body (top-level name/occurredAt), shares only the deps type
  - tests: cd packages/cms && npx vitest run --maxWorkers=2 src/entries/__tests__/repo.memory.cov-j2.test.ts src/content-types/__tests__/repo.memory.cov-j2.test.ts src/taxonomy/__tests__/repo.memory.test.ts
- **J37** MERGE INTO EXISTING — risk L; est. −15 lines; divergence: none (same id-keyed replace-or-append)
  - tests: cd packages/cms && npx vitest run --maxWorkers=2 src/media/__tests__ src/core/commands/__tests__
- **J40** EXTRACT SHARED HELPER — risk L; est. −20 lines; divergence: none (placementId still minted inside the lock, after the target check). #89 region-area-service KEEP (only the 6-line authorize call matches)
  - tests: cd packages/cms && npx vitest run --maxWorkers=2 src/widgets/__tests__/embed-service.test.ts
- **J41** EXTRACT SHARED HELPER — risk L; est. −22 lines; divergence: none. #186 KEEP (region-area entriesWriteDeps has a different onWritten and deps type)
  - tests: cd packages/cms && npx vitest run --maxWorkers=2 src/widgets/__tests__/write-service.test.ts
- **J44** EXTRACT SHARED HELPER — risk L; est. −30 lines; divergence: none
  - tests: cd packages/cms && npx vitest run --maxWorkers=2 src/content-types/__tests__/tool-registrations.test.ts src/entries/__tests__/tool-registrations.test.ts
- **J47** EXTRACT SHARED HELPER — risk L; est. −28 lines; divergence: none
  - tests: cd packages/core && npx vitest run --maxWorkers=2 src/settings/__tests__/purge-service.test.ts
- **J49** EXTRACT SHARED HELPER — risk L; est. −32 lines; divergence: none (seq = record.version, recordedAt = record.updatedAt, workspaceId = record.workspaceId in all 3 sites)
  - tests: cd packages/cms && npx vitest run --maxWorkers=2 src/redirects

- **X15J** MOVE TYPE (framework-neutral home for a Tovu import) — risk L; est. 0 lines here (enables Tovu X15, −12); divergence: none (type moves, the `/express` subpath keeps re-exporting it)
  - tests: cd packages/cms && npx tsc --noEmit -p tsconfig.json ; npx vitest run --maxWorkers=2 src/forms/express

## Recipes (exact before → after)

## J23 content-type lifecycle (EXTRACT, cms)
lifecycle.ts: add `persistLifecycleTransition` (body = the `deps.repo.transaction({ fn: … save + appendRevision(op 'field-change', delegated* null) … })` block) and use it in deprecate/reactivate/tombstone. write-service.ts: add exported `authorizeContentTypeManage({ deps, input, action }, _optional = {})` returning `null` or the `ForbiddenError` built with message `principal '${actorId}' cannot ${action} (${reason})`; call sites pass action exactly so the old text is reproduced: "deprecate content type 'KEY'", "reactivate content type 'KEY'", "tombstone content type 'KEY'", "register a content type", "update content type 'KEY'". Keep the "AFTER the save commits" comment in tombstone. Do NOT add watermark/delegation to lifecycle (owner decision).

## J24 forms write-service (EXTRACT, local)
Add `formCommandDeps({ deps }, { outbox } = {})` returning `{ clock: deps.clock, idGen: deps.idGen, changeSets: deps.changeSets, outbox, authorize: deps.authorize }` and `requireFormDefinition({ repo, workspaceId, formId })` (findById + FormDefinitionNotFoundError with the existing message). Use in create/update/setStatus.

## J36 cms kernel outbox adapter (EXTRACT)
New `packages/cms/src/core/kernel-outbox.ts`:
```ts
import { nowIso as kernelNowIso } from "@jini-ai/core/primitives";
import type { Clock } from "@jini-ai/core/primitives";

/** The wrapped real `core/ports` outbox plus what a full `DomainEvent` needs beyond `{name,payload}`. */
export interface KernelOutboxAdapterDeps {
  outbox: { enqueue(event: { id: string; workspaceId: string; name: string; occurredAt: string; payload: Record<string, unknown> }): Promise<void> };
  clock: Clock;
  idGen: { newId(): string };
  /** <MOVE here the entries/repo.memory.ts paragraph starting "`workspaceId` is REQUIRED and is declared on the wrapped port's event type on purpose" through "…not a contract."> */
  workspaceId: string;
}

/** Adapts a real `core/ports` `OutboxPort` into the narrow `{enqueue({name,payload})}` shape the content write services declare locally. */
export function toKernelOutbox(required: KernelOutboxAdapterDeps, _optional: Record<string, never> = {}): { enqueue(event: { name: string; payload: Record<string, unknown> }): Promise<void> } {
  return {
    enqueue: async (event) => {
      await required.outbox.enqueue({ id: required.idGen.newId(), workspaceId: required.workspaceId, name: event.name, occurredAt: kernelNowIso({ clock: required.clock }), payload: event.payload });
    },
  };
}
```
entries/repo.memory.ts: `export function toEntryOutbox(deps: KernelOutboxAdapterDeps): OutboxPort { return toKernelOutbox(deps); }`. Keep the first doc sentence and point it at core/kernel-outbox.ts for the rationale. content-types/repo.memory.ts: same, with `toContentTypeOutbox`. taxonomy/repo.memory.ts: the parameter becomes `deps: KernelOutboxAdapterDeps`, the body stays, and the "Taxonomy is the case that rules out reading the tenant off the event…" sentence stays in its doc. Remove now-unused `kernelNowIso`/`Clock` imports. Public names stay unchanged (they are exported through index.ts).

## J37 cms memory save -> core upsertRecord (MERGE)
In core/commands/repo.memory.ts `save`, media/repo.memory.ts rendition `save(record: AssetRenditionRecord)` and blob-gc `save(entry: BlobGcJournalEntry)`: replace the findIndex/push/assign body with `upsertRecord({ records: this.rows, record, identity: { id: record.id } });` (the blob-gc one uses `record: entry, identity: { id: entry.id }`). Import `upsertRecord` beside the existing `matchesRecordFields` import from "@jini-ai/core/records". Do NOT touch the media primary `save` (it calls preserveMediaCreator).

## J40 embed-service (EXTRACT, local)
Add file-private `editEmbedHostBody` (signature in TSV). Body: `requireWidgetPermission({ authorize: deps.authorize, actor: input.actor, workspaceId: input.workspaceId, permission: "widgets.place" })`, then `withEntryLock({ key: \`${input.workspaceId}::${input.hostEntryId}\`, fn: async () => { const host = await loadEmbedHost(deps, input.workspaceId, input.hostEntryId); const { nextBodyJson, result } = await edit({ host }); assertGuardrails(deps, hostBodyType(host), nextBodyJson); const entry = await writeEmbedHost({ deps, input, host, nextBodyJson }); return { ...result, entry }; } }, deps.entryLocks ? { locks: deps.entryLocks } : {})`. Use `EmbedHost` (the return type of loadEmbedHost). Each public function calls it with its edit callback:
- insert: `assertEmbedTargetIsLiveWidget…; const placementId = deps.ids.newId(); return { nextBodyJson: appendEmbed(host.record.bodyJson, placementId, input.widgetEntryId), result: { placementId } };`
- remove: the containsEmbedWithPlacementId check (KEEP the "C4d fix" comment) and then `return { nextBodyJson: removeEmbedByPlacementId(...), result: {} };`
- reorder: the count check, the target validation loop (KEEP the "Round-2 external-audit fix" comment), then `reorderEmbedSlots(...)` with `result: {}`.
The return types stay as now.

## J41 widgets write-service (EXTRACT, local)
```ts
function assertValidWidgetConfig({ widgetType, config }: { widgetType: string; config: Record<string, unknown> }, _optional: Record<string, never> = {}): void {
  const registration = findWidgetTypeRegistration({ raw: widgetType });
  if (!registration) throw new WidgetTypeUnregisteredError({ message: `widget type '${widgetType}' is not registered`, widgetType });
  const validation = validateWidgetConfig({ schema: registration.configSchema, config });
  if (!validation.valid) throw widgetConfigValidationError({ registration, fieldErrors: validation.fieldErrors });
}
function instanceEntriesWriteDeps({ deps, workspaceId }: { deps: WidgetWriteServiceDeps; workspaceId: UUID }, _optional: Record<string, never> = {}) {
  return { ...entriesWriteDeps(deps, workspaceId), onWritten: (entry: EntryRecord) => extractAndStoreInstanceRefs(deps, workspaceId, entry) };
}
```
create/update/import: replace the lookup+validate blocks with `assertValidWidgetConfig({ widgetType: <input.widgetType | currentPayload.widgetType>, config: input.config })`. KEEP each site's why-comment ("`input.widgetType` is typed `WidgetTypeKey` but only ASSERTED…" and "`currentPayload.widgetType`…") directly above its call. If WidgetTypeUnregisteredError's `widgetType` field is typed WidgetTypeKey, type the helper param as `WidgetTypeKey`. Replace the three `deps: { ...entriesWriteDeps(deps, input.workspaceId), onWritten: … }` with `deps: instanceEntriesWriteDeps({ deps, workspaceId: input.workspaceId })`. The entriesWriteDeps doc ("`onWritten` is deliberately NOT included…") stays.

## J44 cms lifecycle tool handlers (EXTRACT)
content-types/tool-registrations.ts, above buildContentTypesRegistrations:
```ts
/** deprecate/reactivate/tombstone take the same `{ key, expectedVersion }` tool input. */
function contentTypeLifecycleHandler({ routeDeps, transition }: { routeDeps: ContentTypesToolDeps; transition: (required: { deps: ReturnType<typeof contentTypesDeps>; input: LifecycleTransitionInput }) => Promise<Result<{ contentType: ContentTypeRecord }, Error>> }, _optional: Record<string, never> = {}): ToolHandler {
  return async (ctx) => {
    const input = requireInputRecord({ input: ctx.input });
    return fromContentTypeResult(() => transition({ deps: contentTypesDeps(routeDeps), input: { actorId: ctx.principal.id, principalKind: AGENT_TOOL_PRINCIPAL_KIND, workspaceId: routeDeps.workspaceId, key: requireString({ input, key: "key" }), expectedVersion: requireNumber({ input, key: "expectedVersion" }) } }));
  };
}
```
The handlers become `collections_content_type_deprecate: contentTypeLifecycleHandler({ routeDeps, transition: deprecateContentType }),` (and the same for reactivate and tombstone). Import `LifecycleTransitionInput`, `Result`, `ContentTypeRecord` and `ToolHandler` where they are missing. entries/tool-registrations.ts gets the same pattern: `entryStatusHandler({ routeDeps, transition })` where transition is `typeof publishEntry`, with key `id` and `fromEntryResult`, used for publish and unpublish.

## J47 purge-service (EXTRACT, local closure)
Inside the transaction callback after `now`: `const appendPurgeRevision = ({ scope, principalId, value }: { scope: "user" | "workspace"; principalId: string | null; value: { settingId: string; defVersion: number } }) => deps.repo.appendRevision({ entityKind: "value", settingId: value.settingId, scope, workspaceId: input.workspaceId, principalId, op: "purge", beforeJson: null, afterJson: null, defVersion: value.defVersion, actor: input.callerPrincipalId, originPluginId: null, changeSetId: null, createdAt: now });`. The three call sites pass ("user", input.principalId), ("workspace", null) and ("user", targetPrincipalId). KEEP the "defensive: every setting_values_user row…" comment.

## J49 redirects (EXTRACT)
redirects.ts:
```ts
function redirectRevision({ record, input, tombstoned }: { record: RedirectRecord; input: { actorId: string; pluginId?: string | undefined }; tombstoned: boolean }, _optional: Record<string, never> = {}): RedirectRevision {
  return { redirectId: record.id, workspaceId: record.workspaceId, seq: record.version, state: record, tombstoned, actorId: input.actorId, pluginId: input.pluginId, recordedAt: record.updatedAt };
}
async function persistRedirectWrite({ deps, record, revision, change }: { deps: RedirectsWriteDeps; record: RedirectRecord; revision: RedirectRevision; change: "created" | "updated" }, _optional: Record<string, never> = {}): Promise<{ record: RedirectRecord }> {
  await deps.transaction(async () => { await insertRedirectAndRevision({ db: deps.db, record, revision }); });
  await enqueueMutatedEvent(deps, record, change);
  return { record };
}
```
create: `return persistRedirectWrite({ deps, record, revision: redirectRevision({ record, input, tombstoned: false }), change: "created" });`. Do the same in update with "updated". tombstone: `const revision = redirectRevision({ record, input, tombstoned: true });` and the rest is unchanged. Remove `now`/`version` locals only if they become unused. path-key.ts: add `export function redirectPrefixMatches({ path, pattern }: { path: string; pattern: string }, _optional: Record<string, never> = {}): boolean { if (path === pattern) return true; return path.startsWith(pattern.endsWith("/") ? pattern : \`${pattern}/\`); }`. repo.memory.ts and sql/repo.ts lookupLongestPrefix filters call it (the memory filter keeps its status/matchType/override lines first).

## X15J `FormSubmissionRedirectResult` gets a framework-neutral home (cms)
Why: Tovu's page renderer needs this union; today it is only exported from `@jini-ai/cms/forms/express`, so a renderer would name an Express subpath (owner rule: no specific server framework in Jini public contracts a host must use).
1. MOVE the `export type FormSubmissionRedirectResult = …` union (5 members, with any doc above it) from `packages/cms/src/forms/express/handler.ts` to the end of `packages/cms/src/forms/types.ts` (already re-exported by `src/forms/index.ts` via `export * from "./types.js"`, i.e. `@jini-ai/cms/forms`, a "universal" entry).
2. In `handler.ts` add `import type { FormSubmissionRedirectResult } from "../types.js";` (merge into the existing `../types.js` type import) and `export type { FormSubmissionRedirectResult } from "../types.js";` so `@jini-ai/cms/forms/express` keeps exporting the same name (compatibility; removing it would be a breaking release).
3. Type-check cms; run the listed tests. Commit. The Tovu half (X15) waits for the Jini release (gate R1) and runs in job dedupe-11.

