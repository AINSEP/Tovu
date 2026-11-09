# EXTRACT-S5 — plugin extraction session 5 (H0 → H1a → H1b → H2 → H3 → C-c)

Owner-approved by name 2026-11-08. Builder: Claude Code coordinator + one Opus subagent per batch (owner change to the Codex brief). The brief/plan are kept outside tracked source and are not committed.

## Timing (UTC)

- Start: 2026-11-09T06:10:31Z
- Hard deadline (270 min): 2026-11-09T10:40:31Z
- Shutdown reserve begins (no new batch): 2026-11-09T10:20:31Z
- Coordinator token cap: 1.9M total across coordinator + subagents

## Pins and branches

| Repo | Base pin (verified full SHA, = origin/cloud/extract-s3) | Branch |
|---|---|---|
| AINSEP/Tovu | c3801c833a191be51753dcdecd133b0cad6f8945 | cloud/extract-s5 |
| AINSEP/Jini | 4044fe3c0fa34b1f903c5d20a6b4de7714cde573 | cloud/extract-s5 |

XP3 original declaration base: 35c4961af718f0f30591c46d2ea2756c4484a731 (= origin/cloud/extract in Jini).
No cloud/extract-s4 branch existed on either remote at start (06:11Z). No untracked residue dirs under Jini packages/plugin-* at start (every dir has package.json).

## Setup

Node v24.2.0 (nodejs.org tarball, ~/.local/node24), npm 11.3.0, pnpm 10.33.2 (corepack).
Jini: `CI=true pnpm install --frozen-lockfile` EXIT 0; `pnpm --filter @jini-ai/core run build` EXIT 0; `pnpm --no-bail -r build` EXIT 0.
Tovu (after Jini build): `npm ci` EXIT 0; `npm run build --workspace @tovu/sdk` EXIT 0; `JINI_PACKAGES_DIR=/home/user/Jini/packages npm run link:jini` EXIT 0 (links every @jini-ai package to the S5 Jini tree, was installed-copy); `npm --prefix packages/contracts run build` EXIT 0; `npx tsc -p tsconfig.json --noEmit` EXIT 0, 0 errors.
Scratch worktrees: base/{Jini,Tovu} at the S5 pins (H0 rollback baseline; frozen install + builds EXIT 0); xp3-orig/Jini at the ORIGINAL pin 35c4961af718f0f30591c46d2ea2756c4484a731 (frozen install, core build, recursive build EXIT 0, tracked tree clean).

## Coordinator progress log

| UTC | Elapsed (min) | Event | Coordinator+subagent tokens (approx) |
|---|---|---|---|
| 06:10 | 0 | start, pins verified, branches created | — |

## Baseline (setup, guard, XP3, named tests)

