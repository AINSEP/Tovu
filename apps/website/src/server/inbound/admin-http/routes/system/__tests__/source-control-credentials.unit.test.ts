import { assertAdminDiagnostics, assertAdminResponse } from "#src/server/inbound/admin-http/http/__tests__/assert-admin-response";
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
  const invoke = harness({ loadSourceControlProviders: async ({ workspaceId }: { workspaceId: string }) => {
    assert.equal(workspaceId, "ws-1");
    return portFake<ProviderRegistry>({
      refusals: ["plugin 'broken' refused: bad manifest"],
      list: () => [
        portFake<LoadedProvider>({ pluginId: "plugin-example-git", descriptor: portFake<ProviderDescriptor>({ id: "example-git", label: "Example Git", credential: { fields: [TOKEN_FIELD] }, i18n: { fr: { label: "Example Git" } } }) }),
        portFake<LoadedProvider>({ pluginId: "plugin-plain", descriptor: portFake<ProviderDescriptor>({ id: "plain", label: "Plain Git" }) }),
      ],
      switchedOff: new Map([["example-off", "plugin-example-off"]]),
    });
  } });
  assert.deepEqual(await invoke("get", PROVIDERS), { statusCode: 200, jsonBody: {
    providers: [
      { id: "example-git", label: "Example Git", credential: { fields: [TOKEN_FIELD] }, i18n: { fr: { label: "Example Git" } } },
      { id: "plain", label: "Plain Git" },
    ],
    switchedOff: [{ id: "example-off", pluginId: "plugin-example-off" }],
  } });
  assert.deepEqual(warned, ["[source-control-providers] plugin 'broken' refused: bad manifest"]);
});

