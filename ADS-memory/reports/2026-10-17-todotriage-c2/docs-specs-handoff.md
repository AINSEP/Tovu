# Documentation and specification handoff

Software Architect(Direct): selected **Software Architect + Spec** for ownership/ADR decisions and testable specifications; both canonical personas were read. The Docs profile was also consulted, but its role excludes specification authorship, so Spec is the writing persona used for these deliverables.

Date: 2026-10-17. Source: the assigned TRIAGE rows and original TODO text. The live TODO has unrelated concurrent edits and shifted line numbers; item numbers below retain the dispatch’s identifiers. No TODO edits were made.

**DONE below means the requested written deliverable exists.** Specs are explicit standalone DRAFT slices; the Accessibility ADR is PROPOSED. They are not accepted strict packages, implementation authorization, conformance certifications or cleared review gates. No fabricated approval or hash was added. Active parent specifications were not rewritten.

## Per-item result

- ITEM 1095: **NOT DONE** — combined adversarial review/probe matrix written, but independent Red-Team completion is not asserted. SPEC-006’s canonical hash no longer matches the July recorded hash; later username requirements expanded the package. [Evidence and next routing](identity-amendment-review.md).
- ITEM 1107: **NOT DONE** — located the existing July CLI inspection and security reports, correcting “never run”; both recorded blocking results. Present source has changed, so neither a fresh PASS nor unchanged July defects can be inferred. [Written review reconciliation](feature-review-gates.md).
- ITEM 1115: **NOT DONE** — all three ledgers now explicitly record historical failed or unavailable feature-specific results. Current accepted inspection/security outcomes are still missing. [Per-feature evidence](feature-review-gates.md).
- ITEM 1143: **NOT DONE** — ADR-047’s external audit is still FAIL; the required independent rerun is prohibited by this dispatch’s no-network/review-command restrictions. No acceptance status changed. [Audit gate evidence](feature-review-gates.md).
- ITEM 1147: **DONE** — one cross-surface specification covers doc Posts/Pages, HTML markers, post-content IR, template/preview/public rendering, media sizing, visibility, failures, concurrency, references and test mapping. [Specification](../../specs/043-widgets/cross-surface-embeds.spec.md).
- ITEM 1136: **DONE** — unified Post-editor Embed control is folded into that same specification, including Media/Form/Menu/Gallery/Widget shortcuts, cancellation/insertion/focus and error contracts. [EMB-UI criteria](../../specs/043-widgets/cross-surface-embeds.spec.md).
- ITEM 1288: **DONE** — proposed Accessibility ADR written and indexed, with shared Jini/Tovu ownership, observable baseline, regression evidence and legacy rollout. No claim of current conformance. [ADR-068](../architecture/ADR-068-accessibility-baseline.md).
- ITEM 1356 (theme bundles, s4-31): **DONE** — standalone manifest/dependency/consent/install/recovery/activation specification written against ADR-019; independent plugin trust and existing lifecycle owners retained. [Specification](../../specs/004-declarative-theme-system/theme-bundles.spec.md).
- ITEM 1356 (tiers/Liquid isolation, s4-32): **DONE** — standalone spec records real tier compatibility, AST validation, worker/engine bounds, filesystem denial, shared sandbox lifecycle, render fallback and Tier-3 origin restriction. [Specification](../../specs/004-declarative-theme-system/theme-tiers-liquid-isolation.spec.md).
- ITEM 1610: **NOT DONE** — draft descriptor specification and all 47 current explicit panel registrations inventoried; final registry/plugin contribution admission needs the named loader/identity owner decision. A host render descriptor is not a safe plugin-loading protocol. [Inventory and decision](../../specs/admin-surfaces.spec.md).
- ITEM 1621: **DONE** — all five conditional Medusa TODO branches reviewed against the existing corpus and task. No deeper research is triggered without a narrower requirement; limitations remain explicit. [Review](medusa-conditional-review.md).

CHANGED FILES:

New:

- `ADS-memory/specs/043-widgets/cross-surface-embeds.spec.md`
- `ADS-memory/specs/004-declarative-theme-system/theme-bundles.spec.md`
- `ADS-memory/specs/004-declarative-theme-system/theme-tiers-liquid-isolation.spec.md`
- `ADS-memory/specs/admin-surfaces.spec.md`
- `ADS-memory/reports/architecture/ADR-068-accessibility-baseline.md`
- `ADS-memory/reports/2026-10-17-todotriage-c2/identity-amendment-review.md`
- `ADS-memory/reports/2026-10-17-todotriage-c2/feature-review-gates.md`
- `ADS-memory/reports/2026-10-17-todotriage-c2/medusa-conditional-review.md`
- `ADS-memory/reports/2026-10-17-todotriage-c2/docs-specs-handoff.md`

Updated, preserving prior rows and approval history:

- `ADS-memory/reports/architecture/ADR-INDEX.md` — proposed ADR-068 row only.
- `ADS-memory/reports/pipeline/003-site-install-dir/pipeline-state.md` — appended evidence reconciliation.
- `ADS-memory/reports/pipeline/005-plugin-system/pipeline-state.md` — appended explicit result gaps.
- `ADS-memory/reports/pipeline/006-identity-and-authorization/pipeline-state.md` — appended amendment hash blocker and result gaps.

NOT DONE:

- Identity package identity/version reconciliation, independent amendment Red-Team clearance and owner checkpoints.
- Current feature-specific inspection/security acceptance for 003/005/006, and ADR-047’s independent acceptance audit.
- Final plugin contribution admission/identity ownership for surface descriptors and the prerequisite full competitor synthesis.
- Approval, strict-package promotion, canonical hash/read-set registration and provider preflight for the newly drafted slices. These are next-stage gates, not represented as completed by writing a standalone document.
- Implementation, new behavior tests, test execution, typechecks, builds, dev servers, benchmarks, network commands, commits and pushes were outside this dispatch. No application code changed, so no behavior tests were added. The one read-only spec-document validator invocation and its nonzero result are recorded in the identity review.

## Reuse, checks and handoff

MCP graph tools were unavailable in the exposed tool catalog; discovery used local `rg` and direct file reads inside Tovu/Jini. Existing widgets/marker/resolver behavior belongs to Jini CMS, generic worker lifecycle to Jini sandbox, and generic panel manifests/routing/UI behavior to Jini admin/UI. The proposals call or extend these owners and preserve Tovu-specific adapters; no duplicate implementation or dependency was introduced.

Documentation checks: local Markdown link targets and edited-file whitespace checked without running application checks. Tests cited by the specs were inventoried/read, not executed. The full tree is concurrently dirty; unrelated source/config changes were left alone, including all forbidden Fly/Shopify paths.

Suggested next assignee: Coordinator to resolve the five blocked items, review the drafted deliverables, then perform package promotion/review before any downstream implementation dispatch. Primary risks are stale identity package provenance, unaccepted historical gates and unsafe conflation of panel metadata with executable plugin admission.
