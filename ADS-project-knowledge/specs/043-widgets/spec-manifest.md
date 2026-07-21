# Spec Manifest: widgets

## Header Metadata

| Field | Value |
|-------|-------|
| spec_id | SPEC-043 |
| feature_name | FEAT-043-widgets |
| version | 1.0.0 |
| last_edited | 2026-07-21T00:00:00Z |
| spec_naming | standard |
| spec_root | ADS-project-knowledge/specs/043-widgets |
| spec_entrypoint | feature.spec.md |
| spec_readiness_artifact | feature.spec.md (Implementation Readiness Gate section) |

**Purpose:** Package index for the widgets spec. **Disclosed deviation from the full Speckit package
convention** (see below) — this spec was authored directly by the Coordinator (Claude Sonnet 5) in the
same session as the ADR-047 debate, not dispatched to a separate Spec Agent persona run with its own
validator pass. The content is held to the same rigor (every REQ has an AC, every AC is Given/When/Then
with a priority, Constitution Compliance is complete) but the formal provider-local validator has not
been run and no canonical content_hash has been computed. Flagging this explicitly rather than
fabricating a hash or silently skipping the disclosure.

---

## Package Applicability Matrix

| Logical File | Status (`PRESENT\|OMITTED`) | Actual Filename | Why Present / Why Omitted |
|---|---|---|---|
| `feature.spec.md` | PRESENT | `feature.spec.md` | Canonical primary requirements spec — complete, self-contained |
| `api.spec.md` | OMITTED | `—` | Route-shaped detail (widget CRUD routes, `widget_area` mutation routes, the AI tool surface) is folded into `feature.spec.md`'s Requirements section (REQ-01–REQ-45) rather than split into a separate contract file — a scope call made to keep the package to one authoritative file given the volume already produced this session (ADR + 2-round debate + this spec). Should be split out if/when the Software Architect stage needs a dedicated route-contract file to work from; the requirements are unambiguous enough to derive one mechanically. |
| `state.spec.md` | OMITTED | `—` | New durable state (`widget` entries, `widget_area` entries, `widget_region_bindings`, `entry_refs`) is fully described in `feature.spec.md`'s Requirements and the ADR-047 Debate Fold-In section's schema sketches (also present in the debate's saved peer artifacts, `reports/swarm-consensus/offloads/20260721-widgets-adr047/`) — not duplicated into a separate file. |
| `orchestrator.spec.md` | OMITTED | `—` | No distinct frontend orchestrator/coordinator layer is warranted, matching Forms'/SEO's/Redirects' precedent — the admin widget UI will call service functions directly, no Redux-style store exists in this codebase's admin app. |
| `ui.spec.md` | PRESENT | `ui.spec.md` | Produced 2026-07-21 by a dispatched sub-agent per explicit owner direction, ahead of the routes/UI/AI-tools implementation slice. Covers the widget library/list screen, the per-type widget instance editor, the region/placement manager, the REQ-33 reuse-vs-duplicate dialog, the REQ-34 where-used disclosure, and the TipTap `widgetEmbed` authoring surface — every component grounded in an existing admin-app convention (Menus.tsx/MenuEditor.tsx/Collections.tsx/Seo.tsx), not an invented visual language. Same disclosed-deviation posture as the rest of this package: authored directly, not through a separate Spec Agent persona run with its own validator pass. |
| `errors.spec.md` | OMITTED | `—` | Typed error/failure shapes are specified inline against each REQ (e.g. REQ-06's version conflict, REQ-27's resolver failure taxonomy) rather than centralized into a separate error-code table — a scope call, not an oversight; the failure taxonomy in REQ-27 (`unknown-type`/`invalid-config`/`missing-dependency`/`timeout`/`resolver-error`) is the de facto error-code list. |
| `behavior.spec.md` | OMITTED | `—` | Default values, clamps, and non-obvious rules (reuse-vs-duplicate default, cost clamps, embed-count limit) are stated inline in Requirements/Invariants rather than centralized. |
| `traceability.spec.md` | OMITTED | `—` | Not yet seeded — REQ/AC/INV/EC numbering in `feature.spec.md` is dense and cross-referenced enough to derive a traceability matrix mechanically at TDD time; producing it now would duplicate rather than add information given the spec's current density. |
| `spec-manifest.md` | PRESENT | `spec-manifest.md` | This file. |
| `spec-dod.md` | OMITTED | `—` | `feature.spec.md`'s own Implementation Readiness Gate section serves this role for v1, with its one disclosed partial item (this manifest) instead of a separate sign-off file. |

---

## Stage Read Set

| Stage | Must Read |
|---|---|
| `architect` (implementation outline) | `feature.spec.md` (primary contract file), `ui.spec.md` (UI contract, PRESENT as of 2026-07-21 — required reading for the routes/UI/AI-tools implementation-outline addendum), `ADR-047-widgets-region-and-embed-placement.md` (especially the Debate Fold-In section), `reports/swarm-consensus/runs/20260721-widgets-adr047-consensus-report.md`, `reports/swarm-consensus/offloads/20260721-widgets-adr047/` (all four peers' Round 2 artifacts — schema sketches, resolver interfaces, diff-shaped ADR language, spec-level acceptance criteria are directly reusable), `src/navigation/{types,ports,resolver,reconcile}.ts`, `src/forms/{submit-service,rate-limit-profile,notify-subscriber,manifest}.ts`, `src/infra/db/schema.ts` |
| `tdd` | `feature.spec.md` in full (Requirements/Acceptance Criteria/Invariants/Edge Cases), `ui.spec.md` in full (component/event contracts drive UI-level test seams), the implementation outline once produced, the same source touchpoints listed above |
| `programmer` | `feature.spec.md`, `ui.spec.md`, the implementation outline, certified tests, `ADR-047-widgets-region-and-embed-placement.md`, the same source touchpoints listed above |

---

## Brownfield / Reverse-Spec References

This feature is `greenfield` for its own surface, but consumes and structurally mirrors existing
brownfield code — recorded here per the Spec Agent's read-before-write instructions.

| Evidence / Touchpoint | Type | Why It Matters |
|---|---|---|
| `src/navigation/types.ts`, `reconcile.ts` | source touchpoint | The exact structural pattern (source-of-truth-on-the-entry + derived/reconciled binding index) REQ-11/12 deliberately mirror — inspected directly during the ADR-047 debate, not assumed from ADR-029's text alone. |
| `src/navigation/resolver.ts` (line ~21) | source touchpoint | Contains the code comment confirming `entry_refs` "has no compatible ADR-022 schema yet" — the load-bearing evidence behind REQ-29–32 being a named build item, not an assumed-available dependency. |
| `src/forms/submit-service.ts`, `rate-limit-profile.ts`, `notify-subscriber.ts`, `manifest.ts` | source touchpoint | The complete, already-wired pipeline REQ-36–39's Contact Form adapter delegates to unmodified; `manifest.ts` is also the structural precedent for widget-type registration-as-data (Amendment 3). |
| `src/mail/ports.ts`, `purpose-scoped-mailer.ts` | source touchpoint | Confirms `MailerPort` (ADR-037) is implemented and already consumed by `src/forms/` — the fact that corrected the ADR-047 debate's Round 1 assumption that Contact Form needed new mail infrastructure. |
| `src/infra/db/schema.ts` | source touchpoint | Confirms `entries`/`entry_revisions`/`change_sets`/`outbox_events` exist and are the substrate widget instances and `widget_area` entries build on; confirms no `entry_refs` table exists yet. |
| `ADR-047-widgets-region-and-embed-placement.md` (full file, especially Debate Fold-In) | governing ADR | The direct source of every requirement in `feature.spec.md` — each REQ cites its originating section. |
| `ADR-022-content-model-entries-registry-expression-indexes.md` §5 | governing ADR | Defines the `ref` field-type vocabulary REQ-31 reuses for widget config reference extraction. |
| `ADR-029-menus-navigation.md` | governing ADR | The nearest sibling ADR this entire feature generalizes; §4/§5/§6/§7/§8 are each individually cited across `feature.spec.md`'s Requirements. |
| `ADR-024-plugin-execution-and-trust-model.md` §5 | governing ADR | Defines the total/bounded-cost rule REQ-25/REQ-07 (registry data safety) both satisfy. |
| `reports/swarm-consensus/runs/20260721-widgets-adr047-consensus-report.md` | debate record | Full trace of how every requirement in this spec was arrived at — Decision Ledger doubles as a requirement-to-rationale map. |

---

## Validation Notes

- Validator last run: **not run** — this package was authored directly by the Coordinator, not
  dispatched through the formal Spec Agent + provider-local validator flow. Disclosed, not hidden.
- Validator result: N/A
- Validator manual waiver: N/A (no waiver sought — validator simply hasn't been invoked)
- Canonical hash: not computed
- Notes: `feature.spec.md`'s own Implementation Readiness Gate is self-certified against the same
  checklist the validator would check, with one item (full 9-file package) explicitly marked partial
  rather than silently passed. If strict Speckit compliance is required before this proceeds further
  (e.g. before `/audit-work`), run the formal Spec Agent validator pass on this package first.
