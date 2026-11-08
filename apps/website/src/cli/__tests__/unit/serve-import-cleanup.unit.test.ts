import "../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import test from "node:test";

test("server boot schedules cleanup once without waiting and warns on cleanup failure", async t => {
  const calls: string[] = [], warnings: string[] = [];
  let outcome = "pending";
  const stopped = new Error("Test stopped before site initialization.");
  const database = await import("../../../features/site-backup/import-database.js");
  t.mock.module(new URL("../../../features/site-backup/import-database.ts", import.meta.url).href, { namedExports: {
    ...database, tidyImportDatabases: () => { calls.push("cleanup"); return outcome === "pending" ? new Promise<void>(() => {}) : Promise.reject(new Error("Temporary root unavailable.")); },
  } });
  const startup = await import("../../../server/runtime/boot/startup-secrets.js");
  t.mock.module(new URL("../../../server/runtime/boot/startup-secrets.ts", import.meta.url).href, { namedExports: {
    ...startup, initializeStartupSecrets: async () => { calls.push("continue"); throw stopped; },
  } });
  const logs = await import("../../../platform/server-logs/index.js");
  t.mock.module(new URL("../../../platform/server-logs/index.ts", import.meta.url).href, { namedExports: { ...logs, installServerLogCapture: () => {} } });
  const guards = await import("../../../server/runtime/boot/process-error-guards.js");
  t.mock.module(new URL("../../../server/runtime/boot/process-error-guards.ts", import.meta.url).href, { namedExports: { ...guards, installUnhandledRejectionGuard: () => {} } });
  t.mock.method(console, "warn", (message: string) => { warnings.push(message); });
  const { runServeCommand } = await import("../../commands/serve.js");
  for (outcome of ["pending", "failed"]) {
    calls.length = 0;
    await assert.rejects(runServeCommand({ dir: "/unused" }, { registerPluginSdkResolver: () => { calls.push("resolver"); } }), error => error === stopped);
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(calls, ["resolver", "cleanup", "continue"]);
  }
  assert.equal(warnings.length, 1);
  assert.match(warnings[0]!, /import database cleanup.*next server start/i);
});
