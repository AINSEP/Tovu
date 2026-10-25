# F1 — Jini security (Stryker L1) + daemon (Stryker L8) fix wave — INTERIM (step 6 re-score running)

Started 21:34 UTC. Jini branch `cloud/fixwave-1025-F1` (from `origin/cloud/overnight-1024-jini` @ 3e2fbae8). Pushes to Jini succeeded (no 403).
Baseline on the unmodified tree (Node 24.22, vitest 2.1.9): daemon 153 files / 3562 tests green; platform 1 red (stale pin, see §2).

## 1. Headline (interim)
- **Source bugs found: 0.** No mutation-revealed product bug. One test-tooling bug root-caused (the sqlite "0 % no-coverage" anomaly, §2.1) and two red/unsafe tests fixed (§2.2, §2.3).
- **Tests added:** daemon 3562 → 3822 (+260); user-management → 1144 total; oauth → 745; platform → 2840 (+ new files listed in §6). All four packages green.
- **Coverage (vitest v8) of the 34 targeted non-UI source files:** 31 → 33 at 100 % lines+branches (run-lifecycle.ts and passphrase-envelope.ts closed to 100 % by new tests). Still < 100 %: `daemon/src/agent-executor/launch.ts` 99.86 % lines / 99.52 % branches (line 1205: the relay fallback `sendUserMessage` for non-stdin formats, only reachable through a live spawned child — not attempted).
- **CCN > 10 in scope: 3 → 0** (`message-relay.ts` claim handler 11, `launch.ts` `settingsBuildOptions` 11, `wireRunInput` 11 / cognitive 13). Behaviour-preserving extractions; daemon suite 3822/3822 green after.
- **Stryker:** see §3 — before numbers from L1/L8 tables; after numbers being measured now.

## 2. Findings (top: none are product bugs)
1. **Stryker sqlite.ts "0 %, 112 NoCoverage" = harness bug, not missing tests.** `packages/daemon/vitest.config.ts` builds its sibling-package aliases with `new URL('../', import.meta.url)`. Inside Stryker's sandbox (`packages/daemon/.stryker-tmp/sandbox-*/`) that points at `.stryker-tmp/`, so `@jini-ai/db/sqlite` cannot be resolved, vitest's `related` graph drops every test that imports `store/event-log/sqlite.ts`, and all its mutants read NoCoverage. With an untracked `vitest.stryker.config.ts` using absolute sibling paths, **sqlite.ts 0 % → 90.18 %** with no test change, then higher with F1 tests. vitest coverage of the file was already 100 %. Suggested permanent fix (not done; config change outside test scope): resolve the sibling root from `process.env.JINI_PACKAGES_DIR ?? new URL('../', import.meta.url)`. **Any other L8 file that imports through those aliases was under-measured the same way.**
2. `platform/src/secrets/__tests__/exports.test.ts` was RED on the base branch (pinned `@jini-ai/core ^0.6.11`, package is `^0.6.12`). Now asserts `^${core version}`.
3. `platform/src/__tests__/sandbox-env.test.ts` "disabled no-op" used `/should-not-be-touched` at the fs root (a mutant leaked that dir onto the L1 host). Now a fresh tmp parent; asserts every runtime root absent.
4. Near-miss worth knowing (not a bug today): `remote-run-events.ts:93` `presented === null` is load-bearing only because `TextEncoder.encode(null)` is `"null"` — a token literally `"null"` plus a missing header would otherwise authenticate. Pinned by a test.

## 3. Per-file table (Stryker score before → after; after = pending)
| file | before (L1/L8) | after |
|---|---|---|
| daemon http/remote-run-events.ts | 77.3 | 99.48 (interim run) |
| daemon run-credentials.ts | 96.7 | 99.59 (interim run) |
| daemon store/event-log/sqlite.ts | 0.0 (anomaly) | 90.18 (config fix only) |
| … | | pending |

## 5. NOT done (so far)
- aws-sigv4 vectors, mail/feedback + smtp boundaries, fs/guarded-reader corpus, oauth refresh/device-code/registration-cache, download.ts (L1 §8 #6, #10 remainder).
- L8: agent-executor events.ts SIGKILL guard / live-session-state / mcp-bridge / legacy-data-migration; tool-executor truncation boundary.
- Permanent vitest-config fix for the Stryker sandbox (§2.1).
