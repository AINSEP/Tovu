import assert from "node:assert/strict";
import test from "node:test";
import { createPluginContributionLoader } from "@jini-ai/agent-plugins/lifecycle";
import { MemberLoginError } from "@jini-ai/user-management/server";
import { InMemoryCustomCredentialSetRepo } from "#src/features/custom-credentials/repo.memory";
import { createCustomCredential } from "#src/features/custom-credentials/store";
import { cryptoFixture, originFixture, provider } from "#src/features/member-login/__tests__/fixtures";
import type { MembersRouteDeps } from "#src/server/inbound/admin-http/routes/members/deps";
import type { MemberPublicRouteDeps } from "#src/server/inbound/public-http/routes/members/deps";
import { createMemberOidcRouteDeps } from "../members.js";

/**
 * @file The production member-OIDC dependency bundle `createMemberOidcRouteDeps` assembles from the
 * site's admin and public deps. The OIDC route tests inject their own bundle, so these pin the
 * production wiring itself: providers are re-admitted from the installed packages on every call,
 * the OAuth client is the saved client card, link writes run in the content kernel's own
 * transaction and lock, and a link failure reaches the site's reporter under a `public:` step.
 */

async function fixture() {
  const loads: unknown[] = [];
  const crypto = cryptoFixture();
  const repo = new InMemoryCustomCredentialSetRepo();
  let sequence = 0;
  // The installed google-login package offers a provider; admission still requires the site's own
  // bundled pin for it, so an installed package alone never makes a login button.
  const loadContributions = createPluginContributionLoader({
    findPackages: async (input: unknown) => { loads.push(input); return [{ trusted: { pluginId: "google-login", packageRoot: "/unused" } }]; },
    readFile: async () => JSON.stringify({ schemaVersion: 1, providers: [provider] }),
    importModule: async () => { throw new Error("data contributions must never execute plugin code"); },
  }).loadPluginContributions;
  const kernelCalls: string[] = [];
  const kernel = {
    transaction: async <T>(body: () => Promise<T>) => { kernelCalls.push("transaction"); return body(); },
    lockKey: async (key: string) => { kernelCalls.push(`lock:${key}`); },
  };
  const records: unknown[] = [];
  const reporter = { record: (input: unknown, options: unknown) => { records.push([input, options]); return { errorId: "incident-1" }; } };
  const admin = {
    contentKernel: kernel, customCredentialSetRepo: repo, siteAssistantSecretSealer: crypto.sealer, siteAssistantSecretKeyring: crypto.keyring,
    agentPluginLifecycle: { loadPluginContributions: loadContributions },
    mediaGenerationHttpClient: { send: async () => { throw new Error("no OAuth request is made in these tests"); } },
  } as unknown as MembersRouteDeps;
  const members = { workspaceId: "ws", clock: crypto.clock, origin: originFixture() } as unknown as MemberPublicRouteDeps;
  const deps = createMemberOidcRouteDeps({ admin, public: members, reporter });
  assert.ok(deps, "a durable kernel and a site origin make OIDC available");
  const saveClientCard = (baseUrl = provider.tokenEndpoint) => createCustomCredential(
    { ...crypto, repo, idGen: { newId: () => `credential-${++sequence}` } },
    { workspaceId: "ws", label: provider.credentialLabel, category: "general", baseUrl, connection: { token: "client-secret", username: "client-id" } },
  );
  return { deps, kernelCalls, loads, records, saveClientCard };
}

test("the production provider resolver re-reads the installed packages on every call and admits nothing without the site's bundled pin", async () => {
  const f = await fixture();
  await f.saveClientCard();
  assert.equal(await f.deps.protocol.resolveProvider({ workspaceId: "ws", providerId: "google" }), null);
  assert.deepEqual(await f.deps.listProviders({ workspaceId: "ws" }), []);
  assert.equal(f.loads.length, 2, "each call re-reads the installed packages; nothing is cached at construction");
});

test("the production OAuth client is the saved client card: username is the client id, the sealed token the secret", async () => {
  const f = await fixture();
  await assert.rejects(f.deps.protocol.resolveClient({ workspaceId: "ws", provider }),
    (error: unknown) => error instanceof MemberLoginError && error.code === "LOGIN_UNAVAILABLE");
  await f.saveClientCard();
  assert.deepEqual(await f.deps.protocol.resolveClient({ workspaceId: "ws", provider }),
    { clientId: "client-id", clientSecret: "client-secret", authMethod: "client_secret_post" });
});

test("state nonces come from fresh random bytes of the requested length", async () => {
  const { deps } = await fixture();
  const first = deps.protocol.randomBytesFn({ byteLength: 32 });
  const second = deps.protocol.randomBytesFn({ byteLength: 32 });
  assert.equal(first.length, 32);
  assert.equal(deps.protocol.randomBytesFn({ byteLength: 16 }).length, 16);
  assert.notDeepEqual(first, second);
});

test("identity link writes run in the content kernel's transaction and lock, and a link failure is reported under public:", async () => {
  const f = await fixture();
  const result = await f.deps.links.transaction(async () => { await f.deps.links.lockKey("member-oidc:ws:google:subject"); return "linked"; });
  assert.equal(result, "linked");
  assert.deepEqual(f.kernelCalls, ["transaction", "lock:member-oidc:ws:google:subject"]);

  const failure = new Error("identity store offline");
  f.deps.links.reportFailure({ operation: "oidc-callback", error: failure });
  assert.equal(f.records.length, 1);
  const [input] = f.records[0] as [{ error: unknown; step: string; operation: string }, unknown];
  assert.equal(input.operation, "public:oidc-callback");
  assert.equal(input.step, "public:oidc-callback");
  assert.equal(input.error, failure);
});
