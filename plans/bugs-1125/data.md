BUGS data integrity: 8 sheets, 9 bugs covered, 4 skipped (two ledger claims no longer match the code, one retention-policy conflict, one migration prerequisite)

Anchors checked against Tovu `6ace8e8fb2`, Jini `50f8dfcd9`, and the extraction refs named below. H2142 and H2143 describe the same actor defect and count once. This was read-only. No files changed, no tests ran, and no branches were fetched.

Write each named regression first. If its source anchor or extraction prerequisite no longer matches, stop that sheet and continue independently. Keep new functions within 80 lines and complexity 10, inject dependencies through `(required, _optional = {})`, and make any new hook prop required. No theme edits.

## 1. Redirect graph writes

**Bugs covered** — `B270-create` / H1957. **BUILDER — SOL**

**Root cause**  
`createRedirect` validates the graph and counts wildcards before `persistRedirectWrite` acquires the writer lock.  
An intervening update can invalidate those checks before the insert. Import inherits the gap because it calls create.

**Failing tests first** — Jini `packages/cms/src/redirects/__tests__/redirects.write-boundaries.test.ts`. Activate “a created redirect validated against an old graph cannot commit a cycle introduced by an intervening update.” Hold create at its transaction entry, commit the competing update, then release create. Assert `RedirectLoopError`, only the committed update’s edge remains, and create emitted no event. Add “import refuses a row whose graph changed before its writer lock” using the same interleaving. Assert `REDIRECT_LOOP_DETECTED` at the rejected row’s index and that an independent valid row still imports. Mutation `validate-create-before-lock` moves graph validation back outside the transaction.

**Exact fix and order** — In Jini `packages/cms/src/redirects/redirects.ts`, keep `createRedirect(required: CreateRedirectRequired, _optional = {})`. Open the existing `deps.transaction` before `validateWriteFields`, then construct the row, check wildcard capacity, and call `insertRedirectAndRevision` inside that one boundary. Enqueue `redirect.created` after it commits, as today. Remove the now-unused `persistRedirectWrite`; do not nest its transaction. Leave `checkRedirectFieldsWouldWrite` advisory and `importRedirects` per-row. No migration.

**Extraction anchor** — Former Tovu `apps/website/src/features/redirects/redirects.ts` moved in `735d9f1303`. Jini’s writer and witness blobs are unchanged on the checked extraction refs. No special packaged check.

## 2. Atomic change-set revert

**Bugs covered** — `L079-partial-inverse-failure` / H0020. **BUILDER — NEEDS-OPUS**, because every enabled inverse must participate in rollback, including the composed memory host. A callback that merely invokes `work()` is not an atomic implementation.

**Root cause**  
`revertChangeSet` awaits inverse writes individually without a shared transaction.  
A later inverse can throw after an earlier one commits, leaving content changed while the change set still says `applied`.

**Failing test first** — Replace the known-bad pin in Tovu `apps/website/src/contracts/core/commands/__tests__/revert.unit.test.ts` with “L079: a later inverse failure rolls back earlier writes.” Use a rollback-capable fixture. Prove the first inverse actually writes, the second throws the original error, both values are unchanged after rejection, the change set stays `applied`, and no reverted event persists. At the host boundary, put “Recovery revert rolls back the first inverse when the second fails” in `apps/website/src/server/runtime/composition/modules/__tests__/change-sets-revert-atomic.integration.test.ts` with the real content kernel. Mutation `run-revert-without-transaction` bypasses the port in the command.

