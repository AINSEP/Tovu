# passkeys — complete

Job instructions: `cloud/jobs/COMMON.md`, `cloud/jobs/passkeys.md`, `cloud/plans/ML-plan-result.md` D2 and TRIM “ML”, read from fetched Jini `origin/cloud-plans-1105`. Loaded Software Architect, Programmer and TDD personas from `/workspace/cloud/ai-dev-shop`.

Started November 5, 2026 at 4:02 PM PST; hard deadline 6:02 PM PST. Both branches are `cloud/passkeys`, cut from the current `origin/cloud/combine` tips: Jini `3a86f98ba03380651c8bf64b8fc18c4f90a122fd`; Tovu `abead52498c80fd86b8f7b37a2caed31d98a7307`. No main/combined-branch push, force push, deployment or npm publication. Test data is synthetic.

## Delivered behavior and boundaries

Owner-only passkeys are an alternative second factor after password verification. Registration/removal require current owner password plus confirmed TOTP; TOTP and recovery remain the fallback. No passwordless discovery, member MFA, remembered devices or dashboard. Registration supports at most five credentials.

Jini owns ceremony decisions, ports, the SimpleWebAuthn adapter and reusable React controls. Tovu supplies SQL, trusted site/listener origin, HTTP admission and component mounting. Challenges reuse the existing MFA pending store, are sealed and bound to owner/workspace/purpose/origin/RP, expire after five minutes, and are single-use. Password and TOTP/passkey completion share the same identity transaction. Concurrent TOTP/passkey completion has one winner. Counter updates, challenge consumption, session creation and last-login timestamp roll back together.

User verification is required. SimpleWebAuthn verifies signatures, RP IDs, origins and counters, including legitimate zero counters. Only public keys, credential IDs, counters and RP IDs persist. No private keys persist. Request Host/Origin/forwarding headers never select the trusted origin. Local origin includes the actual listener port; RP ID remains the hostname across port changes. Browser support/cancellation errors retain authenticator/recovery fallback. Browser adapter loads only on an explicit passkey action; mutations use single-send requests.

One additive ADR-066 migration (`0041_owner_passkeys`) is registered in the TS history, pinned checksums, fresh SQLite bootstrap, generated schema/types and PostgreSQL head pins. Recovery and TOTP removal clear passkeys with factor/pending state. Ordinary password reset preserves enrolled factors/credentials and clears all password-created pending proofs. No timers or background polls.

## Dependency download measurement, before adoption

Registry tarball bytes, SHA-512 integrity checked for all 26 unique artifacts:

| Artifact | Direct compressed download | Including transitives |
| --- | ---: | ---: |
| `@simplewebauthn/server@14.0.3` | 121,672 B | 546,496 B |
| `@simplewebauthn/browser@14.0.0` | 42,879 B | 42,879 B |
| Combined | 164,551 B | 589,375 B |

Published browser full minified UMD: 13,473 B / 3,806 B gzip (level 9, deterministic timestamp); actual application tree-shaking can differ. Measured using isolated `npm install --package-lock-only --ignore-scripts --no-audit --no-fund`, tarball downloads/integrity verification and `gzip.compress(..., compresslevel=9, mtime=0)`. Evidence: `/workspace/work/passkeys-size/{measure.py,package-lock.json,download-sizes.json,browser-bundle-size.json}`. No vendor code was copied into core.

## Prerequisite gap found on the approved base

The base contained Jini TOTP services and Tovu MFA tables but did not bind Tovu MFA storage into password/boot login, management, reset or UI. An enrolled owner could receive a normal launcher/password session before a factor. This was a real prerequisite bypass, so this job supplies the missing thin host wiring. The new launcher regression fails on detached unmodified Tovu base `abead5249` and passes here. Reused Jini `beginOwnerLogin`, `beginPrincipalSignIn`, `completeOwnerLogin`, `TotpSettings` and `useLogin`; no second authentication framework.

## Review, integrity and cost

