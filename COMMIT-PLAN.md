# P5 Tovu working-tree commit plan

Design: Codex r62t-rev-p5, Opus-checked. Base: `codex/tv-f-p5`, `7c87b3c3f95301d59f55041bf163b723bbab5d79`.

T1.T, T2.T and T3.T source and witnesses are implemented, in that order. No anchor mismatch stopped a sheet. The Jini report marks T1.J–T3.J built; their source was inspected read-only at `codex/f-p5j` (`7131f0684`). No prerequisite was skipped.

No tests, builds, installs, type checks, linters, commits, pushes or mutations ran. All runtime and mutation results remain unverified for the next cloud run. `.git` remains unchanged. The coordinator owns the commits below; overlapping files must be staged by hunk.

## 1. P5-T1.T — Wire payloads into the current registry

Files:
- `apps/website/src/features/site-backup/import-registry.ts`
- `apps/website/src/features/site-backup/import-backend.ts`
- `apps/website/src/features/site-backup/import-backend-steps.ts`
- `apps/website/src/server/runtime/composition/site-import-backend.ts`
- `apps/website/src/server/runtime/composition/site-import-payload-fs.ts` (new)
- `apps/website/src/server/inbound/admin-http/routes/system/site-imports.ts`
- `apps/website/src/server/inbound/shared/admin-failure.ts`
- `apps/website/src/features/site-backup/__tests__/import-registry.unit.test.ts`
- `apps/website/src/features/site-backup/__tests__/import-registry-notices.unit.test.ts`
- `apps/website/src/features/site-backup/__tests__/import.fixture.ts`
- `apps/website/src/features/site-backup/__tests__/import-interruption.fixture.ts`
- `apps/website/src/features/site-backup/__tests__/import-interruption.integration.test.ts`
- `apps/website/src/features/site-backup/__tests__/import-history-retention.unit.test.ts`
- `apps/website/src/features/site-backup/__tests__/import-failures.integration.test.ts` (existing ordinary payload fixtures)
- `apps/website/src/cli/__tests__/integration/import-local.integration.test.ts`

The two requested retention witnesses were written before the namespace wiring. The notices witness uses the actual durable JSON binding and saves under `.import.lock`. Ordinary payload fixtures use `payloads/`; the split-migration witness and CLI migration fixture explicitly retain their legacy root entries.

| Witness | Unapplied red mutation |
|---|---|
| staging budget and orphan sweep never enumerate the history directory | Count at root, or invoke full registry expiry from the budget path. |
| interrupted move (ZIP moved, metadata not) then restart keeps the upload claimable and owner setup completes | Sweep payloads before namespace ensure; the ZIP becomes orphaned before root metadata moves. |
| Existing owner expiry, plus pending owner retained during budget-only maintenance | Put legacy owner expiry back into `expirePayloads`. |
| Actual durable JSON notices under locked `saveUpload` | Change the bound prefix or lock-timeout copy. |

## 2. P5-T2.T — Index seam and paged HTTP/tool/Admin surfaces

