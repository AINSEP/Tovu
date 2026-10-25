# L12 — Tovu website `apps/website/src/server/` (Stryker measure-only, tap-runner)
Started 16:49 UTC, last run finished 20:26 UTC (3h40m rule: no new runs after that). Report only: no source/test edits. Raw lists: `data/survivors-and-nocov.txt`, per-run wall times `data/run-wall-times.txt`, scripts/configs `data/`.

## 1. Headline
- **65 files** (base runs) / **4,464 mutants instrumented**, **3,634 scored** (rest Ignored by StringLiteral exclusion/static): killed+timeout **2,826**, survived **307**, no-coverage **501** → **77.8 %** raw. (Follow-up passes below are NOT double counted.)
- Wall ≈ 3 h 40 m incl. setup (~25 min). ~0.4 M tokens. Runner: `@stryker-mutator/tap-runner@9.6.1`, Node 24.22, cwd = repo root, `node --import tsx --experimental-test-module-mocks`, `TSX_TSCONFIG_PATH=apps/site-chat/tsconfig.json`, concurrency 3, `coverageAnalysis: off`, StringLiteral excluded, type checks off, timeoutMS 20 s ×2. testFiles scoped per source file (tap-runner has only test-file granularity, so every mutant re-runs all listed test files → *only the named tests could kill*; indirect kills from other suites are invisible).
- **Server is ~78 k lines / 577 src files; ~65 files (≈ 9 k lines of the highest-risk ones) were measured. Most of the server is NOT RUN (see §6).**
- Timeouts count as killed. Several members/api-key files have many timeouts (e.g. `api-keys/*` 5/12, `oidc-start` 14/36) — treat as weaker kills.

## 2. Suspected source bugs
**None confirmed.** Items worth a human look (all unverified, test-env related):
1. `inbound/public-http/middleware/__tests__/site-consent.test.ts` — 3 tests fail at baseline here (`static export returns 409` gets **200**; "cached OFF cannot bypass consent…"; "live defaults show consent; exports omit defaults…"). Probably the Jini linked from `cloud/overnight-1024-jini` being older than Tovu expects (consent default), but if not, static export of a consent-gated site silently succeeds (data-leak style regression). Needs a rerun against the matching Jini.
2. Baseline-failing tests (excluded from runs):  `publish-site-listing.unit.test.ts`, `__tests__/admin-local-boot-session-route.test.ts` (1 test) and `__tests__/identity-routes.test.ts` (1 test).

