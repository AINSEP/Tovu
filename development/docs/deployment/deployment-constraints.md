# Deployment: what Tovu can and cannot do

**Written 2026-08-13/15. Source: a 4-participant swarm debate (`/debate`) that fact-checked 21
claims against source, plus live web verification of external facts. Raw artifacts:
`ADS-memory/reports/swarm-consensus/offloads/2026-08-13-deploy-arch/`.**

Read this before designing anything deployment-shaped. It exists because most of the intuitive
answers here are wrong, and several were wrong in this codebase's own working session before being
caught. Claims below are marked with their evidence. **Do not re-derive the settled ones.**

---

## 1. The one fact everything follows from

**Tovu is a stateful, long-running Node server with a database on a local disk.** WordPress's shape,
one language over.

- `serve` boots one Express app and one listener that serves BOTH the public site and the admin
  (`src/cli/commands/serve.ts:76-92`, `src/server/app.ts:894-897`).
- `apps/admin` is a **build artifact served by that process**, not a second deployment. It has build
  and preview scripts but no production server (`apps/admin/package.json:6-13`).
- `src/index.ts` additionally spawns the Jini agent daemon as a **detached child process**
  (`src/index.ts:299-311`, `:399-401`), unconditionally, after eight readiness promises resolve.
  It is NOT gated on execution mode.

Everything below is a consequence of that paragraph.

## 2. What this forecloses

**Vercel and Cloudflare cannot host the Tovu server.** Verified, settled, do not re-litigate.

The blocker is the **process model and filesystem**, NOT SQLite. Specifically: `app.listen`, the
detached child daemon, mutable SQLite + uploads on local disk, three native modules, and
`worker_threads` render isolation.

