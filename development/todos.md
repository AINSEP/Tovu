# Todos — Tovu (website product)

> **Scope.** This is the **Tovu website-product** backlog (CMS runtime: kernel,
> data layer, content model, theme/plugin systems, admin UI, SEO/AEO/GEO plugins,
> WordPress/Payload/Directus/Ghost parity). It moved here in the 2026-07-06 repo
> split. Cross-references to `apps/website/src/…` and `apps/admin/src/…` refer to code in **this
> repository**; they are no longer merely Tovu-Runner port candidates. (Bare `src/…` paths in older
> entries predate the apps/website restructure — read them as `apps/website/src/…`.)
> Operator-shell / media-generation / agent-detection / the operator chat profile
> remain tracked in **Tovu-Runner**.
>
> `START-HERE.md` remains the architecture orientation document, but its greenfield
> status language is historical. Verify every backlog claim against current source
> before treating it as open.

**Reference (added 2026-07-14):** competitive positioning vs. WordPress/Strapi/Directus/Payload/Ghost
(where Tovu is ahead vs. genuinely behind) + an agentic-control-plane/MCP-WebMCP-A2UI-MCP-UI readiness
gap analysis, written right after ADR-041/043/044/045 (Storage/Collections/Categories&Tags/Backups-Recovery)
were accepted. Informal, not debated/audited — a reference to revisit during future parity work and
before building the eventual agent tool catalog. See
`ADS-memory/reports/strategy/20260714-competitive-positioning-and-agentic-mcp-readiness.md`.

---