## 3. Per-file table (worst score first; "follow-up" rows re-ran a subset with wider tests and are not in totals)
| file | run | mutants | scored | killed | surv | nocov | score |
|--|--|--|--|--|--|--|--|
| runtime/boot/process-error-guards.ts | process-error-guards | 16 | 11 | 0 | 0 | 11 | 0.0% |
| inbound/admin-http/routes/settings/shared.ts | settings-shared | 119 | 94 | 7 | 2 | 85 | 7.4% |
| inbound/public-http/middleware/site-consent.ts | site-consent | 143 | 126 | 19 | 2 | 105 | 15.1% |
| inbound/admin-http/dev-auth.ts | dev-auth-pass3 (follow-up, not in totals) | 147 | 112 | 32 | 10 | 70 | 28.6% |
| runtime/boot/site-listener-origin.ts | b-site-listener-origin | 20 | 13 | 4 | 9 | 0 | 30.8% |
| inbound/admin-http/dev-auth.ts | dev-auth | 387 | 318 | 168 | 38 | 112 | 52.8% |
| inbound/admin-http/routes/system/site-key.ts | site-key | 386 | 301 | 171 | 24 | 106 | 56.8% |
| inbound/admin-http/routes/users/remove-policy-permission.ts | remove-policy-permission (follow-up, not in totals) | 75 | 61 | 37 | 11 | 13 | 60.7% |
| inbound/admin-http/publish-trust-auth.ts | publish-trust-auth | 109 | 96 | 59 | 15 | 22 | 61.5% |
| inbound/admin-http/routes/system/publish-credentials.ts | publish-credentials | 160 | 138 | 87 | 25 | 26 | 63.0% |
| inbound/public-http/routes/members/unlink-identity.ts | m-unlink-identity | 110 | 95 | 60 | 29 | 6 | 63.2% |
| inbound/public-http/routes/members/oidc-verify-email.ts | m-oidc-verify-email | 95 | 78 | 50 | 24 | 4 | 64.1% |
| inbound/admin-http/routes/api-keys/issue.ts | api-keys | 16 | 15 | 11 | 4 | 0 | 73.3% |
| inbound/public-http/routes/members/complete-sign-in.ts | m-complete-sign-in | 70 | 59 | 44 | 5 | 10 | 74.6% |
| inbound/public-http/routes/site-share.ts | site-share | 42 | 35 | 27 | 8 | 0 | 77.1% |
| inbound/public-http/routes/members/sign-out.ts | members-pw | 20 | 19 | 15 | 2 | 2 | 78.9% |
| inbound/public-http/routes/members/oidc-callback.ts | m-oidc-callback | 92 | 78 | 63 | 14 | 1 | 80.8% |
| inbound/admin-http/publish-trust-auth.ts | publish-trust-auth-pass2 (follow-up, not in totals) | 53 | 47 | 38 | 9 | 0 | 80.9% |
| inbound/admin-http/routes/api-keys/create-principal.ts | api-keys | 13 | 12 | 10 | 2 | 0 | 83.3% |
| runtime/boot/boot-listener.ts | b-boot-listener | 7 | 7 | 6 | 1 | 0 | 85.7% |
| inbound/public-http/routes/members/oidc-start.ts | m-oidc-start | 42 | 36 | 31 | 3 | 2 | 86.1% |
| inbound/public-http/routes/members/me.ts | members-pw | 56 | 51 | 44 | 5 | 2 | 86.3% |
| inbound/public-http/middleware/canonical-site-host.ts | canonical-site-host | 59 | 46 | 40 | 6 | 0 | 87.0% |
| inbound/public-http/routes/members/sign-in.ts | members-pw | 55 | 46 | 40 | 3 | 3 | 87.0% |
| inbound/admin-http/routes/system/site-key.ts | site-key-pass2 (follow-up, not in totals) | 168 | 131 | 114 | 12 | 5 | 87.0% |
| inbound/public-http/routes/api-connections/oauth-callback.ts | api-conn-oauth-callback | 108 | 81 | 71 | 9 | 1 | 87.7% |
| runtime/boot/site-key-boot-notice.ts | b-site-key-boot-notice | 63 | 34 | 30 | 3 | 1 | 88.2% |
| inbound/admin-http/routes/system/publish-credentials.ts | publish-credentials-pass2 (follow-up, not in totals) | 160 | 136 | 120 | 16 | 0 | 88.2% |
| inbound/admin-http/routes/system/site-shares.ts | site-shares-admin | 190 | 163 | 145 | 18 | 0 | 89.0% |
| inbound/admin-http/routes/system/source-control-credentials.ts | source-control-credentials | 118 | 100 | 89 | 11 | 0 | 89.0% |
| inbound/public-http/routes/oauth/public-origin.ts | oauth-public-origin | 42 | 31 | 28 | 3 | 0 | 90.3% |
| runtime/boot/production-readiness-gate.ts | production-readiness-gate | 116 | 97 | 88 | 8 | 1 | 90.7% |
| inbound/public-http/routes/members/forgot-password.ts | members-pw | 28 | 24 | 22 | 2 | 0 | 91.7% |
| inbound/public-http/routes/members/reset-password.ts | members-pw | 27 | 24 | 22 | 2 | 0 | 91.7% |
| runtime/boot/mail-delivery-policy.ts | b-mail-delivery-policy | 20 | 15 | 14 | 1 | 0 | 93.3% |
| runtime/boot/local-owner-signin.ts | b-local-owner-signin | 234 | 191 | 179 | 12 | 0 | 93.7% |
| inbound/admin-http/routes/system/source-control-credentials.ts | source-control-credentials-pass2 (follow-up, not in totals) | 118 | 100 | 94 | 6 | 0 | 94.0% |
| inbound/admin-http/routes/users/create.ts | u-create | 71 | 59 | 56 | 2 | 1 | 94.9% |
| inbound/public-http/routes/members/password-sign-in.ts | members-pw | 27 | 23 | 22 | 1 | 0 | 95.7% |
| inbound/admin-http/routes/users/create-role.ts | u-create-role | 32 | 25 | 24 | 1 | 0 | 96.0% |
| inbound/admin-http/routes/users/update.ts | u-update | 99 | 83 | 80 | 3 | 0 | 96.4% |
| inbound/admin-http/routes/api-keys/deps.ts | api-keys | 35 | 28 | 27 | 1 | 0 | 96.4% |
| inbound/public-http/routes/members/set-password.ts | members-pw | 34 | 30 | 29 | 1 | 0 | 96.7% |
| inbound/admin-http/routes/users/remove-policy-permission.ts | u-remove-policy-permission | 75 | 61 | 59 | 2 | 0 | 96.7% |
| inbound/admin-http/routes/users/delete.ts | u-delete | 52 | 41 | 40 | 1 | 0 | 97.6% |
| inbound/public-http/routes/publish-trust/handshake.ts | handshake | 118 | 100 | 98 | 2 | 0 | 98.0% |
| inbound/admin-http/routes/users/disable.ts | u-disable | 65 | 53 | 52 | 1 | 0 | 98.1% |
| inbound/admin-http/routes/users/enable.ts | u-enable | 67 | 54 | 53 | 1 | 0 | 98.1% |
| inbound/public-http/routes/external-mcp/oauth-callback.ts | external-mcp-oauth-callback | 79 | 58 | 57 | 1 | 0 | 98.3% |
| inbound/admin-http/routes/api-keys/revoke.ts | api-keys | 12 | 10 | 10 | 0 | 0 | 100.0% |
| runtime/composition/app-permission-grants.ts | app-permission-grants | 9 | 9 | 9 | 0 | 0 | 100.0% |
| inbound/admin-http/authorize-guard.ts | authorize-guard | 11 | 9 | 9 | 0 | 0 | 100.0% |
| runtime/boot/bind-host.ts | b-bind-host | 32 | 26 | 26 | 0 | 0 | 100.0% |
| runtime/boot/dev-tls.ts | b-dev-tls | 38 | 32 | 32 | 0 | 0 | 100.0% |
| runtime/boot/parent-watchdog.ts | b-parent-watchdog | 54 | 46 | 46 | 0 | 0 | 100.0% |
| runtime/boot/content-db-schema-guard.ts | content-db-schema-guard | 33 | 22 | 22 | 0 | 0 | 100.0% |
| error-mapping/respond.ts | error-respond | 14 | 13 | 13 | 0 | 0 | 100.0% |
| inbound/admin-http/routes/external-mcp/guard.ts | ext-mcp-guard | 23 | 17 | 17 | 0 | 0 | 100.0% |
| inbound/public-http/routes/oauth/callback-page.ts | oauth-callback-page | 20 | 6 | 6 | 0 | 0 | 100.0% |
| inbound/public-http/middleware/public-page-security-headers.ts | public-page-security-headers | 22 | 19 | 19 | 0 | 0 | 100.0% |
| http/request-cookie.ts | request-cookie | 4 | 3 | 3 | 0 | 0 | 100.0% |
| inbound/public-http/middleware/site-serving-gate.ts | site-serving-gate | 30 | 21 | 21 | 0 | 0 | 100.0% |
| inbound/admin-http/routes/users/assign-role.ts | u-assign-role | 50 | 40 | 40 | 0 | 0 | 100.0% |
| inbound/admin-http/routes/users/attach-policy.ts | u-attach-policy | 50 | 40 | 40 | 0 | 0 | 100.0% |
| inbound/admin-http/routes/users/create-policy.ts | u-create-policy | 38 | 31 | 31 | 0 | 0 | 100.0% |
| inbound/admin-http/routes/users/delete-policy.ts | u-delete-policy | 43 | 33 | 33 | 0 | 0 | 100.0% |
| inbound/admin-http/routes/users/delete-role.ts | u-delete-role | 43 | 33 | 33 | 0 | 0 | 100.0% |
| inbound/admin-http/routes/users/reset-password.ts | u-reset-password | 62 | 48 | 48 | 0 | 0 | 100.0% |
| inbound/admin-http/routes/users/update-policy.ts | u-update-policy | 46 | 38 | 38 | 0 | 0 | 100.0% |
| inbound/admin-http/routes/users/update-role.ts | u-update-role | 39 | 30 | 30 | 0 | 0 | 100.0% |
| inbound/admin-http/routes/users/write-policy-permission.ts | write-policy-permission | 74 | 59 | 59 | 0 | 0 | 100.0% |

