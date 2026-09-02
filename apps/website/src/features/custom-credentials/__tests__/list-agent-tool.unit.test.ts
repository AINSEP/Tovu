import assert from "node:assert/strict";
import test from "node:test";

import type { ToolExecutionContext, ToolRegistration } from "@jini-ai/core";

import { createSurfaceExchangeStore, type SurfaceExchangeStore } from "#src/contracts/core/tool-surface-exchanges";
import { AesGcmSecretSealer } from "../../webhooks/secret-sealer.aesgcm.js";
import { InMemoryKeyring } from "../../webhooks/keyring.memory.js";
import type { SecretSealerPort } from "../../webhooks/index.js";
import { InMemoryCustomCredentialSetRepo } from "../repo.memory.js";
import { createCustomCredential, type CustomCredentialWriteDeps } from "../store.js";
import { customCredentialsAgentToolCatalog } from "../agent-tools.js";
import { buildCustomCredentialsRegistrations, type CustomCredentialsToolDeps } from "../tool-registrations.js";
import type { HttpClientPort, HttpRequest, HttpResponse } from "../../../platform/http/index.js";

/**
 * @file Certification of `custom_credential_list` — the read-back tool for
 * `features/custom-credentials`. Before this dispatch, the assistant could USE a saved custom
 * credential (`custom_credential_verify`/`custom_credential_make_request`) but had no way to
 * ENUMERATE what is saved without a human retyping a label the system already had (owner's own
 * repro: "can you not preload what was already saved?"). See `agent-tools.ts`'s own header for the
 * full design.
 *
 * Two properties this file is responsible for, beyond "it returns the right rows":
 * 1. The output never carries a secret — asserted by scanning the SERIALIZED result for the seeded
 *    token's exact literal value, not merely by checking the TypeScript output type (a type cannot
 *    catch a handler that accidentally spreads a decrypted object).
 * 2. It never decrypts anything: {@link TrackingSecretSealer} counts `open()` calls on the REAL
 *    AES-GCM sealer (never a plaintext-passthrough double, same reasoning
 *    `make-request-delete-confirmation.test.ts`'s own copy of this class documents) and every test
 *    below asserts zero opens.
 */

const WORKSPACE_ID = "ws-cred-list";
const OTHER_WORKSPACE_ID = "ws-cred-list-other";
const PRINCIPAL_ID = "principal-under-test";
const NOW = "2026-09-01T00:00:00.000Z";
const TOOL_ID = "custom_credential_list";

/** Same call-counting wrapper `make-request-delete-confirmation.test.ts` uses — see this file's
 *  header for why a real sealer is wrapped rather than faked. */
class TrackingSecretSealer implements SecretSealerPort {
  sealCalls = 0;
  openCalls = 0;
  constructor(private readonly inner: SecretSealerPort) {}
  seal(input: Parameters<SecretSealerPort["seal"]>[0]): ReturnType<SecretSealerPort["seal"]> {
    this.sealCalls += 1;
    return this.inner.seal(input);
  }
  open(input: Parameters<SecretSealerPort["open"]>[0]): ReturnType<SecretSealerPort["open"]> {
    this.openCalls += 1;
    return this.inner.open(input);
  }
}

/** `custom_credential_list` must never reach this — a call proves a real wiring bug, not just a
 *  mis-typed assertion. */
class ExplodingHttpClient implements HttpClientPort {
  async send(_request: HttpRequest): Promise<HttpResponse> {
    throw new Error("custom_credential_list must never call the HTTP client");
  }
}

function fakeRouteDeps(options: { allow?: boolean } = {}) {
  let allow = options.allow ?? true;
  const repo = new InMemoryCustomCredentialSetRepo();
  const keyring = new InMemoryKeyring();
  const sealer = new TrackingSecretSealer(new AesGcmSecretSealer(keyring));
  const authorizeCalls: Array<Record<string, unknown>> = [];

  const deps: CustomCredentialsToolDeps = {
    workspaceId: WORKSPACE_ID,
    clock: { nowIso: () => NOW },
    customCredentialSetRepo: repo,
    siteAssistantSecretSealer: sealer,
    siteAssistantSecretKeyring: keyring,
    idGen: (() => {
      let n = 0;
      return { newId: () => `deps-cred-${++n}` };
    })(),
    customCredentialsHttpClient: new ExplodingHttpClient(),
    authorize: async (params: Record<string, unknown>) => {
      authorizeCalls.push(params);
      return allow ? { allowed: true, reason: "matched" } : { allowed: false, reason: "insufficient_permission" };
    },
  };

  const writeDeps: CustomCredentialWriteDeps = {
    repo,
    sealer,
    keyring,
    clock: { nowIso: () => NOW },
    idGen: (() => {
      let n = 0;
      return { newId: () => `cred-${++n}` };
    })(),
  };

  return { deps, repo, sealer, writeDeps, authorizeCalls, setAllow: (value: boolean) => { allow = value; } };
}

