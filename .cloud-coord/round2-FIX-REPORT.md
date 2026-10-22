Programmer(Execution): Programmer persona selected and loaded for the implementation, boundary repairs, and DI regression definitions.

Opus round-2 review repairs, 2026-10-22. Branch `codex/r2-review-fixes`, base/live HEAD `4d8a35a03fd2100d2a794b91f509d99d606211ff`. This report supersedes the earlier 41-finding repair handoff at this path; the finding numbers below refer to `/Users/la/Programming/Tovu/ADS-memory/reports/2026-10-22-opus-review-round2.md`.

All 17 findings have source changes. “Fixed” below means implemented and statically reviewed; regression tests are defined but unexecuted. No tests, installs, builds, application servers, provider calls, commits, staging, stash, checkout, or reset were run. Runtime certification remains with the Coordinator under the dispatch's explicit no-tests instruction. No helper agents were spawned.

| Finding | Disposition | Change and files (under `apps/website/src/` unless stated) |
| --- | --- | --- |
| 1 High — observer throws after accepted send | Fixed | `server/runtime/boot/mail-delivery-policy.ts`: observer runs inside a catch, warns once with the fixed line `[mail] activity observation failed`, contains logger faults, and returns the exact policy result unchanged. DI tests in adjacent `__tests__/mail-delivery-policy.unit.test.ts` assert success, reference identity, all three batch recipients attempted, no raw error text, and a failing logger. |
| 2 High — repeated writes and unindexed retention | Fixed | `features/mail/retention.ts`: ledger update requires `activity_retained = 1`; feedback scrub requires `(recipient <> '' OR provider_message_id <> '')`. New 0031 supplies timestamp-leading indexes for the cross-workspace owner pass. `features/mail/__tests__/attempts-retention.dialects.test.ts` counts actual affected rows using RETURNING on SQLite and PGlite; a second pass must change zero rows. |
| 3 Medium — raw provider error in test send | Fixed | `features/mail-status/test-send.ts`: code-to-fixed-copy mapping for local refusals and generic `The provider refused the message (code X).` otherwise; never forwards `result.message`. Secret-bearing SMTP/provider message tests cover operation, assistant tool, and route body (`features/mail-status/__tests__/test-send.test.ts`, `server/inbound/admin-http/routes/system/__tests__/mail-dns-and-test-send.unit.test.ts`). |
| 4 Medium — final ledger metadata kept forever | Fixed | `features/mail/retention.ts`: DELETE entire final `sent`/`failed`/`unknown` rows when both creation and last reserve/mark update are at least 30 days old. Recent retry windows, unresolved reservations and webhook replay IDs are preserved. Exact schedule and fields below. |
| 5 Medium — missing tracked Jini backlog | Fixed | All three extraction records now live in the already tracked `.cloud-coord/round2-progress.md`, under “Jini extraction backlog”: source, destination package, two-object API/ports, invariants, and the reason extraction cannot land in this checkout. Headers in cache, setup parser, and renderer point there. No reliance on ignored SURVEY.md, new untracked prose, or staging. |
| 6 Medium — toHeadlessPost complexity 11 | Fixed | `server/inbound/public-http/http/shared/post.ts`: shared `requirePublicPost({ post }, {})` returns the narrowed public record before mapping. Mapper meets complexity ≤10 and still refuses templates. Adjacent `__tests__/post.test.ts` pins both DTO refusals. |
| 7 Medium — activity scans full history | Fixed | Observer persists `use_id` once; 0031 backfills existing attempts and indexes workspace/use/time/id and workspace/effective-recipient. `features/mail/activity.repo.ts` pushes use, recipient, identity, cutoff and cursor predicates into base sources. Ordinary reads limit each ordered source before UNION and feedback probes; legacy history is bounded to the recent 30 days. Outcome filtering is correctly applied before the final limit. Complexity docs explicitly disclose the remaining recent-window legacy/derived-outcome scans. Tests cover stored purpose, newest-page selection and an older failed row behind a newer accepted row. |
| 8 Low — permission docs promise delegation | Fixed | `features/mail-status/permissions.ts` and `suppressions.ts`: owner only; the grant alone is not enough. Owner-only code remains intact. |
| 9 Low — orphaned bucket why-comment | Fixed | Moved from `server/runtime/composition/deps.ts` to `mailTestSendLimiter` in `site-mailer.ts`. |
| 10 Low — stale derived-risk comment | Fixed | `features/email-templates/tool-registrations.ts` names `postRepo.listHtmlByKind`. |
| 11 Low — Pages/template kind confusion | Fixed | `features/pages/html-document-store{,.memory}.ts`: factory options select allowed kinds, default page only; enforce on read, conversion, and write, including CAS. Template operations explicitly select email-template only. Composition roots `app.ts`, `deps.ts`, and `peer-site-reads.ts` forward factory options. Memory and SQL template operation tests pin Pages refusal while template create/edit still uses the same writer. |
| 12 Low — active send HTML vectors | Fixed | `features/email-templates/render.ts` extends the existing parse5/Jini sanitizer: removes base/form/link/http-equiv meta and non-image data URLs, including control-character obfuscation. `__tests__/render.test.ts` asserts malicious removal and preserved inline image/style/viewport content. |
| 13 Low — false approval change after boot/switch | Fixed | `planMailTestSend` awaits the existing `mailLaneReady` port before reading synchronous capabilities or resolving the sender. `MailStatusToolDeps` carries the same optional port; site operations already expose it to routes and tools. Test pins resolved driver and successful execution. |
| 14 Low — credential refusal contains store text | Fixed | `server/runtime/boot/mail-provider-catalog.ts`: fixed could-not-decrypt/read copy; detail goes only to a server diagnostic sink, with logging faults contained. Catalog setup tests cover Error, non-Error, decrypt failure, and failing logger; resolver assertion updated to forbid raw store text. |
| 15 Low — DNS requirements has no deadline | Fixed | `server/runtime/boot/resolve-mailer.ts`: provider call races a 5 s default timeout, clears the timer in finally, and rejects with fixed copy so existing DNS operations return `requirements_failed`. Injected timeout seam and a never-settling provider regression in `__tests__/resolve-mailer.unit.test.ts`. |
| 16 Low — refresh bypass unthrottled | Fixed | Existing `createTtlCache` accepts a minimum forced-refresh interval. Resolver sets 5 s shared by HTTP and tools. Cold concurrent refreshes coalesce; refresh inside the interval reuses the report; invalidation permits immediate rebuild. Cache and resolver lifecycle tests pin boundaries, superseding generations and invalidation. |
| 17 Low — scalar helper arguments | Fixed | `features/theme/tool-registrations.ts`: applyThemeFileEdit/replaceThemeFileText take required object plus optional object. `server/inbound/admin-http/routes/system/mail-activity.ts`: statusAllowed/handle use the same shape; call sites updated. Existing external mailer/Express/store signatures remain compatible. |

