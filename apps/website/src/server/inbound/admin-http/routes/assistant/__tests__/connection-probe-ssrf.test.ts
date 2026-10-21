import "../../../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import test from "node:test";
import type { Express } from "express";
import type { AssistantExecutionRouteDeps } from "../execution-deps.js";

// Inject only DNS answers. The route, credential selection, runtime validators and outbound
// transports remain real; private-address tests must never open an external connection.
let addresses = [{ address: "10.0.0.5", family: 4 }];
const lookups: string[] = [];
let transportCalls = 0;
const { registerAdminAssistantListModelsRoute } = await import("../list-models.js");
const { registerAdminAssistantTestConnectionRoute } = await import("../test-connection.js");

const registrars = [registerAdminAssistantListModelsRoute, registerAdminAssistantTestConnectionRoute];

// Both routes read only `workspaceId`/`authorize`; the credential members throw so a contract
// change fails loudly instead of silently reaching a stub.
const unusedByThisRoute = (member: string) => (): never => {
  throw new Error(`the connection probe routes are not expected to call ${member}`);
};
const deps: AssistantExecutionRouteDeps = {
  // A broken guard must fail locally rather than opening a private network connection.
  probeRequestInit: { dispatcher: {
    dispatch() { transportCalls++; throw new Error("blocked DNS answers must never reach HTTP"); },
  } } as NonNullable<AssistantExecutionRouteDeps["probeRequestInit"]>,
  probeDnsLookup: async ({ hostname }) => {
    assert.equal(hostname, "provider.invalid");
    lookups.push(hostname);
    return addresses;
  },
  workspaceId: "workspace-local",
  authorize: async () => ({ allowed: true, reason: "allowed" }),
  siteAssistantCredentialRepo: {
    findByWorkspaceId: unusedByThisRoute("siteAssistantCredentialRepo.findByWorkspaceId"),
    upsert: unusedByThisRoute("siteAssistantCredentialRepo.upsert"),
    clearKey: unusedByThisRoute("siteAssistantCredentialRepo.clearKey"),
  },
  siteAssistantSecretSealer: {
    seal: unusedByThisRoute("siteAssistantSecretSealer.seal"),
    open: unusedByThisRoute("siteAssistantSecretSealer.open"),
  },
  adminExecutionCredentialRepo: {
    findByWorkspaceAndPrincipal: unusedByThisRoute("adminExecutionCredentialRepo.findByWorkspaceAndPrincipal"),
    upsert: unusedByThisRoute("adminExecutionCredentialRepo.upsert"),
    clearKey: unusedByThisRoute("adminExecutionCredentialRepo.clearKey"),
  },
};

async function probe(
  registrar: (typeof registrars)[number], baseUrl: string, options: Partial<AssistantExecutionRouteDeps> = {},
  request?: { body: unknown; expectedStatus: number },
) {
  // Only the members the handler actually reads are modelled; the registrar's `app` stub captures it
  // under this narrow signature so no partial Request/Response needs a cast.
  type ProbeHandler = (
    req: { params: { workspaceId: string }; body: unknown },
    res: unknown,
    next: (error?: unknown) => void,
  ) => unknown;
  let handler: ProbeHandler | undefined;
  registrar({ post: (_path: string, registered: ProbeHandler) => { handler = registered; } } as unknown as Express, { ...deps, ...options });
  let status = 200;
  let body: { ok?: boolean; message?: string; models?: string[]; error?: string; code?: string } | undefined;
  const response = {
    locals: { principal: { id: "admin" } },
    status: (value: number) => { status = value; return response; },
    json: (value: typeof body) => { body = value; },
  };
  assert.ok(handler);
  await handler({
    params: { workspaceId: "workspace-local" },
    body: request ? request.body : { protocol: "openai", baseUrl, apiKey: "sk-fake", model: "guard-model" },
  }, response, (error) => { throw error; });
  assert.equal(status, request?.expectedStatus ?? 200);
  assert.ok(body);
  return body;
}