Architecture review: PASS for this change. Protocol crypto lives only in the Jini adapter; Tovu adds no protocol implementation. Public service/factory boundaries use required-object plus optional-object arguments. Existing identity locking, tokens, sessions, owner policy, sealing and admin diagnostic reporting are reused. Unexpected route faults go through existing redacted incident reporting; assertions, factors and codes are never logged. All new feature functions and changed authentication handlers pass complexity and cognitive-complexity ceiling 10, without disabling rules. Existing large composition functions retain the baseline violations listed below; their complexity did not increase.

Function review: ceremony/state service PASS (bounded O(n), n <= 5); library adapter PASS (bounded protocol input); browser/UI PASS (explicit action, cancellation guard, no polling); repository PASS (indexed queries, list capped at six rows for cap detection); transport PASS (trusted scope and 16 KiB registration / 8 KiB assertion limits). Adversarial evidence covers duplicate credential IDs/counter reset, cross-factor competition, concurrent proof reuse, wrong scope/purpose/origin/RP, missing UV, bad signatures, counter replay, expiry, replaced password proofs and persistence failure. A late browser response after cancelling MFA is discarded. Tests and checks were never skipped, disabled, weakened or deleted.

State cost, excluding existing identity transaction/lock overhead and host keyring lookups: enrollment begin <=5 fixed domain reads +2 writes; enrollment finish 3 reads +2 writes. Passkey-login begin adds 2 reads +1 pending write after the existing password transition. Successful finish uses 5 fixed reads +5 writes including existing session/last-login writes; one bounded credential list contains <=5 normal rows. Settings status is one credential-list read per mount/explicit refresh. Explicit recovery/TOTP removal adds one credential DELETE. No added poll/timer. Pending challenge envelopes are normally <1 KiB; credential public-key rows are bounded protocol material. Existing factor changes revoke O(s) owner sessions.

BUG FIXED: Base Tovu password/launcher login could bypass enrolled-owner MFA because its store was unbound.
BUG FIXED: Duplicate credential registration could reset an existing counter; server now rejects re-registration independently of browser exclusion hints (red test before fix).
BUG FIXED: Cancelling the MFA screen while a browser prompt was open could submit its late response; generation guard now discards it (red test before fix).
BUG FIXED: Passkey success omitted the existing last-login timestamp; it now updates atomically (red test before fix).
BUG FIXED: DOMException cancellation need not satisfy `instanceof Error`; name-based cancellation detection preserves the actionable fallback (red test before fix).

BUG OPEN (baseline): Four existing boot tests expect anonymous `details.failure` that the base's shared failure mapper deliberately strips: missing owner; disabled owner; member owner; minted session that Jini cannot validate. All four reproduce unchanged on detached base; assertions remain unchanged. Baseline evidence: `/workspace/work/passkeys-size/baseline-existing-boot-failures.log`.
LIMIT: Launcher pending MFA currently falls back to the normal Login screen and password re-entry, without granting a session. Packaged Electron WebAuthn compatibility remains a separate release check.
LIMIT: This is a paired-source delivery. A coordinated Jini release/adoption is still required for registry-only Tovu builds; publication/version adoption is outside this job. The normal release build correctly refuses local links; supported `build:local` validates this paired checkout.
MINOR FINDINGS: Tovu Login has two nested-ternary Sonar warnings; MFA/passkey SQL adapters have four nested-callback warnings; the pre-existing recovery failure mapper has one nested-ternary warning. No feature complexity ceiling failures remain. Large composition-root violations are unchanged from detached baseline: `createRouteDeps` 11; `createApp` 11; `composeSiteRouteDeps` 18 cyclomatic / 18 cognitive. No broad refactor was made.

## Verification (Node 24.22.1)

Commands run from `/workspace/Tovu` after `source /workspace/.tovu-build/env.sh`. Each Node test file was also run directly so real assertion counts, rather than only worker/file counts, were verified.

