# GOV-ADR-003: DDL Generation Never Interpolates Operator-Supplied Input

- **Status:** ACCEPTED
- **Enforcement:** MANDATORY
- **Date:** 2026-07-15
- **Author:** Software Architect (Claude Sonnet 5, Agent Direct Mode)
- **Scope Globs:** `src/features/content-types/**; src/infra/**`

## Rule

Any code path that generates SQL DDL from operator-supplied metadata MUST handle it by exactly one of two mechanisms, chosen by the value's shape — no third mechanism is permitted:

1. **Closed-vocabulary metadata** (a field `kind`, a collation, a namespace selector — any value drawn from a small, fixed, developer-controlled enum) MUST route through a fixed, closed, core-owned lookup table that maps it to a pre-approved SQL literal — never interpolated, even after validation.
2. **Free-text identifiers** (a field name, a content-type key, or any other operator-chosen, effectively unbounded string) MUST pass a strict identifier grammar (e.g. `^[a-z][a-z0-9_]{0,63}$`) before appearing in a DDL **identifier position** — an index name segment, or a JSON-path key segment inside the one sanctioned path-literal template (e.g. the `<name>` segment of `'$.<name>'` inside a `json_extract(...)` call). A grammar-validated identifier MUST NEVER appear anywhere else: not in a type position, not in an arbitrary string literal, not concatenated into any other clause. The JSON-path-literal placement is a controlled position, not free-form SQL content — the grammar's excluded characters (quote, backslash, dot, bracket, whitespace, statement separators) make it impossible for a grammar-passed identifier to escape that one templated position. A grammar-validated identifier is not a lookup-table entry — it is still operator-authored text, so it may only ever occupy one of these named positions, never anywhere the surrounding DDL would treat it as executable SQL content beyond that template.

A fixed lookup table cannot express mechanism 2 by construction (field names are an unbounded set) — do not attempt to force free-text identifiers through the lookup-table mechanism; use the grammar-gate mechanism for them instead.

Identity encoding for anything built by joining two or more grammar-gated identifiers (e.g. an index name derived from a content-type key plus a field name) MUST use a delimiter character outside the grammar's own alphabet (e.g. `/`, never `_`) — otherwise two distinct `(key, name)` pairs can encode to the same joined string, which is a namespace-injectivity defect independent of DDL-injection (same defect class as `ADS-project-knowledge/reports/architecture/ADR-026-*.md`'s atomic-write namespace-injectivity finding).

## Why

Collections (SPEC-020) lets an operator define arbitrary content-type fields with a `kind` that ultimately drives an index's `CAST(... AS {sqlType})` DDL, AND a field `name` that becomes part of the index's own identity/extraction path. A validate-then-interpolate approach for the `kind` value (allow-list check, then build the DDL string from the validated value) makes the safety property depend on the validator being correct forever — a validator bug, typo, or future relaxation could silently reopen a SQL-injection-shaped vulnerability. A fixed lookup table makes that half of the property structural: there is no code path where `kind` text reaches a DDL string at all. This was decided during SPEC-020's Software Architect pass (ADR-PIPE-020), explicitly rejecting the validate-then-interpolate alternative for `kind` for this exact reason.

**Correction (2026-07-15, `/audit-work` round 1 — three independent auditors, Fable/Codex/Gemini, all independently converged on this):** the original Rule text applied the closed-lookup-table requirement to field *names* as well as `kind`, which is unsatisfiable — a fixed table cannot enumerate an unbounded set of operator-chosen names. SPEC-020's own actual design was already correct (REQ-03's grammar check runs before any DDL is constructed, per AC-05), but this governance ADR's Rule as originally worded did not reflect that second, distinct mechanism, and SPEC-020's own CIC U-001 designated only the `kind`→CAST lookup, leaving field-name DDL-safety undesignated anywhere. Both are fixed as of this revision — see the Rule's two-track mechanism above and SPEC-020's CIC U-001-B2 (`ADS-memory/reports/pipeline/020-collections/critical-internal-constraints.md`).

**Correction (2026-07-15, `/audit-work` round 2 — Fable and Codex independently converged on this):** the round-1 fix's own wording was internally contradictory — it named a JSON-path key as a permitted identifier position while separately banning any appearance "inside a string literal," but SPEC-020 REQ-04/REQ-06's actual required construction (`CAST(json_extract(fieldsJson, '$.<name>') AS <sqlType>)`) necessarily places the field name inside a single-quoted string literal. Both auditors independently confirmed the grammar gate (excluding quote/backslash/dot/bracket/whitespace/separator characters) makes this placement safe regardless — the defect was in the Rule's taxonomy, not the underlying mechanism. Fixed by naming the JSON-path-literal placement as the one sanctioned string-literal position above. Also added in this round: a delimiter-injectivity requirement for joined identity encodings (Fable's independent finding, not part of round 1's ledger) — see the Rule's final paragraph.

## Enforcement

- [ ] Linter rule: N/A — no static signature reliably distinguishes safe lookup-table/grammar-gate use from a validated-but-interpolated string.
- [ ] CI check: none yet.
- [x] Code review checklist item — Code Review Agent treats (a) any closed-vocabulary DDL-generation code path not routing through the fixed lookup table, (b) any free-text identifier appearing anywhere other than an index-name segment or the sanctioned JSON-path-literal key position, and only after passing the strict grammar gate, or (c) any joined identity encoding using a delimiter inside the grammar's own alphabet, as a Required (blocking) finding.
- [x] adr-governance skill path-match lookup — any change under the scope globs resolves this ADR.
- [ ] Manual review only.

## Comply-or-Explain (DEFAULT rules only)

N/A — MANDATORY, no comply-or-explain path.

## Consequences

**Positive:** DDL-injection is structurally impossible for any covered code path, not merely validated against.

**Negative:** Adding a new field kind or DDL-relevant type requires a core code change to the lookup table, not just an operator-facing extension.

## Re-evaluation Triggers

- A future domain needs a DDL-generation pattern the fixed-lookup-table approach cannot express.
- 3+ exceptions recorded against this rule within 90 days.

## Related

- Origin: `ADS-memory/reports/pipeline/020-collections/adr.md` (ADR-PIPE-020)
- Supersedes: none
- See also: GOV-ADR-001, GOV-ADR-002
