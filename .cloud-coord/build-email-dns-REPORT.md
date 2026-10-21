# build-email-dns REPORT (2026-10-21)

Branch `cloud/build-email-dns-2026-10-21` in both repos (base Tovu e0c935bb / Jini b3c4144b), all pushed.
Run: 16:51–17:20Z, paused 17:20–19:55Z (session usage limit; snapshot branch kept the work), finished 20:40Z.
Subagents: 5 of 12, all Opus, at most 3 at once.

## Lots + commits
| Lot | Jini | Tovu |
|---|---|---|
| Shared helper (provfix) merged | merge of ddc1e606 (registry + ProviderResult/ProviderContext/DomainRequirement) | ff to 9ea45028, then merged c25f08ff (fcc879be) |
| EMAIL v1 | 5c83e520, a32d19e4 (parsers get headers) | e3846080 |
| DNS D1–D3 | 2659b752 (`@jini-ai/devops/dns`) | ad61e17f, 2e414c44 (mail requirements → DNS, scheduled sweep) |
Plus `wip(coord)` progress commits. Mid-run backups are on `cloud/build-email-dns-2026-10-21-wip-snapshot`, which is now superseded and can be deleted.

**EMAIL.** Jini `platform/src/mail`:
- `MailProviderModule` + validation, on the shared registry; built-in `smtp` and `console`.
- `mail.provider.{transactional,bulk}` setting: on first boot it is written from the provider actually in use; console or nothing becomes `unconfigured`. `computeMailStatus` reports it.
- Domain port: `domainRequirements`/`domainStatus` (SPF/DKIM/DMARC as `DomainRequirement`).
- `createMailDeliveryPolicy`:
  - atomic reserve → send → mark ledger with an `unknown` outcome; resend policy per purpose (login links never resent);
  - suppression by lane: hard bounce blocks everything, complaint blocks bulk only;
  - token bucket per provider with capacity reserved for transactional mail;
  - bulk refused without `List-Unsubscribe-Post`;
  - redirect/capture test mode.
- `createMailFeedbackIngest`: body cap, rate limit on unverified requests, rotating secrets, inbox dedup, one suppression writer.

Tovu:
- Explicit per-lane selection replaces the old "first credential wins" chain. Plugin descriptors v2 are accepted; refusals are surfaced.
- Production refuses `MAIL_UNCONFIGURED` instead of silently logging to the console.
- Status: route and `system_get_mail_status` report lanes plus `sender_unverified`; the admin shows a blocking banner.
- Migration **0023_mail_ledgers** (send ledger, suppression, feedback inbox, capture). Captured mail is excluded from database transfer.
- `POST /hooks/mail/:providerId` webhook route.
- Newsletter: bulk lane with per-recipient signed `List-Unsubscribe` + One-Click headers; rate-limited rows are deferred, not failed.
- Resend plugin: full module, Svix-verified feedback keyed on `svix-id`, Domains API, 429 → `retryAfterMs`.
- New tools `mail_set_provider` and `mail_send_test` (approval, not rememberable). Generic settings tools can no longer write `core.mail.provider` or `core.mail.testMode`.

**DNS.** Jini `devops/src/dns`:
- RRset model: structured MX/CAA, TXT chunking, ALIAS, proxy flags.
- Planner: preserve by default, SPF merge, blockers for CNAME coexistence, apex CNAME and CAA conflicts; partial inventory → no changes; plan fingerprint.
- NS delegation check; verification against authoritative nameservers with backoff and a 48h cap.
- Approval binding: workspace, provider account, zone, expiry; deletes are human-only; apex, MX and delete changes cannot be remembered.
- `manual` provider (`automatic: false`) with copyable instructions; registry.

Tovu:
- Migration **0024_domain_bindings**.
- Tools `dns_plan`, `dns_instructions`, `dns_verify` (verify is the only writer of status).
- `node:dns` authoritative-resolver adapter.
- The mail provider's requirements feed DNS through `include: ["mail"]` (existing DMARC kept, `p=none` hint only when absent).
- Due-bindings sweep scheduled in `createServingApp`.

