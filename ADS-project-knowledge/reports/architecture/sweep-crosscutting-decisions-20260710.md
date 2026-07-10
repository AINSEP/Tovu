# Sweep Cross-Cutting Decisions & Amendments — 2026-07-10

Records the decisions from `/debate sweep-crosscutting-001` (4-way consensus; see `.local-artifacts/swarm-debate/20260710T164534Z-sweep-crosscutting-consensus.md`) that must be **folded into the sweep ADRs (029–036) and ADR-023 before any of them can be ACCEPTED.** New foundation ADRs: **ADR-037** (core/mail), **ADR-038** (core/http+egress), **ADR-039** (routing v0), **ADR-040** (core/origin — greenlit round-2). Everything here is PROPOSED and owes the normal per-ADR audit.

> **Round-2 re-audit folded 2026-07-10** (`/debate sweep-crosscutting-002`, same 4 voices; consensus `.local-artifacts/swarm-debate/20260710T171717Z-sweep-crosscutting-002-consensus.md`). Outcome: **D1c LOCKED Members-owned 4–0** (Codex+Gemini flipped) — with the mandatory Tier-2-pin fold in §B. ADR-037/038/039 patched (see their Round-2 amendment sections). **Owner rulings (2026-07-10):** both Wave-1 blockers adopted — mint **ADR-040 `core/origin`** AND settle the **permission-namespace** convention (see §E). New items added: GDPR-erasure event, retry-executor owner (§E).

## A. ADR-023 amendment (grammar growth) — accept now
Split ADR-023's blended concerns; **accept the declaration grammar now** with Comments as the named demand plugin, **keep §12's third-party-`dataModule`-key gate intact**:
1. **Grammar (freeze now):** the declaration shape gains **composite indexes**, **self-referential FKs**, and **composite `(workspace_id, id)` FKs to core-published tables (e.g. `entries`)** — resolving Comments OQ-1. ADR-023 §2 already promised "declared FKs." **(Round-2, Fable):** declared FKs to core-published tables are **`ON DELETE RESTRICT` / `ON UPDATE RESTRICT` only — no cascade** may be declared, so the grammar cannot acquire delete behavior that contradicts ADR-022 append-only.
2. **First-party bundled execution** of `p_*` tables (Comments, Newsletter) in v1 = core-run declarations through the existing snapshot-before-DDL path — consistent with ADR-023's SPLIT (recoverability unconditional now; access-control advisory until Tier-2 isolation). **Not** a §12 violation.
3. **Third-party `dataModule` manifest key** stays rejected until the reconciliation/backfill engine ships (§12 unchanged).

## B. D1c resolution — consent record is Members-owned, purpose-keyed (Fable synthesis, coordinator-adopted; owner may override)
- New **`member_consents`** table in Members: **purpose-keyed** (`purpose='newsletter:{listId}'` for list-specificity + a global `marketing-email` suppression purpose), under the ADR-022 chokepoint + append-only revisions + ledgered purge (redact, never delete).
- **Newsletter owns the confirmation-email mechanics** (compose/send/resend/expiry, signed confirm link). The `pending→granted` and revocation transitions write into the Members record via a core-mediated typed call (`members.consent.request` / `members.consent.confirm`), capability-gated + attributed.
- Rationale: consent must outlive a disableable plugin; cross-feature suppression (Members lifecycle mail, future transactional plugins) needs a Members-level list, else you re-solicit a revoker (the actual GDPR/CAN-SPAM violation). Purpose-keying gives Codex/Gemini's list-specificity.
- **Round-2 outcome: RESOLVED 4–0** (Codex + Gemini flipped from Newsletter-owns-the-record to Members-owned). Owner ruled Members-owned. **Mandatory hardening folds (without these the ownership argument is circular — Fable):**
  - **⚠️ Tier-2 pin (the fold that actually saves the ruling):** `member_consents` + the `members.consent.*` handlers are **core-resident Tier-2, always-present regardless of how the Members admin section is packaged.** Disabling any Members UI plugin never takes the consent store or its write path offline. (If the store could ship inside a disableable Members plugin, Newsletter-owned would have been the sounder call.)
  - **Consent-evidence custody:** `members.consent.request/confirm` accept an evidence payload `{consentTextRef/hash, source, confirmTokenId, ip?, userAgent?}` persisted append-only in the consent revision — supplied by the mechanics owner (Newsletter), custodied by the record owner (Members).
  - **Purpose-scoped read path:** extend `AudienceDirectoryPort.getContacts(query:{consentPurpose?})` to filter on purpose-granted, OR add `members.consent.check(memberId, purpose)`. Today's global-only `emailDeliverable` would force Newsletter to cache consent locally — recreating the dual-ownership problem D1c kills.
  - **Port completeness:** add `revoke()` (doc names "revocation transitions" but only lists request/confirm). Newsletter **cannot assert `granted` directly** — its token resolves to a *pending* Members challenge; only Members records state transitions.
  - **Purpose namespace:** `ConsentPurpose = "marketing-email" | \`newsletter:${listId}\` | \`feature:${ns}:${id}\``; keys prefixed with the declaring module id (no cross-plugin collision).

