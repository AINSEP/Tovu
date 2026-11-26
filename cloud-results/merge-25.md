PARTIAL T @TSHA@ J @JSHA@ | FILES LEFT 882/97 | left: website tsc 33 (NEW, slice type mismatches listed below); Jini guard 181 rows (NEW from the x4 slices, mostly SI-domain 101 / HW3 24 / R14 13); desktop `npm run gates` not run; Tovu changed tests + typecheck:tests not run; Jini tests partial (see table); 97 true-left files

# MERGE-25 — last Tovu->Jini extraction round (Codex Sol x4, untested) onto merge-24 (2026-11-26)

Unattended cloud run. Coordinator: Opus (high). Read `AI-Dev-Shop/agents/programmer/skills.md` (v1.7.5) first.
4 subagents in total (the cap): 1 Sonnet (counter calibration), 3 Opus-high (Jini build fixes: devops; plugins/agent-plugins/mcp/admin; cms/integrations).
No codebase-memory tools, no RemoteTrigger, no `--no-verify`, no force-push, no tag/publish. `main`, `release/*`, merge-23 and merge-24 untouched.
Environment: Node 22.23.5 (repo pins 24; engine warnings only). Tovu installed with `npm ci --ignore-scripts --legacy-peer-deps`
(contracts `prepare` suppressed during install only, then restored), `JINI_PACKAGES_DIR=/home/user/Jini/packages npm run link:jini`.

## Merge table

| repo | branch merged | result |
|---|---|---|
| Jini | `codex/x4-allj` | 4 conflicts. `cms/fs-files/agent-tools.ts` add/add: kept merge-24's reviewed catalog (`{rootIds, rootDescriptors, maxFileBytes}`, bound by Tovu T-c). `platform`/`user-management` `package.json`: union, merge-24 values kept for duplicate keys. `member-login/oidc-request.ts`: slice version (destructured `required`). |
| Jini | `codex/x4g-adminj`, `-restj`, `-walj`, `-wmzj` | clean |
| Jini | (fix) | `pnpm install` refused: two NEW workspace cycles (cms→user-management, cms→devops, both test-only devDeps). Fixed by moving one SQLite case into user-management and dropping a type-only test annotation. |
| Tovu | `codex/tv-x4g-admin` | `features/email/Email.tsx`, `EmailProviderTab.tsx` modify/delete: kept merge-24's deletion (T-d `email-panel.tsx`). |
| Tovu | `codex/tv-x4g-rest` | 9 conflicts: merge-24 T-GATE `errors: RouteErrorPorts` (required) kept together with the slice's `handlerName` and requestDeps; `newsletter-public-scope.ts` deletion (slice) kept; imports unioned; `x4-keeps.md` unioned. |
| Tovu | `codex/tv-x4g-wal` | 14 conflicts: slice deletions of `asset-destinations.ts`, `copy-tool.ts`, `image-transform/tool.ts` kept (HEAD had only import moves); `fs-files/agent-tools.ts` stays deleted (T-c); wal's Tovu bindings taken, `human-confirm` imports re-pointed (rest moved `refuseUnexpectedKeys`/`notConfirmedResult`/`toolApprovalConfirmation` to Jini); `getHostFsFilesAgentToolCatalog` kept in `fs-files/tool-registrations.ts`. |
| Tovu | `codex/tv-x4g-wmz` | 24 conflicts: one-line vendor-credential/project-keys/widgets import moves re-applied on the rest/wal versions; big wmz rewrites (`permanent-delete`, `publish-content` tool registrations) taken with import fixes; tests: imports unioned (existing path preferred), duplicate-tool calls carry both the wal catalog args and wmz's `POST_TOOL_HOST` map. |

## Gates — NEW vs old (old = merge-24 reports)

