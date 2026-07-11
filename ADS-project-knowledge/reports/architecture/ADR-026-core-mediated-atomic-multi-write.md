# ADR-026: Core-Mediated Atomic Multi-Write Primitive for Plugin Data

- Status: PROPOSED 2026-07-11 (redesigned from a 2-round formal `/debate`; **on its 7th `/audit-work`
  round under `TM-adr026-atomic-write-001`**, per user instruction to prefer broad/full-pass audits over
  narrow diff-only ones after rounds 1-5's narrow scoping caused repeated same-class misses. Briefly
  ACCEPTED after round 3, reopened by an independent Fable pass + rounds 4/5 (recurring "unspecified
  scalar evaluation/storage semantics" — money-decimal, dates, strings), closed structurally in round 5
  with a closed-vocabulary rule. Round 6 (full-pass) found the closed-vocabulary rule itself had 3 bugs
  (baseline-op regression, missing `MIN_SAFE_INTEGER`, missing `NaN`/`Infinity`/`-Infinity` exclusion),
  all fixed. **Round 7 (full-pass) found the generic-`number` fix still had 2 gaps**: agy found the
  "both checkpoints" bound language couldn't actually apply to a relative-mutation *result* (the current
  row value isn't known until execution, so an in-transaction execution-time check was missing); Codex
  found `-0` wasn't excluded despite passing every other check, silently colliding with `0` on
  storage/round-trip. Both fixed — see "Debate + Audit record" for the full history. **Round-8 full-pass
  re-audit** owed before ACCEPTED). **Amends ADR-024 §3** and **ADR-023 §7**.
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
   - **Closed-vocabulary rule for scalar operations (round-5 audit fix; corrected round-6, agy's
     r6-B1/r6-B2 findings):** an operator applied to a scalar kind has normatively specified evaluation
     and storage semantics, or it is **not permitted** in v1 — never implementation-defined by default.
     This applies specifically to the two operation classes that require a defined notion of "order" or
     "arithmetic" — **ordered comparison** (`lt`/`lte`/`gt`/`gte`) and **relative mutation**
     (`increment`/`decrement`) — because those are where cross-implementation ambiguity actually lives.
     **Baseline operations are universal and unrestricted for every scalar kind, not part of this
     enumeration:** absolute `set` (overwrite, validated against the field's declared type/format at
     both checkpoints per §1/§5), `eq`, `ne`, `in`, and `isNull` are always permitted for every scalar
     kind — canonicalization already makes exact-identity/existence checks safe regardless of ordering
     semantics, so these carry no representation ambiguity and need no per-type carve-out. (Round-6
     correction: an earlier draft of this rule read, if applied literally, as banning absolute writes
     and `in`/`isNull` for every type — a grammar-breaking regression this paragraph fixes by making the
     baseline explicit and separate from the ordered-comparison/relative-mutation enumeration below.)

     The closed enumeration below covers ONLY ordered comparison and relative mutation:
     - `money-int`: both use native BigInt-safe integer semantics (safe by construction).
     - `money-decimal`: both use BigInt-safe fixed-point arithmetic at the field's declared scale (never
       string collation, never `Number` parsing — see below); storage is TEXT-affinity.
     - Date (ISO-8601, fixed-width canonical form): ordered comparison only (relative mutation on dates
       is not part of the v1 vocabulary — no "add N days" primitive is defined) uses plain lexicographic
       string comparison, safe only because the canonical form is fixed-width (see below).
     - Generic `string`: **ordered comparison is not permitted in v1** (no relative mutation is defined
       for strings either) — collation semantics (byte-order vs. code-unit order vs. locale-aware vs.
       Unicode-normalized) are exactly the kind of cross-implementation ambiguity this rule exists to
       close, and no single choice is obviously correct the way fixed-width lexicographic order is for
       the frozen date form. The baseline `eq`/`ne`/`in`/`isNull` above remain available and are safe as
       exact string-identity comparison, independent of collation.
     - Generic `number`: both use native JS number semantics, restricted to **finite values only, within
       the inclusive safe-integer range `[Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER]`** (round-6
       fixes: the prior text bounded only the upper end, leaving large-negative values or decrements
       past the lower bound free to silently lose precision the same way an unbounded upper end would;
       it also didn't explicitly exclude `NaN`/`Infinity`/`-Infinity` — a range check alone doesn't catch
       `NaN`, since every comparison involving `NaN`, ordered or otherwise, evaluates `false`, so a
       naive "reject if `value > MAX_SAFE_INTEGER`" check silently admits it). Core rejects any supplied
       `number` value that is non-finite (`NaN`, `Infinity`, `-Infinity`) or falls outside the
       safe-integer range at both pre-execution checkpoints (registration §1, invocation), using an
       explicit finiteness check (`Number.isFinite`) before the range comparison — never a bare range
       comparison alone. **A relative-mutation *result* requires a third, execution-time checkpoint
       (round-7 audit fix, agy's r7-B1 finding):** `increment`/`decrement` operands can only be bounded
       at registration/invocation as *supplied values* — the result of applying them depends on the
       live row value, which is not known until the operation executes inside the transaction. Claiming
       the result-bound is enforced "at both checkpoints" is impossible for a value that doesn't exist
       yet at either checkpoint. Core MUST additionally compute the post-mutation value inside the same
       transaction as the write and reject the whole batch (same all-or-nothing rollback as any other
       guard/op failure, §2) if that computed result is non-finite or falls outside
       `[Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER]` — this execution-time check is in addition
       to, not a replacement for, bounding the supplied operand at registration/invocation. **Generic
       `number` additionally rejects `-0` at every checkpoint, including this execution-time one
       (round-7 audit fix, Codex's r7-B1 finding):** `-0` passes both `Number.isFinite` and the safe-
       integer range check, but typical SQLite storage and JSON-style serialization collapse it to `0`
       on round-trip — a silent representation collision for an accepted value, the exact class of bug
       this vocabulary exists to prevent. Core rejects any supplied or computed generic-`number` value
       for which `Object.is(value, -0)` is true, at registration, invocation, and the execution-time
       mutation-result checkpoint alike — never silently canonicalized to `0`.
     - `boolean`/`null`: ordered comparison is not permitted (no relative mutation is defined for these
       either) — there is no meaningful order, and permitting it would just be another unspecified-
       semantics trap. The baseline `eq`/`ne`/`isNull` above remain available (`in` is permitted but
       rarely meaningful for `boolean`/`null`).
     - Any ordered-comparison or relative-mutation operator applied to a scalar kind not listed above as
       supporting it is rejected at registration time (§1) as out-of-grammar — the baseline operations
       are never affected by this rejection rule, regardless of scalar kind.
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
     pattern (§7) for any precondition on an unmutated row. **Guard-target scope is normative, same as
     mutation scope (Fable independent-verification fix, F2):** a guard target — mutated or read-only —
     is subject to the exact same `pluginId`-derived namespace as §6's mutation-scope rule. A `scope:
     "plugin"` command MAY guard against its own `p_{pluginId}__*` tables plus an explicitly enumerated
     set of **core-published guardable read surfaces** (the same "own namespace plus core-published read
     views" boundary ADR-023 §8 already draws for authorizer-sandboxed reads) — never another plugin's
     namespaced tables. This resolves the apparent conflict between this section's own example (a guard
     on a core `users` row) and §6: the example is valid only because `users` is core-published, not
     because guard targets are unscoped. A conflict result for a guard on a core-published surface
     discloses pass/fail only (`committed`/`conflicts`), never the underlying row's values — a failed
     guard is not usable as an oracle to probe state a plugin has no read capability for.
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
   - Dates cross the ABI as **ISO-8601 UTC strings**, never a raw `Date` object. **The canonical form is
     frozen fixed-width (round-4 audit fix, Codex, same gap shape as F1 recurring for dates):**
     `YYYY-MM-DDTHH:mm:ss.sssZ` — always millisecond precision, always the literal `Z` suffix, never a
     numeric timezone offset or a variable number of fractional-second digits. Under this exact
     fixed-width canonical form (and only under it), plain lexicographic string comparison is guaranteed
     to equal chronological order, so ordered-comparison guards (`lt`/`lte`/`gt`/`gte`) on date fields
     MAY be evaluated as plain string comparison — unlike `money-decimal` (Decision item below), where
     variable integer-part length makes lexicographic order unsafe and fixed-point parsing is required
     instead. Core validation rejects any date string that isn't in this exact canonical form (a
     differently-formatted-but-otherwise-valid ISO-8601 string is a validation failure, not a silently
     accepted alternate representation) — this is what makes the lexicographic-comparison shortcut safe
     rather than an assumption.
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
     no such conversion. **The same non-float rule applies to comparison guards, not only mutations
     (Fable independent-verification fix, F1):** ordered-comparison predicates (`lt`/`lte`/`gt`/`gte`)
     against a `money-decimal` field MUST be evaluated using the same BigInt-safe fixed-point semantics
     as relative mutations — parsed to a scaled integer for comparison, never compared as raw text
     (lexicographic string comparison is wrong for decimal strings of differing length, e.g. `"9.50" >=
     "10.00"` is lexicographically true) and never parsed through JS `Number`. Equality/inequality
     (`eq`/`ne`/`in`) on canonical decimal strings remain safe as plain string comparison, since
     canonicalization makes string equality equal value equality — this rule applies only to ordered
     comparisons. **`money-decimal` fields MUST compile to a TEXT-affinity SQLite column** (never
     NUMERIC/REAL affinity) — a NUMERIC-affinity column would silently coerce an inserted canonical
     string through a 64-bit float on write, corrupting the value without ever failing a bind, which
     would defeat this vocabulary's entire purpose one layer below where any validation-time check could
     catch it.
   - **Canonical-format and representation-kind validation applies at both checkpoints, same as operand
     bounds (round-2 audit fix, Codex).** Core validates canonical format and representation kind for a
     field's *statically declared* tagged-scalar type at command registration time (§1). But any tagged
     scalar value supplied from runtime `params` MUST be re-validated at **invocation time** — against
     the field's declared representation kind (`money-int` vs `money-decimal`, ISO-8601 date), canonical
     format, and finiteness/UTC rules — before the compiled IR is admitted to transaction execution. A
     permissive param schema cannot be used to smuggle a non-canonical or wrong-representation runtime
     value past registration-time-only checks. Either checkpoint failing rejects the write before it
     reaches the transaction; an author never discovers a scalar-representation mismatch at the SQLite
     bind step. *(Amends ADR-023 §7.)*
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
- **This design is PROPOSED, on its 7th audit round** — see the Status line and "Debate + Audit record"
  for the full history, including round 6's 3 fixes to the round-5 closed-vocabulary rule and round 7's
  2 fixes to the round-6 numeric-bounding fix itself. A **round-8 full-pass re-audit**
  (`TM-adr026-atomic-write-001`) is owed before ACCEPTED again.
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

Before round-2 dispatch, the Coordinator also ran the `/audit-work` directive's **Internal Subagent
Verification** step (skipped by the round-1 audit subagent) with falsification framing against all 7
mandatory invariants, and found one genuine gap neither external round-1 auditor caught: the
registration-time-only operand-bound check didn't account for runtime-`params`-supplied guard operand
values, letting an author smuggle an oversized `in` array past the bound at invocation. Fixed inline
(§2, "applies at both checkpoints") before round-2 dispatch. Full record:
`.local-artifacts/external-audit/internal-verification/20260711T171500Z-adr026-round2-internal-verification.md`.

**Round-2 diff-only re-audit** (`TM-adr026-atomic-write-001`, same Prior-Round Disposition Ledger plus
the new internal-verification item), run 2026-07-11, **returned FAIL**: agy/Gemini 3.1 Pro (High) **10.0**
(0 findings — all 8 ledger items independently verified resolved), Codex `gpt-5.5` **8.0** (1 new
blocker — the internal-verification fix for operand bounds only extended invocation-time re-checking to
byte/precision/scale/cardinality limits, not to scalar *representation kind and canonical format*; §5
still said that validation happens "at registration time," leaving a gap where a permissive param schema
could supply a runtime `money-decimal`/date value that satisfies size limits but is non-canonical or the
wrong representation kind — the same class of registration-vs-invocation gap as round 1's `codex-B1`,
only partially closed by the round-2 fix). Independently recomputed gate: **FAIL** (one auditor's blocker
alone fails it, regardless of the other's clean score). Codex explicitly did not re-litigate any settled
round-1 item, including the `agy-B3` disagreement, absent new evidence — this finding was novel, scoped
tightly to the un-reviewed internal-verification text, and directly on-target for the threat model's
scalar-vocabulary-corruption domain. Fixed inline (§5, "Canonical-format and representation-kind
validation applies at both checkpoints, same as operand bounds") — the same both-checkpoints pattern
now covers representation/canonical-format validation, not just size bounds. Full round-2 trace:
`.local-artifacts/external-audit/runs/20260711T171700Z-external-audit-report.md`,
offloads `.local-artifacts/external-audit/offloads/20260711T171700Z/`.

**Round-3 diff-only re-audit** (`TM-adr026-atomic-write-001`, narrow scope — verify only `codex-r2-B1`'s
fix and scan for any recurrence of the same gap shape), run 2026-07-11, **returned a unanimous clean
PASS**: agy/Gemini 3.1 Pro (High) **10.0**, Codex `gpt-5.5` **10.0**, zero findings from either. Both
independently confirmed the §5 fix genuinely closes the invocation-time representation/canonical-format
gap; Codex explicitly ran a consistency pass across §2 and §5 before returning its verdict and found no
further recurrence of the registration-vs-invocation gap shape. Full round-3 trace:
`.local-artifacts/external-audit/runs/20260711T173000Z-external-audit-report.md`,
offloads `.local-artifacts/external-audit/offloads/20260711T173000Z/`.

**Round 3 was not the end of the story.** Across the first 3 rounds under `TM-adr026-atomic-write-001`:
round 1 surfaced 5 real, independently-converged-or-novel findings plus one Coordinator disagreement
(documented, not silently resolved); round 2 caught a genuine gap in a Coordinator-authored fix that no
external auditor had yet reviewed, proving the extra round was worth the cost; round 3 closed clean and
unanimous (agy 10.0/Codex 10.0, zero findings). ADR-026 was marked ACCEPTED on that basis.

**Independent Fable-model verification (2026-07-11, explicitly requested rather than assumed
unnecessary after a clean unanimous PASS).** The user asked directly whether a Fable pass had been run
across any of this ADR's debate or audit work — it had not; every external dispatch (debate + all 3
audit rounds) used Codex + agy only, and even the Internal Subagent Verification step before round 2 was
done by the same Sonnet 5 instance that authored the fix being checked, not a genuinely separate model.
A fresh Fable subagent was dispatched with falsification framing against the same frozen threat model,
deliberately withheld any of the authoring/auditing agent's own rationale, and evaluated the ACCEPTED
text cold. **It found 2 further genuine gaps that 2 external auditors across 3 rounds had missed
entirely:**
- **F1 (hard blocker under the frozen TM, domain 3 — scalar-vocabulary data corruption):** the ADR never
  specified how ordered-comparison guards (`lt`/`lte`/`gt`/`gte`) evaluate a `money-decimal` field.
  Lexicographic string comparison is wrong (`"9.50" >= "10.00"` is true as text); JS `Number` parsing
  reintroduces the exact float-precision bug §5 exists to prevent — and neither failure mode trips any
  validation-time check, so both "natural" implementations silently corrupt the guarantee. Separately,
  no column-affinity rule meant a NUMERIC-affinity SQLite column could silently coerce a canonical
  decimal string through a 64-bit float on storage, corrupting the value one layer below any bind-time
  check. This is the same defect *class* all three prior audit rounds kept finding (mutation arithmetic
  in round 1, invocation-time representation checks in round 2) recurring a third time in predicate
  evaluation — a shape none of the prior narrow-scoped rounds were framed to catch, since each was
  scoped to verify a specific prior finding, not sweep the whole grammar fresh.
- **F2 (escalation, domain 5 — scope-discriminant unsoundness):** §2's own flagship read-only-guard
  example ("insert order only if the referenced user is active") named a **core** table as a guard
  target, while §6 said every op in a `scope: "plugin"` batch belongs to the invoking plugin's own
  tables — an unresolved internal contradiction. Read literally, guard targets were unscoped, meaning a
  plugin could attach guards to *another plugin's* tables and use the `committed`/`conflicts` result as
  a pass/fail oracle to probe state it has no read capability for.

Both fixed inline: F1 extends the existing "same non-float rule as mutations" pattern to comparison
guards and mandates TEXT-affinity storage for `money-decimal` columns (§5); F2 imports ADR-023 §8's
"own namespace plus core-published read views" boundary for guard targets specifically, resolving the
§2/§6 contradiction and closing the oracle risk (§2). Fable's own falsification pass otherwise confirmed
every other invariant held — including independently re-deriving that the Coordinator's `agy-B3`
disagreement (keeping the `coordinated` scope discriminant as designed) was defensible, without being
shown the prior reasoning.

**Round-4 diff-only re-audit** (`TM-adr026-atomic-write-001`, scoped to F1/F2 plus one requested fresh
sweep for the same gap shape recurring elsewhere), run 2026-07-11, **returned FAIL**: agy/Gemini 3.1 Pro
(High) **10.0** (0 findings — F1 and F2 both independently verified fixed, fresh sweep found nothing
further), Codex `gpt-5.5` **8.0** (F1 and F2 both verified fixed, but the requested fresh sweep found
**one new recurrence of the exact same gap shape**: ordered-comparison guards (`lt`/`lte`/`gt`/`gte`) on
ISO-8601 date fields had no specified evaluation semantics either — the ADR never froze a fixed-width
canonical date form, so a natural lexicographic-string-comparison implementation is only safe under an
assumption the text never actually guaranteed). This is the *fourth* instance of the same underlying
defect class surfacing across this ADR's audit history (round 1: mutation arithmetic; round 2:
invocation-time representation checks; Fable's F1: comparison guards on money-decimal; round 4: the same
comparison-guard gap recurring for dates) — evidence that "unspecified scalar evaluation/storage
semantics" was a systemic blind spot in how this ADR's scalar vocabulary section was drafted, not a
one-off. Fixed inline (§5): the date canonical form is now frozen fixed-width
(`YYYY-MM-DDTHH:mm:ss.sssZ`, always millisecond precision, always literal `Z`), with an explicit
statement that only under this exact fixed-width form is lexicographic order guaranteed to equal
chronological order — and that core validation rejects any differently-formatted-but-valid ISO-8601
string rather than silently accepting it, which is what makes the comparison shortcut sound rather than
assumed. Before dispatching round 5, the Coordinator also self-swept every other scalar kind (plain
`number`, generic `string`, `boolean`, `null`, `money-int`) for the same gap shape and found none —
`money-int` is BigInt-safe by construction, plain `number`/`string`/`boolean` have no representation-
vs-order mismatch to begin with. Full round-4 trace:
`.local-artifacts/external-audit/runs/20260711T180000Z-external-audit-report.md`,
offloads `.local-artifacts/external-audit/offloads/20260711T180000Z/`.

**Round-5 diff-only re-audit** (`TM-adr026-atomic-write-001`, scoped to `codex-r4-B1`'s date fix plus a
final fresh-sweep request), run 2026-07-11, **returned FAIL**: agy/Gemini 3.1 Pro (High) **10.0** (0
findings — the date fix confirmed, fresh sweep across §2/§5 for scalar comparison/mutation/storage
semantics and namespace scopes found nothing further), Codex `gpt-5.5` **8.0** (date fix confirmed, but
the requested fresh sweep found a **fifth** instance of the same defect class: generic `string` fields
had no specified ordered-comparison collation semantics — "lexicographic" is not itself a single
well-defined comparator across a JS-string / SQLite-BINARY / SQLite-NOCASE / locale-aware / Unicode-
normalized set of candidate implementations, unlike the fixed-width date form where lexicographic order
has one unambiguous meaning).

**Rather than fix this one more instance and risk a sixth recurrence, the Coordinator closed the whole
defect class.** §2 now states a **closed-vocabulary rule**: every scalar-kind/operator combination in
the frozen v1 grammar must have normatively specified evaluation and storage semantics, or it is **not
permitted** — never implementation-defined by default. The full enumeration: `money-int` and
`money-decimal` (as already specified), the fixed-width date form (as already specified), generic
`string` restricted to `eq`/`ne`/`in`/`isNull` only (ordered comparison **disallowed** in v1, closing
`codex-r5-B1` by removing the ambiguous operation rather than picking one more arbitrary collation),
generic `number` bounded to `Number.MAX_SAFE_INTEGER` for both comparison and relative mutation
(a gap the audits hadn't yet reached, closed pre-emptively), and `boolean`/`null` restricted to
`eq`/`ne`/`isNull` (ordered comparison disallowed, same reasoning as strings). Any combination not
enumerated is rejected at registration time as out-of-grammar.

This closes 5 rounds of the same recurring defect class — round 1 (mutation arithmetic), round 2
(invocation-time checks), Fable's F1 (money-decimal comparisons), round 4 (dates), round 5 (strings) —
with a structural rule rather than a sixth type-specific patch, and pre-emptively closes the one
remaining scalar kind (generic `number`) no round had reached yet. Full round-5 trace:
`.local-artifacts/external-audit/runs/20260711T183000Z-external-audit-report.md`,
offloads `.local-artifacts/external-audit/offloads/20260711T183000Z/`.

**User feedback, applied starting round 6:** asked directly why audits were scoped so narrowly; the goal
is to surface and fix as many mistakes as possible, not minimize audit cost. Rounds 1-5 used
progressively narrower diff-only scope, which is exactly what let the same defect class hide in a new
corner each round. Saved as a standing preference for future `/audit-work` re-audits on this project.

**Round-6 full-pass re-audit** (`TM-adr026-atomic-write-001`, first full-document pass since round 1,
explicit adversarial focus on breaking the round-5 fix), run 2026-07-11, **returned FAIL — and it was
worth doing broad**: agy **4.0** (2 blockers: the closed-vocabulary enumeration, read literally, banned
baseline `set`/`in`/`isNull` for every scalar kind — a grammar-breaking regression from round 5's own
fix; generic-`number` bounding omitted `Number.MIN_SAFE_INTEGER`, leaving large-negative values
unprotected), Codex **8.0** (1 blocker: the same bounding also never excluded `NaN`/`Infinity`/
`-Infinity` — a bare range check doesn't catch `NaN`, since every comparison involving it is `false`).
All three fixed: §2 now states baseline operations (`set`/`eq`/`ne`/`in`/`isNull`) as universal and
separate from the ordered-comparison/relative-mutation enumeration; generic `number` now requires
`Number.isFinite` plus a symmetric `[MIN_SAFE_INTEGER, MAX_SAFE_INTEGER]` range check, in that order.
Full round-6 trace: `.local-artifacts/external-audit/runs/20260711T190000Z-external-audit-report.md`.

**Round-7 full-pass re-audit** (`TM-adr026-atomic-write-001`, continuing the standing broad-scope
preference, explicit ask to verify round 6's fixes plus a fresh full-document adversarial sweep), run
2026-07-11, **returned FAIL — both auditors found new blockers in round 6's own fix**: agy/Gemini 3.1 Pro
(High) **6.5** (1 blocker, `agy-r7-B1`: the generic-`number` bound's "at both checkpoints" language
cannot actually apply to a relative-mutation *result* — `increment`/`decrement` operands can only be
bounded as supplied values at registration/invocation; the live row value needed to compute the actual
result doesn't exist until the operation executes inside the transaction, so a decrement past
`MIN_SAFE_INTEGER` on a row already near that bound would underflow silently, uncaught by either
pre-execution checkpoint), Codex `gpt-5.5` **8.0** (1 blocker, `codex-r7-B1`: generic `number` still
admitted `-0` — it passes both `Number.isFinite` and the safe-integer range check, but typical SQLite
storage and JSON-style serialization collapse `-0` to `0` on round-trip, a silent representation
collision for an accepted value, the exact class of bug this vocabulary exists to prevent). Both
auditors independently confirmed round 6's three fixes (baseline-op universality, `MIN_SAFE_INTEGER`
symmetry, `NaN`/`Infinity`/`-Infinity` exclusion) as genuinely resolved before finding these two new,
narrower gaps in the same fix — evidence the full-pass policy continues to earn its cost. Neither
auditor re-litigated `agy-B3`; agy's ledger update explicitly confirmed it `not_reopened`, no new
evidence found. Both fixed inline (§2): a third, execution-time checkpoint now requires core to compute
the post-mutation value inside the same transaction as the write and reject the whole batch if it is
non-finite or out-of-range, in addition to (not instead of) bounding the supplied operand at the two
pre-execution checkpoints; generic `number` now also rejects `-0` (via `Object.is(value, -0)`) at every
checkpoint including the new execution-time one, rather than silently canonicalizing it to `0`. Full
round-7 trace: `.local-artifacts/external-audit/runs/20260711T174228Z-external-audit-report.md`, packet
`.local-artifacts/external-audit/packets/20260711T174228Z-adr026-atomic-write-round7-audit-packet.md`,
offloads `.local-artifacts/external-audit/offloads/20260711T174228Z/`.

**Status remains PROPOSED, on its 8th audit round owed.** A **round-8 full-pass re-audit**
(`TM-adr026-atomic-write-001`) is owed before ACCEPTED. No finding across any round has disputed the
architecture's core shape: named-command surface, core-owned compiled IR, chokepoint preservation,
reads-are-advisory correctness rule. Every finding has been a precision/completeness gap — real, and
both round 6 and round 7 (the first two genuinely broad passes) caught defects in the very fix meant to
close the prior round's finding, which narrow diff-only scoping had been missing. The recurring pattern
across rounds 6-7 specifically (a fix for one numeric-bounding gap introducing or leaving an adjacent
numeric-bounding gap) is worth naming honestly: this defect class may need one more full-pass round
before the Coordinator can defensibly expect a clean sweep, the same way round 5's structural
closed-vocabulary rule was needed after 4 rounds of one-off scalar-semantics patches.
