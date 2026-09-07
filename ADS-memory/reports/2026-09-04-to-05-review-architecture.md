# Architecture & DI review — commits of 2026-09-04 and 2026-09-05

- Reviewer: Software Architect (dispatched, read-only; persona `AI-Dev-Shop/agents/software-architect/skills.md`)
- Scope: 521 commits `c74fcb3b..24c71a5b` (Sep 4 09:51 – Sep 5 21:57). Code read at HEAD `6f32d027`, not just diffs. Sep 6 (already reviewed) and Sep 1-3 excluded.
- Constraints honoured: no tests, no `tsc`, no builds, no indexer, no server/daemon restarts, nothing written outside this file. Every `grep` was `command grep -a` scoped to a directory.
- Excluded anything already in `2026-09-06-review-architecture.md`, `-review-bugs.md`, `-review-excess-code.md`, `-tovu-f6-outstanding-worklist.md` (the `assistant-byok` DB-handle/`[DEBUG]` finding, SEO null-clear arm, `expectedVersion` arms, boot-session singleton, desktop `desktopCredential`, fleet `reconcileOrphans`, etc.).
- Labels: **CONFIRMED** = read the code, defect certain. **PLAUSIBLE** = looks wrong, not fully proven. Ranked worst first.

## Findings

### F1 — CONFIRMED · HIGH · `duplicateSite` copies `chat.db` (+WAL/SHM), `ops/`, `out/`, every `*.bak` and every `restore-point-*.db` in the site root — the one thing the header says can never happen

Two Sep 5 commits by different agents, 16 minutes apart, contradict each other:

- `0fb84ae0` (18:02) moved chat history out of `content.db` into a sidecar file **beside it**: `deps.ts:470-471` `defaultChatDbPath = join(dirname(contentDbPath), "chat.db")`, opened at `deps.ts:1008` on every boot of every site.
- `bcf09c62` (18:18) added `duplicateSite`, whose `copyPortableEntries` (`platform/site-dir/duplicate-site.ts:99-111`) copies **every** top-level entry of the source except five names — `content.db`, `content.db-wal`, `content.db-shm` (`:68-78`), `config.json`, `.site-meta.json` (`:82`). Its header (`:30-33`) states chat/session history is "excluded there BY CONSTRUCTION", and `duplicate-content-db.ts:39-43` says the concurrent chat.db split "simply stop[s] existing in content.db and this file purges nothing … still correct, with zero code change here". True for `content.db`; false for the site directory, which is what `duplicateSite` copies.

What rides along today, from the live `sites/tovu-com` listing: `chat.db` (3.0 MB) + `chat.db-wal` (4.2 MB) + `chat.db-shm`, `chat.db.bak`, `content.db.bak`, `content.db.bak-20260812-205241`, `content.db.predelete.bak`, `content.seed.db*`, `ops/` (the database-operations journal, `deps.ts:460-461`), `out/` (export/publish output), and **seven `restore-point-*.db` files of 10–40 MB each** — full pre-split `content.db` backups that still contain `ai_chats`/`ai_chat_messages`. Restore points are written beside `content.db` by design (`node_modules/@jini-ai/infra/src/db/sqlite/db-ops.ts:65-71`, `targetDir = path.dirname(this.filePath)`), so this is every site, not a `tovu-com` quirk. Copying a live WAL-mode `chat.db-wal` verbatim is also exactly the inconsistency hazard `duplicate-content-db.ts:13-22` explains for `content.db`.

The integration test seeds a chat row **into `content.db`** (`duplicate-site.integration.test.ts:39`) and asserts `ai_chats` is empty **in the copy's `content.db`** (`:92-93`) — GREEN while `chat.db` and the restore points are copied. (Memory: "GREEN tests whose assertion tolerates the bug".)

Reachable now: `sites_duplicate_site` is live in every `npm run dev` (dev.mjs sets `TOVU_ENABLE_SITE_SWITCHER=1`), and `duplicateSite` is exported from `platform/site-dir/index` for the desktop (ADR-011).

Fix (architectural, not a longer exclude list): the site layout is currently known in three unrelated places — `deps.ts` (`defaultChatDbPath`, `defaultDatabaseJournalDbPath`, uploads/themes/out), `duplicate-site.ts` (its own "portable" rule), and the desktop's `classifySiteDir`. Put one `site-dir/layout.ts` that names the sidecar/derived artifacts (`content.db*`, `chat.db*`, `ops/`, `out/`, `*.bak*`, `restore-point-*.db*`, `content.seed.db*`) and have `deps.ts`'s path defaults and `copyPortableEntries` both read it. Add a test that seeds `chat.db` + a `restore-point-x.db` in the source and asserts neither exists in the target.

