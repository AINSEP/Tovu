# Analytics sinks — generic sink contract + swappable vendor forwarders

Status: decided 2026-10-21 (unattended cloud build, software-architect). Branch
`cloud/build-analytics-2026-10-21` in Tovu + Jini. Shared registry: `@jini-ai/core/provider-registry`
(`createProviderRegistry`, `ProviderResult`, `ProviderContext`) and
`@jini-ai/agent-plugins` `defineProviderContribution` from `cloud/build-provfix-2026-10-21` (merged
into the Jini branch; no TEMP copy needed).

## Today (audit row "analytics (sink)")
- Port `AnalyticsSinkPort` (T `features/analytics/ports.ts:56`, J `analytics/src/ports.ts`).
- Built-ins: Jini `LocalBufferSink` (memory) and Tovu `SqliteBufferSink` (durable, `analytics_events`).
- Sink hard-coded per composition root (`deps.ts:2364` SQLite, `app.ts:1357` memory).
- `AnalyticsSiteConfig.sink: "local" | "forwarding"` is always the literal `"local"`; no setting.
- `AnalyticsHooks.beforeIngest` exists in Jini `ingestHit` but Tovu never passes `hooks`.

## Decisions
1. **Two roles, not one.** The built-in durable sink stays the *primary* `AnalyticsSinkPort`
   (dashboards and "recent hits" read it via `list`). Vendors are *forwarders*: a new, write-only
   contract `AnalyticsForwarder { forward({ hit, context }) → Promise<ProviderResult<void>> }`.
   A vendor cannot be the primary, so switching vendors can never lose or hide local data.
2. **Keyed registry.** Jini `createAnalyticsForwarderRegistry()` = `createProviderRegistry<AnalyticsForwarderModule>`
   with contract `"analytics.forwarder"` and a shape validator. Module shape mirrors mail adapters:
   `{ create({ credential, kit: { httpClient } }) → AnalyticsForwarder }` (`credential` is
   `{ token, baseUrl, username? } | null`; Plausible needs none, GA4/PostHog do).
3. **Composite fan-out sink.** Jini `createFanOutAnalyticsSink({ primary }, { forwarders, report, schedule })`:
   `accept` awaits the primary (errors propagate exactly as today), then hands each allowed
   forwarder the *forwarded projection* of the hit **without awaiting** (beacon must not block on a
   vendor; ADR-035 §5). Forwarder throw/`rejected`/`unknown` → `report` (log-safe, no hit payload),
   never affects the primary or other forwarders. `list`/`capabilities` delegate to the primary.
   `schedule` (default: detach + swallow) lets tests await the in-flight forwards.
4. **Setting `core.analytics.sink` (per site).** String, default `"local"` = built-in only. Any
   other value is a forwarder id; built-in is always on (fan-out). Unknown/unloaded id → built-in
   only + one warning (fail toward not sending data). `AnalyticsSinkKind` widens from
   `"local" | "forwarding"` to `"local" | (string & {})` (additive for readers; `"forwarding"` was
   never produced). The old header rule "no sink key until an adapter exists" is honored: the key
   lands together with a constructible forwarder path (registry + plugin loader).
5. **Plugin contribution.** Tovu `features/agent-plugins/analytics-forwarder-registry.ts`:
   `defineProviderContribution({ contract: "analytics.forwarder", filename: "tovu-analytics-forwarders.json" })`
   with descriptor `{ id, label, module, credentialLabel? }`, loaded per workspace with the boot's
   `loadPluginContributions` (same trust gate as mail: active + bundled digest + contained `.mjs`).
   Refusals are logged, never thrown. Plugins never import each other or core internals.
6. **`beforeIngest` wired.** Jini `composeBeforeIngestHooks({ hooks })` chains handlers in order;
   `null` drops the hit; a handler that throws is skipped (hit passes unchanged) and reported — a
   broken plugin must not silently zero a site's analytics. Tovu passes `hooks` into
   `registerAnalyticsIngestRoute` (ports.ts:153 now has a caller). Handlers come from the
   same plugin contribution mechanism, contract `"analytics.ingest_hook"`
   (`tovu-analytics-hooks.json`), so they also go through the trust gate. Hooks run before both
   the primary and forwarders: one decision, one place.
7. **Consent (no second gate).** Vendor forwarding is decided per request from the *existing*
   cookie-consent engine. Jini `@jini-ai/cms/consent/express` gains one exported reader,
   `readRequestConsentChoices({ ports, request }, { cookieName })`, built from the engine's own
   `currentRecord` + `resolveConsentRegion` + `resolveConsentChoices` + `Sec-GPC` logic (the same
   code that gates page scripts). Tovu builds it from `createSiteConsentPorts` (the same ports the
   middleware mounts). Rule: forward only when `choices.analytics === true`.
   - Consent disabled → engine resolves nothing gated → same as page scripts: allowed.
   - Consent enabled, no/invalid/expired receipt in opt-in region → denied. Read failure → denied.
   - GPC → analytics false (engine rule). DNT/GPC also still drop the hit at ingest if honored.
   - The first-party cookie-less built-in sink is unaffected (no cookies, no PII), as today.
8. **Privacy to vendors.** Forwarders receive `ForwardedHit`; `toForwardedHit` keeps only
   `workspaceId, occurredAt, kind, path, referrerHost, utm, country, deviceClass, browserFamily,
   osFamily, eventName, eventProps, visitorHash`. Raw IP/UA never exist past ingest (unchanged
   invariant), so they cannot reach a vendor; `region` and `sessionId` are dropped (minimisation).
   `visitorHash` stays (daily-rotating, per-site salted, not reversible) so vendors can count
   uniques; a site that wants none of that keeps `"local"`.
9. **Per-request wiring.** Composition builds once: primary sink, `loadForwarders(workspaceId)`
   (cached registry promise), hook chain. The route computes `consentAllowsVendors` per request and
   passes a fan-out sink whose forwarder list is `[]` when denied or `sink === "local"`.

## Lots (each one commit per repo, pushed)
- J1 merge provfix helper. J2 forwarder contract + registry + `toForwardedHit` + fan-out sink +
  hook chain (analytics pkg, 100% tests). J3 consent request reader (cms pkg, tests).
- T1 `core.analytics.sink` setting + config reads it. T2 forwarder/hook plugin registries.
  T3 route + composition wiring (fan-out, consent, hooks) in deps.ts and app.ts. T4 docs/INFO.

## Migration / data safety
- No schema change. `analytics_events` and `SqliteBufferSink` untouched; primary is the same
  instance, so existing rows and the recent-hits screen keep working. Default `"local"` = today's
  behaviour byte for byte (no forwarders, no hooks registered → identical path).
- Setting definition is registered idempotently on boot (existing registrar); no TS migration
  needed (ADR-066 untouched). Rollback = set `"local"` or remove the plugin.

## Risks
- Vendor latency/outage: forwards are detached; a shared per-route in-flight cap
  (`createAnalyticsForwardLimiter`, default 64) drops + logs vendor calls over the cap, so a flood
  sheds vendor traffic, never local hits. Vendor modules should still bound their own timeouts.
- Plugin providers and vendor credentials are cached 60s (failures not cached): a plugin change or
  key rotation takes effect within a minute.
- Consent read adds one receipt file read per beacon only when a vendor is configured.
- Forwarded data is no longer only first-party: privacy page copy must name the vendor (owner).
- `beforeIngest` handlers run in-process (bundled-digest plugins only), not out-of-process yet.

## LOCAL-RUN NEEDED
- Real vendor endpoints (Plausible/PostHog/GA4 modules are not built here); browser consent flow.
