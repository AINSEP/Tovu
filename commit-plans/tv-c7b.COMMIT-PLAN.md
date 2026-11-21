# tv-c7b — combine-7 follow-ups

Base for every sheet: `8d1a4c2742` (branch `codex/tv-c7b`). Git metadata is read-only; coordinator stages/commits. Tests, mutations, builds, installs, type checks, linters and gates were not run, as dispatched. Existing tests were read before the desktop edits; no tests/assertions changed.

## C7-ERR-SUBAGENT — DONE

- Base: `8d1a4c2742`.
- Files: `apps/website/src/assistant/subagent-settings.ts`.
- Exact catch anchor matched. Added only `{ cause: error }` to the invalid-permissions refusal; message, throws doc and rethrow remain.
- Existing test: `a malformed snapshot rethrows the validation error when the caller opts into propagation` (`apps/website/src/assistant/__tests__/subagent-settings.unit.test.ts:76`). No test edit.
- Mutation owed: none named in this sheet.
- Combine gate expectation: `check:errors` 0 New from this refusal.
- Deletions: none.

## C7-SIZE — DONE

- Base: `8d1a4c2742`.
- Files: `development/scripts/size-debt.json`.
- Deleted the whole `apps/website/src/features/theme/publish-content.ts` / `<file>` / `max-lines` object (value 512). On the base a conservative count excluding only blank lines, standalone block comments and line-comment-only lines is 498, below 500.
- Debt rows: added 0, changed 0, deleted 1. No debt number increased.
- Owner-accepted over-500 files remain unchanged: `dev-auth.ts` 508, `modules/assistant-byok.ts` 531, `SiteGrid.tsx` 502, `publish-agent-tools.ts` 775 (coordinator-supplied counts).
- Tests / mutation owed: none named; no gate executed.
- Combine gate expectation: stale row absent; no new size-debt rows or history increase.
- Deletions: only the named stale debt object.

## C7-BOUNDARIES — DONE

- Base: `8d1a4c2742`.
- Files: `.dependency-cruiser.mjs`, only `PUBLIC_ENTRIES["features/theme"]`.
- Both obsolete files are absent in the base git objects. Replaced `entry-list-render` with `entry-list-markup`, and `preview-refresh` with `preview-policy`, at their original positions.
- Tests / mutation owed: none named. Combine runs `check:boundaries`.
- Combine gate expectation: the eight named theme deep-import errors disappear.
- Deletions: only the two obsolete public-entry strings, replaced by their successors.

## C7-WORKER-GRAPH — DONE

- Base: `8d1a4c2742`.
- Files: `apps/website/src/server/inbound/public-http/middleware/theme-preview-refresh.ts`; `.dependency-cruiser.mjs`, same theme list.
- The sole `export const themeRosterPorts` match is `theme-roster-ports.ts:4`. Repointed only this middleware's import and appended `theme-roster-ports` as the final public entry. The composition importer is unchanged.
- Existing test: `../../middleware/theme-preview-refresh.ts keeps public reads separate from feature-wide write/tool barrels` in `worker-import-graph.test.ts`.
- Mutation owed: none named in this sheet.
- Combine gate expectation: worker graph failing cases 8 → 7, retaining the seven base failures; no new boundary error.
- Deletions: only the middleware's barrel import, replaced by the direct module import.

## D02-SPLIT — DONE

- Base: `8d1a4c2742`.
- Files: `apps/desktop/src/desktop-resources.ts`.
- Moved the sampler selection, state and `panelMemory` body/doc verbatim into the named private `createDesktopPanelMemorySampler({ ports }: { ports: DesktopResourcesPorts }, _options = {})`. It returns the original optional sampler expression. Bound it before history/cache initialization and passed `samplePrivateMemory: panelMemory`. No other `samplePrivateMemory` reader remains inside `createDesktopResources`.
- Existing tests, read first: `Job M labels RSS fallback after native sampling fails and retries after one minute`; `footprint reads are limited to once a minute; new PIDs use RSS until the next read` (`desktop-resources.test.ts:319`, `:677`). No test edits.
- Importer search matched only the listed consumers; `development/e2e/soak/desktop.soak.ts` has a different local `readDesktopMemory` declaration, not an importer. No additional importer repoints.
- Mutation owed to combine: drop the minute-throttle condition.
- Combine gate expectation: both named tests stay green; no timer, cache-lifetime or optional-sampler behavior change. New factory is 20 physical lines; `createDesktopResources` is 44. Manual inspection found no changed function above complexity 10.
- Deletions: moved block removed from the original location; no code discarded.

## D02 — DONE