## C. Per-module folds

### 023 → see §A.  026 → shape-freeze → ACCEPTED (Comments+Newsletter demand).  028 → finish round-2 re-audit → ACCEPTED (core-only subset).

### 029 Menus
- Consume ADR-039 `urlFor`/`isActive` for `route` targets + href/active-state; move the `RouteTarget` union to routing-owned (039 §3).
- Term targets: define an `entry_refs` term-target schema OR add `term_refs` (ADR-022 §5 is entry-to-entry only) — content-lib sign-off (audit finding A-029-1).
- Can be ACCEPTED once ADR-039 shape frozen (Wave 1).

### 030 Members
- Delete local `MailerPort`/`OutboundEmail`; import ADR-037.
- **Publish** `AudienceDirectoryPort` (`getContacts→{memberId,email,emailDeliverable}`); `subscriberId = memberId`; anonymous newsletter signup = a minimal `kind='member'` (Ghost free member).
- Add `member_consents` (§B). Add global `emailDeliverable`/suppression = status=active ∧ verified ∧ no global suppression.
- Ship the ADR-021 `kind='member'` extension (OQ-1).
- Fix `MagicLinkTokenRecord.memberId` vs upsert-on-first-use contradiction (audit A-030-2). Make the magic-link rate-limit/enumeration gate (OQ-8) a **hard** pre-enable precondition (audit B-030-1).

### 031 Comments
- Proceed once 023-grammar + 026 land (+ 025 for the widget/panel UI). Pin the anonymous-ingress `system` actor as a seeded principal ULID (audit A-031-2). Wave 2.

### 032 SEO
- **Restate ADR-028 as PROPOSED** (drop "ships now"); sequence settings behind it or ship interim in-code defaults; either register `seo.*` defs via a path a third-party plugin genuinely gets or drop the ABI-purity claim (audit B-032-1/2).
- Consume ADR-039 `canonicalUrl`. The `page.head` seam is owed to the theme-contract owner (audit advisory). Wave 1 (needs 028 + 039 shape).

### 033 Redirects
- Gate ACCEPTED on ADR-039 (routing chain + the D2b in-tx slot). Re-validate hook-supplied `location` against the open-redirect host allowlist on the **read** path (audit Fable finding — write-time-only today). Wave 2.

### 034 Newsletter
- Import ADR-037 (mail) + ADR-038 (http); consume Members' `AudienceDirectoryPort`; own confirmation mechanics only (§B). Name the unsubscribe-token keeper = `KeyringPort` derive-not-store (audit Fable). Depends on 023-grammar + 026. **Must NOT ship to real recipients before Members (consent owner) is live** (OPEN-1). Wave 2.

### 035 Analytics — the placement change (D4)
- **Split:** `analytics-ingest` (beacon endpoint + normalization + rate-limit + PII-death-at-`AnalyticsSinkPort` + salt custody) **stays Tier-2 core**; **storage + rollup + dashboards + goals + export become a bundled Tier-3 plugin** re-homed at the ADR-023 engine milestone.
- **Binding normative re-home clause** required (upgrade OQ-1 from "re-decide later" to a commitment); freeze `AnalyticsSinkPort` as the seam. Import ADR-038 for `ForwardingSink`. Wave 2 (least-blocking).
- **(Round-2, Primary):** the re-home clause must name the **exact trigger** (the ADR-023 third-party-`dataModule` reconciliation/backfill engine milestone), the **owner** (Analytics section owner), and state that until then the bundled storage/dashboards plugin runs **first-party / core-run** through the snapshot-before-DDL path (per §A.2). A dated promise with no named trigger is a soft blocker, not a decision.