### F2 — CONFIRMED · HIGH (DI) · The Sites route and `sites_duplicate_site` re-derive the site binding from `process.cwd()`/`process.env`; under `tovu serve <dir>` List reports the wrong "current site" and every write targets `<shell cwd>/sites`

The composition root already knows the served directory — `serve.ts:209-222` builds `deps` from `target` (`dbPath`, `uploadsDir`, `themesDir`); `export.ts:118-129` likewise; `deps.ts` from `siteDir()`. None of that reaches the new Sites surfaces:

- `routes/system/sites.ts:154-162` calls `listSites()`, `describeSiteBinding()`, `readPersistedActiveSite()` with **no arguments**, and `:236` `persistActiveSite({ name })` likewise. `AdminSitesDeps` (`:73-82`) lets a test swap the *functions*, but production wiring (`app.ts:1052 registerAdminSitesRoutes(app, routeDeps)`, unconditional) passes nothing, so the defaults win.
- The defaults are process globals: `site-registry.ts:77,140` `optional.cwd ?? process.cwd()`; `:284-288` `describeSiteBinding` → `resolveSiteRoot()` → `site-root.ts:69-71` (`TOVU_SITE_DIR` else `<cwd>/sites/<TOVU_SITE ?? "tovu-com">`); `active-site.ts:53` `.env` at `<cwd>/.env`; `features/sites/deps.ts:75` `cwd: deps.cwd ?? process.cwd()`.
- `serve.ts` never sets `TOVU_SITE_DIR` and `RouteDeps` carries no site dir (`types.ts` has `themesDir:800` and, in-flight, `contentDbPath:1065` — no `siteDir`).

Consequence, `npx tovu serve /some/site` from the repo root: List answers `currentSite.dir = <repo>/sites/tovu-com`, marks the `tovu-com` card `active: true` (`includeServingSite`, `site-registry.ts:244-251`) and `listed`, while the process is serving `/some/site` — the exact "claiming a switch that has not happened" lie the route header (`sites.ts:38-50`) was written to prevent. `site-registry.ts:26-27` claims `active` "always reflects whatever this process actually booted with" — false for this boot path. With the flag on, Create/duplicate write under `<cwd>/sites` and Activate writes `<cwd>/.env`, none of which relate to the served site. The desktop arm is masked only because `tovu-server.cjs:225-226` happens to set `TOVU_SITE_DIR`.

This is the same shape as the in-flight `contentDbPath` work flagged on 09-06: the root knows the binding; a module re-derives it from the environment. Fix: `RouteDeps.siteBinding: { dir; sitesRoot; dirOverridden }` (or at least `siteDir`), set once by each root (`deps.ts` from `siteDir()`, `serve.ts`/`export.ts` from `target`, `app.ts` from a fixture path); make `listSites`/`createSite`/`describeSiteBinding`/`persistActiveSite` take `cwd`/`sitesRoot` as **required** and drop the `process.cwd()`/`process.env` defaults from `platform/site-dir`.

### F3 — CONFIRMED · MEDIUM (DI / hidden singleton) · Authorization grants are registered into a module-scope `Map` by import side effect; the identity wiring depends on a module it never imports

- `features/identity/builtin-role-grants.ts:13-16` — `const registry = new Map()` at module scope; `registerBuiltinRoleGrant` mutates it.
- `features/pages/permissions.ts:122-146` — `registerPermissionMigration(...)` and `registerBuiltinRoleGrant({ role: "admin", permission: "pages.edit_html" })` run **as module-evaluation side effects**.
- `features/identity/wiring.ts:152` — `applyBuiltinRoleGrants` reads whatever the registry holds at that moment. `wiring.ts` imports `./builtin-role-grants.js`, never `features/pages/permissions`.
- The chain that makes it work is undeclared: `deps.ts:34` imports `#src/features/pages/index` → `pages/index.ts:34` re-exports `permissions.js` → side effect fires. `permissions.ts:89-101` argues correctness "by ES module semantics rather than by luck" over a graph nobody states.
- Proof the ordering is graph-dependent: `development/scripts/backfill-reset-admin-password.ts:132` builds identity deps via `createSqliteIdentityRouteDeps` **without** importing `features/pages`, so in that process the registry is empty and `applyBuiltinRoleGrants` grants nothing. Harmless today (additive-only), but any future root (a CLI command, the daemon, a repair script) that constructs identity deps without the pages import silently applies a different grant set — and `wiring.test.ts` cannot detect it.

