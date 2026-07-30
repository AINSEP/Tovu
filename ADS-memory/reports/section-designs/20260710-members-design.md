# Members — Section Design (front-end membership / subscribers)

- Date: 2026-07-10
- Author: autonomous Opus 4.8 sweep agent (design-only; no peer debate, no external audit)
- Companion ADR: [ADR-030 — Members](../architecture/ADR-030-members.md) (PROPOSED)
- Reference product: **Ghost Members**
- Depth benchmark: ADR-027 (media)

> This is the design report backing ADR-030. The ADR carries the normative decisions; this
> document adds competitor orientation, the tier rationale in full, the design in prose, the
> alternatives weighed, and a concrete phased Implementation Proposal (modules, DDL, permissions,
> hooks, deferred seams).

---

## 1. Competitor-lite orientation — Ghost Members

Ghost's "Members" is a **second product surface** bolted onto the publishing core in Ghost 5.0,
deliberately **separate from staff/admin**:

- **Two populations, two auth paths.** *Staff users* (operators) log in with passwords to the
  admin app; *members* (subscribers) authenticate **passwordlessly via email magic-link** through a
  separate front-end **Portal** widget. Hosting plans even count them separately ("1 staff user,
  1,000 members"). The two never share a session.
- **Tiers + subscriptions.** A member subscribes to one or more **tiers** (free or paid). Paid tiers
  integrate **Stripe**. A member's active tiers are their entitlement.
- **Gated content.** Each post has a **visibility**: public, members-only, paid-only, or specific
  tiers. Non-entitled visitors see a **public preview/teaser + upgrade CTA**, not the full body.
- **A dedicated Members API** (distinct from Content API and Admin API) and a dedicated `members`
  service layer; the Portal is its own front-end package.
- **Newsletters build on members** — broadcasts target member segments.
- **The data model is hard-wired** (tiers/members/newsletters are core, not plugins) — Ghost has no
  plugin system, so this is a monolithic feature.

**What Tovu should copy vs. differ:**
- *Copy:* member↔staff separation, passwordless magic-link, tiers/subscriptions, per-post visibility
  with teaser, newsletter-on-members, "never let a provider SDK into core."
- *Differ:* Tovu **has** a plugin system and a strong trust model (ADR-021/024/025), so we can (and
  should) split Ghost's monolith along the trust boundary: **identity/auth/gating = core (Tier-2)**;
  **payments/paywall UX = a Tier-3 plugin.** Ghost couldn't; we can, and it makes billing swappable
  and keeps Stripe out of core.

*(Note: the brief's optional `ADS-memory/competitor-analysis.md` path does not exist in
this tree; the Ghost orientation above is from the reference product + the repo's admin-sitemap
"Members = end-users/subscribers of the site, distinct from operators" slot.)*

---

## 2. Tier rationale — why Tier-2 core (scoped), not Tier-3 plugin

The §3.5 rule: *tier 2 = ≥80% of sites need it AND plugins must build on it; tier 3 = a meaningful
fraction disable/replace it; when in doubt start as a bundled plugin.*

Taken literally, "Members" looks Tier-3 — most brochure/blog sites run no membership. The resolution
is that **"Members" is not one feature**; it splits cleanly across the trust boundary:

| Concern | Trust character | Tier | Why |
|---|---|---|---|
| `member` principal, member sessions, sign-in | **Authentication** — session/origin isolation | **2 (core)** | ADR-020/025: session handling can't live in untrusted plugin/theme JS. |
| Content-access decision (gating) | **Authorization** — entitlement axis | **2 (core)** | ADR-021 §2: authorization is core code, never a plugin/port. A Tier-3 plugin can bypass it (ADR-024). |
| Tiers + subscription state | **Identity/entitlement data** (PII-adjacent) | **2 (core)** | ADR-028: keep off the agent-reachable `content.write` path; other modules (newsletter) build on it. |
| Payment provider, checkout, paywall UX, drip | **Monetization** — optional, swappable | **3 (plugin)** | Exactly "a meaningful fraction disable/replace." Stripe must not couple into core. |

The clincher is §3.5's own corollary (`:252`): *"if core needs an escape hatch, the feature is tier
2, not tier 3."* Newsletter, comments, and audience segmentation all need "who is the signed-in
member and what tier" — and that decision is an authorization/session decision core can't safely
delegate. So the **primitives** are Tier-2; the **monetization** is the Tier-3 surface.

This is the same shape as ADR-027: `media` is Tier-2 core, its risky/optional adapters (S3, live
scanner, transcoding) are named deferred seams. Members is Tier-2 core; billing is the named
deferred Tier-3 seam. And it respects "promotion is easy, demotion is breaking": we ship the *small*
trust-critical core now and grow the optional surface as a plugin, never the reverse.

---

## 3. The design in prose

**Members is a distinct trust domain.** A member is a new **principal kind** (`kind='member'`) in
ADR-021's `principals` table — so it inherits durable, disable-only identity and workspace
isolation — but it is governed by an **entitlement axis** (tier membership), never operator RBAC.
The load-bearing invariant: a member principal is *structurally barred* from holding any operator
permission, and the operator `authorize()` path rejects member-kind principals outright. A member
therefore cannot perform a single operator action, even if their cookie were somehow replayed
against the admin origin.

**Sign-in is passwordless and origin-isolated.** A visitor enters their email; core mints a hashed,
single-use, short-TTL magic token and mails a link via `MailerPort`. Clicking it verifies the email,
upserts the member, and mints a **member session** — in its own `member_sessions` table, its own
cookie, on the **public/member origin** (ADR-020/025), `HttpOnly`+`SameSite=Lax`, server-side
revocable. The admin origin exposes no member-session route; the member origin holds no operator
cookie. This is the same "no ambient authority to steal" property ADR-025 gives plugin frames and
ADR-027 gives the media origin — now for member sessions.

**Content gating is an entitlement decision made by core at the read chokepoint.** The access policy
is editorial metadata *about the content*, so it lives on the entry as an ADR-022 namespaced,
write-validated ext field `fields.ext.members.access = { visibility, tierIds? }` (Ghost's
public/members/paid/tiers model) — the only member-related data that touches `entries`. At render
time, a core `MemberAccessResolver` resolves the request's `MemberContext` from the validated member
session and `decide()`s visibility against the member's active tiers. It is *not* a port and *not*
operator `authorize()` — one evaluator, a separate axis (the ADR-021 §2 "no PolicyPort" pattern).
It fails closed on unknown visibility, and non-entitled requests get a teaser/paywall (truncated in
the render layer so gated `bodyJson` never reaches a non-entitled client).

**Member state lives in dedicated core tables, not `entries`.** Because members is a Tier-2 core
library, it owns real tables through the core migration engine (ADR-003 §1 / ADR-015 Drizzle) — the
ADR-023 core-mediated no-DDL path is a plugin mechanism and doesn't apply. Member PII + subscription
state is kept off `entries` for the exact reason ADR-028 kept settings off entries: `entries` is
reachable by the agent-facing `content.write` permission. The tables follow the ADR-022 §4
discipline (single chokepoint + same-tx append-only revisions + ULIDs + attribution + CI canary) and
ADR-021 §4 composite `(workspace_id,id)` FKs.

**Monetization is a deferred Tier-3 plugin.** Core exposes a neutral subscription-state seam
(`source='billing'` + `external_ref` + nullable price columns + a `members.subscription.write`
capability). A future `plugins/billing` (Stripe-first) writes subscription rows through the core
chokepoint via the ADR-023 core-mediated path; the payment provider port (`PaymentProcessorPort`,
Open-SaaS-shaped) lives *inside* the plugin, never in core. No payment code, port, or provider SDK
ships in core v1.

**Lifecycle is eventful.** Member sign-up/sign-in/verify/update/disable and subscription
start/cancel/expire emit workspace-scoped outbox events (ADR-009) that Newsletter, Analytics, AI
memory, and welcome-email side effects consume. Operator-side management (create tier, comp a
subscription, disable a member) flows through the ADR-018 admin command gateway (audited +
revertible) and the same handlers the AI tools use (no back door, ADR-027 §7).

---

## 4. Alternatives considered

- **A — Members entirely as a Tier-3 bundled plugin (Ghost-monolith-as-plugin).** *Rejected.* The
  content-access decision is authorization (ADR-021 §2 core-only) and member sessions are a
  session/origin concern (ADR-020/025); a Tier-3 in-process plugin can bypass access control
  (ADR-024) and its JS can steal sessions (ADR-025). Placing the trust-critical primitives in a
  plugin would require core "escape hatches" — which §3.5:252 says means it's Tier-2. *Kept:* the
  *monetization* half as the Tier-3 plugin.
- **B — Members reuse the operator RBAC (`principals` + roles) directly.** *Rejected.* Members are
  non-operators; giving them roles/policies risks a member ever holding an operator permission and
  overloads `authorize()` with an entitlement concern. *Kept:* members are principals (identity/audit
  root) but on a *separate* entitlement axis, mirroring ADR-021's plugin-capabilities-as-separate-axis.
- **C — Member state as `entries` (member-as-content-type).** *Rejected* on ADR-028's exact argument:
  `entries` is reachable by the agent-facing `content.write` permission; member email/subscription
  state must not be. *Kept:* only the *access policy* (editorial metadata about content) lives on the
  entry ext field.
- **D — One shared `sessions` table for operators and members with a `kind` guard.** *Weighed,
  deferred to OQ-2.* Simpler single revocation surface, but one guard bug = session confusion across
  the trust boundary. Chose separate `member_sessions` + cookie + origin for structural clarity;
  revisit if the duplication proves costly.
- **E — A core `PaymentProcessorPort` now (rule-of-two on Stripe/LemonSqueezy/Polar).** *Rejected* on
  ADR-006's letter: two adapters are *plausible* but **none is being built now** (billing is Tier-3,
  deferred). A port now is the speculative second adapter ADR-006 exists to prevent (and would leak a
  payment concern into core). *Kept:* the port lives inside the future billing plugin; core exposes a
  data seam only.
