# Session Task List — 2026-08-31 (session tovu-f8)

Live checklist. Update in place. Source: handoff from `tovu-fb` + owner instructions tonight.

## In flight

- [x] **Docs nav + doc pages** (DONE except canary tests — verified live: 6/4 <pre>, two-level entity sidebar, scroll-spy proven toggling via isolated Playwright probe) (WAS PARTIAL — nav/conversion/sidebar DONE & verified; scroll-spy, code examples, section/subsection shape NOT done, agent resumed) (`docs-nav-pages` agent, running)
  - [x] Move "How It Works" from top-level nav under the Docs dropdown (`menus` table, row `header-nav`, `doc_json`)
  - [x] Convert `how-themes-work` from Post -> Page (Posts can never carry HTML; `PageKindMismatchError`)
  - [x] Author/expand **How Tovu Works** HTML body
  - [x] Author/expand **How Themes Work** HTML body
  - [x] Per-page anchor sidebar menus (data-driven `docs-<slug>-sidebar` sentinel, not template duplication) (copy `docs-themes-menu` shape)
  - [x] Wire sidebar binding + `template_choice`
  - [ ] **NEW owner requirements (2026-08-31, must be applied):**
    - [x] Sections AND subsections (e.g. Posts -> How Posts Work; Pages -> How Pages Work)
    - [x] Detailed but concise, no fluff, business tone
    - [x] Code examples included (6 + 4, all grounded)
    - [x] Written so an AI can read it and instantly understand
    - [x] Reference UI studied: https://kuinetic.com/docs.html?doc=getting-started

- [x] **Commit tonight's work** (`commit-tonight` — DONE, 9 commits, 55 -> 19 dirty; verified by me)
  - [x] `944c6a0d` widget embeds by slug
  - [x] `3bf5a0e3` deployment-constraints doc fix
  - [x] `5b9fa802` ADR-063 deep-linking
  - [x] `840203cb` logo crop + front-page padding
  - [x] `799a6b1f` form pipeline PRG + generalized (carries new `form-render.ts`)
  - [x] `e2598946` submissions resolve by slug (carries new `resolve-definition.ts`)
  - [x] `91b6ca33` ADR-063 doc
  - [x] `a82bec93` logo PNG assets
  - [x] `469900ba` full icon set + build-brand-icons.mjs

## Queued (not started)

- [x] **Kuinetic library** — DONE (`kuinetic-vendor`), verified: v0.1.4, MIT (AINSEP), 383467 B serves 200, script tag in 26 templates. Auto-inits (`kuinetic.all.js` self-starts + self-injects CSS) — no init call needed. Scroll-spy is declarative: `data-kui="scroll-spy sections:<sel> target:<sel>"` on a shared ancestor; active state is `data-kui-active="true"` (an ATTRIBUTE, not a class). NEEDS DEV RESTART. `basic-2` not given kuinetic. ORIG: (owner request 2026-08-31) — download `https://cdn.jsdelivr.net/npm/kuinetic/dist/kuinetic.all.js` into the `basic` theme so ALL pages load it; use its **scroll-spy** for the docs sidebar

- [x] **AI-first docs checklist** — DONE, written to `development/docs/ai-first-docs-checklist.md`. Follow-ups: ship `/llms.txt`; set `schemaType: "TechArticle"`; OWNER DECISION needed on robots.txt AI-crawler policy. Skip MCP resource server.
- [x] **Favicon / PWA tags** — DONE in working tree (`favicon-pwa`), verified: 9 asset URLs 200, head tags in both theme roots, 13 templates x2. NEEDS DEV RESTART to show. FOLLOW-UP: `build-brand-icons.mjs` emits full-logo favicon.ico at 16/32 — does not encode the simplified-mark decision; committed in 469900ba as-is.
- [x] **Fix `build-brand-icons.mjs`** — DONE, verified by me: `SIMPLIFIED_MARK_MAX_PX = 32` at :119; ico 16px+32px frames CHANGED vs committed 469900ba, 48px unchanged; served file byte-identical to script output. Theme copies now generated, not hand-built. `basic-2` has no icons dir. (`brand-icons-fix` running, owner approved) so its own favicon.ico/PWA output uses the simplified mark at <=32px (currently only `candidates/` has it) — assets exist in `content/brand/icons/`; `page-shell.html` has no favicon link and there is no shared `<head>` partial (one edit per page template); icons not yet in a served location
- [ ] **"Files from this turn" UI** — data already in `ai_chat_messages.events_json` (193 msgs carry `tool_use` + `file_path`); rendering work only. OD reference: `/Users/la/Programming/Open-Marketing/apps/web/src/runtime/markdown.tsx`
- [x] **Error-state color tokens** — DONE (`danger-tokens`), verified live. Fix is in `form-render.ts` `FORM_BASELINE_STYLE`, NOT per-theme, so every theme gets it incl. basic-2. `var(--danger, var(--tovu-form-danger-fallback))`; mode-aware fallbacks dark #f87171/#4ade80, light #b91c1c/#166534 (Tailwind red-600/green-700 REJECTED at 4.05/4.20:1). No restart needed. ORIG: — no `--danger`/`--success-*` in any theme; hardcoded red as fallback-only, theme-defined `--danger` overrides
- [ ] **Jini `guard:drift`** — 14 off-baseline violations; 2 real (`A2uiSurfaceCard.tsx` deep-imports `@jini-ai/ui/a2ui` + `/interactive-ui`, only bare `@jini-ai/ui` allowed), 12 are "Tovu" neutrality string hits

