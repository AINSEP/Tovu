# fix-site-port-bugs — REPORT (2026-10-22, 00:58–01:45 UTC)
Branch `cloud/fix-site-port-bugs-2026-10-22` in Tovu and Jini (from `cloud/merge-2026-10-21`). 4 opus subagents used (B, C, D, D follow-up).

## Bug A — multi-segment redirects (Cannot GET; export refused)
- Root cause: the request reaches the resolver without its trailing slash, but the 51 WordPress rules are stored with it (`/2022/06/13/craving/`). Exact match compared raw strings: Jini `packages/cms/src/redirects/matcher.ts:94` (`matchExact`), `repo.memory.ts:44`, `sql/repo.ts:79` (`lookupExact`). Result: "Cannot GET", and the exporter re-requests every exact rule, got a 404 and failed the export.
- Fix: new `redirects/path-key.ts` (`redirectPathKey`/`sameRedirectPath`). Paths are compared with trailing slashes dropped and percent-encoding decoded (an encoded `/` stays distinct; case is kept). Stored data is unchanged and there is no schema change. The export then writes the usual redirect stubs at `<path>/index.html`.
- Tests: Jini `path-key.test.ts` (depths 1–5 × with/without slash on both sides, encoding) plus contract `lookupExact` on memory, sqlite and pglite. Tovu `redirects-site-serving.test.ts` (live HTTP, depths 1–5) and `site-exporter.test.ts` (51 rules exported with zero failures). All seen failing before the fix.
- Commits: Jini 36c7149e; Tovu fda503135.
- Coverage: matcher.ts, path-key.ts, repo.memory.ts and sql/repo.ts are all 100/100/100.
- Note: `toVercelRedirects` (host-config) is not used by Tovu's exporter, so the stubs are the host format; I left it unchanged.

## Bug B — remove did not remove
- Root cause: list route `routes/redirects/list.ts:37` and `redirects_list` (`tool-registrations.ts:133`) listed rules in Trash. Also, `tombstoneRedirect` (Jini `redirects.ts` ~717) treated any disabled rule as "already removed".
- Fix (preferred option): Jini `listRedirects({deps:{repo,isInTrash}})` leaves out trashed rules, and tombstone asks `isInTrash`. The admin port and conformance now say removal leaves the list. Tool text, search metadata and confirmation all say Trash. Restore is via Trash or `status: active`.
- Tests: Jini `redirects.test.ts` and admin conformance/memory. Tovu `list.test.ts`, `agent-tools.tombstone-confirmation.test.ts` and admin `redirects-swap.unit.test.tsx`.
- Commits: Jini 27d5ef42; Tovu 03fb27a27. Coverage 100% on touched logic files.

## Bug C — post lists stop at 24
- Root cause: `LISTING_BATCH_MAX` = 24 (Jini `cms/src/listing/batch.ts:11`, via `postPreviewsBatchSize` in Tovu `static-render.ts:475`). The only way past it was the JS-only see-more button.
- URL shape: `/page/<n>/` (home) and `<page>/page/<n>/` (e.g. `/blog/page/2/`). Page 1 is the bare URL. `/page/1`, pages past the last one, and pages with no paged list return 404.
- Theme use: add `"paged":true` to the `{"type":"post-previews",…}` marker. The default nav is `<nav class="jini-pagination" aria-label="Pagination">` with rel=prev/next "Newer posts"/"Older posts" and "Page N of M". It has no CSS, so it inherits the theme's styles, and it renders only when totalPages > 1.
- Paging code: Jini `cms/src/listing/paging.ts` (page math, visibility-aware paged read, URL builder/parser, nav, link extraction). The exporter follows nav links, so every `page/<n>/index.html` is written.
- tovu-theme guidance: `content/agent-plugins/tovu-theme/SKILL.md` gets a new Rule 6 and a checklist item. It says to check the site's post count, says any list that can exceed 24 MUST be paged, and includes the exact snippet.
- Tests: Jini `paging.test.ts` (20 tests). Tovu `static-render-paging.test.ts`, `pages.paging.route.test.ts` and the exporter test.
- Commits: Jini 87278c81; Tovu 010d924f4, 173a97caa (removes Bug D hunks swept into 010d), 971b39491.
- Coverage: paging.ts and paths.ts 100%. Tovu pages.ts 99.3/96.6/98.4; site-exporter.ts 99.6/92.6/100; static-render.ts is only partly measured because node's line mapping is unreliable (every new branch has a test).