function buildRegistrations(deps: CustomCredentialsToolDeps, surfaceExchanges: SurfaceExchangeStore): Map<string, ToolRegistration> {
  return new Map(buildCustomCredentialsRegistrations(deps, { surfaceExchanges }).map((r) => [r.descriptor.id, r]));
}

function tool(registrations: Map<string, ToolRegistration>, id: string): ToolRegistration {
  const found = registrations.get(id);
  assert.ok(found, `expected '${id}' to be wired`);
  return found;
}

function call(registration: ToolRegistration, input: unknown = {}) {
  const ctx: ToolExecutionContext = {
    executionId: "exec-1",
    principal: { id: PRINCIPAL_ID },
    run: { id: "run-1" },
    input,
    signal: new AbortController().signal,
  };
  return registration.handler(ctx);
}

// ---------------------------------------------------------------------------
// 1. The tool is registered and reachable — this is the assertion that must fail against the
// pre-fix registry (no `custom_credential_list` catalog entry, no handler).
// ---------------------------------------------------------------------------

test("custom_credential_list has a catalog entry with a parameterless inputSchema", () => {
  const entry = customCredentialsAgentToolCatalog.find((t) => t.name === TOOL_ID);
  assert.ok(entry, `expected '${TOOL_ID}' in customCredentialsAgentToolCatalog`);
  assert.equal(entry!.sideEffects, "none");
  assert.equal(entry!.authorization.permission, "custom-credentials.read");
  const schema = entry!.inputSchema as { type: string; properties: object; required: unknown[]; additionalProperties: boolean };
  assert.equal(schema.type, "object");
  assert.deepEqual(schema.properties, {});
  assert.deepEqual(schema.required, []);
  assert.equal(schema.additionalProperties, false);
});

test("custom_credential_list is wired to a real handler", () => {
  const { deps } = fakeRouteDeps();
  const registrations = buildRegistrations(deps, createSurfaceExchangeStore());
  tool(registrations, TOOL_ID); // throws if missing
});

// ---------------------------------------------------------------------------
// 2. Correct rows, exactly the fields agent-tools.ts promises — never the secret. `username` IS
// reported (2026-09-01): it moved out of the sealed blob onto its own plaintext column, so the read
// model can carry it without opening the sealer. See `db/schema.ts`'s `customCredentialSets.username`.
// ---------------------------------------------------------------------------

test("returns every saved credential's label, category, baseUrl, additionalHosts, username, configured, and timestamps", async () => {
  const { deps, writeDeps } = fakeRouteDeps();
  await createCustomCredential(writeDeps, {
    workspaceId: WORKSPACE_ID,
    label: "fly.io",
    category: "ops",
    baseUrl: "https://api.fly.io",
    additionalHosts: ["https://api.machines.dev"],
    connection: { token: "flyio-secret-token", username: "leona" },
  });
  await createCustomCredential(writeDeps, {
    workspaceId: WORKSPACE_ID,
    label: "name.com",
    category: "hosting",
    baseUrl: "https://api.name.com",
    connection: { token: "namecom-secret-token" },
  });

  const registrations = buildRegistrations(deps, createSurfaceExchangeStore());
  const result = (await call(tool(registrations, TOOL_ID))) as { credentials: unknown[] };

  assert.equal(result.credentials.length, 2);
  assert.deepEqual(
    [...result.credentials].sort((a: any, b: any) => a.label.localeCompare(b.label)),
    [
      {
        id: "cred-1",
        label: "fly.io",
        category: "ops",
        baseUrl: "https://api.fly.io",
        additionalHosts: ["https://api.machines.dev"],
        username: "leona",
        configured: true,
        createdAt: NOW,
        updatedAt: NOW,
      },
      {
        id: "cred-2",
        label: "name.com",
        category: "hosting",
        baseUrl: "https://api.name.com",
        additionalHosts: [],
        configured: true,
        createdAt: NOW,
        updatedAt: NOW,
      },
    ]
  );
});

test("returns an empty list, not an error, when nothing is saved yet", async () => {
  const { deps } = fakeRouteDeps();
  const result = (await call(tool(buildRegistrations(deps, createSurfaceExchangeStore()), TOOL_ID))) as { credentials: unknown[] };
  assert.deepEqual(result.credentials, []);
});

