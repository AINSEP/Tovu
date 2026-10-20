/**
 * @file Phase-C unit tests for `form-delivery-connection.ts`: the port answers null (so a composite
 * port can try static credentials) for a workspace with no host, an adapter no plugin contributes
 * and a ref the adapter's plugin does not declare, and maps the declared `apiOrigins` onto the push
 * kit's base URL and extra origins. G14b: the job's frozen binding names the account
 * (`config.accountId`); a refusal on the attempt's first token read becomes the delivery code the
 * ledger keeps. Real host over the fake provider; no real network.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { after, before, test } from "node:test";

import { FormDeliveryError } from "@jini-ai/cms/forms";

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

/** The frozen binding a job hands the port: the ref plus the account it was set up with. */
const frozenBinding = (connectionRef: string, config: Record<string, unknown> = { accountId: "acct-1" }) =>
  ({ binding: { bindingId: "b1", adapterId: "acme-rows", connectionRef, enabled: true, config } });

/** Asserts a rejection is exactly this delivery refusal (code, retryable, outcome, optional wait). */
function isRefusal(expected: { code: string; retryable: boolean; retryAfterMs?: number }) {
  return (error: unknown) => {
    assert.ok(error instanceof FormDeliveryError, `expected a FormDeliveryError, got ${String(error)}`);
    assert.deepEqual({ code: error.code, retryable: error.retryable, retryAfterMs: error.retryAfterMs, outcome: error.outcome },
      { retryAfterMs: undefined, ...expected, outcome: "not-applied" });
    return true;
  };
}

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

test("declared API origins become the base URL (the first) and the extra origins (the rest), as the push kit compares them", async (t) => {
  const packageRoot = acmeFixtureCopy(t, (declaration) => { declaration.apiOrigins = ["https://api.acme.test", "https://files.acme.test", "https://upload.acme.test:8443"]; });
  const host = harness.makeHost({ packageRoot });
  const { connectionRef } = await connectHosted(harness, host);
  const credential = await portOver(host).port({ workspaceId: ACME_WORKSPACE, connectionRef, adapterId: "acme-rows" }, frozenBinding(connectionRef));
  assert.ok(credential);
  assert.equal(credential.token, harness.accessToken);
  assert.equal(credential.baseUrl, "https://api.acme.test");
  // The kit allows `new URL(baseUrl).origin` plus each entry verbatim, so a bare host would match nothing.
  assert.deepEqual(credential.additionalHosts, ["https://files.acme.test", "https://upload.acme.test:8443"]);
});

test("a connection that declares no API origins allows nothing: no base URL and no extra host", async (t) => {
  // Its hooks read the account on the token endpoint's origin, which hook HTTP always allows.
  const hooks = readFileSync(path.join(ACME_FIXTURE_ROOT, "lib", "connection.mjs"), "utf8").replace("https://api.acme.test/me", "https://auth.acme.test/me");
  const packageRoot = acmeFixtureCopy(t, (declaration) => { delete declaration.apiOrigins; }, { "lib/connection.mjs": hooks });
  const host = harness.makeHost({ packageRoot });
  const { connectionRef } = await connectHosted(harness, host);
  const credential = await portOver(host).port({ workspaceId: ACME_WORKSPACE, connectionRef, adapterId: "acme-rows" }, frozenBinding(connectionRef));
  assert.deepEqual({ baseUrl: credential?.baseUrl, additionalHosts: credential?.additionalHosts }, { baseUrl: "", additionalHosts: [] });
});

test("the binding's frozen account is the one every read must be on: another account is refused as authorization-required", async () => {
  const host = harness.makeHost();
  const { connectionRef } = await connectHosted(harness, host);
  await assert.rejects(portOver(host).port({ workspaceId: ACME_WORKSPACE, connectionRef, adapterId: "acme-rows" }, frozenBinding(connectionRef, { accountId: "acct-other" })),
    isRefusal({ code: "authorization-required", retryable: false }));
});

test("the frozen account is also checked on every later per-request read", async () => {
  const host = harness.makeHost();
  const { connectionRef } = await connectHosted(harness, host);
  const credential = await portOver(host).port({ workspaceId: ACME_WORKSPACE, connectionRef, adapterId: "acme-rows" }, frozenBinding(connectionRef));
  assert.ok(credential);
  assert.equal(await credential.getAccessToken(), harness.accessToken, "the first per-request read is the attempt's token");
  assert.equal(await credential.getAccessToken(), harness.accessToken, "a later read is fresh, on the same account");
});

