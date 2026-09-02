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
import { buildCustomCredentialsRegistrations, customCredentialsDerivedRisk, type CustomCredentialsToolDeps } from "../tool-registrations.js";
import type { HttpClientPort, HttpRequest, HttpResponse } from "../../../platform/http/index.js";

/**
 * @file Certification of `custom_credential_set_username` (2026-09-01) — the second half of the
 * self-healing credential loop this dispatch exists for: once `auth-failure-diagnostic.unit.test.ts`
 * proves the assistant can DIAGNOSE a missing username, this tool is how it FIXES it, in-chat, with no
 * token retype. Reuses `updateCustomCredential`'s existing top-level `username` field (see
 * `store.ts`'s own doc and `update-username.unit.test.ts`) rather than a second write path — this file
 * certifies the AGENT-FACING surface on top of that already-proven domain function: permission,
 * schema, label→id resolution, and — the one property that makes this tool safe to leave ungated —
 * that it structurally cannot accept, read, or leak a token.
 */

const WORKSPACE_ID = "ws-cred-set-username";
const PRINCIPAL_ID = "principal-under-test";
const NOW = "2026-09-01T00:00:00.000Z";
const TOOL_ID = "custom_credential_set_username";

/** Same call-counting wrapper every sibling test file in this directory uses — see
 *  `list-agent-tool.unit.test.ts`'s own header for why a real sealer is wrapped rather than faked. */
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

/** `custom_credential_set_username` must never reach this — a call proves a real wiring bug: this
 *  tool sets a plaintext column, it has no legitimate reason to ever touch the network. */
