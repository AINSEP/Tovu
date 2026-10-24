import assert from "node:assert/strict";
import test from "node:test";
import { InMemoryCustomCredentialSetRepo } from "../../custom-credentials/repo.memory.js";
import { createCustomCredential } from "../../custom-credentials/store.js";
import { hasLoginCredentials, resolveLoginCredentials } from "../credentials.js";
import { MemberLoginError } from "../types.js";
import { cryptoFixture, provider } from "./fixtures.js";

function fixture() {
  let sequence = 0;
  const deps = { ...cryptoFixture(), repo: new InMemoryCustomCredentialSetRepo(), idGen: { newId: () => { sequence++; return `credential-${sequence}`; } } };
  const save = (label = provider.credentialLabel, baseUrl = provider.tokenEndpoint, username: string | undefined = "client-id") => createCustomCredential(deps,
    { workspaceId: "ws", label, category: "general", baseUrl, connection: { token: "sealed-client-secret", username } });
  return { deps, save, input: { deps, workspaceId: "ws", provider } };
}

test("client card resolves username/client ID and sealed token/client secret through vault owner", async () => {
  const f = fixture();
  await f.save();
  assert.equal(await hasLoginCredentials(f.input), true);
  assert.deepEqual(await resolveLoginCredentials(f.input), { clientId: "client-id", clientSecret: "sealed-client-secret", authMethod: "client_secret_post" });
  assert.equal(await hasLoginCredentials({ ...f.input, workspaceId: "other" }), false);
});
test("provider listing does not decrypt; credential payload never falls back to Workspace", async () => {
  const f = fixture();
  await f.save("google-workspace/account OAuth client");
  assert.equal(await hasLoginCredentials(f.input), false);
  await assert.rejects(resolveLoginCredentials(f.input), MemberLoginError);
  await f.save();
  const noOpen = { ...f.deps, sealer: { ...f.deps.sealer, seal: f.deps.sealer.seal.bind(f.deps.sealer), open: async () => { throw new Error("secret canary"); } } };
  assert.equal(await hasLoginCredentials({ ...f.input, deps: noOpen }), true);
  await assert.rejects(resolveLoginCredentials({ ...f.input, deps: noOpen }), error => error instanceof MemberLoginError && error.message === "LOGIN_UNAVAILABLE" && !error.cause);
});
test("wrong token URL and missing client ID are unavailable", async () => {
  const f = fixture();
  await f.save(provider.credentialLabel, "https://attacker.example/token");
  assert.equal(await hasLoginCredentials(f.input), false);
  await assert.rejects(resolveLoginCredentials(f.input), MemberLoginError);
  const other = fixture();
  await createCustomCredential(other.deps, { workspaceId: "ws", label: provider.credentialLabel, category: "general",
    baseUrl: provider.tokenEndpoint, connection: { token: "secret-without-client-id" } });
  assert.equal(await hasLoginCredentials(other.input), false);
  await assert.rejects(resolveLoginCredentials(other.input), MemberLoginError);
});
