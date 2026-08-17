# Mutation sweep — 2026-08-17 (`route-quality` agent)

Final task: mutation testing, requested as the missing fourth quality signal (`src/` runs on
`node:test`, which has no statements metric — line/branch/funcs only — so mutation testing is the
recommended way to check whether the guards this session hardened would actually catch a regression,
not just whether they're covered by a passing suite).

## 1. Does `development/scripts/mutation-sweep.mjs` actually work?

**Yes.** It is not stale or broken. Ran it for real against three route files (below) and it behaved
exactly as documented: refused to start on a dirty file, took a git-diff-based dirty check plus a
PID lock file seriously, ran a real baseline-green check before mutating anything, generated mutants
by regex over `if`-guards and `??`/`?.`, wrote each mutant to disk, ran the real scoped test command,
classified the result into `killed` / `SURVIVED` / `INCONCLUSIVE` (never conflating a non-compiling
mutant with a real kill), and restored the original file byte-for-byte after every run including the
final one. No prior evidence this session that anyone had run it — it has been cited for weeks on the
strength of existing. It earns the citation.

One correction to how to READ its output, found by hand, not a defect in the tool: **`SURVIVED` does
not always mean "write a test."** Two of the three files' most common survivor
(`(req.body ?? {})`/`(req.params.workspaceId ?? "")`) turned out to be genuinely dead code — see §3.
The tool is honest that a mutant survived; deciding whether that's actionable still takes a human
read of the surrounding code. Reported here in detail because it's the exact trap the task brief
warned about ("a surviving mutant usually means untested, not delete this code") — this repo also has
the third case: untested AND untestable-as-written, which is neither "delete" nor "add a test", but
"confirm it's genuinely unreachable and say so."

## 2. Scope

Swept the three credential-CRUD route files this session hardened, plus the shared
`route-async-guards.test.ts` regression file wherever it also exercises the target file:

| File | Own test file | Also swept against | Mutants | Survived (1st pass) | Survived (after closing) |
|---|---|---|---|---|---|
| `vendor-credentials.ts` | `vendor-credentials-route.test.ts` (8 tests) | — (not covered by route-async-guards) | 9 | 3 | 3 (unchanged — see §3) |
| `source-control-credentials.ts` | `source-control-credentials-route.test.ts` (8 tests) | `route-async-guards.test.ts` | 9 | 3 | 3 (unchanged — see §3) |
| `publish-credentials.ts` | `publish-credentials-route.test.ts` (15→17 tests) | `route-async-guards.test.ts` | 17 | 8 | 5 |

`--all-ifs`/`--optional` were not used — the default (guard-shaped `if`s plus `??`) is the right
scope for these files, which are almost entirely guard clauses.

## 3. `vendor-credentials.ts` / `source-control-credentials.ts` — 3 survivors each, all confirmed dead code, none closed

Both files are structurally identical (GET/POST/PUT/DELETE CRUD, same `rejectUnlessAuthorized`
shape). Same 3 survivors in both, same reason, verified empirically rather than assumed:

- `if (String(req.params.workspaceId ?? "") !== deps.workspaceId)` — the `?? ""` fallback.
- `const body = (req.body ?? {}) as Record<string, unknown>;` — on both POST and PUT.

**Checked whether these are real gaps, not just accepted the SURVIVED verdict at face value.** Wrote
a standalone probe hitting this repo's actual `express.json()` middleware (Express 4.21.2, the
version this repo pins) with a POST/PUT carrying no content-type and no body at all — the case that
would make `req.body` genuinely `undefined` if the fallback mattered. Confirmed directly:
**`express.json()` defaults `req.body` to `{}` unconditionally**, even with no content-type header —
not merely when a body is present. `req.params.workspaceId` has the same shape for a different
reason: Express does not invoke a handler at all for a `:workspaceId` route unless that segment is
present, so the parameter is never actually absent at the point this code reads it.

**Conclusion: both fallbacks are dead code in this app's real configuration, not missing test
coverage.** A test cannot kill a mutant on a line the real code path never reaches — writing an
"empty POST" test would pass regardless of whether the fallback exists, proving nothing about the
mutant. Recommend leaving them alone (they're cheap, harmless, and would matter if `express.json()`'s
default ever changed or the route were reached a different way) rather than deleting them — deleting
correct, if currently redundant, defensive code was never this task's mandate, and "survived" is not
"prove it's needed AND has zero cost."

`publish-credentials.ts` has the identical two fallbacks (see §4) for the same confirmed reason — not
re-derived per file, this finding was checked once and applies structurally to all three.

## 4. `publish-credentials.ts` — 8 survivors, 3 closed with real tests, 5 left open (2 same dead-code class, 3 documented below)

**Closed, with tests, verified by re-running the sweep (8 → 5 survived):**

