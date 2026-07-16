# Feature Spec: Server Module Convention — First Slice (ADR-046 Phase 3)

## Header Metadata

| Field | Value |
|-------|-------|
| spec_id | SPEC-031 |
| version | 1.0.0 |
| status | APPROVED |
| feature_name | FEAT-031-server-module-convention |
| last_edited | 2026-07-16T00:00:00Z |
| owner | Leon Aburime |
| spec_agent | Spec Agent (in-session, direct — Claude Code host) |
| spec_mode | brownfield |

## Scope Note (disclosed — read this before assuming Phase 3 is "done")

ADR-046 itself calls Phase 3 the highest-risk phase (splitting `deps.ts`/`app.ts`, ~1,100 combined
lines wiring dozens of routes). A full big-bang migration in one pass is exactly the kind of
change the ADR's own fold-in item 8 warns about (a single mid-edit of `deps.ts` once broke `tsc`
repo-wide). This spec deliberately scopes to the MINIMUM that satisfies the ADR's own stated bar
for introducing the convention: "Its immediate consumers are the existing core/content module plus
at least two feature modules, satisfying the rule-of-two for this application-level convention."

This slice ships exactly 3 modules (`core`, `forms`, `integrations`) plus the `ServerModuleHandle`
convention and a `bootstrap.ts` extraction, and moves ONE concrete cross-feature integration point
the ADR explicitly names by name: "Move the Forms-to-webhook fan-out from `createApp()` into
Integrations' event subscriber... The Forms module emits its domain event only."

**What did NOT move in this slice (explicit, not an oversight):**
- The ~60 remaining route registrations in `app.ts` (posts, media, members, settings, taxonomy,
  webhooks admin/public routes, etc.) — still inline in `createApp()`.
- `requireAdminSession`'s `app.use("/api/admin", ...)` mounting — order-sensitive relative to
  every other admin registrar; a `core.ts` concern per the ADR's sketch, deferred as its own
  separately-verifiable step.
- `deps.ts`'s ~400 lines of adapter construction — untouched; `ServerModuleHandle` factories in
  this slice receive already-built ports (`Pick`-shaped narrow deps), they do not construct
  adapters themselves.
- `content.ts`/`media.ts` modules from the ADR's own illustrative sketch — not built this slice.
- Route-class precedence validation (`fixed-public`/`parameterized-public`/`catch-all`, enforced
  structurally rather than by the `/:slug`-last comment) — a distinct, larger Phase 3 item, not
  bundled here.

Each of these is real, disclosed follow-up work — pull them incrementally, the same demand-paged
philosophy ADR-046's own fold-in item 4 established for Phase 1.

## Problem Statement

**Current state (before this slice):** the Forms-to-webhook fan-out subscriber lived inline in
`app.ts`'s `createApp()`, a ~45-line block mixing Forms' own C-009 notify-subscriber registration
with Integrations' webhook-delivery-enqueue logic in the same undifferentiated function body — the
ADR's own words: "the composition root may select its concrete adapters but does not contain its
business dispatch," which this block violated for the fan-out half specifically. There was also no
reusable convention for a module to package "its routes + its subscriptions + its readiness
participant" together; each concern was wired ad hoc at its own point in `createApp()`.

**Desired state:** `ServerModuleHandle` gives every future module the same 3-part shape
(`registerRoutes?`, `start?`, `bootModule?`). `modules/integrations.ts` owns the fan-out
subscription; `modules/forms.ts` owns only its own notify subscriber; `modules/core.ts` owns
health/readyz route registration. `bootstrap.ts` holds the Phase-2 boot-module composition logic
that was previously inlined in the untested `index.ts`, making it unit-testable.

## Requirements

- REQ-01: `src/server/modules/types.ts` shall define `ServerModuleHandle` (`name`,
  `registerRoutes?`, `start?`, `bootModule?`), reusing `BootModule` from `boot-lifecycle.ts`
  (ADR-046 Phase 2) for the readiness slot rather than inventing a parallel status shape.
- REQ-02: `src/server/modules/core.ts` shall export `createCoreModule()` registering `/health`,
  `/healthz`, `/readyz` — byte-identical behavior to the pre-slice inline calls.
- REQ-03: `src/server/modules/forms.ts` shall export `createFormsModule(deps)` owning ONLY the
  C-009 notify-subscriber start-up; it must not reference any webhook/integrations type.
- REQ-04: `src/server/modules/integrations.ts` shall export `createIntegrationsModule(deps)`
  owning the Forms-to-webhook fan-out subscription, moved verbatim (same `enqueueDelivery` call
  shape) from `app.ts`.
- REQ-05: `src/server/routes/ops/health.ts`'s 3 registrars shall be retyped from `RouteRegistrar`
  (2-arg, requires `RouteDeps`) to a new `NoDepsRouteRegistrar` (1-arg) — they never used the
  `deps` parameter; the old type was a latent inaccuracy this slice corrects as a side effect of
  giving `modules/core.ts` a real, non-hacky call site.
- REQ-06: `src/server/bootstrap.ts` shall hold `buildBootModules()` (the ADR-046 Phase 2 boot-list
  construction previously inlined in `index.ts`), taking `NewsletterRouteDeps` and
  `{ useMemory, defaultContentDbPath }` — identical logic, relocated for testability.
- REQ-07: `app.ts`'s `createApp()` shall call the 3 new module factories instead of the 3 inline
  blocks they replace; `index.ts` shall call `buildBootModules` from `bootstrap.ts` instead of
  defining it inline.
