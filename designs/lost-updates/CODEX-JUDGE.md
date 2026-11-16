Software Architect + Database(Review): **Verdict: needs rework.**

Reviewed design commit `1447fcdf` against Tovu `65302ee5` and Jini `02edbb68`, using read-only Git commands. The TSV’s class totals and 35 `partial` labels reproduce. Its classifications and rollout do not establish that the races are closed. No tests were executed.

Below, design references mean `designs/lost-updates/DESIGN.md` at the design commit. Source references mean the pinned implementation revisions.

1. **Blocker — S1 omits an access writer that can invalidate the new version guarantee.**

   **Evidence:** S1 names the whole-record save, OAuth callback and refresh (`DESIGN.md:282`). However, `apps/website/src/features/external-mcp/external-mcp-repo.ts:185` implements `updateAccessIfCurrent`: it changes enabled state and tool grants without changing `version`. It is reachable through Jini’s `applyExternalMcpAccess` (`packages/mcp/src/federation/hosted/store.ts:109`).

   After this access update, an admin holding the previous record version could still pass the proposed version CAS and restore old grants. Adding a version predicate only to the whole-record writer does not protect access revocation.

   S1 also labels the work Tovu-only, although the real `saveExternalMcpServer` lives in Jini (`packages/mcp/src/federation/hosted/store.ts:1585`); Tovu binds it through `apps/website/src/features/external-mcp/external-mcp-store.ts:6`.

   **Fix:** Include the hosted MCP contracts, service, access writer and host bindings in S1. Define which mutations advance the editing revision. Test access revocation followed by a stale whole-record save, asserting that grants stay revoked.

2. **Major — SAFE site 58 can overwrite newer search bookkeeping.**

   **Evidence:** `SITES.tsv:59` calls this per-document state safe. The actual `put` blindly replaces revision, status, attempts and task identity (`apps/website/src/features/site-search/index-state-store.ts:92`).

   Jini checks the prior revision in application code (`packages/search/src/indexer.ts:122`), then awaits provider resolution before writing the pending plan (`:159`). An older backfill operation can pass that check, pause, and subsequently overwrite a newer event’s bookkeeping. The later `settle` CAS does not protect the initial blind `put`.

   These paths can overlap: the host subscribes event handling separately (`apps/website/src/server/runtime/composition/modules/site-search.ts:299`) from maintenance backfill (`:386`).

   **Fix:** Reclassify as REAL. Make pending-plan admission conditional on the stored revision and define ownership for same-revision attempts/tasks. Add an event-versus-backfill interleave test.

3. **Major — SAFE site 74 is shared across publish runs.**

   **Evidence:** `SITES.tsv:75` justifies safety because the baseline is “written by the run.” Its conflict key is actually workspace, peer, entity type and entity ID; `run_id` is an overwritten value (`apps/website/src/platform/db/repos/publish-content-baseline-repo.ts:52`).

   The apply loop commits content, awaits progress persistence, and then updates the baseline (`apps/website/src/features/publish-content/apply-loop.ts:463`, `:473`, `:913`). Another run can apply newer content and write its baseline during that interval, after which the first run overwrites it. Ordinary imports explicitly do not acquire the cross-domain operation lock (`features/publish-content/execute-import.ts:14`).

   **Fix:** Reclassify as REAL. Fence baseline advancement against the content application it represents, or serialize the content-and-baseline operation at the shared entity scope. Test delayed baseline persistence across two runs. A unique run ID alone is insufficient.

4. **Major — GUARDED site 19 still permits stale, basis-less HTML replacement.**

   **Evidence:** `SITES.tsv:20` marks `email_template_edit` guarded. Its schema requires only `id` and `html` (`apps/website/src/features/email-templates/agent-tools.ts:59`). The handler forwards input without requiring a version (`tool-registrations.ts:67`).

   `editEmailTemplate` reads the current HTML-store version and checks the caller’s version only when supplied (`operations.ts:209`). A tool can therefore read version 1, wait while someone saves version 2, then replace the HTML without a basis. The server’s fresh read protects only against subsequent interleaving.

   **Fix:** Reclassify as REAL-OPT and include its mandatory carrier work in the required rollout. Require the read tool’s version in schema and handler; test a delayed basis-less edit.

5. **Major — S3 closes server interleaving but leaves stale-editor overwrites authorized.**

   **Evidence:** S3 explicitly specifies “No client basis: these are field patches” (`DESIGN.md:284`). Yet policy updates accept both name and description, and the route provides no version (`apps/website/src/server/inbound/admin-http/routes/users/update-policy.ts:13`, `:50`). Jini merges those submitted values into the current row (`packages/user-management/src/server/admin-crud-service.ts:450`).

   An identity lock prevents two server read-modify-write sequences from overlapping. It cannot detect that submitted fields came from an old screen. A stale description can still overwrite a newer description after acquiring the lock. This also contradicts M3’s mandatory person/tool basis.

   **Fix:** Carry and enforce a basis for role/policy edits, or obtain an explicit, scoped LWW decision. Test stale requests that arrive after the competing transaction has completed.

