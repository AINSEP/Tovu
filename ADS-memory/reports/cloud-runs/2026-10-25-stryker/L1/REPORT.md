# L1 REPORT — Jini security lane (StrykerJS, measure-only, no source/test edits)

Jini @ 3e2fbae8 (`cloud/overnight-1024-jini`). Stryker 9.6.1 + vitest-runner, concurrency 3, perTest coverage, `StringLiteral` excluded, type checks off, tsc 5.9. Started 15:57 UTC, last run finished 17:53 UTC (wall ≈ 2 h; ~0.15M tokens, rough).

## 1. Headline
| package | files with mutants | mutants run (of total) | killed | timeout | survived | no-cov | score (killed+timeout / run) | run wall |
|---|---|---|---|---|---|---|---|---|
| platform tier-1 (secrets, mail, http, net, fetch-with-timeout, aws-sigv4, sandbox-env, child-environment) | 39 | 3770 (4441) | 3491 | 10 | 269 | 0 | **92.9 %** | 13m38 |
| platform rest (fs, download, process, terminal, proxy-env, web, blob, asset-cache, …) | 36 | 7033 (8340) | 6093 | 58 | 866 | 13 (+3 runtime-error) | **87.3 %** | ~28 min |
| oauth | 29 | 1935 (2442) | 1752 | 9 | 174 | 0 | **91.0 %** | 9m46 |
| user-management | 45 | 5416 (6802) | 4941 | 1 | 472 | 1 (+1 RTE) | **91.2 %** | ~50 min |
| **L1 total** | | **18154 (22 025)** | 16277 | 78 | 1781 | 14 | **90.2 %** | |

Gap between "total" and "run" = StringLiteral mutants deliberately excluded (`Ignored`). Everything in the lane's package list ran; nothing timed out on the wall clock.

## 2. Suspected source bugs
**None found.** Survivors are test-assertion gaps, not wrong behaviour. Three **harness/test-hygiene findings** (not source bugs):
1. `packages/platform/src/secrets/__tests__/exports.test.ts` is RED on this branch before any mutation: expects `@jini-ai/core` `^0.6.11`, `package.json` has `^0.6.12` (stale test expectation). `src/web/__tests__/optional-peers.test.ts` is also red in the initial run. Stryker refuses to start on a red baseline, so both were excluded via an untracked `vitest.stryker.config.ts` (not committed). Their subjects (exports map, optional peers) are therefore **not** mutation-covered by those tests.
2. `packages/platform/src/__tests__/sandbox-env.test.ts:209-211` ("no-op when runtime config is disabled") asserts `/should-not-be-touched` does not exist. A mutant in `sandbox-env.ts` (tier-1 run) made a disabled config create that directory at the filesystem root; it **leaked on the host fs** (`/should-not-be-touched/{generated-files,logs}` still exists in this container — I was not permitted to delete it) and made the baseline red for the next run. That test should use a tmp dir under a guaranteed-absent path, and the leaked dir shows the guard at `sandbox-env.ts:181` is not load-bearing in any test (see survivor 181:7). I excluded `sandbox-env.test.ts` from the platform-rest run (sandbox-env.ts itself was mutated in tier-1 before the leak).
3. user-management: `src/core/__tests__/runtime-boundary.test.ts` (reads `../core/src` relative to cwd, breaks inside the in-package `.stryker-tmp` sandbox) and `src/react/members/__tests__/fqfix-disable.unit.test.ts` (asserts source comments, which the instrumenter strips) cannot run under Stryker; excluded. A third source-text test class exists in the repo (comment/rationale asserts) — those can never be mutation-killing.
Also: 2 platform `RuntimeError`s (process.ts 218/520) and 1 user-management (`PermissionPanel.hooks.ts:19`) — mutants that crash the runner; counted neither killed nor survived.

## 3. Per-file tables (worst score first)
Raw tables are in `TABLES.md` (same directory) — 149 files.

