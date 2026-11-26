import "../../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import test from "node:test";

import type { ToolExecutionContext } from "@jini-ai/core";
import { createTimeoutScheduler } from "@jini-ai/daemon/scheduler";
import { createSurfaceExchangeStore } from "@jini-ai/daemon/surface-exchanges";
import { createRandomUuidGenerator, createSystemClock } from "@jini-ai/platform/system";

import { createApp, createRouteDeps } from "#src/server/runtime/composition/app";
import { buildStaticPublishRegistrations } from "#src/features/deployments/publish-agent-tools";
import { createPublishCredential, describeCredential, hasDefaultForPublish } from "#src/features/deployments/publish-credentials/store";
import { PublishCredentialDuplicateLabelError } from "@jini-ai/devops/deploy/site/publish-credentials/store";
import type { VendorCredentialSetRepoPort } from "@jini-ai/core/contracts/site/vendor-credentials";
import { bootAuthenticated } from "../../../../__tests__/helpers/http-test-server.js";

/**
 * @file P8-V1.T verification witnesses for the basis a publish key's verification result rests on
 * (`system-credentials.ts`'s `buildVerifyAfterSave`, `publish-agent-tools.ts`'s readiness read).
 * Hermetic: real in-process `createRouteDeps()`, synthetic tokens, and an outbound-fetch fake that
 * never reaches a provider. A witness that is red on today's code lands as a `todo` with its
 * reproduction in the body, never as a failing active test.
 */

const CREDENTIALS_PATH = "system/publish/credentials";
type Deps = ReturnType<typeof createRouteDeps>;
type Capability = { providerId: string; ready: boolean; verified: string | null; verifiedAt: string | null };

/** Local requests pass through; anything else is the provider probe, answered by `provider`. */
function fakeProvider(t: { after(fn: () => void): void }, baseUrl: string, provider: () => Response): { outbound: () => number } {
  const original = globalThis.fetch;
  let outbound = 0;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input).startsWith(baseUrl)) return original(input, init);
    outbound += 1;
    return provider();
  }) as typeof fetch;
  t.after(() => { globalThis.fetch = original; });
  return { outbound: () => outbound };
}

/** The agent-facing readiness read (`deployment_get_static_publish_capabilities`) for one host. */
async function readiness(deps: Deps, providerId: string): Promise<Capability> {
  const surfaceExchanges = createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: "mcp-ui" });
  const registration = buildStaticPublishRegistrations({ ...deps, authorize: async () => ({ allowed: true, reason: "matched" }) }, { surfaceExchanges })
    .find(candidate => candidate.descriptor.id === "deployment_get_static_publish_capabilities");
  assert.ok(registration, "the capabilities tool is wired");
  const ctx: ToolExecutionContext = { executionId: "exec-basis", principal: { id: "principal-basis" }, run: { id: "run-basis" }, input: {}, signal: new AbortController().signal };
  const result = await registration.handler(ctx, {}) as { providers: Capability[] };
  const found = result.providers.find(provider => provider.providerId === providerId);
  assert.ok(found, `capabilities list ${providerId}`);
  return found;
}

async function saveKey(deps: Deps, label: string, token: string) {
  return createPublishCredential(
    { repo: deps.vendorCredentialSetRepo, sealer: deps.siteAssistantSecretSealer, keyring: deps.siteAssistantSecretKeyring, clock: deps.clock, idGen: deps.idGen, loadDeployTargets: deps.loadDeployTargets },
    { workspaceId: deps.workspaceId, label, connection: { providerId: "netlify", token } } as Parameters<typeof createPublishCredential>[1],
  );
}

