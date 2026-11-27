import assert from "node:assert/strict";
import test from "node:test";
import { defineJsonRoute, ok } from "@jini-ai/core/contracts/server";

import { mountAdminJsonRoute } from "../admin-json-route-ports.js";
import { adminPublishTrustFor, adminRequestFactsFor, routeRequestFactsFor, type AdminRequestFacts } from "../admin-request-facts.js";
import type { OperatorPrincipalRecord } from "../dev-auth.js";
import { PROBE_GRANT, fakeAdminApp, listen } from "./fixtures/port-harness.js";
import { createRouteIncidentReporter } from "#src/server/__tests__/helpers/route-incident-reporter";

/**
 * w3-rtfnd T4: a spec reads HOW its request authenticated (credential kind, publish-trust grant)
 * through an injected accessor keyed on that request's own principal copy — no Express type reaches
 * the spec's deps, and two requests in flight never see each other's facts.
 */
type FactsDeps = { workspaceId: string; authorize: () => Promise<{ allowed: boolean; reason: string }>; requestFacts: typeof adminRequestFactsFor; gate?: Promise<void>; arrived?: () => void };
const path = "/api/admin/v1/workspaces/:workspaceId/facts";

async function serve({ gate, arrived, authorization }: { gate?: Promise<void>; arrived?: () => void; authorization?: "direct" } = {}) {
  const app = fakeAdminApp();
  const spec = defineJsonRoute<void, AdminRequestFacts, FactsDeps, OperatorPrincipalRecord>({
    method: "get", path, parse: () => ok({ value: undefined }),
    handle: async ({ deps, context }) => {
      deps.arrived?.();
      await deps.gate;
      return ok({ value: deps.requestFacts({ context }) });
    },
  });
  const deps: FactsDeps = { workspaceId: "local", authorize: async () => ({ allowed: true, reason: "ok" }), requestFacts: adminRequestFactsFor, gate, arrived };
  mountAdminJsonRoute({ errors: createRouteIncidentReporter().errors, app, spec, deps }, authorization ? { authorization } : {});
  const server = await listen({ app });
  return { ...server, get: (headers: Record<string, string>) => server.call("/api/admin/v1/workspaces/local/facts", { headers }) };
}

test("a spec reads the credential kind and the publish-trust grant of its own request", async (t) => {
  const s = await serve();
  t.after(s.close);
  assert.deepEqual(await s.get({ "x-kind": "session" }), { status: 200, body: { credentialKind: "session", publishTrust: null } });
  assert.deepEqual(await s.get({ "x-kind": "publish_key", "x-grant": "1" }), { status: 200, body: { credentialKind: "publish_key", publishTrust: PROBE_GRANT } });
  // A direct mount never authorizes from the grant, but the fact that one was presented is still the request's.
  const direct = await serve({ authorization: "direct" });
  t.after(direct.close);
  assert.deepEqual(await direct.get({ "x-kind": "publish_key", "x-grant": "1" }), { status: 200, body: { credentialKind: "publish_key", publishTrust: PROBE_GRANT } });
});

test("two requests in flight each read their own facts", { timeout: 10_000 }, async (t) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  let arrivals = 0;
  let bothArrived!: () => void;
  const both = new Promise<void>((resolve) => { bothArrived = resolve; });
  const s = await serve({ gate, arrived: () => { arrivals += 1; if (arrivals === 2) bothArrived(); } });
  t.after(s.close);
  const first = s.get({ "x-kind": "api_key" });
  await new Promise((resolve) => setTimeout(resolve, 50));
  const second = s.get({ "x-kind": "session" });
  await both;
  release();
  assert.deepEqual((await first).body, { credentialKind: "api_key", publishTrust: null });
  assert.deepEqual((await second).body, { credentialKind: "session", publishTrust: null });
});

test("reading facts for a principal the ports never authenticated is a wiring error", () => {
  assert.throws(() => adminRequestFactsFor({ context: { id: "forged" } as OperatorPrincipalRecord }), /requireAdminSession must run before this route/);
  assert.throws(() => adminRequestFactsFor({ context: undefined }), /requireAdminSession must run before this route/);
});

test("a request whose session layer recorded no credential kind fails closed with the redacted 500", async (t) => {
  const s = await serve();
  t.after(s.close);
  const answered = await s.get({});
  assert.equal(answered.status, 500);
  assert.equal(answered.body?.code, "INTERNAL_ERROR");
});

// C3b: publish-content capabilities reads ONLY the grant, and its wire tests (unchanged) authenticate
// without a credential kind — the grant read must not demand one, but must still refuse a forged context.
test("the grant-only read needs an authenticated context but no credential kind", async (t) => {
  const app = fakeAdminApp();
  const spec = defineJsonRoute<void, unknown, FactsDeps, OperatorPrincipalRecord>({
    method: "get", path, parse: () => ok({ value: undefined }),
    handle: async ({ context }) => ok({ value: { grant: adminPublishTrustFor({ context }) } }),
  });
  mountAdminJsonRoute({ errors: createRouteIncidentReporter().errors, app, spec, deps: { workspaceId: "local", authorize: async () => ({ allowed: true, reason: "ok" }), requestFacts: adminRequestFactsFor } });
  const server = await listen({ app });
  t.after(server.close);
  const withGrant = await server.call("/api/admin/v1/workspaces/local/facts", { headers: { "x-grant": "1" } });
  const without = await server.call("/api/admin/v1/workspaces/local/facts", { headers: {} });
  assert.deepEqual([withGrant.status, withGrant.body, without.status, without.body], [200, { grant: PROBE_GRANT }, 200, { grant: null }]);
  assert.throws(() => adminPublishTrustFor({ context: { id: "forged" } as OperatorPrincipalRecord }), /requireAdminSession must run before this route/);
});

test("request facts expose the trusted serving authority to callers without adding it to serialized facts", async (t) => {
  const app = fakeAdminApp();
  app.set("trust proxy", "loopback");
  app.get("/facts", (req, res) => {
    const facts = routeRequestFactsFor({ req });
    res.json({ facts, servingOrigin: facts.servingOrigin });
  });
  const server = await listen({ app });
  t.after(server.close);
  assert.deepEqual(await server.call("/facts", { headers: {
    host: "internal.test:4317", "x-forwarded-host": "site.example:8443, proxy.example",
    "x-forwarded-proto": "https", "x-forwarded-for": "192.0.2.23", "user-agent": "facts-contract",
  } }), {
    status: 200, body: {
      facts: { clientAddress: "192.0.2.23", host: "internal.test:4317", protocol: "https", userAgent: "facts-contract" },
      servingOrigin: "https://site.example:8443",
    },
  });
});
