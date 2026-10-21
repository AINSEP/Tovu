import assert from "node:assert/strict";
import test from "node:test";

import * as surface from "../index.js";
import { InMemoryVendorCredentialSetRepo } from "../../deployments/publish-credentials/repo.memory.js";

/** The feature's public surface: exactly the in-memory repo at runtime (everything else is types). */
test("vendor-credentials exposes the publish-credentials in-memory repo as its only runtime export", () => {
  assert.deepEqual(Object.keys(surface), ["InMemoryVendorCredentialSetRepo"]);
  assert.equal(surface.InMemoryVendorCredentialSetRepo, InMemoryVendorCredentialSetRepo);
});