6. **Major — S6’s description of posts is factually wrong and misses existing implementation ownership.**

   **Evidence:** The design calls posts strength B—application comparison followed by a blind write (`DESIGN.md:62`, `:287`; `SITES.tsv:50`).

   `persistUpdatedPost` already calls `saveIfVersion` when a basis exists (`apps/website/src/features/post/post.ts:1721`). That repository method performs `UPDATE … WHERE workspace_id … AND version …` and refreshes the search projection only after success (`features/post/repo.ts:177`). Existing tests cover this contract (`features/post/__tests__/repo.save-if-version.test.ts:16`).

   Posts also already implement no-op detection and live-basis rechecking (`post.ts:1908`, `:1978`), with a dedicated suite (`__tests__/post.noop-save.test.ts:103`).

   **Fix:** Keep the REAL-OPT classification for remaining unconditional callers, but rewrite its evidence and S6 around extending the existing conditional path. Preserve its projection, invalidation and revision behavior. Do not introduce another conditional-save implementation.

7. **Major — S9’s credential migration is aimed at an obsolete storage model.**

   **Evidence:** Migration 0043 proposes a version column on an unidentified media-provider credential table (`DESIGN.md:228`). Migration 0012 already moved `media_provider_credentials` into `secrets_vault` and dropped the source table (`apps/website/src/platform/db/migrations/0012_secrets_vault.ts:17`, `:334`). The vault already has a revision column (`:44`).

   Media replacement uses the vault writer lock (`features/media/media-provider-credential-repo.ts:15`) and batches revision-conditional puts/deletes (`provider-credential-vault.ts:112`). The remaining stale-tab problem is the missing client basis, including whole-map omission/deletion semantics.

   Rows 83 and 85 are also inaccurately described as unguarded write-only replacements: both services delegate to `writeAssistantVault`, which passes `expectedRevision` (`assistant/assistant-vault.ts:75`).

   **Fix:** Remove the speculative credential column from 0043. Extend the existing vault revision owner with a deliberate public carrier and whole-map conflict policy. Correct rows 83/85 and map vault conflicts at their HTTP boundaries.

8. **Major — S0 cannot deliver its promised no-event/no-record behavior through the stated changes.**

   **Evidence:** M5 requires no write, event or revision record for an unchanged patch; S0 limits changes to the five services (`DESIGN.md:141`, `:280`).

   Forms computes and writes inside `executeCommand`’s mutation callback (`packages/cms/src/forms/write-service.ts:239`). Returning the existing record from that callback still causes the gateway to build and insert a change set and its event (`packages/cms/src/core/commands/command.ts:115`, `:127`). Equality alone cannot suppress those effects.

   **Fix:** Specify how an authorized no-op passes through the command owner without generating mutation records/events, preserving authorization and idempotency semantics. Add that contract change and its callers to S0. Define domain-specific comparison fields—for plugins, `version` is business content and `revision` is bookkeeping.

9. **Major — Plugin activation needs concurrency rules for compensation and runtime effects.**

   **Evidence:** S9 treats activation as a normal conditional repository update (`DESIGN.md:290`). The actual lifecycle saves first and then runs load/unload effects (`packages/plugins/src/host/activation.ts:192`). On failure, compensation writes the previous record or deletes the activation; compensation errors are swallowed (`:66`).

   A newer activation can land while the earlier enable hook awaits. The earlier compensation must not overwrite/delete that newer state. Forward-write CAS alone also does not ensure that load/unload completion matches the final durable activation.

   **Fix:** Specify ownership and fencing for effects and compensation. Undo must target the exact revision created by the failed operation. Surface failed compensation with actionable details. Add delayed-enable-versus-disable and failed-compensation tests to S9.

10. **Major — The shared error contract is incompatible with the proposed intermediate rollout.**

    **Evidence:** M6 mandates the core body/rule, and T1 requires `RecordVersionConflictError` (`DESIGN.md:158`, `:243`). S6 explicitly retains domain error classes; convergence is optional S11 (`:287`, `:292`).

    For example, `PostVersionConflictError` extends `Error` and carries versions without the core record-kind/ID contract (`apps/website/src/features/post/post.ts:1003`). Core `versionConflictBody` requires the core error, while `versionConflictRule` identifies that constructor (`packages/core/src/optimistic-concurrency.ts:166`, `:241`).

    **Fix:** Land explicit error adapters or compatible subclasses with each domain step. Define wire bodies and model rules for every retained class. Required conflict UX and test success cannot depend on optional S11.

