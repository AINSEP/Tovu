# PRIMARY (Claude Opus 5, 1M) — Round 2 frozen position

**Frozen** after reading all three Round 1 responses, BEFORE dispatching the Round 2 packet and
before reading any Round 2 response. Round 1 position is at
`2026-08-22-capability-bucket-PRIMARY-round1-frozen.md`.

## Verification performed before writing this

Two Sonnet claims re-verified against source, because a subagent report is a claim, not a result:

1. **VERIFIED.** `Jini/packages/core/src/tool-registry.ts` — `ToolRegistration.handler` is
   `readonly handler: ToolHandler`, non-optional. `ToolRegistry.register()` accepts only the full
   triple. A handler-less row cannot enter the real registry.
2. **VERIFIED, and it cuts the other way too.** `ToolDescriptor` is pure metadata and its own doc
   says it "Never carries the handler or policy". `ToolRegistry.list()` returns
   `readonly ToolDescriptor[]`. `buildToolCatalogQuery` takes `Pick<ToolRegistry, "list">`.
   Therefore **any object with a `.list()` returning descriptors can back the FTS5 index** — no core
   type change, no real registry.
3. **VERIFIED — my packet was wrong.** §2.5.6 said "six groups, five hardcoded stubs."
   `composer-capabilities.ts` has **five** groupIds, **five** entries, **four** stubs, one wired
   (`tool:content-search` → `content_post_search`). The error came from the prior session's handoff
   §4.10, which I carried forward without checking. Correct the handoff.

## Position — CHANGED in emphasis, HELD on the core

**Held:** unify discovery, do not unify activation.

**Newly grounded, and this is the strongest thing found this round:** that is not a design proposal.
It is already the Jini kernel's own enforced invariant. `ToolDescriptor` (discovery) is structurally
severed from `handler`/`policy` (activation) at the type level, and `list()` exposes only the former.
The architecture everyone converged on is the one the kernel already implements — the work is to
extend it to more sources, not to invent it. I did not know this in Round 1 and it is the single
fact that most raises my confidence.

**Changed — I withdraw my Round 1 §4 axis.** All three participants independently rejected
"what the agent does with it" as a primary type axis. I accept that. The primary axis is the
**operation contract** — protocol/adapter, input/output media, sync vs async, side-effect and
reversibility, trust requirement, scope, revision behavior, delivery guarantee. Verbs demote to
searchable facets. Codex's formulation is better than mine and I adopt it rather than defend mine.

**Changed — I now weight delivery guarantee above discovery.** See DP4.

## Decision points and my position on each

**DP1 — one discovery index, or two?** I hold ONE index, many registered sources, lane-labeled rows.
Sonnet argues two. But Sonnet's own Blind Spot (a) — "a shared discovery facade over separately-
executed lanes" — *is* the one-index position, filed as a blind spot rather than as its answer. With
`Pick<ToolRegistry,"list">` verified, a source is a `.list()` and nothing more, so one index over N
sources costs the same as two indexes over two. Sonnet's real objection is not cost, it is that one
search surface drifts into one trust tier. That objection is correct and is answered by DP2, not by
splitting the index.

**DP2 — what stops a unified facade from becoming a unified trust tier?** A standing rule, written as
an ADR, not a convention: **the discovery surface never gains an execute path.** `capability_search`
and `capability_get` return metadata only. Activation routes to the owning lane's existing gate —
`ToolExecutor`'s authorize for native, `trust.ts`'s admission for federated, and nothing at all for
READ, because returning text cannot act. Codex's `admit(principal, workspace, capability, revision,
operation, input) -> allow | deny | require-confirmation | require-configuration` is the right
interface: one decision *point*, many decision *policies*. Sonnet's `trust.ts` evidence (five
structural differences between native and federated) is the best argument in the round for why the
policies must stay plural, and it does not require the index to be plural.

**DP3 — is boot-only seeding acceptable?** I hold: no, and I am now 3-of-4 supported. Sonnet's counter
is that boot-seeding matches existing accepted behavior. That is an argument about consistency, not
about correctness. The workflow being designed is install-then-use-in-the-same-conversation; boot-only
seeding makes the flagship workflow the one broken case. The index is `:memory:` and disposable, so
re-seeding is cheap.

**DP4 — THE ONE THAT MATTERS, and nobody made it their position.** All four of us independently
put the same thing in Blind Spot (c): the assumption that findability is the binding constraint.
Sonnet's version is the only empirically grounded one and it is devastating — the skill's full
content was ALREADY unconditionally in the prompt, ~14,800 characters, zero search required, and the
agent still read 0 of 30 files until the wrapper stopped hedging. **That is not a discovery failure.
It is an instruction-following failure.** Four independent models flagged it and all four then wrote
positions about discovery architecture anyway, including me.

My Round 2 position: the capability bucket is **necessary but not sufficient**, and shipping it
without an explicit delivery-guarantee ladder reproduces the original failure at higher cost. Codex's
ladder is the concrete answer: `available` / `recommended` / `required-context` / `user-pinned` /
`on-demand`. Delivery guarantee must be a field on the record from day one, not a later feature. If
only one thing ships, ship that.

**DP5 — is option C an acceptable first slice?** I hold: yes, but only as a strict subset of the
final shape, never as the endpoint. Codex agrees. Flash rejects it outright. The tie-breaker is
whether C's tool names survive: `agent_plugin_search` bakes a kind into the agent-facing API and
becomes public and hard to retire (Codex's own hidden cost). So C is acceptable **only** if named
`capability_search` from the first commit, with agent plugins as its first registered source. Same
work, no retirement debt.

## Strongest argument against my leading position

Sonnet's, and it is not the two-index one — it is Blind Spot (c) generalized: if instruction-following
is the real constraint, a unified discovery plane is elaborate machinery aimed at the wrong half of
the problem, and the honest minimal answer is a mandatory pointer plus one read tool (option C),
with the remaining effort spent on delivery semantics and evaluation. I do not think that is right,
because C reproduces per-kind work for the next READ kind. But it is the argument I would have to
beat, and "it is more future-proof" is not sufficient to beat it without a measurement.

## What would change my mind now

- A measurement showing that with a mandatory pointer plus a read tool, the agent's use of a named
  skill is already reliable → the delivery problem is solved and the bucket is over-engineering.
- Evidence that the composer, not the agent, will always select capabilities → search is decoration.
- Any source fact showing `buildToolCatalogQuery` cannot in practice accept a non-registry `.list()`
  source → DP1 collapses to Sonnet's two-index answer.

<<SWARM_END>>