## ⭐ HIGH PRIORITY, NOT NOW (owner 2026-10-25): fast site switching on localhost:3000
Switching which site is active on the local web app (localhost:3000) is slow today. It needs an app restructuring so a switch is quick: e.g. per-site runtimes kept warm / swapped without a full server restart, instead of tearing down and rebooting. Plan first (measure today's switch time + what restarts), then build. Not now — owner will say when.

## 🎬 CREDIT-BURN BACKLOG — pick from here when the owner has no tasks (owner 2026-10-24 ~10 PM)
Owner: "when I don't have anything off the top of my head to do for Claude, I want to make motion graphics, videos, stuff that I can use to market this… maybe tomorrow we just do a bunch of videos." Use spare weekly credits on these, in this order:
1. **Marketing videos + motion graphics (MAIN).** Make better Tovu demo videos, then cut them into short clips (~30 s, no dead time; voice clearly over music — measure the mix). Motion-graphics intros/explainers per feature (site chat, Pages, plugins, sign-in, deploy). Look-checks via Claude in Chrome; heavy renders in the cloud, never an unthrottled ffmpeg on the Mac.
2. **Admin themes.** More admin looks (glassmorphic is parked; see "Admin theming consistency: ONE token authority" and "Admin themes explorable + editable" below — plan first).
3. **End-to-end testing.** The scoped E2E program (deferred until after the test-rigor wave), run on fake-test-site in the cloud.
Ideas to offer the owner (not approved yet): landing-page hero animations and screenshots, one short tutorial clip per agent plugin, social-post cutdowns (vertical 9:16) of each video.
Every cloud run here still follows the iron rule: the owner approves a cost estimate and hard caps first.

## Assistant prompt tests: MORE prompts + two suites (owner 2026-10-25)
Grow `development/assistant-prompts/capability-prompts.md` beyond the 40-prompt subset. Two suites: **non-Bash** (main — the online assistant has no Bash, so every job must work through Tovu tools with no gaps) and a small **Bash** suite. Always run through the real admin assistant chat on localhost (fake-test-site) in Claude in Chrome — never the headless probe script. Fix the doc's "How to run" section to say so.
- LATER (owner 10-25): run the suite with **Codex** as the assistant's CLI too (admin → AI Assistant → Your CLIs), not just Claude Code — 10-25 run was Claude Code / Opus 5.5.

## MEDIUM, NOT NOW (owner 2026-10-25): Renovate for dependency updates — set up, turn on when we ramp up
Owner picked Renovate (free, best-rated for monorepo grouping/scheduling) over Dependabot updates. Don't enable yet. When we turn it on: group updates (one batch per week, `@jini-ai/*` separate), no auto-merge, and respect the no-PR-spam rule (owner dislikes PR floods — batch hard). Pair with OSV-Scanner in CI (report-only, no PRs) and Dependabot *alerts* (no update PRs). Gitleaks already added for Tovu (b07d968c8, 10-25).

## ⭐ HIGH PRIORITY, NOT NOW (owner 2026-10-24): Software factory on GitHub
Owner: "a software factory on GitHub… when somebody creates an issue, there's a loop to solve it… people log bugs and that helps us fix it much faster." "We're not gonna do it for a while." Unbiased research (no tools named in the brief) is done: `ADS-memory/.local-artifacts/codex/2026-10-24-software-factory-research/out/software-factory-research.md`. It recommends a bounded issue → draft-PR pipeline where humans approve scope, merge and release. Start with GitHub controls (issue forms, rulesets, required CI and reviews, actionlint/zizmor), then triage in suggestion mode, then reproduce before fixing, then one sandboxed worker (mini-swe-agent) on maintainer-approved issues only. Also required: the 8 must-have safety controls for public issue text, and hard cost caps plus a kill switch. Next step when the owner restarts it: an Opus grade, or the owner picks parts. Also queued: an in-app "Report a bug" path that files a GitHub issue with secrets stripped.

## UI FIX BATCH — queued, one Opus + Chrome pass (owner 2026-10-23 ~11:35: "queue that up… fix a bunch of things at once")
- **Chat UI — answered choice questions (owner 2026-10-25, Vindexa site):** when the assistant asks a choice question (e.g. "replace or update the privacy policy?") and the owner picks one, the chat shows only a bare "update" bubble. Show the question AND the chosen answer instead (e.g. a compact "Replace or update the privacy policy? → Update" card). Not urgent; probably not a quick fix (ask-choice tool result rendering in Jini chat).
- **Chat UI:** messages sent mid-run render inside the assistant turn, with no copy button and under that turn's "Done · 3m 42s · $3.95 · total $26.94" footer. More findings: `ADS-memory/reports/2026-10-23-orvellea-chat-errors.md`, "UI findings" section (Opus + Chrome look, in progress).

## Jini fetch cache → TanStack Query as Jini's default (owner 2026-10-18; LATER, not now)
Owner: "have Jini use TanStack later… blast radius is pretty high." Today `@jini-ai/ui/fetch-query` has two adapters behind one contract: Jini's built-in ~430-line cache (packages/core/src/fetch/cache.ts, the default) and an optional TanStack adapter (packages/ui/src/features/panel-kit/fetch-query/adapter.tanstack.tsx). Tovu's admin ALREADY uses the TanStack adapter (apps/admin/src/lib/fetch-query/provider.tsx, adapter="tanstack") → zero change for Tovu admin. The work = make TanStack the default for other Jini hosts (desktop renderer, Open-Marketing, Zana…) or retire the built-in cache. Risks: key matching (built-in ===, TanStack deep), retry/refetch/gc defaults, any host relying on built-in quirks. Plan first (Codex), per-host test runs, then switch.

## Glassmorphic admin theme — PARKED (owner 2026-10-18 ~08:55: "this is just not good. i think it's the color… come back to it, not now")
State: uncommitted in the working tree (apps/admin/src/admin-themes/glass/**, glass wiring in admin CSS + Jini ui variables.css, frosted rail/dock via ::before layers, per-theme accent, pins follow scheme under Glass). Sidebar + dock frosted and checked in Chrome; Classic computes like HEAD. NOT done: mountain background photo, clear frosted cards everywhere, floating rail, colour direction (owner thinks the colour is the problem). Look target: ADS-memory/reports/2026-10-17-admin-themes/GLASS-REFERENCE.md + glass-reference-2-background.jpg. Next time: start with the colour/palette + photo, Opus+Chrome edits and checks (owner rule 10-18).

## Admin theming consistency: ONE token authority (owner 2026-10-17 ~23:15; plan first)
Root cause of tonight's symptoms (Classic dark sidebar/chat ≠ content; accent recolours Glass not Classic; 10 light-pinned screens): two token systems — Tovu legacy (--bg/--fg/--primary…) and Jini (--jini-*) — bridged partially in both directions. Fix: Jini roles = only authority; Tovu names = one-way aliases; themes + accent set only Jini inputs; one scheme attribute; then unpin Classic. Classic stays pixel-identical (parity tooling from 10-17). Codex read-only plan: <tovu-1a scratch>/out-plan-unify/. Do BEFORE more theme packages.

## Admin themes explorable + editable like site themes (owner 2026-10-17 ~22:55; plan first)
Owner: "I want the admin themes explorable and editable just like regular themes. I may want glassmorphic with a background pic… click into it and see the theme files and maybe add the background image to something." Proposal: admin themes become runtime-loaded folders (seeded like site themes, CSS via <link>) instead of Vite-bundled; clicking a theme card opens the existing theme Explore/editor; manifest-declared knobs (Glass: background image from Media, blur, tint) shown on Admin UI → Appearance, so no CSS editing is needed; Duplicate → editable copy. **Owner corrections (~23:00):** themes have their OWN media assets (bg images in the theme folder, uploadable); editing is first-class — small tweaks, especially via the AI assistant with the same theme tools; BACKUPS just like site themes (reuse the same backup/undo/restore). **HARD REQUIREMENT (~23:05):** switching admin themes stays LIVE (no reload, as today since 4d4f9a2c2), and edits to a theme's files (by the owner or the AI) show up immediately (reuse the site theme folder watcher; swap the <link> in place). Codex read-only plan running 10-17 night: <tovu-1a scratch>/out-plan-atx/admin-theme-explore-plan.md → owner reviews before build.

## HIGH PRIORITY (owner 2026-10-17 ~20:30): ChatGPT provider login ("Sign in with ChatGPT") — not now, but next big item
Owner: "I want to log in to ChatGPT to use my credits from my account… a third tab next to Local CLI and BYOK… a modal comes up, we log in, we're connected." Investigation (Codex, read-only): `ADS-memory/reports/2026-10-17-chatgpt-provider-login/INVESTIGATION.md`.
- **Shape: core Jini provider-login adapter, NOT an agent plugin.** Agent plugins only package skills + MCP servers; Jini host plugins have no model/auth-provider contribution point. Reuse ExecutionTab/ExecutionPort (the Local CLI | BYOK tab, Jini ui), `@jini-ai/oauth` + `createTokenRefresher`, `oauth-callback-server.ts`, the vault, `runProviderToolTurn`. MCP not involved.
- **OpenAI SIWC facts:** open-source / locally hosted apps (= the desktop app) qualify with NO application (dynamic client registration `dynamic_agent_client` → issued `oaiapp_…` client_id, PKCE, no secret, loopback `http://127.0.0.1:<port>/auth/callback`). Hosted tovu.dev needs OpenAI's commercial approval (apply) → keep SIWC off server-side on tovu.dev until approved. Inference = `POST /v1/responses`, `store:false`, `stream:true`; models via `GET /v1/models`. Access 1h, rotating refresh 30d. Docs: https://developers.openai.com/siwc/token-sharing-open-source
- **Pieces:** (1) **FIRST do item 22 below — rebase `@jini-ai/oauth` on a maintained library** (survey GitHub/vendor OAuth libs, pick the best, likely `oauth4webapi`); (2) SIWC auth adapter (issued-client registration, OIDC id_token verify, revocation) M; (3) loopback callback keeps `client_id`, SIWC path/state rules S–M; (4) sealed connection records per principal+client+account M; (5) **new OpenAI Responses API adapter** (BYOK's openai-chat.ts is chat-completions only) L; (6) third tab "Provider login" + modal + Connected/Switch/Sign out/Manage usage, "Using ChatGPT plan" near composer M; (7) two configs (desktop local flow / tovu.dev partner client) + server-side eligibility gate S.
- **Claude/Gemini:** no plan login allowed for third-party apps (Anthropic ToS; Google has none). Claude Code already works via Local CLI. Gemini CLI retired 10-06 → agy.
- **Owner 20:40: ONE login system for BOTH the desktop app and hosted Tovu (tovu.dev). NO CLI of any kind** (non-technical users won't install Codex/Claude CLIs). Same adapter, two configs: desktop = no-secret local flow (dynamic registration + loopback callback, works now); tovu.dev = OpenAI-issued partner client_id + https redirect on tovu.dev → **owner must apply** (OpenAI "Request a client ID" / commercial interest form: https://developers.openai.com/siwc/request-client-id). Until approved, the tab works on desktop and shows "coming soon" on tovu.dev.
- **Defaults:** admin assistant first (not visitor chat); per-user logins, one active account, no cross-site copying.

## NEXT SESSION: owner asks from 2026-10-09 night (full list: `ADS-memory/.local-artifacts/handoffs/2026-10-09-tovu-8c-to-tovu-16.md`)

10b. **Sweep: side nav expanded + assistant dock open (owner 2026-10-10 11:49, "horrendous"):** on narrow content areas the expanded nav overlays/cuts page content (seen on theme explore). Check every admin page in nav collapsed/expanded × dock closed/open + 390px; likely fix: container queries on the main content area instead of viewport media queries, and the nav pushes content rather than overlaying when the dock is open.

10c. **Copy credentials between local sites (owner approved 2026-10-10):** one generic tool over the credential-kind registry (item 19), server-side re-seal, value never shown; MCP-UI card picks the source site + keys; "Copy from another site…" on each admin key form; local sites only. Also add a visitor-AI kind to the masked key card. Later: a shared local key store.

10h. **Tovu app key + shared local credential store (owner 2026-10-10, after 10c and item 19):** one app key per computer (desktop app, macOS Keychain) seals a shared store; local sites can use a shared key instead of a copy; site keys stay per site; deploys seal used keys with the site key. Keep the copy tool (10c) as well.

## In-app assistant: memory on/off as a chat setting (owner 2026-10-16)
Memory for the in-app Claude agent is turned OFF for now (it kept trying to save notes with Write, which is blocked, wasting a step each run — chat audit 2026-10-16, `ADS-memory/.local-artifacts/codex/2026-10-16-chataudit/FINDINGS.md` G5). Later: a "Memory" on/off setting in the chat's dropdown. Works per chat: the daemon starts a fresh `claude -p --resume <id>` process for every message (Jini agent-runtime `defs/claude.ts:168,209`), so a toggle takes effect from the NEXT message (not mid-reply). When on, give it a real place to write (a memory tool or an allowed folder), otherwise it just fails again.

## AFTER this round ships: overbuild cleanup (owner 2026-10-11)
Owner: coding agents go overboard and create unnecessary code; review and cut excess code AND tests. When: after the 10-11 round is tested, committed and released (no reviews on moving code). Measure first (knip/ts-prune unused exports + files, single-user abstractions, near-duplicate code, LOC per feature vs what it does; start from `ADS-memory/.local-artifacts/overengineering-audit-2026-10-07/REPORT.md`), then cut in small waves per area, tests green after each, coordinator reviews every cut. Tests: drop ones that only re-check fakes/implementation details, duplicates and coverage padding; keep behaviour + regression guards. KEEP deferred work (owner): anything marked "Soon", items listed in this file, flag-off/parked half-built features; unsure → ask the owner, never delete.

## LATER: offer shipped-theme updates to sites (owner 2026-10-11, "we're going to need it, but not now")
Each site keeps its own copy of its theme (e.g. Documents/Tovu/tovu-dev/themes/static/tovu-theme), so fixes to Tovu's shipped themes never reach existing sites (10-11: tovu-dev's toggle/form styling was broken until an agent synced theme.css by hand; other sites still have the old copy). Build: when the shipped version of a site's theme changes, offer an update in admin → Themes as a reviewable diff the owner approves (never silent overwrite; keep the site's own edits; backup before apply).

## Assistant can diagnose page performance itself (owner idea 2026-10-11)

## HIGH: admin tab ~1 GB / slow with a long assistant chat (measured 2026-10-11)
Fresh /admin tab with the 38-message chat "Can You See Last Chat" restored: 254–310 MB JS heap, 13,910 DOM nodes (13,389 in `.jini-message-list`), 713 collapsed tool cards still MOUNTED with 1,420 hidden `<pre>` = 3.45 MB text (+~1,525 svgs). Cause: Jini `packages/chat/src/react/components/ToolCard.tsx:476-491` `ExpandableCard` keeps collapsed panels mounted on purpose (so `page.*` readers can read them); each panel up to 10,000 chars (`core/tool-call-detail.ts:36` DEFAULT_MAX_CHARS); MessageList not virtualized. Fix: mount panel children only when open (give page.* readers the detail via a store lookup/data attr instead), cap collapsed op-output ~1–2k chars, window/virtualize older messages. Dev-mode HMR buildup (2,707 hmr updates tonight) adds more in long-lived tabs. Report: memcheck agent 2026-10-11.

## HIGH, PARKED for a design talk (owner 2026-10-13): in-app agents get full CLI ability, but TOOLS FIRST (IRON RULE)
Audit: `ADS-memory/.local-artifacts/assistant-restrictions-audit/audit.md`, listing 16 active restrictions plus a KEEP list. The restrictions were added on purpose, to expose tool-call gaps. Owner: Claude, Codex and Gemini agents "should be able to do whatever but prefer tools first". Bash and file editing are a LAST RESORT. Agents, workflows, the user's MCPs (Claude in Chrome), settings and skills come back.
- Open owner calls: K3 (site keys vs Bash: accept / best-effort hook / Keychain) and K4 (cross-site writes through Bash).
- Log every Bash/edit fallback, so the gaps stay visible.

## LATER — VERIFY + VALIDATE FIRST (owner 2026-10-13): decouple Jini packages from @jini-ai/ui
Owner question: should packages that use UI take components through a getter (`getUIComponent()`) plus dependency injection, so nothing is hard-coupled to `@jini-ai/ui`? Not decided. Verify the facts and validate the approach before any code.
- Facts on 2026-10-13: the published packages that depend on `@jini-ai/ui` are admin, chat, commerce and user-management. Layers (Jini scripts/check-package-layers.ts): ui = L5 and admin = L5 (with the allowed same-layer edge `admin→ui`). chat = L4 depends UP on ui and needs a special exception (`owner === 'chat' && target === 'ui'`). user-management depends on ui only as an optional peer.
- Coordinator's suggestion (to validate): avoid a plain global string getter, because it hides dependencies, loses types, and fails only at runtime. Prefer TYPED injection with defaults: a package declares the components it needs as a typed interface, the host provides them once at the app root (context/registry), and ui's components are the fallback. Do this ONLY at real swap points (DataTable, dialogs, chart and icon providers, chat UI); plain dependencies on stable lower layers are fine elsewhere. Precedents already in Jini: the chart provider registry with a table fallback, and the A2UI component catalog.
- First candidate: chat takes ui components through injection, which removes the L4→L5 exception.
- Next step when picked up: an architect writes a short ADR (exact component list per package, the injection shape, migration order), the owner reviews it, and only then is it built.

## LOW (Jini): reachability wait stops at the first "protected" candidate

## HIGH (owner 2026-10-12, start when a real use case appears): custom site plugin code (TS) — design DECIDED, not built
Owner: wants site-specific TypeScript code (by a developer or the in-app assistant) kept apart from marketplace plugins; "fairly high priority", build once there's a good use case. Design settled by a 2-round debate (Codex gpt-6.1-sol high + Opus 5.5 + Sonnet 5.5 subagents + coordinator, all ≥0.8): `ADS-memory/reports/swarm-consensus/runs/2026-10-12-custom-plugin-code-consensus-report.md`.
- Folders: `sites/<name>/plugins/<id>/<ver>/` (marketplace, installer-only, digest-pinned) + `sites/<name>/custom/{installed/<id>/<ver>/ (sealed JS + frozen source snapshot), source/<id>/ (editable TS; absorbs plugins/.drafts; never scanned), seals/<id>/<ver>.json}`. Origin = the root it sits in (never a manifest field); duplicate ids across roots refused. One runtime (existing discovery/installer run once per root).
- Seal: tsc (blocking by default; recorded owner/dev override, assistant can't waive) → esbuild bundle (SDK external; assistant code may not import `node:*`) → child-process load-probe → seal with source snapshot → consent if first enable / widened → activate; failed reload/quarantine → automatic rollback. Compile only on the authoring machine behind a build port; never at boot/deploy (prove esbuild in the packaged desktop app). sdkRange miss after an upgrade → quarantine, site stays up, assistant re-seals.
- v1 scope: API routes, SSR widgets, hooks, tools, declared tables, + plugin pages rendered in the theme layout. NOT in v1: npm deps for assistant-authored code; plugin client JS (theme scripts meanwhile; later developer-only hashed assets after an ADR-025 amendment). Crash-loop breaker (in-flight marker). Real isolation (worker RPC / workerd) later.
- Edge cases to honour: portability (export/deploy carry custom/, static export flags server-only plugins loudly, local = source of truth), plugin data (namespaced tables, forward-only migrations, rollback never rolls back data, uninstall keeps data), fork marketplace → custom (new `site.` id, stops updates), promote custom → marketplace, multi-site sharing later, route/slot/hook conflicts, redirects when a plugin page is removed.
- Cheapest proof (~1–2 days): flip the consent gap; `plugin_source_seal` accepts `src/server.ts`; one real plugin (API route + SSR widget); prove type error keeps live version, probe hang refused, failed reload auto-rolls-back, sealed folder boots with no compiler, seal works from the packaged desktop.

## ⭐ HIGH PRIORITY (after 0.1.14): database table-merge review + query-parity tests (owner 2026-10-11)
Owner: "have that as a high priority on the todos" — the vault ships in 0.1.14 (only secrets); everything else waits for this.
- **Merge debate, round 1 done** (Opus 5.5, Sonnet 5.5, Codex 6.1-sol; read-only): `ADS-memory/.local-artifacts/db-debate-2026-10-11/r1/{opus,sonnet,codex}.md`, context `ADS-memory/.local-artifacts/vault-impl-2026-10-11/db-consolidation-debate-context.md` (114 tables). All three: DON'T merge the 8 revision tables or the 6 RBAC tables; settings_values ×3 split (Codex LATER/Jini-first, Opus+Sonnet DON'T). Round 2 (stopped 10-11) should settle: settings merge, small drops (`__drizzle_migrations`, `site_title_preexisting_workspaces`, entry+content_type revisions, presentation_settings, the two plugin migration journals, orphan `member_tiers_workspace_id_unique`), retention for post_revisions/outbox_events/sessions.
- **Query-parity tests BEFORE any merge** (owner: "that's the test I was talking about"): for every table a merge touches, characterization tests through the real API routes/repos on populated SQLite + PGlite (+ PG) that prove the same data comes back before and after (row/value parity, ordering, uniqueness/FK/cascade behaviour, hot-path query plans), so a merge that moves a queried column into JSON or drops a table is caught.
- **Bug found by the debate (Opus r1, unverified):** SQLite schema identity reads the frozen `__drizzle_migrations` (`read-applied-schema-identity.ts:87-95`) and misses ADR-066 steps 0001+; fix = read `tovu_migrations` (~20 lines, no migration).
- Newsletter campaigns tables stay in core (not duplicates: the plugin has no campaigns table).

## AFTER the 0.1.14 release (owner 2026-10-11)
- **Copy between local projects** — build ON Publish Content: spec `ADS-memory/.local-artifacts/handoffs/2026-10-11-copy-between-projects-SPEC.md` (+ REVISION), Codex plan `ADS-memory/.local-artifacts/codex/2026-10-11-fix/w16-out/copyprojects-PLAN.md` (too big as planned, ~1k lines). Slice 1: pages+media from a RUNNING local project (existing scope/reference closure + loopback peer pull with selection). Slice 2: API keys via ONE generic re-seal over the existing sealed-column descriptors (`server/runtime/composition/sealed-credential-descriptors.ts`, 13 sealed tables, each with its AAD builder) — not per-store adapters. Longer term: one credential vault (Jini platform/secrets/credential-sets) instead of 13 sealed tables; fits 10h (Tovu app key + shared local store).
- **Second admin tab follows a running chat live** (full version, ~500 lines planned in `w16-out/secondtab-PLAN.md`); the small "reload the open chat when the tab regains focus" version ships now.
- **Form submit from a draft preview shows its result** — dropped for now: the preview iframe is sandboxed (opaque origin, no-referrer, no admin cookie), so the result can't come back without weakening it (`w16-out/draftsubmit.md`). Test forms on the published page.

## LATER: plannie pages that plannie.com has and we lack (owner 2026-10-11 night — "we don't have the information", log it so we know what to build)
Not built: owner has no content/data for them yet. Full inventory: `ADS-memory/.local-artifacts/plannie-nav-mirror-2026-10-11/INVENTORY.md`.
- Needs planner data / accounts: `/planners`, `/join-plannie` (JOIN AS A PLANNER), `/login` (LOG IN).
- +PLANNIE: `/plus-partner-directory`, `/join-plus`.
- Plan and Tell: `/share-your-story`, `/pro-newsletter`, `/submissions`, `/industry-newsletter` (home CTA).
- Blog categories `/planning-101`, `/real-events`, `/local-planner`, `/lessons-learned`: category terms exist locally, but there is no category archive route and menu termRef targets resolve to null — needs a category archive page first.

## LOW PRIORITY (later, owner 2026-10-11)
- **Interactive editor re-serializes untouched sections on structural saves** (found by qafinal 10-11): after a move/delete, every section is re-emitted — attribute order changes (class last), `&rsaquo;` → `›`, multi-line attributes collapsed, `a:b; c:d` → `a:b;c:d;`. DOM is identical (no visible change) but stored HTML diffs are noisy. Fix idea: splice only the moved/deleted ranges into the original source (extend source-splice.ts) instead of a full wrapper export. Jini html-editor editor-serialization.ts / source-splice.ts.
- **Run page scripts in the Interactive editor so animations are live AND editable.** Today the editor canvas runs no page scripts, so script-driven sections (Kuinetic animations etc.) can't be seen working while editing; 10l covers it with locked blocks. The hard part: scripts mutate the DOM (move/clone nodes, stamp runtime attributes like `data-kui-state`, inline styles), and the editor saves the canvas DOM, so a live runtime would write its runtime state back into the page and slowly corrupt it. Needs: run scripts in a separate live layer (or snapshot/restore the authored DOM), strip runtime-only attributes/nodes on save, pause/reset controls, and edits that map back to the authored HTML, not the animated DOM.

## AFTER desktop 0.1.13 ships: parked so it doesn't delay a downloadable app (owner, 2026-10-06 night)
Owner: "if it's not relevant or needed as far as the blocker for the desktop app, let's save it, and then we're gonna do it another time." All of these are Codex 6.1-sol high jobs unless noted.
3. **Jini CI publishing:** add the npm trusted publisher for `@jini-ai/protocol` and `@jini-ai/agent-runtime` (CI publish 404'd 10-06; the owner published by hand).
7. **[OPEN 10-07 22:20: the patch is NOT applied in Jini (no core/agent-failure.ts or AgentFailureCard.tsx there); its gemini.ts hunk is moot because the Gemini CLI def was retired in Jini e60e83fe]** **Jini side of the agent-failure display:** apply `ADS-memory/.local-artifacts/codex/2026-10-06-agent-error-surface/agent-error-surface.jini.patch` (failure hints for every agent def + the chat UI's native failure card). The Tovu side shipped in 1cf13b22f. Drop the gemini hint once Gemini CLI is removed.
8. **Riskiest untested server routes:** the integration-only coverage + mutation sweep was STOPPED partway on 10-06 (load 23–45, ~8 h at one file at a time). Partial data in `ADS-memory/.local-artifacts/integration-quality/`: route-inventory.{json,tsv} (every registered route), results.tsv + tap/ (per-file results so far, ~30 of 226 files), tools/ (an Express dispatch-log preload that measures routes, because node+tsx lcov line positions are wrong). Known hang: cli/adopt-command (like serve-command). Resume with server/** + the route-hitting assistant files (~110) first; run the mutation sweep in an rsync COPY (never mutate the live tree, the dev server hot-reloads); then write REPORT.md.
9. **Web journeys findings:** from the 0.1.12 web-journeys run (`ADS-memory/.local-artifacts/web-journeys-0112/`), excluding anything that blocks the desktop release. All 89 web journey tests were tagged `@unrun` before 10-06.
10. **[DONE locally, verified 2026-10-09: tovu-dev landing carousel plays the zoomed V1/V2/V3 (media demo-v{1,2,3}-*-zoom); left: V1/V2 still use the non-zoom posters, Retina 2x re-record (optional), production not verified]** **Demo videos V1 and V2: add the in/out/in zooms** like the V3 zoom cut (`ADS-memory/.local-artifacts/demo-videos/2026-10-06-zoom/`; renderer `demo-videos/zoomcam/`), then swap them into the landing carousel. Optional: re-record at Retina 2× for crisp zoomed text (the owner found 1440×900 zooms "a bit blurry").
11. **[IN PROGRESS 10-07 22:20: coded, UNCOMMITTED, tests pending: the *.pins.journey.ts journeys, the bug-pin harness (support/bug-pin-*.ts, pin-site-state.ts, journey-admin-bundle.mjs), the old specs/configs deleted in the working tree, and package.json scripts e2e:journeys, e2e:journeys:real, e2e:desktop:app (packaged-app desktop journeys); the open questions and the release-checklist entry are unchanged]** **E2E consolidation:** migrate the 71 bug-pin specs (47 configs) into the journeys harness (owner chose migrate on 10-04); add a run-all command. Still open: run the 6 real-service specs only on request? Run the suite pre-push or in CI? Also an `npm run` script for the packaged-app desktop journeys, and adding them to the release checklist.
12. **Desktop preview P1 follow-up:** fixed in source (fb6765e95); confirm in the 0.1.13 build.
17. **Full MCP server, built as a generic Jini package that Tovu, Zana, open marketing and future apps plug into** (owner, 2026-10-07: "Jini should be able to do all this stuff, and then we just inject it"). Not for 0.1.13. Inputs: the Codex design `ADS-memory/.local-artifacts/codex/2026-10-07-tovu-mcp-design/out/mcp-design.md` and the leaner Opus critique `.../OPUS-CRITIQUE.md` (host it in the app server, plus a ~100-line stdio launcher; an explicit tool allowlist; v1 keys hold plain read permissions only, so no migration). Full scope beyond tools: resources + subscriptions (fed by the hooks/events system), prompts, elicitation (approvals for delete/publish), sampling, completions, progress/cancel, logging, list_changed, MCP Apps/MCP-UI, structured output, OAuth for ChatGPT/Claude.ai, a Claude Desktop `.mcpb` one-click bundle + registry listing, multi-site. Approval policy: only trash/delete/permanent delete/publish ask (owner 10-07). Libraries to build on rather than hand-write (check current versions/feature support first): `@modelcontextprotocol/sdk` (already in Jini `packages/mcp`; protocol, transports, every capability), optionally FastMCP, `@mcp-ui/server`, an OAuth provider for the remote sign-in (the SDK auth helpers, Better Auth MCP plugin, or oidc-provider), `@anthropic-ai/mcpb` for the Desktop bundle, the SDK Client + MCP Inspector for tests. FIRST STEP (owner 10-07): a full Jini/MCP write-up that surveys which open-source libraries cover each capability and designs the thin per-app adapters, before any build. Our code = registry→MCP mapping + allowlist/approval policy, per-app resource/prompt adapters, keys→principals, events→resource notifications, desktop launcher/installer.
18. **Chat guides users into saving vendor keys/tokens through MCP-UI cards** (owner 10-07, "one of the most critical things"; STATUS 10-07 22:20: jobs 1-3 COMMITTED, in 0.1.13 scope: (1) Jini 6e36303e, (2) Tovu b615fcd6f, (3) Tovu b246aacf8 incl. the on-disk canary scan; STILL OPEN: the localhost assistant-chat canary journey, to be saved as a headless journey test and run in the final E2E batch, and the shared-card move to Jini (= item 19)). "MCP" here = in-chat MCP-UI cards, not MCP servers. Audits: `ADS-memory/.local-artifacts/mcp-token-safety/` (credential-cards-audit, investigation, fidelity, PLAN.md). Owner decision: a token pasted into a chat message gets REDACTED ("[token removed]" in chat.db and model input) and the matching secure card opens; the rest of the message still sends. Three Codex 6.1-sol high jobs are ready in `ADS-memory/.local-artifacts/codex/2026-10-07-credential-cards/p-*` (run in order with `run-chain.sh`): (1) Jini paste guard + masked multi-line secrets + no pre-filled secrets; (2) Tovu "open the right card" prompt rule, missing/invalid key → card → retry, new cards; (3) exact-token checks on all 9 cards (blank refusal, length/charset limits, "…a9F2, 1,184 chars", Test connection reports auth errors) + an on-disk canary scan. **Before running:** wait until tovu-70's Jini job j is committed; job 1 must run with `-C /Users/la/Programming/Jini` (the runner hardcodes `-C Tovu`, which made Jini read-only, so the first try did nothing); then rebuild Jini dist. After: the localhost assistant-chat journey with a canary token (Claude + Chrome). Later: move the shared card code into Jini (audit G8).

20. **[IN PROGRESS 10-07 22:20: waves 1-2 coded, waves 3-4 mostly coded, all pending tests. COMMITTED so far: p2-3 Users/Members 247feb6fa (+ Jini a319c44f), p4 MCP federation 5095dcbc9 (+ Jini 2f572a0c), dead-code deletes 1785718ef + 618f9a5d7, Jini daemon-executor facade 4165156f. Wave 1 still UNCOMMITTED: p1 agent-plugin lifecycle, p5 secret-card engine, p12 commerce to Jini]** **Over-engineering clean-up program (owner 2026-10-07 ~17:55: BEFORE 0.1.13, option B: "clean up the excess code and useless tests right away"; E2E re-runs at the end; Opus architect plans and reviews each phase, Codex implements, the test queue proves each phase green).** Audit: `ADS-memory/.local-artifacts/overengineering-audit-2026-10-07/REPORT.md` (~30–40k lines). Owner decisions:
   - Routes onto Jini defineJsonRoute; one defineTool per tool instead of 6–7 hand-synced tables; one defineSettingsGroup; one manifest loader; drop the duplicate MCP port.
   - KEEP AG-UI (owner).
   - Also from the Ponytail-ladder audit (`ADS-memory/.local-artifacts/cleanup-program/ponytail-ladder-audit-tovu.md`): ~15 hand-built modals → the Jini dialogs; admin api.ts helper; Jini shims (~2k); unused deps and fields; pub/sub buses → EventTarget; 39 isPlainObject copies.


## Owner decisions still in force (carried from the retired owner worklist, 2026-10-04)

Product calls that govern future work. Dates are when the owner said it. Archive:
`ADS-memory/.local-artifacts/archive/owner-worklist-retired-2026-10-04.md`.

- **Errors say the real reason (09-16):** "always say the real reason so i can improve it or people can see the errors and report them later".
- **Publish actions (09-18):** Deploy, Publish Content, and a combined Deploy + Publish that is an explicit third choice, never the default, and deploys THEN publishes (the combined tool itself is parked, see below).
- **Agents may read everything (09-24):** the `.env` deny was reverted ("claude should read everything"); the non-Claude CLI key-file block is parked.
- **Public file URLs (09-23):** serve only files something published uses, plus a user-changeable setting, default protected.
- **Users (09-24):** owner/admin keep resetting others' passwords (add an info icon saying why); owner + built-in admin role may trash/restore/purge users; NO production lockout on the default password; first start with admin/tovu-dev is OK on localhost with a dismissible "change your password before deploying" banner.
- **Storage (09-28):** SQLite is the default; PGlite is an option chosen at site creation with full parity (one PGlite for content, one for chats); the choice is not permanent (PGlite → Supabase Postgres later); PGlite stays hidden until parity. Drop Drizzle after Q1; AI chats live in Postgres schema `ai_chat`; every SQLite site gets a `tovu_migrations` table plus a one-time backup on next boot.
- **Hooks (09-23):** about 20 core hooks now, plus plugin-published namespaced hooks (`acme.invoice.created`) on top of the typed core catalog, low priority.
- **Langfuse (09-23)** may receive prompts, opt-in, keys always stripped. Monitoring as a whole is still Later.
- **Zana admin (09-24)** is its own project (a copy of the Tovu admin, not a shared shell): vibecoded app → Zana admin → Jini.

---

## Open owner decisions + leftovers from the 2026-10-05 review/fix pass (NOT now — owner, 2026-10-05)

Source: Codex 6.1-sol review of the 10-04 night commits, fixed by Opus 5.5 lanes A–F. Reports:
`ADS-memory/.local-artifacts/codex-review-2026-10-05/out/`, follow-ups: `.../FOLLOW-UPS.md`, lane handoffs:
`ADS-memory/.local-artifacts/handoffs/2026-10-05-fix-*.md`.

**Decisions owed by the owner**
1. **Form dedupe without a per-page token.** Public forms now carry a hidden `_attempt` token, so a double click
   stores one row and two visitors store two (Tovu 8d2e9da6a, Jini c2c48cce). Without a token (static exports,
   pages replayed from a shared/CDN cache, API callers) dedupe falls back to same IP + same body within 60 s, which
   can merge two real people behind one IP sending identical answers. Options: keep (current) / shorten the window /
   no dedupe when there is no token.
2. **Real sandbox for Tier-2 plugin workers.** Fixed: site-folder Tier-2 packages are refused; workers no longer get
   the server env (only NODE_ENV, TZ, TSX_TSCONFIG_PATH, NODE_V8_COVERAGE) (3528cbf85). Still open: a built-in Tier-2
   worker can import `node:fs` and network modules — a Node worker is not a sandbox. Needs a real one (separate
   process with Node's permission model, or an isolate) before third-party Tier-2 plugins are allowed.
3. **Form styling.** (a) DECIDED 2026-10-05 night: submit uses the theme's "Get started" button style on every
   embedded form (Tovu 621216c22). (b) Keep an author's own `<form class="…">` in HTML mode? Today
   `deriveHtmlForm` strips the outer `<form>` and its attributes at save; render already supports a `className`.
4. **Import errors operators need.** f2f1d26f9 stopped leaking raw error text from publish-content import routes,
   so some operator-facing messages ("Send by hand needs its audit storage installed…", the undo failure "…restore it
   from Trash") now show "internal error" over HTTP and survive only in the server log. Fix: give them their own error
   classes so their text reaches the UI. Also check `routes/publish-content/backstop.ts`, `bundle-create.ts`,
   `destination.ts`, which still return `error.message` directly.

**Leftovers (none block a release)**
- **Tombstone event (Jini cms, `packages/cms/src/content-types/lifecycle.ts:239`).** Deleting a content type
  "tombstones" it (a permanent marker that the type is gone, so its key can't be reused). The tombstone row commits
  first, then the type's indexes are torn down, then the "content type deleted" event is queued. If teardown throws,
  the event is never queued, and a retry is refused because the type is already tombstoned — so listeners never hear
  about the delete. Harmless in Tovu today (its index provisioner does nothing); matters for Jini hosts whose
  provisioner can fail. Fix: queue the event in the same transaction as the tombstone, or make teardown retryable.
- **Memory-DB images:** `createRouteDeps` (apps/website/src/server/runtime/composition/app.ts:1258) never calls
  `ensureCoreMediaTransform`, so under `TOVU_DB=memory` no image gets a `publicUrl` and `/m/` 404s. Blocks the
  public-media E2E journey.
- **Theme page preview CSP:** `middleware/theme-page-preview.ts` likely needs the same
  `Content-Security-Policy: sandbox …` header template-preview got (e188fc56e).
- **Preview sandbox not yet looked at in a browser** (f65fb186a, dev server was down). Side effects: previews lose
  per-tab scroll memory and Esc-to-collapse inside the frame; theme scripts using storage/site APIs fail in previews.
- **DR-001 doc** still says `role.manage` is owner-only; the owner gave built-in admin full Roles access on 10-05
  (Jini fe16e8a1, Tovu 52e366148).
- **Admin RTL** (queued by the owner 10-04/10-05): convert the 78 left/right rules in admin `styles.css` to logical
  properties, then turn on `dir` sync (`syncDocumentAttributes` in 8 providers).
- Tier-2 import seam's `resolveWorkerEntry` option has no production caller (kept, tested).

---

## Chat run footer: per-message cost + session total (owner idea, 2026-10-05 night; LATER, not now)

**Also found 2026-10-05 night (demo videos + landing carousel), not started:**
- Post page `fade-up 600ms … distance:18px` on the `<article>` (tovu-theme `render/pages/posts-default.html:42`)
  makes detailed featured images shimmer while it settles. Option: opacity-only fade.
- Chat shows no thumbnails for images it generates or imports (Higgsfield → media import).

---

## Moved from owner-worklist (2026-10-04)

The owner worklist (`ADS-memory/.local-artifacts/owner-worklist.md`) was retired 2026-10-04; new items go here.
Each item: what is left, date asked, `Lnnn` = line in the archived worklist. Verified against code/git on
2026-10-04 (Codex audit `ADS-memory/.local-artifacts/codex-waves/features-2026-10-04/worklist-open.md` plus spot checks).
Not repeated here because other work owns them today: test-rigor waves 11–19 + requeues, desktop 0.1.8 release.
(Plugin install from folder/zip, raw-HTML forms/menus/taxonomy and media `createdBy` landed 10-04, see Done.)
Re-audited against code/git 2026-10-04 (evening): statuses below marked **PARTLY**/**STALE** where they changed.

### Desktop
- **Session/tab restore on launch, Cmd+K quick open, native notification when a long run finishes** (09-18, L2171–2175): none built (audit estimates: restore ~half a day, notifications 2–3 days + an ownership call).
- **Measure card-preview timing** (09-12, L51): `PREVIEW_PAINT_SETTLE_MS=1200` / `PREVIEW_CAPTURE_DEBOUNCE_MS=1500` are guesses.
- **First-run Agree screen** (legal, 09-24, L3042): not built.
- **Third-party notices + Electron license files in the package** (09-24, L3038/L3042): no THIRD_PARTY_NOTICES generator; `LICENSES.chromium.html` reported dropped.
- **Browser-server ZIP launchers (Mac/Win/Linux) + release assets** (09-23, L2990–2996): run-from-zip plan S3–S5 left (`ADS-memory/.local-artifacts/run-from-zip-plan-2026-09-23.md`); Download page still has a `ZIP_URL` placeholder.
- **Desktop hand checks** (09-12, L47–50): the 5 toolbar checks (arrows/URL layout, back/forward across admin↔site, Reload keeps history, Cmd+[ / Cmd+], History menu present + Help empty) and the restart click-through. Fold into the release hand-check gate below.

### Plugins
- **Agent Plugins page redesign** (owner-decided 09-14, L696–708/L958): one list, On/Off for every plugin; Tovu-shipped = "Built in", switch-off only; user-added get Uninstall + confirm; drop the Downloaded tab. Needs an uninstall HTTP route + `origin` in the list response; Jini `AgentPluginRow` still disables Uninstall.
- **Plugin hooks S2–S6** (09-23, L2984–2987): S1 catalog landed `068402eaf`; rest in `ADS-memory/.local-artifacts/handoffs/2026-09-23-hooks-lane.md`. Before the SDK 0.2.0 bump fix plugin ranges (`^0.1.0` excludes 0.2.0).
- **Plugin-published namespaced hooks** (owner YES 09-23, L2981): runtime publication on top of the typed catalog, after hooks S2–S6.

### Publish
- **Publish installed skills, site plugins and agent-plugin files** (09-24, L3093–3098): only the theme-files handler exists in the publish type registry.

### Persistence & CAS (web-medium `wm` plan: `ADS-memory/.local-artifacts/fix-plan-web-medium-2026-09-24.md`; owner ordered these run 09-24, L3256)
- ~~**wm S3 entries**~~ **DONE 2026-10-04 (Jini `50c63960` + Tovu entries commit, needs a cms release + Tovu adoption):** `EntryRepoPort.save(row, { expectedVersion })` is a compare-and-set inside the write's transaction on every adapter (SQLite, PGlite, real Postgres, memory); update/publish/unpublish/import-as-update pass it, a loss is `{ ok: false }`. Left: an import-as-create race (two creates of the same id) stays an unconditional upsert.

### Chat & admin
- ~~**Typed answers to a pending ask_choice, jl A1a/A1b**~~ **DONE 2026-10-04 (Jini `5b8d9d5e` + `a2dd279b`, needs a chat release + Tovu adoption; live look owed):** Enter while the agent holds a question card open posts the text as `__typedAnswer` to `assistant_ask_choice` (dock `deliverTypedAnswer`); delivered clears the draft; consumed/expired (409) or a failure keeps the draft with a notice and never queues it as a new run. Was (09-24, L3318): typing produces no request; on a consumed answer the client must DROP the text or it starts a second PAID run (L2243).
- ~~**Chat auto-scroll still sticks**~~ **DONE 2026-10-04 (Jini `8cb764ca`, needs a chat release + Tovu adoption; live look in the admin chat still owed):** a user send or retry re-sticks to the bottom. Was (09-15/09-21, L2054/L2670): Jini `de436905` (08-31) predates the complaints; lead: Jini `MessageList.tsx:116` re-sticks only when the user scrolls back to the bottom; sending a message never re-sticks (file unchanged since 09-01). (Composer draft + attachment persistence is done: Jini `8d4a0ca2`, `aebdfc59`.)
- **Posts editor ignores assistant edits / stale slug in address bar** (09-24, L3110, also L2099): no fix commit after the report.
- **Theme Explore: agent-added/removed files and remaining rename/URL cases** (09-16, L1361–1362/L2110): flash + dirty-buffer guard done (`4939448bb`); external file mutations not.
- **Deep admin translation sweep** (09-22, L2726–2745): many fixes landed (latest `f07a92dcb`); no whole-admin literal/call-site closure.
- **3b-handoff small follow-ups** (09-14, L1323–1327): footer GET repeats, widget-paste visuals, remaining review comments.
- **Approval card: record hints at enable time** (09-28, L3686): not built. Needs a hints baseline per site + connection + tool in content.db (new table + migration, written when the tool is enabled in Settings → External MCP) and a Jini `@jini-ai/mcp/federation` check that asks again when a first call's hints differ from it. ~~Expiry countdown~~ (L3626) DONE 10-04 (EW4, Jini `d98c0b7e`): every confirm card counts down "Expires in m:ss" and closes as "This question expired" when the deadline passes.
- **Claude reply leaks an interim line** (found 2026-10-06, conversation `fdfde658`, low priority): "Need to confirm the family via search." showed above the real answer. Evidence: `ADS-memory/.local-artifacts/uninstall-dup-investigate/notes.md`.

### Media
- **Sound-on pill on the home promo video** (09-26, L3497): owner: for THIS video only, no global rule; owner killed the writer before it landed.

### DB
- **Retire the remaining Drizzle tooling after parity** (09-28, L3625/L3693): `package.json` still depends on drizzle-orm/drizzle-kit; `build:server` copies `platform/db/drizzle`.
- **Real-Postgres concurrency tests (Q1) + post-extraction DB tests C1–C3** (09-28, L3603–3604/L3712): no aggregate lock/race acceptance.

### Testing & release (post-extraction TRACKER, 10-02, L3714–3718)
- **Step-3 unit-test repair, one package at a time** (44 briefs in `codex-new/post-queue`): many suites fixed; no final completion report.
- **19 fix checks + 8 security reviews**, after all code changes stop (review LAST).
- **GATE: hand-check desktop app + web (site + admin)** before release.
- **Step-6 coverage for all 44 briefs**: batches A/B done; the rest queued.
- **Make the Supabase live SQL journey repeatable** (chat → card → SQL, 09-27, L3544): passed manually once.
- **Live Supabase acceptance: DCR, AC-13, ARIA (SPEC-052)** (09-14, L1322/L1344/L3526): needs a real-account run.
- **BYOK: switching providers back keeps each provider's saved key** (09-14, L1330–1333): needs a live Anthropic + OpenAI switching proof.

### Security
- **Regenerate a leaked site key from the UI** (09-12, L88): must re-encrypt every sealed credential; an env-set key cannot change from the UI. Recovery routes exist (`82444fec4`), no regenerate flow.
- **Legal: controller name + desktop AI report link** (09-24, L3042/L3303): the rest landed 10-04 (`a0336c0dc`, see Done below). Still open: the pages say `[[OWNER NAME]]` where the owner's name goes, and the desktop Help menu has no "Report AI content" link (owner-declined for now, 10-04). Form-IP cleanup (`2a41f672e`) stays off until a `@jini-ai/cms-forms` release with `sweepExpiredSubmissionIps` is installed.

### Owner-only actions and calls
- **Codex GitHub app can see the 4 AINSEP repos?** (10-02, L3727): external app permission, check in GitHub.
- **Dispose of stale release-build clones and scratch artifacts** (09-14/09-21, L1446/L1468/L2622).

### Still unsure (could not be settled from code/git)
- **Three more demo videos + "See it in action" carousel** (09-27, L3505): home DB has a carousel with two video slugs; a DB-only change has no commit to check.
- **Landing gold hovers / lede / FOUC changes on production** (09-28, L3698–3700): local page v74/v75 exists; needs a look at tovu.dev.
- **Old admin plan leftovers** (09-21, L2610–2614: misc A1/A2/F6/F7/D1, component D2, content C, platform 2/5/6, tooling B4–6): no mapping from those plan IDs to current code; needs a re-audit, not a lookup.
- **Publish UI/source/CSS feature-slice colocation cleanup** (09-19, L2374–2376/L2439): the feature moved; the original acceptance was never written down.

### Parked by owner
- **Global desktop chat bar + SPEC-051 prerequisites** (L103–112/L3244): "NEXT VERSION". Direction: one global conversation with active-site tools.
- **Separate persistent admin/site guests with shared history** (09-14, L1191): owner stopped it; not restarted.
- **Public collection-entry pages G1–G4** (09-23, L2819/L2953): owner disabled the wave; collection displays already shipped.
- **Unified searchable plugin/webhook event list** (L83/L1910/L3178): build later.
- **Microsoft Store** (09-23, L2983): paused until LLC + DUNS + domain email; Store prep is done.
- **Jev model routing in the assistant** (09-21, L2570/L2591): "Later / back of mind".
- **Compound Deploy + Publish tool** (L2279/L3236): parked; separate Deploy and Publish ship.
- **Secrets sync channel for publish** (09-24, L3228): parked; publish excludes credentials by design.
- **Exhaustive "everything under sites/" publish gap audit** (09-24, L3234): parked.
- **Sandbox non-Claude local CLIs from reading the key** (09-24, L2117/L3242): "just do the MVP"; historical CLI sandbox plan (2026-09-24).
- **Purge/reseed the removed sample users** (09-24, L3155): jordan/alex stay in Trash; seed regeneration parked.
- **Newsletter backlog (wm S6/S7, jl C4a)** (09-24, L3312): no newsletter work at all.
- **Public MCP member sign-in `/auth/magic`** (09-28, L3585): HOLD.
- **Move the outbox to its own Jini package** (10-02, L3721): ON HOLD; stays in `@jini-ai/infra` until more event code exists.
- **Test gaps for the later combined batch** (09-30, L500–507): D-03 listener `[resetKey]` dependency mutant; real overflow measurement/ResizeObserver in a browser; SiteGrid delete-confirmation (`isCardOpenable(project, true)` never tested).
- Already tracked elsewhere in this file, not repeated: admin motifs, admin buffet, EmDash gaps, workerd, public site search bar, Observability instrumentation (monitoring Later), raw-HTML forms/menus/widgets.

### Done 2026-10-04

---

## Jini "visibility" package: SEO + AEO + GEO + visitor analytics (owner idea, 2026-10-04; after the 10-04 queue)
- Move Tovu's generic SEO code (`apps/website/src/features/seo`, sitemap/robots/`/llms.txt` routing) into Jini as one package, e.g. `@jini-ai/visibility`, with separate entry points `/seo` (SEO, AEO, GEO) and `/analytics` (today's `@jini-ai/analytics`, ~960 lines, retired into it). Tovu keeps thin adapters.
- Separate entry points so an app can take one half without the other (analytics writes visitor data at runtime; SEO/AEO/GEO mostly renders output).
- Analytics' `rootKeySeed` argument is the separate `ANALYTICS_ROOT_KEY_SEED` secret, not the site key — rename it to `analyticsSeed` as part of this move; until then `check-site-key-names.sh` tags its 2 Tovu lines as legacy.

## Raw-HTML embed mode for forms, menus and categories/tags (owner idea, 2026-10-03; NOT now, after the admin media swap is committed)

**PARTLY DONE 10-04** (`5e9f338f6`, `c6d54038e`, `7ab1eadef`): `form` type + `mode:"html"`, menu and taxonomy HTML mode, Copy HTML embed. Left: renderers still in Tovu (`features/forms/html-render.ts`, `features/navigation/html-render.ts`), not Jini; optional client inline-validation script not built.

**Goal.** Site builders get plain, semantic, unstyled HTML that they style however they want.

**Build it on the existing `data-embed-config` marker spine** (`apps/website/src/contracts/core/embeds/marker.ts`, resolved by `features/widgets/html-embeds.ts`). Add a render mode instead of a new mechanism, e.g.
`<div data-embed-config='{"type":"form","id":"contact","mode":"html"}'></div>`.

- **Verified at HEAD, 2026-10-03:** today it IS widget-only.
  - `type:"form"` was removed on 2026-08-10.
  - The theme validator (`features/theme/validation/markup.ts` `KNOWN_EMBED_TYPES`) rejects it with "embed a contact-form widget instead".
  - No resolver handles `"form"`.

**Output requirements:** stable `data-*` hooks only, with no theme classes or inline styles. Forms work as plain POST without JavaScript; an optional small script adds inline validation and messages. Spam protection: honeypot plus rate limit.

**Generic in Jini:** the HTML renderers belong in Jini's domain packages (framework-free), so any product gets them.

---

## Assistant permissions: maybe gate the AI agent separately LATER (owner call, 2026-10-03; NOT now)

**Today, and kept deliberately:** the assistant acts with the full authority of the logged-in person. Every native mutating tool calls `authorize()` against that person. API-key runs also run fully. The owner said limiting anyone now is "unnecessary and just preemptive".

**Possible later work** (option 3, spec 006 OQ-01): the assistant becomes its own `kind='agent'` principal delegated from the human, with effective permissions = agent grants ∩ the human's live grants, enforced in one branch of `authorize()`, plus an optional default-limits profile. The full design and a 12-job plan are in `ADS-memory/.local-artifacts/handoffs/2026-10-03-agent-permissions-audit.md`.

**Audit findings parked with it** (decide when this is picked up):
- local CLI agents in daemon mode run with auto-approve flags, so their own shell/file tools bypass `authorize()` (non-production)
- `/api/runs` needs only an admin session, not `admin.assistant.use`
- the federated MCP "may write" list is computed but not enforced
- AI browser clicks are indistinguishable from the human's

---

## Admin motifs: swap the whole admin look with one theme (owner call, 2026-10-02; NOT before the Tovu→Jini re-architecture lands)


## Entries envelope owner is a per-caller parameter, not a property of the content type (found 2026-09-19)


---

## Plugin install (local folder / zip) — plan ready, first milestone scoped (owner call, 2026-09-22)

**DONE 10-04** — `fb6189fa6` (folder, CLI + admin dialog), `2e42797c1` (.zip). D1/D3 stay deferred.

**Plan saved:** `ADS-memory/.local-artifacts/terra-runs/sol/plugin-install-plan.md` (Opus 5.5,
2026-09-22). Owner deferred to the plan's recommended defaults:
- **D3** — URL install deferred (SSRF risk + unverifiable publisher).
- **D5** — dev-link installs stay env-gated, with integrity checks kept.

---

## Jini publishes owed — committed but not released (found 2026-09-22)


---


## 🔜 SOON — make the MCP Server real, starting with the desktop app (owner call, 2026-09-19)

**Owner directive:** get MCP working. Scoped **Soon**, and **desktop app first**.

**Current state: the "MCP Server" tab is a demo stub on every install — local, desktop, and
production alike.** Found 2026-09-19 while answering the owner's question "should we hide the MCP
server on production?". Verified:

- `apps/admin/src/features/providers/Providers.tsx:311` renders
  `<IntegrationsTab serverName="tovu" agentHandle="settings-mcp-server" />` with **no `port` prop**, so
  it falls back to `createFakeMcpIntegrationsPort()` (Jini `packages/ui/src/features/integrations/dependencies.ts:11-19`).
  That fake returns the literal placeholder `{command: "node", args: ["/path/to/cli.js", "mcp"]}` —
  byte-for-byte the install command the admin shows today. The comment above the render call says so
  outright: wiring a real `McpIntegrationsPort` to Tovu's daemon "remains its own piece of work."
- Every snippet builder in the integrations `rules.ts` (`buildClaudeCliSnippet`, `buildCodexTomlSnippet`,
  `buildVsCodeSnippet`, …) emits **stdio subprocess config only** (`command`/`args`/`env` — spawn a local
  process by absolute path). There is **no HTTP/SSE MCP transport** in that package.
  (`apps/website/src/features/mcp-federation/adapter.http.ts` is the OUTBOUND External MCP client — unrelated.)

**Why desktop first is the right scope (not an arbitrary preference).** The mechanism is inherently
local-machine: an MCP client spawns `node <path> mcp` on the machine it is running on. That works when
the client and the Tovu install share a filesystem — the desktop app, or local dev. It can never work
against a Fly-hosted production instance as built. So desktop is not merely the easiest target, it is
the only one this transport can serve.

**Work, cheapest correct order:**
1. Wire a real `McpIntegrationsPort` to Tovu's daemon and thread it into `Providers.tsx` so the tab
   reports the actual server, binary path, and status instead of the fake.
2. Emit a **real** install command — the resolved CLI path for this install, not `/path/to/cli.js`.
   Until this lands, the tab hands users a copy-pasteable command that looks real and does nothing.
3. Decide production's behavior. A `runtimeMode` (`"production" | "local"`) signal already exists
   server-side (`apps/website/src/contracts/core/runtime-mode.ts:23`, from `TOVU_RUNTIME_MODE`, defaulting
   safely to `"local"`) and already reaches two admin screens:
   `apps/admin/src/features/security/SiteKeyTab.tsx:104` and
   `apps/admin/src/features/deployment/OverviewTab.tsx:213` (+ `rules.ts:641` `runtimeModeLabelKey`).
   Deployment Overview's `AdminDeploymentOverview.mode` is the natural source to reuse — it needs a
   lighter permission than managing the site key. Gate the tab on that, or replace it with an honest
   "not available on hosted production" notice.

**Do not confuse with the External MCP tab** (`ExternalMcpSettingsPanel.tsx`), which is correctly
ungated: it is about this site connecting OUT to third-party MCP servers, which behaves the same
whether Tovu is local or hosted.

**2026-09-22: verified still open.** `apps/admin/src/features/providers/Providers.tsx` ~:323 still
falls back to `createFakeMcpIntegrationsPort()`; no real `McpIntegrationsPort` exists anywhere in
Tovu source. Next step: an Opus plan (not written yet).

---


## WebMCP: let Chrome's agent operate the admin and the published site (owner call, 2026-09-17)

**PARTLY DONE 10-04** — admin `page.*` tools + Settings > Privacy opt-out (`3be477f86`); published-site script, form `tool*` attributes, theme validator (`98ccfc6e0`). Left: real-Chrome acceptance, a post-save tagging pass, the `data-agent-*` migration (parked).

**Goal.** If a user asks a browser agent (Chrome's, or any WebMCP client), it can talk to and
operate both the admin and the front end.

**Direction: lean toward WebMCP's `tool*` paradigm, but do NOT migrate `data-agent-*` now.**
Keep `data-agent-*` as the working convention and add a WebMCP layer on top. Revisit the migration
as the spec evolves. Why not now, verified 2026-09-17:
- WebMCP's declarative attributes cover **forms only**: `toolname`, `tooldescription`,
  `toolautosubmit` on `<form>`, and `toolparamdescription` / `toolparamtitle` on its controls.
  There is also `SubmitEvent.agentInvoked` / `respondWith()`, the `toolactivated` /
  `toolcanceled` events, and `:tool-form-active` / `:tool-submit-active`. Nothing covers buttons,
  tabs, links, or status text. `data-agent-element` has ~140 admin uses and most are not form
  fields.
- Chrome ships it only as an origin trial (149–156), and Edge only behind a flag. Firefox and Safari
  have made no commitment. The API already moved once (`navigator.modelContext` →
  `document.modelContext`, 2026-07-21).
- Sources: `webmachinelearning/webmcp` `declarative-api-explainer.md`;
  developer.chrome.com/docs/ai/webmcp/declarative-api.
- An earlier agent wrongly told the owner WebMCP had no such attributes, which is why
  `data-agent-*` exists. See `ADS-memory/knowledge/mistakes/2026-09-17-told-owner-webmcp-has-no-declarative-attributes.md`.

**Pieces that already exist (Jini):**
- `packages/chat/src/react/features/chat-pane/hooks/useChatPaneAgentControl.hooks.ts` has a
  `webmcp?: boolean` switch. It registers the chat pane's own actions (send message, draft, …) with
  `document.modelContext`. Tovu's `AssistantDock.tsx` leaves it OFF on purpose. Turned on, Chrome's
  agent can ask Tovu's assistant, which then acts through the normal ToolExecutor gate.
- `packages/agentic/src/core/webmcp.ts` has `toWebMcpTool`, which turns any `CapabilityDef` into a
  WebMCP registration: `readOnlyHint` comes from `risk`, and a fail-closed confirmation gate
  refuses to run a `requiresConfirmation` capability unless a confirmation handler is supplied.
  It is **not wired** to the `page.*` capabilities (navigate / find_elements / act on
  `data-agent-element` handles).
- `packages/agentic/src/core/dom/model-context.ts` has `getAgentModelContext()` (feature
  detection).

**Tasks:**
- [x] **Admin prototype first.** (`3be477f86`; real-Chrome test still owed) Turn on the chat-pane `webmcp` switch, and register the `page.*`
      tools through `toWebMcpTool`, requiring confirmation for writes. Test in real Chrome (trial
      token or flag).
- [ ] **The admin agent tags the HTML pages it creates.** **PARTLY:** prompt guidance only (`3be477f86`), no post-save pass. When the assistant builds or edits a
      page (page editor: "Ask the assistant to build this page"), the output carries agent tags:
      WebMCP attributes on forms, the site's agent-handle attribute on other actionable
      elements. Decide whether that is prompt/tool guidance, a post-save pass, or both.
- [ ] **Later: migrate `data-agent-*` → WebMCP `tool*`** once the spec covers non-form elements
      and leaves the origin trial.

**OWNER DECISION 2026-09-22: WebMCP ON BY DEFAULT (with an opt-out).** Resolves the open default
question above ("off until enabled (recommended) vs on by default"). Verified still fully
unstarted: the `AssistantDock` webmcp switch is off, and the theme validator still uses
`data-tovu-agent`. Next: an Opus plan (not written yet).

---

## Media `createdBy` / provenance field — deferred, needs a schema change (owner call, 2026-09-11)

**DONE 10-04** — `c321cd0ca` (actor column, every create path, edit-dialog label); adapter dropped `9b2923fee`. Not built: producer/model column, grid filter by creator.

**Decision: not now.** Wanted, but it needs a migration and the owner deliberately parked it.

**What's missing:** the `media` table has NO provenance field. Columns today are `id`,
`workspace_id`, `title`, `alt`, `caption`, `credit`, `source_sha256`, `status`, `created_at`,
`updated_at`, `version`, `width`, `height`, `css_class`, `slug`, `html_attributes`. Nothing records
who or what created an asset.

**Why `credit` is not the answer.** Both Higgsfield-generated rows currently read
`credit = "Generated with Higgsfield (z_image)"`, which looks like provenance but is not:

- it is free text the *agent chose to write* — nothing guarantees the next tool writes anything;
- it is an editorial display field a human can edit at any time;
- it is unstructured, so it cannot be sorted, filtered, or grouped on.

Reading provenance out of it would be inferring a fact from a field that does not promise it.

**The issues to settle before building:**

5. **Only then is it a UI dimension.** Filtering or grouping the Media grid by creator depends on
   the column being reliably populated. Not before.

**Related, already shipped 2026-09-11:** media list ordering (`SqliteMediaRepo.list()` now orders
newest-first — nothing ordered it before), and an admin "Order by" control (created / alphabetical).
Neither depends on this field.

## ⭐ HIGH PRIORITY (not critical) — add assistant-ui ALONGSIDE Jini chat and run them side by side (owner call, 2026-09-11)

**Decision:** defer. Prototype and migrate the chat UI to
[assistant-ui](https://www.assistant-ui.com) at a later date. High priority, deliberately **not**
critical — nothing is blocked on it, and the defects that prompted the question are being fixed in
Tovu code instead (see the lifecycle-repair work below/adjacent).

**Do NOT adopt the Vercel AI SDK for the model/transport layer.** Two independent recon passes
(Sonnet 5, and GPT-5.6-Terra via codex, both with repo + web access) converged on this. AI SDK's
core abstraction is a single model-endpoint generate/stream call; Tovu's agent-runtime spawns a
**local CLI that owns its own tool loop, skills and sub-agents** across 24 adapters
(`Jini/packages/agent-runtime/src/registry.ts:48-71`). Adopting it means either black-boxing each
CLI run as one opaque turn or hand-writing a proxy provider per CLI — rewriting what already exists.
AI SDK is worth revisiting only as a *separate* direct-provider (BYOK/hosted) mode, never as a
replacement for the daemon.

**Owner directive (explicit, 2026-09-11): ADD assistant-ui, do NOT delete the Jini chat we have
now. Run both side by side and compare.** This is an additive experiment, not a migration. Nothing
under `@jini-ai/chat` or `apps/admin/src/components/AssistantDock` gets removed until a side-by-side
comparison on real usage says the replacement is actually better. Treat any plan that opens with
"retire the old chat" as out of scope.

**assistant-ui is separable and low-risk**, because it does not require AI SDK: its
`ExternalStoreRuntime` / custom `ChatModelAdapter` can wire onto Tovu's existing SSE stream — which
is also exactly what makes running both at once cheap. Both surfaces read the same daemon, the same
SSE stream and the same `chat.db`; only the React tree differs. Put the new one behind a flag or a
second route so either can be opened against the same conversation, and keep the Jini daemon, agent
runtime and agentic bridge untouched under both.

For scale, the surface being compared against is roughly 19k lines (`@jini-ai/chat` +
`apps/admin/src/components/AssistantDock`). That number is what a *future* retirement would remove —
it is not a goal of this task.

**Known cost when we pick this up:** ~3–6 engineer-weeks for the UI swap retaining Jini execution,
attachments, conversation history, MCP forms and A2UI. Licensing is clear (assistant-ui MIT,
AI SDK Apache-2.0). Dependency weight is non-trivial (Radix, Zustand, Zod, its runtime/store/tap);
exact bundle impact is **unverified** without a locked proof-of-concept build.

**The one gotcha, and the recon passes disagreed about it** — trust the more specific reading:
assistant-ui ships a native MCP Apps renderer for `ui://` resources, but it expects MCP metadata on
a **tool-call part** and fetches the resource through a host route, whereas Jini emits an inline
`mcp-ui` event (`apps/admin/src/components/AssistantDock/AssistantDock.tsx:63`). Our `ui://` HTML and
the authenticated redemption endpoint survive; the transport between them does not. Budget a
translation/resource-host layer — it is not a drop-in.

**Reports (read both before starting):**
`ADS-memory/reports/2026-09-11-chat-stack-recon-sonnet.md`,
`ADS-memory/reports/2026-09-11-chat-stack-recon-codex-terra.md`.

**2026-09-22: parked for a while — don't pick up.**


## Desktop shell: one window, project tabs — match Tovu Runner (owner directive, 2026-09-06)

**DONE** — `204e01a7b`, `9e77a7784`. Pop-out deferred by owner.

**DONE 2026-09-22: `204e01a7b`, `9e77a7784`; `apps/desktop/src/renderer/App.tsx` has `TabStrip` and
`SiteWorkspace` (not the stale `ProjectWorkspace` name).** Projects open as a tab in one window, not a new `BrowserWindow`.

**READ THIS BEFORE "FIXING" IT BACK.** This deliberately REVERSES `868cfe72`, a same-day ruling from
13:43 on 2026-09-06 that had switched to a `BrowserWindow` per project. The port manifest and
surrounding notes from that earlier ruling still describe the per-window design, so a reader who
finds them without this paragraph will conclude the tab work was a regression and revert it. It was
not: the owner's directive quoted above is later and supersedes it.

Related follow-on work landed the same night, also on the projects surface: `b2a46c7e` (removals are
recorded, so the seed guard can ask about the DIRECTORY rather than about the file's existence),
`65b8fd74` (boot scan, so a site made outside the shell appears), `c201d948` (a Rescan control),
`f02ac28e` (a failed rescan no longer blanks the grid). Note the boot scan does NOT follow Tovu
Runner: Runner has no scan at all — `instancesRoot` is only ever created into and bounded for
deletion, and `reconcile()` repairs the status of rows it already has. There was no scheme to port,
so the scan uses the two conventions this shell actually has (`<repoRoot>/sites` and the
recently-opened list).

**Still open from this entry:** L118's 🎯 DIRECTION item — one operator chat spanning fleet + site —
is directly adjacent and worth re-reading now that the shell has tabs again.

**Owner's words:** "when we start a site or a project, we create a new tab, but we don't pop the site
out into a new window. It just stays in the window… This is the same setup I want for Tovu… let's
just have it all in one window first."

**Reference implementation is Tovu Runner** (`/Users/la/Programming/Tovu-Runner`, separate checkout,
separate app, its own `userData` and a SQLite `runner_projects` registry — nothing is shared). She
supplied screenshots of Runner as the target. Read Runner's source and follow its structure rather
than inventing one; never edit that checkout.

Target, as seen in Runner:

**Explicitly deferred:** a "pop out into its own window" button. Her words: "maybe we can have a
button to say pop out into its own window, but let's just have it all in one window first." Do not
build it; note it if the architecture makes it cheap.

Starting points: `apps/desktop/src/project-ipc.cjs` (`handleList`/`handleCreate`),
`project-registry.cjs` (the `desktop-projects.json` rows), `tovu-server.cjs` (how a site's server is
spawned), `runner-ipc-stubs.cjs` (may already anticipate this), and `apps/desktop/src/renderer/`.
Prefer `WebContentsView` over the deprecated `BrowserView` unless Runner justifies otherwise.

Traps: a green `tsc` says nothing about `.cjs`, and most of this shell is `.cjs`. Electron's
`userData` ignores a `HOME` override on macOS — isolate with `--user-data-dir`. Drive/screenshot
Electron via Playwright's `_electron` with an explicit `executablePath`.

Related, same package: the e2e suite writes into the **real** `userData`, which is what left the
Projects grid empty (see the desktop-registry notes) — being fixed separately.

---

## Missing tool: import a remote image URL into the media library (found live, 2026-09-06)

**DONE** — `features/media-import/` (`media_import_from_url`); admin URL import `d309da0fe`.

**DONE 2026-09-22: `apps/website/src/features/media-import/{agent-tools.ts,fetch-image.ts,tool-registrations.ts}`, wired in `server/runtime/composition/{app.ts,deps.ts}`.** `media_import_from_url` is shipped.
Takes an https URL plus optional `filename`/`alt`/`caption`/`credit`, fetches server-side, and writes
through the SAME `uploadMedia` a human upload uses — an imported asset is indistinguishable from an
uploaded or generated one.

Proven live, not just unit-tested: asked in operator language with no tool name, the assistant issued
its own `search_tools` query, ranked `media_import_from_url` #1 (31.2, above `media_upload_asset`),
and imported a real PNG. The stored blob is byte-identical to the source (224,566 bytes, sha
`c4e870d3…`); the public rendition returns 200 and renders.

The fetch routes through `platform/http`'s SSRF-guarded `HttpClientPort`, which required making
`HttpResponse` byte-capable — `bodyText` is a lossy UTF-8 decode and would have corrupted every
image. `bodyBytes`/`bodyTruncated` were added additively, and a truncated response is REFUSED rather
than stored, because a clipped image is a corrupt file that would still hash and still write a row.
Refusals verified live against link-local, loopback-via-DNS, private and IPv4-mapped targets, with
nothing persisted. Content type comes from magic-byte sniffing, never the served header.

**Still open from this entry:** `media_provider_credentials` is empty. Credentials resolve saved-row
first, then env — and this machine has `GEMINI_API_KEY` but no `OPENAI_API_KEY`, so the default
`gpt-image-2` fails while `gemini-3.1-flash-image-preview` may already work with no purchase. One
prompt in the chat dock settles it; nobody has run that test.

Higgsfield's `generate_image` produced a real 2048×1152 PNG on its CDN, and **nothing in the tool
catalog could pull it into Media**. The assistant's own account: `media_upload_asset` needs base64
bytes, `media_promote_chat_attachment` needs a chat attachment, and **there is no import-by-URL
tool**. The only offered workarounds were "download it and re-attach it to the chat" or "re-generate
with `media_generate_asset` (gpt-image-2)" — a second image, and it costs money.

This is the exact motivating case `apps/website/src/assistant/demo-image-tool.ts`'s header describes
as the owner's own: an external MCP server generating an image, then saving it to media. The
generation half works; the save half has no path.

Also blocking the `media_generate_asset` alternative: **`media_provider_credentials` is empty** — no
image provider is configured at all, so that tool has nothing to call.

---

## Admin SSE connection-pool exhaustion — C1 is ON; one anomaly still unexplained

Dev HTTP/2 (ADR C1) is **enabled**: `.certs/localhost.pem` + `localhost-key.pem` exist at the repo
root and `.certs.disabled/` does not, so `apps/admin/vite.config.ts:67-73` serves admin dev over
HTTPS/2 (the API's `server/runtime/boot/dev-tls.ts` reads the same pair). **Still open:** the
2026-08-18 ADR's own unresolved anomaly — 14 established `:5173` connections against a claimed 3
tabs. See `ADS-memory/reports/2026-09-03-admin-sse-connection-exhaustion.md`.

---

## 🎯 DIRECTION, owner call 2026-08-29 — one operator chat spanning fleet + site

Merge Runner's fleet chat and Tovu's admin assistant into one chat instead of disabling one of them.
The open questions this entry used to carry (scoping/authority, direction of trust, the fate of
Runner's own chat, per-site vs per-fleet daemon) are now settled in two ADRs:
- **ADR-060** (`runner-unified-operator-chat`) — Runner-side unified chat; every verb stays
  `runner.*`, Tovu tool definitions are never registered into Runner's allowlist.
  **PROPOSED — owner sign-off required before any implementation.**

**Caution:** size this from the **call sites**, not from file sizes — an inflated estimate on this
repo already manufactured an unnecessary redesign once.

---

## Third-party embeds (Calendly-class): capability gaps (owner call, 2026-09-21)

Owner: *"we should have the ability to have widgets like Calendly."* This means the platform gap, NOT a Calendly
feature. Don't build a vendor-specific widget. Verified 2026-09-21 by a read-only recon, with file:line spot-checked:

- **Works today:** paste a vendor's embed snippet into an html-format Page in the admin HTML editor. Page HTML is stored
  unsanitized by design (`server/inbound/admin-http/routes/pages/update-html.ts:127-133`, `pages.edit_html` = admin and owner
  only), and public pages send no CSP.
- **Gap 1: no widget can hold a third-party embed.** `WidgetTypeKey` is a closed union of 5
  (`features/widgets/types.ts:63`). `text` escapes its body, and no kind emits a script or iframe. Needed: ONE generic
  embed widget type (a vendor snippet or URL, rendered through a host allowlist the way the YouTube node is at
  `features/widgets/resolver-service.ts` / `features/theme/static-render.ts`), not one type per vendor.
- **Gap 2: plugins can't add widget types or renderers.** Resolvers and renderers are closed maps
  (`features/widgets/resolvers/index.ts:56`, `render.ts:2485`, `resolver-service.ts:1074`). The only plugin-runtime hook
  is `content.entry.beforeSave`, and `features/widgets/registry.ts:5-12` defers plugin widget types to ADR-024 Tier-2/3.
- **Gap 3: the assistant won't place vendor embeds.** Its page-writing instructions ban `<script src>`
  (`features/pages/agent-tools.ts:61`), so "add my Calendly" fails in chat even though pasting works.
- **If a public CSP is ever added,** it must allowlist each embed host (for Calendly: `assets.calendly.com` in
  script-src and `calendly.com` in frame-src).
- **Vendor side, for later:** Calendly runs an official hosted MCP at `https://mcp.calendly.com` (OAuth 2.1 + PKCE +
  dynamic client registration; scopes `mcp:scheduling:read`/`write`; https://developer.calendly.com/calendly-mcp-server).
  A Calendly agent plugin would likely be just an `mcp.json` entry with `tovuAuthMode: "oauth"` plus a skill, like
  `content/agent-plugins/supabase` (unverified; their docs don't state the transport, and Tovu supports streamable-http
  only).
- **Side findings, unfixed:**
  - ~~Page-editor preview iframes had no `sandbox`.~~ DONE 10-04: both carry `PAGE_PREVIEW_IFRAME_SANDBOX`
    (`apps/admin/src/features/pages/rules.ts`: `allow-scripts allow-same-origin allow-forms allow-popups`, no top navigation);
    `update-html.ts`'s false "opaque-origin srcdoc" claim corrected. Still open (owner decision): the template-preview branch is
    same-origin with the admin, so with `allow-same-origin` its script still runs with the admin origin. Dropping that flag isolates it
    but loses preview scroll memory and theme fonts/module scripts (CORS). ~~`PostEditor.tsx`'s preview iframes are not sandboxed either.~~
    DONE 10-04: all three `PostPreviewFrame` iframes import the same `PAGE_PREVIEW_IFRAME_SANDBOX`.

**2026-09-22: owner confirms this is definitely wanted, scheduled for later.** Verified no migration
is needed — the widget/field/menu types involved are app-code unions, not DB schema, and their data
is stored as JSON-in-text columns.

## Raw-HTML authoring for forms, menus, widgets — way + admin UI (owner call, 2026-09-21)

**PARTLY 10-04** — forms authoring + one config shape (`5e9f338f6`). Menus get an HTML output mode only (`c6d54038e`); widgets have no raw kind; authored inner children still dropped (`contracts/core/embeds/marker.ts` `withInnerContentFinal`).

Owner: *"do we have in the todo to have a way and the ui to build raw html forms, menus, widgets, etc? i dont wanna
do it now so having a todo for it is best."* Verified 2026-09-21 by a read-only recon, file:line spot-checked. This is
about authoring your OWN markup for these three block types — the "Third-party embeds" section above (Calendly-class)
is about embedding someone else's vendor snippet; related but a different gap.

- **Works today:** raw HTML authoring exists for exactly one type — html-format Pages, via the admin HTML editor
  (`server/inbound/admin-http/routes/pages/update-html.ts:127-133`, `pages.edit_html`, admin/owner only, stored
  unsanitized by design).
- **Same trust question as Pages:** any raw-HTML surface here would be admin/owner-only and unsanitized by design,
  same posture as `update-html.ts` today — not a new security decision, just inheriting the existing one.
- **Not now — owner deferred 2026-09-21.**

**Follow-up asks, same day, still deferred:**
- **Preserve authored inner children** (`<div data-embed-config='...'><p>text</p></div>` — owner expected the `<p>`
  inside the rendered output). Today it doesn't: `withInnerContentFinal` (`marker.ts:344-347`) rebuilds
  `<tag attrs-minus-marker>{resolved}</tag>`, discarding the authored inner; it currently survives only as the
  fallback when resolution returns `undefined` (`substituteMarkers`, `marker.ts:358-361`). Wrapper handling varies
  per type: `post`/`content` keep their wrapper (`WRAPPER_PRESERVING_EMBED_TYPES`, `html-embeds.ts:338`), `media`
  has its own branch, `widget` only when the author attributed it (`withElementKeptIfAttributed`, `marker.ts:496`),
  menus via `static-render.ts`'s `withInnerContent`; a bare widget marker still whole-element replaces. Open:
  where authored children go relative to resolved output; how that interacts with the fallback-on-missing reuse
  of the same children; the `<form>`-in-`<form>` / bare-`<li>`-needs-`<ul>` nesting hazards (`html-embeds.ts:322-336`).

**2026-09-22: owner confirms this is definitely wanted, scheduled for later.** Verified no migration
is needed — forms/menus/widgets are app-code unions, not DB schema, and their data is stored as
JSON-in-text columns.

## Open remainder — SPEC-005 (plugins) + SPEC-006 (identity/authorization) gates

Both went through the full formal pipeline; what is left is gates and later phases, not the original
2026-07-16 overnight-run ask (there is no informal output left to audit).
- **SPEC-006 identity/authorization**: spec sits at 0.7.0 with status reverted to DRAFT — an owner
  DRAFT→APPROVED checkpoint is owed, plus a Red-Team pass over the 0.6.0+0.7.0 material.
  ADR-PIPE-006 / ADR-048 (API-key issuance) is still **PROPOSED**, so the real `api_keys` plumbing is
  not cleared to build. `ADS-memory/reports/pipeline/006-identity-and-authorization/pipeline-state.md`.

---

## 🔧 SPEC-003 (CLI surface) — implementation-complete, Code Inspection still owed

`tovu init` / `tovu serve` / `tovu --help` is built and has been through a full TDD recertification
round. The coverage-gate question was **decided by the owner 2026-07-28**: TDD's real-arms evidence
was accepted, since the residual uncovered branches are esbuild/tsx CJS-interop scaffolding injected
into every transpiled module, not Tovu source. Two things remain:
- `/code-inspection` (Code Inspection + Security) has never run — the stage ledger in
  `ADS-memory/reports/pipeline/003-site-install-dir/pipeline-state.md` stops at Architecture
  Sign-Off, with no TestRunner, Programmer, or Code Inspection row.

---

## ⚠️ OWED — `/code-inspection` + `/audit-work` for SPEC-003 / 005 / 006

**Corrected 2026-09-06.** The original entry's premise ("all still uncommitted") is false — 318
commits landed between 2026-07-28 and 2026-08-05 — and a broad code+security review did run
(`ADS-memory/reports/audit/2026-08-02-03-sunday-monday-code-security-review.md`). What is still
genuinely missing is the **per-feature gate record**: none of the three `pipeline-state.md` ledgers
carries a Code Inspection or Security row. Green TestRunner/TDD is necessary, not sufficient.

---

## ⚠️ OWED — specs/ADRs/tests for the 2026-08-05 embeds work (built quick-and-dirty, deliberately)

Owner explicitly asked to skip spec/ADR-first process for this batch, so this is the promised
follow-up, not a surprise gap. Four pieces landed with no spec, no ADR, and only ad hoc coverage:
- **Posts can render widgets/menus/forms** (`571b11a`) — fixed `resolvePageWidgets` resolving its
  host page via the generic `entries` table when Posts live in a separate `posts` table. The product
  question was answered by building it, never formally decided: **should widget/menu/form embedding
  be in Posts at all**, or should "Pages compose, Posts stay prose" have been the answer?
- **Media per-asset width/height/cssClass** (same commit + Jini `72f3a110`) — new columns, migration
  `0027_bumpy_blockbuster.sql`, threaded into `render.ts`'s public `<img>` output. No ADR on where
  per-asset display-size metadata belongs (per-asset default vs. per-insertion override was punted).
- **Unified "Embed" control in the Post editor toolbar** (`8011bff`) — pure UI, no spec.

The generic `data-embed-type`/`data-embed-id` contract for Pages' `body_html` **is** implemented
(ADR-047 + SPEC-043 → `apps/website/src/features/widgets/` with `html-embeds.ts`; `data-widget-embed`
and `data-form-embed` return zero hits under `apps/website/src/features/post`) — do not re-derive it
as open. **But ADR-047 itself still reads "Debate cleared 2026-07-21 … owes `/audit-work` before
ACCEPTED"** (`ADR-INDEX.md:54`), so live code is running ahead of its ADR's acceptance gate.

**Still owed:** real unit + integration tests for the render-path fix and the media sizing, and one
spec covering "how do embeds work across Posts + Pages" as a single subject rather than two.

---

## Handed off from peer session `tovu-8f` — 2026-09-06 Fable review

> **Source: 2026-09-06 Fable code review, relayed by peer session `tovu-8f`. `file:line` given for
> every claim so it can be checked. NOT independently verified** by the 2026-09-06 todos
> reconciliation that filed it — treat each item as a lead with a pointer, not as established fact.
> Verify before acting.

### Review-coverage gap — the biggest item here

Three Fable reviewers (architecture/DI, excess-and-dead-code, bugs) ran twice: **2026-09-06** over
~97 commits (reports `4e64e467`, `b81d57b1`, `ffc37e59`) and **2026-09-04 → 09-05** over 521 commits
(`ee304d5e`, `ef79b352`, `552e806d`).

- [ ] **PARTLY** (2026-09-29 whole-codebase review `reports/2026-09-29-opus-review-p1…p6`, not checked against this list). Review what the reviewed windows deliberately skipped: ~200 `agentHandle` commits; ~100
      docs/content/design/landing commits; test-and-refactor-only commits; ~15 admin
      stale-settlement hook fixes; the desktop shell beyond three `.cjs` files; voice/speech; several
      UI screens; theme CSS/WCAG; SSRF fixes; deployment trims; dead-path/coverage scripts; evals.

### Confirmed defects, found and NOT fixed — admin

**DONE 2026-09-22:** button-in-anchor ×4 is fixed; `AccessTokensTab.tsx` stops propagation; push-to-talk uses
`cancelling`; the settlement-guard helper remains partial, with 3 files left: `use-static-publish`, `use-roles`,
`use-users` (checked 2026-09-22 and intentionally NOT migrated because their generation guards don't fit
`useSettlementGeneration()`'s contract: the generation is minted by a different call than the one that reads it).


### Confirmed defects, found and NOT fixed — website / architecture

- [x] **DONE 2026-10-04 (`87191c162`):** readiness list shared via `server/runtime/boot/site-boot-readiness.ts`. Was **PARTLY:** `d1eea4b2f` shared the helpers; the readiness `Promise.all` is still duplicated (`index.ts:428`, `serve.ts:483`). **Boot orchestration is hand-copied three times** between `serve.ts` and `index.ts`
      (`agentDaemonWanted`, `logCriticalBootFailures`, the 8-promise readiness list), under a comment
      claiming boot logic is "never shared via import" — contradicted the same day by `4dfbfe80`.
      `export.ts` has none of it yet still boots the real `createApp`, so **the
      crash-interrupted-migration scan never runs before an export.**
### Needs a human decision, not an agent — this one is MONEY


### Rescued from an otherwise-stale report

- [ ] **The attachment preview modal has never been seen rendering a decoded image in a browser.**
      This is item 2 of `ADS-memory/reports/2026-09-06-tovu-f6-outstanding-worklist.md` (`013ca04e`)
      and the only item there still open — items 3, 4, 5, 7, 8, 9, 10, 11, 12, 13 and 14 are closed
      and 15 is superseded, so do not work from the rest of that report.

### Unowned work


---

## Admin Section Spec Sweep — remaining work only (reconciled 2026-09-06)

The 2026-08-10 sweep covered 17 sections. **Nothing outstanding** in: Collections (ADR-043),
User management (ADR-021/SPEC-006 — hard delete is intentionally excluded by the disable-only
identity model), Comments (ADR-031 — the `soon` badge is a **deliberate** owner call documented at
`apps/admin/src/panels.tsx:435-440`, not stale copy), SEO (ADR-032), Redirects (ADR-033).

| Section | Status | What is still not done |
|---|---|---|
| Database / Storage | 🟡 | The `PENDING_MIGRATION` boot banner and the Tier-3 browser still have no route (`apps/admin/src/features/database/Database.tsx:40`). The drift banner IS built (`SchemaStateWarningBanner`, tested). |
| Categories & Tags | 🟡 | Reparent, deprecate, and term-slug controls. |
| Media | 🟡 | `accept` widened to video — DONE `c55da3e1c`. The Images/Videos tabs are real filters now (`rules.ts`'s `filterMediaByTab`). Remaining: this screen's own file-input `accept` still lists image types only while the server accepts `video/mp4`/`video/webm` — a pending **owner decision**, not an oversight (`Media.tsx:900-907`); plus origin-isolation, where-used protection, ingress, and GC behavior now owned by Jini. |
| Menus | ✅ | Drag-and-drop deferred (no `draggable`/dnd code under `apps/admin/src/features/menus/`); reorder controls exist. |
| Members | ✅ | Pagination and billing deferred. |
| Analytics | 🟡 | Aggregation, trends, breakdowns, goals, export. (The stale "sitting in memory" copy is already fixed — `Analytics.tsx:13-15`.) |
| Integrations / API | 🟡 | API-key issuance (ADR-048), outbound credentials, and rotation surfaces. |
| Backups / Recovery | 🟡 | Import/export, the interrupted-migration unblock route, and complete write-window counts. |
| Settings | 🟡 | **PARTLY:** 2 tabs stay greyed out ON PURPOSE (owner 2026-10-04: keep them visible so people know they're coming): **Privacy** (vendor-telemetry consent; Tovu sends no telemetry yet) and **Memory** (assistant remembers facts across chats; not built — chat history does persist). Build each later; until then don't hide or delete them (`SettingsUi.tsx` `settings-ui-inert-wrap`). |

**Evidence caveat:** panel/route existence was verified against source; tests were inventoried, not
executed. Several domains re-export their core implementation from `@jini-ai/cms` — those internals
need a separate cross-repo audit before claiming complete runtime behavior.

**Process note:** 16 of these 17 areas already have Accepted ADRs. Do not repeat the full
teardown → debate → audit → ADR → spec cycle for an implemented section; route only the remaining
slice through the appropriate gates. Newsletter needs an admin-UI-only spec check, not a new
backend ADR.

> **Still separately wanted:** an Accessibility ADR, and the coverage/parity ADR + matrix. The parity
> map lives only in `tovu-v2-design.md §3.5` plus the corpus `coverage-audit.md` files and is **NOT**
> reconciled into ADRs or specs. One matrix mapping each competitor subsystem →
> {v1 / bundled-plugin / deferred / dropped} with its owning ADR would give "are we implementing
> everything the others have?" one authoritative answer instead of four scattered documents.

### 2026-08-10 Commerce, Authentication, and Agent Plugins slice — still open

- [ ] Implement Commerce write paths and provider adapters. Stripe and PayPal remain planned labels
  only; checkout, billing, subscriptions, reconciliation, and revenue data are not wired
  (`payments`/`orders`/`products`/`subscriptions`/`billing` are all `soon: true` in `panels.tsx`).
- [ ] Implement the approved Jini `@jini-ai/capability-providers/visitor-auth` boundary, provider
  adapters, callback/state/PKCE lifecycle, Tovu sealed stores, identity linking, and local session
  issuance. The admin fields are disabled previews and do not persist or enable OAuth
  (`authentication` is `soon: true`).
- [ ] Wire the Agent Plugin Marketplace backend and installation flow. The tab performs no fetch and
  shows no fake inventory (`plugins-marketplace` is `soon: true` + `Placeholder`).

**Closed since 2026-08-10 — verified 2026-09-06, do not re-open:**
- The Agent Plugin **loader/installer + validation + trust review** is built:
  `apps/website/src/features/agent-plugins/{install,install-from-url,capability-projection,tool-registrations}.ts`,
  with adversarially-hardened extraction (zip-slip lexical check, outright symlink refusal,
  decompression-bomb bounds). **Sandboxing/execution boundaries are a deliberate v1 non-goal** —
  Skills are markdown read for context injection, MCP servers are preview-only, and Tovu executes no
  plugin code at all. `install.ts`'s header still describes the MCP admission gate as future work.
- The **daemon attachment contract is no longer `image/*`-only**: `attachmentAccept` was removed on
  purpose and `agent-daemon-server.ts`'s non-image filter is gone, so the upload path is kind-agnostic
  end to end (`AssistantDock.tsx:567-584`). The residual is cosmetic Jini-side naming (`imagePaths`).
- createToolCatalogComposerCapabilitySource (features/plugins/tool-catalog-composer-source.ts) was deleted 2026-10-03: unused; see development/DELETED-CODE.md. The bounded source catalog item is moot: it was deliberately unwired by owner decision 2026-08-21.

---

## Active Working Items (merged from `TODO.md`, 2026-07-09)

> These were the standalone `TODO.md` (now folded here so there is one backlog). They are near-term
> bugs + build tasks, distinct from the Admin Section Spec Sweep above and finer-grained than the
> Master Build Inventory (§8 Theme System / §9 Plugin System overlap — de-dupe later if needed).
> The ⭐ item (sample plugins) is the current **build-next**.

### AW-2. Visual regression testing — harness works; 4 baselines are stale

**Harness fixed 2026-08-30.** `development/playwright.config.ts` (and 39 sibling
`playwright.*.config.ts` files) pointed at `src/index.ts`, dead since the apps/website restructure —
the entire e2e suite was non-functional on this branch. All 40 are repointed
(`playwright.config.ts:82` now spawns `apps/website/src/index.ts`) and one was re-run end to end.
`npm run test:visual` runs `development/e2e/theme-visual.spec.ts`.

**Still open:**
- **Cross-platform baseline drift** (Mac vs CI Linux) — pinned Docker image or a hosted service
  (Chromatic/Percy/`reg-suit`). Stretch.
- **Coverage gap inherited from the AW-4 check:** a true non-post `page-shell.html` page was never
  exercised (none seeded under `TOVU_DB=memory`); wide-screen safety there is inferred from
  byte-identical CSS, not directly run.

### AW-3. Theme trust model + theme bundles — **DECIDED** (pointer)
**ADR-019 ACCEPTED** (theme bundles / plugin deps) + **ADR-020 ACCEPTED** (theme capability tiers:
Declarative / Templated=LiquidJS / Code, via `theme.json.tier`). Themes stay pure data; behavior
lives in plugins. **Still open:** the standalone spec slices — theme bundles, and theme tiers +
LiquidJS renderer + sandbox (see AW-5a).

### AW-5. Build a theme at each capability tier (owner roadmap)
- **Tier 1 — declarative: DONE.** Current static themes are `basic`, `basic-2`, `tailark-dusk`,
  `tailark-quartz-dark`, `tailark-quartz-libre` under `content/themes/static/`. (The `column` and
  `tovu-official` themes this entry used to name no longer exist on disk.)
- **AW-5a. Tier-2 LiquidJS — DONE (spike 2026-07-08, C6 hardening 2026-07-15).** Renderer wired into
  `apps/website/src/server/inbound/public-http/http/site/render.ts` behind `theme.json.tier:
  "templated"`; loader `apps/website/src/features/theme/theme.ts` reads `tier` and discovers
  `.liquid`. Hardening: AST-walked tag/filter allowlist
  (`apps/website/src/features/theme/liquid-allowlist.ts`, enforced at `loadTheme()` publish-time lint
  and again at render time) plus render isolation (`liquid-worker.ts` in a `worker_threads` worker
  spawned per render by `liquid-sandbox.ts`, bounded by wall-clock timeout and V8 `resourceLimits`,
  with a no-op `fs` adapter closing LiquidJS's default filesystem access) — CPU-timeout and
  heap-limit termination both verified to actually fire. Templated themes on disk today:
  `content/themes/templated/{fashion-modern,storefront}` (the `dispatch` demonstrator is gone).
  **Residual:** add a VRT baseline for the `render_block` seam.
- **AW-5b. Tier-3 JS-in-theme — LATER.** Framework-agnostic (Astro or Next); client-side islands
  under strict CSP, build-time compiled to static HTML + hydrated islands. **Blocked on the Tier-3
  isolation design (its own future ADR):** separate cookie-less origin + CSP `connect-src 'none'`
  (ADR-020 §6 amendment — same-origin theme JS can steal the admin session). Trust-based tier with
  an explicit "this runs JS on your site" consent step.

### AW-6. Plugin extensibility ceiling (plugins owning tables) — **DECIDED** (pointer)
**ADR-023 (Core-Mediated Plugin Data Modules) is ACCEPTED**, 2026-07-11 (`ADR-INDEX.md` line 31;
2-round swarm debate + 3-round `/audit-work` `TM-adr023-dataModule-001`, round-3 unanimous PASS).
Plugins may own real `p_{pluginId}__*` tables via schema-as-data that core executes;
snapshot-before-DDL; retain-on-uninstall. **Still open:** the owed evidence for "commerce-grade" — a
~50k-product faceted-catalog benchmark on end-user SQLite.

### ⭐ AW-7. HIGH PRIORITY — build one sample plugin at each tier (build-next)
Approved 2026-07-08. Prove the plugin design in real running code, the way the Tier-2 LiquidJS spike
surfaced real seams. Each sample is genuinely wanted *and* stress-tests a different part of it.

| Tier | Sample | Why users want it | What it stress-tests |
|---|---|---|---|
| **2 — sandboxed code** | **SEO / content analyzer** (readability, TOC, reading-time) | SEO = biggest plugin category | running stranger code safely: pure computation, no fs/network, so the cleanest test of the frozen async/serializable ABI. Build the **ABI-boundary slice (worker/RPC), NOT the real `utilityProcess` sandbox** (deferred, ADR-024 §4) |
| **3 — trusted, full access** | **Store / commerce** (products→cart→orders→checkout→payments) | the CMS-choice driver; Tovu's thesis | everything: a plugin that **owns real tables** (ADR-023 `dataModule`), external network, heavy work |

**Status, re-verified 2026-09-06:**
- **Tier 3 — substantially built.** `apps/website/src/features/plugins/store/store-plugin.ts`
  declares its table through the core `dataModule` seam with snapshot→DDL and is covered by
  `__tests__/store-plugin.test.ts`. `lipay/`, `deploy/`, and `supabase-mcp/` are real plugin code
  too. Not yet evidenced: the "live-verified, hand the owner the commands" half of the acceptance.
- **Tier 1 — shipped through the WRONG subsystem for this item.**
  `apps/website/src/features/widgets/resolvers/contact-form.ts` implements Contact Form as a
  **widget resolver** under ADR-047/SPEC-043, a thin adapter over `src/forms/` + `MailerPort` — not
  the plugin/`dataModule` system AW-7 is about, so it does not yield the written list of missing
  core-mediated primitives this item exists to produce.
- **Tier 2 — BUILT 2026-10-04** (see build order below). Earlier: no content-analyzer/SEO plugin existed (`readability` /
  `content.analyzer` under `apps/website/src/features/plugins/`: zero hits, while the same pattern
  matches freely elsewhere in `apps/website/src`).

- **Tier 1 — RE-SCOPED 2026-10-04 (owner): Testimonials + FAQ, zero code** (contact forms are core
  now). **BUILT 2026-10-04:** manifest `contentTypes` grammar + enable provisioner inside the runtime
  after the conflict gate, `content-type` claim kind, tier-1 install with no code, accordion/carousel/
  FAQPage JSON-LD reachable from config, the package (`plugin-runtime/samples/testimonials-faq/`),
  and the admin install dialog's code-free wording + current-workspace conflicts. Visual checks still
  owed. Missing primitives #4–11 remain: `ADS-memory/reports/2026-10-04-aw7-tier1-declarative-plugin-missing-primitives.md`.

**Remaining build order:** (1) finish Tier-3 live verification; (2) ~~Tier-1 Testimonials + FAQ as a
real plugin~~ built 2026-10-04 — visual checks only;
(3) ~~**Tier-2 content analyzer** over the ABI via worker/RPC~~ **built 2026-10-04**: built-in
`content-analyzer` (off by default) runs only in a fresh worker per call; admin post-editor card with
"Analyze now" (`PLUGIN_PREVIEW` route); the agent's `plugin_capability_content_analyzer` computes a
fresh result. Commits 7630f822e, 09615d90b, cef9e6f17, bb5d2fefa, d63e7c8bf, a64162856. DX note:
`ADS-memory/reports/2026-10-04-aw7-tier2-dx-pain.md`. **Still open:** visual checks (editor card in
all states/locales, Plugins-screen enable toggle); the real process sandbox (ADR-024 §4) before any
sideloaded tier-2; meta description in `ContentEntryDraft`; a plugin admin-UI surface (ADR-025).

## Learn (What You Need to Understand)

### Core architecture fundamentals
- Ports/adapters and dependency inversion (how core stays swappable)
- Hybrid sync command + outbox flow (what is synchronous vs asynchronous)
- Vertical slice architecture (feature-by-feature development)
- Contract testing vs integration testing

### Platform and runtime choices
- Express vs Fastify vs Hono tradeoffs for Tovu
- Queue/event delivery options (retries, backoff, dead-letter strategy)

### Product + ecosystem
- Directus internals (especially AI layer)
- WordPress pain clusters and how each maps to Tovu capabilities
- Spec-first workflow (Spec Kit commands and artifacts)

---

## Accomplish (What We Need to Build)

### Foundation (active)

### First real capabilities

### Reliability and safety
- [ ] Idempotency strategy for event handlers. (`operation-lock.ts` guards concurrent mutations; it
      is not handler-level idempotency.)
- [ ] Error taxonomy + standardized API error responses. `apps/website/src/server/error-mapping/`
      exists but contains **only `INFO.md`** — it names itself "the intended home for the canonical
      error envelope, status mapping helpers, and route-safe translation", with no code. Per-feature
      `errors.ts` files exist but there is no shared envelope.

### Agent capability surface (added 2026-07-27)

Backed by a source-level survey of ten shipped products; full reports in
`/Users/la/Programming/OSS-Repos/AI-Capabilities/`. Design written up in
`development/tovu-v2-design.md` §9 and `Jini/ai-control-plane.md` §29 (both verified present).
Build in this order.

- [ ] **Make the entity discriminator a per-principal enum**, not a free string. Kills the extra
      discovery round trip and puts least privilege in the contract. Neither Payload nor Strapi
      shipped this combination — it's ours to get right. Cache keys must include principal +
      permission version; execution-time authorization stays mandatory regardless.
- [ ] **Two-sided conformance test**, taken verbatim from Strapi's suite: *a read-only principal
      cannot see write tools and cannot invoke them.* One test, both halves of the anti-pattern.
- [ ] **Kill-switch completeness test.** Verify that disabling the AI feature stops artifacts the
      agent already created, not just new invocations. Directus (agent-authored Flow with an `exec`
      step) and novamira (agent-written sandbox PHP) both fail this — two of ten products.
- [ ] **Actor kind in the event envelope.** Record agent-vs-human on every mutation. Directus knows
      the OAuth client on every request and never writes it to the activity row, so its audit trail
      can't tell them apart. Relates to W6 (change-set primitive); retrofitting provenance is the
      same class of error as retrofitting tenancy (W7).
- [ ] **Validate capability *output*, not just input.** Every WordPress ability validates what it
      returns against a declared output schema (`class-wp-ability.php:677`); Jini validates input
      only. Cheap now, awkward once handlers exist. Relates to `ai-control-plane.md §19.4`, which
      already asks for it under output safety but has no implementation.

**Where the evidence lives.** Ten canonical per-repo reports in
`/Users/la/Programming/OSS-Repos/AI-Capabilities/` (`<repo>.md` + `<repo>.metrics.json`), merged from
22 independent analyses across three models; raw passes preserved under `passes/<repo>/`. Design
rationale with `file:line` citations is in `Jini/ai-control-plane.md` §29 and `tovu-v2-design.md` §9.
Caveat when reading a single-pass report (`ghost`, `medusa`, `open-saas`, `jini`): measured across
this corpus, **68–70% of findings came from exactly one pass**, so one pass is roughly a third of
what is findable.

---

## Backlog: Admin IA Research (Needed Before Admin Build)

**Path correction 2026-09-06:** the `tovu/apps/admin/sections/` placeholder set this entry was
written against **no longer exists**. The live admin registry is `apps/admin/src/panels.tsx` (46
panels), and the Admin Section Spec Sweep above already reconciled it against source — so the third
bullet's "confirm/adjust the placeholder set" half is obsolete. The competitor research itself is
still genuinely open.

- [ ] Capture the admin information architecture of Directus, Ghost, Payload, Strapi, and WordPress
      (WordPress specs already at `development/other-repos-specs/wordpress_specs/wp-admin/`): sidebar
      taxonomy, screen inventory per section, navigation depth, and where each puts settings vs
      content vs system surfaces. CBM indexes exist for all five repos.
- [ ] Capture each CMS's admin *extension* pattern (how plugins contribute panels/menu items/dashboard
      widgets): WP menu/meta-box registration, Directus extensions-sdk app surfaces, Payload admin
      components, Strapi admin plugin API, Ghost admin-x apps.
- [ ] Synthesize into a Tovu admin IA spec: define the surface-descriptor types each section needs
      (feeds Master Build Inventory §11 Admin UI) and mark which panels are core vs
      registry-contributed vs plugin-shipped.

## Backlog: Shopify Research (Still Needed)

- [ ] Review and execute `development/other-repos-specs/shopify_specs/TODO.md` before restarting
      Shopify decomposition or agent-build-packet work.

## Backlog: Medusa Research (Still Needed)

- [ ] Review `development/other-repos-specs/medusa_specs/TODO.md` before adding deeper Medusa
      internals, route DTO inventories, admin SDK notes, telemetry notes, or hosted-cloud caveats.

## Backlog: Commerce Platform Crosswalk (Still Needed)

- [ ] Turn the Shopify + Medusa research into a Tovu capability map / V1 commerce platform
      architecture, working from
      `development/other-repos-specs/{shopify_specs,medusa_specs}/TODO.md`.
      **[UNVERIFIED 2026-09-06]** This entry's original pointer, `other-repos/TODO.md`, does not
      exist anywhere in the repo — the synthesis notes it referred to were not located.

## Master Build Inventory (Everything)

**Reconciled 2026-09-06** (earlier passes: 2026-07-15, and a §12/§13 correction 2026-09-02).
Checklist items verified DONE have been **deleted** — git history keeps them. What remains is open
work, each line carrying either the evidence that it is open or the ADR that scopes it.

Counts refreshed this pass: **64 ADR files** on disk under
`ADS-memory/reports/architecture/ADR-0*.md`, of which only **57 have an index row** (053, 055, 056,
057, 059, 063, 064 are unindexed). **156** `__tests__` directories and **7** `__specs__`
directories across `apps/website/src` + `apps/admin/src`; **15** `*.contract.test.ts`; **26**
`INFO.md`.

**§3 Data Layer, §4 Auth/Identity/Permissions, and §5 Storage/Media are complete** and their
checklists are gone. Owning ADRs, for navigation: §3 — ADR-006 (rule-of-two adapters), ADR-007
(`workspaceId` everywhere), ADR-015 (SQLite + Drizzle, Postgres deferred to a later adapter swap),
ADR-022/023/026 (schema naming + `p_{pluginId}__*` grammar), ADR-041/045 (backup/restore/rollback).
§4 — ADR-021 (one `principals` table, RBAC catalog, `authorize()`, composite `(workspace_id,id)`
FKs), ADR-008/022/041 (audit trail). §5 — ADR-027 (media object model, upload pipeline, immutable
signed URLs on a cookie-less origin, GC policy, ingress policy, `entry_refs`).

### 1) Core Runtime / Kernel
- [ ] Define final kernel responsibilities (lifecycle, DI, service registry) — no dedicated kernel/DI
      module exists; ADR-046 (Proposed, pending debate) partially scopes composition-root/module-status
      concerns
- [ ] Add config system with typed schema + env validation
- [ ] Add module loader contract (for plugins/themes/providers) — Tier-1 declarative plugin
      data-modules are built (ADR-023, `features/plugins/data-module.ts`/`snapshot.ts`); a general
      load/init/stop lifecycle contract for Tier-2/3 code plugins is scoped by ADR-024, not built

### 2) Eventing / Hybrid Sync + Async
- [ ] Define event naming conventions and ownership — a consistent `domain.verb` convention is used
      pervasively in code (`entry.created`, `content_type.tombstoned`, …) but is not written down
- [ ] Add idempotency support for handlers — idempotency exists for gated mutations
      (`contracts/core/gated-mutations/token.ts` idempotency keys, `contracts/core/operation-lock.ts`)
      but not for event-handler/outbox consumption
- [ ] Add event replay strategy for recovery/backfill — explicitly deferred by ADR-022

### 6) Search / Indexing
**STALE 10-04:** post full-text search ships (`features/post/search-index*.ts`, `ddacc2093`). Nothing built — no search module exists anywhere under `apps/website/src`. (ADR-022's
core-provisioned expression indexes, `features/content-types/index-provisioning.ts`, are DB
query-performance indexes, not a search subsystem, and do not satisfy the first item.)
- [ ] Define hybrid search strategy (keyword + semantic optional)
- [ ] Add search relevance tuning strategy
- [ ] Add search contract tests and latency budgets

### 7) Feature Modules (Initial Core Features)
- [ ] Workspace **lifecycle events** — CRUD itself is built (`features/workspace/` plus
      `server/inbound/admin-http/routes/workspace/{get,create,list,update,delete}.ts`); what is
      missing is the create/rename/delete domain-event lifecycle
- [ ] Publishing workflow module — basic publish/unpublish exists (`features/entries`); no
      draft→review→scheduled multi-stage workflow

### 8) Theme System
- [ ] Define template hierarchy and route mapping — route→template-id resolution exists as a spike
      (`apps/website/src/server/inbound/public-http/http/site/render.ts`); the full
      hierarchy/fallback design is ADR-017 (Proposed, blocked on the theme system)
- [ ] Define slots/regions injection model — ADR-020's Tier-2 `render_block` / `{{ content|raw }}`
      seams are built and hardened (see AW-5a: allowlist + worker isolation, C6 done 2026-07-15); the
      general slots/regions model on top of them is not designed
- [ ] Add theme versioning and compatibility checks — ADR-019 covers theme-declared plugin
      dependencies; theme-to-engine version/compat checks are not built
- [ ] Add theme lifecycle hooks (install/enable/disable/update)
- [ ] Add theme safety checks and rollback strategy — no theme-specific safety/rollback; ADR-041 (DB
      migration rollback) and ADR-023 (plugin snapshot-before-DDL) are the closest analogs in other
      domains

### 9) Plugin System
- [ ] Define plugin lifecycle API (install/load/init/stop/uninstall) — Tier-1 `dataModule`
      install/uninstall is built (ADR-023); the full lifecycle for Tier-2/3 code plugins is deferred
- [ ] Define plugin dependency graph and conflict rules — ADR-019 covers theme→plugin declared
      dependencies only
- [ ] Define plugin sandbox/permission enforcement — the capability-gating model is Accepted
      (ADR-024 default-deny manifest); the Tier-2 isolation mechanism (per-site Electron
      `utilityProcess`) is not built
- [ ] Define plugin UI extension points — ADR-025 decided the mechanism (sandboxed cross-origin
      iframe + `postMessage` RPC); not built. Unblocks OQ-07 (admin-surface/extension-panel registry)
- [ ] Define plugin server extension points (routes/hooks/events) — ADR-024 decided the hook-priority
      model conceptually; no general hook/route extension-point registry exists beyond feature-specific
      hooks (e.g. `features/newsletter/hooks.ts`)
- [ ] Add plugin observability and fault isolation

### 10) HTTP/API Server
- [ ] Decide Fastify vs Hono migration path — no decision made; Express remains
- [ ] Add request validation and response schema enforcement — ad hoc per-route validation only; no
      schema library adopted (see §24's open Zod evaluation)
- [ ] Add rate limiting and security headers — per-feature rate limiting exists
      (`features/forms/rate-limit-profile.ts`, ADR-030 magic-link limit) and per-surface CSP exists
      (ADR-025 plugin iframe, ADR-038 egress policy), but no app-wide middleware for either
- [ ] Add OpenAPI generation strategy

### 11) Admin UI (Headless Admin Client)
Shell, workspace, collections, content editor, media, settings/roles/users screens are all built
under `apps/admin/src/features/` (**31 feature directories**, not the `apps/admin/src/sections/`
path this inventory used to name). Per-section remaining work lives in the Admin Section Spec Sweep
above, not here.
- [ ] Build extension-point rendering in admin — site-plugin and Agent Plugins management screens
      exist, but ADR-025's sandboxed plugin-contributed panel runtime is not built
- [ ] Build admin notification center

### 12) Agentic UI / AI Layer
The transport question is settled: **ADR-059 (Accepted 2026-08-18)** ships a real
`@ag-ui/core`/`@ag-ui/client`/`@ag-ui/encoder`-backed canary transport, proved live against 10 real
Tovu tool calls in a browser, and `AssistantDock` (`apps/admin/src/components/AssistantDock/`)
replaced the old stub FAB well before that. What remains:
- [ ] Define the AI interaction model's complete task/capability contract and its hardening
- [ ] Define tool registry contracts and tool safety policy — Jini runtime/tool registration exists,
      but fail-closed per-principal capability discovery and the control/retrieval-plane split (see
      the Agent Capability Surface backlog above) are open
- [ ] Define structured outputs and tool-call protocol — ADR-013/024's ABI (async + serializable-only,
      no live objects) sets the constraints; no concrete implementation
- [ ] Define context assembly pipeline (system/site/task/history)
- [ ] Define memory policy (session, episodic, semantic boundaries)
- [ ] Define guardrails and human-in-the-loop checkpoints — ADR-016 (propose→review→accept/reject→
      revert change-sets) scopes the pattern; not implemented as an AI guardrail system
- [ ] Define AI audit trail and explainability logging

### 13) Protocols and Integrations
- [ ] **PARTLY:** desktop sites MCP server (`apps/desktop/src/sites-mcp-server.ts`); admin MCP Server tab still Soon. **Expose Tovu's own tools/data as an MCP *server*.** MCP *consumption* is built
      (`assistant/mcp-federation/`, `assistant/external-mcp-store.ts`) and MCP *UI* rendering exists
      (`assistant/mcp-ui.ts`, MCP Apps/SEP-1865) — but nothing exposes Tovu outward: no
      `@modelcontextprotocol/sdk` dependency and no `McpServer`/`new Server()` construction anywhere.
      Related planning is in §22's Agentic Web / Playground MCP backlog.
- [ ] Define A2A support boundaries
- [ ] Define import/export contracts for interoperability
- [ ] Define an AI WordPress database ingestion agent: connect read-only to a WordPress
      MySQL/MariaDB database, extract posts/pages/custom post types, body content, metadata,
      taxonomies, authors, revisions, attachments and image assets, map them into Tovu
      content/media schemas, and run dry-run validation, permalink/redirect mapping, resumable
      import jobs, audit logs, and rollback/compensation planning before any write.

### 14) Testing Strategy
- [ ] Define test pyramid expectations per module — no written doc; a consistent unit+integration
      split exists in practice
- [ ] Add `__specs__` baseline in all modules — only **7** `__specs__/` directories exist against
      **156** `__tests__/` directories
- [ ] Add contract tests for every core port — **15** `*.contract.test.ts` files today;
      content-types/entries/taxonomy still have no SQLite adapter at all (in-memory only), so no
      contract test is possible for them yet
- [ ] Add regression suite for high-risk flows — no dedicated regression label; the full test run
      serves this role by default
- [ ] Add performance smoke tests

### 15) DevEx / Tooling / CI
**Three items deleted 2026-09-06 as false:** there IS a lint script (`"lint": "biome lint ."`,
`package.json:67`), Biome also supplies formatting (`biome.json` at the repo root,
`@biomejs/biome ^2.5.5`), so "add a formatter / no prettier config" is moot, and there IS a CI
pipeline — `.github/workflows/ci.yml` (508 lines) runs `typecheck`, `test:ci`, `check:boundaries`,
`check:architecture` and `check:inventory`, alongside `fly-deploy.yml`.
- [ ] Add commit/PR conventions — no `CONTRIBUTING.md` or commit-convention doc in the repo
- [ ] Add environment matrix docs (dev/staging/prod)
- [ ] Add codegen strategy for typed clients if needed

### 16) Reliability / Ops / Security
- [ ] Define SLOs and operational dashboards
- [ ] Define incident response runbooks
- [ ] Add secrets management policy — explicitly deferred by ADR-028 ("secret gate: reject
      `secret:true` until a secret-store ADR")
- [ ] Add dependency and supply-chain scanning
- [ ] Add vulnerability response policy

### 17) Product Safety (From WordPress Pain Clusters)
- [ ] Update preflight checks and safe rollout design — ADR-041's cost-gated boot migration policy
      (`evaluateBootMigrationPolicy`) is preflight-shaped for one domain (DB migrations); there is no
      general preflight/safe-rollout framework
- [ ] Incident analysis and guided remediation design — ADR-045's Recovery screen (itemized
      discarded-write-window disclosure before restore) is the closest built analog
- [ ] Conflict isolation and quarantine strategy
- [ ] Performance attribution and budgets
- [ ] Authoring safety and template recovery — ADR-016 is the closest scoped analog; no UI built
- [ ] Migration/portability strategy — ADR-041 covers DB schema migration; content import/export
      portability (the WordPress ingestion agent, §13) is open
- [ ] Governance/trust and provenance strategy

### 18) Documentation / Knowledge Retention
- [ ] Keep module `__specs__` synced with implementation — only 7 modules have one (see §14)
- [ ] Maintain a glossary of domain terms — no standalone glossary; terms are defined inline in
      individual ADRs
- [ ] Maintain a roadmap by milestone (M0, M1, M2…) — this file is the closest thing; there is no
      formal milestone doc

### 19) WordPress Parity Gap Checklist (Detailed)

#### Content + publishing
- [ ] Draft/review/published/future/private status model parity — draft/published exists (`features/entries`, `features/post`); scheduled ("future") and private-visibility states not confirmed built
- [ ] Revisions + restore + compare views — append-only revisions exist (ADR-022); restore-to-a-past-revision and compare-views UI not built
- [ ] Sticky/featured content behavior

#### Taxonomy + navigation
- [ ] Term archives and filtering behavior — taxonomy backend/admin is built (ADR-044); public-facing term-archive/filter pages are not confirmed
- [ ] Breadcrumb/navigation helper model — ADR-039 routing (`urlFor`/`isActive`) provides the primitive; no breadcrumb helper built on top yet

#### Editor + design system
- [ ] Block editor equivalent (or strict alternative) with schema safety — a TipTap-based rich-text editor exists (`apps/admin/src/features/posts/PostEditor.tsx`, `apps/admin/src/features/collections/CollectionEntryEditor.tsx`); not a block-based, schema-safe editor per ADR-016/017's fuller vision
- [ ] Reusable blocks/patterns/templates
- [ ] Full-site editing equivalents (template parts, global styles) — ADR-017 (Proposed, blocked on theme system)
- [ ] Media embed blocks and short content primitives (quote/code/table/etc.)
- [ ] WYSIWYG parity between editor and rendered output

#### Theme system parity
- [ ] Template hierarchy and fallback rules — same gap as §8 item 2 (ADR-017 Proposed, blocked)
- [ ] Child-theme equivalent strategy
- [ ] Theme update compatibility checks and rollback

#### Plugin ecosystem parity
- [ ] Plugin install/activate/deactivate/update/uninstall flows — Tier-1 install/uninstall is built (ADR-023, `features/plugins/data-module.ts`); activate/deactivate/update flows and UI not confirmed
- [ ] Plugin dependency + compatibility checks — ADR-019 covers theme→plugin declared deps only; general plugin-to-plugin checks not built
- [ ] Hook/filter-like extension model — ADR-024 decided the hook-priority model conceptually; no general-purpose registry beyond feature-specific hooks
- [ ] Plugin settings registration and UI mounting — ADR-025 decided the iframe/`postMessage` mechanism; not built yet

#### Admin + operations
- [ ] Update center and update history
- [ ] **PARTLY:** schema-state route + admin drift banner exist (`routes/database/schema-state.ts`). Built-in site health diagnostics — ADR-041's drift banner (`features/storage/drift.ts`) is a partial analog, but no route/UI is wired for it yet (deliberately deferred in the 2026-07-15 backend session)
- [ ] Import/export tooling and migration helpers

#### SEO + discovery
At parity — ADR-032 (XML sitemap + controls, canonical/meta/schema, robots/indexing) and ADR-033
(redirect rules + canonicalization) are all shipped.

#### Media + files
- [ ] Bulk media operations

#### Infrastructure + reliability
- [ ] Cron/scheduler equivalent
- [ ] Caching strategy (page/data/object) with invalidation — one narrow cache exists (SEO sitemap cache, `seo/sitemap.ts`'s `regenerateSitemapCache`/`invalidateSitemapCache`); no general page/data/object caching strategy
- [ ] Safe update/rollback flows — ADR-041's migrate-forward state machine is the closest analog for DB schema changes; app/plugin/theme update rollback isn't built

### 20) Payload/Directus/Ghost Parity and Strategic Additions

#### Payload-like capabilities
- [ ] Relationship and nested/document modeling parity — taxonomy relations (ADR-044) + media `entry_refs` (ADR-027) exist; ADR-022's flat-typed-columns + JSON-ext-bag model is deliberately not a Payload-style deep nested/relational document model
- [ ] Access control at collection/field/doc level — collection/doc-level access control is built (ADR-021 permissions); field-level ACL is not built
- [ ] Hooks lifecycle parity (`beforeChange`, `afterRead`, etc. equivalent)
- [ ] Uploads with focal points/transforms and ACL — transforms + ACL are built (ADR-027); focal-point cropping is not confirmed

#### Directus-like capabilities
- [ ] Data Studio-like admin configurability — a basic registry UI exists (`Collections.tsx`); full Directus-style Data Studio configurability isn't a stated goal or built
- [ ] Flows/automation builder equivalent
- [ ] Realtime subscriptions and event streams
- [ ] Extension types parity (interface/display/layout/module/hook/endpoint/op/panel analogs)
- [ ] Marketplace/distribution model for extensions (if in scope) — ADR-024 sets the trust-tier forcing function for a future marketplace ("shipping the marketplace is shipping the sandbox") but the marketplace itself isn't built

#### Ghost-like capabilities
- [ ] Writer-first editing experience quality target
- [ ] Performance-first defaults for publishing surfaces

#### Strategic additions (beyond parity)
- [ ] Guided incident remediation — ADR-045's Recovery screen is the closest built analog
- [ ] Preflight update risk checks + canary + rollback — ADR-041's migrate-forward cost-gating is a partial analog, scoped to DB migrations only
- [ ] Policy-based governance and provenance controls

### 21) Big Missing Items to Explicitly Track
- [ ] Billing/licensing domain model (if SaaS)
- [ ] Tenant provisioning lifecycle (create/suspend/delete/archive) — create/instantiate is built (ADR-012 site template instantiation); suspend/archive/delete lifecycle is not built
- [ ] Rate limits and abuse prevention — per-feature rate limits exist (forms, ADR-030 magic-link); no platform-wide abuse-prevention layer
- [ ] Legal/compliance requirements (audit, retention, privacy workflows) — consent (ADR-030 D1c) and erasure-handler patterns (ADR-031 `principal.erasure.requested`, ADR-035 erasure scope) exist per-domain; no unified compliance/retention framework
- [ ] Data portability + exit tooling guarantees
- [ ] Disaster recovery objectives (RPO/RTO targets) — ADR-041/045 build the restore mechanism itself; no stated RPO/RTO numeric targets
- [ ] Internationalization/localization strategy
- [ ] Accessibility baseline and regression checks — an `alt` field exists on media (ADR-027, `media/types.ts`); no broader accessibility baseline or regression testing
- [ ] Support/admin tooling for operations team

### 22) AEO / GEO / AI Surfaces (First-Class)

#### AEO (Answer Engine Optimization)
- [ ] Define AEO content model (Q&A entities, canonical answer blocks, evidence links)
- [ ] Add structured data generation for answer engines (schema consistency + validation) — a JSON-LD serialization primitive already exists (`apps/website/src/server/inbound/public-http/http/site/page-head.ts`'s `serializeJsonLd`, ADR-032
  `apps/website/src/features/seo/page-head-contributor.ts`); full per-content-type auto-generation is not confirmed complete
- [ ] Build answer freshness workflow (staleness checks + auto-review queue)
- [ ] Add answer quality scoring (accuracy, completeness, citation confidence)
- [ ] Add AEO analytics surface (answer impressions, citation wins, decay signals)

#### GEO (Generative Engine Optimization)
- [ ] Define GEO entity graph model (brand, product, docs, features, relationships)
- [ ] Add machine-readable knowledge packaging (LLM-ready endpoint/doc bundles)
- [ ] Create an AI-readable site guide/template pack for Next.js, Vite, and other frontend users covering semantic HTML, structured data, canonical metadata, sitemaps, content hierarchy, and LLM-readable source pages
  Starter links to review later (not exhaustive):
  - Search Engine Land: `https://searchengineland.com/google-publishes-guide-on-optimizing-for-generative-ai-features-477671`
  - Google Search Central: `https://developers.google.com/search/docs/fundamentals/ai-optimization-guide`
- [ ] Add citation-safe source-of-truth pages and canonical mapping
- [ ] Add GEO monitoring (model mention tracking, citation drift, hallucination risk)
- [ ] Add remediation workflows for weak/missing entity representation

#### AIO/GEO Sitemap Plugin
Source video: `https://www.youtube.com/watch?v=4WyduoGpIPo` (Dead Internet / Search Heist / Zero-Click analysis)

##### Visibility (GEO-era sitemap as knowledge declaration)
- [ ] Define "knowledge sitemap" schema — entity graph, canonical answer anchors, authority claims, not just URLs
- [ ] Add structured content relationship mapping (topics → pages → evidence → citations)
- [ ] Generate machine-optimized sitemap variants for AI crawlers (beyond XML — structured data, entity bundles)
- [ ] Add per-page "citability" metadata (canonical answers, freshness date, authorship, source chain)
- [ ] Integrate with existing GEO entity graph model (section above)

##### Defense (Anti-Heist / Anti-Clone)
- [ ] Add sitemap topology monitoring — detect when a competing domain mirrors your URL structure
- [ ] Add selective sitemap exposure — full graph for trusted crawlers, minimal for unknowns
- [ ] Add content fingerprinting and first-publication timestamping (prove original authorship)
- [ ] Add domain lapse / zombie page alerting — warn before dormant pages expire and become cloneable
- [ ] Add lookalike domain detection (variations on site name appearing with mirrored content)
- [ ] Add crawler pattern analysis — detect mass-export behavior vs normal crawling

##### Intelligence (Citation & Displacement Tracking)
- [ ] Track which pages are being cited in AI overviews / answer engines
- [ ] Track content staleness signals (pages going stale = ripe for displacement by competitors)
- [ ] Track competitor topology mirrors and content overlap drift
- [ ] Add alerting for citation loss / decay (you were cited, now you're not)
- [ ] Add dashboard: citation wins, displacement risks, heist attempts, freshness scores

#### Content Provenance & Defense (Platform-Level)
Source video: `https://www.youtube.com/watch?v=4WyduoGpIPo`

- [ ] [Optional-Weak] Content provenance as a first-class CMS feature — content signing, timestamping, editorial process declaration at platform level (proves human authorship + original pub date in a model-collapse world)
- [ ] Add intelligent crawler policy management beyond robots.txt — per-crawler rules, welcome citation bots, throttle scrapers, detect mass-export patterns
- [ ] Add "human-first" signal packaging — editorial process metadata, authorship chains, source citations, signals that quality-focused engines will reward
- [ ] Add content originality scoring — flag when published content looks AI-generated or duplicative before it damages site authority

#### AEO Plugin (Tovu-Native — replaces Yoast/RankMath)
Source research: AI engine crawler/indexing patterns (Google AI Overviews, ChatGPT Search, Claude, Perplexity, Bing Copilot)

##### Per-page auto-generated outputs
- [ ] Auto-generate JSON-LD structured data from typed content model (Article, HowTo, Product — context-dependent)
- [ ] Auto-generate "direct-answer block" (2-3 sentence extractable answer) placed at top of page
- [ ] Auto-generate clean `.md` mirror of each page at `<url>.md` for LLM-friendly consumption
- [ ] `data-nosnippet` zone management — let editors mark sections excluded from AI extraction
- [ ] Meta description generation optimized for extraction (complete sentences, factual, 150-160 chars)

##### Site-level outputs
- [ ] IndexNow integration — ping Bing instantly on publish/update (only proven instant-discovery signal)
- [ ] robots.txt builder — per-bot allow/block config (OAI-SearchBot, GPTBot, PerplexityBot, Googlebot, bingbot, ChatGPT-User) — a generic `RobotsPolicy`/`buildRobots` exists (ADR-032, `apps/website/src/features/seo/`); per-bot granularity (OAI-SearchBot/GPTBot/etc.) not confirmed

##### Engine-specific optimizations
- [ ] Google AI Overviews: "nugget in the mine" content structure (long-form with extractable direct answers per section)
- [ ] ChatGPT Search: ensure pages indexed in Bing (OAI-SearchBot uses Bing's index); separate GPTBot (training) vs OAI-SearchBot (search) controls
- [ ] Perplexity: freshness-first strategy — auto-flag stale content, surface recency signals, original research/data emphasis
- [ ] Bing Copilot: IndexNow for real-time discovery + `data-nosnippet` for fine-grained control
- [ ] Claude: clean semantic HTML that converts well to text/markdown, minimal JS-dependent content

##### Content quality signals (agent-assisted)
- [ ] Claim + evidence pair detection — AI suggests adding citations/data to unsupported claims
- [ ] Heading hierarchy validation — flag broken H1>H2>H3 structure
- [ ] "Citability score" per page — how extractable/quotable is this content for AI engines?
- [ ] Freshness monitoring — alert when pages go stale and become displacement targets

##### Forms plugin (TanStack Form-based)
- [ ] Submission routing, conditional logic, payment integration — submission handling + notification is built (`forms/submit-service.ts`, `notify-subscriber.ts`); conditional logic and payment integration are not confirmed built

##### Multilingual plugin
- [ ] Locale model + fallback chains (per-content-type locale config)
- [ ] Agent-driven translation workflow (auto-translate on publish, human review queue)
- [ ] URL slug per locale, hreflang generation, locale switcher component
- [ ] Translation memory / glossary for consistency across content
- [ ] Parity tracking — surface which locales are out of sync

##### Membership/Paywall plugin
- [ ] Subscription tier model (plans, entitlements, content access rules)
- [ ] Content restriction rules (per-page, per-section, per-content-type)
- [ ] Drip/scheduled content release
- [ ] Payment gateway integration (Stripe primary)

#### AI Surfaces (User + Employee)
- [ ] Define end-user AI surface (assistant panel for guided site changes)
- [ ] Define employee/internal AI surface (operations console with elevated tooling)
- [ ] Define tool permission tiers (user-safe vs staff-only vs admin-only)
- [ ] Add simulation/dry-run mode before applying front-end or back-end changes
- [ ] Add dual-surface UX contracts (what users can self-serve vs what staff can perform)

#### AI Tooling for Frontend + Backend Mutation
- [ ] Tooling: backend schema/config/workflow mutation tools
- [ ] Tooling: safe migration tools (preview diff, impact analysis, revert plan)
- [ ] Tooling: test-and-verify tools (run checks before apply)
- [ ] Tool orchestration policy: require tool-use-first and structured outputs
- [ ] Add guardrails to prevent unbounded or cross-tenant mutations

#### Agentic Web / Playground MCP Backlog
Source prompts:
- Automattic: `https://automattic.com/2026/04/21/wordpress-operating-system-agentic-web/`
- WordPress Playground MCP: `https://make.wordpress.org/playground/2026/03/17/connect-ai-coding-agents-to-wordpress-playground-with-mcp/`

- [ ] Evaluate the "WordPress as operating system of the agentic web" thesis against Tovu's strategy: governed web operating layer exposing content, admin, extensions, jobs, diagnostics, and site state as safe agent capabilities.
- [ ] Track the agentic-web challenge set as explicit risks to solve later: legacy/technical-debt drag, inconsistent extension quality, abandoned/insecure extensions, performance overhead, extension-order complexity, fragmented runtimes, and missing ecosystem quality signals.
- [ ] Define a Tovu agent capability catalog for content, media, themes, plugins, settings, jobs, migrations, diagnostics, and recovery, with descriptors reusable by admin UI, AI assistant, MCP, and future protocols.
- [ ] Define a WordPress Playground-style Tovu Playground: disposable local/browser sandbox for AI coding agents to test site, content, theme, plugin, and schema changes without production writes.
- [ ] Add a local-only MCP bridge for Tovu Playground with token/origin protection, explicit user-scoped enablement, and no production credentials by default.
- [ ] Expose sandbox tools for HTTP requests, admin navigation, content mutation, theme/plugin file operations, migration dry-runs, test execution, job inspection, snapshot reset, and export/import.
- [ ] Add an AI coding agent integration contract covering sandbox creation, patch application, preview URL, diff review, human approval, audit log, and rollback checkpoint linkage.
- [ ] Add contract tests proving MCP/playground actions cannot exceed equivalent authenticated admin permissions or bypass safe-mode/recovery policy.

### 23) Platform Gaps Still Missing

#### Governance, data, and compliance
- [ ] Define data classification policy (PII, sensitive business data, public data)
- [ ] Define retention and deletion policy per data class
- [ ] Implement data subject request workflows (export/delete/correction) — erasure-handler patterns exist per-domain (ADR-031 `principal.erasure.requested`, ADR-035 erasure scope); no unified data-subject-request workflow/UI
- [ ] Map controls for SOC2-style audit readiness
- [ ] Map GDPR/CCPA requirements to concrete product behaviors
- [ ] Define evidence collection workflow for audits (logs, approvals, controls)

#### Reliability and global operations
- [ ] Define multi-region strategy (active/passive or active/active)
- [ ] Define data residency controls by workspace/tenant
- [ ] Define disaster failover playbook and trigger criteria
- [ ] Define latency and availability SLOs by region
- [ ] Run recurring restore drills to validate RPO/RTO goals

#### Commercial platform capabilities
- [ ] Define billing domain model (plans, subscriptions, invoices)
- [ ] Define entitlement model (feature access by plan)
- [ ] Define quota model (API, storage, AI usage, seats)
- [ ] Define overage handling and enforcement behavior
- [ ] Define billing/audit reconciliation workflows

#### API and ecosystem lifecycle
- [ ] Define SDK generation and release process

#### Marketplace and supply chain trust
- [ ] Define plugin/theme submission and review workflow
- [ ] Define extension trust scoring (security, maintenance, quality)
- [ ] Define malicious package response workflow (disable/quarantine/notify)

#### Release management and support operations
- [ ] Define release channels (stable, beta, canary) and promotion rules
- [ ] Define rollback playbooks per release type
- [ ] Define customer-facing status page and incident communication templates
- [ ] Define support tooling (safe impersonation, diagnostics bundle export)
- [ ] Define runbooks for top recurring incidents

#### Product growth and safety operations
- [ ] Define experimentation framework (A/B testing + guardrails)
- [ ] Define onboarding wizard and activation milestone tracking
- [ ] Define migration assistant UX with success/failure checkpoints
- [ ] Define cost telemetry by module/feature and budget alerts
- [ ] Define analytics taxonomy governance and ownership
- [ ] Define UGC moderation/safety policy if user-generated content is enabled

### 24) Architecture Tooling Evaluation (added 2026-06-30)

Source: competitor-analysis session. **[UNVERIFIED 2026-09-06]** the three findings files this
section cites (`claude-`/`gemini-`/`codex-tovu-competitor-findings.md`) are not present anywhere in
the repo, so the reasoning behind these picks could not be re-read.
Goal: evaluate/adopt tooling that keeps the codebase modular, maintainable, and flexible (enforces the ports/adapters + spec-first constraints). Ties into existing items 1) "architecture boundary enforcement" and 15) "architecture lint".

Recommended starting five (highest ROI):
- [ ] Evaluate **Zod** at all boundaries — runtime validation + single source of truth for types (fits SQLite JSON-text ↔ jsonb strategy) — not adopted; relates to §10's still-open request-validation item
- [ ] Evaluate **ArchUnitTS / ts-arch** — architecture rules as unit tests (fits spec-first / M3 test-contract framework)
- [ ] Evaluate **Testcontainers** (+ **Pact**) — contract-test each DB/storage/payment adapter against a real backend

Adopt when splitting `src/` into `packages/`:
- [ ] Evaluate **Nx** vs **Turborepo** — workspace + module-boundary tags + affected graph + caching — still mostly moot: a `packages/` root exists but holds only `packages/sdk`, so there is no
      multi-package graph to tag or cache yet
- [ ] Evaluate **Sheriff** / **good-fences** — lighter encapsulation if not going full Nx

Understanding / codegen / docs:
- [ ] Evaluate **Madge** — fast circular-dependency detection (cheap complement to Graphify/CBM)
- [ ] Evaluate **ts-rest / tRPC** — compiler-checked contracts for the headless packet (Next/Vue shells)
- [ ] Evaluate **Structurizr DSL / C4 model** (+ PlantUML) — diagrams-as-code living architecture docs (pairs with ADR log in item 18) — the ADR log itself (`ADR-INDEX.md`) serves the living-decision-record role in prose form; no diagrams-as-code tooling adopted

**Already adopted, do not re-evaluate:** **dependency-cruiser** (`.dependency-cruiser.mjs`, wired as
`check:boundaries`), **ts-morph** (`package.json` devDependency), **Biome** (lint + format,
`biome.json`), and **OpenTelemetry** — six `@opentelemetry/*` packages are real dependencies
(`package.json:101-106`) behind `apps/website/src/platform/observability/otel.ts`. Remaining OTel
instrumentation work is tracked in Master Build Inventory §1 and §16, not here.

### 25) Reference Codebases to Study (added 2026-06-30)

Goal: study exemplary OSS repos for architecture/design patterns Tovu needs (ports/adapters, DDD, plugin systems, theme systems, provider adapters, monorepo layout). Consider cloning + graphifying the high-priority ones like the existing OSS-Repos set.

Ports/adapters + DDD references (TS):
- [ ] **Sairyss/domain-driven-hexagon** — canonical TS DDD + hexagonal + CQRS reference (closest to Tovu's intended core)
- [ ] **CodelyTV/typescript-ddd-example** — DDD/CQRS skeleton in TS

Plugin-system gold standards:
- [ ] **microsoft/vscode** — contribution points, extension host, activation events (the canonical extensible-platform design)
- [ ] **backstage/backstage** — plugin framework at scale, well-documented plugin API
- [ ] **grafana/grafana** — plugin + data-source-provider architecture

Theme + plugin + content tooling (TS, directly relevant):
- [ ] **facebook/docusaurus** — theme + plugin + preset lifecycle in TS (strong theme-system reference)
- [ ] **withastro/astro** — integrations API, content collections, deploy adapters (modern content-tool adapter pattern)

Provider/adapter + modular monorepo references (TS):
- [ ] **novuhq/novu** — NestJS modular monorepo, notification provider adapters (like Strapi providers)
- [ ] **twentyhq/twenty** — modern NestJS + React modular monorepo (CRM)
- [ ] **calcom/cal.com** — large Next.js app + packages monorepo, feature modularity
- [ ] **nestjs/nest** — DI/modules/providers = canonical TS ports/adapters + DI reference

Curated lists to mine:
- [ ] **mehdihadeli/awesome-software-architecture** and **donnemartin/system-design-primer** — patterns catalog

---

## Admin skins (Studio → Appearance) — planned, not started

Goal: switch the ADMIN's own look — `basic` (today's), `glassmorphic`, `ultramodern` — from a
Studio → Appearance tab. Same mechanism the public themes use, aimed at the admin instead.

This is already half-true: `apps/admin/src/styles.css` declares **94** custom properties and every
component references them (`var(--link)`, `var(--surface)`), with dark mode implemented as
`:root[data-theme="dark"]` overriding the same token names. A skin is the identical trick one
axis over — `:root[data-skin="glassmorphic"]` re-declaring those tokens.

**Two things must hold or skins are unreachable, and both are cheaper to honor now than to
retrofit across 126 `.tsx` components:**

1. **No literal visual values in components.** This is the binding constraint on the Tailwind
   adoption below. Tailwind's theme must map utilities onto the CSS variables
   (`backgroundColor: { surface: 'var(--surface)' }` → `bg-surface`), never onto its default
   palette. A component written as `bg-blue-500 shadow-md` is invisible to every skin, because
   there is no variable for a skin to override.

2. **The token vocabulary needs axes beyond color.** Glassmorphism is translucency, backdrop
   blur, and a different border/elevation treatment — a skin that can only change hues cannot
   express it. Needs tokens along the lines of `--surface-alpha`, `--surface-blur`,
   `--elevation-shadow`, `--border-weight` before the look is reachable at all.

Note the symmetry with the public theme work: site themes carry `tokens.json` + `tokens.light.json`
and swap by writing `data-theme`. Admin skins are the same shape. Worth keeping the two token
vocabularies deliberately similar rather than letting them drift into two unrelated systems.

## Tailwind + shadcn/ui — owner wants both, deferred (2026-08-11)

Owner: *"Remind us to download shadcn and Tailwind later because I wanna be able to use the
components from it."* Wanted specifically for shadcn's component library, not just utilities.

Order matters: shadcn generates components built on Radix primitives **and Tailwind classes**, so
Tailwind lands first. Neither is installed today — `apps/admin/package.json` has 37 dependencies + 11 devDependencies
and **zero** matching `tailwind`/`radix`/`shadcn` (re-checked 2026-09-06); all UI comes from
`@jini-ai/ui`.

**Do not migrate the existing stylesheet** (`apps/admin/src/styles.css`, 4,444 lines as of
2026-09-06). Add Tailwind with `preflight` DISABLED
(preflight's reset would clobber the current stylesheet) and use it for NEW surfaces only.

**The binding constraint**, from the admin-skins section above: Tailwind's theme must map onto the
existing CSS variables (`backgroundColor: { surface: 'var(--surface)' }` → `bg-surface`), never onto
its default palette. Same rule applies to whatever shadcn generates — a component shipping
`bg-blue-500 shadow-md` is invisible to every skin, because there is no variable to override. Budget
time to rewrite shadcn's generated classes onto the token bridge as each component is pulled in;
that is the real cost of adopting it here, not the install.

Known cost either way: two styling systems coexisting, and nothing tells a newcomer which to reach
for. Needs a written rule — new components use Tailwind, do not convert old ones.

## First-run onboarding wizard — deferred, but load-bearing (2026-08-15)

**Not being built now. Recorded because the deployment work will be shaped wrong without it.**

The idea: when someone first installs Tovu, ask them what they are actually building before they
make choices they cannot see the consequences of. Roughly — what kind of site (blog / brochure /
store), what database (if any), and do you need payments, forms, members, comments.

Why this is not cosmetic: those answers **determine which deployment targets can ever work**, and the
constraints are invisible to a non-technical user. Someone who picks "store" cannot deploy to a
static host — checkout and `payments-webhook.ts` need trusted compute — but nothing in the product
tells them that until it fails. The wizard is where "you said you want payments, so Cloudflare Pages
alone will not work for you" gets said, at the one moment the user is receptive to hearing it.

**The hard requirement, and the reason this needs design rather than a form:** people will answer
wrong. They will pick "blog" and then want to sell something six months later. **Every answer must be
reversible**, and reversing must not mean a migration the user has to understand. Do not build a
wizard that writes a one-way decision into config. The likely shape is: answers set defaults and
surface warnings, but the underlying capability stays present and re-derivable from what the site
actually uses — i.e. **detect eligibility from real feature usage, and treat the wizard answers as a
hint, never as the source of truth.**

Read `development/docs/deployment/deployment-constraints.md` before designing this — §6 lists exactly
which features force a stateful host, and §9 explains why the target user never sees a provider at
all.

Related open blocker: onboarding a *customer* (as opposed to a developer) is gated on multi-workspace
hosting, which does not exist yet — one running app resolves exactly one workspace at boot
(`apps/website/src/platform/site-dir/resolve-workspace.ts`). See constraints doc §4.1.

## Observability (OpenTelemetry) — extend the existing port to the uncovered surfaces (owner priority, 2026-09-09)

**PARTLY DONE 2026-10-04:** gap 1 built — DB (storage kernel), outbound (guarded HTTP clients) and agent-run (finalizer) spans through the Jini port, nested under the request span; ops note `development/docs/deployment/observability.md`. Gaps 2 (admin client timings) and 3 (Web Vitals) **SKIPPED for now:** unclear legal requirements for recording visitors' browsers (owner 2026-10-04). **Was OPEN (re-audit 10-04):** all three gaps remain; the port moved to `@jini-ai/diagnostics` (`5ec1a964d`), so the `ports.ts`/`noop.ts`/`app.ts` paths below are stale (see `platform/observability/index.ts:49`).

Owner's words: fairly high priority, but not the highest. An Operations nav page + its own settings
system landed the same night (see the admin section immediately below) — this entry is the actual
instrumentation work behind it.

**Not greenfield — extend what already exists.** A provider-agnostic `ObservabilityPort` shipped
2026-08-28 at `apps/website/src/platform/observability/{ports,config,noop,otel,index}.ts`: one method
(`trackRequest`), a noop adapter by default, a real OTel adapter lazy-loaded only when
`OTEL_EXPORTER_OTLP_ENDPOINT` is set, wired into `createApp()` (`app.ts:898`, before the site-serving
gate and all routes). Root `package.json` already carries the real `@opentelemetry/*` dependencies. A
table-driven contract test (`platform/observability/__tests__/unit/contract.unit.test.ts`) proves both
adapters satisfy the port identically — that IS the template for adding a Datadog/Grafana adapter
later, not something to design from scratch.

**What is actually missing**, per the full recon (`ADS-memory/reports/2026-09-09-observability-otel-recon.md`,
commit `2267e98e` — read it before starting, do not re-derive):
1. `trackDbQuery`/`trackOutboundCall`/`trackAgentRun` — named in `ports.ts` as the port's natural next
   additions, zero call sites today.
2. Admin client-side timing/correlation — `apps/admin/src/lib/api.ts`'s `request<T>()`, fan-in 191 (the
   highest in the project), zero instrumentation today. Single highest-leverage seam in admin.
3. Frontend Web Vitals — zero anywhere. `renderStaticPage` bypasses `pageShell()` entirely, so a
   site-wide perf beacon needs the same two-injection-site treatment the SEO fold and the site-assistant
   widget already needed. RUM only works for live-served pages, not statically-exported/S3-published
   sites (no same-origin process to POST to) — a product decision, not a wiring gap, and worth saying
   on screen rather than pretending it works everywhere.

**Do NOT treat dropped/failed chat runs as an instrumentation gap.** The recon traced that to an
existing, separate correctness bug — a failed run gets persisted as **succeeded** — documented in
`ADS-memory/reports/2026-09-06-chat-death-investigation.md`. Telemetry would not have caught it because
the system was confidently reporting success; it needs its own fix, not a trace.

---

## Recovery vs Database's Restore Points tab — real overlap, not a true duplicate (owner, 2026-09-10)

**DONE** — restore points moved to Recovery (`ae57518ef`, `6921fd12b`; inline tabs `ea4f8967a`). Stretched taxonomy pill + dead translation keys fixed `e6806c3fe`. Still open: the restore-ceremony visual redesign (owner-led).

Owner asked whether `/admin/recovery` and `/admin/database?tab=restore-points` are the same screen.
Verified: **not the same**, but the split is a real design smell worth fixing eventually.
- Database's Restore Points tab (`Database.tsx`'s `RestorePointsSection`) — **list + create only**. No
  restore/execute action anywhere in it.
- Recovery (`Recovery.tsx`) — lists the SAME restore points, but its only job is the restore
  **ceremony**: select one, plan/confirm/execute, physically swaps `content.db`, restart required. No
  create action.

So it's create-here, restore-there, both showing the same list. `Recovery` is deliberate, not an
accident — ADR-045/`design-spec.md §4` explicitly rejected folding it into another screen ("one
screen, two views... never a separate 'Backups' route"), so removing it outright would reverse a named
decision, not just tidy nav.

**SUPERSEDED same morning.** Owner's revised call: Recovery should own ALL restore-point functionality
— tabbed to hold both create+list and the restore ceremony — and Database should NOT have a restore-points
tab at all ("it shouldnt be a database [concern]"). Direction is the opposite of "leave as-is": move
`RestorePointsSection`'s create+list capability OUT of `Database.tsx` and into `Recovery.tsx`, organized
as tabs matching this app's established `SettingsDialogShell` convention (Plugins/AgentPlugins/Security
already use it; Recovery currently does not — it's a single inline list⇄restore-flow swap). Remove the
`restore-points` tab from `Database.tsx`'s `DATABASE_TAB_IDS` entirely once the capability has a real
home in Recovery. Dispatched 2026-09-10 morning.

**Visual design of the restore-ceremony view — REJECTED TWICE, still open.** Two agents redesigned
this screen (Sonnet `c2c8b218`, then Opus `2b1f5bca`) and the owner rejected both live ("holy shit",
"you cant be serious"). The Opus pass's own report is genuinely well-reasoned (a real missing
`--danger-ink` token, measured contrast ratios, structural argument for one continuous card) but the
RESULT was the one rejected — do not treat that report as evidence the screen is fixed. Owner ended
this session and handed off to a separately-started subagent to take it from here; whoever picks this
up should start from `f9e5d870` (last state before either redesign attempt), not build on `2b1f5bca`.

Three legitimate, narrow findings from the rejected pass, worth keeping regardless of the redesign's
own fate:
- `apps/admin/src/features/database/Taxonomy.tsx:411` has the same stretched-full-width `.status`
  pill bug the Opus pass fixed for Recovery (a `.settings-layer-cell` flex-stretch defect) — not
  fixed there because it means touching the shared rule, out of that dispatch's scope.
- `apps/admin/src/features/recovery/recovery-i18n.tsx` still carries ~21 dead `"Restore capability:"`
  translation keys left over from `f9e5d870`'s removal of that badge — safe, mechanical cleanup.
- `DegradedBannerView`'s plain-text treatment (`.notice.recovery-plain-notice`) was deliberately left
  alone by both redesign passes — correct, that was a separate, already-settled owner instruction from
  earlier the same day, not part of either redesign's brief.

---

## Observability admin page — Operations nav entry + settings shell (owner, 2026-09-09)

**First pass DONE** — `6bc1c9199`. Open: provider-wiring pass + the credentials-model decision below.

Owner: "It should be in operations under the operations nav... its own system... a simple page with
tabs that matches the rest of the admin." She does not yet know how OpenTelemetry works end-to-end —
the page's first tab should explain it in plain language (what a "provider" is, whether a key/endpoint
is needed) rather than assume the operator already knows.

**Scope for the FIRST pass, deliberately smaller than full provider wiring:**
- A second tab for provider options (Datadog, Grafana, etc.) — **owner's own words: "let's set that up
  with another subagent."** Build this tab as an honest not-yet-built state (same tone as Agent
  Plugins' Marketplace tab: "does not fetch, install, or configure a provider yet"), not a functional
  form — actually wiring a saved provider credential + having the daemon send real metrics through it
  is separate, larger, later work, not part of this pass.

**Open design question for whoever picks up the SECOND (provider-wiring) pass:** whether a
Datadog/Grafana OTLP endpoint + auth header should be modeled as another row in the SAME
`custom-credentials` system already used for `fly.io`/`github`/`name.com` tonight (label
`"datadog"`/`"grafana"`, storing endpoint + key), rather than a new credential table. Worth deciding
before building, not after.

---

## Deployment — the owner's 3-session-running goal is more built than it looks (verified 2026-08-30)

**Filed as a todos-audit correction, not a fresh gap report.** The dispatch brief for this audit
described deployment as the owner's stated goal for three sessions running "with essentially no work
done" and "not appear[ing] as an actionable backlog item at all." **That premise is wrong when checked
against current source** — real, substantial, committed code exists on both sides:

- **Admin UI** (`apps/admin/src/features/deployment/`): 6,354 lines across `Deployment.tsx` (tab
  shell), `OverviewTab.tsx`, `StaticSiteTab.tsx` (1,568 lines), `DockerfileTab.tsx` (439 lines),
  `FullSiteTab.tsx`, `HistoryTab.tsx`, plus a `hooks/` directory of port/dependency/use-* pairs
  (`use-static-publish.hooks.ts`, `use-static-export.hooks.ts`, `use-dockerfile-source.hooks.ts`,
  `use-publish-credentials.hooks.ts`) and their own unit tests.
- **Backend** (`apps/website/src/`): `platform/export/site-exporter.ts` (872 lines, real static
  exporter — timeout-bounded, per-route failure isolation, fixed in commit `355ccbbb` 2026-08-28),
  `features/deployments/static-publish/` (S3-compatible publish target at 832 lines, a 693-line
  `verify.ts` post-publish check, `publish-run.ts`, `publish-history.ts`, `credentials.ts`,
  `adapter.ts`), `features/deployments/dockerfile.ts` + a real repo-root `Dockerfile`/
  `Dockerfile.dockerignore`, and admin HTTP routes `publish-site.ts`, `export-site.ts`,
  `deployment-overview.ts`, `publish-credentials.ts`. 23 test files under
  `features/deployments/`+`platform/export/`. All of this is **committed** (landed by 2026-08-28,
  `git log` on the key files, no uncommitted working-tree changes in either directory) — not
  in-progress scaffolding.
- Confirmed real, not a stub: `git status --porcelain` on both directories is clean, and
  `deployment-constraints.md` itself (see below) is dated *before* the exporter/publish work landed,
  which is why its own §3 table is now stale.

**What is genuinely still open, from `development/docs/deployment/deployment-constraints.md`** (the
2026-08-13/15 debate-sourced doc, `194` lines, last touched 2026-08-27 — **now itself partly stale**:
its §3 table row "Static exporter: Does not exist… `grep` for `StaticExporter`/`exportSite` returns
nothing" is **false** as of current source; re-verify the rest of that table before trusting it):
- **§4.1 — multi-workspace hosting does not exist.** One running process resolves exactly one
  workspace at boot (`apps/website/src/platform/site-dir/resolve-workspace.ts`). This is the doc's own
  stated gate for any *hosted-SaaS* deployment product (§9) — self-host/export/publish-to-a-bucket
  paths (what the code above actually builds) don't need it, but "click Deploy, get a URL" for a
  non-technical user does.
- **Not independently verified this pass**: whether the built pipeline actually succeeds end-to-end
  against a real host (S3-compatible bucket, a live Docker build) — code existing and tests passing is
  not the same claim as "the owner can click Deploy and get a working live site," and no live
  deploy was attempted here (would need real credentials and is outside a todos-audit's scope).

---

## Footer dead links on the live site

**DONE 10-04** — footers menu-only (`d309da0fe`), boot migration to page links (`2e733c6a5`), Page picker + `lastKnownHref` (`3872c6727`). Open owner call: raw-URL items in other menus (header nav) are still emitted unconditionally.

**Re-measured 2026-09-06 against the running dev site**, with
`curl -sk -o /dev/null -w "%{http_code}\n" https://localhost:3000/<path>` (HTTPS, self-signed cert).
**Every link the footer actually emits today returns 200** — the dead links this was filed for are
gone, and the footer no longer hardcodes page links at all. What survives is the *mechanism* (still
able to produce a guaranteed 404, but only through one narrower route than originally described)
plus a tracked-vs-live drift that would reinstate the original bug on any reinstall.

**The footer's links are menu-driven now, not hardcoded.** The live
`render/partials/footer.html` ships two menu embeds — `{"type":"menu","id":"footer-resources"}`
(Resources) and `{"type":"menu","id":"menu-footer-nav"}` (Legal) — each wrapping authored fallback
markup. Both resolve against real stored menus, not the fallback: the rendered `/about` footer
carries `aria-current="page"` on both About links, an attribute only `renderMenuLinks`
(`static-render.ts`) emits and which the authored fallback markup cannot produce. The `Account`
column (`/signin`) is still commented out, so it emits nothing.

### Status, measured 2026-09-06

| Path | Code | Emitted by the footer? | Served by |
| --- | --- | --- | --- |
| `/docs` | 200 | yes — `footer-resources` | content row |
| `/articles` | 200 | yes — `footer-resources` | content row |
| `/about` | 200 | yes — both menus | content row |
| `/contact` | 200 | yes — `menu-footer-nav` | content row |
| `/faq` | 200 | yes — `menu-footer-nav` | content row |
| `/terms-of-service` | 200 | yes — `menu-footer-nav` | content row |
| `/privacy-policy` | 200 | yes — `menu-footer-nav` | content row |
| `/signin` | 404 | no — column commented out | — |
| `/team` | 404 | no — no longer in `menu-footer-nav` | — |
| `/blog` | 404 | no | — |
| `/changelog` | 404 | no | — |
| `/signup` | 404 | no | — |
| `/pricing` | 404 | no | — |
| `/download` | 200 | no | content row |
| `/documentation` | 301 | no | `Location: /docs` |

"Served by content row" is load-bearing, not incidental: the live `theme.json` has
`publishedPages: []`, so **no theme page is routable at all** right now. `/about` returns 200
because a Post/Page row owns that slug, not because `about.html` is being served — live `/about` is
15,555 bytes titled `What Is Tovu?`, while the theme's own `about.html` is 4,324 bytes titled
`About — Tovu`. Same story for `/docs` and `/download`.

### Structural analysis — confirmed vs. refuted

Checked against `apps/website/src/features/theme/theme.ts`,
`apps/website/src/features/theme/static-render.ts` and
`apps/website/src/server/inbound/public-http/routes/site/pages.ts`.

- **CONFIRMED — `publishedPages` is an explicit allowlist, separate from `pages`.**
  `isStandaloneThemePage` (`theme.ts:706`): an absent array means nothing is published, a present
  array means only its entries are. `theme.json`'s `pages` is the candidate set, nothing more.
- **CONFIRMED — an unlisted page 404s outright rather than merely being unlinked.** The live route
  gates on it: `isMarketingPageSlug` (`pages.ts:981`) is
  `tier === "static" && isStandaloneThemePage(...)`. Measured proof: `changelog`, `signin` and
  `signup` are all listed under `pages` in the live `theme.json`, and all three 404.
- **REFUTED as written — "the footer partial links to pages unconditionally."** It no longer links
  to pages at all; it embeds menus. And `renderMenuLinks` (`static-render.ts:244`) filters on
  `item.available`, so a menu item whose *content target* has been deleted or unpublished is dropped
  entirely rather than rendered as a dead link.
- **CONFIRMED but narrowed — the "guaranteed 404 by construction" hazard is real, and scoped.**
  Nothing in the menu path consults `publishedPages`: `resolveStaticMenusForRender`'s
  `resolveTargetHref` (`pages.ts:410`) resolves through `urlFor` against the post repo only. So the
  availability filter protects content-ref items and nothing else — a menu item authored as a **raw
  URL**, and any hardcoded `<a href="…">` left in a partial, is still emitted unconditionally and can
  still be a guaranteed 404. That is exactly the shape `/team` had.
- **`/team`, restated.** The original diagnosis (a `menu-footer-nav` item, not a theme page) is
  consistent with the mechanism above, but it is no longer a live defect: `menu-footer-nav` now
  renders About / Contact / FAQ / Terms of Service / Privacy Policy, with no Team item. `/team`
  itself still 404s; nothing links to it.

### Measured 2026-09-06: every footer menu item is a raw URL, so none of them is protected

The open question above — whether the stored footer items are content refs (which get
`renderMenuLinks`' `item.available` filter) or raw URLs (which do not) — is settled. Read read-only
from `sites/tovu-com/content.db`, table `menus`, column `doc_json`: **all eight items in both footer
menus are `"target": {"kind": "url", "href": "…"}`.** Not one is a content ref.

Note the slug is `footer-nav`, not `menu-footer-nav` (the embed id in the partial differs from the
stored menu's slug — worth confirming which one the resolver keys on).

```
footer-nav       About /about · Contact /contact · FAQ /faq ·
                 Terms of Service /terms-of-service · Privacy Policy /privacy-policy
footer-resources Docs /docs · Articles /articles · About /about
```

**Consequence:** the availability filter protects nothing in the footer today. All eight links are
emitted unconditionally. They return 200 only because a content row currently owns each slug —
delete or unpublish any one of them and the footer emits a silent 404 with nothing to catch it. So
option 2 below is **not** already safe as live state; it is one unpublish away from the filed bug,
and adopting it means actually re-authoring these eight items as content refs, not just declaring
the current arrangement canonical.

### Drift: the tracked copy would reinstate the original bug

`sites/` is gitignored, so `content/themes/static/basic/` is what a reinstall or upgrade deploys —
and it is still the **pre-fix** footer. Tracked `render/partials/footer.html` hardcodes
`pricing.html`, `blog.html`, `docs.html`, `about.html` and `signin.html`, and carries only the
`menu-footer-nav` embed (no `footer-resources`). Tracked `theme.json` has **no `publishedPages` key
at all** — which, per the contract above, means nothing published. Deploy that pair and the footer
is five hardcoded links against zero published theme pages: `/pricing`, `/blog` and `/signin` are
outright 404s today, and `/docs` and `/about` would survive only by accident, because content rows
happen to own those slugs. This is another instance of the `content/themes/` vs `sites/` drift entry
above.

### Fix options — owner's product decision, not implemented here

`/team`'s menu-driven root cause may want a different answer from the rest: the general fix for a
raw-URL menu item pointing at nothing is either an availability check for raw URLs or a rule that
menu items must be content refs — neither of which is a `publishedPages` change.

---

## 🐛 BUG, filed 2026-08-30 — opening the assistant dock corrupts the Visitor's AI Assistant form state

**PARTLY (re-audit 10-04):** likely fixed by `852b83c1c` + `275ab4571`; needs one live browser repro to close.

**Reproduced twice in a real browser** (per this audit's dispatch brief, which this entry files
verbatim plus a source-level lead): opening the admin `AssistantDock` flips a working, saved Gemini
key's status from `Key works — 39 models available` to `API key not valid. Please pass a valid API
key.` plus `Not saved yet — press Save.` A page reload restores it, so nothing is actually persisted —
but the **Save button is left enabled over a bad value**, which is the dangerous part: an operator who
doesn't reload and just presses Save could overwrite a good stored key with garbage.

**Not fully root-caused this pass** (would need a live repro session, which this audit didn't run —
see `[[feedback_live_agent_tests_via_browser_not_cli]]`), but a concrete lead worth checking first:
`AiAssistant.tsx`'s `VisitorCredentialForm` (`apps/admin/src/features/ai-assistant/hooks/
use-visitor-credential-form.hooks.ts`) owns this exact string pair (`ai-assistant-i18n.ts`: `"Key
works — {count} models available."` / `"Not saved yet — press Save."`) and has a "discovery on load"
effect (`useEffect` keyed on `[stored?.isSet, baseUrl, protocol]`) that re-probes the provider with
`{ ...config, apiKey: "" }` whenever `stored.isSet` flips — relying on the server substituting the
already-saved key. Separately, `AssistantDock.hooks.tsx`'s `useLocalCliSelection` (line ~511) reads
and, on a change, writes+broadcasts `EXECUTION_NAMESPACE = "core.execution"` via
`publishSettingsRefresh([EXECUTION_NAMESPACE])` — the same namespace `execution-settings.ts`'s header
comment says drives a `useSettingsSlice.refresh()` that "replaces the WHOLE in-memory value with
whatever `loadExecutionConfig` returns" on **any** out-of-band settings-changed signal, including a
same-tab echo. That mechanism is documented there as specifically an ADMIN-BYOK-key problem
(`reconcileExecutionConfigRefresh`), and `execution-settings.ts`'s own header says "Settings →
Execution mode deliberately does NOT opt in [to the stored-credential probe] — different key" from the
Visitor's site credential — so it's not a proven match. Flagging it because it's the only shared
mechanism found by grep in the time available (`EXECUTION_NAMESPACE`, `publishSettingsRefresh`,
`reconcileExecutionConfigRefresh`), not because it was confirmed to fire on the Visitor form. Next
step: reproduce with the browser devtools Network tab open on the Visitor's AI Assistant screen while
opening the dock, and see whether a `listModels`/discovery call fires with an empty or stale key at
the moment the dock opens.

## LATER — Local Postgres in the desktop app via PGlite (owner, 2026-09-27; NOT now)


## MEDIUM-HIGH — Close the gaps where EmDash is ahead (owner, 2026-09-28)
Source: `ADS-memory/reports/2026-09-28-emdash-vs-tovu.md` (§3, §4 ranked borrows with EmDash file paths). EmDash is MIT (© 2026 Cloudflare): copied code needs the MIT header + NOTICE entry.
1. **Sandboxed site plugins.** Tovu site plugins run in-process with full Node access (`apps/website/src/features/plugin-runtime/loader.ts`). EmDash: V8 isolate / workerd sidecar, env allowlist, capability-checked bridge, CPU/memory/subrequest/wall limits.
2. **Signed plugin installs.** Signed publisher records, checksum + provenance, minimum release age, consent hash that re-asks when a plugin's permissions grow (for agent plugins: when `mcp.json` grants grow, reuse the Confirm card).
3. **Multi-dialect storage, one migration set,** every suite run on each dialect (in progress: PGlite work).
4. **Portable plugin data:** one JSON document table + expression indexes instead of per-plugin `p_<id>__*` DDL (behaviour change; needs owner call on details).
5. **Outside-agent access:** public MCP endpoint + OAuth server + scoped tokens, per-plugin MCP scopes (needs security ruling).
6. **Logical site export/import** that works on any database, with a write fence during transfer.

## LATER — Integrate workerd (Cloudflare's open-source isolate runtime) (owner, 2026-09-28)
One sandbox runtime that runs anywhere (Node, desktop, any server); Cloudflare's hosted "Dynamic Workers" are the same idea but Cloudflare-only. Cost: a native `workerd` binary in the desktop bundle. EmDash runs it as a sidecar on Node (`/Users/la/Programming/OSS-Repos/emdash/packages/workerd/src/sandbox/`). Uses, most valuable first:
1. **Site server functions** — small owner/assistant-written functions (form handler, webhook, chat proxy) run next to the site. Fixes the dead chat widget on static exports.
2. **Sandboxed site plugins** — see "Close the gaps where EmDash is ahead" #1.
3. **Assistant "code mode"** — the model writes one script that calls several tools, run in a sandbox: fewer round trips (see `@cloudflare/codemode`).
4. **Untrusted theme/embed code** — render custom template code or raw HTML/embeds server-side safely.
5. **Cloudflare deploy target** — local preview identical to production if Tovu adds deploy-to-Cloudflare.
6. **Multi-site hosting** — many sites as isolates in one process if Tovu is ever hosted for customers.
7. **Agent plugins with code** — sandbox them if agent plugins ever ship executable code.

## LATER — Public site search bar (owner, 2026-09-28; parked)
Plain keyword search for visitors (not AI). Verified choice: `minisearch` (no dependencies, runs in the browser, works on static exports). Rejected: `pagefind` (~115 MB native binaries in the desktop app). Open: where the box goes (header, /search page, or both). Details: `ADS-memory/reports/2026-09-28-build-vs-borrow-verified.md`.

## LATER — Per-domain general tools (owner, 2026-10-05; parked — "save the chat tool stuff for another time")
- Proposals: `development/assistant-prompts/general-tools-proposal.md` (Claude Opus 5.5, 48361d8a7) and `general-tools-proposal-codex.md` (Codex gpt-6.1-sol). Both: define each action once (Jini), generate the admin route + chat tool from it; per-domain action tables; vendors as category adapters.
- Owner decisions: approved per-domain tables; prototype on **comments**; publish (CMS) and deploy (DevOps) are **two** domains; resetting another user's password stays **out of chat**.
- Needs first (Jini): per-action read-only/risk, action name in audit log, per-action describe. Measure action-pick accuracy (≥95%) before collapsing to one id per domain.
- Also: secrets copy when the vendor token can't read values — read the value from the target app itself (as done by hand for TOVU_SITE_KEY on 2026-10-05), never fall back to the local site key.
- Testing the tools in chat: owner wants it, NOT now.

## FIRST AFTER 0.1.13 — Forms v2, filterable list widget, member sign-in widget (owner, 2026-10-08)
- Owner: "among the first things we do after we finish the 0.1.13 release". Not in 0.1.13 (needs its own testing).
- Order: (1) owner critiques the Codex design draft `ADS-memory/.local-artifacts/plannie-recon/WIDGETS-DESIGN-draft1.md` (+ coordinator's 4 concerns: ADR-025 plugin-script authority, simultaneous multi-site vs restart-switching, collection-owner move scope, no time estimates; + its 8 owner questions); (2) Codex turns it into specs + contract tests (read-only); (3) three parallel Codex build jobs.
- Forms v2 (most important) in @jini-ai/cms/forms: native HTML first (select, multi-select/checkbox group, radio, tel+country, url, number/range, date/time/range, file + multi-file via an injected AttachmentStorePort defaulting to the cms media blob store, multi-step, repeating groups, captcha port, hidden/UTM, prefill, conditional logic); opt-in vanilla libs only where native is weak (Tom Select, intl-tel-input; FilePond deferred).
- Filterable list widget in @jini-ai/cms/widgets: any collection, allowlisted filter/search/sort fields, URL query contract, server-rendered chips/paging (works without JS), optional "near me" (geocoder port; SQLite rtree/geopoly/math + FTS5 verified in our better-sqlite3), CollectionQueryPort with SQLite/Postgres adapters.
- Member sign-in widget: provider-agnostic MemberAuthPort; adapters (magic link, generic OAuth/OIDC for Google/Apple/LinkedIn/GitHub via @jini-ai/oauth, Supabase); injectable brand-compliant buttons; secrets sealed via credential_save + credential cards, AI only handles credential ids, decrypted server-side only.

## MUCH LATER (owner 10-08: "not now at all"; needs design + S3/AWS testing) — Media in object storage, any host (owner, 2026-10-08: storage costs; deploy on Fly/Render/Railway, media elsewhere)
- EXISTS: S3-compatible BlobStorePort adapter `apps/website/src/features/media/blob-store.s3.ts` (aws4fetch SigV4; AWS S3, Cloudflare R2, Backblaze B2, Wasabi, MinIO), env-selected `TOVU_MEDIA_BLOB_STORE=s3`; private bucket, bytes proxied via `/m/...`; site backup notes media are excluded when s3.
- Owner 10-08: storage vendors should be PLUGINS (future: GCS, Azure Blob, NAS, …). Shape like deploy/resend: core keeps the BlobStorePort + local disk default; each vendor adapter ships in a first-party plugin via a "media storage" extension point. Guard: the ACTIVE storage plugin can't be disabled/removed until media is migrated off it.
- Gaps: (1) env-only config → admin + chat credential card (sealed), "media storage" as a category with vendor adapters; (2) no migration of existing local media (copy → verify sha → switch); (3) all bytes proxy through the app host (egress cost) → optional direct delivery (R2 zero egress, signed URLs, CDN/public bucket for public renditions); (4) generic adapter lives in Tovu → move into Jini next to the port; (5) optional first-party agent plugin with the know-how (which provider, bucket/key setup, failure meanings), like deploy.

## MUCH LATER (owner 10-08: "way too much to do now"; design, scheduling, S3/AWS testing) — Automatic database backups (owner, 2026-10-08)
- Today: site backup = consistent SQLite snapshot (online backup API via DbOpsPort.captureRestorePoint) + uploads/themes/plugins/settings + tovu-backup.json manifest, pushed to GitHub via the github plugin (features/site-backup); restore points before gated mutations. Appears on-demand only.
- Add: (1) automatic schedule; (2) object-storage target (S3/R2/B2, reuse the storage adapters/credential flow); (3) continuous replication option (Litestream-style WAL streaming, point-in-time restore); (4) retention (e.g. 24 hourly / 30 daily / 12 monthly); (5) encryption at rest; (6) one-click restore + periodic automated restore test; (7) media backup = bucket versioning/replication or include uploads when on local disk. 3-2-1 rule. DB is small (MB–hundreds of MB); media is the bulk.

## AFTER 0.1.13 — Playground/A2UI data table + charts look bad (owner, 2026-10-08; screenshots ADS-memory/.local-artifacts/screenshots/2026-10-08-playground/)
- Charts: Recharts 3 (Jini ui providers/recharts) with default styling → theme it shadcn-charts style (rounded bars, gradients, refined axes/grid/tooltips, colours from theme CSS variables; no new dep). Later: Apache ECharts as a second provider for advanced charts. Use the dataviz skill's palette/validator.

## AFTER 0.1.13 — Consent / cookie banner (CCPA, GDPR) for every site (owner, 2026-10-08)
- PLUGINS: regional text/policy packs; adapters for external CMPs (OneTrust, Cookiebot, CookieYes — Plannie uses CookieYes). Existing agent plugin `site-compliance` (evidence-based privacy/cookie/a11y screening, never asserts a verdict) audits/configures it. Tovu provides the mechanism, not legal advice.

## AFTER 0.1.13 — Bring-your-own chart library: chart providers as plugins (owner, 2026-10-08: "as flexible as possible", Recharts/ECharts/Nivo/…)
- Foundation exists: Jini ui interactive-ui registry already has multiple PROVIDERS per component kind (shadcn, native, recharts) with preference order + fallback.
- Design: (1) one library-neutral ChartSpec (type, series, axes, labels, formats, theme-token colours; Vega-Lite-lite) that agents/data write once; (2) chart libraries = provider plugins rendering ChartSpec (ECharts pack, Nivo pack, user packs); core keeps the themed Recharts default so charts always work; (3) site-wide default library setting + per-chart override + automatic fallback; (4) plugins may register NEW chart kinds (sankey, heatmap, calendar) discoverable via search_components.
- OWNER 2026-10-09, plan of record: (1) check the 0.1.13 Playground table + charts visually (Claude in Chrome); (2) PROTOTYPE: COPY (not move) the shadcn-style Recharts provider out of @jini-ai/ui into a plugin (chart-provider plugin package, statically bundled first), register it as an interactive-ui chart provider, then have the admin assistant chat visualize real data through it and confirm it renders; (3) if it works, EXTRACT all charts from @jini-ai/ui (ui keeps only the chart contract + table fallback).
- Platform decisions: runtime-loading plugin React components into the built Vite admin (shared React via import maps/module federation vs sandboxed iframe per library); public-site charts without React → server-side SVG (ECharts SSR); trust = first-party plugin review/integrity rules.

## AFTER 0.1.13 — Run multiple sites at once on different ports (owner, 2026-10-08)

## AFTER 0.1.13 — "How Tovu works" agent plugin: a meta tool for learning the site (owner, 2026-10-08)
- NOT tool search (that finds callable actions). This explains what the site can do, how pieces fit, and where to look next ("for forms look here; for Jini capabilities look here").
- Motivation: a "design this site" prompt (e.g. Plannie theme + pages) doesn't know forms/widgets/markers exist; tovu-theme skill mentions widget regions once and never teaches the building blocks.
- Owner 10-08: ship it as a FIRST-PARTY agent plugin ("How Tovu works") so the knowledge updates without a Tovu release. Shape: core keeps a generic `site_guide` tool shell + a read-only site-facts port (installed plugins/themes, widget types, form field types, markers, members on/off, caller permissions); the plugin supplies topics/explanations/workflows/pointers via a NEW extension point (like deploy's platforms / resend's mail adapter .mjs). Other agent plugins can contribute topics. Today agent plugins get tools only via mcp.json (external, public API only) or first-party .mjs at fixed extension points; no extension point exposes registries/permissions yet. VERIFY: can a bundled first-party plugin update independently (Marketplace tab) or only with a Tovu release?

## LATER — Second real site: rebuild plannie.com on Tovu (multi-site dogfood) (owner, 2026-10-08; parked, "not doing anything now")
- Recon + gap table: `ADS-memory/.local-artifacts/plannie-recon/REPORT.md` (Softr + Airtable marketplace for event planners; Tovu covers ~60%).
- Owner rule: build only ABSTRACT pieces that work for most sites (into Jini/Tovu core); anything Plannie-only lives under `sites/` with a paradigm for highly site-specific code. Calendly = a plugin (+ maybe a page / agent plugin).
- Generic gaps found: per-entry public pages for collection/custom-type entries; a visitor-facing filterable list widget (filters/search/paging); member sign-in/sign-up widget for themes; richer form fields (select, phone, URL, multi-select, file upload, multi-step); wiring plugin-contributed widgets + routes (declared in @jini-ai/plugins manifest, unwired).
- 8 open owner questions at the end of the report (profiles public?, ledger in Tovu?, Stripe outside?, Fillout vs forms, Google sign-in, Airtable migrate vs sync, member tiers vs operator roles, Jini-first?).
- Codex design draft 1 (widgets model, member sign-in w/ injectable providers+buttons+sealed credentials, filterable list, entry pages, forms v2, sites/ paradigm, build order): `ADS-memory/.local-artifacts/plannie-recon/WIDGETS-DESIGN-draft1.md` — awaiting owner critique.

## HIGH PRIORITY for 0.1.14 — Hardwiring + duplication cleanup, Jini first (audits 2026-10-08; owner: "high priority to fix next release"; not hurting anything today)
Audits: `ADS-memory/.local-artifacts/audits/2026-10-08-hardwiring-broad.md` (25 findings + guard list) and `ADS-memory/.local-artifacts/audits/2026-10-08-fetch-hardwiring.md`. In 0.1.13 already: broad #4 (comments IP salt), #5 (agent permission bypass outside production), #19 (handlers resolving the site from env), #21 (owner-password env read in a feature module); fetch-query MUST FIX 1–4.
- Injected ports instead of hardwiring: Jini research route hardwired to Tavily (#6); media stores self-loading better-sqlite3 (#7); legacy SQLite singleton (#8); vendor base-URL catalogs in 3 places with mismatched ids, e.g. nano-banana vs nanobanana (#13); agent-runtime process-wide caches (#14); daemon passes process.env as hostEnv (#15); ffmpeg env reads + global lock (#16); ~10 Tovu module registries (#17, safe only while one site = one process); TOVU_PUBLISH_CONTENT_DEV_HOSTS read twice (#20); devops HTTP agents built internally (#24); content/chat-db `new Database` directly; widgets lock map never pruned.
- OWNER DECISIONS needed: #9 public sites ship React when the site assistant is on.
- OWNER DECIDED 2026-10-09:
  - #23 Fly-specific deploy settings, including GitHub-for-Fly settings, live in (a copy in) fly.toml. Don't derive every host's deploy config from fly.toml; each host keeps its own file.
  - Fly: Tovu never builds host config from fly.toml; Render, Railway, AWS, Vercel etc. each keep their own native config (owner 10-09).
- 0.1.14 TanStack devtools (owner 2026-10-09): load them ONLY in the Observability page's devtools tab, lazily, and only when the host actually uses TanStack. No floating button, nothing in other bundles. See the "TanStack Query devtools as a tab" item; still needs a visual check of how it looks.

## AFTER 0.1.13 — Admin AI Assistant can spawn subagents, opt-in behind a danger warning (owner, 2026-10-08)
- Option (1) implemented (subag, 2026-10-09; awaiting queued tests and visual verification): the owner-only, default-OFF toggle uses Jini's danger confirmation, persists `core.assistant-subagents.enabled` with an actor-attributed settings revision, and drops only `Task` for new Claude CLI runs. The chat dock shows "Subagents: on" while enabled. Generic settings writes and assistant tools cannot change this grant. Turning it off affects new runs; it does not stop existing subagents. Every other SEC-assistant-env-isolation-2026-09-07 control stays in place. BYOK/API chats and other vendors' CLIs are unaffected.
- Follow-up option (2), NOT built: a vendor-neutral Tovu `delegate` tool in the assistant's own catalog that starts child runs through the shared Jini daemon/runtime with the SAME tool grant/deny list and approval rules, shows each child run in the chat, caps concurrency, and tracks cost — works for Claude CLI, Codex, Gemini and BYOK. Keep the generic delegation lifecycle in Jini; Tovu supplies its CMS permission/audit adapters.

## AFTER 0.1.13 — Admin chooses which tools the Visitor's AI Assistant offers (owner, 2026-10-08)
- Today there is no setting: the visitor assistant has a fixed, code-defined set of six tools (apps/website/src/assistant/site/capability-registry.ts + tools.ts): search_published_entries, get_published_entry, list_categories, navigate_to_entry, scroll_to_entry, highlight_entry. "No config-driven capability list" was an explicit SPEC-046 REQ-0 non-goal (default-deny; unknown names refuse).
- Owner 10-08 (overrules the REQ-0 non-goal: "that's a mistake… use cases can get more complex than we might see"): the admin can open ANY set of tool calls to visitors ("peruse the site, and just do whatever, honestly"), chosen on https://tovu.dev/admin/ai-assistant (Visitor's AI Assistant tab; UI not designed yet). E.g. search posts, search products when selling. Plugins (e.g. a future commerce plugin's product search) contribute visitor-safe tools to that list; nothing is open until the admin turns it on; rate limits and a clear warning when an admin opens a tool that writes data or reaches private data (design TBD). Needs an ADR replacing REQ-0's non-goal.

## NEXT — Change a user's username, in the admin UI AND as agent tool calls (owner, 2026-10-08: 0.1.14, NOT 0.1.13)

## NEXT — Generic CRUD tool layer: close the 38 tool gaps (owner question 2026-10-08: "don't we have an abstract CRUD tooling system?")
- Today: read (`content_read.<resource>`, 28 resources), copy (`content_duplicate`) and delete/restore (`trash_item` / `trash_restore_item` + per-type Trash adapters) are generic. Create and update are NOT: each resource has hand-written tools, so gaps are tools nobody wrote. Coverage table: ADS-memory/reports/tool-crud-coverage-2026-10-08.md (38 gaps: read-one 18, restore 9, update 4, delete 4, list 2, create 1). Theme delete closed by `theme_trash` (9d56f5f3d).
- Restore/delete gaps: add Trash adapters for the remaining types.
- Start after the in-flight theme tool work lands (same registration files).
- OWNER 2026-10-09 (later): PILOT DROPPED after the Codex study (ADS-memory/.local-artifacts/codex/2026-10-09-0114/CRUD-PILOT-STUDY.md: no capability gain, ~3-5 days). Instead Codex fills the 24 gap tools directly (jobs gapa/gapb).

## 0.1.14 — Desktop complexity gate: the 14 functions accepted at ≤15 for 0.1.13 go to ≤10 (owner, 2026-10-09)
- For 0.1.13 the owner accepted complexity ≤15 and the 14 new violations were recorded in apps/desktop's complexity-debt list (desktop-gates commit, 2026-10-09). For 0.1.14, refactor each one to cyclomatic AND cognitive complexity ≤10, then remove its debt entry: project-ipc.ts handleCreate (15) / deleteProject (13) / handleRename (12); renderer/App.tsx App (15); renderer/SiteGrid.tsx SiteCard (10); renderer/site-shell-policy.ts siteOperationError (12); renderer/site-theme-preview.hooks.ts listener (12); renderer/use-tab-strip.hooks.ts navigateTabStrip (11); site-dir-store.ts initSiteDir (10); site-theme-preview-ipc.ts arrow fn (10); site-theme-preview.ts arrow fn (11). List and numbers: ADS-memory/.local-artifacts/codex/2026-10-09-release/desktop-gates-failure.log.txt. Extract well-named helpers, no behaviour change, logic into hooks (not .tsx), move "why" comments with the code. Note: the gate's ceiling is 9, so either lower it to 10 for desktop or get these to 9.

## Later (far off, owner 2026-10-09): Maps plugin (Google first)
- Generic "maps" capability, Google Maps as the first provider adapter (same pattern as the chart-provider plugin; Mapbox/OSM can slot in later).
- Agent-plugin half: captures the Maps key via a chat credential card (per site), tools for geocode/places/"make a map of these places" (server-side keys stay server-side).
- Site half: a map block/widget rendered in the browser; the browser key is public by design, so the setup card tells the owner to restrict it to the site's domain in Google Cloud.
- Must be themeable (jini- classes + host CSS, block options like height/zoom/style) and installable by chat: "install the Google Maps plugin and put a map here" → install + insert the block in one approval.

## REMINDER 2026-11-09: monthly disk cleanup (owner asked 2026-10-09)
- Repeat: delete Claude session scratch older than 7 days (~/.claude/harness-tmp/claude-501, skip live sessions), clear Homebrew downloads / npm _cacache / uv / Xcode DerivedData, delete stray scratch copies (*-gate, *-testbed, release clones in ~/.cache), check stale git worktrees. Have an Opus medium subagent do it and report; owner approves big deletes.

## Owner bugs 2026-10-09 ~19:40 (fix LATER — owner: "don't want stuff restarting" right now)
Screenshots: ADS-memory/.local-artifacts/owner-bugs-2026-10-09/
6. Desktop site-switch QA findings (ADS-memory/.local-artifacts/desk-switch-2026-10-09/REPORT.md, shots/). Switching itself is clean on all 3 sites. MUST: stale startable "tovu-dev" card from the old /Users/la/Programming/Tovu/sites path (existence-only folder check; something recreated sites/tovu-dev/themes at 15:52:57). SHOULD: desktop-started sites get no local owner sign-in (no NODE_ENV=development); folder add+remove writes a cwd default root into config.json; folders saved before discovery is validated + broad-root guard lets ~/Documents, ~/Downloads, /Users through; 2 test-pollution entries in the shared sites.json; raw IPC error text that stays on the sites home; sites:move-home leaves root -shm/-wal + 2 backup copies per DB. Plus 9 NITs. Route: Codex 6.1-sol (≤3) after the owner OKs restarts; UI parts go with #5.
8. Site-only code lives in the site folder (owner 10-09): proposal = site-local plugin in <site>/plugins/<name>/ + one-off scripts in <site>/ops/. Codex + Sonnet opinions: ADS-memory/.local-artifacts/codex/2026-10-09-8c/w4-out/sitecode.md + sitecode-sonnet report. State updates out of scope for now.
Route: Codex 6.1-sol fix + Chrome check (signed-in + 375px) after the owner OKs restarts.

## LOW PRIORITY / LATER (owner 2026-10-17): make switching sites faster (~30 s today)
Switching restarts the whole :3000 server (activateSite → .env TOVU_SITE → dev-restart request file → dev.mjs supervisor kills + respawns `npx tsx watch`). Cheap wins (~6–12 s): (1) skip the fixed 3 s DEV_RESTART_DELAY_MS (dev-restart.ts:24) when the admin button triggers it (keep it for the chat tool), poll the request file at 100 ms not 500 ms (dev.mjs:407); (2) respawn with plain tsx / node --import tsx instead of `npx tsx watch`, trim shutdown grace (close-store-on-shutdown.ts:25/106/111); (3) skip seedBundledAgentPlugins when the bundled digest is unchanged (bootstrap.ts:164) and refresh the Sites list on /readyz instead of the 3 s poll (use-local-sites.hooks.ts:37). Bigger option: swap sites in-process (no restart) — large; see c2 notes 10-17.

## CODEX QUEUE (owner 2026-10-17 ~16:25): failed tool calls in the zoran chat (msg 1ee2b105…, "v2 landing + kUI animations")
1. Delegated-tool args shape: the model called `execute_readonly_delegated_tool` with `{"toolId":"search_agent_plugin_local","query":"kui","input":{...}}` → "invalid arguments … Property "query" does not match additional properties schema". Make the wrapper tolerate/fold stray top-level args into `input` (or return a precise "put args inside input" hint) so it doesn't burn a turn. Add a test.

## LATER: Semgrep first run + triage (owner 2026-10-20: "leave it for later")
Config + custom rules are already in both integration branches (Jini 9fb71257, Tovu 4e0e764ff: `.semgrep/`, `quality:semgrep`, `quality:semgrep:test`, diff-aware report-only CI). Not yet run locally: `brew install semgrep` compiles from source on this macOS (OCaml → LLVM → Rust, hours) — killed 2026-10-20. When resumed: install via `pipx install semgrep` (prebuilt wheel), run `quality:semgrep:test` then `quality:semgrep` in both repos, triage like SonarJS. gitleaks: use the pinned, checksum-verified binary the Jini CI script downloads (no brew).

## Commerce — later (owner 2026-10-21: not now)
- [ ] PayPal provider plugin (L6b) — build after the Stripe plugin (L6a) is merged; use Stripe's conformance suite; needs PayPal sandbox keys.
- [ ] Donations consumer plugin (L9) — example consumer of PaymentsPort + outbox events; tax receipts live here (sequential, deductible).

## Fast site switching — later (owner 2026-10-22)
- [ ] Switching sites must be fast. Today a switch restarts the dev server onto the other site (the admin reconnects after several seconds), and an earlier agent called making it fast "quite a refactor". FIRST: a short written explanation for the owner of what the refactor involves (why switching restarts today, what state is per-process vs per-site — DB connections, kernel/content stores, theme registry, agent daemon, plugin registry, Vite — and the options: keep one process per site and switch the admin's target instantly vs. one process serving many sites), with cost and risk per option. THEN decide and build.

## kUInetic loading in themes — HIGH PRIORITY right after the big merge (owner 2026-10-22)
- [x] (DONE 2026-10-22, on main + deployed code; prod theme on the volume still needs updating) Stock themes (tovu-starter 54 pages, tovu-theme 13 pages) repeat a jsDelivr `kuinetic@0` CDN tag + `document.write` fallback on every page. Replace with ONE local tag in the shared footer partial: `<script src="…/scripts/vendor/kuinetic.all.min.js" defer></script>` (no CDN, no document.write, no unreviewed @0 updates). Remove the per-page copies; update the tovu-theme agent plugin guidance (local file only); quick Chrome check that animations still run. Existing site themes (tovu-dev, plannie, zoran, …) updated per site on request. (Alternative the owner may still pick: an add-kuinetic.js loader with pinned CDN + fallback + a kuinetic:ready event.)

## Admin accent: add "Tovu gold" (owner 2026-10-22)

## CRITICAL: email (owner 2026-10-22)
- [ ] **CRITICAL** — tovu.dev sends NO email: no mail provider selected since the mail contract v1 deploy (sign-in links, confirmations, form notifications all silently dropped; before, they only went to the console log). Pick a provider (Resend plugin, or SMTP from a free-tier service), save its key under Access Tokens, verify the sending domain (DNS), send a test. Also local dev. The "Email is not set up" banner is now dismissible — dismissing it does not fix email.

## Admin UI consistency check (owner 2026-10-22, small)

## New-site password — proper fix LATER (owner 2026-10-22)
- [ ] For now (owner, ~10:15 AM PT): when "different admin password" is left blank, onboarding SHOWS the starter password so people messing around can sign in. Later: decide the real flow (require the field, or force a change-password step on first sign-in) — showing a shared default password is not OK for real/deployed sites. Context: bug-analysis A-3 (CreateSiteOnboarding.tsx ~313-320, DEFAULT_OWNER_PASSWORD).

## Commerce risk / geo / fraud-graph design pass — LATER (owner 2026-10-22: "I don't want to do that now")
- [ ] Design pass for commerce risk scoring, geo rules and the fraud graph (from the 10-21 commerce decisions: multi-DB + geo + fraud graph). Not started. Ask the owner before starting.

## Move remaining vendor code out of core into its plugins — BIG, later (owner 2026-10-22: "let's wait")
- [ ] Codex plugin audit (2026-10-22, `.cloud-coord/plugin-audit.md` on branch codex/nonui-2026-10-22, commit 46a03a47d) lists vendor code still in core: GitHub deploy provider (`features/deployments/providers/github.ts`, JWT/API/status mapping), closed GitHub/GitLab/Bitbucket list + credential union (`features/source-control/store.ts`, `types.ts`), hard-coded `github` staging dir (`commit-site.ts`), GitHub-only source selection (`composition/app.ts`), Cloudflare DNS-over-HTTPS resolver (`composition/domain-dns-adapters.ts`), plus earlier leftovers (FLY_* env reads, vendor search keywords, LiPay in core, Supabase options in admin/desktop). Owner rule: ALL vendor code/tests/workflow steps live in the plugin; core consumes generic declarations. Keep deploy-split-activation.ts / bundled-catalog.ts for the owner's own review.

## Small UI leftovers — next local UI round (Opus + Chrome)
- [ ] Email page "needs attention" line still says "See Provider and Sender below" — now tabs, not below.

## Email — PARKED (owner 2026-10-22 night: "let's not focus on email right now")
- The admin "Email is not set up" banner is unmounted while email is parked (2026-10-23). Re-mount MailStatusBanner in apps/admin/src/App.tsx when email resumes.
Email nav stays SOON until these land.
- [ ] Email senders phases 2–5 (plan: ADS-memory/.local-artifacts/codex/2026-10-22-email-sources-plan/PLAN.md + REVIEW.md): forms send their own emails (delivery binding + plan/freeze send), Email automations page, sign-in secret fields ({{code}}/{{sign_in_link}}/{{reset_link}}, no temp passwords), durable outbox (production sends no background mail until then — durableOutboxReady=false).
- [ ] Template {{fields}} have no data source until senders phase 2 (preview samples only).
- [ ] Senders phase 1 (Jini, jini-int codex/email-senders-p1 57fbd0d2): committed, untested, unreleased → Jini cloud test + release.
- [ ] Decide: delete sent-email records after 30 days (implemented 500b5c5bd) — owner to confirm.
- [ ] Decide: auto-delete captured test emails after 24h + "clear all" button (they keep working sign-in links) — Q21.
- [ ] Guided "Connect email" flow (SMTP under advanced) — Q18/25 suggestion.
- [ ] tovu.dev: save the Resend key ON tovu.dev itself (no localhost→prod key transfer), set a sender address, check Resend domain verification (needs full-access Resend connect or the Resend dashboard).
- [ ] LATER idea: encrypted key transfer localhost → production (owner: "not right now").

## Cookie Consent — THOROUGH TEST before it loses its SOON tag (owner 2026-10-22 night)
Nav shows SOON until this passes. Test end-to-end, in Chrome, on a real site, light + dark, desktop + 375px:
- [ ] Banner on first visit; optional scripts/cookies inert before a choice; privacy link opens the real published Privacy Policy page (auto-created/linked per site, 9ff4f9ee8).
- [ ] Reject / Accept / per-category Save / Do Not Sell each SAVE FROM THE BANNER UI (JS) — the save bug (form.action shadowed → POST /[object RadioNodeList]) is fixed in Jini 0ca4d2a1; verify after the Jini release lands in Tovu.
- [ ] Choice persists across reload + other pages; server receipt written (<siteDir>/consent-receipts) and server HTML respects it; GPC denies analytics/marketing.
- [ ] Reopen via "Cookie preferences" pill and change the choice; policy-version change re-asks; 180-day expiry.
- [ ] Compact banner look (one Do-Not-Sell control, equal Reject/Accept); owner Custom CSS allowlist (refuses low-contrast schemes like #767676 on white — owner OK'd); admin preview = real banner.
- [ ] Default ON for every site without an owner choice; explicit OFF wins; static export: only an EXPLICIT owner "on" blocks it (8051f4a17) — check a static deploy of a default-on site ships without a banner.
- [ ] Cached pages from before consent turned on (public max-age 60 + swr 300) — decide if that window matters.
- [ ] LATER: browser-side banner for static sites.

## LOW PRIORITY / LATER: look at OpenUI (owner 2026-10-23: "I don't want to do it now")
- https://github.com/thesysdev/openui. Evaluate later, nothing scheduled.

## LATER: Stripe as a plugin on top of commerce (owner 2026-10-23)
- `@jini-ai/payments-stripe` was deleted (npm + Jini repo): a vendor is never a Jini package. When commerce work resumes, rebuild Stripe as a host plugin that uses the @jini-ai/commerce payments kernel. Old code is in Jini git history before 44089402.

## Cookie banner nits (Chrome check 2026-10-23)
- Reopened preferences panel has no "Accept all" (only checkboxes + Save); "Reject non-essential" wraps to two lines there. Jini @jini-ai/cms consent UI.