## Tests
- Jini platform/mail: 80/80. Jini devops: 906/906 (88 new dns).
- Tovu touched files: 449 + 134 node:test pass, plus 284 newsletter/members.
- Admin banner: 5/5 (vitest).
- Agents also ran 2589 assistant tests and 1065 composition/boot tests, green at concurrency 1.
- tsc: Tovu still has the 10 errors present at base (import-site, browser-binding, backstop-service ×3, app/deps ContentKernel + consentAudit, permanent-delete-deps). Jini platform and devops are clean.
- `pnpm guard`: its self-test fails on the unmodified base too (agent-runtime R2 fixture), so it was not used. The devops subpath and layer checks were run directly and are clean.

## Coverage (line/branch/function, per touched file)
- 100/100/100 on all new or touched source files:
  - Jini `mail/{provider,policy,rate-limit,feedback,builtin-providers}.ts`, `dns/*.ts`.
  - Tovu `features/mail/*`, `0023`, `0024`, `mail-feedback.ts`, Resend `adapters/resend.mjs` + `lib/{feedback,domains}.mjs`.
  - Tovu `resolve-mailer`, `mail-provider-catalog`, `mail-delivery-policy`, `site-mailer`, `settings/mail-provider`, `mail-adapter-registry`, `mail-status` tool + route, `send-pipeline`.
  - Tovu `domain-dns/{binding.repo,dns-changes,dns-tools,mail-requirements}`, `authoritative-dns`, `dns-change-deps`, `domain-binding-sweeper`, `serving-app`.
- I spot-checked the agents' claims myself (resolve-mailer, features/mail, dns-changes): all 100%. Neither repo's diff adds any coverage-ignore comment.
- Not run per-file: Jini pre-existing `smtp.ts` and `purpose-scoped-mailer.ts`, which I did not edit (their branch gaps were already there).

## Deviations
- Setting keys are `core.mail.provider` / `core.mail.testMode`, in the settings namespace of the provfix sender setting.
- Breaking change to unimplemented Jini ports only: `MailSuppressionRepoPort` scopes are now `all|bulk`; `MailSendDedupRepoPort` is deprecated in favour of `MailSendLedgerPort`.
- DNS `managedBy` is `'self'|'other'`: lint bans product names in the engine.
- Migration registration files (index, checksums, fresh-db, table-pin tests) register 0023 and 0024 together inside the EMAIL commit e3846080. The DNS commit ad61e17f depends on it.
- Not built (later): `tovu-dns-providers.json` plugin contribution file, Jini DNS conformance testkit, mail templates (lot E4), Postmark.
- The Tovu `MailerPort` call shape is positional (unlike Jini's), so it is adapted at the policy and the DNS HTTP client.

## TEMP definitions still present
None. The shared helper existed before any code was written, so no `// TEMP` files were created.

## Screens needing a local Chrome look
- Admin `MailStatusBanner` with `state: "unconfigured"` (light and dark, next to `ServerRestartingBanner`), and with `state: "ready"` (no banner).
- Assistant confirmation cards for `mail_set_provider` and `mail_send_test`.

## LOCAL-RUN NEEDED
- Postgres tests:
  - `migrations/__tests__/runner.postgres.test.ts` (now pins 86 tables at 0024) and `migration-manifest-postgres.test.ts`;
  - `database-transfer/__tests__/{copy-engine,tool-registrations}.postgres.test.ts`.
  - The 0023/0024 DDL and repos were only checked on PGlite.
- Real boot, fresh site and upgraded site (saved Resend/SMTP key): confirm the first-boot setting write keeps the provider in use.
- `mail_set_provider` then `mail_send_test` with a real key; a Resend webhook delivery (Svix signature) to `/hooks/mail/resend`; a one-click unsubscribe POST through the public stack.
- A newsletter campaign against a real rate-limited provider.
- A live `dns_verify` / sweep through `node:dns` against a real domain, and `include: ["mail"]` with a real Resend key and sender.

## Owner questions
1. Default provider and fresh install: the build ships `unconfigured` plus a banner, per the gap check. Should onboarding push SMTP or Resend first?
2. May agents delete DNS records at all? Today deletes are human-only and apply is not built (D4).
3. Is bulk mail newsletter-only? Today bulk needs One-Click headers, which only the newsletter mints.
4. Should the `mail_capture` table be purged on a timer? It holds raw sign-in links in capture mode.
