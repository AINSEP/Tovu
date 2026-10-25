# F6 — Tovu L7 (website security features) + L12 (website server): fix-wave report

Code branch: Tovu `cloud/fixwave-1025-F6` (from `origin/cloud/overnight-1024-tovu` @ 61d219a5), head **`5801b1197`**.
Jini: `cloud/overnight-1024-jini` checked out and built at `/home/user/Jini` (`link:jini`), read-only.

## 1. Headline
- **Source bug found and fixed (security, DoS):** `features/identity/api-key-secret.ts` let a stored API-key hash name an unbounded scrypt `p`. Details in §2.
- **Tests added: +270, none deleted.** The 34 changed test files ran 433 tests on base (5 red: the three owner-decision pins) and 703 on head, all green. In the per-file coverage set the count went from 629 before (1 red) to 919 after, all green; the after set includes 4 newly measured files.
- **Owner-decision pins: all 3 updated to the owner's 2026-10-25 decisions; no source was changed for them.**
  1. `exclusions.unit.test.ts`: `members.password_hash` is allowed in a transfer, and a new assertion checks it is never part of a public site share.
  2. `wiring.test.ts`: the owner policy is `['*','visitor-tools.manage']`. Admin also holds the grant; editor and viewer do not.
  3. `mcp-ui-tool-calls.test.ts`: `members_delete` is on the allowlist. `mcp-ui-allowlist-completeness.test.ts`: the OIDC state/continuation codec `.open` calls and visitor-confirmations are exempted.