TOTAL files=71 mutants=4464 scored=3634 killed=2826 surv=307 nocov=501 score=77.8%

## 4. Triaged survivors (a = real test gap; b = equivalent; c = noise). Source lines are of the file named.
**Security-relevant real gaps (a):**
- `routes/members/me.ts:16` — `checkMemberWorkspace` early-return removable (wrong-workspace `/me` request not asserted rejected); `:24` — `status === active|pending` filter replaced by `true` survives → a suspended/disabled member would still be returned; no test with a non-visible status.
- `routes/members/unlink-identity.ts` (63 %): `:48` recent-auth freshness window `age > 0` / `age < 900000` boundaries both mutate freely (no test for stale or future-dated session at the 15-min edge); `:18/:19/:31/:45/:51` guards (`member.emailVerifiedAt` required, already-unlinked identity) flip without failure; `:68-73` body-shape validation (null/array/non-object) untested.
- `routes/members/oidc-verify-email.ts` (64 %): body allow-list (`:13-15` exactly 3 known keys), 6-digit code regex `:18` (`^`/`$` anchors), `:24` length bounds all survive → malformed/oversized/extra-key input is not pinned. Same regex in `complete-sign-in.ts:57` is **no-coverage** (4 regex mutants, N).
- `routes/members/oidc-callback.ts:18-19` — `code.length > 4096`, `state.length > 16384` and `!state` guards survive on every operator/boundary; `:32`, `:50` guards.
- `routes/members/sign-out.ts:17` — `session && !session.revokedAt` → `||` survives (re-revoking already revoked sessions; low risk, b/a).
- `admin-http/publish-trust-auth.ts:423` — `!isBackstopEntityType(...) || backstopGrantAllows(...)` → `true` survives even with all 6 publish-trust route test files: a grant lacking the backstop entitlement is not asserted denied. `:196` optional-chain on missing grant/public-key (empty-key fallback) and `:231/:239` (no-token / no-installation-id pass-through) also unpinned.
- `admin-http/routes/system/site-key.ts` (first run 56.8 %, with wider integration tests 87 %): remaining survivors `:250` (wrong-workspace 404), `:228`, `:274` (hasKeyDependentData flag), `:298` (409 ALREADY_EXISTS), `:309/:319` (`req.body` undefined → `.siteKey`/`.confirm` optional chaining; a missing body would throw 500), `:436/:467/:470`. With only the 3 site-key suites, the API-key-credential refusal (`rejectUnlessSessionCredential`, `:243`) and the per-route `rejectUnlessAuthorized` (`:264/:289/:308`) survived; they ARE killed by `admin-site-key-routes`/`route-async-guards` (pass-2).
- `admin-http/routes/system/publish-credentials.ts`: pass-2 survivors `:111-114` (update-field passthrough `label/connection/isDefault/worksFor` — PATCH of one field not asserted to omit the others), `:291`, `:309`, `:350`.
- `admin-http/routes/users/*` are strong (assign/attach/create/delete role & policy, reset-password, write-policy-permission: 94–100 %). Gaps: `create.ts:57` (`usernameHeldByTrashedUser` no-existing-user branch), `update.ts:101/107` (email-retention read on omitted email), `remove-policy-permission.ts:65-66`. `api-keys/issue.ts` (73 %) and `create-principal.ts` (83 %): optional-chaining on `req.body.*` (missing body → 500 instead of 400) survives for principalId/label/policyIds/expiresAt/displayName/kind.
- `routes/site-share.ts` (77 %): `:14` registry.findToken optional chain, `:17` three boolean flags, `:19/:21` token-validity branches survive. `routes/system/site-shares.ts` (89 %): `:14` UUID regex anchors, `:65` `SHARE_TOKEN && SHARE_FILE` AND→OR and `body.length <= 4`.
- `api-connections/oauth-callback.ts:47,69,80,106` — state-length bound (`>=` vs `>`), unexpected-field check `fields.length !== 0` survive.
- `middleware/canonical-site-host.ts` (87 %): `:11` `/www\./` unanchored (host `foo.www.example` would be rewritten), `:12` bracket-stripping regex anchors (IPv6 hosts), `:28` skip-path regex unanchored.
- `runtime/boot/site-listener-origin.ts` (31 %, 9 survivors) — wildcard-bind host logic (`host === '0.0.0.0' || '::'`) has essentially no assertion: a wildcard-bound listener could be advertised as a literal origin.
- `runtime/boot/local-owner-signin.ts` (93.7 %): `:33` flag guards, `:46` 64-hex token regex anchors, `:77` `launcherPid <= 1`, `:115` URL credentials `username && password`, `:131` `!host && !origin`.
- `runtime/boot/production-readiness-gate.ts` (90.7 %): `:83-84` function-valued readiness override (`!== true`), `:194`.
- `runtime/boot/boot-listener.ts` 1 survivor; `site-key-boot-notice.ts` 3; `mail-delivery-policy.ts` 1.
**Equivalent / noise (b/c):** ObjectLiteral `{}` replacements on response/log payload args and `BlockStatement` emptying of `catch`/log paths dominate the survivors of the 90 %+ files (members password routes, `forgot-password.ts:12/19`, `password-sign-in.ts:14`, `set-password.ts:16`); `Regex` anchor mutants on header parsing (`dev-auth.ts:92`, `publish-trust-auth.ts:105` — `Bearer|ApiKey` regex: `^`/`$` anchors, b-ish but could accept `xBearer tok`); `dev-auth.ts:85` session-lifetime arithmetic (`30*24*60*60` → other combos) is **a**: cookie/session max-age not asserted.