- Base: `8d1a4c2742`; prerequisite D02-SPLIT DONE.
- Files: `apps/desktop/src/desktop-memory-sampler.ts`; `apps/desktop/src/desktop-resources.ts`.
- Replaced exactly the two named try/catch blocks with `orFallback`, using `Read desktop private memory` and `Read desktop process inventory`. Added the idiom import only to the memory adapter, reused the existing resource import and retained `MemoryUsage` through `orFallback<readonly MemoryUsage[]>`. No casts.
- Native failure returns the existing fallback usage rows, preserving inventory/CPU. Inventory failure supplies `[]` to the existing `groupSample` and assigns its empty history, so stale CPU history is cleared. Selection/throttle/cache behavior and both test imports stay unchanged. The removed historical why block was not restored.
- Existing tests, read first: `Job M labels RSS fallback after native sampling fails and retries after one minute`; `S2 sampler rejection returns unavailable without native error text and can recover` (`desktop-resources.test.ts:319`, `:539`). No test edits.
- Mutations owed to combine: let native-memory rejection escape; let inventory rejection escape.
- Combine gate expectation: both named tests stay green; both files have zero `catch` text and their two `catch-reads-error` rows can be deleted by C7-LEDGER-SHRINK.
- Deletions: only the replaced catch syntax and mutable `usages` declaration; no fallback behavior or why-comment restoration.

## C7-WHY — DONE

- Base: `8d1a4c2742`.
- Files: `development/why-comments-debt.json` (data only).
- Read the 72 supplied commit-parent source objects and searched each block's distinctive phrase against Jini `origin/integ/merge-7-2026-11-20`, `packages/` only; a second different phrase was used only after no match. Found: 90 blocks / 90 unique IDs, appended at the end with the exact requested reason format and actual Jini paths. No existing allow row changed.
- Debt rows: added 90, changed 0, deleted 0. Not found in Jini: 68 block occurrences / 67 unique IDs (the compatibility-surface ID occurs in two files).
- Fourteen excerpts are absent in the supplied commit parents. Used the supplied old excerpts for those phrase searches; ten have directly verified Jini git-object comments, four remain not found. Details in `REFRESH.md`; no guessed allow rows.
- Tests / mutation owed: none named; no gate executed.
- Combine gate expectation: 165 open blocks → 7 base + 68 not found = 75, subject to the combine's actual gate. These misses remain for owner restoration/decision.
- Deletions: none.

### not found in Jini

