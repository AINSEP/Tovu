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
  path (guard evaluation + relative mutation) moves into core, where it is written and tested once, and
  authors invoke it by domain command name rather than reconstructing it from table primitives.
- **Never-brick and the write chokepoint survive** — core still executes, attributes, revisions, and can
  still snapshot every command's compiled mutations.
- **The ABI stays retrofit-free** toward ADR-024 §4 isolation — commands and their compiled envelopes are
  serializable and process-boundary-ready by construction.
- **The guard grammar and scalar vocabulary are decided now, not deferred** — reverses the original
  draft's biggest risk (an underpowered version-equality-only v1 that ADR-005's semver promise would make
  expensive to widen later).
- **Cross-plugin atomicity is explicitly named and explicitly deferred** — the `scope` discriminant means
  a future coordinated-execution feature is additive, not a breaking change to every existing command.
- **Scope discipline maintained:** SDK ergonomics beyond the command-registration surface itself (codegen,
  typed param builders) remain deliberately excluded — fixable post-freeze without an ecosystem break.

## Open

- **Command registration format** — the exact manifest shape for registering a command (name, param
  schema, underlying guarded mutations) is designed-now / frozen when the SDK is built; this ADR freezes
  the *contract* (named commands compiling to a guarded, transactional IR), not the manifest's literal
  JSON Schema.
- **Coordinated-scope execution** — deliberately not built in v1 (see Decision §6); owed once ADR-024's
  authorization/dependency/trust model for cross-plugin interaction exists past Phase-0.
- **Ergonomics-only consistent-read helper** — raised in debate as a possible future SDK-sugar addition
  (e.g. a `readSnapshot()`-style call), explicitly **not** part of this ADR's correctness guarantee either
  way (reads remain advisory per Decision §7); unresolved even as a "should we ever build it" question
  between the two debate peers, and not blocking.
- **Interaction with ADR-023 §10 transform DSL + backfill jobs** — the command/envelope primitive is the
  runtime write path; the DSL is the migration path; keep them distinct.
- **This design is PROPOSED, not ACCEPTED** — owed: an `/audit-work` round (same gate ADR-023/ADR-028
  went through) before this ADR can graduate.
- Depends on ADR-023 (now **ACCEPTED** 2026-07-11 — see ADR-023's own round-3 audit closure).

## Debate + Audit record

**Origin (2026-07-09):** a throwaway 4-model `/cowork` engineering probe (Opus + Fable + Codex `gpt-5.5`
+ Gemini 3.1 Pro) built a real ABI probe against better-sqlite3 and found the frozen ADR-024 §3 ABI's one
correctness-shaped cost: no transaction can cross an `await`, forcing hand-rolled optimistic-concurrency
guards plus a compensating undo for any multi-row invariant — and the probe proved even a careful,
reviewed compensating undo was itself racy (lost updates under concurrent load without a version guard).
That finding produced this ADR's first draft: a declarative write envelope, shape frozen now, guard
grammar and cross-plugin scope left as "designed-now, decided-later."

**Formal `/debate` (2026-07-11, `TM`-free swarm consensus, 2 rounds, full trace:
`ADS-project-knowledge/reports/swarm-consensus/runs/20260711T160337Z-adr026-atomic-write-consensus-report.md`).**
Per the user's explicit prior instruction, the original draft's informal `/cowork` convergence was
treated as a starting hypothesis to be pressure-tested, not a decision — this debate superseded it
rather than rubber-stamping it. Round 1 (blind, neutral framing — no candidate solution presented as
the answer): Claude Sonnet 5 (Primary), Codex `gpt-5.5`, and Gemini 3.1 Pro (`agy`) independently
converged on 4 points (version-equality-only guards insufficient; freeze-grammar-now beats
freeze-later; explicit tagged-scalar vocabulary for dates/money; saga/outbox rejected as reintroducing
the exact plugin-authored-compensation hazard the probe proved dangerous) and surfaced three deltas:
how much cross-plugin scope must be real vs. scaffolded in v1; whether the author surface should be raw
table tuples or something command/aggregate-oriented (Codex and agy independently proposed adjacent but
different alternatives — a stored-command primitive vs. event sourcing); and whether a consistent-read
companion primitive is needed. Round 2 (informed — Coordinator synthesis shared, no bare "still agree"
allowed): agy explicitly reversed two of its own Round-1 positions after weighing the tradeoffs —
abandoning event-sourcing as "too radical an architectural pivot" from read-your-own-writes, and
retracting "build cross-plugin now" as failing to respect the blast radius of the authorization/trust
machinery that would require — landing on full agreement with Codex's command-oriented design and
scope-deferral position. All three decision points closed at 3/3 convergence, clearing `min_confidence`
after 2 rounds; the debate stopped rather than running a third round to re-litigate settled ground. One
explicitly non-blocking residual: whether a future, ergonomics-only consistent-read sibling primitive is
ever worth building (Codex: maybe, later; agy: no, never) — out of this ADR's scope either way.

**This revision folds the full consensus** as normative text: named/manifest-registered commands as the
public author surface (§1); a frozen bounded-predicate + relative-mutation guard grammar reusing
ADR-024 §5's total/bounded-cost discipline, not deferred (§2); explicit tagged scalars for dates/money
(§5); a frozen `scope: "plugin" | "coordinated"` discriminant with only `plugin` executable in v1 (§6);
and an explicit reads-are-advisory correctness statement (§7). **Status remains PROPOSED** — an
`/audit-work` round against this revised design is owed before ACCEPTED, same gate ADR-023 and ADR-028
both cleared this session.