test("unexpected store or loader failures answer a private 500 and log a correlated diagnostic", async (t) => {
  const logged: unknown[][] = [];
  t.mock.method(console, "error", (...args: unknown[]) => { logged.push(args); });
  const invoke = harness();
  assertAdminResponse({ actual: await invoke("get", PROVIDERS), expected: internal }, { failure: {"message":"The system setting operation could not be completed.","action":"Check the result before repeating this operation. Copy details and report this problem.","step":"system setting operation"} });
  assertAdminResponse({ actual: await invoke("get", BASE), expected: internal }, { failure: {"message":"The system setting operation could not be completed.","action":"Check the result before repeating this operation. Copy details and report this problem.","step":"system setting operation"} });
  assertAdminResponse({ actual: await invoke("post", BASE, { body: { label: "valid", connection: { providerId: "example-git", token: "fixture-secret" } } }), expected: internal }, { failure: {"message":"The system setting operation could not be completed.","action":"Check the result before repeating this operation. Copy details and report this problem.","step":"system setting operation"} });
  assertAdminResponse({ actual: await invoke("put", `${BASE}/:id`, { body: { isDefault: true } }), expected: internal }, { failure: {"message":"The system setting operation could not be completed.","action":"Check the result before repeating this operation. Copy details and report this problem.","step":"system setting operation"} });
  assertAdminResponse({ actual: await invoke("delete", `${BASE}/:id`), expected: internal }, { failure: {"message":"The system setting operation could not be completed.","action":"Check the result before repeating this operation. Copy details and report this problem.","step":"system setting operation"} });
  assertAdminDiagnostics({ calls: logged, operation: "[routes/system/source-control-credentials]", diagnostics: Array(5).fill(/SECRET repo detail/) });
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

test('new credentials use neutral declared fields; unlisted saved rows remain visible without their secret', async () => {
  const { exampleRegistry } = await import('#src/features/source-control/__tests__/fixtures/example-provider');
  const { InMemorySourceControlCredentialSetRepo } = await import('#src/features/source-control/repo.memory');
  const { InMemoryKeyring } = await import('#src/features/webhooks/keyring.memory');
  const { AesGcmSecretSealer } = await import('#src/features/webhooks/secret-sealer.aesgcm');
  const keyring = new InMemoryKeyring();
  const repo = new InMemorySourceControlCredentialSetRepo();
  let available = true;
  const invoke = harness({
    sourceControlCredentialSetRepo: repo, siteAssistantSecretKeyring: keyring, siteAssistantSecretSealer: new AesGcmSecretSealer(keyring),
    loadSourceControlProviders: async () => available ? exampleRegistry({ probe: false }) : { list: () => [], get: () => undefined, refusals: [] },
  });
  const input = { label: 'default', connection: { providerId: 'example-paired', token: 'fixture-secret', username: 'operator' } };
  const invalid = await invoke('post', BASE, { body: { ...input, connection: { providerId: 'example-paired', token: 'fixture-secret' } } });
  assert.deepEqual(invalid, { statusCode: 400, jsonBody: { error: 'VALIDATION', detail: "'username' (non-empty string) is required for provider 'example-paired'" } });
  const created = await invoke('post', BASE, { body: input });
  assert.equal(created.statusCode, 201);
  assert.equal(JSON.stringify(created).includes('fixture-secret'), false);
  available = false;
  assert.deepEqual(await invoke('get', PROVIDERS), { statusCode: 200, jsonBody: { providers: [], switchedOff: [] } });
  const listed = await invoke('get', BASE);
  assert.equal(listed.statusCode, 200);
  assert.equal((listed.jsonBody as { credentials: { providerId: string }[] }).credentials[0]?.providerId, 'example-paired');
  const before = await repo.vault!.find({ workspaceId: 'ws-1', id: 'cred-1' });
  const renamed = await invoke('put', `${BASE}/:id`, { params: { workspaceId: 'ws-1', id: 'cred-1' }, body: { label: 'retained', connection: { providerId: 'example-paired', token: '' }, isDefault: true } });
  assert.equal(renamed.statusCode, 200);
  assertAdminResponse({ actual: (await repo.vault!.find({ workspaceId: 'ws-1', id: 'cred-1' }))?.sealed, expected: before?.sealed });
  const refused = await invoke('post', BASE, { body: input });
  assert.equal(refused.statusCode, 400);
  assert.equal(JSON.stringify(listed).includes('operator'), false);
  assert.deepEqual(await invoke('delete', `${BASE}/:id`, { params: { workspaceId: 'ws-1', id: 'cred-1' } }), { statusCode: 204, jsonBody: undefined });
  assert.deepEqual(await invoke('get', BASE), { statusCode: 200, jsonBody: { credentials: [] } });
});

for (const [method, route] of [['get', PROVIDERS], ['get', BASE], ['post', BASE], ['put', `${BASE}/:id`], ['delete', `${BASE}/:id`]] as const) {
  test(`${method} ${route} refuses workspace and permission mismatches before loading providers or rows`, async () => {
    const invoke = harness({ authorize: async () => ({ allowed: false, reason: 'denied' }) });
    assert.equal((await invoke(method, route, { params: { workspaceId: 'other' } })).statusCode, 404);
    assert.equal((await invoke(method, route)).statusCode, 403);
  });
}

test('store duplicate and encryption errors retain their established HTTP codes', async () => {
  const { SourceControlCredentialDuplicateLabelError, SourceControlCredentialSecretStoreUnconfiguredError } = await import('#src/features/source-control/store');
  for (const [failure, statusCode, error] of [
    [new SourceControlCredentialDuplicateLabelError('duplicate'), 409, 'DUPLICATE_LABEL'],
    [new SourceControlCredentialSecretStoreUnconfiguredError('storage unavailable'), 503, 'SECRET_STORE_UNCONFIGURED'],
  ] as const) {
    const invoke = harness({ sourceControlCredentialSetRepo: { findById: async () => { throw failure; } } });
    assert.deepEqual(await invoke('put', `${BASE}/:id`, { body: {} }), { statusCode, jsonBody: { error, detail: failure.message } });
  }
});

// ---------------------------------------------------------------------------
// lo-SC-0: gate tests on the route's two gates. Every verb is enumerated from the router, never listed by hand.
// ---------------------------------------------------------------------------

type RouterLayer = { route?: { path: string; methods: Record<string, boolean> } };
type RegisteredRoute = { method: "get" | "post" | "put" | "delete"; path: string };

function registeredRoutes(): RegisteredRoute[] {
  const app = express();
  registerAdminSourceControlCredentialsRoutes(app, portFake<AdminSourceControlCredentialsDeps>({ workspaceId: "ws-1" }));
  const stack = (app as unknown as { _router: { stack: RouterLayer[] } })._router.stack;
  return stack.flatMap((layer) => layer.route === undefined ? [] : Object.keys(layer.route.methods).map((method) => ({ method: method as RegisteredRoute["method"], path: layer.route!.path })));
}

/** Every property read or call on it is recorded, and every call fails: a gate that lets a request through is seen twice. */
function untouchableStore(touched: string[]): Record<string, unknown> {
  return new Proxy({}, { get: (_target, name) => { touched.push(String(name)); return () => Promise.reject(new Error("the store must not be reached")); } });
}

function gateHarness(authorize: AdminSourceControlCredentialsDeps["authorize"]) {
  const touched: string[] = [];
  const loaded: string[] = [];
  const invoke = harness({
    authorize,
    sourceControlCredentialSetRepo: untouchableStore(touched) as never,
    siteAssistantSecretSealer: untouchableStore(touched) as never,
    loadSourceControlProviders: async () => { loaded.push("loadSourceControlProviders"); throw new Error("the provider loader must not be reached"); },
  });
  return { invoke, touched, loaded };
}

test("the router registers the credential verbs this suite gates (guards the enumeration below against matching nothing)", () => {
  const routes = registeredRoutes();
  const verbs = new Set(routes.map((route) => route.method));
  for (const verb of ["get", "post", "put", "delete"]) assert.ok(verbs.has(verb as RegisteredRoute["method"]), `no ${verb} route is registered`);
  assert.ok(routes.some((route) => route.path === PROVIDERS));
});

// Mutation: delete the `rejectForeignWorkspace` line of `rejectUnlessAuthorized` -> `authorize` is asked (RED).
test("every registered route refuses a foreign workspace before authorize is asked or any store is reached", async () => {
  for (const { method, path: route } of registeredRoutes()) {
    const authorized: unknown[] = [];
    const { invoke, touched, loaded } = gateHarness(async (params) => { authorized.push(params); return { allowed: true, reason: "matched" }; });

    const refused = await invoke(method, route, { params: { workspaceId: "other-workspace", id: "cred-9" }, body: { label: "x", connection: {} } });

    assert.equal(refused.statusCode, 404, `${method} ${route}`);
    assert.deepEqual(authorized, [], `${method} ${route} asked authorize for a foreign workspace`);
    assert.deepEqual(touched, [], `${method} ${route} reached a store`);
    assert.deepEqual(loaded, [], `${method} ${route} reached the provider loader`);
  }
});

// Mutation: make `rejectUnlessAuthorized` return false after `authorize` (ignore the denial) -> the store is reached (RED);
// or change `PERMISSION` -> the permission assertion is RED.
test("every registered route refuses a principal without source-control.credentials.write and reaches no store", async () => {
  for (const { method, path: route } of registeredRoutes()) {
    const asked: unknown[] = [];
    const { invoke, touched, loaded } = gateHarness(async (params) => { asked.push(params); return { allowed: false, reason: "no_grant" }; });

    const refused = await invoke(method, route, { body: { label: "x", connection: {} } });

    assert.equal(refused.statusCode, 403, `${method} ${route}`);
    assert.deepEqual(asked, [{ principalId: "principal-1", permission: "source-control.credentials.write", workspaceId: "ws-1", entityType: "source-control" }], `${method} ${route}`);
    assert.deepEqual(touched, [], `${method} ${route} reached a store after a denial`);
    assert.deepEqual(loaded, [], `${method} ${route} reached the provider loader after a denial`);
  }
});