test("list-models rejects an empty or whitespace-only baseUrl with 400", async () => {
  for (const baseUrl of ["", " \t "]) {
    const body = await probe(registerAdminAssistantListModelsRoute, baseUrl, {}, {
      body: { protocol: "openai", baseUrl, apiKey: "sk-fake" }, expectedStatus: 400,
    });
    assert.deepEqual(body, { error: "baseUrl is required", code: "VALIDATION_ERROR" });
  }
});

test("list-models rejects a missing or null body with a validation error", async () => {
  for (const body of [undefined, null]) {
    const response = await probe(registerAdminAssistantListModelsRoute, "", {}, { body, expectedStatus: 400 });
    assert.deepEqual(response, {
      error: "protocol must be one of anthropic|openai|azure|google", code: "VALIDATION_ERROR",
    });
  }
});

for (const registrar of registrars) {
  test(`${registrar.name}: rejects private and mixed DNS answers through the real route`, async () => {
    for (const answers of [
      [{ address: "10.0.0.5", family: 4 }],
      [{ address: "fc00::1", family: 6 }],
      [{ address: "fe80::1", family: 6 }],
      [{ address: "::ffff:10.0.0.5", family: 6 }],
      [{ address: "93.184.216.34", family: 4 }, { address: "10.0.0.5", family: 4 }],
    ]) {
      addresses = answers;
      lookups.length = 0;
      transportCalls = 0;
      const body = await probe(registrar, "http://provider.invalid");
      assert.equal(body.ok, false);
      assert.equal(body.message, "Internal IPs blocked");
      assert.deepEqual(lookups, ["provider.invalid"], "the route must run DNS-aware validation");
      assert.equal(transportCalls, 0, "blocked and mixed answers must fail before HTTP dispatch");
    }
  });

  test(`${registrar.name}: refuses a provider redirect without reaching its target`, async () => {
    // Native fetch owns redirect handling. Only its HTTP dispatcher is in-memory, so this
    // exercises fetch's real follow/error behavior without opening sockets in the sandbox.
    for (const target of ["http://169.254.169.254/", "http://127.0.0.1:4322/"]) {
      const requests: string[] = [];
      const dispatcher = {
        dispatch(options: { origin: string; path: string }, handler: {
          onConnect: (abort: () => void) => void;
          onHeaders: (status: number, headers: Buffer[], resume: () => void, statusText: string) => void;
          onData: (chunk: Buffer) => void;
          onComplete: (trailers: Buffer[]) => void;
        }) {
          const url = `${options.origin}${options.path}`;
          requests.push(url);
          queueMicrotask(() => {
            handler.onConnect(() => {});
            if (requests.length === 1) {
              handler.onHeaders(302, [Buffer.from("location"), Buffer.from(target)], () => {}, "Found");
            } else {
              handler.onHeaders(200, [Buffer.from("content-type"), Buffer.from("application/json")], () => {}, "OK");
              handler.onData(Buffer.from(JSON.stringify({ data: [{ id: "guard-model" }], choices: [{ message: { content: "OK" } }] })));
            }
            handler.onComplete([]);
          });
          return true;
        },
      };
      const body = await probe(registrar, "http://127.0.0.1:4321", {
        probeRequestInit: { dispatcher } as NonNullable<AssistantExecutionRouteDeps["probeRequestInit"]>,
      });
      assert.equal(requests.length, 1, `redirect to ${target} must never dispatch a second request`);
      assert.equal(body.ok, false);
    }
  });
}

// Reuse undici's maintained in-memory transport rather than a second dispatcher harness.
import { MockAgent } from "undici";

