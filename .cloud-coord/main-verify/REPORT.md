# main verify 2026-10-22 (report-only) — Jini b0666a50, Tovu 77ea2b40
Started 03:41 UTC, report 05:16 UTC. A worker restart at ~04:05 killed running tests; affected suites were re-run (Jini remaining 12 pkgs, Tovu batch 01+).

## Setup issues
- Tovu `npm ci` fails on unpublished @jini-ai/search (known); worked with the line removed, package.json/lock restored. admin/site-chat/desktop `npm ci` OK, sdk build OK, link:jini OK (60 links; Tovu left linked in this container).
- Jini `pnpm install` + `pnpm -r build` OK (rc 0). WARN: `jini-mcp` bin links missing `packages/mcp/dist/bin/serve.js` for examples/reference-web (non-fatal, build order).
- 4 CPUs: batches ran 2 at a time with other suites alongside, so slow tests may have timed out; no re-run done.

## PART 1 — suites
Jini vitest (per package, all 44): everything passes except **1 fail**: admin `theme-boundaries` (ConsentFields.tsx hex fallbacks '#ffffff') = KNOWN (merge2 report, from local-ui). Other pkgs: core 1364, agentic 1441, platform 2497(+6 skip), cms 3987, ui 8680, daemon 3479, chat 3608, agent-runtime 4107, oauth 691, user-mgmt 1047, etc. all pass.
Tovu website node:test: 2573 files, 18 batches of ≤150, `--test-concurrency=2`: **~32,000 tests, ~270 skipped, 169 failing entries** (list: /tmp/v/fails.txt; batch_09 also has 19 cancelled — Postgres-suite timeouts).
- ENV, 120 entries: Postgres (no server): *.postgres.test.ts (vault-read-parity 22, migration-manifest-postgres 17, copy-engine 15, tool-registrations 7, move-site-storage 6, boot-site-dir 6, runner 4, seed-content-store 4, storage-move 4, form-delivery 3, ops 3, kernel 3, init-storage 3, + ~15 more files), pg-fixture.unit (4), postgres-baseline. Also Chromium render-form-layout (3). openapi-contract-fixtures + repair-site (2): "Test home isolation required" because HOME=/root is the real home; dead-path-sweep (2): development/coverage dir absent.
- KNOWN (in merge/merge2 reports), 12: merged-readers-batch redirects_get (isInTrash), bundled-site-import + bundled-tovu-theme skill tool cites, site-exporter never-store Cache-Control, init-site-directory-sync, agent-plugin-search-discovery, mcp-ui-tool-calls allowlist, cross-site-read-catalog, publish-agent-tools propose-credential, bundled-mail-resend 429, analytics-ingest forwarder, route-modules 'agent-plugins'.
- **NEW / unlisted, 37 entries (not in known lists; may be partly load-induced, none re-run):**
  - development/eslint-rules/__tests__/single-fetch-query-provider.unit.test.ts — 10 (rejects second composition ×5, allows registered compositions ×3, allows read hooks, falls back to context.getFilename): AssertionError strictly equal/deep-equal
  - server/__tests__/routes/request-cost-cacheability.measurement.test.ts — 4 ("A: GET /:slug post", "A: static-theme page", "B: ordinary path stays public", "B: member-session not public"): Cache-Control not owner-decided directive (likely same root as KNOWN site-exporter Cache-Control)
  - server/runtime/composition/__tests__/create-app-comments-rate-limit.test.ts — 3 (createApp / createSiteApp real comment HTTP budget; createApp salts comment IP hashes): strictEqual
  - platform/db/__tests__/parity/vault-write-parity.test.ts — 3 ("media: every step matches")
  - features/navigation/__tests__/publish-content.test.ts — 2 (apply() updates existing destination row under OCC; rebinds location)
  - features/deployments/deploy-targets/__tests__/descriptor-fields.unit.test.ts — 1 (shipped hosting plugins declare credential fields)
  - features/media-generation/__tests__/providers-tools.test.ts — 1 (t10 expired form closes: "call returned without a form")
  - features/pages/__tests__/write-region-discovery.integration.test.ts — 1 (describe_tool pages_write_region schema; sibling of KNOWN search-discovery)
  - platform/mail/__tests__/unit/no-mail-vendor-in-core.boundary.test.ts — 1 (core file names a hosted mail provider)
  - server/__tests__/unit/composition-boot-order.unit.test.ts — 1 ("only the fenced vault normalization may await after boot promises start")
  - development/scripts/__tests__/check-idle-motion.test.ts — 1 (live tree idle-CPU offenders/stale allowlist)
  - development/scripts/__tests__/sites-move-home.test.ts — 1 (partial cross-volume copy failure; regex /copy failed/ — possibly root-user/ENV)
  - remaining few entries are in fails.txt (batch_06 has 1 row with binary output).
