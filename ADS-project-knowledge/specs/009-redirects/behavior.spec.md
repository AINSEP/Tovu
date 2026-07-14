# Behavior Rules Spec: redirects

<!-- SPEC PACKAGE FILE: framework/spec-providers/speckit/templates/spec-system/behavior.spec.md -->
<!-- Part of the spec-system package. See framework/spec-providers/speckit/templates/spec-system/ for all required files. -->

---

## Header Metadata

| Field | Value |
|-------|-------|
| spec_id | SPEC-009 |
| feature_name | FEAT-009-redirects |
| version | 1.0.0 |
| content_hash | anchored in feature.spec.md |
| last_edited | 2026-07-12T00:00:00Z |

**Purpose:** Redirects has multiple competing sources of truth for "what wins" (phase
eligibility, match-type precedence, tie-break, one-hop collapse) and several non-obvious
defaults/bounds. This file is required per the template's own criteria (ordering that
affects correctness, tie-break logic, non-obvious defaults, numeric bounds).

---

## EARS Syntax Guide

(See template for the full pattern reference; all rules below use EARS form.)

---

## 1. Precedence Rules

### 1.1 Match-Type Precedence Within a Phase

**Situation:** Applies whenever more than one active, phase-eligible rule's `fromPattern`
could match the same normalized request path.

**Sources in precedence order (highest to lowest):**
1. `exact` match — a full-path equality match always wins over any partial match.
2. `prefix` match, longest match first — among multiple matching `prefix` rules, the one
   with the longest `fromPattern` wins.
3. `wildcard` match — only consulted after `exact` and `prefix` both miss.

**Example:**
- Scenario: rules exist for `exact:/a/b`, `prefix:/a`, `wildcard:/a/*`.
- Input: request path `/a/b`.
- Result: the `exact` rule wins (source 1), even though the `prefix` and `wildcard` rules
  would also match.

**Test requirement:** The TDD Agent must write a test for each pair of competing match
types, and for two `prefix` rules of different lengths.

EARS: WHEN more than one active rule's pattern matches the normalized request path within
the same resolution phase, the system shall select the highest-precedence match in the
order `exact` > `prefix` (longest) > `wildcard`.

---

### 1.2 Phase Eligibility Precedence

**Situation:** Applies to which rules are even considered, before match-type precedence is
evaluated.

**Sources in precedence order (highest to lowest):**
1. `pre_content`, `override: true` rules only — consulted before live content is looked up.
2. Live content resolution (fixed core, out of scope for this library) — if content
   resolves, it wins and no `post_content` rule is ever consulted for that request.
3. `post_content`, all `active` rules (404-fill) — consulted only if live content did not
   resolve.

**Example:**
- Scenario: an `override: true` rule exists for `/legacy`, and a live page also exists at
  `/legacy`.
- Input: request for `/legacy`.
- Result: the `override` rule wins (source 1) — it is evaluated in `pre_content`, before
  live content is ever looked up.

**Test requirement:** The TDD Agent must write a test proving an `override: false` rule
never wins over live content at the same path, and a separate test proving an
`override: true` rule always wins over live content at the same path.

EARS: WHILE a rule's `override` flag is `false`, the system shall make that rule eligible
only in the `post_content` phase, never in `pre_content`.
EARS: WHILE a rule's `override` flag is `true`, the system shall make that rule eligible in
the `pre_content` phase, evaluated before live content resolution.

---

## 2. Ordering Rules

### 2.1 Tie-Break Within a Match-Type Band

**Field used:** `priority` (primary), `createdAt`/`updatedAt` recency (secondary), `id`
(final, deterministic fallback).

