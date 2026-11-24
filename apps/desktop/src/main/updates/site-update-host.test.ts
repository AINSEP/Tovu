import assert from "node:assert/strict";
import test from "node:test";
import { createDesktopUpdateHost } from "./site-update-host.ts";

/** @file Desktop site-update host ports over an injected updater: no real network, no real relaunch. */

function setup(found: string | null = "1.3.0", version = "1.2.0") {
  const calls: string[] = [];
  const host = createDesktopUpdateHost({
    appVersion: () => version,
    updater: {
      checkForUpdates: async () => { calls.push("check"); return found ? { updateInfo: { version: found } } : null; },
      downloadUpdate: async () => { calls.push("download"); },
      quitAndInstall: () => { calls.push("quitAndInstall"); },
    },
    migrate: { migrate: async () => { calls.push("migrate"); }, restore: async () => { calls.push("restore"); } },
  });
  return { host, calls };
}

test("building the host touches nothing", () => {
  assert.deepEqual(setup().calls, []);
});

test("the running version is the app version", async () => {
  assert.equal(await setup().host.app.currentVersion(), "1.2.0");
});

test("stage downloads only the approved version", async () => {
  const { host, calls } = setup("1.3.0");
  await host.app.stage({ version: "1.3.0" });
  assert.deepEqual(calls, ["check", "download"]);
});

test("stage refuses when the updater offers a different version, and downloads nothing", async () => {
  for (const found of ["1.4.0", null]) {
    const { host, calls } = setup(found);
    await assert.rejects(() => host.app.stage({ version: "1.3.0" }), /not the approved 1\.3\.0/);
    assert.deepEqual(calls, ["check"]);
  }
});

test("apply hands off to the updater's restart-and-install", async () => {
  const { host, calls } = setup();
  await host.app.applyStaged({ version: "1.3.0" });
  assert.deepEqual(calls, ["quitAndInstall"]);
});

test("rollback is a no-op when the swap never happened, and says so honestly when it did", async () => {
  const never = setup(undefined, "1.2.0");
  await never.host.app.rollbackTo({ version: "1.2.0" });
  const swapped = setup(undefined, "1.3.0");
  await assert.rejects(() => swapped.host.app.rollbackTo({ version: "1.2.0" }), /cannot step back/);
});

test("health is healthy only on the expected version", async () => {
  assert.deepEqual(await setup(null, "1.3.0").host.health.check({ expectedVersion: "1.3.0" }), { status: "healthy" });
  assert.equal((await setup(null, "1.2.0").host.health.check({ expectedVersion: "1.3.0" })).status, "unhealthy");
});
