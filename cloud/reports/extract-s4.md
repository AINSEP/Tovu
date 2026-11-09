# EXTRACT-S4 — plugin extraction session 4

Status: setup and unmodified baseline recorded. No source code changed in this step.

## Header

| Item | Value |
|---|---|
| Job | EXTRACT-S4 (S4-0 → A8 → A9 → A10 → A11 → C-b evidence) |
| Tovu base | c3801c833a191be51753dcdecd133b0cad6f8945 (== origin/cloud/extract-s3 at 06:12Z) |
| Jini base | 4044fe3c0fa34b1f903c5d20a6b4de7714cde573 (== origin/cloud/extract-s3 at 06:12Z) |
| XP3 original base (Jini) | 35c4961af718f0f30591c46d2ea2756c4484a731 (committed 2026-11-07T21:25:16Z) |
| Branches | cloud/extract-s4 in both repos, created with `git switch -c cloud/extract-s4 <base>` from clean trees (previous local branch claude/hopeful-edison-tbopc0, nothing discarded) |
| Remote check before first push | `git ls-remote origin refs/heads/cloud/extract-s4` empty in both repos. cloud/extract-s5 already existed: Tovu a6e2921d0952cab53218a38d28ef79b387a3dee1, Jini 4044fe3c0fa34b1f903c5d20a6b4de7714cde573 (not touched) |
| UTC start / deadline | 2026-11-09T06:11:23Z / 2026-11-09T10:11:23Z (no new batch after 09:51:23Z) |
| Setup step | 06:15Z–06:35Z (elapsed at baseline commit about 24 minutes) |

## Tool versions

| Tool | Version | Location |
|---|---|---|
| Node | v24.2.0 (nodejs.org tarball, SHASUMS256 verified) | ~/.local/node24/bin/node |
| npm | 11.3.0 (bundled with Node 24.2.0) | ~/.local/node24/bin/npm |
| pnpm | 10.33.2 (corepack, matches Jini `packageManager`) | ~/.local/node24/bin/pnpm |
| tsx loader used by checker | tsx@4.23.1 | /home/user/Jini/node_modules/.pnpm/tsx@4.23.1/node_modules/tsx/dist/loader.mjs |

Caches outside source trees: COREPACK_HOME=~/.cache/corepack, npm_config_cache=~/.cache/npm, pnpm store-dir ~/.cache/pnpm-store (global pnpm config), PNPM_HOME=~/.cache/pnpm-home.

## Setup commands and exits

Jini (cwd /home/user/Jini), in order:

| Command | Exit | Raw |
|---|---|---|
| `CI=true pnpm install --frozen-lockfile` | 0 | j-install.txt |
| `pnpm --filter @jini-ai/core run build` | 0 | j-core-build.txt |
| `pnpm --no-bail -r build` | 0 | j-build.txt |
| `pnpm guard` | 1 (expected record, below) | j-guard.txt |
| `pnpm guard:plugins` | 0 | j-guard-plugins.txt |
| layers/isolation audit (S3 C20 command, see STATE) | 0; `{"layers":[],"isolation":[],"SI_c":9,"SI_d":7}` | j-layers-isolation.txt |
| `pnpm exec tsc -p scripts/tsconfig.json --noEmit` | 0 | j-scripts-tsc.txt |
| `pnpm --filter @jini-ai/{agent-plugins,integrations,platform,ui} exec tsc --noEmit` | 0 each | j-tsc-*.txt |
| `JINI_DECLARATION_BASELINE_DIR=<snapshot> pnpm check:cross-package` | 0; `check:cross-package: XP1–XP5 clean` | j-check-cross-package.txt |

Tovu (cwd /home/user/Tovu), after Jini build:

| Command | Exit | Raw |
|---|---|---|
| `npm ci` | 0 | t-npm-ci.txt |
| `npm run build --workspace @tovu/sdk` | 0 | t-sdk-build.txt |
| `JINI_PACKAGES_DIR=/home/user/Jini/packages npm run link:jini` | 0 (68 links changed) | t-link-jini.txt |
| `npm --prefix packages/contracts run build` | 0 | t-contracts-build.txt |
| `npx tsc -p tsconfig.json --noEmit` (main) | 0 | t-tsc.txt |
| explicit pin `npx tsc --noEmit --target ES2022 --module nodenext --moduleResolution nodenext --strict --esModuleInterop --skipLibCheck --types node apps/website/src/contracts/core/__tests__/provider-setting-field.typecheck.ts` | 0 | t-pin-provider-setting-field.txt |
| `npx tsc -p tsconfig.tests.json --noEmit` (broad test tsconfig, default heap) | 134 (V8 heap out of memory at about 2 GB, no diagnostics) | t-tsc-tests-oom-default-heap.txt |
| `NODE_OPTIONS=--max-old-space-size=8192 npx tsc -p tsconfig.tests.json --noEmit` | 2; 13 errors (see Known reds) | t-tsc-tests.txt |

Both working trees stayed clean after every build/link/test (only this report and raw files are new).

## Guard baseline (full raw output read and verified)

Raw `pnpm guard` exit 1, 25 lines in total, summary line `2 guard violation(s).`

| Family | Finding / count | Record in brief | Match |
|---|---|---|---|
| R2-deep-path | 1: packages/plugin-catalog/scripts/generate.ts | R2(1) same file | yes |
| R10-chatpane-public-surface | 1: packages/chat/src/react/features/chat-pane/components/ChatPane.tsx | R10(1) same file | yes |
| R13-model-fallback-freshness | 6 informational lines (claude MF3 compared 16 live ids vs 20 fallback entries; codex/antigravity MF3 skipped, CLI absent; pi/aider/opencode MF3 not applicable) | informational | yes |
| HW1-env-default | 17 total, 0 new | 17/0 | yes |
| HW2-vendor-adapter | 16 total, 0 new | 16/0 | yes |
| HW3-module-state | 135 total, 0 new | 135/0 | yes |
| HW4-injected-fetch | 1 total, 0 new | 1/0 | yes |
| HW5-jini-export / HW6-boot-default / HW7-public-react / HW9-plugin-import | 0 total, 0 new each | 0 | yes |
| HW8-provider-url | 49 total, 0 new | 49/0 | yes |
| N1-consumer-identity | none | zero | yes |
| R8 / SI / any other family | none in guard output | none | yes |
| guard:plugins | exit 0, clean | clean | yes |
| Layers / isolation | 0 / 0 failing; audit SI-c 9, SI-d 7 | 0/0, SI-c9/SI-d7 | yes |

No deviations from the guard record. No untracked residue appeared (no R8), so the residue rule was not needed.

## XP3 snapshot provenance

