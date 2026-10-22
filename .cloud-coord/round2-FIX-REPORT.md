Programmer(Execution): Programmer + TDD personas loaded; implementation/security fixes and DI-based regression definitions.

Round-2 FIX handoff, 2026-10-22. Branch `codex/round2-fix`, reviewed tip `0b5977af5de9004d08c3085b797152039c37dd3b`. No commits or other git mutations. No tests, installs, builds, application servers or provider calls run. Jini and the live Tovu checkout remained read-only.

Inputs: supplied CHECK findings 1–41; `.cloud-coord/email-design.md` with overriding Owner decisions; `.cloud-coord/round2-progress.md`; `.cloud-coord/round2-REPORT.md`; canonical architecture sections 13/14 and ADR-066. Local ADS-memory references were absent, so canonical `/Users/la/Programming/Tovu/ADS-memory` files were consulted. MCP graph tools were not available; direct source/manifest/installed-package searches used. Existing Post/Pages transactions, custom credential storage, provider resolver, Jini delivery policy and limiter, and store owner/close lifecycle are the reused owners.

Status means implementation/test definitions changed, not runtime certification. **Coverage execution and the requested 100% line/branch/function proof remain deferred to the coordinator under the explicit no-tests instruction.** No coverage exclusions or ignores added. New DI tests cover the named missing cases; runtime failures may remain until those tests run.

| Finding | Disposition | Change / evidence |
|---|---|---|
| 1 | fixed | Owner identity checked independently of action permission in prepare and run; reason required; tool always asks. |
| 2 | fixed | Frozen provider/driver/From/mode/effective-recipient approval; rechecked by operation and actual policy dispatch. |
| 3 | fixed | Reviewed suppression incarnation carried into execution; advisory lock, conditional DELETE RETURNING, audit in the same transaction only for the winner. |
| 4 | fixed | Status errors use fixed safe diagnostics; raw send/check errors and codes never enter lastError. DNS requirement failures are also safe. |
| 5 | fixed | Composed boot/minute retention pass: delete captures at 24 h and attempts at 30 d; hide expired ledger activity and scrub completed feedback recipient/message metadata; preserve dedup identities and suppression protection. |
| 6 | fixed | Existing Tovu delivery-policy wrapper observes actual results including pre-reservation suppression/throttling and capture; separate body-free attempt projection. |
| 7 | fixed | Attempt metadata retains original/effective recipient and mode; displayed redirect recipient and feedback joins use the effective address. |
| 8 | fixed | Generation-tag in-flight resolutions; detach on invalidation, suppress stale publications, and recheck credential fingerprint after decrypt. |
| 9 | fixed | Published createMailLaneLimiter reused. Remaining generic owners recorded with exact extraction APIs/files in the required SURVEY backlog; Jini unchanged. |
| 10 | fixed test definitions; verification deferred | Deferred-load cache tests cover cold sharing, rejection/retry, expiry, invalidation, stale completion and refresh interleavings. |
| 11 | fixed test definitions; verification deferred | Parser tests add null/array boundaries, non-string labels, and oversized optional text with exact refusal assertions. |
| 12 | fixed test definitions; verification deferred | New saved-SMTP-without-username DTO test asserts saved/selectable false and exact refusal. |
| 13 | fixed test definitions; verification deferred | Added missing label, creation/rotation sealing and repository-write failures, and disappearing-row tests; unchanged state and no invalidation/activation asserted. |
| 14 | fixed test definitions; verification deferred | Empty limits/recipients, overlong recipients and nonintegral cursor payload refusal tested. New cursors use stable keys instead of offsets. |
| 15 | fixed test definitions; verification deferred | Explicit empty suppression search and empty continuation tested, including cursor and empty classification. |
| 16 | fixed test definitions; verification deferred | Non-Error/form/settings/probe failures isolated and unaffected readiness rows asserted. |
| 17 | fixed test definitions; verification deferred | Real dialect transactions with injected delete/audit faults assert rollback; concurrent removal and recreation tests assert one audit and no inherited approval. |
| 18 | fixed test definitions; verification deferred | Provider/credential/inbox failures covered at shared operation, HTTP and tool seams; HTTP logs exclude arbitrary dependency text. |
| 19 | fixed test definitions; verification deferred | Typed duplicate/not-found/vault failures injected through route ports; status/code, no secrets and unchanged state asserted. |
| 20 | fixed test definitions; verification deferred | Production mail bindings now live in createSiteMailer.operations, directly consumed by deps.ts; public-operation tests cover composed settings, credentials, sender, test mode and readiness plus failures. |
| 21 | fixed test definitions; verification deferred | Replaced result-label redirect fake with actual policy executions asserting transport destination, captures, suppression and replay without another token. |
| 22 | fixed test definitions; verification deferred | Replaced manufactured not-live exception with real seeded/trashed templates; separate race between lookup and real Pages-store read. |
| 23 | fixed test definitions; verification deferred | Real Jini page deadline clock advances through stable attempt; asserts fallback gets 4 s, successful metadata read, and exhausted fallback prevents metadata read. |
| 24 | fixed | Unknown delivery outcome preserved explicitly; retryable false. |
| 25 | fixed | Site-scoped request-result single flight precedes limiter; same request replays result without another token or capture. In-memory result retention is bounded; durable send ledger still protects external sends. |
| 26 | fixed | Readiness uses the resolved provider for each row's transactional/bulk lane. |
| 27 | fixed | Readiness uses mailSenderIdentityFor; missing configured sender blocks SMTP. |
| 28 | fixed | Template row and Pages HTML conversion join existing Post/kernel transaction; rollback test asserts no orphan and clean retry. |
| 29 | fixed | Activity and suppression paging use timestamp plus stable opaque row identity; no offset skipped rows and no address in masked cursors. |
| 30 | fixed | Only processed feedback establishes receiving; pending signed events remain unhealthy until processing completes. |
| 31 | fixed | Resolver exposes the shared richer sender-domain verdict; whole check bounded to 5 s. DNS requirement lookup starts independently. |
| 32 | fixed | Bounded kind-filtered live-HTML query in SQL/memory Post owners; template list accepts limit/cursor. No unrelated post/page bodies loaded. |
| 33 | fixed | Stored PostKind includes email-template; public Post/Page lookups and both search dialects exclude it; generic Trash classifies it through the existing Post deletion owner. |
| 34 | fixed | New operation dependencies moved into required object; second options object reserved. Scalar helpers converted; TypeScript type predicates retain scalar signatures as required for language narrowing, and framework callback ABIs remain compatible. |
| 35 | fixed | Optional setup validation extracted to withSetup; static ESLint complexity confirms parseDescriptorV2 and new/changed small functions at or below 10. |
| 36 | fixed | Known credential-store errors return the documented {error, code} envelope without raw detail. |
| 37 | fixed | Minimal withSetup wrapper avoids another descriptor-return merge owner; exact credentialCard/setup combination documented below. Live branch remains read-only. |
| 38 | fixed | Only unapplied 0029/0030 rewritten with schema builders; same builders compile fresh-SQLite DDL. Ordered IDs retained and their two checksums repinned. |
| 39 | not-a-bug | Not a bug in this tip: the skeleton already uses a single \n escape producing an actual newline. Added rendered-visible-text regression. |
| 40 | fixed | Separate fieldsDeclared flag ensures an empty first declaration still wins. |
| 41 | fixed | Object field names/samples with unsupported delimiters refused before persistence; supported object input round trip tested. |

