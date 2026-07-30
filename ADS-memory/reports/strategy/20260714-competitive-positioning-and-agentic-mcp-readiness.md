# Competitive Positioning vs. WordPress/Strapi/Directus/Payload/Ghost, and Agentic/MCP Readiness

**Date:** 2026-07-14
**Author:** Claude Sonnet 5 (Review Mode, conversational analysis — not a debated/audited ADR)
**Context:** Asked right after ADR-041/043/044/045 (Storage, Collections, Categories & Tags, Backups/Recovery) were accepted, before starting spec/outline work on them.
**Status:** Informal strategic analysis, grounded in this session's read of ADR-001 through ADR-046. Not decided, not audited — a reference to revisit, not a commitment.

---

## 1. Where Tovu is a genuine improvement

Mostly architectural bets made from day one that the others didn't make, because they predate the agent era or predate the security lessons WordPress's plugin-trust model never learned:

- **Agent-native write path, not a bolted-on chatbot.** ADR-001 makes "agent-native" the founding decision. Every mutation — human or agent — goes through one write chokepoint (ADR-022 §4a), gets append-only revisioned, and is attributed to a composite actor identity that distinguishes a human from a delegated agent from the agent's delegator (ADR-021 §4/§6, live `grant ∩ delegator` intersection — revoke an agent's access mid-task and it loses it immediately, not at next token refresh). WordPress has revisions for posts only. Strapi/Directus/Payload have per-content-type audit trails at best. None of them have this as a platform-wide invariant with a real revert primitive (ADR-008 change-sets: propose→preview→apply→revert).

- **A plugin trust model with an actual security ceiling.** ADR-024's Tier-1/2/3 model (declarative-safe-now → sandboxed-code-later via Electron `utilityProcess` isolation → trusted-in-process-never-marketplace-listable) is the sandboxing WordPress never built — any WP plugin is full PHP execution today, still. Strapi/Directus/Payload extensions also generally run with full app trust. Plugins never get raw DDL, period (ADR-003/023) — schema is always core-mediated data, even for plugins with real tables.

