import assert from "node:assert/strict";
import test from "node:test";
import { AesGcmSecretSealer } from "@jini-ai/platform/secrets";
import { createCustomCredential, InMemoryCustomCredentialSetRepo } from "#src/features/custom-credentials/index";
import { InMemoryKeyring } from "#src/features/webhooks/keyring.env";
import { portFake } from "#src/server/__tests__/helpers/port-fake";
import { bindCredentialsHostPorts, type CredentialsHostPortDeps } from "../credentials-host-ports.js";

test("the saved-key host port reads the current workspace store and describes without opening its key", async t => {
  const workspaceId = "site-a", label = "Repository service", baseUrl = "https://git.example.test";
  const makeStore = () => {
    // Each store gets its own random root key, so the replacement cannot open the first store's rows.
    const keyring = new InMemoryKeyring();
    const sealer = new AesGcmSecretSealer({ keyring });
    const repo = new InMemoryCustomCredentialSetRepo();
    return { keyring, sealer, repo,
      host: portFake<CredentialsHostPortDeps>({ customCredentialSetRepo: repo, siteAssistantSecretSealer: sealer }) };
  };
  let current: CredentialsHostPortDeps | undefined;
  const { sourceControlSavedKeys: keys } = bindCredentialsHostPorts({ readDeps: () => {
    assert.ok(current, "binding must never read before its deps are assembled");
    return current;
  } });

  const first = makeStore();
  current = first.host;
  assert.equal(await keys.describeByLabel({ workspaceId, label }), null);
  assert.equal(await keys.resolveByLabel({ workspaceId, label }), null);

  const next = makeStore();
  const token = "test-fixture-repository-key";
  await createCustomCredential({ ...next, clock: { nowMs: () => 0 }, idGen: { newId: () => "credential-9" } },
    { workspaceId, label, category: "ops", baseUrl, connection: { token } });
  current = next.host;
  const open = t.mock.method(next.sealer, "open");
  const description = await keys.describeByLabel({ workspaceId, label });
  assert.ok(description, "the saved key is described");
  const shown = description as Record<string, unknown>;
  assert.deepEqual({ id: shown.id, label: shown.label, origin: shown.baseUrl },
    { id: "credential-9", label, origin: baseUrl });
  assert.equal(JSON.stringify(description).includes(token), false);
  assert.equal(open.mock.callCount(), 0);
  assert.equal(await keys.resolveByLabel({ workspaceId: "site-b", label }), null);
  assert.equal(open.mock.callCount(), 0);
  assert.deepEqual(await keys.resolveByLabel({ workspaceId, label }), {
    id: "credential-9", category: "ops", baseUrl, additionalHosts: [], connection: { token },
  });
});

test("publish compatibility reads the deploy-target loader and verification cache from the bag when an invalidation is prepared", async () => {
  const loads: unknown[] = [];
  let current: CredentialsHostPortDeps | undefined;
  const { publishCompatibility } = bindCredentialsHostPorts({ readDeps: () => {
    assert.ok(current, "binding must never read before its deps are assembled");
    return current;
  } });

  current = portFake<CredentialsHostPortDeps>({});
  await publishCompatibility.prepareInvalidation({ workspaceId: "site-a" });
  // `assert.deepEqual` would narrow `loads` to `never[]` for the rest of the test.
  assert.equal(loads.length, 0, "no cache bound: the deploy targets are not loaded");

  current = portFake<CredentialsHostPortDeps>({
    loadDeployTargets: (async (input: unknown) => { loads.push(input); return { list: () => [] }; }) as unknown as CredentialsHostPortDeps["loadDeployTargets"],
    publishCredentialVerificationCache: new Map() as unknown as CredentialsHostPortDeps["publishCredentialVerificationCache"],
  });
  await publishCompatibility.prepareInvalidation({ workspaceId: "site-a" });
  assert.deepEqual(loads, [{ workspaceId: "site-a" }]);
});

test("source-control writes load the providers and the HTTP client from the bag current when a build runs", async () => {
  const loads: Array<{ who: string; input: unknown }> = [];
  let kitClient: unknown;
  // One provider whose module hands back the HTTP client its kit was built with.
  const loaded = { pluginId: "example-git", descriptor: { id: "example-git", label: "Example Git", apiOrigin: "https://git.example.test" },
    module: { create: ({ kit }: { kit: { httpClient: unknown } }) => { kitClient = kit.httpClient; return {}; } } };
  const registries = {
    empty: { list: () => [], get: () => undefined, refusals: [] },
    one: { list: () => [loaded], get: ({ providerId }: { providerId: string }) => (providerId === "example-git" ? loaded : undefined), refusals: [] },
  };
  const bag = (who: string, registry: keyof typeof registries) => {
    const client = { send: async () => { throw new Error(`no network for ${who}`); } };
    return { client, deps: portFake<CredentialsHostPortDeps>({
      loadSourceControlProviders: (async (input: unknown) => { loads.push({ who, input }); return registries[registry]; }) as unknown as CredentialsHostPortDeps["loadSourceControlProviders"],
      customCredentialsHttpClient: client as unknown as CredentialsHostPortDeps["customCredentialsHttpClient"],
    }) };
  };
  let reads = 0;
  let current: CredentialsHostPortDeps | undefined;
  const { sourceControlWrite } = bindCredentialsHostPorts({ readDeps: () => {
    reads += 1;
    assert.ok(current, "binding must never read before its deps are assembled");
    return current;
  } });
  assert.equal(reads, 0, "binding reads nothing until a write runs");

  current = bag("first", "empty").deps;
  const first = await sourceControlWrite.build({ workspaceId: "site-a", baseUrl: "https://git.example.test" });
  assert.ok(!first.ok, "an empty provider registry builds no provider");
  assert.match(first.message, /^No enabled Agent Plugin provides source control/);

  const second = bag("second", "one");
  current = second.deps;
  const built = await sourceControlWrite.build({ workspaceId: "site-b", baseUrl: "https://git.example.test" });
  assert.ok(built.ok, "the second bag's provider is built");
  assert.equal(kitClient, second.client, "the provider kit carries the guarded client read at build time");
  assert.deepEqual(loads, [{ who: "first", input: { workspaceId: "site-a" } }, { who: "second", input: { workspaceId: "site-b" } }]);
});
