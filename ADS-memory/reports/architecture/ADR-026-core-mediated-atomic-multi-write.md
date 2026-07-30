# ADR-026: Core-Mediated Atomic Multi-Write Primitive for Plugin Data

- Status: **ACCEPTED** 2026-07-11 (redesigned from a 2-round formal `/debate`; cleared **12 rounds** of
  `/audit-work` under `TM-adr026-atomic-write-001`, per **standing hard rule** (not a soft preference) to
  always use broad/full-pass, 3-auditor audits, never narrow diff-only, plus the **agreed exit
  condition** established after round 9 — a round returning clean or advisory-only across all 3 auditors
  closes the loop. Briefly ACCEPTED after round 3, reopened by an independent Fable pass + rounds 4/5,
  closed structurally in round 5. Rounds 6-8 found and fixed 4 further gaps in the numeric/money corner.
  Round 9 (first with 3-auditor coverage) found 5 more, all fixed. Round 10 found the
  `p_{pluginId}__{tableName}` namespace encoding was not injective (a genuine cross-plugin isolation
  bypass) — fixed with a delimiter-ban rule that round 11 then found was itself incomplete (Codex found a
  case-folding collision; Fable independently found a boundary-underscore-merge collision) — fixed
  structurally with a restricted lowercase-alphanumeric-plus-hyphen grammar (no underscore permitted in
  either component), replacing the delimiter-ban patch. **Round 12 met the exit condition: Codex 9.1 PASS
  (4 advisories), agy 10.0 PASS (zero findings), Fable 9.4 PASS (4 advisories) — zero blockers from any
  auditor, the first unanimous zero-blocker round since round 3 (itself later reopened).** The
  namespace-injectivity invariant — the single highest-suspicion area entering round 12 after being found
  broken in both of the prior two rounds — survived independent from-scratch falsification attempts by
  both Codex and Fable across cross-checked attack families (case-folding, boundary-underscore merges,
  hyphen-boundary effects, Unicode normalization, empty components, SQLite identifier-quoting/DQS
  behavior, identifier truncation, prefix-subsumption) with zero collisions found by either. All 5
  corroborated round-12 advisories folded (mandatory SQLite identifier quoting given the grammar admits
  hyphens; an ADR-023 pluginId-charset alignment note; a core-defined identifier length bound; explicit
  `null`-guard lowering via `isNull` rather than `eq`/`ne`/`in` with a null operand; generic-`number`
  affinity pinned to `REAL` rather than left as `REAL`-or-`INTEGER`). See "Debate + Audit record" for the
  full 12-round history. **Amends ADR-024 §3** and **ADR-023 §7**.
- Author: Leon Aburime / Coordinator (Claude Sonnet 5 Primary) with debate peers Codex `gpt-5.5`,
  Gemini 3.1 Pro (`agy`); original `/cowork` probe with Opus 4.8/Fable/Codex/agy
- Extends / amends: **ADR-024** (§3 transport-agnostic frozen ABI), **ADR-023** (§7 typed core-owned writes)
- Relates: ADR-005 (semver promise → why this is decide-now), ADR-022 (single write chokepoint + attribution), SPEC-005
- Evidence: `reports/spikes/20260709-plugin-abi-ergonomics-finding.md` (the original cowork finding +
  measured numbers) and the Tier-3 store checkout spike (`src/features/plugins/**`); debate
  `ADS-memory/reports/swarm-consensus/runs/20260711T160337Z-adr026-atomic-write-consensus-report.md`.

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
     - `money-int`: both use native BigInt-safe integer semantics — arithmetically exact by
       construction (round-9 audit fix, Fable's r9-L2 finding: the prior "safe by construction"
       phrasing read as if it exempted `money-int` from any further check; it does not — result
       bounds remain subject to the execution-time checkpoint below, same as every other kind).
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
       mutation-result checkpoint alike — never silently canonicalized to `0`. **Relative mutation on
       generic `number` is restricted to safe-integer arithmetic only (round-9 audit fix, Codex's
       r9-B1 finding):** the safe-integer *range* bound above does not by itself require the value to
       *be* an integer — a fractional operand (e.g. `increment: 0.1`) is still "within range" and
       "finite," but IEEE-754 double precision loses granularity as magnitude approaches
       `Number.MAX_SAFE_INTEGER` (the gap between adjacent representable doubles grows past 1 near that
       bound), so a fractional increment applied to a live value near that bound can silently round to
       no observable change at all — a committed write that had no actual effect, passing every stated
       finiteness/range/`-0` check. `set`/`eq`/`ne`/`in`/`isNull` remain usable with any finite in-range
       value, fractional or not (they do no arithmetic, so no precision risk exists). But `increment`/
       `decrement` on generic `number` additionally requires the supplied operand, the live current
       value read from the row, and the computed result to each satisfy `Number.isSafeInteger` — at
       registration (operand, where statically known), invocation (operand), and the execution-time
       checkpoint (live current value and computed result) — rejecting the whole batch if any of the
       three is a safe-integer-range value that is not itself an integer. Authors needing fractional
       relative mutation should use `money-decimal`'s fixed-point arithmetic, which has no such
       precision boundary within its declared scale.

     **The execution-time result checkpoint generalizes to every scalar kind with relative mutation,
     not generic `number` alone (round-8 audit fix, Codex's r8-B1 finding):** `money-int` and
     `money-decimal` have the identical live-row-unknown-until-execution problem as generic `number` —
     a bounded current value plus a bounded operand can compute a result that exceeds the field's
     core-defined byte/precision/scale limit even though neither the current value nor the operand
     individually did (e.g. a scale-2 `money-decimal` field bounded to `999.99` receiving `increment:
     0.01` computes `1000.00`, one digit past the field's declared precision). Core MUST validate the
     computed post-mutation result of any relative mutation — `money-int`, `money-decimal`, or generic
     `number` alike — against the target field's declared representation kind, canonical grammar,
     `-0`/`-0.00` exclusion, scale, and core-defined byte/precision limits, inside the same transaction
     as the write, before the result is stored; failure rolls back the whole batch (same all-or-nothing
     rule as any other guard/op failure, §2). This is the same both/now-three-checkpoints pattern applied
     uniformly across every scalar kind capable of relative mutation, not a generic-`number`-specific
     carve-out.
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
     pattern). **A `null` operand for `eq`/`ne`/`in` is out-of-grammar, rejected at registration
     (round-12 audit fix, Codex's r12-A3 finding):** SQL's three-valued NULL comparison semantics mean
     `= NULL` never evaluates true even when the column is actually `NULL`, so a naively-lowered
     `eq: null` guard would silently never match and never fail loudly — the exact "unspecified
     evaluation semantics" trap the closed-vocabulary rule exists to close. A `null`-valued comparison
     MUST be expressed via `isNull`, never `eq`/`ne`/`in` with a `null` operand. **`expectedVersion`'s
     operand kind is normative (round-10 audit fix, Fable's r10-L2
     finding):** unlike every other guard predicate, `expectedVersion` was not tied to a declared field
     kind in the closed scalar vocabulary — the one guard operand the closed-vocabulary rule's own
     enumeration didn't formally reach, the same recurring "a scalar the vocabulary rule doesn't reach"
     shape this ADR's history keeps finding. `expectedVersion`'s operand is core-defined: a non-negative
     safe integer, validated at registration and invocation like any other operand — never a
     plugin-suppliable arbitrary scalar. **The counter `expectedVersion` compares against is normative
     per target table family, not literally the `entries` table's column alone (round-11 audit fix,
     Fable's r11-A1 finding):** the round-10 text cited "the entry revision counter, ADR-022," but a
     `scope: "plugin"` command's ops target `p_{pluginId}__*` plugin-owned tables (ADR-023), not the
     `entries` table itself. Every table core mediates writes for — `entries` and every
     `p_{pluginId}__*` plugin table alike — carries its own per-row monotonic revision counter under the
     same ADR-022 discipline (ADR-023 §7's inherited revision journal); `expectedVersion` compares
     against that row's own counter on whichever table the op targets, never against a different table's
     counter. **`expectedVersion` against a nonexistent row is normative (round-11 audit fix, agy's
     r11-A3 finding):** the predicate presupposes the row exists — if the targeted row does not exist,
     the guard fails (`conflicts`) regardless of the supplied value, including `expectedVersion: 0`. An
     author asserting "this row must not exist" MUST use `notExists`, never `expectedVersion`, which is
     not an existence check. **Intra-batch execution order is
     normative, not implementation-defined (round-9 audit
     fix, Codex's r9-B2 finding):** the ordered batch executes strictly sequentially in its declared
     order — for each op, its guard(s) are evaluated immediately before that op, against the
     transactional state as of that point, which reflects every prior op in the same batch that has
     already applied. No implementation may hoist or batch-evaluate guards against pre-batch state.
     Concretely: two sequential ops on the same row, each guarded `stock >= 1` with a `decrement: 1`
     mutation, starting from `stock = 1` — the first op's guard passes and applies, leaving `stock = 0`;
     the second op's guard then evaluates against that updated state, sees `stock = 0`, fails, and rolls
     back the whole batch. An implementation that pre-evaluates all guards against the pre-batch
     snapshot instead of sequentially would incorrectly let both ops pass and store `stock = -1`,
     violating the guard's own invariant while still technically reading "live row state inside the same
     transaction" — this rule closes that reading gap.
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
     rather than an assumption. **Canonical form additionally requires calendar-valid component ranges,
     not fixed-width shape alone (round-9 audit fix, Fable's r9-B1 finding):** `MM` must be `01`-`12`;
     `DD` must be valid for the given month and year (accounting for leap years); `HH` must be
     `00`-`23`; `mm` and `ss` must each be `00`-`59`. Shape-only validation (matching the fixed-width
     pattern without checking these ranges) is insufficient and creates exactly the representation
     collision this canonical form exists to prevent: `T24:00:00.000Z` is valid ISO-8601:2004 shape and
     matches the fixed-width pattern exactly, yet denotes the same instant as the following day's
     `T00:00:00.000Z` — two accepted strings for one instant, breaking both `eq` (false for equal
     instants) and the lexicographic-order-equals-chronological-order guarantee this whole shortcut
     depends on. Leap-second `:60` is rejected for the same bijection reason. A calendar-impossible
     value (`02-30`, month `13`) is shape-canonical under a naive width-only regex but denotes no instant
     at all — core validation MUST check calendar validity, not merely component width, at both
     checkpoints (registration, invocation; dates define no relative mutation, so no execution-time case
     applies here).
   - **Money and exact-decimal fields have exactly one declared representation each — never a choice
     (round-1 audit fix, converged finding: Codex #2 + agy #2).** A field's manifest schema declares it
     as `type: "money-int"` (minor-unit integer, e.g. cents) or `type: "money-decimal"` (canonical,
     finite, scale-bounded decimal string) — never both. Binary floating-point `number` is explicitly
     rejected by core validation for either kind, not discovered as a runtime error at the storage layer
     the way the spike's Date rejection was. **`money-int`'s wire representation is a canonical base-10
     integer string, not a JS `number` (pre-round-8 self-review fix, same gap shape as the original Date
     trap):** every other scalar kind states its exact wire/storage representation explicitly (dates as
     ISO-8601 strings, `money-decimal` as a decimal string below) — `money-int` previously said only
     "minor-unit integer" without stating the representation, leaving the "BigInt-safe by construction"
     claim unfounded: if the value crossed the ABI as a JS `number`, it would be exactly as
     float-precision-vulnerable as generic `number`, with none of generic `number`'s stated bounds.
     `money-int` crosses the ABI, is validated, and is stored as a base-10 integer string (optional
     single leading `-` for strictly negative values, never present for zero, no leading zeros beyond a
     mandatory single `0`, no decimal point, no exponent notation) — parsed to a native `BigInt` for
     comparison and relative mutation, re-rendered as the same canonical string form afterward, never
     passed through a JS `number` at any point. Same `-0`-shaped rule as generic `number` (round-7 fix):
     a canonical zero `money-int` string is always `"0"`, never `"-0"`; core rejects a supplied or
     stored value violating this at every checkpoint. **`money-int` fields MUST compile to a
     TEXT-affinity SQLite column**, same rationale and same rule as `money-decimal` below — an
     INTEGER-affinity column is bounded to 64-bit signed range and could still silently truncate an
     unusually large aggregate value; TEXT-affinity plus explicit `BigInt` arithmetic removes that
     ceiling entirely, matching the "safe by construction" claim this type makes.
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
     comparisons. **The canonical decimal-string form is exactly specified (pre-round-8 self-review fix,
     same "asserted canonical, never defined" gap shape the date fix (round 4) already closed once):**
     prior text called this representation "canonical" without ever stating the grammar — the same
     omission the original Date trap and round-4's date fix both existed to close, just not yet applied
     here. The canonical form is: an optional single leading `-` for strictly negative values only
     (never present when the value is zero, at any scale — `"-0.00"` is invalid, canonical zero is
     always unsigned, e.g. `"0.00"`), no `+` sign, an integer part with no redundant leading zeros
     (exactly `"0"` when the integer part is zero, never `"00"` or similar), a literal `.` decimal point,
     and **exactly the field's declared `scale` fractional digits** — never fewer (e.g. `"9.5"` for a
     scale-2 field is invalid; `"9.50"` is required) and never more. No exponent notation, no whitespace.
     **Declared `scale` MUST be at least 1 (round-9 audit fix, Fable's r9-L1 finding):** a scale of `0`
     would require a canonical form with zero fractional digits — a dangling decimal point (`"9."`) with
     no principled resolution for whether the point is even present, breaking the same canonical-
     uniqueness guarantee this grammar exists to provide. A field with no fractional precision is a
     `money-int` field by definition; core's registration-time validation (§1) rejects any `money-decimal`
     field declared with `scale: 0`.
     Equality/inequality on two canonical strings is safe as plain string comparison specifically
     *because* this exact grammar makes canonical form a bijection with value — a differently-formatted
     but numerically-equal string (extra/missing trailing zeros, a `+` sign, `-0.00`) is a validation
     failure at both checkpoints, never a silently accepted alternate representation, same as the date
     rule. **`money-decimal` fields MUST compile to a TEXT-affinity SQLite column** (never
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
   - **Column affinity is normative for every scalar kind, not money kinds alone (round-10 audit fix,
     Fable's r10-L3 finding):** `money-int`/`money-decimal` already require TEXT-affinity above; the
     remaining kinds were left to implementation discretion, an unclosed representation-ambiguity gap of
     the same class this ADR exists to prevent. Date fields compile to a **TEXT-affinity** column
     (dates cross the ABI and store as the frozen canonical string, never a numeric encoding). Generic
     `number` fields compile to a **REAL-affinity** column, never TEXT or INTEGER (round-12 audit fix,
     Fable's r12-A4 finding, pinning what round 10 originally left as an open "REAL or INTEGER" choice —
     see below) — the safe-integer restriction on relative mutation (above) already guarantees exactness
     within SQLite's native numeric storage, so no fixed-point/string workaround is needed here. `boolean`
     fields compile to an
     **INTEGER-affinity** column using the canonical `0`/`1` encoding (SQLite has no native boolean
     type); core never stores or reads a `boolean` field as any other representation. **Round-10's
     affinity rule still omitted two scalar kinds (round-11 audit fix, Codex's r11-B2 finding,
     corroborated at advisory severity by agy's r11-A1):** generic `string` fields compile to a
     **TEXT-affinity** column — the same canonicalization/exact-identity guarantee `eq`/`ne`/`in` rely on
     for strings (above) requires the stored bytes to round-trip exactly, which only TEXT affinity
     guarantees; a NUMERIC/REAL-affinity column would silently coerce a numeric-looking string literal
     (e.g. `"123"`) through SQLite's type-affinity conversion, breaking exact string-identity comparison.
     **Generic `number` fields compile to `REAL` affinity specifically, not "REAL or INTEGER" (round-12
     audit fix, Fable's r12-A4 finding):** leaving the choice open is the same "two conforming
     implementations may observably diverge" gap shape this ADR's coordinated-scope checkpoint rule
     already closes elsewhere (§6) — a raw Tier-3 read could observe a different underlying SQLite
     storage class depending on which affinity an implementation picked. `REAL` is pinned as the single
     required affinity: every value admissible under the safe-integer/finite/`-0`-excluded rules above
     round-trips exactly through SQLite's `REAL` storage class, so pinning it costs nothing while
     removing the divergence. **`null` is not itself a declarable field kind and has no independent
     column affinity:** every
     field's declared kind (`money-int`, `money-decimal`, date, generic `string`, generic `number`,
     `boolean`) may independently permit a `NULL` value in its own column, governed by that field's own
     affinity above and checked via `isNull`-style guards; the closed-vocabulary enumeration lists
     `boolean`/`null` together only to state that neither defines ordered comparison or relative
     mutation, not to declare `null` a sixth scalar storage kind.
   - **The date canonical form's year domain is explicit, not delegated to host `Date` parsing
     (round-10 audit fix, Codex's r10-A1 finding):** `YYYY` is a 4-digit proleptic-Gregorian year in the
     range `0001`-`9999`; core validation performs its own calendar-range check against this fixed
     4-digit domain rather than delegating to a host `Date` parser, whose leap-year and edge-year
     handling varies across runtimes and could silently accept or reject differently than this ADR's own
     stated grammar.
6. **Cross-plugin scope: a frozen discriminant, not a built mechanism.** Every command/envelope carries
   `scope: "plugin" | "coordinated"`. `"plugin"` (the only executable value in v1) means every op in the
   batch belongs to the invoking plugin's own tables. **Core derives the allowed table namespace from
   the invoking capability's `pluginId`, not from anything the manifest declares (round-1 audit fix,
   Codex #4)** — a `scope: "plugin"` command's manifest-provided table names can never override or widen
   that namespace; this is enforced at compilation, same as any other IR grammar rule. **The
   `p_{pluginId}__{tableName}` encoding MUST be injective, enforced at registration time (round-10 audit
   fix, Fable's r10-B1 finding):** the prefix-check namespace derivation is only a real isolation
   boundary if no two distinct `(pluginId, tableName)` pairs can compile to the same physical table
   name. As stated through round 9, nothing constrained either grammar, so this was false: plugin
   `shop` registering an "own" table literally named `eu__orders` compiles to physical table
   `p_shop__eu__orders` — the exact same physical name plugin `shop__eu` registering table `orders`
   would compile to. A `scope: "plugin"` command from `shop__eu` would then pass the capability-derived
   `p_shop__eu__` prefix check while actually mutating (or, via a read-only guard, probing) `shop`'s
   table — a direct violation of the mandatory cross-plugin isolation invariant, using only plausible,
   non-exotic names. This is the same recurring defect shape as the date canonical-form gap (round 9):
   an encoding whose *safety property* (here, injectivity; there, the string-to-instant bijection) was
   never actually validated, only assumed from the encoding's shape. **Round-10's `__`-delimiter ban did
   not actually achieve injectivity (round-11 audit fix, Codex's r11-B1 and Fable's r11-B1 findings, two
   independent counterexamples in the same area, found by two different auditors):** banning only the
   literal `__` substring closes the *embedded-`__`* family of collisions (`shop` + `eu__orders` vs.
   `shop__eu` + `orders`) but leaves two further residual collision families untouched, both demonstrated
   concretely: (1) **boundary-underscore merge** — a single trailing `_` on a `pluginId` (or single
   leading `_` on a `tableName`) merges with the `__` delimiter itself, so `acme_` + `inventory` and
   `acme` + `_inventory` both compile to `p_acme___inventory`, with neither component containing the
   banned `__` sequence; (2) **case-folding collision** — SQLite resolves table identifiers
   case-insensitively regardless of what this ADR's grammar permits, so distinct case-sensitive strings
   `Shop` and `shop` (both valid under a charset rule that bans only `__`) compile to identifiers SQLite
   treats as identical, e.g. `p_Shop__orders` and `p_shop__orders`. Both defects independently reopen the
   same mandatory cross-plugin isolation invariant round 10 already found broken once — patching each
   newly-demonstrated collision pattern one at a time is the exact whack-a-mole this ADR's
   scalar-vocabulary history (rounds 1-5) already proved doesn't converge. **Core's registration-time
   validation (§1) therefore closes the whole defect class structurally, replacing the round-10 rule
   rather than extending it:** both `pluginId` and every plugin-registered `tableName` MUST match the
   fixed grammar `^[a-z0-9]+(-[a-z0-9]+)*$` — lowercase ASCII alphanumerics and internal hyphens only, no
   underscore anywhere, no uppercase, non-empty, never starting or ending with a hyphen. Core rejects any
   `pluginId` or `tableName` violating this grammar at registration time, as out-of-grammar (§1). Because
   neither component can contain `_` at all, the `p_{pluginId}__{tableName}` encoding's `__` delimiter
   cannot be produced by any component-boundary merge — the first (and only) `__` after the fixed `p_`
   prefix is unconditionally the boundary, closing collision family (1). Because the grammar admits only
   lowercase characters, SQLite's case-fold has no effect on an already-canonical-case string, so no two
   grammar-admissible, textually-distinct `(pluginId, tableName)` pairs can resolve to the same SQLite
   identifier, closing collision family (2). **The injectivity obligation this ADR states explicitly, for
   any future revision of this grammar:** no two distinct `(pluginId, tableName)` pairs admissible under
   the grammar may concatenate, under SQLite's own identifier-equality semantics (not merely
   byte-equality), to the same physical table name — verifying only byte-level distinctness, as the
   round-10 fix implicitly did, is not sufficient. This closes the collision for both the mutation-scope
   rule above and the guard-target rule in §2 at once, since both rules derive from this same namespace
   encoding. **`pluginId` and `tableName` MUST additionally satisfy a core-defined maximum length limit
   (round-12 audit fix, corroborated by Codex's r12-A4 and Fable's r12-A3 findings):** this is a
   resource/cost-bound requirement, consistent with §2's existing operand-bound discipline applied
   uniformly elsewhere — not an injectivity requirement, since SQLite does not truncate identifiers (a
   future fix-by-truncation would itself re-break injectivity and MUST NOT be used to enforce this
   bound; truncation-based enforcement is out-of-grammar, oversized input is rejected outright). **Every
   compiled physical identifier MUST be emitted as a properly quoted SQLite identifier in all generated
   SQL (round-12 audit fix, corroborated by Codex's r12-A1 and Fable's r12-A2 findings):** because the
   grammar admits hyphens, a compiled name such as `p_acme-shop__orders` is not a valid unquoted SQLite
   identifier — unquoted, it either fails to parse or, if SQLite's legacy double-quoted-string
   misfeature is enabled, could silently resolve as a string literal in a context where the identifier
   was expected. Implementations MUST quote every compiled physical identifier universally and SHOULD
   build/configure SQLite with double-quoted-string literals disabled (`SQLITE_DQS=0`), so a missed
   quote fails loudly rather than silently misresolving. **This ADR's grammar governs
   command-registration-time enforcement; ADR-023's own `pluginId`-uniqueness rule should be read as
   scoped to this same charset (round-12 audit fix, corroborated by Codex's r12-A2 and Fable's r12-A1
   findings):** a `pluginId` admitted by ADR-023 outside this grammar would install successfully yet be
   unable to register any command under this ADR — a confusing late failure, not an injectivity break
   (the reject-don't-fold design here means two ADR-023-distinct plugin IDs are never merged together
   regardless), but ADR-023's own text should state this same charset as its `pluginId` uniqueness
   domain to avoid cross-document drift.
   **A registered `scope: "coordinated"` command is accepted at registration and rejected only at
   invocation (round-10 audit fix, Fable's r10-L1 finding):** this was previously unstated — either
   choice would have preserved the non-breaking-v2 invariant, but leaving the checkpoint unstated risked
   two conforming implementations diverging observably (one refusing to install a coordinated-shaped
   manifest, another installing it and only failing at invocation). Registration-accept /
   invocation-reject is the stated rule, since it lets authors ship v2-ready manifests before
   coordinated execution exists. `"coordinated"` is recognized and its shape reserved (a
   `participants`/coordination metadata slot) but rejected at invocation in v1 with a stable error
   (`COORDINATED_SCOPE_UNSUPPORTED`) — real cross-plugin execution depends on
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
- **This design is ACCEPTED, 12 audit rounds completed** — see the Status line and "Debate + Audit
  record" for the full history, including round 9's 5 fixes, round 10's 5 fixes, round 11's 5 fixes
  (namespace encoding closed structurally via a restricted lowercase-alphanumeric-plus-hyphen grammar
  rather than a delimiter-ban patch, generic-string/`null` column affinity, `expectedVersion`'s
  per-table-family counter source and nonexistent-row semantics), and round 12's 5 folded advisories
  (mandatory identifier quoting, ADR-023 charset alignment, identifier length bound, `null`-guard
  lowering, generic-`number` affinity pinned to `REAL`). Round 12 met the agreed exit condition (clean or
  advisory-only across all 3 auditors) with zero blockers from any of the 3 auditors — no further audit
  round is owed under `TM-adr026-atomic-write-001` absent a future material change to this ADR's text.
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
`ADS-memory/reports/swarm-consensus/runs/20260711T160337Z-adr026-atomic-write-consensus-report.md`).**
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
`ADS-memory/.local-artifacts/external-audit/runs/20260711T164621Z-external-audit-report.md`,
proposed fixes
`ADS-memory/.local-artifacts/external-audit/proposed-fixes/20260711T164621Z/proposed-fixes.md`,
raw offloads `ADS-memory/.local-artifacts/external-audit/offloads/20260711T164621Z/`.

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

**User feedback after round 7 (2026-07-11, escalated from a preference to a hard rule):** the user
reacted strongly to reaching round 8 with each round catching one narrow numeric edge case at a time —
"dont EVER do narrow /audit-work scope again unless I tell you!!" Full/broad scope was already in effect
since round 6 and was never actually narrowed, but the underlying frustration was legitimate: paying for
two external LLM rounds to surface one narrow bug at a time is a bad trade when the Coordinator could
plausibly find more of the same shape itself, for free, first. Saved as a permanent standing rule (not
situational), and applied immediately below.

**Pre-round-8 Coordinator self-review (2026-07-11, no external tokens spent).** Before dispatching
another external round, the Coordinator re-read §2/§5 adversarially against the exact recurring defect
shape (an "asserted safe" scalar type whose actual wire/storage representation or canonical format was
never pinned down) and found **2 more instances neither of the first 7 rounds had reached**:
- **`money-int`'s wire representation was never specified at all.** Every other scalar kind states its
  exact representation (dates as ISO-8601 strings, `money-decimal` as a decimal string) — `money-int`
  was described only as "minor-unit integer," leaving its "BigInt-safe by construction" claim unfounded:
  if it crossed the ABI as a JS `number`, it would be exactly as float-precision-vulnerable as generic
  `number`, with none of generic `number`'s stated bounds. This is the original Date-trap shape recurring
  in a spot no round-1-through-7 audit had examined, because every prior round's adversarial attention
  was drawn to the fields that already *had* a stated representation to attack.
- **`money-decimal`'s "canonical" form was asserted but never defined.** Unlike the date's exact frozen
  grammar, nothing stated the required fractional-digit count, leading-zero rule, sign rule, or whether
  `-0.00`-shaped values are legal — the same `-0` collision class round 7 just fixed for generic
  `number`, recurring for decimals, and the same "canonical without a grammar" omission the date fix
  (round 4) already closed once elsewhere in this same section.

Both fixed inline (§5): `money-int` now crosses the ABI as a canonical base-10 integer string (parsed to
native `BigInt` for arithmetic/comparison, TEXT-affinity storage, same `-0`-exclusion rule as generic
`number`) rather than an unspecified representation; `money-decimal`'s canonical form is now exactly
specified (sign rule, leading-zero rule, exact scale-matched fractional-digit count, no exponent,
`-0.00` explicitly invalid) with the same both-checkpoints validation pattern used elsewhere in this ADR.

**Round-8 full-pass re-audit** (`TM-adr026-atomic-write-001`, dispatched as a confirmation pass over
round 6/7/self-review fixes plus a fresh full-document sweep), run 2026-07-11, **returned agy 10.0 PASS,
Codex 8.0 FAIL**: agy/Gemini 3.1 Pro (High) **10.0** (zero findings — independently verified all 7 prior
ledger items as genuinely fixed, including both self-review fixes, after real adversarial effort against
generic-number edge cases, money representation ambiguity, scope-escape attempts, and command-
registration gaps). Codex `gpt-5.5` **8.0** (1 blocker, `codex-r8-B1`: the execution-time result-
validation checkpoint added in round 7 was scoped to generic `number` only — `money-int` and
`money-decimal` relative mutations have the identical live-row-unknown-until-execution problem; a
bounded current value plus a bounded operand can compute a result exceeding the field's core-defined
byte/precision/scale limit, e.g. a scale-2 `money-decimal` field bounded to `999.99` receiving
`increment: 0.01` computes `1000.00`, one digit past its declared precision, and nothing catches this
before storage). This is the exact same defect shape recurring a further time — an execution-time
checkpoint fix (round 7) that was correct but scoped to only one of several scalar kinds needing it,
the same class of "fix doesn't generalize" gap round 6 found in round 5's closed-vocabulary rule. Fixed
inline (§2): the execution-time result-validation rule is now stated as applying to every scalar kind
capable of relative mutation — `money-int`, `money-decimal`, and generic `number` alike — not a
generic-`number`-specific carve-out. Full round-8 trace:
`.local-artifacts/external-audit/runs/20260711T175952Z-external-audit-report.md`, packet
`.local-artifacts/external-audit/packets/20260711T175952Z-adr026-atomic-write-round8-audit-packet.md`,
offloads `.local-artifacts/external-audit/offloads/20260711T175952Z/`.

**Round-9 full-pass re-audit** (`TM-adr026-atomic-write-001`, dispatched with a third independent
auditor — a Fable subagent, alongside Codex + agy, per the user's request to add Fable coverage), run
2026-07-11, **returned agy 10.0 PASS, Codex 7.0 FAIL, Fable 8.2 FAIL — genuinely new findings from both
non-agy auditors, no overlap between them**:

- **agy/Gemini 3.1 Pro (High) 10.0** — zero findings, a fresh full sweep after an earlier transport
  timeout on the first dispatch attempt (agy's own client-side "timeout waiting for response," not a
  malformed prompt — a cheap handshake probe confirmed the transport was healthy before a clean retry
  succeeded).
- **Codex `gpt-5.5` 7.0 FAIL, 2 blockers:** `codex-r9-B1` — generic `number`'s safe-integer *range*
  bound never required `Number.isSafeInteger`; a fractional `increment` (e.g. `0.1`) applied to a live
  value near `Number.MAX_SAFE_INTEGER` can silently round to no observable change at all (IEEE-754's
  representable-value gap exceeds 1 near that magnitude), a committed write with no actual effect,
  passing every stated finiteness/range/`-0` check — the same "silently loses precision without
  tripping any validation-time check" defect class this ADR exists to close, recurring for generic
  `number` specifically under relative mutation. `codex-r9-B2` — intra-batch guard-evaluation ordering
  was never made normative: nothing states whether each op's guards are evaluated sequentially against
  state as mutated by prior ops in the same batch, or hoisted upfront against pre-batch state: for two
  sequential `decrement: 1` ops guarded `stock >= 1` starting from `stock = 1`, sequential evaluation
  correctly rejects the second op (stock is 0 after the first), while upfront/hoisted evaluation would
  incorrectly let both pass and store `stock = -1` — a genuine atomicity-adjacent guard-soundness gap
  (domain 2), not scalar vocabulary.
- **Fable (independent subagent, no author rationale shown, falsification framing) 8.2 FAIL, 1 blocker
  + 2 low:** `fable-r9-B1` — the date canonical form specified fixed-width *shape* only, never calendar
  validity; `T24:00:00.000Z` is valid ISO-8601:2004 shape and matches the canonical pattern exactly, yet
  aliases the following day's `T00:00:00.000Z` — one instant, two accepted strings, breaking both `eq`
  and the lexicographic-order-equals-chronological-order guarantee the whole date-comparison shortcut
  depends on; a naive shape-only validator would also admit calendar-impossible values (`02-30`, month
  `13`) that denote no instant at all. This is the same recurring defect class (an "asserted canonical"
  form that wasn't actually fully specified) landing in the one remaining corner — dates' calendar
  validity — that 8 prior rounds focused on numeric/money representation never reached. `fable-r9-L1`
  (low) — `money-decimal`'s canonical grammar required "exactly `scale` fractional digits," which for a
  hypothetical `scale: 0` field would require a dangling decimal point with no principled resolution;
  fixed by requiring `scale >= 1` for `money-decimal` (a scale-0 field is `money-int` by definition).
  `fable-r9-L2` (low, doc-hygiene) — `money-int`'s "safe by construction" phrasing could be misread as
  exempting it from the round-8 execution-time result check, which it is not; reworded for clarity.
  Fable independently re-derived `agy-B3` as `not_reopened` without new evidence, and confirmed all 8
  prior ledger items (round 6 x3, round 7 x2, self-review x2, round 8 x1) as genuinely fixed by
  cross-referencing each fix's stated commit against the current text.

All 5 real findings fixed inline: generic `number`'s `increment`/`decrement` now requires
`Number.isSafeInteger` on the supplied operand, live current value, and computed result alike (§2, not
just finiteness/range/`-0`) — `set`/`eq`/etc. remain usable with any finite in-range value including
fractions, since only relative mutation carries the arithmetic precision risk; the ordered batch's
execution order is now explicit — strictly sequential, each op's guards evaluated against the state as
of immediately before that op including all prior successful ops in the same batch (§2); the date
canonical form now requires calendar-valid component ranges in addition to fixed-width shape, with
`T24:00` and leap-second `:60` explicitly rejected (§5); `money-decimal`'s declared `scale` must be at
least 1 (§5); `money-int`'s "safe by construction" phrasing now explicitly notes result bounds remain
subject to the execution-time checkpoint (§2). Full round-9 trace:
`.local-artifacts/external-audit/runs/20260711T181056Z-external-audit-report.md`, packet
`.local-artifacts/external-audit/packets/20260711T181056Z-adr026-atomic-write-round9-audit-packet.md`,
offloads `.local-artifacts/external-audit/offloads/20260711T181056Z/`.

**Status remains PROPOSED, 9 audit rounds completed plus the pre-round-8 self-review.** No finding
across any round or the self-review has disputed the architecture's core shape: named-command surface,
core-owned compiled IR, chokepoint preservation, reads-are-advisory correctness rule. Every finding has
been a precision/completeness gap — real, and round 9 (the first round with 3-auditor coverage) found
its 2 sharpest findings (date calendar validity, intra-batch guard ordering) in corners no prior round
had examined, while a fourth auditor perspective (agy) came back clean, illustrating that different
models continue to catch genuinely different gaps in this same document even at round 9. **After round
9, given the sheer round count, the Coordinator and user agreed an explicit exit condition rather than
continuing open-ended: if a future round returns clean or advisory-only across all 3 auditors, ADR-026
is marked ACCEPTED and the loop stops there** — auditors still apply full adversarial effort regardless;
the exit condition only affects what the Coordinator does with a clean/advisory-only result.

**Round-10 full-pass re-audit** (`TM-adr026-atomic-write-001`, 3-auditor coverage continued, agreed exit
condition in effect), run 2026-07-11, **returned Codex 9.6 PASS, agy 10.0 PASS, Fable 8.6 FAIL — exit
condition not met, one real blocker found**:

- **Codex `gpt-5.5` 9.6, PASS, 1 advisory (`codex-r10-A1`):** all 5 round-9 fixes independently verified
  correct and complete (including an explicit arithmetic argument for the safe-integer fix: any sum that
  would round under IEEE-754 necessarily lands outside the safe-integer range, where the execution-time
  checkpoint rejects it — exactness inside the accepted range is structural, not incidental). One
  advisory, not blocking: the date canonical form's year domain (`YYYY`) was never pinned to an explicit
  range, risking silent divergence if an implementation delegates calendar validation to a host `Date`
  parser instead of its own grammar.
- **agy/Gemini 3.1 Pro (High) 10.0, PASS, zero findings:** a full fresh sweep including explicit
  stress-testing of "the `scope: 'plugin'` namespace isolation" — notably, this specific claim is where
  Fable (below) found a real gap agy's own adversarial pass missed, underscoring that even a model
  that explicitly targets the right area doesn't always find what's there.
- **Fable (independent subagent, no author rationale, falsification framing) 8.6, FAIL, 1 blocker +
  3 low (`fable-r10-B1` through `fable-r10-L3`):** `fable-r10-B1` (domain 5, high confidence) — the
  `p_{pluginId}__{tableName}` namespace-derivation encoding was never required to be injective. Fable
  cross-referenced ADR-023, ADR-024, and ADR-004 and found no grammar constraint on either `pluginId` or
  plugin table names that would prevent this: plugin `shop` registering an "own" table literally named
  `eu__orders` compiles to physical table `p_shop__eu__orders` — the identical physical name plugin
  `shop__eu` registering table `orders` would produce. A `scope: "plugin"` command from `shop__eu` would
  pass the capability-derived prefix check while actually mutating (or guard-probing) `shop`'s table, a
  direct cross-plugin isolation violation using only plausible names, no exotic exploit. Same recurring
  defect shape as the round-9 date-aliasing bug: an encoding whose safety property (there, the
  string-to-instant bijection; here, prefix injectivity) was assumed from shape, never actually
  validated. Three low-severity notes: `fable-r10-L1` — the checkpoint for `scope: "coordinated"`
  rejection (registration vs. invocation) was never stated, an implementation-divergence risk; `fable-r10-L2`
  — `expectedVersion`'s guard operand was the one predicate the closed-vocabulary rule's own enumeration
  didn't formally reach; `fable-r10-L3` — column affinity was normative for `money-int`/`money-decimal`
  only, leaving date/number/boolean's SQLite storage representation to implementation discretion. Fable
  also independently re-verified all 5 round-9 fixes (agreeing with Codex) and explicitly declined to
  re-litigate `agy-B3`.

All 5 findings fixed inline: §6 now requires the `p_{pluginId}__{tableName}` encoding to be injective,
enforced at registration time by rejecting any plugin table name or `pluginId` containing the literal
`__` delimiter — closing the collision for both the mutation-scope rule and the §2 guard-target rule at
once, since both derive from this same encoding; §6 also now states the `scope: "coordinated"` rejection
checkpoint explicitly (registration-accept, invocation-reject); §2 now specifies `expectedVersion`'s
operand kind (a core-defined non-negative safe integer, ADR-022's revision counter); §5 now specifies
column affinity for every scalar kind (date → TEXT, generic `number` → REAL/INTEGER never TEXT,
`boolean` → INTEGER 0/1) and pins the date canonical form's year domain to an explicit `0001`-`9999`
4-digit range validated by core's own grammar, not delegated to host `Date` parsing. Full round-10
trace: `.local-artifacts/external-audit/runs/20260711T183554Z-external-audit-report.md`, packet
`.local-artifacts/external-audit/packets/20260711T183554Z-adr026-atomic-write-round10-audit-packet.md`,
offloads `.local-artifacts/external-audit/offloads/20260711T183554Z/`.

**Status remains PROPOSED, 10 audit rounds completed.** No finding across any round has disputed the
architecture's core shape. `fable-r10-B1` is arguably the single most consequential finding across all
10 rounds — a genuine cross-plugin data-isolation bypass, not a scalar-precision edge case — found only
because a third, independent model was specifically cross-referencing this ADR against its own upstream
dependencies (ADR-023/024/004) rather than reading ADR-026 in isolation. A **round-11 full-pass
re-audit** is owed before ACCEPTED, under the same agreed exit condition.

**Round-11 full-pass re-audit** (`TM-adr026-atomic-write-001`, 3-auditor coverage continued, agreed exit
condition in effect, explicit instruction not to treat namespace injectivity as closed just because
round 10's specific counterexample was fixed), run 2026-07-11, **returned Codex 6.8 FAIL, agy 9.8 PASS,
Fable 7.0 FAIL — exit condition not met, two independent auditors found two different real collisions in
the same area round 10 had just "fixed"**:

- **Codex `gpt-5.5` 6.8, FAIL, 2 blockers:** `codex-r11-B1` (domain 5, high confidence) — verified the
  round-10 `__`-delimiter ban against actual SQLite identifier semantics (a live `CREATE TABLE` probe,
  the same cross-reference-against-reality method that closed round 10's finding) and found SQLite
  resolves table identifiers **case-insensitively**: `CREATE TABLE p_Shop__orders` followed by
  `CREATE TABLE p_shop__orders` fails because SQLite treats them as the same identifier. Neither ADR-023
  (which requires only a "stable, globally-unique" `pluginId`, no case rule) nor ADR-026's round-10 fix
  (which bans only the substring `__`) constrains case, so two distinct, grammar-admissible plugin IDs
  differing only in case still collide on the physical table they produce. `codex-r11-B2` (domain 3) —
  the round-10 column-affinity fix names date/number/boolean/money-int/money-decimal but never states
  required affinity for generic `string` or `null`, leaving both implementation-discretionary despite
  being named scalar kinds in the closed vocabulary.
- **agy/Gemini 3.1 Pro (High) 9.8, PASS, advisory-only:** a full fresh sweep including explicit
  re-verification of all 5 round-10 fixes; scored the namespace-injectivity fix as "provably injective"
  and found zero blockers there — the same claim, in the same area, that both Codex and Fable
  independently falsified in this same round, a second instance of the round-9/round-10 pattern where
  agy's own adversarial pass reads an area as closed that a different method proves is not. Surfaced 3
  low-severity notes independently: `agy-r11-A1` (generic string column affinity unstated — corroborating
  half of `codex-r11-B2` at advisory rather than blocker severity), `agy-r11-A2` (identifier charset
  bounds unstated beyond the `__` ban), `agy-r11-A3` (`expectedVersion` semantics unspecified when the
  guarded row does not exist).
- **Fable (independent subagent, no author rationale, falsification framing, explicitly instructed not
  to treat the namespace-injectivity area as closed) 7.0, FAIL, 1 blocker + 1 low:** `fable-r11-B1`
  (domain 5, high confidence) — did not assume the round-10 `__`-ban achieved injectivity; searched for a
  residual collision using only that ban as the constraint and found one, verified programmatically:
  `pluginId` `acme` + table `_inventory`, and `pluginId` `acme_` + table `inventory`, both compile to
  physical table `p_acme___inventory` — neither component contains the banned `__` sequence (each has
  only a single underscore), so both pass round-10's registration-time check unchanged, yet a single
  trailing/leading `_` merges with the `__` delimiter itself, reproducing the exact collision class round
  10 was meant to close. Fable confirmed both plugins' capability-derived prefix checks (`p_acme__` and
  `p_acme___`) independently pass on the shared physical name — a direct, concretely demonstrated
  cross-plugin isolation bypass, the same invariant as `fable-r10-B1`, reopened one layer deeper. One low
  note: `fable-r11-A1` — `expectedVersion`'s round-10 fix cites "the entry revision counter, ADR-022," but
  `scope: "plugin"` commands target `p_{pluginId}__*` plugin tables (ADR-023), not the `entries` table;
  ADR-023 §7 states plugin-table writes inherit ADR-022's revision *journal* but never explicitly states
  each plugin-table row carries its own per-row version counter `expectedVersion` can compare against — a
  cross-reference tension, not a demonstrated break. Fable independently re-verified the other 4 round-10
  fixes (coordinated-scope checkpoint, column affinity for date/number/boolean, date year-domain) as
  correct and complete, and declined to re-litigate `agy-B3`.

**Codex and Fable independently found two non-overlapping counterexamples in the same namespace-encoding
area, using different methods** (Codex: a live SQLite identifier-semantics probe; Fable: a from-scratch
search for a residual collision pattern under the stated grammar) — the same "two independent auditors
converge on the same broken invariant via different routes" signal that made round 10's finding
high-confidence. This is the second round in a row finding the namespace encoding non-injective, which
this ADR's own history (rounds 1-5 patching the scalar-vocabulary defect class one instance at a time
before round 5 closed it structurally) says is the signal to stop patching individual counterexamples and
close the whole defect class at once. **Fixed structurally, not as two more instance-patches:** §6 now
requires both `pluginId` and every plugin-registered `tableName` to match a fixed grammar (lowercase ASCII
alphanumerics and internal hyphens only, no underscore, no uppercase) — replacing the round-10
delimiter-ban rule rather than extending it, closing both the boundary-underscore-merge family and the
case-folding family at once, plus stating an explicit injectivity obligation (no two grammar-admissible
pairs may collide under SQLite's own identifier-equality semantics, not just byte-equality) for any future
grammar revision. §5 now states TEXT affinity for generic `string` and clarifies `null` is not an
independent storage kind. §2 now clarifies `expectedVersion`'s counter is per-row on whichever table
family a command targets (not literally the `entries` table), and states nonexistent-row semantics
(`expectedVersion` fails, `notExists` is the correct predicate for existence assertions). Full round-11
trace: packet
`.local-artifacts/external-audit/packets/20260711T185630Z-adr026-atomic-write-round11-audit-packet.md`,
offloads `.local-artifacts/external-audit/offloads/20260711T185630Z/`.

**Status remains PROPOSED, 11 audit rounds completed.** No finding across any round has disputed the
architecture's core shape. The namespace-injectivity invariant has now been found broken twice in two
consecutive rounds (`fable-r10-B1`, then `codex-r11-B1`/`fable-r11-B1`) — the round-11 fix moves from
patching specific demonstrated collisions to a structurally injective grammar precisely because a second
round of instance-patching would repeat the same mistake this ADR's own scalar-vocabulary history already
made once. A **round-12 full-pass re-audit** is owed before ACCEPTED, under the same agreed exit
condition, with explicit focus on whether the new structural grammar actually closes the defect class
this time rather than admitting a third residual family.

**Round-12 full-pass re-audit** (`TM-adr026-atomic-write-001`, 3-auditor coverage continued, agreed exit
condition in effect, explicit instruction to actively hunt for a residual namespace collision rather than
assume the round-11 structural grammar is correct because it looks principled), run 2026-07-11,
**returned Codex 9.1 PASS, agy 10.0 PASS, Fable 9.4 PASS — exit condition met, zero blockers from any
auditor**:

- **Codex `gpt-5.5` 9.1, PASS, 4 advisories:** ran its own full-document pass plus internal sidecar
  checks (disclosed transparently in its scope-check output as inherited-model helpers, not claiming to
  be the external agy/Fable identities), including direct SQLite probes of identifier quoting and
  case-fold behavior. Retried every prior collision family (embedded-`__`, boundary-underscore-merge,
  case-folding) against the round-11 grammar and confirmed all three are now rejected outright, plus
  tested empty/hyphen edge cases and Unicode normalization — found no collision. 4 advisories, none
  blocking: `codex-r12-A1` (hyphen-admitting grammar needs a normative quoting requirement — the exact
  gap this round's fix closes), `codex-r12-A2` (ADR-023's `pluginId` charset should mirror this grammar
  to avoid cross-document drift), `codex-r12-A3` (`null`-valued `eq`/`ne`/`in` guard lowering needs
  explicit semantics given SQL's three-valued NULL comparison), `codex-r12-A4` (no core-defined identifier
  length bound, inconsistent with this ADR's own bounded-cost discipline applied everywhere else).
- **agy/Gemini 3.1 Pro (High) 10.0, PASS, zero findings:** verified all 7 round-11 ledger items as
  correctly fixed, including an explicit structural argument for injectivity (exactly three underscores
  in any compiled name under the no-underscore-in-components grammar, making the delimiter position
  unique) and confirmation that SQLite's case-insensitive identifier resolution is a no-op against an
  all-lowercase-admissible grammar.
- **Fable (independent subagent, no author rationale, falsification framing, explicitly instructed to
  hunt for a fresh collision rather than confirm the fix) 9.4, PASS, 4 advisories:** ran the most
  exhaustive verification of this ADR's history on the namespace question — nine distinct attack families
  attempted against the round-11 grammar (a from-scratch underscore-position injectivity derivation;
  hyphen-boundary merge attempts; SQLite's actual ASCII-only case-fold semantics, ruled out via
  `sqlite3StrICmp` behavior rather than assumption; Unicode confusables/normalization; empty-component
  edge cases; a prefix-subsumption attack against the scope-check mechanism itself, not just name
  collision; SQLite identifier quoting/escaping and the legacy double-quoted-string misfeature;
  identifier truncation, contrasted explicitly with Postgres's 63-byte silent truncation which *would*
  break injectivity; and the ADR-023 `pluginId`-charset interaction) — found no collision after genuinely
  trying all nine, the first time in three rounds this specific claim survives an exhaustive from-scratch
  falsification rather than a plausibility read. 4 advisories, 3 overlapping with Codex's independently:
  `fable-r12-A1` (ADR-023 charset-mirroring, same as `codex-r12-A2`), `fable-r12-A2` (mandatory quoting +
  DQS-disable recommendation, same as `codex-r12-A1`), `fable-r12-A3` (identifier length bound, same as
  `codex-r12-A4`), `fable-r12-A4` (generic-`number`'s "REAL or INTEGER" affinity choice left open is the
  same observable-divergence gap shape the coordinated-scope checkpoint rule already closes elsewhere —
  not found by Codex).

**Two independent auditors converging on zero collisions after genuinely adversarial, from-scratch
attempts — rather than one auditor's clean pass being contradicted by another's real finding, the pattern
in both of the prior two rounds — is the strongest evidence available that the round-11 structural fix
actually closes the namespace-injectivity defect class.** All 5 distinct corroborated advisories folded in
the same commit as this record, consistent with this ADR's standing batching discipline: mandatory SQLite
identifier quoting given the grammar admits hyphens (`codex-r12-A1`/`fable-r12-A2`); an ADR-023
`pluginId`-charset alignment note (`codex-r12-A2`/`fable-r12-A1`); a core-defined identifier length bound,
explicitly barring truncation as an enforcement mechanism since truncation would itself re-break
injectivity (`codex-r12-A4`/`fable-r12-A3`); explicit `null`-guard lowering via `isNull` rather than
`eq`/`ne`/`in` with a null operand (`codex-r12-A3`); and generic-`number` affinity pinned to `REAL`
rather than left as an implementation choice (`fable-r12-A4`). Full round-12 trace: packet
`.local-artifacts/external-audit/packets/20260711T220835Z-adr026-atomic-write-round12-audit-packet.md`,
offloads `.local-artifacts/external-audit/offloads/20260711T220835Z/`.

**Status: ACCEPTED, 12 audit rounds completed.** The agreed exit condition (clean or advisory-only across
all 3 auditors) is met for the first time since round 3 — and unlike round 3, this closure survives an
independent Fable pass explicitly tasked with trying to reopen it, rather than one dispatched only after
the fact. No finding across any of the 12 rounds ultimately disputed this ADR's core architectural shape:
named-command surface, core-owned compiled IR, chokepoint preservation, reads-are-advisory correctness
rule. Every real finding across the 12-round history was a precision, boundary, or representation-
ambiguity gap in the decided text, not a shape-level objection — the single most consequential of them
(`fable-r10-B1`'s cross-plugin isolation bypass, reopened by round 11's finding that the first fix was
itself incomplete) is now closed by a structural grammar rather than a case-by-case patch, matching how
this ADR's earlier scalar-vocabulary defect class was closed in round 5 after 5 rounds of the same
whack-a-mole pattern. No further audit round is owed under `TM-adr026-atomic-write-001` absent a future
material change to this ADR's text.