**Exact fix and order** — In Jini `packages/cms/src/core/commands/revert.ts`, keep `revertChangeSet(required, _optional = {})` and add required `RevertChangeSetDeps.transaction<T>(required: { work: () => Promise<T> }, _optional?: Record<string, never>): Promise<T>`. Keep the force refusal first. Run the scoped reads, preconditions, descending inverse loop, status recheck, save and outbox enqueue inside that rollback boundary. Preserve error identity and item/actor order. Thread the port through Jini `packages/cms/src/admin-http/routes/change-sets/revert.ts` and `packages/cms/src/change-sets/tool-registrations.ts`. Bind it in Tovu’s `server/routes/types.ts`, `server/runtime/composition/modules/{content,change-sets}.ts`, `site-deps/route-deps-site-providers.ts`, and `memory-deps/route-deps/assistant-and-site.ts` under `apps/website/src`. Use the same kernel as the reverter repos and outbox. Confirm page HTML reference writes and post Trash-index writes join it. If any enabled inverse cannot roll back, stop that host integration and name the adapter. No migration.

**Extraction anchor** — Tovu `apps/website/src/contracts/core/commands/revert.ts` moved in `0ec3f39a18`. The former Tovu `server/inbound/admin-http/routes/change-sets/revert.ts` is now the Jini route spec with a Tovu mount. `w3-r2allj` changes the command blob but retains the unwrapped loop. Verify Recovery and the assistant tool against the same composed transaction port.

## 3. Publish-content write attribution

**Bugs covered** — FIX 19 / H2, H2142 and H2143. **BUILDER — SOL**

**Root cause**  
`applyRepoWithUndo` and `writeRawRowCommand` substitute `{ id: principalId, kind: "user" }` when the run actor is absent.  
A bad binding therefore becomes a durable audit entry that attributes a write to a human who did not make it.

**Failing tests first** — Restore the focused witnesses from Jini `2df333941` in `packages/cms/src/publish/content/__tests__/repo-handler.actor.test.ts` and `raw-row-contributor.test.ts`. Use “refuses a write with no trusted actor before anything is written” and “refuses a send with no trusted actor before the row is written (FIX 19 / H2).” Assert `MissingMutationActorError`, unchanged data, and no change set. Keep the paired named agent-actor cases proving the recorded actor is the supplied agent. Mutation `fallback-to-user` restores the fallback at either writer.

**Exact fix and order** — In Jini `packages/cms/src/publish/content/{repo-handler,raw-row-contributor}.ts`, replace only the two actor expressions with the existing `applyRunActor({ deps, principalId })`, using `env.deps` in the repo handler. Preserve handler signatures and do not synthesize an actor in the apply port. Bring back the focused tests and two writer hunks, not the unrelated entries test from the reverted commit. Tovu `e51dcf470a` already repaired six fixture files. Supply a run actor to the remaining direct handlers in `apps/website/src/features/media/__tests__/{publish-content.apply,publish-content.overwrite,publish-content.write,publish-content.characterization,library-publish-transport}.test.ts`, the post tests `{publish-content.round-trip,publish-content.schedule-featured,publish-content.terms,publish-content.characterization,L156-characterization}.test.ts`, `features/publish-content/__tests__/backstop-batch.apply-loop.test.ts`, and `server/runtime/composition/__tests__/publish-content-manifest.test.ts`. Keep the missing-actor cases deliberately actorless.

**Extraction anchor** — Former Tovu `apps/website/src/features/publish-content/repo-handler.ts` moved to Jini. The raw-row writer is Jini-owned, with Tovu caller fixtures still in `features/publish-content/__tests__`. `w3-r2allj` retains both fallbacks. Land the fixture updates with the CMS dependency bump. No migration or special packaged check.

## 4. Media-provider credential saves

**Bugs covered** — `media-row-port-not-atomic` / H1970 and `media-revision-same-ms` / H1973. **BUILDER — SOL**

**Root cause**  
`sendProviders` sends removals and patches as separate requests, so a later refusal can leave an earlier removal committed.  
`mediaProviderSetRevision` hashes a deterministic vault ID, resettable row revision and millisecond timestamp. Delete/recreate can repeat all three.

**Failing tests first**

