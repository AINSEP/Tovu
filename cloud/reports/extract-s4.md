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
1. Dispatch item 3: the legacy no-ports fallback (`agentPluginMcpPortsOf`/`agentPluginMcpProjectionPorts`) is still inside the A bodies at federate-mcp.ts:525, enable-access.ts:26/:69, apply-connect-defaults.ts:126, switch-on-saved-token.ts:67, connection-status.ts:24 (frozen tests call those exported names without ports). Planned seam: portable twins requiring `AgentPluginMcpProjectionPorts` (git mv body → `<name>` portable file, old path = `export *` + one-function T shim adding the pair), no frozen-test edit. Not started (see A8 follow-up below if present).
2. A9-status inventory rows (A8 bodies' own T imports: lifecycle.js, capability-projection.js, activation-effects.js, set-enabled.js, layout.js, mcp-metadata.js, external-mcp/api-connections/custom-credentials types; actors `system:*`; screen names; `Open Settings → External MCP` copy) are resolved to named ports/host inputs but applied when the bodies move.
