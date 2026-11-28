import assert from "node:assert/strict";
import test from "node:test";
import { registerSiteAssistantConfirm } from "../site-assistant-confirm.js";
import { createRouteIncidentReporter } from "#src/server/__tests__/helpers/route-incident-reporter";
import { SITE_ASSISTANT_CONFIRM_PATH } from "@jini-ai/daemon/surface-exchanges/site-assistant-confirm";
import type { FrontendHookInput } from "@jini-ai/core/contracts/site/daemon-http";

/** Registered Express handler with DI fakes; never opens a listener. */
function fixture(options: { enabled?: boolean; allowed?: boolean; origin?: string | null; servingOrigin?: string; fetchSite?: string | null; type?: string; accepted?: boolean; fail?: boolean; budget?: boolean; enabledError?: Error; ownerless?: boolean; reporterFailure?: Error } = {}) {
  let handler: (req: unknown, res: unknown) => void;
  let enabledCalls = 0;
  const deliveries: unknown[] = [], errors: unknown[] = [], origins: string[] = [], addresses: string[] = [];
  registerSiteAssistantConfirm({ errors: createRouteIncidentReporter().errors, app: { post(path: string, fn: typeof handler) { assert.equal(path, SITE_ASSISTANT_CONFIRM_PATH); handler = fn; } } as never,
    ports: {
      confirmations: { request: async () => false, confirm: async input => { deliveries.push(input); if (options.fail) throw new Error("storage failed"); return options.accepted !== false; } },
      ...(options.ownerless ? {} : { resolveOwner: async ({ request }: FrontendHookInput) => {
        const principalId = request.headers.get("x-test-owner");
        return principalId ? { workspaceId: "visitor-site", principalId, tabId: `tab-${principalId}` } : null;
      } }),
      enabled: async () => { enabledCalls++; if (options.enabledError) throw options.enabledError; return options.enabled !== false; },
      allowsOrigin: async ({ origin }) => { origins.push(origin); return origin === "https://site.test" && options.allowed !== false; },
      limiter: { check: async ({ key }) => { addresses.push(key); return options.budget === false ? { allowed: false, retryAfterSeconds: 60 } : { allowed: true }; } },
      reportError: ({ error }) => { if (options.reporterFailure && errors.length === 0) { errors.push("reporter-threw"); throw options.reporterFailure; } errors.push(error); },
    } });
  return { deliveries, errors, origins, addresses, enabledCalls: () => enabledCalls, send(body: unknown = { challengeId: "a".repeat(22), allow: true }, facts?: { owner: string; address: string }) {
    return new Promise<{ status: number; body: unknown; cache: string }>(resolve => {
      let status = 200, cache = "";
      const res = { statusCode: 200,
        on() { return res; }, off() { return res; },
        setHeader(name: string, value: string) { if (name.toLowerCase() === "cache-control") cache = value; },
        status(value: number) { status = value; return res; },
        send(value: Buffer) { resolve({ status: res.statusCode, body: JSON.parse(value.toString()), cache }); },
        json(value: unknown) { resolve({ status, body: value, cache }); } };
      const serving = new URL(options.servingOrigin ?? "https://request.site.test");
      const headers = { host: serving.host, origin: options.origin === null ? undefined : options.origin ?? "https://site.test",
        "sec-fetch-site": options.fetchSite === null ? undefined : options.fetchSite ?? "same-origin",
        ...(facts ? { "x-test-owner": facts.owner, "x-forwarded-for": "203.0.113.99" } : {}) };
      handler!({ body, headers, ip: facts?.address, method: "POST", secure: serving.protocol === "https:", query: {}, protocol: serving.protocol.slice(0, -1), get: (key: keyof typeof headers) => headers[key], is: (type: string) => type === (options.type ?? "application/json"), socket: { remoteAddress: "127.0.0.1" } }, res);
    });
  } };
}

for (const allow of [true, false]) test(`same-origin click allow=${allow} delivers only the closed shape`, async () => {
  const f = fixture();
  const body = { challengeId: "a".repeat(22), allow };
  assert.deepEqual(await f.send(body), { status: 200, body: { accepted: true }, cache: "no-store" });
  assert.deepEqual(f.deliveries, [body]);
});

for (const body of [null, [], "approved", {}, { allow: true }, { challengeId: "a".repeat(22), allow: "true" },
  { challengeId: "forged", allow: true }, { challengeId: "a".repeat(22), allow: true, approved: true },
  { challengeId: "a".repeat(22), allow: true, executionId: "another" }, { challengeId: "a".repeat(500), allow: true }]) {
  test(`malformed or model-forged reply ${JSON.stringify(body)?.slice(0, 65)} refuses without delivery`, async () => {
    const f = fixture();
    assert.equal((await f.send(body)).status, 400);
    assert.deepEqual(f.deliveries, []);
  });
}

