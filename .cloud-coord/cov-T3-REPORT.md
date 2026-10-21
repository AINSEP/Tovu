# Coverage wave T3 — REPORT (tovu lots 038..055)

Result branch: `cloud/cov-T3` (Tovu), from `cloud/integration-2026-10-21` @ e0c935bb5 (Jini @ b3c4144b). Ledger: `.cloud-coord/cov-T3-progress.md`.
Window: 15:37–21:45 UTC (original 4 h cap; account rate limit stopped subagents ~17:25–19:51; owner lifted it and moved the hard stop to 21:45).

## Outcome
- Lots merged: **038, 039, 040, 041, 042, 043, 044, 045, 046, 049** (10 of 18), plus a follow-up branch covering restored guards.
- Not started, for the next wave: **047, 048, 050, 051, 052, 053, 054, 055.**
- Every number below is "after", measured with the brief's scoped node coverage command and named test files. **"Re-measured"** means the coordinator re-ran it on the merged branch; anything else is the subagent's number.
- All runs: 0 failing tests. The guard-restore check ran 246 test files / 2558 tests, 0 fail.

## Per lot (files at 100% L/B/F / files in lot)
| lot | area | at 100% | coordinator re-measured |
|---|---|---|---|
| 038 | platform db/sqlite, headless-browser, otel | 19/25 | gated-mutation-token-repo, publish-trust-revocations |
| 039 | platform/site-dir | 19/23 | whole lot (57 test files, 635 tests) |
| 040 | admin-http assistant, agent-plugins, auth | 23/25 | all 25 files before the guard restore; 8 assistant credential routes again after it |
| 041 | admin-http change-sets/comments/forms/external-mcp/entries/content-types/database/consent/assistant | 23/25 | consent, entries x3 + write-error-status, restore-points |
| 042 | admin-http forms/fs-files/integrations/media/members/menus | 25/25 | forms x5, menus x5 |
| 043 | newsletter, pages, plugins, menus/update-tree | 23/25 | pages x6 |
| 044 | posts, publish-content, recovery, redirects | 24/25 | posts/autosave |
| 045 | redirects/seo/settings/sites/skills/system | 23/25 | site-imports, custom-credentials |
| 046 | users, trash, taxonomy, themes, system | 23/25 | see below |
| 049 | public-http, middleware, boot | 20/25 | content-db-schema-guard, agent-daemon-wanted, site-consent |

Baseline (before) per file: `.cloud-coord/coverage-lots/tovu-NNN.txt` on `cloud/coverage-lots-2026-10-21`. Per-file before→after detail: the ledger and each lot branch's commits.

## Files not at 100% (L / B / F after), with the reason
- 038 `vault-credential-recovery.ts` 100/94.59/100 — coordinator reverted a change that swapped 3 fail-safe fallbacks for `!` assertions in credential recovery; guards kept (**owner review**).
- 038 `publish-backstop-row` br 61/62 — SQL-quoting guard kept on purpose.
- 038 `import-database-worker` 124/125, 32/35, 16/18 — the remaining paths need a hostile or corrupt source DB.
- 038 `desktop-render` br 8/9, `lazy-browser` br 5/6, `playwright-loader` br 15/16 — the missing branch is the `__esModule` arm of the `.then(interop)` tsx adds to every dynamic `import()`, which cannot run for ESM. The subagent counted these as 100%; the scoped command does not.
- 039 `init-site` 99.59/96.88 and `site-key-dependent-data` br 96/fn 83 — need real Postgres. `local-site-child` br 97.06 — subprocess coverage is not merged back under tsx. `site-root` fn 80 — empty required port; the folder scan it replaced cannot run (verified against Jini `selectWorkspaceDirectory`).
- 040 `http/menus` 97.84/76.19/100 and `http/widgets` up to 98.35/100/95 — the subagent claimed 100% without naming tests; **not reproducible** with any direct, non-mocking test set.
- 041 `routes/database/restore-points.ts` 100/97.56/100 — coordinator reverted a `!` assertion in restore code; guard kept.
- 043 `pages/delete.ts` br 96.30, `pages/update.ts` 99.59/97.14 — coordinator reverted rollback `as PostRecord` casts; `if (!priorPost) return;` kept.
- 044 `posts/autosave.ts` 98.97/98.67/100 — coordinator restored the `instanceof PostValidationError` rethrow, which the subagent had removed, widening the catch.
- 045 `system/deployment-overview` br 22/23 — the default `inspectSiteKeyMaterial` reads the live env, homedir and cwd. Making `siteKey` required was **refused by the permission classifier as "Security Weaken"**; left unchanged. **OWNER DECISION.**
- 045 `system/publish-credentials` br 74/75 — unreachable guard in credential code; kept.
- 049 `theme-preview-switcher` br 52/53, `bootstrap` fn 21/22, `media-rendition` br 111/112, `worker-sandbox` br 11/13 (needs an injected esbuild port), `pages.ts` (not started).
- 041 `forms/create.ts` (after the guard restore) — 91.30% br with the forms tests alone; the subagent's 100% came only from a 202-file whole-app run that the coordinator did not reproduce.
- 046: _filled in at merge_.

