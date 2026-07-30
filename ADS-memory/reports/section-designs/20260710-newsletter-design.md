# Newsletter — Section Design (autonomous sweep, design-only)

- Date: 2026-07-10
- Author: autonomous Opus 4.8 sweep agent (solo; no peer debate, no external audit)
- Companion ADR: `ADS-memory/reports/architecture/ADR-034-newsletter.md` (PROPOSED)
- Typed interfaces: `src/newsletter/ports.ts`, `src/newsletter/types.ts` (compile-checked)
- Brief: `todos.md` → Admin Section Spec Sweep → **Newsletter** ("email campaigns over a MailerPort; a bundled plugin")

> **Status caveat.** This is a design-only sweep produced by one agent. It grounds in accepted ADRs
> and the §3.5 placement rule but has **not** been through `/debate` + `/consensus` + `/audit-work`.
> Treat every decision as PROPOSED. The morning audit's job is to break it.

---

## 1. Competitor-lite orientation

The reference is **Ghost** (publishing-first; `docs/research/competitor-analysis.md`). Two facts
shape the design:

- **Ghost separates the concerns.** `ghost/core` ships distinct service families: `newsletters`,
  `email-service`, `email-analytics`, **and** `members`. Newsletters are *not* members, and mail
  sending is a shared service under both. The Members API and Newsletter endpoints are separate
  endpoint families. → Tovu should not fuse subscriber identity into the newsletter feature.
- **Mail providers are an adapter axis everywhere.** Strapi ships
  `packages/providers/email-{nodemailer,sendgrid,mailgun,amazon-ses,sendmail}`; Ghost uses
  Mailgun for bulk + nodemailer for transactional. → "outbound mail" is the textbook port with a
  real second adapter (ADR-006 already lists `MailerPort (SMTP + provider)`).

