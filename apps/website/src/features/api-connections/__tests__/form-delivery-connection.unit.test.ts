/**
 * @file Phase-C unit tests for `form-delivery-connection.ts`: the port answers null (so a composite
 * port can try static credentials) for a workspace with no host, an adapter no plugin contributes
 * and a ref the adapter's plugin does not declare, and maps the declared `apiOrigins` onto the push
 * kit's base URL and extra hosts. Real host over the fake provider; no real network.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { after, before, test } from "node:test";

import type { ApiConnectionHost } from "../host.js";
import { createOAuthFormDeliveryConnectionPort } from "../form-delivery-connection.js";
import { ACME_FIXTURE_ROOT, ACME_PLUGIN, ACME_WORKSPACE, acmeFixtureCopy, connectHosted, startAcmeHarness, type AcmeHarness } from "./support/acme-harness.js";

let harness: AcmeHarness;
before(async () => { harness = await startAcmeHarness(); });
after(async () => { await harness.close(); });

const portOver = (host: ApiConnectionHost | null, pluginId: string | null = ACME_PLUGIN) => {
  const lookups: string[] = [];
  const port = createOAuthFormDeliveryConnectionPort({
    hostFor: ({ workspaceId }) => (workspaceId === ACME_WORKSPACE ? host : null),
    adapterPluginId: async ({ adapterId }) => { lookups.push(adapterId); return pluginId; },
  });
  return { port, lookups };
};

test("a workspace with no API-connection host owns no ref, and no adapter lookup happens", async () => {
  const { port, lookups } = portOver(null);
  assert.equal(await port({ workspaceId: ACME_WORKSPACE, connectionRef: "any-ref", adapterId: "acme-rows" }), null);
  assert.deepEqual(lookups, []);
});

test("an adapter no plugin contributes owns no ref", async () => {
  const host = harness.makeHost();
  const { connectionRef } = await connectHosted(harness, host);
  const { port } = portOver(host, null);
  assert.equal(await port({ workspaceId: ACME_WORKSPACE, connectionRef, adapterId: "unknown-adapter" }), null);
});

test("a ref the adapter's plugin does not declare here is not this port's (null), even when it is connected for another plugin", async () => {
  const host = harness.makeHost();
  const { connectionRef } = await connectHosted(harness, host);
  const { port } = portOver(host, "other-plugin");
  assert.equal(await port({ workspaceId: ACME_WORKSPACE, connectionRef, adapterId: "acme-rows" }), null);
});

test("declared API origins become the base URL (the first) and the extra hosts (the rest)", async (t) => {
  const packageRoot = acmeFixtureCopy(t, (declaration) => { declaration.apiOrigins = ["https://api.acme.test", "https://files.acme.test", "https://upload.acme.test:8443"]; });
  const host = harness.makeHost({ packageRoot });
  const { connectionRef } = await connectHosted(harness, host);
  const credential = await portOver(host).port({ workspaceId: ACME_WORKSPACE, connectionRef, adapterId: "acme-rows" });
  assert.ok(credential);
  assert.equal(credential.token, harness.accessToken);
  assert.equal(credential.baseUrl, "https://api.acme.test");
  assert.deepEqual(credential.additionalHosts, ["files.acme.test", "upload.acme.test:8443"]);
});

test("a connection that declares no API origins allows nothing: no base URL and no extra host", async (t) => {
  // Its hooks read the account on the token endpoint's origin, which hook HTTP always allows.
  const hooks = readFileSync(path.join(ACME_FIXTURE_ROOT, "lib", "connection.mjs"), "utf8").replace("https://api.acme.test/me", "https://auth.acme.test/me");
  const packageRoot = acmeFixtureCopy(t, (declaration) => { delete declaration.apiOrigins; }, { "lib/connection.mjs": hooks });
  const host = harness.makeHost({ packageRoot });
  const { connectionRef } = await connectHosted(harness, host);
  const credential = await portOver(host).port({ workspaceId: ACME_WORKSPACE, connectionRef, adapterId: "acme-rows" });
  assert.deepEqual({ baseUrl: credential?.baseUrl, additionalHosts: credential?.additionalHosts }, { baseUrl: "", additionalHosts: [] });
});