| Exact command | Result |
| --- | --- |
| `JINI_PACKAGES_DIR=/workspace/Jini/packages npm run link:jini` | Passed after rebuilt Jini. |
| `node_modules/.bin/tsc -p tsconfig.json --noEmit` | Passed. |
| `node_modules/.bin/tsc -p apps/admin/tsconfig.json --noEmit` | Passed. |
| `node_modules/.bin/tsc -p /workspace/work/passkeys/tsconfig-tests.json --noEmit` | Passed. Scratch config extends `tsconfig.tests.json`, selecting the seven new MFA/passkey server/storage/browser test files; no source/test exclusions were weakened. |
| `node --import tsx apps/website/src/features/identity/__tests__/passkeys.repo.dialects.test.ts` | 4 passed, SQLite and PGlite; ownership, counters, scope, rollback, upgrade/preservation. |
| `node --import tsx apps/website/src/features/identity/__tests__/mfa.repo.dialects.test.ts` | 4 passed, SQLite and PGlite. |
| `bash /workspace/.tovu-build/start-postgres.sh` then `node --import tsx apps/website/src/features/identity/__tests__/passkeys.real-postgres.test.ts` | 1 passed; two independent pools, one session winner, atomic rollback and recovery clearing. Isolated synthetic database removed afterward. |
| `node --import tsx apps/website/src/platform/db/migrations/__tests__/runner.postgres.test.ts` | 3 passed on real PostgreSQL, including migration races and literal head/table-count pins. |
| `node --import tsx apps/website/src/platform/db/migrations/__tests__/checksums.test.ts` | 4 passed. Existing pins unchanged; only new migration pin added. |
| `node --import tsx apps/website/src/platform/db/__tests__/schema-postgres-parity.test.ts` | 19 passed. |
| `node --import tsx apps/website/src/platform/db/sqlite/__tests__/integration/content-db-fresh.integration.test.ts` | 5 passed. |
| `UPDATE_DATABASE_TYPES=1 node --import tsx apps/website/src/platform/db/kernel/__tests__/database-types.test.ts` | 3 passed; generated types regenerated from database. |
| `node --import tsx development/scripts/generate-postgres-schema.ts` then `node --import tsx development/scripts/generate-postgres-schema.ts --check` | Generated PostgreSQL schema from SQLite declaration; drift check passed. |
| `node --import tsx apps/website/src/server/inbound/admin-http/__tests__/owner-passkey-routes.unit.test.ts` | 6 passed; trusted origin/port/RP, owner-session admission, input limits, rate limits and safe status. |
| `node --import tsx apps/website/src/server/inbound/admin-http/__tests__/owner-mfa-routes.unit.test.ts` | 5 passed. |
| `node --import tsx apps/website/src/server/inbound/admin-http/__tests__/owner-mfa-login.unit.test.ts` | 1 passed; real handler/Jini TOTP, pending/no cookie, proof reuse refusal, password reset invalidates TOTP and passkey proofs. |
| `node --import tsx apps/website/src/server/inbound/admin-http/__tests__/owner-recovery-routes.test.ts` | 6 passed after final recovery wiring/refactor. |
| `node --import tsx --test-name-pattern='an enrolled owner boot proof' apps/website/src/server/inbound/admin-http/__tests__/dev-auth-boot-owner.unit.test.ts` | 1 selected test passed; same new regression fails against detached base. Existing four failures listed above. |
| `CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium node --import tsx apps/website/src/server/inbound/admin-http/__tests__/owner-passkey-browser.integration.test.ts` | 1 passed; real registration/assertion, wrong origin/RP/challenge/signature, missing UV, counters including zero, changed local port. |
| `CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium node --import tsx apps/website/src/server/inbound/admin-http/__tests__/owner-passkey-http.integration.test.ts` | 1 passed; actual HTTP, SQL, sealer, TOTP setup, passkey browser ceremonies and cookies. No cookie before completed factor. |
| `npm --prefix apps/admin run test -- --run src/features/auth/__tests__/Login.unit.test.tsx src/features/auth/__tests__/use-login.hooks.unit.test.ts src/features/security/__tests__/Security.unit.test.tsx src/features/security/__tests__/RecoveryCodesCard.unit.test.tsx src/features/auth/__tests__/OwnerRecoverySignIn.unit.test.tsx` | 46 passed across 5 affected UI files. |
| `npm --prefix apps/admin run build:local` | Passed; normal `build` correctly refuses local Jini links. Existing large-chunk/unresolved-background warnings retained. |
| `git diff --check` | Passed. |

