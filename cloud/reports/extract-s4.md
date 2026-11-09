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