- Scratch checkout: local `git clone --no-checkout /home/user/Jini` then `git checkout --detach 35c4961af718f0f30591c46d2ea2756c4484a731` at `<scratch>/s4/xp3-base` (outside both tracked trees; a clone rather than a worktree, so Jini's .git is unchanged). HEAD verified, zero tracked/untracked changes before and after.
- There: `CI=true pnpm install --frozen-lockfile` 0, core build 0, `pnpm --no-bail -r build` 0 (xp3-install.txt, xp3-core-build.txt, xp3-build.txt). No source patch.
- Writer, cwd = scratch checkout, S4 checker by absolute path and S4 tsx loader:
  `node --import /home/user/Jini/node_modules/tsx/dist/loader.mjs /home/user/Jini/scripts/check-no-cross-package.ts --base 35c4961af718f0f30591c46d2ea2756c4484a731 --write-baseline <scratch>/s4/declaration-baseline` → exit 0, `declaration baseline: 35c4961af718f0f30591c46d2ea2756c4484a731; 3308 source mappings` (xp3-write-baseline.txt).
- Snapshot: manifest base 35c4961af718f0f30591c46d2ea2756c4484a731; **3308** source mappings, **3320** emitted declaration files (no mapping with zero outputs); 3321 files including manifest.json.
- manifest.json SHA256 **d836eba0b0e29efb9fe2e79f8a1c2f61655190008d70e74c0c86ae518728d459**, byte-identical to the S3 snapshot manifest hash recorded in extract-s3.md.
- Per-file listing `cd <snapshot> && find . -type f | LC_ALL=C sort | xargs sha256sum` kept outside source at `<scratch>/s4/declaration-baseline.files.sha256` (3321 lines). Aggregate SHA256 of that listing: **08b79774e4c55f4288f682316eefe4ea077317da8f855d2e854f3606bc987048**. (S3's aggregate f1b750bc… used an unrecorded method; this aggregate is defined by the command above and is the one later S4 gates recheck.)
- Snapshot and listing made read-only (`chmod -R a-w`). Never regenerated at a gate.
- `JINI_DECLARATION_BASELINE_DIR=<scratch>/s4/declaration-baseline pnpm check:cross-package` on the unmodified S4 tree: exit 0, XP1–XP5 clean.

`<scratch>` = /tmp/claude-0/-home-user/a10819e9-12f8-5f7a-b1c1-5dc224b62b52/scratchpad.

## Baseline named matrix

All 92 brief-named test paths exist (70 Tovu, 22 Jini incl. examples). Two extra existing files were also run: Jini legacy-adapter-descriptors.unit (F4 deletion target) and Tovu grant-signed-in-defaults.unit (see Missing-path corrections). Tovu runs used one file per invocation with the brief's command, `--test-concurrency=1 --test-reporter=tap`, timeout 600 s each (t-matrix-summary.txt, t-matrix-tap.txt).

Jini (vitest, `--maxWorkers=2 --minWorkers=1`, timeout 900 s per group):

| Group / command | Files | Tests | Result |
|---|---|---|---|
| root `pnpm exec vitest run scripts/__tests__/{check-no-cross-package,extract-s3-checker,extract-s3-source-contracts}.test.ts` | 3 | 41 + 23 + 6 = 70 | 70/70 pass |
| `@jini-ai/agent-plugins`: lifecycle/mail adapter-descriptors (4), legacy-adapter-descriptors.unit (21, extra: the F4 deletion target), admin-surfaces surface-capabilities.unit (6), surface-capabilities.security (66), action-tools.unit (15), issued-token-memory.security (5), plugin-state-persistence.unit (1) | 7 | 118 | 118/118 pass |
| `@jini-ai/integrations`: api-connections host-seams.unit (4), keys.unit (6), service.unit (12), hosted-sign-in.unit (10), account-actions.unit (24), vertical-slice.integration (1) | 6 | 57 | 57/57 pass |
| `@jini-ai/platform`: mail provider-setup (3) | 1 | 3 | 3/3 pass |
| `@jini-ai/ui`: mcp-ui credential-card.unit (2) | 1 | 2 | 2/2 pass |
| `@jini-example/neutral-host` (its `test` script is `vitest run`): provider-status (1), contribution-contracts (28), mail-host (1), api-host-moves (2), executable-surface-entries (3) | 5 | 35 | 35/35 pass |

Jini total: 23 files, 285 tests, 285 pass.

Tovu: 70 named files, 767 tests, 766 pass, 1 fail; plus extra grant-signed-in-defaults.unit (4/4). Overall 71 files, 771 tests, 770 pass, 1 fail, 0 cancelled/skipped/todo.

| Group | Tovu file (from root) | Exit | Tests | Pass | Fail |
|---|---|---|---|---|---|
| G1 | secs=3 | 0 | 34 | 34 | 0 |
| G1 | secs=1 | 0 | 30 | 30 | 0 |
| G1 | secs=3 | 0 | 15 | 15 | 0 |
| G1 | secs=4 | 0 | 10 | 10 | 0 |
| G1 | secs=0 | 0 | 2 | 2 | 0 |
| G1 | secs=5 | 0 | 54 | 54 | 0 |
| G1 | secs=4 | 0 | 12 | 12 | 0 |
| G1 | secs=3 | 0 | 31 | 31 | 0 |
| G1 | secs=0 | 0 | 7 | 7 | 0 |
| G1 | secs=1 | 0 | 3 | 3 | 0 |
| G1 | secs=1 | 0 | 2 | 2 | 0 |
| G1 | secs=1 | 0 | 1 | 1 | 0 |
| G1 | secs=1 | 0 | 3 | 3 | 0 |
| G1 | secs=0 | 0 | 1 | 1 | 0 |
| G1 | secs=2 | 0 | 5 | 5 | 0 |
| G1 | secs=5 | 0 | 25 | 25 | 0 |
| G1 | secs=3 | 0 | 20 | 20 | 0 |
| G1 | secs=1 | 0 | 1 | 1 | 0 |
| G1 | secs=1 | 0 | 4 | 4 | 0 |
| G1 | secs=1 | 0 | 1 | 1 | 0 |
| G1 | secs=0 | 0 | 1 | 1 | 0 |
| G1 | secs=1 | 0 | 10 | 10 | 0 |
| G1 | secs=9 | 0 | 26 | 26 | 0 |
| G1 | secs=4 | 1 | 25 | 24 | 1 |
| G1 | secs=3 | 0 | 2 | 2 | 0 |
| G2 | secs=1 | 0 | 6 | 6 | 0 |
| G2 | secs=2 | 0 | 2 | 2 | 0 |
| G2 | secs=2 | 0 | 9 | 9 | 0 |
| G2 | secs=1 | 0 | 11 | 11 | 0 |
| G2 | secs=1 | 0 | 18 | 18 | 0 |
| G2 | secs=1 | 0 | 14 | 14 | 0 |
| G2 | secs=2 | 0 | 5 | 5 | 0 |
| G2 | secs=2 | 0 | 20 | 20 | 0 |
| G2 | secs=2 | 0 | 26 | 26 | 0 |
| G2 | secs=1 | 0 | 1 | 1 | 0 |
| G2 | secs=1 | 0 | 2 | 2 | 0 |
| G2 | secs=1 | 0 | 14 | 14 | 0 |
| G2 | secs=1 | 0 | 1 | 1 | 0 |
| G2 | secs=4 | 0 | 10 | 10 | 0 |
| G3 | secs=2 | 0 | 10 | 10 | 0 |
| G3 | secs=1 | 0 | 2 | 2 | 0 |
| G3 | secs=2 | 0 | 18 | 18 | 0 |
| G3 | secs=2 | 0 | 1 | 1 | 0 |
| G3 | secs=1 | 0 | 2 | 2 | 0 |
| G3 | secs=0 | 0 | 10 | 10 | 0 |
| G3 | secs=1 | 0 | 18 | 18 | 0 |
| G3 | secs=1 | 0 | 9 | 9 | 0 |
| G3 | secs=1 | 0 | 4 | 4 | 0 |
| G3 | secs=0 | 0 | 9 | 9 | 0 |
| G3 | secs=1 | 0 | 22 | 22 | 0 |
| G3 | secs=1 | 0 | 3 | 3 | 0 |
| G3 | secs=1 | 0 | 7 | 7 | 0 |
| G3 | secs=0 | 0 | 7 | 7 | 0 |
| G3 | secs=1 | 0 | 8 | 8 | 0 |
| G3 | secs=3 | 0 | 9 | 9 | 0 |
| G4 | secs=2 | 0 | 7 | 7 | 0 |
| G4 | secs=1 | 0 | 13 | 13 | 0 |
| G4 | secs=1 | 0 | 8 | 8 | 0 |
| G4 | secs=1 | 0 | 35 | 35 | 0 |
| G4 | secs=2 | 0 | 31 | 31 | 0 |
| G4 | secs=1 | 0 | 12 | 12 | 0 |
| G7 | secs=8 | 0 | 1 | 1 | 0 |
| G7 | secs=2 | 0 | 1 | 1 | 0 |
| G7 | secs=4 | 0 | 1 | 1 | 0 |
| G7 | secs=16 | 0 | 36 | 36 | 0 |
| G7 | secs=1 | 0 | 1 | 1 | 0 |
| G7 | secs=1 | 0 | 5 | 5 | 0 |
| G7 | secs=4 | 0 | 4 | 4 | 0 |
| G7 | secs=8 | 0 | 6 | 6 | 0 |
| G7 | secs=25 | 0 | 3 | 3 | 0 |
| G1x | secs=1 | 0 | 4 | 4 | 0 |

## Known reds observed vs brief

| Brief known red | Observed at unmodified base |
|---|---|
| T plugin-host-bundled-identity | Present: plugin-host.integration.test.ts test 9 "every bundled agent and site package declares a distinct publisher identity and discovery terms" fails (actual `unknown/charts-recharts`, expected `jini/charts-recharts-agent`), 24/25 pass. Same failure recorded since extract-s1. Raw: t-test-plugin-host.integration.txt |
| J UI sign-in-card.unit.test.ts five AbortSignal.any/jsdom | Not run: that file is not in the named matrix. credential-card.unit (named) passes 2/2 |
| T broad test-tsconfig 12 errors (operator-read-only 1, import-local.integration 8, set-enabled-confirmation-ui 1, site-imports.integration 1, agent-plugin-token-boot-order 1) | All 12 present exactly as listed |
| connect-tool.api-connections.unit 12/12 | 12/12 pass |
| Main T tsc passes | passes (exit 0) |

**Prior drift (not in the brief's list, recorded, not fixed):** the broad test tsconfig has a **13th** error at the unmodified base:
`apps/website/src/features/api-connections/__tests__/surface-connections.host-port.unit.test.ts(15,5): error TS2322` (fixture record lacks required `staged` of `AdminSurfaceConnectionRecord`). The file was added by S3 commit 1ef11e22 (2026-11-08). Its runtime test passes 2/2. It is one of the brief's listed T test exceptions (lines 3–4 repoint only, "fixtures/assertions unchanged"), so later batches must not count this error as new and must not change its fixture to hide it.

Environment note: the broad test tsconfig needs `NODE_OPTIONS=--max-old-space-size=8192`; with Node's default heap it aborts with exit 134 before printing diagnostics.

No other red at baseline.

## Pins / hashes (unmodified Tovu base)

- apps/website/src/assistant/__tests__/fixtures/tool-metadata.baseline.json SHA256 **a0d6b428be4ea369f6abdf70a9892f0ce13db651ac4ac560e43dc2993fa2a0b6** (matches brief).
- Golden fixtures of the nine accumulated baselines (SHA256; each also matches the value in extract-s3.md):
  - assistant/__tests__/fixtures/moved-tools.golden.json 3583bc14fa8c596d64a2e97a274166f87a0ea278aed3f8c12b926552b7fc5f66
  - assistant/__tests__/fixtures/moved-tools.access-token.golden.json 61e018a56d59eee3a4b44055136c9a7c6144c5a6b13a948c8f90ebb8b14ca16e
  - assistant/__tests__/fixtures/moved-tools.credential-cards.golden.json 3eb3766de97c9d6699507fbda53b29ec63babd0af1d6381611ee907da4a2fa01
  - server/runtime/boot/__tests__/fixtures/mail-send.golden.json f0733d6176cd0d2fc92a9181d342c9ff9480f0d505f7c5e1dc8330d3f48a4be3
  - server/runtime/composition/__tests__/fixtures/cost-counters.baseline.json 2be1488c8e4556b71b759536dccac88c78612a22200aa6843748f62cb78e736c
  - contracts/core/__tests__/provider-setting-field.typecheck.ts (excluded compile pin) 7a57ea1126178279361bef826ad1ea4f9383b7c1f4adba683df370c898e59795
- Full list (29 files: every file in the three fixture directories, the typecheck pin and the nine baseline test files), SHA256 + git blob SHA: raw/extract-s4/t-pins-sha256.txt. tool-registrations.contracts, mail-engine-parity, wiring-identity and saved-keys-round-trip read no JSON golden; their test files, and every file in the assistant, boot and composition `__tests__/fixtures` directories, are hashed in that list.

## Missing-path corrections

- No named path is missing.
- Correction to the brief: "No grant-signed-in-defaults.unit.test.ts at S3" is wrong. `apps/website/src/features/agent-plugins/__tests__/unit/grant-signed-in-defaults.unit.test.ts` exists at the S4 base (103 lines, history from a96661ab 2026-11-04 to a7e7f349 2026-11-06, so it predates S3). It passes 4/4. Later batches still need the all-8-wire-site proof; this existing test is additional real coverage, not a replacement.

## Lock / link churn

- `npm ci`, `npm run link:jini` (68 links changed) and the contracts build left `git status` clean in Tovu: no package-lock.json or other tracked churn. Nothing to exclude from commits.
- Jini frozen install and builds left `git status` clean.

## Processes

The only background job was the Tovu per-file matrix runner (`run-tovu-matrix.sh`, harness task bsc8q0r9o); it exited 0 and targeted inspection shows no runner, vitest or tsc process left. All other commands ran in the foreground with `timeout`.

## S4-0a (builder S4-0a, 06:37–07:05Z) — Main F1–F5 + confirmed cuts (A7 F1–F4, A/* cuts and isValidationError retirement are S4-0b)

Programmer skills file `AI-Dev-Shop/agents/programmer/skills.md` (Jini) loaded. Bases: Tovu e989c75d, Jini 4044fe3c0. Raw files: `cloud/reports/raw/extract-s4/s40a-*.txt`.

### Findings (red → fix → mutation → green)

| Finding | Test file(s) (new unless noted) | Red raw | Fix SHA | Mutation raw | Green raw |
|---|---|---|---|---|---|
| Main F1 required `toolPermission` | T `E/__tests__/unit/tool-permission.other-host.unit.test.ts` (real J registrar + real `@jini-ai/plugins/host` builder; other host permission `reports.tools.run` allows, lacking it rejects with core `ForbiddenError {permission:'reports.tools.run',reason:'no_grant'}`; T binder binds exactly `admin.assistant.use`) | s40a-f1-red.txt (3/3 fail at S3 code) | J 42cfff737ea54a2e0a79122a89e6753b4d11c6c2, T 5de4da8c4104d0b2efd371895c9b4e4f078a2dab | s40a-f1-mutation.txt (hard-coded `'admin.assistant.use'` restored in register.ts → 2 fail) | s40a-f1-green.txt, s40a-f1-green-final.txt (3/3; host-ports 2/2) |
| Main F3 BYO prior behaviour RESTORED (not accepted) | J `I/__tests__/byo-origin-order.unit.test.ts` (raw identity escapes, read failure = unreadable, order read→origins); T `features/api-connections/__tests__/byo-client.malformed-origin.unit.test.ts` (malformed saved base URL → raw `TypeError` ERR_INVALID_URL; exact "could not be read on this site" refusal for a true read failure; usable client resolves) | s40a-f3-red-jini.txt (2 fail), s40a-f3-red-tovu.txt ("Missing expected rejection": S3 swallowed the URL error) | J b2017d9f1a5da6d86c0dd0f543be42d596bf83bc, T 5e23383c7feb1ecc1ec1f09e6eed325b31e39f56 | s40a-f3-mutation-tovu.txt (eager projection inside read → red), s40a-f3-mutation-jini.txt (projection caught as unreadable → red) | s40a-f3-green-jini.txt (7/7), s40a-f3-green-tovu.txt (5/5), s40a-f3-restored-jini.txt |
| Main F4 copied parser deleted (owner-approved) | J `P/lifecycle/mail/__tests__/no-setup-validator.unit.test.ts` (exact `{ ok: false, reason: "this host supplies no mail setup validator" }` for raw-only v2 with/without setup; raw v1 parses; injected validator's setup and refusal used unchanged) | s40a-f4-red.txt (exact-refusal case fails at S3 code; the first run also had a test-side `at` expectation error, corrected) | J a6e4a7596c8ebf7039979a815e04813bc04b18f1 (deletes `legacy-mail-setup.ts` 143 lines + `legacy-adapter-descriptors.unit.test.ts` 55 lines) | s40a-f4-mutation.txt (missing validator returns the unvalidated descriptor → red) | s40a-f4-green.txt (with adapter-descriptors.test.ts, 7/7), s40a-f4-restored.txt |
| Main F5 checker import-equals | J `scripts/__tests__/extract-s4-import-equals.test.ts`: XP1 new + moved, XP2 modified-new red / unchanged-old green, XP3 declaration-only red / unchanged pinned green, core/self allowed, core→neighbour red, real `tsc`-emitted `.d.ts` with `import ui = require('@jini-ai/ui')` caught by XP3 | s40a-f5-red.txt (6/6 fail) | J 8f5eca41cd0d2b79bd61659beafc712cf5075c9e (`collectImportEquals`: literal `ExternalModuleReference` only; visit complexity ≤10) | s40a-f5-mutation.txt (visitor line disabled → 6 fail) | s40a-f5-green.txt (all 4 checker suites 76/76), s40a-f5-restored.txt |
| Main F2 shared-instance notes | declaration proof (no behaviour change) | — | J 8aac3941e58b9d5450ce9a28c1140877692517e5 | — | s40a-notes-emitted.txt: `@agent-note` attached in emitted `dist/connect/executable/ports.d.ts` to `issuedTokens` (ONE memory shared tools/admin handlers, module scope shared) and `frozen` (SAME object as admin-surface connections; omitted-frozen behaviour retained), and in `dist/api-connections/host-ports.d.ts` to `ApiConnectionHostPorts` (floating file-head note moved verbatim; head now starts with imports). Also shows F1 `toolPermission`, F3 `allowedOrigins`, F4 `ParseMailSetup` notes emitted. Withholding both ways / account pins: existing `issued-token-memory.security`, `capability-lifetime.security`, `admin-action-tools`, `host-ports.unit` all green unchanged; no new instance created (T host-bindings still passes the one `issuedTokens`/`frozen`). |

F1 detail: `toolPermission: string` is a required member of `AgentPluginExecutableRegistrationRequired` (no default; `@agent-note`), consumed by `resolveAuth`'s `requireToolPermission`. T `bindExecutableToolRegistration` adds `toolPermission: 'admin.assistant.use'`; T bytes otherwise unchanged. Callers searched (J packages/examples/scripts, T apps): only T binder and the listed T test call the registrar; `examples/neutral-host/src/executable-surface-entries.test.ts` imports it without calling — no edit. Unrelated chat/history literal untouched.

F3 detail: `ApiConnectionByoCredential.allowedOrigins` is now `() => readonly string[]`; `resolveByoClient` keeps only `read()` inside `.catch(... 'unreadable')`, then computes `tokenOrigin` and calls `allowedOrigins()` — the exact pre-S3 order (read; `new URL(tokenEndpoint)`; `allowedOriginsFor(saved)`). T `createByoCredentials.read` returns `allowedOrigins: () => allowedOriginsFor(saved)`. Refusal bytes unchanged (wrong-origin/missing-id/unreadable). This is a restoration, not an accepted change.

### Confirmed cuts (proof: J agent-plugins/integrations build + `tsc --noEmit` exit 0; T main tsc exit 0; broad test tsconfig 13 baseline errors; named matrix unchanged)

| Row | Change | SHA |
|---|---|---|
| T features/api-connections/host-bindings.ts:68 | dropped `vault,` from `apiConnectionStorage` (no reader; the shared `vault` still feeds records/tokens/pluginState) | T bcee732f |
| T features/api-connections/host.ts:8 | dropped `createApiConnectionRuntimeHost` re-export (no caller) | T bcee732f |
| T features/api-connections/connect.ts:5 | dropped `...WithPorts` re-exports (no caller) | T bcee732f |
| E/register.ts:3, E/approval.ts:5, T surface-connections.ts:4 | re-exports deleted; the two listed tests repointed to J public entries with the same local aliases | T bcee732f |
| E/host-bindings.ts:66–68,84 | `loadActionTools({ admin, ... })` is bound only when `adminSurfaces` exists; dead `admin ?…: []` / `if (admin)` branches removed; same list → refresh → build order and trust re-read | T bcee732f |
| P/connect/index.ts:4–9; P/admin-surfaces/index.ts:48 | duplicate type exports cut; repointed E/approval-bindings.ts:1 and E/host-bindings.ts:8 → `@jini-ai/agent-plugins/connect/executable`, T surface-connection-bindings.ts:2 → `@jini-ai/agent-plugins/admin-surfaces/connections`. Other exact type callers searched in J packages/examples and T apps: none | J 92b4eb7d, T bcee732f |
| P/connect/executable/host-capabilities.ts:29 | own-ports type re-export cut; approval.ts imports the types from `./ports.js` | J 92b4eb7d |
| I/host.ts:40,42–43,345 | duplicate `export type { ApiConnectionRuntime }` cut (index exports it from host-ports); two local aliases replaced by `ApiConnectionRuntimeHostDeps/Options` directly; `startLoopback: required.startLoopback` inline in the same returned-object position | J 92b4eb7d |
| I/hook-http.ts:12 | `PluginHttp = HttpPort` alias cut; imports `PluginHttp` from host-ports | J 92b4eb7d |
| P/lifecycle/host-tools/provider-status-tool.ts | six blank lines at the factory head removed (whitespace only) | J 92b4eb7d |
| P/lifecycle/mail/legacy-mail-setup.ts + test | F4 deletion above; no relocated copy | J a6e4a759 |

Full SHAs: J 92b4eb7dc455f5dae3e7693a73cb08385c9b8947; T bcee732ff666d0ba6e32920ed418de080f918247.

### Changesets (Jini `.changeset/`, S3 changesets untouched)
- `extract-s4-tool-permission.md` (minor): required `toolPermission`; states it is breaking for direct registrar callers.
- `extract-s4-byo-origin-order.md` (minor): BYO prior behaviour restored; `allowedOrigins` deferred function.
- `extract-s4-mail-setup-validator.md` (minor): copy deleted; names the approved raw-only v2 refusal string.

### Exact diffs to frozen tests (only the listed exceptions; full text in s40a-frozen-test-diffs.txt)
- T `E/__tests__/host-ports.unit.test.ts`: lines 6–7 `from '../register.js'`/`'../approval.js'` → `import { registerAgentPluginExecutableTools as registerAgentPluginExecutableToolsWithPorts }` / `import { createAgentPluginDisclosure as createAgentPluginDisclosureWithPorts } from '@jini-ai/agent-plugins/connect/executable'`; call at line 17 adds `toolPermission: 'admin.assistant.use'`. Assertions unchanged.
- T `features/api-connections/__tests__/surface-connections.host-port.unit.test.ts`: lines 3–4 types and factory from `@jini-ai/agent-plugins/admin-surfaces/connections`. Fixtures/assertions unchanged (its known prior-drift TS2322 at (15,5) is still the 13th broad-tsconfig error).
- J `I/__tests__/host-seams.unit.test.ts`: lines 13, 23, 24 `allowedOrigins: [..]` → `allowedOrigins: () => [..]` (same arrays, connections, read counts, refusal callbacks, assertions).
- J deleted (approved): `P/lifecycle/mail/__tests__/legacy-adapter-descriptors.unit.test.ts`.
- No other existing test M/D/R in either repo (s40a-gate-custody.txt).

### Outside-scope files / S5 overlap
- No file outside the S4-0a scope was edited. No C/** file touched.
- S5 overlap (I files): `I/byo-client.ts` (1 line: `allowedOrigins()` call), `I/host-ports.ts` (floating note moved onto `ApiConnectionHostPorts`; `ApiConnectionByoCredential.allowedOrigins` type + note), `I/host.ts` (export/alias/`startLoopback` cut, no behaviour change), `I/hook-http.ts` (alias cut). No hosted-mcp/MCP file touched.
- Untracked build residue removed (gitignored, zero tracked files): `packages/agent-plugins/dist/lifecycle/mail/legacy-mail-setup.{js,js.map,d.ts,d.ts.map}` and `dist/lifecycle/mail/__tests__/legacy-adapter-descriptors.unit.test.*` (stale outputs of the deleted sources).

### S4-0a gate (07:00Z, at J 92b4eb7d / T bcee732f + new-test typing fix)

| Item | Command / raw | Result |
|---|---|---|
| J builds + tsc | agent-plugins, integrations `run build` / `exec tsc --noEmit` | exit 0 / 0 |
| J scripts tests | s40a-gate-j-scripts.txt (3 named + new F5) | 76/76 (base 70 + 6 new) |
| J agent-plugins | s40a-gate-j-agent-plugins.txt (adapter-descriptors, new F4, 5 admin-surfaces) | 100/100 (base 118 − 21 deleted legacy + 3 new) |
| J integrations | s40a-gate-j-integrations.txt (6 named + new F3) | 60/60 (57 + 3) |
| J platform / ui | s40a-gate-j-platform.txt / s40a-gate-j-ui.txt | 3/3 / 2/2 |
| J neutral-host | s40a-gate-j-neutral-host.txt; typecheck s40a-gate-j-neutral-host-tsc.txt | 35/35; tsc exit 0 |
| J scripts tsc | s40a-gate-j-scripts-tsc.txt | exit 0 |
| Checker | `JINI_DECLARATION_BASELINE_DIR=<s4>/declaration-baseline pnpm check:cross-package` s40a-gate-j-checker.txt | XP1–XP5 clean, exit 0 |
| Full guard (read whole output) | s40a-gate-j-guard.txt | exit 1 = record exactly: R2-deep-path(1) plugin-catalog/scripts/generate.ts, R10-chatpane-public-surface(1) ChatPane.tsx, R13 informational; HW1 17/HW2 16/HW3 135/HW4 1/HW8 49 all 0 new; HW5/6/7/9 0; no N1, no R8, no other family; "2 guard violation(s)." |
| guard:plugins | s40a-gate-j-guard-plugins.txt | exit 0 |
| layers/isolation | s40a-gate-j-layers-isolation.txt | `{"layers":[],"isolation":[],"SI_c":9,"SI_d":7}` exit 0 |
| Complexity ≤10 changed production/scripts | s40a-gate-j-complexity.txt (13 J files), s40a-gate-t-complexity.txt (10 T files) | 0 errors (2 pre-existing non-complexity warnings each) |
| T relink + contracts | s40a-gate-t-relink.txt, s40a-gate-t-contracts.txt | exit 0 / 0 |
| T main tsc | s40a-gate-t-main-tsc.txt | exit 0 |
| Pin compile | s40a-gate-t-pin.txt (provider-setting-field.typecheck.ts) | exit 0 |
| Broad test tsconfig | s40a-gate-t-broad-tsc.txt | exactly the 13 baseline errors (first run showed a 14th in my new F1 test, a sync/async return type; fixed in the test and rerun) |
| T named matrix | s40a-gate-t-matrix-summary.txt: G2 (14), G3 (16), G4 mail (6), G7 nine baselines, + 2 new | 47 files, 448/448 pass; every baseline file's tests/pass/fail identical to the setup baseline |
| Custody | s40a-gate-custody.txt | 28/28 pinned fixtures sha256 unchanged; tool-metadata.baseline.json a0d6b428…; XP3 snapshot listing diff empty, manifest d836eba0…; test diffs only the listed exceptions |

Token/time: ~07:05Z finish, ≈28 minutes elapsed; about 60 tool calls; context well under the 230k target.

## S4-0b (builder S4-0b, 07:06–07:35Z) — A7 F1–F4, A/* cuts, isValidationError retirement

Programmer skills file `AI-Dev-Shop/agents/programmer/skills.md` (Jini) loaded (header/base-skill list). Bases: Tovu 8b2ef5a6, Jini 92b4eb7d (no Jini edit in S4-0b). Raw files: `cloud/reports/raw/extract-s4/s40b-*.txt`. Line numbers below verified at the S4-0a tip before editing.

### A7 F1 — projection seam wired at all 8 sites (fix 85e14f0b; tests d2f1ac27)

Design: `resolveAgentPluginMcpPorts` (per-member `??` fallback, a host could supply one half) is **deleted**; no consumer imports it. Portable internals now take the full required `AgentPluginMcpProjectionPorts` (`storedAgentPluginGrants({ row, projections })`, `readConnectGrant`, `assertApprovedSource` inputs, `previewSource`, `adoptOrRecognizeExistingAgentPluginMcpServer`, `provisionPlannedServer`, `eligibleGrantRow`, `connectGrantFor`, `isStaleUntouchedProvisioning`). `AgentPluginMcpContext` is now "both or neither" (`AgentPluginMcpProjectionPorts | { projections?: undefined; classifyError?: … }`), so custom projections can never be paired with Tovu's classifier. The only remaining canonical binding is the T host shim `agentPluginMcpPortsOf` in `A/mcp-host-bindings.ts` (pair kept whole; a legacy Tovu port without projections gets Tovu's projections and keeps its own classifier, as before) — kept only because frozen tests call the old entry signatures without ports (`previewAgentPluginEnableAccess`, `createApplyConnectDefaults`, `loadAgentPluginConnectionStatuses`, `hasStoredAgentPluginCredential`, `validatedAgentPluginToolGrant`). Every production path now passes the composed port's own pair, resolved once per binding/factory.

| # | Site (S3 pin → now) | Before | After |
|---|---|---|---|
| 1 | C/plugin-host.ts:156 → :159–160 | `previewAgentPluginEnableAccess({ workspaceId, pluginId, repo, servers })` (Tovu defaults) | `...mcpPorts` where `const mcpPorts = agentPluginMcpPortsOf(deps.mcp)` once per host (:153); same pair also into the provision grant deps (:182) |
| 2 | C/deps.ts:2364 → :2366 | `createApplyConnectDefaults({ …, applyAccess: input => routeDeps.mcp.applyAccess(input), … })` | `+ projections: agentPluginMcp.projections, classifyError: agentPluginMcp.classifyError`; ONE `const agentPluginMcp = composeAgentPluginMcp(…)` hoisted (:2224) and used as `mcp: agentPluginMcp` (same instance as `routeDeps.mcp`) |
| 3 | C/app.ts:1340 → :1342 | same as 2 | same as 2 (hoist :1186) |
| 4 | A/grant-signed-in-defaults.ts:71 → :72 | `createApplyConnectDefaults({ … })` | `{ …, ...ports }`; `ports = agentPluginMcpPortsOf(deps)` once per `grantDeclaredToolsToSignedInRows` call; `GrantSignedInDefaultsDeps` = `AgentPluginMcpContext & {…}`. Indirect callers now pass the composed pair: C/plugin-host.ts:182, T routes/agent-plugins/set-enabled.ts:163, T server/runtime/boot/bootstrap.ts:356 (`grantDeclaredToolsAtBoot`) |
| 5 | A/switch-on-saved-token.ts:66 → :67 | `createApplyConnectDefaults({ …, repo: deps.mcp.repo, applyAccess: deps.mcp.applyAccess, … })` | `+ ...agentPluginMcpPortsOf(deps.mcp)`; `SwitchOnSavedTokenDeps.mcp` carries `AgentPluginMcpContext`; callers (access-token tool, import, boot) pass `routeDeps`/`deps` whose `mcp` is the composed port |
| 6 | T routes/agent-plugins/list.ts:57 → :58–59 | `loadAgentPluginConnectionStatuses({ workspaceId, mcp: deps.externalMcpServerRepo, loadCards, apiConnections })` | `+ ...agentPluginMcpPortsOf(deps.mcp)` (route stays Tovu) |
| 7 | A/grant-signed-in-defaults.ts:129 → :132 | `hasStoredAgentPluginCredential(row)` | `hasStoredAgentPluginCredential(row, ports)` (same pair as site 4) |
| 8 | A/import-access-token.ts:64 | `hasStoredAgentPluginCredential(row)` | `hasStoredAgentPluginCredential(row, deps.mcp)` (the composed port in production: bootstrap passes `deps`) |

Also: `createApplyConnectDefaults` resolves once per factory (was 5× per call, cut row A/apply-connect-defaults.ts:103,132,141); `provisionAgentPluginMcpServers` binds once per call; connect-tool's internal preview/oauthStatus reads use `agentPluginMcpPortsOf(routeDeps.mcp)`. Type changes for the composed instance to carry its pair: `RouteDeps.mcp` (T server/routes/types.ts:394) and `TovuPluginHostDeps.mcp` = `AgentPluginMcpPort & AgentPluginMcpContext` (test fixtures returning `AgentPluginMcpPort` still type-check: broad tsconfig stays at 13).

New test `A/__tests__/unit/mcp-projection-seam.distinct-ports.unit.test.ts` (4): a second host's DISTINCT projections (same meaning, reversed snapshot key order, recording calls) and classifier. (1) real `createTovuPluginHost` + a really installed plugin package: preview (site 1) produces the host-ordered snapshot, then `provisionMcp` with the approved key runs provisioning (stale check), `grantDeclaredToolsToSignedInRows` and `createApplyConnectDefaults` revalidation with the host snapshot (byte-for-byte JSON) — row granted `['existing','models','generate']`, attributed to the owner; (2) classifier/error identity: host `validateToolNames` throws `HostValidation`, the composed classifier makes it the exact ToolInputError repair text; (3) sign-in eligibility (site 7) uses the host credential projection (control: Tovu's says no credential); (4) status (site 6 entry) and stored-credential (site 8 entry) reads use the host pure projections (controls with Tovu's).
- Red: `s40b-a7-red.txt` (production diff bb12cfb1..85e14f0b reverse-applied, then restored): 3/4 fail (test 4 passes — the entries already honoured explicit ports; the defect was the call sites).
- Mutations: `s40b-a7-mutations.txt`, each reverting ONE wiring, all red: M1 plugin-host preview drops `...mcpPorts` (tests 1, 2), M2 plugin-host provision grant drops them (1), M3 `connectGrantFor` drops `...ports` (1), M4 eligibility drops ports (3), M5 factory ignores supplied ports (1), M6 status entry ignores them (4). Files restored byte-identical after each (script writes back the original content).
- Green: `s40b-a7-green.txt` 4/4.
- Not covered at runtime (source proof only, table above): the deps.ts/app.ts `onConnected` argument lines (2, 3), switch-on (5) and list route (6) and import (8) call lines; their factory/entry bodies are covered by tests 1/3/4 and M5/M6.

### A7 F2 — five rules + safe public error text (fix 85e14f0b, notes 85e14f0b + 5e4bf9d9; test d2f1ac27)
- `@agent-note`s on the actual contracts in `A/service-ports.ts`: `AgentPluginMcpProjections` (interface: one object for every path) and its members — rule 3 `accessSnapshot`/`admissionRevision` (canonical saved representation, JSON-serializable, stable key order, compared byte-for-byte), rule 2 `validateToolNames` (throws what the paired classifier calls validation; message is the public repair reason), rule 4 `readToolGrants` (strict throws, never empty/fresh grant), rule 5 `oauthStatus`/`hasStaticAccessToken` (pure, no I/O, no sealed opens); `AgentPluginMcpProjectionPorts` (bound once, passed whole; `classifyError` paired, classification does not redact); `AgentPluginSignInPort.isSignInRefusal` and `AgentPluginOAuthPort.isSignInRefusal` rule 1 (true = no card opened, key-card fallback; others propagate unchanged; matching does not make text safe). T `contracts/core/external-mcp-access.ts`: notes on `externalMcpAccessSnapshot` (rule 3), `readExternalMcpToolGrants` (rule 4), `validateExternalMcpToolNames` (rule 2).
- Safe text: `connect-tool.ts` `beginSignIn` refusal and `enable-access.ts` grant repair now pass the error message through the EXISTING core boundary `redactSecrets({ input }, { redactPii: false })` (already used for the source label in the same file). Ordinary wording, punctuation and the fallback suffix are byte-identical (all existing assertions unchanged and green, e.g. connect-tool.unit "redirect URI is not allowed", oauth-sign-in-refusal, mcp-ports.error-identity).
- New test `A/__tests__/unit/sign-in-refusal.safe-text.unit.test.ts` (4): classifier=true + `Bearer …`/`ghp_…` message → ToolInputError without the secret, exact suffix, NO card; ordinary text unchanged; an unclassified non-Error object propagates with identity; grant repair text redacted with unchanged wording/repair action. Red 2/4 (`s40b-a7-red.txt`), mutations M7 (refusal skips redaction) and M8 (repair skips redaction) red, green 4/4.

### A7 F3 / F4
- F3 (85e14f0b): `isStaleUntouchedProvisioning({ existing, planned, projections }, _options = {})`; its one caller (A/federate-mcp.ts `adoptOrRecognize…`) passes `projections: deps.projections`. No helper/behaviour change: federate-mcp.unit 34/34, apply-connect-defaults 15/15 unchanged; T main tsc exit 0.
- F4 (5e4bf9d9): A/connect-card-ui.ts `@example` now shows the real `buildAgentPluginAccessTokenFormWithPorts({ app, spec: { credentials, pluginDisplayName, helpUrl } })` on the WithPorts declaration; rationale text unchanged. Compile proof `s40b-f4-example-compile.txt`: a temporary file (removed) compiled the example under the main tsconfig (exit 0) with `@ts-expect-error` on the old flat shape; negative control without it → TS2353 (exit 2).

### Cuts (85e14f0b)
| Row | Change |
|---|---|
| A/mcp-host-bindings.ts:26 | `resolveAgentPluginSignInPort` (beginConnect wrapper + legacy branch) deleted; connect-tool calls the required `oauth.isSignInRefusal` directly |
| A/service-ports.ts:12–13,81 | `AgentPluginMcpPort.projections?` and its comment deleted; `AgentPluginMcpServicesPort` Omit key `'projections'` dropped (now `Omit<AgentPluginMcpPort,'classifyError'>`) |
| A/enable-access.ts:21,80–83 | `validatedAgentPluginToolGrantWithPorts` + wrapper merged into ONE `validatedAgentPluginToolGrant` body; production callers supply ports; the no-ports legacy call (frozen enable-access.regression:115) binds `agentPluginMcpProjectionPorts` |
| A/apply-connect-defaults.ts:103,132,141 | resolved once in `createApplyConnectDefaults`, threaded into `readConnectGrant`/revalidation |
| isValidationError | FIRST bb12cfb1 replaced exactly the listed fixtures (diff below), THEN 85e14f0b dropped C/agent-plugin-service-ports.ts:86 member (+ now-unused `ExternalMcpValidationError` import), A/service-ports.ts:24–26 (member + compat comment; `isSignInRefusal` now required), A/mcp-host-bindings.ts:28 `'isValidationError' in required` branch (whole binder deleted). Repo search: zero remaining references (timeline.ts has an unrelated local variable). |

### Exact diffs to frozen tests (listed exceptions only; full text `s40b-frozen-test-diffs.txt`)
- connect-skip.unit.test.ts:27, enable-access.regression.test.ts:131,163,197,252, tool-registrations.unit.test.ts:674: `isValidationError: () => false` → `isSignInRefusal: () => false` (these fixtures' `beginConnect` never throws an OAuthError: it succeeds, `assert.fail`s or throws a plain Error, so outcomes are identical).
- connect-tool.unit.test.ts:68: `isValidationError: ({ error }) => error instanceof ExternalMcpValidationError` → `isSignInRefusal: ({ error }) => error instanceof ExternalMcpValidationError || error instanceof OAuthError` (the legacy binder's full truth table; `OAuthError` already imported in that file).
- connect-tool.unit.test.ts:920: `isValidationError: ({ error }) => { classifiedErrors.push(error); return classified; }` → `isSignInRefusal: ({ error }) => { classifiedErrors.push(error); return classified || error instanceof OAuthError; }` (same tracker and return).
- No assertion/case/test deleted. No other existing test M/D/R (`s40b-gate-custody.txt`).

### Outside-A files touched (reason / hunk / S5 overlap vs `origin/cloud/extract-s5` ddf430cc)
| File | Reason / hunk | S5 diff s3→s5 |
|---|---|---|
| C/app.ts, C/deps.ts | hoist ONE `agentPluginMcp` composed port; `mcp: agentPluginMcp`; `onConnected` gets its pair | none |
| C/plugin-host.ts | `mcpPorts` once per host; preview + provision-grant deps; `mcp` type | none |
| C/agent-plugin-service-ports.ts | drop `isValidationError` member + unused import | none |
| T server/routes/types.ts:394 | `mcp` type `AgentPluginMcpPort & AgentPluginMcpContext` | none |
| T server/runtime/boot/bootstrap.ts | boot grant deps `...agentPluginMcpPortsOf(deps.mcp)` + import | none |
| T routes/agent-plugins/set-enabled.ts, list.ts | grant deps / status read get the composed pair + import | none |
| T contracts/core/external-mcp-access.ts | three `@agent-note` comment hunks only | **S5 OVERLAP**: S5 9355bd8c replaces this whole file with a re-export shim of `@jini-ai/mcp/federation/hosted`; at merge, S5's version wins and these three notes must be carried onto S5's canonical declarations in J mcp (S5-owned; S4 did not edit J mcp) |
No Jini file touched in S4-0b. Excluded item `features/api-connections/plugin-state.ts:3` untouched.

### Known red / pre-existing hang
- T plugin-host.integration test 9 (bundled identity) only, as at baseline.
- Extra (not in the named matrix) `features/plugin-runtime/__tests__/unit/plugin-enable-access.regression.test.ts`: 3/3 `ok` but the process never exits (timeout). Pre-existing: it also times out with the whole S4-0b production diff reverse-applied (`s40b-plugin-enable-access-base.txt`, exit 124). Not fixed, not counted.

### S4-0 gate (07:20–07:33Z, Jini 92b4eb7d, Tovu 5e4bf9d9 + safe-text typing fix)
| Item | Command / raw | Result |
|---|---|---|
| J named tests | s40b-gate-j-{scripts,agent-plugins,integrations,platform,ui,neutral-host}.txt (incl. S4-0a new F3/F4/F5 tests) | 76/76, 100/100, 60/60, 3/3, 2/2, 35/35 — equal to S4-0a gate |
| J tsc | s40b-gate-j-tsc.txt (agent-plugins, integrations), s40b-gate-j-neutral-host-tsc.txt, s40b-gate-j-scripts-tsc.txt | exit 0 ×4 (no J source change since S4-0a build; dist current) |
| Checker | `JINI_DECLARATION_BASELINE_DIR=<s4>/declaration-baseline pnpm check:cross-package` s40b-gate-j-checker.txt | XP1–XP5 clean, exit 0 |
| Full guard (whole output read) | s40b-gate-j-guard.txt (25 lines) | exit 1 = record exactly: R2-deep-path(1) plugin-catalog/scripts/generate.ts, R10-chatpane-public-surface(1) ChatPane.tsx, R13 informational; HW1 17/HW2 16/HW3 135/HW4 1/HW8 49 all 0 new; HW5/6/7/9 0; no N1, no R8, no other family; "2 guard violation(s)." |
| guard:plugins / layers+isolation | s40b-gate-j-guard-plugins.txt / s40b-gate-j-layers-isolation.txt | exit 0 / `{"layers":[],"isolation":[],"SI_c":9,"SI_d":7}` |
| T relink / contracts / main tsc | s40b-gate-t-relink.txt / -contracts.txt / -main-tsc.txt | exit 0 / 0 / 0 |
| Pin compile | s40b-gate-t-pin.txt | exit 0 |
| Broad test tsconfig | s40b-gate-t-broad-tsc.txt | exactly the 13 baseline errors (first run had 2 in my new safe-text test fixture typing; fixed in the test, rerun 13) |
| Complexity ≤10 (20 changed T prod files) | s40b-gate-t-complexity.txt | 0 errors (6 warnings: nested template/functions, duplicate-string — none complexity, on pre-existing lines) |
| T matrix | s40b-gate-t-matrix-summary.txt (+ raw summary) | 77 files: all 70 named + grant-signed-in-defaults + 4 new S4 tests + declined-access → 790 tests, 789 pass + known red; all 71 baseline files' tests/pass/fail IDENTICAL to setup baseline; plus the pre-existing-hang extra above |
| Custody | s40b-gate-custody.txt | 28/28 pins sha256 unchanged; tool-metadata a0d6b428…; XP3 snapshot listing unchanged, manifest d836eba0…; existing-test M/D/R only the listed exceptions (S4-0a's + the isValidationError fixtures) |

Processes: background runner PIDs 4240 and 6964 finished; the hung extra test's exact PIDs 13824/13825/13831 were killed by PID; nothing left running.

## A8 — seam in place (builder A8, started 07:33Z)

### A8 inventory (first commit; Tovu 6f42278c, Jini 92b4eb7d unchanged)

Paths: A = apps/website/src/features/agent-plugins, C = apps/website/src/server/runtime/composition.
Destination legend: **same** = same package as the A8 bodies (P/connect after A9); **core** = @jini-ai/core root / subpath already exported; **c/<area>** = @jini-ai/core/contracts/<area>; **port:<name>** = named required port; **host:<name>** = required host input (T binds today's bytes); **T** = stays Tovu (binder/shim/route).
Status column: **A8** = seamed in this batch; **A9** = resolution fixed here, applied when the body moves (A9 scope, row is not deferred-unknown: the port/host input is named).

#### C/plugin-host.ts (201 lines) → portable C/portable-plugin-host.ts `createPluginHost` + thin T `createTovuPluginHost`
| file:line | symbol / value | kind | destination | host vocabulary / binding | status |
|---|---|---|---|---|---|
| :1 | `Clock` | type | core (`@jini-ai/core/primitives`) | — | A8 |
| :4 | `node:path` join for lock path | runtime | T binder | `.publisher-identity.lock` under `agentPluginLayout.root` → **port:withLock** (T binds `withFileLock`) | A8 |
| :5 | `redactSecrets`, `ToolInputError` | value | core | — | A8 |
| :6 | `withFileLock` (`@jini-ai/platform/fs/file-lock`) | value, other Jini pkg | **port:withLock** | T binds with `{createParent:true}` | A8 |
| :7 | `createPluginLookup`, `readPluginIdentity`, `assertPluginIdentityAvailable`, `PluginProvider` | value/type | core (`plugin-directory`) | — | A8 |
| :8 | `InstalledAgentPlugin` | type | same (agent-plugins lifecycle) | — | A8 |
| :9 | `PluginActivationRepoPort` (`@jini-ai/plugins/host`) | type, other Jini pkg | local type `PluginHostActivationRead` (getActivation only) | — | A8 |
| :10 | `PluginDiscoveryRecord` (`@jini-ai/plugins/host/node`) | type, other Jini pkg | local type `PluginHostDiscoveryRecord` (id/status/manifest/version) | — | A8 |
| :11 | `AgentPluginHostCapability`, `PluginHostPort` (T headless barrel) | type | local `AgentPluginLifecycleCapability`/`PortablePluginHost` (structural; T binder returns `PluginHostPort`) | — | A8 |
| :12 | `listInstalledPlugins`, `preferBundledAgentPluginDigests`, `readBundledAgentPluginDigests` | value (T lifecycle) | **port:lifecycle.listInstalled / lifecycle.preferInstalled** | T binds same functions, same order (list → read bundled → prefer) | A8 |
| :13 | `readInstalledAgentPluginIdentity` | value (T) | **port:lifecycle.readIdentity** | T binds it or `optional.readAgentManifest` wrapper | A8 |
| :14 | `agentPluginActivations` (resolve/read/assertWritable) | value (T) | **port:lifecycle.isEnabled / inactivePluginIds / assertWritable** | T binds `optional.resolveEnabled` or `verdict==='active'`, `deps.assertAgentPluginActivationsWritable` override | A8 |
| :15 | `setAgentPluginEnabled` | value (T) | **port:lifecycle.setEnabled** | T binder keeps the override-only lowered notify | A8 |
| :16 | `runAgentPluginUninstall`, `AgentPluginUninstallToolDeps` | value/type (T) | **port:lifecycle.uninstall** (opaque input pass-through) | T | A8 |
| :17 | `provisionAgentPluginMcpServers`, `resolveAgentPluginMcpServers` | value (A8 file) | same (direct import; optional test overrides kept) | — | A8 |
| :18 | `grantDeclaredToolsToSignedInRows` (A10 cycle file) | value | **port:grantSignedInDefaults** (required) | T binds the existing function (A8/A9), moved one (A11) | A8 |
| :19 | `recordAgentPluginAccessDeclined` | value (A8 file) | same | — | A8 |
| :20 | `previewAgentPluginEnableAccess` | value (A8 file) | same | — | A8 |
| :21 | `agentPluginMcpPortsOf` (T projection fallback) | value (T) | T binder only; portable requires `mcpPorts` | T resolves once per binding (same pair instance as before) | A8 |
| :26 | `reportProvisioningFailures` | fn | same (portable); copy → **host:messages.provisioningFailed** | text names tool `plugins_set_enabled` (T vocabulary) | A8 |
| :27 | warn `Plugin '…': MCP provisioning for server '…' failed — …` | text | same (neutral diagnostic, no product/tool name; kept) | — | A8 |
| :32 | `requireApprovedAccessKey` | fn | same; copy → **host:messages.approvedSnapshotMissing** | names `plugins_set_enabled` | A8 |
| :37 | `TovuPluginHostDeps` | interface | T | — | A8 |
| :54 | `createTovuPluginHost` | fn | T thin binder (signature unchanged) | — | A8 |
| :57–61 | `readAgentManifest`, `resolveEnabled`, `warn`, `resolveMcpServers`, `provisionMcpServers` options | test seams | T binder (first three); portable optional (last two) | — | A8 |
| :66 | default warn `console.warn('[plugins] …')` | runtime default | **host:warn** (required in portable) | `[plugins]` prefix is T | A8 |
| :68,:79 | `namespace: 'tovu'` | id | **host:namespace** | T `'tovu'` | A8 |
| :71–149 | `listSiteProviders`/`resolveAgentProviders`/`listAgentProviders`/`listProviders` | decisions | same (portable) | `family: 'site-runtime' | 'agent-plugin'` are core `PluginProvider` vocabulary (neutral) | A8 |
| :75,:80,:101,:129 | omission warnings (`invalid installed manifest…`, `conflicting publisher identities`, `ambiguous installed revisions`) | text | same (neutral, no product/tool name) | — | A8 |
| :153 | `mcpPorts` (resolved once per binding) | value | portable requires `deps.mcpPorts`; T computes once | same instance shared by preview + grant | A8 |
| :154–193 | `agentPlugins` capability (`inactivePluginIds`, `previewEnableAccess`, `recordDeclinedAccess`, `listInstalled`, `assertWritable`, `setEnabled`, `provisionMcp`, `uninstall`) | decisions | same | capability id `'agent-plugin-lifecycle'` = T headless contract literal (kept, structural) | A8 |
| :188 | `The plugin is on, but its approved connections could not be loaded. Request plugins_set_enabled again…` | text | **host:messages.approvedLoadFailed** | names `plugins_set_enabled` | A8 |
| :189 | warn `MCP provisioning could not run — …` | text | same (neutral) | — | A8 |
| :196–199 | `withInstallIdentity` | decision | same; lock → port:withLock | — | A8 |

#### A/federate-mcp.ts (565)
| file:line | symbol | kind | destination | vocabulary / binding | status |
|---|---|---|---|---|---|
| :1–2 | `AgentPluginMcpPort/Record/Context/Projections/ProjectionPorts` | type | same (service-ports) → canonical rows from c/hosted-mcp at A9 | — | A9 |
| :3 | `agentPluginMcpPortsOf` (T fallback, used :525) | value | T shim only; portable body takes required `AgentPluginMcpProjectionPorts` | — | A9 (see Remaining) |
| :5 | `classifyAgentPluginMcpServerTrust`, `readInstalledMcpServers` (T capability-projection) | value | **port:lifecycle.readInstalledMcpServers / classifyTrust** | T binds | A9 |
| :6 | `AgentPluginLayout` | type | local layout type (`forWorkspace(id).root`) | — | A9 |
| :7 | `AgentPluginDefaultTools` | type | same | — | A9 |
| :8 | `McpServerConfig` (T mcp-metadata) | type | same (declaration type moves with A9 or c/hosted-mcp) | — | A9 |
| :9–10 | `preferBundledAgentPluginDigests`, `readBundledAgentPluginDigests`, `listInstalledPlugins` | value (T lifecycle) | **port:lifecycle** (same port as plugin-host) | — | A9 |
| :143 | `MAX_CONNECTION_ID_LENGTH = 40` | const | same (neutral; record-id grammar of the MCP store, not product) | — | A9 |
| :162 `deriveAgentPluginConnectionId`; :175 `SkippedAgentPluginMcpServer`; :184 `AgentPluginMcpTrustClassifier`; :186 `PlannedAgentPluginMcpUpsert`; :196 `AgentPluginMcpFederationPlan`; :213 `classifyAgentPluginMcpServerForFederation`; :262 `planAgentPluginMcpFederation`; :298 `resolveAgentPluginMcpServers`; :326 `findAgentPluginMcpServerDefaults`; :343 `resolveAgentPluginReadOnlyRemoteNames`; :354/:363 `ProvisionAgentPluginMcpServers{Input,Result}`; :384 `buildProvisioningSaveInput`; :420 `isStaleUntouchedProvisioning`; :435 `isEmptyJsonList`; :453 `adoptOrRecognizeExistingAgentPluginMcpServer`; :515 `provisionAgentPluginMcpServers`; :542 `provisionPlannedServer` | fn/type | same (portable decisions: plan/adopt `{...existing,provisionedByPluginId}`/stale-only reprovision/collision refusal) | `"streamable_http"`, `authorization_code`, `oauth` = canonical MCP record vocabulary (c/hosted-mcp, neutral); skip/collision reasons neutral (no product/tool names) | A9 |

#### A/enable-access.ts (80)
| file:line | symbol | kind | destination | vocabulary / binding | status |
|---|---|---|---|---|---|
| :2 | `ToolInputError`, `redactSecrets`, `AccessApprovalResource` | value/type | core | — | — |
| :3 | `planAgentPluginToolGrant`, `AgentPluginToolGrant`, `AgentPluginDeclaredTools` | value/type | same | — | — |
| :4,:6 | service-ports types | type | same | — | — |
| :5 | `agentPluginMcpProjectionPorts`, `agentPluginMcpPortsOf` (T fallback, used :26, :69) | value | T shim only | — | A9 (Remaining) |
| :7 | federate-mcp fns | value | same | — | — |
| :8 | `McpServerConfig` | type | same | — | A9 |
| :11 `storedAgentPluginGrants`; :22 `validatedAgentPluginToolGrant`; :38 `assertPluginSource`; :47 `previewSource`; :65 `previewAgentPluginEnableAccess` | fn | same | — | — |
| :33 | `The plugin's combined tool grant cannot be saved: …` | text | same (neutral) | — | — |
| :43 | `…Open Settings → External MCP and review this connection…` | text | **host:messages.sourceConfiguredSeparately** | screen path is T vocabulary | A9 |
| :71 | `The plugin connection cannot be enabled here: …` | text | same (neutral) | — | — |

#### A/apply-connect-defaults.ts (201)
| file:line | symbol | kind | destination | vocabulary / binding | status |
|---|---|---|---|---|---|
| :1 | `ToolInputError` | value | core | — | — |
| :2 | `agentPluginMcpPortsOf` (used :126) | value | T shim only | — | A9 (Remaining) |
| :3,:29 | service-ports types | type | same | — | — |
| :30 | `Clock` | type | core/primitives | — | — |
| :31 | enable-access fns | value | same | — | — |
| :34 | `agentPluginActivations` (T) | value | **port:lifecycle.isEnabled/readActivation** | T binds | A9 |
| :35 | federate-mcp fns | value | same | — | — |
| :36–37 | `McpServerConfig`, `AgentPluginLayout` | type | same / local | — | A9 |
| :38 | `setAgentPluginEnabled` (T) | value | **port:lifecycle.setEnabled** | T binds | A9 |
| :40 | `CONNECT_DECLINED_ACTOR = "system:connect-declined"` | actor id | **host:actors.connectDeclined** (saved in access audit; bytes unchanged) | T `system:connect-declined` | A9 |
| :44 | `CONNECT_DEFAULTS_ACTOR = "system:connect-defaults"` | actor id | **host:actors.connectDefaults** | T | A9 |
| :47 | `SEED_ACTOR = "system:seed"` | actor id | **host:actors.seed** | T | A9 |
| :51 `isPluginOffByOperator`; :71 `switchPluginOnUnlessOperatorOff`; :76 `ApplyConnectDefaultsDeps`; :94 `readConnectGrant`; :108 `allowsAutomaticConnectGrant`; :120 `createApplyConnectDefaults`; :154 `assertApprovedSnapshot`; :160 `approvedSource`; :175 `assertApprovedSource`; :191 `recordAgentPluginAccessDeclined` | fn/type | same (operator-off/approved-source decisions) | — | — |
| :155,:166,:167,:182 | `…Request the access change again…` refusals | text | same (neutral; no product/tool name) | — | — |

#### A/switch-on-saved-token.ts (85)
| file:line | symbol | kind | destination | vocabulary / binding | status |
|---|---|---|---|---|---|
| :2 | `Clock` | type | core/primitives | — | — |
| :4 | service-ports types | type | same | — | — |
| :5 | `agentPluginMcpPortsOf` (used :67) | value | T shim only | — | A9 (Remaining) |
| :8 | apply-connect-defaults fns (`isPluginOffByOperator` default, `switchPluginOnUnlessOperatorOff`, `createApplyConnectDefaults`) | value | same; defaults read T activations → port:lifecycle at A9 | — | A9 |
| :9 | `AgentPluginLayout` | type | local | — | A9 |
| :30 | `AGENT_PLUGINS_SCREEN = "Add-Ons → Agent Plugins"` | screen name | **host:messages.agentPluginsScreen** | T | A9 |
| :31 | `EXTERNAL_MCP_SCREEN = "Add-Ons → Integrations → External MCP"` | screen name | **host:messages.externalMcpScreen** | T | A9 |
| :33 `SavedTokenSwitchOutcome`; :38 `SwitchOnSavedTokenDeps`; :60 `switchOnSavedTokenConnection` | type/fn | same | — | — |
| :78 `describeSavedTokenSwitch` | fn (copy) | **host:messages.savedTokenSwitch** (whole sentences incl. screen names) | T | A9 |

#### A/connection-status.ts (82)
| file:line | symbol | kind | destination | vocabulary / binding | status |
|---|---|---|---|---|---|
| :1 | `agentPluginMcpPortsOf` (used :24) | value | T shim only | — | A9 (Remaining) |
| :2 | service-ports types | type | same | — | — |
| :3 | `LoadPluginCredentialCards` (T custom-credentials) | type | c/credentials (`PluginCredentialCard` already there) + local loader type | — | A9 |
| :4 | `ApiConnectionHost` (T api-connections host) | type | **port:apiConnections** (`AgentPluginApiConnectionsPort` narrow slice) | — | A9 |
| :6 `ConnectionRow`; :7 `AgentPluginConnectionStatus` (`connected/disconnected/pending/needs_reauth`); :13 `loadAgentPluginConnectionStatuses`; :33 `mcpSignInStatus`; :40 `summarizeStatus`; :46 `appendStatus`; :54 `addMcpStatuses`; :64 `addApiStatuses`; :76 `addUnconnectedCards` | type/fn | same (status vocabulary is the admin list's neutral contract) | `reconnect-required`/`revocation-pending` = I API status vocabulary (core type) | — |

#### A/service-ports.ts (106)
| file:line | symbol | kind | destination | vocabulary / binding | status |
|---|---|---|---|---|---|
| :2 | `ChatAgentPlugins` | type | same | — | — |
| :3 | `SurfaceCardsPort`, `SurfaceCardSecretForm` | type | c/cards | — | — |
| :4 | `ExternalMcpConnectStart/ServerRepoPort/ServerView/SaveExternalMcpServerInput` (T external-mcp contracts) | type | c/hosted-mcp (S5 H0, adopted A9) | — | A9 |
| :5 | `PluginCredentialCard` | type | c/credentials | — | — |
| :6–7 | `DeclaredApiConnection`, `ApiConnectionConnectStatus` (T api-connections) | type | core types (I contracts) / port:apiConnections | — | A9 |
| :10 `AgentPluginMcpPort`; :20 `AgentPluginOAuthPort`; :28 `PluginCredentialsPort`; :36 `AgentPluginPreferencesPort`; :46 `AgentPluginApiConnectionsPort`; :53 `AgentPluginPathsPort`; :60–64 record/save/view/repo/snapshot aliases; :68 `AgentPluginMcpProjections`; :87 `AgentPluginMcpProjectionPorts`; :94 `AgentPluginMcpContext`; :96 `AgentPluginMcpServicesPort`; :97 `AgentPluginSignInPort`; :105 `AgentPluginCardsPort`; :106 `AgentPluginCardBuilders` | type | same (P/connect/ports.ts at A9) | notes already carry provider/shared-instance rules (S4-0b) | — |

New A8 contract members (all in C/portable-plugin-host.ts, each with second-host @agent-note): `grantSignedInDefaults` (required), `lifecycle.{listInstalled,preferInstalled,readIdentity,isEnabled,inactivePluginIds,assertWritable,setEnabled,uninstall}`, `withLock`, `namespace`, `warn`, `messages.{provisioningFailed,approvedSnapshotMissing,approvedLoadFailed}`, `discoverPlugins`, `getActivation`, `mcpPorts`.

Citation correction (grant order): the brief says the grant runs "after provisioning/before reporting failures". The actual T code at 6f42278c (C/plugin-host.ts:177–186 and the admin route set-enabled.ts:155–166) runs provisioning → failure warnings (and, for an approved enable with failures, the refusal throw) → grant with failed servers skipped. Frozen behavior and "same order" win: the port is called after provisioning and after the failure warnings; an approved enable whose provisioning partly failed refuses BEFORE any grant (no grant on a refused consent). The @agent-note and the new order test pin this actual order.

### A8 implementation (07:35–07:43Z)

- Inventory: 34bf1017 (pushed first). Implementation: 67299569 (C/portable-plugin-host.ts new `createPluginHost` + thin `createTovuPluginHost`). Tests/raws: 7663762a.
- C/portable-plugin-host.ts imports only `@jini-ai/core` (root, primitives, plugin-directory), `@jini-ai/agent-plugins/lifecycle` types (same package after A9) and the A8 bodies (federate-mcp, enable-access, apply-connect-defaults, service-ports types, mcp-metadata type). No `@jini-ai/plugins`, `@jini-ai/platform`, headless barrel, `node:` built-in, `mcp-host-bindings` or A10 file. Local types: `PluginHostDiscoveryRecord`, `PluginHostActivation`, `PluginHostGrantDeps`, `PluginHostLifecycle`, `PluginHostMessages`, `PluginHostDeps`, `AgentPluginLifecycleCapability`, `PortablePluginHost` (return is assigned to T `PluginHostPort` without a cast — tsc proves structural equality).
- Required ports with second-host @agent-notes on each member: `grantSignedInDefaults` (provider/order/skips/approved key/same deps), `lifecycle.*` (fresh reads, preference order, fail-closed activation, one activation queue, uninstall pass-through), `withLock` (one cross-process lock per tree), `namespace` ("Your app's id…"), `mcp` (one repo/vault/private context), `mcpPorts` (resolved once per binding, shared by preview/grant/status), `discoverPlugins`, `getActivation`, `warn`, `messages.*` (redaction responsibility stated).
- T binder (C/plugin-host.ts) binds: `withFileLock` + `.publisher-identity.lock`, `'tovu'`, `[plugins]` warn prefix, the three `plugins_set_enabled` texts (bytes unchanged), lifecycle/activation/set-enabled/uninstall owners and their existing test overrides, `agentPluginMcpPortsOf(deps.mcp)` once per binding (legacy fallback now only in the binder), and `grantDeclaredToolsToSignedInRows` into the required port. `createTovuPluginHost` signature unchanged.
- Order/instances: same call order (resolve → provision → failure warnings/approved refusal → grant), same `deps.mcp` instance to provisioning, same resolved `servers` object and one projection pair to the grant, no new I/O (lookup still list → read bundled → prefer; activation reads unchanged). One residual difference: `agentPluginLayout.forWorkspace(id).root` is now evaluated inside each lifecycle port call instead of once per lookup (pure path computation, no I/O).

New proofs (`C/__tests__/portable-plugin-host.unit.test.ts`, 5 tests): grant order + failed-server skip + same port/servers/projection instances; approved-enable pass-through; approved enable with failures refuses with host copy and no grant; static no-cycle (no import edge from C/portable-plugin-host.ts or any of the six A8 files into the nine A10 files); portable host imports no non-core Jini package/headless barrel/platform/Tovu fallback.
Red/mutation evidence: pre-seam edges at 6f42278c (`a8-pre-seam-edges.txt`: plugin-host imported grant-signed-in-defaults, @jini-ai/plugins, @jini-ai/platform, headless barrel). Mutations, each red then restored (cmp-verified) → green: `a8-mut-order.txt` (report after grant → tests 1,3 red), `a8-mut-cycle.txt` (import grant-signed-in-defaults → test 4 red), `a8-mut-skip.txt` (drop skipServerKeys → 1,2 red), `a8-mut-approved.txt` (drop approvedEnable → 2 red); `a8-new-green.txt`, `a8-new-green2.txt`.

### A8 gate (07:39–07:43Z; raw dir cloud/reports/raw/extract-s4/)
| item | command / raw | result |
|---|---|---|
| A8/connect matrix + 2 S4-0b tests + C four + new | s4 runner, list a8-gate-files.txt → `a8-gate/`, `a8-gate-summary.txt` | 28 files; all exit 0 except plugin-host.integration 24/25 (known red test 9 only); per-file counts identical to S4-0b gate for the shared files |
| nine accumulated baselines | same run (moved-tools ×3 goldens, tool-registrations.contracts 36, mail-send.golden, mail-engine-parity 5, cost-counters 4, wiring-identity 6, saved-keys-round-trip 3) + tool-registrations.plugins-uninstall 17 (plugin-host consumer) | all pass |
| 8-site projection identity | mcp-projection-seam.distinct-ports 4/4, wiring-identity 6/6, mcp-ports.error-identity 1/1 | pass |
| T main tsc | `a8-tsc1.txt`, `a8-tsc-final.txt` | exit 0 |
| broad tests tsconfig | `a8-broad-tsc.txt` | exactly 13 errors, identical list to s40b-gate-t-broad-tsc.txt |
| pin typecheck | `a8-pin-tsc.txt` | exit 0 |
| complexity ≤10 on changed prod files | `a8-complexity-final.txt` | 0 errors (1 pre-existing-shape warning: nested template in the moved T copy) |
| relink | not needed: Jini unchanged at 92b4eb7d | — |
| Jini FULL guard | `a8-guard.txt` | exit 1, "2 guard violation(s)." = record: R2(1) R10(1), R13 info only, HW1 17/HW2 16/HW3 135/HW4 1/HW8 49 all 0 new, HW5/6/7/9 0, no N1/R8/other. 24 lines (base noted 25; families/counts identical). Guard scans Jini only — nothing in Tovu. |
| custody | `a8-pins-check.txt`, `a8-test-diff.txt` | 28/28 pins OK; tool-metadata a0d6b428… unchanged; XP3 snapshot listing unchanged; tests diff vs 6f42278c = only the new test (A); vs c3801c833 = 11 entries, the S4-0a/0b listed exceptions + new tests, no new exception |

Outside-scope files: none (touched only C/plugin-host.ts, new C/portable-plugin-host.ts, new test, report, raws). S5 overlap: `git diff origin/cloud/extract-s3 origin/cloud/extract-s5` (S5 tip 8496ae73) on all three code files = 0 lines.
Lines: +427/−146 code+test (portable 283, binder −146/+43, test 101). Time 07:33–07:43Z code+gate. Jini pair unchanged (92b4eb7dc455f5dae3e7693a73cb08385c9b8947).

Remaining A8 work (not done in this batch — numbered):
1. (DONE in the A8 follow-up below) Dispatch item 3: legacy no-ports fallback moved out of the portable bodies.
2. A9-status inventory rows (A8 bodies' own T imports: lifecycle.js, capability-projection.js, activation-effects.js, set-enabled.js, layout.js, mcp-metadata.js, external-mcp/api-connections/custom-credentials types; actors `system:*`; screen names; `Open Settings → External MCP` copy) are resolved to named ports/host inputs but applied when the bodies move.

### A8 follow-up — dispatch item 3: required ports in portable bodies, fallback only in T shims (07:44–08:03Z)

- d6f4655c: `git mv` A/{federate-mcp,enable-access,apply-connect-defaults,switch-on-saved-token,connection-status}.ts → A/portable/<same>.ts (bodies, comments and order unchanged; relative imports re-pointed; provenance diff `a8b-move-provenance.txt`, 74 changed lines, all import paths or the five fallback sites). Portable bodies now REQUIRE `AgentPluginMcpProjectionPorts` (federate-mcp:525 `bound`, enable-access `validatedAgentPluginToolGrant` options.ports + preview, apply-connect-defaults factory, switch-on-saved-token `mcp`, connection-status `projections`) and import nothing from `mcp-host-bindings`. Old paths are thin T shims: `export *` from the portable module + the one legacy-signature entry each (old types `ApplyConnectDefaultsDeps`/`SwitchOnSavedTokenDeps` re-declared with optional context), so frozen tests and every T caller keep the same import path/signature. C/portable-plugin-host.ts imports the portable twins; its `mcp` dep now requires the pair.
- e74957c8 (fix after own red): first shim version spread `deps`, which evaluated a frozen fixture's lazy `agentPluginLayout` getter (apply-connect-defaults.unit 0/15, raw `a8b-gate/` first run overwritten — red recorded here: "Test home isolation required" thrown from the getter via the shim spread). Fixed with `withAgentPluginMcpPorts` in A/mcp-host-bindings.ts (T): returns the same object when projections are present (production: same instance), else a descriptor-preserving shallow copy (getters stay lazy) plus Tovu's pair; `withOverrides` for switch-on's nested `mcp`. T binder passes `withAgentPluginMcpPorts(deps.mcp)`.
- New proof: test 6 in portable-plugin-host.unit (no portable A8 file imports `mcp-host-bindings`); mutation `a8b-mut-fallback.txt` (re-add import → test 6 red), restored (git diff clean) → green.
- Outside named scope: A/mcp-host-bindings.ts (+2 T helpers, reason above; S5 overlap: `git diff origin/cloud/extract-s3 origin/cloud/extract-s5 -- <file>` = 0 lines), new dir A/portable/ (S5 0). S5 overlap for the five shim paths: 0 lines each.

Follow-up gate (final code e74957c8):
| item | raw | result |
|---|---|---|
| A8 matrix + baselines (28 files) | `a8b-gate-summary.txt` | identical per-file counts to the first A8 run; portable-plugin-host 6/6; only known red plugin-host.integration test 9 |
| S4-0b full list (77 files) | `a8b-full-summary.txt` | 76 files identical counts to `s40b-gate-summary`; 77th = the recorded pre-existing hang plugin-enable-access.regression (no result, as before) — stopped by exact PIDs 26316/26317/26323 + runner 22871 |
| T main tsc | `a8b-tsc3.txt` | exit 0 |
| broad tests tsconfig | `a8b-broad-tsc.txt` | exactly the 13 baseline errors (identical list) |
| complexity ≤10 (13 changed prod files) | `a8b-complexity.txt` | 0 errors, 2 warnings (nested template, pre-existing shapes) |
| guard / custody | as A8 gate (Jini unchanged; pins/snapshot untouched by this follow-up; tests diff vs 6f42278c = only the new test file) | unchanged |

Lines (follow-up): +1085/−989 in A (mostly the git mv), +16 mcp-host-bindings. Token note: builder self-estimate ~140k at report time.

## A9 — move A8 portable bodies to @jini-ai/agent-plugins/connect (builder A9, 08:05–08:27Z)

Programmer skills file (Jini AI-Dev-Shop/agents/programmer/skills.md): not loaded (token budget; dispatch-scoped work).

### H0 prerequisite adoption (Jini 5c3235e615208f181ae2d698c83fd6ff0a32c712)
Byte-identical from origin/cloud/extract-s5 @ 183915bb0ae25c659ec5a1273c97a4b0ba992910. Upstream commits touching the paths: 27063efcc7c0327f517429812e167174d1a80448 (H1a contracts), 60f593071fbec15fda1ada9b3df886ba6c20e14c (config.ts neutral comment); core package.json net of 6ab1d818/183915bb (oauth-callback-fields added then reverted) = only the `./contracts/hosted-mcp` runtime + export entries.
| path | blob |
|---|---|
| packages/core/package.json | cba6f6b8886c74ce57f75d8321ee186309d890d7 |
| packages/core/src/contracts/hosted-mcp.ts | 1cae38ebc586322136e845d671e296a8f83ebe25 |
| packages/core/src/contracts/hosted-mcp/vocabulary.ts | fe8826be0c5b7dca7102d15bd2292b4d0e95397b |
| packages/core/src/contracts/hosted-mcp/record.ts | 5cd2a31f3421f9ea90fa89c105414d566c514e9f |
| packages/core/src/contracts/hosted-mcp/config.ts | 99747b76efd031778cc31fb02c571761eabde785 |
Types only: imports are relative `import type` (primitives/vault/vocabulary); emitted JS is `export {}` for all four modules; XP1–XP5 clean. Not adopted: S5 oauth.ts/oauth/flow.ts (H2a), mcp/**, integrations/**, any Tovu part.

### Provenance map (verbatim copy commit Jini 82c0d51a140cd39707ceaaac8077bbb6fe1683b6; seams cfe4f08a0f0f56cf356e8eecc7c132aeab8b2406 + fix 0506634875ecd8d6a63f0e4467de8c25dbf2cec1)
Source repo Tovu, ref f82936d945630bf1ae72468946d45b096b133900; destination blob at the copy commit equals the source blob (bytes unchanged):
- Tovu f82936d945630bf1ae72468946d45b096b133900:apps/website/src/features/agent-plugins/portable/federate-mcp.ts blob 7034f4d0d4e4ff9c8100c4f7c7f3de5f3cebf0ff -> Jini packages/agent-plugins/src/connect/federate-mcp.ts blob 7034f4d0d4e4ff9c8100c4f7c7f3de5f3cebf0ff
- Tovu f82936d945630bf1ae72468946d45b096b133900:apps/website/src/features/agent-plugins/portable/enable-access.ts blob a945df32b15461221e6ae554ff9ad83de2d29f01 -> Jini packages/agent-plugins/src/connect/enable-access.ts blob a945df32b15461221e6ae554ff9ad83de2d29f01
- Tovu f82936d945630bf1ae72468946d45b096b133900:apps/website/src/features/agent-plugins/portable/apply-connect-defaults.ts blob dbc7b723b275967942677ca5a64f633e9aea3955 -> Jini packages/agent-plugins/src/connect/apply-connect-defaults.ts blob dbc7b723b275967942677ca5a64f633e9aea3955
- Tovu f82936d945630bf1ae72468946d45b096b133900:apps/website/src/features/agent-plugins/portable/switch-on-saved-token.ts blob bfdc3a44dd2efc271e334bd2684d6e232fc9123a -> Jini packages/agent-plugins/src/connect/switch-on-saved-token.ts blob bfdc3a44dd2efc271e334bd2684d6e232fc9123a
- Tovu f82936d945630bf1ae72468946d45b096b133900:apps/website/src/features/agent-plugins/portable/connection-status.ts blob 26383585213c10770514e49c16bf2c3c27eed37f -> Jini packages/agent-plugins/src/connect/connection-status.ts blob 26383585213c10770514e49c16bf2c3c27eed37f
- Tovu f82936d945630bf1ae72468946d45b096b133900:apps/website/src/features/agent-plugins/service-ports.ts blob bc2de4680ba3a2ab7e7acef3436f35af06e30043 -> Jini packages/agent-plugins/src/connect/ports.ts blob bc2de4680ba3a2ab7e7acef3436f35af06e30043
- Tovu f82936d945630bf1ae72468946d45b096b133900:apps/website/src/server/runtime/composition/portable-plugin-host.ts blob da32f2dc674a57ccba3c96f645a5761c6e89f2bc -> Jini packages/agent-plugins/src/connect/plugin-host/index.ts blob da32f2dc674a57ccba3c96f645a5761c6e89f2bc
Tovu removal: 541f00a8 (git rm of the six portable files; old-path shims rewired). Rationale comments stay beside the code in Jini; the symbols that stay Tovu (operator-off read, locked switch-on, `system:*` actors, screen names, describeSavedTokenSwitch) moved back into the T shims with their original comments verbatim.

### Vocabulary / bindings (every A8 "A9" row)
| A8 row | moved-code form (Jini) | Tovu binding (bytes unchanged) |
|---|---|---|
| federate-mcp lifecycle reads (listInstalledPlugins/readBundled/preferBundled/readInstalledMcpServers) | required `lifecycle: AgentPluginInstalledMcpReads` (Pick of `createAgentPluginLifecycle`, object args) on resolve/readOnlyNames; plugin-host `installedMcp` | `tovuInstalledMcpReads` in A/federate-mcp.ts over T lifecycle.js/capability-projection.js |
| classifyAgentPluginMcpServerTrust default | required `classifyTrust` (plan options, provisioning input, preview input, plugin-host dep) | T `capability-projection` rule |
| skip reasons "this Tovu version's external-MCP store …" (sse, headers) — guard N1 | required `AgentPluginMcpFederationMessages` (plan/provision/preview; plugin-host messages) | `tovuFederationMessages` (exact old strings) |
| "Open Settings → External MCP …" | `AgentPluginEnableAccessMessages.sourceConfiguredSeparately({connectionId})` | `tovuEnableAccessMessages` (exact old string) |
| `system:connect-defaults` / `system:connect-declined` | `ApplyConnectDefaultsDeps.actors: AgentPluginConnectActors`; `recordAgentPluginAccessDeclined({actorId})`; plugin-host `declinedAccessActor` | `tovuConnectActors`, `CONNECT_DECLINED_ACTOR` (T shim) |
| `system:seed`, isPluginOffByOperator, switchPluginOnUnlessOperatorOff (T activation-effects/set-enabled) | not moved: required host inputs `isPluginOffByOperator`/`enablePlugin`/`resolveServers` (apply-connect-defaults) and `isPluginOffByOperator`/`switchPluginOn`/`onConnected` (switch-on) | T shim keeps the functions + defaults (lazy, descriptor-preserving) |
| AGENT_PLUGINS_SCREEN / EXTERNAL_MCP_SCREEN / describeSavedTokenSwitch | not moved (whole sentences are host copy) | T shim, verbatim |
| AgentPluginLayout (T layout.js) | local structural `{ forWorkspace(id).root }`; plugin-host deps generic `Layout` passed to the grant untouched | T binder pins `TovuPluginHostDeps['agentPluginLayout']` |
| McpServerConfig / AgentPluginDefaultTools / planAgentPluginToolGrant / InstalledAgentPlugin / SetAgentPluginEnabled* | same package `../lifecycle/{manifest,enable-grants,types,set-enabled}.js` (pure / type-only) | — |
| T external-mcp contracts (record/save/view/repo/snapshot/approved access) | `@jini-ai/core/contracts/hosted-mcp` canonical rows; view = `ExternalMcpServerView<unknown>` (host token hint opaque) | T re-exports via service-ports |
| six projection `typeof` T functions | explicit function types in ports.ts | T pair unchanged |
| `@jini-ai/daemon` ToolAccessChange | `AgentPluginMcpPort<Lowered = unknown>` | T service-ports binds `ToolAccessChange` |
| LoadPluginCredentialCards / ApiConnectionHost | same-package `./plugin-credential-card.js`; local narrow `AgentPluginApiConnectionStatusReads` | T host passes its instance |
| A10 ports (OAuth/credentials/preferences/API/paths/sign-in/cards) + AgentPluginMcpContext | not moved (A10/C-b scope; Tovu-only legacy context) | stay in T service-ports.ts |
Neutral strings kept (justified): `External MCP source:` approval label and `streamable_http`/`oauth`/`static_env` (canonical hosted-MCP vocabulary), neutral refusal/warning texts without product/tool names.
Product scan of the 7 moved files for `Tovu|tovu|plugins_set_enabled|system:|Add-Ons|Open Settings|this Mac|http(s)://`: 0 hits. N1-rejected comment lines reworded (exact diffs in commit 05066348 message): federate-mcp ×3, enable-access ×1, plugin-host ×1; meaning kept.

### Exports / isolation
packages/agent-plugins/package.json: `./connect` (existing; now also exports ports + the five bodies), NEW `./connect/plugin-host` (exports map + jini.entries `universal` + isolation `lifecycle`), `./connect/executable` retained. Runtime closure of both entries (dist JS): `@jini-ai/core`, `@jini-ai/core/plugin-directory`, same-package `../lifecycle/enable-grants.js` (no imports) and the connect bodies — no node built-in, so `universal` is truthful (no facade). No new deps/peers. layers [] isolation [] SI_c 9 SI_d 7 (unchanged). Emitted `.d.ts` @agent-note counts: ports 13, federate-mcp 5, enable-access 1, apply-connect-defaults 5, switch-on-saved-token 3, connection-status 1, plugin-host 23.

### Tests
- NEW Jini examples/neutral-host/src/connect-plugin-host.test.ts (2): `acme` namespace/actors/paths/copy, in-memory ports, real moved provisioning: order resolve → save → save(fail) → notify → warn → grant with `skipServerKeys:['beta']`; declined access attributed to `acme:declined`; sse skip reason = host copy; no Tovu vocabulary in any step. (Not mutation-tested in this batch — the A8 order mutations still pin the same body.)
- Tovu new test C/__tests__/portable-plugin-host.unit.test.ts (A8's, not frozen) repointed at the moved modules (import from `@jini-ai/agent-plugins/connect/plugin-host`, static checks read the Jini sources: no `#src`/out-of-package edge, no non-core Jini import, no mcp-host-bindings) + new required deps in its fixture.
- Own red: run 1 (`a9-gate-run1-summary.txt`): federate-mcp.unit 32/34 — shim spread `{...input}` evaluated a fixture's lazy layout getter ("Test home isolation required"). Fixed with descriptor-preserving `withOverrides` (e19646a3) → 34/34.

### A9 gate (raw dir cloud/reports/raw/extract-s4/)
| item | raw | result |
|---|---|---|
| Jini core build + tsc | a9-core-build (scratch), a9-j-core-tsc.txt | exit 0 |
| Jini agent-plugins build + tsc | a9-j-build.txt, a9-j-ap-tsc.txt | exit 0 |
| Jini scripts tsc / tests | a9-j-scripts-tsc.txt, a9-j-scripts.txt | 0 / 76 pass |
| agent-plugins named tests | a9-j-ap-tests.txt | 100 pass |
| neutral-host named + new | a9-j-neutral.txt | 37 pass (35 + 2 new) |
| check:cross-package (XP3 snapshot) | a9-j-xp.txt | XP1–XP5 clean |
| FULL guard | a9-guard.txt | exit 1, "2 guard violation(s)." = record: R2(1) R10(1), R13 info, HW1 17/HW2 16/HW3 135/HW4 1/HW8 49 all 0 new, HW5/6/7/9 0, **N1 0** (first run had N1 ×3 on moved files → fixed in 05066348) |
| guard:plugins | a9-guard-plugins.txt | exit 0 |
| layers/isolation | a9-layers-iso.txt | [] / [] SI 9/7 |
| complexity ≤10 | a9-j-complexity.txt, a9-t-complexity.txt | 0 errors (J 2 warnings, T 1 warning) |
| T relink + main tsc | a9-relink.txt, a9-tsc4.txt | exit 0 / 0 |
| broad tests tsconfig | a9-broad-tsc.txt | exactly 13, identical list to a8b-broad-tsc.txt |
| pin typecheck | a9-pin-tsc.txt | exit 0 |
| T A8 list (28 files: A8 matrix + 2 S4-0b tests + C four + new + nine baselines + plugins-uninstall) | a9-gate-summary.txt, a9-gate/ | per-file counts identical to a8b-gate-summary; only known red plugin-host.integration test 9 |
| custody | a9-pins-check.txt | pins 28/28; tool-metadata a0d6b428… unchanged; XP3 snapshot listing unchanged; tests diff vs f82936d9 = only the A8 new test (repointed); no frozen-test edit |

### Outside named scope / S5 overlap
- Jini packages/core/** (H0 adoption only, byte-identical to S5 — merge is a no-op for those paths).
- Tovu A/service-ports.ts (MCP ports → re-exports; S5 diff vs S3 on this file: check at merge — S5 owns T external-MCP contracts, which this file no longer imports for MCP rows), C/plugin-host.ts (binder deps), A/{federate-mcp,enable-access,apply-connect-defaults,switch-on-saved-token,connection-status}.ts shims (S5 0 lines at A8).
Lines: Jini +1399 verbatim copy, then +200/−232 seams; Tovu +225/−1408 (moved out). Time 08:05–08:27Z. Token note: builder ~165k at report time.
Remaining: none for A9 scope. A10/A11 must consume the moved MCP ports from `@jini-ai/agent-plugins/connect` (T service-ports re-exports them) and the T binder still passes the T grant (`grantDeclaredToolsToSignedInRows`).

## A10 inventory (not implemented — job stopped at token cap)

Builder A10-INVENTORY, ~08:20–08:40Z, on Tovu 64696b0b / Jini f774b9e5 (cloud/extract-s4). **No code edits, no moves, no tests run.** This is the A10 "first seam commit = inventory" deliverable only; the seam (A10) and the move (A11) are NOT done. Read-only sources: the nine files under A (`apps/website/src/features/agent-plugins/`), their T/J imports, `card-host-bindings.ts`, `service-ports.ts`, `tool-registrations.ts`, `C/plugin-host.ts`, J `P/connect/{ports,index,federate-mcp,apply-connect-defaults}.ts`, J core `surface-exchanges.ts`/`contracts/cards.ts`/`tool-permissions.ts`, J daemon `surface-exchanges.ts:412`.

Destination key: **P/x** = J `packages/agent-plugins/src/connect/x.ts` (same package, `./connect` entry); **P/ports** = `P/connect/ports.ts`; **CORE** = `@jini-ai/core` root; **CC/area** = `@jini-ai/core/contracts/<area>` (types only); **SELF** = `@jini-ai/agent-plugins/lifecycle` (self-import, allowed); **HOST** = required host input bound by the T shim/binder (no T default in P); **T-STAY** = stays Tovu (R4 stay block / host wiring). Port names follow the brief list (Mcp, Projections, SignIn, Lifecycle, Cards<Resource>, CredentialCardForms<Form>, exchange store/askThenReport, approvals, preferences, API, messages, publicUrl, cardIdentity).

### Value-import graph among the nine (production, non-test)

| from | value imports (of the nine) | type-only imports (of the nine) |
|---|---|---|
| connect-tool | connect-destination, connect-sign-in-wait | — |
| connect-sign-in-wait | connect-card-ui | connect-tool (`AgentPluginConnectResult`) |
| access-token-tool | connect-card-ui, connect-tool | — |
| import-access-token | access-token-tool, connect-tool | — |
| grant-signed-in-defaults | connect-tool, import-access-token | — |
| token-sign-in | access-token-tool, connect-tool | import-access-token |
| apply-tool-renames | import-access-token | — |
| connect-card-ui, connect-destination | — | — |

**Finding:** the nine form a value-DAG, not a value cycle. The only cycle is **type-only**: connect-tool ⇄ connect-sign-in-wait (`AgentPluginConnectResult`). The A8 grant port already removed the old back-edge (C/plugin-host → grant-signed-in-defaults is now a T binder value import, plugin-host itself lives in J `connect/plugin-host` since A9). Move order if split: card-ui, destination → sign-in-wait+connect-tool (atomic, type cycle) → access-token-tool → import-access-token → {grant, token-sign-in, apply-tool-renames}. Brief requires the family to move together in A11 anyway; atomic move is still the plan.

External production callers (must keep T shim signatures): `tool-registrations.ts` (A, R4 stay block), `write-note-tool.ts:8` (type `AgentPluginAccessTokenToolDeps`), `new-site-agent-plugin-tokens.ts:8–11`, `assistant/tool-registrations.ts:149` (type), `C/plugin-host.ts:20,98`, `C/tool-catalog-manifest.ts:28`, `C/pending-agent-plugin-tokens.ts` (comment only), `server/runtime/boot/bootstrap.ts:6–8`, `server/inbound/admin-http/routes/system/sites.ts:40`, `routes/agent-plugins/set-enabled.ts:8`, `features/sites/site-admin.ts:22`, `cli/commands/agent-plugin-tokens.ts:12`. No `examples/` caller. (`features/publish-content/connect-destination.ts` is an unrelated same-named file.)

### Symbol inventory

| # | symbol | file:line | kind | destination | host vocabulary / injection |
|---|---|---|---|---|---|
| 1 | `AGENT_PLUGIN_CONNECT_TOOL_ID` = `"agent_plugin_connect"` | connect-tool:66 | value const, export | HOST (cardIdentity/toolId) + T-STAY re-export | tool id; used by R4 stay block; P receives `toolId` from host (already `agentPluginCardHost.connect.toolId`) |
| 2 | `AGENT_PLUGIN_CONNECT_PERMISSION` = `"admin.integrations.manage"` | connect-tool:72 | value const | HOST (permission name) | permission string; also in catalog `authorization.permission`; inject `permissions.connect` |
| 3 | `DEFAULT_POLL_INTERVAL_MS` 3000 | connect-tool:74 | value const | P (neutral default, justified: already overridable via `pollIntervalMs`) | none |
| 4 | `DEFAULT_WAIT_TIMEOUT_MS` 300000 | connect-tool:79 | value const | P (same justification) | none |
| 5 | `EXTERNAL_MCP_OAUTH_CALLBACK_PATH` = `"/api/mcp-servers/oauth/callback"` | connect-tool:84 | value const | HOST (publicUrl port) | route path; routes stay T |
| 6 | `resolveConnectRedirectUri(serverId, derivedPublicOrigin)` | connect-tool:94 | internal fn | HOST (publicUrl port: `redirectUri({serverId})`) — body stays T binder | reads `process.env.TOVU_PUBLIC_URL`; precedence env > `derivedPublicOrigin` must be preserved by the binder |
| 7 | `ResolvedAgentPluginForConnect` | connect-tool:114 | interface, export | P/connect-tool | none |
| 8 | `defaultResolveInstalledAgentPlugin({workspaceId,pluginId,agentPluginLayout})` | connect-tool:124 | fn, export | P via Lifecycle installed reads (`AgentPluginInstalledMcpReads`, P/federate-mcp:200) + `AgentPluginLayout` (P/federate-mcp:192) | T `lifecycle.ts` / `capability-projection.ts` (node:fs) become host-passed reads; no T default |
| 9 | `titleCaseFromPluginId(pluginId)` | connect-tool:138 | pure fn, export (positional scalar, existing) | P (pure) ; T shim keeps signature | none |
| 10 | `isOAuthServer(config)` | connect-tool:147 | internal guard | P | `"oauth"`/`"stdio"` = SELF config vocabulary (justified) |
| 11 | `beginSignIn({oauth,serverId,derivedPublicOrigin})` | connect-tool:160 | internal fn | P, using SignIn port `beginConnect({serverId,redirectUri?,delivery?})` + `isSignInRefusal({error})` | refusal text names `credential_save` and "restart Tovu" → HOST messages; `'hosted'` delivery and `redirect_required` are CC/hosted-mcp vocabulary (justified); unsupported-kind Error text prefixed `agent_plugin_connect:` → messages |
| 12 | `sleepOrAbort(ms, signal)` | connect-tool:179 | internal fn | P (setTimeout: universal JS, justified) | none |
| 13 | `AgentPluginConnectToolDeps` | connect-tool:196 | interface, export | P/connect-tool, reshaped `(required, optional)`-friendly; `authorize` (CORE `LegacyToolAuthorizeFn`), `mcp` (P/ports Mcp+Projections required), `externalMcpOAuth` (SignIn), `credentials` (`loadSafe`), `apiConnections` (API), `agentPluginLayout`, `isPluginEnabled` (Lifecycle), `resolveInstalledPlugin` | `UUID` CORE primitives |
| 14 | `AGENT_PLUGIN_CONNECT_DESCRIPTION` | connect-tool:217 | value string | HOST (tool/schema text) | names `search_agent_plugin_local`, `credential_save`, "restart Tovu" |
| 15 | `agentPluginConnectAgentToolCatalog` | connect-tool:233 | value, export | HOST-built: P exports a builder taking `{toolId, permission, description, pluginIdDescription}`; T shim passes bytes | schema description "e.g. from search_agent_plugin_local"; used by R4 stay block |
| 16 | `agentPluginConnectDerivedRisk` | connect-tool:254 | value Map, export | P builder keyed by injected toolId (`"mutates-durable-state"` CORE vocabulary) ; T shim | used by R4 stay block |
| 17 | `PendingOAuthServer` | connect-tool:259 | internal interface | P | none |
| 18 | `hasStoredAgentPluginCredential(row, options)` | connect-tool:268 | fn, export | P; projections REQUIRED (today defaults via T `agentPluginMcpPortsOf`) | none; T shim binds `agentPluginMcpProjectionPorts` |
| 19 | `resolvePendingOAuthServers` | connect-tool:277 | internal fn | P | error "could not be set up in this Tovu version" → messages |
| 20 | `AgentPluginConnectOptions` (`saveToken?`) | connect-tool:299 | type, export | P (extends CORE `ToolExecutionOptions`; emitSurface/executionOptions preserved) | none |
| 21 | `AgentPluginConnectResult` | connect-tool:309 | interface, export | P (moves with connect-sign-in-wait: type cycle) | none |
| 22 | `hasReusablePluginCredential` | connect-tool:321 | internal fn | P | none |
| 23 | `connectWithoutOAuth` | connect-tool:334 | internal fn | P | errors name `agent_plugin_connect`, "this Tovu version", `credential_save` → messages |
| 24 | `assertPluginCanConnect` | connect-tool:367 | internal fn | P; Lifecycle `isPluginEnabled` REQUIRED (today falls back to T `isAgentPluginEnabled`, activation-effects) | error names `plugins_set_enabled({family:"agent-plugin",…})` → messages |
| 25 | `runAgentPluginConnect({routeDeps,surfaces,ctx,pluginId}, optional)` | connect-tool:385 | fn, export | P ; T shim same signature, binds ports | permission (#2), `entityType "agent-plugin"` (host vocabulary → inject with permission), errors → messages; ctx clone preserved |
| 26 | `connectAndReviewMcp` | connect-tool:442 | internal fn | P | note text neutral ("Your sign-in was saved…") moves unchanged (justified) |
| 27 | `retainedOAuthServers` | connect-tool:459 | internal fn | P | none |
| 28 | `approveSignedInAccess` | connect-tool:474 | internal fn | P + **approvals port** (replaces T `approvalToolHandler`/`notConfirmedResult`, A `contracts/core/human-confirm.ts`) preserving authority/fingerprint (`prepared.key`)/ctx/principal/emitSurface | `errorCode 'AGENT_PLUGIN'`, `entityType 'agent-plugin'`, permission, approval title/description/confirmLabel ("Allow access for…", neutral) ; `scope {personId, siteId}` is T approval vocabulary → approvals port; uses P `previewAgentPluginEnableAccess` (messages = T `tovuEnableAccessMessages`, HOST) and P `recordAgentPluginAccessDeclined` (actor injected via `AgentPluginConnectActors`) |
| 29 | `currentSignedInAccess` | connect-tool:515 | internal fn | P | neutral refusal text |
| 30 | `waitAtMcpSignInCard` | connect-tool:529 | internal fn | P | missing-emitter text names `agent_plugin_connect` → messages (same string as #46) |
| 31 | `waitForMcpConnection` | connect-tool:556 | internal fn | P (Date.now: universal; justified, unchanged timing) | none |
| 32 | `findPluginOAuthCard` | connect-tool:587 | internal fn | P (credentials `loadSafe`, `saveKind "oauth"` = CC/credentials vocabulary) | none |
| 33 | `connectDeclaredApiConnectionOrRefuse` | connect-tool:592 | internal fn | P + API port (`sharingAvailable/listConnections/connect`) + `ownerPrincipalId` | permission `'system.write'` → HOST; errors name `agent_plugin_connect`, "this Tovu version" → messages; cancel `next` text neutral |
| 34 | `AGENT_PLUGIN_ACCESS_TOKEN_PERMISSION` = `"admin.integrations.manage"` | access-token-tool:47 | value const | HOST (permission) | permission string |
| 35 | `AgentPluginTokenTargetDeps` | access-token-tool:52 | type, export | P (Pick of #13 + CORE `Clock`) | none |
| 36 | `AgentPluginAccessTokenToolDeps` | access-token-tool:57 | interface, export | P; external type users `write-note-tool.ts:8`, `assistant/tool-registrations.ts:149`, R4 block — T shim re-exports type | `credentials: PluginCredentialsPort`, `preferences.locale` (preferences port) |
| 37 | `MESSAGES` (tokenInvalid/blankToken/saveFailed) | access-token-tool:72 | value object | P (neutral copy, unchanged; justified) — `tokenInvalid` goes through host `translateCredentialMessage` | none |
| 38 | `UnansweredReason`, `SetAccessTokenResult` | access-token-tool:78–79 | internal types | P | none |
| 39 | `TokenAuthTarget` | access-token-tool:84 | interface, export | P (uses SELF `AgentPluginTokenAuth`, `RemoteMcpServerConfig`) | none |
| 40 | `hostOf(url)` | access-token-tool:91 | internal fn | P (URL global, justified) | none |
| 41 | `requireTargetRow` | access-token-tool:106 | fn, export | P | errors name `agent_plugin_set_access_token`, "this Tovu version" → messages |
| 42 | `resolveTarget` | access-token-tool:128 | fn, export | P (provision via P `provisionAgentPluginMcpServers`, which needs host `classifyTrust` + `tovuFederationMessages`) | errors name `agent_plugin_set_access_token`, "this Tovu version" → messages |
| 43 | `probeToken({probeUrl,token,credentials})` | access-token-tool:157 | fn, export | P; **token validation** (`assertCredentialToken`, T `contracts/core/credential-token.ts` → `@jini-ai/platform`) must become injected (credentials validator) — see risk R1 | none |
| 44 | `joinStoredList` | access-token-tool:163 | internal fn | P | none |
| 45 | `saveStaticAccessToken` | access-token-tool:175 | fn, export | P (Mcp `saveServer`) | `transport "streamable_http"`, `authMode "static_env"` = CC/hosted-mcp record vocabulary (justified, saved bytes unchanged) |
| 46 | `describeSaveError` | access-token-tool:201 | internal fn | P; `credentialText({id:"storage",locale:"en"})` → messages port; original error object + Mcp `classifyError` preserved | none |
| 47 | `saveSubmittedAccessToken` | access-token-tool:214 | internal fn | P; `credentialText`/`translateCredentialMessage`/`CredentialInputError.rule` → messages + validator; `describeSavedTokenSwitch` (T-only, switch-on-saved-token:48) → HOST messages; P `switchOnSavedTokenConnection` same package | refused/unavailable/switch-failure copy neutral (justified) |
| 48 | `accessTokenResult` | access-token-tool:245 | internal fn | P (CORE `SurfaceCardSecretRun` replaces UI `SecretCardRun`) | `credentialText(blank)` → messages |
| 49 | `saveAgentPluginToken({routeDeps,surfaces,ctx}, optional)` | access-token-tool:259 | fn, export | P; `defineSecretCardTool` → **Cards<Resource>** port (`SurfaceCardsPort.defineSecretCardTool`); `askThenReport` → host exchange helper (CORE `SurfaceAskThenReport` type); `CREDENTIAL_SAVE_TOOL_ID` → HOST (token cards keep `credential_save` lifecycle) | `toolId credential_save`, `uriHost: "tovu"` → cardIdentity.uriNamespace; `frameSize ["100%","380px"]` (neutral, justified); `saveKind "agent-plugin-token"` (CC/credentials vocabulary, justified); prepare errors name `agent_plugin_set_access_token` → messages; permission #34; `entityType "agent-plugin"` |
| 50 | `agentPluginConnectSurfaceUri({pluginId,uriNamespace})` | connect-card-ui:26 | internal fn | P; builds `ui://${uriNamespace}/${pluginId}` — with brief cardIdentity `{uriNamespace:"tovu"}` P must append neutral suffix `agent-plugins-connect` (justify) so bytes stay `ui://tovu/agent-plugins-connect/<id>` | URI |
| 51 | `AgentPluginConnectCardSpec` | connect-card-ui:30 | type, export | P | none |
| 52 | `buildAgentPluginConnectCardWithPorts<Resource>` | connect-card-ui:42 | generic fn, export (S3 seam) | P; `cards: AgentPluginCardBuilders<Resource>` (Omit<…,'waitAtSignInCard'>), identity → cardIdentity | neutral card copy ("Let's connect…", "It's free and takes about two minutes.", "Skip", "Connected ✓") moves unchanged (justified) |
| 53 | `buildAgentPluginAccessTokenFormWithPorts` | connect-card-ui:72 | fn, export | P + **CredentialCardForms<Form>** (`credentials.apply({card?,form})`) ; app from cardIdentity.appNames.tokenForm | **"Tovu checks it with …"** product copy → HOST messages; `@example` URL `https://supabase.com/dashboard/account/tokens` in JSDoc (doc only; reword to neutral example or keep with justification) |
| 54 | `buildAgentPluginAccessTokenOutcomeWithPorts` | connect-card-ui:108 | fn, export | P; app from cardIdentity.appNames.tokenOutcome | "Connection" label neutral |
| 55 | `buildAgentPluginConnectCard` / `…AccessTokenForm` / `…AccessTokenOutcome` | connect-card-ui:125/128/131 | T host entries | T-STAY shims binding `agentPluginCardHost` | — |
| 56 | `agentPluginCardHost` (card-host-bindings.ts:4–8, not one of the nine) | card-host-bindings:4 | T value | T-STAY: becomes the host's `{cards: mcpUiCards, askThenReport, cardIdentity}` | `tovu/agent-plugins-connect`, `tovu-agent-plugins-connect`, `tovu-agent-plugins-access-token[-outcome]`, `tovu/sign-in-destination`, `agent_plugin_connect`, version `"1"`; imports `@jini-ai/ui` + `@jini-ai/daemon` (allowed in T host only) |
| 57 | `Destination` = `'site'|'shared'` | connect-destination:7 | internal type | P | none |
| 58 | `selectedDestination(params)` | connect-destination:10 | internal fn | P (CORE `SURFACE_EXCHANGE_ID_PARAM`) | "No site identity…" neutral |
| 59 | `chooseApiConnectionDestinationWithPorts<Resource>` | connect-destination:23 | generic fn, export (S3 seam) | P; cards + askThenReport + cardIdentity (`sign-in-destination` suffix) + toolId | channel `'mcp-ui'` (×2) → HOST channel; **"this Mac"** description/option labels → HOST messages; "Continue to sign in", "Use only on this site" neutral; frame `['100%','1px']` justified |
| 60 | `chooseApiConnectionDestination` | connect-destination:53 | T host entry | T-STAY shim | binds `agentPluginCardHost.destination` |
| 61 | `waitAtAgentPluginSignInCardWithPorts<Resource>` | connect-sign-in-wait:13 | generic fn, export (S3 seam) | P; `cards: AgentPluginCardsPort<Resource>` (waiter generic callback), `surfaceExchanges` CORE `SurfaceCardSecretDeps['surfaceExchanges']` | `missingEmitterMessage`, `skippedResult.next` are already params |
| 62 | `waitAtAgentPluginSignInCard` | connect-sign-in-wait:31 | T host entry | T-STAY shim | binds missing-emitter text (`agent_plugin_connect:` prefix) and skipped copy |
| 63 | `GrantSignedInDefaultsDeps` | grant-signed-in-defaults:46 | type, export | P (projections REQUIRED; `clock` CORE; `warn` REQUIRED or host-bound) | — |
| 64 | `GrantDeclaredToolsOptions` | grant-signed-in-defaults:60 | internal interface | P (= brief `optional` of grant callback + `onlyNeverGranted`) | — |
| 65 | `connectGrantFor` | grant-signed-in-defaults:71 | internal fn | P (`createApplyConnectDefaults` already P; needs `actors` injected) | — |
| 66 | `grantConnection` | grant-signed-in-defaults:78 | internal fn | P; `CONNECT_DECLINED_ACTOR` → `AgentPluginConnectActors.connectDeclined` (HOST) | actor id |
| 67 | `grantFailure` | grant-signed-in-defaults:92 | internal fn | P | error names `plugins_set_enabled` → messages; `[agent-plugins]` log prefix (package domain, justified) |
| 68 | `grantDeclaredToolsToSignedInRows(required, optional)` | grant-signed-in-defaults:106 | fn, export | P; matches brief grant callback `(required{deps,pluginId,servers}, optional{skipServerKeys?,approvedEnable?})` | `console.warn` default → HOST `warn` |
| 69 | `eligibleGrantRow` | grant-signed-in-defaults:130 | internal fn | P | — |
| 70 | `grantDeclaredToolsAtBoot(deps, log)` | grant-signed-in-defaults:143 | fn, export (positional) | P as `(required{deps,log}, optional)`; T shim keeps `(deps, log)`; activations via Lifecycle `getActivation`/reader (today T `agentPluginActivations`) | log copy neutral, `[agent-plugins]` prefix |
| 71 | `TokenSignInPlugin` | token-sign-in:17 | interface, export | P | — |
| 72 | `soleTokenAuth` | token-sign-in:26 | internal fn | P | — |
| 73 | `listTokenSignInPlugins(workspaceId, listPlugins)` | token-sign-in:37 | fn, export (positional scalars) | P as object API; T shim keeps signature (callers sites.ts:40, new-site-agent-plugin-tokens.ts:11) | — |
| 74 | `TokenCheckOutcome` | token-sign-in:50 | type, export | P | — |
| 75 | `checkAgentPluginAccessToken(deps, input)` | token-sign-in:56 | fn, export | P as `(required, optional)`; T shim keeps signature (site-admin.ts:22, cli agent-plugin-tokens.ts:12) | — |
| 76 | `AGENT_PLUGIN_TOKEN_IMPORT_ACTOR` = `"system:token-import"` | import-access-token:33 | value const, export | HOST actor (saved bytes) | actor id |
| 77 | `ImportAgentPluginAccessTokenDeps` | import-access-token:35 | interface, export | P | — |
| 78 | `ImportAgentPluginAccessTokenOutcome` | import-access-token:41 | type, export | P | — |
| 79 | `importAgentPluginAccessToken(deps, input)` | import-access-token:51 | fn, export | P object API; T shim (bootstrap.ts:6, pending-agent-plugin-tokens wiring) | URL-mismatch Error text neutral |
| 80 | `InstalledAgentPluginServers` | import-access-token:80 | interface, export | P | — |
| 81 | `listInstalledAgentPluginServers` | import-access-token:89 | fn, export | P via Lifecycle installed reads + layout (today T lifecycle.ts/capability-projection.ts, node:fs) | — |
| 82 | `TokenImportLog` | import-access-token:103 | interface, export | P | — |
| 83 | `ImportAgentPluginAccessTokensFromEnvDeps` | import-access-token:108 | interface, export | P | — |
| 84 | `envDeclarations` | import-access-token:114 | internal fn | P | env var NAMES come from plugin metadata (`importFromEnv`, `retiredEnv`) — neutral; JSDoc line 18 cites `TOVU_SUPABASE_MCP_…` (comment; reword or justify) |
| 85 | `importAgentPluginAccessTokensFromEnv(deps, env, log, options)` | import-access-token:130 | fn, export | P object API; `env` stays a host-passed value (the `process.env` read is in T bootstrap, T-STAY) | — |
| 86 | `EnvDeclaration` | import-access-token:155 | internal type | P | — |
| 87 | `reportRetiredEnv` | import-access-token:158 | internal fn | P | log copy neutral |
| 88 | `importDeclaredEnvToken` | import-access-token:167 | internal fn | P | `AGENT_PLUGINS_SCREEN` (`"Add-Ons → Agent Plugins"`, T switch-on-saved-token:14) → HOST messages/screen name; "site credential store" wording → messages |
| 89 | `TOOL_RENAMES_ACTOR` = `"system:tool-renames"` | apply-tool-renames:29 | value const | HOST actor (saved `writeGrantsUpdatedByPrincipalId` bytes) | actor id |
| 90 | `ApplyAgentPluginToolRenamesDeps` | apply-tool-renames:31 | interface, export | P (`externalMcpServerRepo: Mcp repo`, `clock`) | — |
| 91 | `readToolList` | apply-tool-renames:45 | internal fn | P | — |
| 92 | `renameToolNames(names, renames)` | apply-tool-renames:60 | pure fn, export (positional) | P; keep export as-is only if still exported by T shim | — |
| 93 | `renameRowTools` | apply-tool-renames:67 | internal fn | P (CORE `nowIso`) | — |
| 94 | `applyServerToolRenames` | apply-tool-renames:97 | internal fn | P | log copy neutral, `[agent-plugins]` |
| 95 | `applyAgentPluginToolRenames(deps, log)` | apply-tool-renames:136 | fn, export | P object API; T shim (bootstrap.ts:7) | — |

### Imports the nine take, and what each becomes

| import | value/type | in | becomes |
|---|---|---|---|
| `@jini-ai/core` (ToolInputError, redactSecrets, requireInputRecord, adaptLegacyAuthorize, requireToolPermission, SURFACE_* params; types) | value+type | most | CORE (allowed) |
| `@jini-ai/core/primitives` (Clock, nowIso, UUID), `/contracts/credentials`, `/contracts/cards` | type (+`nowIso` value from primitives) | several | CORE / CC (allowed) |
| `@jini-ai/cms/core` adaptLegacyAuthorize, requireToolPermission | value | access-token-tool:7–8 | **forbidden in P** → same CORE exports (as connect-tool already does) |
| `@jini-ai/ui/mcp-ui/secret-card` defineSecretCardTool / SecretCardRun | value / type | access-token-tool:10 | Cards<Resource> port / CC/cards `SurfaceCardSecretRun` |
| `@jini-ai/daemon/surface-exchanges` askThenReport / AssistantSurfaceDeps | value / type | access-token-tool:12, connect-tool:12, destination:2, sign-in-wait:5 | host `askThenReport` (CORE `SurfaceAskThenReport`) / P-local `{ surfaceExchanges: SurfaceExchangeStore }` (CORE type) |
| `@jini-ai/agent-plugins/lifecycle` AgentPluginTokenAuth | type | access-token-tool:18, token-sign-in:6 | SELF |
| `./service-ports.js` (OAuth, SignIn, Credentials, Preferences, ApiConnections, Cards, CardBuilders, McpContext; Mcp/Record/Projections already re-exported from P) | type | 7 files | P/ports (move remaining T port declarations; OAuth start type from CC/hosted-mcp `ExternalMcpConnectStart`) |
| `../../contracts/core/human-confirm.js` approvalToolHandler, notConfirmedResult | value | connect-tool:5 | approvals port (HOST) |
| `../../contracts/core/plugin-credential-card.js` | type | access-token-tool:3 | CC/credentials `PluginCredentialCard` |
| `../../contracts/headless/index.js` CREDENTIAL_SAVE_TOOL_ID | value | access-token-tool:4 | HOST toolId |
| `../../contracts/core/credential-copy.js` credentialText, translateCredentialMessage | value | access-token-tool:5 | messages port (locale-aware, HOST; 601-line T table stays T) |
| `../../contracts/core/credential-token.js` assertCredentialToken, CredentialInputError | value | access-token-tool:6 | injected validator (wraps `@jini-ai/platform`; P cannot import) — risk R1 |
| `./enable-access.js` previewAgentPluginEnableAccess | value | connect-tool:6 | P same package, messages HOST (`tovuEnableAccessMessages`) |
| `./apply-connect-defaults.js` recordAgentPluginAccessDeclined, CONNECT_DECLINED_ACTOR, createApplyConnectDefaults | value | connect-tool:7, grant:5 | P same package, actors HOST |
| `./mcp-host-bindings.js` agentPluginMcpPortsOf | value | connect-tool:13, grant:12 | removed in P (projections required); T shims call `withAgentPluginMcpPorts` |
| `./federate-mcp.js` deriveAgentPluginConnectionId, provisionAgentPluginMcpServers | value | 5 files | P same package; provision needs HOST `classifyTrust` + `tovuFederationMessages` |
| `./capability-projection.js` readInstalledMcpServers; `./lifecycle.js` listInstalledPlugins/preferBundled…/readBundled… | value | connect-tool, import-access-token | Lifecycle installed reads (`AgentPluginInstalledMcpReads`, HOST-passed) |
| `./activation-effects.js` isAgentPluginEnabled, agentPluginActivations | value | connect-tool:22, grant:4 | Lifecycle activation (`isPluginEnabled` / activation reader) HOST |
| `./layout.js` AgentPluginLayout | type | 5 files | P/federate-mcp `AgentPluginLayout` |
| `./mcp-metadata.js` McpServerConfig, RemoteMcpServerConfig | type | 6 files | SELF lifecycle types |
| `../api-connections/contribution.js` DeclaredApiConnection | type | connect-tool:24 (+service-ports) | P/ports generic `AgentPluginApiConnectionsPort<Connection>` (opaque pass-through) — no integrations import |
| `./switch-on-saved-token.js` switchOnSavedTokenConnection, describeSavedTokenSwitch, AGENT_PLUGINS_SCREEN, SwitchOnSavedTokenDeps | value+type | access-token-tool:20, import-access-token:8 | P same package (switch); describe + screen → HOST messages |
| `./card-host-bindings.js` agentPluginCardHost | value | card-ui, destination, sign-in-wait | T-STAY (host shims only) |

### Host vocabulary (each to be injected or justified; none may get a T default inside P)

Tool ids: `agent_plugin_connect` (#1), `credential_save` (#49 toolId; also in refusal/description copy), `agent_plugin_set_access_token` (error prefixes #41/#42/#49), `search_agent_plugin_local` (#14/#15), `plugins_set_enabled` (#24/#67). Permissions: `admin.integrations.manage` (#2/#34), `system.write` (#33); entity type `agent-plugin`; approval errorCode `AGENT_PLUGIN`. Card identity: `ui://tovu/agent-plugins-connect/<pluginId>` app `tovu-agent-plugins-connect` v1; `ui://tovu/sign-in-destination/<exchangeId>`; `uriHost "tovu"` (token secret card); `tovu-agent-plugins-access-token`, `tovu-agent-plugins-access-token-outcome` v1; `tovu-plugin-credential-card` v1 is built by the credentials `apply` port (UI side, not in these files). Channel `mcp-ui` (#59). Screen `Add-Ons → Agent Plugins` (#88). Actors `system:token-import` (#76), `system:tool-renames` (#89), connect-declined/connect-defaults actors (#66). Product copy: "this Tovu version" (#19,#23,#33,#41,#42), "restart Tovu" (#11,#14), "Tovu checks it with" (#53), "this Mac" (#59). Env/route: `TOVU_PUBLIC_URL`, `/api/mcp-servers/oauth/callback` (#5/#6). Example URLs: `https://supabase.com/dashboard/account/tokens` (JSDoc #53), `TOVU_SUPABASE_MCP_…` (JSDoc import-access-token:18). Catalog module path `features/agent-plugins/connect-tool.ts` (tool-registrations.ts:143, T-STAY; still valid while connect-tool.ts remains as a T shim). `external_mcp_save` guidance: not present in these nine (lives in other T files) — nothing to inject here. Justified neutral constants: poll/timeout defaults, `"mutates-durable-state"`, `streamable_http`/`static_env`/`oauth`/`agent-plugin-token` (CC record/credential vocabulary, saved bytes), frame sizes, `[agent-plugins]` log prefix, neutral card copy.

### R4 stay block (A/tool-registrations.ts, unchanged by A10/A11)

`buildAgentPluginConnectRegistrations` :123 (note handler wiring :125–140, `catalogModule` :143), `agentPluginConnectDomainCatalog` :151, `agentPluginConnectDomainRisk` :152, `contributeAgentPluginConnectTools` :156 (domain `"agent-plugin-connect"`). It imports `AGENT_PLUGIN_CONNECT_TOOL_ID, agentPluginConnectAgentToolCatalog, agentPluginConnectDerivedRisk, runAgentPluginConnect` (:22–27) and `saveAgentPluginToken, AgentPluginAccessTokenToolDeps` (:28–31) — after A11 these resolve through T shims (connect-tool.ts / access-token-tool.ts) that bind the moved P functions.

### A11 grant binder

C/plugin-host.ts:20 imports `grantDeclaredToolsToSignedInRows` from the T file and :98 passes it as `grantSignedInDefaults`. A11 change is the import line (:20) → moved function (via T shim or `@jini-ai/agent-plugins/connect`); :98 unchanged; port retained. Caveat in risk R5.

### Design risks found

- **R1 token validation:** `assertCredentialToken`/`CredentialInputError` (T credential-token.ts → `@jini-ai/platform` + `@tovu/contracts/secret-redaction`) are used by `probeToken` and `saveSubmittedAccessToken` (`err.rule` → message id). P cannot import platform; needs a host-injected validator. Adding it to `PluginCredentialsPort` changes the brief's credentials ABI (find/loadSafe/probe/apply); a separate required `validateToken` input is cleaner. Must keep `"invalid"` classification and per-rule localized text byte-identical.
- **R2 messages surface is large:** ~15 distinct product-bearing strings (tool ids, "this Tovu version", "restart Tovu", "Tovu checks it", "this Mac", screen name, `describeSavedTokenSwitch`, `credentialText`/`translateCredentialMessage` locale table). All are required host input under the brief; expect one messages object per tool family. Risk of exceeding "no needless messages options" is low because each item is product vocabulary, but count must be justified row by row.
- **R3 cardIdentity shape vs S3 seams:** existing `…WithPorts` seams take `{uriNamespace:'tovu/agent-plugins-connect', toolId, app}`; the brief wants `cardIdentity:{uriNamespace:'tovu', appNames}` with P appending fixed suffixes. Bytes stay identical only if suffixes `agent-plugins-connect`/`sign-in-destination` become P constants and the token secret card's `uriHost:"tovu"` reuses the same namespace. Any existing (frozen) test that calls `…WithPorts` with the old identity shape would need an advance-listed exception — NOT checked (no test reads in this run).
- **R4 approvals port:** `approvalToolHandler` (T human-confirm.ts, 311 lines, wraps a Jini approval handler + chat-delete grant + tool metadata) must become a port whose contract preserves authority re-check inside `run`, fingerprint (`prepared.key`), principal binding and emitSurface; `notConfirmedResult` shape must stay byte-identical in results. Approve→provision→sign in→revalidate order (connect-tool:410–440) must be kept exactly.
- **R5 grant one-liner:** the moved `grantDeclaredToolsToSignedInRows` needs injected actors (`connectDeclined`, apply-connect-defaults actors), required projections and `warn`. If J `connect/plugin-host`'s `GrantSignedInDefaultsDeps` does not already carry these, the T binder needs a closure (more than one line) or plugin-host deps grow — check J plugin-host deps shape before A11.
- **R6 positional public signatures:** `listTokenSignInPlugins`, `checkAgentPluginAccessToken`, `importAgentPluginAccessToken`, `importAgentPluginAccessTokensFromEnv`, `applyAgentPluginToolRenames`, `grantDeclaredToolsAtBoot`, `renameToolNames`, `titleCaseFromPluginId` are positional; P must expose `(required, optional)` while T shims keep old signatures — doubles the shim surface (~8 shims).
- **R7 runtime boundary of `./connect`:** the moved closure must not pull node:fs (`capability-projection.ts`) or T `lifecycle.ts` (diagnostics + node effects); everything installed/activation must come through Lifecycle reads, or `./connect` stops being universal (A9 note).
- **R8 api-connections types:** `DeclaredApiConnection`/`ApiConnectionConnectStatus` are T/I types; P must treat the connection as an opaque generic, otherwise it would need an integrations import (forbidden).
- No risk found that forces T byte changes, provided R1/R3 are solved as described.

### A10/A11 remaining work

1. A10 seam: add `cardIdentity`, `permissions`, `actors`, `messages`, `publicUrl` (redirect URI), approvals, validator, Lifecycle reads/activation as required inputs on in-place `…WithPorts`/portable entry points in the nine files; T entries bind current values (bytes unchanged).
2. Replace `@jini-ai/cms/core`, `@jini-ai/ui`, `@jini-ai/daemon` imports in the nine with CORE exports / ports (rows: access-token-tool:7,8,10,12; connect-tool:12; destination:2; sign-in-wait:5).
3. Move remaining T port declarations (OAuth/SignIn, Credentials, Preferences, ApiConnections<Connection>, Paths, Cards, CardBuilders, McpContext) into P/ports with second-host `@agent-note`s; verify in emitted .d.ts.
4. Make projections/activation/installed-reads/warn required (drop T fallbacks `agentPluginMcpPortsOf`, `isAgentPluginEnabled`, `defaultResolveInstalledAgentPlugin` default use, `console.warn`) inside the portable bodies; T shims supply them.
5. Object-shaped public API for the positional functions (R6) with T signature shims.
6. A10 gate tests (brief A10 Gate list): alternate opaque Resource cards, waiter callback type, forms build/apply, token save/cancel/invalid, destination site/shared/cancel, safe refusal/unknown identity, exact approvals/host copy, revert-port→red; approve→provision→sign in→revalidate order; same counters/saved/goldens; common gate.
7. A11: `git mv`-style move of the nine portable bodies into P/connect (connect-tool, access-token-tool, connect-card-ui, connect-destination, connect-sign-in-wait, grant-signed-in-defaults, token-sign-in, import-access-token, apply-tool-renames), keeping why-comments beside code; export via `./connect`; T files become thin shims; R4 stay block untouched.
8. A11 binder: C/plugin-host.ts:20 import → moved grant (R5 check first).
9. A11 gate: no moved T import (value/type), no forbidden edge, runtime-.d.ts closure, product scan of P, pins/counters/goldens, full common gate, paired pushes.
10. C-b evidence section for connect contracts/card identity/wiring after A11.

## C-b — evidence summary for independent Claude review (coordinator, 08:35Z)

This section is evidence only. It is not approval. Claude reviews it independently afterwards. Every verdict here is a builder's gate result, already recorded in the sections above.

### Inputs and clock
- Bases (verified 06:12Z): Tovu c3801c833a191be51753dcdecd133b0cad6f8945 and Jini 4044fe3c0fa34b1f903c5d20a6b4de7714cde573. Both equal `origin/cloud/extract-s3`. The XP3 original base is 35c4961af718f0f30591c46d2ea2756c4484a731.
- Review files: s3-review.md and s3-a7-review.md were in neither checkout. The S4-0 finding list in the dispatch brief was used as the authority.
- Clock (UTC): start 2026-11-09T06:11:23Z, deadline 10:11:23Z, coordinator stop decision 08:28Z, report 08:35Z. About 2h25m elapsed.
- Builder: the owner switched the builder to Claude Code Opus subagents, one per batch, run serially. The coordinator did no building.

### Per-batch results (each gate green unless stated; tips checked by ls-remote)

| Batch | Time (UTC) | Tokens (subagent) | Tovu tip | Jini tip | Gate |
|---|---|---|---|---|---|
| Setup / baseline | 06:15–06:36 | 175k | e989c75d2f8ecae4cb2931304684c60941c5825a | 4044fe3c0fa34b1f903c5d20a6b4de7714cde573 | baseline recorded (guard matches record; 13 broad-tsconfig errors = 12 known + 1 prior drift) |
| S4-0a (Main F1–F5 + cuts) | 06:37–07:03 | 282k | 8b2ef5a61f455d44ae0fe2013309fb48d4b72187 | 92b4eb7dc455f5dae3e7693a73cb08385c9b8947 | green |
| S4-0b (A7 F1–F4 + cuts + full S4-0 gate) | 07:06–07:36 | 292k | 6f42278cb3dbefe55e663c9ae3825a3a53c15aae | 92b4eb7d (unchanged) | green (S4-0 gate) |
| A8 (seam in place) | 07:33–08:03 | 221k | f82936d945630bf1ae72468946d45b096b133900 | 92b4eb7d (unchanged) | green |
| A9 (move + H0 adoption) | 08:05–08:27 | 269k | 64696b0be32d1a51e904c7ce57b7d168e752fc33 | f774b9e5c543815b43fa637137a75150aa831f5e | green |
| A10 inventory only | 08:28–08:33 | 171k | d63f9aa787e8918676e818b588459ede23511ba3 (report-only) | f774b9e5 (unchanged) | n/a (no code) |

- Batch overruns against the per-builder token target: S4-0a and S4-0b came close to the 300k per-agent ceiling (about 1.2× a 230k target). The A10 inventory used 171k against its 110k limit (1.55×).
- Running token total, coordinator included: about 1.50M of the 1.7M cap.
- **Last green paired SHAs:** Tovu 64696b0be32d1a51e904c7ce57b7d168e752fc33 and Jini f774b9e5c543815b43fa637137a75150aa831f5e. That pair is the A9 gate.
- The current tips are Tovu d63f9aa7 plus this report-only commit, and Jini f774b9e5.

### Guard / checker / custody at the last green gate (A9, verified by the builder from the full output)
- Full `pnpm guard` exits 1 with "2 guard violation(s)", exactly the record:
  - R2-deep-path(1) and R10-chatpane-public-surface(1); R13 is informational
  - HW1 17, HW2 16, HW3 135, HW4 1, HW8 49, all with 0 new; HW5/6/7/9 are 0
  - **N1 = 0.** A9's first run had N1 ×3 in the moved files. The fix made that copy host input and reworded 5 comment lines neutrally; the exact diffs are in the message of Jini commit 0506634875ecd8d6a63f0e4467de8c25dbf2cec1.
- guard:plugins is clean. Layers 0 and isolation 0; SI audits 9 and 7.
- `pnpm check:cross-package` with JINI_DECLARATION_BASELINE_DIR set to the immutable XP3 snapshot reports XP1–XP5 clean. Snapshot provenance:
  - manifest.json SHA256 d836eba0…d459, identical to S3's
  - aggregate listing SHA256 08b79774…7048
  - 3308 mappings and 3320 .d.ts files; unchanged at every gate
- Custody:
  - 28/28 pins unchanged; tool-metadata.baseline.json still a0d6b428…a0b6
  - existing-test edits only at the listed exceptions; exact diffs in s40a-/s40b-frozen-test-diffs.txt
  - Known reds only: T plugin-host.integration test 9, and the 13 broad-tsconfig errors.
- One pre-existing hang outside the named matrix: features/plugin-runtime/__tests__/unit/plugin-enable-access.regression.test.ts passes 3/3 but never exits. It hangs at S3 code too. Its PIDs were killed one by one.

### Points flagged for the independent review
1. **Grant order (A8/A9).** The brief says the grant runs "after provisioning/before reporting failures". The actual Tovu order is provision → failure warnings (or the refusal on an approved enable) → grant. The builders kept the actual order (same order, frozen tests) and pinned it in the @agent-note and in the tests (Tovu C/__tests__/portable-plugin-host.unit.test.ts and Jini examples/neutral-host/src/connect-plugin-host.test.ts). The report records this as a citation correction.
2. **Legacy no-ports fallback.** After A8 it lives only in the thin Tovu shims (`withAgentPluginMcpPorts`), and the portable bodies in Jini take required ports. Check that no custom-host path can reach a Tovu projection.
3. **F2 notes in an S5-owned file.** S4-0b added 3 comment hunks to T contracts/core/external-mcp-access.ts. S5 commit 9355bd8c turns that file into a re-export shim, so at merge these notes must move to S5's canonical declarations.
4. **H0 adoption.** Only core hosted-MCP type files (contracts/hosted-mcp.ts and hosted-mcp/{vocabulary,record,config}.ts) and the core package.json export entries were copied byte-for-byte from S5 at 183915bb. Their upstream commits are 27063efc and 60f59307. No S5 runtime, mcp/**, integrations/**, oauth/flow or Tovu part was taken.
5. **Neutral-host connect test (A9) was not mutation-tested.** The A8 tests carry mutation proof.
6. **Lazy-getter shim red, fixed twice** (A8 follow-up and Tovu e19646a3 in A9). A shim spread read a test fixture's lazy getter. Check the `withAgentPluginMcpPorts`/`withOverrides` copies.
7. **The F1 toolPermission requirement breaks direct registrar callers.** The changeset says so (Jini .changeset/extract-s4-tool-permission.md).

### S5 overlap / outside-scope summary
- Jini I/{byo-client,host-ports,host,hook-http}.ts (S4-0a F2, F3 and cuts) overlap S5's I/** area. The hunks are itemised in the S4-0a section.
- Tovu contracts/core/external-mcp-access.ts has comments only (see point 3).
- Jini core/** has only the byte-identical H0 adoption.
- Tovu C/** and route files (S4-0b, A8, A9) had 0 lines of S5 change when checked.
- No S5 branch was pushed to, merged, or had its runtime adopted.

### Remaining work (numbered)
1. A10, seam in place: see "A10 inventory" above (95 symbol rows, 8 design risks, and a 10-item list). The highest risks:
   - R1, the token validator. `@jini-ai/platform` cannot be imported, so it must become a separate required host input.
   - R3, cardIdentity `{uriNamespace:'tovu', appNames}` versus the existing `WithPorts` callers passing `'tovu/agent-plugins-connect'`.
2. A11: move the A10 portable symbols to P/connect while Tovu keeps the R4 stay block. The binder passes the moved grantDeclaredToolsToSignedInRows into the required grantSignedInDefaults (inventory risk R5: possibly more than one line).
3. The final accumulated gate (the full named matrix at the A11 tip) and the C-b evidence for A10/A11.
4. Moving the F2 notes onto S5 declarations at merge (point 3).

### Shutdown
- Every builder reported no process left running, with the PIDs it killed listed in its own section.
- Nothing was published, merged into main, or force-pushed.
- Builders committed by explicit paths. The brief and plan files exist only in scratch and were never committed.

Stop reason: the token cap. After the A9 gate about 310k of the 1.7M job cap was left (now about 200k). The builders that did comparable batches cost 220k–290k each, so A10 (the hardest batch), A11 and the final accumulated gate cannot finish within the cap. Only the A10 inventory was done. The wall clock still had about 1h20m before the 20-minute reserve.

EXTRACT-S4 STOPPED AT CAP

## Continuation — A10 (builder A10, EXTRACT-S4-C, 08:38–08:51Z)

Bases: Tovu 599774b8, Jini f774b9e5 (Jini **unchanged** by this batch). Skills file: Jini `AI-Dev-Shop/agents/programmer/skills.md` not loaded (dispatched task, budget). **Partial: 4 of 9 files seamed in place**; the rest is listed below with an exact plan. Stopped early on the budget rule: every remaining file value-imports `connect-tool.ts` (620 lines, R4 approvals port), which with `access-token-tool.ts` (R1) cannot be seamed and gated inside the remaining per-builder token cap.

### Implementation SHAs (Tovu cloud/extract-s4)
- e2d4f0a3 — card cycle leaves: `git mv` A/{connect-card-ui,connect-destination,connect-sign-in-wait}.ts → A/portable/<same>.ts, then edits; old paths re-created as thin T shims (unchanged signatures). New test `a10-card-seam.unit` (5) + mutation raws.
- 1b1570c0 — `git mv` A/apply-tool-renames.ts → A/portable/apply-tool-renames.ts, edits; T shim keeps `applyAgentPluginToolRenames(deps, log)` / `renameToolNames(names, renames)`. New test `a10-tool-renames-seam.unit` (2) + mutation raw.
- d8fd5673 — gate raws; renames fixture typing fix (broad tsconfig).
- Provenance: git records the portable files as A (the old path was re-created as a shim in the same commit); their parent blobs are the 599774b8 blobs of the same-named A/*.ts. Every original comment was kept beside its code; the only body changes are listed per file below.

### What changed per file (portable bodies import only `@jini-ai/core*`, `@jini-ai/agent-plugins/{connect,lifecycle}` and `./` siblings)
- portable/connect-card-ui: owns `AgentPluginCardsPort<Resource>`/`AgentPluginCardBuilders<Resource>` (T service-ports re-exports them), new `AgentPluginCredentialCardForms<Form>` (`apply({card?,form})` → host Form), **`AgentPluginCardIdentity {uriNamespace, appNames{connect,tokenForm,tokenOutcome}}`** with the brief's @agent-note, `resolveAgentPluginCardIdentity({cardIdentity,toolId})`, `AgentPluginAccessTokenFormMessages` (the "Tovu checks it with" sentence is host copy). Token form builder generic over `Form`. Removed the three T host entries (now in the shim).
- portable/connect-destination: daemon type import → core `SurfaceExchangeStore`; new required `host: {channel, messages{description, sharedOptionLabel}}` ('mcp-ui' and the two "this Mac" strings are T input).
- portable/connect-sign-in-wait: generic `<Resource, Result extends {status:string}>`, so the connect-tool ⇄ sign-in-wait type cycle needs no import back into T; T shim re-binds `Result = AgentPluginConnectResult` (old seam signature, frozen `cards-port.generic` unchanged).
- portable/apply-tool-renames: `(required{deps,log}, optional)` and `renameToolNames({names,renames})`; required `deps.actor` (saved `writeGrantsUpdatedByPrincipalId`) and `deps.listPlugins` (installed reads), both @agent-noted; Mcp repo/record types from `@jini-ai/agent-plugins/connect`, config from `/lifecycle`. T shim binds `system:tool-renames` and the old default listing lazily (layout getter read only if the default runs).
- T card-host-bindings: `tovuAgentPluginCardIdentity = {uriNamespace:'tovu', appNames:{tovu-agent-plugins-connect, tovu-agent-plugins-access-token, tovu-agent-plugins-access-token-outcome}}`; `agentPluginCardHost` = `{cards, askThenReport, ...resolveAgentPluginCardIdentity(..., toolId 'agent_plugin_connect')}`.

### R1 / R3 resolution
- **R3 (done):** smallest shape keeping every caller and the frozen `cards-port.generic.unit` (which calls `buildAgentPluginConnectCardWithPorts` with `identity:{uriNamespace:'other-host/connect',toolId,app{…,'2'}}`): the S3 `…WithPorts` low-level identity stays as-is; the required host contract is `AgentPluginCardIdentity`, resolved once by `resolveAgentPluginCardIdentity` (fixed suffixes `agent-plugins-connect`/`sign-in-destination`, version "1"). Tovu binds only through it. Bytes pinned by test (`ui://tovu/agent-plugins-connect/<id>`, `ui://tovu/sign-in-destination/<id>`, three apps v1) + alternate namespace `acme`. `tovu-plugin-credential-card` v1 is built by the host's credentials `apply` (T contracts/core/plugin-credential-card.ts, outside the nine; unchanged) — not an `appNames` member, since no portable body uses it. Token secret card `uriHost:"tovu"` is in access-token-tool (not yet seamed) → bind from `cardIdentity.uriNamespace`.
- **R1 (NOT implemented; design fixed for the next builder):** separate REQUIRED host input on the portable access-token deps, not on `PluginCredentialsPort`: `tokenValidator: { assertToken(required:{value:unknown; field:'token'}): void; inputErrorRule(required:{error:unknown}): string | null }` (@agent-note: throw your own input error; `inputErrorRule` returns its rule id or null → the original error is rethrown unchanged). `probeToken` maps any throw to `"invalid"` as today; `saveSubmittedAccessToken` maps a non-null rule to `messages.credentialText({id:rule, locale})`. T binds `assertCredentialToken` and `err instanceof CredentialInputError ? err.rule : null` (same error class/identity/bytes).

### Tests (new): red → restore evidence (raw dir cloud/reports/raw/extract-s4/)
- `a10-card-seam.unit` (5): R3 bytes pinned; alternate namespace + opaque non-UI `OtherResource` (no casts); forms port into an alternate `OtherForm` + T description bytes; destination host channel/copy with opaque resource; **static no-Tovu/no-non-core-Jini import check over every A/portable/*.ts** (also no `Tovu`, `ui://tovu`, `'mcp-ui'` text).
- `a10-tool-renames-seam.unit` (2): host actor/listing used through the object API; T shim keeps `system:tool-renames` and lazy layout.
- Mutations: suffix `agent-plugins-connect`→`connect` ⇒ 2 red (`a10-mut-identity.txt`); destination channel hard-coded 'mcp-ui' ⇒ 2 red (`a10-mut-channel.txt`); renames actor hard-coded ⇒ 1 red (`a10-mut-renames-actor.txt`); restored ⇒ green (`a10-u1-green.txt`, `a10-u2-green.txt`, diffs clean).
- Not covered (files not seamed): waiter callback type beyond the existing frozen generic test, token save/cancel/invalid, R1 injected validator, approvals order (approve→provision→sign in→revalidate; no grant before consent).

### Gate (Tovu 1b1570c0 + d8fd5673; Jini f774b9e5 unchanged, so no J build/guard rerun: guard = A9 record)
| item | result |
|---|---|
| T 41-file list (A8 28 + A10 named + S4-0b/A8 new + 9 baselines + C plugin-host.integration/portable-plugin-host/cost-counters/wiring-identity + 2 new), `a10-gate-summary.txt` | 425 tests, 424 pass; only red = plugin-host.integration test 9 (known). Per-file counts identical to A8/baseline (connect-tool.api-connections 12/12, access-token-tool 31, import-access-token 25, apply-tool-renames 20, token-sign-in 5, destination 7, …) |
| main T tsc | 0 |
| broad tests tsconfig | exactly 13 (baseline set; first run 15 = my new fixture typing, fixed in d8fd5673) |
| pin compile provider-setting-field.typecheck | 0 |
| complexity ≤10 on changed T files | 0 errors (`a10-complexity.txt`) |
| pins | 28/28, tool-metadata a0d6b428 unchanged; XP3 snapshot listing unchanged |
| custody | `git diff --name-status 599774b8 HEAD -- '*__tests__*'` = 2 A (new tests) only; no frozen test edited, no new exceptions |
| Jini | unchanged (f774b9e5); relink not needed |

### Outside scope / S5 overlap
- Touched outside the nine: `card-host-bindings.ts` (identity binding), `service-ports.ts` (card port types re-exported from portable; `SurfaceCardsPort` import dropped). `git diff origin/cloud/extract-s3 origin/cloud/extract-s5 --` each touched T path: empty (no S5 overlap).
- A stray scratch file `/a10-tsc1.txt` (tsc output, 0 bytes of errors) was written at filesystem root by an unset shell variable; removal was refused by the safety check — harmless, outside both repos, left for the owner.

### Lines / time
607 insertions, 320 deletions across 12 T files (4 portable bodies 402 lines, shims/bindings, 2 new tests 135 lines). 08:38–08:51Z.

### Remaining A10 work (exact, in DAG order) and what A11 must move
1. connect-tool.ts → A/portable/connect-tool.ts (inventory rows 1–33): approvals port (R4: authority re-check in `run`, fingerprint `prepared.key`, principal, emitSurface; approve→provision→sign in→revalidate), SignIn/Lifecycle/API ports, `permissions`/`messages`/`publicUrl.redirectUri({serverId})`, catalog/risk builders keyed by injected toolId; it then imports `./connect-sign-in-wait.js`/`./connect-destination.js`/`./connect-card-ui.js` siblings.
2. access-token-tool.ts (rows 34–49): R1 `tokenValidator` as above, Cards<Resource> `defineSecretCardTool` port + host `askThenReport`, `credential_save` toolId and `uriHost` from cardIdentity, cms→core permission helpers.
3. import-access-token.ts, grant-signed-in-defaults.ts (R5: actors/warn/projections required), token-sign-in.ts (object APIs; T shims keep positional signatures).
4. A11 moves (once 1–3 are green): A/portable/{connect-card-ui,connect-destination,connect-sign-in-wait,apply-tool-renames}.ts now, plus {connect-tool,access-token-tool,import-access-token,grant-signed-in-defaults,token-sign-in}.ts after 1–3 → `packages/agent-plugins/src/connect/`. Binder change A11 needs: T shims switch `./portable/<x>.js` → `@jini-ai/agent-plugins/connect`; the static test's directory then points at J; `card-host-bindings.ts` imports `resolveAgentPluginCardIdentity` from the J entry; C/plugin-host grant one-liner unchanged until grant is seamed (R5).

## Continuation — A10b (builder A10b, EXTRACT-S4-C, 08:54–09:1xZ)

Bases: Tovu 5ba69a99, Jini f774b9e5 (Jini **unchanged**). Skills file not loaded (dispatched task, budget). **Item 1 (connect-tool) seamed and gated; item 2 (access-token-tool, R1) NOT started** — stopped on the clock (dispatch window ~09:25Z; the gate must run on a quiescent tree, so no second item could be edited while it ran).

### Implementation SHAs (Tovu cloud/extract-s4)
- efd46913 — `git mv` A/connect-tool.ts → A/portable/connect-tool.ts, then edits; old path re-created as a thin T shim (unchanged signatures). Provenance: portable parent blob = 5ba69a99 `A/connect-tool.ts` a222c1d5. Every original comment kept beside its code; removed-to-T fragments (permission constant + its "mirrors" comment, callback path + `resolveConnectRedirectUri` with its precedence comment, `defaultResolveInstalledAgentPlugin` + comment, deps interface, tool description) were moved verbatim into the shim. One neutral reword: deps comment "`tovu-connections.json`" → "Plugin-declared OAuth API connections." (product file name; meaning kept).
- df1b8814 — new test `a10b-connect-seam.unit` (3) + raws.

### What changed (portable body imports only `@jini-ai/core*`, `@jini-ai/agent-plugins/{connect,lifecycle}`; zero sibling/T imports)
- **R4 approvals port** `AgentPluginConnectApprovalsPort<Surfaces>`: `accessApprovalHandler<Prepared>({surfaces, prepare, describe, run}, {ask, declined}) → ToolHandler` + `notConfirmedResult({reason})`. @agent-note states the contract: frozen ctx/bound principal before prepare, `run` only after explicit confirm with the bound ctx (the body's `run` itself re-checks permission + activation + `prepared.key` fingerprint, unchanged), emitSurface/options forwarded, `declined` (never `run`) on decline/expiry/abort. T binds `approvalToolHandler` / `notConfirmedResult({confirmed:false,reason})` (same objects, same bytes). Order approve→provision→sign in→revalidate is the unmoved body; proven by test + mutation.
- Ports/host inputs (each @agent-noted): `AgentPluginConnectSignInPort` (beginConnect → core `ExternalMcpConnectStart`, isSignInRefusal), `AgentPluginConnectApiConnectionsPort<Connection>` (opaque connection), credentials `loadSafe`, required `isPluginEnabled`/`resolveInstalledPlugin` (no fs default in P), `mcp` with required projection pair, and `host: AgentPluginConnectHost<Surfaces>` = toolId, permissions {connect, apiConnectionWrite}, entityType, approvalErrorCode, approvals, messages (12 members: every string naming `agent_plugin_connect`/`credential_save`/`plugins_set_enabled`/"this Tovu version"/"restart Tovu"), publicUrl.redirectUri, federation {classifyTrust, messages}, actors.connectDeclined, waitAtSignInCard, chooseDestination.
- Type cycle: resolved inside A/portable — the body never imports `connect-sign-in-wait` (host passes the waiter; the portable waiter is already generic over `Result`). T shim `connect-sign-in-wait.ts` still type-imports `AgentPluginConnectResult` from T `connect-tool.ts`, which re-exports it from portable.
- Object APIs: `titleCaseFromPluginId({pluginId})`, `hasStoredAgentPluginCredential({row, projections})`, `agentPluginConnectAgentToolCatalogFor({toolId, permission, description, pluginIdDescription})`, `agentPluginConnectDerivedRiskFor({toolId})`; T shims keep `titleCaseFromPluginId(pluginId)`, `hasStoredAgentPluginCredential(row, options)`, `agentPluginConnectAgentToolCatalog`, `agentPluginConnectDerivedRisk`, `AGENT_PLUGIN_CONNECT_TOOL_ID`, `runAgentPluginConnect({routeDeps,surfaces,ctx,pluginId}, optional)`, `defaultResolveInstalledAgentPlugin`, `AgentPluginConnectToolDeps`.
- T shim binder `tovuConnectDeps`: `withOverrides(routeDeps, {mcp: withAgentPluginMcpPorts(routeDeps.mcp), isPluginEnabled/resolveInstalledPlugin lazily falling back to the old fs reads, host})`. Behaviour note: `routeDeps.mcp` is now read once at entry (before the permission check) instead of first use; fixture/production mcp is a plain property, no observable change in any gated test. Provision now receives `tovuEnableAccessMessages` (superset of `tovuFederationMessages`, same two federation strings) — identical bytes.
- R4 stay block in `tool-registrations.ts`: untouched (imports resolve through the T shim).

### Tests (new) — raw dir cloud/reports/raw/extract-s4/
- `a10b-connect-seam.unit` (3): (1) other host (`acme_connect`, `acme.connect`, ACME, opaque `AcmeSurfaces`, own waiter/redirect) — exact flow `activation, approval:prepare, approval:run, activation, provision, begin:<host redirect>, sign-in-card, show:<url>, approval:prepare, approval:run, activation`, one sign-in start, host ids on both approvals, permission checked up front + re-checked in each `run`; (2) approval not given → log only `activation, approval:prepare, approval:expired`, no row provisioned, result = host not-confirmed bytes; (3) other-host refusal copy + Tovu bytes pinned in shim (tool id, permissions, "this Tovu version", catalog "restart Tovu").
- Mutations (each 1 red, restored by copy, `cmp` clean): describe toolId hard-coded → `a10b-mut-approval-toolid.txt`; consent guard removed (`if (!access.approved) return`) → `a10b-mut-consent-order.txt`; permission re-check in `run` removed → `a10b-mut-recheck.txt`; green `a10b-u1-green.txt`, `a10b-u1-green2.txt`.
- Static no-Tovu/no-non-core import test (A10a, globs A/portable) covers the new file: green.

### Gate (Tovu df1b8814; Jini f774b9e5 unchanged → no J build/guard rerun; guard = A9 record)
| item | result |
|---|---|
| T list `s4/a10b-gate-files.txt` = A10a's 41 + `a10b-connect-seam` (`a10b-gate-summary.txt`) | 428 tests, 427 pass; only red = plugin-host.integration test 9 (known baseline). Every per-file count identical to A10a (connect-tool.api-connections 12/12, connect-tool.unit 54, access-token-tool 31, tool-registrations.unit 26, tool-registrations.contracts 36, moved-tools goldens unchanged) |
| main T tsc | 0 (`a10b-tsc1.txt`, empty) |
| broad tests tsconfig | exactly 13, identical error lines to `a10-broad-tsc.txt` (`a10b-broad-tsc.txt`) |
| pin compile provider-setting-field.typecheck | 0 |
| complexity ≤10 (cyclomatic + cognitive) on connect-tool.ts + portable/connect-tool.ts | 0 errors (`a10b-complexity.txt`, empty) |
| pins | 28/28 OK (`a10b-pins.txt`); tool-metadata a0d6b428 unchanged; XP3 snapshot manifest d836eba0… unchanged |
| custody | `git diff --name-status 599774b8 HEAD -- '*__tests__*'` = 3 A (a10-card-seam, a10-tool-renames-seam, a10b-connect-seam) only; no frozen test edited |
| Jini | unchanged f774b9e5 (no relink/build/guard needed) |

### Outside scope / S5 overlap
- Touched only A/connect-tool.ts (shim), A/portable/connect-tool.ts, the new test. `git diff origin/cloud/extract-s3 origin/cloud/extract-s5 --` those paths: empty (no S5 overlap).

### Lines / time
71 + 651 insertions / 489 deletions in production (shim 560→ ~150 lines, portable 651 incl. new port declarations/notes), test 127. 08:54–09:07Z (+report/push).

### Remaining (A10c / A11)
1. **access-token-tool.ts** (rows 34–49) — not started. Plan unchanged: R1 `tokenValidator {assertToken({value,field}), inputErrorRule({error}) → rule|null}` as a separate REQUIRED host input (T binds `assertCredentialToken` / `err instanceof CredentialInputError ? err.rule : null`); Cards `defineSecretCardTool` port + host `askThenReport`; `credential_save` toolId + `uriHost` from `cardIdentity.uriNamespace`; `@jini-ai/cms/core` permission helpers → the same `@jini-ai/core` exports; messages (credentialText/translateCredentialMessage/describeSavedTokenSwitch, `agent_plugin_set_access_token` prefixes). It can now import `./connect-tool.js` siblings `titleCaseFromPluginId`/types from portable; `defaultResolveInstalledAgentPlugin` must become a host read (it stays T).
2. import-access-token, grant-signed-in-defaults (R5), token-sign-in (object APIs, T shims keep positional).
3. A11: move A/portable/{connect-card-ui,connect-destination,connect-sign-in-wait,apply-tool-renames,connect-tool}.ts (+ the rest once seamed) to J `packages/agent-plugins/src/connect/`; T shims switch `./portable/<x>.js` → `@jini-ai/agent-plugins/connect`; static test dir → J. `connect-tool` host waiter/destination bindings stay in the T shim.

## Continuation — A10c (builder A10c, EXTRACT-S4-C, 09:07–09:2xZ)

Bases: Tovu 70f9d183, Jini f774b9e5 (Jini **unchanged**). Skills file not loaded (dispatched task, budget). Done: item 0 (A10b regression), item 1 (access-token-tool, R1), and token-sign-in from item 2. **Not done:** import-access-token, grant-signed-in-defaults (R5) — stopped at the context-budget line, not on a design blocker.

### Implementation SHAs (Tovu cloud/extract-s4)
- 32d12ad9 — fix: connect-tool T shim reads `routeDeps.mcp` lazily (memoized getter, first read on first use = after the permission check, as before A10b) + new test `a10c-connect-lazy-mcp.unit` (1).
- f125fe53 — `git mv` A/access-token-tool.ts → A/portable/access-token-tool.ts, then edits; old path re-created as a thin T shim (unchanged signatures). Portable parent blob = 70f9d183 `A/access-token-tool.ts` 218e8422. New test `a10c-access-token-seam.unit` (4) + raws.
- 7055cd0a — `git mv` A/token-sign-in.ts → A/portable/token-sign-in.ts (parent blob 3bf1efbd), edits; T shim keeps positional `listTokenSignInPlugins(workspaceId, listPlugins)` / `checkAgentPluginAccessToken(deps, input)`. +1 test in `a10c-access-token-seam.unit` (now 5).
- fc12ff1c — this report + gate raws (pushed, ls-remote verified).

### Item 0 — A10b regression (test-first)
- Test: `a10c-connect-lazy-mcp.unit`: T `runAgentPluginConnect` with `authorize` denying and `routeDeps.mcp` as a throwing getter spy; asserts rejection is the permission refusal, permission asked once (`admin.integrations.manage`), and **zero** `mcp` reads.
- Red on 70f9d183 (`a10c-lazy-red.txt`: getter read at entry). Fix (smallest): `tovuConnectDeps` builds the overrides without `mcp`, then defines `mcp` as an enumerable getter `mcp ??= withAgentPluginMcpPorts(routeDeps.mcp)` (projection pair still bound once per call). Green with a10b-connect-seam + connect-tool.unit + connect-tool.api-connections (70/70, `a10c-lazy-green.txt`). Mutation: eager `let mcp = withAgentPluginMcpPorts(routeDeps.mcp)` ⇒ red (`a10c-mut-lazy-mcp.txt`); restored (cmp) ⇒ green (`a10c-lazy-green2.txt`). The access-token shim uses the same lazy getter (its old body also first read `mcp` after the permission check).

### Item 1 — access-token-tool (inventory rows 34–49)
Portable body imports only `@jini-ai/core`, `@jini-ai/core/contracts/{cards,credentials}`, `@jini-ai/agent-plugins/{connect,lifecycle}` and `./connect-card-ui.js`/`./connect-tool.js` siblings (static test green). Every original comment kept beside its code; removed-to-T fragments (permission constant + its comment, the two T deps types) moved verbatim into the shim.
- **R1 (resolved as decided):** separate REQUIRED `tokenValidator: AgentPluginTokenValidator { assertToken({value, field:'token'}), inputErrorRule({error}) → string|null }` on the portable tool deps (not on the credentials port); `probeToken` takes it too (any throw ⇒ `"invalid"`, unchanged); `saveSubmittedAccessToken` maps a non-null rule to `messages.credentialText({id: rule, locale})`, else rethrows the **same** error object. T binds `tovuTokenValidator = { assertToken: assertCredentialToken, inputErrorRule: err instanceof CredentialInputError ? err.rule : null }` — same class/identity/bytes; no `@jini-ai/platform` in portable code.
- Cards: `host.cards: Pick<SurfaceCardsPort,'defineSecretCardTool'>` + `host.askThenReport` (core `SurfaceAskThenReport`); `SecretCardRun` → core `SurfaceCardSecretRun`; surfaces narrowed to `{surfaceExchanges: Pick<SurfaceExchangeStore,'open'>}`. T binds `agentPluginCardHost.cards`/`.askThenReport` (mcpUiCards / daemon helper, same objects).
- Identity: `host.toolId` (T `CREDENTIAL_SAVE_TOOL_ID` = `credential_save`), `uriHost` = `host.cardIdentity.uriNamespace` (T `tovuAgentPluginCardIdentity` ⇒ `"tovu"`), form/outcome apps via `resolveAgentPluginCardIdentity(...).token` (T bytes `tovu-agent-plugins-access-token[-outcome]` v1 unchanged), form copy `host.formMessages` (T `tovuAccessTokenFormMessages`).
- Permission helpers: `@jini-ai/cms/core` `adaptLegacyAuthorize`/`requireToolPermission` → the same `@jini-ai/core` exports. `host.permission` / `host.entityType` (T `admin.integrations.manage` / `agent-plugin`).
- Messages (`AgentPluginAccessTokenMessages`, 11 members, each naming `agent_plugin_set_access_token` or "this Tovu version", plus `credentialText`/`translateCredentialMessage` and `savedTokenSwitch` (= T `describeSavedTokenSwitch`, admin screen names)). Neutral copy (`MESSAGES`, refused/unavailable/"Token saved, but…", "Token saved"/"Token not saved", frame size, `static_env`/`streamable_http`, `saveKind "agent-plugin-token"`) stays portable as justified in the inventory.
- Installed read: `resolveInstalledPlugin` REQUIRED in portable; `defaultResolveInstalledAgentPlugin` stays T (shim falls back to it lazily, as before). Federation: required `federation {classifyTrust, messages}` (T: `classifyAgentPluginMcpServerTrust` + `tovuFederationMessages`, the exact pair the old T provision wrapper defaulted to). Saved-token switch: required `switchOnSavedToken({target})` (T: `switchOnSavedTokenConnection(routeDeps, target)` with the old routeDeps defaults).
- Object APIs: portable `requireTargetRow`/`resolveTarget`/`saveStaticAccessToken` take `({routeDeps,…}, optional)` with the narrowed portable deps; `probeToken({probeUrl, token, credentials, tokenValidator})`. T shims keep every old signature and type (`AgentPluginTokenTargetDeps`, `AgentPluginAccessTokenToolDeps`, `TokenAuthTarget`, `saveAgentPluginToken`), so import-access-token / write-note-tool / tool-registrations / tool-catalog-manifest / goldens are unchanged.
- No plaintext-token tool param or model event: the tool still takes only `pluginId`; the token exists only in the form submission local.
- @agent-note on every new port/host member (messages, validator, credentials port, target deps, host, tool deps, listPlugins, checkAgentPluginAccessToken deps). The files are still T-side (A/portable), so no emitted .d.ts yet; A11 must verify attachment after the J move.

### Item 2 (partial) — token-sign-in
Portable `listTokenSignInPlugins({workspaceId, listPlugins}, optional)` and `checkAgentPluginAccessToken({deps:{…, tokenValidator}, input}, optional)`; `InstalledAgentPluginServers` (T import-access-token) replaced by the structural `{pluginId, servers}` it uses; `titleCaseFromPluginId({pluginId})`. T shim binds `tovuTokenValidator`.

### Tests (new) — raw dir cloud/reports/raw/extract-s4/
- `a10c-access-token-seam.unit` (5): (1) other host (`acme_secret_save`, namespace `acme`, own apps/form copy/askThenReport): spec toolId, `uriHost 'acme'`, form/outcome apps + copy, valid token ⇒ host validator, probe, static_env save, host switch, host next-step copy; (2) invalid ⇒ host rule id → host copy, unclassified validator error rethrown as the same object, nothing probed/saved; (3) cancel/blank results, refused (nothing saved), prepare refusal with host permission `acme.tokens` and host `onlyPluginId` copy; (4) Tovu shim: `CredentialInputError` identity + `.rule`, null for other errors, `probeToken` ⇒ `invalid`, host bytes `credential_save`/`tovu`/`admin.integrations.manage`/`agent-plugin`; (5) token-sign-in object API with host validator + installed read.
- Mutations (each red, restored by copy, cmp clean): `uriHost: "tovu"` hard-coded ⇒ test 1 red (`a10c-mut-urihost.txt`); validator rule replaced by a fixed classifier ⇒ test 2 red (`a10c-mut-validator.txt`); token-sign-in validator dropped ⇒ test 5 red (`a10c-mut-signin-validator.txt`); greens `a10c-u1-green.txt`, `a10c-u1-green2.txt`, `a10c-u2-green.txt`.
- Frozen tests: none edited.

### Gate (Tovu 7055cd0a; Jini f774b9e5 unchanged → no J build/relink/guard rerun; guard = A9 record)
| item | result |
|---|---|
| T list `a10c-gate-files.txt` (44 = A10b's 42 + 2 new), `a10c-gate-summary.txt` | 434 tests, 433 pass; only red = plugin-host.integration test 9 (known baseline). All 42 prior files' tests/pass/fail identical to `a10b-gate-summary.txt` (connect-tool.api-connections 12/12, access-token-tool.unit 31, import-access-token 25, token-sign-in 5, moved-tools access-token/credential-cards goldens unchanged) |
| main T tsc | 0 (`a10c-tsc0/1/2.txt`, empty) |
| broad tests tsconfig | exactly 13, error lines identical to `a10b-broad-tsc.txt` (`a10c-broad-tsc.txt`) |
| pin compile provider-setting-field.typecheck | 0 (`a10c-pin.txt`) |
| complexity ≤10 (cyclomatic + cognitive) on connect-tool.ts, access-token-tool.ts, token-sign-in.ts + both portable files | 0 errors (`a10c-complexity0.txt`, `a10c-complexity.txt`, `a10c-complexity2.txt`) |
| pins | 28/28 OK (`a10c-pins.txt`); tool-metadata a0d6b428 unchanged; XP3 snapshot manifest d836eba0 unchanged |
| custody | `git diff --name-status 599774b8 HEAD -- '*__tests__*'` = 5 A (a10-card-seam, a10-tool-renames-seam, a10b-connect-seam, a10c-access-token-seam, a10c-connect-lazy-mcp); no frozen test edited |
| Jini | unchanged f774b9e5 |

### Outside scope / S5 overlap
- Touched only A/connect-tool.ts (item 0), A/access-token-tool.ts + A/portable/access-token-tool.ts, A/token-sign-in.ts + A/portable/token-sign-in.ts, 2 new tests, raws. `git diff origin/cloud/extract-s3 origin/cloud/extract-s5 --` on the three T paths: empty (no S5 overlap).

### Lines / time
708 insertions / 311 deletions under apps (portable access-token 346, portable token-sign-in 80, shims 160+31, connect shim +6/-3, tests 173). 09:07–09:22Z.

### Remaining (exact) — A10 then A11
1. **import-access-token.ts** (not started): object APIs for `importAgentPluginAccessToken`/`importAgentPluginAccessTokensFromEnv`/`listInstalledAgentPluginServers` with T shims keeping positional signatures; it can import the portable `resolveTarget`/`saveStaticAccessToken` siblings (needs `federation`/`messages`/required `resolveInstalledPlugin` — the T shim reuses `tovuTargetDeps`-style binding from A/access-token-tool.ts); host env-var names/ledger read (`readBundledAgentPluginDigests`, layout) stay T as required inputs; `hasStoredAgentPluginCredential({row, projections})` from portable connect-tool.
2. **grant-signed-in-defaults.ts** (not started, R5): actors (`connectDeclined`, apply-connect-defaults actors), `warn`, projections REQUIRED; `grantDeclaredToolsAtBoot({deps,log}, optional)` with T shim `(deps, log)`; C/plugin-host binder keeps passing `grantDeclaredToolsToSignedInRows` (T shim, unchanged signature).
3. **A11** (not started): move A/portable/{connect-card-ui, connect-destination, connect-sign-in-wait, apply-tool-renames, connect-tool, access-token-tool, token-sign-in}.ts (+ the two above once seamed) to J `packages/agent-plugins/src/connect/`; T shims switch `./portable/<x>.js` → `@jini-ai/agent-plugins/connect`; static test dir → J; verify @agent-note attachment in emitted .d.ts; J build/guard/XP3/relink; final accumulated gate.

## Continuation — EXTRACT-S4-C summary (coordinator, 09:22Z)

The owner approved this continuation on the same branches with +700k tokens (subagents included) and +1.5h of clock. It started at 08:37Z, with a hard end at 10:07Z. The owner ruled on two inventory risks:
- R1: the token validator is a separate required host input.
- R3: Tovu's card identity bytes stay exactly as they are; the namespace is host input.

Item 4 (moving the F2 notes onto S5's declarations) is not started; it waits for the merge.

| Batch | Time (UTC) | Tokens | Tovu tip | Jini tip | Result |
|---|---|---|---|---|---|
| A10a: connect-card-ui, connect-destination, connect-sign-in-wait, apply-tool-renames; R3 | 08:38–08:51 | 196k | 5ba69a9955dd357bf62e07d2ba3580b1b96f4fa3 | f774b9e5 (unchanged) | gate green |
| A10b: connect-tool (R4 approvals port) | 08:54–09:08 | 230k | 70f9d183419fbe097ae6523332a03a484058ad7a | f774b9e5 | gate green |
| A10c: regression fix + access-token-tool (R1) + token-sign-in | 09:07–09:21 | 198k | cd4fbe9ff7876d29aa34c58d3f2d14cf30f46d00 | f774b9e5 | gate green |

- Continuation token use, coordinator included, is about 660k of 700k.
- **Last green paired SHAs:** Tovu cd4fbe9ff7876d29aa34c58d3f2d14cf30f46d00 and Jini f774b9e5c543815b43fa637137a75150aa831f5e. That pair is the A10c gate; this summary adds a report-only commit on top.
- Each gate: named Tovu list (44 files at A10c, 434 tests) with the only red being the known plugin-host.integration test 9, and connect-tool.api-connections 12/12; main T tsc 0; broad tsconfig exactly the 13 baseline errors; pin compile 0; complexity ≤10 with 0 errors.
- Custody at each gate: 28/28 pins and tool-metadata a0d6b428 unchanged; XP3 snapshot manifest d836eba0 unchanged; existing-test diff since 599774b8 is added files only, with no frozen test edited.
- Jini was untouched in the continuation, so the A9 guard result (matches the record, N1 = 0) still holds for Jini f774b9e5.
- S5 overlap: none on any path touched in the continuation.

### Points for the independent review (continuation)
1. **A regression introduced and repaired in the same continuation.** A10b's connect-tool shim read `routeDeps.mcp` before the permission check. A10c restored the lazy read after the check (commit 32d12ad9):
   - test a10c-connect-lazy-mcp.unit
   - red on 70f9d183, green after the fix, and a mutation that goes red again
   - raws: a10c-lazy-red.txt, a10c-lazy-green*.txt, a10c-mut-lazy-mcp.txt
2. **R3 kept S3's `…WithPorts` identity shape** so that frozen cards-port.generic.unit stays unchanged. The required host contract is `AgentPluginCardIdentity`, Tovu bytes are pinned by test, and an alternate `acme` namespace is tested. `tovu-plugin-credential-card` stays in the host's credentials `apply`, outside the nine files.
3. **R1:** `tokenValidator {assertToken, inputErrorRule}` is required by access-token-tool, probeToken and token-sign-in. Tovu binds `assertCredentialToken` and `CredentialInputError.rule`, and a malformed token keeps the same error object.
4. **The R4 approvals port** (`accessApprovalHandler`) keeps the permission re-check, fingerprint, principal and approve→provision→sign in→revalidate order inside the body's `run`. Mutations show consent-before-grant and the re-check are both enforced.
5. **Comment reword (A10b):** "tovu-connections.json" became "Plugin-declared OAuth API connections." in a moved comment.
6. **Stray file:** the A10a builder created an empty file `/a10-tsc1.txt` (0 bytes) at the filesystem root through an unset shell variable. A safety check blocked the coordinator from deleting it, so the owner needs to remove it.

### Remaining work (numbered)
1. A10, still to seam:
   - import-access-token: object APIs plus positional T shims.
   - grant-signed-in-defaults (R5): actors, warn and projections required. The C/plugin-host binder keeps passing grantDeclaredToolsToSignedInRows.
2. A11: move A/portable/{connect-card-ui,connect-destination,connect-sign-in-wait,apply-tool-renames,connect-tool,access-token-tool,token-sign-in}.ts, plus the two above, to Jini packages/agent-plugins/src/connect/.
   - T shims switch to `@jini-ai/agent-plugins/connect`.
   - The static no-Tovu-import test points at Jini.
   - Check that the @agent-notes attach in the emitted .d.ts.
   - Jini build, full guard, XP3, relink.
   - The R4 stay block in tool-registrations.ts stays in Tovu.
3. The final accumulated gate (full named matrix at the A11 tip) and C-b evidence for A10/A11.
4. (After the merge) move the F2 notes from T contracts/core/external-mcp-access.ts onto S5's canonical declarations.

### Shutdown
- Every builder reported that no process was left running; the coordinator's ps check found no vitest, node --test or tsc process.
- Nothing was published, merged into main or force-pushed.
- The brief and plan were never committed.

Stop reason: the continuation's token cap. After A10c about 45k of the extra 700k was left, which cannot fund another builder: each A10 builder used 196k–230k. A10 is 7 of 9 files seamed, and A11 and the final accumulated gate are not started. About 45 minutes of the continuation clock remained.

EXTRACT-S4-C STOPPED AT CAP

## Codex continuation — EXTRACT-S4-X

### Foundation and clock

- Serial continuation; no helper agents, Claude invocation, publication, deployment, main changes or branch replacement. The owner-supplied brief remains outside both tracked trees.
- Conservative UTC start 2026-11-09T15:01:00Z; hard deadline 18:01:00Z; shutdown reserve begins 17:41:00Z. Setup and waits count.
- Verified remotes `https://github.com/AINSEP/Tovu.git` and `https://github.com/AINSEP/Jini.git`. Clean initial tracked trees on `work`; fetched the existing S4 branch without changing its remote tip. Starting Tovu **814ab1dc61589444ac3a8eb140bab2ce8255ae64**, Jini **f774b9e5c543815b43fa637137a75150aa831f5e** exactly match the dispatch. Local `cloud/extract-s4` tracks the existing branch. Fetch refspec is restricted in this environment; explicit remote ref fetch and branch remote/merge configuration were needed (failed tracking setup changed no tracked files).
- Loaded Jini's AI-Dev-Shop bootstrap as directed; Tovu has no bootstrap. Historical target architecture is subordinate to the current owner's explicit DI/import rules. Codebase-memory and Graphify artifacts are absent; the available understand-anything graph has no matching extraction nodes. Current source and prior S4 inventories are the authority for this continuation.
- Runtime skill loaded, current environment readiness confirmed and network policy enforced. Installed Node **24.2.0**, npm **11.3.0**, pnpm **10.33.2** under `/workspace/work/tools`; caches/logs/scratch checkout outside both repositories. Initial install failed because the default npm cache is read-only; rerun with `/workspace/work/npm-cache` succeeded, without repository changes.
- On switching branches, Jini's initial checkout left `packages/plugin-ui-ux-design` residue. `git ls-files -- packages/plugin-ui-ux-design` returned zero paths; exact directory removed, initial untracked file list retained in scratch. No tracked work removed.
- The prior last-green pair remains Tovu **cd4fbe9ff7876d29aa34c58d3f2d14cf30f46d00**, Jini **f774b9e5c543815b43fa637137a75150aa831f5e** until a fresh continuation gate is recorded. Earlier withdrawn evidence remains withdrawn.

### Remaining A10 inventory confirmation (before implementation)

The existing A10 inventory rows 63–70 and 76–88 remain the symbol/destination inventory. No completed A10a–c implementation will be repeated. Required bindings for the final two files:

| Source/symbols | Destination | Required host inputs / vocabulary | Binding and second-host rule |
|---|---|---|---|
| `import-access-token.ts:33` import actor | T compatibility export; portable deps member | `system:token-import` | Stable saved principal id, supplied by host; no portable default. |
| `:35–76` deps/outcome/import body | `portable/import-access-token.ts`, then J `connect/import-access-token.ts` | existing required token target deps, switch-on callback, import actor | Same repo/vault/projections and switch owner; preserve idempotent retry/operator-off/only-at-URL rules. |
| `:80–101` installed rows/list body | same portable module | trusted installed reads: bundled ledger, preferred installed selection, MCP declarations; workspace root stays in T binding | Ledger and installed declarations from the same owner/build; fresh reads, first-id dedup and bundled digest equality unchanged. |
| `:103–181` log/env importer/helpers | same portable module | env object supplied by caller, required list function, screen name and safe import-failure copy | Env names come from installed metadata, not package defaults; only host-seeded digest may import; no importer error/token in logs. |
| `grant-signed-in-defaults.ts:46–69` deps/options | `portable/grant-signed-in-defaults.ts`, then J `connect/grant-signed-in-defaults.ts` | projection/error pair, warn, actors, required connect-defaults dependencies | Same canonical projection functions, repo, activation queue and consent owner. Optional onConnected override retained. |
| `:71–133` grant helpers/body | same portable module | connectDeclined actor and approved-failure message (`plugins_set_enabled` in T) | Preserve failed-server skip, approved key/principal, attribution, no grant before consent, real error/redaction. Neutral `[agent-plugins]` diagnostic prefix retained. |
| `:143–163` boot body | same portable module, object API | required installed listing and activation snapshot read, log | Listing then one activation snapshot; absent activation means enabled; host binds existing lifecycle read/queue, boot onlyNeverGranted unchanged. |

Caller search repeated across T apps and J packages/scripts/examples: existing T import, env-import and boot-grant callers retain positional shims; J has no runtime caller of these new APIs (plugin-host's required grant port is existing and retained). No existing test wiring edit is needed. Host filesystem/layout/environment reads stay in T bindings. The R4 registration/note/catalog/risk/contributor stay block and the after-merge F2 note move remain untouched.

### Fresh setup / baseline evidence (in progress at 15:20Z)

- Both current Jini and the clean XP3 checkout completed frozen install, core build and full recursive build with the pinned tools (all exit 0). Native install initially failed on the read-only default node-gyp cache; `XDG_CACHE_HOME`, `npm_config_devdir` and `ELECTRON_CACHE` were pointed into scratch and both frozen installs rerun successfully. No source patch or lock change.
- First actual guard: exit 1, 14 findings = five R8 package residue directories, seven SI-resolution findings for build-produced Cloudflare files, plus the two recorded debts. Full output retained as `raw/extract-s4-x/baseline-j-guard.txt`. Each of the five directories (`plugin-ai-trace-langfuse`, `plugin-analytics-posthog`, `plugin-observability-opentelemetry`, `plugin-observability-sentry`, `plugin-payments-stripe`) had zero `git ls-files` entries and was removed. The two Cloudflare imports are produced by the existing `agent-plugins/scripts/build-cloudflare.mjs`; completing the unchanged build resolves all seven SI findings. The early guard was my execution-order error, not accepted debt.
- Repaired actual guard: exit 1, **exactly two** findings: R2-deep-path ×1 `packages/plugin-catalog/scripts/generate.ts`; R10-chatpane-public-surface ×1 `packages/chat/src/react/features/chat-pane/components/ChatPane.tsx`. All HW counts match the brief: 17/16/135/1/0/0/0/49/0, every new count 0. **No N1, R8, additional SI or other finding.** All six R13 lines are informational; this environment skips Claude's unavailable handshake and compares nine live Codex ids, unlike the earlier environment. Full output read directly and retained in `baseline-j-guard-repaired.txt`; no R-only parser used.
- `guard:plugins`: exit 0. Actual layer/isolation audit: both arrays empty; SI-c 9, SI-d 7. Full closures retained in `baseline-j-layers.txt`.
- Immutable XP3 reproduction: clean clone `/workspace/work/xp3-base`, HEAD `35c4961af718f0f30591c46d2ea2756c4484a731`, frozen install/core/full build without source edits, writer executed there using the current S4 checker and absolute current tsx loader. Actual manifest has 3308 mappings, no empty outputs, 3320 declaration files plus manifest. Manifest SHA256 **d836eba0b0e29efb9fe2e79f8a1c2f61655190008d70e74c0c86ae518728d459**; lexically sorted per-file listing aggregate SHA256 **08b79774e4c55f4288f682316eefe4ea077317da8f855d2e854f3606bc987048**, both exactly match the prior verified snapshot. Snapshot made read-only, listing retained outside source. My first scratch verification sorted `Path` components rather than lexical path strings and incorrectly rejected the aggregate; corrected the verifier, verified the exact historical hashes, changed no snapshot bytes. No gate-time generation.
- Tovu frozen install, SDK build, Jini relink and contracts build have passed; main/broad type checks and the full verified 82-file current named matrix are running on unchanged source. Jini's four checker suites pass **76/76**. A scratch matrix launcher initially had a Python syntax error before running any test; repaired and rerun. This is a harness failure, not a test result.
- Actual N1 function run against the two original remaining files in a scratch package fixture (with the real unchanged policy and its allowlisted source files) reports **N1 ×2 only**: grant header `Tovu`, import header `TOVU`. This authorizes only the exact neutral comment rewordings recorded with the seam; runtime host strings will instead be injected. First incomplete scratch fixture also reported two unused-policy entries; adding the two actual source files resolved that harness omission without modifying the policy.
- All 28 pinned files matched SHA256 at continuation start. No production or existing test source has been edited.

### Baseline completion / tested foundation

- Verified 82-file T baseline: **824 tests, 823 pass, one fail**, no cancelled/skipped/todo. The only failure is `plugin-host.integration` test 9, expected `jini/charts-recharts-agent`, actual `unknown/charts-recharts`, exactly the recorded debt. All nine accumulated baselines pass. Full per-file commands follow the header's prescribed Node command; exact file lists, PIDs/exits/counts and TAP are retained under `raw/extract-s4-x/baseline/` and `t-full-files.txt`.
- All named Jini groups pass: scripts **76**, agent-plugins **100**, integrations **60**, platform **3**, UI credential-card **2**, neutral-host **37** (278 total). No claim is made about the unrelated UI sign-in-card suite, which was not part of this named run.
- Main T compile 0; broad test compile 2 with **13 diagnostics exactly identical, line-for-line, to A10c**; explicit provider-setting-field pin 0. J scripts compile 0, neutral-host compile 0, explicit excluded core/UI card-contract parity pin compile 0. Eight core/UI source/type pins were recorded before production edits, with full Git blobs/SHA256 in `core-ui-pins.json`; the 28 existing T pins remain unchanged.
- Current checker XP1–XP5 passes against the read-only original XP3 snapshot. `commands.jsonl` records command arrays, cwd, PID, raw exit and duration; later batch logs supplement that initial copy.

### A10d — final two seams (15:27–15:39Z)

**Implementation/test commits, all on Tovu `cloud/extract-s4`, pulled with rebase immediately before each verified push:**
- `8c5790fb36155592af50485c9b0c25478a4e4313`: `git mv` the two remaining original bodies into `A/portable/`, preserve rationale, add object APIs/required host inputs and positional T wrappers; add the six new tests. Jini unchanged.
- `3671bd3b400228d7f1f0d0058cfa8e766293053f`: repair the S4-added import-boundary test's regex scanner (it misread the preserved comment phrase “env import's rule” as an import). Use TypeScript's scanner, with an added regression proving comments are ignored while type imports, import-equals, import types, dynamic imports and require are all seen. This changes a new S4 test, not a frozen pre-S3 test; no expectation or case removed.
- `a0fb09645bbae7b1000e7902d9322b0ef11e6517`: pin withholding even from an injected grant callback on a declined row; repair new fixture types (valid non-null input label, length-zero assertions that avoid Node assert's `never[]` narrowing). The initial broad compile had five new test errors, all repaired; no production type errors and no frozen test edit.

**Resolved inventory / bindings:**
- Import: `ImportAgentPluginAccessTokenDeps` extends the existing portable target contract, requires stable `importActor` and `switchOnSavedToken({target})`. T reuses the existing descriptor-preserving/lazy `tovuTargetDeps` binder (only exported from the T module, not moved), binds **`system:token-import`**, the same `switchOnSavedTokenConnection`, `AGENT_PLUGINS_SCREEN`, and the exact original safe boot-warning sentence. Environment values remain supplied by the boot caller, never read by the portable body. Existing positional T entry signatures stay intact.
- Installed listing: reuse existing `AgentPluginInstalledMcpReads`, with required host workspaceRoot/lifecycle. Preserve **ledger → installed list → prefer → one MCP declaration per first id**, one ledger object for bundled digest equality, no cache. T passes the existing `tovuInstalledMcpReads`; no second owner or filesystem default.
- Env import: listPlugins and importMessages are required. Unbundled declarations cannot import; pending explicit tokens win; the URL check, idempotent switch recovery, existing credential preservation and bounded safe failure path remain the same.
- Grant: required `ApplyConnectDefaultsDeps` gives the canonical pair, same repo, lifecycle callbacks and stable `actors`; warn/approvedFailure are required. T binds existing `resolveAgentPluginMcpServers`, `switchPluginOnUnlessOperatorOff`, `isPluginOffByOperator`, `tovuConnectActors` and console warning fallback only at the old host entry. The approved-failure message still uses the exact `plugins_set_enabled` sentence and is redacted as a whole. Default grant construction stays same-package, with no new back-edge from plugin-host.
- Boot grant: object API, required listing and one activation snapshot after listing; absent activation still means on, explicit off and prior write attribution still skip. T wrapper retains `(deps, log)` and the existing activation owner. No new I/O, sealed opens, activation queue or cache added.
- `@agent-note` is attached to new deps/log/listing contracts and boot read members; A11 will verify their emitted attachment. Host vocabulary, shared custody and error rules are explicit; no unresolved A10 row remains.

**Comment custody:** original source blobs/SHA256/line counts are in `provenance-originals.json`. Both bodies were moved with `git mv`, not retyped or sliced. Original actor/default-warn/optional-listing and roster explanations stay verbatim beside their T bindings. Only N1-rejected comment lines were neutrally reworded:
1. import: `env preset (\`TOVU_SUPABASE_MCP_*\`)` → `env preset (host-provided variable names)`; exact old preset vocabulary is also retained in the T shim's rationale.
2. import: `THIS Tovu build` → `THIS host build`.
3. import: `this Tovu build seeded` → `this host build seeded`.
4. grant: `restarting Tovu` → `restarting the host`.
All original security/order/retry/never-widening reasons remain beside the moved code.

**New proof / repair / mutation:**
- `a10d-new-red.txt`: new module/API absent before the seam (expected red). `a10d-new-first.txt`: six new tests green.
- Coverage: second-host projections and `acme:*` attribution; failed-server skip and declined callback withholding; approved error guidance versus advisory warning; one listing then activation snapshot; off/prior-attribution boot refusal; no-overwrite import recovery; bundled-only/pending-token/host-screen/env safety; one ledger/first-id declaration reads. Ordinary T behavior remains covered by the frozen 25 import tests, four boot-grant tests and existing enable/projection/counter/golden groups.
- `a10d-targeted.txt`: 67/68, solely the new S4 regex false positive; scanner repair rerun green (`a10d-scanner-repaired.txt`). No production comment changed to satisfy the bad regex.
- `a10d-broad-first.txt`: 18 errors = 13 baseline + five in the new fixture. `a10d-broad-repaired.txt`: exactly the original 13 full diagnostic lines, zero additional errors.
- Four actual mutants, each raw exit 1 and inspected assertion failure: host declined actor replaced with the old fixed actor; projection pair replaced by an oauthStatus-false projection; bundled trust check bypassed; import actor hard-coded. Every source restored **byte-for-byte** in `finally`; `a10d-mutations.json` records restoration; `a10d-restored-green.txt` passes both new suites afterwards.

**A10d common gate, tested pair:** Tovu **a0fb09645bbae7b1000e7902d9322b0ef11e6517** + Jini **f774b9e5c543815b43fa637137a75150aa831f5e** (unchanged), both full remote tips verified before reporting.

| Check | Actual result / raw |
|---|---|
| T 45 files | **441 tests, 440 pass, only known publisher-identity red**; `a10d/summary.json`, individual TAP. Every baseline file's count unchanged except the new scanner test (+1); remaining-seams adds 6. |
| main T compile | 0, `a10d-tsc-first.txt` |
| broad test compile | 2, exactly the 13 baseline diagnostic lines after own fixture repair |
| complexity + cognitive ceiling 10, all five changed production files | 0 errors, `a10d-complexity-first.txt` |
| explicit T pin / core-UI parity / J scripts compile | 0 / 0 / 0 |
| J named matrix | 278/278 pass again (same six groups and counts as fresh baseline) |
| XP checker / plugins | 0 / 0, original snapshot exported as JINI_DECLARATION_BASELINE_DIR |
| actual full guard | exit 1, exactly R2 ×1 + R10 ×1, all HW totals/new counts unchanged, R13 informational, **zero N1/R8/other findings**; whole raw output read |
| layers/isolation/custody | arrays empty; SI-c9/SI-d7; 28 T and 8 core/UI pins unchanged; XP3 per-file/manifest/aggregate rechecked unchanged |
| scope / S5 | no overlap on touched source/test paths against fetched S5; R4 registration block unchanged; no new frozen-test exception |

Jini source/build/declarations remain at the fresh baseline because A10 is still seamed in Tovu. No moved declaration emission is claimed yet. Source line delta for the seam/test commit: +538/−304 across six files; scanner fix +15/−1, fixture/withholding follow-up +9/−7. Raw command arrays and exact paths are retained, not braced pseudo-paths.

**A11 preflight:** actual neutrality check on copies of the nine seamed bodies and the unchanged real policy reports one N2-consumer-path in `apply-tool-renames`'s T-specific `#src/assistant/` rationale. That entire original rationale already exists verbatim beside the T shim's notify binding. A11 will keep that host rationale there and put the portable shared-roster custody note on the J declaration. No guard/policy exemption will be added. The nine-file move, public exports, T import rewiring, declaration attachment, final accumulated gate and C-b evidence are next. The after-merge note move remains untouched.

### A11 — atomic family move and public host wiring (15:42–15:59Z)

**Pushed implementation commits:**
- Jini **f975fe2f4c2bd9c8bd616652a95464a3138e1cc3**: move exactly the nine inventoried bodies, **1833 lines**, byte-for-byte from Tovu **651febcb280e6e7f8fe1388af8e61c13a1ec5324**. `a11-verbatim-move.json` records every source path/ref/blob/SHA256 and destination path. All nine destination blobs at this commit equal their T source blobs. No implementation was retyped or sliced.
- Jini **0ccd93ce965eae248570733a8ea1e9ea4d00a632**: nine exports from the existing `connect/index.ts`, API changeset, and attached second-host custody notes. The N2-rejected host import-boundary rationale remains verbatim at T `apply-tool-renames.ts`'s notifier binding; the duplicated J comment becomes the portable same-roster custody note. No source-neutrality exception or guard change.
- Tovu **00c1fd0ab91820e85461d3918ff48e023e0f54e9**: delete the nine portable copies, rewire nine shims, two bindings and five S4-added tests to the J public entry (25 import/re-export edits). The static source test now resolves that public entry and checks **exactly all nine** moved source files. Legacy signatures, registration/note/catalog/risk/contributor, host data and UI/credential owners stay in T. The newly exported internal target binder also receives the optional object parameter; existing callers are unchanged.
- Jini **ade600935216d28694f31a6d4b04a1c3380bca58**: repair the first J build's 11 strict optional-property errors. The T compiler had accepted explicitly present `undefined` values; J's exactOptionalPropertyTypes correctly required those cases to be declared. Fifteen local optional annotations in five moved files now explicitly accept undefined, preserving the original object keys and runtime calls. **No compiler setting, core/UI pin, dependency or old test was changed.** Rebuild and package `tsc --noEmit` pass.

Both repos were pulled with rebase immediately before pushes and their full S4 tips verified. No fallback/force push or conflict was needed. Jini's final continuation delta is **11 files, +1881 lines** (nine bodies, index, changeset); Tovu's net source delta since the continuation start is **23 files, +232/−1814** (the two A10 portable files were created then moved out, so they disappear from that net diff).

**Public/runtime/declaration proof:**
- `a11-public-focused.txt`: **24/24** through public exports, including opaque non-UI Resource cards, generic callback/form types, token save/cancel/refusal/validator identity, consent and permission rechecks, lazy MCP access, import/grant trust/custody and renames. The full existing suite runs through T shims below.
- `a11-runtime-equivalence.txt`: all nine final bodies transpile to **byte-identical comment-free JavaScript** compared with the verbatim move commit. Post-move edits are contract documentation and type annotations only. Hashes and all **25 public functions** are recorded; each has a required object plus optional object parameter.
- `a11-comment-custody.txt`: **138/138 original comments retained**, checking the original continuation source against the final J body plus its T shim, with only the four individually recorded N1 substitutions. The host-specific notifier rationale is retained at its original T binding. No rationale cut to satisfy a scratch parser.
- `a11-emitted-notes-repaired.txt`: **33 declaration/member attachment checks pass**, retaining the actual attached JSDoc and declaration SHA256, not merely counting strings. These cover card identity/opaque Resource/forms, one exchange store and answer lifecycle, separate required validator/error identity, token custody, sign-in refusal/public-safe copy, approval principal/fingerprint/decline rules, same store/projections/activation owners, boot snapshot order, bundled trust and safe logs, rename attribution, five projection rules and the existing shared issued-token/frozen-account members.
- The first note verifier had six harness failures: three guessed wording needles, a nested `oauthStatus` field overwriting the intended member, and two members cited on RegistrationRequired instead of their real RuntimeHost declaration. The actual emitted notes were inspected directly; correcting the verifier's citations/traversal/needles yields 33/33 **without modifying contracts to fit it**. First red and repaired output, and the corrected verifier as text, are retained.
- Existing `./connect`, `./connect/plugin-host`, `./connect/executable` isolation mappings remain `lifecycle`. No manifest edit/new package/dependency/peer/shared bypass. Actual closure audit: connect 71 files, dependencies core + self; plugin-host 55 files/core; executable 55 files/core + existing non-Jini JSON-schema validator. Universal connect metadata remains truthful; no UI, daemon, integrations, MCP or T runtime import was introduced.

### Final accumulated gate — exact implementation pair

**Last green tested pair:**
- Tovu **00c1fd0ab91820e85461d3918ff48e023e0f54e9**, `cloud/extract-s4`.
- Jini **ade600935216d28694f31a6d4b04a1c3380bca58**, `cloud/extract-s4`.

The following report/evidence commits are report-only descendants of that T source tip. They do not claim an additional implementation test run. Both implementation tips were independently verified with `ls-remote` again at 16:05Z.

| Required check | Actual final result | Evidence under raw/extract-s4-x |
|---|---|---|
| Full verified T named matrix plus all S4 new tests | **83 files; 831 tests, 830 pass, one known publisher-identity failure; no skipped/cancelled/todo** | `a11-files.txt`, `a11/summary.json`, every per-file TAP/PID/exit, `a11-t-matrix-run.txt` |
| Per-file parity against fresh baseline | Every pre-existing count/result identical; only +1 scanner regression case and +6 new remaining-seam cases | baseline/final summaries; assertions checked directly |
| All nine accumulated baselines | pass; three moved-tool goldens, registration contracts, mail golden/parity, cost counters, wiring identity, saved-key round trip | corresponding `a11/*.txt` |
| J named matrix | **278/278**: scripts 76, agent-plugins 100, integrations 60, platform 3, UI credential-card 2, neutral-host 37 | `a11-j-matrix.json`, six named logs |
| J touched build / tsc | first build 2 (11 own exact-optional errors); repaired build 0; package tsc 0 | `a11-j-build-first.txt`, `a11-j-build-repaired.txt`, `a11-j-tsc.txt` |
| J scripts / neutral-host compile | 0 / 0 | `a11-j-scripts-tsc.txt`, `a11-j-neutral-tsc.txt` |
| T relink / contracts build / main compile | 0 / 0 / 0, J build precedes relink | `a11-t-relink.txt`, `a11-t-contracts.txt`, `a11-t-tsc-first.txt` |
| Broad T tests compile | raw exit 2, **exactly the same 13 full diagnostic lines** as the fresh baseline/A10c, zero new errors | `a11-t-broad.txt` |
| Excluded T provider-field and core/UI card parity pins | 0 / 0 | `a11-t-pin.txt`, `a11-j-card-pins.txt` |
| Cyclomatic/cognitive ceiling 10 on all changed production files | J 10 files / T 11 files: 0 errors, no inline configuration honored | `a11-j-complexity.txt`, `a11-t-complexity.txt` |
| XP1–XP5 / original XP3 snapshot | exit 0; root base remains immutable 35c4961af; no gate-time generation | `a11-j-xp.txt`, snapshot proof |
| Actual full guard | raw exit 1, exactly **R2-deep-path ×1** plugin-catalog/scripts/generate.ts and **R10-chatpane-public-surface ×1** ChatPane.tsx; complete output read directly | `a11-j-guard.txt` |
| All guard families accounted for | HW1–HW9 totals **17/16/135/1/0/0/0/49/0**, each new0; six R13 informational lines; **N1/N2/R8/additional findings 0**; summary two violations | same complete raw guard |
| Plugins / layers / isolation | 0 / [] / []; SI-c9/SI-d7 unchanged | `a11-j-plugins.txt`, `a11-j-layers.txt` |
| Pins / saved bytes / metadata | 28 T + 8 core/UI source/type pins unchanged, no old fixture regenerated | `pins.json`, `core-ui-pins.json`, custody audit |
| Snapshot immutability | 3308 mappings, 3320 declarations, nonempty mappings; manifest d836eba0… and aggregate 08b79774… unchanged and exactly the historical values | original XP3 proof and final recheck |
| Source/API custody | 9 runtime-equivalent bodies, 25 object APIs, 138 retained comments, 33 attached-note checks, no forbidden new Jini edge | dedicated proof logs and corrected proof scripts as text |
| Paired pushes | source pair above verified full tips; report-only descendants separately recorded | commit list / final task response |

The known prior reds remain visible: T publisher identity, the exact 13 broad-test diagnostics, and the two guard debts. No expectation, baseline, fixture, guard/layer/isolation/debt policy or declaration mapping was weakened to make a gate green. The unrelated UI sign-in-card errors were neither fixed nor counted as passes.

### C-b evidence for independent Claude review — ready, not self-approval

**Inputs and scope:** owner-approved EXTRACT-S4-X continuation; prior S4 report including its 95-row A10 inventory and last Remaining work list; original S3 bases T **c3801c833a191be51753dcdecd133b0cad6f8945** / J **4044fe3c0fa34b1f903c5d20a6b4de7714cde573**; continuation foundations T **814ab1dc61589444ac3a8eb140bab2ce8255ae64** / J **f774b9e5c543815b43fa637137a75150aa831f5e**; immutable XP3 **35c4961af718f0f30591c46d2ea2756c4484a731**. Prior S3 verdicts and S4-0/A8/A9 red/repair/mutation evidence remain in the earlier report sections; they were not relitigated or rewritten. The previously withdrawn S3 guard claims remain withdrawn.

The existing H0 adoption record is unchanged: adopted J **5c3235e615208f181ae2d698c83fd6ff0a32c712**, upstream type contracts **27063efcc7c0327f517429812e167174d1a80448** and neutral config comment **60f593071fbec15fda1ada9b3df886ba6c20e14c**, with paths/blobs in the earlier A9 table. This continuation changes no core/MCP/integrations/server runtime, hosted policy/store/vault, route or S5 report. No independent Claude invocation/review has been run; C-b is the evidence section for the owner to review afterwards.

| Review concern | Final evidence and custody |
|---|---|
| Owner's package/import rule | Nine bodies import only core or self; same-package ownership for grants/federation, host callbacks for other owners. XP/source/declaration/layer/isolation checks pass without new dependencies or exemptions. No umbrella/server workflow/DI container. |
| Required grant callback | Existing C/plugin-host.ts one-line grant binding stays intact and now reaches the moved body through its T shim; the required callback remains on plugin-host. Actual A8/public-host trace still provisions, reports its warnings, then invokes the grant with exact failed-server skips/approved key. Confirmed provisioning failure refuses before grant. No new back-import from plugin-host into this family. |
| Consent/order | Existing and A10b public tests retain permission recheck, bound principal/fingerprint, decline/expiry withholding and approve → provision → sign in → revalidate. No grant before confirmation, duplicate exchange or activation; new declined-callback mutant fails. |
| Card identity | Required host `uriNamespace`/app names, opaque Resource preserved through wait callback. T still supplies `tovu`, unchanged connect/destination suffixes, four app identities/version1 and `credential_save` lifecycle. The host's credential-card apply retains `tovu-plugin-credential-card`; no UI runtime or consumer identity moved into core/J defaults. |
| Host vocabulary / text/schema | Tool ids, permissions, actor ids, public URL, channel, screens, retry/product text are host inputs; neutral copy/protocol constants unchanged. Historical caller/vendor/example names in rationale remain provenance, not runtime defaults. Metadata hash **a0d6b428be4ea369f6abdf70a9892f0ce13db651ac4ac560e43dc2993fa2a0b6** and goldens unchanged. |
| R1 validator / errors | Separate required tokenValidator, original error object/rule classification; no platform import. Public failure text uses existing redaction and host copy. Unknown faults keep identity; ordinary T suffix/punctuation/refusal bytes stay pinned. |
| Canonical rows / saved state | Core hosted-mcp rows/aliases reused, not duplicated. Existing adopted fields/tokens/grants, AAD/sealed/ownerKey/principal/binding bytes, operator precedence, stale-only reprovision, non-widening renames and saved-state round trips pass unchanged. No migration, fixture re-mint or reconnect. |
| Shared instances | One exchange store with answer waking waiter, one MCP repo/vault/private context, one API host/state/vault/inbox/CAS/last-sign-in-attempt owner, one issued-token memory/frozen map, one activation queue. Final wiring/vertical-slice/security tests pass; declaration members explicitly carry the custody rules. No new owner constructed. |
| Costs / replay | The unchanged cost-counter test executes real counters against pinned JSON: **one contribution load and four credential opens per token lookup**, first and repeated; status/projection reads stay pure. Boot/connect/import/rename paths add no I/O/cache/history. Existing sealer counters, replay/idempotent import and adoption tests pass. |
| Cuts and old-test integrity | S4-0 approved cuts, BYO restoration and injected mail validator remain as recorded. Final exact audit allows only six T frozen wiring files plus J's host-seams deferred origins and owner-approved legacy-test deletion; assertions/cases retained. Full diffs saved; no new exception added. |
| Notes / rationale / portability | Actual emitted declaration attachments/content checked; all 138 original comments retained. N1's four neutral substitutions are enumerated above; N2's host-specific rationale remains verbatim at the T binding. Same runtime JS for all nine after moving. |

**Every outside path / reason / hunk / S5 check:**
- T `card-host-bindings.ts`: exactly one import line from portable card identity to the public J entry. T `service-ports.ts`: exactly one type re-export line to that entry. No other binder logic changed.
- Five S4-added test files (`a10-card-seam`, `a10-tool-renames-seam`, `a10b-connect-seam`, `a10c-access-token-seam`, `a10d-remaining-seams`) use public imports; the first also resolves/checks all nine sources. The scanner regression/fixture repairs above are new-test changes. `a10c-connect-lazy-mcp` and every frozen assertion stay intact.
- J `connect/index.ts`: one hunk, nine exports. `.changeset/extract-s4-connect-cycle.md`: one five-line API changeset. No package.json/lock/runtime/isolation mapping change.
- T `cloud/reports/extract-s4.md` and `cloud/reports/raw/extract-s4-x/**`: report, raw commands/exits/TAP, provenance/pins/diffs and reproduction scripts saved as text only. The per-path inventory accompanies the evidence; these are not production helpers or changed guards. The brief/plan remain outside tracked paths.
- Latest fetched S5 refs at 16:05Z are recorded in `a11-scope-audit.json`; comparison against their S3 bases finds **zero overlap on all continuation-touched paths**. Neither S5 branch was written or merged. A read-only audit command initially used the T SHA in J's cwd and failed “bad object”; it was corrected with explicit repo roots and the complete scope audit passes.
- The R4 registration/note/combined-catalog/risk/contributor stay block, C/plugin-host grant port and the owner's after-merge F2 note location are byte-unchanged in this continuation. Full T/J source and frozen-test diffs are retained.

**Prior pushed report-only commits in this continuation:** T **19ce05c3d3ebcd3df094d8b28bda01a87c8a92c9**, **da62d6d765c652c441d755d4c4de44dc20192e7b**, **651febcb280e6e7f8fe1388af8e61c13a1ec5324**. Source/test commits and the tested pair are listed above; later evidence-only tips are named in the final task response.

**Numbered remaining work:**
1. S4-0 through A11, final accumulated gate and C-b preparation: complete within this continuation's scope. No S4 implementation batch remains.
2. Independent Claude review: intentionally not launched; this evidence is ready for it.
3. After the merge, the owner's deferred F2 canonical-note move: intentionally unchanged, as instructed.

### Shutdown preflight

At 16:06Z the process audit checked **294 recorded command/test PIDs**: none remains present, no live test/build/repo-server process, and no termination was needed. No server was started for this extraction. Exact PIDs/exits are in commands and matrix logs; final shutdown/push attestation follows after saving this evidence. No publication, deployment, main merge, force push, S5 push, broad kill or helper-agent run occurred.