- **F — Password auth for members in v1.** *Deferred.* Ghost is passwordless; magic-link is simpler,
  avoids a v1 credential store for members, and dodges password-reset flows. Password + 2FA are named
  seams.

---

## 5. Implementation Proposal

### 5.1 Modules to add

Production layout is `src/features/membership/` (matches `admin-sitemap.md`'s `features/membership`;
Tier-2 → `packages/core/src/lib/members/` in the target monorepo). This sweep stages the
**interface-only** files under `src/members/` per the brief:

```
src/members/
  types.ts     # domain records, enums, access/context/decision types, errors   [SHIPPED, this PR]
  ports.ts     # repo ports, MailerPort, MemberAccessResolver, MembersWriteService [SHIPPED, this PR]
  index.ts     # public barrel (ADR-009 §1 — interfaces/types only)              [SHIPPED, this PR]
  members.ts       # command/query fns (requestSignInLink/completeSignIn/…)      [Phase 1+]
  access.ts        # MemberAccessResolver implementation (resolveContext/decide) [Phase 2]
  repo.memory.ts   # in-memory repos (rule-of-two, tests)                        [Phase 1]
  repo.sqlite.ts   # Drizzle SQLite repos                                        [Phase 1]
  write-service.ts # the single chokepoint (authorize→validate→write+revision)  [Phase 1]
  INFO.md · __tests__/ · __specs__/
src/infra/db/schema.ts   # ADD the member_* Drizzle tables (central, per repo convention)
plugins/billing/         # Tier-3, LATER — Stripe adapter + PaymentProcessorPort (in-plugin)
```

