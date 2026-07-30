# Consensus Report

**Date:** 2026-07-11
**Prompt:** How should Tovu's plugin↔core ABI let a plugin author express an atomic, all-or-nothing,
multi-op write with per-op concurrency guards, given the ABI is frozen as async-only,
serializable-data-only, with no live transaction handle? (Full packet:
`ADS-memory/.local-artifacts/swarm-consensus/context/CTX-adr026-atomic-write-2026-07-11.md`)
**Context Packet:** `ADS-memory/.local-artifacts/swarm-consensus/context/CTX-adr026-atomic-write-2026-07-11.md`
**Mode:** debate
**Controls:** `max_rounds=2`, `min_confidence=0.90`, `swarm_timeout_seconds=300` (defaults; stopped early after Round 2 — agreement cleared the floor on all decision points)
**Primary model:** Claude Sonnet 5 (this host)

## The Swarm

| Role | CLI | Requested Model | Resolved Model | CLI Version | Selection Source | Status | Attempts |
|---|---|---|---|---|---|---|---|
| Primary | claude (this session) | n/a | Claude Sonnet 5 | 2.1.201 | current host | Responded | 1 |
| Peer | codex | n/a | gpt-5.5 (medium) | codex-cli 0.144.0 | saved_codex_report | Responded | 2 rounds |
| Peer | agy | n/a | Gemini 3.1 Pro (High) | agy 1.1.1 | default (documented in skill) | Responded (Round 1 background dispatch failed empty-output; Round 2 + retried Round 1 succeeded in foreground) | 2 rounds |
| Peer | claude (external) | — | — | — | — | Not dispatched (same family as Primary; excluded per skill default) | 0 |

## Dispatch Diagnostics

| CLI | Output Mode | stdout Parser | stderr Summary | Retry Notes |
|---|---|---|---|---|
| codex | json (jsonl) | `agent_message` items, end marker `<<SWARM_END>>` | clean, no errors | Both rounds dispatched as detached background processes; completed without retry. |
| agy | text | full stdout stripped of ANSI, end marker `<<SWARM_END>>` | clean, no errors | Round 1 first attempt (backgrounded via harness `run_in_background`) returned 4 bytes of empty output — known agy/pty limitation when no controlling terminal is available to `script -q /dev/null` in a fully detached background job. Retried Round 1 in the foreground (blocking) and it succeeded (6.1KB). Round 2 was dispatched in the foreground directly and succeeded on the first attempt. |

## Debate Trace

### Round 1 (blind — neutral packet, no Primary answer or Coordinator opinion shared)

All three participants independently answered the same 4 questions (version-equality sufficiency;
freeze-now-vs-later; scalar vocabulary; cross-plugin scope) plus a mandatory Blind Spots section.

- **Primary:** endorsed the write-envelope shape; argued version-equality-only guards make retries
  safe but don't eliminate them or let core express the invariant directly; argued the guard grammar
  should be frozen now, not deferred, given ADR-005; flagged dates/money as needing explicit tagging;
  raised cross-plugin atomicity and a "consistent read" gap as open Blind Spots without taking a
  strong position on either.
- **Codex:** proposed Option A+C (envelope + frozen bounded-predicate grammar including relative
  update operators like `increment`/`decrement`); explicit tagged-scalar vocabulary
  (`instant`/`date`/`decimal`/`money`); a `scope: "plugin" | "coordinated"` discriminant frozen now
  with coordinated execution explicitly not built yet; rejected saga/outbox; Blind Spot: a
  stored-command primitive and "aggregate boundary" reframe — questioned whether table-row-level
  thinking is even the right author mental model.
