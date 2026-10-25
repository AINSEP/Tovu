Codex(Review Mode): **Do not launch these designs unchanged.** The direction is sound, but unresolved delivery, privacy and cutover semantics would become implementation guesses.

Paths below: **T**=`tovu-int/apps/website/src`, **J**=`jini-int/packages`, **C**=`tovu-int/content/agent-plugins`.

**Email**

- **v1 / M:** Sender identity needs verification state per provider: permitted From domains, envelope sender, DKIM selectors, SPF requirements and DMARC alignment diagnostics. Email produces requirements; the host passes them to DNS through ports. Never replace existing SPF/DMARC blindly.
- **v1 / M:** Fix the “ledger prevents double sends” claim. SMTP can accept a message before the connection fails; retrying an unknown outcome can duplicate delivery. Require atomic claims, per-recipient identities, payload hashes and an explicit unknown-outcome policy. Existing dedup exposes only `wasSent`/`markSent` (**J/platform/src/mail/ports.ts:45**). Automatic cross-provider failover must exclude ambiguous sends.
- **v1 / M:** Feedback normalization lacks the event ID and recipient address needed for inbox deduplication and suppression (**J/platform/src/mail/types.ts:78**). Specify provider/account/workspace correlation, secret rotation, replay handling and delayed feedback after provider switches. Keep suppression durable across providers; distinguish marketing opt-out from delivery suppression.
- **v1 / M:** Define separate transactional/bulk queues, quotas, retry budgets and reserved transactional capacity. Existing `lane` means interactive/notification, not transactional/bulk (**J/platform/src/mail/types.ts:55**). Unsubscribe headers require a working, signed, idempotent unsubscribe endpoint.
- **v1 / S:** SMTP is a default adapter, not working delivery on a fresh install. Report `NOT_CONFIGURED`; provide an explicit capture/test mode. Current boot falls back to Console (**T/server/runtime/boot/resolve-mailer.ts:245**). Add locale fallback and template-variable validation; redact credentials, bodies and magic links. **later / M:** template overrides and automated failover.

**DNS**

- **v1 / M:** Retain fingerprint approval, but bind it to workspace, provider account, authoritative zone and expiry. Recheck before each destructive operation; journaled partial execution requires renewed approval when the remaining plan changes. Existing Cloudflare code checks before-images during deletion (**C/cloudflare/lib/domains.mjs:76**).
- **v1 / M:** The record model is insufficient: model RRsets, MX priority, structured CAA, TXT chunks, proxy flags and provider-specific alias targets. A flattening boolean cannot represent every apex capability.
- **v1 / M:** Manual DNS cannot infer complete inventory from public queries or equate registrable domain with authoritative zone. Support delegated subzones, explicit DNS-host selection and copyable instructions; unknown inventory must remain unknown.
- **v1 / L:** Specify deploy-binding → validation → DNS cutover → certificate/content verification ordering. DNS propagation alone proves neither correct TLS nor correct deployment. Existing Cloudflare flow explicitly orders bindings before routing (**C/cloudflare/lib/domains.mjs:29**). Add conditional rollback plans, drift checks, rate-limit handling and durable polling. **out / L:** registrar purchase/transfer.

**Search**

- **v1 / M:** Make vendor indexing public-only. Audience filters do not prevent private bodies reaching vendors. Revalidate current publication/access state before returning titles, snippets or URLs; cached results and delayed deletes must fail closed.
- **v1 / L:** Specify namespaced site/workspace/collection/document keys, ordered revisions, versioned tombstones, resumable backfill, catch-up watermarks and atomic generation switches. “Older versions overwritten deterministically” permits resurrection. Search S2 is stale: published trash already emits unpublish (**T/features/post/post.ts:757**).
- **v1 / M:** Contract owner agreement must precede implementation: use the required/optional object convention, define async task completion and per-document batch outcomes. Add facet request/results, ranking configuration, safe snippets, deadlines and cancellation. Conformance must cover isolation, stale writes, partial failures and async completion.
- **v1 / M:** Specify bounded vendor timeouts and explicit unavailable behavior. **later / M:** warm local fallback; it requires maintained indexing and the owner’s provider.

**Cross-cutting**

- **v1 / S:** Shared registry first is correct; remove clone instructions. Freeze its ABI before parallel jobs.
- **v1 / M:** Assign shared composition/migration ownership; settle email↔DNS requirements and deploy↔DNS sequencing first. Preserve bundled-only trust (**J/agent-plugins/src/lifecycle/trusted-plugin-files.ts:24**).
- **v1 / M:** Require behavioral failure tests alongside coverage/complexity gates. Build email and DNS slices now. Hold search implementation until owner contract agreement; then parallelize adapters against frozen conformance tests.

<<SWARM_END>>