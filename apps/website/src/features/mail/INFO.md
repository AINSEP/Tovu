# Mail delivery data + feedback

The data half of the email provider contract v1 (Jini `@jini-ai/platform/mail`): SQL adapters for its ports, and the provider webhook that fills the do-not-send list. Selection, sending and the delivery policy live in the composition (`server/runtime/composition`, `server/runtime/boot`); this slice only stores and ingests.

Tables (migration `0023_mail_ledgers`, raw SQL on SQLite and Postgres, workspace-cascaded):

- `ledger.repo.ts` — `MailSendLedgerPort`. `reserve` inserts-if-absent, flips a `failed` row back to `reserved` in one conditional UPDATE, else returns the stored row; it and `mark` run under the identity's `lockKey`, so concurrent workers never both reserve.
- `suppression.repo.ts` — `MailSuppressionRepoPort`. Keyed by address + scope, never provider. Transactional mail is blocked by `all` only (hard bounce, manual); bulk by `all` or `bulk` (complaint), so a complainer still gets sign-in links.
- `feedback-inbox.repo.ts` — `MailFeedbackInboxPort`. Unique `(provider_id, event_id)`: provider replays are no-ops.
- `capture.repo.ts` — `MailCapturePort` + `listCaptured`: test/capture mode stores whole messages instead of sending.

Factories take `({ db }, optional = {})` with `db` the content kernel; `optional.nowIso` (and `newId` for capture) are test seams.

Webhook: `POST /hooks/mail/:providerId`. `feedback-route.ts` is framework-free (features never import Express) over Jini's `createMailFeedbackIngest`: body cap 413, unverified-request rate limit 429, unknown provider 404, no secret 503, bad signature 401. `server/inbound/public-http/routes/mail-feedback.ts` mounts it with a raw parser ahead of the public JSON parser (signatures are over exact bytes). `feedback-sources.ts` reads the parser from a plugin module's `.feedback` and the signing secrets from the custom-credentials vault: label `Tovu Mail — <Provider label> Webhook Secret`, plus `… Webhook Secret (previous)` during rotation (any saved one may verify). `site-feedback-route.ts` wires them for the composition root.

Tests: `__tests__/repos.dialects.test.ts` (SQLite + PGlite), `__tests__/feedback-route.test.ts` (fakes), the route mount's `server/inbound/public-http/routes/__tests__/mail-feedback.unit.test.ts`, and `platform/db/migrations/__tests__/mail-ledgers-step.test.ts`.
