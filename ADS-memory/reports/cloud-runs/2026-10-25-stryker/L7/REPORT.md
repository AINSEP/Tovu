# L7 — Tovu website security: StrykerJS measure-only report
Run 2026-10-25 15:57–18:10 UTC (≈2 h 13 m wall of the 4 h cap). Tool: StrykerJS 9.6.1 + `@stryker-mutator/tap-runner`, Node 24.22. Report only — no source or test edits. Raw JSON (gz) + per-feature summaries in `data/`.

## 1. Headline
- **Packages/features:** `apps/website/src/features/` member-login, identity, members, settings, mail, database-transfer — **all six measured, nothing skipped by time**.
- **Files mutated:** 82 non-type source files (types/ports/index/public-path excluded; `link-policy.ts` measured separately in Step 1).
- **Mutants:** 6,218 scored (+37 link-policy in step 1) of 8,128 generated; 1,910 more are StringLiteral mutants deliberately excluded. **Killed 5,323 (+39 timeouts), survived 707, no-coverage 149 → overall 86.2 %.** 11 runtime errors ignored.
- Wall: member-login 3m49 · mail 7m14 · database-transfer 9m46 · settings 22m29 · identity 25m55 · members 57m05 (≈0.2–0.4 s/mutant, 3 procs, 4 cores). Tokens ≈ 150–200 k.

| Feature | Mutants | Killed(+TO) | Survived | No-cov | Score |
|---|---|---|---|---|---|
| member-login (+link-policy 97.3 %) | 620 | 395 | 177 | 48 | **63.7 %** |
| database-transfer | 515 | 410 | 82 | 23 | **79.6 %** (see §5: postgres suites cannot run here) |
| identity | 1,257 | 1,101 | 123 | 33 | 87.6 % |
| members | 1,867 | 1,679 | 151 | 37 | 89.9 % |
| settings | 1,639 | 1,480 | 154 | 5 | 90.3 % |
| mail | 320 | 297 | 20 | 3 | 92.8 % |

## 2. Suspected source bugs (not fixed)
1. **SECURITY — `database-transfer/exclusions.ts` does not exclude `members.password_hash`.** The existing guard `database-transfer/__tests__/exclusions.unit.test.ts` FAILS on this branch: `actual: ['members (password_hash)'], expected: []` — i.e. the secret-column check finds the `members` table's `password_hash` column is neither excluded nor stripped, so a database transfer would copy member password hashes to the destination. (`SECRET_COLUMN_PATTERN` would match it; the table just isn't in `EXCLUDED_CORE_TABLES`/`COLUMN_FILTERS`.) The test was pre-excluded from this run's mutation test list because it fails natively. Owner should confirm: either members was added after the exclusion list (source bug) or the table's inclusion is deliberate and the test is stale.
2. **Likely test/source drift — `identity/__tests__/wiring.test.ts`** fails natively: "the owner policy stays exactly its seeded wildcard" — `actual: ['*','visitor-tools.manage'], expected: ['*']`. Either `visitor-tools.manage` is now seeded into the owner policy (test stale) or it is an unintended grant. Also the same file's "wiring.ts never reads process.env" test reads the *instrumented* source, so it cannot be used under Stryker (harness limitation, not a bug).
3. Not bugs but test-found: see §4 `link-service.ts` — nothing contradicted source behaviour.