### 036 Integrations
- Import `HttpClientPort` + `EgressPolicy` from ADR-038 (stop declaring them locally). Fix crypto-comment drift (§-ref, HKDF `workspaceId` in the info string, "fail-closed default = send" is actually fail-*open* — audit Fable). Root-key management remains the "audit-first" crux (owner call). Wave 1 (needs 038 homed).

## D. Acceptance waves
- **Wave 1** (need only frozen new shapes): **Menus, Integrations, SEO, Members.**
  - **(Round-2) SEO is additionally gated on ADR-028** reaching ACCEPTED (or on adopting its interim in-code-defaults path) — 028's round-2 re-audit is still pending, so SEO is Wave-1-*eligible*, not yet Wave-1-*ready*.
  - **(Round-2) All Wave-1 acceptance is gated on both blocker rulings (§E):** ADR-040 `core/origin` shape frozen, and the permission-namespace convention decided.
- **Wave 2** (need Wave-1 modules or amended foundations): **Redirects, Newsletter, Comments, Analytics** (last).

## E. Cross-cutting decisions (round-2 rulings) + not-yet-done

**Wave-1 blockers — BOTH adopted (owner ruling 2026-07-10):**
- **`core/origin` → ADR-040 (greenlit, minimal).** Origin-registry is promoted from advisory to a decision: a trusted canonical-origin source is load-bearing for **five consumers** — SEO `canonicalUrl`, Members magic-link URLs, Newsletter confirm/unsubscribe links, Redirects read-path host validation, EgressPolicy allowlists. Unowned → host-header injection / open-redirect / wrong canonical. Minimal Tier-2 `OriginRegistryPort {canonicalOrigin(ctx)→VerifiedOrigin; isAllowedRedirectTarget(ctx,url)}`. Gates Wave 1. See `ADR-040-core-origin-registry-v0.md`.
- **Permission-namespace convention — DECIDED (coordinator ruling, per owner "settle now").** Convention: **`admin.<section>.<action>`** for admin-panel/management capabilities (e.g. `admin.newsletter.send`, `admin.redirects.manage`) and **`feature.<name>.<action>`** for runtime/content-surface capabilities a theme or plugin exercises (e.g. `feature.comments.post`). Rationale: role grants are stored by permission string; renaming after Wave-1 is a breaking data migration (Fable), so the namespace is frozen before any Wave-1 ADR is ACCEPTED. **✅ Confirmed 2026-07-10:** ADR-021 stores grants as **flat permission strings** (not capability handles) — so this is genuinely load-bearing (a rename is a breaking migration), NOT advisory. The freeze stands.

**New cross-cutting items (round-2):**
- **GDPR erasure cascade:** mint a Tier-2 `principal.erasure.requested` outbox event; Tier-3 PII holders (Comments, Analytics send-logs, Newsletter) MUST implement an anonymize/purge handler. Decide now; Wave-2-adjacent.
- **Retry/pacing executor owner:** name it before ADR-037 freezes `retryable` — interim ruling: rides ADR-009 outbox redelivery in v1 (backoff semantics stated in ADR-037 Open); a dedicated scheduler primitive is a named promotion trigger.
- **Shared rate-limiter:** stays OPEN (seam reserved in ADR-038 amendment 5); Members satisfies its magic-link rate-limit precondition with a module-local limiter — does NOT gate Wave 1.

**Not-yet-done:**
- The 8 sweep ADR files (029–036) are NOT yet edited to reflect this doc (they live in `.local-artifacts/sweep-review/` + branches `sweep/*` + PRs #1–8). This doc is the authoritative delta; folding it into each ADR file is the next step.
- ADR-INDEX.md not yet updated with 029–040 (do when the sweep merges).
