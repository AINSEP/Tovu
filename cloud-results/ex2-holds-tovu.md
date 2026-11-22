PARTIAL 5c6620136: item 5 (C026) only partly done — the vendor guard still lists 28 hits that need plugin-owned declarations in Jini or an owner call on the bundled inventory; item 6 had nothing to repoint

# ex2-holds-tovu (2026-11-22) — SH-3, C043, C115, howto2 revert, C026, Jini follow-ups, P0.T

Unattended cloud run, Opus high. Items 1, 2, 3, 4 and 7 are done. Item 5 is partial (one of the C026 hits fixed; the rest need a decision or Jini work, below). Item 6 had no consumer to repoint.

No new red test: every red in the node set and in admin full is BASE-RED (same test names at `0d7f78fa4`). Gates equal base apart from counts (details below). A named mutation was run for every item and each one was killed.

- **Branch:** Tovu `codex/ex2-holds-tovu`, created from `origin/integ/merge-13-2026-11-22` `f7185f153` (READY content `0d7f78fa4` + the combine-13 report commit). Only this branch was pushed, with a plain `git push` after each commit.
- **Not used / not touched:** no subagents, no codebase-memory tools, no force-push, no `--no-verify`, no tags, no publish, no RemoteTrigger. `main`, `integ/*`, `plan/*` and `release/*` were only fetched. Nothing was pushed to Jini.

## Commits

| item | commit |
|---|---|
| 1 SH-3 | `e37955220` |
| 2 C043 | `5be5b781c` |
| 3 C115 | `46fc4f901` |
| 4 howto2 revert | `331143d39` |
| 7 P0.T | `a79fb87dc` |
| 5 C026 (partial) | `8f6818798` |
| gate follow-ups for items 1–3 (why-comments, error gate) | `5c6620136` |
| this report + `ex2-holds-tovu-raw/` + `development/open-bugs.md` | the commit after `5c6620136` |

## Setup
I repeated the `combine-13-tovu.md` Setup:
- **Tools:** Node 24.22.3 (`/opt/node24`), pnpm 10.33.2.
- **Jini:** `origin/integ/merge-13-2026-11-22` `7c4ee7881`, detached.
  - `pnpm install --frozen-lockfile`: 0.
  - `pnpm --no-bail -r build`: 0, with 0 `error TS`.
  - The Jini git tree was not changed.
- **Tovu:**
  - `npm ci --ignore-scripts` in root, admin, desktop and site-chat: 0/0/0/0.
  - `JINI_PACKAGES_DIR=/home/user/Jini/packages node development/scripts/link-jini.mjs`: 0.
  - `packages/contracts` tsc: 0. `packages/sdk` build: 0.
- **Base tree:** a `git worktree` at `0d7f78fa4` that shares the same `node_modules`. It was used for the base gate run and for every red attribution.
- **Not repeated:** PostgreSQL. No test in this run's set needed it.
- **Test runner:**
  - Node tests: each file alone under a 15-min watchdog, 3 in parallel, with the root `npm test` imports.
  - Admin tests: `npx vitest run`.
- **Mutations:** each plant was made in the Tovu working tree. The tests were run, then the file was restored by byte copy and `cmp`-checked.

## Item 1 — SH-3: the last 3 credential re-export shells (`e37955220`)
**What changed**
- Deleted the three shells `apps/website/src/features/custom-credentials/sets/{host,store,vault-repo}.ts`. The `sets/` folder is gone.
- **Importers:** only the two tests below. No production file imported the shells.
  - `extract-s8-c1-second-host.test.ts`: one import from `@jini-ai/integrations/credentialed-http/sets` (the types `CredentialSetStoreHost`, `CredentialSetVaultPolicy`, `CredentialSetWriteDeps`, plus `CredentialSetVaultRepo` and the store functions and errors).
  - `extract-s8-c1-source-scan.test.ts`: `generic` and `CredentialSetVaultRepo` now come from the same Jini entry.