11. **Major — The test and commit sequence has concrete gaps.**

    **Evidence:**
    
    - S7 deletes the “dead” forms blind branch, but the existing suite directly calls that branch and requires its behavior (`packages/cms/src/forms/__tests__/repo.lost-update.test.ts:50`). Those test updates are absent from S7’s caller list.
    - T2 waits for both reads before release (`DESIGN.md:248`). After S3 puts reads inside the exclusive identity transaction, the second read cannot occur until the first call releases its lock (`apps/website/src/features/identity/repo.ts:51`). That barrier can deadlock the repaired implementation.
    - Sequential service-level T1 cannot distinguish an application comparison from SQL CAS: the second service call can reject during its preliminary comparison. The design does not assign forced post-comparison interleaving tests to every strength-B domain.
    - The cited dialect fixture uses real `@jini-ai/db` implementations (`packages/cms/src/core/__tests__/support/dialect-matrix.ts:6`). It is neither a memory-fake matrix nor compliant with the brief’s package-test isolation rule.

    **Fix:** List existing test changes per commit. Separate stale-client, repository-CAS, serialization and effect tests. Design barriers around the intended locking model. Put real cross-package SQL integration in the approved integration-test host; use interface fakes for package tests.

12. **Major — The target explicitly defers mandatory size constraints and places reusable UI behavior in Tovu.**

    **Evidence:** `DESIGN.md:321` acknowledges oversized touched files and directs that size work remain separate. Existing examples include the 710-line identity repository and the post implementation extending past line 2000. No prerequisite split or approved exception establishes a compliant target.

    S0b also creates a generic shared conflict notice in Tovu (`DESIGN.md:281`). Its keep/load/copy lifecycle is reusable admin behavior under the repository’s Jini-first rule; record labels and fetch bindings are host-specific inputs.

    **Fix:** Make required size slices prerequisites or obtain explicit exceptions before estimating delivery. Put reusable conflict presentation/lifecycle in the appropriate Jini package with typed injected ports; retain Tovu’s HTTP and feature bindings in the host.

The classification checks covered these **25 distinct inventory rows**, including 22 marked SAFE, LWW-OK or FP:

| Sites | Source checked | Assessment |
|---|---|---|
| 10, 12 | Jini `catalog-tools.ts:66`; `catalog/repo.ts:201` | Current callers create fresh IDs; price replacement uses the product lock. |
| 19 | Tovu email-template schema, handler and operations | REAL-OPT; finding 4. |
| 24, 25 | Tovu `identity/mfa.repo.ts:22`; Jini `mfa/service.ts:84` | Proof consumption and factor advancement use the enclosing identity transaction. |
| 35 | Tovu `identity/repo.ts:706` | Stored revocation predicate exists. |
| 37, 38 | Tovu `mail/retention.ts:22` | Direct conditional privacy scrubs. |
| 39 | Tovu `members/repo.ts:95` | Conditional identity upsert exists, including unlink/subject fences. |
| 49 | Tovu `post/post.ts:1721`; `post/repo.ts:177` | Optional basis gap remains; strength-B claim is false. |
| 55–57 | Tovu `settings/repo.ts:257`; Jini settings `write-service.ts:317` | Inner ledger writes; caller basis remains the relevant gap. |
| 58 | Search store, indexer and host scheduling | REAL; finding 2. |
| 59, 60 | Search watermark/pointer store and maintenance loop | Maintenance is sequential; promotion compares pointer identity. |
| 62 | Tovu `theme/page-publication.ts:39` | Synchronous read-modify-write prevents same-process interleaving. “One boolean” misstates the persisted allowlist. |
| 67 | Tovu `form-delivery-repo.ts:239` | Read and lease admission share the receiver lock. |
| 74 | Publish baseline repository and apply loop | REAL; finding 3. |
| 77–79 | Tovu webhook repository; Jini `webhooks/delivery.ts:308` | Current delivery callers supply the attempt fence. |
| 83, 85 | Assistant credential services and vault writer | Existing revision CAS; LWW rationale is inaccurate. |
| 96 | Tovu `routes/sites/sites-home.ts:47` | Synchronous local configuration setter; no asynchronous read-modify-write shown. |

I did not verify every remaining classification, execute dialect races, or establish a corrected global risk count. The design’s 28-site total should not be retained as a verified result.

## Recurring mistake classes

- Distinguish server-side serialization from protection against an already-stale client submission.
- Every writer of protected content must participate in revision advancement, including specialized access and security mutations.
- Establish concurrency scope from the actual conflict key; a run-owned operation can still mutate a record shared across runs.
- Define no-op behavior across the complete command/event lifecycle, beyond skipping the primary row write.
- Treat compensation and asynchronous effect completion as concurrent writes requiring their own ownership and fencing.
