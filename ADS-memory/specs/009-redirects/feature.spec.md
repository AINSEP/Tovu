# Feature Spec: redirects

<!-- SPEC PACKAGE FILE: framework/spec-providers/speckit/templates/spec-system/feature.spec.md -->
<!-- Part of the spec-system package. See framework/spec-providers/speckit/templates/spec-system/ for all required files. -->

---

## Header Metadata

| Field | Value |
|-------|-------|
| spec_id | SPEC-009 |
| version | 1.0.0 |
| status | APPROVED |
| content_hash | sha256:666f3726f38eda3cc6274ebb3bfd1ee5642bcfeffb2eb80bc3f48e89fc3986ef |
| feature_name | FEAT-009-redirects |
| last_edited | 2026-07-12T00:00:00Z |
| owner | Leona Burime |
| spec_agent | Spec Agent |
| spec_mode | brownfield |

> **[NEEDS CLARIFICATION] vs Open Questions — use the right one:**
>
> **`[NEEDS CLARIFICATION]`** — inline marker for a requirement that is too ambiguous to be testable as written. Blocks Software Architect dispatch. Must be resolved before the spec advances.
>
> **Open Questions** — tracked questions that do not block Software Architect dispatch. Each must have an owner and a resolution target date.

---

## Overview

Redirects is the Tovu Tier-2 core library that layers operator- and AI-authored URL
redirect rules over the `routing` forward resolution chain (ADR-039), guarantees that a
renamed entry's old URL never silently 404s (auto-capture on slug change, ADR-033 §5), and
gives workspace admins CRUD over rules through an admin screen gated by
`admin.redirects.manage`. It closes the "renamed page 404s" failure class that the
never-brick promise (ADR-022/023) already treats as unacceptable for content.

---

## Problem Statement

**Current state:** `src/redirects/ports.ts` and `src/redirects/types.ts` exist as
interface/type stubs only (ADR-033, design-only). No adapters, no HTTP routes, no admin UI,
no wiring into `src/routing`'s forward pipeline or `SlugChangeCapture` slot exist. Today,
renaming an entry's slug produces no redirect at all — the old URL 404s immediately, and an
operator who wants to retire or move a URL has no rule mechanism to do it with.

**Desired state:** Workspace admins can create/read/update/tombstone redirect rules
(`exact`/`prefix`/`wildcard`, 301/302/307/308) through an admin screen and a typed gateway;
every entry slug change automatically and atomically captures a redirect in the same
transaction as the rename (no request can ever observe the moved entry without its
redirect already existing); and every emitted redirect location — whether a static
`toTarget` or a wildcard-interpolated one — is checked against the single open-redirect
oracle (`OriginRegistryPort.isAllowedRedirectTarget`, ADR-040) before it is written and
again before it is served.

**Why now:** Redirects is named as a Wave-1/Wave-2 admin-section sweep item and is the
final piece the routing forward chain (ADR-039, now ACCEPTED) was gated on — ADR-033 could
not be implemented until ADR-039 fixed the resolver-chain contract and the in-tx
`SlugChangeCapture` slot shape. That gate has now cleared, so Redirects can move from
design-only ADR to a concrete, buildable spec. No external deadline beyond that internal
dependency clearing.

**Success signal:** An admin can rename an entry's slug and immediately request the old URL
and receive a 301 to the new one — confirmed by an integration test that renames an entry,
then requests the old path in the same test run and asserts a redirect, with zero manual
redirect-rule authoring required.

---

## User Journey

**Trigger:** A workspace admin renames a published page's slug, or wants to manually retire
an old URL to a new destination.

**Steps (automatic capture):**
1. Admin edits an entry's slug/path and saves.
2. Core's content write chokepoint commits the rename and, in the same transaction, calls
   the bound `SlugChangeCapture.onSlugChange` implementation, which inserts an `active`,
   `source: 'auto_slug_change'`, `matchType: 'exact'` redirect rule (old path → new path)
   plus its revision.
3. A subsequent request to the old path resolves through the `post_content` (404-fill) phase
   of the routing forward chain, matches the auto rule, and receives a 301 to the new path.

**Steps (manual rule):**
1. Admin opens Admin → Redirects, clicks "Add redirect."
2. Admin enters a source pattern, match type (`exact`/`prefix`/`wildcard`), target, and
   status code; optionally flags `override` to retire a currently-live URL.
3. On save, the write chokepoint validates the pattern (bounded-cost check) and the target
   (open-redirect oracle) before persisting the rule and its revision in one transaction.
4. Rule appears in the list; a request to the source path is now redirected per the rule's
   phase (`pre_content` if `override`, else `post_content`).