- **A transactional primitive across an async plugin boundary (ADR-026).** Genuinely hard problem, took 12 audit rounds to close correctly: once you sandbox plugin execution (which the others don't), you lose "free" in-process transactions. Tovu built a named, schema-checked command surface compiling to a real transactional IR to get them back. No competitor needs this because no competitor isolates plugins in the first place.

- **Structural multi-tenancy and SSRF-safe egress as invariants, not opt-in.** `workspaceId` required everywhere (ADR-007), egress that can't construct an unguarded HTTP client (ADR-038), a canonical-origin registry closing host-header injection across every canonical-URL/redirect/magic-link consumer (ADR-040).

- **Never-brick as an audited commitment, not a slogan.** ADR-041's snapshot-before-migrate ceremony, human-confirmed restore, and honest "this disclosure is partial, here's exactly what it covers" discipline (fought hard for across 5+ audit rounds this session) is the direct architectural answer to "WordPress update broke my site." Nobody else formalizes this.

## 2. Where Tovu is genuinely behind

- **Ecosystem, full stop.** WordPress: ~60k plugins, ~30k themes, two decades of network effects. Strapi/Directus/Payload all have live plugin/integration marketplaces and managed cloud hosting (Strapi Cloud, Directus Cloud, Payload Cloud). Ghost has a curated professional theme marketplace. Tovu has zero third-party ecosystem, zero marketplace liquidity.

- **Production track record.** All five have been battle-tested against real traffic, real attacks, real scale for years. Tovu has zero production hours. Architectural rigor on paper isn't the same as surviving a decade of edge cases.

- **Category-specific strengths not yet matched:**
  - **Directus** wraps an *existing* database non-destructively (any Postgres/MySQL/SQL Server schema becomes a headless CMS without owning the schema) — a genuinely different model Tovu doesn't offer (and structurally can't, without abandoning its own write-chokepoint/revision model). Also ships **Flows** (mature low-code automation) and **Insights** (built-in BI dashboards) — nothing analogous exists yet.
  - **Payload** has a beloved TypeScript-first config-as-code DX (one config → typed local API + REST + GraphQL), live preview, mature drafts/versioning, and years of funded production engineering. Tovu's equivalent (Collections, ADR-043) was designed in this session, not battle-tested.
  - **Strapi** auto-generates a full admin panel + REST/GraphQL from content-type definitions with far more maturity, plus years of shipped enterprise features (SSO, RBAC, audit logs).
  - **Ghost** has a best-in-class minimal writing experience (Koenig editor) and a production-hardened native memberships/newsletter/Stripe-payments stack. Tovu's Members/Newsletter ADRs are fresh, and comped-subscription write paths aren't fully wired through the command gateway yet (surfaced by this session's own write-path inventory work).
  - **WordPress** wins on sheer familiarity (zero training cost for any marketer/dev who already knows it), Gutenberg's years of block-editor polish, SEO-plugin maturity (Yoast/RankMath), and dirt-cheap ubiquitous hosting.

- **Documentation, community, migration tooling.** All five have importers, tutorials, support communities, Stack Overflow history. Tovu has none of this yet — it hasn't shipped.

**Net honest read:** ahead on architecture that won't need to be re-fought later (agent-safety, plugin-safety, tenant-safety, migration-safety). Behind on everything that only comes from years of production use and ecosystem gravity — and that gap only closes with time and adoption, not more design work.

## 3. Agentic control plane / MCP readiness

Closer than it looks, for one specific reason: **ADR-014's capability manifest is already tool-catalog-shaped.** Registry entries carry `contexts`/`scope`/`auth`/`effect` axes, filtered server-side, layered across products — most of what an MCP tool manifest needs (name, schema, auth, side-effect class), just not yet speaking the MCP wire protocol. ADR-013's `tools.ts` + AG-UI daemon agent is a real bespoke agent-tool substrate playing the same role MCP would. ADR-021 already answers "what can this specific agent do right now" structurally, with live grant revocation. ADR-016's propose→review→accept/reject flow is exactly the human-in-the-loop shape MCP-UI/A2UI want. ADR-025's sandboxed cross-origin iframe + origin-checked `postMessage` RPC is architecturally the same containment MCP-UI's isolated-widget model assumes as a baseline — Tovu already has this discipline; most competitors don't.

**Three concrete gaps, in order of what actually blocks "agent can do anything a user can do":**

1. **Write-path coverage — the real gate, and already tracked, not new.** An action is only safely agent-callable once it's through the audited chokepoint (ADR-021/022 doctrine). Per ADR-041 item 5's own inventory (built and validated this session — `scripts/write-path-inventory.ts`), a large share of write paths — identity/grant-service, members, SEO overrides, media, forms, settings purge, newsletter, redirects, workspace creation — are still not wired through it. "Agent can do anything a user can do" is bounded by that same coverage number.
2. **Per-capability tool entries mostly don't exist yet for newer surfaces.** ADR-041 named explicit agent tools (`storage_get_health`, `storage_plan_migrate_forward`, etc.) with an explicit doctrine on which need a human confirm-token (destructive ones, always). ADR-043/044/045 (Collections, Categories/Tags, Recovery) define routes and permissions, not agent-tool signatures yet — normal for this stage, but real work.
3. **No MCP server exists.** The cheap part, precisely because the catalog underneath is already shaped correctly (ADR-014) — a translation layer, not a redesign, if kept clean.

**Recommendation (matches "don't build it now, stay ready"):** don't stand up MCP/WebMCP/A2UI/MCP-UI adapters yet. As each new admin surface gets spec'd (Collections/Categories&Tags/Storage/Recovery, and future ones), require two things as a standard part of that spec, before implementation: (a) full write-path/watermark coverage for every mutation it introduces, and (b) an explicit tool-manifest entry in ADR-014's shape for every action a human can take through it. Done consistently, the eventual MCP/A2UI exposure stays a thin adapter over an already-correct tool catalog.

## 4. "Should I copy specific competitor features" — verdicts

| Feature | Source | Verdict | Why |
|---|---|---|---|
| Non-destructive existing-DB wrapping | Directus | **Don't copy** | Different product category — incompatible with the write-chokepoint/revision/workspace-scoping model that's baked into Tovu's schema itself, not an addable feature |
| Flows (low-code automation) | Directus | **Copy the value, not now** | Fits naturally on top of the outbox (ADR-009) + agent tool surface (ADR-013/014), and could be agent-authored unlike Directus's. Building it speculatively contradicts ADR-023's own doctrine ("engine against real demand, not speculatively") — defer until Collections/taxonomy have real usage |
| Insights (BI dashboards) | Directus | **Don't build into core** | Scope creep against target user (small-to-mid operators) and the Simplicity Gate. Direct precedent: ADR-035 already split Analytics dashboards/export into a bundled Tier-3 plugin, not core |
| Config-as-code DX + live preview + mature drafts/versioning | Payload | **Worth matching — but it's DX quality on a decision already made (ADR-043), not a new bet** | Live preview specifically is a legitimate small feature gap worth adding to the editor |
| Auto-generated admin panel from content-type defs | Strapi | **Yes, worth doing, low risk** | ADR-022's content-types-as-data model is exactly the substrate auto-generation needs — natural, cheap win |
| Auto-generated GraphQL | Strapi | **Defer** | Bigger, more speculative infrastructure on top of the hand-written REST admin routes — don't build until something needs it |
| SSO / RBAC / audit logs | Strapi | **Already ahead on RBAC and audit (revisions) — just less battle-tested. Extend, don't copy.** SSO is a real gap only if the customer profile shifts toward enterprise, which contradicts the stated target user (small-to-mid operators) — skip unless that changes | |

**Pattern across all of these:** the ones worth taking are already implied by decisions already made (Flows via outbox/agent-tools, admin-gen via the content-type registry, DX quality on Collections) — not new bets. The ones to skip either fight the architecture (Directus's DB-wrapping) or fight Tovu's own anti-speculation/simplicity doctrine (Insights, GraphQL auto-gen, SSO).
