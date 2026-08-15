ACK_PACKET_RECEIVED CTX-DEPLOY-ARCH-2026-08-13 -- I received the packet and will work on it.

---

### PART 1 — Claim Ledger

| # | Claim Summary | Verdict | Evidence (`path:line`) | Correction / Notes (if not TRUE) |
|---|---|---|---|---|
| **1** | Tovu is one deployable app; `serve` boots site + admin SPA at `/admin` from `apps/admin/dist`. | **TRUE** | `src/cli/program.ts:44-48`, `src/server/app.ts:894-897` | Verified: `serve` boots site + admin together; `registerAdminStatic` serves `apps/admin/dist` at `/admin`. |
| **2** | Five ADR-020 theme tiers exist; site is not uniformly Liquid. | **TRUE** | `src/features/theme/theme.ts:34-36`, `src/server/http/site/render.ts:2008-2043` | `ThemeTier` union defines `declarative`, `templated`, `handlebars`, `static`, `code`. |
| **3** | `render.ts` dispatches on tier (`static`, `templated`, `handlebars`, and fallback `renderBlock`). | **TRUE** | `src/server/http/site/render.ts:2008-2043` | Dispatches `renderStaticPage` (home route), `renderLiquidInSandbox`, `renderHandlebarsInSandbox`, or `renderBlock`. |
| **4** | Only `templated` and `handlebars` tiers use `worker_threads`. | **TRUE** | `src/server/http/site/render.ts:2008-2043`, `src/server/http/site/liquid-sandbox.ts:1-25` | `declarative`, `static`, and fallback paths execute synchronous AST/string returns without workers. |
| **5** | Liquid worker exists for render isolation (fresh worker, 5s timeout, V8 heap caps). | **TRUE** | `src/server/http/site/liquid-sandbox.ts:7-25`, `src/server/http/site/liquid-sandbox.ts:48-52` | `DEFAULT_TIMEOUT_MS = 5000`, `maxOldGenerationSizeMb: 64`. |
| **6** | `Promise.race` cannot pre-empt synchronous main-thread CPU work. | **TRUE** | `src/server/http/site/liquid-sandbox.ts:12-16` | A timer on the main thread cannot fire while synchronous JS execution blocks the V8 event loop. |
| **7** | `src/index.ts` spawns Jini daemon unconditionally at boot after readiness promises. | **TRUE** | `src/index.ts:299-310` | `Promise.all([...]).then(() => spawnAgentDaemon(deps.workspaceId))` runs without gating on execution mode. |
| **8** | BYOK execution is an in-process, HTTP-only path spawning no subprocess. | **TRUE** | `src/assistant/byok-provider-turn.ts:1-24` | Dispatches directly via `@jini-ai/agent-runtime` adapter turns without child processes. |
| **9** | BYOK-only deployment needs no child process; daemon spawn is a boot-sequence choice. | **TRUE** | `src/index.ts:299-310`, `src/assistant/byok-provider-turn.ts:1-24` | Daemon is invoked at index boot, but BYOK runtime functions entirely in-process. |
| **10** | Vercel/Cloudflare cannot host Tovu as-is, and primary blocker is process/filesystem, not SQLite. | **PARTLY** | `src/server/http/site/liquid-sandbox.ts:1-25`, `.gitignore:16-23`, `root package.json native deps` | **Correction:** SQLite *is* an inseparable part of the filesystem blocker. Serverless environments lack persistent writable local disk for `infra/content.db` and do not support native C++ bindings (`better-sqlite3`, `argon2`, `sharp`) or background worker threads (Cloudflare). |
| **11** | SQLite works on persistent disk hosts and is preferable for simple single-file backup. | **TRUE** | `.gitignore:16-23`, `root package.json native deps` | Persistent volumes preserve `infra/content.db` and WAL files. |
| **12** | Cloudflare Workers is strictly harder to target than Vercel due to missing Node APIs/workers. | **TRUE** | `src/server/http/site/liquid-sandbox.ts:1-3`, `root package.json engines` | Cloudflare's V8 isolate runtime does not support `node:worker_threads` or native C++ modules. |
| **13** | Postgres migration widens stateful host options but does not make Tovu serverless-ready alone. | **TRUE** | `src/index.ts:299-310`, `src/server/http/site/liquid-sandbox.ts:1-25`, `.gitignore:16-23` | Uploads (`infra/uploads/`), native addons, background daemon boot, and worker threads still block serverless. |
| **14** | Container hosts cost ~$5–10/mo; Vercel Pro + Supabase Pro costs ~$45/mo. | **UNVERIFIABLE** | `Evidence Bundle` | The evidence bundle contains zero third-party vendor billing tables or pricing data. |
| **15** | Static exporter is comparatively cheap using existing renderer and `sitemap.ts`. | **TRUE** | `src/server/http/site/render.ts:2000-2048`, `ls src/server/routes/site/` | Exporter drives `renderSite`/`renderStaticPage` across routes enumerated by `sitemap.ts`. |
| **16** | Six of thirteen site route files handle POSTs: forms, comments, newsletter-confirm, newsletter-unsubscribe, analytics, payments. | **FALSE** | `ls src/server/routes/site/`, `POST handlers in site routes` | **Correction:** Exactly **5** route files handle POSTs (`forms-submit.ts`, `comments-submit.ts`, `analytics-ingest.ts`, `newsletter-unsubscribe.ts`, `payments-webhook.ts`). `newsletter-confirm.ts` is not a POST handler. |
| **17** | POST endpoints port to edge/Supabase except composite `(ip, formId)` rate limiting and Stripe webhooks. | **TRUE** | `src/forms/submit-service.ts:60-95`, `POST handlers in site routes` | Client-direct submissions bypass server-side IP extraction (`sourceIp`), and Stripe requires a server-to-server signature-verified webhook. |
| **18** | Publish-time rendering isolates runaway templates to build jobs instead of crashing live sites. | **TRUE** | `src/server/http/site/liquid-sandbox.ts:1-25`, `src/server/http/site/render.ts:2008-2043` | Build failure isolates errors to the admin publish task without taking down the running public site. |
| **19** | No `Dockerfile`, `.dockerignore`, `docker-compose.yml`, `fly.toml`, or `render.yaml` exists. | **TRUE** | `Container files present section` | All five configuration files returned `No such file or directory`. |
| **20** | 22 `file:` dependencies point to sibling Jini (12 root, 10 admin), escaping Docker build contexts. | **TRUE** | `root package.json file: deps`, `apps/admin file: dep count` | 12 + 10 = 22 `file:` dependencies pointing to `/Users/la/Programming/Jini`. |
| **21** | `better-sqlite3`, `argon2`, `sharp` are native modules; empty `infra/` fails boot with `SQLITE_CANTOPEN`. | **PARTLY** | `root package.json native deps`, `.gitignore:16-23` | **Correction:** `@jini-ai/sqlite` is also native. An **absent/missing** `infra/` directory (not an empty one) causes `SQLITE_CANTOPEN` because `openContentDb` does not create the parent directory; `infra/README.md` is tracked to keep it present. |

