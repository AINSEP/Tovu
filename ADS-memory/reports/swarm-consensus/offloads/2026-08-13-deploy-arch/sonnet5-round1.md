# Sonnet 5 (in-host subagent) — Round 1

**Packet:** `CTX-DEPLOY-ARCH-2026-08-13` · full repo access + web · confidence **0.7**
Net: **15 TRUE · 4 PARTLY (9, 17, 18, +detail) · 2 FALSE (12, 16)**

## Claim ledger — corrections and notable evidence

- **1 TRUE**, one-line drift: `src/server/app.ts:895`, not 894. Same Express app, same `app.listen()` (`index.ts:277`).
- **2 TRUE** — `theme.ts:35` exact.
- **3 TRUE** — `render.ts:2008-2011` static/home; `:2014-2027` templated; `:2028-2040` handlebars; `:2041-2045` else → `renderBlock` synchronous.
- **4 TRUE** — `grep -rn "worker_threads|new Worker" src/server/http/site/` hits ONLY the liquid/handlebars sandbox+worker files.
- **5 TRUE** — `liquid-sandbox.ts:60-63` `DEFAULT_TIMEOUT_MS=5000`, `maxOldGenerationSizeMb:64 / maxYoungGenerationSizeMb:16 / codeRangeSizeMb:16`; `:83-90` fresh `new Worker` per call, no pooling.
- **6 TRUE**, on independent grounds — standard single-threaded JS semantics, true regardless of the doc comment.
- **7 TRUE** — `index.ts:299-311`, `Promise.all([...8 readiness promises]).then(() => spawnAgentDaemon(...))`, no mode/env gate. Actual call is line 309.
- **8 TRUE** — `byok-provider-turn.ts:25-38` imports, called at 618/669/723/773. Zero `spawn`/`child_process`/`new Worker` in file, confirmed by grep not by header.
- **9 PARTLY** — premises true, conclusion overstates *present-tense* behavior. As shipped, a BYOK-only deployment still spawns the daemon. "Needs no child process" is a reachable target state, not current behavior.
- **10 TRUE** — `LocalFsBlobStore` (`src/server/deps.ts:125-133,698`) is the ONLY blob store; no S3/object-storage class anywhere in `src/`. Blocker is process-model + filesystem; SQLite isn't a distinct extra blocker, it lives on the same disk uploads already need.
- **12 FALSE as worded** — claimed Cloudflare ships a `node:worker_threads` stub, auto-enabled at compat date ≥2026-03-17 with `nodejs_compat`, default-on ≥2026-08-04. ⚠️ **Coordinator checked this independently and it does not hold**: Cloudflare's own docs state `worker_threads` "does not fit in a serverless context" and is removed from the Node compatibility report. Codex reconciled both readings: `child_process` and `worker_threads` are *importable non-functional stubs*. Net — the wording objection is fair, the conclusion does not flip.
- **13 TRUE, and understated** — NO runtime Postgres driver anywhere in `src/db/` (no `drizzle-orm/node-postgres`, no `Pool`). `schema.postgres.ts` is generated DDL only. `deps.ts` wires exclusively `Sqlite*` repos. The SQLite→Postgres data mover is explicitly "deliberately not built."
- **14 TRUE, verified fresh via web** — Vercel Pro $20/seat + Supabase Pro $25 ≈ $45. Render Starter $7, Railway Hobby $5, Fly ~$2-8. Notes a realistic Railway stack is $10-15 with usage billing.
- **15 TRUE with nuance** — `sitemap.ts:19-29` → `buildSitemap()` already enumerates published routes and works today, but no exporter exists (`grep` for `StaticExporter`/`exportSite` returns nothing). "Cheap" is a forward claim. *(Codex went further: the sitemap CANNOT drive a complete export — omits home, products, theme static pages, redirects, 404, assets.)*
- **16 FALSE** — 13 files right, but only **5** register POST: `forms-submit`, `comments-submit`, `newsletter-unsubscribe`, `analytics-ingest`, `payments-webhook`. `newsletter-confirm.ts:16` is `app.get(...)` — correctly, it's a magic-link click.
- **17 PARTLY** — composite key `(sourceIp, formDefinitionId)` is at `submit-service.ts:87-89` as claimed, but `resolveClientIp` lives at `src/core/rate-limit/rate-limit.ts:315` and is called at the route layer `forms-submit.ts:39`. File attribution wrong; architectural point holds.
- **18 PARTLY** — build-time rendering makes a runaway template a build-machine problem, a real improvement, but "dissolve" overstates: the same timeout+heap isolation must still run, once per publish instead of once per request. Relocated, not eliminated.
- **19/20/21 TRUE** — zero container files; 12 root (`package.json:46-57`) + 10 admin (`:16-25`) = 22 `file:` deps; `argon2 ^0.44.0`, `better-sqlite3 ^11.8.1`, `sharp ^0.35.3`.

## Position

Ship **container-first (A) now**; build a **static/edge class (E)** later keyed on feature usage, with **D as E's render mechanism, not a standalone architecture.** Postgres has zero runtime driver and zero data mover; `LocalFsBlobStore` is the only blob store; the daemon spawns unconditionally via a detached child. All three make C the most expensive and riskiest option — and Cloudflare's `worker_threads` is a stub of unverified fidelity even afterward. A container host needs almost none of it: mount `infra/` on a volume, ship a Dockerfile, and everything works unmodified including assistant, commerce and public admin — whose real argon2id session auth already exists (`dev-auth.ts:15-16`, misleading filename).

## Ranked slate

Criteria: (i) time-to-first-deploy, (ii) feature completeness, (iii) new infra deps, (iv) cost, (v) fit with "Vercel/Cloudflare matter commercially".

1. **A container-first** — wins (i)-(iv) decisively; loses (v) outright. Notes the existing stub advertises "Home / GitHub / AWS" — not the brands the owner named. Multi-tenancy unaffected. Public admin mostly solved already; mainly needs TLS at the host edge.
2. **E (feature-keyed static class, D as render mechanism, B as packaging)** as a second slice on top of A. **Commerce stress test: excluded, not solved** — any site using commerce/forms/members/comments routes permanently to class A. "Trying to make checkout 'sort of' static is how you ship an overselling storefront." The authoring backend still lives in A's always-on container regardless.
3. **Reject C for now** — needs a Postgres driver that doesn't exist, object storage that doesn't exist, and gating a boot sequence several ADR comments treat as delicate; best case yields "Vercel, maybe."

## Strongest argument against itself

Shipping Fly/Render first doubles down on the brand mismatch the owner flagged as a commercial risk — on top of a stub that already says GitHub/AWS. The ranking optimizes for engineering soundness, not for what closes a sales conversation, and it has no evidence which matters more to this business.

## What would change its mind

How many prospects require deploying into *their own* Vercel/Cloudflare account as a hard requirement, versus accepting one-click deploy to a provided host. Separately: a direct test showing Cloudflare's `worker_threads` stub supports real `worker.terminate()` hard-kill with heap isolation.

## Stated uncertainty (drives 0.7)

(1) Whether Vercel's Node functions permit a `detached: true` child to outlive the request cycle — serverless models typically tear the sandbox down at response end; untested. (2) Real semantics of Cloudflare's `worker_threads` stub. Both affect C-vs-E ranking, not the top-line A recommendation.
