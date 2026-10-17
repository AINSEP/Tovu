# Theme tiers and Liquid rendering isolation

Version: 0.1.0 · Date: 2026-10-17 · Status: DRAFT standalone slice for SPEC-004 OQ-07 / TRIAGE s4-32 (original TODO line 1356).

Parent reference: SPEC-004 v1.1.0 records `sha256:1f07ca7501f8e5f7b8f3c8b8a5816107cdcdd93e5fe99e82bf8a7758c280cd66`; quoted as recorded provenance, not revalidated approval of this new slice.

Inputs: accepted ADR-020 **including its July 7 amendments**, ADR-010/019, SPEC-004 validation/fallback rules and current loader/render/worker adapters. This is a bounded written specification, not a new engine decision or permission to enable Tier 3. Package promotion/version/hash and provider preflight remain required before implementation dispatch.

## Scope and existing owners

Theme authors get bounded presentation logic without arbitrary theme JS, and operators can see the trust level they are choosing. The manifest selects presentation capability; plugins remain the behavior plane. Generic lifecycle belongs to the existing `@jini-ai/sandbox/node-worker` implementation, consumed by Tovu’s worker-sandbox adapter; no second timer/worker settlement lifecycle is introduced. Liquid policy and theme render context remain Tovu-specific adapters until a separately approved extraction, not generic code added to Tovu during this task.

Observed flow: `features/theme/theme.ts` parses tier and loads/lints .liquid templates → public rendering resolves site data/components → `renderTemplatedTierBody` → liquid-sandbox → worker-sandbox → Jini renderInWorkerSandbox → liquid-worker → liquid-render (defensive allowlist + no-access fs + bounded Liquid engine) → validated reply → renderSite fallback on failure. The main renderer must not evaluate theme source directly.

Actors: theme author, installing operator, public reader and authenticated previewer. Non-goals: implement Tier-3 isolation, pool workers, replace LiquidJS, widen include/filter capabilities, rewrite themes into a new IR, or make worker_threads an OS security sandbox.

## Tier semantics and compatibility

| Manifest value | Scope of this slice | Required treatment |
|---|---|---|
| omitted / declarative | Tier 1 | Default declarative renderer; tokens/block trees/sanitized CSS, no theme execution. |
| templated | Tier 2 | LiquidJS templates only, with the layered guardrails below. |
| code | Reserved Tier 3 | Not made executable by this spec. Keep blocked pending its own origin/CSP/isolation decision and implementation gates. |
| static / handlebars | Existing additional formats | Current loader accepts both (`apps/website/src/features/theme/theme.ts:44`). Preserve their current routing and validation. This slice does not rename, remove, or claim to certify them as Liquid. Any revised tier taxonomy is a separate decision. |
| any other present value | Invalid | Fail validation with an actionable manifest error; do not silently downgrade. |

“Templated” describes limited server-side presentation logic; it does not confer plugin code privileges. Tier-1/2 interactivity uses registered components. ADR-020’s amendment supersedes its earlier same-origin Tier-3 wording: theme-authored client JS requires a separate cookie-less credential-isolated origin plus strict CSP with connect-src 'none'. A user clicking consent is not a replacement for that boundary.

## Requirements and acceptance criteria