test("list-models sends only discovered IDs and omits an absent success message", async (t) => {
  const dispatcher = new MockAgent();
  dispatcher.disableNetConnect();
  t.after(() => dispatcher.close());
  dispatcher.get("http://127.0.0.1:4321").intercept({ path: "/v1/models", method: "GET" })
    .reply(200, { data: [{ id: "gpt-4o", owned_by: "private-owner" }, { id: "gpt-4o-mini" }] });
  const body = await probe(registerAdminAssistantListModelsRoute, "http://127.0.0.1:4321", { probeRequestInit: { dispatcher } });
  assert.deepEqual(body, { ok: true, models: ["gpt-4o", "gpt-4o-mini"] });
  dispatcher.assertNoPendingInterceptors();
});

test("list-models explains the empty key using the server credential contract", async () => {
  const body = await probe(registerAdminAssistantListModelsRoute, "http://127.0.0.1:4321", {}, {
    body: { protocol: "openai", baseUrl: "http://127.0.0.1:4321", apiKey: "" }, expectedStatus: 200,
  });
  assert.deepEqual(body, { ok: false, models: [], message: "No API key saved on the server. Save one first." });
});

for (const [status, providerBody, expected] of [
  [200, { choices: [{ message: { content: "ok" } }] }, { ok: true, message: "valid completion" }],
  [500, "", { ok: false, message: "Connection failed (upstream_unavailable)" }],
] as const) {
  test(`test-connection renders the ${status} provider outcome`, async (t) => {
    const dispatcher = new MockAgent();
    dispatcher.disableNetConnect();
    t.after(() => dispatcher.close());
    dispatcher.get("http://127.0.0.1:4321").intercept({ path: "/v1/chat/completions", method: "POST" }).reply(status, providerBody);
    const body = await probe(registerAdminAssistantTestConnectionRoute, "http://127.0.0.1:4321", { probeRequestInit: { dispatcher } });
    assert.deepEqual(body, expected);
    dispatcher.assertNoPendingInterceptors();
  });
}

test("test-connection forwards Azure's explicit API version to the provider", async (t) => {
  const dispatcher = new MockAgent();
  dispatcher.disableNetConnect();
  t.after(() => dispatcher.close());
  dispatcher.get("http://127.0.0.1:4321").intercept({
    path: "/openai/deployments/guard-model/chat/completions?api-version=2025-01-01-preview", method: "POST",
  }).reply(200, { choices: [{ message: { content: "ok" } }] });
  const body = await probe(registerAdminAssistantTestConnectionRoute, "http://127.0.0.1:4321", { probeRequestInit: { dispatcher } }, {
    body: { protocol: "azure", baseUrl: "http://127.0.0.1:4321", apiKey: "fake-key", model: "guard-model", apiVersion: "2025-01-01-preview" }, expectedStatus: 200,
  });
  assert.deepEqual(body, { ok: true, message: "valid completion" });
  dispatcher.assertNoPendingInterceptors();
});

test("list-models answers Azure honestly even when an explicit API version is supplied", async () => {
  const body = await probe(registerAdminAssistantListModelsRoute, "http://127.0.0.1:4321", {}, {
    body: { protocol: "azure", baseUrl: "http://127.0.0.1:4321", apiKey: "fake-key", apiVersion: "2025-01-01-preview" }, expectedStatus: 200,
  });
  assert.deepEqual(body, { ok: false, models: [], message: "Azure OpenAI deployment discovery is not supported from the inference endpoint." });
});

test("list-models redacts an authorization-store failure as a generic 500 before any probe", async () => {
  const before = { transportCalls, lookups: lookups.length };
  const body = await probe(registerAdminAssistantListModelsRoute, "http://provider.invalid", {
    authorize: async () => { throw new Error("policy store at /private/policies.db is down"); },
  }, { body: { protocol: "openai", baseUrl: "http://provider.invalid", apiKey: "sk-fake" }, expectedStatus: 500 });
  assert.deepEqual(body, { error: "internal error", code: "INTERNAL_ERROR" });
  assert.deepEqual({ transportCalls, lookups: lookups.length }, before, "a failed permission check must never reach DNS or the provider");
});
