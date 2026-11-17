# R12 sheet: provider-plugins and agent-plugins payloads (4 sub-sheets)

Read `COMMON.md` first. Sites: `sites/R12.sites.tsv` (19 sites, 16 files in `packages/provider-plugins/src`) plus the payload lines below (not in the census: it reads `src/` only). Needs: C6 (done: `provider-plugins → agent-runtime` is gone), C8 (landed: `core/contracts/{forms,charts,plugin-sdk}`), **C12-OBS** (sheet exists on `plan/untangle-gaps-2026-11-16`; **not landed**: `provider-plugins → analytics` 3 sites and the observability type sites are still there), Q6 (answered: a provider restates the domain port structurally; helpers arrive through the context; host `satisfies` + conformance).

`provider-plugins → cms` and `→ plugins` are gone (C8). Plugins never import each other: each provider folder gets its own `contract.ts`; nothing is shared between provider folders.

| Sub-sheet | Folder | Sites | Needs | Estimate (Sonnet) |
|---|---|---|---|---|
| R12a | `payments-stripe/` | 6 (commerce) | — | 90k |
| R12b | `analytics-posthog/` | 6 (cookie-consent 3, analytics 3) | C12-OBS for the 3 analytics type sites | 70k |
| R12c | `observability-opentelemetry/`, `observability-sentry/`, `telemetry-reporter.ts`, `charts-echarts/`, `charts-recharts/` | 7 (diagnostics 5, ui 2) | C12-OBS | 90k |
| R12d | agent-plugins payloads (`vercel/`, `netlify/`, `cloudflare` build script) | payload lines | — | 50k |
All four are folder-disjoint.

## The pattern (same in every sub-sheet)
1. **Types:** create `<provider>/contract.ts` and copy, field for field, only the type members the provider reads or returns. Header comment: "Structural copy of the `<domain>` provider port; the host proves the fit with `satisfies`. A plugin cannot import the domain package." Precedent to read first: the meilisearch agent-plugin's byte-identical copy and its test (`rg -l "byte-identical" packages/agent-plugins`).
2. **Helper values come through the context the domain already hands the provider.** Before designing anything, read the domain's context type and search for an existing owner (lesson 9).
3. **Fit is proven twice:** (a) host `satisfies` line in the Tovu file; (b) a type-level test **in the domain package** is not possible (the domain cannot import the provider), so (b) is the domain's conformance suite run by the host or by `packages/integration-tests` (G-TESTS T4).
4. **Drift guard (both directions, lesson 24):** `packages/integration-tests/src/provider-contracts.typecheck.ts` asserts `ProviderLocal extends Domain` **and** `Domain extends ProviderLocal` for the copied members. If `packages/integration-tests` does not exist yet, put the file in the Tovu wiring folder and say so.

## R12a: payments-stripe (`commerce/payments/kernel`)
Files: `amount.ts:1` (`moneyProblem` value, `Money`), `checkout-session.ts:1` (`paymentError` value + 5 types), `http.ts:1` (`paymentError` + 3 types), `provider.ts:1` (`paymentError`, `PaymentProvider`, `ProviderCapabilities`), `session-reading.ts:1`, `webhook.ts:1` (types only).
- Types → `payments-stripe/contract.ts`: `Money`, `IntentRequest`, `NextAction`, `Outcome`, `PaymentEvidence`, `PaymentMode`, `ProviderPaymentStatus`, `WebhookFact`, `PaymentErrorCode`, `ProviderContext`, `PaymentProvider`, `ProviderCapabilities`. No payment type goes to core (Q6).
- Values `paymentError`, `moneyProblem`: **CHECK** `packages/commerce/src/payments/kernel` for the `ProviderContext` type. If it already carries error/money helpers, use them. If not, this is a domain contract change: commerce adds `readonly errors: { paymentError(...): …; moneyProblem(...): … }` to `ProviderContext` and fills it where it builds the context (one place: find it with `rg -n "ProviderContext" packages/commerce/src -g '!**/__tests__/**'`). That commerce edit is the **first commit** (green alone: an added field), the provider edit the second. **Not verified by this run** which case holds.
- `paymentError` is also called in `provider.ts` at module/factory level, where no context exists (read the call sites). A call with no context in reach takes the helper from the provider factory's `required` input instead (`createStripeProvider({ errors, … })`), bound by the host. Do not copy the helper's body into the plugin: its error codes are the domain's contract.
- Security (class: webhook authenticity and amount integrity): `webhook.ts` and `amount.ts` must not change behaviour. Tests first: characterize, on the old code, (1) a webhook with a bad signature → the same error code, (2) an amount with a currency-exponent mismatch → the same `moneyProblem` result; both through a fake context whose helpers record their arguments. They fail if a helper call is dropped or its arguments reordered.
- Tovu wiring: `apps/website/src/server/runtime/composition/jini-providers.ts` (NEW; R12a creates it, R12b/c append their own exports: land R12a first or let the coordinator merge the three small files): `stripeProvider satisfies PaymentProvider` (the commerce type) and the `errors` binding.

