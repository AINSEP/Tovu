ACK_PACKET_RECEIVED CTX-DEPLOY-ARCH-2026-08-13 -- I received the packet and will work on it.

Peer Architect(Consensus):

## 1. Claim ledger

1. **TRUE.** `tovu serve` creates one Express app and listener (`src/cli/commands/serve.ts:76-92`); that app mounts the compiled admin at `/admin` (`src/server/app.ts:894-897`). `apps/admin` has build/preview scripts but no production server (`apps/admin/package.json:6-13`). Caveat: the full `src/index.ts` boot also launches an assistant child process.

2. **TRUE.** The five declared values are at `src/features/theme/theme.ts:35-37`. Rendering branches by tier at `src/server/http/site/render.ts:2008-2044`, so the public site is not uniformly Liquid. The `code` tier is declared but documented as unbuilt (`src/features/theme/theme.ts:26-35`).

3. **PARTLY.** Liquid, Handlebars, and the final `renderBlock` branch are correctly described (`src/server/http/site/render.ts:2013-2044`). However, `static` short-circuits only `route === "home"` and only when `index.html` exists (`src/server/http/site/render.ts:2002-2011`). Other static pages are handled separately in `pages.ts` (`src/server/routes/site/pages.ts:749-779`), while unresolved static routes can fall through to `renderBlock`.

4. **TRUE.** Liquid and Handlebars import and construct `Worker` (`src/server/http/site/liquid-sandbox.ts:1-2,82-90`; `src/server/http/site/handlebars-sandbox.ts:1-2,72-80`). Declarative/`code` use `renderBlock`, while static uses string transformation (`src/features/theme/static-render.ts:387-422`).

5. **PARTLY.** The worker is explicitly an isolation mechanism with a 5-second timeout and V8 heap limits (`src/server/http/site/liquid-sandbox.ts:7-20,50-55,114-155`). Corrected: it limits one render’s thread and V8 heap; “cannot hang or OOM the server” is too absolute because concurrent worker creation, process-level memory, and non-V8 resources are not globally bounded. It is one fresh worker per call with no pool (`src/server/http/site/liquid-sandbox.ts:109-122`).

6. **TRUE.** The timeout callback cannot run while synchronous CPU work occupies the same thread; actual pre-emption comes from terminating another thread (`src/server/http/site/liquid-sandbox.ts:14-18,132-138`; `src/server/http/site/handlebars-sandbox.ts:19-23`).

7. **TRUE.** After readiness promises settle, `src/index.ts` calls `spawnAgentDaemon` without consulting execution mode (`src/index.ts:299-312`). The child is launched with `spawn` at `src/index.ts:399-401`.

8. **TRUE.** BYOK imports four provider turn functions and no process API (`src/assistant/byok-provider-turn.ts:23-41`), then dispatches by protocol in-process (`src/assistant/byok-provider-turn.ts:604-819`). Jini’s guarded provider transport uses Node HTTP(S), not a CLI process (`../Jini/packages/agent-runtime/src/providers/connection-guard.ts:295-303`).

9. **TRUE.** A BYOK-only boot can avoid children: the CLI `serve` path only opens storage, creates the app, and listens (`src/cli/commands/serve.ts:76-92`). Therefore the `src/index.ts` daemon launch is a composition choice. Hosted mode should explicitly gate it and declare local-CLI execution unavailable, rather than silently starting a daemon.

