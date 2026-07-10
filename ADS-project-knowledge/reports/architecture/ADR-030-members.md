# ADR-030: Members / Front-End Membership — Distinct `member` Principal, Dedicated Core Tables, Entitlement-Gated Content, Origin-Isolated Passwordless Sign-In

- Status: PROPOSED 2026-07-10 (autonomous Opus 4.8 sweep agent — design-only, no peer audit; owes debate+audit before ACCEPTED)
- Date: 2026-07-10
- Author: autonomous Opus 4.8 sweep agent
- Extends: **ADR-021** (identity & authorization — members are a new principal *kind* governed by a separate entitlement axis, not operator RBAC), **ADR-022** (gated-content access is a namespaced ext field on `entries`; member state lives in dedicated core tables under the §4 chokepoint discipline)
- Relates: ADR-006 (rule-of-two — repo + `MailerPort` are ports, billing is not), ADR-007 (workspace scoping / composite FKs), ADR-009 (member lifecycle events + gating hook), ADR-012 (per-site `content.db`, members portable with the install-dir), ADR-018 (admin command gateway for operator-side member management), ADR-020/025 (origin isolation — the member session lives off the admin origin), ADR-023/024 (a future billing plugin writes subscription rows through the core-mediated path; Tier-3 plugins cannot be trusted with the access decision), ADR-028 (dedicated-tables-not-entries table-family pattern; the "don't expose data to agent-reachable `content.write`" argument)
- Sources: brief in `todos.md` "Admin Section Spec Sweep" (§Members); `tovu-v2-design.md` §3.5 placement rule + `admin-sitemap.md` reserved `/admin/members` slot; Ghost members as the reference product. Depth benchmark: ADR-027 (media).

## Context

Tovu today has exactly one human identity: a hardcoded local **operator** (`user-local`,
ADR-021's principal model fills the seam). It has **no front-end audience** — no member
accounts, no way for a non-operator visitor to sign in, subscribe to a tier, or read
members-only content. Ghost's second product surface (its Members system: member accounts,
tiers, subscriptions, gated posts, and a passwordless portal, all **separate from staff/admin
auth**) is the reference the brief names.

Members is a **distinct trust domain** from operators, and conflating the two is the classic CMS
security defect:

1. A **member is not a staff user.** A member authenticates on the public site to read gated
   content and manage their own subscription; a member must **never** hold an operator RBAC
   permission (`content.write`, `members.manage`, …). ADR-021 §1 splits humans (RBAC) from
   machines (scoped grants); members are a *third* category — authenticated non-operators
   governed by an **entitlement axis** (which tiers am I subscribed to), not by roles.
2. A **member session is not an admin session.** ADR-020/025 established that anything sharing the
   admin origin can drive admin APIs with the operator cookie. A member sign-in cookie that were
   valid on the admin origin would be a session-confusion hole. The member session must live on
   its own origin/cookie and be structurally unable to authorize an operator action.
3. **Member PII + subscription/billing state is not content.** ADR-028 killed settings-as-entries
   specifically because folding data into `entries` exposes it to the agent-reachable
   `content.write` permission. That argument is *stronger* for members: an AI agent or plugin with
   `content.write` must not be able to read a member's email or flip their subscription.

This ADR decides where Members lives in the §3.5 tier map, its data model, its ports, its
permission vocabulary, its lifecycle events, and — the load-bearing part — how member
authentication and content-gating stay isolated from the operator plane. It **stays inside the
accepted ADRs**; the one place it must extend an accepted ADR (adding a `member` principal kind
to ADR-021) is flagged as an Open Question, not silently assumed.

## Decision

### 1. Placement — a **Tier-2 core library** (`members`) scoped to the trust-boundary + build-on primitives; monetization deferred to Tier-3

The §3.5 rule (`tovu-v2-design.md:124`): *"tier 2 is anything ≥80% of sites need and plugins must
build on … Tier 3 is anything a meaningful fraction of sites disable or replace … When in doubt,
start it as a bundled plugin — promotion to core library is easy; demotion is a breaking change."*

A naïve read sends Members to Tier-3: many sites have no paid membership at all. But "Members" is
two separable things, and they land on **opposite sides of the trust boundary**:

- **The identity/auth/gating primitives** — a `member` principal kind, member sessions, tier
  membership, and the content-access decision — are **Tier-2**. Not because ≥80% of sites *enable*
  membership, but because these are the primitives other bundled modules must build **on** and that
  **cannot be delegated to an untrusted plugin**:
  - Newsletter (§3.5 / `admin-sitemap.md:93`: "Broadcasts to **Members**"), Comments (member-gated
    commenting), and audience segmentation all consume "who is the signed-in member, what tier."
  - The content-access decision is an **authorization decision**, and ADR-021 §2 already ruled that
    authorization is core code, not a plugin/port. ADR-024 says a Tier-3 in-process plugin can
    bypass access control and ADR-025 says plugin/theme JS can steal the session — so member
    sign-in and gating **must** be core-enforced. By §3.5's own corollary (`:252`: *"if core needs
    an escape hatch, the feature is tier 2, not tier 3"*), member identity belongs in core.
- **The monetization surface** — payment provider, checkout/paywall UX, drip/scheduled release,
  dunning — is the part *"a meaningful fraction of sites disable or replace."* It is **Tier-3**
  (a bundled `plugins/billing`, Stripe-first) and is **not built in v1**. Core exposes only a
  neutral subscription-state seam it writes into (§6).

This mirrors ADR-027 exactly: `media` is a Tier-2 core library whose *risky/optional* adapters
(S3 blob store, live virus scanner, video transcoding) are named deferred seams. Members is a
Tier-2 core library whose optional monetization is a named deferred Tier-3 seam.

Production home is `src/features/membership/` (matching `admin-sitemap.md`'s `features/membership`),
a Tier-2 lib at `packages/core/src/lib/members/` in the target monorepo (§3.5). This design-only
sweep stages its interfaces under `src/members/` per the brief.

### 2. A member is a distinct `principal` **kind**, on the entitlement axis — never operator RBAC

A member is a first-class **principal** (ADR-021's identity/audit root) with `kind='member'`,
extending ADR-021's `user | agent | api_key | system` enum. This buys members ADR-021's durable,
**disable-only** identity (§5 — a member is never hard-deleted; `change_set.actorId`/revisions must
not dangle) and workspace isolation for free. It does **not** buy them RBAC:

- Members hold **no roles and no policies.** Their access is the **entitlement axis** — the set of
  tiers they currently have an active subscription to — evaluated by this library, exactly as
  ADR-021 §1 keeps *plugin capabilities* on a separate axis rather than routing them through
  `authorize()`.
- **Hard invariant (fail-closed):** a `kind='member'` principal is **structurally barred** from
  holding any operator permission — no `principal_roles` / `principal_policies` row may attach an
  operator role/policy to a member principal (kind-enforced on both ends, the ADR-021 §6 grant-kind
  rule generalized). The operator `authorize(principalId, permission, …)` path **rejects any
  member-kind principal** before evaluation. A member cookie therefore cannot, by construction,
  authorize a single operator action even if replayed against the admin origin.

ADR-014's coarse rank `public < member < admin < owner` (re-expressed as permission strings in
ADR-021 §3) is realized here: `member` = an authenticated principal on the entitlement axis; the
content-visibility ladder public/members/paid maps onto it (§4).

### 3. Authentication — passwordless magic-link, on a member origin, in a session table distinct from the admin session

Following Ghost (members are passwordless; staff use passwords):

- **Magic-link is the v1 primary.** `requestSignInLink(email)` mints a single-use, short-TTL,
  **hashed** token (`member_magic_tokens`, raw token never stored) and delivers the link via
  `MailerPort` (§5). `completeSignIn(token)` consumes it (single-use, tombstoned), verifies the
  email on first use, upserts the `members` row, and mints a member session.
- **Member sessions are a separate table + separate cookie + separate origin.** `member_sessions`
  is distinct from ADR-021's operator `sessions`; the cookie is set **only on the public/member
  origin** (ADR-020/025 origin isolation), `HttpOnly` + `SameSite=Lax` (members arrive from email
  links; the admin cookie stays `SameSite=Strict`), and is **server-side revocable** (ADR-021 §7).
  The admin origin exposes **no member-session route**, and the member origin holds no operator
  cookie — the same "no ambient authority to steal" property ADR-025 gives plugin frames and
  ADR-027 gives the media origin.
- **Password auth is a named deferred seam** (`members` gains a password-credential path if a site
  needs it), not built in v1. 2FA likewise deferred.

Identity lives **per-site in `content.db`** (ADR-012/021 §7) — a site's members travel with its
install-dir folder.

### 4. Content gating — an entitlement decision, on a namespaced entry ext field, enforced at the core read chokepoint

- **Access policy is editorial metadata on the content**, so it lives **on the entry** as an
  ADR-022 §2 namespaced, write-validated ext field `fields.ext.members.access` =
  `{ visibility: "public" | "members" | "paid" | "tiers", tierIds?: [...] }`. This is the **only**
  member-related data on `entries`; it reuses the content model rather than duplicating it
  (revisions/history come for free), and it is safe on `entries` because it is *about the content*,
  not member PII.
- **The decision is core code, not a port and not operator `authorize()`.** A `MemberAccessResolver`
  (a) resolves the request's `MemberContext` from a validated member session, then (b) `decide()`s
  visibility against the context's active tiers. One evaluator ⇒ no port (ADR-006; the ADR-021 §2
  "no PolicyPort" reasoning). It is a **separate axis** from operator RBAC — a member reading a
  members-only post is an *entitlement* check, never an RBAC grant.