## 5. No-coverage ranges (code no listed test executes)
- `dev-auth.ts` (52.8 %; 112 NoCov in base run, 70 still NoCov in pass-3 with boot-session + password-status + unit suites): lines **118-125** (credential-kind switch session/api_key/publish_key), **223-226**, **361-370** (session-only credential check), **434-436** (loopback-peer test), **520-533**, **592-605**, **632-675** (local-owner sign-in endpoint: loopback gate `isLoopbackPeer`, `localOwnerSignIn.acceptsCapability`, `allowsLocalOwnerSignInRequest`, principal creation), **732-755** (default-password hash cache with 256 cap). These are exactly the loopback/local-owner sign-in security gates — their only covering test file (`admin-local-boot-session-route.test.ts`) fails at baseline here, so they are **unmeasured, not necessarily untested**.
- `middleware/site-consent.ts` (15 %): 105 NoCov — everything except policy/metadata units (cookie-gating middleware is covered only by the baseline-failing `site-consent.test.ts`): lines 54-125 (slug/post lookups, activation, headers).
- `runtime/boot/process-error-guards.ts` (0 %, 11 NoCov): its only test spawns a child process via tsx; Stryker's active-mutant env/instrumented sandbox is not applied to the child → **tooling artifact**, not proof of no test. Same artifact risk for any test using child processes.
- `admin-http/routes/settings/shared.ts` (7 %): only `shared.unit.test.ts` was run; 85 NoCov at 44,173-181,200+ (mail-namespace invalidate hook, setter wiring) — other suites (`json-route-parity`, `mail-cache-invalidation`) not run.
- `site-key.ts` NoCov (base run) 207,226-229,247-252,272-285,298-299,312-332,468-471,562-616 → mostly covered in pass-2 (5 NoCov remain: 252 etc.).
- `members/complete-sign-in.ts` 10 NoCov incl. the 6-digit regex `:57`; `unlink-identity.ts` 6; `sign-in.ts` 3; `me.ts` 2; `sign-out.ts` 2; `remove-policy-permission.ts` 13 with only the identity route test (0 with its own unit tests).

