import assert from "node:assert/strict";
import test from "node:test";

import * as surface from "../index.js";
import { InMemoryVendorCredentialSetRepo } from "../repo.memory.js";


test("vendor-credentials exposes the owning repo", () => {
  const expected = { InMemoryVendorCredentialSetRepo };
  assert.deepEqual(Object.keys(surface).sort(), Object.keys(expected).sort());
  for (const [name, binding] of Object.entries(expected)) {
    assert.notEqual(binding, undefined, name);
    assert.equal(surface[name as keyof typeof surface], binding, name);
  }
  assert.equal(surface.InMemoryVendorCredentialSetRepo, InMemoryVendorCredentialSetRepo);
});