- **Fail-closed:** an unknown/unparseable `visibility` value denies (ADR-021 §8 lineage). Non-entitled
  requests may render a **teaser/paywall** (Ghost's public preview) rather than a hard 404; the
  truncation happens in the render layer so gated `bodyJson` is never serialized to a non-entitled
  client (see OQ-6).

### 5. Ports (ADR-006 rule-of-two) — repos + `MailerPort`; **no payment port in v1**

- **Repo ports** `Member{,Tier,Subscription,Session,MagicLinkToken}RepoPort` — in-memory (tests) +
  SQLite (Drizzle), the exact `PostRepoPort` rule-of-two shape, one second adapter each being built.
- **`MailerPort`** — magic-link + lifecycle email. Adapters: `ConsoleMailerAdapter` (logs the link
  in dev, built now) → SMTP/provider (next). Honest rule-of-two, same shape as media's
  `BlobStorePort` (local now, S3 next). The members lib never touches a provider SDK.
- **No `PaymentProcessorPort` in v1.** ADR-006's *letter* requires two plausible adapters **and one
  being built now**; v1 builds **zero** billing adapters (monetization is Tier-3, §1/§6). Introducing
  a payment port now would be the exact speculative second adapter ADR-006 exists to prevent (the
  ADR-021 §2 "no PolicyPort" move). The billing seam is a *data* seam (§6), not a port. When the
  Tier-3 billing plugin is built, *it* adopts a `PaymentProcessorPort` (Stripe/LemonSqueezy/Polar,
  the Open-SaaS shape) inside the plugin — never in core.

### 6. Data model — dedicated core tables under the ADR-022 §4 chokepoint discipline (not `entries`)

Because members is a **Tier-2 core library**, it owns **real relational tables** through the core
migration engine (ADR-003 §1 / ADR-015 Drizzle) — the ADR-023 core-mediated no-DDL path is a
*plugin* mechanism and does not apply. Member state is **dedicated tables, not `entries`** (the
ADR-028 argument: keep member PII/billing off the agent-reachable `content.write` path). The tables
reuse the ADR-022 §4 discipline — **single write chokepoint + append-only revisions in the same
transaction + ULIDs + `pluginId`/actor attribution + CI canary** — and the ADR-021 §4 **composite
`(workspace_id, id)` FKs** on every join. Every row carries `workspace_id` (ADR-007).

Table family (mirrors ADR-028's definitions + values + revisions):

- **`members`** *(state/value)* — `id` (ULID = principal id), `workspace_id`, `email` (unique per
  workspace), `name?`, `email_verified_at?`, `status ∈ {pending,active,disabled}` (disable-only),
  `note?`, `fields` (validated ext JSON), `created_at`, `updated_at`, `version`.
- **`member_tiers`** *(definition/registry, append-only-versioned)* — `id`, `workspace_id`, `name`,
  `slug` (unique per workspace), `type ∈ {free,paid}`, `status ∈ {active,archived}`, `description?`,
  `welcome_page_path?`, `visible_in_portal`, `monthly_price_cents?` / `yearly_price_cents?` /
  `currency?` **(nullable billing seams — never populated by core v1)**, timestamps, `version`.
- **`member_subscriptions`** *(state/value — the entitlement join)* — `id`, `workspace_id`,
  `member_id` + `tier_id` (composite FKs), `status ∈ {active,canceled,expired,comped}`,
  `source ∈ {signup,comp,billing}`, `external_ref?` (billing provider id — the plugin seam),
  `started_at`, `current_period_end?`, `canceled_at?`, timestamps, `version`.
- **`member_sessions`** + **`member_magic_tokens`** *(operational)* — session/token rows are
  **high-churn operational state** that **deliberately narrow the revision discipline** (they do
  **not** generate member revisions), exactly as ADR-027 §2 narrows INV-3 for its sidecars; they
  carry their own `created_by`/timestamps and are the single-writer concern of `members/repo`.
- **`member_revisions`** *(append-only ledger)* — `seq` (monotonic), `entity_kind ∈
  {member,tier,subscription}`, entity id + scope keys, `op ∈
  {signup,verify,update,disable,tier_register,tier_archive,subscribe,comp,cancel,expire,coerce}`,
  `before_json`, `after_json`, `actor` (member or operator principal), `origin_plugin_id`,
  `change_set_id`, `created_at`. Never cascade-deleted; FKs are `ON DELETE RESTRICT` with a
  ledgered purge service (ADR-028 §B4 lineage; GDPR redacts, never deletes the ledger).

The **single write service** (`MembersWriteService`) is the only writer: `BEGIN IMMEDIATE →
entitle/authorize (fail-closed) → validate (bounded/total language, ADR-022 amendment §2) → upsert
row + append revision in one tx → COMMIT → emit outbox event`. Operator-initiated calls also flow
through the ADR-018 admin command gateway (audited + revertible); member self-service calls are
attributed to the member principal in the same ledger. A CI canary asserts no member row changes
without a same-tx revision (ADR-022 §4a / ADR-028 §4).

### 7. Permissions, events, and hooks

- **Operator permissions** are flat `members.*` strings (ADR-021 §3; ADR-027's `media.*` precedent),
  code-registered and enumerable: `members.read`, `members.create`, `members.update`,
  `members.disable`, `members.tier.manage`, `members.subscription.manage`, `members.export`,
  `members.settings.manage`, `members.manage` (bundle). Admin + AI tools share the **same gateway
  handlers** (ADR-027 §7 no-back-door rule); member-management AI tools are HITL where they touch
  PII/subscription. *(Naming reconciliation with `admin-sitemap.md`'s `admin.members.*` nav gate is
  OQ-5.)* Member-facing actions run under the member principal on the **entitlement** axis and are
  **not** `members.*` operator strings.
- **Events** (outbox, dotted, workspace-scoped per ADR-007/009): `member.signed_up`,
  `member.signed_in`, `member.email_verified`, `member.updated`, `member.disabled`,
  `member.subscription.started`, `member.subscription.canceled`, `member.subscription.expired`,
  `member.tier.created`, `member.tier.archived`. Downstream consumers: **Newsletter** (audience
  segmentation), Analytics, AI memory, welcome-email side effects. Handlers idempotent (ADR-009).
- **Hooks** (sync filters, ADR-009 §3) are minimal in v1. A gating-widening filter (e.g. "gift
  article" temporary access) is a **trust-boundary** surface (a Tier-3 plugin could abuse it,
  ADR-024) and is therefore **deferred, capability-gated, and fail-closed** (default-deny; a hook
  may only *narrow* access or contribute a teaser in v1) — see OQ-4.

### 8. v1 scope

**IN v1:** `member` principal kind + disable-only identity; passwordless magic-link sign-in on the
isolated member origin; distinct `member_sessions` (revocable); `member_tiers` registry (free +
comp); `member_subscriptions` entitlement state (signup/comp); gated content via
`fields.ext.members.access` + the core `MemberAccessResolver` (fail-closed, teaser); dedicated
core tables under the ADR-022 §4 chokepoint + composite FKs; `members.*` permissions + shared
admin/AI handlers; lifecycle outbox events; `MailerPort` (console adapter); `/admin/members`
directory screen (ADR-018 gateway).

**DEFERRED — each a named seam already in the schema/design:**
- **Billing / payments** → Tier-3 `plugins/billing` (Stripe-first, `PaymentProcessorPort` *inside*
  the plugin); core seam = `member_subscriptions.source='billing'` + `external_ref` + a
  `members.subscription.write` **capability** for the plugin to write rows through the core
  chokepoint (ADR-023 core-mediated path; reserve-tier-then-grant-entitlement needs the ADR-026
  atomic multi-write envelope). Paid-tier price columns are nullable seams (§6).
- **Password + 2FA auth** (magic-link is v1).
- **Drip / scheduled content release** (a scheduler-lib concern over the access field).
- **Member-facing portal richness** (subscribe/manage UI) beyond sign-in — the ADR-025-isolated
  portal surface; v1 ships sign-in + a minimal account read.
- **Member import** (bulk) — batched through the chokepoint (ADR-026), gated on the deferred live
  virus/abuse posture for untrusted uploads (ADR-027 §6 lineage).
- **Gating-widening hook** (gift articles) — OQ-4.

## Consequences

- **The operator/member trust boundary is structural, not conventional.** A member principal cannot
  hold an operator permission (kind-enforced, fail-closed), and a member session lives on a distinct
  table/cookie/origin that authorizes no operator action — so the classic "member cookie drives
  admin API" confusion is closed by construction (ADR-020/025 lineage extended to a new principal
  kind).
- **Member PII/billing state never rides `content.write`.** Dedicated core tables (not `entries`)
  keep member data off the agent-reachable content path (ADR-028's argument), while the *content
  access policy* correctly stays on the entry as editorial metadata (ADR-022 reused, not
  duplicated).
- **Rule-of-two stays honest.** Repos + `MailerPort` each have a real second adapter in v1; billing
  is explicitly *not* a port (no adapter built now) but a deferred data seam — no fake `PaymentPort`
  shape to rot (the ADR-027 presign-surface discipline).
- **Never-brick holds for member data.** Every member mutation is chokepointed with same-tx
  append-only revisions + ULIDs + attribution + composite-FK isolation + a CI canary — the ADR-022
  §4 guarantees, on the members tables.
- **Downstream modules unblocked.** Newsletter/Comments/audience segmentation can build on a
  first-class member identity + entitlement axis + lifecycle events, rather than each re-inventing
  "who is signed in."
- **DX cost, accepted (ADR-027 §Consequences shape).** Every member write flows through one
  chokepoint; content gating is a mandatory resolver call at the read path; billing is a plugin, not
  a core convenience — no direct member-table SQL, no bypass gating, no core Stripe coupling.
- **One accepted-ADR extension owed:** adding `kind='member'` to ADR-021's principal enum + the
  members-never-operator invariant is additive but touches the identity model (OQ-1) — it needs
  ADR-021's blessing before ACCEPTED, per the brief's "flag, don't reopen" rule.

## Open

- **OQ-1 (ADR-021 extension):** formally bless `kind='member'` on `principals` + the
  member-never-holds-operator-permission invariant (an ADR-021 amendment or a one-line accept). This
  ADR assumes it additively; a human/peer must confirm it is not a reopen.
- **OQ-2 (session table):** separate `member_sessions` + cookie (chosen) vs one `sessions` table with
  a hard kind/origin guard. Chosen for structural clarity; confirm the duplication is worth it vs a
  single revocation surface.
- **OQ-3 (access on entry vs table):** `fields.ext.members.access` on the entry (chosen — reuses
  ADR-022 revisions) couples access policy to content revisions and to `content.write` visibility
  (an editor with `content.write` can change gating). Alternative: a dedicated `content_access`
  table under `members.*`. Chosen path is simpler; the coupling is the cost.
- **OQ-4 (gating-widening hook):** whether to ship a capability-gated, fail-closed access-*grant*
  hook (gift articles, previews) in v1 or defer entirely. A widening hook is an ADR-024 trust-boundary
  surface; v1 defers it (narrow-only).
- **OQ-5 (permission naming):** reconcile `members.*` (this ADR, ADR-021/027 feature-namespace
  precedent) with `admin-sitemap.md`'s `admin.members.*` nav-gate convention — pick one string
  language (the ADR-021 §3 "one vocabulary" rule).
- **OQ-6 (teaser rendering):** where gated-body truncation happens so `bodyJson` for a gated entry is
  never serialized to a non-entitled client (render-layer contract with the ADR-017 preview/render
  panes).
- **OQ-7 (billing seam via plugin):** confirm the Tier-3 billing plugin writes `member_subscriptions`
  through the ADR-023 core-mediated path + a `members.subscription.write` capability, and that
  reserve-tier→grant-entitlement uses the ADR-026 atomic multi-write envelope (both are Proposed, not
  yet Accepted — a dependency to track).
- **OQ-8 (rate-limit/abuse):** magic-link request rate-limiting + email-enumeration resistance
  (constant-time "link sent" response) — a launch-gate before enabling public sign-up, paralleling
  ADR-027 §6's ingress posture.

## Debate + record

**No peer debate and no external audit were run** — this is a solo, design-only sweep (autonomous
Opus 4.8). It grounds in the accepted ADRs (021/022/006/007/009/012/018/020/025/023/024/026/028),
the §3.5 placement rule, the reserved `admin-sitemap.md` `/admin/members` slot, and Ghost as the
reference product; depth is calibrated to ADR-027 (media) as the style benchmark. Before this ADR
can move to ACCEPTED it **owes** (a) a multi-round swarm debate stress-testing §1 (tier split), §2
(principal-kind extension), and §4 (access-on-entry), and (b) an external audit of the trust-boundary
invariants (§2 member-never-operator, §3 session/origin isolation, §6 chokepoint) on the ADR-027
FAIL→fold→re-audit model. The typed interfaces under `src/members/` (`types.ts`, `ports.ts`,
`index.ts`) compile clean against the live repo (`npm run typecheck`, exit 0).

---

## Round-2 sweep-crosscutting fold (2026-07-10)
Folds `sweep-crosscutting-decisions-20260710.md` §C-030 + §B (D1c) + round-2. PROPOSED; owes per-ADR audit.
- **Mail:** delete local `MailerPort`/`OutboundEmail`; import ADR-037 `core/mail`. Sends carry `sourceContext:{module:'members'}` + required `idempotencyKey` (ADR-037 amendments).
- **Publish `AudienceDirectoryPort`** (`getContacts→{memberId,email,emailDeliverable}`); `subscriberId = memberId`; anonymous newsletter signup = a minimal `kind='member'`. Ship the ADR-021 `kind='member'` extension.
- **D1c — Members owns the consent record (LOCKED 4-0):**
  - `member_consents` is **Tier-2 core-resident, always-present regardless of how the Members admin section is packaged** — this pin is what makes the ownership non-circular (without it Newsletter-owned was sounder).
  - Purpose-keyed: `marketing-email | newsletter:{listId} | feature:{ns}:{id}`, keys module-prefixed. Under the ADR-022 chokepoint + append-only revisions + ledgered purge (redact, never delete).
  - `members.consent.request/confirm/revoke` typed calls accept an evidence payload `{consentTextRef/hash, source, confirmTokenId, ip?, userAgent?}`. Newsletter **cannot assert `granted` directly** — its token resolves to a *pending* Members challenge.
  - Extend the read contract: `getContacts(query:{consentPurpose?})` (purpose-scoped), or add `members.consent.check(memberId, purpose)`. Global `emailDeliverable`/suppression = active ∧ verified ∧ no global suppression.
- **Magic-link:** fix `MagicLinkTokenRecord.memberId` vs upsert-on-first-use contradiction. Rate-limit/enumeration gate is a **HARD** pre-enable precondition (a module-local limiter satisfies it; shared primitive is later). Magic-link URLs consume `core/origin` (ADR-040), not raw request host.
- **Permission namespace:** `admin.members.*`.
- **Wave 1.**