Files:
- `apps/website/src/features/site-backup/import-registry.ts`
- `apps/website/src/features/site-backup/import-backend.ts`
- `apps/website/src/features/site-backup/import-backend-steps.ts`
- `apps/website/src/features/site-backup/tool-registrations.ts`
- `apps/website/src/server/runtime/composition/site-import-backend.ts`
- `apps/website/src/server/inbound/admin-http/routes/system/site-imports.ts`
- `apps/website/src/features/site-backup/__tests__/import-history-index.fixture.ts` (new)
- `apps/website/src/features/site-backup/__tests__/import-history-retention.unit.test.ts`
- `apps/website/src/features/site-backup/__tests__/import-tools.unit.test.ts`
- `apps/website/src/features/site-backup/__tests__/import-registry.unit.test.ts` (direct recovery callback and Core type)
- `apps/website/src/features/site-backup/__tests__/import-interruption.integration.test.ts` (Core type)
- `apps/website/src/features/site-backup/__tests__/import-failures.integration.test.ts` (Core type)
- `apps/website/src/cli/commands/import-local.ts` (direct Core type imports only)
- `apps/website/src/server/inbound/admin-http/routes/system/site-imports.integration.test.ts`
- `apps/website/src/server/inbound/admin-http/routes/system/site-imports-wire.integration.test.ts`
- `apps/website/src/server/inbound/admin-http/routes/system/__tests__/site-import-errors.unit.test.ts`
- `apps/website/src/server/inbound/admin-http/http/__tests__/unexpected-route-errors.test.ts`
- `apps/admin/src/features/sites/SiteImportTab.tsx`
- `apps/admin/src/features/sites/site-transfer-i18n.ts`
- `apps/admin/src/features/sites/hooks/site-transfer-dependencies.hooks.ts`
- `apps/admin/src/features/sites/hooks/use-site-import-state.hooks.ts`
- `apps/admin/src/features/sites/hooks/use-site-transfer.hooks.ts`
- `apps/admin/src/features/sites/hooks/site-import-controller.ts`
- `apps/admin/src/features/sites/hooks/site-transfer-rules.ts`
- `apps/admin/src/features/sites/__tests__/use-site-transfer.hooks.unit.test.tsx`
- `apps/admin/src/features/sites/__tests__/site-transfer-tabs.unit.test.tsx`
- `apps/admin/src/features/sites/__tests__/sites-i18n.unit.test.ts`
- `apps/admin/src/features/sites/__tests__/site-import-switcher-off.unit.test.tsx` (existing controller double)
- `openapi/022-site-imports.yaml` (new)
- `openapi/README.md`
- `apps/website/src/assistant/__tests__/fixtures/moved-tools.golden.json` (only 762098 → 762190)

The history fixture and retention/route/Admin witnesses preceded the corresponding implementation. Both existing Q4 titles are unchanged; their shared finished-import setup now uses real SQLite. The fixture supplies index authority and a no-op write fence; production omits authority. New native handles are closed through the existing teardown queue. Read and locked sessions carry the shared named retention policy for paging/admission; locked sessions also carry expiry, sweep and before-write closures.

| Witness | Unapplied red mutation |
|---|---|
| Q4 durable replay: after a restart at day 31 the same request returns the stored outcome; a changed source conflicts before any effect | Bypass replay lookup after backend recreation. |
| Q4 expiry: terminal history leaves the list after 30 days, replay still works, replaying does not extend it, and the key is reusable after 365 days | Refresh settlement/acceptance on replay instead of preserving first settlement (`COALESCE`) and acceptance. |
| history boundary: listed at 30d − 1 ms, hidden at exactly 30d | Make terminal visibility inclusive. |
| fence still conflicts at 365d − 1 ms; day 365 + 1 ms frees the key | Make fence liveness inclusive; the former witness also asserts absence at exactly 365d. |
| replay at day 200 returns the stored outcome but the row is not listed | Bypass replay lookup. |
| REQUEST_CONFLICT leaves the upload unconsumed and makes no HTTP call | Consume before fence lookup; the witness also refuses budget access and checks unchanged row count. |
| admission insert failure leaves no fence | Commit fence and row separately; a real SQL trigger refuses the row. |
| tied timestamps page with no duplicates, skips or cross-principal rows | Drop import-ID tie-breaker. Inputs: 120 rows, seven timestamps, three principals, 80 rows for one principal, size 50. |
| invalid cursor (bad base64, v2, unsafe int, non-uuid) → INVALID_CURSOR | Treat decode failure as absent cursor. |
| recovery issues one indexed active-row query | Remove the active-status predicate. |
| needs-owner past deadline fails with "Owner setup expired" and its stage is removed | Expire inclusively at deadline, or skip stage removal. |
| two workspaces under one appData never see each other's rows or fences | Remove workspace ID from the composition's private path. The witness captures the real composition args and opens both candidate files. |
| list, retry and expiry work with history-dir enumeration failing | Leave full legacy expiry on indexed reads/tidy. |
| site import paging preserves gate precedence and private response headers | Interpret query before gate, skip authorization/publish-trust handling, or drop private headers. |
| load more cannot append a stale page after refresh or principal change | Remove scope/generation guard. |
| pages dedupe in order, keep rows on failure and reset an invalid cursor | Drop dedupe, clear rows on ordinary errors, or retain an invalid later-page cursor. |
| transports the import cursor as a query string | Omit URLSearchParams cursor transport. |
| shows more imports and keeps owner action on an appended row | Remove the Jini paging leaf or appended-row owner binding. |
| localizes import paging in every existing locale | Omit either key from a locale. |
| import history 503/507 preserves safe copy and correlates the incident | Lose explicit status/ERR-ID routing, or expose the private cause. |

