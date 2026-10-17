# Platform foundations — handoff and progress ledger

Software Architect + Programmer: platform ownership and minimal TypeScript adapters.
Date: 2026-10-17. Inputs: PEER_DISPATCH, triage rows s4-56 through s4-60, and
the original `development/todos.md` lines 1495, 1502, 1512, 1514 and 1518.

ITEM 1495: DONE — completed HTTP requests emit `http.request.completed` through
Jini's existing Logger, with requestId, method, routePattern and statusCode.
The id is the existing `res.locals.requestId`/response-header/tracker id. Logger
binding is injectable; normal composition uses Jini's console adapter. No raw
path, query, body or headers enter this log. This is request-completion logging;
existing unrelated console messages are not rewritten or given ambient context.

ITEM 1502: NOT DONE — the generic settings-backed evaluator belongs in Jini,
which is outside this session's writable roots. Existing ownership is usable:
`../Jini/packages/core/src/settings/ensure-definitions.ts:108` registers boolean
definitions; `settings.ts:319` resolves effective scoped values. Searching both
products found no shared rollout evaluator. A new Tovu implementation would
violate the dispatch's Jini-first rule. Coordinator handoff: implement the
smallest boolean evaluator there over these owners, default off, workspace
scoped, with no extra store/value cache; name its first Tovu rollout consumer.

ITEM 1512: NOT DONE — durable handler completion needs a Coordinator decision
on the transaction/effect contract and persisted format, as well as Jini write
access. `../Jini/packages/infra/src/events/outbox/worker.ts:140` promises at-least-once
delivery; lines 181–182 require host idempotency even with fenced delivery.
`apps/website/src/contracts/core/events/memory-bus.ts:29` invokes subscribers
sequentially without durable per-handler completion. If an earlier effect
succeeds and a later subscriber throws, a retry replays the earlier effect.

Proposed strategy for that decision: keep naturally idempotent effects (sitemap
invalidation) unchanged; identify other effects by stable workspace, handler
version, event and effect/recipient identity. For local transactional effects,
claim/perform/complete must share the effect's transaction or use an established
unique business key. For external effects, pass a stable key to the existing
provider/durable effect outbox; a marker written after the call cannot eliminate
the crash window. Persisted per-handler state must isolate sibling handlers,
support concurrent deliveries and survive restart, without marking a failed
effect complete. A process-local Set or another operation lock does not solve it.
Do not replace existing Forms notification keys (`../Jini/packages/cms/src/forms/notify-subscriber.ts:72`)
with event-only deduplication: recipients are distinct effects, and current send
failures are intentionally logged/swallowed rather than retried by the bus.
Required tests for the approved slice: duplicate delivery, restart, concurrent
claim, partial subscriber/recipient failure and crash between effect and marker.
No universal wrapper or new table was added without those ownership decisions.

ITEM 1514: NOT DONE — documented the existing Jini taxonomy/envelope and remaining
route families in `apps/website/src/server/error-mapping/INFO.md`. The selected
pilot is the single-route analytics admin family. Its existing client parser
(`apps/admin/src/lib/api.ts:2460`, especially line 2471) stringifies `body.error`
and only reads top-level `body.code`; immediate conversion would display
`[object Object]` and lose the code. Coordinator handoff: assign a browser-safe
canonical/legacy decoder to a Jini owner, adopt through the existing shared
client parser, then convert analytics and its two existing test surfaces.
No route was knowingly migrated against an incompatible client.

ITEM 1518: DONE — `safe-mode-rollback-policy.md` drafts entry/exit behavior,
early boot selection, permitted recovery surfaces, optional-effect suppression,
last-known-good compatibility, restore scope/loss disclosure, existing guarded
restore ceremony, required restart and future acceptance checks. It explicitly
distinguishes proposed safe mode from existing recovery blocking.

## Reuse decisions

- Reuse: request-correlated logs; searched Tovu server/contracts and Jini
  core/http-kit/diagnostics for Logger, requestId and RequestContext; inspected
  core/primitives/logger.ts, request-id.ts and observability-middleware.ts;
  used existing Logger metadata and existing Express request context. Host
  lifecycle wiring stays in the current Tovu middleware; no generic logger added.
- Reuse: flags; searched Tovu settings and Jini packages for feature flags and
  rollout; inspected ensureSettingDefinitions/getEffective/set contracts;
  selected existing settings ownership for a deferred Jini evaluator.
- Reuse: handler idempotency; searched both source trees for inbox/processed-event
  stores, idempotency ports and dedup keys; inspected outbox worker, CMS bus,
  Forms notify and SEO subscriptions; retained effect-specific owners and
  deferred the missing durable contract rather than inventing a second owner.
- Reuse: API errors; Jini owns ApiError/ApiErrorResponse and http-kit owns
  serialization/default statuses. Inspected current and installed declarations,
  analytics routes/tests and the real admin client before deferring conversion.
- Reuse: recovery policy; inspected both boot entrypoints, bootstrap/lifecycle,
  serving gate, serving-app workers, Jini recovery orchestrator/restore hooks
  and site-backup sources. GOV-ADR-001/002 remain binding; no parallel ceremony.

Graph MCP tools were not exposed. Read the available Jini Graphify and
understand-anything indexes, then verified current source with rg/direct reads;
those indexes contain stale package paths and are not runtime evidence.

## Validation and review

Tests were written before the logging implementation and **not run**, per the
dispatch. Three new tests cover async-context/header/log agreement and privacy,
minted-id/unmatched handling, and the default console binding. The existing
overlapping-request test now also asserts independent ids/statuses when requests
finish in reverse order. Existing observability assertions remain intact.

Static `git diff --check` passed for the three tracked changed files. No tests,
typecheck, builds, servers, benchmarks, network commands, gh/flyctl, commits or
pushes were run. Runtime/self-validation and coverage are unavailable by explicit
instruction; DONE means implemented/drafted, not runtime-verified.

Architecture review: PASS for the narrow logging adapter and documentation.
Checked Jini-first ownership, no new store/context/logger/lock, no TSX logic,
scope boundaries and preservation of existing why-comments. The existing
`applyRequestTracking(app, deps)` signature is retained for compatibility with
all current composition/test callers; no new public function was introduced.
The dispatcher requirement supplies this bounded slice's intent; no new ADR,
Critical Internal Constraint or framework ownership rule was authored.

| Assessment unit | Disposition | Findings | Local fix |
|---|---|---|---|
| applyRequestTracking and completion callback | INCONCLUSIVE | Runtime evidence unavailable because execution is forbidden | Direct logger seam plus focused tests written; O(1) time/space per request beyond existing adapters |

Static review found no additional local code defect. Checked variable meanings,
request isolation, sensitive inputs, completion timing, default/injected binding
and existing tracker scope. Mechanical metrics and runtime evidence were not
generated, so no clean execution or coverage claim is made.

## Changed files / next action

- `apps/website/src/server/inbound/shared/observability-middleware.ts`
- `apps/website/src/server/inbound/shared/__tests__/observability-middleware.test.ts`
- `apps/website/src/server/error-mapping/INFO.md`
- `ADS-memory/reports/2026-10-17-platform-foundations/safe-mode-rollback-policy.md`
- `ADS-memory/reports/2026-10-17-platform-foundations/progress-ledger.md`
- `ADS-memory/.local-artifacts/tovu-to-jini-extract/SURVEY.md` (local, gitignored backlog)

Next assignee: Coordinator for 1502/1512/1514 owner/access dispatches, and a test
runner for the logging tests when execution is authorized. User-protected files
and other jobs' edits were not changed by this dispatch.