**Outcome:** The admin sees the new/updated rule in the Redirects list with its status,
match type, target, and status code; a matching request receives the configured HTTP
redirect.

**Alternate paths:** An invalid pattern or a disallowed (non-allowlisted, off-site) target
is rejected at save time with an inline field error — no rule is created. A rule that would
create a redirect loop is rejected with an explicit error, not silently accepted. If
link-preservation is enabled and the automatic-capture mechanism is unavailable when a slug
changes, the rename itself fails — the admin sees the rename fail, not a silent 404 later.

Note: Deterministic match precedence, phase eligibility, and tie-break rules are specified
in `behavior.spec.md`, not here.

---

## Scope

**In scope:**
- CRUD (create/read/update/tombstone) for redirect rules with `matchType` in
  `exact | prefix | wildcard` (REQ-01–REQ-05, REQ-23–REQ-25)
- Single write chokepoint: every rule write persists the rule + an append-only
  `RedirectRevision` in one transaction (REQ-06)
- Write-time pattern validation (bounded-cost check) and write-time open-redirect validation
  of `toTarget` (REQ-07, REQ-08)
- Read-time (resolution-time) open-redirect validation of the fully-interpolated `location`
  for every matched rule, immediately before the HTTP redirect is emitted (REQ-09, REQ-10)
- `admin.redirects.manage`-gated admin CRUD, including `override` (REQ-11, REQ-12)
- One-hop chain collapse + loop rejection at write time (REQ-13, REQ-14)
- Synchronous, in-transaction auto-redirect capture on entry slug change via the core-owned
  `SlugChangeCapture` slot (REQ-15, REQ-17)
- Fail-closed `LINK_PRESERVATION_UNAVAILABLE` behavior when link-preservation is enabled and
  no capture implementation is bound (REQ-16)
- Phase eligibility (`pre_content` override-only vs `post_content` 404-fill) and match
  precedence within a phase (REQ-18, REQ-19)
- Bounded, capped evaluation of the wildcard "dynamic" rule set (REQ-20)
- Async, best-effort aggregate hit counting off the hot path (REQ-21)
- Import of rules through the same chokepoint as manual create, no bypass (REQ-26)
- Admin UI: rule list + create/edit form (REQ-23, REQ-24)

**Out of scope (deferred per ADR-033 §8, not silently reintroduced):**
- `regex` matchType authoring and the `redirects.use_regex` permission gate — the seam is
  reserved in the type vocabulary but inactive; write-time validation rejects it in v1
  (REQ-22)
- Edge/CDN redirect compilation (a plausible second `RedirectMatcher` adapter)
- Per-hit analytics timeseries (v1 ships aggregate counters only)
- Conditional redirects (geo/device/auth/time) — deferred to the `redirect.resolve` hook
- Query-string / matrix-param matching (v1 matches normalized path only)
- Bulk CSV import/export UI or format design (the chokepoint reuse requirement in REQ-26 is
  in scope; a CSV/UI import wizard is not)
- Analytics dashboards over redirect hit counts (raw `RedirectHitStats` read only, per
  workspace/per rule)
- The `routing` library's own forward-pipeline plumbing, `urlFor`/`isActive`, and
  `RouteTarget` vocabulary — already specified and implemented by ADR-039 (`src/routing/`);
  this spec only covers what Redirects registers into and consumes from it.

---

## Requirements

- REQ-01: The system shall let a principal holding `admin.redirects.manage` create a
  redirect rule with `matchType` (`exact`, `prefix`, or `wildcard`), `fromPattern`,
  `toTarget`, and `statusCode` (`301`, `302`, `307`, or `308`), with optional `override`
  (default `false`) and `priority` (default `0`).
- REQ-02: The system shall let a principal holding `admin.redirects.manage` list redirect
  rules for a workspace, filterable by `status`, `source`, and `matchType`.
- REQ-03: The system shall let a principal holding `admin.redirects.manage` fetch a single
  redirect rule by id.
- REQ-04: The system shall let a principal holding `admin.redirects.manage` update an
  existing rule's `matchType`, `fromPattern`, `toTarget`, `statusCode`, `status`,
  `override`, and/or `priority`.
- REQ-05: The system shall let a principal holding `admin.redirects.manage` tombstone
  (soft-delete) a redirect rule; a tombstoned rule is retained for audit but never matched.
- REQ-06: The system shall persist every redirect rule create/update/tombstone through
  exactly one write chokepoint (`RedirectRepoPort.save` / `.tombstone`) that writes the rule
  row and an append-only `RedirectRevision` in the same database transaction; no other code
  path may write the `redirects` or `redirect_revisions` tables.