- **Atomic save** — Jini `packages/ui/src/features/media-providers/__tests__/react/hooks/useMediaProvidersTab.test.ts`, “one flush sends clears and edits as a single atomic request.” Queue a clear and an edit in the same flush. Assert exactly one batch carries both intents and rejection leaves the draft retryable. In Jini `packages/cms/src/admin-http/routes/media/__tests__/batch-providers.test.ts`, “a failed provider batch leaves the cleared provider and edited provider unchanged.” Inject failure at the second write of the real staged batch and assert both rows retain their prior values. Mutation `split-provider-batch-into-row-writes` restores separate writer calls.
- **Revision reuse** — Tovu `apps/website/src/server/inbound/admin-http/routes/media/__tests__/providers.test.ts`, “a pre-delete ETag cannot overwrite a same-tick recreated provider.” Freeze the clock, GET the ETag, delete and recreate the same provider with different metadata, then PUT with the old tag. Assert a different new ETag, `409 MEDIA_PROVIDERS_STALE`, and the recreated row stays unchanged. Mutation `omit-incarnation-from-provider-revision` removes the new marker from the digest.

**Exact fix and order**

1. In Jini `packages/cms/src/media/site/provider-credential-vault.ts`, make `MediaProviderCredentialVaultRepo` take a required injected `idGen`. Persist a non-secret `incarnation` in media-provider vault metadata when the provider row is first written. Preserve it on updates. Existing unstamped rows can be stamped on their next ordinary write. Add the string field to the media-provider shape in Jini `packages/platform/src/secrets/credential-sets/vault.meta.ts`. Include it in `mediaProviderSetRevision` in `provider-credential-store.ts` with the existing ID, version and timestamp. No backfill, timestamp workaround, or secret-derived input. Keep it out of response bodies.
2. In that store, add `applyMediaProviderChanges({ deps, workspaceId, removes, patches }, _optional = {})`. Each patch is `{ providerId, fields }`. Reuse the existing provider validation and pre-write sealing, then merge against the writer’s current rows in **one** `replaceWorkspace` call carrying explicit tombstones and upserts. Return `MediaProviderCredentialReadModel`. Never infer a deletion from omission. Keep the existing locked SQL planner and staged memory batch.
3. Add Jini `packages/cms/src/admin-http/routes/media/batch-providers.ts` for collection `PATCH /api/admin/v1/workspaces/:workspaceId/media/providers`. Bind `applyMediaProviderChanges` through Tovu `apps/website/src/server/runtime/composition/modules/media.ts`. Reuse the current write permission, safe error mapping and markers-plus-ETag response. Leave single-row PATCH/DELETE and conditional legacy PUT intact.
4. Add required `applyProviderChanges({ removes, patches }, _optional = {})` to the row-port contracts in Jini UI `features/media-providers/ports.ts` and admin `react/kit-media-providers.ts`. Wire it in `screens/media/api/media-api.ts` and `screens/media/media-providers-port.ts`. `sendProviders` sends one explicit batch, preserving the current pending-draft reconciliation and the separate whole-map daemon port. Do not change the hook-prop optionality ticket in this sheet.

**Extraction anchor and manual check** — Tovu `apps/website/src/features/media/{provider-credential-store,provider-credential-vault,provider-credential-store.memory}.ts` have Jini counterparts under `packages/cms/src/media/site/` on `w3-r2allj`. The Tovu SQL binding `features/media/media-provider-credential-repo.ts` and runtime composition must still inject the writer and ID source. Tovu admin `apps/admin/src/features/media/{api/media-api,media-providers-port}.ts` bind the Jini admin equivalents above. Land store and route before the UI package bump. In real Admin, clear one provider and edit another in one save, force the batch to fail on a disposable site, then reload and verify neither change persisted. Retry and verify both commit.

## 5. Static-publish verification identity

**Bugs covered** — `B226` / H1960. **BUILDER — SOL**

**Root cause**  
`InMemoryPublishCredentialVerificationCache` keys checks by workspace and target, not by the saved row verified.  
A default-only PUT triggers neither a connection probe nor compatibility invalidation, so readiness can report A’s valid result after selecting B.