class ExplodingHttpClient implements HttpClientPort {
  async send(_request: HttpRequest): Promise<HttpResponse> {
    throw new Error("custom_credential_set_username must never call the HTTP client");
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
      return { newId: () => `cred-${++n}` };
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
// 1. Catalog + wiring + risk classification
// ---------------------------------------------------------------------------

test("custom_credential_set_username has a catalog entry gated on the WRITE permission (mutates saved state, same as make_request)", () => {
  const entry = customCredentialsAgentToolCatalog.find((t) => t.name === TOOL_ID);
  assert.ok(entry, `expected '${TOOL_ID}' in customCredentialsAgentToolCatalog`);
  assert.equal(entry!.authorization.permission, "custom-credentials.write");
  const schema = entry!.inputSchema as { required: unknown[]; additionalProperties: boolean; properties: Record<string, unknown> };
  assert.equal(schema.additionalProperties, false);
  assert.deepEqual([...schema.required].sort(), ["label", "username"]);
  // No property on this tool's schema may be named or shaped like a secret carrier.
  assert.ok(!("token" in schema.properties));
});

test("custom_credential_set_username is classified as mutates-durable-state in this domain's own derived-risk map (not self-declared 'none')", () => {
  assert.equal(customCredentialsDerivedRisk.get(TOOL_ID), "mutates-durable-state");
});

test("custom_credential_set_username is wired to a real handler", () => {
  const { deps } = fakeRouteDeps();
  const registrations = buildRegistrations(deps, createSurfaceExchangeStore());
  tool(registrations, TOOL_ID); // throws if missing
});

// ---------------------------------------------------------------------------
// 2. Sets and clears — reusing updateCustomCredential's existing username field, never a second
// write path. The ciphertext must stay byte-identical: this is a metadata fix, not a rotation.
// ---------------------------------------------------------------------------

test("sets a new username on a credential that had none, and returns the updated summary", async () => {
  const { deps, writeDeps } = fakeRouteDeps();
  await createCustomCredential(writeDeps, {
    workspaceId: WORKSPACE_ID,
    label: "name.com",
    category: "hosting",
    baseUrl: "https://api.name.com",
    connection: { token: "namecom-secret-token" },
  });

  const result = (await call(tool(buildRegistrations(deps, createSurfaceExchangeStore()), TOOL_ID), {
    label: "name.com",
    username: "leonaburime@gmail.com",
  })) as { username?: string; label: string };

  assert.equal(result.label, "name.com");
  assert.equal(result.username, "leonaburime@gmail.com");
});

test("leaves the sealed ciphertext byte-identical — a username-only fix never rotates or re-seals the token", async () => {
  const { deps, repo, writeDeps } = fakeRouteDeps();
  const created = await createCustomCredential(writeDeps, {
    workspaceId: WORKSPACE_ID,
    label: "name.com",
    category: "hosting",
    baseUrl: "https://api.name.com",
    connection: { token: "namecom-secret-token" },
  });
  const before = await repo.findById({ workspaceId: WORKSPACE_ID, id: created.id });
  assert.ok(before);

  await call(tool(buildRegistrations(deps, createSurfaceExchangeStore()), TOOL_ID), { label: "name.com", username: "leonaburime@gmail.com" });

  const after = await repo.findById({ workspaceId: WORKSPACE_ID, id: created.id });
  assert.ok(after);
  assert.deepEqual(after.sealed, before.sealed);
});

test("username: null clears a previously saved username", async () => {
  const { deps, writeDeps } = fakeRouteDeps();
  await createCustomCredential(writeDeps, {
    workspaceId: WORKSPACE_ID,
    label: "name.com",
    category: "hosting",
    baseUrl: "https://api.name.com",
    connection: { token: "namecom-secret-token", username: "old-username" },
  });

  const result = (await call(tool(buildRegistrations(deps, createSurfaceExchangeStore()), TOOL_ID), { label: "name.com", username: null })) as object;

  assert.ok(!Object.hasOwn(result, "username"), "a cleared username must be an absent key, not username: ''");
});

// ---------------------------------------------------------------------------
// 3. Input validation
// ---------------------------------------------------------------------------

test("rejects a blank string username — not a silent clear, not a silent no-op", async () => {
  const { deps, writeDeps } = fakeRouteDeps();
  await createCustomCredential(writeDeps, {
    workspaceId: WORKSPACE_ID,
    label: "name.com",
    category: "hosting",
    baseUrl: "https://api.name.com",
    connection: { token: "namecom-secret-token" },
  });

  await assert.rejects(() => call(tool(buildRegistrations(deps, createSurfaceExchangeStore()), TOOL_ID), { label: "name.com", username: "" }));
});

test("rejects a call that omits username entirely — this tool always sets or clears, it never silently no-ops", async () => {
  const { deps, writeDeps } = fakeRouteDeps();
  await createCustomCredential(writeDeps, {
    workspaceId: WORKSPACE_ID,
    label: "name.com",
    category: "hosting",
    baseUrl: "https://api.name.com",
    connection: { token: "namecom-secret-token" },
  });

  await assert.rejects(() => call(tool(buildRegistrations(deps, createSurfaceExchangeStore()), TOOL_ID), { label: "name.com" }));
});

test("an unknown label is refused with CustomCredentialNotFoundError-shaped message", async () => {
  const { deps } = fakeRouteDeps();

  await assert.rejects(
    () => call(tool(buildRegistrations(deps, createSurfaceExchangeStore()), TOOL_ID), { label: "does-not-exist", username: "someone" }),
    /no custom credential labeled 'does-not-exist'/
  );
});

// ---------------------------------------------------------------------------
// 4. The security line: this tool can NEVER accept, read, or leak a token
// ---------------------------------------------------------------------------

test("rejects any attempt to pass a token-ish field alongside label/username — this tool accepts ONLY those two fields", async () => {
  const { deps, sealer, writeDeps } = fakeRouteDeps();
  await createCustomCredential(writeDeps, {
    workspaceId: WORKSPACE_ID,
    label: "name.com",
    category: "hosting",
    baseUrl: "https://api.name.com",
    connection: { token: "namecom-secret-token" },
  });
  sealer.openCalls = 0;
  sealer.sealCalls = 0; // ignore the seed's own seal call — only the TOOL CALL under test is asserted below

  await assert.rejects(() =>
    call(tool(buildRegistrations(deps, createSurfaceExchangeStore()), TOOL_ID), {
      label: "name.com",
      username: "leona",
      token: "sneaky-attempt-to-rotate-the-token",
    })
  );
  // Refusing the call must not have cost a decrypt or a re-seal either.
  assert.equal(sealer.openCalls, 0);
  assert.equal(sealer.sealCalls, 0);
});

test("never opens the sealer at all — a username-only write has no reason to decrypt anything", async () => {
  const { deps, sealer, writeDeps } = fakeRouteDeps();
  await createCustomCredential(writeDeps, {
    workspaceId: WORKSPACE_ID,
    label: "name.com",
    category: "hosting",
    baseUrl: "https://api.name.com",
    connection: { token: "namecom-secret-token" },
  });
  sealer.openCalls = 0;
  sealer.sealCalls = 0;

  await call(tool(buildRegistrations(deps, createSurfaceExchangeStore()), TOOL_ID), { label: "name.com", username: "leona" });

  assert.equal(sealer.openCalls, 0, "setting a username must never decrypt the stored connection");
  assert.equal(sealer.sealCalls, 0, "setting a username must never re-seal the stored connection");
});

// ---------------------------------------------------------------------------
// 5. Authorization
// ---------------------------------------------------------------------------

test("a denied principal is refused and the repo is never touched", async () => {
  const { deps, repo, authorizeCalls, writeDeps } = fakeRouteDeps({ allow: false });
  await createCustomCredential(writeDeps, {
    workspaceId: WORKSPACE_ID,
    label: "name.com",
    category: "hosting",
    baseUrl: "https://api.name.com",
    connection: { token: "namecom-secret-token" },
  });
  const before = await repo.listByWorkspace({ workspaceId: WORKSPACE_ID });

  await assert.rejects(
    () => call(tool(buildRegistrations(deps, createSurfaceExchangeStore()), TOOL_ID), { label: "name.com", username: "leona" }),
    /is not authorized for 'custom-credentials\.write'/
  );
  assert.equal(authorizeCalls[0]?.permission, "custom-credentials.write");
  const after = await repo.listByWorkspace({ workspaceId: WORKSPACE_ID });
  assert.deepEqual(after, before, "a denied call must never reach the repo at all");
});