- **L7 musts: every security guard the L7 report flagged as untested now has a negative test**, or is classified with its reason in §5.
- **L12 top 10: all 10 have tests.** #2 (dev-auth local-owner sign-in) was already covered: its suite passes here (27/27), and the L12 report called it "unmeasured, not untested".
- **Files at 100 % lines+branches: 7 → 16** of the 28 files measured before and after. 3 of the 4 files measured for the first time are also at 100 % (node:test lcov; see §3b).
- **CCN > 10 in scope:** 1 → 0. `identity/api-key-secret.ts parseStoredHash` (11) was refactored, with tests green before and after (63/63). This was the only function over 10 out of 126 scope files (eslint `complexity` 10).
- **Stryker, per file: see §3a.** Biggest moves: exclusions 28.6→100, permission-list-tool 30.6→100, user-manage-permission 0→100, ready-providers 0→100, site-listener-origin 30.8→100, oidc-callback 80.8→97.4, oidc-verify-email 64.1→91.0, providers 55.8→82.6, oidc-login 62.8→81.4, link-service 76.2→93.9, unlink-identity 63.2→88.4. `publish-trust-auth.ts:423` (L12 #1): every mutant is now killed.
- **Regression check:** the L7 feature suites plus the mcp-ui suites ran 1894 tests: 1861 pass, 33 fail. 31 of the failures are Postgres suites (no server in this environment). The other 2 are pre-existing and fail identically on an untouched base worktree: the ask-choice real round trip, and static-publish consent readiness.
- Wall ≈ 1 h 40 m of 3 h. Rough tokens ≈ 0.6 M of the ~1.5 M cap. No subagents used.

## 2. Source bugs (failing test → fix)
1. **SECURITY / DoS — an unbounded scrypt `p` in a stored API-key hash.**
   - **Where:** `features/identity/api-key-secret.ts` `isWithinScryptBounds`. It checked `128*N*r <= 64 MiB` but never bounded `p`.
   - **Why it matters:** scrypt's CPU work is linear in `p`. Measured here: about 41 ms per unit at N=16384, r=8, and a `p=1000` verify took 41.5 s. A hostile or hand-edited `key_hash` with `p=100000` would hold one libuv threadpool thread for over an hour on every authentication attempt. Four such attempts stall the whole pool (fs, dns and crypto). The function's own docblock promises that a hostile `key_hash` "must not become a denial-of-service knob".
   - **Red test:** `99cb47156` (`identity/__tests__/api-key-secret.no-derivation.test.ts`). It counts real scrypt calls through the builtin's live ESM binding (`syncBuiltinESMExports`).
   - **Fix:** `a39872947`. Bound the work instead: `128*N*r*p <= SCRYPT_MAXMEM`.
   - **No legitimate digest is refused:** this file only ever writes `p=1`, and a round-trip test proves a fresh digest still verifies. 81/81 api-key tests are green.
   - **Same pattern in Jini:** checked. `platform/secrets/passphrase-envelope.ts` pins `r=8, p=1` exactly, so it is not affected.

No other source bug was found. Two other changes touched source, and neither changes behaviour (both were allowed by the brief):
- **CCN refactor:** `parseStoredHash` now uses a field-count check.
- **Testability exports:** `authorizeDestinationVaultContext` was extracted from the destination store's inline vault `authorize`, and the pure validators `proofBody`/`proofString`, `completionCredential`, `callbackParams` and `readShareJobId` are now exported.

## 3a. Stryker re-score (same config as the lanes: tap-runner, StringLiteral excluded, type checks off, cwd = repo root)
"Lane before" is the lane report's score:
- **L7** mutated against each feature's whole `__tests__`.
- **L12** mutated against per-file test lists.
- **After** uses targeted test lists: the lane's own lists where I knew them, plus the new files.

So a lower "after" can mean fewer test files were run, not weaker tests. This applies to **password-auth** and to the first **publish-trust-auth** run; it is noted per row.

| file | lane before | after (run) | mutants | killed | timeout | survived | no-cov |
|--|--|--|--|--|--|--|--|
| features/database-transfer/destination-store.ts | 86.1 | **95.0 %** (destination-store) | 101 | 95 | 1 | 5 | 0 |
| features/database-transfer/exclusions.ts | 28.6 | **100.0 %** (exclusions) | 7 | 7 | 0 | 0 | 0 |
| features/identity/api-key-secret.ts | 63.3 | **94.1 %** (api-key-secret-2; runs 67.0 → 94.1) | 101 | 90 | 5 | 6 | 0 |
| features/identity/boot-session-token.ts | 82.8 | **96.6 %** (permission-list-tool) | 29 | 28 | 0 | 1 | 0 |
| features/identity/permission-list-tool.ts | 30.6 | **100.0 %** (permission-list-tool) | 36 | 36 | 0 | 0 | 0 |
| features/identity/user-manage-permission.ts | 0.0 | **100.0 %** (permission-list-tool) | 2 | 2 | 0 | 0 | 0 |
| features/mail/attempts.repo.ts | 77.3 | **90.9 %** (attempts-repo) | 22 | 20 | 0 | 1 | 1 |
| features/member-login/link-policy.ts | 97.3 | **100.0 %** (member-login) | 37 | 37 | 0 | 0 | 0 |
| features/member-login/link-service.ts | 76.2 | **93.9 %** (member-login-2; runs 88.4 → 93.9) | 147 | 138 | 0 | 8 | 1 |
| features/member-login/oidc-login.ts | 62.8 | **81.4 %** (member-login-2; runs 77.3 → 81.4) | 242 | 197 | 0 | 41 | 4 |
| features/member-login/providers.ts | 55.8 | **82.6 %** (member-login-2; runs 77.9 → 82.6) | 190 | 157 | 0 | 29 | 4 |
| features/member-login/ready-providers.ts | 0.0 | **100.0 %** (member-login) | 11 | 11 | 0 | 0 | 0 |
| features/members/password-auth.ts | 93.9* (not comparable) | **89.0 %** (password-auth) | 181 | 161 | 0 | 20 | 0 |
| features/settings/form-delivery.ts | 93.0 | **99.5 %** (form-delivery-2; runs 97.0 → 99.5) | 200 | 199 | 0 | 1 | 0 |
| features/settings/tool-registrations.ts | 78.1 | **89.5 %** (settings-tool-registrations-2; runs 80.0 → 89.5) | 105 | 94 | 0 | 11 | 0 |
| server/inbound/admin-http/publish-trust-auth.ts | 61.5 (pass-2 80.9) | **88.5 %** (publish-trust-auth-lane; runs 38.5 → 88.5) | 96 | 85 | 0 | 11 | 0 |
| server/inbound/admin-http/routes/api-keys/create-principal.ts | 83.3 | **91.7 %** (api-keys-2; runs 83.3 → 91.7) | 12 | 11 | 0 | 0 | 1 |
| server/inbound/admin-http/routes/api-keys/issue.ts | 73.3 | **86.7 %** (api-keys-2; runs 80.0 → 86.7) | 15 | 13 | 0 | 0 | 2 |
| server/inbound/admin-http/routes/system/site-key.ts | 56.8 (pass-2 87.0; same 3-file list as the 56.8 run) | **66.1 %** (site-key) | 301 | 185 | 14 | 19 | 83 |
| server/inbound/public-http/middleware/canonical-site-host.ts | 87.0 | **89.1 %** (canonical-site-host) | 46 | 39 | 2 | 5 | 0 |
| server/inbound/public-http/routes/api-connections/oauth-callback.ts | 87.7 | **88.9 %** (oauth-callback) | 81 | 66 | 6 | 8 | 1 |
| server/inbound/public-http/routes/members/complete-sign-in.ts | 74.6 | **93.2 %** (complete-sign-in-2; runs 88.1 → 93.2) | 59 | 55 | 0 | 4 | 0 |
| server/inbound/public-http/routes/members/me.ts | 86.3 | **90.2 %** (unlink-2; runs 88.2 → 90.2) | 51 | 40 | 6 | 4 | 1 |
| server/inbound/public-http/routes/members/oidc-callback.ts | 80.8 | **97.4 %** (member-routes) | 78 | 64 | 12 | 2 | 0 |
| server/inbound/public-http/routes/members/oidc-verify-email.ts | 64.1 | **91.0 %** (complete-sign-in-2; runs 89.7 → 91.0) | 78 | 62 | 9 | 6 | 1 |
| server/inbound/public-http/routes/members/unlink-identity.ts | 63.2 | **88.4 %** (unlink-2; runs 81.1 → 88.4) | 95 | 75 | 9 | 9 | 2 |
| server/runtime/boot/site-listener-origin.ts | 30.8 | **100.0 %** (site-listener-origin) | 13 | 13 | 0 | 0 | 0 |


\* `password-auth` before = members' whole `__tests__` (57 min lane run). After = `password-auth.test.ts` only. The 2 `L30` email-normalisation survivors are equivalent against the in-memory repo, which case-folds lookups itself; the SQL repo's dialect tests (not in this run) cover them.

**Survivor classes still open:**
- **(b) equivalent, mostly:**
  - `ObjectLiteral` on error codes inside catch-all wrappers that re-map every error to one fixed code (`parseLoginProviders`, `completeOidcLogin`, `sealLoginEmailContinuation`, `beginOidcLogin`, `destination-store.get`).
  - Shape guards made redundant by `express.json` strict mode or by later field checks: `unlink` body, the `proofBody` key allow-list.
  - Defence-in-depth re-checks that AAD binding already enforces: oidc `current.version/redirectUri`, the continuation provider/issuer/connect checks.
  - Lock-protected re-reads (`unlink` `!current` ×3).
  - `canonical-site-host` `/www\./` and the bracket regex. Hostnames only have brackets at the ends, and the bare host is only used for localhost/IP detection.
  - `req.body?.x` optional chains. Express 4 always sets `req.body`.
- **(a) left open, low risk:**
  - `destination-store` `save` retry count (`attempt < 3`) and `hosted:false`.
  - `providers.ts` bundled-manifest id check and `ENOENT` read fallback. Both need a fixture catalog on disk.
  - `site-key.ts` production-only generate/stamp and start-fresh paths. The wider suites cover these (the lane's pass-2 scored 87 %).

## 3b. Per-file coverage (node:test `--experimental-test-coverage`, lcov; test-file set = `cov.sh` in `F6/data/`; before = untouched base worktree)
| file | lines before | lines after | branches before | branches after |
|--|--|--|--|--|
| features/database-transfer/destination-store.ts | 100.0 | 100.0 (146/146) | 98.0 | 100.0 (51/51) |
| features/database-transfer/exclusions.ts | 100.0 | 100.0 (77/77) | 100.0 | 100.0 (2/2) |
| features/identity/api-key-secret.ts | n/a | 100.0 (235/235) | n/a | 100.0 (51/51) |
| features/identity/boot-session-token.ts | 100.0 | 100.0 (135/135) | 93.8 | 100.0 (17/17) |
| features/identity/permission-list-tool.ts | 75.5 | 100.0 (49/49) | 100.0 | 100.0 (10/10) |
| features/identity/user-manage-permission.ts | 100.0 | 100.0 (10/10) | 100.0 | 100.0 (3/3) |
| features/mail/attempts.repo.ts | 100.0 | 100.0 (32/32) | 95.0 | 95.2 (20/21) |
| features/member-login/link-policy.ts | 100.0 | 100.0 (39/39) | 100.0 | 100.0 (28/28) |
| features/member-login/link-service.ts | 98.2 | 100.0 (166/166) | 88.1 | 98.7 (74/75) |
| features/member-login/oidc-login.ts | 96.8 | 100.0 (247/247) | 83.3 | 94.6 (87/92) |
| features/member-login/providers.ts | 99.1 | 99.1 (110/111) | 73.9 | 98.6 (68/69) |
| features/member-login/ready-providers.ts | 66.7 | 100.0 (21/21) | 100.0 | 100.0 (8/8) |
| features/members/agent-tools.ts | n/a | 100.0 (158/158) | n/a | 100.0 (1/1) |
| features/members/password-auth.ts | 100.0 | 100.0 (203/203) | 100.0 | 100.0 (74/74) |
| features/members/write-service.ts | 99.8 | 100.0 (660/660) | 98.3 | 98.9 (181/183) |
| features/settings/form-delivery.ts | 100.0 | 100.0 (200/200) | 100.0 | 100.0 (70/70) |
| features/settings/publish-content.ts | 100.0 | 100.0 (154/154) | 100.0 | 100.0 (55/55) |
| features/settings/tool-registrations.ts | 100.0 | 100.0 (157/157) | 97.8 | 97.8 (45/46) |
| features/settings/visitor-tools-agent-tools.ts | n/a | 100.0 (25/25) | n/a | 100.0 (1/1) |
| server/inbound/admin-http/publish-trust-auth.ts | 100.0 | 100.0 (437/437) | 96.4 | 96.3 (52/54) |
| server/inbound/admin-http/routes/api-keys/create-principal.ts | 100.0 | 100.0 (46/46) | 80.0 | 100.0 (9/9) |
| server/inbound/admin-http/routes/api-keys/issue.ts | 100.0 | 100.0 (46/46) | 80.0 | 100.0 (11/11) |
| server/inbound/admin-http/routes/system/site-key.ts | 99.7 | 99.7 (616/618) | 90.3 | 91.2 (145/159) |
| server/inbound/admin-http/routes/system/site-shares.ts | n/a | 62.7 (52/83) | n/a | 100.0 (14/14) |
| server/inbound/public-http/middleware/canonical-site-host.ts | 100.0 | 100.0 (43/43) | 100.0 | 100.0 (24/24) |
| server/inbound/public-http/routes/api-connections/oauth-callback.ts | 97.5 | 97.5 (119/122) | 97.9 | 97.9 (46/47) |
| server/inbound/public-http/routes/members/complete-sign-in.ts | 100.0 | 100.0 (89/89) | 96.6 | 100.0 (31/31) |
| server/inbound/public-http/routes/members/me.ts | 100.0 | 100.0 (42/42) | 91.7 | 100.0 (26/26) |
| server/inbound/public-http/routes/members/oidc-callback.ts | 98.7 | 100.0 (77/77) | 92.0 | 96.8 (30/31) |
| server/inbound/public-http/routes/members/oidc-verify-email.ts | 100.0 | 100.0 (51/51) | 80.0 | 97.0 (32/33) |
| server/inbound/public-http/routes/members/unlink-identity.ts | 100.0 | 100.0 (80/80) | 78.1 | 94.1 (32/34) |
| server/runtime/boot/site-listener-origin.ts | 100.0 | 100.0 (25/25) | 75.0 | 100.0 (12/12) |


**Files still under 100 %, and why:**
- Several "uncovered branches" sit on comment, import or interface lines. That is a source-map artifact of tsx and V8 coverage, not real code: `attempts.repo.ts` B7, `write-service.ts` B64/B67, `settings/tool-registrations.ts` B64, `publish-trust-auth.ts` B19/B36, `api-keys/*` B13/B14, `oauth-callback.ts` L33-36, `unlink-identity.ts` B13/B27.
- Real remaining gaps:
  - `site-key.ts` 207-232 and 468-616: production generate, `.site-meta` stamp and start-fresh, covered by `admin-site-key-routes` (not in this set).
  - `providers.ts` 65-66: the catch tail.
  - `oidc-login.ts` 45/83/121: defaulted ternaries in sealed-state wiring.
  - `site-key.ts` and `api-connections/oauth-callback.ts` are large existing files where I added only targeted cases.

## 4. Anti-patterns seen most (for AI Dev Shop)
1. **AP1 bare-failure / AP8 whole-guard negatives:** the dominant L7 gap. Every guard was tested on an input that broke several clauses at once. Fixed with one-clause-at-a-time tables: destination authorize, link-service ownership, publish-trust backstop, site-key route matrix.
2. **AP4 happy-string regex:** secret detector, LOCAL_HOST, DOMAIN, member email, six-digit code, share UUID, callback caps. Every fix was a table covering anchors, leading/trailing junk, cap and cap+1.
3. **Catch-all wrappers hide guard mutants.** Many "survivors" in OIDC and provider parsing are equivalent because a downstream `catch {}` re-maps every error to one code. **New anti-pattern:** when the guarded property is *cost* rather than *output*, assert the side effect (call counts). This is how the scrypt `p` DoS bug was found: the output looked right, but scrypt still ran.
4. **Test doubles that normalise for you** (the in-memory member repo case-folds emails). Tests for normalisation in the service pass even if the service stops normalising. Run such tests against the SQL repo too.
5. **Narrow test lists understate the score:** a tap-runner score depends on the exact test files listed. Always record the list next to the score.

## 5. NOT done
- **L7:**
  - `identity/tool-registrations.ts` user-delete reference listing (L97-98).
  - `members/repo.memory.ts` comparator survivors (a test double).
  - `mail/retention.ts` boundaries.
  - `database-transfer` copy-engine, pg-store-copy and postgres-target: Postgres only, no server here.
  - `members/write-service.ts`: re-scoring would mean 395 mutants against members' slow suites, so it was not re-scored; its new guards are tested.
- **L7, already covered on this branch outside the lane's test list (no new test needed):** `settings/site-title-write` scope/`site.assistant` branches, `settings/tool-registrations` always-ask keys, identity wiring L98/L183, `chart-provider.ts` (covered by `chart-providers.unit.test.ts`), `trash-member.ts` (covered by `trash/__tests__/member-adapter.test.ts`), `publish-credentials` PATCH passthrough.
- **L12, outside the top 10 and not touched:** the rest of `dev-auth.ts` no-coverage (lines 118-125, 361-370, 732-755) and `middleware/site-consent.ts`. Its suite fails at baseline (L12 §2 #1, likely a Jini consent-default mismatch); not investigated.
- **Stryker:** no full-lane re-run. Only the files in §3a were re-scored.

## 6. Commits (Tovu `cloud/fixwave-1025-F6`)
- `5801b1197` test(F6): Stryker-guided — settings confirmation card shows exact title, setting, scope, previous and new value
- `df7441d4f` test(F6): Stryker-guided — member cookie Max-Age equals session lifetime; completion limiter 429
- `c6502b2cb` test(F6): Stryker-guided — form-delivery secret detector spacing/padding/anchor cases, null values, path truncation edge
- `a39872947` fix(F6): bound the stored api-key hash's scrypt p by the same 64 MiB work ceiling (CPU DoS knob)
- `99cb47156` test(F6): RED — a stored api-key hash's unbounded scrypt p is a CPU DoS knob (p=1000 verify takes 41s)
- `2cf6a90f1` test(F6): api-key routes refuse an api-key credential at the route (403, no writes)
- `b090d5232` test(F6): Stryker-guided — unlink alternative-sign-in arms, strict limiters, {ok:true}, /me provider-list fallback
- `3a4087a93` test(F6): site-shares jobId body validator table (export for testing)
- `3c5729d3b` test(F6): database-transfer chat backup always removes its temp folder
- `53b73e697` test(F6): Stryker-guided — link-service returning sign-in keeps sessions; unique-race retry exactly once
- `41314bd06` test(F6): Stryker-guided — OIDC provider/client admission, domain-authority edges, provider descriptor contents
- `1fdb0bc47` test(F6): AP5 inline contracts for members and visitor-tools agent tool schemas
- `cd3401601` test(F6): coverage gaps - non-string email claim, pending member keeps earlier verification
- `93866b231` refactor(F6): parseStoredHash CCN 11 -> <=10 (field-count check, behaviour-preserving; api-key-secret/service tests 63/63 before and after)
- `acc23c94e` test(F6): mail attempt address normalization + outcome classification
- `79256c88a` test(F6): typecheck fixes in new tests
- `5ad4e21de` test(F6): L12 canonical-host skip-path anchoring, api-keys missing-body 400
- `507aa583a` test(F6): L12 site-listener wildcard hosts, site-key route deny matrix + ALREADY_EXISTS
- `dc679336c` test(F6): L12 proof-body/code regex tables, callback code/state caps, api-connection state boundary (export validators for testing)
- `a506d2b18` test(F6): L12 publish-trust backstop clauses, /me foreign workspace, unlink recent-auth window + body guards
- `82df61536` test(F6): member-login OIDC edge limits and provider-preset validation tables
- `f4c902fa7` test(F6): members password-auth cutoff/race + challenge-realm + email anchor guards
- `e37cf7360` test(F6): settings deny-list/confirmation pins, secret-detector and LOCAL_HOST anchor tables
- `4a973e5af` test(F6): owner-decision pins (mcp-ui members_delete + oidc/visitor exemptions), permission-list denial class
- `bcc30faf3` wip(F6): L7 security-guard negative tests + owner-decision pin updates


Also pushed: the Stryker JSON for every re-score run, gzipped, in `F6/data/` (each under 1 MB).

F6 DONE 2026-10-25T23:13Z · wall ≈ 1 h 40 m of 3 h · rough tokens ≈ 0.6 M of ~1.5 M

## Run log (append-only)
## 2026-10-25T21:34:49Z — STARTED
Tovu base origin/cloud/overnight-1024-tovu @ 61d219a5 → code branch cloud/fixwave-1025-F6. Jini: checking out origin/cloud/overnight-1024-jini at /home/user/Jini (Tovu links via file:../Jini). Setup (Node 24, installs, builds) running. Next: green baseline on L7/L12 suites, then L7 security guards + 3 owner-decision pins, then L12 top 10.
## 2026-10-25T21:43:13Z — PROGRESS
Setup green (Node 24.22, Jini cloud/overnight-1024-jini built, Tovu npm ci + link:jini). Code branch cloud/fixwave-1025-F6 at f4c902fa. Done so far: 3 owner-decision pins updated (exclusions password_hash allow + share-policy exclusion; wiring owner policy ['*','visitor-tools.manage']; mcp-ui allowlist members_delete + oidc/visitor exemptions); L7 negatives: destination-store authorize (refactor: exported authorizeDestinationVaultContext), permission-list-tool, user-manage-permission, boot-session-token, link-service ownership/proof/startedAt, ready-providers, link-policy null member, settings deny-lists, form-delivery secret regex table, LOCAL_HOST anchors, password-auth cutoff/race, challenge realm, email anchors. Next: oidc-login/providers validators, then L12 top 10.
## 2026-10-25T21:58:55Z — PROGRESS
L7 musts + L12 top-10 tests pushed (code HEAD 93866b231). Regression: L7 feature suites + mcp-ui = 1894 tests, 1861 pass, 33 fail = 31 Postgres-env (no server) + 2 pre-existing (ask-choice real round trip; static-publish consent readiness — both fail identically on untouched base worktree). CCN scan (eslint complexity 10) over 126 scope files: 1 function >10 (identity/api-key-secret.ts parseStoredHash, 11) → refactored, 63/63 tests before & after. Now: per-file coverage before/after, then Stryker re-score.
## 2026-10-25T22:34:40Z — PROGRESS (SOURCE BUG FOUND + FIXED)
features/identity/api-key-secret.ts isWithinScryptBounds left scrypt `p` unbounded: CPU work is linear in p (measured ~41 ms/unit at N=16384,r=8; p=1000 verify = 41.5 s), so a hostile key_hash row is a threadpool DoS knob despite the docblock's guarantee. RED test 99cb47156 → fix a39872947 (128*N*r*p <= 64 MiB; this file writes p=1, so no legitimate digest is refused; 81/81 api-key tests green). Stryker re-scores so far: exclusions 28.6→100, permission-list-tool 30.6→100, user-manage-permission 0→100, ready-providers 0→100, link-policy 97.3→100, site-listener-origin 30.8→100, destination-store 86.1→95.0, oidc-callback 80.8→97.4, form-delivery 93.0→97.0, oidc-verify-email 64.1→89.7, providers 55.8→77.9, oidc-login 62.8→77.3, link-service 76.2→88.4, unlink-identity 63.2→81.1 (second passes with Stryker-guided tests queued).
## 2026-10-25T22:41:53Z — PROGRESS
Stryker queue 1 done through attempts-repo; remaining: settings tool-registrations, oauth-callback, then second passes (publish-trust-auth with lane test list, member-login-2, api-keys-2, unlink-2, api-key-secret-2, form-delivery-2, complete-sign-in-2). Code head df7441d4f. Final report follows when the queues finish.

## 2026-10-25T23:13:48Z — DONE
Finished (not capped). All Stryker queues complete, final coverage 919/919 green, changed test files 703/703 green, typecheck: no new errors in changed files (1 pre-existing TS2352 in site-key.tw4.pins fixture, identical on base). Code head 5801b1197 on cloud/fixwave-1025-F6.