**Direction:** `priority` higher wins; recency more-recent wins; `id` lexicographically
smaller wins (matches EC-02's system-integrity fallback).

**Stability:** Given identical inputs, the winner is always the same rule — no
non-deterministic ordering (e.g., insertion order of a `Map`/array from a repo call) may
ever decide a tie.

**When overridden:** Never — this is the terminal tie-break chain; there is no caller
override for it (unlike, e.g., a paginated list's sort parameter).

**Invariant:** For two competing rules of the same match-type band, the winner is always
the one with (in order) the higher `priority`, else the more recent `createdAt`/`updatedAt`,
else the lexicographically smaller `id`.

EARS: WHEN two or more active, phase-eligible rules of the same match-type band match the
same request, the system shall select the rule with the highest `priority`; IF `priority`
values are equal, THEN the system shall select the more recently created or updated rule;
IF those are also equal, THEN the system shall select the rule with the lexicographically
smaller `id`.

---

### 2.2 Dynamic Set (`wildcard`) Evaluation Order

**Context:** `RedirectRepoPort.listDynamic` returns the bounded, ordered `wildcard` set a
request evaluates after an `exact`/`prefix` miss.

**Order:** Specificity (longer/more-specific `fromPattern` glob first) → `priority`
(higher first) → recency (matches §2.1's tie-break chain).

**Tie-break:** Same as §2.1.

**Invariant:** `listDynamic`'s returned order is exactly the order the matcher evaluates
candidates in; the matcher must never re-sort or re-order what the repo returns.

---

## 3. Default Values

| Field | Scope | Default Value | Why |
|-------|-------|---------------|-----|
| `status` | `RedirectRecord` on create | `'active'` | A newly created rule is meant to take effect immediately; there is no draft/review state for redirect rules in v1. |
| `override` | `CreateRedirectInput` | `false` | Safety-first: a rule should only intercept live content when an operator explicitly opts in, since `override` can hide an otherwise-resolvable page. |
| `priority` | `CreateRedirectInput` | `0` | Most rules don't need an explicit tie-break; `0` as the baseline lets any operator-set higher priority unambiguously win. |
| `statusCode` (admin default, not API default) | `RedirectEditor` form pre-fill | `301` | Matches ADR-033 §7's stated admin default: 301 is the common "permanent move" case and carries SEO link-equity transfer. |
| `matchType` (admin default) | `RedirectEditor` form pre-fill | `'exact'` | The simplest, most predictable rule type; wildcard/prefix are opt-in for more advanced cases. |
| `source` | `RedirectRecord` on manual create | `'manual'` | Distinguishes operator/AI-authored rules from `auto_slug_change`/`import` provenance. |
| `version` | `RedirectRecord` on create | `1` | First revision is always sequence 1 (ADR-022 §4c convention). |
| dynamic-rule cap (workspace) | `listDynamic` `limit` | `500` (assumed; OQ-01) | Matches the existing bounded-collection precedent in this repo (`menu-service.ts` caps item count at 500); prevents unbounded per-request scan cost as a workspace accumulates wildcard rules. |

---

## 4. Limits and Bounds

| Constraint | Value | Enforcement | Notes |
|------------|-------|-------------|-------|
| `fromPattern` length | 1–2048 characters | API | Rejected with `REDIRECT_VALIDATION_ERROR` outside this range. |
| `toTarget` length | 1–2048 characters | API | Same. |
| `priority` range | 0–1000 | API | Values outside this range are rejected, not silently clamped. |
| Redirect chain hops | exactly 1 (collapsed at write time) | write chokepoint | REQ-13; never resolved by chasing multiple hops at request time. |
| Dynamic (`wildcard`) rule cap per workspace | 500 (assumed; OQ-01) | write chokepoint (rejects new `wildcard` create once at cap, per OQ-02's reject-on-create assumption) | A tuning value, not a hard architectural ceiling — confirmed by Software Architect per OQ-01/OQ-02. |
| Import batch size | 1–500 rules per `IMPORT_REDIRECTS` call | API | Values above 500 are rejected with `VALIDATION_ERROR` before any per-rule processing begins. |
| `matchType: 'regex'` | disabled (0 allowed) | write chokepoint | Hard reject in v1 regardless of `redirects.use_regex` grant state (REQ-22/INV-05) — the permission itself is not even required to trigger the rejection, since the feature is off, not merely gated. |

---

## 5. Deduplication Rules

### 5.1 What Counts as a Duplicate

A rule is considered a duplicate of an existing rule if all of the following hold:
1. They share the same `workspaceId`.
2. They share the same `matchType: 'exact'` and identical normalized `fromPattern`
   (the unique `(workspace_id, from_pattern)` partial index, ADR-033 §2, applies only to
   `matchType: 'exact'` rows).
3. The existing rule is `status: 'active'` (a tombstoned rule's `fromPattern` may be reused
   by a new rule).

**Not a duplicate if:** matchType differs (an `exact:/old` and a `prefix:/old` rule may
coexist — they are evaluated in different precedence bands, §1.1), or the existing rule
with the same `fromPattern` is `status: 'disabled'`.

### 5.2 How Duplicates Are Handled

**At creation time:** A duplicate `exact` `fromPattern` returns `REDIRECT_CONFLICT` (409).
No rule is created.

**At import time:** Each item in an import batch is checked against existing rules (not
against other items in the same batch, since batch items are not deduplicated against each
other in v1 — REQ-26 keeps import as N independent chokepoint writes, not a batch-aware
pre-pass). Two items in the same batch with the same `exact` `fromPattern`: the first
succeeds, the second fails with `REDIRECT_CONFLICT` against the just-created first item
(EC-08).

### 5.3 Loop Collapse vs. Deduplication

These are distinct: deduplication (§5.1) is about two rules claiming the same source path;
loop collapse (REQ-13/REQ-14) is about a rule's target chaining into another rule's source.
A workspace can have zero duplicates and still have its create rejected by loop detection,
and vice versa.

---

## 6. Tie-Break Logic

### 6.1 Same-Priority, Same-Match-Type Competing Rules

**When does this apply:** Two or more active, phase-eligible rules of the same match-type
band match the same request path and have equal `priority`.

**Tie-break rule:** The more recently created-or-updated rule (`updatedAt`, falling back to
`createdAt`) wins. If those are also identical (same millisecond), the rule with the
lexicographically smaller `id` (ULID) wins.

**Rationale:** Recency-wins matches operator intent — the most recent edit is presumed the
operator's latest, most deliberate configuration. The ULID fallback is deterministic and
requires no additional counter; a true ULID collision at the same millisecond is treated as
a system-integrity issue (EC-02), not a normal case to optimize for.

**Invariant:** The tie-break rule is deterministic — identical inputs always produce the
same winner.

---

## 7. Edge Case Handling

| Edge Case | Expected Behavior | Test Required? |
|-----------|-------------------|----------------|
| `fromPattern` = exactly 2048 characters | Accepted. | Yes |
| `fromPattern` = 2049 characters | Rejected with `REDIRECT_VALIDATION_ERROR`. | Yes |
| `priority` = 1000 | Accepted. | Yes |
| `priority` = 1001 | Rejected with `REDIRECT_VALIDATION_ERROR`, not silently clamped to 1000. | Yes |
| Import batch of exactly 500 rules | Accepted (processed individually). | Yes |
| Import batch of 501 rules | Rejected with top-level `VALIDATION_ERROR` before any rule is written. | Yes |
| `matchType: 'regex'` submitted regardless of any granted permission | Rejected with `REDIRECT_VALIDATION_ERROR` — permission state is irrelevant since the feature itself is off in v1. | Yes |
| Dynamic-rule cap reached, new `wildcard` create attempted | Rejected at the write chokepoint (OQ-02 assumption: reject, not evict) with a dedicated validation reason. | Yes |
| Two rules tie on match-type, `priority`, and millisecond-equal timestamps | Lexicographically smaller `id` wins (logged as a notable event per EC-02). | Yes (negative/rare case) |
| `prefix` rule requested at exactly its `fromPattern` (no trailing segment) | Matches; `toTarget` used verbatim with no tail appended (EC-04). | Yes |
| All precedence sources exhausted (no rule matches in either phase) | Falls through to 404, unchanged from pre-Redirects behavior. | Yes |