- **The first test block** (owner-approved change) now asserts that the three shell files are **absent**: `existsSync(...) === false`, one message per file.
  - The block's second half is unchanged. It still scans the moved Jini `host/vault-repo/store` `.js`/`.d.ts` and allows only `@jini-ai/core` subpaths and same-directory files, with no Tovu, product or table words.
  - The `@file` text was updated to match.

**Tests**
- **Before the delete:** source-scan 1 fail (`sets/host.ts: re-export shell must not exist`).
- **After:** source-scan 6/0, second-host 8/0.

**Mutation:** re-create `sets/store.ts` → source-scan **5/1 red** ("…/sets/store.ts: re-export shell must not exist"). Restored: 6/0.

**FILES-LEFT:** −3 shells. combine-13's 3 BLOCKed shells are gone.

## Item 2 — C043: Tier-2 worker import allowlist (`5be5b781c`, security MED)
**What changed**
- `features/plugin-runtime/sdk-resolver.ts`:
  - `registerPluginSdkResolver()` takes a new optional `pluginPackageUrl` (a `file:` URL ending in `/`).
  - When it is set, the `data:` resolve hook refuses two kinds of import for any module whose `parentURL` is inside that package:
    - every **bare specifier** that is not one of the registered SDK specifiers (`@jini-ai/plugin-sdk`, `@tovu/sdk`). That covers `node:fs`, `fs`, `child_process`, npm packages, `data:` modules and `#imports`.
    - any path import that **resolves outside the package**. Without this, a `../..` climb reaches the same modules.
  - The refusal is plain: `This plugin may not import "node:fs": a plugin may import only the plugin SDK (@jini-ai/plugin-sdk, @tovu/sdk) and its own files.` or `… it is outside its own package.`
  - Modules outside the package resolve as before: the SDK build, and the host's own lazy imports.
  - Server boot calls it without the option, so its behaviour is unchanged.
- `server/runtime/plugin-tier2/worker.ts`:
  - New exported `tier2PluginPackageUrl({ workerData })` computes the package: the entry's grandparent (`<package>/server/index.mjs`), the same root `runTier2Call` uses. It uses real paths, because the loader reports real paths as `parentURL`.
  - It returns `undefined` for Tovu's built-ins (`features/plugin-runtime/built-ins/`). These are compiled-in product code, and `content-analyzer` imports `@jini-ai/cms/seo/content-analysis` and `#src/platform/html/slug`.
  - `main()` registers the resolver with that URL.
- **Why the built-in exemption:** a blanket refusal broke the bundled `content-analyzer` (measured: its probe failed on `@jini-ai/cms/…`). Site tier-2 packages are already refused at enable, so today the allowlist guards the path that has no sandbox yet. **Owner: confirm the built-in exemption.**

**Tests (written first)**
- New `plugin-tier2/__tests__/worker-import-allowlist.integration.test.ts` uses real workers through `createTier2WorkerRunner`, with temp packages in the site layout.
  - **Before the change: 1/8 red.** Every refusal case imported successfully, and `zod` failed only with "Cannot find package".
  - **After: 10/0.** The cases:
    - both SDK specifiers plus the plugin's own `./helper.mjs` load;
    - `node:fs`, `fs`, `child_process`, `node:child_process`, `zod` (installed) and `data:text/javascript,…` are refused at stage `import` with the plain message;
    - a dynamic `import("node:" + "child_process")` is refused;
    - a `../../<outside>/escape.mjs` climb is refused;
    - the built-in `content-analyzer` still probes OK in a real worker.
- `worker.unit.test.ts` gains a `tier2PluginPackageUrl` test: path and `file:` URL forms, built-in → `undefined`, and no entry → `undefined`. Result 8/0.
- **Neighbours green:**

  | file | pass/fail |
  |---|---|
  | `tier2-runtime.integration` | 5/0 |
  | `run-in-worker.unit` | 14/0 |
  | `typescript-bootstrap.unit` | 1/0 |
  | boot `plugin-sdk-resolver` unit | 2/0 |
  | boot `plugin-sdk-resolver` integration | 2/0 |
  | content-analyzer unit files ×5 | 46/0 |
  | plugins `preview.integration` | 2/0 |