Existing tool authorization/refusal and HTTP wire expectations are retained with page doubles. The unknown-field copy is the specified `site_import_list accepts only cursor.` No approval/search metadata changed. `admin-failure.ts` has no T2 change.

## 3. P5-T3.T — Bind legacy scan and cutover input

Files:
- `apps/website/src/server/runtime/composition/site-import-backfill.ts` (new)
- `apps/website/src/server/runtime/composition/site-import-backend.ts`
- `apps/website/src/features/site-backup/__tests__/import-history-index.fixture.ts`
- `apps/website/src/features/site-backup/__tests__/import-history-retention.unit.test.ts`

The backfill witnesses preceded `bindSiteImportBackfill`. The binder uses the non-quarantining durable reader, randomUUID and the native candidate opener. Composition prepares the bound function in its existing backend argument object without invoking it or selecting index authority. Backfill publishes no external state.

| Witness | Unapplied red mutation |
|---|---|
| backfill crash before commit leaves no marker and no rows | Commit the marker separately. |
| interrupt the backfill and restart → exactly one copy of each row and fence | Commit marker separately or replace meta upserts with plain INSERTs. SQL triggers interrupt mid-rows and before markers; a committed attempt is reopened and rerun before any external state publish. |
| origin-only key still fences a different source | Skip URL records without a digest. |
| unreadable row blocks cutover and keeps its file | Skip unreadable input and cut over. Bytes are compared unchanged and candidate opening is forbidden. |
| malformed-but-parseable row blocks cutover | Skip malformed input and cut over. |
| active verifying/creating recovery keeps its allocation | Apply terminal cutoff to active rows or drop creation. Uses a real lifecycle allocation and copies of the real durable stage; recovery retains the existing site and does not start another. |
| needs-owner row and its stage survive backfill; owner setup completes after cutover | Drop active detail/stage ownership or creation/deadline state. The retained stage completes actual owner setup. |
| two legacy rows with one requestId: newest fences, both histories listed | Sort duplicate fence owners ascending. |

## Left for Opus

- P5-T4.J and P5-T4.T, including durable authority state, witness, scoped production authority, rollback, retirement, downgrade documentation and real browser/Electron verification.
- Jini DDL pin replacement (`OPUS_PIN_PENDING`), API baselines, original tests and each red mutation.
- One-line enablement only after the specified copied-folder checks. Production remains legacy; the prepared policy says `rollback`.

## Diff review and deletions

Re-read the changed source, fixtures, call sites and tests. Removed only replaced behavior or review leftovers:
- Registry-local upload/orphan cleanup and the old expiry dispatcher, replaced by the named Jini payload owner and separate history expiry.
- Registry-local durable JSON construction, replaced by injected durable bindings.
- Local shared record/source/view declarations and the backend forwarding export; callers now import Core directly.
- The old handwritten GET and tool no-fields branch, replaced by the named route spec and cursor contract.
- A temporary backend `backfill` option declaration from the implementation pass. Preparation now stays in composition's argument object, with no extra public backend option.
- An obsolete test comment about a directory at a ZIP path causing removal failure; the new no-follow owner preserves wrong types, so the witness now injects the actual busy-file failure it tests.
- Empty-line/unused-import leftovers from edits. No unrelated production refactor, extra helper/type file, manifest, changeset or baseline change.

The small edits outside the explicit T1/T2 file lists are direct removed-type callers, ordinary payload fixture paths and the existing required controller double, listed above.

## Static handoff review

Boundary review: Jini owns namespace/index/cursor/backfill logic. Node filesystem and SQLite bindings stay in composition; Admin retains product UI/hooks. Existing JSON unreadable refusal, guarded download, ZIP-before-metadata, lock liveness, owner action and database tidy paths are retained.

Assessment units: payload binding/registry maintenance → direct filesystem witnesses; indexed admission/recovery/read branches → real-driver retention witnesses; HTTP/tool adapters → existing wires plus query/failure witnesses; paging hook/slot binding → hook and host-kit render witnesses; backfill binding → real-driver interruption/owner witnesses. These are written coverage surfaces, not measured coverage. Runtime verification, mutation effectiveness and baseline green status remain NOT RUN by explicit dispatch instruction. No pass or release-readiness claim is made.