**Failing test first** — Activate “B226: changing the default publishing key does not inherit the previous key’s valid check” in Tovu `apps/website/src/server/runtime/composition/modules/__tests__/publish-verification-basis.unit.test.ts`. Verify A through the existing verifier against the injected provider fake, promote unverified B with an `isDefault`-only PUT, then assert B is not ready or valid and the readiness call makes no outbound request. Mutation `cache-by-target-only` removes credential identity from cache lookup and storage.

**Exact fix and order** — In Tovu `apps/website/src/features/deployments/publish-credentials/store.ts`, expose the selected saved ID from the same metadata-only selection used by `hasDefaultForPublish`, preserving that function’s boolean contract for existing callers. In `static-publish/credentials.ts`, have the Tovu source’s successful `isConfigured` return that ID for a saved key and an explicit environment basis for the CLI fallback. In `static-publish/verify.ts`, require that same basis in cache `get` and `set`. Use the ID actually probed in `verifyPublishCredential` and `verifyPublishCredentialById`, never a fresh default lookup after the probe. Keep target-scoped `delete` invalidating that target’s entries. In `publish-agent-tools.ts`, read readiness with the selected basis. Preserve env fallback, probe admission and response shape. This sheet fixes default identity, not env-token rotation. No migration.

**Extraction anchor** — These files stay under Tovu `features/deployments/`. `tv-w3-ext-w1x` repoints the host-kit import in `static-publish/verify.ts`, not the verifier. `tv-r3-w1b` retains the target-only key. No duplicate implementation in Jini’s static-publish contracts. The composed HTTP/tool witness covers the user path.

## 6. Canonical Source Control permanent delete

**Bugs covered** — `SC-permanent-delete-canonical` / H1967. **BUILDER — SOL**

**Root cause**  
The confirmation planner loads the target through `describeCredential`, which sees only legacy Source Control rows.  
The existing remover knows how to delete canonical keys, but planning fails before it can be called.

**Failing test first** — Tovu `apps/website/src/features/permanent-delete/__tests__/deps.test.ts`, “Source Control permanent delete can confirm and remove a canonical key by ID.” Give the real planner an empty legacy lookup and a canonical fixture visible in the workspace. Assert the card names the safe label and ID, no deletion happens before approval, and confirmation removes through the canonical path only. Mutation `legacy-only-source-control-delete-lookup` removes the canonical lookup branch.

**Exact fix and order** — In Tovu `apps/website/src/features/source-control/store.ts`, keep `describeCredential(deps, { workspaceId, id })`. After a legacy miss, use the existing workspace-scoped `repo.canonical.list({ workspaceId })` and select that exact ID. This matches current list precedence and introduces no new port or decrypt. `prepareSourceControlCredentialDelete` in `server/runtime/composition/permanent-delete-deps.ts` continues to use the same loader for initial review and the confirmation recheck, and calls the existing `deleteSourceControlCredential`. Preserve grants, refusal behavior, and the existing snapshot comparison. No migration.

**Extraction anchor and manual check** — `tv-r3-w1b` retains the Tovu store and permanent-delete host adapter. The generic catalog is already Jini `packages/cms/src/trash/permanent/agent-tools.ts` and needs no edit. In a real app with chat deletion enabled, use a disposable canonical key, confirm the card, and verify the key disappears from the Source Control list. This does not revoke the token at its provider.

## 7. Newsletter campaign edits

**Bugs covered** — H1115, explicit null preheader. **BUILDER — SOL**

**Root cause**  
The catalog advertises `null` to clear the preheader.  
The update handler treats any non-string value as omission, so `null` silently preserves the old text.

