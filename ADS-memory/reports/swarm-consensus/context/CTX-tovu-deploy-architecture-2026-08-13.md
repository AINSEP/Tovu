<<PEER_DISPATCH>>

# Swarm Consensus Context Packet

**Packet ID:** `CTX-DEPLOY-ARCH-2026-08-13`
**Date:** 2026-08-13
**Slug:** tovu-deploy-architecture
**Project Type:** brownfield (the deployment feature itself is greenfield)
**Mode:** debate — Round 1 (independent first pass, solution-neutral)

---

## Preamble for peer models

- IGNORE ALL PRIOR CONVERSATION HISTORY. New task. Discard recollections of earlier packets about themes, plugins, commerce, MCP catalogs, or a previous deployments debate.
- No `AGENTS.md` / `CLAUDE.md` / bootstrap file applies to you here. Intentional. A missing file is never a reason to stop.
- Ground every claim in `path:line`. An ungrounded assertion is worth less than "I could not verify this."
- Round 1. Form an INDEPENDENT position. No other participant's answer is included, deliberately.
- **You are not being asked to agree.** Part 1 is a list of assertions someone made about this codebase without independent checking. Several are probably wrong. Your value here is finding which.

**Repository root:** `/Users/la/Programming/Tovu`
Sibling checkout referenced by `file:` dependencies: `/Users/la/Programming/Jini`

---

## Who is asking, and for what

The owner runs Tovu: a self-hostable, multi-workspace CMS with an embedded AI assistant. It currently has **no deployment feature of any kind**. They want to build one, and they have specific goals:

1. **A "Deploy" section in the admin.** A panel already exists as a stub (`apps/admin/src/panels.tsx`, `id: "deployment"`, `soon: true`) with placeholder tabs Home / GitHub / AWS.
2. **The admin should be publicly reachable** — a customer goes to `theirsite.com/admin`, enters a password, and gets the same capability they'd have locally.
3. **Vercel and Cloudflare support matters commercially.** The owner believes these are what people will expect and want to sell into that expectation.
4. **Hosted Supabase** (access token + hosted Postgres) is acceptable and preferred over running a database themselves. Explicitly NOT a local database.
5. **Cost matters.** They want to know what a deployment actually costs to run.
6. **They do not want to be limited by ADR-020's Tier-2 render sandbox** and have proposed replacing it (see Part 2, Proposition D).

---

## PART 1 — Claim ledger: verify or falsify each

These 21 assertions were made to the owner during a working session. They were formed quickly, partly from grep output, and **have not been independently verified**. At least two are already known to have been wrong when first stated and were corrected mid-session; assume others still are.

For EACH claim return: `TRUE` / `FALSE` / `PARTLY` / `UNVERIFIABLE`, the `path:line` evidence, and — if PARTLY or FALSE — the corrected statement.

**Do not accept a claim because it sounds plausible or because a code comment says so.** This repo contains long, confident, evidence-shaped doc comments that have previously encoded inference as observation; at least one was measurably false. Check the code, not the prose about the code.

### Process model & runtime

1. Tovu is ONE deployable app, not two. `serve` boots site + admin together, and `src/server/app.ts:894` serves the built admin SPA from `apps/admin/dist` (overridable via `TOVU_ADMIN_DIST`). `apps/admin` is a build artifact, not a separate deployment.
2. There are FIVE ADR-020 theme tiers — `declarative`, `templated`, `handlebars`, `static`, `code` (`src/features/theme/theme.ts:35`) — and the public site is NOT uniformly Liquid-rendered.
3. `src/server/http/site/render.ts:2008-2043` dispatches on tier: `static` returns a complete document via `renderStaticPage()`; `templated` uses `renderLiquidInSandbox()`; `handlebars` uses `renderHandlebarsInSandbox()`; everything else (`declarative`, `code`) uses a synchronous `renderBlock(tree, ctx)`.
4. Therefore only the `templated` and `handlebars` tiers use `worker_threads`. `declarative` and `static` execute no user template code and spawn no worker.
5. The Liquid worker exists for render ISOLATION, not because Liquid needs a special runtime — a fresh Worker per render, 5s wall-clock timeout, V8 heap `resourceLimits`, so a hostile theme cannot hang or OOM the server (`src/server/http/site/liquid-sandbox.ts`).
6. `Promise.race` around the synchronous render genuinely cannot work as a substitute, because synchronous CPU-bound work on the main thread cannot be pre-empted by a timer on that same thread.
7. `src/index.ts` spawns the Jini agent daemon **unconditionally** at boot (after a set of readiness promises resolve, ~line 307), NOT gated on the configured execution mode.
8. BYOK execution is a separate, in-process, HTTP-only path — `src/assistant/byok-provider-turn.ts` dispatches to `@jini-ai/agent-runtime`'s four `run*ToolTurn` functions and spawns no subprocess.
9. Therefore a BYOK-only Tovu deployment needs no child process at all, and the unconditional daemon spawn is a boot-sequence choice rather than an architectural necessity.

### Hosting