- `1121d6ff901a apps/admin/src/features/deployment/StaticSiteTab.hooks.ts:9-9`
- `51b19397c559 apps/admin/src/features/deployment/StaticSiteTab.hooks.ts:19-19`
- `10caf1677fb0 apps/admin/vite.config.ts:157-161`
- `40e5af240bc4 apps/desktop/src/desktop-memory-sampler.ts:39-46`
- `947eafbeb3f3 apps/desktop/src/packaged-gate-isolation.test.ts:83-83`
- `b89232b934cb apps/desktop/src/packaged-gate-isolation.ts:12-12`
- `24a102c7e10b apps/desktop/src/packaged-gate-isolation.ts:36-37`
- `987ebc4d94a0 apps/desktop/src/renderer/App.hooks.test.ts:42-42`
- `1e935cc669fb apps/desktop/src/renderer/use-dropdown-menu.hooks.ts:19-19`
- `485dea66d8bd apps/desktop/src/renderer/use-dropdown-menu.hooks.ts:22-22`
- `4b9d922e14f7 apps/desktop/src/renderer/use-import-website.hooks.ts:159-163`
- `1dc0f3de4edc apps/desktop/src/renderer/use-import-website.hooks.ts:176-176`
- `84888d92ccaa apps/website/src/assistant/__tests__/mcp-ui-allowlist-completeness.test.ts:98-98`
- `4ffc10dbebef apps/website/src/assistant/render-ui-tool.ts:87-89`
- `e7c39489c369 apps/website/src/assistant/render-ui-tool.ts:124-126`
- `cc9d6753ad63 apps/website/src/contracts/core/public-page-security-headers.ts:13-13`
- `98b2ec297904 apps/website/src/contracts/core/public-page-security-headers.ts:79-79`
- `74329ba736c4 apps/website/src/features/external-mcp/external-mcp-shared-oauth.ts:1-1`
- `85ebfcbcd2ea apps/website/src/features/form-destinations/registry.ts:100-105`
- `461e98a5056d apps/website/src/features/forms/render-entry.ts:1-1`
- `d06a4f4d7ece apps/website/src/features/media/versioned-media-repo.ts:5-31`
- `67c0871727ec apps/website/src/features/media/versioned-media-repo.ts:33-38`
- `726b2e341dc5 apps/website/src/features/media/versioned-media-repo.ts:73-79`
- `6cef3f0f62ca apps/website/src/features/media/versioned-media-repo.ts:82-86`
- `50c0dc278cf3 apps/website/src/features/navigation/html-render.ts:1-1`
- `89d1ce8b9e16 apps/website/src/features/plugin-runtime/admin-response.ts:1-16`
- `1da41aebc7ba apps/website/src/features/site-backup/__tests__/tool-registrations.unit.test.ts:1378-1378`
- `9f4aa5c41d37 apps/website/src/features/site-backup/push-engine.ts:7-21`
- `a8c20c2f7c72 apps/website/src/features/site-backup/push-engine.ts:48-48`
- `3d15903f4bad apps/website/src/features/site-backup/push-engine.ts:51-51`
- `e292724d5e93 apps/website/src/features/site-inspection/site-profile.ts:323-324`
- `c110c3c5c34d apps/website/src/features/taxonomy/content-targets.ts:1-1`
- `50c0dc278cf3 apps/website/src/features/taxonomy/html-render.ts:1-1`
- `1faf448581b5 apps/website/src/features/theme/__tests__/theme-layout.test.ts:6-11`
- `add5b4211c07 apps/website/src/features/theme/__tests__/theme-original-reset-refusal.test.ts:9-16`
- `92431b8dfe31 apps/website/src/features/theme/__tests__/theme-original-reset-refusal.test.ts:23-23`
- `fed77ecb16bf apps/website/src/features/theme/__tests__/theme-original-reset-refusal.test.ts:54-54`
- `13fe8eee6e38 apps/website/src/features/theme/entry-list-render.ts:352-368`
- `6d97279283ef apps/website/src/features/theme/index.ts:96-99`
- `31e015eb637c apps/website/src/features/theme/index.ts:168-170`
- `a8704a24614f apps/website/src/features/theme/theme-files.ts:608-615`
- `3e4535520cae apps/website/src/features/theme/theme-files.ts:1116-1121`
- `db68ee1386c5 apps/website/src/features/theme/theme-layout.ts:1-26`
- `a3e36ef6430f apps/website/src/features/theme/theme-layout.ts:141-143`
- `ca31be8c8901 apps/website/src/features/webhooks/__tests__/agent-tools.delete-confirmation.test.ts:15-23`
- `d2a370aa21ef apps/website/src/platform/db/repos/form-delivery-repo.ts:32-32`
- `020a4c070693 apps/website/src/platform/html/style-values.ts:3-16`
- `97c3dbc6d29c apps/website/src/server/__tests__/assistant-ag-ui-translate.test.ts:20-31`
- `cd365946d13f apps/website/src/server/inbound/admin-http/http/plugins.ts:1-11`
- `9bf3936b9090 apps/website/src/server/inbound/admin-http/routes/media/__tests__/parse.test.ts:7-11`
- `b6cb9e407b8d apps/website/src/server/inbound/admin-http/routes/media/parse.ts:3-9`
- `dd24338b654a apps/website/src/server/inbound/admin-http/routes/settings/__tests__/shared.unit.test.ts:13-20`
- `bc2f18389479 apps/website/src/server/inbound/admin-http/routes/settings/shared.ts:58-86`
- `6ad7fda892a0 apps/website/src/server/inbound/admin-http/routes/themes/explore.ts:50-54`
- `d9cfa64911f2 apps/website/src/server/inbound/assistant/ensure-json-agent-install.ts:3-6`
- `0505b8802811 apps/website/src/server/inbound/public-http/http/site/__tests__/worker-import-graph.test.ts:101-107`
- `cfb902da7d15 apps/website/src/server/inbound/public-http/http/site/bare-page.ts:63-76`
- `b9f38a35b4d0 apps/website/src/server/inbound/public-http/http/site/form-render.ts:2-24`
- `cb8dcf542328 apps/website/src/server/inbound/public-http/http/site/form-render.ts:246-253`
- `0d79bcdae56a apps/website/src/server/inbound/public-http/http/site/form-render.ts:327-329`
- `389afe32d3ce apps/website/src/server/inbound/public-http/http/site/form-render.ts:653-664`
- `3ffe96f891e5 apps/website/src/server/inbound/public-http/http/site/page-head.ts:75-75`
- `1021e795b3f2 apps/website/src/server/inbound/public-http/http/site/page-head.ts:103-105`
- `28162a14dbed apps/website/src/server/inbound/public-http/http/site/render/doc/media-ref.ts:7-12`
- `4bd2ee7c5f06 apps/website/src/server/inbound/public-http/http/site/render/doc/media-ref.ts:21-21`
- `42b1c82878d3 apps/website/src/server/inbound/public-http/routes/site/__tests__/search.route.test.ts:87-87`
- `bf79e817db7e apps/website/src/server/runtime/composition/__tests__/external-mcp-oauth-loopback-wiring.unit.test.ts:63-63`
- `096121b6167d apps/website/src/server/runtime/composition/modules/site-search.ts:64-67`