## 6. NOT RUN
Everything not named in §3. Specifically unmeasured:
- `inbound/admin-http/routes/**` except `users/*` (15 files), `api-keys/*`, `external-mcp/guard.ts`, `system/{site-key,publish-credentials,source-control-credentials,site-shares,publish-site*}`, `settings/shared.ts`: e.g. media (`route-guards.ts`, upload/original/replace), `external-mcp/{oauth,put,probe,admissions,tool-approvals}`, `publish-content/*` (peer-transport, import, destination, backstop, bundle-create, export), `system/{sites,site-imports,site-backups,assistant-*,mail-*,deployment-overview,custom-credentials,credential-copy,server-logs}`, `recovery/restore`, `database*`, `trash`, `posts`, `pages`, `forms`, `themes` (explore 1,275 lines), `widgets`, `menus`, `comments`, `consent`, `commerce`, `workspace`, `sites`, `skills`, `seo`, `redirects`, `plugins`, `agent-plugins`, `assistant/*`.
- `admin-http/{admin-dev-proxy,admin-static,range,sea-runtime}.ts`, `admin-http/http/*.ts` mappers.
- `inbound/public-http/**` large files: `http/site/render.ts` (3,760), `routes/site/pages.ts` (3,070), `form-render.ts`, `media-rendition.ts`, `member-auth-script.ts`, `page-head.ts`, `routes/content/*`, `routes/ops/*`, `mail-feedback`, `agent-plugin-surfaces`, `plugin-contributions`, `site-assistant-confirm`, and middleware `theme-*`, `site-chat-static`, `published-webmcp`, `render-theme-override`, `site-consent` (mostly unmeasured, above).
- `members/oidc-deps.ts`, `members/deps.ts`, `publish-trust` sub-modules, `oauth-callback-url.ts` (external-mcp), `external-mcp/oauth-callback-url`.
- `inbound/assistant/*` (e.g. `early-run-session.ts`), `inbound/shared/*`, `inbound/**` remaining ~350 files.
- `runtime/composition/**` (except `app-permission-grants.ts`), `runtime/{configuration,lifecycle,plugin-tier2,services}/**`, `runtime/boot/{bootstrap,agent-daemon-wanted,boot-readiness-warnings,mail-*,resolve-mailer,sender-domain-verification,site-boot-readiness,plugin-sdk-resolver}.ts`.
- `routes/workspaces/**`, `http/responses`, logging/formatting (deliberately last).
- `admin-http/routes/system/sites.ts` (439 lines) — queued but cut by the 3h40m rule. `system/publish-site.ts` (367 mutants) — dry run aborted: `publish-site-listing.unit.test.ts` fails at baseline here; re-run with only the `publish-site.tw4.pins` suite if wanted.
- `dev-auth.ts` local-owner sign-in section and `site-consent.ts` due to baseline-failing tests (§5).
- `members-oidc` first combined run (535 mutants) timed out at my own 1,500 s limit with no JSON; redone per file (`m-*`), but `oidc-deps.ts`/`deps.ts` dropped.

