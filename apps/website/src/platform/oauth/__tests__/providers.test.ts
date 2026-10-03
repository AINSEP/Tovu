import assert from "node:assert/strict";
import test from "node:test";

import { assertValidOAuthProvider, buildOperatorOAuthProvider, createOAuthProviderRegistry } from "@jini-ai/oauth";
import { createTovuOAuthGuard } from "../endpoint-safety.js";
const guard = createTovuOAuthGuard({});
import type { OAuthProviderDescriptor } from "../ports.js";

function descriptor(overrides: Partial<OAuthProviderDescriptor> = {}): OAuthProviderDescriptor {
  return {
    providerId: "b05-provider", label: "Fixture provider", supportedGrants: ["authorization_code", "device_code"],
    tokenEndpoint: "https://auth.example.com/token", authorizationEndpoint: "https://auth.example.com/authorize",
    deviceAuthorizationEndpoint: "https://auth.example.com/device", defaultScopes: ["read"], usesPkce: true, clientAuth: "none",
    ...overrides,
  };
}

// F4.3/F4.4: change only the named invalid field; don't let missing endpoints mask id validation.
for (const providerId of ["", "Uppercase", "-leading", "has space", "a".repeat(65)]) {
  test(`provider id validation rejects ${JSON.stringify(providerId)}`, () => {
    assert.throws(() => assertValidOAuthProvider({ descriptor: descriptor({ providerId }), guard }), {
      code: "OAUTH_INVALID_REQUEST",
      message: `'${providerId}' is not a valid provider id (lowercase letters, digits and hyphens)`,
    });
  });
}

for (const [overrides, message] of [
  [{ supportedGrants: [] }, "provider 'b05-provider' declares no supported grants"],
  [{ authorizationEndpoint: undefined }, "provider 'b05-provider' supports the browser redirect grant but declares no authorization endpoint"],
  [{ deviceAuthorizationEndpoint: undefined }, "provider 'b05-provider' supports the device grant but declares no device authorization endpoint"],
] as const) {
  test(`descriptor validation: ${message}`, () => {
    assert.throws(() => assertValidOAuthProvider({ descriptor: descriptor(overrides), guard }), { code: "OAUTH_INVALID_REQUEST", message });
  });
}

for (const [field, label] of [
  ["tokenEndpoint", "token endpoint"], ["authorizationEndpoint", "authorization endpoint"],
  ["deviceAuthorizationEndpoint", "device authorization endpoint"],
] as const) {
  test(`registration refuses an unsafe ${field} before admitting its id`, () => {
    const invalid = descriptor({ providerId: `b05-invalid-${field.toLowerCase()}`, [field]: "https://10.1.2.3/oauth" });
    const registry = createOAuthProviderRegistry({ guard });
    assert.throws(() => registry.register({ descriptor: invalid }), {
      code: "OAUTH_UNSAFE_ENDPOINT", message: `${label}: provider endpoint resolves to an internal address, which is not allowed`,
    });
    assert.throws(() => registry.get({ providerId: invalid.providerId }), { code: "OAUTH_INVALID_REQUEST" });
  });
}

test("operator descriptors derive both grants from endpoints, preserve overrides and force PKCE", () => {
  assert.deepEqual(buildOperatorOAuthProvider({
    guard, providerId: "b05-operator", label: "Operator provider", tokenEndpoint: "https://auth.example.com/token",
  }, {
    authorizationEndpoint: "https://auth.example.com/authorize", deviceAuthorizationEndpoint: "https://auth.example.com/device",
    scopes: ["write", "offline_access"], clientAuth: "client_secret_post",
  }), {
    providerId: "b05-operator", label: "Operator provider", tokenEndpoint: "https://auth.example.com/token",
    authorizationEndpoint: "https://auth.example.com/authorize", deviceAuthorizationEndpoint: "https://auth.example.com/device",
    supportedGrants: ["authorization_code", "device_code"], defaultScopes: ["write", "offline_access"],
    usesPkce: true, clientAuth: "client_secret_post",
  });
});

for (const [field, grant] of [["authorizationEndpoint", "authorization_code"], ["deviceAuthorizationEndpoint", "device_code"]] as const) {
  test(`a single operator endpoint enables only ${grant} and defaults scopes and client auth`, () => {
    assert.deepEqual(buildOperatorOAuthProvider({ guard, providerId: "b05-single", label: "Single grant",
      tokenEndpoint: "https://auth.example.com/token" }, { [field]: "https://auth.example.com/flow" }), {
      providerId: "b05-single", label: "Single grant", tokenEndpoint: "https://auth.example.com/token",
      [field]: "https://auth.example.com/flow", supportedGrants: [grant], defaultScopes: [], usesPkce: true, clientAuth: "none",
    });
  });
}

test("operator configuration with no flow endpoints is refused instead of inventing a grant", () => {
  assert.throws(() => buildOperatorOAuthProvider({ guard, providerId: "b05-no-flow", label: "No flow", tokenEndpoint: "https://auth.example.com/token" }), {
    code: "OAUTH_INVALID_REQUEST", message: "provider 'b05-no-flow' declares no supported grants",
  });
});

// F1.6/F7.5: all registry mutations belong to this test; read back by id and check replacement order.
test("registry starts empty, explicitly registers an example, replaces by id and refuses an invalid replacement", () => {
  // REGRESSION: fails if the registry factory shares its provider map across instances.
  const registry = createOAuthProviderRegistry({ guard });
  assert.deepEqual(registry.list({}), []);
  const example: OAuthProviderDescriptor = {
    providerId: "example-oidc", label: "Example OIDC-shaped provider", supportedGrants: ["authorization_code", "device_code"],
    authorizationEndpoint: "https://oauth.example.com/authorize", tokenEndpoint: "https://oauth.example.com/oauth/token",
    deviceAuthorizationEndpoint: "https://oauth.example.com/oauth/device/code", defaultScopes: [], usesPkce: true, clientAuth: "none",
  };
  registry.register({ descriptor: example });
  assert.deepEqual(registry.get({ providerId: "example-oidc" }), example);
  const first = descriptor({ providerId: "b05-registry-a" });
  const second = descriptor({ providerId: "b05-registry-b", label: "Second" });
  registry.register({ descriptor: first });
  registry.register({ descriptor: second });
  const replacement = descriptor({ providerId: "b05-registry-a", tokenEndpoint: "https://new.example.com/token", label: "Moved" });
  registry.register({ descriptor: replacement });
  assert.deepEqual(registry.get({ providerId: "b05-registry-a" }), replacement);
  assert.deepEqual(registry.list({}).filter((item) => item.providerId.startsWith("b05-registry-")), [replacement, second]);
  assert.throws(() => registry.register({ descriptor: { ...replacement, supportedGrants: [] } }), { code: "OAUTH_INVALID_REQUEST" });
  assert.deepEqual(registry.get({ providerId: "b05-registry-a" }), replacement);
  const snapshot = [...registry.list({})];
  snapshot.length = 0;
  assert.deepEqual(createOAuthProviderRegistry({ guard }).list({}), []);
  assert.deepEqual(registry.get({ providerId: "b05-registry-b" }), second);
  assert.throws(() => registry.get({ providerId: "b05-unregistered" }), {
    code: "OAUTH_INVALID_REQUEST", message: "no OAuth provider is registered as 'b05-unregistered'",
    operatorAction: "Pick a provider from the list, or define this one's endpoints on the connection.",
  });
});