Register in the features barrel: `export * as members from "./members";` (`src/features/index.ts`).

### 5.2 Schema / DDL sketch (Drizzle in `src/infra/db/schema.ts`; `content.db`, ADR-012)

All ids ULID `text`; every row `workspace_id`; composite `(workspace_id,id)` FKs (ADR-021 §4);
JSON as `text` (portable to PG `jsonb`); `version integer` for OCC.

```sql
-- members (state) — disable-only (ADR-021 §5)
members(id PK, workspace_id, email, name?, email_verified_at?,
        status CHECK IN ('pending','active','disabled'), note?, fields_json?,
        created_at, updated_at, version)
  UNIQUE(workspace_id, email); INDEX(workspace_id)

-- member_tiers (definition/registry; price cols are nullable billing seams)
member_tiers(id PK, workspace_id, name, slug, type CHECK IN ('free','paid'),
             status CHECK IN ('active','archived'), description?, welcome_page_path?,
             visible_in_portal, monthly_price_cents?, yearly_price_cents?, currency?,
             created_at, updated_at, version)
  UNIQUE(workspace_id, slug); INDEX(workspace_id)

-- member_subscriptions (entitlement join; composite FKs)
member_subscriptions(id PK, workspace_id, member_id, tier_id,
             status CHECK IN ('active','canceled','expired','comped'),
             source CHECK IN ('signup','comp','billing'), external_ref?,
             started_at, current_period_end?, canceled_at?, created_at, updated_at, version)
  FK(workspace_id, member_id) -> members(workspace_id, id) ON DELETE RESTRICT
  FK(workspace_id, tier_id)   -> member_tiers(workspace_id, id) ON DELETE RESTRICT
  INDEX(workspace_id, member_id); INDEX(workspace_id, tier_id, status)

-- member_sessions (operational; distinct from operator sessions; narrows revision discipline)
member_sessions(id PK, workspace_id, member_id, token_hash, created_at, expires_at,
             revoked_at?, last_seen_at?, user_agent?, ip?)
  FK(workspace_id, member_id) -> members(workspace_id, id) ON DELETE RESTRICT
  UNIQUE(workspace_id, token_hash); INDEX(workspace_id, member_id)

-- member_magic_tokens (operational; single-use, hashed)
member_magic_tokens(id PK, workspace_id, member_id, token_hash,
             purpose CHECK IN ('signin','signup','email_change'),
             created_at, expires_at, consumed_at?)
  UNIQUE(workspace_id, token_hash); INDEX(workspace_id, member_id)

-- member_revisions (append-only ledger; never cascade-deleted; ADR-022 §4b / ADR-028)
member_revisions(seq PK AUTOINCREMENT, workspace_id, entity_kind CHECK IN ('member','tier','subscription'),
             entity_id, op, before_json?, after_json?, actor_principal_id, origin_plugin_id?,
             change_set_id?, created_at)
  INDEX(workspace_id, entity_kind, entity_id, seq)
```