test("B226: changing the default publishing key does not inherit the previous key's valid check", async (t) => {
  const deps: Deps = { ...createRouteDeps() };
  const app = createApp(deps);
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  const provider = fakeProvider(t, baseUrl, () => assert.fail("no provider check may run in this witness"));
  const keyA = await saveKey(deps, "Key A", "synthetic-netlify-a");
  const keyB = await saveKey(deps, "Key B", "synthetic-netlify-b");
  assert.equal(keyA.isDefault, true);
  const basis = await hasDefaultForPublish({ repo: deps.vendorCredentialSetRepo, loadDeployTargets: deps.loadDeployTargets }, { workspaceId: deps.workspaceId, providerId: "netlify" });
  assert.ok(basis);
  assert.equal(basis.id, keyA.id);
  deps.publishCredentialVerificationCache.set({ workspaceId: deps.workspaceId, target: "netlify", basis }, { status: "valid", message: "Key A was accepted.", checkedAt: "2026-11-01T00:00:00.000Z" });
  const before = await readiness(deps, "netlify");
  assert.equal(before.verified, "valid", "baseline: A's own check is read while A is the default");
  assert.equal(before.ready, true, "baseline: A is ready on its own check");

  const promoted = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/${CREDENTIALS_PATH}/${keyB.id}`, {
    method: "PUT", headers: { cookie, "content-type": "application/json" }, body: JSON.stringify({ isDefault: true }),
  });
  assert.equal(promoted.status, 200, await promoted.clone().text());
  assert.equal((await promoted.json()).credential.isDefault, true);

  const after = await readiness(deps, "netlify");
  assert.equal(provider.outbound(), 0, "readiness was inspected before any new verification ran");
  assert.equal(after.ready, false, "a never-verified default key must not read as ready");
  assert.equal(after.verified, null, "the previous key's check must not be inherited");
  assert.equal(after.verifiedAt, null, "the previous key's timestamp must not be inherited");
});

/** Wraps the real repo so only the post-commit account-label heal write collides. */
function collidingHeal(real: VendorCredentialSetRepoPort): VendorCredentialSetRepoPort {
  return new Proxy(real, {
    get(target, prop, receiver) {
      if (prop === "updateAccountLabel") return async () => { throw new PublishCredentialDuplicateLabelError("account label already used by another key"); };
      const value: unknown = Reflect.get(target, prop, receiver);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

test("B231: an account-label collision does not report an unsaved key after its credential row committed", async (t) => {
  // Repro: POST a github-pages key whose probe returns {login}; make updateAccountLabel throw
  // PublishCredentialDuplicateLabelError; the response says 409 although the row exists.
  const deps: Deps = { ...createRouteDeps() };
  const real = deps.vendorCredentialSetRepo;
  deps.vendorCredentialSetRepo = collidingHeal(real);
  const app = createApp(deps);
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  fakeProvider(t, baseUrl, () => new Response(JSON.stringify({ login: "synthetic-account" }), { status: 200, headers: { "content-type": "application/json" } }));
  const base = `${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/${CREDENTIALS_PATH}`;
  const post = () => fetch(base, { method: "POST", headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ label: "gh", connection: { providerId: "github-pages", token: "synthetic-github-token" } }) });

  const created = await post();
  const body = await created.json() as { credential?: { id: string; label: string }; error?: string };
  assert.equal(created.status, 201, `committed key reported as: ${JSON.stringify(body)}`);
  assert.ok(body.credential, "the response names the saved key");
  const stored = await describeCredential({ repo: real, sealer: deps.siteAssistantSecretSealer, loadDeployTargets: deps.loadDeployTargets }, { workspaceId: deps.workspaceId, id: body.credential.id });
  assert.ok(stored, "the credential row committed");
});

test("B231 control: a genuine pre-commit duplicate label is refused and the stored row is untouched", async (t) => {
  const deps: Deps = { ...createRouteDeps() };
  const app = createApp(deps);
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  fakeProvider(t, baseUrl, () => new Response("", { status: 401 }));
  const base = `${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/${CREDENTIALS_PATH}`;
  const post = (token: string) => fetch(base, { method: "POST", headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ label: "gh", connection: { providerId: "github-pages", token } }) });

  const first = await post("synthetic-github-token-1");
  assert.equal(first.status, 201, await first.clone().text());
  const duplicate = await post("synthetic-github-token-2");
  assert.equal(duplicate.status, 409);
  assert.equal((await duplicate.json()).error, "DUPLICATE_LABEL");
  const { credential } = await first.json() as { credential: { id: string } };
  const stored = await describeCredential({ repo: deps.vendorCredentialSetRepo, sealer: deps.siteAssistantSecretSealer, loadDeployTargets: deps.loadDeployTargets }, { workspaceId: deps.workspaceId, id: credential.id });
  assert.ok(stored, "the first row is still stored");
});