## R12b: analytics-posthog
- `consent-adapter.ts:5` `purgeStorage` (value from `@jini-ai/cookie-consent/client`): the consent adapter receives it. Read how cookie-consent calls the adapter (`ConsentAdapter`, `Revoker` in `packages/cookie-consent/src`): if the revoke callback already receives a storage/purge helper, use it; otherwise the provider factory takes `purgeStorage` in `required` and the host binds it. Privacy (class: consent revocation): test first that a revoke with the PostHog storage prefixes calls purge with exactly the provider's `StoragePrefixes` (characterize the prefixes from old code); it fails if revoke stops purging.
- `consent-adapter.ts:6`, `consent.ts:5` types → `analytics-posthog/contract.ts`: `ConsentAdapter`, `ConsentState`, `Revoker`, `StoragePrefixes`, `LazyAdapter`, `RawContribution`.
- `browser.ts:2`, `consent.ts:6`, `posthog.ts:23` (`BrowserAnalyticsContribution`, `ProductAnalyticsAdapter`, `ProductAnalyticsPort`): C12-OBS moves these to `@jini-ai/core/contracts/observability`; after it lands this is a repoint (applier rows are in `C12-OBS.repoint.tsv`). **Do not restate them here.** If C12-OBS has not landed when R12b runs, do the cookie-consent half only and report PARTIAL.

## R12c: observability providers and charts
- Types (`MetricInput`, `MetricOptions`, `ObservabilityAdapter`, `ObservabilityConfigEnabled`, `TraceSpanPort`, `ProviderTelemetryReport`) and `createNoopObservabilityPort`: C12-OBS → core. Repoint only.
- Helper values that stay in diagnostics: `resolveObservabilityConfig` (`observability-opentelemetry/index.ts:7`), `errorType`, `redactLabel`, `redactOperationAttributes` (`opentelemetry.ts:38`), `describeReportedError`, `redactOperationAttributes` (`sentry.ts:37`), `describeTelemetryFailure` (`telemetry-reporter.ts:1`). Each provider factory takes them in `required.helpers` (a local interface in the provider's `contract.ts`); the host binds diagnostics' functions. Privacy (class: telemetry redaction): the redaction helpers must be called on every attribute path they are called on today. Test first: a fake `redactOperationAttributes` that tags its output; every exported span/metric attribute set in the provider's tests carries the tag. It fails if a path bypasses redaction. A redaction helper is **required**, never optional-with-passthrough (a missing binding must fail at construction, not silently send unredacted data).
- `createAsyncLocalSpanScope` (`diagnostics/observability/node`, a Node implementation): factory input bound by the host (GAPS §3.1). Not core.
- C8 left a decision: OTel vendor code inside diagnostics (`createOtelObservabilityPort`). C8's sheet says it removed the mapping; verify `rg -n "opentelemetry" packages/diagnostics/src -g '!**/__tests__/**'` is empty and report.
- Charts: `charts-echarts/mount.ts:12`, `charts-recharts/mount.tsx:9` import `applyChartTheme` from `@jini-ai/ui/charts/browser`. Verified: core's chart provider contract passes it in the **mount input**, not the options: `mount(input: ChartRenderInput & { element; applyTheme: ChartThemeApplier<E> }, options?: ChartMountOptions)` (`core/src/contracts/charts.ts:43`). Each mount reads `input.applyTheme` and the import is deleted. Check the applier's argument shape against the two call sites (lesson 12); the host binds `@jini-ai/ui/charts/browser`'s `applyChartTheme` to it.

## R12d: agent-plugins payloads
At the merged state (`rg -n "@jini-ai/(?!core|protocol)" -P packages/agent-plugins -g '*.{mjs,d.ts}' -g '!**/src/**' -g '!**/node_modules/**'`):
- `vercel/object-stores/vercel-blob.mjs:76`, `netlify/targets/netlify.mjs:16,17,22`: JSDoc `import("@jini-ai/devops/deploy")` types (`ArtifactStorePort`, `DeployFile`, `DeployTarget`, `DeployError`). Replace by local `@typedef`s that restate the members used (Q6). `DeployError` is used as a **class** (`typeof import(...).DeployError` in the helpers typedef at `netlify.mjs:22`): it already arrives as an injected helper; keep that.
- `vercel/__tests__/vercel.test.mjs:8` imports `DeployError` from devops: a test edge (Q5). It uses a local fake error class with the same `code` field, or moves to integration-tests.
- `scripts/build-cloudflare.mjs:8` bundles `readSubmissionEvidence` from `@jini-ai/cms/forms` into the payload at build time. This is a **build-time copy of domain code into a plugin**. C11a/C8 touched `submission-evidence`; verified: `readSubmissionEvidence` is **not** in core at the merged state. Owner decision OD-5 (INDEX) is needed before this item; do the other payload items and report this one as held.
- Comments that say "Ported from `@jini-ai/devops` …" are provenance why-comments: keep them.
- The stale `agent-plugins → commerce` optional peer goes in G-STALE-DEPS.

## Manifest
Last commit of each sub-sheet: remove the optional peers the folder no longer needs from `packages/provider-plugins/package.json` (`commerce`, `cookie-consent`, `analytics`, `diagnostics`, `ui`), each only when `rg` shows no production import left in **any** provider folder; this file is shared by R12a–c, so only the last sub-sheet to land edits it (coordinator decides), and retire `isPayloadPeerDeclaration` (coordinator).

## STOP
- A domain context lacks the helper and the domain edit would change a published signature other than by adding a field.
- C12-OBS is not landed (R12b/c report PARTIAL; they do not restate the types as a workaround).