## 3. Per-file table (worst score first; total = killed+timeout+survived+no-cov)
| File | Mutants | Killed | Surv | NoCov | TO | Score |
|---|---|---|---|---|---|---|
| database-transfer/pg-store-copy.ts | 14 | 0 | 9 | 5 | 0 | 0.0 % |
| database-transfer/plan-store.ts | 0 | 0 | 0 | 0 | 0 | 0.0 % |
| identity/user-manage-permission.ts | 2 | 0 | 2 | 0 | 0 | 0.0 % |
| member-login/ready-providers.ts | 11 | 0 | 0 | 11 | 0 | 0.0 % |
| members/trash-member.ts | 21 | 0 | 0 | 21 | 0 | 0.0 % |
| settings/chart-provider.ts | 5 | 0 | 0 | 5 | 0 | 0.0 % |
| database-transfer/copy-engine.ts | 22 | 3 | 6 | 13 | 0 | 13.6 % |
| database-transfer/postgres-target.ts | 6 | 1 | 2 | 3 | 0 | 16.7 % |
| database-transfer/exclusions.ts | 7 | 2 | 5 | 0 | 0 | 28.6 % |
| identity/permission-list-tool.ts | 36 | 11 | 5 | 20 | 0 | 30.6 % |
| mail/site-feedback-route.ts | 8 | 4 | 4 | 0 | 0 | 50.0 % |
| members/agent-tools.ts | 38 | 19 | 19 | 0 | 0 | 50.0 % |
| settings/visitor-tools-agent-tools.ts | 31 | 17 | 14 | 0 | 0 | 54.8 % |
| member-login/providers.ts | 190 | 106 | 70 | 14 | 0 | 55.8 % |
| member-login/oidc-login.ts | 242 | 152 | 75 | 15 | 0 | 62.8 % |
| identity/api-key-secret.ts | 120 | 74 | 44 | 0 | 2 | 63.3 % |
| identity/wiring.ts | 58 | 38 | 12 | 8 | 0 | 65.5 % |
| database-transfer/tool-registrations.ts | 93 | 67 | 26 | 0 | 0 | 72.0 % |
| members/repo.sqlite.ts | 8 | 6 | 0 | 2 | 0 | 75.0 % |
| member-login/link-service.ts | 147 | 112 | 27 | 8 | 0 | 76.2 % |
| mail/attempts.repo.ts | 22 | 17 | 4 | 1 | 0 | 77.3 % |
| settings/tool-registrations.ts | 105 | 82 | 23 | 0 | 0 | 78.1 % |
| database-transfer/destination-ui.ts | 19 | 15 | 4 | 0 | 0 | 78.9 % |
| settings/feature-flags.ts | 30 | 24 | 6 | 0 | 0 | 80.0 % |
| settings/site-title-write.ts | 127 | 103 | 24 | 0 | 0 | 81.1 % |
| members/tool-registrations.ts | 124 | 102 | 10 | 12 | 0 | 82.3 % |
| identity/boot-session-token.ts | 29 | 24 | 4 | 1 | 0 | 82.8 % |
| identity/reset-admin-password-self-verified.ts | 24 | 20 | 2 | 2 | 0 | 83.3 % |
| member-login/credentials.ts | 30 | 25 | 5 | 0 | 0 | 83.3 % |
| settings/admin-interface.ts | 36 | 30 | 6 | 0 | 0 | 83.3 % |
| identity/tool-registrations.ts | 213 | 178 | 34 | 1 | 0 | 83.6 % |
| settings/form-destination.ts | 13 | 11 | 2 | 0 | 0 | 84.6 % |
| settings/publish-content.ts | 156 | 132 | 24 | 0 | 0 | 84.6 % |
| mail/retention.ts | 33 | 28 | 3 | 2 | 0 | 84.8 % |
| database-transfer/sqlite-source.ts | 7 | 6 | 1 | 0 | 0 | 85.7 % |
| database-transfer/destination-store.ts | 101 | 87 | 13 | 1 | 0 | 86.1 % |
| identity/default-credential-exposure.ts | 46 | 39 | 5 | 1 | 1 | 87.0 % |
| members/repo.memory.ts | 582 | 515 | 64 | 1 | 2 | 88.8 % |
| database-transfer/table-catalog.ts | 143 | 129 | 14 | 0 | 0 | 90.2 % |
| settings/site-timezone.ts | 32 | 29 | 3 | 0 | 0 | 90.6 % |
| settings/visitor-tools-registrations.ts | 89 | 78 | 8 | 0 | 3 | 91.0 % |
| members/consent-service.ts | 58 | 53 | 5 | 0 | 0 | 91.4 % |
| identity/username-change-ports.ts | 12 | 11 | 1 | 0 | 0 | 91.7 % |
| mail/feedback-inbox.repo.ts | 13 | 12 | 1 | 0 | 0 | 92.3 % |
| members/write-service.ts | 395 | 345 | 27 | 1 | 22 | 92.9 % |
| settings/form-delivery.ts | 200 | 186 | 14 | 0 | 0 | 93.0 % |
| settings/repo.ts | 142 | 132 | 10 | 0 | 0 | 93.0 % |
| mail/ledger.repo.ts | 33 | 31 | 2 | 0 | 0 | 93.9 % |
| members/password-auth.ts | 181 | 170 | 11 | 0 | 0 | 93.9 % |
| members/mailer.console.ts | 36 | 34 | 2 | 0 | 0 | 94.4 % |
| identity/builtin-role-grants.ts | 39 | 37 | 2 | 0 | 0 | 94.9 % |
| settings/chat-execution-write.ts | 101 | 96 | 5 | 0 | 0 | 95.0 % |
| mail/activity.repo.ts | 63 | 60 | 3 | 0 | 0 | 95.2 % |
| settings/site-title.ts | 85 | 81 | 4 | 0 | 0 | 95.3 % |
| mail/feedback-route.ts | 22 | 21 | 1 | 0 | 0 | 95.5 % |
| members/repo.rows.ts | 120 | 115 | 5 | 0 | 0 | 95.8 % |
| database-transfer/confirmation-ui.ts | 25 | 24 | 1 | 0 | 0 | 96.0 % |
| database-transfer/destination-exchange.ts | 53 | 51 | 1 | 1 | 0 | 96.2 % |
| settings/visitor-tools-write.ts | 60 | 58 | 2 | 0 | 0 | 96.7 % |
| identity/api-key-service.ts | 225 | 218 | 7 | 0 | 0 | 96.9 % |
| members/access-resolver.ts | 98 | 95 | 3 | 0 | 0 | 96.9 % |
| settings/visitor-tools-service.ts | 159 | 154 | 5 | 0 | 0 | 96.9 % |
| mail/capture.repo.ts | 34 | 33 | 1 | 0 | 0 | 97.1 % |
| members/repo.ts | 180 | 174 | 5 | 0 | 1 | 97.2 % |
| mail/feedback-sources.ts | 42 | 41 | 1 | 0 | 0 | 97.6 % |
| settings/mail-provider.ts | 85 | 83 | 2 | 0 | 0 | 97.6 % |
| identity/delete-user-service.ts | 184 | 180 | 4 | 0 | 0 | 97.8 % |
| settings/visitor-tools-configure.ts | 98 | 89 | 2 | 0 | 7 | 98.0 % |
| identity/repo.ts | 213 | 212 | 1 | 0 | 0 | 99.5 % |
| database-transfer/destination-repo.ts | 2 | 2 | 0 | 0 | 0 | 100.0 % |
| database-transfer/postgres-ddl.ts | 18 | 18 | 0 | 0 | 0 | 100.0 % |
| database-transfer/transfer-messages.ts | 5 | 5 | 0 | 0 | 0 | 100.0 % |
| identity/permission-grants.ts | 2 | 2 | 0 | 0 | 0 | 100.0 % |
| identity/repo.memory.ts | 28 | 28 | 0 | 0 | 0 | 100.0 % |
| identity/repo.sqlite.ts | 10 | 10 | 0 | 0 | 0 | 100.0 % |
| identity/role-manage-permission.ts | 2 | 2 | 0 | 0 | 0 | 100.0 % |
| identity/site-key-permission.ts | 6 | 6 | 0 | 0 | 0 | 100.0 % |
| identity/user-purge.sqlite.ts | 1 | 1 | 0 | 0 | 0 | 100.0 % |
| identity/user-purge.ts | 7 | 7 | 0 | 0 | 0 | 100.0 % |
| mail/suppression-admin.repo.ts | 33 | 33 | 0 | 0 | 0 | 100.0 % |
| mail/suppression.repo.ts | 17 | 17 | 0 | 0 | 0 | 100.0 % |
| members/auth-mail.ts | 7 | 6 | 0 | 0 | 1 | 100.0 % |
| members/subscriber-directory.ts | 19 | 19 | 0 | 0 | 0 | 100.0 % |
| settings/form-delivery-write.ts | 22 | 22 | 0 | 0 | 0 | 100.0 % |
| settings/mail-sender.ts | 22 | 22 | 0 | 0 | 0 | 100.0 % |
| settings/repo.sqlite.ts | 1 | 1 | 0 | 0 | 0 | 100.0 % |
| settings/site-title-preservation.sqlite.ts | 1 | 1 | 0 | 0 | 0 | 100.0 % |
| settings/site-title-preservation.ts | 11 | 11 | 0 | 0 | 0 | 100.0 % |
| settings/ui-locales-tool.ts | 24 | 24 | 0 | 0 | 0 | 100.0 % |
| settings/visitor-tools-permissions.ts | 4 | 4 | 0 | 0 | 0 | 100.0 % |