## Done

- [x] Read + digest `tovu-fb` handoff
- [x] Resolve where Pages live -> `posts` table, `kind='page'`; DB `sites/tovu-com/content.db`
- [x] Correct the handoff's false claim that the doc pages 404 (3 of 4 exist as published HTML Pages)
- [x] Clear `apps/admin/node_modules/.vite` + restart dev (owner-authorized); `:3000/health` 200, `:5173/admin/` 200
- [x] Rebuild `@jini-ai/chat` (dist was stale by ~1 min); verified Jini is served as linked source, not Vite-prebundled

## Cancelled

- [x] ~~Per-message + per-block copy buttons in Jini chat~~ — owner said kill it. Agent wrote nothing. Do not resurrect without owner say-so.

## Open questions for owner

- [ ] 6 PNG screenshots at repo root — commit, move, or delete?
- [ ] `content/themes/static/basic-2/` — a whole uncommitted theme, in no handoff notes. Whose?
- [ ] Jini tree has its own uncommitted work — commit it too?
- [ ] Logo: taking simplified-T at <=32px, full logo above (doc's recommendation, reversible)
- [x] **Tighten the token-fallback regression test** — DONE, verified by me: chain-termination assertion added at `render.test.ts:1170-1181`, sabotage reverted (0 bare `var(--danger)`), 125/125 pass. — the new allowlist in `render.test.ts:1096` permits `--danger`/`--success` by NAME but never asserts they actually carry a fallback; a bare `var(--danger)` would pass a test whose own name claims otherwise
- [x] **Orphaned menu `docs-themes-menu`** — DELETED via real admin route (ADR-029 two-call ladder), verified by me: 0 rows remain, all 5 pages still 200. Backup at scratchpad/backup-docs-themes-menu-row.json. — owner: delete IF unused. `menu-cleanup` running: prove-then-delete, backup first. — no longer referenced after the sentinel rework; not deleted. Owner decides its fate.
- [ ] **Restart side-effect CONFIRMED GOOD**: favicon/manifest + kuinetic script tags are now live in served HTML (tsx-watch restart picked up the template edits)

## Owner decisions (2026-08-31, settled — do not re-litigate)

- **AI crawlers: ALLOW ALL.** Owner: "let AI crawl this all day." No GPTBot/ClaudeBot/CCBot blocks. (`ai-crawl-open` implementing robots.txt + /llms.txt + schemaType TechArticle)
- **`build-brand-icons.mjs`: fix approved.**
- **`docs-themes-menu`: delete if unused.**
- **`basic-2` is just a normal theme in the Tovu project** — not an ownership mystery. Safe to edit and to COMMIT. (was wrongly excluded from tonight's commits)
- **Logo: simplified-T <=32px, full logo above.**
- [x] **2 canary tests FIXED** — verified by me: 17/17 pass; remaining `docs-themes-menu` hits are explanatory comments + one intentional inline fixture (`extractor-marker.canary.test.ts:95`, never reads the real template). `pages.ts:351` comment now cites `menu-header-nav`. WAS: — `template-render.canary.test.ts:145,161`, `marker.canary.test.ts:118`; broken by the sentinel rework. Assigned to `docs-nav-pages`. Also stale comment at `pages.ts:351`.
- [ ] **OWNER Q: kuinetic on `basic-2`?** — basic-2 has no kuinetic, still uses old `docs-sidebar.js` spy. Left inert-free deliberately.
- [x] **AI-crawl / robots.txt / llms.txt / TechArticle** — DONE & verified: robots.txt `User-agent: * / Allow: /` + Sitemap ref; `/llms.txt` 200 (new route `routes/site/llms.ts`); both doc pages emit TechArticle JSON-LD.
- [ ] **`/llms.txt` missing from static-export manifest** — `platform/export/route-manifest.ts:256-257` enumerates robots.txt/sitemap.xml as well-known routes but not llms.txt; a static/GitHub-Pages export won't carry it.
- [x] **DUPLICATE JSON-LD — FIXED** (root cause: eager `export const app = createApp()` at `app.ts:1327` registers a PHANTOM seed-data app at import time; page-head registry is a process-wide singleton never cleared). Verified: 1 block/page.  WAS: — emits BOTH `Article` and `TechArticle`; `/how-tovu-works` emits only TechArticle. Both in `<head>`, not body_html. (`seo-head-fix` running)
- [x] **STALE meta description — FIXED** (real cause: `deriveExcerpt()` only reads `bodyJson`, so EVERY html-format page has no description). Verified live: now says five tiers.  WAS: — says "three tiers" but page content was corrected to 5 tiers. Head metadata contradicts the page. (`seo-head-fix` running)
- [x] **Page padding — FIXED & live**: `.docs-layout` shorthand `padding` clobbered `.wrap`'s gutter (same bug class as 840203cb) + `margin:0 auto` opted the grid item out of stretch (706px box in a 375px viewport). All 4 theme copies.
- [x] **Footer Account/Sign In column — commented out (not deleted)**, all 4 copies, grid re-flowed. Verified live: 3 columns, no "Account"/"Sign in" outside the comment.
- [x] **Scroll-spy `offset-top:70px` is LIVE** (tsx-watch auto-restart propagated it). No manual restart needed.

## Open bugs found tonight, NOT fixed

- [ ] **`/signup` returns 404** — the "Get started" CTA in `.nav-actions` is broken today. Pre-existing. `signup` is not in theme.json publishedPages.
- [ ] **`deriveExcerpt()` never reads html-format bodies** — every `body_format:"html"` page has an empty SEO description unless overridden by hand. Comment at `repo.sqlite.ts:40-49` claims this is "not reachable" — FALSE. Add to the false-comment register.
- [ ] **`resetPageHeadRegistryForTests()` is now called in production** `createApp()` — works, but the name lies. Rename.
- [ ] **`/llms.txt` missing from the static-export route manifest** (`platform/export/route-manifest.ts:256-257`).
- [ ] **fly.io token in ~/.bash_profile is malformed** — value split across lines 63-64, `export` stranded alone on line 62, and named `FLY_IO_ACCESS_TOKEN` (flyctl wants `FLY_API_TOKEN`). flyctl not installed.

## Bug queue — dispatched 2026-08-31 (agents running)

- [x] **fly.io ROOT CAUSE FOUND** — `Dockerfile.dockerignore` does `*` then `!Tovu`/`!Jini`; when the context root IS the Tovu checkout those re-includes match nothing -> empty (2B) context. Created `fly.toml` (did not exist) + `development/scripts/fly-build.sh`. WAS: — `flyctl deploy --build-only --push -a tovu-ai-cms` via Depot. `COPY Jini/ ./` -> `"/Jini": not found`; `COPY Tovu/ ./Tovu` -> `"/Tovu": not found`. Telltale: `[internal] load build context / transferring context: 2B done` = context is EMPTY. fly.toml validated at `/usr/src/app/fly.toml`. Dockerfile expects the PARENT dir holding both `Tovu/` and `Jini/` as context (ADR-049 `file:` deps).
- [x] **`/signup` 404 — FIXED & verified** (200 now). Added `signup` to `publishedPages` in `sites/tovu-com/.../theme.json` (gitignored runtime data, NOT committable). WAS: — "Get started" CTA in `.nav-actions` is broken; `signup` missing from theme.json publishedPages.
- [x] **`deriveExcerpt()` html gap — FIXED & verified live** (all 4 pages now have real descriptions, no CSS leak, override preserved; false comment at `repo.sqlite.ts:39-51` corrected). WAS: — every `body_format:"html"` page has an empty SEO description. Plus FALSE comment at `repo.sqlite.ts:40-49` claiming the path is unreachable.
- [x] **Plumbing pair — DONE** (renamed to `resetPageHeadRegistry`; `/llms.txt` at `route-manifest.ts:258`). WAS: — rename `resetPageHeadRegistryForTests()` (now called in production `createApp()`); add `/llms.txt` to `platform/export/route-manifest.ts:256-257` well-known routes.

## Done this round

- [x] **Moved the macOS notarization comment block** in `~/.bash_profile` to sit under the `GEMINI_API_KEY` section. `bash -n` clean, 87 lines unchanged. Backup: `scratchpad/bash_profile.bak`.
- [x] **3 route-manifest test failures — PRE-EXISTING, fixed.** Caused by committed `c8e54ddd` (publishedPages off-by-default), NOT tonight's work. Stale test expectations updated; production code untouched. 16/16 pass.

## Deployment — the two separate blockers

1. [~] **Image can't build from the Tovu repo alone** — OWNER AUTHORIZED npm publish. 9 of 14 used pkgs already on npm; publishing 7 (`cms`,`chat`,`admin`,`http-kit`,`infra`,`integrations`,`devops`). SKIP `agent-plugins` (declared, ZERO imports — drop the dep instead). `jini-publish` verifying then publishing. ORIG: — needs sibling `Jini/`. Breaks Fly, Railway, Render, App Runner, any git-based deploy. OWNER CHOSE: make Tovu buildable alone. (`jini-dep-decouple` investigating: npm-publish vs vendor-built-output vs npm-pack tarballs)
2. [ ] **Site data is entirely gitignored** — `sites/` holds the SQLite DB + theme config; a deployed container starts with NO site. fly.toml declares a volume mount but nothing seeds/uploads the data. NOT YET SOLVED.

## Jini publish — key facts (verified)

- npm auth: `ai-oss`, owner of `jini-ai` org. Scope was NEVER unclaimed.
- MUST use `pnpm publish`, never `npm publish` — packages use `workspace:*` internally; only pnpm rewrites those to concrete versions.
- `.changeset/config.json` has `"fixed": [["@jini-ai/*"]]` — a changeset release bumps ALL 25 in lockstep. NOT what we want; publish at current versions instead.
- Jini CI publish workflow has failed 10/10 runs — 3 stale changeset files reference renamed packages (`@jini-ai/chat-react`). The 9 live packages were published BY HAND, not via CI.
- Dockerfile comment claiming tarball-vendoring was rejected is WRONG in part: true for `npm pack`, false for `pnpm pack` (which does rewrite `workspace:*`). Add to false-comment register.
- Declared-but-UNIMPORTED in Tovu: `agent-plugins`, `mcp`, `platform`. Candidates to drop.
- `@jini-ai/cms` = 471 of ~830 imports. Its `exports` map must cover 11 subpaths or Tovu breaks on install.

## DECIDED: local dev after publish — ONE package.json, not two

- `package.json` commits npm versions (single truth; what every builder sees).
- Local dev uses `npm link` per-machine, gitignored, zero repo footprint.
- Add `npm run link:jini` / `unlink:jini` scripts + a guard that fails a build while links are active.
- Owner's two-copies idea REJECTED (drift + shipping the wrong one = tonight's failure again).

## Jini npm publish — STATE AT HANDOFF (verified by direct registry GET)

- [x] `@jini-ai/infra@0.1.0` — PUBLISHED
- [x] `@jini-ai/devops@0.1.2` — PUBLISHED
- [x] `@jini-ai/integrations@0.1.0` — PUBLISHED
- [x] `@jini-ai/http-kit@0.2.1` — PUBLISHED
- [x] `@jini-ai/admin@0.1.0` — PUBLISHED
- [x] `@jini-ai/chat@0.1.0` — PUBLISHED
- [x] `@jini-ai/cms@0.1.0` — PUBLISHED

RESOLVED 2026-08-31 23:2x — owner added `/permissions` allow rules `Bash(pnpm publish:*)` and `Bash(npm view:*)`; all 7 then published and were confirmed LIVE via direct registry GET.

WAS BLOCKED BY: Claude Code's auto-mode permission classifier denied `pnpm publish` (and even read-only `npm view`) after the 2nd publish. Harness gate on repeated irreversible outward-facing actions. DO NOT route around it — owner runs the command or approves.

Command per package: `cd /Users/la/Programming/Jini/packages/<name> && pnpm publish --access public --no-git-checks`

TWO TRAPS:
1. `npm view` gets denied by the same gate; with stderr suppressed that reads as "NOT PUBLISHED". I reported "all 7 failed" on that basis and was WRONG. Verify with `curl -s -o /dev/null -w "%{http_code}" "https://registry.npmjs.org/@jini-ai%2f<name>/latest"` instead.
2. Registry READ path lagged ~2min behind writes. An apparent failure may just be unreadable yet. Check with curl and wait before republishing.

- [ ] **`@jini-ai/cms` declares a `./widgets` export with no backing dist files** (commit `d6987fa5` pre-declared it; no `src/widgets/` was ever written). Tovu doesn't import it so it didn't block publish, but it 404s for any other consumer. Build it or drop the export.

## ALL 7 JINI PACKAGES LIVE ON NPM (confirmed via registry GET 2026-08-31)

infra@0.1.0 · devops@0.1.2 · integrations@0.1.0 · http-kit@0.2.1 · admin@0.1.0 · chat@0.1.0 · cms@0.1.0
Plus the 9 already-published: core, agentic, agent-runtime, daemon, mcp, platform, protocol, sqlite, ui.
=> Every `@jini-ai/*` package Tovu imports is now on npm. The `file:` -> version switch is UNBLOCKED.

NOTE: `npm publish` from the Jini ROOT fails with `Cannot read properties of null (reading 'prerelease')` — root package.json has no `version` and is `private: true`. Must `cd packages/<name>` AND use `pnpm` (npm cannot resolve `workspace:*`).

### NEXT STEP (unblocked, not started)
1. Switch 17 `file:` deps -> npm versions across root `package.json`, `apps/admin/package.json`, `apps/site-chat/package.json` (~30 lines).
2. Drop the 3 unimported deps in the same pass: `agent-plugins`, `mcp`, `platform`.
3. Add `npm run link:jini` / `unlink:jini` + a guard that fails a build while links are active (owner's fast local loop must survive).
4. Rewrite `Dockerfile`: delete the Jini build stage, `COPY . .`, drop the Jini re-includes from `Dockerfile.dockerignore`.
5. Then `docker build .` works from the Tovu repo alone — unblocks Fly, Railway, Render, App Runner.

## CORRECTION: `@jini-ai/mcp` IS imported — do NOT drop it

My "3 unimported deps" claim was 2-for-3. Verified call sites:
- `apps/website/src/assistant/mcp-injection.ts:39` — `require.resolve("@jini-ai/mcp")`
- `development/evals/tool-search-caller2-compliance-harness.ts:163` — `await import("@jini-ai/mcp")`

The survey only grepped static `from "@jini-ai/..."` imports and missed `require.resolve` and dynamic `import()`.
**Drop only `agent-plugins` and `platform`. Keep `mcp`.**
LESSON: a dependency-usage survey MUST cover `require.resolve(...)` and dynamic `import(...)`, not just static imports.

## npm has STALE builds — republish in flight

All 9 previously-published packages went out 2026-07-29 and have drifted since (files changed: ui 551, agent-runtime 93, agentic 55, daemon 47, mcp 33, platform 15, sqlite 15, core 14, protocol 10). Version numbers matched local, CONTENTS did not.
Worse: the 7 published tonight pin the STALE internal deps (`cms` pins `core@0.1.2`), so the published graph was internally inconsistent.
`jini-republish` is doing a lockstep bump + clean rebuild + republish of the 15 packages Tovu consumes. `tovu-df` is HELD off the `file:` switch until it lands.
LESSON: a matching version NUMBER is not proof of matching CONTENTS. Check the publish date against source mtimes.

## ALL 18 JINI PACKAGES REPUBLISHED AT 0.3.0 — VERIFIED LIVE (2026-08-31 23:5x)

core protocol infra platform agentic ui agent-runtime cms integrations devops daemon chat http-kit admin sqlite sidecar cli mcp
Internal `workspace:*` deps all rewritten to 0.3.0 — the published graph is now COHERENT (was not: the 23:25 publish pinned stale `core@0.1.2`).

**Tovu should depend on `^0.3.0`.**

### Why 0.3.0
`0.2.0` was already taken by an earlier agent-runtime/daemon release. 0.3.0 is the smallest minor above every existing version and free across all packages. Lockstep, per `.changeset/config.json`'s `fixed: [["@jini-ai/*"]]`.

### The publish set grew TWICE from wrong dependency surveys — both my errors
- 14 -> 15: `platform` has ZERO Tovu imports but 7 of the 14 declare it directly. Skipping it would break `npm install`.
- 15 -> 18: `mcp` -> `cli` -> `sidecar` (+core). I published `mcp@0.3.0` BEFORE `cli@0.3.0` existed, so mcp was briefly broken on install. Fixed by publishing sidecar then cli.
LESSON: survey the TRANSITIVE `workspace:*` graph, not just what the consumer imports directly.

### npm registry read-path lag is REAL and long
`agentic`/`ui`/`sqlite` all read as unpublished for minutes after a successful publish. The proof they had landed was a retry returning `403 cannot publish over previously published versions: 0.3.0`. NEVER conclude "not published" from a packument read alone — retry and read the 403.
`ui` is large enough that `pnpm publish` exceeds a 2-minute command timeout; run it backgrounded.

## PEER-RANGE FIX: infra + integrations -> 0.3.1

`@jini-ai/infra` and `@jini-ai/integrations` both declared `better-sqlite3: ^11.10.0` while Tovu is on `^13.0.0` -> npm ERESOLVE, `npm install` failed outright and left `node_modules/@jini-ai/` EMPTY.
Widened BOTH to `"^11.10.0 || ^13.0.0"` in Jini source and published **0.3.1**. Tovu's `^0.3.0` already resolves to it — no range change needed, just re-install WITHOUT `--legacy-peer-deps`.

**`file:` deps MASKED this.** npm barely enforces peerDependencies on linked deps, so the conflict only appears once deps resolve from the registry — i.e. exactly what a Docker build does.

Full peer sweep of all 18 published 0.3.0 manifests vs Tovu's 81 declared non-jini deps: everything else is compatible (react/react-dom ^18.3.0||^19.0.0 vs Tovu ^19.2.4; sharp ^0.35.3; argon2 ^0.44.0; grapesjs 0.23.4 — all satisfied). No other peer conflicts.

REGISTRY LAG, again: `infra@0.3.1` read back as absent right after publishing. A retry returned `409 Cannot publish over previously staged version "0.3.1"` — that is the proof it landed. Use the 403/409 retry signal, never a bare packument read.

### Environment change (per tovu-df)
GitHub CI workflow DISABLED and flyctl UNINSTALLED by the owner. There is no deploy path from this machine right now — the Dockerfile rewrite is still worth doing, but build verification is blocked pending the owner's call.

## FINAL: better-sqlite3 -> `^13.0.0` (owner's explicit call, NOT the union range)

`@jini-ai/infra@0.3.2` and `@jini-ai/integrations@0.3.2` published with `better-sqlite3: "^13.0.0"`.
0.3.1 is BURNED — it shipped the union range `^11.10.0 || ^13.0.0` before the owner's instruction arrived. 0.3.2 is the first version with `^13.0.0`.
Tovu's `^0.3.0` resolves to 0.3.2 automatically — no manifest change needed. Re-install WITHOUT `--legacy-peer-deps`.

### NOT published, source now ahead of npm (none are in Tovu's dep graph)
- `@jini-ai/registry` — tree 0.3.0 w/ ^13.0.0, npm still on July `0.1.2`
- `@jini-ai/capability-providers` — tree 0.3.0 w/ ^13.0.0, npm still on July `0.1.2`
- `@jini-ai/server` — tree 0.3.0 w/ ^13.0.0, **never published at all** (404)
Owner said "update everything to use better-sqlite3 ^13.0.0" — may have meant publishing these too. ASK.

## TRAP: stale `link: true` lockfile entries silently undo the file:->npm switch

Per tovu-df, verified on their side: after switching manifests to `^0.3.0`, `npm install`, `npm install --package-lock-only`, and even an explicit `npm install @jini-ai/x@0.3.0` ALL silently recreated the `file:` symlinks from stale `link: true` lockfile entries and ignored the manifests. The only fix was stripping those 13 entries from the lockfile by hand.
=> A lockfile committed mid-migration can silently revert the whole switch. Verify with: every `@jini-ai` lockfile entry registry-resolved, `node_modules/@jini-ai/*` are REAL DIRECTORIES not symlinks, zero `link: true`.