**Mutations (both killed)**
- **M2-a:** allowlist off (`pluginPackageUrl = undefined`) → allowlist test **2/8 red**.
- **M2-b:** built-in exemption removed → content-analyzer probe red (its refusal names `@jini-ai/cms/seo/content-analysis`), and the package-url unit test red.
- Restored: green.

## Item 3 — C115: disk-space 507 is not an incident (`46fc4f901`)
**What changed (`apps/website/src/server/inbound/shared/admin-failure.ts`)**
- `adminFailureResponse` now returns the typed `DatabaseDiskSpaceError` refusal **before** `reportServerFailure`. Nothing goes to `console.error` or the tracker.
- The reply is `{ status: 507, body: { code: "INSUFFICIENT_STORAGE", error: <the backup owner's plain message> } }`, with **no `errorId`**, because no incident carries one.
- An explicit `options.status` override still takes the old path (reported). The body type's `errorId` is now optional.
- Admin reads no `errorId` on a 507 (`git grep` in `apps/admin/src`).
- The original why-comment ("The backup owner supplies this closed, human-safe refusal…") is kept next to the moved branch (`5c6620136`).

**Tests (written first, `routes/publish-content/__tests__/import-errors.test.ts`)**
- **Before: 6/4 red. After: 10/0.**
- Two old assertions pinned "the disk refusal returns a standard correlated incident ID". They were replaced by the C115 behaviour: no log call, no tracker call, exact body without `errorId`.
- New **"both orders"** tests send a disk refusal and a real failure (`database is locked`) through one sender, disk-then-crash and crash-then-disk. Each order checks the 507 body, the crash's 500 with its `ERR-…` id, and exactly one log line and one tracker report, both carrying the crash's id.
- The explicit-503-override test is unchanged and green.
- **Related files** (all tests touching the disk error or `admin-failure`), 10 files: 8 green. 2 are BASE-RED with the same names at `0d7f78fa4`: `share-database.integration` 37/1 (SQLITE_ERROR message) and `byok-message-attachments.unit` 3/2 (`readAttachmentRefs is not defined`).

**Mutation:** report before the disk return (`reportServerFailure(...)` inside the branch) → **6/4 red**. Restored 10/0.

## Item 4 — revert howto2's ui-ux-design chat-rules wording and restore the 6-width gate (`331143d39`)
Source: `cloud-results/combine-12-tovu.md` decision 2. howto2 is `codex/tv-howto2` `c0f70b84c2`, merged in `1ebc98670`; the pins were repointed in `8cef2d19b`.

**What changed**
- `content/agent-plugin-overlays/ui-ux-design/GUIDANCE.md`: the "Tovu chat rules" section is back to the **w1 owner-approved 2026-11-02 text**, byte for byte. That is `git diff 1ebc98670^1 1ebc98670 -- GUIDANCE.md` applied in reverse, so it names `agent_plugin_ui_ux_design` again and says "Return the design in chat unless the user asks to save it through an available tool."
- `host/theme-screenshot-qa.md`: the old release-gate paragraph is back verbatim. It names 360, 390, 768, 1024, 1280 and 1440px and says "A desktop and phone screenshot alone does not establish a pass…".
  - howto2's width-narrowing lines are dropped: "Use available browser widths … report those widths", "at the available widths", "Report only the widths actually checked".
  - howto2's non-width facts stay in the QA file: "Save requested site work using the site’s tools.", "Preview a draft by entry ID.", "A public-route screenshot checks only the page served at that address." and the `web_screenshot_page` presets line (1280/768/375).
