# F1 — Jini security (Stryker L1) + daemon (Stryker L8) fix wave — REPORT

Jini branch **`cloud/fixwave-1025-F1`**, head **`d6def36f07db8c29c9860f126a4211a2274a2f93`**. It was cut from `origin/cloud/overnight-1024-jini` @ 3e2fbae8. 43 commits, all pushed; no Jini push was refused, so there are no patch files. Run: 21:34 → 23:45 UTC.

## 0. SOURCE BUG (top)
**`platform/src/aws-sigv4.ts` signed a mixed-case header with an empty value.**
- **What was wrong.** `signSigV4` lower-cased the header keys for the canonical list. It then looked each value up by the already-lower-cased key, on both sides of the `??`. So `{ Host: 'x' }` was signed as `host:` with an empty value. That gives a wrong signature (AWS would refuse it), or a duplicate signed header when both spellings are present. The one caller in the repo (`blob-storage.ts`) passes lower-case keys, which matches the documented contract, so it was never affected. Any external caller passing `Host` / `Content-Type` was.
- **Failing test:** `b921a100` `src/__tests__/aws-sigv4.f1.test.ts`. I confirmed it was red before the fix.
- **Fix:** `d951a507`. Each value is now read through its original key before lower-casing. Lower-case input produces the same signatures as before: the aws-sigv4 and blob-storage suites pass 173/173, and the file is at 100 % lines and branches.

No mutation run surfaced any other product bug.

## 1. Headline
- **Tests (final run on head `d6def36f`, all green):**

  | package | final count | change |
  |---|---|---|
  | daemon | **3844** | was 3562 on the untouched base (+282) |
  | platform | **2893 pass / 6 skip** | base had 2742 pass + 1 RED (+151, and the red pin is fixed) |
  | oauth | **761** | no untouched-base count recorded |
  | user-management | **1145** | no untouched-base count recorded |

  For oauth and user-management, F1 test files are listed in §6.
- **Source bugs:** 1 found and fixed (§0). One measurement bug was root-caused (§2.1). Two red or host-unsafe tests were fixed (§2.2, §2.3).
- **Files at 100 % lines+branches (vitest v8), out of 35 targeted non-UI files** (34 + aws-sigv4): **31 → 34**. The one still short is `daemon/src/agent-executor/launch.ts`: 99.86 % lines, 99.52 % branches. The gap is line 1205, the relay fallback `sendUserMessage` for non-stdin formats. It can only be reached with a live spawned child, and I did not attempt it.
- **Functions over CCN 10 in scope: 3 → 0.** They were `message-relay.ts`'s claim handler, and `settingsBuildOptions` and `wireRunInput` in `launch.ts`. I split each by pure extraction, with no behaviour change (`0e836878`). The daemon suite was green before and after: 3822/3822 at that point. A cognitive-complexity scan (sonarjs, warn at 10) reports nothing in scope.
- **Stryker, 35 files:** in aggregate, daemon set 87.7 → **92.5 %**, oauth set 86.5 → **94.8 %**, user-management set 91.2 → **96.1 %**, platform set 90.2 → **95.2 %**. Per-file numbers are in §3.
- **Spend:** wall ≈ 2 h 10 m. Tokens ≈ 0.55M (rough). No subagents.
- **`pnpm guard`:** 104 violations on this branch against 110 on the untouched base. All are pre-existing (vibecoding, mcp, chat-pane and similar), and none are in F1 files.

## 2. Findings
1. **Stryker reported L8 `store/event-log/sqlite.ts` at "0 %, 112 NoCoverage". That was a harness bug, not missing tests.**
   - **Cause.** `packages/daemon/vitest.config.ts` builds its sibling aliases with `new URL('../', import.meta.url)`. Inside `.stryker-tmp/sandbox-*` that path points at `.stryker-tmp/`, so `@jini-ai/db/sqlite` cannot be resolved. Vitest's `related` graph then silently drops every test that imports the file.
   - **Evidence.** With an untracked config using absolute paths (copy in `data/daemon.vitest.stryker.config.ts`), sqlite.ts went **0 → 90.18 %** with no test change, then to 94.64 % with the F1 tests. Its vitest coverage was already 100 %.
   - **Wider impact.** Every L8 file reached through those aliases was under-measured the same way. Any later Stryker lane on daemon needs this config.
   - **Suggested permanent fix (not done; it is a config change):** resolve the sibling root from `process.env.JINI_PACKAGES_DIR` before falling back to the relative URL.
