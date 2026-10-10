> **⚠️ EXPLORATORY — NOT A DECISION.** Owner curiosity session, 2026-10-04. Nothing here was chosen or approved, and nothing is being built. The owner noted the proposed format "looks kinda funny" and that none of this can be judged until it is tried on a real vibe-coded app. Treat as raw input for a future prototype, not a spec.

_Source: question packet_

## CONTEXT BUDGET — HARD PRIORITY RULE (overrides finishing the task)
Your hard ceiling is 300k tokens of context. This is an opinion/design question; it needs almost none.

## Preamble
- Do NOT read AGENTS.md / CLAUDE.md / CONTEXT.md or any bootstrap file; there is none for this task. A missing file is never a reason to stop.
- Do NOT read the repo. Everything you need is below. Answer from it plus your own knowledge. (Exception: at most 3 targeted reads if one fact is truly load-bearing — name it.)
- Never call codebase-memory-mcp `index_repository`. No edits, no tests.

## Context
Tovu is a CMS + vibe-coding platform. Users vibe-code React/Vue/Angular apps (hosted on Tovu, Vercel, AWS…) and attach them to Tovu's backend and admin. Tovu already uses an HTML marker on its own server-rendered pages:
`<div data-embed-config='{"type":"form","id":"contact"}'></div>` — the server swaps the marker for rendered HTML (forms, menus, posts, media, widgets). On Tovu, widget types are thin adapters over feature domains (e.g. `contact-form` widget wraps forms), and every feature already registers agent tools (`tool-registrations.ts`) — i.e. there are already two registries (widget types, tools) a generic layer could hang off.

The owner does NOT want per-feature endpoints and SDK calls (an earlier design proposed ~10 feature slices and many routes — rejected as unsustainable). They want ONE generic, abstract mechanism driven by `data-embed-config`, e.g.:
- `{"type":"widget","widget":"stripe-checkout","config":{...}}`
- `{"type":"query","function":"getData","args":{...}}`
- combined: `{"type":"widget","widget":"product-grid","query":{"function":"listProducts","args":{...}}}` (query result feeds the widget)

A single browser runtime (`embed.js`, one `<script>` tag, framework-agnostic; MutationObserver over `div[data-embed-config]`, Shadow DOM + `<slot>` fallback) talks to a few generic server routes backed by registries. New features register a widget and/or function once — no new routes, no SDK changes.

## Current proposed primitive list
1. **Embed** — server-rendered HTML into a div (widget registry). Widgets needing browser code (Stripe/PayPal) declare a script the runtime loads.
2. **Query** — read data via a function registry.
3. **Action** — writes (submit, add to cart, comment, subscribe); same registry family but with auth, idempotency, stricter rate limits.
4. **Identity** — sign-in / sign-out / current user / cross-origin bearer token; everything else depends on it.
5. **Routing** — app path → redirect | content + SEO head | 404; one hook into the app's router.
6. **Live updates** — server push (order paid, new comment, chat stream).
7. **Uploads** — visitor files into Media.
8. **App manifest** — the admin side of "attach": allowed origins, widgets/functions used, the app's own content types, so admin shows/manages its data.
9. **Custom server functions** — escape hatch: app author vibe-codes a sandboxed server function, registered like any other (Tovu has a `plugin-runtime` feature that may be the base).
Outside the pattern (fixed routes): inbound provider webhooks, magic-link sign-in steps, secrets (server-only).
Safety lives in the registry: explicit "public" flag, arg schema validation, per-function auth rule (anonymous/member/app), per-function rate limit, visibility/member-access checks inside each function.

## The question
1. **What is missing from this primitive list?** Add, merge, or cut — be ruthless about the minimum complete set. Consider e.g. state/binding between embeds, templating of query results into author HTML, i18n/locale, errors/loading UI, caching/offline, permissions UI, versioning of registry contracts, observability, testing/preview in admin, SEO/no-JS, multi-tenant/workspace scoping — include only what genuinely belongs.
2. **How to abstract ALL of it behind `data-embed-config` (and a few HTML attributes / one script) so the end user can just write HTML tags, embeds, or a few lines of JS — as simple as possible.** Give:
   - the one unified config grammar (JSON shape) covering every primitive, with 6–10 concrete HTML examples (render a widget; bind a query into the user's OWN HTML via a tiny template/slot convention; a form/action without a widget; sign-in button + "only show if signed in" region; router hook; live-updating region; upload; Stripe checkout; calling a custom server function);
   - the matching minimal JS API for people who prefer code (e.g. `tovu.call(...)`, `tovu.on(...)`) — same registry, same names;
   - the server side: the minimum number of generic routes and the registry entry shape (one TypeScript interface) that a feature author fills in once;
   - where declarative HTML should stop and JS should take over (don't over-invent an HTML programming language — say where the line is, with reasoning; compare to htmx / Alpine / Web Components / Supabase / Firebase / WordPress shortcodes / Shopify Liquid+Storefront where useful).
3. **Top 5 risks** of the generic approach (security of a generic call surface, schema drift, debugging, performance/N+1 from many small embeds, SEO) and the one mitigation for each.

Be concrete and concise: ~1,500–2,500 words, code/HTML examples over prose. No preamble.