## 4. Triaged survivors (security-relevant, ≤10/file shown; (a)=real test gap, (b)=equivalent, (c)=noise)
Only files < 80 % or ≥ 10 survivors were triaged, plus every security guard I noticed. Line numbers are in the Jini source.

### user-management
- `server/admin-crud-service.ts:345,347` (a) **seeded-owner password-reset guard**: `if (target.principalId === seededOwner && caller !== seededOwner)` → `false` AND its block → `{}` both SURVIVE. No test proves a non-owner is refused when resetting the seeded owner's password. Highest-risk gap in the lane. Also 357-358 (`!input.password` → "password is required" branch not asserted), 154 (ENABLE_PRINCIPAL non-human target), 164 (already-active target branch).
- `server/authorize.ts:167,183`, `server/grant-service.ts:80,138,139,143` (a): the "unconditional owner wildcard" test `permission==='*' && resourceType==null && constraintJson==null` — each `&&` operand → `true` survives, and `candidates.some`→`every` survives. No test with a **scoped or constrained `*` row** that must NOT grant everything, nor mixed-constraint candidate sets.
- `core/permissions.ts:38-39` (a): registering the `*` wildcard as a permission descriptor — both the guard condition and the thrown error object survive; need a test that `*` registration is refused with the specific error.
- `server/hasher.ts:55,60` (c/a): default argon2 option object `{}` — options spread to `{}` survives, i.e. no test pins the default hashing parameters (cost) actually used.
- `server/repo.memory.ts` (31, mostly ObjectLiteral/ArrayDeclaration/MethodExpression on workspace filters) (a): `matchesRecordFields` workspace-scoping fields→`{}` survives at 71/100/115 — in-memory repo not tested for cross-workspace isolation.
- `server/agent-tools.ts` (9) (a): every tool JSON-schema `required: [...]` → `[]` survives — no test that agent-tool schemas declare required args.
- `admin/conformance/index.ts` (84, 75.9 %) (c): conformance-suite helper (test-support code shipped as src); survivors are `assert` conditions inside the suite; self-conformance only runs against the memory adapter.
- `admin/controllers/{roles,members}.controller.ts` (41/28) (a): stale-response generation counters (`++listGeneration`→`--`), `generation === x && id === y` races — no out-of-order-response tests.
- `react/users/hooks/use-users.hooks.ts:259` (a): 403→`null` handling `e && typeof e==='object' && 'status' in e` operand mutations survive.
- Remaining admin/react `*.hooks.ts` files 66–85 %: UI hook wiring (index.ts exports, binding hooks) — mostly (c)/(a) low risk.

### oauth
- `authorization-code.ts:101` (a) **redirect-URI allowlist**: `redirectUris.some(...)`→`every` survives (only single-URI configs tested; with ≥2 registered URIs, a matching second URI would be rejected). `:184` (a) state empty/over-length guard: `||`→`&&`, `>`→`>=`, `=== ""`→false all survive; `:161` empty `code` guard→false survives; `:121,179,180` optional `resource`/`timeoutMs` pass-through survive.
- `oidc.ts` (33 survivors, 69.4 %) (a): `signingAlgorithm ?? 'RS256'` default (→ `&&`) survives; `maxAge` pass-through (56) survives; `allowInsecureRequests` for `http:` JWKS (60) survives; claim-validation guard at 86 (`!clientId || !isFinite(nowMs) || ... tolerance<0`) each operand →false survives.
- `refresh.ts:41,43,46,114` (a): expiry boundary (`<=`→`<`, skew, deadline `>=`→`>`), `leaseWaitMs/leasePollMs ?? default`; `:83` terminal-error classification ConditionalExpression→false survives.
- `token-endpoint.ts:39,100,111,115` (a): http endpoint → `allowInsecureRequests` (39 →true survives, i.e. https endpoints could be marked insecure-ok without a test failing), `expires_in <= 0`, `operatorAction` for invalid_grant.
- `endpoint-safety.ts:14,18` (a): loopback/IPv4-mapped regex anchors (`^`/`$` removed) survive — only canonical forms tested.
- `registration-cache.ts` (10, 77.8 %) (a): default grant/response types and auth-method defaults, expiry comparison at 55.
- `errors.ts:70-83`, `device-code.ts:39-121`, `loopback-receiver.ts:100,190` (a): RFC 8628 interval/expiry boundaries; `hasBody` (transfer-encoding/content-length) check on the loopback callback → `||`→`&&` survives (a request-smuggling-ish check with no test per operand); state length boundary.

