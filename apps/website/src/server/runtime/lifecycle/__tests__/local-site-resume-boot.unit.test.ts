import "#src/platform/site-dir/__tests__/helpers/isolated-catalog-home";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createLocalSiteSupervisor } from "#src/platform/site-dir/index";
import { createLocalSiteIntentStore } from "#src/platform/site-dir/local-site-intent";
import { resumeLocalSitesForHost } from "../local-site-host.js";

test("listening hook eagerly assembles a host and resumes persisted sites only after its boot delay", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const dir = mkdtempSync(join(tmpdir(), "site-resume-boot-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const intentPort = createLocalSiteIntentStore({ servingSiteDir: dir });
  intentPort.write({ intent: { session: "dev-42", sites: { example: { port: 3201 } } } });
  const launches: number[] = [];
  const supervisor = createLocalSiteSupervisor({ servingName: "owner", scheme: "http", processPort: {
    isPortFree: async () => true, schedule: () => () => {},
    launch: async ({ port }) => { launches.push(port); return { pid: 42, onExit() {}, ready: async () => true, terminate: async () => {}, killNow() {} }; },
  } }, { intentPort, devSession: "dev-42" });
  t.after(() => supervisor.shutdown());
  let assembled = 0;
  const binding = { dir, name: "owner", switcherCompatible: true, dirOverridden: false };
  const cancel = resumeLocalSitesForHost({ binding }, { env: { TOVU_DEV_SUPERVISOR_PID: "dev-42" },
    forHost: () => { assembled++; return supervisor; } });
  t.after(cancel);
  assert.equal(assembled, 1, "resume must not wait for an admin request to assemble the host");
  t.mock.timers.tick(1999); await new Promise<void>(resolve => setImmediate(resolve));
  assert.deepEqual(launches, []);
  t.mock.timers.tick(1); await new Promise<void>(resolve => setImmediate(resolve));
  assert.deepEqual(launches, [3201]);
});

test("listening hook is inert outside dev and respects disabled site management", t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const binding = { dir: "/unused", name: "owner", switcherCompatible: true, dirOverridden: false };
  const cancel = resumeLocalSitesForHost({ binding }, { env: {}, forHost: () => { assert.fail("must not assemble outside dev"); } });
  cancel();
  resumeLocalSitesForHost({ binding }, { env: { TOVU_DEV_SUPERVISOR_PID: "dev-42" }, forHost: () => undefined })();
  t.mock.timers.tick(5000);
});

test("closing a listening host cancels its pending recovery", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let resumed = 0;
  const supervisor = createLocalSiteSupervisor({ servingName: "owner", scheme: "http", processPort: {
    isPortFree: async () => true, schedule: () => () => {}, launch: async () => { throw new Error("unexpected"); },
  } });
  supervisor.resume = async () => { resumed++; };
  t.after(() => supervisor.shutdown());
  const binding = { dir: "/unused", name: "owner", switcherCompatible: true, dirOverridden: false };
  const cancel = resumeLocalSitesForHost({ binding }, { env: { TOVU_DEV_SUPERVISOR_PID: "dev-42" }, forHost: () => supervisor });
  cancel(); t.mock.timers.tick(5000); await new Promise<void>(resolve => setImmediate(resolve));
  assert.equal(resumed, 0);
});
