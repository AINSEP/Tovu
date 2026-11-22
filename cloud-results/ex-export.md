DONE

# ex-export: D-site-export-1, C-presentation-1, RT-3 (unattended Opus run, 2026-11-22)

Every step the dispatch named is done. The plan and its corrections came from Tovu `origin/plan/whats-left-1122`:
- `plans/P9-extraction.md` §1, the binding contract
- the step sheets `plans/P9-steps/D-site-export-1.md` and `C-presentation-1.md`
- Codex's `plans/P9-codex-verify-N1-N4.md`

Where Codex's FIX notes differ from the sheets, Codex was followed. Codex marked none of these steps BLOCK.

**Branches and SHAs (all pushed with plain pushes)**

Jini `codex/ex-export-jini`, based on `integ/merge-12-2026-11-22` `6b8e0d48a`:

| SHA | change |
|---|---|
| `6cdb019c7` | D-site-export-1.J: move `ports.ts` and `public-origin-policy.ts`, plus the characterization test |
| `1ee707247` | C-presentation-1.J: move `active-theme-id.ts` and its test |
| `cfd2e021d` | D-site-export-1.J: widen the optional origin fields for `exactOptionalPropertyTypes` (see Deviations) |
| `2874c0321` | D-site-export-1.J: api-baseline and changeset |
| `cda9f9737` | C-presentation-1.J: api-baseline and changeset |
| `3985c6cb8` | RT-3: retire `./commerce/server` |

Tovu `codex/ex-export-tovu`, based on `integ/merge-12-2026-11-22` `41e948ee4`. Both T steps ran linked against the Jini branch above.

| SHA | change |
|---|---|
| `0395e0083` | D-site-export-1.T |
| `7f847ca86` | C-presentation-1.T |
| `1780f497e` | why-comments allow-list for the 3 comment blocks that moved to Jini |
| (this commit) | this report and `cloud-results/ex-export-raw/` |

## Setup
- Tools:
  - Node 24.22.3 (`/opt/node24`) and pnpm 10.33.2.
- Jini:
  - `pnpm install --frozen-lockfile`: 0.
  - `pnpm --no-bail -r build`: every package built except `@jini-ai/devops`. That build already contained my moved `public-origin-policy.ts`, which failed under `exactOptionalPropertyTypes`. The fix is `cfd2e021d`, and devops and its dependents rebuilt clean afterwards.
- Tovu:
  - `npm ci --ignore-scripts` in root, admin and desktop: 0/0/0.
  - `link-jini.mjs` against `/home/user/Jini/packages`: 0.
  - `packages/contracts` tsc: 0. `packages/sdk` build: 0.
- No PostgreSQL server was set up in this container. See the one environmental red below.
- History fetches:
  - Tovu: `origin/refactor/terra`, needed by why-comments.
  - Jini: unshallowed, because `check:cross-package` needs `35c4961af`.

## FILES-LEFT (Jini-bound files still in Tovu; plan §0 measure, `plans/P9-data/tools/{scan,plan}.mjs`)

| point | Jini-bound source files | shells | **total** | `site-export` area | `presentation` area |
|---|---|---|---|---|---|
| base `41e948ee4` | 2,488 | 21 | **2,509** | 11 | 4 |
| after D-site-export-1.T | 2,486 | 21 | **2,507** | 9 | 4 |
| after C-presentation-1.T (final) | 2,485 | 21 | **2,506** | 9 | 3 |

The base total matches the plan's 2,509. The verbatim-ready count went from 550 to 547.

---

## D-site-export-1 (Codex FIX applied)

**Files moved (source → destination)**
- `apps/website/src/features/site-export/ports.ts` → Jini `packages/devops/src/static-export/site/ports.ts`
- `apps/website/src/features/site-export/public-origin-policy.ts` → Jini `packages/devops/src/static-export/site/public-origin-policy.ts`

**What stayed in Tovu (Codex FIX)**
- `export-failure-summary.ts` stays as the local call-shape adapter. Jini's version takes `{ report }`; Tovu's takes `report`. No J export or T rewrite was made for it.
- `static-copy-policy.unit.test.ts` and `site-backup/__tests__/static-copy.unit.test.ts` stay. Only their import lines changed.

