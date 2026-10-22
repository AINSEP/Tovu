import "#src/platform/site-dir/__tests__/helpers/isolated-catalog-home";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { createServer } from "node:net";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { createLocalSiteProcessPort } from "../local-site-process.js";

/**
 * @file The non-spawning half of `createLocalSiteProcessPort` against its real native effects:
 * port probing, the cancellable scheduler, discovery of existing sites under a switcher base, and
 * the refusals `launch()` makes BEFORE anything is spawned. Actually launching a site child (a full
 * tsx site server) is the supervisor's integration path, not this unit file's.
 */

function port() {
  const switcherBase = mkdtempSync(path.join(os.tmpdir(), "local-site-port-"));
  return createLocalSiteProcessPort({ switcherBase }, { env: { TOVU_DISABLE_DEV_TLS: "1" } });
}

test("isPortFree is true for an unused loopback port and false for one an IPv4 listener already holds", async (t) => {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));
  const held = (server.address() as { port: number }).port;
  const local = port();
  assert.equal(await local.isPortFree({ port: held }), false);

  const probe = createServer();
  await new Promise<void>((resolve) => probe.listen(0, "127.0.0.1", resolve));
  const freed = (probe.address() as { port: number }).port;
  await new Promise<void>((resolve) => probe.close(() => resolve()));
  assert.equal(await local.isPortFree({ port: freed }), true);
});

test("schedule runs its task after the delay, and its canceller stops a pending one", async () => {
  const local = port();
  const ran: string[] = [];
  local.schedule({ run: () => ran.push("kept"), delayMs: 5 });
  const cancel = local.schedule({ run: () => ran.push("cancelled"), delayMs: 5 });
  cancel();
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.deepEqual(ran, ["kept"]);
});

test("an empty switcher base has no existing sites, and dispose before any launch is a no-op", async () => {
  const local = port();
  assert.equal(local.existing!({ name: "absent" }), null);
  assert.deepEqual(local.listExisting!(), []);
  await local.dispose!();
});

test("launch refuses an unknown site as SITE_NOT_FOUND, before spawning anything", async () => {
  const local = port();
  await assert.rejects(local.launch({ name: "absent", port: 4801, daemonPort: 4802 }), { name: "LocalSiteError", code: "SITE_NOT_FOUND" });
});