- REQ-07: The system shall validate a candidate rule's `fromPattern` via
  `RedirectMatcher.validatePattern` at the write chokepoint and reject the write if the
  pattern is invalid or unsafe for the given `matchType`, before the rule is ever stored.
- REQ-08: The system shall validate a candidate rule's `toTarget` against the open-redirect
  oracle (`OriginRegistryPort.isAllowedRedirectTarget`) at the write chokepoint whenever
  `toTarget` is an absolute/off-site URL, and reject the write if the target is neither
  same-origin nor on the workspace's redirect allowlist.
- REQ-09: The system shall validate the fully-interpolated `location` of every matched
  redirect rule (including a `wildcard` rule's capture-substituted target and any tail
  appended from a `prefix` match) against the same open-redirect oracle immediately before
  the HTTP redirect is emitted — on every resolution, not only for hook-supplied locations
  and not only for rules with an absolute `toTarget`.
- REQ-10: The system shall treat a resolution whose fully-interpolated `location` fails the
  read-path open-redirect check as unmatched (fall through to the next phase / 404) rather
  than serving the redirect or raising a 500.
- REQ-11: The system shall require `admin.redirects.manage` to set or change a rule's
  `override` flag to `true`.
- REQ-12: The system shall require `admin.redirects.manage` for every redirect admin
  operation: create, read, list, update, tombstone, and import.
- REQ-13: The system shall collapse redirect chains to at most one hop at write time: when
  a rule A→B is created/updated and an existing active rule B→C already exists, the system
  shall store A→C while leaving B→C unchanged.
- REQ-14: The system shall reject a create/update that would introduce a direct or
  transitive redirect cycle (e.g., A→B where B→A already exists, or a longer cycle) with a
  `RedirectLoopError`, and shall not store the rule.
- REQ-15: The system shall, when an entry's routable slug/path changes and link-preservation
  is enabled for the workspace, synchronously insert an `active`,
  `source: 'auto_slug_change'`, `matchType: 'exact'` redirect rule (old path → new path) —
  and its revision — in the same database transaction as the rename, via the core-resident
  `SlugChangeCapture` implementation bound at the `routing` library's `SlugChangeCapture`
  slot (ADR-039 §4). No plugin-supplied implementation may occupy this slot.
- REQ-16: The system shall, when link-preservation is enabled for a workspace and no
  `SlugChangeCapture` implementation is bound at the routing slot, fail the entire rename
  operation with `LINK_PRESERVATION_UNAVAILABLE` rather than committing the slug/path change
  without a redirect.
- REQ-17: The system shall make the `SlugChangeCapture` binding idempotent by
  `changeSetId`: retrying the same rename change-set shall not create a duplicate auto
  redirect rule.
- REQ-18: The system shall make only `override: true` rules eligible for match during the
  `pre_content` resolution phase, and make all `active` rules (regardless of `override`)
  eligible during the `post_content` (404-fill) phase.
- REQ-19: The system shall apply match precedence within a phase in this order:
  `exact` match, then longest `prefix` match, then `wildcard` match; ties within the same
  match type are broken by explicit `priority` (higher wins), then by recency (the most
  recently created or updated rule wins).
- REQ-20: The system shall evaluate the `wildcard` "dynamic" rule set per request from a
  deterministically ordered, count-capped set (`RedirectRepoPort.listDynamic`), so matching
  cost per request is bounded regardless of how many wildcard rules a workspace has
  authored.
- REQ-21: The system shall update per-rule hit counters (`redirect_hits`) asynchronously,
  via the `redirect.hit` outbox event and an idempotent handler, and shall never make hit
  counting a synchronous part of serving a redirect response; a failure to record a hit
  shall never delay or prevent the redirect response.
- REQ-22: The system shall reject any create/update carrying `matchType: 'regex'` at the
  write chokepoint in v1, since raw regex authoring and its `redirects.use_regex` gate are
  explicitly deferred (ADR-033 §3/§8).
- REQ-23: The system shall present an admin screen listing redirect rules (source pattern,
  target, status code, status, source, override) and a create/edit form for manual rules.
- REQ-24: The system shall offer only `exact`, `prefix`, and `wildcard` as selectable match
  types in the admin create/edit form in v1.
- REQ-25: The system shall let a principal holding `admin.redirects.manage` view and
  tombstone an `auto_slug_change` rule from the admin list, but shall not offer
  `auto_slug_change` as a creatable `source` value in the manual create form.
