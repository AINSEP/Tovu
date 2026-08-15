# Primary (Claude Opus 5, 1M) — Round 1 frozen position

**Packet:** `CTX-DEPLOY-ARCH-2026-08-13`
**Frozen:** before any peer response was requested or read. Withheld from the Round 1 peer packet per the Debate Round-Disclosure Guard.

---

## Position (≤200 words)

Tovu should commit to **option E: deployment class chosen per site by feature usage**, with **A (container-first) built first** and **D (publish-time rendering) as the second slice**.

The decisive fact is that Tovu is two products sharing a codebase. A pages/posts/menus site has no per-request state and can be rendered ahead of time to an artifact containing no engine and no database — near-zero hosting cost, edge-deliverable, and the ADR-020 sandbox reduces to a build-time timeout. A commerce site cannot: stock and price are stale by construction between builds, and cart/checkout/`payments-webhook.ts` require a live origin. No single architecture serves both without lying to one of them.

Container-first goes first because it is the only option that works for every site today, requires no new rendering subsystem, and is the cheapest to run (~$5–10/mo vs ~$45 for Vercel+Supabase). Publish-time rendering follows as an opt-in class for sites that qualify.

Vercel and Cloudflare should be positioned as targets for *rendered output*, never as hosts for the Tovu server. Chasing serverless compatibility for the server itself is the worst option: highest cost, most work, and it fights the process model.

## Ranked slate

1. **E, delivered as A → D.** Container first (universal, cheap, no new subsystem), then publish-time rendering as an opt-in class. Ranking criteria, in order: works for every existing site; cost to operate; amount of new subsystem required; honesty of the UI about what it can do.
2. **A alone.** Everything works, nothing new to build beyond packaging. Forfeits the edge-host story the owner wants commercially.
3. **B (static export) alone.** Cheap and fast for content sites; silently wrong for commerce. Only acceptable if commerce is explicitly out of scope, which it is not.
4. **C (serverless-compatible server).** Rejected. Most work, highest recurring cost, and it fights the process model — the daemon, `worker_threads`, native modules and the filesystem all push the other way.

## Strongest argument against my own position

Two deployment classes is two products to support, document, and test — and the failure mode is a customer who starts on the static class, adds a store, and discovers their deployment target no longer works. That migration path is the hard part, and I have not designed it. A single container-only story would be simpler, cheaper to maintain, and would never strand anyone. If the edge-host demand is smaller than the owner believes, A alone is strictly better than E.

## What would change my mind

A demonstration that incremental rebuild triggered by content mutation is cheap to build on this codebase — that a product/price/stock write can enqueue a targeted re-render of only the affected pages, reliably, within seconds. If that holds, the staleness objection to static commerce largely dissolves and B becomes viable much further up the catalog-size curve, collapsing two classes back into one.

## Confidence

**0.72.** Driven down by three things: I have not verified the pricing claims independently; I do not know how much of Tovu's page rendering depends on per-request state I haven't inspected (auth, personalization, member gating); and multi-tenancy at the build tier is unexamined — if one shared build host serves all workspaces, a hostile theme's blast radius may be worse than I have assumed rather than better.

## Claims I already believe are weakest in my own ledger

- **#14 (cost).** Recalled pricing, not checked. Most likely to be wrong.
- **#2/#3/#4 (tiers).** Corrected mid-session after being stated wrong the first time; the corrected version is grounded in `render.ts:2008-2043` but the `code` tier's behavior is inferred from an else-branch, not read directly.
- **#17 (rate limiting doesn't port).** Asserted from a partial read of `submit-service.ts`; I did not check whether Supabase RLS or an edge function could reconstruct it.
