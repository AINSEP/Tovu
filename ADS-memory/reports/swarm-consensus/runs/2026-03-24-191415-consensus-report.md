# Consensus Report

**Date:** 2026-03-24T19:14:15-07:00
**Prompt:** Given the WordPress-style complaint research, the current Tovu structure and `todos.md`, and the overall project goals, determine whether Tovu should be Next.js-first or server-first, what architecture should come first, and what build sequence should follow, using a six-round Codex vs Claude debate.
**Context Packet:** `AI-Dev-Shop/reports/swarm-consensus/context/CTX-user-complaints-architecture-2026-03-24.md`
**Mode:** debate
**Controls:** `max_rounds=6`, `min_confidence=0.90`, `swarm_timeout_seconds=300`, `claude_model=global.anthropic.claude-opus-4-6-v1`, `codex_model=gpt-5.4`, `gemini=excluded_by_user_request_due_quota`
**Primary model:** `Coordinator(Review Mode)` current session, synthesis only; voting participants were external `codex` and external `claude` per user request

## The Swarm
| Role | CLI | Requested Model | Resolved Model | CLI Version | Selection Source | Status | Attempts |
|---|---|---|---|---|---|---|---|
| Primary | current-session coordinator | n/a | current-session model not externally introspected | n/a | thread host | Responded | 1 |
| Peer | claude | `global.anthropic.claude-opus-4-6-v1` | `global.anthropic.claude-opus-4-6-v1` | `2.1.45 (Claude Code)` | per-run override | Responded | 8 |
| Peer | gemini | n/a | excluded by user; quota exhausted | `0.34.0` | user exclusion | Resource unavailable | 0 |
| Peer | codex | `gpt-5.4` | `gpt-5.4` | `codex-cli 0.116.0` | per-run override | Responded | 6 |

## Dispatch Diagnostics
| CLI | Output Mode | stdout Parser | stderr Summary | Retry Notes |
|---|---|---|---|---|
| claude | json | `result` field + `<<SWARM_END>>` | empty across successful rounds | Round 4 attempt 1 stalled for >7m with zero stdout/stderr; attempt 2 stalled again; final retry used a shortened prompt and succeeded |
| gemini | n/a | n/a | not called | Excluded by user because quota was exhausted |
| codex | jsonl event stream | final `agent_message` + `<<SWARM_END>>` | empty across all rounds | No retries; all runs pinned to `gpt-5.4` and sandboxed to the strict packet workspace |

## Debate Trace
- **Round 1:** Both sides independently converged on server-first Tovu with Next.js only as an adapter/starter. Reliability complaints, not admin UX, should drive the first architecture.
- **Round 2:** Convergence tightened around a five-plane shape, persistent adapters as part of the real proof, and Next admin only after server contracts stabilize.
- **Round 3:** Both sides converged on the canonical first slice name: `Safe Extension Change with Incident Timeline`, plus a two-gate proof rhythm: Gate 1 in-memory/contract tests, Gate 2 persistent/restart-safe proof.
- **Round 4:** Ownership split converged: `Capability Modules` own complaint-driven workflow invariants, `Operations` owns reusable execution mechanics, `Kernel` owns runtime primitives. Main disagreements narrowed to verification mode and post-Gate-2 sequencing.
- **Round 5:** Both sides selected synchronous verification inside Slice 1 and deferred worker-authoritative verification. The only remaining disagreement was what comes immediately after Slice 1 Gate 2.
- **Round 6:** Both sides selected the same final roadmap: `Slice 2a` thin read-only incident query/timeline utility, then `Slice 2b` workspace/auth/content skeleton, then `Slice 3` full incident diagnostics and performance attribution.

## Individual Responses

### Coordinator(Review Mode)
The coordinator enforced a strict shared packet, pinned `codex` to `gpt-5.4`, pinned `claude` to `global.anthropic.claude-opus-4-6-v1`, excluded Gemini per user request, and synthesized the final decision ledger. The coordinator did not count as a voting peer.

### Claude
Claude consistently argued for server-first architecture, adapter-only Next.js, and a runtime-oriented ownership split. Its strongest unique contributions were: `invariant ownership vs execution ownership` as the clean module split, synchronous verification as the safer Slice 1 proof, and the final `2a/2b/3` sequencing as a true recommendation rather than a diplomatic compromise.

