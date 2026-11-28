import assert from "node:assert/strict";
import test from "node:test";
import { adminBrowserWriteOrigin, adminSameOriginWrites, routeAdapterFor } from "../admin-route-mount-support.js";
import { createRouteIncidentReporter } from "#src/server/__tests__/helpers/route-incident-reporter";

type Headers = Record<string, unknown>;
const decide = (policy: typeof adminBrowserWriteOrigin, headers: Headers | undefined) =>
  policy.originPolicy.isSameOrigin({ req: { headers } } as never);

test("admin browser writes pass only when Origin names this host and fetch metadata agrees", () => {
  assert.equal(decide(adminBrowserWriteOrigin, { origin: "http://admin.example.test", host: "admin.example.test" }), true);
  assert.equal(decide(adminBrowserWriteOrigin, { origin: "http://admin.example.test", host: "admin.example.test", "sec-fetch-site": "same-origin" }), true);
  assert.equal(decide(adminBrowserWriteOrigin, { origin: "http://evil.example.test", host: "admin.example.test" }), false, "cross-origin");
  assert.equal(decide(adminBrowserWriteOrigin, { origin: "http://admin.example.test", host: "admin.example.test", "sec-fetch-site": "cross-site" }), false, "fetch metadata disagrees");
  assert.equal(decide(adminBrowserWriteOrigin, { host: "admin.example.test" }), false, "no Origin is refused");
  assert.equal(decide(adminBrowserWriteOrigin, { origin: ["http://admin.example.test"], host: "admin.example.test" }), false, "a non-string header is not read as an origin");
  assert.equal(decide(adminBrowserWriteOrigin, undefined), false, "a request without headers is refused");
});

test("same-origin admin writes read the first value of a repeated header and refuse a missing header bag", () => {
  assert.equal(decide(adminSameOriginWrites, { origin: ["http://admin.example.test", "http://evil.example.test"], host: ["admin.example.test"] }), true);
  assert.equal(decide(adminSameOriginWrites, { origin: ["http://evil.example.test"], host: "admin.example.test" }), false);
  assert.equal(decide(adminSameOriginWrites, { origin: [42], host: "admin.example.test" }), false, "a non-string first value is no origin");
  assert.equal(decide(adminSameOriginWrites, undefined), false);
});

test("a bound mount without an origin policy fails closed; a given policy and the error ports pass through", () => {
  const errors = createRouteIncidentReporter().errors;
  const unbound = routeAdapterFor({ origin: undefined, errors }).adapter;
  assert.equal(unbound.errors, errors);
  assert.equal(unbound.originPolicy.isSameOrigin({ req: { headers: { origin: "http://admin.example.test", host: "admin.example.test" } } } as never), false);
  assert.equal(routeAdapterFor({ origin: adminSameOriginWrites, errors }).adapter.originPolicy, adminSameOriginWrites.originPolicy);
});
