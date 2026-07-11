# ADR-026: Core-Mediated Atomic Multi-Write Primitive for Plugin Data

- Status: PROPOSED 2026-07-11 (redesigned from a 2-round formal `/debate` — supersedes the original
  2026-07-09 `/cowork`-spike draft's guard-grammar deferral and raw-tuple author surface; pending its
  own `/audit-work` round before ACCEPTED, same gate ADR-023/ADR-028 went through). **Amends ADR-024
  §3** and **ADR-023 §7**.
- Author: Leon Aburime / Coordinator (Claude Sonnet 5 Primary) with debate peers Codex `gpt-5.5`,
  Gemini 3.1 Pro (`agy`); original `/cowork` probe with Opus 4.8/Fable/Codex/agy
- Extends / amends: **ADR-024** (§3 transport-agnostic frozen ABI), **ADR-023** (§7 typed core-owned writes)
- Relates: ADR-005 (semver promise → why this is decide-now), ADR-022 (single write chokepoint + attribution), SPEC-005
- Evidence: `reports/spikes/20260709-plugin-abi-ergonomics-finding.md` (the original cowork finding +
  measured numbers) and the Tier-3 store checkout spike (`src/features/plugins/**`); debate
  `ADS-project-knowledge/reports/swarm-consensus/runs/20260711T160337Z-adr026-atomic-write-consensus-report.md`.

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

**Core owns a serializable, atomic multi-write primitive.** The 2026-07-11 `/debate` (2 rounds, full
3-way convergence — Claude Sonnet 5 Primary, Codex `gpt-5.5`, Gemini 3.1 Pro) revised the original
`/cowork` draft's two weakest points: it no longer defers the guard grammar, and it no longer makes raw
table/column tuples the plugin-author contract. Both peers independently proposed adjacent alternatives
to raw tuples in Round 1 and converged on one design in Round 2 (agy explicitly reversed its own
Round-1 position after weighing the tradeoffs) — see "Debate + Audit record" below for the full trace.

1. **Public author surface: named, manifest-registered, schema-checked commands — not raw table ops.**
   A plugin registers a command (name, param schema, and its underlying guarded mutations) as manifest
   data; at runtime it invokes the command by name with scalar parameters:
   `write(handle, { command: "<plugin>.<name>", params: {...} }): Promise<{ committed: boolean, conflicts?: {...}[] }>`.
   This directly answers the debate's central reframe (independently raised by both external peers in
   Round 1, in adjacent forms): plugin authors should think in domain operations (checkout, redeem,
   reserve), not in table-row mechanics. Raw table/column tuples still exist, but only as an **internal
   compiled IR** core produces from a registered command — never the primary thing an author hand-writes.
2. **Internal execution — the compiled IR — is the frozen envelope + a small guard grammar (frozen now,
   not deferred).** Core compiles a command invocation into an ordered batch of typed mutations plus
   per-op guards, executed inside **one transaction, all-or-nothing**:
   - Guards are not limited to version-equality. The frozen v1 grammar includes: `expectedVersion`,
     `exists`/`notExists`, and bounded comparison predicates (`eq`/`ne`/`lt`/`lte`/`gt`/`gte`/`in`/
     `isNull`) evaluated against **live row state inside the same transaction** as the write (this is a
     read-modify-write done atomically within one SQLite transaction, not a read-outside/write-inside
     pattern).
   - Mutations include **relative/atomic update operators** (e.g. `increment`/`decrement` on numeric
     fields), not just absolute overwrites — this is what lets core express "reserve if `stock >= 1`,
     decrement by 1" as one guarded op, rather than forcing the author into a client-side
     read-decide-submit-retry loop for every contended write.
   - The grammar inherits ADR-024 §5's existing total/bounded-cost, no-side-effect discipline (same
     family as the Tier-1 expression language) — no new class of Turing-completeness or DoS risk.
   - Any op failure or guard miss rolls the whole batch back; the result is plain serializable data
     (`{ committed, conflicts? }`), never a thrown exception object.
   - **Why freeze the grammar now instead of deferring it (reverses the original draft):** all three
     debate participants independently concluded that "freeze the envelope shape now, decide the guard
     grammar later" is unsafe under ADR-005's semver promise — a version-equality-only v1 would let
     plugin authors build retry/compensation patterns around a primitive that can't actually express
     common invariants, and retrofitting a richer grammar later risks exactly the ecosystem-wide break
     ADR-005 is designed to prevent.
3. **It does NOT hand the plugin a transaction handle** — consistent with ADR-024 §3 (no live objects).
   The plugin describes intent (a command invocation); core owns execution. This keeps the retrofit-free
   path to isolation.
4. **It preserves the ADR-022 write chokepoint** (ADR-023 §7): because core executes the compiled
   envelope, every write stays typed, attributable (ADR-024 `pluginId` stamp), and revisioned — same as
   entries.
5. **Frozen scalar vocabulary (resolves the "Date trap") — explicit tagged scalars, not a bare type
   list.** The spike showed a `Date` is structured-clone-safe yet rejected at the SQLite bind step, and
   the debate concluded "pin string/number/boolean/null" is necessary but not sufficient for a commerce
   plugin ecosystem specifically:
   - Dates cross the ABI as **ISO-8601 UTC strings**, never a raw `Date` object.
   - Money and exact-decimal values cross as **minor-unit integers** (e.g. cents) or **decimal strings**
     — binary floating-point `number` is explicitly rejected by core validation for these fields, not
     discovered as a runtime error at the storage layer the way the spike's Date rejection was.
   - Core validates canonical format for tagged scalars before compiling a command; an author never
     discovers a scalar-representation mismatch at the SQLite bind step. *(Amends ADR-023 §7.)*
6. **Cross-plugin scope: a frozen discriminant, not a built mechanism.** Every command/envelope carries
   `scope: "plugin" | "coordinated"`. `"plugin"` (the only executable value in v1) means every op in the
   batch belongs to the invoking plugin's own tables. `"coordinated"` is recognized and its shape
   reserved (a `participants`/coordination metadata slot) but rejected in v1 with a stable error
   (`COORDINATED_SCOPE_UNSUPPORTED`) — real cross-plugin execution depends on authorization/dependency/
   trust decisions ADR-024 has already deferred past Phase-0, and building it now would drag those
   unresolved questions into this ADR. Freezing the discriminant (rather than omitting it) means a
   future v2 that adds coordinated execution does not need a breaking envelope/command-shape change.
7. **Explicit correctness statement: reads are advisory.** The only correctness boundary is the
   submitted command's guards and mutations, evaluated by core against live row state inside the
   transaction. A plugin may read state to build UI or decide intent, but **a bare read-then-write is
   not safe on its own** — any invariant the author cares about must be expressed in the command's
   guards/mutations, not assumed from a prior read. This closes the exact false-safety gap the original
   spike's racy compensating-undo bug came from. (A future, purely ergonomic, non-correctness-coupled
   "read a coherent snapshot" helper was raised in debate as a possible SDK-sugar addition — explicitly
   out of scope for this ADR either way; see Open.)

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
