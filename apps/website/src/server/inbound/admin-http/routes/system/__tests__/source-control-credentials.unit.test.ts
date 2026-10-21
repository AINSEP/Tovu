import assert from "node:assert/strict";
import test from "node:test";
import { portFake, type PortFake } from "#src/server/__tests__/helpers/port-fake";
import express from "express";
import { createCapturingResponse, extractRouteHandler } from "#src/server/__tests__/helpers/http-test-server";
import { registerAdminSourceControlCredentialsRoutes, type AdminSourceControlCredentialsDeps } from "../source-control-credentials.js";

/**
 * Direct-invoke contracts for the source-control credential routes, with hand-written fakes for the
 * credential repo and the provider loader — no listener, no database, no plugins.
 */
type ProviderRegistry = Awaited<ReturnType<AdminSourceControlCredentialsDeps["loadSourceControlProviders"]>>;
type LoadedProvider = ReturnType<ProviderRegistry["list"]>[number];
type ProviderDescriptor = LoadedProvider["descriptor"];
const TOKEN_FIELD = { name: "token", label: "Token", required: true, secret: true } as const;
const BASE = "/api/admin/v1/workspaces/:workspaceId/system/source-control/credentials";
const PROVIDERS = "/api/admin/v1/workspaces/:workspaceId/system/source-control/providers";
const offline = async () => { throw new Error("SECRET repo detail"); };
const internal = { statusCode: 500, jsonBody: { error: "internal error", code: "INTERNAL_ERROR" } };

function harness(overrides: PortFake<AdminSourceControlCredentialsDeps> = {}) {
  const app = express();
  registerAdminSourceControlCredentialsRoutes(app, portFake<AdminSourceControlCredentialsDeps>({
    workspaceId: "ws-1", authorize: async () => ({ allowed: true, reason: "matched" }),
    clock: { nowIso: () => "2026-10-21T00:00:00.000Z", nowMs: () => 0 }, idGen: { newId: () => "cred-1" },
    sourceControlCredentialSetRepo: { listByWorkspace: offline, findById: offline, delete: offline },
    loadSourceControlProviders: offline, ...overrides,
  }));
  return async (method: "get" | "post" | "put" | "delete", path: string, req: { params?: Record<string, string>; body?: unknown } = {}) => {
    const { res, capture } = createCapturingResponse();
    res.locals.principal = { id: "principal-1" };
    await extractRouteHandler(app, method, path)({ params: { workspaceId: "ws-1", id: "cred-9" }, ...req }, res);
    return capture;
  };
}

// Route-param guard (`String(req.params.workspaceId ?? "")`): an absent workspace param reads as "".
test("an absent workspace param 404s before authorizing", async () => {
  let authorized = 0;
  const invoke = harness({ authorize: async () => { authorized++; return { allowed: true, reason: "matched" }; } });
  assert.deepEqual(await invoke("get", PROVIDERS, { params: {} }), { statusCode: 404, jsonBody: { error: "workspace was not found" } });
  assert.equal(authorized, 0);
});

test("providers list optional credential/i18n fields only when declared, names switched-off hosts, and logs refusals", async (t) => {
  const warned: unknown[] = [];
  t.mock.method(console, "warn", (message: unknown) => { warned.push(message); });
  const invoke = harness({ loadSourceControlProviders: async (workspaceId: string) => {
    assert.equal(workspaceId, "ws-1");
    return portFake<ProviderRegistry>({
      refusals: ["plugin 'broken' refused: bad manifest"],
      list: () => [
        portFake<LoadedProvider>({ pluginId: "plugin-github", descriptor: portFake<ProviderDescriptor>({ id: "github", label: "GitHub", credential: { fields: [TOKEN_FIELD] }, i18n: { fr: { label: "GitHub" } } }) }),
        portFake<LoadedProvider>({ pluginId: "plugin-plain", descriptor: portFake<ProviderDescriptor>({ id: "plain", label: "Plain Git" }) }),
      ],
      switchedOff: new Map([["gitlab", "plugin-gitlab"]]),
    });
  } });
  assert.deepEqual(await invoke("get", PROVIDERS), { statusCode: 200, jsonBody: {
    providers: [
      { id: "github", label: "GitHub", credential: { fields: [TOKEN_FIELD] }, i18n: { fr: { label: "GitHub" } } },
      { id: "plain", label: "Plain Git" },
    ],
    switchedOff: [{ id: "gitlab", pluginId: "plugin-gitlab" }],
  } });
  assert.deepEqual(warned, ["[source-control-providers] plugin 'broken' refused: bad manifest"]);
});

test("unexpected store or loader failures answer a generic 500 and log without the detail", async (t) => {
  const logged: unknown[] = [];
  t.mock.method(console, "error", (message: unknown) => { logged.push(message); });
  const invoke = harness();
  assert.deepEqual(await invoke("get", PROVIDERS), internal);
  assert.deepEqual(await invoke("get", BASE), internal);
  assert.deepEqual(await invoke("put", `${BASE}/:id`, { body: { isDefault: true } }), internal);
  assert.deepEqual(await invoke("delete", `${BASE}/:id`), internal);
  assert.deepEqual(logged, Array(4).fill("[source-control-credentials] unexpected store error"));
});

test("an absent request body is read as {} on create (validation 400) and update (not-found 404)", async () => {
  const lookups: unknown[] = [];
  const invoke = harness({ sourceControlCredentialSetRepo: { findById: async (input: unknown) => { lookups.push(input); return null; } } });
  const created = await invoke("post", BASE, { body: undefined });
  assert.equal(created.statusCode, 400);
  assert.equal((created.jsonBody as { error: string }).error, "VALIDATION");
  assert.deepEqual(await invoke("put", `${BASE}/:id`, { body: undefined }), {
    statusCode: 404, jsonBody: { error: "NOT_FOUND", detail: "no source control credential 'cred-9' in this workspace" },
  });
  assert.deepEqual(lookups, [{ workspaceId: "ws-1", id: "cred-9" }]);
});
