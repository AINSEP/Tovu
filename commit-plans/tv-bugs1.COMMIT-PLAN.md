# codex/tv-bugs1

Base supplied by dispatch: Tovu `0973a5fdc8` (integ/merge-10); Jini API reference `de4e555b9`.
`W` = `apps/website/src`; `A` = `apps/admin/src`.

All six sheets have their requested edits implemented. Runtime status: UNVERIFIED.
Tests were edited before their corresponding production changes. T1 uses its existing red;
AG-T0 is characterization only. No tests, mutations, builds, installs, type checks or linters
were run, per MACHINE RULE. No Git metadata writes, commits, manifests, lockfiles or Jini edits.
The absent clone bootstrap is waived by dispatch. The requested programmer skills index was read;
the dispatch's narrower edit, comment, verification and reporting rules govern this job.

## T1 — done (edits)

- Base: `0973a5fdc8`.
- Files: `W/server/runtime/composition/modules/__tests__/agent-daemon-core-rpc.integration.test.ts`.
- Existing red: `an accepted memory-mode answer reaches CLI launch through the site's attempt authority`.
  Previously the fixture's ledger and session locator used separate stores, so the site locator
  was null. Assertions for locator, empty daemon map, resumed input and late refusal are intact.
- Change: save base route dependencies, create one in-memory chat kernel, close its DB at teardown,
  and bind history, ledger and session storage to that kernel before overrides.
- Mutation owed to combine: restore only `agentSessions: base.agentSessions`; expect the locator
  assertion to fail. Stop there if the real run cannot see the locator or shifts to durable admission.
- API-baseline delta: none; fixture only. Look owed: none.
- Deletions: replaced the fixture's inline `createRouteDeps()` spread with the named base/shared stores.

## T2 — done (edits)

- Base: `0973a5fdc8`.
- Files: `W/server/inbound/admin-http/routes/newsletter/list-send-log.ts` and
  `W/server/inbound/admin-http/routes/newsletter/__tests__/list-send-log.test.ts`.
- Tests: extended the existing HTTP case with exactly 100 rows, then row 101, ordered first-page
  equality, a usable cursor, and final-page equality with a null cursor. Other-workspace and
  other-campaign rows remain. Before the change, the route uses the repository default cap and
  has no cursor field/continuation; these expectations are red by source inspection.
- Change: use existing typed list-page helpers, a one-string ID cursor, `limit + 1`, and the sibling's
  `ToolInputError` mapping. Authorization, campaign lookup and raw rows remain.
- Importer lookup: the registrar has only the sheet's production composition importer and test.
  `listByCampaign`'s existing callers require no repoint or signature change.
- Mutation owed to combine: request `limit` instead of `limit + 1`; expect the 101-row cursor check
  to fail. Run the route's real HTTP test across both pages.
- API-baseline delta: no package API change. HTTP adds `nextCursor: string | null` beside `data`
  and accepts `cursor`/`limit` query parameters, with the sheet's default/max limit of 100.
- Look owed: real HTTP pagination check; admin pagination UI is outside this sheet.
- Deletions: replaced capped unpaged response and single-row expectation; removed the old test-only
  response cast while reading JSON directly. No new cast.

## T3 — done (edits)

- Base: `0973a5fdc8`.
- Files: `W/server/inbound/shared/admin-failure.ts` and
  `W/server/inbound/shared/__tests__/unexpected-admin-escape-paths.unit.test.ts`.
- Test: added the prescribed `ERR-XXXX-XXXX-XXXX-XXXX` assertion to the forms-pull case, keeping
  its response, nested failure, redaction and log correlation assertions. Raw UUID minting fails
  this assertion before the change by source inspection.
- Change: both mint sites use `mintToolErrorId` and injected random bytes; explicit IDs and formatter
  precedence remain. The Jini reference manifest exports `./errors/error-id`; this clone has no
  installed root core package, so installed resolution/formatter behavior remains for combine.
- Mutation owed to combine: restore raw UUID minting at the response producer. Run forms HTTP and
  related admin failure tests. Disk-space routing remains outside scope.
- API-baseline delta: none; incident values adopt the standard format. Look owed: forms HTTP check.
- Deletions: raw UUID import and two raw UUID calls, replaced at the named sites only.

## T4 — done (edits)

- Base: `0973a5fdc8`.
- Files: `W/server/__tests__/assistant-ag-ui-wire.golden.test.ts` and
  `W/server/runtime/composition/modules/assistant-ag-ui.ts`.
- Test: added only the named `dropConnection?: true` script control and one authenticated case.
  The stand-in writes a valid partial text frame with 200 headers and destroys the response from
  that write's callback. The case requires text start/content/end followed by exactly one run
  error with the approved interruption sentence. The former catch reports the transport exception
  instead, making the message assertion red by source inspection.
- Change: replace only the catch's public message; retain original error in the tracker outcome
  and preserve close order. Upstream terminal-frame handling stays intact.
- Mutation owed to combine: restore the catch's raw thrown-message expression. Verify failure
  follows SSE establishment and that this mutation fails; apply the sheet's STOP if either fails.
- API-baseline delta: none; public catch copy changes to the approved sentence.
- Error ledger reconciliation owed: catch-message read `error instanceof Error ? error.message :
  String(error)` was removed at `drainAgUiStream`; no manual ledger rewrite was made.
- Look owed: admin interruption message with the real AG-UI reader after combine.
- Deletions: the catch's raw-message expression only.

## SHARE-ZIP — done (edits; coordinator ruling applied)