- REQ-26: The system shall write every imported redirect rule through the same
  `RedirectRepoPort.save` chokepoint used by manual create — the same pattern validation,
  open-redirect validation, and revision write apply; no separate unvalidated import write
  path exists.

<!-- Add more as needed. Numbers must not be reused, even if a requirement is removed. -->

---

## Acceptance Criteria

- AC-01 (REQ-01) [P1]: Given a principal holding `admin.redirects.manage`, when they submit
  a create request with `matchType: 'exact'`, `fromPattern: '/old'`, `toTarget: '/new'`,
  `statusCode: 301`, then the API returns 201 with the created rule including a generated
  ULID `id`, `status: 'active'`, `source: 'manual'`, `override: false`, `priority: 0`, and
  `version: 1`.
- AC-02 (REQ-01) [P2]: Given a principal holding `admin.redirects.manage`, when they submit
  a create request with `matchType: 'wildcard'`, `fromPattern: '/blog/*'`,
  `toTarget: '/articles/$1'`, then the API returns 201 with the rule stored verbatim
  (unexpanded template).
- AC-03 (REQ-01) [P1]: Given a principal lacking `admin.redirects.manage`, when they submit
  a create request, then the API returns 403 `FORBIDDEN` and no rule is created.
- AC-04 (REQ-02) [P1]: Given a workspace with 3 active and 1 tombstoned rule, when a
  principal holding `admin.redirects.manage` lists with `status: 'active'`, then the API
  returns exactly the 3 active rules.
- AC-05 (REQ-03) [P1]: Given an existing rule id, when a principal holding
  `admin.redirects.manage` fetches it, then the API returns 200 with the full rule; given a
  non-existent id, the API returns 404 `REDIRECT_NOT_FOUND`.
- AC-06 (REQ-04) [P1]: Given an existing active rule, when a principal holding
  `admin.redirects.manage` updates its `toTarget`, then the API returns 200 with the updated
  rule, `version` incremented by 1, and a new `RedirectRevision` recorded.
- AC-07 (REQ-05) [P1]: Given an existing active rule, when a principal holding
  `admin.redirects.manage` tombstones it, then subsequent resolution attempts against its
  `fromPattern` no longer match, and the rule still appears in `list` when `status` is
  omitted from the filter.
- AC-08 (REQ-06) [P1]: Given a rule create request, when the write succeeds, then exactly
  one row is inserted into `redirects` and exactly one row is appended to
  `redirect_revisions`, both within the same transaction (verified by an integration test
  that forces a mid-transaction failure and asserts neither row persists).
- AC-09 (REQ-07) [P1]: Given a create request with an invalid `fromPattern` for the given
  `matchType` (e.g. a `wildcard` pattern with unbalanced capture groups, or an `exact`
  pattern containing a raw `*`), when the write chokepoint validates it, then the API
  returns 400 `REDIRECT_VALIDATION_ERROR` and no rule is stored.
- AC-10 (REQ-08) [P1]: Given a create request with `toTarget: 'https://evil.example.com/x'`
  and no matching workspace redirect allowlist entry, when the write chokepoint validates
  it, then the API returns 400 `REDIRECT_TARGET_NOT_ALLOWED` and no rule is stored.
- AC-11 (REQ-08) [P2]: Given a create request with `toTarget` equal to the workspace's own
  verified canonical origin plus a path, when the write chokepoint validates it, then the
  write succeeds (same-origin is always allowed).
- AC-12 (REQ-09) [P1]: Given an active `wildcard` rule `/promo/*` → `https://good.example.com/$1`
  where `good.example.com` is the workspace's allowlisted host, when a request for
  `/promo/@evil.example.com` is resolved and the capture would interpolate to
  `https://good.example.com/@evil.example.com` — an authority-mutating injection — then the
  read-path oracle re-validates the fully-interpolated `location` and, if it fails
  normalization/allowlist re-check, the resolution is treated as unmatched rather than
  served.
- AC-13 (REQ-09) [P1]: Given an active `exact` rule with a same-origin relative `toTarget`,
  when a request matches it, then the read-path oracle validates the final `location` and
  the redirect is served (relative/same-origin targets pass).
- AC-14 (REQ-10) [P1]: Given a matched rule whose fully-interpolated `location` fails the
  read-path oracle, when the routing chain resolves the request, then the response is a 404
  (or falls through to the next phase), never a 301/302/307/308 to the disallowed target and
  never a 500.
- AC-15 (REQ-11) [P1]: Given a principal holding `admin.redirects.manage` but not otherwise
  distinguished, when they set `override: true` on a create/update, then the write succeeds
  (the single v1 permission gates both general CRUD and `override`).