Measured 2026-11-09 06:15–06:30Z at the UNMODIFIED pins (Jini tree = 4044fe3c0; Tovu production/test tree = c3801c833 plus only this report and the H0 builder's new fixture files from 31504fd7, none of which any named test imports). Measurement only: no production or test edits. Raw output is kept as .txt in the cloud scratch area (not committed).

### Guard (personally read, full stdout+stderr)
- `pnpm guard` raw EXIT 1. Printed TOTAL "2 guard violation(s).", exactly the expected two, by name and location:
  - `R2-deep-path` packages/plugin-catalog/scripts/generate.ts (relative import reaches agent-plugins/src)
  - `R10-chatpane-public-surface` packages/chat/src/react/features/chat-pane/components/ChatPane.tsx ("Icon" not in the public barrel)
  - No N1 finding, no other rule. R13-model-fallback-freshness is informational only (6 stdout lines: claude MF3 compared 16 live ids with 20 fallback entries; codex/agy MF3 skipped because the CLIs are absent; pi/aider/opencode MF3 not applicable).
  - HW summary: HW1:17 HW2:16 HW3:135 HW4:1 HW5:0 HW6:0 HW7:0 HW8:49 HW9:0, every rule "0 new".
  - Self-test passed: guard.ts exits before running any check when the self-test fails, and the separate driver's `runGuardSelfTest()` returned 0 failures.
- `pnpm guard:plugins` raw EXIT 0, no findings.
- Exported checks run through the installed tsx loader (node_modules/tsx/dist/loader.mjs, tsx 4.23.1) with a scratch driver that calls the functions and logs what they return: `checkPackageLayers` 0 findings; `checkSubpathIsolation` 0 findings; `auditSubpathIsolation` 573 closures and 16 audit findings (SI-c 9, SI-d 7). The SI audits match the brief's SI-c9/SI-d7 and do not fail the guard.
- Reusable gate script: it reruns all three, keeps the raw output, and compares every rule and location, the TOTAL, the HW counts and the SI audit lines against this baseline. Any N1 or other unknown rule or location fails it. It was negative-tested: a fabricated N1 line was flagged, and so was a TOTAL mismatch.

### XP3 immutable ORIGINAL declaration snapshot
- Writer: the S5 tree's scripts/check-no-cross-package.ts (blob d5d30609cb19, sha256 c0ad14077a98…), run by absolute path from a clean scratch worktree at the ORIGINAL pin **35c4961af718f0f30591c46d2ea2756c4484a731**. That worktree had a frozen install, a core build and a recursive build, all EXIT 0, and 0 tracked modifications. Nothing was copied into the old tree. The command was `node --import <s5-jini>/node_modules/tsx/dist/loader.mjs <s5-jini>/scripts/check-no-cross-package.ts --base 35c4961af718f0f30591c46d2ea2756c4484a731 --write-baseline <scratch>/declaration-baseline` and it exited 0 with "3308 source mappings".
- Counts: 3308 source mappings, 3320 declaration files, 3321 files including manifest.json. manifest.base = 35c4961af718f0f30591c46d2ea2756c4484a731.
- manifest.json SHA256 **d836eba0b0e29efb9fe2e79f8a1c2f61655190008d70e74c0c86ae518728d459**. Whole-snapshot SHA256 (sha256 of the sorted per-file sha256 list) **08b79774e4c55f4288f682316eefe4ea077317da8f855d2e854f3606bc987048**.
- Made immutable: chmod -R a-w, plus chattr +i, because the container runs as root and root can write through a-w. After that, writes fail with "Operation not permitted" and the hash re-verifies.
- S5 tree `JINI_DECLARATION_BASELINE_DIR=<snapshot> pnpm check:cross-package` (the script passes `--base 35c4961af`): EXIT 0, "check:cross-package: XP1–XP5 clean". A gate script checks the snapshot base, the manifest hash and the whole-snapshot hash before every run.

### Tovu typechecks
- Main `npx tsc -p tsconfig.json --noEmit`: EXIT 0, 0 errors.
- `npm run typecheck:tests` (tsconfig.tests.json): EXIT 2 with **13 errors, not the 12 the brief lists**. The 12 listed errors are exact: external-mcp-connection-source.operator-read-only 42,27 TS2551; import-local.integration ×8 (27,16 28,32 30,40 31,40 33,35 35,13 35,119 45,30) TS18047; set-enabled-confirmation-ui.unit 41,266 TS2353; site-imports.integration 70,9 TS2741; agent-plugin-token-boot-order.unit 72,78 TS2561. **The extra prior error** is features/api-connections/__tests__/surface-connections.host-port.unit.test.ts(15,5) TS2322: the stub record lacks the required `staged` property of AdminSurfaceConnectionRecord. That file arrived in S3 commit 1ef11e22. It is prior test-typing debt and was not fixed.

### Named tests at the unmodified pins
Every brace list in "Named regressions" was expanded: 70 paths in total (50 T files, with connect-tool.api-connections listed in two groups, and 20 J files) plus J examples/neutral-host/src/api-host-moves.test.ts. Every path exists, so no corrections were needed. The T command is exactly the brief's, with `--test-concurrency=1`. The J command is `pnpm --filter @jini-ai/integrations exec vitest run <files> --maxWorkers=2 --minWorkers=1` (filter name confirmed from the package.json). Per-file counts come from one-file reruns of the same command, and their sums equal the group totals. No named test is a desktop test, so build:preload was not needed.

| Group | Files | Tests | Result |
|---|---|---|---|
| T store/vocabulary | 12 | 284 | all pass, EXIT 0 |
| T sign-in/gate | 7 | 142 | **141 pass / 1 fail, EXIT 1** |
| T API/token | 16 | 156 | all pass, EXIT 0 (connect-tool.api-connections.unit 12/12) |
| T connect | 6 | 147 | all pass, EXIT 0 |
| T accumulated nine | 9 | 58 | all pass, EXIT 0 |
| J integrations api-connections + token-store | 20 | 365 | all pass, EXIT 0 |
| J examples/neutral-host api-host-moves | 1 | 2 | pass, EXIT 0 |

**A required baseline test is red: prior Tovu test drift, not fixed.** T server/runtime/composition/__tests__/external-mcp-oauth-loopback-wiring.unit.test.ts has 3 cases and 2 pass. The failing case is `../../../inbound/assistant/agent-daemon-server.ts: desktop accepts a loopback OAuth callback; hosted requires HTTPS`, which fails with AssertionError "../../../inbound/assistant/agent-daemon-server.ts must have one OAuth ports call" (0 !== 1). The test scans that file's source for exactly one `createTovuOAuthHttpPorts(...)` call. At the pin there is none in server/inbound/assistant/agent-daemon-server.ts; the only composition calls are composition/app.ts:1159 and deps.ts:2180. agent-daemon-server.ts was last changed in 6331ff2e (2026-11-04) and the test in b389d729 (2026-11-03). The app.ts and deps.ts cases pass.

Earlier-debt items the brief names that are not in the named groups (T plugin-host-bundled-identity, J UI sign-in-card AbortSignal.any) were not run at this baseline.

### Hashes (sha256, at baseline)
- T assistant/__tests__/fixtures/tool-metadata.baseline.json **a0d6b428be4ea369f6abdf70a9892f0ce13db651ac4ac560e43dc2993fa2a0b6**, which matches the brief.
- moved-tools.golden.json 3583bc14fa8c596d64a2e97a274166f87a0ea278aed3f8c12b926552b7fc5f66; moved-tools.access-token.golden.json 61e018a56d59eee3a4b44055136c9a7c6144c5a6b13a948c8f90ebb8b14ca16e; moved-tools.credential-cards.golden.json 3eb3766de97c9d6699507fbda53b29ec63babd0af1d6381611ee907da4a2fa01; server/runtime/boot/__tests__/fixtures/mail-send.golden.json f0733d6176cd0d2fc92a9181d342c9ff9480f0d505f7c5e1dc8330d3f48a4be3; server/runtime/composition/__tests__/fixtures/cost-counters.baseline.json 2be1488c8e4556b71b759536dccac88c78612a22200aa6843748f62cb78e736c.
- A full list of 25 files (every file in the T assistant, boot and composition `__tests__/fixtures` dirs, plus the J api-connections test fixtures) is kept in scratch, and `sha256sum -c` on it passes on both trees.
