# ADR-PIPE-013: Members Remediation — Closing the Authorization, Rate-Limit, Sign-In, Consent, Persistence, Permission-Naming, and UI Gaps

- Status: ACCEPTED 2026-07-13 (human approval: Leona Burime, blanket approval across ADR-PIPE-008..015; `/audit-work`/Red-Team have NOT run — accepted with that acknowledged gap; the authz-gap fix (list/get-by-id/request-magic-link) is the highest-priority slice, TDD-certify it first)
- Date: 2026-07-13
- Spec: SPEC-013 v1.0.0 (hash: sha256:4223c9dd7808b2a49977075b897ed237e979ce83b611ac6b4a963dd6b82eb5b1)
- Author: Software Architect Agent

## Constitution Check

*Against the CURRENT shipped code, then against this ADR's proposed remediation.*

| Article | Status (current code) | Status (after this remediation) | Notes |
|---|---|---|---|
| I — Library-First | COMPLIES | COMPLIES | No new crypto/session library; `node:crypto` stays. The rate limiter reuses the existing hand-rolled `src/server/middleware/rate-limit.ts` primitive (already the repo's accepted Article I posture per SPEC-006 REQ-14/Red-Team RT-006 — a second hand-rolled limiter would be a *worse* Article I posture than reusing the one that already exists). Origin-aware magic links reuse `src/origin` (ADR-040, already implemented) instead of inventing a new URL-building helper. |
| II — Test-First | EXCEPTION (carried, historical) | EXCEPTION for existing code stands; COMPLIES going forward | The existing gap (code shipped before a spec package existed) cannot be retroactively fixed by an architecture pass. This ADR's own remediation slices (new routes, new tables, new rate-limit wiring) are NOT yet built — the Coordinator must route every slice below through TDD-certified failing tests before Programmer, per the constitution's non-negotiable Article II. No remediation code is exempted. |
| III — Simplicity Gate | N/A (documentation pass produced no code) | COMPLIES | Every new module below traces to a named REQ/OQ in SPEC-013 or a named ADR-030/D1c clause. No speculative generality: consent gets one new table + one new port (not a generic "extensible metadata" system); the rate limiter is two profile constants on an existing primitive, not a new configurable policy engine; the permission-naming decision explicitly rejects inventing a migration nobody needs (see §6 below). |
| IV — Anti-Abstraction Gate | EXCEPTION (5 repo ports, single in-memory adapter each — real gap, REQ-18) | COMPLIES | Every port (the 5 existing + the 1 new `MemberConsentRepoPort`) gets a real second adapter (`repo.sqlite.ts`) built and contract-tested in this pass, matching the exact `PostRepoPort`/`SettingsRepoPort` shape. The rate limiter is deliberately NOT made a port — one implementation, no swap planned, matching the existing `LOGIN_STRICT` precedent (`rate-limit.ts`'s own file header: "not a port... one rate-limiter implementation, no swappable backends in v1"). |
| V — Integration-First Testing | EXCEPTION (carried; 0 route-level tests exist for any of the 4 shipped routes) | EXCEPTION narrows, does not close | This ADR adds 2 new HTTP surfaces (public sign-in request + complete) and 3 newly-authorized existing routes — all P1-relevant and all require integration-level (real HTTP + real adapter) tests going forward. The pre-existing untested routes (list/get/disable/admin-request-magic-link) are NOT retroactively fixed by this architecture pass; TDD must add route-level tests for both the pre-existing and the new surfaces as part of implementing this ADR, closing the gap prospectively rather than retroactively. |
| VI — Security-by-Default | EXCEPTION (REQ-10: 3 of 4 routes have no per-action permission check; no rate limiter on a passwordless-auth surface) | COMPLIES for the authz + rate-limit gaps this ADR targets; EXCEPTION remains for full member/admin origin separation | Priority items 1 and 2 below close the two concrete Article VI violations this feature carries. Full physical origin isolation (ADR-030 §3's "member session lives on its own origin") is **not** achievable in this remediation because **no feature in this repo has multi-origin serving infrastructure today** (confirmed: the single Express app in `src/server/app.ts` serves `/api/admin`, `/api/content`, and would serve the new `/api/members` public surface from the same process/port) — this is covered by the constitution's existing standing Article VI exception (no auth-topology/origin-separation layer yet), not a new violation this ADR introduces. Logical isolation (distinct cookie name, distinct `SameSite` policy, distinct unauthenticated route prefix, no admin-session middleware in the path) is added as the achievable interim control — see Decision §3. |
| VII — Spec Integrity | COMPLIES | COMPLIES | Cites SPEC-013 v1.0.0, hash `sha256:4223c9dd7808b2a49977075b897ed237e979ce83b611ac6b4a963dd6b82eb5b1`. Any remediation task that changes REQ/AC behavior must bump SPEC-013's version and update the affected rows — this ADR does not silently redefine the spec's as-built REQs; it defines *new* REQs for the gap-closing work (owned by a follow-up SPEC-013 v1.1.0 pass or a dedicated tasks.md, per the Coordinator's call). |
| VIII — Observability | EXCEPTION (carried; unstructured `{error: string}` envelope, no `correlationId`) | EXCEPTION narrows for the rate-limit surface only | The new 429 responses follow the existing `LOGIN_STRICT` precedent (`code: "RATE_LIMIT_EXCEEDED"`, `details.retryAfterSeconds`, a `Retry-After` header) — better than the plain-string errors elsewhere in this feature, but still not a full structured envelope with `correlationId`. Full Article VIII compliance for Members remains a named, deferred item (unchanged from the as-built spec's EXCEPTION), not resolved here. |

No unjustified exceptions. The two EXCEPTIONs that remain after this ADR (Article V's historical gap, Article VIII's unstructured envelope) are the same ones SPEC-013 already disclosed with a named owner and target date; this ADR does not weaken or paper over them.

## Research Summary

- Research artifact: N/A — no library, framework, or persistence-mechanism choice is open. Persistence is Drizzle/SQLite (ADR-015, already decided and already exercised by `PostRepoPort`/`SettingsRepoPort`). Mail is `core/mail` (ADR-037, already implemented in `src/mail`, already imported by `write-service.ts`). Canonical-origin resolution is `core/origin` (ADR-040, already implemented in `src/origin`). Rate limiting is the existing hand-rolled primitive (`src/server/middleware/rate-limit.ts`, already accepted per SPEC-006/Red-Team RT-006). Every dependency this remediation needs already exists in the repo; this ADR is a **reuse-composition** decision, not a technology-selection decision. The three genuinely open implementation-level questions (which permission-check surface to reuse, how to key/shape the rate limit, how to shape the consent read-path) are resolved in Pattern Evaluation below, not by researching new tools.
- Key decision: N/A (see above).

## Planning Preflight Evidence

- Coordinator Planning Preflight: PASS (validator `--phase preflight`, run 2026-07-13, exit 0 — "strict Speckit package passed mechanical validation")
- Spec hash verified at: 2026-07-13T00:00:00Z (provider-local validator, `--phase spec --update-hash`, per `pipeline-state.md`)
- Red-Team status and artifact: NOT YET RUN (per `pipeline-state.md`) — this ADR proceeds under the dispatch directive's explicit instruction to produce architecture now; Red-Team dispatch is a Coordinator decision for after this ADR, not a precondition this Software Architect pass can create for itself. Flagged as an open item in Related Decisions.
- System Blueprint status and artifact: Not produced (no macro-topology change — Members remediation adds route/table/module surface inside the existing modular-monolith admin+content server, not a new service or deployment boundary).
- CodeBase Analyzer reports consumed: None formal; this ADR performed direct source inspection of `src/members/*`, `src/server/routes/admin/members/*`, `src/server/http/admin/members.ts`, `src/server/middleware/{rate-limit,dev-auth}.ts`, `src/origin/*`, `src/mail/*`, `src/identity/{permissions.ts,authorize.ts}`, `src/infra/db/schema.ts`, `src/features/{post,settings}/repo.sqlite.ts`, `apps/admin/src/{sections/Members.tsx,lib/api.ts}`, and `src/server/app.ts`'s wiring/mounting sections, to ground every module boundary and naming convention in actual repo precedent.
- Reverse-spec artifacts consumed: SPEC-013's full package (`feature.spec.md`, `api.spec.md`, `state.spec.md`, `ui.spec.md`, `errors.spec.md`, `behavior.spec.md`, `traceability.spec.md`, `spec-manifest.md`) — the entire reverse-spec extraction documenting the as-built gaps this ADR closes.
- Validator result or waiver: PASS, no waiver needed (python3 available; ran `validate_spec_package.py ADS-project-knowledge/specs/013-members --phase preflight` → exit 0).

## Context

Members shipped directly from ADR-030 (ACCEPTED 2026-07-10, autonomous sweep, no spec package) with real, working code but six disclosed gaps, verified against the live repo by SPEC-013's reverse-spec pass:

1. Three of four admin routes (`list`, `get-by-id`, `request-magic-link`) run behind session auth only — no `authorize()` call — while `disable` alone is permission-gated. This is a live, exploitable authorization gap in shipped code, not a hypothetical.
2. The magic-link rate limiter ADR-030 OQ-8 names as a **HARD pre-launch precondition**, and the crosscutting sweep's D1c/§Members fold repeats as mandatory, does not exist anywhere in `src/members/` or its routes.
3. `completeSignIn` has zero HTTP callers anywhere in this codebase. Investigation for this ADR surfaced a **second, coupled gap the dispatch brief did not name**: there is also no *public* (visitor-initiated) route for `requestSignInLink` — the only route that calls it is the operator-triggered admin resend action. Shipping `completeSignIn` alone would still leave the feature non-functional end-to-end, because a real visitor has no way to originate a sign-in request in the first place. Both public routes must land together.
4. `member_consents` (D1c, LOCKED 4-0 in the crosscutting sweep as Members-owned, Tier-2-pinned, purpose-keyed) has zero code anywhere in `src/members/`.
5. All five members repo ports have exactly one adapter (in-memory); no SQLite/Drizzle adapter exists, unlike every comparable feature module (`post`, `settings`, `presentation`, `workspace`) which already ship a `repo.sqlite.ts`.
6. The registered permission is `member.manage` (flat, two-segment), not the `admin.{section}.{action}` shape the 2026-07-10 crosscutting sweep froze as the Wave-1 convention and ADR-030/ADR-INDEX's own prose still names (`admin.members.*`).
7. The admin UI (`Members.tsx`, 51 lines) exposes none of the four capabilities the backend and the admin API client (`apps/admin/src/lib/api.ts`) already support (`getMember`, `disableMember`, `requestMemberMagicLink`).

This ADR designs the closure for all seven, in a priority order justified below, and states explicitly where investigation changed the dispatch brief's framing (item 3's coupled public-request-route finding; item 6's precedent-based resolution).

## Decision

Adopt a **remediation-in-place** strategy: extend the existing `src/members/` Tier-2 core library, the existing `src/server/routes/admin/members/` route family, and the existing `apps/admin/src/sections/Members.tsx` screen — no rewrite, no new architectural pattern. Add one new public (non-admin) route family (`src/server/routes/members/`), one new port (`MemberConsentRepoPort`), one new table family member (`member_consents`, plus an `entity_kind` extension on the planned `member_revisions` ledger), and a `repo.sqlite.ts` adapter for all six ports (5 existing + 1 new). Reuse `src/server/middleware/rate-limit.ts`'s existing primitive for the magic-link rate limit, and `src/origin`'s already-implemented `OriginRegistryPort` for absolute magic-link URLs. Do **not** rename the `member.manage` permission string; keep it, and record this repository's actual convention as flat `domain.verb` for admin-management bundles (see §6 and Pattern Evaluation).

**Pattern(s) selected:** Unchanged from ADR-030 — hexagonal ports-and-adapters at the persistence boundary (rule-of-two: in-memory + new SQLite adapters) inside a Tier-2 core library, composed into a modular-monolith Express server. This ADR's only new *pattern-level* choice is the addition of a second, unauthenticated route family (`src/server/routes/members/`) alongside the existing `src/server/routes/admin/` and `src/server/routes/content/` families — not a new pattern, the third instance of an already-established one (admin routes are session+authz gated; content routes are public/read-only; the new members routes are public/write-capable-but-rate-limited, a new *combination* of existing traits, not a new mechanism).

### 1. Authorization gap (highest priority) — gate `list`, `get-by-id`, and `request-magic-link` behind `member.manage`, same as `disable`

**Decision:** All four existing admin member routes require `authorize({principalId, permission: "member.manage", workspaceId, entityType: "member", entityId?})` before acting, using the exact call shape `disable.ts` already uses. This resolves SPEC-013 OQ-02 by choosing "one permission for the whole domain" over "split into `member.read`/`member.manage`."

**Why the coarse (single-permission) resolution, not a new `member.read`:** Every comparable single-domain admin bundle in this codebase (`user.manage`, `role.manage`, `navigation.manage`, `integration.manage`) is one flat permission covering the whole domain, not split into read/write. `content.*` is the one domain that *is* split (`content.read`/`.write`/`.publish`/`.delete`) — but that split exists because distinct content-domain callers/roles (a "read-only reviewer") are a real, named use case in this codebase; no such role exists anywhere for Members today. Introducing `member.read` now would be Article III speculative generality: a permission with no caller who needs a coarser grant than `member.manage` already provides. If a future need for member-read-only operators (e.g., a support role) materializes, adding `member.read` is a cheap, additive, non-breaking change — recorded as a Re-evaluation Trigger, not built preemptively.

### 2 + 3 (treated as one coupled slice) — magic-link rate limiter, and the two missing public sign-in routes

**Reordering note (per the dispatch's invitation to state independent reasoning):** the dispatch brief lists these as priorities 2 and 3 separately. Investigation shows they are architecturally inseparable: the *reason* ADR-030 OQ-8 calls the rate limiter a hard pre-launch precondition is that a **public, unauthenticated, visitor-initiated** `requestSignInLink` endpoint is an email-enumeration and spam-abuse surface. That endpoint does not exist in the current codebase — only the operator-triggered admin resend route calls `requestSignInLink`, and it is already behind `requireAdminSession` + (after item 1) `authorize()`. The rate limiter's real target is the **new public route this remediation must add** to make `completeSignIn` reachable at all. Building `completeSignIn`'s route without also building the public request route leaves the feature exactly as non-functional as today (an operator would still have to manually trigger every sign-in); building the public request route without the rate limiter would be shipping the exact abuse surface ADR-030 OQ-8 forbids. They are one slice.

**Decision — new public route family** `src/server/routes/members/` (mirrors the existing `src/server/routes/content/` convention: mounted outside `/api/admin`, no `requireAdminSession`):
- `POST /api/members/v1/workspaces/:workspaceId/sign-in` — public, calls `requestSignInLink`. Rate-limited (see below).
- `POST /api/members/v1/workspaces/:workspaceId/sign-in/complete` — public, calls `completeSignIn`, sets a **new, distinct** `tovu_member_session` cookie (`HttpOnly`, `Secure`, `SameSite=Lax` — `Lax` not `Strict`, because the member arrives via a top-level navigation from an email client, exactly the case `SameSite=Strict` would break; ADR-030 §3 specifies `SameSite=Lax` for this reason). Never touches or reads the admin `tovu_session` cookie.
- The existing admin-triggered `POST /api/admin/.../members/request-magic-link` route is unchanged in shape, but now also passes through the same rate-limit check (defense in depth against a compromised or over-eager operator session generating spam volume), keyed by target email only (the caller's IP is an operator's, not an attacker's, so IP-keying adds no value on that path).

**Decision — rate limit design (reuses `src/server/middleware/rate-limit.ts`, no new primitive, no new port):** two `RateLimitProfile` instances, both checked before any token is minted:
- `MAGIC_LINK_PER_EMAIL`: windowSeconds=3600, max=5, burst=0 — keyed by the normalized target email. Bounds spam to one inbox regardless of source IP.
- `MAGIC_LINK_PER_IP`: windowSeconds=3600, max=20, burst=0 — keyed by `resolveClientIp(req)` (the same helper `LOGIN_STRICT` already uses). Bounds a single attacker's ability to enumerate many emails.
- A request must pass **both** checks. Either limiter denying returns `429` with the same `{error, code: "RATE_LIMIT_EXCEEDED", details: {retryAfterSeconds}}` shape and `Retry-After` header `LOGIN_STRICT` already establishes — no new response contract invented.
- `completeSignIn`'s new public route gets a lighter `MAGIC_LINK_COMPLETE_ATTEMPT` profile (windowSeconds=60, max=20, burst=5) keyed by IP, as defense-in-depth — the 256-bit raw token makes brute force computationally infeasible regardless, so this is a secondary control, not the load-bearing one.

**Decision — absolute magic-link URLs, closing a stale disclosed gap:** `requestSignInLink` is updated to call `OriginRegistryPort.canonicalOrigin({workspaceId})` (already implemented, `src/origin`, ADR-040) and build an absolute link (`${origin}/auth/magic?token=...`) instead of today's relative path. `behavior.spec.md` §3's note ("No `core/origin` port exists yet in this repo") is now stale — the primitive landed as part of the 2026-07-10 sweep after SPEC-013's traceability pass was written against an earlier repo state. **Resilience decision:** if `canonicalOrigin` throws `OriginNotVerifiedError` (a workspace that hasn't configured its canonical origin yet), `requestSignInLink` falls back to today's relative-path behavior rather than failing the call — this preserves INV-06 (the constant `{delivered:true}` response must never depend on an unrelated operational precondition) and avoids making email delivery hard-fail on a missing, unrelated setting.

### 4. D1c consent record — Members-owned, purpose-keyed, additive

**Decision:** new `MemberConsentRepoPort` (rule-of-two: `repo.memory.ts` + `repo.sqlite.ts`, built in the same pass as item 5) backing a `member_consents` table: `id`, `workspaceId`, `memberId` (composite FK), `purpose` (module-prefixed string: `marketing-email | newsletter:{listId} | feature:{ns}:{id}`), `status ∈ {pending, granted, revoked}`, `evidence` (JSON: `{consentTextRef?, consentTextHash?, source, confirmTokenId?, ip?, userAgent?}`), `grantedAt?`, `revokedAt?`, `createdAt`, `updatedAt`, `version`.

**Ledger decision:** extend the `entity_kind` enum on ADR-030 §6's planned `member_revisions` ledger (`member | tier | subscription` → `+ consent`) rather than adding a second, parallel append-only table. ADR-030 already designed one shared ledger for every member-domain write; consent is a member-domain write. A second table with an identical append-only shape would duplicate structure Article III has no room for. New ops: `consent_request | consent_confirm | consent_revoke`.

**New chokepoint module** `src/members/consent-service.ts` (kept separate from `write-service.ts` — consent has a distinct actor model: a caller *other than* the member or an operator, i.e. a sibling core module like Newsletter, requests/confirms on the member's behalf, attributed via an explicit `originModule` field rather than `write-service.ts`'s operator/member actor split):
- `requestConsent({workspaceId, memberId, purpose, evidence, originModule})` → inserts `status='pending'`.
- `confirmConsent({workspaceId, memberId, purpose, evidence, originModule})` → `pending → granted`. **Callers cannot assert `granted` directly** — there is no `createConsent(status: 'granted')` entry point; only a request-then-confirm sequence reaches `granted`, per the crosscutting sweep's explicit rule ("Newsletter cannot assert `granted` directly").
- `revokeConsent({workspaceId, memberId, purpose})` → `granted → revoked` (idempotent: revoking an already-revoked purpose is a no-op, matching `disableMember`'s idempotency convention).
- `checkConsent({workspaceId, memberId, purpose})` → `{status}` read. Chosen over widening `AudienceDirectoryPort.getContacts(query:{consentPurpose?})`'s existing signature — additive-only, zero risk to `MembersSubscriberDirectory`'s existing tested callers (`traceability.spec.md` §1 REQ-13).

**Capability-gating scope decision:** the crosscutting sweep's "capability-gated" language targets a future Tier-3 plugin caller. Newsletter (the only named consumer) is itself Tier-2 core, exactly like Members — this is an ordinary cross-module core function call (the same shape `MembersSubscriberDirectory` already uses to implement Newsletter's `SubscriberDirectoryPort`), not a plugin capability check. Building a full ADR-024 capability-taxonomy gate for a core-to-core call this pass would be premature (Article III/IV); `originModule` attribution in the revision ledger satisfies "attributed" without inventing capability infrastructure no Tier-3 caller exists to need yet. Flagged as a Re-evaluation Trigger for when a real Tier-3 consumer of consent state appears.

**Explicitly out of scope for this pass:** wiring Newsletter's confirmation-email mechanics to call `requestConsent`/`confirmConsent` — that is Newsletter's own ADR-PIPE-011 concern (Newsletter is Wave 2, and the crosscutting sweep is explicit that Newsletter "must NOT ship to real recipients before Members is live"). This ADR builds the table/port/service Members owns; the calling side is a Newsletter-owned follow-up, correctly not duplicated here.

### 5. SQLite/Drizzle adapter for all six ports

**Decision:** `src/members/repo.sqlite.ts` implementing `MemberRepoPort`, `MemberTierRepoPort`, `MemberSubscriptionRepoPort`, `MemberSessionRepoPort`, `MagicLinkTokenRepoPort`, and the new `MemberConsentRepoPort`, against 7 new Drizzle table definitions added to `src/infra/db/schema.ts` (`members`, `member_tiers`, `member_subscriptions`, `member_sessions`, `member_magic_tokens`, `member_consents`, `member_revisions`), mirroring `SqlitePostRepo`'s and `src/features/settings/repo.sqlite.ts`'s exact shape (typed row → domain-record mapping, `.onConflictDoUpdate` upserts, `and(eq(...))` composite-key queries).

**Scope boundary, stated explicitly:** this closes REQ-18's literal gap ("no SQLite/Drizzle adapter exists") and satisfies Article IV's rule-of-two. It does **not** flip `src/server/app.ts`'s boot-time wiring from `InMemoryMemberRepo` to the new SQLite adapter. Investigation found this is not a Members-specific gap: `src/server/app.ts` boots **every** feature's repos in-memory today, including `post` (`InMemoryPostRepo`, line 119) despite `SqlitePostRepo` existing and being contract-tested. There is no persistent-storage boot toggle anywhere in this repo yet. Making Members the first feature to wire its SQLite adapter into the actual boot path — while every sibling feature stays in-memory — would be an inconsistent, unilateral infrastructure decision this feature's remediation should not make alone. The adapter is built and contract-tested to the same bar as every other feature's; the boot-wiring decision is a repo-wide, cross-cutting item, recorded as a Re-evaluation Trigger, not solved here.

### 6. Permission naming — keep `member.manage`; do not rename to `admin.members.*`

**Decision:** No migration. `member.manage` stays exactly as registered today.

**Why, despite ADR-030/ADR-INDEX's own prose still naming `admin.members.*`:** the 2026-07-10 crosscutting sweep froze `admin.<section>.<action>` as the Wave-1 convention on paper, but the actual landed code for the two other Wave-1 sibling features that have already wired permissions (Menus, Integrations — `src/identity/permissions.ts` lines 149-158) explicitly **rejected** that convention in favor of the flat `domain.verb` shape `member.manage`/`user.manage` already use, with this exact reasoning recorded in the catalog file itself: *"Both ADRs' own text separately floats a namespaced `admin.<section>.manage` string... that convention has no implementation behind it anywhere in this codebase. This registers the flat two-segment `domain.verb` shape instead... so menus/integrations authorization is checked with real, tested code rather than a convention that exists only as ADR prose."* This is the coordinated cross-cutting mechanism the dispatch directive asked this ADR to align with, not duplicate: the convention that actually exists in code today is flat `domain.verb`, and `member.manage` already matches it. Renaming `member.manage` now would make Members the **odd one out** relative to its own precedent (`user.manage`, `role.manage`) and would be the exact breaking grant-data migration the sweep doc itself warns a rename requires, for a convention no sibling feature actually implements. **This ADR resolves SPEC-013 OQ-03 as: no rename.** The governance-level inconsistency (ADR-030/ADR-INDEX prose vs. actual code) is a documentation debt on those files, not something this feature-level ADR can or should silently fix by moving Members' permission string; it is recorded as a Related Decision for a future governance-ADR text correction.

### 7. UI gaps — wire the three existing, unused API client methods; leave pagination as a named follow-up

**Decision:** extend `apps/admin/src/sections/Members.tsx` with:
- A disable action per row, calling the already-existing `api.disableMember(id)`.
- A resend-sign-in-link action per row, calling the already-existing `api.requestMemberMagicLink(email)`.
- A member detail expansion (click a row) calling the already-existing `api.getMember(id)`.

No new backend contract is needed for any of these three — `apps/admin/src/lib/api.ts` already has all three methods; the gap is entirely in the unused component, exactly as `spec-manifest.md`'s Brownfield References already found.

**Explicitly deferred, not silently dropped:** pagination (`afterId`/`limit`) is a *different* gap from the three named above — the API client's `listMembers()` method does not accept query parameters today (unlike `getMember`/`disableMember`/`requestMemberMagicLink`, which are fully wired end-to-end and simply unused), so exposing it requires a small client-contract change in addition to a UI change. Given the dispatch brief's priority framing names only the three already-supported methods, pagination is recorded as a lower-priority, separately-scoped follow-up (see Open Questions) rather than folded into this remediation's UI slice, to avoid scope creep on an otherwise narrowly-bounded fix.

## Default Heuristic Alignment

- Default heuristic: modular monolith at the macro level, vertical slices for feature ownership, and hexagonal boundaries only where external I/O or business-critical logic justify them. Frontend applications use Feature-Sliced Design. Small or simple features should avoid unnecessary architecture ceremony.
- Alignment: FOLLOWS
- Notes: Every remediation slice extends an existing vertical feature module (`src/members/`) or adds a same-shape sibling route family (`src/server/routes/members/`, matching the existing `routes/admin/` and `routes/content/` pattern) rather than introducing a new macro-structure. The hexagonal seam at persistence (`MemberConsentRepoPort` + the completed rule-of-two on the other five) is justified by the same Article IV mandate every other repo port already carries. `Members.tsx` stays a single flat file, matching every other admin section's convention (confirmed against `Menus.tsx`/`Settings.tsx`) rather than introducing a nested component tree for three new row actions.

## Rationale

Map the decision to the system drivers:
- **Driver: a live authorization gap in shipped code is a security incident waiting to happen, not a documentation nicety** → addressed by uniformly gating all four (soon five) member routes behind `authorize({permission: 'member.manage', ...})`, closing REQ-10 completely rather than partially.
- **Driver: ADR-030's own text names the rate limiter a hard pre-launch precondition, and the crosscutting sweep repeats it as mandatory** → addressed by reusing the exact primitive (`createRateLimiter`) this repo already trusts for its highest-stakes existing auth surface (admin login), applied to both the newly-discovered public request route and (defense-in-depth) the existing admin-triggered one.
- **Driver: a feature that cannot be exercised end-to-end by its actual intended user (a visitor) is not really shipped** → addressed by building the coupled pair (public request + public complete), not completeSignIn in isolation, which investigation showed would still leave the feature non-functional.
- **Driver: D1c is a locked 4-0 cross-cutting ruling with real GDPR/CAN-SPAM stakes for the eventual Newsletter integration** → addressed by building the owning module now (table + port + service), without overreaching into Newsletter's own not-yet-built calling side.
- **Driver: rule-of-two is a constitution article, not a suggestion** → addressed by building `repo.sqlite.ts` for every port, matching the bar every sibling feature module already meets, while being honest that boot-wiring parity is a separate, repo-wide gap this feature alone shouldn't resolve.
- **Driver: don't invent a migration nobody asked for and no sibling feature performs** → addressed by keeping `member.manage`, grounded in the actual landed precedent of the two sibling features that already wired their permissions.
- **Driver: ship the cheapest fix for the UI gap, not the most complete one** → addressed by wiring the three already-built client methods and explicitly not bundling in the pagination gap, which needs its own small contract change.

## Pattern Evaluation

The macro pattern (hexagonal ports-and-adapters, Tier-2 core library, modular monolith) is inherited unchanged from ADR-030/ADR-021/ADR-006 and is not re-litigated. Three genuinely open implementation-level choices this ADR resolves:

| Pattern | Fit Band | Adaptability | Evidence Basis | Pros | Cons | Key Tradeoffs | Verdict |
|---|---|---|---|---|---|---|---|
| **Permission-check surface: reuse `member.manage` for all 4 routes** | Strong fit | High | measured (read `disable.ts`'s existing call shape + the full permission catalog) | Zero new catalog entries; matches the coarse-bundle convention every comparable domain (`user.manage`/`role.manage`/`navigation.manage`/`integration.manage`) already uses; closes REQ-10 in one uniform pass | An operator who should only view members (no such role exists today) can't be granted read-only access without also getting manage rights | None significant today — the finer split is cheap to add later if a real caller needs it | **SELECTED** |
| New `member.read` permission, split from `member.manage` | Weak fit | Medium | analogical | Finer-grained; matches `content.*`'s split | No caller anywhere in this codebase needs the split today (Article III violation); adds a permission string with zero current consumers | Introduces catalog surface with no near-term driver | Not selected — speculative generality with no named requirement |
| **Rate limiter: reuse `createRateLimiter`/`RateLimitProfile` (new profiles only)** | Strong fit | High | measured (read `rate-limit.ts` in full; it's explicitly structured for exactly this reuse — "so `WRITE_STANDARD`/`READ_STANDARD`... can reuse the same primitive later") | Zero new code for the counting/windowing logic; same `429`/`Retry-After`/`RATE_LIMIT_EXCEEDED` response shape the login route already establishes (consistency); the file's own header anticipated this reuse | Still in-memory/single-process (documented, pre-existing limitation shared with `LOGIN_STRICT`, not introduced by this decision) | Accepting the existing primitive's single-process limitation now vs. building distributed rate-limiting infrastructure no other route in this repo has either | **SELECTED** |
| A new, dedicated rate-limit module for Members | Weak fit | Low | analogical | Could add Members-specific tuning knobs | Pure duplication of an existing, working, already-tested primitive; violates Article III/IV for no benefit; the crosscutting sweep explicitly says "a module-local limiter satisfies [Members' OQ-8] precondition" — reusing the existing module-local primitive is the more literal reading of that ruling, not a new one | None that justify a second implementation | Not selected |
| **Consent read path: additive `checkConsent(memberId, purpose)`** | Strong fit | High | measured (read `MembersSubscriberDirectory`'s existing tested `getContact`/`getContacts` call sites in `traceability.spec.md` §1) | Zero risk to `AudienceDirectoryPort.getContacts`'s existing signature and its tested callers; the crosscutting sweep names this as an explicit "OR" alternative | Two ways to ask "is this member subscribed/consented" (`getContacts(query)` vs `checkConsent`) rather than one | A caller needing both consent status and contact info in one round trip makes two calls instead of one — acceptable given no such caller exists yet | **SELECTED** |
| Widen `AudienceDirectoryPort.getContacts(query:{consentPurpose?})` | Viable fit | Medium | analogical | One call site for combined contact+consent lookups | Changes an existing, tested, cross-module port signature Newsletter's future implementation must also adopt — a broader blast radius for a capability no current caller exercises | Widening a shared port ahead of its second real consumer risks guessing its shape wrong | Not selected — the additive function is strictly lower-risk for the same crosscutting-sweep-sanctioned outcome |

## Quality Attribute Scorecard

Scored for the concrete surface this ADR adds (route auth, rate limiting, public sign-in surface, consent module, SQLite adapters). Security and reliability carry the most weight, since the dominant driver is closing a live authorization gap and a named hard pre-launch precondition.

| Axis | Definition | Score (1-5) | Confidence | Strengths | Weaknesses | Rationale | Assumptions | Activation Source | Mitigation / Owner / Enforcement / Deadline | Review Trigger | Delta vs Runner-up |
|---|---|---|---|---|---|---|---|---|---|---|---|
| modifiability | Ease of changing Members' auth/sign-in/consent behavior later | 4 | measured | Every new surface is additive (new routes, new table, new port) — nothing existing is restructured | `Members.tsx` will grow from 51 lines to a modestly larger single file with 3 new row actions | Matches the existing repo convention of flat section files; a later split is a non-breaking internal refactor, same posture SPEC-007's ADR already pre-approved for `Settings.tsx` | Repo convention (flat section files) stays acceptable at this screen's now-slightly-higher complexity | always-on | If `Members.tsx` exceeds ~300 lines after the 3 new actions, Programmer may split into a local `sections/members/` folder without changing the public route contract | Owner: Programmer; trigger: file exceeds ~300 lines | — |
| modularity | Cross-module coupling | 4 | measured | New public routes live in their own `src/server/routes/members/` family, not mixed into `routes/admin/members/`; `consent-service.ts` is a separate file from `write-service.ts` reflecting its distinct actor model | `members` now has a read dependency on `origin` (`OriginRegistryPort`) in addition to `identity` and `mail` | Each new dependency is a single, narrow, already-existing port — no new coupling shape, just one more edge on an already-established dependency style | — | always-on | — | — | +1 vs. inlining origin-resolution logic directly in `write-service.ts`, which would couple mutation logic to URL-building |
| scalability | Read/write volume headroom | 4 | prior_art | Rate limiter is O(1) per check, bounded map growth per distinct key (same profile as the already-running `LOGIN_STRICT`) | The in-memory rate limiter does not survive a process restart or scale across multiple server instances (pre-existing limitation, not new) | No new scaling concern beyond what `LOGIN_STRICT` already accepts in production today | Single-process deployment is the current reality for every route in this server | always-on | If Members ever deploys behind multiple processes/instances, the shared-rate-limiter primitive (crosscutting sweep §E, "stays OPEN") must land before the per-process limiter's undercounting becomes a real bypass | Owner: whoever builds the shared rate-limiter primitive; trigger: multi-instance deployment | — |
| reliability | Correctness under failure, never-brick | 5 | measured | `requestSignInLink`'s anti-enumeration constant response (INV-06) is explicitly preserved even when origin resolution fails (fallback to relative path) or rate-limiting denies (still returns `{delivered:true}`-shaped semantics is NOT applicable here — a rate-limited request returns 429, a deliberate, disclosed departure from INV-06 discussed below) | A rate-limited public request now returns a distinguishable `429` rather than the constant `{delivered:true}` — a small, intentional relaxation of INV-06 for requests that exceed the volume threshold, not for requests that differ only by whether the email exists | This is the correct tradeoff: INV-06 protects against email-existence enumeration (one request per candidate email, learn nothing from the response); rate-limiting protects against volume abuse (many requests) — the two don't conflict because the 429 reveals nothing about whether *this* email is registered, only that *this* email or *this* IP has been queried too many times | The `429` response must never vary based on whether the specific email exists — only on request volume for that key | always-on | — | — | — |
| security | Authorization + abuse-surface correctness | 5 | measured | Closes a live, exploitable authorization gap (REQ-10) uniformly across all routes; closes a named hard pre-launch precondition (OQ-8) with a proven-in-production-here primitive; distinct member-session cookie prevents the classic member-cookie-drives-admin-API confusion ADR-030 §3 exists to prevent | Full physical origin separation remains unbuilt (shared process/port) — a real, disclosed residual risk if this server is ever exposed non-locally without the deferred origin-separation infra landing first | The two concrete violations this ADR targets (missing authz, missing rate limiter) are the ones with an immediate, demonstrable exploit path in the current single-origin dev topology; physical origin separation only matters once non-local exposure is real, and the constitution's standing Article VI exception already scopes that | This server stays local-dev-only until the origin-separation infra (a repo-wide item, not Members-specific) lands | always-on | Logical isolation (distinct cookie, distinct unauthenticated path prefix, no shared middleware) must ship with this remediation; physical origin separation is a named pre-non-local-deployment blocker, tracked as a Re-evaluation Trigger, not this ADR's job to build | Owner: whoever plans non-local deployment; trigger: any plan to expose this server outside local dev | +2 vs. shipping only `completeSignIn`'s route without the rate limiter, which would reopen exactly the abuse surface OQ-8 forbids |
| operability | Ops/debugging surface | 4 | prior_art | `429` responses carry `Retry-After` + structured `code`/`details`, consistent with the one other rate-limited route in this repo; revision ledger (`member_revisions`, extended for consent) gives a full audit trail for consent state changes | No new structured logging/metrics for rate-limit hit rates specifically (matches the existing `LOGIN_STRICT` gap, not a new one) | Inherited posture, not worsened | — | always-on | — | — | — |
| cost | Build/run cost | 5 | measured | Zero new infrastructure — same SQLite, same Express process, same in-memory rate-limit primitive; the new routes and table are pure additions to an already-running server | None | Pure feature-module extension | — | always-on | — | — | — |
| testability | Ease of certifying behavior | 4 | measured | Every new function (route handlers, `consent-service.ts`, rate-limit wiring) follows the exact test-first pattern the rest of this codebase already uses (pure functions + in-memory adapters + route-level integration tests) | The coupled public-request + public-complete + rate-limit slice has more moving parts to certify together than a single-function change would — genuinely more test surface than priorities 4-7 | This is inherent to closing priorities 2+3 as one slice (see Rationale) rather than a design weakness; TDD should certify the rate limiter and the two routes independently before wiring them together, mirroring how SPEC-007 isolated `deriveRequiredPermission()` before wiring it into the chokepoint | — | always-on | Certify `requestSignInLink`'s origin-fallback behavior and the two rate-limit profiles as independently testable units before the route-level integration tests that compose them | Owner: TDD Agent; trigger: before Programmer wires the public routes | -1 vs. a single-function fix, but that comparison is the wrong one — see Rationale for why they must ship together |

No axis scored ≤2. The one axis with the most nuance (security) explicitly names its residual weakness (no physical origin separation) rather than claiming a clean 5.

## Overall Strengths

- The two highest-severity gaps (live authorization hole, missing rate limiter on a passwordless-auth surface) are closed with primitives this codebase already trusts in production for an equally sensitive surface (admin login) — no new attack surface from unproven code.
- Investigation surfaced and closed a real coupled gap (no public request-sign-in route) the dispatch brief itself did not name, preventing a remediation that would have shipped `completeSignIn` to a route nobody could actually reach.
- The permission-naming question is resolved by citing real, already-landed sibling precedent rather than by unilateral judgment call, directly satisfying the dispatch's "coordinate with the sibling ADRs" instruction.

## Overall Weaknesses

- Full physical member/admin origin separation (ADR-030 §3's stated intent) is still not achieved — this remediation ships the best available logical isolation given the repo's current single-process topology, not the ADR's original design intent in full.
- The consent module (`consent-service.ts`) ships with no real caller yet (Newsletter's mechanics land in its own future ADR) — it is correctly-scoped but will sit unexercised by production traffic until Newsletter's Wave-2 work lands, a real (if bounded) speculative-build risk mitigated by it being a locked 4-0 cross-cutting decision, not a guess.

## Tradeoff Tension

We are trading full physical origin isolation (ADR-030's original design intent) for the achievable logical isolation (distinct cookie, distinct unauthenticated route family, no shared session middleware) that this repo's current single-process topology actually supports, rather than blocking this entire remediation on building multi-origin serving infrastructure no feature in this repo has today.

## Why This Won

Every alternative that would have shipped tighter security (e.g., blocking on real origin separation before any of this lands) fails a harder constraint: this repo has zero multi-origin serving infrastructure today, for any feature, and building it is a materially larger, cross-cutting effort than this feature's remediation scope. Shipping the achievable logical isolation now closes the two concrete, demonstrable-today violations (authz gap, missing rate limiter) without waiting on infrastructure this feature alone should not be the one to build. The alternative of doing nothing until full origin separation exists would leave a live authorization hole in production-adjacent code indefinitely — a strictly worse outcome than shipping the achievable fix now and naming the remaining gap explicitly.

## Runner-Up Comparison

- Runner-up: Block priorities 2-3 (rate limiter + public routes) until full origin-separation infrastructure is designed and built, on the theory that shipping a public sign-in surface without ADR-030's originally-intended origin isolation is itself premature.
- Why it lost: This would leave the *already-shipped* authorization gap (priority 1) and the *already-shipped* enumeration-vulnerable admin-triggered request-magic-link route unremediated indefinitely, waiting on unrelated infrastructure. The concrete, demonstrable-today gaps this ADR closes do not depend on origin separation to be worth fixing; deferring them to that dependency would be strictly worse than shipping the logical-isolation interim and naming the remaining physical-separation gap as a tracked trigger.

## Consequences

**Positive:**
- Every admin member route now enforces the same permission check, closing a live, disclosed authorization gap uniformly rather than piecemeal.
- The feature becomes genuinely end-to-end functional for a real visitor for the first time, with the abuse-surface control (rate limiter) landing in the same slice, not as an afterthought.
- D1c's locked cross-cutting ruling gets a concrete, buildable owner-side implementation without overreaching into Newsletter's not-yet-built calling side.
- Every members repo port reaches Article IV parity with the rest of the codebase.
- The permission-naming question is resolved by citing real precedent, not a fresh unilateral call — directly fulfilling the dispatch's cross-ADR-coordination instruction.

**Negative / Tradeoffs:**
- The member session still shares a process/port with the admin session (logical, not physical, isolation) until a repo-wide origin-separation effort lands — named explicitly rather than hidden.
- `consent-service.ts` ships ahead of its real caller (Newsletter), a bounded speculative-build risk accepted because the underlying decision (D1c) is already locked 4-0, not speculative itself.
- Members' SQLite adapter existing does not change its boot-time wiring — a reader auditing `app.ts` will still see `InMemoryMemberRepo` in production-adjacent code, matching every sibling feature's current state, which could read as an inconsistency until the repo-wide boot-wiring gap is addressed.

**Risks:**
- Risk: the two rate-limit profiles (`MAGIC_LINK_PER_EMAIL`, `MAGIC_LINK_PER_IP`) are tuned by judgment (5/hour, 20/hour) without production traffic data → plan: TDD certifies both profiles' boundary behavior exactly (the Nth request rejected, the window reset) so the *mechanism* is correct; the specific thresholds are a product/ops tuning knob revisitable without code changes to the mechanism (`RateLimitProfile` is already a plain data constant).
- Risk: `OriginRegistryPort.canonicalOrigin`'s fallback-to-relative-path behavior on `OriginNotVerifiedError` could mask a genuine misconfiguration (an operator who forgot to verify their workspace's origin never notices, because links still "work" as relative paths in same-origin testing) → plan: log a warning (not a user-facing error) when the fallback triggers, so the gap is observable in server logs without breaking the anti-enumeration invariant for real visitors.

## Mitigations Required

None scored ≤2. The forward-looking mitigations above (rate-limit tuning revisit, origin-fallback logging) are Owner/Enforcement-tagged notes already captured inline in the Quality Attribute Scorecard and Consequences, not separate blocking items.

## Migration Safety (required — brownfield remediation of a live shipped feature)

| Safety Item | Decision / Evidence | Owner |
|---|---|---|
| Expand/contract shape | Pure expand: new routes (`src/server/routes/members/*`), new table (`member_consents`) + ledger enum extension (`member_revisions.entity_kind`), new port + adapter (`MemberConsentRepoPort`), new SQLite adapters for the 5 existing ports. Nothing existing is removed or renamed. The 3 already-shipped routes (`list`, `get-by-id`, `request-magic-link`) gain an `authorize()` call — a behavior *addition* (previously-unauthorized callers now get `403`), not a contract removal for any caller who already held `member.manage` (only `disable`-capable operators exist today per the seed data, so no currently-functioning caller loses access). | Programmer |
| Dual-write or read-routing plan | N/A for the route/authz changes (stateless behavior change, not a data migration). For the SQLite adapters: no dual-write needed because `app.ts`'s boot wiring is explicitly **not** changed by this ADR (see Decision §5) — the in-memory adapters remain the only ones actually receiving traffic; the SQLite adapters are built and contract-tested but not yet live, exactly like `SqlitePostRepo` today. | Programmer |
| Backfill plan | N/A — no existing persisted member data exists anywhere (the in-memory store has never persisted across a restart), so there is nothing to backfill into the new SQLite tables. | N/A |
| Reconciliation checks | Contract-test suite: both `repo.memory.ts` and the new `repo.sqlite.ts` must pass the identical test suite against every port's full interface (mirrors `PostRepoPort`'s and `SettingsRepoPort`'s existing contract-test convention) — proves adapter equivalence without needing a live-data reconciliation, since there is no live data to reconcile. | TDD Agent |
| Observability proving phase health | Every new `authorize()` call's `403` denial and every rate-limit `429` are themselves the observable proof this remediation is active — no separate migration-specific telemetry needed, consistent with how `LOGIN_STRICT`'s existing rollout was proven. | Programmer |
| Rollback test | Because `app.ts`'s boot wiring is untouched (in-memory adapters stay authoritative) and the new routes are additive, rollback of the persistence-layer work is simply: don't wire the new adapters into boot (they aren't, by design). Rollback of the authz/rate-limit additions is a straightforward revert of the added `authorize()`/rate-limit-check lines, since no data shape changed. | Software Architect (this decision), Programmer (execution) |
| Cutover approval and timing | No cutover in the traditional sense — this is additive route/module work with no traffic migration. The one behavior change with real user-facing effect (adding `authorize()` to 3 previously-unauthorized routes) should be called out explicitly in Code Review as a deliberate, intended breaking-for-unauthorized-callers change, not treated as a routine addition. | Coordinator / Code Review |
| Point of no return | None identified — nothing in this remediation deletes existing code, tables, or routes. The closest analogue (retiring the in-memory-only posture) is explicitly deferred, not attempted here. | N/A |
| Post-cutover verification | Route-level integration tests (new, per Article V) proving: (a) an operator without `member.manage` gets `403` on all 4 admin routes, (b) the 6th request within an hour to the public sign-in route from the same email gets `429`, (c) a real token minted by the public request route is consumable by the public complete route and mints a working `tovu_member_session` cookie distinct from `tovu_session`. | TDD Agent, then human/`/verify` |

## Re-evaluation Triggers

- Calendar trigger: None forced — this is a remediation of an already-audited feature design (ADR-030), not a fresh speculative build.
- Scale trigger: If this server is ever deployed across multiple processes/instances, the in-memory rate limiter (shared limitation with `LOGIN_STRICT`) must be replaced by the crosscutting sweep's still-OPEN shared rate-limiter primitive before the per-process undercounting becomes a real bypass.
- Topology trigger: The single biggest re-evaluation trigger for this ADR — if/when this repo builds real multi-origin serving infrastructure (for Members, Media, or any other feature that has named an origin-isolation need), Members' member-session cookie/routes should be re-evaluated against that infrastructure to close the physical-isolation gap this ADR leaves logical-only.
- Dependency trigger: If `src/origin`'s `OriginRegistryPort.canonicalOrigin` signature changes, or if any feature (Members included) becomes the first to flip `app.ts`'s boot wiring from in-memory to SQLite, Code Review should flag Members for a consistency check against whatever new convention that establishes.
- Product trigger: If a member-read-only operator role is ever proposed, add `member.read` then — not before (see Pattern Evaluation).

## Module / Service Boundaries

```
src/members/                                # EXISTING Tier-2 core library, extended
  write-service.ts                          # MODIFIED: requestSignInLink builds an absolute
                                             #   link via OriginRegistryPort.canonicalOrigin()
                                             #   with relative-path fallback on OriginNotVerifiedError
  consent-service.ts                        # NEW: requestConsent/confirmConsent/revokeConsent/
                                             #   checkConsent — the D1c chokepoint, kept separate
                                             #   from write-service.ts (distinct actor model:
                                             #   originModule attribution, not member/operator)
  ports.ts                                  # MODIFIED: adds MemberConsentRepoPort (rule-of-two)
  types.ts                                  # MODIFIED: adds MemberConsentRecord, ConsentPurpose,
                                             #   ConsentStatus, ConsentEvidence types
  repo.memory.ts                            # MODIFIED: adds InMemoryMemberConsentRepo
  repo.sqlite.ts                            # NEW: Drizzle/SQLite adapter for all 6 ports
                                             #   (5 existing + MemberConsentRepoPort), mirrors
                                             #   SqlitePostRepo/settings' repo.sqlite.ts shape
  index.ts                                  # MODIFIED: barrel exports for the above

src/infra/db/schema.ts                      # MODIFIED: 7 new Drizzle table defs — members,
                                             #   member_tiers, member_subscriptions,
                                             #   member_sessions, member_magic_tokens,
                                             #   member_consents, member_revisions (entity_kind
                                             #   enum widened to include 'consent')

src/server/middleware/rate-limit.ts         # MODIFIED: adds MAGIC_LINK_PER_EMAIL,
                                             #   MAGIC_LINK_PER_IP, MAGIC_LINK_COMPLETE_ATTEMPT
                                             #   RateLimitProfile constants (no change to
                                             #   createRateLimiter/resolveClientIp themselves)

src/server/routes/admin/members/            # EXISTING, extended
  list.ts                                   # MODIFIED: adds authorize({permission:'member.manage'})
  get-by-id.ts                              # MODIFIED: same
  request-magic-link.ts                     # MODIFIED: adds authorize() + the per-email
                                             #   rate-limit check (shared profile with the
                                             #   public route)
  disable.ts                                # UNCHANGED (already correct)
  deps.ts                                   # MODIFIED: MembersRouteDeps gains rate-limiter
                                             #   instances + MemberConsentRepoPort

src/server/routes/members/                  # NEW public (non-admin) route family, mirrors
                                             #   the existing routes/content/ convention
  sign-in.ts                                # NEW: registerPublicMemberSignInRequestRoute —
                                             #   POST .../sign-in, rate-limited, calls
                                             #   requestSignInLink
  complete-sign-in.ts                       # NEW: registerPublicMemberCompleteSignInRoute —
                                             #   POST .../sign-in/complete, rate-limited, calls
                                             #   completeSignIn, sets tovu_member_session cookie
  deps.ts                                   # NEW: MemberPublicRouteDeps (narrower than
                                             #   MembersRouteDeps — no authorize()/session
                                             #   dependency, this family is unauthenticated)

src/server/app.ts                           # MODIFIED: imports + registers the 2 new public
                                             #   routes (mounted OUTSIDE the /api/admin
                                             #   requireAdminSession middleware, alongside
                                             #   registerContentPostGetRoute); wires
                                             #   MemberConsentRepoPort + rate limiters into
                                             #   route deps. Boot-time repo adapters remain
                                             #   in-memory (Decision §5 — unchanged from today)

src/identity/permissions.ts                 # UNCHANGED — member.manage stays as registered
                                             #   (Decision §6, no rename)

apps/admin/src/sections/Members.tsx         # MODIFIED: adds a disable action, a resend-link
                                             #   action, and a detail expansion per row, calling
                                             #   the 3 already-existing api.ts client methods.
                                             #   Stays a single flat file (repo convention).
apps/admin/src/lib/api.ts                   # UNCHANGED for this pass — the 3 methods this
                                             #   remediation wires already exist; pagination
                                             #   support is a deferred follow-up (Decision §7)
```

**Out of this remediation's scope (explicitly deferred, not silently dropped):** flipping `app.ts`'s boot wiring from in-memory to SQLite for Members (Decision §5); building real multi-origin serving infrastructure (Decision §3); Newsletter's own calling-side wiring to `consent-service.ts` (Decision §4); `apps/admin/src/lib/api.ts` pagination support (Decision §7); any governance-ADR text correction to ADR-030/ADR-INDEX's stale `admin.members.*` mentions (Decision §6).

## API / Event Contract Summary

- **New public HTTP endpoints:** `POST /api/members/v1/workspaces/:workspaceId/sign-in` (rate-limited, calls `requestSignInLink`), `POST /api/members/v1/workspaces/:workspaceId/sign-in/complete` (rate-limited, calls `completeSignIn`, sets `tovu_member_session`). Both unauthenticated by design — TDD/Programmer must not add `requireAdminSession` to this route family.
- **Modified existing endpoints:** `list`, `get-by-id`, `request-magic-link` (admin) all now require `authorize({permission: 'member.manage', ...})` — Programmer must use the exact `disable.ts` call shape, not a re-derived one.
- **New exported service:** `src/members/consent-service.ts`'s `requestConsent`/`confirmConsent`/`revokeConsent`/`checkConsent` — the D1c-mandated surface a future Newsletter implementation calls. Programmer must not let any caller reach `granted` status except via `requestConsent` then `confirmConsent` in sequence.
- **New port:** `MemberConsentRepoPort` (rule-of-two: `repo.memory.ts` + `repo.sqlite.ts`); no third write path is permitted outside `consent-service.ts`, mirroring the existing `write-service.ts` chokepoint discipline.
- **New rate-limit profiles:** `MAGIC_LINK_PER_EMAIL`, `MAGIC_LINK_PER_IP`, `MAGIC_LINK_COMPLETE_ATTEMPT` in `src/server/middleware/rate-limit.ts` — other features needing similar protection should add their own named profile constants to this same file rather than each hand-rolling a new limiter instance.
- **New cookie:** `tovu_member_session` (`HttpOnly`, `Secure`, `SameSite=Lax`) — structurally and nominally distinct from the admin `tovu_session` (`SameSite=Strict`); no route in either family may read the other's cookie.

## Enforcement

How do we prevent violations?
- Code Review Agent flags any new admin member route that does not call `authorize({permission: 'member.manage', ...})` before acting.
- Code Review Agent flags any import of `src/members/repo.memory.ts`/`repo.sqlite.ts` from outside `write-service.ts` or `consent-service.ts` — the chokepoint boundary is a file-boundary check, mirroring ADR-022/ADR-028's existing convention.
- Code Review Agent flags any new caller reaching `member_consents.status = 'granted'` through any path other than `requestConsent` → `confirmConsent` in sequence.
- Code Review Agent flags any route in `src/server/routes/members/` that imports or calls `requireAdminSession` — this family must stay unauthenticated by design.
- Code Review Agent flags any read of `req.headers.cookie` for the `tovu_session` name inside `src/server/routes/members/`, or for `tovu_member_session` inside `src/server/routes/admin/` — cookie names must never cross the two route families.
- Code Review Agent verifies the two rate-limit checks (`MAGIC_LINK_PER_EMAIL`, `MAGIC_LINK_PER_IP`) both run before any token is minted in the public sign-in request route, not after.

## Complexity Justification

*Fill only if Constitution Check has EXCEPTION entries. Empty = no violations.*

| Article Violated | Why This Complexity Is Needed | Simpler Alternative Considered | Why Simpler Alternative Was Insufficient |
|---|---|---|---|
| V (carried, historical) | The pre-existing 4 admin routes shipped with zero route-level integration tests before a spec package existed; this ADR cannot retroactively certify tests for code already merged without redoing the entire feature, which is out of a remediation ADR's scope | Leave the gap fully unaddressed | Not chosen — this ADR requires TDD to add route-level tests for both the pre-existing and the newly-added surfaces going forward, narrowing rather than ignoring the gap |
| VI (narrowed, not closed) | Full physical origin separation is infrastructure no feature in this repo has; building it is materially larger than this feature's remediation scope | Block this entire remediation until origin-separation infrastructure exists | Not chosen — would leave the already-shipped, already-exploitable authorization gap unremediated for an indefinite, unrelated dependency; the achievable logical isolation closes the two concrete, demonstrable-today violations now |
| VIII (carried, historical) | Unstructured `{error: string}` envelope predates this ADR across most of the feature's error paths; a full structured-error rewrite is a larger, cross-cutting effort (named in SPEC-013's own EXCEPTION row) than this remediation's scope | Rewrite every error response in this feature to a structured envelope as part of this pass | Not chosen — scope creep beyond the 7 named/discovered gaps; the new rate-limit responses do adopt the better-structured shape already proven by `LOGIN_STRICT`, narrowing the gap where it's cheap to do so |

## Related Decisions

- Extends: ADR-030 (Members, ACCEPTED 2026-07-10) — this ADR implements the gap-closing follow-up work ADR-030 itself named as open (OQ-8 rate limiter) or as a locked cross-cutting fold (D1c consent), plus two additional gaps ADR-030 did not anticipate (the authz-gap severity and the missing public request route).
- Relates to: ADR-037 (`core/mail`, already implemented, consumed unchanged), ADR-040 (`core/origin`, already implemented, newly consumed by `requestSignInLink`'s absolute-URL upgrade), ADR-021 (identity/`authorize()`, reused unchanged), ADR-022/ADR-028 (write-chokepoint + append-only revision discipline, extended to `member_consents` via the `member_revisions` ledger), ADR-015 (Drizzle, reused for the new adapters), ADR-006 (rule-of-two, satisfied for all 6 ports).
- Coordinates with (not duplicated here): the Menus (ADR-PIPE-012) and Integrations (ADR-PIPE-015) sibling remediation passes on the same permission-naming question — this ADR's Decision §6 explicitly cites and aligns with the flat `domain.verb` precedent those features' already-landed `permissions.ts` entries established, rather than re-deciding it independently.
- Flags for future governance action (not resolved here): ADR-030's own prose and `ADR-INDEX.md`'s ADR-030/029/036 summary lines still say `admin.members.*`/`admin.menus.manage`/`admin.integrations.manage` — a governance-ADR text correction reconciling that prose with the actual landed flat-`domain.verb` convention is owed, tracked here as an open item, not performed by this feature-level ADR.
- Owed before ACCEPTED: Red-Team dispatch against this ADR (not yet run, per Planning Preflight Evidence) and human/Coordinator approval, consistent with every other pipeline ADR's approval gate in this repo.