- **The rest of howto2 is untouched:** site-import, tovu-theme, how-tovu-works and the code changes.
- **Note for the owner:** the gate needs 360/390/1024/1440 captures, which are not presets of `web_screenshot_page`. The kept presets line says so plainly.

**Tests (written first)**
- `ui-ux-design-overlay.test.mjs`: `8cef2d19b`'s three repoints of this file were reverted (`git show … | git apply -R`).
  - That restores the exact w1 `APPROVED` constant, `/360, 390, 768, 1024, 1280 and 1440px/` and `/`agent_plugin_ui_ux_design`/`.
  - **Before the content revert: 6/3 red. After: 9/0.**
- `bundled-tovu-theme-package.unit.test.ts`:
  - **howto2's "W10–12" test pinned the reverted wording**, so it was red against the decision. It is replaced by "W11–12 host design QA keeps the 6-width release gate and howto2's preview and route facts", which uses exact `includes` and anchored regexes and is the same strength.
    - It checks the three kept facts, the gate sentence with all six widths and the presets line.
    - It also checks that neither "Report only the widths actually checked" nor "report those widths" appears.
    - It checks that GUIDANCE has the "Return the design in chat…" sentence.
  - In "each Tovu guidance surface names the shared loader", the regex `/`load_agent_plugin`/` became `/`load_agent_plugin[`(]/`. The approved chat rules name the loader only in call form (`load_agent_plugin({ … })`, in the load table), and the assertion still requires the loader name in a code span. Comment added.
  - The QA text is whitespace-normalised because the restored paragraph wraps.
  - **Before: 20/1 red. After: 21/0.**
- **All 38 node test files that mention `ui-ux-design`/`theme-screenshot-qa`:** 33 green. 5 are BASE-RED with the same failing test names at `0d7f78fa4`:
  - `bundled-automatic-relevance` 2/4
  - `bundled-ui-ux-design-package` 3/4
  - `plugin-host.integration` 22/3
  - `bundled-agent-plugin-selection` 2/1
  - `bundled-inactive-gating` 7/1

**Mutations (both killed)**
- **M4-a:** "Report only the widths actually checked." put back into the QA gate paragraph → bundled-tovu-theme 20/1 red.
- **M4-b:** the chat rule's "Return the design in chat" replaced by howto2's "Save requested site work using the site’s tools" → bundled-tovu-theme 20/1 red and overlay 8/1 red.
- Restored green.

## Item 5 — C026 vendor names in generic seam files (`8f6818798`) — PARTIAL
- **Ownership:** Jini's report (`origin/codex/ex2-holds-jini:cloud-results/ex2-holds-jini.md` item 4) confirms that `bundled-catalog.ts` and `shared-owner.ts` are Tovu-only files.
- **Guard:** `apps/website/src/features/api-connections/__tests__/vendor-neutrality.test.ts` is unchanged and still BASE-RED.
- **Fixed:** `shared-owner.ts:81` used "Picker" as the plain English word for the saved-connection list, not the provider's picker. The comment was reworded and its reason kept. Comment only.
  - The guard's hits went **29 → 28**.
  - **Mutation:** restoring "Picker projection" brings `shared-owner.ts:81` back into the guard's list.
- **Not moved, and why.** Tovu's per-plugin folder (`content/agent-plugin-overlays/<id>/`) carries guidance only. The declarations that own these facts are Jini's plugin manifests and descriptors, and Jini was read-only in this run. Each remaining hit needs one of these:
  - `bundled-catalog.ts:57` `HOST_SOON_AGENT_PLUGINS` (`posthog`, `opentelemetry`, `stripe`, `sentry`, `google-forms`). The guard names `google-forms`. **Jini follow-up:** set the maturity flag `soon` in those plugins' manifests. `soon-lock.ts` already reads the manifest flag first, and then this Tovu list can go.
  - `bundled-catalog.ts:47-48` `SELECTED_AGENT_PLUGIN_PACKAGES` (`google-login`, `google-workspace`, `google-forms`). This is Tovu's choice of which plugins to ship, so it cannot live in a plugin. **Owner call:** allow-list the host inventory in the guard (the triage row's option 1), or move the inventory out of the seam folder into composition.
  - **New since combine-11** (not in the C026 row; found by the same guard):
    - `admin-surfaces/public-config.ts:15`: `JINI_GOOGLE_PICKER_APP_ID|…_BROWSER_KEY` in the generic public-name pattern. Could become "names the surface's descriptor declares as public", but that is a security-relevant widening, so it is left for the owner.
    - `api-connections/contribution.ts:77`: `item.pluginId === "google-workspace" ? "JINI_" : CLIENT_NAMESPACE`. The descriptor should declare its client namespace (Jini).
    - `bundled-id-upgrade.ts:30`: the measured rename list.
    - Test lines: `contribution.unit.test.ts` ×15, `surface-adapters.security.test.ts` ×5, `bundled-id-upgrade.unit.test.ts:58`.