- AC-16 (REQ-13) [P1]: Given an active rule B with `fromPattern: '/b'`,
  `toTarget: '/c'`, when a principal creates rule A with `fromPattern: '/a'`,
  `toTarget: '/b'`, then the stored rule A has `toTarget: '/c'` and rule B is unchanged.
- AC-17 (REQ-14) [P1]: Given an active rule A→B, when a principal attempts to create a rule
  B→A, then the API returns 409 `REDIRECT_LOOP_DETECTED` and no rule is stored.
- AC-18 (REQ-15) [P1]: Given link-preservation enabled for a workspace and a bound
  `SlugChangeCapture` implementation, when an entry's slug changes from `/old-page` to
  `/new-page` in a single write transaction, then a redirect rule
  `{ matchType: 'exact', fromPattern: '/old-page', toTarget: '/new-page', source: 'auto_slug_change', status: 'active' }`
  and its revision exist immediately after that transaction commits — verified by an
  integration test that queries for the rule inside a transaction hook before any
  post-commit event fires.
- AC-19 (REQ-16) [P1]: Given link-preservation enabled for a workspace and no
  `SlugChangeCapture` implementation bound, when an entry's slug is changed, then the entire
  rename request fails with `LINK_PRESERVATION_UNAVAILABLE` and the entry's slug/path is
  unchanged after the failed request.
- AC-20 (REQ-17) [P2]: Given a rename change-set `changeSetId: X` already captured, when the
  same change-set is retried (e.g. duplicate delivery), then no second `auto_slug_change`
  rule is created for the same old→new pair.
- AC-21 (REQ-18) [P1]: Given an `override: false` active rule matching `/x` and live content
  also resolvable at `/x`, when a request for `/x` is resolved, then the `pre_content` phase
  does not match the rule (live content wins), and the rule only matches if `/x` is
  otherwise unresolvable by live content (`post_content`).
- AC-22 (REQ-18) [P1]: Given an `override: true` active rule matching `/x` and live content
  also resolvable at `/x`, when a request for `/x` is resolved, then the `pre_content` phase
  matches the rule and the redirect is served instead of the live content.
- AC-23 (REQ-19) [P1]: Given an `exact` rule for `/a/b` and a `prefix` rule for `/a`, when a
  request for `/a/b` is resolved, then the `exact` rule wins.
- AC-24 (REQ-19) [P2]: Given two `prefix` rules for `/a` and `/a/b`, when a request for
  `/a/b/c` is resolved, then the longer (`/a/b`) prefix rule wins.
- AC-25 (REQ-20) [P2]: Given a workspace at its configured dynamic-rule cap, when
  `listDynamic` is called, then it returns at most the capped count, deterministically
  ordered, never the full unbounded set.
- AC-26 (REQ-21) [P2]: Given a successfully served redirect, when the hit-count handler
  later fails to process the `redirect.hit` event, then the HTTP response already returned
  to the client is unaffected, and `redirect_hits` simply does not reflect that hit.
- AC-27 (REQ-22) [P1]: Given a create request with `matchType: 'regex'`, when the write
  chokepoint validates it, then the API returns 400 `REDIRECT_VALIDATION_ERROR` and no rule
  is stored, regardless of `fromPattern` content.
- AC-28 (REQ-23) [P1]: Given at least one existing rule, when an admin opens the Redirects
  screen, then the list renders each rule's source pattern, target, status code, status,
  source, and override flag.
- AC-29 (REQ-24) [P1]: Given the create/edit form is open, when the admin inspects the
  match-type control, then only `exact`, `prefix`, and `wildcard` are offered as options.
- AC-30 (REQ-25) [P2]: Given an `auto_slug_change` rule, when an admin holding
  `admin.redirects.manage` tombstones it from the list, then the rule is tombstoned like any
  other rule; given the create form, `auto_slug_change` is never an available `source`
  choice.
- AC-31 (REQ-26) [P2]: Given a batch import of 3 rules where one has an invalid pattern,
  when the import runs, then the 2 valid rules are written through the standard chokepoint
  (each producing a revision) and the invalid one is rejected with the same
  `REDIRECT_VALIDATION_ERROR` a manual create would produce, not a distinct import-only
  error path.

<!-- Rules:
  - Every REQ-* has at least one AC.
  - Every AC has a [P1], [P2], or [P3] tag.
  - P1 ACs are independently testable — each can be verified without other stories complete.
  - No AC requires knowledge of the implementation to evaluate.
  - AC numbers are never reused.
-->

---

## Invariants

- INV-01: A `redirects` row must never exist without a corresponding `redirect_revisions`
  row recorded in the same write transaction that created or last mutated it.