---

### PART 2 — Position

Tovu must commit to a **Container-First Unified Appliance architecture** targeting persistent-disk container hosts (Fly.io, Render, Railway, VPS) with hosted Supabase/Postgres as an optional database adapter. 

A unified container immediately delivers a publicly accessible admin (`/admin`), full background AI assistant capabilities (daemon and BYOK), and uncompromised support for dynamic POST routes (`forms-submit`, `comments-submit`, `payments-webhook`). 

Static export (Vercel/Cloudflare) cannot serve as the primary architecture because Tovu is an integrated CMS with a public admin, server-to-server webhooks, and commerce. Pure publish-time static generation categorically fails the commerce stress test: real-time stock levels, pricing, and cart checkout cannot be frozen at build time without risking overselling. 

To satisfy commercial demand for Vercel/Cloudflare, static export should exist strictly as a secondary deployment target for brochureware sites or as an edge caching layer in front of the containerized Tovu origin.

---

### PART 3 — Ranked Solution Slate

#### Ranking Criteria
1. **Functional Completeness**: Preserves the public admin SPA, dynamic POST routes, AI assistant runtime, and live e-commerce without architectural amputations.
2. **Implementation Velocity**: Minimal engineering before initial release; avoids rewriting runtime sandboxes, DB abstraction layers, and daemon protocols.
3. **Operational Robustness & Cost**: Predictable monthly hosting with persistent state management.