for (const [name, config] of [["no accountId", {}], ["an empty accountId", { accountId: "" }], ["a non-text accountId", { accountId: 7 }]] as const) {
  test(`an OAuth binding with ${name} is refused as configuration-invalid before any token is read`, async () => {
    const host = harness.makeHost();
    const { connectionRef } = await connectHosted(harness, host);
    const before = harness.provider.tokenCalls;
    await assert.rejects(portOver(host).port({ workspaceId: ACME_WORKSPACE, connectionRef, adapterId: "acme-rows" }, frozenBinding(connectionRef, config)),
      isRefusal({ code: "configuration-invalid", retryable: false }));
    assert.equal(harness.provider.tokenCalls, before, "nothing reached the provider");
  });
}

test("an attempt with no frozen binding at all is refused as configuration-invalid (fail closed)", async () => {
  const host = harness.makeHost();
  const { connectionRef } = await connectHosted(harness, host);
  await assert.rejects(portOver(host).port({ workspaceId: ACME_WORKSPACE, connectionRef, adapterId: "acme-rows" }),
    isRefusal({ code: "configuration-invalid", retryable: false }));
});

test("a sign-in the provider no longer honours (invalid_grant on refresh) is authorization-required: reconnect, the job stays in the ledger", async (t) => {
  const clock = { now: Date.parse("2026-10-20T10:00:00.000Z"), nowMs() { return this.now; } };
  const host = harness.makeHost({ clock });
  const { connectionRef } = await connectHosted(harness, host);
  t.after(() => harness.reset());
  clock.now += 2 * 60 * 60_000;
  harness.provider.tokenStatus = 400;
  harness.provider.tokenBody = { error: "invalid_grant" };
  await assert.rejects(portOver(host).port({ workspaceId: ACME_WORKSPACE, connectionRef, adapterId: "acme-rows" }, frozenBinding(connectionRef)),
    isRefusal({ code: "authorization-required", retryable: false }));
});

test("a connection disconnected after the binding was saved is authorization-required", async () => {
  const host = harness.makeHost();
  const { connection, connectionRef } = await connectHosted(harness, host);
  await host.serviceFor({ connection }).disconnect({ connectionRef, workspaceId: ACME_WORKSPACE });
  await assert.rejects(portOver(host).port({ workspaceId: ACME_WORKSPACE, connectionRef, adapterId: "acme-rows" }, frozenBinding(connectionRef)),
    isRefusal({ code: "authorization-required", retryable: false }));
});

test("a token read the connection's request budget refuses is rate-limited and keeps the host's wait", async (t) => {
  const packageRoot = acmeFixtureCopy(t, (declaration) => { declaration.budgets = [{ scope: "connection", perMinute: 1 }]; });
  const host = harness.makeHost({ packageRoot });
  const { connectionRef } = await connectHosted(harness, host);
  const { port } = portOver(host);
  assert.ok(await port({ workspaceId: ACME_WORKSPACE, connectionRef, adapterId: "acme-rows" }, frozenBinding(connectionRef)));
  await assert.rejects(port({ workspaceId: ACME_WORKSPACE, connectionRef, adapterId: "acme-rows" }, frozenBinding(connectionRef)),
    (error: unknown) => error instanceof FormDeliveryError && error.code === "rate-limited" && error.retryable && (error.retryAfterMs ?? 0) > 0 && error.outcome === "not-applied");
});

test("any other failure of the first token read passes through unchanged (the ledger records a retryable delivery-failed)", async (t) => {
  const clock = { now: Date.parse("2026-10-20T10:00:00.000Z"), nowMs() { return this.now; } };
  const host = harness.makeHost({ clock });
  const { connectionRef } = await connectHosted(harness, host);
  t.after(() => harness.reset());
  clock.now += 2 * 60 * 60_000;
  harness.provider.tokenStatus = 503;
  harness.provider.tokenBody = { error: "temporarily_unavailable" };
  await assert.rejects(portOver(host).port({ workspaceId: ACME_WORKSPACE, connectionRef, adapterId: "acme-rows" }, frozenBinding(connectionRef)),
    (error: unknown) => !(error instanceof FormDeliveryError) && error instanceof Error);
});