Ceiling checks used `node_modules/.bin/eslint --no-inline-config --rule '{"complexity":["error",10],"sonarjs/cognitive-complexity":["error",10]}'` followed by: `apps/website/src/server/inbound/admin-http/{dev-auth,owner-mfa-deps,owner-mfa-routes,owner-passkey-routes,owner-recovery-routes}.ts`, `apps/website/src/features/identity/{mfa.repo,passkeys.repo,wiring}.ts`, `apps/website/src/platform/db/migrations/0041_owner_passkeys.ts`, `apps/admin/src/features/auth/{Login.tsx,hooks/use-login.hooks.ts}`, `apps/admin/src/features/security/{RecoveryCodesCard,Security}.tsx`, `apps/admin/src/lib/{owner-mfa-api,owner-passkey-api}.ts`. Feature checks pass (seven minor warnings listed above). Broad composition-file lint remains baseline-red with the identical four existing violations above; detached-base comparison used the same rule and files. No rule was disabled.

Routine logs and scratch config: `/workspace/work/passkeys/`. Baseline evidence and exact prerequisite commands: `/workspace/work/passkeys-size/ledger.md`. No full application test suite was run; full suites remain for the coordinated final run.

## Function-quality disposition

| Unit | Disposition | Evidence / remaining finding |
| --- | --- | --- |
| Enrollment/login state service | PASS | Single-use and scope guards; high-priority counter-reset bug fixed; atomic login timestamp fixed. |
| WebAuthn adapter | PASS | Library owns crypto, required UV and counters; real Chromium negative cases pass. |
| Browser/UI actions | PASS | Late-cancellation and DOMException bugs fixed; no retained setup proof after cancel; no poll. |
| SQL adapter | PASS | Indexed, bounded queries; ownership/rollback/race tests pass; minor callback style warnings remain. |
| Host admission/configuration | PASS | Trusted origin/port, owner-only management and payload/rate limits; baseline composition complexity listed separately. |

Pre-completion review rechecked the active D2 scope, emitted package exports, actual HTTP/browser no-cookie-before-factor path and test integrity. Runtime self-validation PASS on synthetic HTTP/SQL/Chromium fixtures; packaged Electron remains an explicit release limit. No source changes remain outside the job/prerequisite boundary. No coverage percentage was claimed; security outcomes are directly asserted. Full suites remain deferred per the job.

## Commit inventory

Jini `cloud/passkeys`:

- `bd85337d7c486b5339c7cfc5920bce50645a14c1` — docs(passkeys): record scope, base and dependency measurements
- `8fe9899948053ba77f75b2c0365f9d0685f9efd6` — feat(identity): add owner passkey ceremonies behind MFA ports
- `e958d835a73fe78781b65cf3cc788a0cbbf458dc` — feat(identity): add lazy browser passkey controls and cancellation guards
- `168eb3adfb0eca9a0e2eb831bc490476ed1faac6` — fix(identity): preserve login metadata and browser cancellation errors

Tovu `cloud/passkeys`:

- `7f97eb6f051cf9dfd104e09c92c77334248ca8d6` — feat(identity): bind owner MFA to password and launcher sign-in
- `220570778a9cef7c7c54c92c8ee814d88c032418` — feat(identity): persist scoped public passkey credentials
- `883846c4a23f1cb9d5f8e9e66cfab4387a21ba97` — feat(identity): wire owner authenticator settings and pending login UI
- `457d8848ea50699a9fa9c1f0cd88b80527d5cc4c` — test(identity): verify pending owner login and MFA admission
- `e7b0ca29d53f6389c7456e0070cb277b8c1bc567` — fix(identity): pass factor proof when rotating owner recovery codes
- `d413b27d91591472ef4ffd263dd99a4ff785cf44` — test(identity): reject pending TOTP and passkey proofs after password reset
- `7f3f4390de60bf18f49baea5a7f84ae711bbc645` — feat(identity): wire passkey routes and owner UI with trusted origins
- `fa553c37950587c9504b7c7589adf6d92099384a` — test(identity): verify passkey races and recovery on real PostgreSQL
- `c4c1c248d1020bb0517cb418f7d2e34ca2c5cbb5` — test(identity): exercise passkeys through real HTTP and Chromium
- `945e7faac3d47195e55492522c2146450b3dca49` — fix(identity): keep MFA host changes within the complexity budget

Final report commits follow this implementation inventory. Pushes use pull/rebase first and never force.