### Codex
Codex consistently argued that complaint-driven capability boundaries must stay explicit instead of disappearing into a generic domain bucket. Its strongest unique contributions were: protecting section-13 complaint modules from being reduced to vague architecture labels, insisting that Slice 1 must remain a complete reliability loop, and pushing the final recommendation toward a thin read-only incident utility before broader platform expansion.

## Synthesis

### Agreement
- Tovu should be **server-first**, not mainly a Next.js application.
- Next.js should remain a **thin adapter** in the `Transport` plane for admin/rendering, not the home of CMS invariants.
- The working top-level shape is a **five-plane model**: `Kernel`, `Capability Modules`, `Operations`, `Workers`, `Transport`.
- Ownership split is settled:
  - `Capability Modules` own complaint-driven invariants and workflow definitions.
  - `Operations` owns reusable execution mechanics and operational infrastructure.
  - `Kernel` owns extension/runtime primitives and shared contracts.
- Slice 1 is settled:
  - `Safe Extension Change with Incident Timeline`
  - Gate 1: in-memory adapters + contract/route tests
  - Gate 2: persistent adapters + restart survival
  - verification is synchronous inside Slice 1
- Worker-authoritative verification is deferred to a later slice.
- Final post-Gate-2 sequencing is settled as `2a/2b/3`.

### Divergence
- Earlier divergence existed on whether verification in Slice 1 should already be worker-driven and whether diagnostics should come before workspace/content. Both of those deltas were resolved by Round 6.

### Unique Insights
- Claude introduced the most useful ownership framing: **invariants vs execution mechanics**.
- Codex held the strongest line on **complaint-driven capability modules** as first-class boundaries required by section 13.
- Both models independently arrived at **`Slice 2a` thin read-only incident query** as the lowest-cost way to validate Slice 1 output before broadening the platform.

### Decision Ledger
| Decision Point | Primary | Claude | Gemini | Codex | Agreement |
|---|---|---|---|---|---|
| Main app boundary | Server-first; Next adapter only | Server-first; Next adapter only | Excluded | Server-first; Next adapter only | Yes |
| Top-level plane model | `Kernel`, `Capability Modules`, `Operations`, `Workers`, `Transport` | Same | Excluded | Same | Yes |
| Ownership split | Capability modules = invariants/workflows; Operations = execution mechanics; Kernel = runtime/shared contracts | Same | Excluded | Same | Yes |
| Slice 1 name | `Safe Extension Change with Incident Timeline` | Same | Excluded | Same | Yes |
| Slice 1 proof rhythm | Gate 1 in-memory/tests, Gate 2 persistent/restart-safe | Same | Excluded | Same | Yes |
| Verification mode in Slice 1 | Synchronous | Synchronous | Excluded | Synchronous | Yes |
| Immediate next roadmap after Slice 1 Gate 2 | `Slice 2a` thin incident query, `Slice 2b` workspace/auth/content skeleton, `Slice 3` full diagnostics/performance | Same | Excluded | Same | Yes |

## Final Recommendation
Tovu should proceed as a **server-first modular monolith** whose job is to replace the old WordPress/PHP responsibility plane in Node/TypeScript: command handling, policy checks, extension lifecycle, rollback-safe change, incident recording, auditability, and async orchestration all belong on the server side. Next.js should remain a downstream adapter for admin and rendering, never the canonical application boundary.

The agreed roadmap is:
- **Slice 1:** `Safe Extension Change with Incident Timeline`
  - Gate 1: in-memory adapters + contract/route tests
  - Gate 2: persistent adapters + restart survival
  - synchronous verification only
- **Slice 2a:** thin read-only incident query/timeline utility over Slice 1 data
- **Slice 2b:** workspace/auth/content skeleton
- **Slice 3:** full incident diagnostics and performance attribution

This sequence keeps Tovu complaint-led, preserves framework independence, validates the incident data layer before broadening the platform, and avoids the strategic mistake of turning the CMS into a Next-shaped application before the operational core is real.

## Implementation Start Blueprint

This section is the practical answer to: how should Tovu actually start building from the current repo, current `todos.md`, and the complaint corpus?

### What Tovu Is
- A server-first modular monolith in TypeScript.
- A framework-agnostic core with swappable transports and UI bindings.
- A project that should prove safe change, rollback, and incident visibility before broad content/admin breadth.

### What Tovu Is Not
- Not mainly a Next.js application.
- Not a big admin-first build.
- Not a generic headless CMS scaffold that postpones reliability until later.