Retention policy and timing:

- The existing owner-store lifecycle starts one pass at boot, then every 60,000 ms. Passes never overlap; close stops ticks and drains the active transaction. Worker/non-owner stores do not start the sweep.
- Captures with `created_at <= now − 24 h` are physically deleted, including captured bodies. Attempts with `created_at <= now − 30 d` are physically deleted, including original/effective addresses and observation metadata.
- Final ledger rows (`sent`, `failed`, `unknown`) with `created_at <= now − 30 d AND updated_at <= now − 30 d` are physically deleted. This deletes recipient, idempotency key, payload hash, lane, provider id/message id, outcome/error code, activity identity/flag and timestamps together. The existing reservation/mark implementation updates `updated_at` on a retry; retaining a recently retried row for that window avoids deleting active dedup protection merely because its original creation was old. No longer final-result replay window was found in callers. Old `reserved` rows remain because deleting an unresolved reservation can authorize duplicate delivery.
- Remaining expired ledger rows are hidden/scrubbed only once, guarded by `activity_retained = 1`.
- Completed feedback received at least 30 days ago has recipient and provider-message id cleared and occurrence time reduced to received time, only while those fields remain populated. Verified event IDs remain to reject webhook replay; unprocessed feedback and suppression state remain untouched.
- All five statements run atomically through the existing storage-kernel transaction. The first pass after an eligible boundary performs deletion, typically at boot or the next minute tick.

Migration 0031:

- New file: `apps/website/src/platform/db/migrations/0031_mail_activity_retention.ts`, registered immediately after 0030 and pinned as `164f0f2db8b390a0aabd7c5ef12c7c24ba32d02d57e16719f57e5181a9d29608`.
- Adds non-null text `mail_activity_attempts.use_id`, default `unknown`, and classifies existing attempts from the five existing key prefixes. Preserves send outcomes and identities. Kysely schema builders supply portable DDL; backfill is one portable data statement in the runner transaction.
- New indexes: attempts `(workspace_id,use_id,created_at,id)`, `(workspace_id,effective_recipient)`, `(workspace_id,recipient)`; legacy ledger `(workspace_id,created_at,activity_id)`; ledger retention `(created_at,updated_at)`; attempts/capture retention `(created_at)` each; inbox retention `(received_at)`.
- `platform/db/sqlite/fresh-content-db.ts` compiles the same builders for fresh SQLite. Its empty tables require no data backfill. New dual-dialect migration test covers fresh indexes, 0030 upgrade, all six classifications, preserved outcomes, pinned registration, and rerun applying nothing.
- 0029 and 0030 are unchanged. No generated/frozen Drizzle migration was edited. Checksum was calculated by the same TypeScript comment-removal/whitespace/SHA-256 algorithm without executing the checksum test.

Static verification:

- `git diff --check`: passed.
- Standard ESLint over all changed TypeScript plus new migration/test files: exit 0, zero errors, 59 warnings across 44 files (existing style warnings plus advisory test/style diagnostics; no suppressions added).
- Strict cyclomatic/cognitive limit 10 over changed production files: only pre-existing `composeSiteRouteDeps` at 13 is reported. The repaired mapper, mail/cache/renderer/store units and 0031 meet the limit. No suppressions added. The review explicitly classified this composition function and unrelated DNS resolveTarget complexity as pre-existing; their algorithms were not refactored.
- `node_modules/.bin/tsc -p tsconfig.json --noEmit --incremental false`: 371 diagnostics; a read-only compiler-host comparison against unchanged HEAD sources gives 372. Zero new diagnostic signatures; the removed diagnostic is the deleted unused laneForPurpose import. Installed Jini artifacts lack branch-required APIs (createMailDeliveryPolicy, createMailLaneLimiter, provider registry/DNS exports, newer result types), among other existing issues. No installs or builds attempted.
- Test-definition tsc also encounters broad existing dependency/type errors. New migration test's invariant kernel type mismatch found by this check was corrected with the existing migration-test `StorageKernel<unknown>` seam. The final test-definition check completed with exit 2 on the existing workspace issues; the new 0031 migration test, added template-isolation tests, headless template refusal test, and credential-sink test have no reported type diagnostics. No test-pass or coverage claim is made.
- Runtime self-validation: not run, explicitly prohibited by the user. No live query-plan or provider-behavior certification. The optional broader test-source HEAD comparison was stopped rather than leave a long-running compiler process.

Architecture/reuse review: static PASS for the changed boundaries, validation PARTIAL due to the prohibited test execution and existing package mismatch. SMTP remains core; no vendor runtime implementation added to core; production durableOutboxReady is unchanged. Existing ports, test approval, permission owner check and ledger transactions remain the behavior owners. No coverage ignores, scope exclusions, deleted tests, or weakened protection assertions were added. Legacy immediate-refresh and perpetual-final-ledger assertions were updated to the explicitly requested throttle/retention policies, with boundary/preservation assertions added.

Reuse: delivery observation; inspected Tovu policy wrapper, attempts observer, resolver warn-once behavior and installed/sibling Jini mail sources; extended the existing wrapper rather than introducing another send lifecycle. Owner: MailerPort/policy contract in the brief.

Reuse: retention/activity; traced boot/close, reserve/reclaim/mark, capture and feedback reads/writes plus ADR-066 0023/0029/0030; extended existing repositories and sweep, native indexed SQL, and ordered migration runner. Persisted migration backfill is a frozen snapshot, not a competing runtime purpose classifier.

Reuse: status throttle/DNS deadline; inspected existing cache and sender-domain verification timeout; extended the existing cache with a port-fed clock and used the same bounded Promise.race/finally timer lifecycle at the existing provider boundary. No new cache/deadline module or dependency.

