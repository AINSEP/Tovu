# merge-final 2026-11-16 — merge-a + merge-b + publish-p0, gated and boot-tested

Branch `integ/merge-final-2026-11-16` in BOTH repos, cut from `origin/integ/merge-a-2026-11-16`, then `--no-ff` merge-b (both repos), then `--no-ff` `refactor/publish-p0` (Tovu only).
Final heads: Tovu `f70017dc5` (+ this report commit), Jini `65d73b0d5`. Nothing else pushed; no force-push; no `--no-verify` (the Tovu desktop pre-push gate ran and passed 6/6 on the push that touched `apps/desktop`; the later pushes touched no desktop files). Main, `refactor/terra`, `integ/wave-b*` untouched.
Setup: Node 24.11.1 (nodejs.org tarball), pnpm 10.33.2 via `npm i -g`, Jini `pnpm install --frozen-lockfile` (no lockfile change), `pnpm --no-bail -r build`; Tovu `npm ci` x4, `link-jini`, contracts + sdk built. No subagents, no RemoteTrigger. BASE for Tovu check scripts = a clean `refactor/terra` worktree (same node_modules).

## Merges and conflicts

| step | repo | result | conflicts → resolution |
|---|---|---|---|
| merge-b into merge-a | Jini | merged | 3. `devops/checks/hardwiring.ts`: merge-b moved the inspector to module-level functions; took that and re-added merge-a's three `isProcessEnv`/`isModuleScope`/`violation` members. `server/kernel-base.ts`: merge-b's `openKernelStorage` split + merge-a's `executorDefinitionPolicies` kept together. `scripts/size-debt.json`: 3-way merge (min of both sides, a removal on either side wins) |
| merge-b into merge-a | Tovu | merged | 37 files. Admin (11): merge-a deleted `lib/api` while merge-b added `@jini-ai/admin` ports/hooks; kept merge-a's module paths (`features/*/api`, `lib/admin-http`) with merge-b's jini ports (`createHttpMediaProvidersPort`, `useCursorPages`, `createFakeMembersPort`, `parseMediaHtmlAttributes` from `@jini-ai/admin/media`); merge-b's deletions of `members-port`/`users-port` hooks and `useSitesHome` honoured. Desktop (13): the two branches did parallel refactors of the same wiring tests; kept the identical static `electron-updater` import from both, merge-a's `stripTypeScriptTypes` helpers and typed handlers, merge-b's object-argument `addresseeForStart`. Website (5): `render.ts` stays deleted (merge-a's render split) and the style helpers import `@jini-ai/cms/html/style-values`; `composition/app.ts` kept merge-a's split; `assistant-chats.ts` took merge-b's route factories; `admissions.ts`/`migrate-forward.ts` imports. Size and complexity debt: 3-way min merge |
| publish-p0 into the result | Tovu | merged | 6. `publish-content/{gated-hooks,raw-file-contributor,raw-row-contributor}.ts` and `publish-trust/provisioning.ts`: merge-b's `refactor(size)` split and publish-p0's characterized P0.6 split of the SAME four functions; took publish-p0's (it carries the characterization tests and mutation proof; the size commits were single-file and had no tests). `composition/app.ts`: kept the memory-deps slice import; the slice repointed from the removed `apply-loop` to `apply-port`. Debt files: 3-way min merge |

## Fix commits (all `fix(merge)` unless noted; failing test first where a product bug)

