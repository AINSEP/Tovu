# cov-fill-T3-2026-10-21 REPORT (Tovu lots tovu-038..055, 382 files)
Branch `cloud/cov-fill-T3-2026-10-21` (Tovu), from `cloud/merge-2026-10-21` f27498bd. Jini untouched (built + linked only). 00:41Z–~02:25Z. 6 Opus subagents, max 3 at once; each in its own worktree/branch `...-sN`, merged here. Ledger: `cov-fill-T3-2026-10-21-progress.md`.

## Measurement method and its limits (read first)
- node:test `--experimental-test-coverage --test-reporter=lcov`, `--test-coverage-include=<lot files>`, one process at `--test-concurrency=1`; lcov merged per file (max hits). Only tests that load the real file count.
- Test set per file: tests in its dir and `__tests__/**`, plus tests that import it or name `<dir>/<file>`. Lots 043–049 were measured with a TRIMMED set (>25 tests: only tests named after the file) because the full sets ran ~9 s/file. Trimmed sets UNDER-state: s6 re-measured lot 040's 15 "below" files with the right route tests and 14 were already 100.
- Caveats: (1) without `--enable-source-maps` the missed line numbers are tsx-compiled lines; % totals are fine. (2) Node's default coverage exclude matches `**/test-*`, so `assistant/test-agent.ts` and `test-connection.ts` showed NEVER-LOADED (both 100/100/100 with `--test-coverage-exclude='**/__tests__/**'`). (3) `worker-import-graph.test.ts` loads public-http site renderers via tsx CJS in a child; that copy adds never-run getters (explains render.ts' earlier "below"). (4) tsx interop helpers (`__copyProps`, `__toCommonJS`, `.then(interop)`) show as uncovered branches/functions in some files.
- NOT MEASURED: lot 038 (25 files, 131 test files; stopped at the time cap). Lot 038's last numbers are wave T3's own.

## Per group: before -> after (files at 100 L/B/F / files)
| lot(s) | area | before (this run) | after | who |
|---|---|---|---|---|
| 038 | platform db/sqlite, headless-browser, otel | not measured | not measured | — |
| 039 | platform/site-dir | 17/23 | 17/23 | measure only |
| 040 | admin-http assistant, dev-auth, http/menus+widgets | 10/25 (trimmed) | 24/25 | s6: 13 were test-set gaps; menus.ts via new DTO test |
| 041 | change-sets/comments/forms/external-mcp/... | 17/25 (2 never-loaded) | 24/25 | s4 |
| 042 | forms/fs-files/integrations/media/members/menus | 25/25 | 25/25 | measure only |
| 043–045 | newsletter, pages, posts, publish-content, system | 50/75 (trimmed) | >=59/75 (14 not re-measured) | s5 |
| 046 | users/trash/taxonomy/themes/system | 20/25 | 20/25 | measure only |
| 047–048 | users/widgets/workspace routes, inbound assistant, public-http site | ~3/37 (lot baseline) | 35/37 | s1 |
| 049 | public-http, middleware, boot | 15/25 | 15/25 | measure only |
| 050–052 | runtime boot + composition (+modules/assistant-*) | 3/50 | 18/50 (17 more improved) | s2 |
| 053 runtime | lifecycle, plugin-tier2, external-mcp-probe | 1/11 | 7/11 | s4 |
| 053 content + 054–055 | agent-plugins .mjs, shadcn examples, sdk | 11/36 | 27/36 | s3 |

## Refactors for testability (behaviour identical)
- `workspace/delete.ts` `deleteWorkspaceUnlessBound` extracted (not-bound path unreachable over HTTP). s1 had changed its delete id to `targetWorkspaceId`; coordinator reverted to `deps.workspaceId` (c3c1a604). **OWNER: should it be the target id once a 2nd workspace is addressable?**
- `users/reset-password` `sendResetPasswordError` exported; `assistant-system-overlay` `buildBashGuidanceBlock(disallowedTools)` pure (text identical); `attempt-process-identity` `readProcessStart` takes injectable `exec` (ps failure path).
- `external-links.ts` removed a `?? ""` the regex makes unreachable (comment says why) — not a route-param guard.
- s2: `allocateFreePort` `createProbe` port; `sealConnectionStringForNewSite`/`sealPendingAgentPluginTokensForNewSite` `ensure`/`sealerFor` ports (in-process instead of child-only); `siteGuideFactDeps`, `siteConsentPorts`, `loadSqliteSeedDeps` pulled out of composers; `warnFamilySkipped` replaces 4 identical catch-and-warn blocks; `createPublishTrustGrantResolver` `readFile` port; test-only exports of `resolveProviderFromCredential`, byok `resolveMessages`/`toWireSurfacePayload`, ag-ui `resolveAgUiMessages`, seed `link`/`ol`.
- s3: google-workspace `http.mjs` `request` endless `for(;;)` -> bounded recursion (same attempts; loop exit was unreachable); cloudflare `target.mjs` `verifyCredential` split into `verifyAt`/`verifyVerdict`/`tokenStatusVerdict` (unreachable post-loop return; keeps complexity <=10); vercel comment corrected (the `if (!json) continue` guard IS reachable; now tested).
- Coordinator 77312187: the 6 not-found assertions wave T3 loosened (deepEqual body -> one field/regex) for the `req.params.x ?? ""` guards are exact again — integrations delete/pause x4 (2 files), forms PUT (error+code), members disable; titles/comments no longer say the guards were removed. 404 status asserted in all.

## Still below 100 (reason)
- Kept defensive guards (not removed, by rule): restore-points; github-actions.mjs :48/:53/:57 (path-injection re-check); destination-panel :112; netlify :166, github-pages :195 (`fallback ||`); s3-compatible :799; site-consent `page.body ?? ''`; daemon-client `statusCode ?? 502`; public-site-guide `authorize`; external-mcp-probe second guard; wave T3's kept guards in posts/autosave, pages/delete, users/create, deployment-overview (OWNER decision), publish-credentials.
- Never loaded / too large to split here: `inbound/assistant/agent-daemon-server.ts` (import-time process entrypoint, ~1,860 lines; tests read its source; needs a split into importable modules + thin entry).
- Loader-only: handlebars-worker 1 branch (CJS `require.extensions`); sdk hooks/index (tsx interop helpers); headless-browser `.then(interop)` arms (lot 038, T3).
- Not reached in time: s2's 13 untouched + 17 partial composition files (vault-boot, plugin-host, tool-catalog-manifest F 9/21, site-key-recovery, local-credential-copy, plugin-runtime, assistant*.ts, app.ts 49/139 F and deps.ts 97/174 F on a subset); lot 039 duplicate-pglite-store, duplicate-site, local-site-child, product-root, site-root `noDirectoryScan`; lot 046 site-key (B 139/154), sites, source-control-credentials (B 30/44), themes/duplicate, users/create; lot 049 worker-sandbox, theme-preview-switcher, newsletter-confirm/unsubscribe, pages.ts (B 465/482), media-rendition, handshake, agent-daemon-wanted, boot-readiness-gate, bootstrap; local-site-process `launch()` (spawns real tsx child), local-site-host rejected-shutdown catch, daemon-supervisor (win32 `taskkillTree` + log wording), boot-lifecycle 1 branch; admin-dev-proxy 1 source-mapped line (likely map quirk).
- Untestable in place: shadcn-ui examples auth-layout/data-table/form-pattern (`@/components/ui/*` not in repo).

## LOCAL-RUN NEEDED
- PG: init-site.postgres, site-key-dependent-data.postgres, move-site-storage.postgres (+ copy body), create-site-route-deps.postgres, open-site-store pg arms, deps/app pg paths, boot-site-dir.postgres.
- Chromium: 3 form-style tests in public-http site ("contact form hidden by emitted stylesheet", "fallback error and success colors", "checkbox fields render inline").
- Real child process: local-site-process `launch()`; Windows: daemon-supervisor `taskkillTree`.

## Tests (all failures below are NOT from this job)
- Coordinator runs (lots 039–046, 049): 41 710/707, 42 782/780, 43 694/691, 44 776/775, 45 828/827, 39 450/436, 46 1062/1053, 40 795/794, 49 1716/1712. Failures: Postgres-only (no server), route-modules "module 'agent-plugins' registers exactly its routes" (merge: plugins added `update/zip`, test list not updated — fails on f27498bd), site-backups.integration (merge REPORT's orphan test), 3 Chromium form tests, analytics-ingest "per-request forwarders…" (lot 049 run; no worker touched analytics; not checked on base).
- Workers: s1 1908/1899 (8 pre-existing: 3 Chromium, editor-schema drift guard, 4 request-cost-cacheability); s2 517/517 + 1100/1101 (route-modules); create-app-comments-rate-limit 3 fail also on f27498bd; s3 1243/1243 (sdk root-export test needs `packages/sdk/dist`, gitignored); s4 658/655 (PG x2, route-modules); s6 all pass but route-modules.
- No .skip/.todo, ignore comments, excludes, threshold changes or target self-mocks added. A test leak wrote `sites/tovu-dev/agent-plugins/` and `chat.db` into the checkout; removed, not committed.

## Complexity
eslint `complexity` 10 + `sonarjs/cognitive-complexity` 10 on every touched source file (s1: 6 files, s2: 12, s3: http.mjs + target.mjs): 0 errors. s4/s5/s6 changed tests only (s5: see below).

## s5 (lots 043–045 below files)
- Full-map re-measure: all 6 newsletter "below" files were already 100 (trimmed-set false negatives). pages/create 117/123 20/24 -> 100; pages/list B 7/8 -> 100 (new `pages/__tests__/pages-route-gaps.test.ts`, 6 tests, exact 403/409/400 bodies); pages/update-html -> 100 once `admin-page-html-route.test.ts` is in the set.
- Still below: pages/delete B 28/29, pages/update L 240/241 B 36/37 (branch not identified in time). Not re-measured: posts/{autosave,create,delete,get-by-id,list,update}, publish-content/{blob-get,blob-put,blobs-probe}, system/{custom-credentials,deployment-overview,dockerfile-source,publish-credentials,publish-site} (trimmed numbers; likely partly false negatives). s5: tests only; 353/353 pass.
- Next wave: rebuild the test map to include `server/__tests__/*-routes.test.ts` that register a route by path (not only by import), then re-measure lots 038, 043–046, 049 before writing tests.
