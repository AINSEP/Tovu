# Provider wave 2 — run report

> Jini pushes went to `cloud/prov-wave2-jini` (no 403; no format-patch fallback needed).
> Tovu pushes (code + this report) went to `cloud/prov-wave2-tovu`.

## 1. Headline

- **Steps done:** 0 (a, b, c, d; e triaged), 1 (OTel + Sentry), 2 (PostHog), 3 (Langfuse), 4 (Stripe move only), 5 (manifests, packed installs, boundary scan, changesets), 6 (Tovu SDK type + provider-plugin boot selection), 7 (chokepoints + 5 owner-action events), 8 (coverage + CCN). **Not done:** see §5.
- **Plugins built (one distribution `@jini-ai/provider-plugins`):** `observability-opentelemetry`, `observability-sentry`, `analytics-posthog`, `ai-trace-langfuse`, `payments-stripe` (plus wave 1's `fixture-provider`). Each: tier-3, engine 1, `sdkRange: "^0.1.0 || ^1.0.0"`, `providers.register` capability, one `contributes.providers` declaration, empty hooks/fields, integrity map over every file incl. retained licenses.
- **Vendor imports left in core: 0.** Measured by `packages/provider-plugins/src/__tests__/core-boundary.test.ts` (every other Jini package's `src/**` import specifiers and all four dependency fields; catches `@opentelemetry/*`, `@sentry/*`, `posthog-node|js`, `langfuse*`, `stripe`; does NOT catch computed `import(name)` or unlisted transitive deps). Tovu core: `rg "@opentelemetry|@sentry|posthog|langfuse|stripe"` over `apps/website/src` non-test sources → 0 imports; the `@opentelemetry/*` packages moved to Tovu **devDependencies** for the test-only `fixtures/otel-sdk.ts` (real-SDK call-site tests).
- **Packed-install results:** `artifact.integration.test.ts` packs the exact publish file list (`npm pack --ignore-scripts`), extracts it outside the repo, verifies every integrity digest, imports each `server/index.mjs` in a fresh Node process with `NODE_PATH=''` and cwd outside the workspace (no vendor SDK resolvable) → setup/register/factory/dispose OK; then installs through `previewSitePluginInstall`/`installSitePlugin` and loads through `loadPlugin` + `createPluginProviderHost` under **both** host ABIs (`tovu`/`0.1.0`, `com.example.host`/`1.0.0`) — **6/6 plugins pass**.
- **Tests added/changed:** Jini `@jini-ai/provider-plugins` 1 → 129 tests (per file: stripe 28 + runtime-ports 1, sentry 10, langfuse 17, OTel 37, packed-install 7, build script 5, core boundary 11, posthog 12, fixture 1). Moved, not new: the Stripe suites (25), Sentry 5, PostHog 1, Langfuse mapping/loader 2 — the rest are new or ported from Tovu's former OTel unit tests. Jini step-0 regressions: daemon +3 (trace reopen after dispose, abortable stalled start, start-failure correlation clear) + 1 table case, infra +1 (sync `awaitOverlap` throw), mcp 1 case fixed (test-only); each new step-0 test was shown **red without its fix**. Tovu: new files `provider-plugins.unit` (18), `telemetry-consent.unit` (4), `plugin-runtime.provider-plugins` (5), `run-lifecycle-tracing.unit` (5), `owner-action-product-events` (4), `operation.unit` (3), `publish-operation.unit` (1); `outbox-drainer` +3; `deps-observability-wiring` rewritten (2); status route +1 (500), env cases replaced by a provider-port case.
- **Coverage (touched non-UI files, v8/node coverage, lines/branches):** see §8 — every new or moved file at 100/100 except the listed exceptions.
- **CCN ≤ 10 (lizard 1.17, `-C 10`)** on all new/moved functions; pre-existing over-10 functions in touched files listed in §8 (none increased except `checkPackageLayers` 29→30).
- **Wall:** 22:21Z → 23:55Z (~1 h 35 m of the 5 h cap). **Rough tokens:** ~0.7M of ~2.5M.

## 2. Before / after per vendor

| Vendor | Before | After | How a host enables it |
|---|---|---|---|
| OpenTelemetry | Jini `@jini-ai/diagnostics/observability/opentelemetry` subpath (optional `@opentelemetry/*` peers) **and** a second copy in Tovu core `apps/website/src/platform/observability/otel.ts`, required lazily when `OTEL_EXPORTER_OTLP_*` env was set | `packages/provider-plugins/src/observability-opentelemetry/{opentelemetry,index}.ts` → artifact `plugins/observability-opentelemetry/<v>/`. Diagnostics keeps the SDK-free lifecycle (`otel.ts`), redaction, noop, fan-out, decorators. Tovu's copy is now a **test-only** fixture (`__tests__/fixtures/otel-sdk.ts`) | install + enable + configure; factory input `{ serviceName, tracerName, endpoint?, tracesEndpoint?, headers? }` — any OTLP/HTTP endpoint plus generic headers (Grafana Cloud = Basic auth header; nothing Grafana-specific) |
| Sentry | `@jini-ai/diagnostics/observability/sentry` subpath (optional `@sentry/node` peer) | `src/observability-sentry/` → `plugins/observability-sentry/<v>/` | `{ dsn, environment?, tracesSampleRate? }` (rate defaults to 0 = errors only); optional host-owned `client` is reused and never closed |
| PostHog | `@jini-ai/analytics/product/posthog` subpath (optional `posthog-node` peer) | `src/analytics-posthog/` → `plugins/analytics-posthog/<v>/`, contract **`product_analytics`** | `{ apiKey, host }`; the host wraps the port in `withProductAnalyticsGuards` (consent first) |
| Langfuse | `@jini-ai/agent-runtime/ai-trace/langfuse` subpath with a lazy `import('langfuse')` (no declared dep) | `src/ai-trace-langfuse/` (bundles `langfuse@3.39.2`) → `plugins/ai-trace-langfuse/<v>/`, contract `ai_trace` | `{ publicKey, secretKey, baseUrl?, environment?, release? }`; sink goes through `createFanOutAiTraceSink` into the daemon's `withAiTracing` |
| Stripe | `@jini-ai/capability-providers/adapters/stripe` | `src/payments-stripe/` → `plugins/payments-stripe/<v>/`, contract `payments` — **moved only**: its README records commerce's payment contract as canonical and conversion as deferred | **Not selected or activated anywhere** (no Tovu binding) |

## 3. Public API changes (OM reads this)

**Jini removed (patch changesets; unpublished):**
- `@jini-ai/diagnostics/observability/opentelemetry` (`createOtelFactories`, `createOtelObservabilityPort` [SDK form], `createOtelObservabilityAdapter`, `createAsyncLocalSpanScope` [duplicate; still exported from `./observability/node`]) and `/observability/sentry` (`createSentryObservabilityAdapter`, `createSentryObservabilityPort`, `SentryConfigEnabled`…); all `@opentelemetry/*` + `@sentry/node` dev/peer deps.
- `@jini-ai/analytics/product/posthog` and the `posthog-node` peer.
- `@jini-ai/agent-runtime/ai-trace/langfuse` (`createLangfuseAiTraceSink`, `loadLangfuseAiTraceSink`, `toLangfuseCall`, `LangfuseClientPort`).
- `@jini-ai/capability-providers/adapters/stripe` (`StripePaymentsProvider`, options, error).

**Jini added:** artifacts in `@jini-ai/provider-plugins` (`catalog.json`, `plugins/<id>/<version>/`); `LICENSE` files in core/diagnostics/analytics/agent-runtime/protocol (their `files` already listed one); devops hardwiring treats `provider-plugins/` as provider-adapter location; layer table gains `provider-plugins: 7`; the layer check accepts devDependency edges for `jini.kind: "plugin-packaging"`. Build script: license records are `package-license.json` (was `package.json`, which the guard misread as a workspace package), sibling/supplement license fallback (`license-supplements/<repo>/` with `SOURCE`).

**Provider contract ids** (core `PROVIDER_ID_PATTERN` forbids `-`): `observability`, `product_analytics`, `ai_trace`, `payments`.

**Tovu public SDK (`packages/sdk`):** `PluginSdk.providers: { register(required: PluginProviderContribution, optional?) }` and re-exported types `PluginProviderContribution`, `PluginProviderFactory`, `PluginProviderResource`. Its `@jini-ai/plugins` range must be raised to the first published release containing those exports (not done: nothing is published yet).

**Tovu RouteDeps:** `productAnalytics?`, `aiTraceSink?` on `ObservabilityDeps`; `CreateSiteRouteDepsOverrides.bootProviderPlugins` test seam. Removed: `platform/observability/config.ts` (`resolveObservabilityConfig({ env })`), `createObservabilityPort`.

## 4. Tovu wiring map

Boot (`deps.ts` → `composeSiteRouteDeps`, both the serving process and the agent daemon): after the site vault is normalized, `bootProviderPlugins` reads each known plugin's key card (`plugin:<id>` saved API credential: Base URL / Token / optional Username), asks `pluginRuntime.loadProviderPlugins` to load the configured ones that are installed and enabled (Jini loader with provider admission into a dedicated `providerContributions` registry), initializes each through `createPluginProviderHost` (domain validators owned by Tovu; 10 s bound), composes ports, and registers `dispose` with the store close. Unconfigured/uninstalled/disabled/failing ⇒ that contract's noop. Boot re-attach and admin enable never reload a provider plugin; disable/quarantine detaches → provider host disposes its resources.

| Chokepoint | Neutral port | Plugin(s) |
|---|---|---|
| Incoming HTTP requests | `observability.trackRequest` (existing `observability-middleware.ts`, unchanged) | observability-opentelemetry / observability-sentry (fan-out) |
| DB kernel + chat kernel queries, guarded outbound HTTP | `trackDbQuery` / `trackOutboundCall` (existing decorators; now decorated after provider boot) | same |
| Assistant runs (agent daemon) | `withAiTracing({ lifecycle, sink })` via `run-lifecycle-tracing.ts`, only when a sink exists | ai-trace-langfuse |
| Publish/deploy | `trackOperation("site.publish")` around `publishStaticSite` (target id, outcome = `published`/failure code) | observability plugins |
| Outbox / job queue | `trackOperation("outbox.deliver")` per background delivery (event name only), errors via `reportError` | observability plugins |
| Owner actions (5 one-liners) | `productAnalytics.capture({ name, userId: principal.id, properties? })` — generic, consent-gated (`core.privacy.telemetry.metrics` + revision) | analytics-posthog |

Owner-action events: `post_created`, `post_published` (draft→published only), `plugin_toggled` (`{ enabled }` only), `site_publish_started`, `assistant_chat_started`. Captured server-side at the admin routes the admin hooks' dependency ports call (ASSUMPTION: "via the admin hooks' existing dependency ports" read as the server end of those ports, where the principal id is authoritative and consent lives; no browser vendor SDK).

## 5. NOT done / concerns

- **Plugin-declared key cards for code plugins.** Configuration uses the generic secure "API credential" card with the label convention `plugin:<plugin id>`; there is no plugin-specific card copy yet (the existing card system is Agent-Plugin descriptor based). The label mapping (`PROVIDER_PLUGIN_BINDINGS`) names the four plugins Tovu knows how to configure — selection config, not vendor code — but it is Tovu-side knowledge of each plugin's input shape.
- **Hot enable.** Enabling a provider plugin takes effect at the next boot (ports are wired into kernels/clients at boot); disabling retires it immediately (its port goes inert). The cross-process activation poll will re-call `onPluginEnabled` each tick for a provider plugin enabled after boot (cheap discovery; no load) until restart.
- **Stripe conversion** to the commerce contract (deferred by owner); no Tovu/OM payment binding.
- **OM adoption** (owner: OM's own work). OM's identity namespace is not visible from either repo; manifests declare `tovu` and `open-marketing` under one publisher id — unverified for OM.
- **Peer minima / publish:** Tovu SDK's `@jini-ai/plugins` range and consumer pins must move to the first release containing these exports (nothing published; never `npm publish`).
- **OTel SDK env:** the bundled `OTLPTraceExporter` still honours standard `OTEL_*` variables internally (e.g. `OTEL_EXPORTER_OTLP_HEADERS`) if an operator sets them; Tovu code no longer reads or depends on them.
- Plan step 9 items (salvage `/forms` isolation, server/db peer minimum releases) were not in this brief's step list — untouched.

## 6. Commits

Jini `cloud/prov-wave2-jini`: b1fcb8f1 (step 0) · 63bacc58 (step 1) · 212cf50f (step 2) · e46b6ec5 (step 3) · 31819c82 (step 4 + guard) · c3929bb5 (coverage/CCN) · 800d9caf (coverage).
Tovu `cloud/prov-wave2-tovu`: d0cc43f1 (SDK) · d182461e + 733da5f6 (step 6) · 1b06f260, 56caf3ad, 2d553e8d (step 7) · 2325303c, e577eee4 (step 8) · 3eb42aa8 (docs) · report commits.

## 7. Test runs (final tree)

**Jini** (vitest 2, `--minWorkers=1 --maxWorkers=2`): provider-plugins 129/129 · diagnostics 786/786 · analytics 164/164 · capability-providers 196/196 · agent-runtime 4227 pass + 1 skipped · mcp 1370/1370 · devops checks 259/259 · infra 144/144 · daemon 3631/3631 with `agent-executor/__tests__/usage-cost-basis.test.ts` excluded — its 6 cases fail on the base too (they predate the `stopReason` field the base's e2f6a4bc Langfuse import added; stale expectation, not touched here). Full `pnpm --no-bail -r build` green. `pnpm guard`: 23 → **3** violations, all pre-existing and untouched (daemon `tool-recovery/observability.ts` "Tovu" comment; mcp `stdio-hosting.ts` HW2 ×2). Jini `scripts` vitest: 3 failures identical with my changes stashed (coupling isolation ×2, db/infra peer ranges).

**Tovu** (`node --test --test-concurrency=1`, linked Jini): final wide run over 159 files touching observability, plugin runtime, provider plugins, outbox, publish, posts/plugins routes, SDK → **1846 tests, 1830 pass, 13 fail, 3 skipped**. All 13 fail identically on an untouched base worktree (083acb99) or are ENV: Postgres (no server) ×2; publish-site route ×7 (hermetic consent refuses publish with 409 since the owner's default-on consent); `plugin-host` list/toggle (`exports: []`); `mcp-ui-allowlist-completeness` scan; `message-attachment-delivery` daemon pixels; SDK "external type contracts" (`@jini-ai/plugins` range `^0.6.10` vs expected `^0.4.0 || ^0.5.0`). Excluded: `assistant-chat-recovery-bounds.unit.test.ts` — **hangs** (and 2 cases fail) on the base too; I killed it by PID in the first wide run. Typecheck `tsc -p tsconfig.json` clean (excludes tests by config). Biome on changed files: 3 errors, all on pre-existing lines.
Step 0e (earlier, 868 tests / 21 fail) triage is in the run log below; the deps-observability case it listed is now rewritten and green.

**Findings outside the steps (listed, not fixed):** consent-on-by-default broke 6 pages + 7 publish-site route tests' expectations; `assistant-chat-recovery-bounds` hangs; analytics-providers "forwards to plausible" empty; commerce retention fixture vs member schema (`password_hash`); `usage-cost-basis` stale; guard's 3 pre-existing violations.

## 8. Measurements

**Coverage (lines / branches), measured:**

| File | Lines | Branches | Tool / suites |
|---|---|---|---|
| Jini provider-plugins: all 5 vendor adapters + 6 `index.ts` | 100 | 100 | vitest v8, package suite |
| Jini `provider-plugins/scripts/build.ts` | 97.84 | 93.33 | exceptions below |
| Jini `daemon/src/ai-trace-lifecycle.ts`, `run-lifecycle.ts` | 100 | 100 | daemon suite (minus `usage-cost-basis`, see §7) |
| Jini `infra/src/events/outbox/fenced-conformance.ts` | 100 | 100 (funcs 100) | infra suite |
| Tovu `provider-plugins.ts`, `telemetry-consent.ts`, `operation.ts`, `run-lifecycle-tracing.ts`, `outbox-drainer.ts`, `platform/observability/index.ts` | 100 | 100 | node `--experimental-test-coverage` |
| Tovu `observability-status.ts` | 100 | 91.67 | exception below |
| Tovu `plugin-runtime.ts` (whole file, subset of suites) | 97.87 | 84.05 | uncovered lines are all pre-existing (install preview, load-target resolution); every added line (provider admission, `loadProviderPlugins`, skips, detach) is executed by `plugin-runtime.provider-plugins.test.ts` |

Exceptions (with reason): `build.ts` L122–124 CLI entry guard (runs only as `pnpm build`, a separate process); L17 non-ENOENT `package.json` read error (root can read everything here; no honest way to provoke EACCES as root); L19 "no package owner" (every bundled input lives under a package); L72 "Unbundled runtime dependency" (esbuild with `packages: 'bundle'` fails on an unresolvable import before this check — kept as a defence). `observability-status.ts` `req.params.workspaceId ?? ""` (Express always supplies the declared route param). One-line insertions in large pre-existing files (`deps.ts`, `posts/*.ts`, `set-enabled.ts`, `publish-site.ts`, `assistant-chats.ts`, `adapter.ts`, `serving-app.ts`, `agent-daemon-server.ts`) are executed by the new tests; whole-file percentages were not measured.

**CCN (lizard, `-C 10`):** all new/moved functions ≤ 10. Pre-existing over-10 functions in touched files: `composeSiteRouteDeps` 14 (kept at 14 by moving my branches into helpers), Jini `check-package-layers.ts` `check` 18 (unchanged), `checkPackageLayers` 29 → **30** (one added `&&` call to the new `bundledAtBuild` helper), `visit` 11 (unchanged).

## Run log (append-only)

## 2026-10-25T22:23Z — STARTED
Tovu `wave2` @ 083acb99 (origin/cloud/prov-wave2-tovu), Jini `wave2` @ 2e4591b1 (origin/cloud/prov-wave2-base); both checkouts OK.
Caps: stop new work 02:51Z, hard end 03:21Z. Next: Node 24 + Jini install/build + Tovu install/link, then step 0 fixes.

## 2026-10-25T23:17Z — PROGRESS
- Setup: Node 24.22.0; Jini `pnpm install --frozen-lockfile` OK; first `pnpm -r build` failed only on my own step-0 edits (infra test typing, daemon `startPromise` optional) — fixed, dependents rebuilt clean. Tovu `npm ci`, sdk build, `link:jini` (59 links) OK.
- ENV: vitest 2 in Jini rejects `--maxWorkers=2` alone ("minThreads and maxThreads must not conflict") → use `--minWorkers=1 --maxWorkers=2`.
- Step 0 a/b/c/d DONE — Jini b1fcb8f1 (each new test red without its fix, green with it).
- Step 1 (OTel + Sentry plugins) DONE — Jini 63bacc58. Step 2 (PostHog plugin) DONE — Jini 212cf50f.
- ASSUMPTION: Open Marketing's plugin identity namespace is not visible from either repo; manifests declare `tovu` and `open-marketing` under one publisher id `jini/<plugin>`. The loader does not require the namespace key to load (the packed test loads with `com.example.host`).
- ASSUMPTION: core provider ids forbid `-`, so the product-analytics contract id is `product_analytics`.

## 2026-10-25T22:55Z — PROGRESS
- CORRECTION: the 23:17Z stamp on the previous entry was wrong; `date -u` read 22:34 at that push.
- Step 0e (Tovu suites, linked Jini): 868 tests, 844 pass, 21 fail, 3 skipped (`node --test`, concurrency 1). A first run was invalid (I rebuilt diagnostics' dist mid-run → ERR_MODULE_NOT_FOUND); rerun on a stable tree. Failures, none fixed (none in this brief's code; LISTED):
  - ENV (no Postgres server): create-site-route-deps.postgres, move-site-storage.postgres, open-site-store.postgres (9 cases).
  - Known pre-existing: mcp-ui-tool-calls-route.ask-choice "real round trip".
  - Stale expectations vs owner's "consent banner on by default" (c5e98fea): 6 pages route cases (`GET /` 500 fallback, member-cookie denial, members-only home, see-more privacy) now receive the injected `#jini-consent` section/private cache headers. Product behavior is the owner's; tests predate it.
  - plugin-host.integration "plugin list/toggle/uninstall": Jini now returns `exports: []` per plugin; test expects no field.
  - analytics-providers.unit "forwards to the selected vendor…": forwarded list empty (expected `plausible`).
  - commerce-data-retention "commerce off": `table members has no column named password_hash` (fixture vs member schema drift).
  - deps-observability-wiring "no OTLP endpoint": content kernel decorated twice — superseded by step 6 rewiring (I rewrite this composition).
- Jini step 4 (Stripe move only) DONE — 31819c82. Guard: 23 → 3 violations; the 3 left are pre-existing and untouched (daemon tool-recovery/observability.ts "Tovu" comment; mcp stdio-hosting HW2 ×2). Jini `scripts` suite: 3 failures identical with my changes stashed (pre-existing).

## 2026-10-25T23:55Z — DONE
All brief steps done except the §5 list. Jini final head 800d9caf on `cloud/prov-wave2-jini`; Tovu head on `cloud/prov-wave2-tovu` (this commit). No test processes left running.

WAVE2 DONE 2026-10-25T23:55Z — wall ~1 h 35 m, rough tokens ~0.7M.
