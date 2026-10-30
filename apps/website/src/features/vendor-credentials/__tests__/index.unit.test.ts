import assert from "node:assert/strict";
import test from "node:test";

import * as surface from "../index.js";
import { InMemoryVendorCredentialSetRepo } from "../repo.memory.js";

import * as vault from "../vault-adapter.js";
import * as scopes from "../project-scope.js";

/** The feature surface includes the repo and scoped vault operations, each its owner's binding. */
test("vendor-credentials exposes the owning repo and scoped vault operations", () => {
  const expected = { InMemoryVendorCredentialSetRepo,
    credentialVault: vault.credentialVault, credentialScope: vault.credentialScope, credentialHint: vault.credentialHint,
    credentialDeletionRepo: scopes.credentialDeletionRepo, credentialCreateTarget: scopes.credentialCreateTarget, credentialScopes: scopes.credentialScopes };
  assert.deepEqual(Object.keys(surface).sort(), Object.keys(expected).sort());
  for (const [name, binding] of Object.entries(expected)) {
    assert.notEqual(binding, undefined, name);
    assert.equal(surface[name as keyof typeof surface], binding, name);
  }
  assert.equal(surface.InMemoryVendorCredentialSetRepo, InMemoryVendorCredentialSetRepo);
});