## Bug D — dates in UTC
- Root cause: `toLocaleDateString` was called with no zone (Tovu `render.ts` ~2872, `pages.ts` `formatPostPreviewDate` ~2327, Jini `widgets/resolvers/recent-entries.ts:105`). Also `render.ts:271` `shortDate` (`iso.slice(0,10)`) feeds the `dateShort` field themes use, and the Liquid engine had no `timezoneOffset`.
- Setting: `core.site.timezone`, site-scoped and registered through the settings ledger (`features/settings/site-timezone.ts`); no schema change. Value used: the owner's value if it is valid, else the zone recorded at site creation (`init-site` writes `timezone` to config.json), else UTC. The site-import `SKILL.md` now tells the agent to set it from the WordPress `timezone_string`.
- Fix: Jini `@jini-ai/cms/widgets/date-label` (formatDateLabel, formatIsoDate, normalizeTimeZone, SiteTimeZonePort), injected through `RouteDeps.siteTimeZone`. `dateShort`, the no-theme entry-meta line and the Liquid `| date:` filter (one engine per zone) now use the site zone. `<time datetime>` still holds the stored instant, and stored dates are untouched.
- Tests: Los Angeles and Tokyo around midnight (e.g. 2022-06-14T03:30Z shows 06-13 in Los Angeles), the UTC default, and an invalid zone. Files: Jini `date-label.unit.test.ts`; Tovu `site-timezone.test.ts`, `pages.site-timezone.route.test.ts` and `render-site-timezone.unit.test.ts`.
- Commits: Jini 6cfe44f2, af7b09ea; Tovu 4544b811b, 70fdeb1a9. Coverage: date-label.ts, recent-entries.ts, site-timezone.ts, read-site-dir.ts and theme-page-preview.ts 100%; liquid-render.ts 100/96.2/100, where the uncovered branch was already uncovered at HEAD.

## Tests (final run on HEAD)
- Jini cms redirects + listing + widgets: 71 files, 1085/1085 pass.
- Tovu redirects-serving, site-exporter, paging route, timezone route/unit and tombstone tools: all pass except one. "live site: static-export marker … never-store Cache-Control" fails identically on the base Tovu commit (with this Jini linked).
- Subagents' wider runs: only Postgres, Chromium and that analytics-ingest warn-mock failed.
- Complexity: eslint with complexity and sonarjs/cognitive-complexity at 10 reports no errors on touched functions. The remaining warnings are in code we did not touch.
- Setup note: Tovu `npm ci` fails because `@jini-ai/search@^0.1.0` is not published on npm. I installed with that line removed temporarily (package.json restored); link:jini supplies the package.

## LOCAL-RUN NEEDED
- Re-enable the 51 juulwin redirects, check e.g. `/2022/06/13/craving/` gives a 301 locally, then statically publish to Vercel and check the stubs.
- Postgres suites: redirect list `isInTrash` per disabled row, and `platform/site-dir` tests.
- Playwright/Chromium: `render-form-layout.test.ts` (3 tests) and the browser-CSS tests.
- `/blog` and `/blog/page/2/` on a real static host.
- analytics-ingest "forwarder failure", on a clean tree.

## LOCAL VISUAL CHECK
- Paging nav: `content/themes/static/tovu-starter/render/pages/listing-default.html` and `content/themes/static/tovu-theme/render/pages/listing-default.html`, plus their `__original-themes__` copies. Both are now paged at 6 per page.
- Dates, with the zone set to America/Los_Angeles and a post at 23:30 local time: fashion-modern `home.liquid`/`entry.liquid`, storefront `entry.liquid`, the ledger `.hbs` (`dateShort`), no-theme `.entry-meta`, post-preview and collection cards, the recent-entries widget, and the dispatch, minima and clean-blog fixtures.

## Owner questions
1. Bug C: should the shipped blog stay at 6 per page, or use 12 or 24? Should page 2+ get its own `<title>`/canonical? Should `/page/1` redirect to the bare URL instead of returning 404?
2. Bug B: should the admin delete-confirm text (20 locales) mention the Trash?
3. Bug D: should duplicating or repairing a site copy `config.json` `timezone`? Sites created earlier render UTC until a zone is set; for juulwin, set `core.site.timezone`. Note that a theme's `{{ "now" | date }}` now also renders in the site zone.
4. Bug A: stored `fromPattern` values are compared, not rewritten. Should the write path also normalise them, for example to stop `/a` and `/a/` being saved as two rules? Duplicate detection already treats them as the same rule.
5. Should `@jini-ai/search` be published, or the Tovu dependency changed, so `npm ci` works?
