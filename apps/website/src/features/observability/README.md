# observability (host binding)

The `observability_send_test_error` catalog and registration live in
`@jini-ai/diagnostics/observability/tool-registrations`; its tool metadata is
`@jini-ai/core/tool-metadata/observability`. What stays here is the product copy.

## Wiring

- `test-error-message.ts` owns `TELEMETRY_TEST_ERROR_MESSAGE`, the one host constant for the
  fixed diagnostic: `server/runtime/composition/site-deps/route-deps-site-providers.ts` raises it
  through `sendTelemetryTest`, and `server/runtime/composition/tool-catalog-manifest.ts` passes it
  to `contributeObservabilityTools({ testErrorMessage })` so the tool description names it.
- `sendTelemetryTest`, `authorize` and `workspaceId` reach the registration through the shared
  route deps (`ObservabilityToolDeps`).