| ID | Requirement | Observable acceptance |
|---|---|---|
| TL-01 | Tier selection is validated at load/publish; omitted tier defaults to declarative. | Legacy manifest loads as declarative; unknown tier is invalid; templated theme without required templates is invalid using the loader’s existing error mechanism. |
| TL-02 | LiquidJS remains behind the render adapter and meets ADR-020’s recorded minimum 10.26.0. | Resolved dependency/version is recorded in future release verification; dependency scanning is required by the accepted ADR. Current manifest range is ^10.27.1, not proof of a current vulnerability scan. No dependency change is made here. |
| TL-03 | Validate parsed AST tags/filters at discovery/publish **and again before worker render**. | Top-level, nested and liquid-shorthand disallowed tags fail. A banned word inside a comment/string does not fail by textual coincidence. Hot-edit after discovery is still rejected in the worker. No plugin may register arbitrary public-theme filters. |
| TL-04 | Template includes/render/layout/block and unapproved I/O facilities are denied by the existing allowlist and no-access Liquid fs adapter. | A real private file exists but include cannot read it; direct engine fs access is denied; an unknown filter/tag cannot fall through to permissive default behavior. Only the closed component render_block capability is available. |
| TL-05 | Worker input consists of explicitly selected structured-cloneable presentation data. | No repository handle, auth/session secret, credential environment value or callable function is reachable through the Liquid context. Missing optional public data has its defined empty result; invalid input yields failure, never raw object traversal. |
| TL-06 | Every render has a finite wall-clock budget and worker heap limits. | Runaway CPU is terminated; heap exhaustion rejects the isolated render; ordinary subsequent render succeeds and the parent continues serving. Defaults observed today: 5000ms; old generation 64MiB, young generation 16MiB, code range 16MiB. These are worker/V8 limits, **not** a total-process memory guarantee. Explicit policy overrides remain finite and validated by the existing owner. |
| TL-07 | Liquid engine work bounds apply in addition to worker limits. | Existing memoryLimit 5,000,000 / renderLimit 5000 / parseLimit 1,000,000 are retained in engine-native units. Oversized ranges/parsing terminate by the owning limit; the spec does not relabel these as OS-byte budgets. |
| TL-08 | Each render settles once and cleans up through the shared sandbox lifecycle. | Message→error, timeout→late message, crash/OOM and malformed reply each produce a single result, cancel the timer and request worker termination. No new per-engine timeout/cleanup implementation. |
| TL-09 | Rendering failures yield the existing minimal built-in body rather than a whole-site 500. | Syntax/allowlist failure, timeout, OOM, worker startup failure or invalid reply keeps the surrounding site usable; public HTML contains no stack or template secret. The existing diagnostic/log boundary records a correlated failure. |
| TL-10 | Liquid renders the same resolved component IR and rich-text content seam. | render_block of a core component, widget region and inline content renders through the existing registry. Resolved embed/media context reaches rich-text rendering; theme HTML cannot inject a new resolver/filter/module path. |
| TL-11 | Escape presentation values and use the single approved rich-text render seam. | A hostile title becomes text; sanitized content is rendered once through the owning rich-text filter/seam, without double escaping or granting safe-HTML status to arbitrary context strings. |
| TL-12 | Catalog/onboarding/consent communicate tier-specific risk. | Default site-building flow shows curated declarative choices. Developer intent exposes limited templating and the trusted-code warning; unavailable code execution remains unavailable. A Tier-2 label never promises an OS/process security boundary. Bundle plugin consent still follows ADR-019 independently. |

## Security interpretation

Worker threads constrain runaway work; they do not remove Node capabilities from arbitrary code. The no-JS template language, allowlist, approved renderer implementation, selected context and no-access fs adapter establish the theme-author capability restriction. Templates never become JavaScript module paths, eval/new Function inputs or arbitrary plugin filters. The worker process may have an environment for platform boot; this slice does not claim that worker creation erases that environment. Security review must verify that none of it enters the template context.

Filesystem/network access denied here refers to **template-authored capabilities**. Core-approved component/data resolution happens before rendering under existing ports and authorization. The worker’s approved component renderer is not permission to resolve arbitrary private data on demand. Tier-3 browser origin isolation is a separate unsatisfied gate.

## Verification and handoff

Existing test neighborhoods (inventoried, not executed): `features/theme/__tests__/liquid-allowlist.test.ts`; public site `__tests__/liquid-sandbox.test.ts`, `liquid-render.unit.test.ts`, `worker-sandbox.test.ts`, `sandbox-timeout-resolution.test.ts`, and render/route integration tests. Extend Jini sandbox tests for generic settlement/cleanup changes; Tovu tests cover template policy, selected context and render fallback. Required boundary proof includes real CPU/OOM termination, real private-file denial, failed-render recovery, actual render_block output and one content embed across the Liquid seam. A VRT baseline for render_block remains separate owed evidence; no passing result is invented here.

Constitution: I existing LiquidJS and sandbox reused; II/V certified tests before behavior changes and integration proof; III/IV no new lifecycle abstraction/pooling; VI positive capability limits and explicit trusted-code gate; VII slice package promotion/hash/preflight before handoff; VIII use existing diagnostics/events. No exception proposed. NFRs use the actual bounded defaults above; no unmeasured throughput claim is made.

Output: standalone tier/Liquid guardrail specification. Risks: current test files are not execution evidence; additional formats are not audited by this slice; Tier 3 remains deferred. Next assignee: Coordinator → Spec package promotion and independent security/design review, then TDD for any uncovered criteria. Existing ADR-020 is extended by specification, not superseded.
