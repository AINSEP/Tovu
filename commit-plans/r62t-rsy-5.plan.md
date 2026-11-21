Two Tovu sheets are READY. They cover cancellation before the first SQL write in consent draft save and consent publication. The sheets share a test file and production modules, so they should land on one branch in order. The requested batch size is four to eight sheets. Hold this pair for the next Tovu batch.

I used Tovu merge-10 `0973a5fdc8` and Jini merge-10 `de4e555b9`. The private clone lacked the two plan refs, so I read their Git objects through `/Users/la/Programming/Tovu`. I stopped at the 110-lookup budget. No files or refs changed, and no tests, builds, installs, type checks, or linters ran. `W` below means `apps/website/src/` in Tovu.

## Dispositions

| ID | Disposition | Merge-10 evidence |
|---|---|---|
| A06 | **PARTIAL · real** | Jini `packages/user-management/src/server/grant-service.ts:247–302` awaits authorization, username lookup, and password hashing before two saves at `:298–299`. The check belongs immediately before the first save. The existing function is 56 physical lines. The exact signal binding at the agent call and a compliant edit still need to be pinned. |
| A08 | **READY-FOR-CODEX · T-ABORT-08** | `W/features/consent/tool-registrations.ts:54` drops the signal. `service.ts:194–198` awaits authorization and validation. `revisions.repo.ts:33–39` then awaits the lock and rereads state before the draft INSERT. |
| A09 | **READY-FOR-CODEX · T-ABORT-09** | The publish handler at `tool-registrations.ts:65` drops the signal. `service.ts:203–209` awaits authorization, the draft read, and validation. `revisions.repo.ts:42ff` then locks and rereads state before changing the public pointer. |
| A10 | **NEEDS-DECISION · shared question below** | `W/features/database/tool-registrations.ts:197–219` confirms before migration dispatch. Jini's gated-mutation `gateway.ts:166–177` saves the token after authorization. Its `:199–221` awaits reauthorization and plan verification, redeems, and then hands off to the mutation. |
| A12 | **OWNED-ELSEWHERE · S1 for persistence; PARTIAL for cancellation** | `W/features/external-mcp/tool-registrations.ts:729–747` can invoke an injected probe. The credential-setup descriptor is separate. `SITES.tsv` X2 owns the OAuth persistence primitive. A12 still needs the live probe and refresh path traced to its write admission point. |
| A15 | **PARTIAL · real; coordinate with S7b** | `W/features/pages/tool-registrations.ts:556–560` opens and then writes. Opening can itself mutate at `:386–388`, after an awaited row lookup. S7b owns the version basis, which is already required here. Cancellation needs a trace through the conversion and final write transactions. |
| A16 | **PARTIAL · real; coordinate with S6** | `W/features/post/tool-registrations.ts:249` checks before `executeCommand`. Inverse capture awaits the row and template at `:262–264`, then `:288` calls `executePostToolUpdate → updatePost`. S6 owns the version basis. Cancellation still needs to be placed after the last awaited pre-save operation, with command compensation preserved. |
| A17 | **PARTIAL · real** | `W/features/publish-content/pull.ts:56–82` fetches the envelope, downloads and stores blobs, then stages the bundle. `tool-registrations.ts:273` writes the audit afterward. A check at the audit misses the earlier writes. The blob sink and stage admission still need tracing, and `pullAndStageFromPeer:42–96` exceeds the line cap. |
| A18 | **NEEDS-DECISION · shared question below** | `W/features/publish-content/tool-registrations.ts:319–327` mints a token, then awaits permission and restore capability before gateway execution. `execute-import.ts:40–58` checks capability and delegates. S13 owns cross-run baseline ordering. |
| A19 | **NEEDS-DECISION · shared question below** | `W/features/recovery/tool-registrations.ts:293–329` mints a recovery token and passes the gateway callback and operation lock to `executeRestore`. The gateway has the same token-save and redemption boundaries as A10. |
| T21 | **PARTIAL · coordinate with S12** | Jini `packages/search/src/indexer-backfill.ts:15–25,75–83` persists continuation and returns `done: false` at budget exhaustion. Tovu maintenance calls backfill again at `W/server/runtime/composition/modules/site-search.ts:363`. The historical `indexer.ts:475` hit still needs mapping to its exact current operation, especially if it was retry work. |
| T27 | **PARTIAL** | Tovu `apps/desktop/src/site-dir-store.ts:38` is the ten-item Open Recent MRU. The reported 100-entry protocol producer and its callers still need identifying. |
| T34 | **RETIRE** | `W/features/analytics/agent-tools.ts:4,9` explicitly defines `path` as a filter applied after reading the global recent window. `tool-registrations.ts:54–55` implements that contract. |
| T36 | **PARTIAL** | Jini `packages/user-management/src/server/mfa/passkey-service.ts:39–45` rejects a sixth credential at enrollment start. The SQL list, enrollment completion, and backup or import writers still need reconciling before retiring the cap. |
| T44 | **PARTIAL** | The current first-ten-per-mode producer and its status consumers weren't pinned. Establish whether the consumer treats an empty result as no outstanding work before dispatching a fix. |
| T45 | **PARTIAL** | The destination inventory has a separate explicit overflow contract in `W/features/deployments/static-publish/publish-history.ts:255ff` and `__tests__/publish-history.unit.test.ts:305–307`. The DNS hint consumer and eligibility of older reachable hosts still need tracing. |
| T46 picker | **NEEDS-DECISION** | `W/server/runtime/composition/other-site-keys.ts:142–145` still limits listing to 50 per source, and `:209–223` emits no overflow cue. Known-ID lookup is already fixed through `rowId` at `:110–128,144–145`. **Should the picker disclose the cap or let users retrieve omitted keys from the picker?** Recommend keeping the cap and disclosing overflow per source. Pin the consumer and its kind filters before dispatching. |
| L01 / L84 | **PARTIAL** | `W/server/runtime/composition/modules/assistant-chats.ts:100–106,290–310,332` binds the authenticated user's store and calls `appendMessage` without an edit basis. The supported browser and desktop callers and their contract for resending the same message ID still need tracing. |
| L17 | **PARTIAL** | Jini `packages/commerce/src/payments/ledger/repo.sql.ts:89–102,147–159,185–186,230–231` fences payment updates but directly patches attempts, refunds, and disputes. `ops/common.ts:142–147` and `ops/reconcile-attempts.ts:54` both write attempt outcome. Trace their fresh-state checks under the payment lock before treating those writes as a race or retiring the row. |
| L18 | **PARTIAL** | `SITES.tsv` row 68 records a random token key and one issuer. The old Tovu SQL file is gone. Jini `packages/core/src/gated-mutations/gateway.ts:168–177,218` shows a fresh mint and separate conditional redemption, but the live Tovu token generator and SQL binding weren't pinned. |
| L54 | **PARTIAL** | Jini `packages/search/src/indexer-backfill.ts:22` is the only production `putWatermark` call found. Tovu `site-search.ts:363–379` serializes passes within one maintenance loop. `SITES.tsv` row 59 assumes one writer and assigns no S12 fix to this checkpoint. Verify reindex and other process roles cannot start a second backfill for the same target. |
| L57 | **PARTIAL** | `W/features/theme/page-publish-tool.ts:45` and `W/server/inbound/admin-http/routes/themes/explore.ts:1234` both call the synchronous `setThemePagePublished`. `SITES.tsv` row 62 establishes serialization within a process. Whether two supported processes can write the same `theme.json` remains open. |

