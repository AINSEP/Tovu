# ADR-026: Core-Mediated Atomic Multi-Write Primitive for Plugin Data

- Status: PROPOSED 2026-07-09 (from the `/cowork` ABI-ergonomics spike; **amends ADR-024 §3** and **ADR-023 §7**)
- Author: Leon Aburime / Coordinator (Opus 4.8 Primary) with cowork peers Fable, Codex `gpt-5.5`, Gemini 3.1 Pro (`agy`)
- Extends / amends: **ADR-024** (§3 transport-agnostic frozen ABI), **ADR-023** (§7 typed core-owned writes)
- Relates: ADR-005 (semver promise → why this is decide-now), ADR-022 (single write chokepoint + attribution), SPEC-005
- Evidence: `reports/spikes/20260709-plugin-abi-ergonomics-finding.md` (the cowork finding + measured numbers) and the Tier-3 store checkout spike (`src/features/plugins/**`).

## Context

ADR-024 §3 freezes the plugin↔core ABI as **async-only, serializable-only, no live core objects,
capabilities by handle** — and explicitly **no shared transaction context**. A 4-way `/cowork`
spike (Opus + Fable + Codex + Gemini, all independent) built a throwaway ABI probe and a sample
Tier-3 store to feel that contract in code. The unanimous headline finding:

> The one **correctness-shaped** cost of the frozen ABI is that a plugin **cannot hold a database
> transaction across an `await`**. Any multi-row / multi-table invariant — the canonical example
> being "reserve/decrement inventory **and** write the order row, both-or-neither, only-if-in-stock"
> — must be hand-rolled by the plugin author with optimistic-concurrency guards **plus** a
> compensating undo write. The spike showed even the *careful* hand-rolled compensation is **itself
> racy** (its undo has no version guard). Every store / inventory / coupon / sequential-order plugin
> hits this exact wall.

The store checkout spike (`store-plugin.ts`) makes this concrete: its stock-decrement + order-insert
are atomic **only** because the spike store holds a direct DB handle — a real plugin behind the frozen
ABI could not do that. Under ADR-005's semver promise, the ABI's write vocabulary is **near-irreversible
once third-party plugins exist**, so the primitive that closes this gap must be designed **now**, while
it is free. Everything else the spike found (verbose query descriptors, capability-handle plumbing) is
**SDK sugar** — fixable later, semver-safe, and explicitly out of scope here.

## Decision

**Core owns a serializable, declarative atomic multi-write primitive** — a "write envelope" the plugin
submits **as data**, which **core executes in a single transaction, all-or-nothing**, with per-op
optimistic-concurrency guards. Freeze its **shape now**; iterate its contents.

1. **Shape (frozen now, forward-compatible):** the ABI write surface accepts an ordered batch of typed
   mutations plus optional precondition guards, e.g.
   `write(handle, { ops: TypedMutation[], guards?: { table, id, expectedVersion }[] }): Promise<{ committed: boolean, conflicts?: {...}[] }>`.
   Core applies the ops in order inside one transaction; **any op failure or guard miss rolls the whole
   envelope back**; the result is plain serializable data (a `conflicts` list, not an exception object).
2. **It does NOT hand the plugin a transaction handle** — consistent with ADR-024 §3 (no live objects).
   The plugin describes intent; core owns execution. This keeps the retrofit-free path to isolation.
3. **It preserves the ADR-022 write chokepoint** (ADR-023 §7): because core executes the envelope,
   every write stays typed, attributable (ADR-024 `pluginId` stamp), and revisioned — same as entries.
4. **Pin the serializable scalar vocabulary now (the "Date trap"):** the spike showed a `Date` is
   structured-clone-safe yet rejected by the store — so "serializable" is not a sufficient author
   contract. The frozen typed-write vocabulary must state exactly which scalar types cross the seam
   (string / number / boolean / null) and how dates/decimals are represented. *(Amends ADR-023 §7.)*

## Consequences

- **Store / commerce plugins stop re-implementing fragile compensation logic** — the correctness-critical
  path moves into core, where it is written and tested once.
- **Never-brick and the write chokepoint survive** — core still executes and can still snapshot/attribute.
- **The ABI stays retrofit-free** toward ADR-024 §4 isolation — the envelope is serializable and
  process-boundary-ready by construction.
- **Scope discipline:** this ADR is *only* the atomic-write gap. SDK ergonomics (typed query builders,
  handle sugar) are deliberately excluded — they are fixable post-freeze without an ecosystem break.

## Open

- **Exact envelope grammar** is frozen only when the engine is built (inherits ADR-022's
  totality/bounded-cost constraint on any expression it admits); this ADR freezes the *shape*, not the grammar.
- **Guard expressiveness** beyond version-equality (ranges, existence, `stock >= n`) — designed-now, decided-later.
- **Interaction with ADR-023 §10 transform DSL + backfill jobs** — the envelope is the runtime write path;
  the DSL is the migration path; keep them distinct.
- Depends on ADR-023 graduating PROPOSED → ACCEPTED (owner sign-off still owed).