- **agy:** proposed Option A+C with concrete relative-mutation operators (`$decrement`, `$gte`);
  matching tagged-scalar recommendation; argued cross-plugin atomicity "must be accounted for now"
  (initially a stronger claim than Codex's); rejected saga/outbox; Blind Spot: an event-sourcing/
  command-log architecture, and a sharper challenge — that the single core-mediated chokepoint's
  scalability under high throughput is the framing assumption most likely to be wrong.

**Convergence after Round 1 (2-3 way, strong signal):** version-equality-only is insufficient (3/3);
freeze-now beats freeze-later (3/3); explicit ISO-8601/decimal-string/minor-units scalar tagging (3/3);
saga/outbox is the wrong primitive for this problem (2/2 peers, Primary hadn't ruled it out explicitly).
**Deltas carried into Round 2:** how much cross-plugin scope must be real vs. scaffolded (D1); raw
table-row tuples vs. command/aggregate-oriented primitive (D2, both peers independently proposed
adjacent-but-different alternatives); whether a consistent-read companion primitive is needed (D3,
Primary + agy raised it, Codex silent).

### Round 2 (informed — Coordinator synthesis + deltas shared, no bare "still agree" allowed)

- **D1 — cross-plugin scope:** agy explicitly reversed its Round 1 position ("my initial demand that
  it 'must be accounted for now' failed to respect the blast radius of actually implementing it") and
  converged with Codex: freeze a `scope: "plugin" | "coordinated"` discriminant now; v1 executes
  `plugin`-scoped envelopes only; `coordinated` is recognized but rejected with a stable error
  (Codex: `COORDINATED_SCOPE_UNSUPPORTED`). Codex refined further: reserve a `participants`/
  `coordination` object shape under the rejected branch so a later v2 doesn't have to guess the shape
  blind. **Converged 3/3** (Primary had not opposed this; Round 1's Blind Spot question is now answered).
- **D2 — raw tuples vs. command-oriented:** agy explicitly abandoned its event-sourcing proposal
  ("the Coordinator is correct that it alters the read-your-own-writes guarantee, which is too radical
  an architectural pivot") and fully endorsed Codex's stored-command model. Codex refined the final
  shape: the **public plugin-author surface is named, manifest-registered, schema-checked commands**
  (`write(handle, { command: "store.checkout", params: {...} })`); the raw `{table, id, op}` envelope
  with bounded predicates + relative mutations becomes an **internal compiled IR**, not the primary
  author contract. **Converged 3/3** once Primary's Round-1 position (envelope + predicates as the
  whole answer) is understood as the IR layer beneath the command surface, not a competing design.
- **D3 — consistent-read companion:** both peers converged on the correctness rule: **reads are
  advisory; the submitted envelope's guards/mutations are the only correctness boundary**, and ADR-026
  must say this explicitly so authors don't assume "read stock, then decrement" is safe on its own.
  Residual, non-blocking difference: agy argues no consistent-read primitive should be built at all
  (calls it a deadlock/footgun risk); Codex argues a **separate, ergonomics-only** `readSnapshot()`-style
  sibling primitive is worth a future ADR, explicitly not coupled to the write's correctness guarantee.
  **Converged on the ADR-026 boundary question (3/3); open only on a future, out-of-scope SDK-sugar
  question neither treats as blocking.**

Agreement after Round 2: **3/3 decision points converged** (D1, D2, D3) well above `min_confidence=0.90`.
Debate stopped after Round 2 — a third round would re-litigate settled ground.

## Individual Responses

### Claude Sonnet 5 (Primary)
Full frozen Round 1 answer: `ADS-memory/.local-artifacts/swarm-consensus/runs/20260711T160337Z-adr026-atomic-write/primary-round1-frozen.md`.
Endorsed the envelope shape; pushed back on deferring the guard grammar; flagged the scalar-vocabulary
gap and two Blind Spots (cross-plugin scope, consistent-read) that Round 2 resolved with peer input.

### Codex GPT-5.5 (medium)
Raw: `.local-artifacts/swarm-consensus/offloads/20260711T160337Z/{codex,round2/codex}/dispatch-output.jsonl`.
Most complete concrete design across both rounds: named/schema-checked command surface over a
compiled relational IR, explicit frozen predicate+relative-mutation grammar, tagged scalar vocabulary,
`scope` discriminant with reserved-but-rejected coordinated shape, explicit advisory-reads rule plus a
future ergonomics-only read sibling.

### Gemini 3.1 Pro (High) (agy)
Raw: `.local-artifacts/swarm-consensus/offloads/20260711T160337Z/{agy,round2/agy}/dispatch-output.txt`.
Started from the most aggressive positions in Round 1 (build cross-plugin now, event-sourcing as an
alternative architecture) and explicitly reversed both after the Coordinator's Round 2 synthesis,
landing on full agreement with Codex's command-oriented design and scope-deferral position — a
genuine, reasoned position change, not a rubber-stamp.

## Synthesis

### Agreement
1. A version-equality-only guard is insufficient — it makes retries safe but does not let core express
   the underlying invariant, so it does not eliminate the correctness-relevant retry loop the original
   spike flagged.
2. "Freeze the envelope shape now, decide the guard grammar later" is unsafe under ADR-005's semver
   promise — the grammar must be frozen (as a small, bounded, total, side-effect-free language) in v1.
3. The scalar vocabulary needs explicit tagged types, not a bare `string/number/boolean/null` list:
   dates as ISO-8601 strings (never raw `Date`), money/decimals as minor-unit integers or decimal
   strings (never binary float), validated by core.
4. Saga/outbox is the wrong primitive for this problem — it reintroduces the exact
   plugin-authored-compensation hazard the original spike proved is dangerous even in careful hands.
5. The public plugin-author surface should be **named, schema-checked commands** registered in the
   plugin manifest, not raw table/column tuples — the raw envelope (ordered typed ops + bounded
   predicate/relative-mutation guards) becomes the internal compiled IR core executes in one
   transaction, not the thing authors hand-write at runtime.
6. Cross-plugin atomicity: freeze a `scope: "plugin" | "coordinated"` discriminant in v1 (with a
   reserved-but-unspecified shape for the coordinated case); do not build coordinated execution now —
   it depends on authorization/dependency/trust decisions ADR-024 has explicitly deferred past
   Phase-0.
7. Reads are advisory; the only correctness boundary is the submitted write's guards/mutations,
   evaluated by core against live row state inside the same transaction. ADR-026 must state this
   explicitly so authors do not assume a plain read-then-write is safe.

### Divergence
Only one open, explicitly non-blocking difference remains: whether a future ergonomics-only
consistent-read sibling primitive (Codex, tentative) is worth designing at all, or whether advisory
reads plus expressive guards are sufficient forever (agy). Both agree this is out of ADR-026's scope
either way and does not affect the write primitive's correctness guarantee.

### Unique Insights
- **Codex's "aggregate boundary" reframe** — that plugin authors thinking in table-row operations may
  itself be the wrong mental model, and that a command/aggregate-oriented surface is a better frozen
  contract than table mechanics — turned out to be the single highest-leverage insight of the whole
  debate; it reshaped both D2 and, indirectly, made D1's scope question cleaner (commands can declare
  their own scope explicitly rather than every table op needing one).
- **agy's initial "scalability of the single core-mediated chokepoint" challenge** (Round 1 Blind Spot)
  was not resolved in this debate and is not part of ADR-026's decision — it is a legitimate concern
  about a different, already-accepted decision (ADR-022's single write chokepoint) and should be
  tracked separately, not folded into this ADR.

### Decision Ledger

| Decision Point | Claude Sonnet 5 | Codex GPT-5.5 | Gemini 3.1 Pro (High) | Agreement | Key Why / Movement |
|---|---|---|---|---|---|
| Version-equality-only guards sufficient? | No | No | No | Yes | All three: closes corruption risk, not the retry/expressiveness gap. |
| Freeze grammar now vs. later? | Now | Now | Now (Round 2, unchanged) | Yes | ADR-005 semver-irreversibility argument accepted by all three. |
| Scalar vocabulary for dates/money | ISO-8601 / minor-units, explicit tagging | Same, with formal tagged-scalar types | Same | Yes | Independent 3-way convergence, near-identical answers. |
| Cross-plugin scope in v1 | Raised as open question only | Freeze `scope` discriminant now; defer execution | **Moved** from "build now" to freeze-discriminant-only, matching Codex | Yes (after R2) | agy explicitly reversed after weighing blast radius of building auth/trust/dependency machinery now. |
| Public author surface shape | Envelope + predicates (didn't propose commands) | Named schema-checked commands over compiled IR | **Moved** from event-sourcing to endorsing Codex's command model | Yes (after R2) | agy abandoned event-sourcing as "too radical a pivot" from read-your-own-writes; converged fully. |
| Consistent-read companion primitive | Raised as open question | Ergonomics-only future sibling, not correctness-coupled | Reject entirely (footgun); reads are advisory | Yes on ADR-026 scope; open on whether to ever build it | Both agree the write guard is the sole correctness boundary; only diverge on a future, explicitly out-of-scope SDK question. |

### Unresolved Deltas
Whether a future, ergonomics-only consistent-read sibling primitive is ever worth building (Codex:
maybe, later, non-blocking; agy: no, never, footgun risk). Explicitly out of ADR-026's scope either way
— does not block this ADR and should not be decided here.

## Final Recommendation

Revise ADR-026 to adopt, as the frozen v1 design:

1. **Public author surface:** named, manifest-registered, schema-checked commands
   (`write(handle, { command: "<plugin>.<name>", params: {...} })`), not raw table/column tuples.
2. **Internal execution:** core compiles a registered command to an ordered batch of typed mutations
   plus per-op guards — a small, frozen, total, bounded-cost predicate/relative-mutation grammar
   (equality, existence, comparison operators, and atomic `increment`/`decrement`-style relative
   updates) — executed inside one core transaction, all-or-nothing, through the existing ADR-022/
   ADR-023 chokepoint (typed, attributed, revisioned).
3. **Scalar vocabulary:** explicit tagged scalars for dates (ISO-8601 strings) and money/decimals
   (minor-unit integers or decimal strings); raw `Date`, `BigInt`, and binary floats for exact/money
   values are rejected by core validation, not discovered at the storage layer.
4. **Scope:** every envelope/command carries a frozen `scope: "plugin" | "coordinated"` discriminant.
   `"plugin"` executes in v1. `"coordinated"` is recognized, its shape reserved (participants/
   coordination metadata), and rejected with a stable error code — not built until ADR-024's
   authorization/dependency/trust questions are resolved past Phase-0.
5. **Explicit correctness statement:** ADR-026 must state plainly that reads are advisory and the
   submitted write's guards/mutations, evaluated against live row state inside the transaction, are the
   only correctness boundary — closing the door on the "read stock, then decrement" false-safety
   assumption the original spike's compensating-undo bug came from.

This is a materially more decided v1 than the original draft (which deferred the guard grammar and
left the author surface as raw table ops) — consistent with wanting more surfaced and frozen now
rather than punted, since every deferred vocabulary decision here is the exact class of thing ADR-005
makes expensive to fix once third-party plugins exist.

**Suggested next step:** fold this into a revised ADR-026 (Status: PROPOSED → pending its own
`/audit-work` round, same as ADR-023/ADR-028), superseding the original draft's guard-grammar-deferral
and raw-tuple author surface.