**Jini changes**
- Exports added: `./static-export/site/ports` and `./static-export/site/public-origin-policy`. Both are dist-triple exports with `jini.entries` set to `universal`. devops has no `typesVersions`.
- api-baseline delta: additive only.
  - `ports` exports `ManifestActiveTheme`, `ManifestRoute`, `ManifestRouteKind`, `ManifestSkip` and `RouteManifest`.
  - `public-origin-policy` exports `exportPublicOrigin`, `rewriteRenderOrigins` and `rewriteExportOriginResponse`.
- Changeset: `.changeset/p9-d-site-export-1.md`, patch.
- N2 rewording, comments only, in `ports.ts`:
  - `development/docs/deployment/deployment-constraints.md` became "the host's deployment-constraints doc".
  - `#src/features/theme/index` became "the host's theme feature".
- There is no `/tovu/i` match in either moved file.

**Tovu importers repointed (D.T, `0395e0083`)**
- `features/site-export/index.ts:5`: deleted the type-only barrel line. A grep found no barrel user of the `Manifest*` types.
- `route-manifest.ts:12` and `theme-preview-manifest.ts:5` → `@jini-ai/devops/static-export/site/ports`.
- These now import from `@jini-ai/devops/static-export/site/public-origin-policy`:
  - `site-exporter.ts:19`
  - `__tests__/static-copy-policy.unit.test.ts:20`
  - `site-backup/__tests__/static-copy.unit.test.ts:21`
