# Critical Internal Constraints: collections

- Spec: SPEC-020 v1.4.0 (hash: sha256:5d6a931b381091ca04fddf55e9918227aed20fe895bb1f5a64cc50f33f44f4b6)
- ADR: ADR-PIPE-020
- Implementation Outline: `ADS-memory/reports/pipeline/020-collections/implementation-outline.md`
- Prior designations consulted: `ADS-memory/reports/pipeline/018-categories-and-tags/critical-internal-constraints.md` — U-001 there (fixed validation-chain ordering) is structurally the same *class* of constraint as U-002 here (fixed guard order); the pattern is re-applied, not re-affirmed as a shared unit, since these are two independent fixed-order chains in two different domains, not one shared implementation. `ADS-memory/reports/pipeline/016-content-admin-core-contract/critical-internal-constraints.md` — U-001/U-003 re-affirmed as inherited via `core/gated-mutations` for the cleanup ceremony only, unchanged.
- Status: PRODUCED
- Trigger result: Security-Critical Sequencing Constraint (2 units), Algorithmic Correctness Constraint (1 unit), Concurrency / Ordering / Idempotency Constraint (1 unit)
- Source sync: verified 2026-07-15T11:00:00Z against SPEC-020 v1.3.0 and this feature's own implementation-outline.md; re-verified 2026-07-15T17:00:00Z against SPEC-020 v1.4.0 (round-2 `/audit-work` — VERSION_CONFLICT registration, U-001-B2/B3 additions)
- Date: 2026-07-15T11:00:00Z
- Author: Software Architect (Claude Sonnet 5, Agent Direct Mode)

## Trigger Decision Matrix