test("is workspace-scoped: a credential saved in a different workspace is never returned", async () => {
  const { deps, writeDeps } = fakeRouteDeps();
  await createCustomCredential(writeDeps, {
    workspaceId: OTHER_WORKSPACE_ID,
    label: "someone-elses-credential",
    category: "general",
    baseUrl: "https://example.com",
    connection: { token: "not-mine" },
  });

  const result = (await call(tool(buildRegistrations(deps, createSurfaceExchangeStore()), TOOL_ID))) as { credentials: unknown[] };
  assert.deepEqual(result.credentials, []);
});

// ---------------------------------------------------------------------------
// 3. The secret never appears in the output, and the credential is never decrypted at all
// ---------------------------------------------------------------------------

test("never exposes the secret value: neither field name nor its plaintext value appear anywhere in the serialized output", async () => {
  const { deps, sealer, writeDeps } = fakeRouteDeps();
  await createCustomCredential(writeDeps, {
    workspaceId: WORKSPACE_ID,
    label: "fly.io",
    category: "ops",
    baseUrl: "https://api.fly.io",
    connection: { token: "super-secret-flyio-token-do-not-leak", username: "leona" },
  });
  sealer.sealCalls = 0; // ignore the seed's own seal call — only the LIST call is under test below

  const result = await call(tool(buildRegistrations(deps, createSurfaceExchangeStore()), TOOL_ID));
  const serialized = JSON.stringify(result);

  assert.ok(!serialized.includes("super-secret-flyio-token-do-not-leak"), "the raw token must never appear in the output");
  assert.ok(!/token|sealed|connection/i.test(serialized), "no field even NAMED like a secret carrier should appear in the output");
  assert.equal(sealer.openCalls, 0, "listing must never decrypt a single row");
  assert.equal(sealer.sealCalls, 0, "listing must never seal anything either");
});

/**
 * The read-back half of the 2026-09-01 username migration, and the reason it was worth doing: the
 * value must arrive through the read model WITHOUT the sealer ever being opened. Asserted with a
 * sealer whose `open()` throws outright — a handler that decrypted to find the username would fail
 * here rather than silently pay an AEAD open per row on a cheap path.
 */
test("reports a saved username without ever opening the sealer", async () => {
  const { deps, sealer, writeDeps } = fakeRouteDeps();
  await createCustomCredential(writeDeps, {
    workspaceId: WORKSPACE_ID,
    label: "fly.io",
    category: "ops",
    baseUrl: "https://api.fly.io",
    connection: { token: "flyio-secret-token", username: "leona@example.com" },
  });

  // Any decrypt attempt from here on is a hard failure, not a slow path.
  sealer.open = () => {
    throw new Error("custom_credential_list must never open the sealer to read a username");
  };

  const result = (await call(tool(buildRegistrations(deps, createSurfaceExchangeStore()), TOOL_ID))) as {
    credentials: Array<{ label: string; username?: string }>;
  };

  assert.equal(result.credentials[0]?.username, "leona@example.com");
});

test("omits `username` entirely for a credential saved without one — never an empty string", async () => {
  const { deps, writeDeps } = fakeRouteDeps();
  await createCustomCredential(writeDeps, {
    workspaceId: WORKSPACE_ID,
    label: "name.com",
    category: "hosting",
    baseUrl: "https://api.name.com",
    connection: { token: "namecom-secret-token" },
  });

  const result = (await call(tool(buildRegistrations(deps, createSurfaceExchangeStore()), TOOL_ID))) as { credentials: object[] };
  assert.ok(!Object.hasOwn(result.credentials[0]!, "username"), "an absent username must be an absent key, not `username: ''`");
});

// ---------------------------------------------------------------------------
// 4. Authorization and input contract
// ---------------------------------------------------------------------------

test("a denied principal is refused and the repo is never read", async () => {
  const { deps, sealer, writeDeps, authorizeCalls } = fakeRouteDeps({ allow: false });
  await createCustomCredential(writeDeps, {
    workspaceId: WORKSPACE_ID,
    label: "fly.io",
    category: "ops",
    baseUrl: "https://api.fly.io",
    connection: { token: "flyio-secret-token" },
  });

  await assert.rejects(
    () => call(tool(buildRegistrations(deps, createSurfaceExchangeStore()), TOOL_ID)),
    /is not authorized for 'custom-credentials\.read'/
  );
  assert.equal(authorizeCalls[0]?.permission, "custom-credentials.read");
  assert.equal(sealer.openCalls, 0);
});

test("rejects a non-empty input — this tool takes no arguments", async () => {
  const { deps } = fakeRouteDeps();
  await assert.rejects(() => call(tool(buildRegistrations(deps, createSurfaceExchangeStore()), TOOL_ID), { unexpected: "field" }));
});
