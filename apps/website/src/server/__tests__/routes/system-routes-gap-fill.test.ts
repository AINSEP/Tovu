import assert from "node:assert/strict";
import test from "node:test";

import { createApp, createRouteDeps } from "../../runtime/composition/app.js";
import { bootAuthenticated, loginAsBarePrincipal } from "../helpers/http-test-server.js";
import type { RouteDeps } from "../../routes/types.js";

/**
 * @file Branches of four `system/*` admin routes that their own suites never reached:
 *
 * - `custom-credentials.ts` / `source-control-credentials.ts`: a sealer that cannot seal (the
 *   realistic cause is a missing `TOVU_INTEGRATIONS_ROOT_KEY`) must answer `503
 *   SECRET_STORE_UNCONFIGURED` and write nothing. Both route suites only ever boot a working sealer,
 *   so the mapping collapsing into a generic 500 — which the admin UI cannot explain — shipped green.
 * - `mail-status.ts`: gated on `admin.forms.manage`; its suite only signs in as the wildcard owner.
 * - `observability-status.ts`: its suite only sees the hermetic default (no OTLP endpoint), so the
 *   enabled branch — `serviceName` relayed, never `null` — was unasserted at the route.
 */

const brokenSealer = {
  async seal(): Promise<never> {
    throw new Error("TOVU_INTEGRATIONS_ROOT_KEY is not set");
  },
  async open(): Promise<never> {
    throw new Error("TOVU_INTEGRATIONS_ROOT_KEY is not set");
  },
} as unknown as RouteDeps["siteAssistantSecretSealer"];

for (const surface of [
  {
    name: "custom-credentials",
    path: "system/custom/credentials",
    body: { label: "name.com", category: "general", baseUrl: "https://api.name.com", connection: { token: "sk_never_stored" } },
    detail: /^custom credential secret store is unconfigured: TOVU_INTEGRATIONS_ROOT_KEY is not set$/,
  },
  {
    name: "source-control-credentials",
    path: "system/source-control/credentials",
    body: { label: "default", connection: { providerId: "github", token: "ghp_never_stored" } },
    detail: /^source control credential secret store is unconfigured: TOVU_INTEGRATIONS_ROOT_KEY is not set$/,
  },
]) {
  test(`${surface.name}: POST with a secret store that cannot seal is 503 SECRET_STORE_UNCONFIGURED and stores no row`, async (t) => {
    const deps: RouteDeps = { ...createRouteDeps(), siteAssistantSecretSealer: brokenSealer };
    const { baseUrl, cookie } = await bootAuthenticated(createApp(deps), t);
    const base = `${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/${surface.path}`;

    const res = await fetch(base, {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify(surface.body),
    });
    const raw = await res.text();
    assert.equal(res.status, 503, raw);
    const body = JSON.parse(raw) as { error: string; detail: string };
    assert.equal(body.error, "SECRET_STORE_UNCONFIGURED");
    assert.match(body.detail, surface.detail);
    assert.equal(raw.includes("never_stored"), false, "the refused secret must not be echoed back");

    const list = await fetch(base, { headers: { cookie } });
    assert.equal(list.status, 200);
    assert.deepEqual(((await list.json()) as { credentials: unknown[] }).credentials, []);
  });
}

test("mail-status: a signed-in principal without admin.forms.manage is 403 and learns nothing about the mailer", async (t) => {
  const deps: RouteDeps = { ...createRouteDeps() };
  const { baseUrl } = await bootAuthenticated(createApp(deps), t);
  const bare = await loginAsBarePrincipal(deps, baseUrl);

  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/system/mail-status`, { headers: { cookie: bare } });
  const raw = await res.text();
  assert.equal(res.status, 403, raw);
  const body = JSON.parse(raw) as { code: string; details: { permission: string }; mailDeliveryAvailable?: unknown };
  assert.equal(body.code, "FORBIDDEN");
  assert.equal(body.details.permission, "admin.forms.manage");
  assert.equal("mailDeliveryAvailable" in body, false);
});

test("observability-status: with an OTLP endpoint configured, reports enabled with the configured service name", async (t) => {
  const deps: RouteDeps = { ...createRouteDeps() };
  const { baseUrl, cookie } = await bootAuthenticated(createApp(deps), t);
  const url = `${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/system/observability-status`;

  // Set only after boot: the route resolves the config per request, and the composition root must
  // not start a real exporter in this test process.
  const saved = {
    endpoint: process.env.OTEL_EXPORTER_OTLP_ENDPOINT,
    traces: process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT,
    service: process.env.OTEL_SERVICE_NAME,
  };
  t.after(() => {
    for (const [key, value] of [
      ["OTEL_EXPORTER_OTLP_ENDPOINT", saved.endpoint],
      ["OTEL_EXPORTER_OTLP_TRACES_ENDPOINT", saved.traces],
      ["OTEL_SERVICE_NAME", saved.service],
    ] as const) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  process.env.OTEL_EXPORTER_OTLP_ENDPOINT = "http://collector.test:4318";
  delete process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT;
  process.env.OTEL_SERVICE_NAME = "tovu-staging";
  const named = await fetch(url, { headers: { cookie } });
  assert.equal(named.status, 200);
  assert.deepEqual(await named.json(), { enabled: true, serviceName: "tovu-staging" });

  // No service name configured: the documented default, not null.
  delete process.env.OTEL_SERVICE_NAME;
  const defaulted = await fetch(url, { headers: { cookie } });
  assert.deepEqual(await defaulted.json(), { enabled: true, serviceName: "tovu" });
});
