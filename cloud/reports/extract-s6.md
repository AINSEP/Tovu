# EXTRACT-S6 — plugin extraction session 6 (G-plug → L1a → L1b → L1c → F6)

Status: **COMPLETE.** G-plug → L1a → L1b → L1c → F6 are all green, and the paired pushes are verified. Elapsed 06:26:49Z→08:10Z (about 103 of 150 minutes). Tokens about 1.50M of the 1.9M cap: 7 Opus subagents used about 1.32M, the coordinator about 0.18M.

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
| L1a | Tovu b7161e80f9356b05bb7cde120943966569909e22 | Jini d775c6811e0d16abd2166abdbe9966e4562b5186, 01b36f27e72b87e54de949436223d8ed9c4561fc, 1f7bcbe13884d5e9639b0a9470af1b27c8c11bc2; Tovu f700769d07c6c4406e5cd7fcbfd4b0bf5a92638f, c56b4db8e3c71372f15971d2fdfe10d09bda85b3 | GREEN: J build/tsc 0; J vitest 22/22 (5 files, including new second-host proof); XP1–XP5 clean; guard output byte-identical to baseline (diff empty); guard:plugins 0; layers []/isolation []/audit 16; strict eslint 0 in both repos; plain-Node smoke OK; T link+tsc 0; G-plug 10/10; T declarative/host-binding/install matrix 78/78; frozen SHA256s OK; 28/28 @agent-notes in emitted .d.ts; T binder 54 code lines | c56b4db8e3c71372f15971d2fdfe10d09bda85b3 | 1f7bcbe13884d5e9639b0a9470af1b27c8c11bc2 | 06:52:39→07:09:03 (42 min cum.) | ~0.53M (builder 187k) |
| L1b part 1 (capability tools) | Tovu c2e4cc8c04371970572ce4ac18ba7ddc71fe14f5 | Jini 152c4551f5368070264188759b6d46f23c1f2e56, f50df47eda786aedfadd52aae8cd1debf75cede1, bcb0c0a1968ebf998bb87159bcb9190dcdd7909d, ecefd458e45bdf8556654a4f3e2de98ffda10823; Tovu fa902f538894ddd6be7a55a2180f5d3d89b7081b | GREEN. J build/tsc 0 (red→green: the new test's TS2554 and 3 wrong assertions were fixed in the test; no production change). J vitest 149/149 (17 files). XP clean. Guard diff vs baseline empty. guard:plugins 0. Layers/isolation unchanged. Strict eslint 0. Smoke OK. 65/65 @agent-notes in .d.ts. T tsc 0. G-plug 10/10. T 164/165: the 1 red is the brief's known `plugin-host-bundled-identity`. Frozen SHA256s OK. T binder 63 code lines | fa902f538894ddd6be7a55a2180f5d3d89b7081b | ecefd458e45bdf8556654a4f3e2de98ffda10823 | 07:09→07:26 (59 min cum.) | ~0.75M (builder 205k) |
| L1b part 2 (runtime/SDK) | Tovu 9957107d | Jini 46f339ef (invocation binding → `plugins/host/node`), 070fe2a942dc9794f9cd024d789985edef67e749 (changeset); Tovu 4415177d (invocation binder, 19 code lines), bb09afc82b0cbdee9f0839b76102d9db193ca91d (runtime core seamed IN PLACE as `createPluginRuntimeCore(required, optional)`; `composePluginRuntime` keeps signature/overrides) | GREEN on first run. J build/tsc 0. J vitest 207/207 (20 files). XP clean. Guard diff vs baseline empty. guard:plugins 0. Layers/isolation unchanged. Strict eslint 0. Smoke OK. No `@tovu` from S6 in emitted .d.ts. T tsc 0. G-plug 10/10. T plugin unit 69/69, integration 77/77, misc 29/29. T-worker 26/27 and composition 63/65: the reds are the known pin/old reds only. Frozen SHA256s OK | bb09afc82b0cbdee9f0839b76102d9db193ca91d | 070fe2a942dc9794f9cd024d789985edef67e749 | 07:27→07:37 (70 min cum.) | ~0.94M (builder 169k) |
| L1c part 1 (admin DTO, archive policy, worker start) | Tovu 5578a60d | Jini 7087c13242f53f8e2598b26d9f791d01e3f1b7bd; Tovu 15ccbdd22de23a7f7783c86ac5f9f52378ebf0f0 | GREEN. J build/tsc 0. J vitest 187/187 (17 files). XP clean. Guard findings byte-identical. guard:plugins 0. Layers unchanged. Strict eslint 0 in both repos. Plain-Node smoke of `/host`, `/host/node`, `/host/worker` (no auto-start). Emitted @agent-notes 8/5/7. T tsc 0. G-plug 10/10. T 176/177: the 1 red is the known typescript-bootstrap pin red. Frozen SHA256s OK. Shims 11/31/21 code lines | 15ccbdd22de23a7f7783c86ac5f9f52378ebf0f0 | 7087c13242f53f8e2598b26d9f791d01e3f1b7bd | 07:38→07:46 (80 min cum.) | ~1.05M |
| L1c part 2 (runtime core move) | Tovu 93dbfef4583ae047bdded8dda6a82703d68db3b2 | Jini 0f76f157ac1a538695be71148d09f890f4175ce1 (core → `plugins/host/node/runtime-core.ts` + changeset), 1717bd21d0b33e1f29a740b383e7e427ad573b3a (second-host proof); Tovu 9df8907cb5f920fa8d0ce6d65af97be019d0b690 (T rewire; plugin-runtime.ts now 59 code lines incl. 16-line text object) | GREEN. Transport diff code byte-identical; 5 comment rewordings incl. N1 (see L1c2 inventory). J tsc 0. J vitest 216/216 (22 files). XP clean. Guard diff EMPTY. guard:plugins 0. Layers unchanged. Strict eslint 0. Smoke OK. 17 @agent-notes in .d.ts. T tsc 0. G-plug 10/10. T plugin-unit 195/195, integration 61/61, admin-dto 8/8. Worker/composition/enable-access/plugin-host show only the known reds | 9df8907cb5f920fa8d0ce6d65af97be019d0b690 | 1717bd21d0b33e1f29a740b383e7e427ad573b3a | 07:46→07:58 (91 min cum.) | ~1.25M |
| F6 (accumulated, final tips) | n/a | Jini 7fd1ab74ebdc7b1824dc36c0aa62d0dffe269e6d. Step 0 reworded S6-added comments in `capability-tools.ts` that named host tools; comment-only, see `extract-s6/f6.md`. Tovu a3a4eb01a1ec28fb8557d6180057fcf872eddd7d (f6.md, report only) | **F6 GREEN** (details in `extract-s6/f6.md`) | 9df8907cb5f920fa8d0ce6d65af97be019d0b690 (source) | 7fd1ab74ebdc7b1824dc36c0aa62d0dffe269e6d | 07:59→08:08 (102 min cum.) | ~1.50M (F6 builder 163k) |

## Final pair and tips

- **Last green SOURCE pair:** Tovu `9df8907cb5f920fa8d0ce6d65af97be019d0b690`, Jini `7fd1ab74ebdc7b1824dc36c0aa62d0dffe269e6d`. The Jini commit is F6 step 0 (comment-only) on top of the L1c-2 tip `1717bd21`. F6 ran against this pair.
- **Report-only Tovu commits after the source tip:** f0ae77a5, a3a4eb01 (f6.md), and this report commit. Each adds or changes files only under `cloud/reports/`.
- Both pushed tips were verified with `git ls-remote origin refs/heads/cloud/extract-s6` after every batch and at the end.
- No fallback or WIP branches were created. No revert was needed. No `git stash`, reset, force-push or merge of main or other sessions.

## Per-batch detail (inventories)

Every seam or move started with an inventory commit, pushed before implementation. Each uses the 7-column table with a host-vocabulary column. Each also has the origin Git blob, the SHA256 of every transported Tovu file, the comment map, the caller search (Jini packages and `examples/`), and the closure audit:

- `cloud/reports/extract-s6/g-plug-inventory.md`: coverage inventory, frozen fixture hashes, recording commit 3f77009f, the §7 table of 15 `Tovu` words, and gaps
- `cloud/reports/extract-s6/l1a-inventory.md`
- `cloud/reports/extract-s6/l1b-capability-inventory.md`
- `cloud/reports/extract-s6/l1b-runtime-inventory.md`
- `cloud/reports/extract-s6/l1c1-inventory.md`
- `cloud/reports/extract-s6/l1c2-inventory.md` (includes the exact N1 rewording)
- `cloud/reports/extract-s6/f6.md`: final accumulated gate

### Where each job landed (all in `@jini-ai/plugins`; the only Jini import is `@jini-ai/core`; no new dependency, peer or package)

| Job | Jini destination (entry) | New public API (two-object) | Tovu binder left behind (code lines) |
| --- | --- | --- | --- |
| Declarative content types (L1a) | `host/declarative-content-types.ts` (`/host`, universal) | `createDeclarativeContentTypes({ cms, reservedKeys }, {})`, `DeclaredContentTypeCms`, bounds 20/50/20 | `features/plugin-runtime/declarative-content-types.ts` (54) |
| Capability tools (L1b-1) | `host/capability-tools.ts` (`/host`, universal) | `createPluginCapabilityTools(required, {})`, `pluginCapabilityToolDerivedRisk` | `features/plugin-runtime/capability-tool-registrations.ts` (88 total; about 26 are exact host message text, so about 62 code lines) |
| Invocation binding (L1b-2) | `host/node/invocation-binding.ts` (`/host/node`) | `createPluginInvocationBinding({ pluginId, declaredHooks, beforeSaveHook }, {})` | `features/plugin-runtime/invocation-core-deps.ts` (19) |
| Admin DTO (L1c-1) | `host/admin-response.ts` (`/host`, universal) | `toAdminPluginResponse({ discovery, activation }, { conflicts? })` | `features/plugin-runtime/admin-response.ts` (11) |
| Archive policy (L1c-1) | `host/node/archive-policy.ts` (`/host/node`) | `readPluginArchive({ archive, reader }, {})`, required `PluginArchiveReaderPort` | `features/plugin-runtime/install-archive.ts` (31; the yauzl reader and guards stay in Tovu) |
| Tier-2 worker start (L1c-1) | `host/worker/start.ts` (`/host/worker`, no auto-start) | `startTier2Worker({ workerData, parentPort, binding, registerSdkResolver, realImport }, { importModule? })` | `server/runtime/plugin-tier2/worker.ts` (21; `main`/`startIfWorker`/`importPluginModule` kept) |
| Runtime core (L1b-2 seam → L1c-2 move) | `host/node/runtime-core.ts` (`/host/node`) | `createPluginRuntimeCore(required, optional)`, `PluginUninstallPathError` (same class object, re-exported by Tovu) | `server/runtime/composition/plugin-runtime.ts` (59, including the 16-line host text object) |

Unchanged and staying in Tovu, as the brief requires: `run-in-worker.ts`, `typescript-bootstrap.cjs`, `sdk-resolver.ts`, `host-binding.ts`, routes, toolMetadata, extension approval, `plugins_*` management tools. There is no sandbox peer.

**Host vocabulary, summarized; every literal is listed in the inventories:**
- **Injected from Tovu with the original bytes:**
  - capability permissions `content.read` / `admin.plugins.enable`, and entity types `post` / `plugin` (one object feeds both the catalog and the handler)
  - approval family `plugin-capability-result`, catalog path, toolMetadata
  - `identityNamespace` `"tovu"`
  - all tool prose, including the `content_post_*` mentions
  - the SDK hook id
  - env and host-signals policy, the default worker runner, the SDK binding
  - telemetry name, user and properties
  - scaffold text naming `tovu.plugin.json` and `/api/p/`
  - `plugins_set_enabled` approval text and the `plugin_source_rollback` reason
  - CMS field kinds, grammar and the already-exists classifier
  - reserved keys `["post","page",...SYSTEM_CONTENT_TYPES]`
  - the yauzl reader
- **Justified as plugin-domain and kept in Jini:** limits, error codes, tier names, `ext.<id>.`, `plugin:<id>` actor, `[plugin-runtime]` prefix, `-runtime`/`-trash` suffixes.
- `capabilityToolIdFor` is unchanged.

**@agent-notes in emitted .d.ts:** declarative-content-types 28, capability-tools 65, admin-response 8, invocation-binding 3, archive-policy 5, runtime-core 17 (18 in source; tsc drops the file-header note, and the factory keeps 6), worker start 7.

**Comment rewordings** (exact old/new text is in l1c2-inventory.md and f6.md):
- N1 in `assertReloadApproved`: "…until plugins_set_enabled is confirmed." became "…until the owner re-approves it."
- Four other comment-only neutralizations in runtime-core.
- Two in capability-tools (F6 step 0).

## Overlap with sessions 4/5

**None, inspected.** Every batch fetched `origin/cloud/extract-s4` and `origin/cloud/extract-s5` in both repos. All four merge-bases equal the S3 pins. F6 intersected their changed-file lists with S6's start..tip list (`f6-overlap.txt`): the intersection is empty.
- S6 changed no `package.json`, lockfile or Tovu composition module that s4/s5 touch.
- The only shared-barrel edits are one-line `export *` additions in `packages/plugins/src/host/index.ts` (3 lines), `host/node/index.ts` (3 lines) and `host/worker` index (1 line). s4/s5 do not touch any of these.
- Merge guidance: none needed. If a later session adds lines to the same barrels, keep both sides' `export *` lines.
- Changesets have unique S6 filenames: `extract-s6-l1a-plugins-host.md`, `extract-s6-l1b-capability-tools.md`, `extract-s6-l1b-runtime.md`, `extract-s6-l1c-plugins-host.md`, `extract-s6-l1c-runtime-core.md`. All are plugins minor.

## Frozen tests, saved bytes and gates (from F6; raw outputs kept outside source)

- **Existing tests and fixtures:** no M/D/R of any existing test or fixture in either repo (allowance none).
  - Tovu: 13 A, 7 M. The M files are 7 production binders.
  - Jini: 17 A, 3 M. The M files are barrels, add-only.
- **G-plug fixtures:**
  - The 6 G-plug files match their recorded SHA256s.
  - The two golden JSONs have only the recording commit 3f77009f in their history.
  - The observer helper changed twice (08ec5eb3, 38cd30d1). Both were before the inventory-hash commit and before any production change.
- **Saved bytes:**
  - `tool-metadata.baseline.json` is a0d6b428be4ea369f6abdf70a9892f0ce13db651ac4ac560e43dc2993fa2a0b6 at start and tip.
  - No migration or `*.sql` change.
  - No saved-format token was removed except two comment lines about `plugin_capability_`.
- **Test results at the final tip:**
  - Accumulated goldens: assistant 39/39, boot 6/6, composition 11/11, state 1/1, backup 3/3.
  - G-plug 10/10. T-plugin-unit 195/195 (+ enable-access 3 pass / 1 cancelled, a known pin red). T-plugin-integration 61/61. T-worker 26/27 and T-composition 34/35 (known pin reds). T-admin-dto 8/8.
  - J-plugin 127/127, J-entry 1/1, J-worker 54/54, J-architecture 5/5, new S6 Jini tests 29/29.
  - `provider-setting-field.typecheck.ts` and the G-plug type pins compiled explicitly: exit 0.
- **Builds and checks:**
  - Jini plugins build/tsc 0, and its dependents rebuilt 0.
  - Tovu relink + tsc 0.
  - Strict eslint (complexity/cognitive ≤10, `--no-inline-config`) on all 17 changed production files: 0.
  - XP1–XP5 clean against the immutable original snapshot.
  - `pnpm guard` output is byte-identical to the baseline (SHA256 13a11f4d…; exit 1 = allowed R2(1)+R10(1); HW 0 new; no N1/SI/unknown).
  - `guard:plugins` 0.
  - Layers `[]`, isolation `[]`, audit 573 closures with 16 findings, byte-identical to the baseline.
  - Plain-Node smoke: all 13 S6 exports defined across `/host`, `/host/node`, `/host/worker`; importing `/host/worker` does not auto-start.
  - Emitted closure imports only `@jini-ai/core`, with no `@tovu` and no `node:` in universal files.

## Path corrections, prior behavior, risks and limits

- **Path corrections:** none. Every cited matrix path existed at the pin. `bundled-initialization.test.ts` is `.test.ts`, not `.unit.test.ts`, as the brief's matrix already lists it.
- **Pin reds not on the brief's known list** (proven on the unmodified pin, unchanged at every gate, not fixed, never counted green): `plugin-enable-access.regression` 4th test hang; `typescript-bootstrap.unit` CJS hook `mock.module` test; `deps-provider-plugin-boot.integration` EACCES case (root container). See the Baseline section. The brief's known `plugin-host-bundled-identity` red also appeared, unchanged, in L1b-1/L1c-2 extra-importer runs.
- **Behavior recorded as-is (not fixed):** on a tier-2 runaway, the first failing save leaves the stored row unchanged (the counter is in memory). The disabled-row `plugins_list` description has a double space.
- **G-plug gaps** (listed in g-plug-inventory.md; covered by existing tests, not new goldens): `plugins_install`/source-tool handler results and install telemetry; agent-plugin family branches (session 4's area); `PLUGINS_MODEL_FACING_ERRORS` guidance text; the admin gate on executable contribution tools.
- **Second-host proofs** live in new Jini unit tests, not `examples/neutral-host`. That example has no `@jini-ai/plugins` dependency, and the brief forbids dependency edits.
- **Comments:** the private `SAFE_PLUGIN_ID_SEGMENT` why-comment in runtime-core still names a host file. It is not emitted, and is justified in l1c2-inventory.md.
- **Timing:** no batch overran its estimate by 1.4×. No batch stopped at a context or tool-call ceiling.
- **Not done here (as the brief requires):**
  - the X3 packaged desktop proof (local, deferred)
  - full suites
  - L2/L3, A8–A11, H0–H3
  - the independent review (happens after this run; no review approval is implied)
- **Processes:** none left running. All background setup, XP3 and subagent tasks completed. Checked with `ps` at the end: no node/vitest/tsx processes.

## Remaining work

None in S6 scope. The next sessions need named owner approval.

EXTRACT-S6 DONE