---

#### Option 1 (Recommended): Containerized Stateful Appliance (Target: Fly.io / Render / VPS / Supabase Postgres)
* **Architecture**: Package Tovu's Node runtime, native modules (`better-sqlite3`, `argon2`, `sharp`), and built SPA into a standard multi-stage OCI container. Mount `infra/` to a persistent volume (or connect to hosted Supabase Postgres via an env var).
* **Commerce Handling**: Fully survives the commerce stress test. `products.ts`, `store.ts`, and `payments-webhook.ts` query live database state on every request, ensuring real-time stock levels, live checkout, and synchronous Stripe webhook processing.
* **Trade-offs**:
  * *Pros*: 100% feature fidelity out of the box; preserves public `/admin`, worker sandboxes, Jini daemon, and form rate limiting.
  * *Cons*: Requires resolving the 22 `file:` dependencies in build packaging; does not deploy directly as a serverless bundle to Vercel/Cloudflare edge.

#### Option 2: Hybrid Decoupled Model (Containerized Admin/API Origin + Edge Static/ISR on Vercel/Cloudflare)
* **Architecture**: Tovu container runs privately or at `admin.theirsite.com` as the headless management core and API backend. On publish, Tovu generates static pages via `sitemap.ts` and pushes HTML to Vercel/Cloudflare Pages. Client-side JS fetches dynamic endpoints (`/api/forms/*`, `/api/store/cart`, `/api/stock`) from the origin.
* **Commerce Handling**: Partially survives with client-side dynamic fetching. Catalog pages are statically rendered, but inventory, live pricing, and cart state must hydrate client-side via API calls to the Tovu container origin; `payments-webhook.ts` routes directly to the container origin.
* **Trade-offs**:
  * *Pros*: Satisfies the commercial marketing requirement of "runs on Vercel/Cloudflare" for public page delivery.
  * *Cons*: Significantly higher operational complexity (running two systems: edge CDN + origin container); eventual consistency delays on catalog updates; requires adding CORS and client-side dynamic stock hydration.

#### Option 3 (Rejected): Pure Serverless Rewrite for Vercel/Cloudflare
* **Architecture**: Deconstruct Tovu into serverless/edge functions; replace SQLite with Supabase Postgres; migrate uploads to S3/R2; eliminate `node:worker_threads` in favor of publish-time rendering or pure declarative templates; strip background daemon.
* **Trade-offs**:
  * *Pros*: Native Vercel/Cloudflare hosting.
  * *Cons*: Massive multi-month refactoring effort; destroys ADR-020 Liquid isolation on serverless runtimes; eliminates daemon-based agent execution.

---

### PART 4 — Strongest Argument Against Your Own Position

The strongest argument against Option 1 is **market friction and user expectation**. Mainstream web developers and small agencies strongly prefer one-click deployments to Vercel, Netlify, or Cloudflare Pages. Forcing them to manage a container host (Fly.io, Railway, VPS), configure persistent storage volume mounts, and handle server maintenance increases time-to-value and creates adoption resistance compared to serverless-native competitors.

---

### PART 5 — What Would Change Your Mind

**A checkable fact:** If an audit of the sibling `@jini-ai/agent-runtime` and `@jini-ai/sqlite` packages confirms they can be compiled to pure WebAssembly/V8-isolate targets, and if Tovu's router can be refactored into standard Web Fetch API request handlers in <200 lines of code without native C++ addons.

If serverless execution required no loss of assistant or sandboxing capability, Option 3 would become viable.

---

### PART 6 — Confidence & Key Drivers

* **Confidence Score**: `0.92`
* **Drivers of Uncertainty**:
  1. *Packaging & Dependency Resolution*: The 22 external `file:` dependencies pointing to sibling `/Users/la/Programming/Jini` require either monorepo Docker context adjustments or an automated tarball packing step during container build.
  2. *Multi-Workspace Routing*: `src/cli/program.ts:48` currently accepts a single `--workspace <id>` flag; multi-workspace public hosting requires verification of how workspace domain mapping is handled in production routes.

<<SWARM_END>>