Fix: `buildIdentityRouteDeps` takes `builtinRoleGrants: readonly BuiltinRoleGrant[]` (and ideally the permission migrations) as an explicit argument; `features/pages/permissions.ts` exports `PAGES_EDIT_HTML_GRANT` as data with no side effects; `deps.ts`/`app.ts` pass `[PAGES_EDIT_HTML_GRANT]`. Delete `registry`/`registerBuiltinRoleGrant`/`listBuiltinRoleGrants`.

### F4 — CONFIRMED · MEDIUM (review integrity) · Two in-window source files are committed as binary blobs — a literal NUL byte inside a string — so their diffs are unreviewable and `grep` skips them

- `apps/website/src/features/identity/builtin-role-grants.ts:87` — `registry.set(\`${grant.role}<NUL>${grant.permission}\`, grant)`; born binary in `db83fdaf` ("Bin 0 -> 7359 bytes"). The follow-up `ab051e61` ("refactor(identity): extract role-binding reconciliation") shows in history as **"Bin 7359 -> 8043 bytes"** — an authorization module refactor with no reviewable diff.
- `development/scripts/split-chat-data-into-chat-db.ts:111` — `.join("<NUL>")`; born binary in `ac171e6d`.
- No `.gitattributes` exists to force textual diffs. `command grep -c` on either file returns nothing without `-a` (memory: "grep SKIPS NUL-byte files").
- Four older files have the identical shape (`execution-credential-store.memory.ts:15`, `provider-credential-store.memory.ts:14` — inside a **comment**, `same-origin.unit.test.ts:64` — beside `"\n"`/`"\t"` siblings, `backfill-vendor-credentials.ts:214`), which shows the authoring path is turning the `\0` escape into a raw byte repeatedly, not a one-off.
- Reproduced by this review itself: the first write of this report through the agent Write tool landed a raw NUL byte at the very line describing the fix (the escape text was emitted, a raw byte was stored); it was scrubbed with `perl` before the second commit. The authoring path, not the authors, is the source.
- `git diff --stat` still counted the first commit as text (95 insertions) because git only sniffs the first 8000 bytes for binary — so a NUL deep in a file passes review as text while `grep` still skips the whole file.

Fix: replace each with the `\0`/`\u0000` escape; add a `check:*` gate that rejects NUL bytes in tracked `.ts/.tsx/.mjs/.cjs`; add `.gitattributes` with `*.ts diff` so a regression at least diffs.

### F5 — CONFIRMED · MEDIUM (duplicated seam → serial one-arm fixes) · Boot orchestration is hand-copied between `index.ts` and `cli/commands/serve.ts`; four Sep 5 commits each ported one step, and `cli/commands/export.ts` still has none of them

- `2f03ec5f` (daemon token), `c713a518` (SDK resolver), `66e14fe5` (readiness gate + `runBootLifecycle`), each "index.ts had it, serve.ts didn't"; `fe14089d` then ported the resolver alone to export.
- `serve.ts:157-168` `logCriticalBootFailures` is "duplicated verbatim from index.ts" and `agentDaemonWanted` (`serve.ts:149-155` vs `index.ts:205-211`) likewise; the stated reason — index.ts "is never imported by a tested module" — is contradicted by `boot-readiness-gate.ts`, which was extracted for exactly that purpose the same day (`boot-readiness-gate.ts:7-19`).
- `export.ts:112-142` runs `registerPluginSdkResolver` + `bootSiteDir` + `createSqliteRouteDeps` + `exportSite`, and **no `runBootLifecycle`**. `site-exporter.ts:45` boots "the REAL `createApp(routeDeps)`", so it inherits the gap `serve.ts:224-231` documents for itself pre-fix: the crash-interrupted-migration scan never flips `siteStatusRepo`, so `site-serving-gate`'s per-request check cannot trigger, and a half-migrated site exports as if healthy. It also never awaits `settingsReady`/`seoReady` (no `Ready` in `site-exporter.ts`). PLAUSIBLE on the export-specific consequence — I did not trace the exporter's request path through the gate.

Fix: one `bootRuntime({ deps, dbPath, useMemory })` in `server/runtime/boot/` covering gate → lifecycle → readiness snapshot → daemon-port, returning `{ ok, failures }`; `index.ts` maps to `process.exit`, `serve.ts` throws, `export.ts` calls it too. Then a fifth "index.ts had it" commit becomes impossible.

### F6 — CONFIRMED · LOW (DI) · `TOVU_ADMIN_DEV_PROXY_URL` is read independently in two inbound modules instead of once by the composition root