**Failing test first** — Tovu `apps/website/src/features/newsletter/__tests__/tool-registrations.model-facing-errors.test.ts`, “newsletter_update_campaign clears an explicit null preheader and preserves an omitted one.” Seed a draft with a preheader, update another field without `preheader`, then update with `preheader: null`. Assert the tool result and saved row preserve the text on omission and store `null` on clear. Mutation `preheader-null-means-omitted` restores the string-only expression.

**Exact fix and order** — In `apps/website/src/features/newsletter/tool-registrations.ts`, keep `createNewsletterUpdateCampaignHandler(deps: NewsletterToolDeps)`. In the existing field merge, accept `input.preheader === null || typeof input.preheader === "string"` and otherwise keep `existing.preheader`. Leave the schema, auth, repository lookup, and `saveCampaign` call order unchanged. No migration.

**Extraction anchor** — `tv-w2all` and `tv-r3-w1b` retain the Tovu registration. The catalog and writer are already Jini `packages/user-management/src/newsletter/{agent-tools,campaign-write-service}.ts`; neither needs to change. No special packaged check.

## 8. Recovery Trash pagination

**Bugs covered** — H1052, recoverable rows stranded after a filtered page. **BUILDER — SOL**

**Root cause**  
Jini’s list route intentionally returns a sparse permission-filtered page with the real continuation cursor.  
`TrashItemsView` interprets zero visible rows as end of list, hiding the only way to reach allowed rows on later pages.

**Failing test first** — Jini `packages/admin/src/screens/trash/__tests__/pagination.unit.test.tsx`, “an empty filtered page can load the next visible trash item.” Inject the required `useTrashHook` with an empty first page and non-null cursor. Click **Load more** and assert the allowed next-page row appears. Assert the terminal empty message is not shown while the cursor exists. Mutation `empty-page-hides-continuation` restores the early return for any empty array.

**Exact fix and order** — In Jini `packages/admin/src/screens/trash/Trash.tsx`, keep `TrashItemsView(props: { controller: TrashController })`. Show the empty message only when `items` is empty **and** `nextCursor` is null. Render the existing button for a non-null cursor even with no table rows. Keep Jini `packages/cms/src/admin-http/routes/trash/list.ts` and its authorization filter unchanged. Do not add an automatic unbounded scan. No migration.

**Extraction anchor and manual check** — Former Tovu `apps/admin/src/features/trash/Trash.tsx` is now a host binding for the Jini view. `r3-w1bj` retains the same faulty early return. In real Admin, use a role with access to one Trash kind, put 50 newer inaccessible rows ahead of an allowed row, and verify **Load more** reaches it without exposing the newer rows.

## Skipped

- **`media-tool-unconditional-save` / H1974** — The call omits a whole-set revision, but the claimed whole-set write is absent. Tovu `features/media-generation/provider-credential-save.ts` and its Jini destination `packages/cms/src/media/site-generation/provider-credential-save.ts` on `w3-r2allj` replace the planner with a single-provider write, no tombstones, and a merge against current metadata. The existing test asserts unrelated rows survive. A stale confirmation for the *same* key would be a different report.
- **H1440, saved keys past 50 silently hidden** — Tovu `other-site-keys.ts` reports `omittedCount`, and Jini `packages/admin/src/security/host/CopyKeysDialog.tsx` renders “more not shown.” The explicit cap remains. Removing it is a separate inventory requirement.
- **UI re-check #1, older Trash rows show more than 30 days** — Tovu `trash-retention.ts` explicitly preserves deadlines stamped under the old policy. The row countdown and sweeper use that stored `purgeAfter`. Do not shorten or relabel an actual deadline without an owner decision. Route the misleading header and Media Trash’s missing countdown to Admin UI. Browser check with one old and one new row.
- **FIX 19 restore-ledger `actor_kind` column** — The actor kind is already recorded in `detail_json.actor.kind`. Jini `packages/db/src/recovery/journal-schema.ts` owns a separate, unversioned `ops/database-journal.db`. The content DB’s ADR-066 TS chain cannot migrate it. Leave the column pending a versioned journal migration decision.