Reuse: template kind/sanitizer; traced Pages SQL/memory factories, template operations, composition and existing Jini stripActiveHtml/htmlToText; extended the sole HTML writer and existing parse5 email pass. The two store adapters retain their existing distinct storage contracts (post-repository memory vs SQL kernel), without adding a third writer.

Reuse: provider refusal and helper shapes; extended the existing credential refusal owner and test-send operation, retaining the shared route/tool result, rather than sanitizing separately in each transport. Updated existing helper signatures rather than adding wrappers.

Function-quality/documentation review:

| Units | Disposition | Risk handled / evidence |
| --- | --- | --- |
| observeResult / wrapped send / batch | Required finding repaired | Post-delivery observer/logger failure isolated; exact result and aggregate batch tests. |
| purgeExpiredMail / 0031 / observer purpose | Required finding repaired | Physical final deletion, replay-window preservation, one-write guards, timestamp indexes; actual zero-write second-pass and migration tests. |
| activity source selection / projection | Recommended scale risk disclosed | Indexed predicates and bounded ordinary candidates; recent legacy/outcome-filter scans remain explicitly documented and need real database plans at scale. |
| test-send planning/error DTO / credentialFailureReason | Required finding repaired | Resolve-before-freeze and no raw error copy; secret-bearing operation/route/tool and log-sink tests. |
| sanitizer / allowed-kind stores | Required finding repaired | Existing parser/writer reused, kind-bound CAS and static mail policy; malicious inputs and cross-kind regression definitions. |
| cache refresh / DNS requirements / headless guard | Required finding repaired | Bounds, clocks and timers explicit; fresh strict complexity evidence, deadline/refresh/type-narrowing checks. |
| argument-only helpers / permission and why-comments | No additional behavior finding | Same caller results and permissions; corrected signatures and docs. |

Public API docs were updated for cache refresh semantics, DNS timeout, allowed store kinds, retention and activity query cost. The new private helpers have narrow contracts; trivial argument plumbing inherits the caller's docs. No zero-findings claim is made: the recent-window query tradeoff and unavailable runtime evidence remain explicit. A final skepticism pass caught and repaired lost TypeScript narrowing in the extracted headless guard and a test factory that dropped the new options.

Tests to run after the Coordinator provides matching Jini dependencies (NOT run in this dispatch):

```bash
TSX_TSCONFIG_PATH=apps/site-chat/tsconfig.json node --import tsx --test --experimental-test-module-mocks \
  apps/website/src/server/runtime/boot/__tests__/mail-delivery-policy.unit.test.ts \
  apps/website/src/features/mail/__tests__/attempts-retention.dialects.test.ts \
  apps/website/src/features/mail/__tests__/retention.unit.test.ts \
  apps/website/src/features/mail/__tests__/activity.repo.dialects.test.ts \
  apps/website/src/platform/db/migrations/__tests__/mail-activity-retention-step.test.ts \
  apps/website/src/platform/db/migrations/__tests__/mail-activity-indexes-step.test.ts \
  apps/website/src/platform/db/migrations/__tests__/mail-suppression-admin-step.test.ts \
  apps/website/src/platform/db/migrations/__tests__/checksums.test.ts \
  apps/website/src/features/mail-status/__tests__/test-send.test.ts \
  apps/website/src/server/inbound/admin-http/routes/system/__tests__/mail-dns-and-test-send.unit.test.ts \
  apps/website/src/server/inbound/admin-http/routes/system/__tests__/mail-activity.unit.test.ts \
  apps/website/src/features/email-templates/__tests__/render.test.ts \
  apps/website/src/features/email-templates/__tests__/operations.test.ts \
  apps/website/src/features/email-templates/__tests__/operations.sql.test.ts \
  apps/website/src/features/email-templates/__tests__/tool-registrations.test.ts \
  apps/website/src/server/runtime/boot/__tests__/mail-status-cache.unit.test.ts \
  apps/website/src/server/runtime/boot/__tests__/resolve-mailer-lifecycle.unit.test.ts \
  apps/website/src/server/runtime/boot/__tests__/resolve-mailer.unit.test.ts \
  apps/website/src/server/runtime/boot/__tests__/mail-provider-catalog-setup.unit.test.ts \
  apps/website/src/server/runtime/composition/__tests__/site-mailer.unit.test.ts \
  apps/website/src/server/inbound/public-http/http/shared/__tests__/post.test.ts
```