**One owner question for A10, A18, and A19.** Should cancellation remain effective until the gateway admits token redemption, even if the confirmation token was already saved? Recommend yes. Check immediately before token save and again immediately before redemption, after fresh permission and plan verification. Let a minted but unused token expire. Once redemption succeeds, finish the admitted mutation and its existing cleanup. These three rows should share that decision before any gateway or host changes.

The permission rows P01–P05 were outside this partial-row list. The merge reports place their fixes in J1, V1, and V2. No follow-up permission sheet is proposed here.

## Tovu executor brief

Apply these rules before every edit in either sheet.

- Behaviour identical except for the named bug correction. API args `(required, optional = {})` for new functions only. Never remove, rename, or change existing `_optional = {}` pads or the args rule. No re-export shells, new dependencies, new `eslint-disable`, `@ts-ignore`, `as any`, or `as never`. Functions ≤50 lines and complexity ≤10. A file over 500 lines goes in `COMMIT-PLAN.md` and work continues.
- Do exactly the named edits. No extra helpers, wrappers, adapters, ports, interfaces, types, generics, options, flags, validation, guards, fallbacks, retries, or defaults. Move only named code, verbatim, including why-comments. Use only the listed test cases and mutations and their minimum scaffolding. Add comments only where named. Review the diff, delete additions the sheet did not require, and list those deletions in `COMMIT-PLAN.md`.
- Stop only the affected sheet if a declaration is missing, an unlisted production importer appears, a cast is needed, or a function limit is exceeded. For named symbols use `git grep -n -F '<symbol>' -- apps/ development/ packages/`. An unlisted test importer needing only the same repoint may proceed with a note in `REFRESH.md`. No other repo-wide scans. No tests, builds, installs, type checks, linters, or codebase-memory-mcp on the executor. `.git` is read-only. `COMMIT-PLAN.md` belongs at the repo root. Combine runs the tests and mutations.
- Hooks are injected as props. No vendor code or specific server framework in Jini domain packages. A new package, dependency, or lockfile edit is OPUS-CLOUD. Composition-deps and the Jini deprecation gate are dropped. Jini uses `jini-*` names and records a breaking change on a `BREAKS:` line. `@tovu/sdk` stays in Tovu.

### T-ABORT-08 · Consent draft save

**Repo and base** Tovu `integ/merge-10-2026-11-21` at `0973a5fdc8`. Estimated executor edits **1.2k tokens**.

