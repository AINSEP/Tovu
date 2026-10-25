Code Inspection(Review): Personas used: code-inspection + security + TDD.

Reviewed branch-tip email/mail source only. No files changed; no tests, builds, or installs run.

| Sev | repo:file:line | Problem | Concrete fix |
|---|---|---|---|
| HIGH | Tovu: `apps/website/src/server/runtime/boot/mail-provider-catalog.ts:4`; `package-lock.json:3279` | Tovu imports newly added Jini APIs, but its lockfile still installs the previous published packages. The paired Jini branch remains marked `Unreleased`; its source changes do not reach a normal Tovu installation. | Publish the changed Jini packages and update Tovu’s dependency minimums and lockfile before merging Tovu. |
| HIGH | Jini: `packages/platform/src/mail/feedback.ts:81` | Inbox insertion commits before suppression. If suppression fails or the process stops, the replay returns `duplicate` and permanently skips the bounce/complaint update. Tovu’s inbox adapter supplies no enclosing transaction. | Make inbox recording and suppression atomic, or persist processing state and retry incomplete events. Add failure-and-replay coverage. |
| HIGH | Jini: `packages/platform/src/mail/policy.ts:147` | Concurrent retries of an `unknown` outcome both receive `"resend"` without acquiring a reservation. Both can dispatch, including through SMTP, which has no provider idempotency support. | Atomically claim an eligible unknown outcome before resending. Test two concurrent retries with a blocked provider call. |
| HIGH | Tovu: `apps/website/src/features/newsletter/send-pipeline.ts:537` | Every local quota deferral fails the batch and consumes an outbox attempt. Batches contain 20 recipients, but the outbox allows six attempts: a fast provider with Resend’s two-token burst can exhaust retries while recipients remain pending. | Reschedule remaining recipients without spending the failure budget on ordinary quota waits; honor `retryAfterMs`. Test a complete 20-recipient batch through recovery. |
| MEDIUM | Tovu: `apps/website/src/features/newsletter/send-pipeline.ts:268`; `content/agent-plugins/resend/adapters/resend.mjs:88` | Only `MAIL_RATE_LIMITED` is deferred. Resend 429 responses retain provider error codes, so they become terminal failed newsletter rows despite being retryable. | Normalize provider throttling into a shared typed result and defer those rows using the supplied delay. |
| MEDIUM | Jini: `packages/platform/src/mail/rate-limit.ts:28` | Resend declares `burst: 2`, making the default transactional reserve `floor(0.4) = 0`. Bulk can drain the entire bucket and prevent an interactive sign-in email. | Preserve at least one transactional token when burst permits it. Add a test using the actual Resend limits and default options. |
| MEDIUM | Jini: `packages/platform/src/mail/feedback.ts:105` | Thirty unsigned requests block **all** feedback for that provider before signature verification, including legitimate signed requests. An unauthenticated caller can repeatedly deny bounce/complaint ingestion. | Scope unauthenticated throttling by request source, or allow verified requests through independently. Test valid delivery after exhausting the invalid-request allowance. |
| MEDIUM | Jini: `packages/platform/src/mail/builtin-providers.ts:50` | The replacement console provider omits message bodies. Local member sign-in and subscription confirmation now report success without exposing their links. The new test explicitly pins this regression (`provider.test.ts:124`, testing-mistake F4.6). | Preserve an explicit local preview/capture path and assert that its output contains the usable link. |
| MEDIUM | Jini: `packages/platform/src/mail/policy.ts:59` | The payload hash includes attachment filenames but excludes attachment contents, content types, reply-to, and display names. Reusing a sent key with changed attachment contents can return success for the previous message instead of reporting a conflict. | Hash the complete delivery payload canonically. Test changed attachment contents under an existing key. |

No verified header-injection or raw-credential logging defect was found in the reviewed changes.

**Rules check**

- Plugins never import each other: **OK** — Resend imports its own libraries (`Tovu:content/agent-plugins/resend/adapters/resend.mjs:2`).
- Generic code lives in Jini: **violated** — the product-neutral sender resolver remains in Tovu (`apps/website/src/platform/mail/sender-identity.ts:64`). Move it to Jini; retain the site-settings adapter in Tovu.
- Two-object API signatures: **violated** — new public functions omit the optional object, including `Jini:packages/platform/src/mail/builtin-providers.ts:23`.
- Dependencies injected as ports: **OK** in the reviewed mail flows.
- React components receive data through props: **violated** — `MailStatusBanner` fetches through its internal hook (`Tovu:apps/admin/src/components/MailStatusBanner/MailStatusBanner.tsx:12`). Pass resolved status from the host.
- Cyclomatic complexity ≤10: **violated by inspection** — `validateMailProvider` has CC 11 when boolean branches are counted (`Jini:packages/platform/src/mail/provider.ts:71`). Mechanical metrics were not run.
- Existing “why” comments preserved: **violated** — the fixed-label lookup rationale at base `e0c935bb5:apps/website/src/server/runtime/boot/resolve-mailer.ts:56` was deleted. Restore it beside the credential lookup.
- ADR-066 TypeScript migrations; no new Drizzle migrations: **OK** — `Tovu:apps/website/src/platform/db/migrations/0023_mail_ledgers.ts:41`.
- No data loss: **violated** — suppression updates can be lost and newsletter deliveries stranded, as detailed above.
- No unflagged `// TEMP: replaced by shared helper`: **OK** — none found in reviewed scope.

**Verdict: MERGEABLE AFTER FIXES** — dependency integration, feedback recovery, duplicate-send protection, and rate-limit delivery handling need correction before merge.