`admin-static.ts:109` (inside `registerAdminStatic`, at app construction) and `admin-dev-proxy.ts:236` (inside `registerAdminDevProxyUpgrade`, at listen time, `index.ts:343`) each read `process.env` for the same capability and each re-derive "SEA wins" separately (`admin-static.ts:96`, `admin-dev-proxy.ts:237`). Fix: `index.ts` resolves `adminDevProxyUrl` once and passes it to `createApp` → `registerAdminStatic({ distDir, devProxyUrl })` and to `registerAdminDevProxyUpgrade(server, devProxyUrl)`.

### F7 — PLAUSIBLE · LOW (one-arm) · Two theme-tree walkers still `statSync` (follow symlinks) after their siblings were switched to `lstatSync`

`4f4586ad` and `3edda2f0` fixed `listThemeFiles`/`walkThemePackage`; `theme.ts:1188` (`discoverThemes`, `statSync(full).isDirectory()`) and `migration/theme-migration-plan.ts:150` (`walkFilesRecursive`, same call) were not. A cyclic symlink in a themes root throws a raw `ELOOP` out of theme discovery; a symlink out of the theme dir is followed by the migration planner. Not traced whether operator-controlled trees reach these two.

### F8 — PLAUSIBLE · LOW · A duplicate's copied `ops/database-journal.db` carries the source's restore-point ledger with absolute `artifactRef`s

Jini `db-ops.ts:66-73` records `artifactRef` as an absolute path under the **source** site dir. After F1's copy, `backup_execute_restore` on the duplicate would resolve an artifact in the source directory. Part of F1's fix (exclude `ops/`); not traced through the restore flow.

## Arms checked and found complete (no finding)
| Change | Arms verified |
|---|---|
| `pages.edit_html` (`45ab6319`, `db83fdaf`) | both HTML sinks gated: `routes/pages/update-html.ts:27,44` and `features/pages/tool-registrations.ts:102`; `updatePost` cannot set `bodyHtml`/`bodyFormat` (`post.ts:656-666`); `createPost` always `doc` (`post.ts:618-619`) |
| trashed-post exclusion (`34c1e7b4`, `54d8b998`, `caa11611`, `a5c9bac8`) | `post.ts` read paths (`:1063-1190`), `routing.ts:155`, `sitemap.ts:104`, `seo.ts:172`, `media-rendition.ts:210`, embed resolver `resolver-service.ts:785` (fixed 08-11) |
| `sites_duplicate_site` flag sink | `isSiteSwitcherEnabled` IS injected into the daemon: `agent-daemon-server.ts:370` → `buildAssistantToolRegistrations` → `tool-registrations.ts:669` |
| chat.db redirect (`0fb84ae0`) | both consumers redirected (`deps.ts:1181,1184`); no other `ai_chats`/`assistant_agent_sessions` reader in `apps/website/src`; hermetic root uses in-memory stores |
| `.env` writer (`f36bd199`, `852265ae`) | mode preserved (`atomic-write.ts:39-46,76-78`); non-`ENOENT` read errors propagate in both reader and writer (`active-site.ts:115,174`) |
| content-embed `header:false` | single IR→HTML site (`render.ts:2010,2024`) |
| daemon argv identity (`056135db`) | `buildDaemonSpawnArgs` used in both spawn arms (`daemon-supervisor.ts`) |

## Skipped (not opened, or opened only for a stat)
- The `agentHandle` tagging sweeps; every docs/content/design/style commit; landing-page drafts; basic-theme CSS/font/accessibility commits.
- The ~20 admin stale-settlement race fixes (`use-*.hooks.ts`), `MenuEditor`, `MediaRefField`, voice-input feature bodies (`5524e8e7`, `062785c8`), `Sites.tsx` beyond a logic grep (clean), `apps/admin/src/lib/api.ts` fixes.
- The Sep 4 complexity-extraction refactors (`029bd243`, `f764758e`, `ccb0bf9f`, oauth/http/mail extractions) — read as stats only.
- Desktop: `main.cjs` (reviewed 09-06), `tovu-server.cjs`/`site-dir-store.cjs`/`site-registry.cjs` bodies beyond their `require`/env surface and `terminateOrphan`; speech `.swift`/`.cjs` bodies.
- `duplicate-content-db.ts` purge body, `split-chat-data-into-chat-db.ts` body beyond its open calls, `builtin-role-grants.ts` beyond the code shown, `admin-dev-proxy.ts` request/upgrade correctness beyond DI.
- source-control, deployments, handlebars, lipay, dead-path-sweep, check-* script fixes, evals import repairs, `docker-compose`/`ci.yml`.
- No tests were run, no `tsc`, no builds, no browser, no indexer; F1's file listing is `ls` on the live site dir (read-only).
