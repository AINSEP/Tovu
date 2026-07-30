# ADR-039: `routing` contract v0 — resolution pipeline + inverse `urlFor` + RouteTarget

- Status: ACCEPTED 2026-07-10 (from `/debate sweep-crosscutting-001`, 4-way consensus D2a/D2b; round-2 re-audit `sweep-crosscutting-002` folded 2026-07-10 — see Round-2 amendments; cleared `/audit-work` gate: 3-round audit under `TM-admin-sweep-001`, Codex + Gemini/agy + Fable internal verifier; round 1 FAIL → Round-3 fold → round 2 FAIL (1 converged blocker, unrelated to routing itself) → Round-4 fold → round 3 unanimous PASS, scores 9.1-10.0, zero blockers)
- Extends: ADR-009 (typed calls; this is core-only registration, NOT an open plugin hook in v1), ADR-022 (the write chokepoint hosts the D2b in-tx slot)
- Relates: ADR-029 Menus (consumes inverse `urlFor`/active-state), ADR-032 SEO (consumes `canonicalUrl`), ADR-033 Redirects (consumes the forward chain + the in-tx slug slot), ADR-007 (workspace scoping)
- Scope: v0 = only the four things the three sweep modules already depend on. NOT permalink-structure design (deferred; separable, as WP's own split proves).
- Source: `tovu-v2-design.md` §3.5 line 80 (`routing` Tier-2 backlog); debate consensus (see ADR-037 provenance). Answers ADR-033 Q-1/Q-2.

## Context
Three sweep modules build on a `routing` library that has no ADR: Redirects (033) is *blocked* on the resolver-chain contract (Q-1) and on a core-only in-transaction slug-change extension point (Q-2); Menus (029, `route` targets + href + active-state) and SEO (032, `canonicalUrl`) build on the *inverse* resolver. Blind, three agents produced three implicit, non-composing routing contracts. Pin the minimal shared shape now.

## Decision
### 1. Forward resolution pipeline (Redirects consumes)
Ordered, **core-owned** phases, registered by typed core registration at the composition root (an owned array, **not** an open ADR-009 hook in v1):
`normalize → pre_content (override rules) → content-resolve → post_content (404-fill) → 404`.
This ratifies Redirects §4's two-phase (`pre_content`/`post_content`) model. `pre_content` = override rules (retire a live URL); `post_content` = 404-fill (live content wins by default → old slugs reclaim transparently).

### 2. Inverse resolver (Menus + SEO consume) — the stable shape they need
```ts
urlFor(target: RouteTarget): { path: string; canonicalUrl: string } | null;
isActive(target: RouteTarget, currentPath: string): boolean;
```

### 3. `RouteTarget` vocabulary — promoted from Menus-local to routing-owned
Discriminated union: `entryRef | termRef | url | route` (the union Menus 029 §3 already sketched).

### 4. The D2b in-transaction slug-change capture slot — a single named slot, NOT a hook class
```ts
// content lib DECLARES the interface (knows nothing of redirects):
interface SlugChangeCapture {
  onSlugChange(u: {workspaceId; entryId; oldPath; newPath; actor; changeSetId; tx: CoreTx}): Promise<void>;
}
// redirects IMPLEMENTS it (insert rule + redirect_revision in the SAME tx + one-hop loop-collapse);
// composition root WIRES it. Absent binding = no-op (content works without redirects).
```
The content chokepoint calls it **inside** the rename transaction: `update entry + append revision + capture.onSlugChange(...) → COMMIT`. **Capture failure ABORTS the rename** (never-break-links is an invariant; a rename without its redirect must not commit). A `redirect.created` outbox event still fires post-commit. Two Tier-2 core libs sharing one transaction is ordinary core code (the ADR-026 no-tx-handle rule is about *plugins*). **Promotion trigger (named):** the day a second in-tx participant is real (e.g. a synchronous search-index update), generalize the slot into a small ordered core-only registry — a mechanical refactor, not a contract change.

## Gating (the acceptance rule this ADR sets)
- **Redirects (033) cannot be ACCEPTED before this ADR** (its own Q-1 says so; §4/§5 are load-bearing).
- **Menus (029) + SEO (032) CAN be ACCEPTED once this v0 shape is frozen** — they touch only `urlFor`/`isActive`/`canonicalUrl`, stable regardless of how the forward chain composes.

## Consequences
- Redirects' never-break guarantee is buildable (atomic capture, no 404 window).
- Menus/SEO stop each inventing path-matching; active-state and canonical URL derive from one contract.
- The `RouteTarget` union has one owner.

## Round-2 amendments (sweep-crosscutting-002, 2026-07-10)
1. **🔴 ADR-026 tx-handle collision — MUST-FIX (Fable).** §4's `SlugChangeCapture` slot hands out `tx: CoreTx`, but ADR-026 says *plugins never hold a tx handle*. Normative resolution: **the `SlugChangeCapture` implementation is core-resident (Tier-2) by definition** — it runs inside the content chokepoint transaction. If the Redirects section is ever packaged Tier-3, the in-tx capture (rule insert + `redirect_revision` + one-hop loop-collapse) stays in core `lib/routing/`; the plugin owns only rule-admin UI + read surfaces. **No slot implementation may be plugin-supplied.** Without this, ADR-039's gating of Redirects is meaningless.
2. **In-tx slot constraints (Codex+Gemini+Primary):** `SlugChangeCapture` MUST be idempotent by `changeSetId`, perform **no external I/O**, publish **no outbox message inside the transaction** (the `redirect.created` event fires post-commit), and obey a **strict global lock order: content row before redirect rows** (prevents cross-module deadlock).
3. **Fail-closed no-op (Codex).** Replace "Absent binding = no-op" with: absent binding is allowed only **before Redirects is installed or when slug-preservation is explicitly disabled for the workspace.** Once link-preservation is enabled, a slug-changing rename with no bound `SlugChangeCapture` MUST fail `LINK_PRESERVATION_UNAVAILABLE` — never silently skip the redirect.
4. **Workspace scope on the inverse resolver (Fable+Codex).** `urlFor`/`isActive` gain a context arg (every other frozen interface carries `workspaceId`; `canonicalUrl` is workspace-scoped): `urlFor(target: RouteTarget, ctx: RouteResolveContext): RouteUrl | null` and `isActive(target, currentPath, ctx)`, where `RouteResolveContext = { workspaceId: string; siteId?: string; locale?: string; originKey?: string }`.
5. **Forward-chain invariant (Codex):** `pre_content` may not convert a resolvable live-content path to 404; it may only return redirect/gone decisions with an audited rule.
6. **Consumes `core/origin` (ADR-040):** `canonicalUrl` is composed from the `OriginRegistryPort.canonicalOrigin(ctx)` verified origin + `path`, not from raw request host (see decisions doc §5 / ADR-040).

## Open
- Full permalink-structure/route-table design (deferred; not needed by any sweep module).
- Exact `canonicalUrl` normalization (trailing slash, query, home-route edge) — a v0.1 detail Menus' active-state also needs.
- `isActive` ancestor/prefix semantics for nested menu highlighting (is `/blog` active on `/blog/post`?) — pin in v0.1; and the `urlFor → null` caller render contract (menu item hides vs renders inert).

## Internal-verification fixes (TM-sweep-foundations-001, 2026-07-10)
- **Transactional-outbox wording (F6).** Round-2 amendment 2 is clarified: the slot performs no **network** I/O and **publishes/dispatches** no message inside the tx; the `redirect.created` outbox **row IS written in-tx** (transactional outbox, ADR-009) and the dispatcher **publishes it post-commit**. Insert-in-tx / publish-post-commit — never a post-commit insert (a crash between COMMIT and enqueue would lose the invalidation).
- **Registration canary (path-to-10).** Add a core-only-registration CI canary for `SlugChangeCapture` mirroring ADR-038's import-boundary canary, so "no plugin supplies the slot" is *enforced*, not merely incidental to there being no plugin-facing registration path today.

---

## Round-3 audit fold (TM-admin-sweep-001, 2026-07-10)
External audit (Fable F4) found Menus (ADR-029 §4) is already a real second in-transaction participant on the content chokepoint (binding-index write + displaced-menu revision), which this ADR's v0 single-slot model (`SlugChangeCapture` only) does not yet name. Folded:

1. **Menus acknowledged as a second in-tx participant.** This ADR's own §4 promotion trigger ("the day a second in-tx participant is real... generalize the slot into a small ordered core-only registry — a mechanical refactor") is **triggered now**, not hypothetically: ADR-029's binding-index maintenance is that second participant. Until the registry generalization lands, ADR-029's in-tx writes are intra-core composition bound by this ADR's §4 constraints (idempotent by `changeSetId`, no external I/O, no in-tx publish, strict lock ordering) but outside the named `SlugChangeCapture` slot — stated explicitly rather than left implicit.