- REQ-08: Behavior must be byte-identical from any external caller's perspective — same routes,
  same responses, same webhook-fanout side effect on the same event.

## Acceptance Criteria

- AC-01 (REQ-02) [P1]: `createCoreModule().registerRoutes(app)` against a bare `express()` app
  serves `/health`, `/healthz`, `/readyz` with the same status codes as the pre-slice route tests
  already covered (SPEC-030's `readiness-routes.test.ts`, unmodified, still passes against the
  real `createApp()` composition).
- AC-02 (REQ-04) [P1]: publishing a `form.submission.received` event through
  `createIntegrationsModule(deps).start()`'s subscription produces exactly one claimable
  `webhook_deliveries` row for a matching active subscription.
- AC-03 (REQ-03) [P2]: `createFormsModule(deps).start()` registers without throwing and without
  importing anything from `integrations`.
- AC-04 (REQ-07/08) [P1]: the full existing test suite (1587+ tests, including every pre-existing
  Forms/webhook/health/readyz test) passes unchanged after the extraction — this is a refactor,
  not a behavior change.
- AC-05 (REQ-07) [P1]: a live smoke test (`npx tsx src/index.ts`, real SQLite) still boots, reports
  `/readyz` → `{"ready":true}`, and the module-status admin route lists the same 4 boot modules as
  before this slice — proving `bootstrap.ts`'s relocation didn't change runtime behavior.

## Non-Goals

See the Scope Note's "What did NOT move" list — restated here as the formal non-goals: the
remaining `app.ts` route registrations, `requireAdminSession` relocation, any `deps.ts` change,
`content.ts`/`media.ts` modules, and route-class precedence validation.

## Constitution Compliance

| Article | Status | Notes |
|---------|--------|-------|
| I — Library-First | COMPLIES | No new dependency. |
| II — Test-First | COMPLIES | New unit suite (`server-modules.unit.test.ts`) plus the full existing suite re-run as the regression gate (AC-04). |
| III — Simplicity Gate | COMPLIES | 3 modules, not a premature full migration; `ServerModuleHandle`'s 3 optional fields are the minimum shape covering all 3 concrete cases (routes-only, start-only) without forcing every module through the same signature. |
| IV — Anti-Abstraction Gate | COMPLIES | `ServerModuleHandle` has 3 real consumers at introduction — the ADR's own explicit rule-of-two-plus-one bar for this convention. |
| V — Integration-First Testing | COMPLIES | AC-02 exercises the real `InMemoryEventBus`/`InMemoryWebhookSubscriptionRepo`/`InMemoryWebhookDeliveryRepo` chain, not a mock; AC-05 is a real-process smoke test. |
| VI — Security-by-Default | N/A | No authz surface change — same routes, same gates, unmoved. |
| VII — Spec Integrity | COMPLIES | This spec is the reference for the implementation it accompanies, including its own explicit scope limits. |
| VIII — Observability | N/A | No new observable signal beyond what SPEC-030 already added. |

## Implementation Record

- `src/server/modules/types.ts`: `ServerModuleHandle`.
- `src/server/modules/core.ts`: `createCoreModule()`.
- `src/server/modules/forms.ts`: `createFormsModule()`.
- `src/server/modules/integrations.ts`: `createIntegrationsModule()`.
- `src/server/bootstrap.ts`: `buildBootModules()` (relocated from `index.ts`).
- `src/server/routes/ops/health.ts`: `NoDepsRouteRegistrar` type (was `RouteRegistrar`).
- `src/server/app.ts`: 3 inline blocks replaced by the 3 module factory calls; 3 now-dead imports
  removed (`registerFormNotifySubscriber`, `enqueueDelivery`, `InMemoryDeliveryEnvelopeStore`).
- `src/index.ts`: `buildBootModules` import replaces its own inline definition.
- Tests: `src/server/__tests__/unit/server-modules.unit.test.ts` (4 cases).
- Full suite: 1591/1591 (1587 passing, same 4 pre-existing, disclosed, unrelated failures).
  Typecheck clean. Live smoke test against a real SQLite server confirmed byte-identical
  `/readyz` and module-status output before and after this slice.

## Handoff Contract

- **Inputs used:** direct inspection of the exact block being relocated (`app.ts`'s Forms/webhook
  fan-out comment block and code), `RegisterFormNotifySubscriberDeps`/`EnqueueDeliveryDeps` types,
  the existing `repo.subscription.contract.test.ts` fixture shape (reused for this slice's own
  test rather than hand-guessing the `WebhookSubscriptionRecord` shape).
- **Output summary:** the `ServerModuleHandle` convention exists with 3 real consumers, satisfying
  the ADR's own bar for introducing it. The one concrete cross-feature-ownership fix the ADR named
  by name (Forms-to-webhook fan-out) is done. Everything else in `app.ts`/`deps.ts` is
  unchanged and explicitly still owed.
- **Risks:** none beyond the disclosed scope limits — this was verified as a pure refactor (full
  suite unchanged, live smoke test unchanged).
- **Suggested next assignee:** Coordinator or a future session, for the next Phase 3 pull: either
  `requireAdminSession` relocation into `core.ts`, or a `media.ts`/`content.ts` module — whichever
  is next touched for an unrelated reason (demand-paged, per ADR-046 fold-in item 4's philosophy).
  Phase 4 (`dependency-cruiser` CI gate) remains genuinely blocked — no CI pipeline exists in this
  repo — and should be recorded as a decision note, not attempted.