10. **PARTLY.** Neither target runs Tovu unchanged. Current blockers include `app.listen`, the child daemon, mutable SQLite/uploads, native modules, and worker assumptions (`src/index.ts:276-309,399-401`; `src/server/deps.ts:125-169`; `package.json:58-66`). SQLite is therefore one blocker, not something separate from “filesystem.” Vercel functions have full Node APIs but a read-only filesystem except `/tmp`; Cloudflare implements only a subset and stubs some modules. [Vercel runtimes](https://vercel.com/docs/functions/runtimes), [Cloudflare Node compatibility](https://developers.cloudflare.com/workers/runtime-apis/nodejs/).

11. **PARTLY.** SQLite is appropriate for a single stateful instance with an attached disk; `serve` deliberately colocates `content.db` and uploads (`src/cli/commands/serve.ts:83-88`). It is not automatically fine on *any* persistent-disk host: replica topology, native-module compatibility, WAL-aware backups, and single-writer disk attachment matter. Render, for example, limits a persistent disk to one service instance. [Render persistent disks](https://render.com/docs/disks).

12. **PARTLY.** Cloudflare is further from this implementation, but “no Node APIs” is false. It offers a compatibility subset; `child_process` and `worker_threads` are importable non-functional stubs. Vercel’s Node runtime advertises all Node APIs. Corrected: Cloudflare lacks the particular working Node facilities Tovu uses, rather than all Node APIs. [Cloudflare Node compatibility](https://developers.cloudflare.com/workers/runtime-apis/nodejs/), [Vercel Node runtime](https://vercel.com/docs/functions/runtimes/node-js).

13. **TRUE.** Postgres removes durable local-database state but not child processes, uploads, handler topology, or render workers. The repository currently has schema/migration foundations but explicitly no live Postgres client or adapter (`src/db/postgres/db-ops.ts:4-14`; `src/db/migration/pg-fixture.ts:2-11`).

14. **PARTLY.** The quoted commercial baseline is current: Vercel Pro is $20/month and Supabase Pro is $25/month, so approximately $45 before overages. [Vercel pricing](https://vercel.com/pricing), [Supabase pricing](https://supabase.com/pricing). Small container compute can plausibly be $5–10: Fly 1 GB machines are roughly $6–9 depending on region, and Railway Hobby has a $5 minimum. [Fly pricing](https://fly.io/docs/about/pricing/), [Railway pricing](https://railway.com/pricing). But “serverless is therefore more expensive” is false generally: Cloudflare static assets are free and Workers Paid starts at $5. Also, if the owner requires Supabase for the container path too, container plus Supabase is roughly $30–35, not $5–10. [Cloudflare pricing](https://developers.cloudflare.com/workers/platform/pricing/). Vercel Hobby is restricted to personal, non-commercial use. [Vercel Hobby plan](https://vercel.com/docs/plans/hobby).

15. **PARTLY.** Reusing `renderSite` lowers renderer work, but the sitemap cannot drive a complete export. It enumerates only published, indexable post records plus currently empty extension hooks (`src/seo/sitemap.ts:50-66`). It omits home, products, theme-owned static pages, redirects, 404, assets, and other routes visible in `pages.ts` and `products.ts` (`src/server/routes/site/pages.ts:672-843`; `src/server/routes/site/products.ts:58-108`). A dedicated route-manifest contract is required.

16. **FALSE.** Five of the thirteen non-test files register POST handlers:

   - analytics: `src/server/routes/site/analytics-ingest.ts:90`
   - comments: `src/server/routes/site/comments-submit.ts:28`
   - forms: `src/server/routes/site/forms-submit.ts:49`
   - newsletter unsubscribe: `src/server/routes/site/newsletter-unsubscribe.ts:40-41`
   - payments: `src/server/routes/site/payments-webhook.ts:72-100`

   `newsletter-confirm` is GET-only (`src/server/routes/site/newsletter-confirm.ts:15-16`). The list also counts `newsletter-deps.ts`, which registers no route.

17. **PARTLY.** These endpoints can run on trusted edge/serverless compute; they do not require the full Tovu listener. Direct browser-to-Supabase is not behaviorally equivalent for most of them. Forms perform slug/status checks, validation, composite rate limiting, persistence, outbox enqueue, and delivery triggering (`src/forms/submit-service.ts:64-123`). The composite key is indeed `(IP, formDefinitionId)` (`src/forms/submit-service.ts:87-95`; `src/forms/rate-limit-profile.ts:27-28`). Payments require a trusted, raw-body, signature-verifying server endpoint, though the route is provider-generic rather than Stripe-specific (`src/server/routes/site/payments-webhook.ts:7-25,72-99`).

18. **PARTLY.** Publish-time rendering removes template execution from serving nodes, materially reducing live-site risk. It does not remove the build-time isolation requirement: synchronous bad templates still cannot be timed out in-process. A shared multi-tenant builder must retain worker/process/container isolation and quotas (`src/server/http/site/liquid-sandbox.ts:14-18,132-138`).

19. **TRUE.** A repository-wide filename inventory found none of the five named deployment files. This is negative inventory evidence, so no absent file has a `path:line`; the current build surface is package-script-only (`package.json:19-43`).

20. **TRUE.** Root dependencies contain twelve sibling `file:` references (`package.json:45-57`); admin contains ten (`apps/admin/package.json:15-25`). All 22 resolve outside a Docker context rooted at Tovu.

21. **PARTLY.** The three native dependencies are declared at `package.json:58-66`. Runtime state includes SQLite/WAL, uploads, journals, snapshots, and restore points (`infra/README.md:3-16,20-34,62-79`). Corrected: a **missing parent directory** causes `SQLITE_CANTOPEN`; an existing empty directory does not. `openContentDb` directly calls `new Database(filePath)` (`src/db/sqlite/content-db.ts:72-75`). I verified experimentally that it creates `content.db` inside an existing empty directory.

## 2. Position

Commit to **E as deployment policy, D as the static-class rendering method, and A as the control-plane/stateful-class runtime**. Deployment should mean a versioned, observable release pipeline—not a provider-specific button.

A stateful Node control plane should host admin, BYOK, build jobs, deployment records, and dynamic sites, backed by hosted Postgres and object storage. A feature-usage classifier may publish eligible workspaces as immutable HTML/assets to Cloudflare Pages or Vercel. Liquid and Handlebars execute only inside isolated publish jobs; deployed static artifacts contain no template engine.

Commerce, members, comments, forms, public AI, and payment flows classify a site as stateful. A large catalog may cache or pre-render presentation, but live price, availability, checkout, and webhooks remain authoritative server operations.

Use provider-neutral ports for route enumeration, artifact storage, eligibility, deployment targets, cost estimation, promotion, and rollback. The public admin must use a separate browser origin from arbitrary theme JavaScript; `/admin` can redirect there. If the exact same origin is mandatory, arbitrary theme scripts must be prohibited.

## 3. Ranked solution slate

Ranking criteria: requirement coverage 35%, correctness/security 25%, delivery effort 20%, cost 10%, provider portability 10%.

| Rank | Direction | Result | Trade-offs |
|---|---|---|---|
| 1 | **E + D + A hybrid** | Best commercial and architectural fit | Supports Cloudflare/Vercel for eligible sites and preserves full runtime behavior elsewhere. Costs a second deployment class, eligibility UX, build isolation, and a larger test matrix. |
| 2 | **A, container-only** | Best near-term correctness | Fastest path to public admin, assistant, webhooks, and commerce. Provider expectations are met only indirectly through CDN/DNS integrations; no genuine Vercel/Pages hosting story. |
| 3 | **B + D, static-only** | Useful first product slice, inadequate final architecture | Very low serving cost and no runtime template engine. Violates public-admin completeness and excludes every genuinely dynamic site. |
| 4 | **C, full serverless Tovu** | Highest migration cost and uncertainty | Requires Postgres adapters, object storage, request-handler conversion, daemon gating, distributed rate limits/outbox, build separation, and platform-specific native-module validation. It should be an experiment, not the committed foundation. |

### Smallest valuable first slice

Build a single-workspace, static-eligible Cloudflare Pages deployment:

1. Admin eligibility report with explicit blockers.
2. Dedicated `RouteManifestPort`; do not reuse the sitemap.
3. Isolated render job producing versioned HTML/assets plus hashes.
4. One Cloudflare target adapter, cost estimate, deployment history, atomic promotion, and rollback.
5. Reject commerce/forms/members/comments/public-assistant sites rather than degrading them silently.

Before that slice: make the build hermetic by packaging the 22 Jini dependencies, define secret storage, and decide the admin-origin boundary. It may leave admin local initially, clearly marked as a preview milestone. If public admin is required in the first release, the smallest slice instead becomes a single-workspace Node container with Supabase Postgres and object storage.

### Multi-tenancy boundary

The database can contain multiple workspaces, but one running app selects exactly one workspace at boot (`src/site-dir/resolve-workspace.ts:15-21,50-76`; `src/server/deps.ts:233-264`). Multi-workspace hosting therefore needs request-time hostname-to-workspace resolution, not the current process-wide `RouteDeps.workspaceId`.

Build queues also require tenant quotas and isolated jobs; deployment credentials, domains, artifacts, release records, and rollback pointers must all be workspace-scoped. Supabase topology matters economically: one shared project amortizes the $25 plan but raises isolation stakes; project-per-workspace adds approximately $10 compute for each additional default instance.

### Public admin consequences

Public admin forces an always-on stateful control plane; it rules out private-authoring static export as the final product. It also requires:

- HTTPS, fail-closed production credentials, and trusted-proxy configuration. The current owner password defaults to `tovu-dev` (`src/identity/wiring.ts:87-98`), while the production gate does not test that condition (`src/server/production-readiness-gate.ts:84-100`).
- Hosted BYOK or a hardened remote runner; remotely exposing local coding-agent execution should not be implied.
- Browser-origin isolation. Theme assets deliberately allow JavaScript as a subresource, and the existing asset CSP does not govern scripts included by the public document (`src/server/middleware/theme-content-security-headers.ts:33-36,65-72`). Same-origin theme JavaScript and admin authority are incompatible trust levels.
- Postgres connection credentials, not the existing Supabase MCP PAT. That PAT is an account-level management credential, explicitly distinct from project data-plane credentials (`src/features/plugins/supabase-mcp/supabase-mcp-plugin.ts:45-53`).

### Commerce stress test

A workspace with a real catalog is **stateful**, regardless of theme tier. Several thousand product pages may be pre-rendered incrementally for SEO, but price and availability must be fetched or verified live; checkout and payment webhooks stay on trusted compute. Current Tovu does not yet track inventory at all (`src/server/routes/site/products.ts:37-40`), so deployment work must not advertise oversell protection before that domain exists.

## 4. Strongest argument against my position

Every customer still needs a stateful control plane for public admin, so the static class may save public-serving cost while adding a second release model, eligibility disputes, two rollback paths, and two operational test matrices. Container-only deployment is dramatically simpler and handles commerce correctly from day one. If few real sites are static-eligible, the hybrid architecture is complexity without meaningful customer value.

## 5. What would change my mind

A checkable adoption result: if at least **14 of 20 representative launch customers** require one or more stateful features at launch—commerce, members, comments, forms, or public AI—I would drop static classification from the initial architecture and choose container-first only.

The cheapest technical falsification is a two-day exporter spike over one realistic workspace: enumerate every route independently of the sitemap, render it from a consistent snapshot, publish to Cloudflare Pages, and exercise rollback. If route completeness or atomic snapshotting requires invasive changes across feature repositories, D/E should move behind container-first rather than lead it.

## 6. Confidence

**0.88.** Confidence is driven by direct source verification of the process, rendering, storage, tenancy, auth, and route topology. Uncertainty comes from rapidly evolving Vercel/Cloudflare runtimes, the absence of a production deployment probe, unfinished Postgres support, and unknown customer feature-usage distribution.

<<SWARM_END>>