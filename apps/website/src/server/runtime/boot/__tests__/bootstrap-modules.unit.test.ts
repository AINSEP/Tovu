import "../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import test from "node:test";

import { createRouteDeps } from "../../composition/app.js";
import { buildBootModules, logCriticalBootFailures } from "../bootstrap.js";

/**
 * @file The simple boot modules' own prepare/start/stop wiring over real in-memory route deps, and
 * the failed-boot log line — no module mocks, so this file measures `bootstrap.ts` unsplit.
 */

test("logCriticalBootFailures names only critical modules that did not reach ready", (t) => {
  const errors = t.mock.method(console, "error", () => {});
  logCriticalBootFailures({ ok: false, modules: [
    { name: "settings", owner: "features/settings", criticality: "critical", lifecycle: { status: "ready" } },
    { name: "seo", owner: "seo", criticality: "critical", lifecycle: { status: "failed", reasonCode: "SEO_SEED_FAILED", remediationHint: "retry" } },
    { name: "newsletter", owner: "newsletter", criticality: "optional", lifecycle: { status: "failed", reasonCode: "NEWSLETTER_DOWN", remediationHint: "retry" } },
    { name: "db", owner: "features/database", criticality: "critical", lifecycle: { status: "disabled", reasonCode: "NO_DB", remediationHint: "configure" } },
  ] });
  assert.deepEqual(errors.mock.calls.map((call) => call.arguments), [
    ['[boot-lifecycle] critical module "seo" (seo) is failed: SEO_SEED_FAILED'],
    ['[boot-lifecycle] critical module "db" (features/database) is disabled: NO_DB'],
  ]);
});

test("the readiness modules prepare from the route deps' own readiness promises and start/stop as no-ops", async () => {
  const deps = createRouteDeps();
  const modules = buildBootModules(deps, { useMemory: true, defaultContentDbPath: () => ":memory:" });
  for (const name of ["database-migration-reconciliation", "settings", "seo", "newsletter", "comments"]) {
    const module = modules.find((candidate) => candidate.name === name);
    assert.ok(module, name);
    await module.prepare();
    await module.start();
    await module.stop();
  }
});

test("plugin-runtime-attach starts one activation poll at a time, honouring an explicit interval, and stops it", async () => {
  const deps = createRouteDeps();
  await deps.pluginRuntimeReady;
  for (const options of [{}, { pluginActivationPollIntervalMs: 60_000 }]) {
    const attach = buildBootModules(deps, { useMemory: true, defaultContentDbPath: () => ":memory:", ...options }).find((module) => module.name === "plugin-runtime-attach");
    assert.ok(attach);
    await attach.prepare();
    await attach.start();
    await attach.start();
    await attach.stop();
  }
});
