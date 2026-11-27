# bugd-data — Tovu working-tree handoff

No commits, installs, builds, tests, typechecks or linters in this dispatch.
Regressions are authored before production edits; execution and named mutations are deferred to the coordinator.

## Authorized constraints

- Tovu only, no subagents, `.git` read-only; no manifests, lockfiles, releases or themes.
- Follow sheets 4a, 4b and 2 with coordinator overrides. Jini owns store/command logic.
- Reuse the existing vault ID source and shared content kernel; keep bindings thin.
- Test seams: real media HTTP routes/repo under a frozen clock; rollback-capable command fixture; real site SQL Recovery with an injected failing second inverse and final enqueue failure.
- Invariants: fresh insert IDs and stable rotation IDs; descending inverse order, original error identity, content/revision/Trash/reference/ledger/outbox rollback.
- Pattern priming: the supplied design explicitly names the existing constructors, route registration and `kernel.transaction(work)` binding; use those approved patterns without additional abstractions.

## Completed source commit units, in order (coordinator commits)

1. `fix(media): wire fresh provider vault identities` — sheet 4a / H1973.
   - Required root `idGen` goes to SQL/memory repo construction and route store writes. The existing secure-card host spread already forwards the Jini tool's injected source.
   - Regression authored first: `a pre-delete ETag cannot overwrite a same-tick recreated provider`, parameterized with changed and identical safe metadata. Raw PUT echoes the original tag and must get 409 `MEDIA_PROVIDERS_STALE`; the recreated DTO and vault row stay unchanged.
   - Existing legacy-envelope regression now pins `fresh-vault-1` for the canonical row and asserts that key rotation retains it; historical alias/envelope checks remain.
   - Mutation `reuse-deterministic-vault-id-on-create` restores deterministic insert identity: both same-tick cases must fail.
   - Existing constructor/store fixtures were wired only to satisfy the new required ID dependency. No new fixture test cases beyond the sheet.
   - Files:
     - `apps/website/src/features/media-generation/__tests__/provider-credential-save.unit.test.ts`
     - `apps/website/src/features/media-generation/__tests__/providers-tools.test.ts`
     - `apps/website/src/features/media-generation/__tests__/tool-registrations.test.ts`
     - `apps/website/src/features/media/__tests__/media-producing-previews.test.ts`
     - `apps/website/src/features/media/__tests__/provider-credential-store.memory.test.ts`
     - `apps/website/src/features/media/__tests__/provider-credential-store.rethrow.test.ts`
     - `apps/website/src/features/media/__tests__/provider-credential-store.test.ts`
     - `apps/website/src/features/media/media-provider-credential-repo.ts`
     - `apps/website/src/platform/db/repos/__tests__/media-provider-credential-repo.test.ts`
     - `apps/website/src/platform/db/sqlite/__tests__/repo-transactions.sqlite.test.ts`
     - `apps/website/src/server/inbound/admin-http/routes/media/__tests__/provider-catalog.test.ts`
     - `apps/website/src/server/inbound/admin-http/routes/media/__tests__/providers.test.ts`
     - `apps/website/src/server/inbound/admin-http/routes/media/deps.ts`
     - `apps/website/src/server/runtime/composition/memory-deps/route-deps/assistant-and-site.ts`
     - `apps/website/src/server/runtime/composition/modules/media.ts`
     - `apps/website/src/server/runtime/composition/site-deps/route-deps-assistant-mcp.ts`

