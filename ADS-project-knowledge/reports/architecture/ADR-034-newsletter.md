# ADR-034: Newsletter — Email Campaigns as a Tier-3 Bundled Plugin over a Tier-2 MailerPort, Outbox-Driven Async Sending

- Status: PROPOSED 2026-07-10 (autonomous Opus 4.8 sweep agent — design-only, no peer audit; owes debate+audit before ACCEPTED)
- Author: autonomous Opus 4.8 sweep agent
- Extends: **ADR-024** (Newsletter is a bundled plugin exercising the tiered trust model; §3.5 tier-3), **ADR-022** (campaigns are a seeded content-type on `entries`; editorial half reused), **ADR-023** (relational audience/delivery state via core-mediated `dataModule` own-tables)
- Relates: ADR-006 (`MailerPort` + `SubscriberDirectoryPort` rule-of-two), ADR-009 (outbox async + hooks + compensation), ADR-021 (`authorize()` + flat `newsletter.*` strings), ADR-007 (workspace scoping + composite FKs), ADR-026 (atomic multi-write for counters/ledger transitions), ADR-020/025/027 (cookie-less origin isolation lineage — unsubscribe + webhook endpoints), ADR-012 (per-site `content.db` + install-dir portability)
- Sources: brief (`todos.md` Admin Section Spec Sweep — Newsletter); `tovu-v2-design.md §3.5` (WordPress→Tovu capability map, placement rule); `docs/research/competitor-analysis.md` (Ghost newsletter/email-service/members split); depth benchmark ADR-027/ADR-022
- Design report: `ADS-project-knowledge/reports/section-designs/20260710-newsletter-design.md`
- Typed interfaces (compile-checked): `src/newsletter/ports.ts`, `src/newsletter/types.ts`

## Context

Tovu needs a Newsletter surface — compose an email campaign, target a subscriber list, schedule
it, send it reliably to thousands of recipients, and handle unsubscribes lawfully. Ghost (the
publishing-first reference) treats `newsletters`, `email-service`, `email-analytics`, and
`members` as **four separate service families** — newsletters are not members, and mail sending is
a shared primitive under both. `tovu-v2-design.md §3.5` already encodes this split: `wp-root mail`
maps to a **Tier-2 `MailerPort` core library**, while nothing places "newsletter campaigns" in
core — and the §3.5 placement rule says *"anything a meaningful fraction of sites disable or
replace"* is a bundled plugin, *"when in doubt, start it as a bundled plugin."* Many sites never
send a newsletter; a great many need to send *some* transactional mail. So the subsystem cleaves
cleanly into a shared primitive and a disable-able feature.

The governing constraints are the accepted ADRs: plugins do not own tables except through the
core-mediated `dataModule` path (ADR-023); every write goes through the ADR-022 chokepoint with
`pluginId` attribution; a port needs two real adapters (ADR-006); async side effects ride the
outbox (ADR-009); mutations are `authorize()`-gated with flat permission strings (ADR-021); and
every row/event is workspace-scoped with composite `(workspace_id, id)` FKs (ADR-007/021 §4).
Sending real email to strangers is also the canonical case for outbox-driven async work — a
synchronous send loop would block the shared event loop, lose progress on crash, and double-send
on retry.

This ADR is a **solo design-only draft**: it was not produced by a swarm debate and has not been
externally audited. It owes both before ACCEPTED (see Open + record).

## Decision

### 1. Placement — split: a Tier-2 `MailerPort` primitive + a Tier-3 `plugins/newsletter`

Newsletter is delivered as **two artifacts at two tiers**, which is the load-bearing call:

- **`MailerPort` is a Tier-2 core library** (`tovu-v2-design.md §3.5: wp-root mail → MailerPort`).
  Outbound mail is a shared primitive: identity (password reset, magic-link login), Members
  (double opt-in confirmations), Comments (reply notifications), and Newsletter all need it. It is
  also exactly ADR-024's named **core-mediated "mail adapter" primitive** — the thing a Tier-1
  declarative plugin cannot do for itself and core must provide. Making it core keeps a single
  observable send path (fixing WordPress's `wp_mail` blind spot, §3.5 note).
- **`plugins/newsletter` is a Tier-3 bundled plugin** (§3.5 tier-3, disable-able, "structured as a
  plugin to prove the SDK"). Campaign compose/schedule/send, lists, subscriptions, the delivery
  ledger, and unsubscribe UX live here. It is a **dogfood** of ADR-023 (`dataModule` own-tables),
  ADR-024 (bundled-plugin placement + hook ABI), and ADR-026 (atomic multi-write) in one feature.

Rationale for tier-3 (not core): a large fraction of sites disable newsletters; per the §3.5 rule,
*promotion to core is easy, demotion is a breaking change* — start it as a plugin. It rests on
core primitives (MailerPort, entries, outbox, identity) so "disable" is clean.

### 2. Data model — reuse `entries` for campaigns; own-tables for audience/delivery

Following the ADR-027 media pattern (reuse the editorial substrate, add operational sidecars):

1. **A campaign is a seeded content-type `newsletter_campaign` on `entries` (ADR-022).** It gets
   the write chokepoint, append-only revisions, status transitions, and `bodyJson` (the TipTap
   email body) for free. Newsletter-specific fields (`subject`, `preheader`, `fromEmail`,
   `listId`, `scheduledAt`, `sendStartedAt`, `audienceSnapshotId`, denormalized `counters`) live in
   the validated namespaced bag `fields.ext.newsletter.*`. Status is registry-declared:
   `draft → scheduled → sending → sent` (+ `paused`/`canceled`/`failed`). Editors only move
   `draft ↔ scheduled`; the send pipeline drives the rest.

2. **Relational, high-volume state is own-tables via the ADR-023 `dataModule` path** — namespace
   `p_newsletter__*`, declared as data, **core** creates and writes them (typed, ADR-023 §7),
   snapshot-before-DDL (ADR-023 §4). Four tables, each composite-scoped `(workspace_id, id)`:
   - `p_newsletter__lists` — named audiences (small parent; one seeded default per workspace).
   - `p_newsletter__subscriptions` — the (subscriber, list) edge + newsletter-owned status
     (`pending`/`subscribed`/`unsubscribed`/`bounced`/`complained`). References a **Members-owned**
     `subscriberId`; Newsletter never owns the identity (see §3, OPEN-1).
   - `p_newsletter__audience_snapshots` — a frozen recipient count per send attempt.
   - `p_newsletter__sends` — one row per (campaign, subscriber) delivery attempt; the outbox-driven
     ledger and the **source of truth for counters** (the entry's `counters` bag is a rebuildable
     read cache). Carries an `idempotencyKey` (ADR-009 idempotent retries).

   Because Newsletter is a bundled **Tier-3** plugin (first-party, trusted), the ADR-023 §0
   access-control clauses are *advisory until Tier-2 isolation* — but the **recoverability** half
   (snapshot-before-DDL, retain-on-uninstall, core-executed schema) holds unconditionally, which is
   what protects the non-expert's `content.db`. Multi-row invariants (mark a send `delivered` **and**
   bump the campaign counters, both-or-neither) use the **ADR-026 atomic multi-write envelope** —
   Newsletter is precisely the "sequential-order / counter" plugin ADR-026 was written for.

### 3. The Members seam (noted, not designed)

Subscriber **identity, email address, and consent lifecycle are Members-owned.** Newsletter owns
only the *subscription* (the list-membership edge + newsletter status) and references a subscriber
by a stable `subscriberId` under a composite `(workspace_id, subscriberId)` FK. At send time
Newsletter resolves contact info through a read-only **`SubscriberDirectoryPort`** (Members
implements it; rule-of-two = Members-backed adapter + in-memory test double). This is the single
integration point; Members is designed in parallel and is out of scope here. **OPEN-1** records the
interim (the in-memory directory double) until Members ships.

### 4. Ports (ADR-006 rule-of-two)

- **`MailerPort`** — `capabilities()` + `send(message, opts)` (+ optional `sendBatch`). Adapters:
  `SmtpMailerAdapter` (nodemailer/SMTP, **built now**) + `HttpApiMailerAdapter` (provider HTTP —
  Resend/Postmark/SES over `HttpClientPort`, **named-next**) + `InMemoryMailerAdapter` (capture
  double for tests). Messages are **serializable-only** (ADR-024 §3): no streams, no live handles.
  **The Newsletter plugin never holds the `MailerPort`** — it submits send intent as data through
  the outbox/command spine; **core** injects and calls the port. The port is core DI, not plugin ABI.
- **`SubscriberDirectoryPort`** — the §3 Members read seam.

Virus/attachment scanning, analytics/open-tracking pixels, and A/B send optimization are **not
ports** — they are later pipeline stages/features (ADR-006: features-not-ports until a real second
adapter appears).

### 5. Permissions (ADR-021 — flat `newsletter.*`, code-side catalog)

`newsletter.read`, `newsletter.campaign.compose`, `newsletter.campaign.schedule`,
**`newsletter.campaign.send`** (held separate from compose — it triggers real, non-revertible
outbound mail), `newsletter.campaign.send_test`, `newsletter.list.manage`,
`newsletter.subscriber.read`, `newsletter.subscriber.manage` (PII-sensitive), 
`newsletter.settings.manage`, and the `newsletter.manage` umbrella. Registered in the code-side
catalog, enumerable via `tovu permissions list`. The admin screen and any AI tools are clients of
the **same gateway handlers** (ADR-027 §7 dogfood rule — no back door). Agents remain delegated
principals (`grant ∩ delegator`, ADR-021 §6).

### 6. Events + hooks (ADR-009)

- **Events (async, outbox):** `newsletter.campaign.scheduled`, `newsletter.campaign.send_started`,
  `newsletter.send.enqueued`, `newsletter.send.delivered`, `newsletter.send.failed`,
  `newsletter.send.bounced`, `newsletter.send.complained`, `newsletter.campaign.sent`,
  `newsletter.subscriber.unsubscribed`. All workspace-scoped `DomainEvent`s (ADR-007).
- **Hooks (sync, ordered, value-transforming — ADR-024 §7 explicit priority/phase/fail-closed):**
  `newsletter.email.beforeSend` (transform the rendered message — inject footer, unsubscribe link,
  UTM params; the analog of `page.head`) and `newsletter.recipient.filter` (suppress a recipient —
  suppression lists, per-plugin rules). Hooks respect the frozen ABI (async, serializable — ADR-024
  §3): SEO/analytics plugins extend campaigns without Newsletter knowing about them.

### 7. The outbox send pipeline (ADR-009 async + ADR-024 core-mediated)

Sending is **outbox-driven async end-to-end** — a send is never a synchronous loop over recipients.

1. **Send authorized** (`newsletter.campaign.send`) → the command gateway (SPEC-001) flips the
   campaign `scheduled`/`sending` in a change-set (revertible up to send-start). `authorize()` runs
   before the idempotency short-circuit (ADR-021 §2).
2. **Audience freeze.** At send time core materializes the target list's `subscribed`
   subscriptions — filtered through `newsletter.recipient.filter` + suppression — into an
   `p_newsletter__audience_snapshots` row and one `p_newsletter__sends` row per recipient
   (`status='pending'`, unique `idempotencyKey`), resolving addresses via `SubscriberDirectoryPort`.
   Freezing the audience means mid-send subscription churn never double-sends or skips.
3. **Fan-out.** The existing outbox worker (`processOutbox`) claims `SendBatchJob`s in batches;
   per row it runs `beforeSend`, calls **`MailerPort.send()`**, and records `delivered`/`failed`
   with retry/backoff. Handlers are **idempotent** (ADR-009): a redelivery re-uses the same
   `idempotencyKey` so the provider never double-sends. The send row + counter bump commit through
   one **ADR-026** envelope.
4. **Feedback.** Provider bounce/complaint webhooks arrive at a **signed, cookie-less** endpoint
   (§8 origin isolation), normalize to `MailerFeedbackEvent`, and auto-suppress the subscription
   (hard bounce/complaint → `bounced`/`complained`, excluded from future audiences).
5. **Completion.** When the ledger drains, the campaign flips `sent` and emits
   `newsletter.campaign.sent`.

Failure semantics: partial sends are expected and safe (per-row ledger). A campaign can be
`paused` (worker stops claiming its rows) and resumed. This is the ADR-009 "multi-step with the
outbox" lane, not a synchronous command.

### 8. Unsubscribe + webhook endpoints — cookie-less, signed, no-login

Every sent email carries `List-Unsubscribe` + `List-Unsubscribe-Post: List-Unsubscribe=One-Click`
(RFC 8058) and a footer link bearing a **core-signed (HMAC) unsubscribe token** — claims =
`(workspaceId, subscriberId, listId, campaignId?)`, no session cookie. The unsubscribe route and
the provider-feedback webhook live on a **cookie-less origin** (generalizing ADR-020/025/027 origin
isolation: an unsubscribe link that lands in a stranger's inbox must never carry admin authority).
One click flips the subscription `unsubscribed` and emits `newsletter.subscriber.unsubscribed` —
no login, lawful (CAN-SPAM/GDPR), and idempotent.

### 9. v1 scope

**IN v1:** `MailerPort` (SMTP adapter + in-memory double) with observable sends; the
`newsletter_campaign` content-type; compose/schedule/send; one default list + user-created lists;
subscriptions with double-opt-in status; audience freeze + `p_newsletter__sends` ledger;
outbox-driven fan-out with idempotent retry/backoff; `beforeSend` + `recipient.filter` hooks;
one-click signed unsubscribe; bounce/complaint auto-suppression via normalized feedback; flat
`newsletter.*` permissions; AI tools sharing the gateway handlers; denormalized counters via ADR-026.

**DEFERRED (each a named seam):** the `HttpApiMailerAdapter` provider (SMTP ships first);
open/click **analytics** (`email-analytics` — pixels/redirects, its own privacy-sensitive ADR); A/B
subject testing; audience **segmentation** by behavior/query (v1 lists are explicit membership);
paid-tier gating (Members/monetization); the ADR-023 reconciliation **engine** itself (v1 rides the
seam + the store-plugin spike path; the engine is built against this concrete demand per ADR-023 §12);
attachment/virus scanning on inbound signup uploads.

## Consequences

- **Both promises stay honest.** `MailerPort` in core gives one observable, testable send path
  (no `wp_mail` black box). Newsletter as tier-3 means a site that never mails carries no cost and
  can disable it cleanly; the primitive it rests on stays for transactional mail.
- **The content model is reused, not duplicated** (ADR-027 pattern): campaigns get
  revisions/status/`bodyJson` from ADR-022; only the genuinely relational audience/delivery state
  becomes own-tables — and those exercise ADR-023 + ADR-026 in a real bundled plugin, which is the
  point of shipping it as a plugin.
- **Sending is crash-safe and non-double-sending by construction** — audience freeze + per-row
  ledger + idempotency key on the ADR-009 outbox spine. Retry/backoff is the outbox's, not bespoke.
- **Rule-of-two is honest:** `MailerPort` has SMTP now + provider-HTTP named-next + a test double;
  `SubscriberDirectoryPort` has the Members adapter + a test double. Neither is a single-impl fiction.
- **Unsubscribe/webhook origin isolation** extends the one origin story (ADR-020/025/027) to
  outbound-email callbacks rather than inventing a new one.
- **DX/scope cost, accepted:** analytics, segmentation, and monetization are explicitly out of v1;
  the delivery ledger can grow large (one row per recipient per campaign) — retention/pruning is an
  open item (OPEN-4).

## Open

- **OPEN-1 (Members seam).** `SubscriberDirectoryPort` needs a real Members implementation; until
  Members ships, v1 uses the in-memory directory double, which means v1 can demo sending to a
  seeded subscriber set but not real front-end signups. Sequence Newsletter *after* (or jointly
  with) Members, or ship the interim double knowingly. **This is the top item for the human audit.**
- **OPEN-2 (double opt-in + consent ownership).** Whether the double-opt-in confirmation email and
  consent record live in Members or Newsletter is a real boundary question the parallel Members
  design must settle jointly — a potential conflict to flag, not resolve unilaterally.
- **OPEN-3 (send-time authority / sender verification).** SPF/DKIM/verified-sender enforcement at
  send time is asserted (§2 `fromEmail` check) but its mechanism (where verified senders are stored
  — Settings? Newsletter?) is unspecified; likely folds into the Integrations/secrets ADR (mail
  credentials are secrets — ADR-024 "never plaintext in the site folder").
- **OPEN-4 (ledger retention).** `p_newsletter__sends` is unbounded (recipients × campaigns);
  pruning/aggregation policy is undefined and pairs with the pending Storage/Backups primitive.
- **OPEN-5 (analytics privacy).** Open/click tracking (`email-analytics`) is deferred precisely
  because it is privacy-sensitive and deserves its own ADR (pixel/redirect consent), not a bolt-on.
- **OPEN-6 (batch vs per-recipient rendering cost).** Whether `beforeSend` runs per-recipient
  (personalization) or once-per-campaign (identical body) is a perf/feature trade left to the spec;
  the type surface supports per-recipient.

## Design + audit record

Produced **solo** by the autonomous Opus 4.8 sweep agent (2026-07-10), design-only: grounded in the
accepted ADRs above + the §3.5 placement rule + a competitor-lite Ghost orientation, with no peer
debate and no external audit. The typed interfaces (`src/newsletter/ports.ts`, `types.ts`) were
compile-checked against the real repo primitives (`core/ports`, `features/plugins/data-module`).
**Owes, before ACCEPTED:** (1) a swarm debate on the two-tier split + the Members boundary
(OPEN-1/2), and (2) an external `/audit-work` pass (the ADR-027/028 bar: risk_tier + blocker list +
score floor). Do not treat PROPOSED as final.

---

## Round-2 sweep-crosscutting fold (2026-07-10)
Folds `sweep-crosscutting-decisions-20260710.md` §C-034 + §B (D1c) + round-2. PROPOSED; owes per-ADR audit.
- **Import ADR-037 (mail) + ADR-038 (http);** consume Members' `AudienceDirectoryPort`. Newsletter owns **confirmation mechanics only** (compose/send/resend/expiry, signed confirm link).
- **D1c:** the `pending→granted` and revocation transitions write into the Members `member_consents` record via `members.consent.*` (Newsletter does **not** own the record); Newsletter supplies the evidence payload.
- **Unsubscribe token:** keeper = `KeyringPort` derive-not-store; the derivation payload **MUST include the current `consent_revision_id`** — else a re-subscribe lets a stale token unsubscribe again (round-2, Gemini).
- Confirmation/unsubscribe links consume `core/origin` (ADR-040). Mail sends carry `sourceContext:{module:'newsletter', ref:'campaign:<ulid>'}`.
- Depends on ADR-023 grammar + ADR-026. **Must NOT ship to real recipients before Members (consent owner) is live AND a verified origin exists.**
- Send-log PII → `principal.erasure.requested` handler.
- **Permission namespace:** `admin.newsletter.send` / `admin.newsletter.manage`.
- **Wave 2.**
