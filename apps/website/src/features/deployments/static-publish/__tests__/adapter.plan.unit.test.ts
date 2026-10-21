import assert from "node:assert/strict";
import test from "node:test";
import type { DeployTargetRegistry, LoadedDeployTarget } from "../../deploy-targets/types.js";
import { missingRequiredFieldMessage, planStaticPublish, readStaticPublishConfig, unknownTargetMessage } from "../adapter.js";
import type { StaticPublishConfig } from "../types.js";

/** The pure planning helpers every publish path shares: field presence, module validation, base path and config reading. */
function host(module: Partial<LoadedDeployTarget["module"]> = {}): LoadedDeployTarget {
  return {
    pluginId: "fixture",
    descriptor: { id: "fixture-host", label: "Fixture", module: "targets/fixture.mjs", configFields: [
      { name: "bucket", label: "Bucket", required: true },
      { name: "prefix", label: "Prefix", required: false },
    ] },
    module: { create: () => assert.fail("planning never builds a target"), ...module },
  };
}
const registryOf = (...targets: LoadedDeployTarget[]): DeployTargetRegistry => ({ get: id => targets.find(t => t.descriptor.id === id), list: () => targets, refusals: [] });
const config = (fields: Record<string, string>) => ({ target: "fixture-host", ...fields }) as StaticPublishConfig;

test("planStaticPublish refuses an unknown host, a missing or blank required field, and the module's own validation", () => {
  assert.deepEqual(planStaticPublish(registryOf(), config({ bucket: "b" })), { ok: false, message: "publish target 'fixture-host' is not available: no publish targets are installed (turn on a hosting plugin under Agent Plugins)" });
  assert.deepEqual(planStaticPublish(registryOf(host()), { target: "elsewhere" } as StaticPublishConfig), { ok: false, message: "publish target 'elsewhere' is not available; choose one of: fixture-host" });
  for (const fields of [{}, { bucket: "   " }]) {
    assert.deepEqual(planStaticPublish(registryOf(host()), config(fields)), { ok: false, message: "'bucket' (non-empty string) is required for target 'fixture-host'" });
  }
  const validating = host({ validateConfig: cfg => (cfg.bucket === "Bad" ? "bucket must be lowercase" : null) });
  assert.deepEqual(planStaticPublish(registryOf(validating), config({ bucket: "Bad" })), { ok: false, message: "bucket must be lowercase" });
});

test("planStaticPublish returns the target and only a base path the module supplies", () => {
  const plain = host();
  assert.deepEqual(planStaticPublish(registryOf(plain), config({ bucket: "b" })), { ok: true, target: plain });
  const pathed = host({ basePath: cfg => `/${String(cfg.prefix ?? "")}` });
  assert.deepEqual(planStaticPublish(registryOf(pathed), config({ bucket: "b", prefix: "docs" })), { ok: true, target: pathed, basePath: "/docs" });
  assert.equal(missingRequiredFieldMessage(plain, config({ bucket: "b" })), null);
});

test("readStaticPublishConfig keeps declared string fields, refuses a non-string unless blanks count as absent, and drops unknown keys", () => {
  const target = host();
  assert.deepEqual(readStaticPublishConfig(target, { bucket: "b", prefix: "", extra: "dropped" }, { blankAsAbsent: false }), { ok: true, config: { target: "fixture-host", bucket: "b", prefix: "" } });
  assert.deepEqual(readStaticPublishConfig(target, { bucket: "b", prefix: "" }, { blankAsAbsent: true }), { ok: true, config: { target: "fixture-host", bucket: "b" } });
  assert.deepEqual(readStaticPublishConfig(target, { bucket: 7 }, { blankAsAbsent: false }), { ok: false, message: "'bucket' must be a string" });
  assert.deepEqual(readStaticPublishConfig(target, { bucket: 7 }, { blankAsAbsent: true }), { ok: true, config: { target: "fixture-host" } });
  assert.equal(unknownTargetMessage(registryOf(target), "x".repeat(80)), `publish target '${"x".repeat(64)}' is not available; choose one of: fixture-host`);
});
