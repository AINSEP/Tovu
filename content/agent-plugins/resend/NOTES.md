# Resend — implementation notes

Host-specific notes moved out of Tovu core comments (2026-10-22, vendor-to-plugins). Core describes these
behaviours generically; the vendor detail lives here.

- **Rate limit.** Resend's 2/s, burst-2 bucket (`capabilities.rateLimit` in `adapters/resend.mjs`) is why
  core's newsletter send pipeline treats a quota answer as back-pressure, not a failure (review email#4,
  2026-10-21): a batch of 20 deferred on almost every other row and used to exhaust the outbox budget.
- **Batch idempotency keys.** One key per message (`<key>:<index>`), which core's mail delivery policy now
  mirrors for per-recipient dispatch.
- **Credential label.** `Tovu Mail — Resend API` is the v1 label shape core's `defaultCredentialLabel`
  reproduces for v2 descriptors without one.
- **Feedback inbox.** Resend webhook events are recorded under `providerId: "resend"`.
