# EXTRACT-S6 — plugin extraction session 6 (G-plug → L1a → L1b → L1c → F6)

Status: IN PROGRESS (coordinator updates at every batch boundary).

## Run parameters

| Item | Value |
| --- | --- |
| Owner approval | by name, 2026-11-08 |
| Builder | Claude Code coordinator + one Opus subagent per batch (owner-changed builder; brief written for Codex Cloud) |
| Caps | 1.9M tokens total, 150 min wall clock, ~5 build subagents (+≤20% follow-ups) |
| UTC start | 2026-11-09T06:26:49Z |
| UTC deadline | 2026-11-09T08:56:49Z (no new implementation batch after 08:31:49Z) |
| Tovu pin | c3801c833a191be51753dcdecd133b0cad6f8945 (origin/cloud/extract-s3) |
| Jini pin | 4044fe3c0fa34b1f903c5d20a6b4de7714cde573 (origin/cloud/extract-s3) |
| Branches | `cloud/extract-s6` in both repos, created from the pins (did not exist remotely before this run) |
| Toolchain | Node 24.2.0 (nodejs.org tarball), npm 11.3.0, pnpm 10.33.2 (corepack) |
| XP3 original base | Jini 35c4961af718f0f30591c46d2ea2756c4484a731, scratch clone outside source |

## Baseline (unmodified tree)

Setup order (raw outputs kept outside tracked source in `/home/user/s6-raw/<step>.txt`), all at the pins:

| Step | Command | Exit |
| --- | --- | --- |
| j-install | `CI=true pnpm install --frozen-lockfile` | 0 |
| j-core-build | `pnpm --filter @jini-ai/core run build` | 0 |
| j-build | `pnpm --no-bail -r build` | 0 |
| j-guard | `pnpm guard` | 1 (allowed record, see below) |
| j-guard-plugins | `pnpm guard:plugins` | 0 (clean) |
| t-ci | `npm ci` | 0 |
| t-sdk-build | `npm run build --workspace @tovu/sdk` | 0 |
| t-link | `JINI_PACKAGES_DIR=/home/user/Jini/packages npm run link:jini` | 0 |
| t-contracts-build | `npm --prefix packages/contracts run build` | 0 |
| t-tsc | `npx tsc -p tsconfig.json --noEmit` | 0 |

Tovu commands ran only after the Jini recursive build finished.

**Regression matrix at the pin (G-plug builder, raw `/home/user/s6-raw/base-<group>.txt`).** All cited paths exist; no path corrections.
- T-plugin-unit 199 tests: 198 pass, 1 red. T-plugin-integration 61/61. T-worker 27 tests: 26 pass, 1 red. T-composition 35 tests: 34 pass, 1 red. T-accumulated assistant 39/39, boot 6/6, composition 11/11, state 1/1, backup 3/3. T-admin-dto 8/8.
- J-plugin 12 files, 127/127. J-entry 1/1. J-worker 54/54. J-architecture 5/5.
- Layers and isolation: `checkPackageLayers` → `[]`, `checkSubpathIsolation` → `[]`. The audit found 573 closures and 16 findings (SI-c 9, SI-d 7), as in the brief.
- `pnpm check:cross-package` with the immutable snapshot: "XP1–XP5 clean", exit 0.

**Three pin reds that are NOT on the brief's known-unrelated list.** All three are on the unmodified pinned tree, with no S6 file present. None was fixed, and none is counted as green. Each later gate shows the same three, unchanged:
1. `T features/plugin-runtime/__tests__/unit/plugin-enable-access.regression.test.ts`, 4th test "a declined enable remains a choice when a seeded-off plugin signs in later": it hangs indefinitely. With `--test-timeout=60000` it is cancelled at 60 s and the other 3 pass. The cause is not established. The file is `plugin-enable-*`, near session 4's `enable-access` area.
2. `T server/runtime/plugin-tier2/__tests__/typescript-bootstrap.unit.test.ts` "register() installs tsx's CJS require hook…": `mock.module` observed `[]`, but the test expects `['cjs','esm']`. Suspected cause: Node 24.2.0 module-mock behaviour against a CJS require. Not proven.
3. `T server/runtime/composition/__tests__/deps-provider-plugin-boot.integration.test.ts` EACCES project-store case (line 166): the expected warning is never captured. Suspected cause: the container runs as root, so EACCES is never raised. Not proven.

These are prior or environment reds, not S6 drift. This run reports them and does not treat them as a stop condition.

**Guard baseline (read in full, 25 lines, raw SHA256 13a11f4d627bb7a493d589c666042cec85bbae5e16dbf14456b9f40a11ee3b2b):** printed total "2 guard violation(s)" = R2-deep-path(1) `packages/plugin-catalog/scripts/generate.ts` + R10-chatpane-public-surface(1) `packages/chat/src/react/features/chat-pane/components/ChatPane.tsx`. No N1, SI or unknown-identifier lines. Informational R13-model-fallback-freshness (claude MF3 16 live vs 20 fallback; codex/agy MF3 skipped, tools absent; pi/aider/opencode MF3 n/a). Hardwiring HW1 17, HW2 16, HW3 135, HW4 1, HW8 49, all "0 new"; HW5/6/7/9 0. This is identical by name, path and count to the S3 allowed record.

**XP3 immutable declaration baseline:** a separate `git clone --no-checkout` of the local Jini repo, checked out at original 35c4961af718f0f30591c46d2ea2756c4484a731 (HEAD verified, `git status --porcelain` empty before and after build), frozen install → core build → recursive build (all exit 0) with the same Node/pnpm. Writer: S3's `scripts/check-no-cross-package.ts` run by absolute path from the S6 Jini checkout with loader `/home/user/Jini/node_modules/tsx/dist/loader.mjs` (verified present), cwd = the original checkout, `--write-baseline /home/user/s6-xp3/declaration-baseline`. Output: "3308 source mappings". 3320 declaration files + `manifest.json`. **manifest.json SHA256 d836eba0b0e29efb9fe2e79f8a1c2f61655190008d70e74c0c86ae518728d459 — identical to S3's.** Counts identical to S3's (3308 / 3320). S3's aggregate snapshot hash f1b750bc… was not reproduced: its convention is not documented, and the conventions tried gave other values (sorted per-file `sha256sum` list 08b79774…, `%P` list 67bb193a…, `packages/`-only list d9f7892b…, normalized tar b77bd30e…). Equivalence rests on the identical manifest hash and counts only, not on the aggregate hash. Snapshot made read-only and exported as `JINI_DECLARATION_BASELINE_DIR` for every gate; never regenerated.

## Batch table

| Batch | Inventory commit | Implementation commits | Gate result | Tovu tip | Jini tip | Elapsed (cum.) | Tokens (cum., approx.) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| G-plug | 80a97e9e | 3f77009f (recording), 08ec5eb3, 38cd30d1; 78cf4728 inventory hashes | GREEN (new G-plug 10/10 ×4 runs; T tsc 0; strict eslint 0; plugin groups identical to baseline incl. 3 pin reds) | 78cf4728f035f40619f1a1d707fd7a46639baa5d | 4044fe3c0fa34b1f903c5d20a6b4de7714cde573 (untouched) | 06:26:49→06:52:39 (26 min) | ~0.33M (builder 249k + coordinator) |
| L1a | | | | | | | |
| L1b | | | | | | | |
| L1c | | | | | | | |
| F6 | | | | | | | |

## Overlap with sessions 4/5

_Pending._

## Remaining work / stops

_Pending._