### How WordPress Responsibilities Map To Tovu
| WordPress-style responsibility | Tovu home |
|---|---|
| Request handling | `server/` transport now, future swappable transports later |
| Plugin/theme lifecycle | `Kernel` primitives + complaint-driven capability modules |
| Change safety / rollback | reliability capability module |
| Incident recording / debugging | `Operations` + incident timeline read models |
| Content CRUD | later capability modules after the reliability core is proven |
| Admin UI | thin Next.js adapter consuming server APIs |

### How To Use The Current `tovu/src` Scaffold
Do not explode the repo into many packages yet. Evolve the current split instead:

| Current area | Near-term role |
|---|---|
| `src/core/` | kernel contracts and shared operations primitives |
| `src/features/` | complaint-driven capability modules |
| `src/server/` | Express composition root and transport boundary |
| `src/workers/` | add after Slice 1 proves the synchronous contract |

Near-term direction:

```text
src/
  core/
    ids/
    errors/
    events/
    flags/
    policies/
    lifecycle/
    ports/
  features/
    extension-safety/
      application/
      domain/
      ports/
      __specs__/
      __tests__/
    workspace/
    content-skeleton/
    incident-diagnostics/
  server/
    routes/
    middleware/
    presenters/
    __tests__/
  workers/
```

The key move is not package splitting. The key move is naming the early slices around user pain rather than generic CMS nouns.

### What To Build First
`Safe Extension Change with Incident Timeline` is the first real proof slice.

Scope:
- one workspace
- one already-known extension
- `activate`, `update`, and `disable`
- synchronous preflight checks
- state snapshot before change
- apply the change
- synchronous verification
- commit or rollback-safe recovery
- incident timeline projection
- route tests and contract tests

Why this slice first:
- directly attacks update roulette
- directly attacks plugin conflict opacity
- directly attacks generic critical-error opacity
- proves whether Tovu can actually do what WordPress fails to do well

### Gate 1
Use in-memory adapters first to prove:
- command shape
- port contracts
- state transitions
- API route behavior
- incident timeline shape

Deliverables:
- spec
- ADR
- split ports
- error taxonomy
- logging/request IDs
- contract tests
- route tests
- in-memory repositories and outbox

### Gate 2
Add persistent proof:
- DB-backed extension state
- DB-backed incidents
- DB-backed outbox
- restart survival

At this point Tovu has something users can believe in: safe change with a persistent explanation trail.

### What Comes After Slice 1
- `Slice 2a`: thin read-only incident query / timeline utility
- `Slice 2b`: workspace/auth/content skeleton
- `Slice 3`: full incident diagnostics and performance attribution

Why this order:
- `2a` validates that Slice 1's incident data is actually queryable and useful.
- `2b` establishes real tenant/auth/content boundaries so later modules are not built against imagined scope.
- `3` adds richer diagnostics only after both the incident substrate and the platform skeleton are real.

### How `todos.md` Should Be Reordered
Move to the top:
- split `src/core/ports.ts` into focused port files
- add route tests in `src/server/__tests__/`
- add structured logging + request IDs
- add error taxonomy + standardized API errors
- add feature flag support
- draft the Slice 1 spec and ADR
- add persistent adapter seams for extension state, incidents, and outbox

Promote ahead of generic CRUD work:
- plugin/module registration skeleton only as required for Slice 1
- safe-mode/rollback concept
- outbox retry/backoff
- idempotency strategy

Push down slightly:
- workspace full CRUD
- basic auth boundary
- content model module
- richer content entry workflows

Defer clearly:
- broad Next.js admin shell work
- theme system depth
- plugin UI extension points
- agentic UI depth
- protocol breadth that is not needed by current slices

### What Not To Do Yet
- Do not let Next.js become the de facto composition root.
- Do not build a generic plugin SDK before safe extension change is proven.
- Do not make worker-authoritative verification part of Slice 1.
- Do not split into many packages before several real slices prove the boundaries.
- Do not let generic content CRUD become the first architecture driver.

## Reality Check
Yes: the architecture docs and debate can reduce obvious mistakes, but they will not reveal the important weaknesses by themselves.

The real flaws show up when you actually implement and test:
- whether the ports are too abstract or too leaky
- whether the slice boundaries survive real route tests
- whether rollback semantics are clean or awkward
- whether persistence forces a different model than the in-memory proof implied
- whether the current Express composition root helps or fights the design

So the right posture is:
- use the architecture and report to set the first direction
- expect the first two or three slices to teach you what is wrong
- feed those lessons back into the architecture instead of treating the document as finished truth