- Order-flake install-tool-update (known) not seen.
Tovu admin vitest: 803 files, **13232 pass / 9 fail / 2 skip** in 6 files — same count as merge2 (KNOWN: panels-render, panel-access, dictionary-lookup-sinks, untranslated-copy, admin-screens-manifest, chat-settings-tip-phone-css; file names not re-verified one by one).
site-chat: 231/231 pass. desktop: node:test 1743 tests (1733 pass, 10 skip, 0 fail) + renderer/contracts 678 tests (676 pass, **2 fail**, not itemised — see /tmp/v/desktop.out; unclassified).

## PART 2 — app (fresh `tovu init` site, `tovu serve /tmp/v/site --port 3111`, admin/tovu-dev)
- PASS boot reaches ready: GET /healthz 200 `{"ok":true}`, / 200 (agent-daemon listening, ~45s cold under load).
- NOTE: boot log warns "NO USABLE SITE KEY ... no key file at ." (fresh local site is supposed to auto-create one) — possible bug/HOME artifact. Also `[agent-daemon] jini bridge preflight FAILED (exit=1) jini-mcp: HTTP 401` — possible bug (jini-mcp bin dist missing in Jini build warning above?).
- /admin → 503 "Admin shell not built" (apps/admin not built; build not run) — ENV/not run. /api/health 404 (path doesn't exist; /healthz is the health route).
- PASS login POST /api/admin/v1/auth/login 200; list posts/pages/redirects 200 (empty).
- Scheduled post: API rejects status "scheduled" (400 "status must be 'draft' or 'published'"). Created published post with publishAt 2022-01-01: 201, listed once, appears once on `/`. publishAt not echoed in the response → couldn't verify the past-date handling. PARTIAL.
- PASS redirect `/2022/06/13/x/`→`/`: 301 for both with and without trailing slash (Location http://localhost:3111/).
- PASS trash: DELETE 200, redirect list empty, both URLs then 404.
- 30 posts created (201 ×30). **FAIL/N/A paging**: starter theme has no /blog; `/blog`, `/blog/page/2/`, `/page/2/` all 404 and home shows only latest 3 — cannot verify page 2 on the starter theme (needs a theme with listing, as in merge2 "LOCAL VISUAL CHECK"). 
- PASS static export (`tovu export --out`): succeeded, 91 files, all bulk-N + sched-past pages; no page-2 (no listing, see above). Redirect stub written: out2/2022/06/13/x/index.html with meta refresh to / and canonical (PASS).
- PASS GET /api/agents (with session): claude available, supportsSubagents=true, supportsClaudeInChrome=true; all other agents false/unavailable.
- PASS agent daemon starts with server (pid logged) and is stopped on SIGTERM ("exited code=null signal=SIGTERM deliberate=true").
- PASS graceful shutdown: SIGTERM → server exited in 0.52 s; no remaining serve/agent-daemon processes; no hanging workers observed (webhook/go-live/domain sweeper/search maintenance not individually instrumented; log shows no errors).
## PART 3 — RSS (KB; server / agent daemon), 04:50→04:52 only
04:50:19 458072/471816 · 04:52:20 480372/471976. +22 MB in 2 min on server after ~60 requests + 30 post creates + 2 exports; daemon flat. Only ~2 min sampled (sampler died with shell resets) — inconclusive, not a leak signal.

## NOT run
Postgres tests, Chromium/Playwright (ENV by owner rule); admin SPA in browser (not built); typecheck:tests; Tovu `npm run build` (linked); re-run of NEW failures in isolation to separate load flakes; long (30+ min) RSS soak; Jini examples/reference-web.
