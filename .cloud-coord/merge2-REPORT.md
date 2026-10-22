# merge2 REPORT — cloud/merge-2026-10-21 (job 2, 2026-10-22 02:13–03:25Z)
Pre-merge2 tips: Tovu f27498bd7, Jini 9cee44e4. Final tips: see last commit of this file / Jini 1c82b1a0. No main touched, no force-push, 0 subagents used.

## Merged (merge commit) — per branch per repo
1. local-ui-2026-10-21: Tovu ba7265ff1, Jini 8ffe9496 (both clean; branch was based 738/398 commits behind, still clean).
2. fix-site-port-bugs-2026-10-22: Tovu 698866eed, Jini 866129af (clean).
3. assistant-runtime-2026-10-21: Tovu 0ad4a3052, Jini 76fefca0 (clean).
4. cov-fill-rest-2026-10-21: Tovu b53868318, Jini 1c82b1a0 (clean).
5. cov-fill-T2-2026-10-21: Tovu bb1aaa43a (clean). Jini: no remote branch -> skipped.
6. cov-fill-T3-2026-10-21: Tovu d16e52dfc (2 conflicts, below). Jini: no branch -> skipped.
   Sub-branches s1–s6 checked: s1,s2,s3,s4,s6 fully contained; **s5 had 2 commits not in T3** (c47234881, 2c4f9d7b7: pages-route-gaps tests) -> merged c57f0fa8f.
- Final re-fetch before VERIFY end (03:22Z): no new commits on branches 4–6 in either repo.

## Conflicts and how resolved
- Tovu `server/inbound/assistant/assistant-system-overlay.ts` (assistant-runtime vs T3): kept BOTH — assistant-runtime's `BATCH_GUIDANCE` export and T3's `buildBashGuidanceBlock(disallowedTools)` refactor + `BASH_GUIDANCE_BLOCK = buildBashGuidanceBlock(...)`; why-comments kept.
- Its `__tests__/assistant-system-overlay.unit.test.ts`: kept both the batch-guidance test and T3's two buildBashGuidanceBlock tests. File re-run: pass.
- No shared composition/i18n/package.json conflicts. No new migrations in any branch -> no renumbering (0028 still highest).

## OWNER ITEM — ad1476668
`useClaudeInChrome` default false -> TRUE: `features/settings/admin-interface.ts` (definition + doc), `assistant/runtime-preferences.ts`, admin `AssistantDock/assistant-runtime-preferences.ts`. Owner-only, `--chrome` probe, `--no-chrome` when not in effect, Bash disabled: unchanged. Existing installs get the new default via core-default reconcile in `ensureSettingDefinitions`; an explicitly saved `false` still wins (new test). Tests updated: runtime-preferences, admin-interface, assistant-runtime-guidance (+ non-owner/explicit-OFF case), admin preferences. 6 website files 147/147 after fix; admin 5/5.

## Build / tsc
- Jini `pnpm install --frozen-lockfile` OK; `pnpm --no-bail -r build` exit 0.
- Tovu: `npm ci` fails (`@jini-ai/search@^0.1.0` not on npm, known) -> installed with that line removed temporarily, package.json/lock restored (not committed). admin `npm ci` OK, sdk build OK, `link:jini` OK.
- tsc: Tovu website 9 errors, admin 4 — **identical to f27498bd7** (same files/lines shifted) -> 0 new. Jini tsc --noEmit on all 10 touched packages (admin, agent-runtime, chat, cms, core, daemon, oauth, platform, ui, user-management): 0 errors.

