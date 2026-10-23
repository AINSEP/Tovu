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

test("unexpected store or loader failures answer a generic 500 and log without the detail", async (t) => {
  const logged: unknown[] = [];
  t.mock.method(console, "error", (message: unknown) => { logged.push(message); });
  const invoke = harness();
  assert.deepEqual(await invoke("get", PROVIDERS), internal);
  assert.deepEqual(await invoke("get", BASE), internal);
  assert.deepEqual(await invoke("post", BASE, { body: { label: "valid", connection: { providerId: "example-git", token: "fixture-secret" } } }), internal);
  assert.deepEqual(await invoke("put", `${BASE}/:id`, { body: { isDefault: true } }), internal);
  assert.deepEqual(await invoke("delete", `${BASE}/:id`), internal);
  assert.deepEqual(logged, Array(5).fill("[source-control-credentials] unexpected store error"));
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
  assert.deepEqual((await repo.vault!.find({ workspaceId: 'ws-1', id: 'cred-1' }))?.sealed, before?.sealed);
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