Merge instructions for mail-adapter-registry.ts

Keep the live branch's `MailCredentialCard` parsing, `credentialCard`/`credentialCardRefusal` descriptor fields, and `loadMailCredentialCards` unchanged. In `parseDescriptorV2`, build the live `card` contribution as today, then pass its descriptor to round-2's wrapper: `return withSetup({ descriptor: { schemaVersion: 2, id, label: base.label, module: base.module, credentialLabel: savedUnder, credentialKeys, feedback, ...card }, setup: entry.setup, at });`. Keep `setup?: MailProviderSetup` on the descriptor. Keep both catalog surfaces: live credential-card loader/form-prefill owner and round-2 `setupFor`. Do not replace credential-card secure forms with the setup parser or its username follow-up. Coordinator must run the combined-descriptor + secure-prefill test after merging the live card implementation; that implementation is absent from this branch, so no fabricated combined-card test was added here.

Jini extraction

See `ADS-memory/.local-artifacts/tovu-to-jini-extract/SURVEY.md` for exact source/destination paths, required-object APIs and invariants. Installed canonical platform package 0.5.10 satisfies Tovu's ^0.5.10 limiter requirement. This checkout has no node_modules; nothing was installed. No equivalent generation-aware TTL cache, mail setup parser, or reusable safe email renderer was found in the inspected Jini owners. They remain local per the dispatch exception until Coordinator schedules and publishes Jini extraction. SMTP stays core; no new vendor-specific core branches or cross-plugin imports. Production `durableOutboxReady` remains the same `() => false` function.