### platform
- `http/guarded/client.ts:38` (a) **userinfo rejection**: `url.username || url.password` → `&&` survives (URL with only a username not tested). `:46` bracket-strip `&&`→`||`; `:107,118` maxBytes boundary `<=` vs `<`.
- `net/endpoint-policy.ts` (27) (a) SSRF classifier: `:68` `fill<1`→`<=1`, `:78` IPv4-suffix regex anchors, `:83` octet validation (`some`→`every`, `||`→`&&`, each operand→false) survive — malformed octets/`::ffff:`-embedded forms undertested. `net/address.ts:45,49` bracket regex + 127.x loopback branch.
- `fs/guarded-reader.ts:80-98` (a) path guard: segment normalisation (`""`/`"."`/`".."` handling, `:` stream-suffix regex at 87) and case-folding survive.
- `sandbox-env.ts:74-91,125,135,144,169,181` (a): allowed-roots parsing (`.trim()` removal), `isPathInsideDir` `relative===''`, `sandboxImportAllowedRoots.some`→`every`, disabled-mode `return null` (see §2 leak).
- `secrets/credential-token.ts:71,72,81` (a): `SECRET_NAME`/`SECRET_ARG` regex variants (each class/`?` mutated) survive — only a few secret-ish key names exercised; `:81` url userinfo/secret-param detection →false survives.
- `secrets/passphrase-envelope.ts:88-124` (a): salt regex anchors (`^`/`$`), `MAX_PAYLOAD_BYTES±16` bound, `typeof`/`isRecord` guards, size limit `>`→`>=`, catch block `{}`.
- `secrets/credential-sets/provider-matches.ts:43-44`, `vault.service.ts:72-120`, `vault.repo.memory.ts:14-57` (a): worksFor lower-case/non-empty validation operands; default-credential uniqueness key (`ownerKey/principalId` presence flags) in the memory repo.
- `mail/feedback.ts:70-112` (a): webhook rate-window boundary and the 503/429/401 response bodies (`ok:false`→`true` survives, `{}` bodies); `mail/smtp.ts:40` retryable range `>=400 && <500` boundaries; `mail/resolve-mailer.ts` (46) concurrency/warn-once/refusal-message branches.
- `aws-sigv4.ts` (30 mutants, 73.3 %) (a): canonical-header value `?? lowercase` fallback, `trimValue` whitespace collapse (`\s+`→`\s`), method uppercasing — need a SigV4 vector with mixed-case headers, internal runs of spaces, lower-case method.
- `http.ts:41-42` (a): remaining-timeout arithmetic and `{cache:'no-store'}` option.
- `download.ts` (864, 74.1 %, 221 survivors; 92 ConditionalExpression, 25 LogicalOperator, 21 EqualityOperator, 19 BooleanLiteral): resume/retry/lock/prune edge-case branches; error `details` assignment (147), errno-extraction guard (233). Not individually triaged beyond mutator summary (bounded).
- `terminal.ts` (55), `process.ts` (63), `proxy-env.ts` (56, 22 regex), `file-lock.ts` (63), `html-to-markdown.ts` (41+18 timeouts), `directory-workspace.ts` (47): (a)/(c) mix — default constants (`512*1024`, `30*60*1000`) never asserted (all NoCoverage/arith survive), win32 branches (platform-conditional, untestable on linux → (b)-ish), proxy header case-fold logic, env deletion by case-insensitive key.
- `messages.ts` (13 mutants, 38.5 %) (c/a): 8 default-message arrow functions → `() => undefined` survive; messages are user-facing but unasserted.
- `fs/workspace-directory.ts:20-25` (a): home/roots candidate filtering and last-opened sort — all 4 NoCoverage mutants are on line 25.