## C7-LEDGER-SHRINK — DONE (ran last)

- Base: `8d1a4c2742`; D02 DONE before proof checks.
- Files: `development/scripts/error-gate-debt.json`.
- Rechecked every supplied proof on the edited tree: 2 GONE paths fail `test -e`; 15 NOCATCH files and both D02 files print `0` from `grep -c catch`. All 19 proofs passed. No requested row retained.
- Debt rows: added 0, changed 0, deleted 19 (18 `catch-reads-error`, 1 `failure-text-from-catalog`). Each whole object was deleted; no remaining value changed. Other improved entries remain for the combine's gated update.
- Tests / mutation owed: none additional; D02's named tests and both rejection mutations remain owed to the combine.
- Combine gate expectation: 0 New, 0 Worse; the following 19 rows absent.
- Deletions:

  - `apps/website/src/platform/server-logs/console-tee.ts` / `catch-reads-error` / `3` — GONE, test -e exit 1.
  - `apps/website/src/server/runtime/services/external-mcp-probe.ts` / `catch-reads-error` / `1` — GONE, test -e exit 1.
  - `apps/admin/src/features/dashboard/hooks/use-recent-activity-disclosure.hooks.ts` / `catch-reads-error` / `2` — NOCATCH, grep -c catch: 0.
  - `apps/admin/src/features/media/hooks/use-media-grid-size.hooks.ts` / `catch-reads-error` / `2` — NOCATCH, grep -c catch: 0.
  - `apps/admin/src/features/sites/hooks/site-transfer-dependencies.hooks.ts` / `catch-reads-error` / `3` — NOCATCH, grep -c catch: 0.
  - `apps/admin/src/integrations/jini-admin/media-ports.ts` / `catch-reads-error` / `1` — NOCATCH, grep -c catch: 0.
  - `apps/admin/src/lib/assistant-agents-snapshot.ts` / `catch-reads-error` / `2` — NOCATCH, grep -c catch: 0.
  - `apps/admin/src/lib/local-owner-signin.ts` / `catch-reads-error` / `1` — NOCATCH, grep -c catch: 0.
  - `apps/admin/src/lib/queued-daemon-start.ts` / `catch-reads-error` / `1` — NOCATCH, grep -c catch: 0.
  - `apps/desktop/src/app-version-ipc.ts` / `catch-reads-error` / `1` — NOCATCH, grep -c catch: 0.
  - `apps/site-chat/src/session-store.ts` / `catch-reads-error` / `4` — NOCATCH, grep -c catch: 0.
  - `apps/website/src/features/agent-plugins/exports/source.ts` / `catch-reads-error` / `1` — NOCATCH, grep -c catch: 0.
  - `apps/website/src/features/agent-plugins/host-signals.ts` / `catch-reads-error` / `3` — NOCATCH, grep -c catch: 0.
  - `apps/website/src/features/agent-plugins/new-site-agent-plugin-tokens.ts` / `catch-reads-error` / `2` — NOCATCH, grep -c catch: 0.
  - `apps/website/src/features/agent-plugins/soon-lock.ts` / `catch-reads-error` / `1` — NOCATCH, grep -c catch: 0.
  - `apps/website/src/features/source-control/commit-site.ts` / `catch-reads-error` / `2` — NOCATCH, grep -c catch: 0.
  - `apps/website/src/platform/db/kernel/stopped-database.ts` / `failure-text-from-catalog` / `1` — NOCATCH, grep -c catch: 0.
  - `apps/desktop/src/desktop-memory-sampler.ts` / `catch-reads-error` / `1` — D02, grep -c catch: 0.
  - `apps/desktop/src/desktop-resources.ts` / `catch-reads-error` / `1` — D02, grep -c catch: 0.

## Final diff re-read

Only sheet-listed source/data files and the two required root reports were edited. No source comments, APIs, tests, manifests, lockfiles or unrelated debt values were added/changed beyond the named sheet edits. The moved sampler statements/doc are verbatim. No implementation changes were discarded during the re-read. Removed one unnecessary sentence about an initial size-counting approach from this report; retained the conservative under-500 proof. No additional deletions.