## Item 6 — Tovu follow-ups from Jini `ex2-holds-jini` (RT-1/RT-2): none to repoint
- **RT-1** (`@jini-ai/sqlite` retired) and **RT-2** (`@jini-ai/infra/db/*` retired): no Tovu import of either. Tovu imports only `@jini-ai/infra/events/outbox`, which is kept.
- `release-manifests.test.ts:17-18` asserts that those packages are absent, and that stays true.
- **Not done:** the optional rewording of the 8 comment lines that name the old `@jini-ai/sqlite-chat`. It is comment-only, and each change would add why-comments churn.
- **Jini item 3 follow-up** (`host-binding.ts:10` → `@jini-ai/core/extension-capability-vocabulary`, plus the guard regex and deleting the Tovu file): **not applied.** That subpath exists only on Jini `codex/ex2-holds-jini`, not in the linked merge-13. Apply it after that Jini branch merges.

## Item 7 — P0.T: Settings HTTP transport → `src/lib/admin-http` (`a79fb87dc`)
**What changed (`apps/admin`)**
- `src/features/settings/api/settings-api.ts` → `src/lib/admin-http/settings-api.ts`, moved verbatim. Only its own relative imports changed: `./config`, `./request`, `../settings-effective-reads`.
- `settings-api.types.ts` moved too. `git grep` found no feature importer; its only importer was `settings-api.ts`.
- `__tests__/settings-api.unit.test.ts` moved with them to `src/lib/admin-http/__tests__/`. The empty `features/settings/api/` folder is gone.
- **Repointed:**
  - `src/lib/ledger-slice.ts:7` and `src/lib/execution-settings.ts:71` → `./admin-http/settings-api`;
  - 11 test importers and `vi.mock` paths: app-session ×2, MediaPickerDialog ×2, use-pages, use-posts, api-endpoint-option-branches, api-request-shapes.clients, execution-settings, ledger-slice, settings-effective-reads.
- `ledger-slice.ts:15-17` (the 404-only empty-namespace rule) is unchanged.
- No stale path remains outside reports and plans (`git grep`).

**Tests**
- Importers were repointed first. Before the move, the ledger-slice test failed with "Failed to resolve import ./admin-http/settings-api".
- **After:** 11 files / 301 tests green, and `api-request-shapes.characterization` 220/0. Admin tsc: 0.

**Named mutation:** treat every `ApiError` as an unregistered namespace (drop `&& error.status === 404`) → `ledger-slice.test.ts` 21/1 red ("re-throws a non-404 ApiError rather than defaulting"). Restored 22/0.