for (const options of [{ origin: "https://evil.test", fetchSite: null }, { origin: "", fetchSite: null },
  { origin: null, fetchSite: null }, { origin: "null" },
  { origin: "null", fetchSite: null }, { allowed: false, fetchSite: null }, { fetchSite: "cross-site" },
  { fetchSite: "same-site" }, { fetchSite: "none" }, { fetchSite: "" },
  { type: "application/x-www-form-urlencoded" }]) test(`foreign origin/type ${JSON.stringify(options)} refuses`, async () => {
  const f = fixture(options);
  assert.equal((await f.send()).status, 400);
  assert.deepEqual(f.deliveries, []);
});

test("same-origin metadata without an Origin header refuses", async () => {
  // F3b Coordinator decision: Origin is required; metadata can only narrow permission.
  const f = fixture({ origin: null });
  assert.equal((await f.send()).status, 400);
  assert.deepEqual(f.origins, []);
  assert.deepEqual(f.deliveries, []);
});

test("disabled/rollback and rate-limited sites refuse without consuming any challenge", async () => {
  for (const [options, status] of [[{ enabled: false }, 404], [{ budget: false }, 429]] as const) {
    const f = fixture(options);
    assert.equal((await f.send()).status, status);
    assert.deepEqual(f.deliveries, []);
    assert.deepEqual(f.origins, []);
    assert.equal(f.enabledCalls(), status === 429 ? 0 : 1);
  }
});

test("missing Fetch Metadata is permitted only with a validated Origin; stale/replayed IDs and errors uniformly refuse", async () => {
  const legacy = fixture({ fetchSite: null });
  assert.equal((await legacy.send()).status, 200);
  assert.deepEqual(legacy.origins, ["https://site.test"]);
  for (const options of [{ accepted: false }, { fail: true }]) {
    const f = fixture(options);
    assert.deepEqual(await f.send(), { status: 400, body: { error: "I can't help with that request here." }, cache: "no-store" });
    assert.equal(f.errors.length, "fail" in options ? 1 : 0);
  }
});

for (const origin of ["https://preview.site.test", "http://localhost:5174", "http://127.0.0.1:4100"]) {
  test(`Origin accepts the actual widget host ${origin} without a canonical lookup`, async () => {
    const f = fixture({ origin, servingOrigin: origin });
    assert.equal((await f.send()).status, 200);
    assert.deepEqual(f.origins, []);
    const legacy = fixture({ origin, servingOrigin: origin, fetchSite: null });
    assert.equal((await legacy.send()).status, 200);
    assert.deepEqual(legacy.origins, []);
  });
}


test("the request owner and trusted proxy address are bound afresh for each visitor", async () => {
  const f = fixture();
  const body = { challengeId: "a".repeat(22), allow: true };
  assert.equal((await f.send(body, { owner: "visitor-a", address: "198.51.100.1" })).status, 200);
  assert.equal((await f.send(body, { owner: "visitor-b", address: "198.51.100.2" })).status, 200);
  assert.deepEqual(f.addresses, ["198.51.100.1", "198.51.100.2"]);
  assert.deepEqual(f.deliveries, [
    { ...body, owner: { workspaceId: "visitor-site", principalId: "visitor-a", tabId: "tab-visitor-a" } },
    { ...body, owner: { workspaceId: "visitor-site", principalId: "visitor-b", tabId: "tab-visitor-b" } },
  ]);
});

test("a site without an owner resolver delivers the closed reply with no owner, even when the request names one", async () => {
  const f = fixture({ ownerless: true });
  const body = { challengeId: "b".repeat(22), allow: false };
  assert.equal((await f.send(body, { owner: "visitor-a", address: "198.51.100.3" })).status, 200);
  assert.deepEqual(f.deliveries, [body]);
});

test("a failing enabled check is reported and answered with the uniform no-store refusal", async () => {
  const outage = new Error("feature flag store unavailable");
  const f = fixture({ enabledError: outage });
  assert.deepEqual(await f.send(), { status: 400, body: { error: "I can't help with that request here." }, cache: "no-store" });
  assert.deepEqual(f.errors, [outage]);
  assert.deepEqual(f.deliveries, []);
});

test("a failure that escapes the reply contract (its own error report threw) still ends in the reported no-store refusal", async () => {
  const outage = new Error("feature flag store unavailable");
  const reporterDown = new Error("incident sink unavailable");
  const f = fixture({ enabledError: outage, reporterFailure: reporterDown });
  assert.deepEqual(await f.send(), { status: 400, body: { error: "I can't help with that request here." }, cache: "no-store" });
  // First report (the route's own catch) threw; the host failure writer then reported what escaped.
  assert.deepEqual(f.errors, ["reporter-threw", reporterDown]);
  assert.deepEqual(f.deliveries, []);
});
