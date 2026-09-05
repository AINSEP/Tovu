# Route coverage — ground truth — 2026-09-05

**Status: IN PROGRESS — skeleton committed early per standing incremental-commit rule.**

Dispatch: produce a trustworthy `apps/website/src/server/routes/**`-equivalent (now
`inbound/{admin-http,public-http}/routes/**`) coverage number, distinguish real gaps from
measurement artifacts, and design (not build) a trustworthy recurring measurement.

Every prior report (`2026-09-03-route-coverage-below-100.md`,
`2026-09-03-coverage-gap-analysis-existing-data.md`,
`2026-09-05-coverage-dual-instantiation-routes-W-and-A.md`) is treated as a CLAIM, not fact, and
re-verified against code and fresh measurements. Every line below is marked **MEASURED** (I ran it
and read the output myself) or **INFERRED** (reasoning on top of a MEASURED fact). A number I did
not personally produce is cited as "per <report>", never stated as fact.

## 1. Confirmed traps (read the scripts myself)

- **`check:route-coverage-floor` runs no tests.** MEASURED: `development/scripts/check-route-coverage-floor.ts`
  only calls `loadRouteCoverage()` against the on-disk `development/coverage/lcov.info` — no test
  invocation anywhere in the file or in `route-coverage-lib.ts`. That lcov's mtime is **2026-09-03
  19:43** (`ls -la development/coverage/`) — 2 days stale as of today. Its green/red proves nothing
  about current code.
- Dual-instantiation contamination is real and partially fixed today (`4d48f645`, `96988ca7`,
  `b3748e94` per the 2026-09-05 report) but not fully — confirmed by re-reading that report and the
  detector script, not yet re-run by me at this point in the task.

## 2. Scope for this measurement

TBD below as measurement proceeds.

## 3. The real coverage number

TBD.

## 4. Genuinely uncovered vs. artifact-uncovered

TBD.

## 5. Why prior numbers differ

TBD.

## 6. Design for a trustworthy recurring measurement (not built)

TBD.

## 7. Ranked gap list

TBD.

## 8. The `api.ts` "~145 untested endpoints" claim

TBD — note up front: this claim (`project_tovu_open_decisions_2026_09_05` memory, sourced from an
admin-coverage sweep) is about `apps/admin/src/lib/api.ts`, the admin SPA's HTTP **client** wrapper
under `vitest`/jsdom — a different app, different runner, different layer (client call-sites, not
server route handlers) than this dispatch's `apps/website` server-route scope. Verifying it anyway
per explicit instruction; scope mismatch will be called out either way.
