Code Inspection(Review): **Code Inspection + Security** personas loaded for lifecycle, packaging, and privacy review.

Reviewed `gh/cloud/prov-wave2-base...gh/cloud/prov-wave2-jini` through `800d9caf`. Paths below are relative to Jini. **Changes required.**

- **High — Environment credentials remain active.** `packages/provider-plugins/src/observability-opentelemetry/opentelemetry.ts:101`: the exporter retains SDK environment fallback, acknowledged in REPORT.md:65. With `OTEL_EXPORTER_OTLP_HEADERS` set, credentials bypass the settings card and can reach a site’s collector. **Smallest fix:** disable environment fallback in the plugin’s exporter configuration/transport; verify that only injected credentials are used.

- **Medium — New site-attribution requirement unmet.** `packages/provider-plugins/src/observability-opentelemetry/opentelemetry.ts:113`, `packages/provider-plugins/src/analytics-posthog/posthog.ts:48`, `packages/provider-plugins/src/ai-trace-langfuse/langfuse.ts:69`: OTel resources contain only service identity; PostHog and Langfuse lack enforced site context. Sites sharing a backend cannot reliably attribute signals. **Smallest fix:** inject site id/slug, environment, and project id at factory creation; merge them into every required resource/property/group/metadata payload.

- **Medium — Langfuse closes borrowed clients.** `packages/provider-plugins/src/ai-trace-langfuse/index.ts:24`: disposal unconditionally shuts down `optional.client`. Disabling one provider can stop another consumer sharing that client, violating `PluginProviderResource`’s owned-resources-only contract. **Smallest fix:** track ownership and close only factory-created clients.

- **Medium — Boundary test misses literal imports.** `packages/provider-plugins/src/__tests__/core-boundary.test.ts:14`: valid forms such as ``import(`langfuse`)`` and `import /* comment */ ('langfuse')` evade the scanner. The self-tests exercise only the vendor-name regex. **Smallest fix:** parse import/require syntax using the installed TypeScript parser and test complete source examples.

- **Medium, pre-existing — Fan-out isolation excludes scope execution.** `packages/diagnostics/src/observability/fanout.ts:21`: a tracker’s `run()` throwing before invoking its callback prevents application work and later scopes from running. **Smallest fix:** contain scope failures while preserving callback results/errors and guaranteeing one callback execution.

The four step-0 fixes appear correct on source inspection. No additional issue found in integrity generation, packed-install structure, consent revision checks, or SDK ABI ranges. No edits, tests, or servers run; reported coverage/CCN were not independently verified.