## 4. Triaged survivors (a = real test gap, b = equivalent, c = noise)
Files with score < 80 % or ≥ 10 survivors, up to 10 listed per file in `data/*-summary.txt`; condensed here.
**Cross-cutting pattern (a):** many `ObjectLiteral → {}` survivors sit on `throw new MemberLoginError({ code: … })` / `ToolInputError({message})` — tests assert the error *class* but not the `code`/message, so a wrong error code ships green (member-login oidc-login 23, providers 16, link-service 11).

- **member-login/providers.ts (55.8 %, 70 surv.)** — (a) provider-file validation is only exercised on the happy path: size cap 2048/32768, `domains.length > 16`, `DOMAIN` regex, `claim` regex, scopes `length !== 3 / Set` check, `ID` regex all survive when disabled or loosened (9 Regex + 29 Conditional). Missing: one negative test per validation branch asserting the `LOGIN_UNAVAILABLE` code.
- **member-login/oidc-login.ts (62.8 %, 75 surv.)** — (a) `validEmail` limits (`length > 320`, whitespace, `parts.length !== 2`) mutated to `true` survive; `bytes.length !== 32` state-bytes check, `current.version/redirectUri` mismatch, and `login.connectMemberId !== input.connectMemberId` (CSRF-ish binding) and `expiresAt <= now` checks survive as error-code-only mutants. Add: wrong-length state, replayed/expired login, mismatched connect member.
- **member-login/link-service.ts (76.2 %)** — (a) `assertSubjectOwner` (L40–42): `LogicalOperator` and condition→false survive — a subject linked to a *different provider/member* is not rejected by any test; (a) L57 invalid `startedAt`, L63 proof-email ≠ member email, L64 proof id ≠ member id: unchecked rejection paths (security-relevant: inbox-proof binding).
- **member-login/ready-providers.ts (0 %, 11 no-cov)** — no test executes it at all.
- **link-policy.ts** — 1 survivor (`member?.id` → `member.id`, null member with connectMemberId).
- **identity/api-key-secret.ts (63.3 %, 44 surv.)** — (a) scrypt-parameter validation `isIntegerParams` (L134) and bounds `N <= 1 || r <= 0 || p <= 0` (L142) and `separatorAt <= 0` (L107): stored-hash parsing accepts malformed/zero params; add tests for malformed hash strings (`"scrypt$0$…"`, non-integer, missing separator) returning null/false. Also `maxmem` option dropped without failing.
- **identity/permission-list-tool.ts (30.6 %, 20 no-cov)** — handler `identity_policy_list_permissions` is never invoked: `requireToolPermission` authorisation and `policyId` validation are untested (a) — high risk, permission-listing tool with no authz test.
- **identity/user-manage-permission.ts (0 %)** — (a) builtin-admin `user.manage` grant registration (the owner decision 2026-10-07) is never asserted: removing the grant passes all tests.
- **identity/wiring.ts (65.5 %)** — (a) L183 `readOnlyOwnerPrincipalId`+`reconcileGrantsOnBoot` guard, L98 owner-credential shape check, L179 clock fallback unasserted. (Its own test is a source-grep test and can't run under Stryker.)
- **identity/tool-registrations.ts (83.6 %, 35 surv.)** — (a) user-delete reference listing (L97–98) and chat-delete surfaces wiring; mostly ObjectLiteral/Conditional — medium.
- **identity/boot-session-token.ts** — (a) L99 empty/non-string `rawToken` rejection unasserted (auth check).
- **members/trash-member.ts (0 %, 21 no-cov)** — NOT a true gap: its tests live in `features/trash/__tests__/member-adapter.test.ts`, outside this lane's testFiles. Re-run with that file added.
- **members/agent-tools.ts (50 %, 19 surv.)** — (b/c) JSON input-schema literals (`additionalProperties`, `required`, `minLength`) — schema is not asserted; low-medium (tool input validation presumably re-checked in handlers).
- **members/repo.memory.ts (88.8 %, 65 surv.)** — (b/c) test double; sort-comparator `<`/`>` and filter-condition mutants. Production repo is `repo.ts` (97.2 %) so low risk.
- **members/password-auth.ts (93.9 %)** — (a) L30 email normalisation (`toLowerCase`→upper/none) survives; L67–68 disabled/trash/`credentialsRevokedAt >= createdAt` session-revocation condition (security: revoked credentials) partly unasserted (3 mutants); L96/147/148 reset-record re-checks (`expiresAt <= committedAt`, `credentialsRevokedAt !==`) survive.
- **members/write-service.ts (92.9 %, 27 surv. + 22 timeouts)** — (a) `EMAIL_PATTERN` anchors (`^`,`$`) unasserted; L114 disabled/trash member lookup→null; L224 challenge `record.realm !== "member"` guard (cross-realm code reuse) unasserted; L207 mail-lane readiness; L240 error mapping.
- **settings/visitor-tools-agent-tools.ts (54.8 %)** — (b/c) input-schema literals, same as members/agent-tools.
- **settings/form-delivery.ts (93 %)** — (a) 12 Regex survivors in `SECRET_KEY`, `SECRET_VALUES` (`bearer`, JWT) and `BASIC_VALUE` — the secret-redaction detector's anchors are untested (credential leakage in form delivery config): add table-driven cases per pattern, incl. mid-string non-matches.
- **settings/publish-content.ts (84.6 %)** — (a) 8+ Regex survivors in `LOCAL_HOST` (private-host/SSRF guard anchors, `127.x`, `0.0.0.0`, `[::1]`); (b) others. Add host table tests: `evil-localhost.com`, `127.0.0.1.evil.com`, `10.x`, IPv6.
- **settings/tool-registrations.ts (78.1 %)** — (a) `ASSISTANT_EXECUTION_APPROVAL_SETTINGS.filter(key !== "localCli.agentId")` (L75), `ALWAYS_ASK_INTERFACE_KEYS` namespace `&&`→`||` (L89), `extraDeniedSettings` consent entry (L99) — approval/deny-list wiring unasserted (security).
- **settings/site-title-write.ts (81.1 %)** — (a) scope==="global" vs workspace branches (L60, L135) and the `site.assistant` safety condition (L62) unasserted.
- **settings/repo.ts, feature-flags.ts, admin-interface.ts** — (b/c) null-handling ternaries (`== null`), mostly equivalent via JSON.parse of null; 2–10 each.
- **settings/chart-provider.ts (0 %, 5 no-cov)** — setting definition never executed by a test.
- **mail/attempts.repo.ts (77.3 %)** — (a) recipient/redirect `trim().toLowerCase()` normalisation (L21–22) and `captured:` provider-id outcome branch (L23) unasserted; **mail/site-feedback-route.ts (50 %)** — (c) wiring literals (repos/resolveWorkspaceId).
- **mail/retention.ts (84.9 %)** — 3 surv. + 2 no-cov: retention boundaries (see summary).
- **database-transfer/destination-store.ts (86.1 %)** — **(a) high risk:** `authorize` hook L66–67 (`context.kind !== destinationScope.kind || context.ownerKey !== "tovu" || context.principal…`): conditions→`false` and `||`→`&&` all SURVIVE — a destination-secret access check that no test exercises negatively.
- **database-transfer/exclusions.ts (28.6 %)** — (a) `SECRET_COLUMN_PATTERN` anchors, `setting_*` exclusion arrays and the `secret <> 0` keep-clause unasserted; this file's own unit test fails natively (see §2 #1).
- **database-transfer/table-catalog.ts (90.2 %)** — (a) L112 `EXCLUDED_CORE_TABLES` skip → false survives; unique-constraint naming (L66).
- **database-transfer/tool-registrations.ts (72 %)** — (a) `finally` cleanup (`source.close()`, `rm(dir)`) L93–95 and error-code mapping (L76) unasserted.
- **copy-engine.ts / pg-store-copy.ts / postgres-target.ts (13.6 % / 0 % / 16.7 %)** — **ENV artifact, not scored gap**: their only tests are `*.postgres.test.ts` which cannot run here (no Postgres server); see §5.
- Remaining survivors (mostly `ObjectLiteral` options-bag defaults `_options = {}`, `BlockStatement` on empty ctor bodies, `ArrayDeclaration` schema defaults) are class (b)/(c) and summarised in `data/*-summary.txt`.

## 5. No-coverage ranges (code no test in this lane's file set executed)
- member-login/ready-providers.ts (all 11 mutants, L13–19); providers.ts 14, oidc-login.ts 15, link-service.ts 8 (error branches L41–42, L57, L63–64, L150, L163–164).
- identity/permission-list-tool.ts L35–… (20); wiring.ts 8; reset-admin-password-self-verified.ts 2; boot-session-token.ts 1.
- members/trash-member.ts (21) — covered elsewhere (`features/trash/__tests__/member-adapter.test.ts`); tool-registrations.ts 12 (`members_delete` handler L232–236); repo.sqlite.ts 2.
- settings/chart-provider.ts (5).
- database-transfer/copy-engine.ts 13, pg-store-copy.ts 5, postgres-target.ts 3, destination-store 1 — postgres-only tests.
- mail: retention.ts 2, attempts.repo.ts 1.

## 6. NOT RUN
- **Tests excluded from the mutation runs** (fail natively / env): `identity/__tests__/wiring.test.ts` (fails natively + reads instrumented source), `members/__tests__/member-external-identities.postgres.test.ts`, `database-transfer/__tests__/{copy-engine.postgres,tool-registrations.postgres,exclusions.unit}.test.ts` (Postgres absent; exclusions.unit fails natively — a suspected bug, §2). Their mutants therefore show as survived/no-coverage.
- Cross-feature tests (e.g. `features/trash/**`, `server/**` route tests importing these files) were not in testFiles — scores are lower bounds for files primarily covered elsewhere.
- Excluded from mutation: `types.ts`, `index.ts`, `public-path.ts`, `*ports.ts`, `*-types.ts`, `.tsx`, tests. Source files in the six features are otherwise all covered; no feature skipped.
- Nothing was skipped for time.

## 7. What these numbers do NOT catch
- Type checks disabled (`disableTypeChecks`), so type-invalid mutants aren't filtered (11 runtime errors ignored).
- StringLiteral mutants excluded (1,910) — so error *messages*, setting keys, tool ids, SQL fragments in strings are not mutation-tested.
- tap-runner granularity is a whole test *file* per mutant (perTest = per file, not per test): "killed" means some test file in the feature's `__tests__` failed; indirect/accidental kills count. Coverage is per test file, so no-coverage = no file in the lane's list loaded that line.
- Test sets limited to each feature's own `__tests__` (see §6) and excludes Postgres/native-failing files; scores for Postgres-bound code (database-transfer copy engine) are meaningless as quality measures.
- Equivalent mutants are not removed (Regex/Conditional on already-redundant guards inflate survivors); untested input domains, concurrency, timing, and security properties outside these modules are not measured. UI/.tsx not in scope.
- Errors thrown for the *wrong reason* still kill mutants that expect a throw.

## 8. Top 10 tests to write first (ranked by risk)
1. **database-transfer**: fix/decide `members.password_hash` (§2 #1) and add a catalog-wide test that every table with a `SECRET_COLUMN_PATTERN` column is excluded or filtered (exclusions.ts / table-catalog.ts L112).
2. **database-transfer/destination-store.ts L66–67** `authorize`: negative cases — wrong `kind`, wrong `ownerKey`, wrong principal each rejected.
3. **identity/permission-list-tool.ts**: invoke `identity_policy_list_permissions` with/without permission and with blank/non-string `policyId`.
4. **identity/user-manage-permission.ts**: assert builtin `admin` role gets `user.manage` (and owner-only protections around it).
5. **identity/api-key-secret.ts**: malformed/zero/non-integer scrypt parameters and missing-separator hash strings must return null/false; `boot-session-token.ts` empty/non-string token → false.
6. **member-login/link-service.ts**: subject owned by other provider/member → reject; proof email ≠ member email, proof id ≠ member id, invalid `startedAt` → specific `MemberLoginError.code`.
7. **member-login/oidc-login.ts + providers.ts**: negative table per validator asserting the `code` (state length ≠ 32, expired/replayed login, connectMemberId mismatch, `validEmail` limits, provider-file caps/regexes).
8. **settings/form-delivery.ts** secret detector table (`bearer`, JWT, `basic`, key-name patterns, anchors) and **settings/publish-content.ts** `LOCAL_HOST` SSRF table (`127.0.0.1.evil.com`, `evil-localhost.com`, `0.0.0.0`, `[::1]`, `*.local`).
9. **members/password-auth.ts & write-service.ts**: email case-folding on login; revoked-credential session rejection (`credentialsRevokedAt >= createdAt`); reset record re-check (`expiresAt`, revocation mismatch); challenge `realm !== "member"` rejection; `EMAIL_PATTERN` anchors.
10. **settings/tool-registrations.ts** approval/deny lists (`localCli.agentId` filter, always-ask interface keys, consent extraDenied) + **member-login/ready-providers.ts** (no test at all) and **settings/chart-provider.ts** (setting definition).
Then: add `link-policy` null-member + `connectMemberId` test (the Step 1 survivor), and a Postgres CI lane so copy-engine/pg-store-copy are mutation-measurable.

L7 DONE 2026-10-25T18:12Z · wall ≈2 h 15 m of 4 h · tokens ≈ 200 k of ~1 M


## Appendix — Step 1 (tap-runner proof)
`@stryker-mutator/tap-runner@9.6.1`, Node 24.22, cwd = repo root, config `step1-config.json` (nodeArgs `--import tsx --experimental-test-module-mocks --test-reporter=tap`, env `TSX_TSCONFIG_PATH=apps/site-chat/tsconfig.json`, testFiles = member-login/__tests__/link-policy.test.ts, coverageAnalysis off, StringLiteral excluded, type checks off).
- `member-login/link-policy.ts`: 47 mutants instrumented, 37 scored: killed 36, survived 1, **97.30 %**. Whole `stryker run` 24 s (dry run 0.4 s overhead; 2 procs).
- Survivor: line 8:26 OptionalChaining `member?.id` → `member.id` — real gap (a connect attempt with member=null should return "conflict", not throw; add a test with `member: null, connectMemberId: "x"`).
- Note: tap-runner only knows test-file granularity (one `node` process per test file per mutant), so cost/mutant = number/duration of test files run.