Ghost's self-hosting pain point is also instructive: *"self-hosting Ghost correctly (with email,
Stripe, members) requires significant DevOps knowledge."* The Tovu answer is to make the mail path
a **core, observable primitive** (fixing WordPress's silent `wp_mail`) and keep the campaign
feature a **disable-able plugin**, so a site that doesn't mail isn't paying Ghost's setup tax.

WordPress has no first-class newsletter (it's plugin territory — Mailchimp/MailPoet/Newsletter),
which is itself the §3.5 signal: this is bundled-plugin surface, not core.

---

## 2. Tier rationale (`tovu-v2-design.md §3.5`)

The subsystem **splits across two tiers** — this is the central call.

| Concern | Tier | Why |
|---|---|---|
| **`MailerPort`** (outbound mail primitive) | **Tier-2 core library** | §3.5 maps `wp-root mail → MailerPort` explicitly. Mail is needed by identity (password reset/magic-link), Members (opt-in), Comments (notifications), *and* Newsletter — a shared primitive ≥80% concept. It is ADR-024's named core-mediated "mail adapter" that Tier-1 plugins can't self-provide. One observable send path. |
| **`plugins/newsletter`** (campaigns, lists, subscriptions, delivery, unsubscribe) | **Tier-3 bundled plugin** | §3.5 placement rule: *"anything a meaningful fraction of sites disable or replace"* + *"when in doubt, start it as a bundled plugin — promotion to core is easy, demotion is a breaking change."* Many sites never send newsletters. Shipping it as a plugin dogfoods the SDK (own-tables via ADR-023, hook ABI via ADR-024, atomic multi-write via ADR-026) — the §3.5 tier-3 rationale verbatim. |

This mirrors how ADR-027 treats media: the *primitive* (`BlobStorePort`) is core; the feature reuses
core substrate. Here the primitive (`MailerPort`) is core and the feature is a plugin on top.

Rejected placement A — **all in core**: overpays; forces every install to carry campaign tables and
UI it may never use; demotion-to-plugin later is the breaking change §3.5 warns against.
Rejected placement B — **all in a plugin including MailerPort**: leaves transactional mail (auth,
members) with no primitive, or duplicates it; and a Tier-1 declarative plugin can't provide a mail
adapter to *other* plugins (ADR-024 §5) — mail must be core-mediated.

---

## 3. The design (prose)

### 3.1 Campaigns reuse `entries` (ADR-022)

A campaign is a **seeded content-type `newsletter_campaign`** on the generic `entries` table. This
buys the write chokepoint, append-only revisions, status transitions, ULIDs, and `bodyJson` (the
TipTap email body) with zero new machinery — exactly the ADR-027 "reuse the editorial half" move.
Campaign-only fields (`subject`, `preheader`, `fromEmail`, `replyTo`, `listId`, `scheduledAt`,
`sendStartedAt`, `audienceSnapshotId`, `counters`) live in the validated bag
`fields.ext.newsletter.*` (ADR-022 §2, rejected-on-unregistered-key). `listId` can be declared
`queryable` for "campaigns targeting list X" via a core-provisioned expression index (ADR-022 §3).

Status lifecycle (registry-declared): `draft → scheduled → sending → sent`, plus
`paused`/`canceled`/`failed`. Editors move only `draft ↔ scheduled`; the pipeline drives the rest.

### 3.2 Audience + delivery are own-tables (ADR-023 `dataModule`)

The relational, high-volume state the ext-bag can't carry becomes **core-mediated own-tables** under
`p_newsletter__*`, declared as data (`DataModuleDecl`) and executed by core (snapshot-before-DDL):

- `p_newsletter__lists` — named audiences; one seeded default per workspace.
- `p_newsletter__subscriptions` — the `(subscriberId, listId)` edge + newsletter status
  (`pending`/`subscribed`/`unsubscribed`/`bounced`/`complained`) + consent `source`.
- `p_newsletter__audience_snapshots` — the frozen recipient count per send attempt.
- `p_newsletter__sends` — one row per (campaign, subscriber); the outbox ledger and **counter
  source of truth**; carries `idempotencyKey` + `providerMessageId`.

Every table is composite `(workspace_id, id)` scoped (ADR-021 §4 / ADR-007). Because Newsletter is
a **first-party Tier-3** plugin, ADR-023 §0's access-control clauses are advisory-until-isolation,
but the **recoverability** guarantees (core-executed DDL, snapshot-before-change, retain-on-uninstall)
hold unconditionally — that's what protects a non-expert's `content.db`. Multi-row invariants
(mark send `delivered` **and** bump counters) go through the **ADR-026 atomic multi-write envelope**;
Newsletter is the canonical "sequential-order/counter" plugin ADR-026 was written for.

### 3.3 Members seam (noted only)

Subscriber identity/email/consent is **Members-owned**. Newsletter owns the subscription edge and
references `subscriberId` via composite FK. At send time it resolves contact info through the
read-only **`SubscriberDirectoryPort`** (Members implements; rule-of-two = Members adapter +
in-memory double). Members is designed in parallel — **not here**. Interim = the in-memory double
(OPEN-1).

### 3.4 MailerPort (ADR-006 rule-of-two)

`capabilities()` + `send(message, opts)` (+ optional `sendBatch`). Adapters: **SMTP now**,
**provider-HTTP next** (Resend/Postmark/SES over `HttpClientPort`), **in-memory double** for tests.
Serializable-only messages (ADR-024 §3). The **plugin never holds the port** — it enqueues send
intent; **core** calls `MailerPort`. Idempotency key forwarded to providers that honour it.

### 3.5 The outbox send pipeline (ADR-009)

Outbox-driven async, never a synchronous recipient loop:

```
authorize(newsletter.campaign.send)         # ADR-021, before idempotency short-circuit
  → gateway change-set: campaign → sending   # SPEC-001, revertible up to send-start
  → AUDIENCE FREEZE: materialize list's `subscribed` subs
       through recipient.filter + suppression,
       resolve emails via SubscriberDirectoryPort,
       write audience_snapshot + one `sends` row/recipient (pending, idempotencyKey)
  → OUTBOX WORKER claims SendBatchJob batches (processOutbox spine)
       per row: beforeSend hook → MailerPort.send() → mark delivered/failed (ADR-026 envelope)
       retry/backoff = the outbox's; idempotent (same key ⇒ no double-send)
  → provider webhook (signed, cookie-less) → MailerFeedbackEvent → auto-suppress bounces/complaints
  → ledger drains → campaign → sent → emit newsletter.campaign.sent
```

Audience freeze is the correctness anchor: mid-send subscription churn can't double-send or skip.
`paused` stops the worker claiming a campaign's rows; resume continues. Partial sends are safe.

### 3.6 Unsubscribe (cookie-less, signed, no-login)

Each email carries `List-Unsubscribe` + `List-Unsubscribe-Post` (RFC 8058 one-click) and a footer
link with a **core-signed HMAC token** (`workspaceId, subscriberId, listId, campaignId?`). The
unsubscribe route + provider webhook live on a **cookie-less origin** (generalizing ADR-020/025/027:
a link in a stranger's inbox must never carry admin authority). One click → `unsubscribed` + event.
Lawful (CAN-SPAM/GDPR), idempotent, login-free.

---

## 4. Alternatives considered

- **Settings-as-entries for lists / subscriptions-as-taxonomy.** Modeling lists as taxonomy terms
  and subscriptions as `entry_terms` was tempting (reuse ADR-022 §5). Rejected: the *delivery ledger*
  (`sends`) is unavoidably a large relational table with per-row lifecycle + idempotency + FK to a
  snapshot — taxonomy can't carry it, so we'd split the model across two mechanisms for no gain.
  Own-tables via ADR-023 keep audience + delivery in one relational story. (Lists *could* still be a
  taxonomy; kept as a small own-table for FK integrity with subscriptions — an easy audit swap.)
- **Synchronous send on the request.** Rejected outright: blocks the shared event loop (all sites,
  ADR-024), loses progress on crash, double-sends on retry. ADR-009 says async side effects ride the
  outbox — bulk mail is the textbook case.
- **Newsletter owns subscriber identity.** Rejected: Ghost separates members from newsletters; fusing
  them duplicates consent/identity that Members must own and breaks the parallel design. Hence the
  read-only `SubscriberDirectoryPort` seam.
- **MailerPort inside the plugin.** Rejected: transactional mail (auth/members) would have no
  primitive, and a plugin can't be a mail provider *for other plugins* (ADR-024 §5). Mail is core.
- **Provider-first (no SMTP).** Rejected for v1: SMTP is the universal, self-host-friendly default
  (Ghost's own transactional path); the HTTP provider is the named-next second adapter, not v1.

---

## 5. Implementation Proposal

### 5.1 Phased plan

- **Phase 0 — `MailerPort` core primitive.** Port + `SmtpMailerAdapter` + `InMemoryMailerAdapter`;
  wire into core DI; a `mail.send` observable path with structured logging. Unblocks auth/members mail
  too. *(Small; rule-of-two satisfied by SMTP + double; provider adapter deferred.)*
- **Phase 1 — campaign content-type + compose/schedule.** Seed `newsletter_campaign` in the
  content-type registry; admin compose screen over the gateway; `scheduled` status + `scheduledAt`.
  No sending yet. Rides existing `entries` machinery.
- **Phase 2 — lists + subscriptions (own-tables) behind the ADR-023 seam.** Declare `p_newsletter__*`
  via `DataModuleDecl`; typed core repo for writes; `SubscriberDirectoryPort` with the in-memory
  double (interim Members). Seed a default list.
- **Phase 3 — the send pipeline.** Audience freeze → `sends` ledger → outbox fan-out → `MailerPort`
  → idempotent retry → counters via ADR-026 → `sent`. This is the core deliverable.
- **Phase 4 — unsubscribe + feedback.** Signed cookie-less unsubscribe route; `List-Unsubscribe`
  headers; provider webhook → `MailerFeedbackEvent` → auto-suppression. Hooks (`beforeSend`,
  `recipient.filter`) land here (footer/unsub injection).
- **Phase 5 (deferred seams).** `HttpApiMailerAdapter`; `email-analytics` (own ADR); segmentation;
  A/B; ledger retention.

### 5.2 `src/` modules to add

```
src/newsletter/
  ports.ts        ✅ (this sweep)  MailerPort, SubscriberDirectoryPort, OutboundEmail, SendBatchJob
  types.ts        ✅ (this sweep)  campaign fields, own-table rows, permissions, events, hooks
  mailer.smtp.ts       Phase 0     SmtpMailerAdapter implements MailerPort
  mailer.memory.ts     Phase 0     InMemoryMailerAdapter (test double / capture)
  campaign.ts          Phase 1     compose/schedule use-cases over the gateway + entries
  lists.ts             Phase 2     list CRUD (typed core repo, p_newsletter__lists)
  subscriptions.ts     Phase 2     subscription state transitions
  directory.memory.ts  Phase 2     InMemorySubscriberDirectory (interim Members seam)
  send-pipeline.ts     Phase 3     audience freeze + fan-out job handler (outbox)
  unsubscribe.ts       Phase 4     signed-token verify + one-click flip
  feedback.ts          Phase 4     webhook → MailerFeedbackEvent → suppression
  index.ts             barrel (public surface — ADR-009 §1 module boundary)
  __tests__/ __specs__/
```

### 5.3 Schema / DDL sketch (`p_newsletter__*`, declared via `DataModuleDecl`)

```sql
CREATE TABLE p_newsletter__lists (
  workspace_id TEXT NOT NULL, id TEXT NOT NULL,
  name TEXT NOT NULL, slug TEXT NOT NULL, is_default INTEGER NOT NULL,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  PRIMARY KEY (workspace_id, id),
  UNIQUE (workspace_id, slug));

CREATE TABLE p_newsletter__subscriptions (
  workspace_id TEXT NOT NULL, id TEXT NOT NULL,
  list_id TEXT NOT NULL, subscriber_id TEXT NOT NULL,     -- subscriber_id → Members (seam)
  status TEXT NOT NULL, source TEXT NOT NULL,
  subscribed_at TEXT, unsubscribed_at TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  PRIMARY KEY (workspace_id, id),
  FOREIGN KEY (workspace_id, list_id) REFERENCES p_newsletter__lists(workspace_id, id),
  UNIQUE (workspace_id, list_id, subscriber_id));

CREATE TABLE p_newsletter__audience_snapshots (
  workspace_id TEXT NOT NULL, id TEXT NOT NULL,
  campaign_id TEXT NOT NULL, list_id TEXT NOT NULL,
  recipient_count INTEGER NOT NULL, created_at TEXT NOT NULL,
  PRIMARY KEY (workspace_id, id));

CREATE TABLE p_newsletter__sends (
  workspace_id TEXT NOT NULL, id TEXT NOT NULL,
  campaign_id TEXT NOT NULL, audience_snapshot_id TEXT NOT NULL,
  subscriber_id TEXT NOT NULL, recipient_email TEXT NOT NULL,
  status TEXT NOT NULL, attempts INTEGER NOT NULL,
  idempotency_key TEXT NOT NULL, provider_message_id TEXT,
  last_error TEXT, next_attempt_at TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  PRIMARY KEY (workspace_id, id),
  FOREIGN KEY (workspace_id, audience_snapshot_id)
    REFERENCES p_newsletter__audience_snapshots(workspace_id, id),
  UNIQUE (workspace_id, campaign_id, subscriber_id));   -- one attempt row per recipient/campaign
```
Note: the ADR-023 v1 `DataModuleDecl` seam (`src/features/plugins/data-module.ts`) currently
supports column shape only (no FK/UNIQUE/index expression). Composite PK + FK + UNIQUE above are the
**target** shape; landing them is part of the ADR-023 engine work (`§12` — build against real demand).
This design is exactly that "real demand" driver. Until the engine grows FK/UNIQUE support, Phase 2
enforces `UNIQUE`/FK invariants in the typed core repo (application-level), flagged in the spec.

Campaign fields (on `entries.fields.ext.newsletter.*`) — no DDL; validated by the registry.

### 5.4 Permission strings (ADR-021 flat catalog)

`newsletter.read` · `newsletter.campaign.compose` · `newsletter.campaign.schedule` ·
`newsletter.campaign.send` · `newsletter.campaign.send_test` · `newsletter.list.manage` ·
`newsletter.subscriber.read` · `newsletter.subscriber.manage` · `newsletter.settings.manage` ·
`newsletter.manage`. (`send` deliberately separate from `compose` — it triggers real outbound mail.)
Registered code-side; enumerable via `tovu permissions list`.

### 5.5 Hooks + events

- Hooks (sync/ordered): `newsletter.email.beforeSend`, `newsletter.recipient.filter`.
- Events (async/outbox): `campaign.scheduled`, `campaign.send_started`, `send.enqueued`,
  `send.delivered`, `send.failed`, `send.bounced`, `send.complained`, `campaign.sent`,
  `subscriber.unsubscribed` (all `newsletter.*`).

### 5.6 v1-scope cut (named deferred seams)

IN: MailerPort(SMTP+double), campaign type, compose/schedule/send, lists+subscriptions, audience
freeze + ledger, outbox fan-out w/ idempotent retry, hooks, signed one-click unsubscribe,
bounce/complaint suppression, counters via ADR-026, AI tools on shared handlers.
DEFERRED (seams): `HttpApiMailerAdapter`, `email-analytics` (open/click — own privacy ADR),
segmentation, A/B, paid-tier gating (Members), the ADR-023 reconciliation engine (FK/UNIQUE/index),
signup-upload scanning, ledger retention.

---

## 6. Typed-interface compile check

`src/newsletter/ports.ts` + `src/newsletter/types.ts` were typechecked with the project's
`tsc -p tsconfig.json --noEmit`. Both the **baseline** (project minus newsletter) and the
**full project with the newsletter files** compile with **exit 0** — no pre-existing errors to
isolate around; the new files compile against the real repo primitives (`core/ports`
`DomainEvent`/`UUID`/`ISODateTime`/`JsonObject`, and `features/plugins/data-module` `DataModuleDecl`).
The only tsc output is the pre-existing, harmless `TS5107` `moduleResolution=node10` deprecation
*warning* (config-level, not from the newsletter files, does not fail the build).

---

## 7. Top open questions for the human audit

1. **OPEN-1 Members seam / sequencing** — Newsletter's audience is meaningless without Members'
   subscriber directory. Ship the in-memory interim knowingly, or sequence after Members? (Top item.)
2. **OPEN-2 consent ownership** — does double-opt-in confirmation + the consent record live in
   Members or Newsletter? A boundary the parallel designs must settle jointly (possible conflict).
3. **OPEN-3 sender verification / mail secrets** — where verified senders + SMTP credentials live
   (Settings? Integrations? — they're secrets, ADR-024 "never plaintext in the folder").
4. **Lists-as-taxonomy vs own-table** — kept own-table for FK integrity; is the taxonomy modeling
   preferable given ADR-022 §5?
5. **ADR-023 seam gap** — the v1 `DataModuleDecl` has no FK/UNIQUE/index support; Newsletter is the
   concrete demand that would justify growing it. Grow the engine, or enforce invariants in the repo?
6. **OPEN-4 ledger retention** — `p_newsletter__sends` is unbounded; pairs with Storage/Backups.