| Trigger | Applies? | Designated Unit(s) | Plausible Wrong Implementation | Broken Property | Required Constraint | Source Trace |
|---|---:|---|---|---|---|---|
| Algorithmic Correctness Constraint | yes | U-003 | See unit section | See unit section | See unit section | REQ-27, REQ-29, REQ-30 |
| Stateful Protocol Constraint | no | — | Considered `ContentTypeStatus`'s `active⇄deprecated→tombstone` machine — but every illegal transition (INV-06) is already fully captured by C-404's public contract Validation column; no additional internal-only detail escapes it, unlike SPEC-017's dialect-conditional state machine which has genuinely non-obvious failure-edge distinctions. | — | — | — |
| Concurrency / Ordering / Idempotency Constraint | yes | U-004 | See unit section | See unit section | See unit section | REQ-26 |
| Security-Critical Sequencing Constraint | yes | U-001, U-002 | See unit sections | See unit sections | See unit sections | REQ-03, REQ-04, REQ-06, REQ-24 |
| Explicit Performance Budget Constraint | no | — | No stated latency/throughput budget for this domain. | — | — | — |
| Failure / Recovery Constraint | no | — | Cleanup's failure modes are fully inherited from SPEC-016's gateway (already covered by SPEC-016's own CIC) — no domain-specific failure/recovery detail beyond that inheritance. | — | — | — |
| Characterization Parity Constraint | no | — | Not a reverse-spec/migration surface; `posts`/`pages` are explicitly untouched, not characterized. | — | — | — |

Candidate units checked beyond the designated four: `createEntry`/`updateEntry`'s field-bag validation (C-411, fully captured by its own public Validation column's stated ordering — envelope-shape-first — no internal detail escapes it, unlike REQ-24's guard order which spans 5 distinct checks with a documented multi-violation ambiguity risk); cleanup's atomic multi-table delete (C-405, fully inherited from SPEC-016's gateway transaction guarantee — no additional domain-specific atomicity concern beyond what SPEC-016 already provides).

## Designated Units

| Unit ID | Name | Location (module / contract ref) | Designating Trigger(s) | Outline Refs | Trace |
|---|---|---|---|---|---|
| U-001 | Fixed kind->CAST lookup table + field-name grammar gate (DDL-injection prevention) | `features/content-types/index-provisioning.ts`, C-403 | Security-Critical Sequencing Constraint | C-403, INV-04, REQ-03, REQ-06 | SPEC-020 REQ-03, REQ-04, REQ-06, AC-05, AC-06, AC-07 |
| U-002 | Fixed definition-time guard order | `features/content-types/write-service.ts`, C-401 | Security-Critical Sequencing Constraint | C-401, AC-38 | SPEC-020 REQ-24, AC-38 |
| U-003 | Field-update index-provisioning composition (REQ-27/29/30) | `features/content-types/index-provisioning.ts`, C-403 | Algorithmic Correctness Constraint | C-402, C-403, INV-09, INV-10 | SPEC-020 REQ-27, REQ-29, REQ-30, AC-43, AC-52-AC-55 |
| U-004 | `expectedVersion`-checked-first ordering | `features/content-types/write-service.ts`, C-402 | Concurrency / Ordering / Idempotency Constraint | C-402 | SPEC-020 REQ-26, AC-56 |

## Unit Constraints

### U-001 Fixed kind→CAST lookup table + field-name grammar gate (DDL-injection prevention)

- Responsibility: Ensure no operator-supplied value — neither a field `kind` nor a field `name` — reaches a DDL string except through one of two closed, structurally-safe mechanisms: `kind` through the fixed lookup table; `name` through the strict identifier grammar, and only ever in a DDL identifier position, never a value/expression position.
- Designation: A competent implementer, under time pressure, might validate `kind` against the closed enum (REQ-04's own enum check) and then build the `CAST(... AS {kind})` DDL string by directly interpolating the now-validated `kind` value — this passes every test where `kind` is one of the five legitimate enum values, since the DDL happens to come out correct, while structurally leaving a code path where a future validator bug, a validator bypass, or a refactor that loosens the enum check would let arbitrary text reach a DDL string. Broken property: INV-04 — this is a SQL-injection-shaped vulnerability hiding behind a currently-passing test suite, exactly the shape AC-06's adversarial test (a `kind` value containing `"text'); DROP TABLE entries;--"`) is designed to catch at the validation layer, but which a *lookup-table* implementation makes structurally unreachable rather than merely rejected-if-caught. Required constraint: the mapping from `kind` to its DDL fragment must be a fixed table lookup (e.g. a `Record<FieldKind, string>` with exactly 5 entries), never a template string built from the `kind` value itself, even after validation.
- **Second designation (added 2026-07-15, round 1 `/audit-work` — three independent auditors, Fable/Codex/Gemini, all independently converged on this gap):** field *names* are a structurally different case from `kind` — they are operator-chosen, effectively unbounded strings that cannot be enumerated in any closed lookup table, yet REQ-06 requires an index's identity (and, per REQ-04's own CAST expression, the field's own JSON-path extraction) to include the field name. A competent implementer could satisfy U-001-B1 (the `kind` lookup table) perfectly while still directly interpolating the field name into the generated index-creation DDL or the JSON-path extraction expression, because nothing in this unit's original scope named that as a covered mechanism. Broken property: INV-04's "the index provisioner must never interpolate an operator-supplied kind, namespace, or collation string directly into DDL" is silent on field *names* specifically, and GOV-ADR-003's original wording incorrectly demanded the same closed-lookup-table mechanism for names too (unsatisfiable — see that ADR's own correction note). Required constraint: a field name must pass REQ-03's grammar gate (`^[a-z][a-z0-9_]{0,63}$`) before it is used anywhere in generated DDL, and even after passing, it may only ever occupy an index name segment or the sanctioned JSON-path-literal key position — never any other value, type, or expression position.
- **Third designation (added 2026-07-15, round 2 `/audit-work` — Fable and Codex independently converged on the taxonomy defect; Fable additionally found the delimiter-injectivity gap):** the round-1 fix's own wording banned a field name from ever appearing "inside a string literal" while separately naming a JSON-path key as a permitted identifier position — but REQ-04/REQ-06's actual construction (`CAST(json_extract(fieldsJson, '$.<name>') AS <sqlType>)`) necessarily places the name inside a single-quoted string literal. Both auditors confirmed the grammar gate makes this placement safe regardless (no character in the grammar's alphabet can escape the path-literal template), so this was a wording defect, not a live vulnerability — U-001-B2 now names the JSON-path-literal placement explicitly as the one sanctioned string-literal position. Separately, Fable identified that nothing made the identity-encoding delimiter choice binding: since REQ-03's grammar allows `_` in both keys and names, an `_`-joined identity encoding lets distinct `(key, name)` pairs collide (e.g. `a_b`+`c` vs `a`+`b_c`) — a namespace-injectivity defect independent of DDL-injection. Required constraint: see new U-001-B3.
- Outline refs: C-403, INV-04, REQ-03, REQ-06

#### Binding Constraints

| ID | Constraint | Escalation Marker | Property Protected | Verification Surface | Trace |
|---|---|---|---|---|---|
| U-001-B1 | The `kind`→`CAST` mapping is implemented as a fixed lookup table with exactly the 5 enum entries (`text`, `integer`, `real`, `boolean`, `datetime`), each mapping to a literal, hardcoded SQL fragment — never a template or string-interpolation construction from the `kind` value | ESCALATE_SECURITY | INV-04 — DDL-injection via `kind` is structurally impossible, not merely rejected by a validator | Code-level/static verification (the lookup table's own shape) plus a property test: any `kind` value not one of the 5 exact strings, including SQL-fragment payloads, never reaches DDL construction at all | SPEC-020 REQ-04, INV-04, AC-06, AC-07 |
| U-001-B2 | A field `name` (or content-type `key`) is used in generated DDL only after passing REQ-03's grammar gate (`^[a-z][a-z0-9_]{0,63}$`), and even then only in an index name segment or as the `<name>` key inside the one sanctioned JSON-path-literal template (`'$.<name>'` inside `json_extract(...)`) — never in any other value, type, or expression position | ESCALATE_SECURITY | INV-04's underlying intent extended to field names (not just kind/namespace/collation) — DDL-injection via field name is prevented by grammar-gating plus placement restricted to the two named positions, since no closed lookup table can enumerate an unbounded operator-chosen string set | Property test: adversarial field names (e.g. `name"; DROP TABLE entries;--`, matching AC-05's own adversarial case) are rejected by REQ-03's grammar gate before any DDL is constructed referencing them; code-level verification that every DDL-generation code path treats a grammar-passed name as an opaque identifier confined to the index-name segment or the JSON-path-literal key, never interpolated into any other clause | SPEC-020 REQ-03, REQ-06, AC-05, INV-04; GOV-ADR-003 |
| U-001-B3 | When an index name or other identity string is built by joining two or more grammar-gated identifiers (e.g. content-type `key` + field `name`), the joining delimiter MUST be a character outside REQ-03's grammar alphabet (`[a-z0-9_]`) — e.g. `/`, matching REQ-06's own `{type}/{namespace}/{field}` notation, never `_` | ESCALATE_SECURITY | Prevents a namespace-injectivity collision (two distinct `(key, name)` pairs encoding to the same joined string), the same defect class ADR-026 addressed for atomic-write namespacing — added 2026-07-15, round-2 `/audit-work` (Fable, independent finding) | Property test: for any two distinct `(key, name)` pairs, their joined identity strings are never equal | SPEC-020 REQ-06; GOV-ADR-003 |

#### Required Ordering Constraints

| ID | Required Ordering | Property Protected | Observable Verification Surface | Escalation Marker | Trace |
|---|---|---|---|---|---|
| U-001-ORD1 | REQ-03's field-name grammar gate completes and passes before REQ-06's index-provisioning DDL is ever constructed referencing that name | Prevents an ungated field name from ever reaching DDL construction, even transiently | API/code-level: no DDL-generation call site accepts a field name that has not already passed the grammar gate | ESCALATE_SECURITY | SPEC-020 REQ-03, REQ-06, behavior.spec.md §1.1 |

#### Invariant References

| Reference | Source | Binding Constraint IDs Supported |
|---|---|---|
| INV-04 | SPEC-020 feature.spec.md | U-001-B1, U-001-B2, U-001-B3, U-001-ORD1 |

#### Design Context (optional, non-binding)

This is this entire 4-domain pipeline's single highest-severity constraint — a legitimate admin feature (operator-defined content types) creating a direct path to DDL construction is exactly the shape of feature where "validated" and "safe" can silently diverge under refactor pressure. The escalation marker reflects that a violation here is a real SQL-injection vulnerability, not a data-quality bug. U-001-B2 closes a gap three independent external/internal auditors converged on: the original designation covered only `kind`, leaving field-name DDL-safety implicitly assumed rather than explicitly designated, even though SPEC-020's own REQ-03 grammar check already made the underlying implementation safe — the gap was in the architecture documentation's own completeness, not (as far as this review could determine) in the actual intended behavior. U-001-B3 closes a second-order gap the round-2 diff-only re-audit caught: fixing the DDL-injection wording left an adjacent namespace-injectivity risk unpinned, the same defect class that took ADR-026 twelve audit rounds to fully close elsewhere in this project — worth taking seriously precisely because it is a familiar failure shape here.

---

### U-002 Fixed definition-time guard order

- Responsibility: Evaluate content-type definition-time validation guards in the fixed order REQ-24 specifies (key grammar → reserved-key → field-name grammar → field-kind → queryable-cap) and report only the first failing guard.
- Designation: A competent implementer might evaluate all guards and collect every violation, or evaluate them in a more "natural" order (e.g. reserved-key first, since it's conceptually simpler) — either passes every single-violation test case, but AC-38's specific multi-violation scenario (`key='post'` AND an invalid field name in the same payload) requires the response to be exactly `RESERVED_CONTENT_TYPE_KEY`, not a collected-errors response and not `INVALID_FIELD_NAME_GRAMMAR`. Broken property: REQ-24's documented, deterministic error-reporting contract — client error-handling code that branches on the *first* reported error code would receive a different, non-deterministic answer depending on implementation order, if the order is not fixed. Required constraint: the five guards evaluate in the exact stated order, and evaluation stops at the first failure.
- Outline refs: C-401, AC-38

#### Binding Constraints

| ID | Constraint | Escalation Marker | Property Protected | Verification Surface | Trace |
|---|---|---|---|---|---|
| U-002-B1 | The five definition-time guards (key grammar, reserved-key, field-name grammar, field-kind, queryable-cap) evaluate in that exact order, and evaluation stops at the first failure — never collected, never reordered | — | AC-38's deterministic multi-violation reporting contract | API result: a submission violating both the reserved-key check and the field-name-grammar check always reports `RESERVED_CONTENT_TYPE_KEY`, never the other | SPEC-020 REQ-24, AC-38 |

#### Required Ordering Constraints

| ID | Required Ordering | Property Protected | Observable Verification Surface | Escalation Marker | Trace |
|---|---|---|---|---|---|
| U-002-ORD1 | Key-grammar check → reserved-key check → field-name-grammar check → field-kind check → queryable-cap check, in that exact sequence | AC-38's deterministic first-failure reporting | API result for the documented multi-violation scenario | — | SPEC-020 REQ-24 |

#### Invariant References

| Reference | Source | Binding Constraint IDs Supported |
|---|---|---|
| (no separate outline INV — fully captured by REQ-24 and AC-38 directly) | SPEC-020 feature.spec.md REQ-24, AC-38 | U-002-B1, U-002-ORD1 |

#### Design Context (optional, non-binding)

This mirrors SPEC-018's U-001 (fixed validation-chain ordering) in shape — both domains independently arrived at "a fixed-order guard chain is itself a Binding, testable property" as the right response to a definition-time validation surface with multiple guards.

---

### U-003 Field-update index-provisioning composition (REQ-27/29/30)

- Responsibility: Correctly resolve index provisioning/teardown for every possible combination of `kind` and `queryable` change on an `UPDATE_CONTENT_TYPE_FIELDS` call, including the case where both change together on the same field in the same call.
- Designation: A competent implementer might implement REQ-27 ("kind changes while queryable stays true → reprovision") and REQ-29 ("queryable flips while kind stays constant → provision/teardown") as two independent, mutually-exclusive `if` branches — each individually passes its own dedicated AC (AC-43 for REQ-27, AC-52/AC-53 for REQ-29), but REQ-30's own text explicitly names the case neither literal branch covers: a single field whose `kind` AND `queryable` both change in the same call (AC-55). An independent-branches implementation would either silently skip index provisioning entirely for this combined case (since neither `if` condition alone is true if each checks for the *other* field staying constant) or take an arbitrary, unspecified branch. Broken property: INV-09 (index must never reference a stale kind's CAST mapping) and INV-10 (index must exist iff queryable) — a combined-change field could end up with no index, a stale-kind index, or an index that silently doesn't match its declared kind. Required constraint: index state must be resolved from the field's *post-call* `kind` and `queryable` value as a single decision, not from independently-triggered before/after branches that assume the other property stays constant.
- Outline refs: C-402, C-403, INV-09, INV-10

#### Binding Constraints

| ID | Constraint | Escalation Marker | Property Protected | Verification Surface | Trace |
|---|---|---|---|---|---|
| U-003-B1 | For every field in an `UPDATE_CONTENT_TYPE_FIELDS` full-replace submission, index state (provisioned / torn down / re-provisioned under a new `kind` mapping) is resolved from a single before/after comparison of that field's `(kind, queryable)` pair — never from two independent branches that each assume the other property is unchanged | — | INV-09, INV-10 — the field's live index must always correctly reflect its current `(kind, queryable)` state, for every combination of what changed | Persisted state: after any `UPDATE_CONTENT_TYPE_FIELDS` call, for every field, an index exists iff `queryable=true` post-call, and if it exists, it is built against the post-call `kind`'s CAST mapping — verified across all 4 combination classes (kind-only, queryable-only, both, newly-introduced) | SPEC-020 REQ-27, REQ-29, REQ-30, INV-09, INV-10, AC-43, AC-52-AC-55 |

#### Required Ordering Constraints

N/A — this is a single-decision composition constraint per field, not a multi-step ordering across fields.

#### Invariant References

| Reference | Source | Binding Constraint IDs Supported |
|---|---|---|
| INV-09 | SPEC-020 feature.spec.md | U-003-B1 |
| INV-10 | SPEC-020 feature.spec.md | U-003-B1 |

#### Design Context (optional, non-binding)

REQ-30's own text is explicit that it exists specifically to close the gap "neither REQ-27 nor REQ-29 literally covers" — this unit's Binding constraint is the direct implementation-level enforcement of that same explicit composition requirement, expressed as a testable property rather than prose.

---

### U-004 `expectedVersion`-checked-first ordering

- Responsibility: Evaluate the optimistic-concurrency `expectedVersion` match before the `fields_empty` guard or any other precondition in `UPDATE_CONTENT_TYPE_FIELDS`.
- Designation: A competent implementer might check `fields_empty` first (a cheap, no-lookup check, similar in spirit to SPEC-018's allow-list-first optimization) before checking `expectedVersion` — this seems like a reasonable "fail fast on the cheap check" optimization and passes every test where only one condition is violated, but AC-56 specifically constructs the combined case (stale `expectedVersion` AND `fields: []`) and requires the response to be `VERSION_CONFLICT`, not `fields_empty`'s `VALIDATION_ERROR`. Broken property: a caller relying on `VERSION_CONFLICT` to detect a concurrent modification (the entire point of optimistic concurrency control) could instead receive a `VALIDATION_ERROR` about an unrelated empty-fields issue, masking the actual concurrency conflict and potentially leading the caller to retry with fresh data it never actually needed to re-fetch. Required constraint: `expectedVersion` is checked first, unconditionally, before any other precondition in this action.
- Outline refs: C-402

#### Binding Constraints

| ID | Constraint | Escalation Marker | Property Protected | Verification Surface | Trace |
|---|---|---|---|---|---|
| U-004-B1 | `expectedVersion` match is evaluated before the `fields_empty` check and before any per-field guard in `UPDATE_CONTENT_TYPE_FIELDS` | — | Optimistic-concurrency signal is never masked by an unrelated validation error | API result: given a stale `expectedVersion` combined with `fields: []`, the response is always `VERSION_CONFLICT`, never `VALIDATION_ERROR` (`fields_empty`) | SPEC-020 REQ-26, AC-56 |

#### Required Ordering Constraints

| ID | Required Ordering | Property Protected | Observable Verification Surface | Escalation Marker | Trace |
|---|---|---|---|---|---|
| U-004-ORD1 | `expectedVersion` check completes (and passes) before `fields_empty` check begins | Concurrency-conflict signal never masked | API result for the combined stale-version-plus-empty-fields case | — | SPEC-020 REQ-26, AC-56 |

#### Invariant References

| Reference | Source | Binding Constraint IDs Supported |
|---|---|---|
| (no separate outline INV — fully captured by REQ-26 and AC-56 directly) | SPEC-020 feature.spec.md REQ-26, AC-56 | U-004-B1, U-004-ORD1 |

#### Design Context (optional, non-binding)

This is a smaller-scale instance of the same "cheapest-check-first is not always correct" risk SPEC-018's U-001 and SPEC-019's U-003 both name — optimistic-concurrency checks specifically must never be masked by a cheaper-to-evaluate validation error, since the caller's retry logic typically depends on distinguishing the two.

## Deviation And Promotion Protocol

Per `AI-Dev-Shop/skills/critical-internal-constraints/SKILL.md`: escalation-marked constraints (U-001-B1, U-001-B2, U-001-B3) require Coordinator routing and a recorded `[CIC_DEVIATION_APPROVED]` entry before any deviation; other Binding constraints require a recorded `[CIC_DEVIATION]` entry. No deviations exist yet.

## Downstream Handoff Notes

- Coordinator: tasks touching `index-provisioning.ts` reference U-001 and U-003 (the two highest-risk units in this entire pipeline); tasks touching `write-service.ts`'s guard/version ordering reference U-002/U-004.
- TDD focus: U-001's DDL-injection property test (adversarial `kind` payloads) and U-003's exhaustive 4-combination-class property test are the highest priority in this domain, arguably in the whole 4-spec set given U-001's security severity.
- Programmer audit focus: confirm the `kind`→`CAST` mapping is a literal, static lookup table (inspectable at code-review time, not runtime-constructed); confirm `UPDATE_CONTENT_TYPE_FIELDS`'s index-provisioning logic resolves per-field from post-call state, not independent before/after branches per REQ.
- Open risks or ambiguities: OQ-01 (queryable-field cap) and OQ-02 (retention window) remain open per their stated owner/deadline, neither of which changes any Binding constraint recorded here.