Content gating adds **no table** — it is `entries.fields.ext.members.access` (ADR-022 §2), with an
optional ADR-022 §3 partial expression index on `visibility` if members-content listing needs it.

### 5.3 Permission strings (flat `members.*`, ADR-021 §3; ADR-027 `media.*` precedent)

`members.read` · `members.create` · `members.update` · `members.disable` · `members.tier.manage` ·
`members.subscription.manage` · `members.export` · `members.settings.manage` · `members.manage`
(owner/admin bundle). **Capability (plugin axis, ADR-024):** `members.subscription.write` (the
billing-plugin seam, default-deny). *Member-facing actions run on the entitlement axis — not
`members.*` operator strings.* (Reconcile with sitemap `admin.members.*` — OQ-5.)

### 5.4 Events & hooks (ADR-009)

- **Outbox events:** `member.signed_up`, `member.signed_in`, `member.email_verified`,
  `member.updated`, `member.disabled`, `member.subscription.started`, `member.subscription.canceled`,
  `member.subscription.expired`, `member.tier.created`, `member.tier.archived`. All workspace-scoped
  (ADR-007), idempotent handlers. Primary consumer: Newsletter (audience segmentation).
- **Hooks:** none trust-widening in v1. A capability-gated, fail-closed, narrow-only gating hook
  (gift articles/previews) is deferred (OQ-4).

### 5.5 Phased plan

- **Phase 0 (this PR):** typed interfaces (`types.ts`/`ports.ts`/`index.ts`), ADR-030, this report.
  Typecheck-clean against the live repo.
- **Phase 1 — Identity + sign-in:** `members`/`member_sessions`/`member_magic_tokens` tables +
  migration; `MailerPort` console adapter; `requestSignInLink`/`completeSignIn`; member-origin cookie
  + revocation; the write-service chokepoint + `member_revisions` + CI canary; memory/sqlite repos.
  OQ-1 (ADR-021 `member` kind) must be resolved here. *Acceptance:* a visitor signs in via magic-link
  and holds a member session that authorizes zero operator actions.
- **Phase 2 — Tiers + gating:** `member_tiers` + `member_subscriptions`; comp/free subscription;
  `fields.ext.members.access` registry validation; `MemberAccessResolver` + render-layer teaser
  (OQ-6). *Acceptance:* a members-only post shows full body to an entitled member, teaser to others.
- **Phase 3 — Admin surface:** `/admin/members` directory + tier management via the ADR-018 gateway;
  shared admin/AI handlers; lifecycle events wired to Newsletter.
- **Phase 4 — Billing (Tier-3 plugin):** `plugins/billing` (Stripe), `PaymentProcessorPort`
  in-plugin, writing `member_subscriptions` through the core-mediated path (ADR-023) + ADR-026 atomic
  reserve→grant. Resolves OQ-7.

### 5.6 v1 scope cut & named deferred seams

**IN:** member principal + disable-only identity; magic-link sign-in (isolated origin); tiers
(free/comp) + subscriptions; gated content + resolver (fail-closed + teaser); dedicated chokepointed
core tables + composite FKs; `members.*` perms + shared handlers; lifecycle events; `/admin/members`.

**DEFERRED (seam named):** billing/Stripe (`source='billing'` + `external_ref` + `members.subscription.write`
cap + in-plugin `PaymentProcessorPort`) · password/2FA auth (credential path seam) · drip/scheduled
release (scheduler-lib over the access field) · rich member portal (ADR-025-isolated surface) · bulk
member import (batched via ADR-026; gated on abuse posture) · gating-widening hook (OQ-4) ·
magic-link rate-limit/enumeration hardening as a launch-gate (OQ-8).

---

## 6. Typed-interface compilation

`src/members/types.ts`, `ports.ts`, `index.ts` are written against the live repo conventions
(`type` imports from `../core/ports`; `UUID`/`ISODateTime`/`JsonObject`; `XxxRepoPort` with
`{workspaceId,…}` args; thrown `Error` subclasses; no `Result` type). They are included by the
project's `tsconfig.json` (`src/**/*.ts`) and **compile clean**: `npm run typecheck` → exit 0 (after
`npm install`, which the fresh container needed — the only pre-existing errors were `TS2688 node`
from a missing `node_modules`, unrelated to these files).