| gate | merge-24 | merge-25 now | note |
|---|---|---|---|
| Jini `pnpm -r build` | green | **green** | 191 slice errors fixed (devops 86, cms 75+, plugins 30, mcp 22, agent-plugins 18, admin 14, user-management 12, chat 3, daemon 2, search 1, integrations 1, cookie-consent 1) |
| Jini guard | 6 (R13 ×6) | **181** (peak 208) | NEW, all from the slices: SI-domain 101, HW3-module-state 24, R14-runtime-module-cycle 13, N1/N2 13 (was 46; 33 files' comments neutralized), L1/L3/L5 17, N3 5, R5 1, HW4 1 |
| Tovu admin tsc | 0 | **0** | 33 NEW fixed |
| Tovu website tsc | 0 | **33** | 61 NEW -> 33; list below |
| Tovu `typecheck:tests`, `typecheck:e2e`, desktop `npm run gates`, Tovu changed tests | 600 / 0 / flaky | **not run** | cap reached on the build/tsc repair |
| Jini changed-package tests | — | see table | |

@JTESTS@

### Website tsc — 33 left (exact blockers)
- `site-backup/share-database/repo.sqlite.ts` ×2, `memory-deps/route-deps/trash-and-content.ts`, `site-deps/route-deps-content-chat.ts`, `site-deps/site-sharing.ts`: Jini share-database projection now takes a structural `sql` tag and its own `ShareDatabaseProjection`; the Tovu binding must pass kysely's `sql` and use the Jini projection type (devops consumer change made this run).
- `public-http/routes/site/pages/{static-tier ×2, template-render, handlers/virtual-page ×2, handlers/post ×2, handlers/marketing ×2}.ts`, `admin-http/routes/posts/template-preview-render.ts`, `http/site/render-site.ts`: Tovu `features/theme/static-render-menus` `StaticMenuContent` (array of items) vs cms `render-context/static-menus` (`ResolvedNavItem[]`); embed result now `| undefined`; `SiteChatSelection` narrower than the theme flag; `preserveAuthoredFallback` optional.
- `post/revision-thinning.ts`, `modules/revision-thinning-routes.ts`: Jini thinning wants a kernel typed with its own `posts`/`post_revisions` view; Tovu passes `ContentKernel`.
- `site-backup/import-keep-off.ts`, `forms/protect-existing-files.ts`, `project-store.ts`: same kernel-shape class (Jini structural kernel vs `ContentKernel` / `SqliteKernel<SecretsVaultDatabase>`).
- `deployments/publish-agent-tools.ts` ×2, `static-publish/domain-publish-tool.ts`, `composition/app.ts`: wal's `StaticPublishToolDeps` (env, catalog, ports) vs devops' now-optional-port shape.
- `commerce/purchase.ts` ×3: `JsonRouteSpec` ports type drift (commerce spec vs host mount).
- `agent-plugins/connect-sign-in-wait.ts`, `site-inspection/tool-registrations.ts` (cast no longer overlaps), `webhooks/site-key-ensure.ts` (source-material reader returns `| undefined`), `middleware/site-cookie-consent.ts` (`RawContribution` weak type), `mail-status/provider-tool-registrations.ts` (search candidate shape).

## Files finished this run (counter)
- **Keep ledger written (K0):** `plans/count-1125/k0-keeps.md` = Appendix B of `reviews/x4-check-1125.md` (177 STAYS-HOST paths, all exist). `plans/count-1125/x4-keeps.md` normalized to one parseable block (the slices' 90 G3 keeps; before, it was mixed formats the counter could not read).
- **G3-reviewed binding residuals (22):** `plans/count-1125/merge25-g3-keeps.md` (each read in full, LOC + residual recorded; 5 files reviewed and refused, named there).
- **Extracted / deleted:** `features/identity/user-purge.ts` deleted -> Jini `@jini-ai/user-management/identity/sql/kernel-user-purge` (`KernelUserPurge`, 2 SQLite tests incl. rollback); 9 importers repointed through `schemaErasedKernel`. `admin/src/lib/durable-run-subscription.ts` and `admin/src/features/routines/use-conversation-deep-link.ts` reduced to pure bindings (scheduler -> `@jini-ai/chat` `browserTimeoutSchedule`, query replace -> `@jini-ai/admin` `replaceBrowserQuery`, both tested).

## FILES LEFT (excl. themes; planner / true)
**882 / 97** at Tovu `@TSHA@` / Jini `@JSHA@` (merge-24: 975 / 447). Without the new keep files: 882 / 354.
Method: `cloud-results/count-25/count-files-left.sh <tovu> <jini> keep plans/count-1125/{k0-keeps,x4-keeps,merge25-g3-keeps}.md`
(scan + combine-18 planner + 507 count-1124 rules, calibrated exactly 975/447 on merge-24's tips; 796 rules now).
Top true-left areas: public-http 13, adm-other 12, admin-http 12, agent-plugins 7, post 6, adm-shell-components 5, adm-security 5, webhooks 5.

## Files still left (97) — blocker classes
- **Too big for G3 / need a design sheet** (e.g. `adm-other` Storage.tsx 93, AssistantDock hooks 82–114, `agent-plugins/{memory,set-enabled}.ts`, `public-http` handlers 70–130, `webhooks/seal-aad-invariant.ts`): each needs its own Jini destination + importer repoint; sheets exist in `plans/x4-1125/*`.
- **Fail G3 by a single construct** (cheapest next): `vendor-credentials/vault-adapter.ts` (class bodies), `taxonomy/agent-tools.ts` (`if`/throw + two host catalog entries -> move into the Jini taxonomy catalog factory), `site-backup/share-database/repo.sqlite.ts` (SQL), `post/revision-thinning.ts`, `post/preview-tool.ts`, `trash/permissions.ts`, `site-backup/import-keep-off.ts`.
- **Blocked by the 33 tsc errors above** (public-http page handlers, deployments): fix types first.
- Full list (path, area): `cloud-results/count-25/merge-25-true-left.txt`; regenerate with the command above.

## Bugs (also in `development/open-bugs.md` -> "MERGE-25")
- **Fixed, runtime:** cms publish-content called core's gateway with the host's legacy gateway deps (no `generateToken`/`ttlSeconds`) — every agent pull would have thrown. Host gateway is now injected (`gateway: HostGatewayPort`); same for devops domain publish.
- **Fixed, runtime:** widgets site publish did not pass `policy` to `swapFormRef` (cms agent).
- **Fixed, build:** two new pnpm workspace cycles; 191 Jini tsc errors; 33 admin tsc errors.
- **OPEN:** 33 website tsc errors (above); 181 guard rows; user-management `package-entries`/`user-management-rename` contract tests do not know the slices' new entries; cms publish/content tool-registration tests need the new `gateway` dep; Jini `devops/static-publish/publish-history.ts` persists `"tovu-peer"` (G2: inject).

## Continuation (exact)
1. Website tsc 33 -> 0 in the order above (share-database `sql` binding first: one Tovu edit fixes 5).
2. Guard: SI-domain 101 (reclassify entries/shared leaves as merge-24 `d0d8f392` did), HW3 24 (instance-own the module-level registries), R14 13 (split the `*.handlers`/`*.credentials` back-imports), N1/N2 13 + `tovu-peer` injection.
3. Then Tovu `typecheck:tests`, desktop `npm run gates`, changed tests; compare with merge-24.
4. Counter: re-run the command above after each sheet; next cheapest files are the "single construct" list.
