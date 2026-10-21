# build-analytics REPORT — 2026-10-21

**Result: done.** Analytics now has a generic sink contract with swappable vendor forwarders. The
built-in SQLite sink stays the default and is always on. Design: `.cloud-coord/analytics-DESIGN.md`.
Branch `cloud/build-analytics-2026-10-21` in both repos. Every push succeeded; nothing was force-pushed.

## What was built
- **Two roles.** The built-in sink stays the awaited *primary* (dashboards and recent hits read it).
  Vendors are write-only *forwarders* (`AnalyticsForwarder.forward → ProviderResult`), so swapping
  or removing a vendor can never lose or hide local data. No schema change; `analytics_events` is untouched.
- **Keyed registry.** It is built on the shared `createProviderRegistry` (provfix helper ddc1e606,
  fast-forward merged into Jini, so no TEMP copy in either repo). Plugin contributions use
  `defineProviderContribution`: `tovu-analytics-forwarders.json` for vendors, `tovu-analytics-hooks.json`
  for hooks. They pass the same trust gate as mail adapters, and a refused plugin is logged, never a boot failure.
- **Setting `core.analytics.sink`** (per site, default `"local"` = built-in only). It is registered by
  the existing idempotent registrar, so existing sites get it on boot with unchanged behaviour. An
  unknown id keeps the built-in sink only and logs a warning.
- **Fan-out sink.** The primary is written first. Vendors then get a minimised hit with no region
  and no session id (raw IP and user agent never exist after ingest). Vendor calls are detached from
  the beacon response, and a vendor failure is logged but never affects the primary. A shared
  per-route cap (64 in flight) drops vendor calls under a flood, never local hits.
- **Consent, read from the existing engine (no second gate).** I added
  `@jini-ai/cms/consent/express#readRequestConsentChoices`, built from the engine's own receipt,
  region and GPC logic. Tovu calls it with the same ports the consent middleware mounts. A vendor
  only receives a hit when the visitor allows `analytics`. If consent is disabled, nothing is gated,
  the same as page scripts. A failed receipt read or the GPC signal both deny.
- **`beforeIngest` is now wired.** The plugin hook chain reaches `ingestHit`. A hook returning
  `null` drops the hit for every sink; a hook that throws is skipped and logged.
- **Caching.** Plugin providers and vendor credentials are cached for 60s; a failed load is not
  cached. The vendor key comes from the custom-credential store via the module's `credentialLabel`.
- **Hermetic root (`app.ts`) unchanged:** no providers, built-in sink only.

## Commits
Jini: ec51fc86, e43e391d, 389ff0c2, 98c69021 (plus the provfix fast-forward to ddc1e606).
Tovu: 26ca178b (design), 48d163b4, 7bd9b50a, 95c38b30, c07d10fd, d28a09cb, 03f0a9ee, ebcef67b,
4e5e5680, 4764159f, plus this report and the progress log.

## Verification (real output)
- Tovu, node:test with concurrency 1: analytics, consent, consent middleware, ingest route,
  agent-plugins, composition glue and settings — **476/476 pass**. Coverage is 100% lines, branches
  and functions on every new or touched file: `forwarding.ts`, `jini-adapters.ts` (it was 96% before
  this work), `config.settings.ts`, `analytics-provider-registry.ts`, `analytics-providers.ts`, and
  the `analytics-ingest.ts` route.
- Jini, vitest: analytics **136/136** (`forwarding.ts` at 100%), cms consent **322/322** (11 new
  tests, none removed), core provider registry **10/10**. Typecheck is clean for analytics and cms.
- ESLint is clean on every touched Tovu file.

## Pre-existing failures (not caused by this work)
- Tovu `tsc -p tsconfig.json` has 10 errors, the same set before and after my changes: Kysely
  `ContentKernel`, `consentAudit`, publish-content backstop, `cookie.serialize`, permanent-delete,
  import-site. None are in touched code.
- Jini `pnpm guard` fails its self-test (rule R2, an agent-runtime fixture). I confirmed it fails the
  same way on unmodified `origin/cloud/integration-2026-10-21`.

## Decisions an owner may revisit
- `visitorHash` (rotates daily, salted per site) is forwarded so vendors can count unique visitors.
- With consent disabled, forwarding is allowed (it mirrors how page scripts behave). Sites that
  forward to a vendor should name it in their privacy page.
- Tovu's provfix branch has no helper commit (only mail and webhook fixes), so I did not merge it.

## LOCAL-RUN NEEDED
- A real vendor module (Plausible, PostHog or GA4) against a live endpoint; none was built here.
- The browser consent flow end to end: accept, reject, GPC, then check whether a vendor received the hit.
- A full `npm test` run of Tovu and Jini (only the touched packages were run here).