## Tests (node 24)
- Jini vitest (maxWorkers=2): platform 2497, user-mgmt 1047, chat 3608, core 1364, cms 3987, ui 8680, daemon 3479, agent-runtime 4107, oauth 691 — all pass. admin 2798/2799: `theme-boundaries` fails on `consent/react/ConsentFields.tsx` hex fallbacks ('#ffffff') — **from local-ui** (same file content on source).
- Tovu website node:test (concurrency 1, 18 batches, 867 files in touched dirs, no *.postgres): 10944 pass / 16 fail, **none merge-caused**:
  - fix-site-port-bugs (verified failing on its own tip): merged-readers-batch `redirects_get` (test deps lack `redirectsWriteDeps.isInTrash`); bundled-site-import skill cites `timezone_string`/`gmt_offset` as tools; bundled-tovu-theme skill cites retired `content_post_list`; init-site-directory-sync expects no `timezone` key; site-exporter never-store Cache-Control (pre-existing per its report).
  - assistant-runtime (verified on its tip): agent-plugin-search-discovery describe_tool `required` undefined; mcp-ui-tool-calls allowlist + cross-site-read-catalog (pre-existing per its report).
  - pre-existing per T2/T3 reports: publish-agent-tools propose-credential; bundled-mail-resend 429; analytics-ingest forwarder; route-modules 'agent-plugins'; 3 Chromium render-form-layout.
  - install-tool-update "nothing changed": fails in batch only, passes 9/9 alone and on base -> order flake.
- Tovu admin vitest full: 13232 pass / 9 fail in 6 files — **all 9 reproduce on local-ui's own tip**: panels-render (50 panels vs 49; `consent` not exercised), panel-access (consent server file), dictionary-lookup-sinks, untranslated-copy (import-export dict "Branch"…; i18n module w/o dict), admin-screens-manifest (generated copy stale), chat-settings-tip-phone-css.
- Not run: desktop/site-chat suites, `typecheck:tests`.

## LOCAL-RUN NEEDED (new, add to merge-REPORT.md's list)
- Real Claude Code + Chrome extension: `mcp__claude-in-chrome__*` present by default now (owner), absent for non-owner / setting OFF; with `--strict-mcp-config`, `--setting-sources ''`, bypass/restricted modes; CLI accepts `--allowedTools … --chrome`; guidance in `--append-system-prompt` [assistant-runtime, owner item]
- Live chat bulk taxonomy/redirect tombstone = one `items` call ≤100 [assistant-runtime]
- juulwin 51 redirects 301 locally then Vercel static publish; `/blog`, `/blog/page/2/` on a real static host [fix-site]
- PG: redirect list `isInTrash`, platform/site-dir, database-transfer tool-registrations; init-site / site-key-dependent-data / move-site-storage / create-site-route-deps / boot-site-dir / open-site-store .postgres; post search-index; migration-manifest + schema parity [fix-site, assistant-runtime, T2, T3]
- Chromium: render-form-layout (3), browser-CSS tests, desktop websites-width [fix-site, T3, rest, T2]
- Non-root run of agent-plugin-search-tool.integration SINK test; real child `local-site-process launch()`; Windows `taskkillTree` [T2, T3]
- analytics-ingest forwarder failure on a clean tree [fix-site]
## LOCAL VISUAL CHECK (new)
- Paging nav (tovu-starter/tovu-theme listing-default + originals, 6/page); site-timezone dates (LA, 23:30 post) across fashion-modern, storefront, ledger, no-theme, cards, recent-entries, dispatch/minima/clean-blog [fix-site]
- local-ui: Import & Export panel + Git backup card, Cookie Consent page (sections, preview frame, 21 locales, dark), agent-plugins narrow list/scroll, chat dark-mode send/stop icons + question cards, chat settings segmented control + info tips (phone) [local-ui; no REPORT on that branch]
## OPEN OWNER QUESTIONS (new, deduplicated)
- Chrome: keep owner-only? (now default ON) · batch list/search reads? combined confirm card for asking tools per batch? [assistant-runtime]
- Paging 6/12/24 per page; page-2 title/canonical; `/page/1` redirect vs 404 · delete-confirm copy mention Trash (20 locales) · copy `config.json` timezone on duplicate/repair; set juulwin `core.site.timezone` · normalise `fromPattern` on write · publish `@jini-ai/search` or change Tovu dep so `npm ci` works [fix-site]
- workspace/delete `deleteWorkspaceUnlessBound`: target id once a 2nd workspace exists? deployment-overview guard [T3] · plugin update w/o mcpProvisioning disables an ENABLED plugin — intended? [T2]
- local-ui left 9 admin + 1 Jini test red (above) and fix-site/assistant-runtime left 7 website tests red: assign follow-up fixes? (not done here: merge-only job)