2. `fix(recovery): bind reverts to the content transaction` — sheet 2 / L079 SQL half.
   - Required `revertTransaction` is carried through the route type/slice to HTTP's `transaction`; the assistant's existing `ChangeSetToolDeps` union receives the same composed function. SQL delegates to the shared `kernel.transaction(work)`.
   - The existing page HTML, entry-ref and menu kernels were inspected and already share that same kernel object; no edits or new connection were needed there.
   - Unit regression authored first: `L079: a later inverse failure rolls back earlier writes.` It records both attempts, observes the first write inside the fixture transaction, rethrows the sentinel by identity, and asserts both original values, unchanged applied ledger and no reverted event. Mutation `run-revert-without-transaction` calls the command body directly.
   - New real-site integration cases: `Recovery revert rolls back the first inverse when the second fails`, post/delete, page-html/update and menu/update on SQLite and PGlite. The second inverse verifies the kernel transaction is active and reads the first persisted restore before throwing. Fresh reads compare content/version, revisions, Trash, entry refs, applied ledger and all outbox event IDs/payloads. Mutation `sql-revert-runs-outside-content-kernel` replaces the SQL runner with direct `work()`.
   - New `a final outbox failure also rolls back the reverted status` on both SQL dialects throws after the real final enqueue and observes reverted status/event inside the boundary before comparing the rolled-back storage. Mutation `enqueue-reverted-after-commit` moves final enqueue outside the boundary.
   - Existing unit precondition fixtures use their direct work runner; the rollback case has its own rollback-capable state fixture. Post/menu/plugin/tool fixtures use their actual repo runners. The HTTP fixture inherits the approved memory runner from `createRouteDeps`; no body edit was necessary.
   - Files:
     - `apps/website/src/contracts/core/commands/__tests__/integration/revert-plugin-ext.integration.test.ts`
     - `apps/website/src/contracts/core/commands/__tests__/revert.unit.test.ts`
     - `apps/website/src/features/change-sets/__tests__/tool-registrations.test.ts`
     - `apps/website/src/features/navigation/__tests__/reverters.test.ts`
     - `apps/website/src/features/post/__tests__/publish-content.test.ts`
     - `apps/website/src/features/post/__tests__/reverters.schedule-events.test.ts`
     - `apps/website/src/server/routes/types.ts`
     - `apps/website/src/server/runtime/composition/memory-deps/route-deps/assistant-and-site.ts`
     - `apps/website/src/server/runtime/composition/modules/change-sets.ts`
     - `apps/website/src/server/runtime/composition/modules/content.ts`
     - `apps/website/src/server/runtime/composition/site-deps/route-deps-site-providers.ts`
     - `apps/website/src/server/runtime/composition/modules/__tests__/change-sets-revert-atomic.integration.test.ts`

The shared memory composition file has separate ID-wiring and transaction-runner hunks for the two commit units.

## Blocked / no-op

- Sheet 4b / H1970: blocked by upstream Jini handoff: the named store is 500 lines, and the required batch API/route/UI have not been built pending a file placement/size decision. No Tovu registrar can consume that missing API. No substitute store logic will be added here.
- FIX 19: done / no-op under coordinator correction; linked Jini sources already carry the actor fix. No release or bump.
- Memory staging/tests omitted by explicit coordinator override; supply only the approved `work()` runner and deferred-rollback comment.

## Final review

- Reviewed the complete tracked diff and new SQL integration file against the approved sheets. Removed the unnecessary first-inverse wrapper/attempt recorder from the integration fixture; the real first reverter is left intact, and the second reads its persisted result. No other out-of-sheet additions remain.
- Deletions: no files or why-comments deleted. The named historical L079 reported-bug test was replaced with its required rollback assertion; deterministic canonical-ID expectations were replaced with injected-ID expectations. No test cases or failure checks were removed to manufacture green.
- `git diff --check`: clean. Source inspection only; no tests, installs, builds, typechecks, linters or mutation execution. Runtime, coverage and RED/GREEN evidence await the coordinator.
- No manifests/lockfiles, release steps, themes, Jini source, or `.git` writes. Jini changesets already exist upstream; no duplicate changesets added to Tovu.
- Architecture audit: PASS by source inspection for implemented units: Jini remains the behavior owner, Tovu bindings only inject dependencies and delegate, SQL uses the existing shared kernel, memory uses the expressly approved deferred runner. Sections 13/14 and project memory are absent in this clone; consulted their canonical copies under `/Users/la/Programming/Tovu/ADS-memory/`.
- Reuse: vault identity allocation stays in Jini store/vault; inspected the named constructors, media route bindings and secure-card host; injected the root generator. Revert atomicity stays in Jini command plus the existing content kernel; inspected the named route/tool types and SQL composition, reused its runner.
- Documentation classification: bindings/fixtures only; preserved existing why-comments and added only the exact approved memory-defer comment.
- Function review: constructor and binding callbacks have no new decision branches, I/O loops or policy. New SQL fixture helpers only seed/read the specified cases (bounded constant-size operations). Skepticism pass checked persisted/prepared ID selection, stable rotation identity, shared-kernel ownership, event field `name`, scope/descending positions, and before/after storage snapshots.
- Open: sheet 4b upstream API/route/UI placement decision; coordinator execution of all named regressions and mutations. No local runtime correctness claim.