- **Vercel**: full Node APIs, but a read-only filesystem except `/tmp`.
  ([runtimes](https://vercel.com/docs/functions/runtimes))
- **Cloudflare**: a Node compatibility *subset*. `child_process` and `worker_threads` are
  **importable non-functional stubs** — a Worker is a single-threaded V8 isolate sharing an instance
  with thousands of others, structurally incompatible with real threads.
  ([Node compat](https://developers.cloudflare.com/workers/runtime-apis/nodejs/))

⚠️ **Two precise corrections, because the sloppy versions get repeated:**
- "Cloudflare has no Node APIs" is **false**. It has many. It lacks the specific *working* facilities
  Tovu uses. `nodejs_compat` is default-on for compatibility dates ≥ 2026-08-04.
- "SQLite is the blocker" is **false**. Postgres would not rescue serverless — the process model
  would still fail. SQLite is one more thing on the same disk uploads already require.

**SQLite is fine on any host with a persistent disk** — but not automatically. Replica topology,
native-module compatibility, WAL-aware backups and single-writer disk attachment all matter.
Render, for example, limits a persistent disk to **one service instance**
([disks](https://render.com/docs/disks)).

## 3. Things that do not exist yet (all previously described as "in flight" — they are not)

| Thing | Reality |
|---|---|
| Postgres runtime | **No driver anywhere in `src/platform/db/`.** No `drizzle-orm/node-postgres`, no `Pool`. `schema.postgres.ts` is generated DDL only; `src/server/deps.ts` wires exclusively `Sqlite*` repos. The SQLite→Postgres data mover is explicitly "deliberately not built." |
| Object storage | **`LocalFsBlobStore` is the only blob store implementation** (`src/server/deps.ts:125-133,698`). No S3/R2 class exists. |
| Static exporter | ~~Does not exist.~~ **BUILT since this doc was written — corrected 2026-08-31.** `platform/export/site-exporter.ts` performs the crawl/export; `features/deployments/static-publish/adapter.ts` wraps `@jini-ai/devops/deploy` and ships five targets (`github-pages`, `vercel`, `netlify`, `cloudflare-pages`, `s3-compatible`), registered as agent tools. **The stale row above caused a real harm:** the site assistant read it and told the owner static deploy was "still hypothetical" and there was "nothing to deploy until that's built". Section 6 below (what static export costs) is the accurate constraint — the exporter exists, but it drops every server-dependent surface, `forms-submit` included. |
| Route manifest | **The sitemap cannot drive an export.** `src/seo/sitemap.ts:50-66` enumerates only published, indexable posts plus empty extension hooks — omitting home, products, theme-owned static pages, redirects, 404 and assets. A dedicated `RouteManifestPort` is required. |
| Container packaging | ~~No `Dockerfile`…~~ **STALE — corrected 2026-09-05.** A real `Dockerfile`, `Dockerfile.dockerignore`, `docker-compose.yml` and `fly.toml` now exist at the repo root (`fly.toml` landed the same day as the row below, in `81c02601`). Still absent: `render.yaml`. ~~The Dockerfile's own header is the authoritative note that its build context must be the PARENT directory — Tovu declares 22 `file:` deps... into `../Jini/packages/*`~~ — **that premise no longer holds**: `@jini-ai/*` moved to ordinary npm-registry semver ranges in `daa74a65` (2026-08-31, see `AGENTS.md`'s own correction), so the Dockerfile's build context is this repo's own root, with no sibling `Jini` checkout involved. ~~**Consequence: git-based deploy on Railway/Render cannot work**~~ — that conclusion rested on the now-false sibling-checkout premise and needs re-verification by whoever owns deployment strategy before being relied on either way; it is not re-asserted here. |
| Inventory tracking | **Tovu does not track inventory at all** (`src/server/routes/site/products.ts:37-40`). Deployment work must not advertise oversell protection before that domain exists. |

## 4. Blockers found while checking the above (not deployment features — prerequisites)

**4.1 — Multi-workspace hosting does not work.** One running app selects exactly ONE workspace at
boot (`src/platform/site-dir/resolve-workspace.ts:15-21,50-76`; `src/server/deps.ts:233-264`). Serving many
customers from one instance needs request-time hostname→workspace resolution, replacing the
process-wide `RouteDeps.workspaceId`. **This is the gating feature for any hosted-SaaS product**, and
it is larger than any provider adapter.

**4.2 — The default owner password is `tovu-dev`** (`src/identity/wiring.ts:87-98`) and the
production readiness gate does not test for it (`src/server/production-readiness-gate.ts:84-100`).

**4.3 — Public admin on the site's own origin is unsafe.** Theme assets deliberately permit
JavaScript as a subresource, and the asset CSP does not govern scripts included by the public
document (`src/server/middleware/theme-content-security-headers.ts:33-36,65-72`). Same-origin theme
JS and admin authority are incompatible trust levels. The admin needs a **separate browser origin**
(`/admin` may redirect to it), or arbitrary theme scripts must be prohibited.

**4.4 — The Supabase MCP PAT is not a database credential.** It is an account-level *management*
credential, explicitly distinct from project data-plane credentials
(`src/features/plugins/supabase-mcp/supabase-mcp-plugin.ts:45-53`). Postgres connectivity needs real
connection credentials.

## 5. Theme tiers and the render sandbox

Five ADR-020 tiers (`src/features/theme/theme.ts:35`): `declarative` · `templated` · `handlebars` ·
`static` · `code`. `render.ts:2002-2044` dispatches:

- `static` → `renderStaticPage()`, **but only for `route === "home"` and only when `index.html`
  exists.** Other static pages are handled in `pages.ts:749-779`; unresolved static routes fall
  through to `renderBlock`.
- `templated` → `renderLiquidInSandbox()` — **worker**
- `handlebars` → `renderHandlebarsInSandbox()` — **worker**
- else (`declarative`, `code`) → `renderBlock(tree, ctx)`, synchronous, **no worker**

**The sandbox exists for isolation, not because Liquid needs a runtime.** A fresh Worker per render,
no pooling, 5s wall-clock timeout, V8 heap caps (`liquid-sandbox.ts:60-63,83-90`). A `Promise.race`
genuinely cannot substitute: synchronous CPU-bound work cannot be pre-empted by a timer on the same
thread.

⚠️ **The sandbox is weaker than its own doc comment claims.** It bounds *one render's* thread and
heap. Concurrent worker creation, process-level memory and non-V8 resources are **not** globally
bounded — so "cannot hang or OOM the server" is too absolute.

⚠️ **Publish-time rendering RELOCATES the isolation requirement; it does not remove it.** A hostile
template can still hang or OOM the build machine. A shared multi-tenant builder still needs
worker/process/container isolation and quotas — just once per publish instead of once per request.
That is a large win. It is not elimination.

## 6. What static export costs

Five files register POST handlers — **not six** (`grep -l "\.post("`): `forms-submit`,
`comments-submit`, `newsletter-unsubscribe`, `analytics-ingest`, `payments-webhook`.

`newsletter-confirm.ts:16` is `app.get(...)` — a **state-mutating GET** (a magic-link click). It
still needs a live endpoint. **You cannot find the server-dependent surface by grepping for POSTs.**

Most of these can run on trusted edge/serverless compute rather than the full Tovu listener. Two
cannot be made browser-direct: IP-keyed rate limiting (composite `(sourceIp, formDefinitionId)`,
`src/forms/submit-service.ts:87-95`, with `resolveClientIp` at `src/contracts/core/rate-limit/rate-limit.ts:315`
called from the route layer), and the payments webhook, which needs a trusted raw-body
signature-verifying endpoint (`payments-webhook.ts:7-25,72-99` — provider-generic, not Stripe-specific).

## 7. Cost — with the comparison stated honestly

Verified 2026-08: Vercel Pro **$20**/seat/mo; Supabase Pro **$25**/mo; Render Starter **$7**;
Railway Hobby **$5** minimum; Fly ~**$2–9** for a small machine; Cloudflare Workers Paid from **$5**,
static assets free. Vercel Hobby is non-commercial only.

⚠️ **"Serverless is more expensive" is false as a general claim** — it was an artifact of an unfair
comparison (container+SQLite vs Vercel+Supabase). If Supabase is required on the container path too,
that path is ~$30–35, not $5–10. Compare like for like.

## 8. Architecture alternatives — already evaluated, do not re-survey

- **Ghost**: same shape as Tovu. Changes nothing.
- **Strapi / Directus (headless)**: genuinely splits the problem — the frontend deploys to Vercel
  natively — but the API still needs a stateful host. All three vendors sell hosting for exactly
  this reason.
- **Git-based (Decap, Tina)**: truly removes the server, by removing the database. Forfeits
  multi-user editing, commerce, comments and a real content model.
- **Payload-style (CMS inside Next.js)**: unifies the *application*, not the storage. It uses hosted
  Postgres/Mongo over the network. **It does not put SQLite inside the deployment** — nothing does.
  Serverless has no persistent disk, and a file-backed DB cannot survive there.
- **None of them fix Tovu's actual hard part**: the assistant spawning agent CLIs as child
  processes. No other CMS has that feature, so no other CMS's architecture solves it.

**Tovu is already ~80% headless**: `apps/admin` is a separate Vite SPA talking to the server over
HTTP; it is merely *served by* the same process. Decoupling its deployment is small, and would also
solve 4.3 for free.

## 9. The product question that decides the rest

**Two products are hiding in "deployment", and they serve different people.**

1. **Hosted SaaS** — the non-technical user who wants a website that sells things. They will never
   enter a Vercel token. Every comparable product (Shopify, Squarespace, Wix, WordPress.com, Ghost
   Pro, Webflow) is hosted, because "deploy" is an unsolvable UX problem for that person. Here the
   Deploy panel is nearly empty: Publish, a domain field, a status line. **Blocked on 4.1.**
2. **Self-hosted** — developers running Tovu themselves. This is where a Providers tab with
   credentials makes sense. Smaller audience.

The existing stub (`apps/admin/src/panels.tsx`, `id: "deployment"`, tabs Home/GitHub/AWS) is shaped
for audience 2 while the stated target user is audience 1. If tabs are built, the agreed shape is
**Home / Providers / History** — vendors as rows in a list, never as tabs, matching the existing
`connectors` / `external-mcp` / `integrations` pattern and `@jini-ai/ui`'s `SourceConfigList`.

**Note:** in a hosted model, saving content IS publishing. There is nothing to deploy per edit. The
panel's real subject is provisioning and upgrading an instance, not publishing content.

## 10. Where the debate landed

All four participants agreed a **stateful control plane is unavoidable** and **nobody chose "make
Tovu serverless" (option C)**. Positions: container-first now, with a static/edge class later as an
addition rather than an alternative, using publish-time rendering as its mechanism.

The unresolved question is a business fact, not a technical one: **how many customers need commerce,
forms, members or comments at launch?** Codex made it falsifiable — if ≥14 of 20 representative
customers need a stateful feature, drop static classification from the initial architecture entirely.

## 11. Method note worth keeping

Of 21 confidently-stated claims, **6 were wrong or materially overstated**, and they clustered in
three places: recalled external facts (pricing), grep results read too quickly (the POST count came
from `post(` matching the *blog-post* sense in `pages.ts`), and inference presented as observation.
Not in reasoning. One peer's *correction* was itself wrong and only caught by checking a primary
source. Roughly every other verification found something.

The `<<PEER_DISPATCH>>` transport also matters: agy fails in headless mode when a tool needs a
permission prompt it cannot show, and its `--print-timeout` defaults to 5 minutes — both produce a
**silent zero-byte result**, not an error.