Jini: `fix(merge)` break the claude-stream and ACP-session runtime import cycles (R14 gate, 3 violations: new leaf modules `claude-stream-frames.ts`, `acp/session-state.ts`; HW3 `Readonly*` annotations on the moved constants); split `CommentSidePanel` (522 lines, new `CommentSideParts.tsx`) and `note-store` (547 vs 522; new `note-subdir.ts`, `note-upsert.ts`) and re-lock `size-debt.json` (two entries removed, ACP session lowered; this closes merge-b's NO-GO on the three Jini size-ratchet entries and merge-a's `createHardwiringInspector` +4); `fix(devops)` published-types now reads `optionalDependencies`/`peerDependencies` (the Tovu desktop release-guard tests expect it; test first; patch changeset).
Tovu:
- `restore the two desktop split files the held merge-b patch dropped` (`project-ipc.site-lifecycle.ts`, `tovu-server.start.ts`: new files, never in the patch; desktop typecheck was red on both) and `keep spawnSmoke under the 9/9 complexity ceiling` (the new `_options = {}` default parameter counts as a branch; helper `relaySmokeOutput`).
- `fix(merge)` visitor frontend control uses the injected same-origin policy inside merge-b's extracted mount helper (typecheck error).
- `fix(admin)` AssistantDock takes `useAssistantDockState` as an injected prop defaulted to the real hook (hook-injection gate; failing test first: `assistant-dock-hook-injection.unit.test.tsx`); hook debt re-locked lower.
- `fix(merge)` site-shares download route before `DELETE :shareId` (the pinned createApp route table; the split had moved revoke ahead of it).
- `fix(merge)` serving-app boot-wiring tests follow the `serve.ts` / `serve-listen.ts` split (the source-text assertions could not see the shutdown wiring any more; 27/27).
- `fix(dev)` `development/scripts/dev.mjs` and `measure-site-memory.mjs` imported `collectProcessTreePids`/`omitEnvironmentKeys` from `@jini-ai/platform[/process]`; Jini c6 moved them to `@jini-ai/core/contracts/runtime`, so **`npm run dev` / `dev:lite` crashed at startup** (found by the boot test). New test `script-jini-imports.test.ts` resolves every `@jini-ai/*` named import in the plain `.mjs` launchers (tsc never reads them).
- `check-menu-href-allowlist-sync` calls `safeHref({ value })` (merge-a's note: red on terra since the options-object change; 3 tests + CLI now green); `af-cli-characterization` fixtures follow the dev launcher imports and the admin api client split (3 tests were red on terra).
- Handlebars worker module budget 176 → 177 (`@jini-ai/cms/html/style-values` is now loaded beside the four allowlists that stay in `platform/html/style-values.ts`). Owner may prefer moving those four into the cms module instead.
- `executorDefinitionPolicies` in its own module so `createSiteScope` stays under its complexity (11 → 10) and size ceilings (merge-a left this as NEW).

## Gates (BASE = `refactor/terra`; "after" = branch head after all fixes)

| gate | Jini base | Jini after | Tovu base | Tovu after |
|---|---|---|---|---|
| build | ok | ok (`pnpm --no-bail -r build`) | contracts+sdk ok | ok; admin `vite build` and site-chat `build:local` (incl. bundle-mount checks) ok |
| typecheck | ok | ok (`pnpm -r typecheck`) | ok | root tsc, `typecheck:tests`, admin tsc: ok |
| `pnpm guard` / `check:hooks` | ok / n.a. | ok (incl. hook-injection gate; 3 R14 + 1 HW3 found and fixed) / ok | n.a. / n.a. | n.a. / ok (1 found, fixed, debt lowered) |
| check:size | ok | ok (157 entries; 3 NEW found, fixed) | red, 16 lines | red, 17 lines; **NEW vs terra below** |
| check:complexity | ok | ok (17) | red, 25 lines | red, 23 lines (2 fewer than terra, 0 NEW) |
| check:boundaries | n.a. | n.a. | 16 errors / 90 warnings | 16 errors / 99 warnings (+9 warnings: feature-rank + cycles, as merge-a/b reported) |
| api:check | n.a. | pass (rc 0; baseline NOT regenerated; breaking diffs are covered by changesets) | n.a. | n.a. |
| **desktop gates** (tree-quiet, tests, typecheck, coverage, complexity, js-backslide) | n.a. | n.a. | not run on terra | first run on the merged tree: 4 FAIL (listed above); after fixes **6/6 PASS** (run three times, incl. the pre-push hook) |

NEW vs terra, Tovu `check:size` (ratchet may only shrink, so none raised; all are small growth from the merged branches, owner decision / extraction needed): `apps/admin/src/App.hooks.ts` 513→518; `use-page-editor.hooks.ts` usePageEditor 380→381, file 682→685; `use-post-editor.hooks.ts` usePostEditor 400→405, file 636→652; `use-publish-content-confirm.hooks.ts` 847→848; `theme/tool-registrations.ts` 638→642; `composition/deps.ts` 1949→1952 and `composeSiteRouteDeps` 1201→1202. The other base lines are unchanged or smaller. `check:complexity`: no NEW line (merge-a's `createSiteScope` fixed).

## Tests (NEW vs BASE)

Jini vitest (`--maxWorkers=2 --minWorkers=1`), 15 packages (devops 1248, memory 409, agent-runtime 4468, server 505, core 2934, daemon 4722, chat 4434, http-kit 561, platform 3122, db 865, mcp 1776, ui 8584, admin 2846, cms 4085, agentic 1143): all pass except 1 test in agent-runtime, `connection-guard.test.ts` "dials with the pinned address family" (`connect EINVAL 127.0.0.1` on this sandbox's Node 24.11; the file differs from terra only by type imports, so BASE/environmental).
Tovu: admin vitest 894/895 files, 14785 tests pass (the one file: `recharts-bundle-integer-ticks`, BASE, plugin pin 0.7.0 vs Jini 0.7.1; one `window is not defined` teardown error under load, passes alone); site-chat 189/189; desktop node tests 2291/2291 and the tsx half via the gate; website/dev-script `node:test`, the 256 test files the merges changed (no `dist` present, as CI): 3328 tests, 3306 pass, 20 fail, **all BASE**: 14 Postgres tests (`copy-engine.postgres`, no Postgres in the sandbox; same on terra per merge-a/b), 3 browser/stylesheet tests (`render-form-layout`), `the real daemon answers component-catalog …` (real daemon over HTTP), `an accepted memory-mode answer reaches CLI launch …`. Publish-p0 suites (publish-content, publish-trust, navigation, post publish; 1382 tests): all pass. NEW found and fixed during the run: 44 failures in the first pass (serve split ×9, route table ×8, worker budget, href-sync ×3, af-cli ×3, plus the BASE list above).
Not run: Playwright e2e, coverage gates beyond the desktop gate, the full (not just touched) website suite, a packaged-desktop smoke.

## Boot test (fake-test-site, `npm run dev:lite`, port 3092, `TOVU_DEV_OWNER_SIGNIN=1`)

Site created with the repo's own `tovu init` (`sites/fake-test-site`, removed afterwards; never tovu-dev). `dev:lite` rebuilds nothing itself beyond `prepareLiteAdmin`; the admin and site-chat bundles were built with `vite build` / `npm run build:local` (the `build` scripts refuse while Jini is linked). Sign-in: `POST /api/admin/v1/auth/local-boot-session` (loopback, same-origin headers); the session cookie is `Secure`, so it was replayed by hand. Run twice (before and after the publish-p0 merge): identical results. Server stopped and all processes killed.

| group | route(s) | status | finding |
|---|---|---|---|
| startup | `npm run dev:lite` | crash at import (first run) | FINDING, fixed (see `fix(dev)`); then listened in ~45 s |
| public | `/`, `/robots.txt`, `/sitemap.xml`, `/feed.xml`, `/llms.txt`, `/signin`, `/forgot-password`, `/health`, `/healthz`, `/readyz`, `/blog` (+2 home links) | 200 | none |
| public | `/nonexistent-page-xyz` | 404 | expected |
| public | `/api/search?q=test` | 503 `search_unavailable / not_configured` | by design on a fresh site (site search not configured); not a crash |
| admin shell | `/admin/`, `/admin/assets/index-*.css`, `/admin/assets/index-*.js` | 200 | none |
| site-chat | `/site-chat/site-assistant.{js,css}`, `-loader.js`, `-vanilla.{js,css}` | 200 | none |
| sign-in | `POST /api/admin/v1/auth/local-boot-session` | 200 | none |
| admin/read-only API | 153 GET routes from the live Express route table (`listRoutes` over `createApp`; `:params` filled with a nonexistent id; 22 stream/oauth/download/export/side-effect routes skipped) | 102×200, 41×404 (unknown ids), 8×400 (missing required query/params), 2×401 (`/internal/*` need the daemon token) | **no 5xx**, no crash, no unhandled rejection, no missing module |

Server log findings, none a crash: `[plugin-runtime] bundled initialization failed for 'charts-recharts'` (BASE: Tovu pins the charts-recharts payload at 0.7.0, the Jini build here ships 0.7.1; charts fall back to the table until the pin and integrity map are refreshed); `[widgets] resolveHtmlPageEmbeds: unresolved "content" reference` on every render of the starter home page (BASE: `@jini-ai/cms` widgets is byte-identical to terra; the starter theme's `{"type":"content"}` embed carries no id); `[commerce] Commerce configuration is missing` (expected without payments config); GLib/sharp warnings from the agent daemon's Electron in a headless Linux box.

## Admin screens to check by eye in Chrome

merge-b's list: Sites (cards, confirm dialog, lists, home), Skills, Users, Members, Roles, Plugins (install tabs/cards, agent-plugin memory), Media (card byte sizes, HTML attributes, edit dialog, provider settings), Themes, Library, Database (timeline paging), Settings, Pages and Posts editors (failed image-upload toast, recovered-draft Discard), AssistantDock (state hook split, agent inventory placeholder, tab-row/card glyphs), WidgetConfigFields, Dashboard (recent-activity disclosure), Deployment (dockerfile source), Observability, Import/Export, InstallTabCard sizes.
Added by this merge: every screen that went through merge-a's `features/*/api` split and merge-b's jini ports in the same files: **Members and Users** (both ports now come from `@jini-ai/user-management/react`; list, disable, magic link, role/policy assign), **Media provider settings** (now `createHttpMediaProvidersPort`: save settings, save and remove a credential), **Database timeline** (`useCursorPages` on merge-a's api module), **Sign-in / login**, **AssistantDock** (injected state hook, new this run), Pages/Posts editors (merge-a's injected hooks over merge-b's error toasts), **Sites home path setting** (`useSitesHome` is gone), **Publish / Export** (publish-p0's split apply and plan code behind the publish-content import ceremony: run one import end to end), the **site-share** list/download/revoke. Also owed: a **packaged desktop smoke** (the desktop gates are green, but nothing has launched the packaged app on this tree).

## Verdict: **GO** for running it on the owner's machine, with these caveats

All typecheck, build, guard, hook, desktop (6/6) and Jini size/complexity gates are green; every remaining test failure is BASE-identical or environmental; `npm run dev` now boots and serves the public site, the admin shell and 153 read-only admin routes with no 5xx. Open items (none blocks running it): Tovu `check:size` NEW lines above (already red on terra; fix or accept before Tovu CI), the Handlebars budget +1, the charts-recharts 0.7.0/0.7.1 pin (charts fall back to a table until refreshed), Jini api baseline not regenerated, and the eye check and packaged-desktop smoke above.