- A comment citation at `route-manifest.ts:115` (`ports.ts`'s) now names the Jini subpath.

**Tests**
- The sheet listed no tests to move, so I wrote a characterization test first: `public-origin-policy.test.ts`, 4 tests, in Jini `src/static-export/site/__tests__/`. It covers:
  - configured evidence versus development evidence for the same host
  - registry absence and loopback refusal
  - render-origin rewriting, including JSON-escaped slashes
  - response rewriting: robots sitemap drop, content-length drop, binary pass-through and `Location`
- It passed 4/4 against the moved code.
- Tovu: 19 test files import a repointed module. All are green: 191 passes, 0 failures (`ex-export-raw/tests-D-site-export.txt`).

**Mutation**
- The sheet's named mutation ("negate first `if` in ports.ts") cannot run, because `ports.ts` is types only. Per Codex, I mutated `exportPublicOrigin`'s `if (evidence.source !== "workspace-setting")` to `if (!(…))`.
- Mutated: `× configured public evidence becomes the export origin, development evidence for the same host does not`, giving `Tests 1 failed | 3 passed (4)`.
- Restored: `Tests 4 passed (4)`.

## C-presentation-1 (Codex FIX applied)

**Files moved (source → destination)**
- `apps/website/src/features/presentation/active-theme-id.ts` → Jini `packages/cms/src/presentation/site/active-theme-id.ts`
- `apps/website/src/features/presentation/__tests__/active-theme-id.unit.test.ts` → Jini `packages/cms/src/presentation/site/__tests__/active-theme-id.unit.test.ts`

**Jini changes**
- Source import: `@jini-ai/cms/presentation` became `../index.js` (Codex).
- Test imports:
  - `node:test` became `import { test } from "vitest"`.
  - `@jini-ai/cms/presentation` became `../../index.js`.
  - The assertions are untouched.
- N2 rewording, comments only:
  - `this repo's own check:architecture` became "the host's own".
  - The `ADS-memory/...` report path became "the host's 2026-08-16 export-edge decoupling report".
  - `#src/features/presentation/index` became "host presentation barrel".
  - The two `apps/website/...` caller paths became "the host's site-export route manifest and its public site pages route".
- Export added: `./presentation/site/active-theme-id`, universal, dist triple plus the `jini.entries` key.
- api-baseline: adds `ActiveThemeIdResolutionDeps` and `resolveActiveThemeId`.
- Changeset: `.changeset/p9-c-presentation-1.md`, patch.

**Tovu importers repointed (C.T, `7f847ca86`): 20 files (3 from the sheet + 17 Codex added)**
- Barrel `features/presentation/index.ts:25` line deleted. Its header comment now names the Jini subpath.
- Direct importers rewritten:
  - `features/site-inspection/deps.ts:1`
  - `public-http/middleware/render-theme-override.ts:3`
  - `theme-preview-switcher.ts:4`
- Barrel users repointed:
  - `assistant/__tests__/tool-registrations.theme-duplicate.test.ts:12`
  - `…theme-set-active.test.ts:16`
  - `features/post/template-options.ts:2`
  - `features/theme/__tests__/{preview-switcher.integration,theme-list-active,verify-active-theme}.test.ts`
  - `features/theme/{preview-switcher-tools,set-active-theme-tool,trash-theme-tool}.ts`
  - `admin-http/routes/widgets/preview-render.ts:4`
  - `server/runtime/composition/{__tests__/create-site-app-theme-override.integration.test.ts, memory-deps/route-deps/publish-export.ts, memory-deps/route-deps/trash-and-content.ts, peer-site-reads.ts, site-deps/route-deps-assistant-mcp.ts, site-deps/route-deps-comments-plugins.ts, visitor-page-targets.ts}`
- Split imports keep their other bindings (`InMemoryPresentationSettingsRepo`, `SqlitePresentationSettingsRepo` and the `set-active-theme-tool` block) on the original line. Each file keeps its quote style.
- Seven comment citations of the deleted path `features/presentation/active-theme-id.ts`, or of the barrel as its home, now name `@jini-ai/cms/presentation/site/active-theme-id`. These are text only:
  - `route-manifest.ts:63,89`
  - `server/routes/types.ts:1358`
  - `products.route.test.ts:293`
  - `theme/active-theme.ts:67`
  - `theme/__tests__/active-theme.test.ts:174`
  - `contracts/core/theme-ids.ts:42`

**Tests**
- The moved test is green in Jini: `Tests 4 passed (4)`.
- Tovu: 220 more test files import a repointed module. They were found with the scanner's import graph and exclude the 19 D files. Result: 217 green with 2,567 passes, and 3 red (`ex-export-raw/tests-C-presentation.txt`). None of the 3 is caused by this move:
  - `server/__tests__/admin-trash-routes.test.ts` (4 failures) and `server/__tests__/routes/content-post-get-by-slug.test.ts` (1 failure) fail identically on the untouched base `41e948ee4`, with the same `node_modules` (`ex-export-raw/tests-C-base-attribution.txt`). They are also in earlier combines' full-suite failing lists (`combine-6/7/8/9-tovu-full-suite-failing-files.txt`). **Base red.**
  - `create-site-route-deps.postgres.test.ts` fails because no PostgreSQL socket exists in this container (`connection to server on socket "/tmp/.s.PGSQL.5432" failed`). **Environmental.**

**Mutation (as named)**
- Change: `if (err instanceof PresentationSettingsNotFoundError)` to `if (!(…))`.
- Result: `active-theme-id.unit.test.ts` went red with 3 failures (`degrades to ''…`, `any OTHER repo error propagates…`, `sanity…`).
- Restored: `Tests 4 passed (4)`.

## RT-3 (Jini only, Codex FIX applied), `3985c6cb8`

**Removed**
- `packages/agent-plugins/core/commerce-server.{mjs,d.ts}`
- the `./commerce/server` export and its `jini.entries` row
- `@jini-ai/commerce` from `jini.optionalPeers`, `peerDependencies` and `peerDependenciesMeta`
- the lockfile importer entry, via `pnpm install` (−3 lines)
- the four `scripts/injection-debt.json` rows: the three `commerce-server.*` rows plus Codex's fourth, the `package.json` manifest-peer row
- the api-baseline `./commerce/server` entry: 9 symbols, reported "breaking, covered by changeset"

**Changeset:** `.changeset/p9-rt-3-commerce-server.md`, **minor** for `@jini-ai/agent-plugins`, the 0.x breaking-removal level.

**Kept:** the dormant `./commerce` and `./commerce/*` payload exports and the `files` entry.

**Test** (`commerce/__tests__/bundled-package.test.mjs`)
- Kept the payload assertions. Removed the retired-entry assertions and the two entry-only tests, including the dynamic import of the deleted subpath.
- Because removing the entry is a behaviour change, the test now asserts that the entry, the `jini.entries` row and the peer are absent. Its title is adjusted to match.
- Against the old `package.json`, the test went red: `ℹ fail 1`. Against the new one it is green: `ℹ pass 1`.

**`scripts/check-package-layers.ts:131`**
- Only the comment is reworded.
- I did **not** narrow the `['cms','commerce']` payload-peer allowance. `scripts/__tests__/check-package-layers.test.ts:229-269` pins commerce in that allowance, so narrowing it would need a test edit outside this step. It is now a dormant allowance and is noted here for a follow-up.

**Tovu:** no runtime or test import of `@jini-ai/agent-plugins/commerce/server` exists (grep found none), so there is nothing to rewrite. The linked Tovu gates below ran with RT-3 already in the linked Jini tree.

**Gates:** guard 0 (this includes the package-layer and injection checks), check:hooks 0, api:check 0, scripts tsc 0, agent-plugins typecheck 0. Size and complexity are identical to base.

---

## Gates before/after

**Jini** (raw files are in this run's scratch). The base was measured on `6b8e0d48a` before my commits; "after" is the branch tip.

| gate | base | after |
|---|---|---|
| `pnpm guard` | 0 | 0 |
| `pnpm check:hooks` | 0 | 0 |
| `pnpm api:check` | 0 | 0 (after `api:update`, additive for D and C; RT-3 removal covered by changeset) |
| `pnpm typecheck` (full, base) | 0 | touched `@jini-ai/devops...` and `@jini-ai/cms...` (21 packages): 0; scripts tsc 0 |
| `pnpm check:size` | 1 (pre-existing: `launch.ts` and `json-ipc` stale entries) | 1, **byte-identical output** |
| `pnpm check:complexity` | 1 (pre-existing: 4 violations in agent-runtime, chat, core, ui) | 1, **identical** |
| `pnpm check:cross-package` | 1 (2,846 XP findings) | 1, **the same 2,846 lines** |

`check:cross-package` cannot be reproduced cleanly here. XP3 needs `JINI_DECLARATION_BASELINE_DIR`, a declaration snapshot built in a separate clean checkout at `35c4961af`, so every XP3 line reads "absolute JINI_DECLARATION_BASELINE_DIR required". I checked by hand instead: the moved files import only `@jini-ai/core/*`, which XP3 allows, or relative paths. No new `@jini-ai/<other>` edge was added.

**Tovu** (`ex-export-raw/tovu-gates-base-vs-after.txt`)

| gate | base | after |
|---|---|---|
| typecheck, typecheck:tests, admin tsc | 0 / 0 / 0 | 0 / 0 / 0 |
| check:boundaries | 0 | 0 (112 warnings, same as base; 6,791 → 6,790 modules) |
| check:hooks, check:complexity | 0 / 0 | 0 / 0, identical |
| check:size | 1 (pre-existing: `assistant-byok.ts`, `PageEditor`, …) | 1, **identical output** |
| check:architecture | 1: runtime-only propagation cost 3.06 → 3.27 | 1: the **same single metric**, no new regressed metric. Cross-feature edges 319 → 316, API surface 692 → 691. All-import propagation 12.40% → 12.42% (file denominator 2,293 → 2,290), still "improved" against the baseline file's 15.52 |
| check:why-comments | 1 (80 lost blocks, pre-existing) | 1 (80). The 3 blocks that moved to Jini with N2 rewording are allow-listed in `1780f497e`, citing the Jini SHAs, following the existing "Moved to Jini …, reworded neutral" entries |

`check:architecture.baseline.json:235` still lists the edge `site-inspection/deps.ts -> presentation/active-theme-id.ts`, which no longer exists. I left the baseline alone because the dispatch said not to move baselines, and the gate does not fail on it.

## Deviations from verbatim (each is the minimum the gates forced)
1. **D.J `public-origin-policy.ts`, two signatures.** `publicOrigin?: string; sourceOrigin?: string` became `?: string | undefined` in `rewriteRenderOrigins` and `rewriteExportOriginResponse`. This is type-only. Jini compiles with `exactOptionalPropertyTypes` and Tovu does not, so the verbatim file fails `tsc` in devops (TS2379 at lines 53 and 56). There is no runtime change. All statements, order, names and comments are otherwise identical.
2. **Comment-only rewording for N2,** listed per step above.

## BLOCKs found
None. No STOP condition was hit:
- every listed file's imports matched the sheet
- no XP3 or N2 surprise came up
- no policy file was moved
- no test needed more than an import edit, apart from RT-3's retirement assertions, which Codex directed
- no function grew

## Not done / follow-ups
- RT-3 left a dormant `commerce` entry in `check-package-layers.ts` `isPayloadPeerDeclaration`, pinned by its own tests. Narrowing it is a follow-up.
- The stale `check-architecture.baseline.json:235` edge was not touched.
- `export-failure-summary.ts` cutover (Codex): a later step must handle `site-exporter.ts:24`, `index.ts:9,16`, `__tests__/index.test.ts:4,9,26` and `site-exporter.test.ts:23`.