Verification and limitations

Read-only TypeScript parsing and contract diagnostics used the canonical installed dependencies through an in-memory resolution host, with no emitter or application execution. Static complexity analysis reports no new function above 10 after splitting template pagination validation. The pre-existing `composeSiteRouteDeps` remains 13; this round only replaces its inline mail bindings with the existing mail composition owner. `git diff --check` was clean. Final static outcomes are recorded in the final handoff message.

Retention uses a boot pass and a minute interval, disposed and drained with the content store. Minimal send deduplication tombstones intentionally survive 30 days; activity projection and completed feedback recipient/message metadata do not. Captured bodies are physically deleted at the 24-hour cutoff on each pass. Request replay results are in memory (bounded to 4096); a restart loses capture-result replay, while durable send identities continue preventing duplicate external sends. Generic durable request-result replay belongs in the follow-up Jini policy extraction.

Next assignee: Coordinator for test execution/100% coverage verification, combined credential-card merge tests, review and commit. No certification or release readiness is claimed.

Files changed

- `apps/website/src/features/agent-plugins/__tests__/unit/mail-provider-setup.unit.test.ts`
- `apps/website/src/features/agent-plugins/mail-adapter-registry.ts`
- `apps/website/src/features/agent-plugins/mail-provider-setup.ts`
- `apps/website/src/features/domain-dns/__tests__/mail-dns-status.test.ts`
- `apps/website/src/features/domain-dns/mail-dns-status.ts`
- `apps/website/src/features/email-templates/__tests__/operations.test.ts`
- `apps/website/src/features/email-templates/__tests__/render.test.ts`
- `apps/website/src/features/email-templates/agent-tools.ts`
- `apps/website/src/features/email-templates/operations.ts`
- `apps/website/src/features/email-templates/render.ts`
- `apps/website/src/features/email-templates/tool-registrations.ts`
- `apps/website/src/features/mail-status/__tests__/delivery-visibility.unit.test.ts`
- `apps/website/src/features/mail-status/__tests__/mail-status-tool.test.ts`
- `apps/website/src/features/mail-status/__tests__/provider-operations.unit.test.ts`
- `apps/website/src/features/mail-status/__tests__/provider-tools.unit.test.ts`
- `apps/website/src/features/mail-status/__tests__/suppressions-feedback.unit.test.ts`
- `apps/website/src/features/mail-status/__tests__/test-send.test.ts`
- `apps/website/src/features/mail-status/activity.ts`
- `apps/website/src/features/mail-status/delivery-tool-registrations.ts`
- `apps/website/src/features/mail-status/feedback-setup.ts`
- `apps/website/src/features/mail-status/provider-operations.ts`
- `apps/website/src/features/mail-status/provider-tool-registrations.ts`
- `apps/website/src/features/mail-status/suppressions.ts`
- `apps/website/src/features/mail-status/test-send.ts`
- `apps/website/src/features/mail-status/tool-registrations.ts`
- `apps/website/src/features/mail-status/use-readiness.ts`
- `apps/website/src/features/mail/__tests__/activity.repo.dialects.test.ts`
- `apps/website/src/features/mail/__tests__/attempts-retention.dialects.test.ts`
- `apps/website/src/features/mail/__tests__/retention.unit.test.ts`
- `apps/website/src/features/mail/__tests__/suppression-admin.repo.dialects.test.ts`
- `apps/website/src/features/mail/activity.repo.ts`
- `apps/website/src/features/mail/attempts.repo.ts`
- `apps/website/src/features/mail/ledger.repo.ts`
- `apps/website/src/features/mail/retention.ts`
- `apps/website/src/features/mail/suppression-admin.repo.ts`
- `apps/website/src/features/mail/suppression.repo.ts`
- `apps/website/src/features/post/post.ts`
- `apps/website/src/features/post/repo.memory.ts`
- `apps/website/src/features/post/repo.ts`
- `apps/website/src/features/post/search-index.postgres.ts`
- `apps/website/src/features/post/search-index.sqlite.ts`
- `apps/website/src/features/trash/trash-item-tool.ts`
- `apps/website/src/features/web-screenshot/__tests__/playwright-page-capture.unit.test.ts`
- `apps/website/src/platform/db/migrations/0029_mail_activity_indexes.ts`
- `apps/website/src/platform/db/migrations/0030_mail_suppression_admin.ts`
- `apps/website/src/platform/db/migrations/__tests__/runner.postgres.test.ts`
- `apps/website/src/platform/db/migrations/checksums.ts`
- `apps/website/src/platform/mail/index.ts`
- `apps/website/src/platform/mail/ports.ts`
- `apps/website/src/platform/mail/sender-domain-verification.ts`
- `apps/website/src/server/__tests__/routes/mail-providers-route.test.ts`
- `apps/website/src/server/inbound/admin-http/routes/email-templates/__tests__/routes.test.ts`
- `apps/website/src/server/inbound/admin-http/routes/email-templates/routes.ts`
- `apps/website/src/server/inbound/admin-http/routes/system/__tests__/mail-activity.unit.test.ts`
- `apps/website/src/server/inbound/admin-http/routes/system/__tests__/mail-dns-and-test-send.unit.test.ts`
- `apps/website/src/server/inbound/admin-http/routes/system/mail-activity.ts`
- `apps/website/src/server/inbound/admin-http/routes/system/mail-providers.ts`
- `apps/website/src/server/inbound/admin-http/routes/system/mail-test-send.ts`
- `apps/website/src/server/routes/types.ts`
- `apps/website/src/server/runtime/boot/__tests__/mail-provider-catalog-setup.unit.test.ts`
- `apps/website/src/server/runtime/boot/__tests__/mail-status-cache.unit.test.ts`
- `apps/website/src/server/runtime/boot/__tests__/resolve-mailer-lifecycle.unit.test.ts`
- `apps/website/src/server/runtime/boot/mail-delivery-policy.ts`
- `apps/website/src/server/runtime/boot/mail-provider-configuration.ts`
- `apps/website/src/server/runtime/boot/resolve-mailer.ts`
- `apps/website/src/server/runtime/boot/sender-domain-verification.ts`
- `apps/website/src/server/runtime/composition/__tests__/site-mailer.unit.test.ts`
- `apps/website/src/server/runtime/composition/deps.ts`
- `apps/website/src/server/runtime/composition/site-mailer.ts`