2. **`platform/src/secrets/__tests__/exports.test.ts` was red on the base.** It pinned `@jini-ai/core ^0.6.11` after core released 0.6.12. It is now `^0.6.12`. My first version read `../core/package.json` instead, but that broke inside Stryker sandboxes the same way as §2.1, so I reverted it to a literal pin.
3. **`platform/src/__tests__/sandbox-env.test.ts` could write to the host filesystem root.** Its "disabled no-op" case used `/should-not-be-touched`, which an L1 mutant created on the host. It now uses a fresh tmp parent and asserts that every runtime root is absent.
4. **Near miss, pinned by a test:** `remote-run-events.ts:93` `presented === null` is the only thing stopping a missing header from authenticating against a token that is literally `"null"`. Without it, `TextEncoder.encode(null)` produces the bytes of `"null"`, which would match.
5. **Unexplained survivor:** `user-management core/permissions.ts:38` (`id === "*"` → `true`) survives even though a test now registers `*.read` and expects success. It is probably static-mutant handling for module-load code. I did not investigate further.

## 3. Per-file table (Stryker; before = L1/L8 tables; after = final F1 run; coverage = vitest v8 lines/branches after)
| file | before | after | cov L/B |
|---|---|---|---|
| daemon http/remote-run-events.ts (**MUST**) | 77.3 | **99.48** | 100/100 |
| daemon run-credentials.ts (**MUST**) | 96.7 | **99.59** | 100/100 |
| daemon store/event-log/sqlite.ts (**MUST**) | 0.0 (anomaly) | **94.64** | 100/100 |
| daemon http/message-relay.ts | 69.6 | 98.44 | 100/100 |
| daemon http/run-credentials.ts | 93.2 | 100 | 100/100 |
| daemon session-coordination.ts | 90.7 | 94.04 | 100/100 |
| daemon tokens.ts | 0.0 | 100 | 100/100 |
| daemon scheduler.ts | 22.2 | 100 | 100/100 |
| daemon run-lifecycle.ts | 88.0 | 92.27 | 100/100 |
| daemon event-log.ts | 92.1 | 92.98 | 100/100 |
| daemon delegated-result-correlation.ts | 72.7 | 94.95 | 100/100 |
| daemon tool-result-diagnostics.ts | 63.3 | 88.99 | 100/100 |
| daemon agent-executor/launch.ts | 89.2 | 89.49 | 99.86/99.52 |
| daemon routines/schedule.ts | 84.1 | 87.32 | 100/100 |
| daemon routines/scheduler.ts | 77.5 | 91.91 | 100/100 |
| daemon close-status.ts | 84.6 | 88.46 | 100/100 |
| daemon tool-recovery/redaction.ts | 94.3 | 96.55 | 100/100 |
| um server/admin-crud-service.ts | 94.3 | 96.02 (seeded-owner guard 345/347 killed) | 100/100 |
| um server/authorize.ts | 95.7 | 100 | 100/100 |
| um server/grant-service.ts | 94.1 | 97.31 | 100/100 |
| um core/permissions.ts | 78.6 | 85.71 (§2.5) | 100/100 |
| um server/agent-tools.ts | 89.4 | 100 | 100/100 |
| um server/repo.memory.ts | 83.9 | 92.19 | 100/100 |
| um server/hasher.ts | 87.5 | 93.75 | 100/100 |
| oauth authorization-code.ts | 90.5 | 97.30 | 100/100 |
| oauth endpoint-safety.ts | 91.8 | 95.92 | 100/100 |
| oauth oidc.ts | 69.4 | 92.59 | 100/100 |
| oauth token-endpoint.ts | 86.5 | 90.99 | 100/100 |
| oauth loopback-receiver.ts | 92.0 | 96.00 | 100/100 |
| platform http/guarded/client.ts | 96.2 | 96.95 | 100/100 |
| platform net/endpoint-policy.ts | 90.5 | 93.64 | 100/100 |
| platform sandbox-env.ts | 88.3 | 91.49 | 100/100 |
| platform secrets/credential-token.ts | 87.7 | 96.30 | 100/100 |
| platform secrets/passphrase-envelope.ts | 91.0 | 96.99 | 100/100 |
| platform aws-sigv4.ts (bug fix) | 73.3 | not re-scored | 100/100 |