- INV-02: No request may ever observe a moved entry's new location without its
  `auto_slug_change` redirect already existing — the capture and the rename must always
  commit atomically, never one without the other.
- INV-03: A redirect resolution must never emit an HTTP redirect to a `location` that has
  not passed the open-redirect oracle (`isAllowedRedirectTarget`) check against the fully
  interpolated target, immediately before the response is sent.
- INV-04: A rule's resolved chain must never require more than one hop; the system must
  never store or resolve a rule whose `toTarget` is itself another active rule's
  `fromPattern` beyond a single collapsed step.
- INV-05: `matchType: 'regex'` must never be accepted by the write chokepoint while the
  bounded regex engine and `redirects.use_regex` gating are not built (v1 posture) — this is
  a fail-closed default-deny, not merely an unimplemented feature.
- INV-06: Hit-count updates must never be a precondition for, or a synchronous part of,
  serving a redirect response — a hit-count failure must never surface as a redirect
  failure.
- INV-07: Every write to the `redirects` or `redirect_revisions` tables must go through
  `RedirectRepoPort`; no other module or route handler may write these tables directly.

---

## Edge Cases

- EC-01: What happens when a create request's `toTarget` is a bare relative path with no
  leading slash (e.g. `new-page` instead of `/new-page`)?
  Expected behavior: The write chokepoint normalizes it to a leading-slash relative path
  before storing (matching `fromPattern` normalization); it is never treated as an
  authority/host-carrying value.
- EC-02: What happens when two `wildcard` rules with identical `priority` and the same
  `createdAt` millisecond both match a request (a tie the recency tie-break cannot break)?
  Expected behavior: This is treated as a system-integrity edge case — ids are ULIDs with
  monotonic-enough ordering that a true tie should not occur; if it does, the
  lexicographically smaller `id` wins as the final deterministic tie-break, and this is
  logged, not silently nondeterministic.
- EC-03: What happens when an admin tombstones the target of an existing rule's `toTarget`
  (i.e., a rule points at a path that itself no longer resolves to anything, live or
  redirected)?
  Expected behavior: The pointing rule is unaffected at write time (there is no toTarget
  existence check — `toTarget` is an opaque path/URL, not a foreign key into content); a
  request following it will 404 downstream unless another rule or live content resolves it.
  This is expected, not an error.
- EC-04: What happens when a `prefix` rule's `fromPattern` is `/old` and a request comes in
  for exactly `/old` (no trailing segment)?
  Expected behavior: `/old` itself matches the prefix rule and redirects to the bare
  `toTarget` (no tail appended); `/old/x` matches with `/x` appended to `toTarget`.
- EC-05: What happens when the `SlugChangeCapture` implementation itself throws an
  unexpected error (not the "unbound" case) while link-preservation is enabled?
  Expected behavior: The error propagates and aborts the rename transaction (same effective
  outcome as `LINK_PRESERVATION_UNAVAILABLE` — the rename does not commit without its
  redirect), and is logged as an internal error distinct from the expected-unbound case.
- EC-06: What happens when a request path matches an `active` rule during `post_content`,
  but live content at that exact path also exists (a previously-redirected slug is reused
  for brand-new content)?
  Expected behavior: Live content wins — `post_content` (404-fill) is only consulted after
  content-resolve has already failed to find live content, so the stale rule is
  superseded, not deleted, and simply never gets a chance to match.