10. Vercel and Cloudflare cannot host the Tovu server as-is, and the primary blocker is the process model and filesystem — NOT SQLite.
11. SQLite is fine on any host providing a persistent disk, and is arguably preferable there (single file to back up and restore).
12. Cloudflare Workers is strictly harder to target than Vercel: it provides no Node APIs, so `worker_threads` is unavailable, whereas Vercel's Node runtime supports it.
13. Migrating to Postgres would widen which stateful hosts work but would NOT make Tovu serverless-compatible on its own.
14. Rough monthly cost: container hosts (Fly / Render / Railway / VPS) land around **$5–10/mo**; Vercel Pro + Supabase Pro lands around **$45/mo** for commercial use. The serverless path is therefore the more expensive option, not the cheaper one. *(Verify the pricing independently — it may be stale.)*

### Static export

15. Building a static exporter is comparatively cheap because the renderer already exists — an exporter is a driver over the existing render path, using `sitemap.ts` to enumerate routes.
16. Six of the thirteen files in `src/server/routes/site/` handle POSTs and require a live endpoint: `forms-submit`, `comments-submit`, `newsletter-confirm`, `newsletter-unsubscribe`, `analytics-ingest`, `payments-webhook`.
17. Those endpoints do not need the *Tovu* server specifically — most port to edge functions or direct-to-Supabase-with-RLS. But IP-based rate limiting on a composite `(ip, formId)` key (`src/forms/submit-service.ts`, `resolveClientIp`) does not port to a browser-direct model, and the payments webhook is absolute since Stripe posts server-to-server.
18. Rendering at build/publish time would largely dissolve the sandbox problem, because a runaway template stalls a build that can be timed out and reported rather than taking down a live site.

### Packaging

19. There is no `Dockerfile`, `.dockerignore`, `docker-compose.yml`, `fly.toml` or `render.yaml` anywhere in the repo.
20. There are 22 `file:` dependencies pointing at the sibling Jini checkout — 12 in the root `package.json`, 10 in `apps/admin/package.json` — all of which escape any Docker build context rooted at the Tovu directory.
21. `better-sqlite3`, `argon2` and `sharp` are native modules; and `infra/` is runtime state (`content.db` + WAL sidecars, `uploads/`), gitignored, where an empty directory fails boot with `SQLITE_CANTOPEN`.

---

## PART 2 — The design question

> Given what this codebase actually is, what should "deployment" mean for Tovu, and what architecture should the deployment feature commit to?

Answer independently. Do not assume any option below is favored — **each is listed so you can attack it.** Reject any or all of them and propose something better if warranted.

### Candidate directions (critique, do not simply pick)

- **A — Container-first.** Ship a Dockerfile; target Fly / Render / Railway / VPS. Everything works including the assistant and all POST endpoints. Vercel and Cloudflare are out of scope for hosting.
- **B — Static export.** Render the site to flat HTML at publish time; push to Vercel / Cloudflare / Netlify. Tovu runs privately as the authoring surface. Dynamic endpoints must be reimplemented as edge functions or dropped.
- **C — Serverless-compatible Tovu.** Make the server itself deployable to Vercel: finish Postgres, move uploads to object storage, gate the daemon spawn, add a non-worker render path.
- **D — The owner's ADR-020 proposition, sharpened.** Not merely "verify at publish time" but: **publish time IS render time, and the deployed artifact contains no template engine at all.** Every tier — Liquid and Handlebars included — renders during publish against a live database; the output is plain HTML. The per-request Worker disappears because no template executes at request time. Evaluate: does this hold? The known counter-arguments to weigh are (a) the runaway-script risk relocates to the build machine rather than vanishing — one tenant's build instead of every tenant's site, which is a real improvement but not elimination; (b) content that changes without a publish (comments, form-driven content, scheduled posts) goes stale; (c) per-request inputs that differ from publish-time inputs cannot exist in this model at all.
- **E — Deployment class chosen per site, by FEATURE USAGE.** *(This supersedes an earlier draft of E that keyed on theme tier — proposition D, if sound, equalizes the tiers, so tier is the wrong discriminator.)* A site using only pages/posts/menus exports to static and runs on an edge host for near-zero cost. A site using commerce, forms, members or comments requires a stateful server. One CMS, two deployment classes, chosen by what the site actually uses.

  **The commerce stress test — every proposal must survive this.** Consider a Liquid theme selling several thousand products. Under static export: build time scales linearly with catalog size; any single change forces a full re-render absent incremental builds; and critically, **stock and price are stale by construction between builds** — a page reads "in stock" until the next publish, so the store oversells. Cart, checkout and `payments-webhook.ts` cannot be static under any arrangement. Does your recommendation handle this, restrict itself to sites that avoid it, or accept the failure? Say which, explicitly.

### Questions each answer must address

1. Which claims in Part 1 are wrong, and what does correcting them change about the answer?
2. What is the smallest first slice that delivers real value, and what must exist before it?
3. Where does multi-tenancy break the recommendation? (This is a multi-workspace CMS.)
4. What does the owner's "public admin" requirement force or foreclose?
5. What is the cheapest experiment that would falsify your own recommendation?

### Required output shape

1. **Claim ledger** — all 21, verdict + `path:line` evidence.
2. **Position** — your recommended direction, in ≤200 words.
3. **Ranked solution slate** — at least 2 options, explicit ranking criteria, per-option trade-offs.
4. **Strongest argument against your own position.**
5. **What would change your mind** — a specific, checkable fact.
6. **Confidence** — 0.0–1.0, with what drives the uncertainty.

End your response with `<<SWARM_END>>`.