Tests added or extended (exact paths; unexecuted)

- `apps/website/src/features/agent-plugins/__tests__/unit/mail-provider-setup.unit.test.ts`
- `apps/website/src/features/domain-dns/__tests__/mail-dns-status.test.ts`
- `apps/website/src/features/email-templates/__tests__/operations.test.ts`
- `apps/website/src/features/email-templates/__tests__/render.test.ts`
- `apps/website/src/features/mail-status/__tests__/delivery-visibility.unit.test.ts`
- `apps/website/src/features/mail-status/__tests__/mail-status-tool.test.ts`
- `apps/website/src/features/mail-status/__tests__/provider-operations.unit.test.ts`
- `apps/website/src/features/mail-status/__tests__/provider-tools.unit.test.ts`
- `apps/website/src/features/mail-status/__tests__/suppressions-feedback.unit.test.ts`
- `apps/website/src/features/mail-status/__tests__/test-send.test.ts`
- `apps/website/src/features/mail/__tests__/activity.repo.dialects.test.ts`
- `apps/website/src/features/mail/__tests__/attempts-retention.dialects.test.ts`
- `apps/website/src/features/mail/__tests__/retention.unit.test.ts`
- `apps/website/src/features/mail/__tests__/suppression-admin.repo.dialects.test.ts`
- `apps/website/src/features/web-screenshot/__tests__/playwright-page-capture.unit.test.ts`
- `apps/website/src/platform/db/migrations/__tests__/runner.postgres.test.ts`
- `apps/website/src/server/__tests__/routes/mail-providers-route.test.ts`
- `apps/website/src/server/inbound/admin-http/routes/email-templates/__tests__/routes.test.ts`
- `apps/website/src/server/inbound/admin-http/routes/system/__tests__/mail-activity.unit.test.ts`
- `apps/website/src/server/inbound/admin-http/routes/system/__tests__/mail-dns-and-test-send.unit.test.ts`
- `apps/website/src/server/runtime/boot/__tests__/mail-provider-catalog-setup.unit.test.ts`
- `apps/website/src/server/runtime/boot/__tests__/mail-status-cache.unit.test.ts`
- `apps/website/src/server/runtime/boot/__tests__/resolve-mailer-lifecycle.unit.test.ts`
- `apps/website/src/server/runtime/composition/__tests__/site-mailer.unit.test.ts`