- EC-07: What happens when a wildcard capture group, once interpolated, produces a
  `location` containing characters that would only become authority-mutating if
  URL-parsed leniently (e.g. a literal `\` or control character)?
  Expected behavior: The read-path oracle's normalization (ADR-040 F3) rejects raw forbidden
  characters before WHATWG parsing, so this fails the same closed path as any other
  disallowed target — treated as unmatched, not served.
- EC-08: What happens when an import batch contains two rules with the same `fromPattern`
  and `matchType: 'exact'` (would violate the unique `(workspace_id, from_pattern)` partial
  index)?
  Expected behavior: The first is written; the second fails with
  `REDIRECT_CONFLICT`, identical to two sequential manual creates hitting the same unique
  index — import does not special-case this into a silent overwrite or skip.

---

## Dependencies

| Dependency | What It Provides | Failure Mode | Fallback |
|------------|------------------|--------------|----------|
| `routing` library (`src/routing/`, ADR-039) | The forward resolution pipeline's `pre_content`/`post_content` phase registration seam (`registerResolvePhase`), and the `SlugChangeCapture` slot (`registerSlugChangeCapture`/`getSlugChangeCapture`) that content's write chokepoint calls | If Redirects never registers a phase handler, no redirect ever resolves (requests 404 as today); if the phase-handler adapter's translation between `RedirectResolution` and `RouteResolvePhaseOutcome` is wrong, resolutions could silently fail to match | None — this is a hard integration requirement, not an optional enhancement |
| `core/origin` (`src/origin/`, ADR-040) `OriginRegistryPort.isAllowedRedirectTarget` | The single open-redirect oracle used on both the write and read paths | If no verified origin is registered for a workspace, `canonicalOrigin` throws and the oracle fails closed (returns `false`) — every absolute-target write is rejected and every resolution needing a cross-origin check treats the target as disallowed | None by design — fail-closed is the intended behavior, not a gap to work around |
| Content write chokepoint (ADR-022 §4a) | The transactional boundary that calls the bound `SlugChangeCapture` on a slug-changing rename | If the content chokepoint does not actually call the slug-change slot inside its own transaction (an integration gap on the content-lib side, not Redirects'), REQ-15/REQ-16's atomicity guarantee cannot hold | None — this is owed by the content-lib owner per ADR-039 §4; Redirects can only implement the slot correctly, not force content to call it |
| `RedirectRepoPort` adapters (in-memory + Drizzle/SQLite) | Persistence for `redirects`/`redirect_revisions`/`redirect_hits` | If the Drizzle adapter is not yet built, only the in-memory adapter is available for tests; no production persistence | In-memory adapter for tests today; Drizzle/SQLite adapter is a build-phase deliverable, not a design gap |
| Identity/permissions catalog (`src/identity/permissions.ts`) | Registration + enforcement of `admin.redirects.manage` | If the permission id is never registered in the catalog, `authorize()` calls referencing it fail closed (denied) | None — registering the permission is an in-scope REQ-12 precondition, not an external dependency risk |

---

## Open Questions

- OQ-01: What is the exact per-workspace cap (count) on the `wildcard` "dynamic" rule set
  evaluated per request (ADR-033 Q-4)? This spec assumes 500 as a safe default (matching the
  existing Menus item-count precedent, `src/navigation/menu-service.ts`) pending
  confirmation. — Owner: Software Architect — Resolve by: `/plan` dispatch for FEAT-009.
- OQ-02: Should the over-cap policy (once the dynamic-rule cap above is hit) reject new
  wildcard rule creation outright, or evict the lowest-priority rule (ADR-033 Q-4)? This
  spec assumes reject-on-create (simpler, consistent with fail-closed posture elsewhere)
  pending confirmation. — Owner: Software Architect — Resolve by: `/plan` dispatch for
  FEAT-009.
- OQ-03: Whether `307`/`308` are exposed in the v1 admin UI's status-code selector or kept
  API-only until a non-GET routable surface exists (ADR-033 Q-5). This spec assumes all four
  codes are exposed in the UI (REQ-23 does not restrict them) since the API accepts all four
  and hiding two would be a UI-only inconsistency for no enforced reason. — Owner: Software
  Architect — Resolve by: `/plan` dispatch for FEAT-009.

---

## Constitution Compliance

| Article | Status | Notes |
|---------|--------|-------|
| I — Library-First | COMPLIES | Matching/validation use the platform's own bounded primitives (no third-party regex/glob library is introduced in v1 since `regex` is deferred and `wildcard` is a simple glob); `isAllowedRedirectTarget` reuses the existing `core/origin` WHATWG-parser-based oracle rather than a new URL-parsing library. |
| II — Test-First | COMPLIES | No implementation code exists yet beyond interface stubs (`src/redirects/ports.ts`/`types.ts`); TDD Agent certifies failing tests against this spec's ACs/INVs/ECs before any adapter/route/UI code is written. |
| III — Simplicity Gate | COMPLIES | Every module traces to a REQ: repo port (REQ-06), matcher seam (REQ-07/REQ-09/REQ-19), hit sink (REQ-21), admin routes (REQ-01–REQ-05), admin UI (REQ-23–REQ-25). `regex`/edge-compiler/per-hit-timeseries/conditional-redirects are explicitly out of scope, not built speculatively. |
| IV — Anti-Abstraction Gate | COMPLIES | `RedirectRepoPort` is the only new ADR-006 port (two adapters: in-memory + Drizzle/SQLite, per ADR-033's own accounting). `RedirectMatcher` and `RedirectHitSink` stay ordinary internal seams per ADR-033's explicit ADR-006 accounting — not promoted to ports in this spec. |
| V — Integration-First Testing | COMPLIES | Every P1 AC above names an HTTP/route or cross-module boundary (admin API routes, the routing-chain registration, the content-chokepoint transaction) and is tested at that boundary, per `traceability.spec.md`. |
| VI — Security-by-Default | COMPLIES | Write- and read-path open-redirect validation (REQ-08/REQ-09/REQ-10) and permission gating (REQ-11/REQ-12) are load-bearing P1 requirements, not deferred; per the constitution's standing Art. VI exception, the local dev server itself remains unauthenticated but structural authz (`admin.redirects.manage` checks) is still enforced in code from day one. |
| VII — Spec Integrity | COMPLIES | This spec's `spec_id`/`content_hash` are the reference every downstream artifact (ADR-PIPE-009, tasks, tests) must cite; hash is computed/verified via the provider-local validator. |
| VIII — Observability | COMPLIES | `redirect.created`/`redirect.updated`/`redirect.tombstoned`/`redirect.hit` outbox events (ADR-009 lane 2) carry `redirectId`/`workspaceId` as correlation ids; `errors.spec.md` defines a structured error envelope for every feature-specific error code. |

---

## Implementation Readiness Gate

This checklist must be fully checked before the spec is handed off to the Software Architect Agent.
The Spec Agent completes this. The Coordinator verifies before routing.

- [x] spec_id assigned and unique (verified against existing `ADS-memory/reports/pipeline/` folders — no existing `009-*` folder prior to this run)
- [x] version set to correct semver
- [x] status set to APPROVED (not DRAFT or REVIEW)
- [x] content_hash computed using the Speckit canonical hash rule and verified by the provider-local validator
- [x] feature_name matches the FEAT folder name exactly
- [x] Zero `[NEEDS CLARIFICATION]` markers remain in this file
- [x] All Open Questions have an owner and a resolution target date
- [x] All REQ-* items are testable and contain no vague qualifiers
- [x] All REQ-* items have at least one AC
- [x] All AC items have a [P1], [P2], or [P3] priority tag
- [x] All AC items follow Given/When/Then format
- [x] All Invariants are written as absolute, falsifiable statements
- [x] All Edge Cases have an explicit Expected Behavior
- [x] Dependencies table is complete — no blank failure mode or fallback cells
- [x] Constitution Compliance table complete — all 8 articles marked COMPLIES / EXCEPTION / N/A
- [x] Scope: in-scope list present and non-empty
- [x] Problem Statement: "Why now" field is filled (even if answer is "no deadline")
- [x] User Journey: trigger, steps, outcome, and alternate paths are present
- [x] Scope: out-of-scope list present and non-empty
- [x] Full spec-system package present: all `PRESENT` files listed in spec-manifest.md exist
- [x] behavior.spec.md complete (feature has non-trivial ordering/precedence rules)
- [x] traceability.spec.md complete (pending implementation — REQ/AC/INV/EC rows seeded, impl/test columns pending)
- [x] spec-manifest.md complete — all 10 logical files listed with `PRESENT` or `OMITTED` and concrete reasons
- [x] spec-dod.md filled and all items PASS or NA with concrete justification
- [x] spec-dod.md Spec Agent sign-off row completed; Coordinator row is reserved for Coordinator Planning Preflight before `/plan`
- [x] If `spec_mode` is `brownfield`, `reverse_spec`, or `migration`, brownfield/reverse-spec evidence paths are recorded in `spec-manifest.md`

**Gate result:** PASS

---

## Agent Directives (optional)

Always:
- Treat `src/routing/types.ts`'s `SlugChangeCapture`/`SlugChangeCaptureInput` (ADR-039,
  already implemented) as the authoritative contract for the in-tx capture slot. The
  pre-existing `SlugChangeCapture` type in `src/redirects/types.ts` predates ADR-039, is a
  flat payload shape (no `onSlugChange` method) with different field names
  (`fromPath`/`toPath`/`actorId` vs. `oldPath`/`newPath`/`actor`/`changeSetId`), and is a
  name collision with the routing-owned interface of the same name. The Software Architect
  must rename or remove the stale local stub during implementation planning — do not import
  it as-is alongside `routing`'s `SlugChangeCapture`.
- Register `admin.redirects.manage` in `src/identity/permissions.ts` following the existing
  `PermissionDescriptor` pattern.

Ask before:
- Building any edge/CDN redirect compilation, per-hit timeseries, or conditional-redirect
  hook consumer — these are named DEFERRED items, not silently in scope.

Never:
- Accept a `matchType: 'regex'` write in v1.
- Serve a redirect whose fully-interpolated `location` has not passed the read-path
  open-redirect oracle check in the same request.