Not re-scored: platform `mail/smtp.ts` and `mail/feedback.ts`, `fs/guarded-reader.ts`, `aws-sigv4.ts`, and oauth `refresh.ts`. Those tests landed after the platform re-score, and I did not run a further pass. Same Stryker config as L1/L8: vitest runner, `perTest`, `StringLiteral` excluded, type checks off, concurrency 3, `--force`, cwd = the package. Judged equivalent and left alone: the second `frame-limit`/`dropping` guards (the notice comes out either way), the `count >= cap` eviction (it splices 0), `unref` guards, `?.` on always-defined callbacks, the sandbox `trim` (the URL parser trims anyway), and IPv4-regex `^` anchors (the URL parser rejects those hosts).

## 4. Anti-patterns seen most (for AI Dev Shop)
1. **AP1 bare failure:** status-only negatives (`ok:false`, `toHaveBeenCalledWith(401)`), most of all in daemon http and the oauth error paths. They are killed by asserting the full error body.
2. **AP7/AP8 guards hidden by another guard:** the seeded-owner check was unreachable from the "non-owner manager" test, because `assertOwnerTargetMayBeModified` refuses first. Only a *second owner* reaches it. Write each guard's negative test so that it gets past every earlier guard.
3. **AP3 type-blind input:** `toHaveBeenCalledWith({})` also matches `{contextRef: undefined}`. When the absence of a key matters, assert `Object.keys(...)`.
4. **AP2 singleton or one-direction comparisons:** a malformed input checked only against the canonical form can never fail. Record the malformed form, then check both directions (malformed ≠ canonical, malformed = itself).
5. **Harness:** a vitest config that resolves sibling packages relative to itself makes Stryker report "no coverage" silently (§2.1). Each sandbox report should check the dry-run test count against the expected suite.

## 5. NOT done
- launch.ts line 1205 (needs a live child process); its remaining 71 survivors were not triaged.
- L8 items left: agent-executor `events.ts` (SIGKILL guard), `live-session-state.ts`, `mcp-bridge.ts`, `legacy-data-migration.ts`, and the tool-executor truncation boundary.
- L1 items left: oauth `device-code.ts` and `registration-cache.ts`, platform `download.ts`, `terminal.ts`, `process.ts` and `proxy-env.ts`. user-management controller generation counters and react hooks (UI, outside non-UI scope).
- A Stryker re-score of the late platform and oauth test files (§3 note).
- The permanent vitest-config fix for Stryker sandboxes (§2.1).

## 6. Commits (Jini `cloud/fixwave-1025-F1`, oldest → newest)
e979d54d 815d7fc0 0893f31d a37a8cd5 1e8aa806 5cd71a79 6055ee50 53786475 9b0c1764 07773c98 fc1107f2 fb01b77f c2d8a357 70118694 176a3cfd 2c63ca4e ce557329 27d5b44f ffc4fd00 c7d44b8f 688aa44a e409fccf a76c4194 a3300807 4094af50 7d88b4f9 c1e05d9e b2f3458d 4114d870 0755b5b1 d6ae5948 a2dde7d0 **0e836878 (CCN refactor)** 23d0cd5b df4496e9 ff3715d3 986e14d5 bda31053 1fabd179 **b921a100 (failing test) d951a507 (SigV4 fix)** + smtp/feedback/guarded-reader/refresh test commits → head **d6def36f**.
F1 test files (new): daemon `run-credentials.f1-guards`, `session-coordination.f1`, `tokens-and-scheduler.f1`, `run-lifecycle.rehydrate.f1`, `event-log.f1`, `tool-result-diagnostics.f1`, `close-status.f1`, `store/event-log/__tests__/sqlite.f1`, `routines/__tests__/{schedule.f1-dst,scheduler.f1}`, `tool-recovery/__tests__/redaction.f1`; um `grant-service.f1-wildcard`, `agent-tools.f1-contract`, `repo.memory.f1-isolation`, `hasher.f1-defaults`; oauth `authorization-code.f1-guards`, `oidc.f1-config`, `token-endpoint.f1`, `refresh.f1`; platform `endpoint-policy.f1-expand`, `credential-token.f1-detect`, `passphrase-envelope.{f1-parse,f1-kdf-error}`, `aws-sigv4.f1`, `mail/smtp.f1-classify`. Existing files were extended as well.

F1 DONE 2026-10-25T23:45Z — wall ≈ 2 h 11 m, ≈ 0.55M tokens (rough).
