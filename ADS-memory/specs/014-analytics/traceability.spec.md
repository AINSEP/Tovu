# Traceability Matrix: analytics

<!-- SPEC PACKAGE FILE: framework/spec-providers/speckit/templates/spec-system/traceability.spec.md -->
<!-- Part of the spec-system package. See framework/spec-providers/speckit/templates/spec-system/ for all required files. -->

---

## Header Metadata

| Field | Value |
|-------|-------|
| spec_id | SPEC-014 |
| feature_name | FEAT-014-analytics |
| version | 1.0.0 |
| content_hash | sha256:PENDING |
| last_edited | 2026-07-13T00:00:00Z |
| traceability_status | IN PROGRESS |

**Purpose:** This is a retroactive traceability matrix — the implementation and tests
already exist (this spec was written from the shipped code, not the other way around).
`traceability_status` is `IN PROGRESS` rather than `COMPLETE` because several rows below
are genuine coverage gaps disclosed in `behavior.spec.md` §7 and `feature.spec.md`'s
Known Deviations, not because implementation work remains.

---

## 1. Requirement-to-Implementation-to-Test Matrix

| REQ/AC ID | Description | Priority | Impl File | Impl Function | Test File | Test ID | Status |
|-----------|-------------|----------|-----------|---------------|-----------|---------|--------|
| REQ-01 | Beacon always responds 204 regardless of outcome | — | `src/server/routes/site/analytics-ingest.ts` | `registerAnalyticsIngestRoute` | `src/server/__tests__/routes/analytics-ingest.test.ts` | (see AC-01..05) | VERIFIED |
| AC-01 (REQ-01) | Clean beacon → 204 + 1 hit stored | P1 | `analytics-ingest.ts` | `registerAnalyticsIngestRoute` | `analytics-ingest.test.ts` | "POST /_analytics/e accepts a clean beacon, returns 204, and stores a normalized hit" | VERIFIED |
| AC-02 (REQ-01) | Unresolvable host → 204, nothing stored | P1 | `analytics-ingest.ts` | `registerAnalyticsIngestRoute` | `analytics-ingest.test.ts` | "POST /_analytics/e never leaks accept/reject: an unresolvable host still returns 204 with an empty body" | VERIFIED |
| AC-03 (REQ-01) | PII-shaped eventProps → 204, nothing stored | P1 | `analytics-ingest.ts` | `registerAnalyticsIngestRoute` | `analytics-ingest.test.ts` | "POST /_analytics/e never leaks accept/reject: PII-shaped event props are dropped silently (still 204)" | VERIFIED |
| AC-04 (REQ-01) | Malformed/empty body → 204, no throw | P2 | `analytics-ingest.ts` | `registerAnalyticsIngestRoute` | `analytics-ingest.test.ts` | "POST /_analytics/e tolerates a malformed/empty body without throwing (still 204, nothing stored)" | VERIFIED |
| AC-05 (REQ-01) | `eventProps` as array → 204, stored `eventProps: null` | P2 | `analytics-ingest.ts` | `registerAnalyticsIngestRoute`, `isJsonObject` | `analytics-ingest.test.ts` | "POST /_analytics/e rejects an array masquerading as eventProps rather than crashing" | VERIFIED |
| REQ-02 | Host→workspace resolution; drop when unresolved | — | `src/analytics/ingest.ts` | `ingestHit` | `src/analytics/__tests__/ingest.test.ts` | (see AC-06) | VERIFIED |
| AC-06 (REQ-02) | `resolveWorkspaceForHost` returns null → `workspace_unresolved` | P1 | `ingest.ts` | `ingestHit` | `ingest.test.ts` | "ingestHit drops a hit for an unresolvable workspace host" | VERIFIED |
| REQ-03 | Per-workspace `enabled` flag gates ingest | — | `ingest.ts` | `ingestHit` | `ingest.test.ts` | (see AC-07) | VERIFIED |
| AC-07 (REQ-03) | `config.enabled=false` → `analytics_disabled` | P1 | `ingest.ts` | `ingestHit` | `ingest.test.ts` | "ingestHit drops a hit when the site has analytics disabled" | VERIFIED |
| REQ-04 | DNT/GPC honored per site config | — | `ingest.ts` | `findExclusionReason` | `ingest.test.ts` | (see AC-08, AC-09) | VERIFIED |
| AC-08 (REQ-04) | `dnt=true` + honored → drop `dnt` | P1 | `ingest.ts` | `findExclusionReason` | `ingest.test.ts` | "ingestHit honors Do-Not-Track" | VERIFIED |
| AC-09 (REQ-04) | `gpc=true` + honored → drop `gpc` | P1 | `ingest.ts` | `findExclusionReason` | `ingest.test.ts` | "ingestHit honors Global Privacy Control" | VERIFIED |
| REQ-05 | Path glob / IP CIDR exclusion | — | `ingest.ts` | `isPathExcluded`, `isIpExcluded` | `ingest.test.ts` | (see AC-10, AC-11) | VERIFIED |
| AC-10 (REQ-05) | Excluded path glob → drop `excluded_path` | P1 | `ingest.ts` | `isPathExcluded`, `pathMatchesGlob` | `ingest.test.ts` | "ingestHit drops a hit for an excluded path" | VERIFIED |
| AC-11 (REQ-05) | Excluded IP CIDR → drop `excluded_ip` | P1 | `ingest.ts` | `isIpExcluded`, `ipMatchesRange` | `ingest.test.ts` | "ingestHit drops a hit for an excluded IP range (CIDR)" | VERIFIED |
| REQ-06 | `visitorHash` = salted, non-reversible, day-rotating digest; no raw IP/UA leak | — | `ingest.ts`, `salt.ts` | `normalizeIngestContext`, `deriveDailySalt` | `ingest.test.ts`, `salt.test.ts` | (see AC-12..16) | VERIFIED |
| AC-12 (REQ-06) | Same inputs → same hash | P1 | `ingest.ts` | `normalizeIngestContext` | `ingest.test.ts` | "normalizeIngestContext is deterministic for the same (salt, ip, ua)" | VERIFIED |
| AC-13 (REQ-06) | Different UTC day → different hash | P1 | `ingest.ts` | `normalizeIngestContext`, `ingestHit` | `ingest.test.ts` | "normalizeIngestContext produces a different hash when the day (salt) rotates"; "ingestHit produces a different visitorHash on a different UTC day (salt rotation end-to-end)" | VERIFIED |
| AC-14 (REQ-06) | No raw IP/UA leak, at unit/service/route level | P1 | `ingest.ts`, `analytics-ingest.ts` | `normalizeIngestContext`, `ingestHit` | `ingest.test.ts` (x2), `analytics-ingest.test.ts` (implicit via stored-field assertions) | "normalizeIngestContext never places the raw ip or user-agent on its return value"; "ingestHit never lets the raw ip or user-agent reach the stored NormalizedHit" | VERIFIED |
| AC-15 (REQ-06) | Different workspaceId → different salt | P2 | `salt.ts` | `deriveDailySalt` | `salt.test.ts` | "deriveDailySalt is workspace-scoped (no cross-workspace salt reuse)" | VERIFIED |
| AC-16 (REQ-06) | Empty workspaceId/utcDate → RangeError | P2 | `salt.ts` | `deriveDailySalt` | `salt.test.ts` | "deriveDailySalt rejects an empty workspaceId"; "deriveDailySalt rejects an empty utcDate" | VERIFIED |
| REQ-07 | Coarse UA classification | — | `ingest.ts` | `classifyUserAgent` | `ingest.test.ts` | (see AC-17) | VERIFIED |
| AC-17 (REQ-07) | Chrome/Windows UA → desktop/chrome/windows | P2 | `ingest.ts` | `classifyUserAgent` | `ingest.test.ts` | "normalizeIngestContext is deterministic for the same (salt, ip, ua)" (asserts classification fields as a side effect) | VERIFIED |
| REQ-08 | Bounded/PII-shape event-property validation | — | `ingest.ts` | `validateEventProps` | `ingest.test.ts` | (see AC-18..23) | VERIFIED |
| AC-18 (REQ-08) | Clean props pass through | P1 | `ingest.ts` | `validateEventProps` | `ingest.test.ts` | "validateEventProps passes through clean properties" | VERIFIED |
| AC-19 (REQ-08) | null/undefined → null | P1 | `ingest.ts` | `validateEventProps` | `ingest.test.ts` | "validateEventProps returns null when no properties are supplied" | VERIFIED |
| AC-20 (REQ-08) | Email-shaped value rejected | P1 | `ingest.ts` | `validateEventProps` | `ingest.test.ts` | "validateEventProps rejects an email-shaped value" | VERIFIED |
| AC-21 (REQ-08) | PII-suggestive key rejected | P1 | `ingest.ts` | `validateEventProps` | `ingest.test.ts` | "validateEventProps rejects a PII-suggestive key name" | VERIFIED |
| AC-22 (REQ-08) | >20 keys rejected | P2 | `ingest.ts` | `validateEventProps` | `ingest.test.ts` | "validateEventProps rejects a property bag over the key-count bound" | VERIFIED |
| AC-23 (REQ-08) | >200-char value rejected | P2 | `ingest.ts` | `validateEventProps` | `ingest.test.ts` | "validateEventProps rejects an over-length string value" | VERIFIED |
| REQ-09 | Bounded 30-min same-day session id | — | `ingest.ts` | `deriveSessionId` | `src/analytics/__tests__/ingest.test.ts` | (see AC-37) | UNTESTED (for the specific same-window property; see AC-37) |
| AC-37 (REQ-09) | Two same-window hits share `sessionId` | P3 | `ingest.ts` | `deriveSessionId` | *(none dedicated — existing tests only assert `sessionId` is a string, e.g. "ingestHit accepts a clean hit and hands a PII-free NormalizedHit to the sink")* | *(none dedicated)* | UNTESTED |
| REQ-10 | Referrer-host + UTM extraction | — | `ingest.ts` | `extractReferrerHost`, `extractUtm` | `ingest.test.ts`, `analytics-ingest.test.ts`, `analytics-recent-hits.test.ts` | (see AC-24) | VERIFIED |
| AC-24 (REQ-10) | Referrer URL → host extracted | P1 | `ingest.ts` | `extractReferrerHost` | `ingest.test.ts`, `analytics-ingest.test.ts` | "ingestHit accepts a clean hit and hands a PII-free NormalizedHit to the sink" (asserts `referrerHost`); "POST /_analytics/e accepts a clean beacon, returns 204, and stores a normalized hit" (asserts `referrerHost`) | VERIFIED |
| REQ-11 | Optional `beforeIngest` hook may drop a hit | — | `ingest.ts` | `ingestHit` | `ingest.test.ts` | (see AC-25) | VERIFIED |
| AC-25 (REQ-11) | Hook returns null → `dropped_by_hook` | P1 | `ingest.ts` | `ingestHit` | `ingest.test.ts` | "ingestHit lets a beforeIngest hook drop a hit" | VERIFIED |
| REQ-12 | Accepted hits handed to `AnalyticsSinkPort` (in-memory only) | — | `src/analytics/repo.memory.ts` | `LocalBufferSink.accept`/`acceptBatch` | `src/analytics/__tests__/repo.memory.test.ts` | (see AC-26) | VERIFIED |
| AC-26 (REQ-12) | `accept()` appends; retrievable via `all()`/`list()` | P1 | `repo.memory.ts` | `LocalBufferSink.accept`, `.all`, `.list` | `repo.memory.test.ts` | "list() returns hits newest-first" (exercises `accept` + read path together) | VERIFIED |
| REQ-13 | Recent-hits route returns bounded, honest field subset | — | `src/server/routes/admin/analytics/recent-hits.ts` | `registerAdminAnalyticsRecentHitsRoute`, `toAdminAnalyticsHitResponse` | `src/server/__tests__/routes/analytics-recent-hits.test.ts` | (see AC-27, AC-28) | VERIFIED |
| AC-27 (REQ-13) | Empty buffer → `{ hits: [] }` | P1 | `recent-hits.ts` | `registerAdminAnalyticsRecentHitsRoute` | `analytics-recent-hits.test.ts` | "GET recent-hits returns the empty list when nothing has been ingested" | VERIFIED |
| AC-28 (REQ-13) | Newest-first, exactly 7 allowlisted fields, no PII/internal fields | P1 | `recent-hits.ts` | `toAdminAnalyticsHitResponse` | `analytics-recent-hits.test.ts` | "GET recent-hits returns hits newest-first with only the honest raw-ingest fields" | VERIFIED |
| REQ-14 | Workspace-id path-param validation; no per-action permission check | — | `recent-hits.ts` | `registerAdminAnalyticsRecentHitsRoute` | `analytics-recent-hits.test.ts` | (see AC-29) | VERIFIED (implementation matches this spec's as-built description, including the absence of `authorize()` — see Known Deviations) |
| AC-29 (REQ-14) | Mismatched `:workspaceId` → 404 | P1 | `recent-hits.ts` | `registerAdminAnalyticsRecentHitsRoute` | `analytics-recent-hits.test.ts` | "GET recent-hits 404s on a workspace id that does not match the deployed workspace" | VERIFIED |
| REQ-15 | `?limit=` clamped to [1, 500], default 50 | — | `recent-hits.ts`, `repo.memory.ts` | `parseLimitParam`, `clampListLimit` | `analytics-recent-hits.test.ts`, `repo.memory.test.ts` | (see AC-30..33) | VERIFIED |
| AC-30 (REQ-15) | `?limit=1` with 3 hits → 1 returned | P1 | `recent-hits.ts` | `parseLimitParam` | `analytics-recent-hits.test.ts` | "GET recent-hits respects the ?limit= query param" | VERIFIED |
| AC-31 (REQ-15) | `?limit=100000` / 600 buffered → 500 returned (hard cap) | P1 | `repo.memory.ts` | `clampListLimit` | `repo.memory.test.ts` | "list() clamps a requested limit above the hard cap (500) instead of returning unbounded rows" | VERIFIED |
| AC-32 (REQ-15) | Non-numeric `?limit=` → falls back to default | P2 | `recent-hits.ts` | `parseLimitParam` | `analytics-recent-hits.test.ts` | "GET recent-hits ignores a non-numeric ?limit= rather than erroring" | VERIFIED |
| AC-33 (REQ-15) | `NaN`/`-10`/`0` passed to `list()` directly → default/floor-1 | P2 | `repo.memory.ts` | `clampListLimit` | `repo.memory.test.ts` | "list() clamps non-finite/invalid limit input to at least 1 rather than throwing or returning everything" | VERIFIED |
| REQ-16 | Admin UI renders loading/error/empty/table states with honesty notice | — | `apps/admin/src/sections/Analytics.tsx` | `Analytics` | *(none)* | *(none)* | UNTESTED — no component-level test file exists for `Analytics.tsx` |
| AC-34 (REQ-16) | Empty-state notice on `hits.length === 0` | P1 | `Analytics.tsx` | `Analytics` | *(none)* | *(none)* | UNTESTED |
| AC-35 (REQ-16) | Table row per hit with documented field mapping | P1 | `Analytics.tsx` | `Analytics` | *(none)* | *(none)* | UNTESTED |
| AC-36 (REQ-16) | Loading/error notices | P2 | `Analytics.tsx` | `Analytics` | *(none)* | *(none)* | UNTESTED |

---

## 2. Invariant Traceability

| INV ID | Invariant | Test File | Test ID | Status |
|--------|-----------|-----------|---------|--------|
| INV-01 | Raw IP/UA never appears on a `NormalizedHit` or its serialization | `src/analytics/__tests__/ingest.test.ts` | "normalizeIngestContext never places the raw ip or user-agent on its return value"; "ingestHit never lets the raw ip or user-agent reach the stored NormalizedHit" | VERIFIED |
| INV-02 | Daily salt is never persisted | `src/analytics/__tests__/salt.test.ts` | Implicit — `deriveDailySalt` has no write path to assert against; verified by code inspection (no file/DB/cache write anywhere in `salt.ts`), not by a dedicated negative test | VERIFIED (by inspection; no dedicated "does not persist" test exists — a coverage gap for an explicit negative-assertion test, though the property holds by the absence of any I/O in the function) |
| INV-03 | `POST /_analytics/e` always responds 204 | `src/server/__tests__/routes/analytics-ingest.test.ts` | All 5 tests in this file assert `res.status === 204` | VERIFIED |
| INV-04 | `list()` never returns more than 500 rows | `src/analytics/__tests__/repo.memory.test.ts` | "list() clamps a requested limit above the hard cap (500) instead of returning unbounded rows" | VERIFIED |
| INV-05 | `ingestHit` never throws for expected/policy drop reasons | `src/analytics/__tests__/ingest.test.ts` | All drop-reason tests assert `result.accepted === false` with a `reason`, not a thrown error | VERIFIED |
| INV-06 | Recent-hits response never includes `workspaceId`/`visitorHash`/`sessionId`/`utm` | `src/server/__tests__/routes/analytics-recent-hits.test.ts` | "GET recent-hits returns hits newest-first with only the honest raw-ingest fields" (asserts exact 7-key field set and explicitly asserts absence of `visitorHash`/`sessionId`/`workspaceId`) | VERIFIED |

---

## 3. Edge Case Traceability

| EC ID | Edge Case | Test File | Test ID | Status |
|-------|-----------|-----------|---------|--------|
| EC-01 | Empty beacon JSON body (`{}`) | `src/server/__tests__/routes/analytics-ingest.test.ts` | "POST /_analytics/e tolerates a malformed/empty body without throwing (still 204, nothing stored)" | VERIFIED |
| EC-02 | `eventProps` sent as an array | `analytics-ingest.test.ts` | "POST /_analytics/e rejects an array masquerading as eventProps rather than crashing" | VERIFIED |
| EC-03 | Non-numeric `?limit=` | `src/server/__tests__/routes/analytics-recent-hits.test.ts` | "GET recent-hits ignores a non-numeric ?limit= rather than erroring" | VERIFIED |
| EC-04 | `?limit=` far above cap with buffer over cap | `src/analytics/__tests__/repo.memory.test.ts` | "list() clamps a requested limit above the hard cap (500) instead of returning unbounded rows" | VERIFIED |
| EC-05 | Same visitor across two UTC days | `src/analytics/__tests__/ingest.test.ts` | "ingestHit produces a different visitorHash on a different UTC day (salt rotation end-to-end)" | VERIFIED |
| EC-06 | Process restart discards buffered hits | *(none — architectural property of an in-memory array, not independently testable without a process-restart test harness)* | *(none)* | DEFERRED — see §6.4 |
| EC-07 | Mismatched workspace id on recent-hits | `analytics-recent-hits.test.ts` | "GET recent-hits 404s on a workspace id that does not match the deployed workspace" | VERIFIED |
| EC-08 | Malformed referrer URL | *(none dedicated)* | *(none)* | UNTESTED |

---

## 4. Error Code Traceability

| Error Code | Produced By (file/function) | Test File | Test ID | Status |
|------------|-----------------------------|-----------|---------|--------|
| `workspace_unresolved` | `ingest.ts#ingestHit` | `ingest.test.ts` | "ingestHit drops a hit for an unresolvable workspace host" | VERIFIED |
| `analytics_disabled` | `ingest.ts#ingestHit` | `ingest.test.ts` | "ingestHit drops a hit when the site has analytics disabled" | VERIFIED |
| `dnt` | `ingest.ts#findExclusionReason` | `ingest.test.ts` | "ingestHit honors Do-Not-Track" | VERIFIED |
| `gpc` | `ingest.ts#findExclusionReason` | `ingest.test.ts` | "ingestHit honors Global Privacy Control" | VERIFIED |
| `excluded_path` | `ingest.ts#findExclusionReason` | `ingest.test.ts` | "ingestHit drops a hit for an excluded path" | VERIFIED |
| `excluded_ip` | `ingest.ts#findExclusionReason` | `ingest.test.ts` | "ingestHit drops a hit for an excluded IP range (CIDR)" | VERIFIED |
| `pii_rejected` | `ingest.ts#validateEventProps` (surfaced by `ingestHit`) | `ingest.test.ts` | "ingestHit rejects PII-shaped custom event properties" | VERIFIED |
| `dropped_by_hook` | `ingest.ts#ingestHit` | `ingest.test.ts` | "ingestHit lets a beforeIngest hook drop a hit" | VERIFIED |
| `ANALYTICS_WORKSPACE_NOT_FOUND` | `recent-hits.ts#registerAdminAnalyticsRecentHitsRoute` | `analytics-recent-hits.test.ts` | "GET recent-hits 404s on a workspace id that does not match the deployed workspace" | VERIFIED |
| `UNAUTHENTICATED` | `dev-auth.ts#requireAdminSession` (not owned by analytics) | *(covered under identity's own test suite, not this feature's)* | N/A | N/A — owned by a different feature |

---

## 5. Behavior Rule Traceability

| Rule | Section in behavior.spec.md | Test File | Test ID | Status |
|------|-----------------------------|-----------|---------|--------|
| Drop-reason precedence (workspace → disabled → dnt/gpc/path/ip → pii → hook) | § 1.1 | *(none dedicated to the combined ordering)* | *(none)* | UNTESTED — each reason is tested in isolation; no test exercises two competing conditions on one hit |
| Config-source precedence (config flag gates client flag) | § 1.2 | *(none dedicated)* | *(none)* | UNTESTED — no test sets `honorDoNotTrack: false` with `dnt: true` |
| Recent-hits read order (reverse insertion order) | § 2.1 | `repo.memory.test.ts` | "list() returns hits newest-first" | VERIFIED |
| Default: `kind` = "pageview" | § 3 | `analytics-ingest.test.ts` | "POST /_analytics/e tolerates a malformed/empty body without throwing (still 204, nothing stored)" (empty body implies default kind, though not directly asserted on the response) | UNTESTED (as an explicit assertion) |
| Default: `limit` = 50 | § 3 | `repo.memory.test.ts` | "list() defaults to 50 rows when no limit is given" | VERIFIED |
| Limit bound: max 20 event-prop keys | § 4 | `ingest.test.ts` | "validateEventProps rejects a property bag over the key-count bound" | VERIFIED |
| Limit bound: max 200-char prop value | § 4 | `ingest.test.ts` | "validateEventProps rejects an over-length string value" | VERIFIED |
| Limit bound: `list()` ceiling 500 / floor 1 | § 4 | `repo.memory.test.ts` | "list() clamps a requested limit above the hard cap (500) instead of returning unbounded rows"; "list() clamps non-finite/invalid limit input to at least 1 rather than throwing or returning everything" | VERIFIED |
| No deduplication (§5) | § 5 | N/A | N/A | N/A |
| No tie-break scenario (§6) | § 6 | N/A | N/A | N/A |

---

## 6. Coverage Gaps

### 6.1 Unimplemented Requirements

| REQ/AC ID | Reason Unimplemented | Target Completion | Owner |
|-----------|---------------------|-------------------|-------|
| — | All REQ-* in this spec are implemented; there are no unimplemented requirements within this spec's scope. Storage/rollup/dashboard/goals/export are out of scope by design (see feature.spec.md Scope), not unimplemented requirements of this spec. | — | — |

### 6.2 Untested Requirements

| REQ/AC ID | Reason Untested | Target Completion | Owner |
|-----------|----------------|-------------------|-------|
| REQ-09 (session id derivation) | No dedicated unit test for `deriveSessionId`'s window-bucketing behavior; only exercised indirectly (asserted as "is a string") by `ingest.test.ts`. | 2026-08-01 | Analytics section owner |
| REQ-16 / AC-34 / AC-35 / AC-36 (`Analytics.tsx`) | No component-level test file exists for the admin UI screen. | 2026-08-01 | Analytics section owner |
| § 1.1 combined drop-reason precedence | No test exercises two simultaneous drop conditions on one hit. | 2026-08-01 | Analytics section owner |
| § 1.2 config-source precedence | No test sets a config `honor*` flag to `false` alongside a client `dnt`/`gpc` flag. | 2026-08-01 | Analytics section owner |
| EC-08 (malformed referrer URL) | No test supplies an unparsable referrer string. | 2026-08-01 | Analytics section owner |
| A `beforeIngest` hook that throws (vs. returns null) | No test exercises a throwing hook. | 2026-08-01 | Analytics section owner |
| Exact boundary values (20/21 keys, 200/201 chars, 500/501 limit) | Existing tests use values well past the boundary (25 keys, 500 chars, 100000 limit), not the exact off-by-one boundary. | 2026-08-01 | Analytics section owner |

### 6.3 Untested Error Codes

| Error Code | Reason Untested | Target Completion | Owner |
|------------|----------------|-------------------|-------|
| — | All error/drop-reason codes this feature produces have at least one covering test (see §4). | — | — |

### 6.4 Deferred Items

| REQ/AC ID | Deferred To | Reason | Approved By |
|-----------|-------------|--------|-------------|
| EC-06 (process-restart data loss) | Not deferred to a future spec — it is an architectural property of the in-memory buffer, verified by code inspection (no persistence code path exists) rather than by a runnable test, since a "restart the process mid-test" harness is disproportionate for asserting an absence of I/O. | Documented here as an accepted verification method, not a gap to close. | Spec Agent (this dispatch) |
| Storage/rollup/dashboard/goals/export requirements | Deferred to a future SPEC-NNN covering the Tier-3 build-out named in ADR-035 | Explicitly out of scope for this as-built spec (see feature.spec.md Scope) | Spec Agent (this dispatch), per dispatch instructions |

---

## 7. Untraced Requirements

| REQ/AC ID | Reason Not In Matrix |
|-----------|---------------------|
| — | All REQ-*/AC-*/INV-*/EC-* from `feature.spec.md` appear above. |

---

## 8. Traceability Completeness Checklist

- [x] All REQ-* from feature.spec.md appear in the Section 1 matrix
- [x] All AC-* from feature.spec.md appear in the Section 1 matrix
- [x] All INV-* from feature.spec.md appear in the Section 2 matrix
- [x] All EC-* from feature.spec.md appear in the Section 3 matrix
- [x] All error codes from errors.spec.md appear in the Section 4 matrix
- [x] All behavior rules from behavior.spec.md appear in the Section 5 matrix
- [x] Section 6.1 (unimplemented) is empty or all entries are DEFERRED with approval
- [x] Section 6.2 (untested) lists concrete owners/target dates for every real gap — not
      empty, because real gaps exist and are disclosed rather than hidden
- [x] Section 6.3 (untested error codes) is empty
- [x] Section 7 (untraced) is empty

**[ ] TRACEABILITY COMPLETE** — NOT checked. Section 6.2 lists 7 real, disclosed coverage
gaps against already-shipped code. This spec documents current reality (`IN PROGRESS`)
rather than asserting a false `COMPLETE`. Closing these gaps is future test-writing work,
not a blocker to this spec's own readiness gate (which documents behavior, it does not
promise 100% coverage of already-shipped code).

---

## Sign-Off

| Role | Name / Agent | Date (ISO-8601) | Notes |
|------|--------------|-----------------|-------|
| Spec Agent | Spec Agent | 2026-07-13 | As-built backfill from shipped code + existing tests. |
| TDD Agent | | | N/A for this dispatch — no new tests commissioned by this spec pass. |
| Programmer Agent | | | N/A — code predates this spec. |
| Code Review Agent | | | |
| Coordinator | | | |
