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
  assert.deepEqual(loads, [], "no cache bound: the deploy targets are not loaded");

  current = portFake<CredentialsHostPortDeps>({
    loadDeployTargets: (async (input: unknown) => { loads.push(input); return { list: () => [] }; }) as unknown as CredentialsHostPortDeps["loadDeployTargets"],
    publishCredentialVerificationCache: new Map() as unknown as CredentialsHostPortDeps["publishCredentialVerificationCache"],
  });
  await publishCompatibility.prepareInvalidation({ workspaceId: "site-a" });
  assert.deepEqual(loads, [{ workspaceId: "site-a" }]);
});