Also run `apps/website/src/features/pages/__tests__/html-document-store.memory.test.ts`, `apps/website/src/features/pages/__tests__/html-document-store.sqlite.test.ts`, `apps/website/src/features/theme/__tests__/tool-registrations.edge-refusals.test.ts`, and `apps/website/src/features/theme/__tests__/tool-registrations.page-publication-read.test.ts`, plus schema/type drift checks and the normal project checks. No claim that lint or tsc substitutes for these runtime tests.

Changed-file inventory:

- `.cloud-coord/round2-FIX-REPORT.md`
- `.cloud-coord/round2-progress.md`
- `apps/website/src/features/agent-plugins/mail-provider-setup.ts`
- `apps/website/src/features/email-templates/__tests__/operations.sql.test.ts`
- `apps/website/src/features/email-templates/__tests__/operations.test.ts`
- `apps/website/src/features/email-templates/__tests__/render.test.ts`
- `apps/website/src/features/email-templates/__tests__/tool-registrations.test.ts`
- `apps/website/src/features/email-templates/operations.ts`
- `apps/website/src/features/email-templates/render.ts`
- `apps/website/src/features/email-templates/tool-registrations.ts`
- `apps/website/src/features/mail-status/__tests__/test-send.test.ts`
- `apps/website/src/features/mail-status/permissions.ts`
- `apps/website/src/features/mail-status/suppressions.ts`
- `apps/website/src/features/mail-status/test-send.ts`
- `apps/website/src/features/mail-status/tool-registrations.ts`
- `apps/website/src/features/mail/__tests__/activity.repo.dialects.test.ts`
- `apps/website/src/features/mail/__tests__/attempts-retention.dialects.test.ts`
- `apps/website/src/features/mail/__tests__/retention.unit.test.ts`
- `apps/website/src/features/mail/activity.repo.ts`
- `apps/website/src/features/mail/attempts.repo.ts`
- `apps/website/src/features/mail/retention.ts`
- `apps/website/src/features/pages/html-document-store.memory.ts`
- `apps/website/src/features/pages/html-document-store.ts`
- `apps/website/src/features/theme/tool-registrations.ts`
- `apps/website/src/platform/db/migrations/0031_mail_activity_retention.ts`
- `apps/website/src/platform/db/migrations/__tests__/mail-activity-retention-step.test.ts`
- `apps/website/src/platform/db/migrations/checksums.ts`
- `apps/website/src/platform/db/migrations/index.ts`
- `apps/website/src/platform/db/sqlite/fresh-content-db.ts`
- `apps/website/src/server/inbound/admin-http/routes/system/__tests__/mail-dns-and-test-send.unit.test.ts`
- `apps/website/src/server/inbound/admin-http/routes/system/mail-activity.ts`
- `apps/website/src/server/inbound/public-http/http/shared/__tests__/post.test.ts`
- `apps/website/src/server/inbound/public-http/http/shared/post.ts`
- `apps/website/src/server/runtime/boot/__tests__/mail-delivery-policy.unit.test.ts`
- `apps/website/src/server/runtime/boot/__tests__/mail-provider-catalog-setup.unit.test.ts`
- `apps/website/src/server/runtime/boot/__tests__/mail-status-cache.unit.test.ts`
- `apps/website/src/server/runtime/boot/__tests__/resolve-mailer-lifecycle.unit.test.ts`
- `apps/website/src/server/runtime/boot/__tests__/resolve-mailer.unit.test.ts`
- `apps/website/src/server/runtime/boot/mail-delivery-policy.ts`
- `apps/website/src/server/runtime/boot/mail-provider-catalog.ts`
- `apps/website/src/server/runtime/boot/mail-status-cache.ts`
- `apps/website/src/server/runtime/boot/resolve-mailer.ts`
- `apps/website/src/server/runtime/composition/app.ts`
- `apps/website/src/server/runtime/composition/deps.ts`
- `apps/website/src/server/runtime/composition/peer-site-reads.ts`
- `apps/website/src/server/runtime/composition/site-mailer.ts`

All compiler/linter sessions launched for this dispatch completed or were explicitly interrupted; no application process was started. The pre-existing untracked `AI-Dev-Shop` link was left untouched. The two new migration/test source files are intentionally uncommitted and must be included with the eventual patch.