## Tests — totals
- **Node:** 155 files (raw `ex2-holds-tovu-raw/node-test-files.txt`, `tip-node-tests.txt`):
  - every changed test;
  - tests of the importers of `sdk-resolver`, `plugin-tier2/worker` and `shared-owner`;
  - every test that mentions 507, `INSUFFICIENT_STORAGE`, `DatabaseDiskSpaceError` or `admin-failure`;
  - every test that mentions `ui-ux-design` or `theme-screenshot-qa`;
  - the content-analyzer and custom-credentials tests.
  - `admin-failure.ts` has 241 importers, so it was treated as a hub and only its direct tests ran.
  - **Result: 1,991 pass / 20 fail in 10 files.** All 20 failing tests have **the same names at `0d7f78fa4`** (`red-names-tip.txt` = `red-names-base.txt`). That covers the 8 listed above plus `serve-command-wiring.unit` 5/2, `tw2-L224-characterization.unit` 3/1 and `render.golden.characterization` 12/1.
- **Admin full** (`npx vitest run`, raw `tip-admin-full.txt`): 909 files, **6 fail / 14,917 pass / 2 skipped**. That is **identical to combine-13** (`combine-13-tovu-admin-full.txt`), with the same 6 failing tests.
- **Vendor guard** (`vendor-neutrality.test.ts`): 1/1, BASE-RED. Hits 29 → 28.

## Gates — base (`0d7f78fa4`) vs tip
Raw: `ex2-holds-tovu-raw/{base,tip}-<gate>.txt` (tip = `8f6818798`) and `final-<gate>.txt` (the four gates re-run at `5c6620136`).

| gate | base | tip | note |
|---|---|---|---|
| typecheck (+e2e), typecheck:tests | 0, 0 | 0, 0 | |
| typecheck:scripts | 2 | 2 | identical output (3 long-standing errors) |
| admin tsc, desktop tsc ×4 | 0, 0/0/0/0 | 0, 0/0/0/0 | |
| check:size | 1 | 1 | identical findings |
| check:boundaries | 0 | 0 | 112 warnings both; module count 6773 → 6771 (deleted files) |
| check:complexity, check:hooks | 0, 0 | 0, 0 | identical |
| worker-import-graph | 0 | 0 | 26/26 |
| check:errors (WARN) | 3 entries | 3 entries at `5c6620136` | `8f6818798` had a 4th, `worker.ts` catch-reads-error; fixed by reading the error (ENOENT only) |
| check:why-comments | exit 1, 80 open | exit 1, **80** at `5c6620136` | `8f6818798` had 85: 3 SH-3 shell headers and the source-scan `@file` (4 debt rows, same pattern as ex-sh), plus the C115 comment, which was put back |
| check:architecture | exit 1 | exit 1 | same single ratchet row: runtime-only propagation 3.29 → 3.30 (denominator 2271 → 2268, the 3 deleted shells); all-import 12.45 → 12.48 |

## Production bugs (also appended to `development/open-bugs.md` → "ex2-holds-tovu")
- **C043 — FIXED** (`5be5b781c`): a Tier-2 plugin could import any Node built-in or npm package. Owner: confirm the built-in exemption.
- **C115 — FIXED** (`46fc4f901`): a disk-space 507 was logged and reported as an incident.
- **No new production bug found.**
- **C026 — still open.** The vendor guard has 28 hits, up from combine-11's 4. Two are new production seam hits: `public-config.ts:15` and `contribution.ts:77`.

## Owner decisions / follow-ups
1. **C043 built-in exemption:** compiled-in tier-2 built-ins, such as content-analyzer, are not under the allowlist. Keep it, or make the built-ins SDK-only.
2. **C026:** for `SELECTED_AGENT_PLUGIN_PACKAGES`, choose a guard allow-list or moving the inventory to composition. Jini manifests should carry `soon` for the five `HOST_SOON` ids. Decide the `public-config.ts:15` / `contribution.ts:77` special cases, which need Jini descriptor fields.
3. **6-width gate vs tool presets:** `web_screenshot_page` presets are 1280/768/375, so the restored gate needs custom widths.
4. **Jini item-3 follow-up** (`extension-capability-vocabulary`): apply after Jini `codex/ex2-holds-jini` merges.
5. **Scanner inputs:** FILES-LEFT drops by 3 (the SH-3 shells) and by P0.T's moved files.
