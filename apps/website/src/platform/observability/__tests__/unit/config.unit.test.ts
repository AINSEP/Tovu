import assert from "node:assert/strict";
import test from "node:test";

import { resolveObservabilityConfig } from "../../config.js";

/** @file Mirrors `features/deployments/publish-credentials/__tests__/execution-mode.unit.test.ts`'s
 *  shape — the safe-default contract matters most, so it is asserted first and against the widest
 *  range of "operator did not configure anything" inputs. */

test("disabled (safe default): an env object with neither OTLP endpoint var set", () => {
  const config = resolveObservabilityConfig({ env: {} as NodeJS.ProcessEnv });
  assert.deepEqual(config, { enabled: false });
});

test("disabled: both OTLP endpoint vars present but empty/whitespace-only are treated as unset", () => {
  assert.deepEqual(
    resolveObservabilityConfig({ env: { OTEL_EXPORTER_OTLP_ENDPOINT: "", OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: "   " } as NodeJS.ProcessEnv }),
    { enabled: false }
  );
});

test("enabled: a non-empty OTEL_EXPORTER_OTLP_ENDPOINT (the general, all-signals var) flips enabled", () => {
  const config = resolveObservabilityConfig({ env: { OTEL_EXPORTER_OTLP_ENDPOINT: "http://collector.example.com:4318" } as NodeJS.ProcessEnv });
  assert.deepEqual(config, { enabled: true, serviceName: "tovu", tracerName: "tovu.observability", endpoint: "http://collector.example.com:4318/v1/traces" });
});

test("enabled: a non-empty OTEL_EXPORTER_OTLP_TRACES_ENDPOINT (the traces-specific var) ALSO flips enabled, independent of the general var", () => {
  const config = resolveObservabilityConfig({ env: {
    OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: "http://collector.example.com:4318/v1/traces",
  } as NodeJS.ProcessEnv });
  assert.deepEqual(config, { enabled: true, serviceName: "tovu", tracerName: "tovu.observability", endpoint: "http://collector.example.com:4318/v1/traces" });
});

test("enabled config explicitly resolves the OTLP traces endpoint and tracer identity", () => {
  const config = resolveObservabilityConfig({ env: { OTEL_EXPORTER_OTLP_ENDPOINT: "http://collector.example.com:4318" } as NodeJS.ProcessEnv });
  assert.deepEqual(Object.keys(config).sort(), ["enabled", "endpoint", "serviceName", "tracerName"]);
});

test("enabled: OTEL_SERVICE_NAME overrides the \"tovu\" default when set", () => {
  const config = resolveObservabilityConfig({ env: {
    OTEL_EXPORTER_OTLP_ENDPOINT: "http://collector.example.com:4318",
    OTEL_SERVICE_NAME: "  tovu-staging  ",
  } as NodeJS.ProcessEnv });
  assert.equal(config.enabled, true);
  assert.equal((config as { serviceName: string }).serviceName, "tovu-staging");
});

test("enabled: OTEL_SERVICE_NAME present but blank falls back to the \"tovu\" default rather than an empty service name", () => {
  const config = resolveObservabilityConfig({ env: {
    OTEL_EXPORTER_OTLP_ENDPOINT: "http://collector.example.com:4318",
    OTEL_SERVICE_NAME: "   ",
  } as NodeJS.ProcessEnv });
  assert.equal((config as { serviceName: string }).serviceName, "tovu");
});

test("an explicit process.env snapshot resolves without throwing", () => {
  assert.doesNotThrow(() => resolveObservabilityConfig({ env: process.env }));
});
