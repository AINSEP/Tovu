import assert from "node:assert/strict";
import test from "node:test";
import { AesGcmSecretSealer } from "@jini-ai/platform/secrets";
import { createCustomCredential, InMemoryCustomCredentialSetRepo } from "#src/features/custom-credentials/index";
import { InMemoryKeyring } from "#src/features/webhooks/keyring.env";
import { portFake } from "#src/server/__tests__/helpers/port-fake";
import { bindCredentialsHostPorts, type CredentialsHostPortDeps } from "../credentials-host-ports.js";

test("the saved-key host port reads the current workspace store and describes without opening its key", async t => {
  const workspaceId = "site-a", label = "Repository service", baseUrl = "https://git.example.test";
  const makeStore = (hkdfSalt: string) => {
    const keyring = new InMemoryKeyring({ hkdfSalt });
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

  const first = makeStore("initial-store");
  current = first.host;
  assert.equal(await keys.describeByLabel({ workspaceId, label }), null);
  assert.equal(await keys.resolveByLabel({ workspaceId, label }), null);

  const next = makeStore("replacement-store");
  const token = "test-fixture-repository-key";
  await createCustomCredential({ ...next, clock: { nowMs: () => 0 }, idGen: { newId: () => "credential-9" } },
    { workspaceId, label, category: "ops", baseUrl, connection: { token } });
  current = next.host;
  const open = t.mock.method(next.sealer, "open");
  const description = await keys.describeByLabel({ workspaceId, label });
  assert.deepEqual({ id: description?.id, label: description?.label, origin: description?.baseUrl },
    { id: "credential-9", label, origin: baseUrl });
  assert.equal(JSON.stringify(description).includes(token), false);
  assert.equal(open.mock.callCount(), 0);
  assert.equal(await keys.resolveByLabel({ workspaceId: "site-b", label }), null);
  assert.equal(open.mock.callCount(), 0);
  assert.deepEqual(await keys.resolveByLabel({ workspaceId, label }), {
    id: "credential-9", category: "ops", baseUrl, additionalHosts: [], connection: { token },
  });
});