## 5. No-coverage ranges
platform: `download.ts:384,1124,1148` (`readdir(...).catch(() => [])` fallback arrays), `fs/workspace-directory.ts:25` (lastOpened ordering of home-dir candidates), `process.ts:521` (sort comparator), `terminal.ts:259-263` (constructor default byte/ttl constants). user-management: `react/members/hooks/use-members.hooks.ts:169`. oauth: none. tier-1 platform: none. (Only 14 NoCoverage in 18 154 mutants — coverage is not the problem here; assertion strength is.)

## 6. NOT RUN
Nothing from the lane's package list was skipped. Not mutated: `*.tsx`, tests, `.d.ts`, StringLiteral mutants (4 227 across the lane), and the two tests excluded from the baseline (§2). `packages/platform/src/index.ts` (barrel) yields no mutants.

## 7. What these numbers do NOT catch
Type checks disabled (type-invalid mutants appear as survivors/kills rather than compile errors); StringLiteral excluded (so error/messages text and string-keyed contracts like header names, algorithm names `'RS256'`, env var names are unmeasured); "killed" may be an indirect kill by an unrelated test; excluded baseline tests (§2) mean exports-map/optional-peer and runtime-boundary invariants are unmeasured; platform-specific branches (win32) can't be exercised on linux; untested *inputs* (a missing attack case produces no mutant); UI `.tsx` excluded; user-management hook files are logic-only slices of React code.

## 8. Top 10 tests to write first (by risk)
1. `admin-crud-service`: non-owner resetting the **seeded owner's password** is refused with `OwnerRequiredError`; owner resetting own password allowed; empty password → "password is required".
2. `authorize`/`grant-service`: `*` rows with `resourceType` or `constraintJson` set must **not** count as unconditional owner; mixed candidate sets (`some` vs `every`).
3. oauth `authorization-code`: ≥2 registered redirect URIs (second matches → accepted, unregistered → rejected); empty `state` / `state` length = MAX and MAX+1; empty `code` refused.
4. platform `http/guarded/client`: URL with username only and password only both refused; body exactly `maxBytes` vs `maxBytes+1`.
5. platform `net/endpoint-policy` + `net/address` + oauth `endpoint-safety`: SSRF corpus — `::ffff:7f00:1`, `::ffff:127.0.0.1`, 4-octet with 256/negative/non-integer octets, `::` compression edge (`fill=1`), bracketed hosts, `127.x.y.z`.
6. `fs/guarded-reader`: path normalisation corpus (`a//b`, `./a`, `a/../../b`, `..` at root, Windows `name::$DATA`, case-fold deny-list).
7. `oidc`: default `RS256`, `maxAge` forwarded, claim validation per-operand (empty clientId, NaN now, negative tolerance); http JWKS → insecure flag only for `http:`.
8. `secrets/credential-token` + `passphrase-envelope`: secret-name/arg regex table (each alternation incl. `api-key`, `access_token`, prefix/suffix boundary) and envelope validation (salt wrong length/charset with trailing/leading junk, ciphertext bounds ±1, non-record sealed, over-limit passphrase).
9. `sandbox-env`: disabled config returns null/no fs writes (use tmp, not `/should-not-be-touched`); allowed-roots with multiple roots (`some` vs `every`), padded whitespace entries, `relative===''`.
10. `aws-sigv4` vectors (mixed-case headers, multiple internal spaces, lowercase method) + `mail/feedback` webhook (503/429/401 bodies `ok:false`, window boundary) + `mail/smtp` retryable boundaries 399/400/499/500.

L1 DONE 2026-10-25T17:53Z — wall ≈ 2h (15:57–17:55 UTC, incl. ~25 min setup/triage), ~0.15M tokens (rough).