## Unreachable code removed and accepted (file — why)
- 039 `site-root.ts` folder-scan port — `resolveSiteRoot` always passes `selected`, so Jini never calls the scan.
- 040 `agent-plugins/list.ts` `?? "unknown/…"` / `?? []` — the loader always builds id and provides; return type narrowed.
- 040 `admin-dev-proxy.ts` — `statusCode ?? 502`, `statusMessage ?? …` (a client response always has a parsed status line) and `req.url ?? "/admin/"` (now an `isAdminUpgradeRequest` type predicate).
- 038 `COUNT(*)` `?? 0` in gated-mutation-token-repo and chat-orphan-check; publish-backstop-row empty-primary-key check; import-database-worker `?? []` on sanitizer output.
- 043 `plugins/set-enabled.ts` `DUPLICATE_COMMAND` arm (the route never sends an idempotencyKey).
- 044 `template-preview-render` `?? null` → `""`; `destination.ts` `target?.nextStep ?? null` (return type narrowed in `connect-destination.ts`).
- **Rejected and restored by the coordinator:** see above, and the guard section below.

## Route-param guards (coordinator error, corrected)
Lots 040, 041 and 042 removed **76** `String(req.params.X ?? "")` guards in **53** route files as "unreachable". The coordinator's dispatches to 044/045 wrongly called that accepted. The repo rule is to **keep** these guards: they were restored on 2026-09-03 after being wrongly deleted (`routes/media/route-guards.ts:18`). Lot 043 found the rule.
- Coordinator restored all 76 verbatim (46038f368) and returned six loosened not-found assertions to their original exact message.
- `cloud/cov-T3-guards` (merged 83e75094e) added direct-handler tests with hand-built `req`s for every restored guard: test files only, exact status + body. The subagent reports all 53 files at 100% in a 202-file run (2246 tests). Coordinator re-measured the 8 assistant credential routes at 100/100/100 (71 tests) and the forms routes (7/8 at 100).

## Refactors for testability (injected ports, defaults at the edge)
- 039 `local-site-child` → `runLocalSiteChild` with injected `proc`/reaper/bundle/entry/timers; now runs only under `import.meta.main`, failed boot → `failBoot` (exit 1).
- 039 `claimSiteRunning` readSite, `completeKeyOnlySiteMeta` readText, `resolveProductRoot` thread.
- 038 `rebuildImportDatabase` limits/statfs/fork/moduleUrl.
- 041 shared `write-error-status` tables (entries, content-types); assistant `testProviderConnection` port.
- 043 `createAdminNewsletterSendCampaignRoute({ buildSendPipelineDeps })`.
- 044 `recovery/restore.ts` `sendInternalError` helper.
- 045 `site-imports` upload deadline/idle limits.
- 046 `themes/preview` `previewServiceForHost`.
- 049 `checkContentDbSchema` compare, `agent-daemon-wanted` env/log.

## Review notes for the owner
- 038 lazy-browser test module-mocks `playwright` (third-party boundary).
- 041 one test runs the real agent detector (spawns any agent CLI on PATH); its asserted outcome is deterministic.
- Process: subagents shared one scratch folder until 16:41 and lot 038's measuring script was overwritten. The brief then gave each lot its own folder; affected lots re-measured.
- Typecheck: `tsc -p tsconfig.tests.json` shows ~46 errors in files no lot touched (backstop-service, composition app/deps, …); not compared to the base commit.

## Setup and environment
- Node 24.22.0, Jini install + build OK, Tovu `npm ci` (root/admin/site-chat/desktop+preload) OK, sdk build OK, `link:jini` OK. Each lot worked in its own git worktree with node_modules symlinked to the main checkout.
- Postgres and Playwright: not installed (owner override). LOCAL-RUN NEEDED:
  - `apps/website/src/platform/site-dir/__tests__/integration/init-site.postgres.test.ts` (all tests)
  - `apps/website/src/platform/site-dir/__tests__/unit/site-key-dependent-data.postgres.test.ts` — "Postgres (env) site — a clean database is no data; a sealed row is data", "…whose database cannot be reached fails closed".

## Caps used
- Subagent sessions: **11 / 15** (038, 039, 040, 041, 042, 043, 044, 045, 046, 049, guards). Concurrency ≤ 3 at all times. 044, 045 and 046 were resumed with SendMessage (same session).
- Complexity: each lot ran sonarjs (cognitive-complexity 10 + complexity 10) on touched sources: 0 errors.