## 7. What these numbers do NOT catch
Type-check mutants off (`disableTypeChecks`); StringLiteral mutants excluded (error messages/codes/header names/cookie names/permission strings are NOT mutation-tested); tap-runner = test-file granularity and `coverageAnalysis: off`, so scores for a file depend on the exact test files I listed (many files would score higher with the wide integration suites — see follow-up rows: site-key 56.8→87 %, publish-credentials 63→88 %, publish-trust-auth 61→81 %); Timeouts are counted as kills; Ignored (static) mutants excluded from scores; child-process tests are invisible to Stryker; baseline-failing tests excluded (env: Jini version, no Postgres/IPv6); `.tsx`/UI excluded; the score does not measure untested inputs, concurrency, or cross-module wiring (`composition`). Equivalent mutants (not judged one-by-one beyond the lists above) depress scores slightly.

## 8. Top 10 tests to write first (ranked by risk)
1. `publish-trust-auth`: grant WITHOUT backstop entitlement + backstop entity type → apply denied (line 423).
2. `dev-auth` local-owner sign-in: non-loopback peer, wrong/absent capability header, `localOwnerSignIn.enabled=false` → 403/404 (lines 632-675); credential-kind switch (118-125) and session-only guard (361-370). (Fix the baseline-failing `admin-local-boot-session-route` test first.)
3. `members/me.ts`: suspended/disabled/deleted member with valid session → `member: null`; wrong `workspaceId` → rejected.
4. `unlink-identity`: stale (>15 min) and future-dated recent-auth session at the exact 900000 ms boundary; unverified email; already-unlinked identity; malformed bodies (null/array).
5. `oidc-verify-email` / `complete-sign-in`: code `"12345"`, `"1234567"`, `"abc123"`, `"123456
"`, extra keys, oversized strings.
6. `oidc-callback` and `api-connections/oauth-callback`: `code` of exactly 4096/4097 chars, `state` at its maximum, missing state.
7. `site-listener-origin`: wildcard hosts `0.0.0.0`/`::` vs concrete host.
8. `site-key` routes: wrong workspace → 404; `generate` when file exists → 409 ALREADY_EXISTS; POST/import with no body → 400 not 500; api-key credential refused on every route.
9. `canonical-site-host`: host `foo.www.example.com`, IPv6 `[::1]:3000`, path `/foo/admin/x` (anchoring).
10. `api-keys/issue` & `create-principal`: missing/empty body → 400; `publish-credentials` PATCH with one field leaves others untouched; `site-share(s)` token/UUID regex anchors.

L12 DONE 2026-10-25 20:30 UTC, wall ≈ 3 h 40 m, rough tokens ≈ 0.4 M