**Test first.** Add `confirmed draft aborts before the first SQL write` in `W/features/consent/__tests__/tools.test.ts`, using the real approval pattern at `:70–79` and the real SQLite fixture imported at `:9`.

- Extend the existing `tools` fixture at `:13–28` with `signal?: AbortSignal` in its first argument. Supply the signal to `ToolExecutionContext` when provided and preserve the fresh signal for existing callers.
- In the test, use an `AbortController` and a fixed `DOMException('consent write cancelled', 'AbortError')`. Build the existing `createSiteConsentStore` over `contentKernel({ store: f.db })`. Forward `query`, `execute`, and `transaction` bound to that kernel. Supply a `lockKey` that awaits the real lock and then aborts with the fixed reason. Set `f.ports.store` to that store, as the existing test at `:75` substitutes the store.
- Confirm `consent_update_settings` with `{ config: f.config, expectedDraftId: null }`. Assert rejection with the abort reason and `{ draft: null, published: null }` in the real store. Mutate by removing the SQL check below. The call writes the draft and the case goes red.
- The only new imports are `import { contentKernel } from '#src/platform/db/content-kernel';` and `import { createSiteConsentStore } from '../revisions.repo.js';`. Both are already used by `__tests__/fixture.ts:4,6`.

**Source.** Add the named optional `signal?: AbortSignal` field to the existing first-argument objects of `saveDraft` in `W/features/consent/service.ts:193–199` and `SiteConsentStore.saveDraft` in `revisions.ts:19`. Pass `signal: ctx.signal` from the approval `run` at `tool-registrations.ts:54`. Forward `signal` to `store.saveDraft` at `service.ts:198`. In `revisions.repo.ts:33–41`, destructure `signal` from the first argument and insert `signal?.throwIfAborted();` immediately before the first `kernel.execute` at `:39`, after the locked read and size check. Keep both SQL writes in their existing transaction and order.

**Importers and debt.** No declarations move or change export entry. Existing production and test imports stay as written. Only the named tool caller supplies a signal. No injection-debt, API-baseline, manifest, or lockfile edit. Chrome look after combine, confirm “Save draft” in assistant UI and verify the draft changes while the published revision stays fixed.

**Stop.** Stop if the SQL after-lock witness requires a cast or a new production seam, or if the check would fall after the draft INSERT.

### T-ABORT-09 · Consent publication

**Repo and base** Tovu `0973a5fdc8`, after **T-ABORT-08** on the same job branch. Estimated executor edits **0.9k tokens**.

**Test first.** Add `confirmed publication aborts before changing the public pointer` in `W/features/consent/__tests__/tools.test.ts` using the same approved-tool setup and imports as T-ABORT-08. Seed a draft before installing the aborting store on `f.ports.store`. Confirm `consent_publish_settings` with `{ draftId: saved.revision.id, expectedPublishedId: null }`. Abort after the real publication lock is acquired. Assert rejection with the abort reason, the same saved draft ID, a null published pointer, and no call to `f.ports.published`. Mutate by removing the publication SQL check below. The pointer changes and the case goes red.

**Source.** Add `signal?: AbortSignal` to the existing first-argument objects of `publish` in `W/features/consent/service.ts:202–213` and `SiteConsentStore.publish` in `revisions.ts:20`. Pass `signal: ctx.signal` from the approval `run` at `tool-registrations.ts:65`. Forward `signal` to `store.publish` at `service.ts:209`. In `revisions.repo.ts:42ff`, destructure `signal` from the first argument and add `signal?.throwIfAborted();` immediately before the public-pointer SQL write, after the locked revision checks. Keep the existing post-publication refresh after the committed write.

**Importers and debt.** No moves, repoints, export changes, or new imports beyond T-ABORT-08. Existing callers may omit the signal. No injection-debt, API-baseline, manifest, or lockfile edit. Chrome look after combine, confirm “Publish policy” in assistant UI and verify the reviewed draft becomes the public revision.

**Stop.** Stop if the check would fall after the public-pointer write or if the witness needs a cast or a new production seam. If T-ABORT-08 stops, report the shared test-fixture dependency before attempting T-ABORT-09.

## Batch and remaining handoff

| Batch | Base and order | Estimate | Dispatch state |
|---|---|---:|---|
| Tovu consent cancellation | `0973a5fdc8` → T-ABORT-08 → T-ABORT-09. The dg-c fixes are already in the base. No additional branch dependency was verified. | 2.1k edit tokens for these two sheets | Hold for a four-to-eight-sheet Tovu job. |
| Jini | `de4e555b9` | — | No READY sheet. If the gateway decision yields edits on both repos, land the Jini half before its Tovu caller sheets. |

The table records the missing evidence for each PARTIAL row. The next read-only pass should finish A06's agent binding, locate A12's refresh write admission, and trace the A15–A17 write owners before spending lookups on the remaining truncation and lost-update rows.
