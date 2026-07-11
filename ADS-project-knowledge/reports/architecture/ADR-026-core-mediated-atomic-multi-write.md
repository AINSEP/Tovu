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
   **Registration-time validation is normative regardless of the eventual manifest format (round-1 audit
   fix, Codex #3):** whatever literal manifest schema is chosen (Open), core MUST compile every
   registered command into the frozen IR at registration/install time and reject any construct outside
   the v1 grammar, namespace, scalar-representation, and operand-bound rules — a malformed or
   out-of-grammar command fails at install, never silently at first invocation.
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
   - **Read-only guards/preconditions (round-1 audit fix, agy F3/Codex-adjacent):** a guard MAY name a
     row the command does not otherwise mutate — e.g. "insert this order only if the referenced user is
     active" without writing to the user row. This closes the gap where the v1 draft only let guards
     attach to mutated ops, which would have forced authors back into the forbidden read-then-write
     pattern (§7) for any precondition on an unmutated row.
   - **Bounded operand limits are normative, not just "total/bounded-cost" in spirit (round-1 audit fix,
     Codex #1):** `in` operands MUST have a core-defined maximum cardinality, and every scalar operand
     MUST satisfy core-defined byte/precision/scale limits. **This bound applies at both checkpoints,
     not registration alone (internal round-2 verification fix):** a command's *statically declared*
     guard/mutation shape is checked at registration time (§1), but `in` lists and scalar values that a
     command's param schema allows to be populated from runtime `params` are re-checked against the same
     limits at **invocation time**, before the compiled IR is admitted to transaction execution — a
     command definition that only fixes shape at registration cannot be used to smuggle an oversized
     runtime-supplied operand (e.g. an unbounded `in` array passed as a param) past the bound. Either
     checkpoint failing rejects the write before it reaches the transaction, never mid-transaction.
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
   - **Money and exact-decimal fields have exactly one declared representation each — never a choice
     (round-1 audit fix, converged finding: Codex #2 + agy #2).** A field's manifest schema declares it
     as `type: "money-int"` (minor-unit integer, e.g. cents) or `type: "money-decimal"` (canonical,
     finite, scale-bounded decimal string) — never both. Binary floating-point `number` is explicitly
     rejected by core validation for either kind, not discovered as a runtime error at the storage layer
     the way the spike's Date rejection was.
   - **Relative mutations on `money-decimal` fields never touch binary float (round-1 audit fix, agy's
     novel finding).** The original draft's `increment`/`decrement` operators, if implemented with native
     JS arithmetic on a decimal string, would silently coerce through IEEE-754 float — reintroducing the
     exact precision-loss bug this ADR exists to prevent. Core MUST evaluate relative mutations on
     `money-decimal` fields using integer/BigInt-safe fixed-point arithmetic at the field's declared
     scale (parse to a scaled integer, do the arithmetic, re-render as a canonical decimal string) —
     never `Number` arithmetic on the string. `money-int` fields are BigInt-safe by construction and need
     no such conversion.
   - Core validates canonical format and representation kind for tagged scalars at command **registration
     time** (§1), before any invocation is compiled; an author never discovers a scalar-representation
     mismatch at the SQLite bind step. *(Amends ADR-023 §7.)*
6. **Cross-plugin scope: a frozen discriminant, not a built mechanism.** Every command/envelope carries
   `scope: "plugin" | "coordinated"`. `"plugin"` (the only executable value in v1) means every op in the
   batch belongs to the invoking plugin's own tables. **Core derives the allowed table namespace from
   the invoking capability's `pluginId`, not from anything the manifest declares (round-1 audit fix,
   Codex #4)** — a `scope: "plugin"` command's manifest-provided table names can never override or widen
   that namespace; this is enforced at compilation, same as any other IR grammar rule. `"coordinated"` is
   recognized and its shape reserved (a `participants`/coordination metadata slot) but rejected in v1
   with a stable error (`COORDINATED_SCOPE_UNSUPPORTED`) — real cross-plugin execution depends on
   authorization/dependency/trust decisions ADR-024 has already deferred past Phase-0, and building it
   now would drag those unresolved questions into this ADR. Freezing the discriminant (rather than
   omitting it) means a future v2 that adds coordinated execution does not need a breaking
   envelope/command-shape change. **Round-1 audit disagreement (Coordinator judgment call):** agy argued
   a single-command envelope structurally cannot support real coordinated execution later without a
   breaking change regardless, making the reserved discriminant false future-proofing. The Coordinator
   disagreed and this ADR keeps the discriminant as designed: the claim is a plausible but unproven
   prediction about a shape not yet designed, not a demonstrated flaw in what is actually decided
   here — the reserved `participants`/coordination metadata slot's exact shape is itself explicitly left
   open (not frozen), so a future coordinated design has room to land inside it rather than around it.
   If a real Wave-1 feature is later found to need genuine cross-plugin atomicity before ADR-024 Rung 2,
   that is grounds to revisit this call with concrete evidence, not before.
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
- **This design is PROPOSED, not ACCEPTED** — round-1 `/audit-work` returned FAIL and its fixes are now
  folded above; a **round-2 diff-only re-audit** (`TM-adr026-atomic-write-001`) is owed before ACCEPTED,
  same gate ADR-023/ADR-028 went through.
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
and an explicit reads-are-advisory correctness statement (§7).

**Round-1 external audit** (`TM-adr026-atomic-write-001`, risk_tier=high, floor 8.5), run 2026-07-11
(dispatched via a delegated audit subagent, peer dispatch pre-authorized by explicit user instruction
rather than an interactive `run` confirmation), **returned FAIL**: Codex `gpt-5.5` **8.0** (1
blocker — the frozen v1 guard grammar's "total/bounded-cost" claim had no stated `in`-cardinality or
scalar byte/precision/scale limits; 2 non-blocking mediums — scope-namespace derivation and
registration-time IR validation weren't made normative), agy/Gemini 3.1 Pro (High) **6.0** (4
blockers — decimal-string relative-mutation math would silently coerce through IEEE-754 float in JS,
defeating this ADR's own anti-float-precision goal; a single field could accept either a minor-unit
integer or a decimal string with no rule saying which wins, risking storage-type/equality-guard
mismatches; the guard model only attached to mutated ops, so an author could not express a precondition
on an unmutated row without a dummy write or the explicitly-forbidden read-then-write pattern; and a
single-command envelope was argued structurally insufficient for real coordinated execution despite
freezing the discriminant now). Both independently scored below the 8.5 floor and returned
`blocking_gate: FAIL`. Neither auditor disputed the architecture's *shape* — the named-command surface
over a compiled transactional IR, core-owned execution preserving the ADR-022/023 chokepoint, and the
reads-are-advisory correctness rule were all explicitly endorsed as sound; the failure was entirely in
scalar-vocabulary precision/normalization, guard-grammar boundedness, and guard-model expressiveness
gaps in the decided text. Both auditors **independently converged** on the scalar-representation
ambiguity (codex: high; agy: blocker). agy additionally surfaced two novel, high-confidence findings
codex missed: the decimal-string math-coercion bug, and the guard model's inability to express
preconditions on unmutated rows — both accepted and folded above (§2, §5). The Coordinator **disagreed**
with agy's claim that `scope: "coordinated"` on a single-command envelope is a structural dead end
(judged a plausible but unproven prediction about a not-yet-designed shape, not a demonstrated flaw in
the decided v1 text — see §6's disagreement note) and kept the discriminant as designed. All other
findings were dispositioned `agree-defer` at audit time (the dispatched subagent was scoped not to edit
this ADR directly) and are folded above in this revision: bounded operand limits made normative (§2);
read-only guards/preconditions for unmutated rows (§2); exactly one declared representation per
money/decimal field plus non-float relative-mutation math (§5); normative registration-time IR
validation regardless of eventual manifest format (§1); and normative scope-namespace derivation from
`pluginId` (§6). **Disclosed process note:** the audit subagent did not run the `/audit-work` directive's
mandatory internal-verification pass before external dispatch — flagged honestly rather than omitted;
given both externals converged independently on the load-bearing findings, the Coordinator judges the
outcome unlikely to change, but a supplementary internal pass may still run alongside round 2. Full
trace: audit report
`ADS-project-knowledge/.local-artifacts/external-audit/runs/20260711T164621Z-external-audit-report.md`,
proposed fixes
`ADS-project-knowledge/.local-artifacts/external-audit/proposed-fixes/20260711T164621Z/proposed-fixes.md`,
raw offloads `ADS-project-knowledge/.local-artifacts/external-audit/offloads/20260711T164621Z/`.

**Status remains PROPOSED** — a **round-2 diff-only re-audit** (same `TM-adr026-atomic-write-001`,
Prior-Round Disposition Ledger carrying forward this round's five findings) is owed before ACCEPTED,
same gate ADR-023 and ADR-028 both cleared this session.