- Base: `0973a5fdc8`, including merged tv-sharezip.
- Files:
  - `W/features/site-backup/__tests__/credential-warnings.integration.test.ts`
  - `W/features/site-backup/__tests__/share-backend.unit.test.ts`
  - `W/server/inbound/public-http/routes/__tests__/site-share.unit.test.ts`
  - `A/features/sites/__tests__/site-transfer-credential-warnings.unit.test.tsx`
  - `W/features/site-backup/share-backend.ts`
  - `W/features/site-backup/share-service.ts`
  - `W/features/site-backup/share-registry.ts`
  - `W/features/site-backup/tool-registrations.ts`
  - `W/server/inbound/admin-http/routes/system/site-shares.ts`
- Tests: moved fixture statements verbatim to the named private `prepareWarnedShareFixture`,
  returning directory/plan. The owner case is 44 lines, retains durable/repeated acknowledgement,
  byte-equal authenticated download, authorization and revocation, and now requires 403 before
  acknowledgement and a null public token afterward. The former full guard rejects this case
  and both existing saved-key round-trip variants before creation (the combine-9 three NEW reds).
  Both round-trip variants are unchanged as instructed.
- Tests: the full-share refusal now supplies a real delivery object and requires one lookup,
  zero uploads, the existing UNSAFE_FILE message and an empty registry. The old early guard fails
  the lookup count. The static case now requires a saved private warned ZIP, acknowledgement and
  null URL; the old static guard throws. A new real-registry public-token case requires 404 with
  no attachment even after acknowledgement; the old token predicate serves it. Admin mocks and
  the changed status expectation use 403. These red reasons are inspected, not executed.
- Change: owner static/full ZIPs keep acknowledgement; selected-provider full exports refuse warnings.
  Warned stored rows skip delivery lookup, original-delivery validation and upload on acknowledgement.
  Public token lookup excludes warned rows even after acknowledgement. No new selector.
- Coordinator ruling: `const deliveryStorage = !row.credentialWarnings?.length ? row.storage : undefined`
  retains the storage object, allowing its key to be used without a cast; the sheet's boolean
  expression is intentionally not copied. Persistence and revocation rationale remain.
- Mutations owed to combine, separately: restore unconditional full guard (owner + both saved-key
  cases red); restore 409 (owner case red); remove provider-only refusal (provider case red);
  restore static guard (static case red); remove warning token predicate (public HTTP case red).
- API-baseline delta: none; acknowledgement-required download status changes 409 → 403, with the
  same ACKNOWLEDGE_CREDENTIALS body. Warned owner downloads remain available after consent;
  warned exports cannot become public/provider deliveries through these paths.
- Looks owed: warned owner GET → acknowledge → download; warned provider refusal; clean public download.
- Deletions: static refusal call; relocated full refusal call; former owner-test provider fake and
  upload-only assertions; old public-token success expectation; static refusal expectations;
  stale acknowledgement summary, replaced by the requested one-line note. Fixture statements
  were moved, not rewritten. No declaration/pad was removed or renamed.

## AG-T0 — done (edits)

- Base: `0973a5fdc8`; combine uses the Jini phase-1 candidate.
- File: `W/server/__tests__/assistant-ag-ui-wire.golden.test.ts`.
- Test-only change: added exactly the named pendingApproval to the existing mcp-ui payload.
  Resource, surfaceExchange, existing golden expectations, golden bytes and fixture are unchanged.
  This is a characterization case expected to stay green on the base; the mutation should be red
  because the Jini drain interrupts before the remainder/ordinary finish.
- Mutation owed to combine: temporarily use packed Jini `drainRunFramesToAgUi` at the existing
  call site with the existing reader, IDs, translation state, notices and encoder; explicitly end
  the response. Require the golden to reject the early interrupt/missing remainder, then discard.
  Stop this sheet if the fixture changes existing golden bytes or needs another harness.
- API-baseline delta: none; no production/import/export changes. Look owed: admin Chrome with the
  eventual production repoint. Historical `bfd6320e6ccb` why-comment remains a separate combine item.
- Deletions: none.

## Diff review and boundary audit

- Static architecture audit: PASS within the named edits. No new dependency, generic abstraction,
  public export, provider boundary or framework coupling was introduced. Existing dependency bags,
  list-page helpers and incident ID minting are reused. Existing optional pads/args remain intact.
- All new/edited declarations fit the 50-line/10-complexity bound by manual inspection. The named
  owner test is 44 lines; no touched file exceeds 500 lines. No automated metric tool was run.
- Quality review: fixture setup, paged handler, incident mint sites, stream drain/script,
  export/acknowledgement/token functions and named tests have no new recorded findings in this
  constrained diff. Skepticism pass checked variable meanings (especially deliveryStorage),
  cursor overfetch, warned token access and preserved private diagnostic errors.
- Cost remains the existing bounded export work; pagination reads at most 101 rows per request
  and creates at most a 100-row page. Error minting/token predicates add constant work.
- Test assertions changed/added have plain-language messages; moved assertions stay verbatim.
  No unrelated test was deleted/weakened. SHARE-ZIP's obsolete provider-publication assertions
  were removed only as explicitly directed and replaced with the private-token requirement.
- Final diff reread found no edits outside the sheets to delete. No extra cleanup was added.
- Fresh runtime evidence/self-validation: not run because MACHINE RULE prohibits execution.
  Runtime STOP conditions, installed API resolution, goldens and all mutations remain owed to combine.