1. **`POST .../:id/verify` and `GET .../:id/repos` had no auth-gate test at all.** The existing
   "unauthorized principal gets 403 on every verb" test only covered the four CRUD verbs
   (`GET`/`POST`/`PUT`/`DELETE`) — both single-credential action routes have their OWN
   `rejectUnlessAuthorized(req, res)` call site (not shared middleware), and neutralizing either one
   left all 15 then-existing tests green. Extended the existing test to also hit both routes with a
   bare (no-grants) principal and assert 403. **This is a real, previously-unverified auth gap on two
   routes that decrypt a credential and make an outbound request** — exactly the surface this session
   has been hardening.
2. **The account-label heal path (`verifyAfterSave`'s `if (result?.accountLabel !== undefined)`) had
   no test proving the DB write actually happens.** Existing tests only asserted the shape of the
   verify response, never that a real `"valid"` verify with an `accountLabel` persists it to the row.
   This is the same fix the 2026-08-16 session shipped for a real found bug ("verification lived in
   `InMemoryPublishCredentialVerificationCache` only, so a restart silently reverted a working,
   previously-verified credential to no known account") — it had shipped with response-shape tests
   but no test of the actual DB write. Added one: a github-pages credential verified against a real
   200 `{login: "octocat"}` GitHub response, then read back through a SEPARATE request to prove the
   write survived past the response object, not just that `computeVerificationResult` computed the
   right value in memory.

**Left open, same confirmed-dead-code class as §3 (not closed):**

3. `if (String(req.params.workspaceId ?? "") !== deps.workspaceId))` (line 237).
4. `const body = (req.body ?? {})` ×2 (POST line 278, PUT line 299) — did add a "POST with no body
   still 400s with VALIDATION" test for the independent value of pinning that real behavior, but its
   own doc comment says plainly that it does NOT kill this mutant, for the reason in §3.

**Left open, genuinely low-value, reasoned through rather than skipped:**

5. `return result ?? undefined;` (line 196, inside `verifyAfterSave`) — converts a `null` from
   `verifyPublishCredentialById` to `undefined`. Traced both call sites: `POST`/`PUT` spread it via
   `...(verification ? { verification } : {})`, where `null` and `undefined` are equally falsy, so
   the ternary picks `{}` either way — genuinely unobservable there. `POST .../:id/verify` uses
   `res.json({ verification })` directly, where `null` vs `undefined` IS technically a different JSON
   payload (`{"verification":null}` vs `{}`) — but only reachable when the row vanishes between two
   concurrent DB reads inside the SAME request, a race that would need deliberately racing the repo
   mid-request to trigger deterministically. Judged not worth the harness complexity for a difference
   no real client would treat differently (`response.verification` reads as falsy either way). Noting
   the reasoning rather than silently dropping it, per this task's own instruction.
6. `if (!result)` in the new `GET .../:id/repos` route (line 376) — this is MY OWN new code from
   this session's earlier task (the route-adapter half of `source-control-ui`'s repo-list request).
   It is currently **unreachable by construction**: `listGitHubReposByCredentialId` is a temporary
   stub that throws unconditionally (pending `routedeps-vendor`'s real probe function), so execution
   never reaches this line at all today. Not a coverage gap — dead code that will become live, and
   testable, the moment the real function lands. Flagged for whoever swaps the stub: write the
   "row vanished mid-request" 404 test at that point, not before.

## 5. Verification

- All 3 sweeps re-run were done on a clean `git diff --quiet` tree per file (the tool's own safety
  check), no concurrent sweep collisions.
- `publish-credentials.ts` re-swept after closing the two real gaps: **8 → 5 survivors**, and the two
  newly-added tests were confirmed by name in the `killed` list (lines 319/322 for verify's auth
  check, 361/364/368 for repos', 193 for the account-label heal).
- Full run of all four affected test files together: **55/55 pass** (17 publish-credentials + 8
  vendor-credentials + 8 source-control-credentials + 22 route-async-guards).
- `npm run check:src-complexity-drift`: 0 new violations, 115 total, unchanged from baseline (test
  files aren't in that gate's scope; this confirms no route-code change slipped in alongside the
  tests).
- Test names diffed by inspection against `development/scripts/route-test-failure-baseline.json`'s
  known 28 pre-existing failures — none of the files touched here appear in that baseline, and this
  session's own runs were 55/55 green throughout, so no baseline-diff ambiguity to resolve.

## 6. What this does and doesn't prove

Mutation testing on these three files says: the auth gates and the account-label persistence path are
now provably load-bearing (a test fails if they're removed), not just present. It does NOT claim
these files are fully mutation-covered — `--all-ifs` was not run, and no attempt was made to sweep
every route file this session touched (`test-agent.ts`'s new pure function, `static-render.ts`'s
marker hoist, etc.) — this was scoped to the credential-CRUD surface per the brief, on a timebox.
