import assert from "node:assert/strict";
import test from "node:test";

import type { CredentialSetSummary } from "@jini-ai/core/contracts/credentials";
import type { DeployTargetRegistry } from "../../contracts.js";
import { bindPublishCompatibility, type PublishCompatibilitySource } from "../compatibility-port.js";

/**
 * @file The binding `custom-credentials` gets for "a saved credential changed". It moved the invalidation lines out of
 * `custom-credentials`, so these pin what the move must not change: nothing is read at bind time, a missing ingredient is
 * a no-op, and a rejected registry load reaches the caller.
 */

const EMPTY: DeployTargetRegistry = { list: () => [], get: () => undefined, refusals: [] };
const AFTER: CredentialSetSummary = {
  credentialType: "custom", id: "row-1", label: "key", category: "hosting", baseUrl: "https://api.example.test", additionalHosts: [],
  worksFor: [], username: "user", configured: true, createdAt: "2026-11-09T00:00:00Z", updatedAt: "2026-11-09T00:00:00Z", tokenHint: { length: 30, last4: "HINT" },
};

test("binding reads nothing from the source; prepareInvalidation reads it when the save starts", async () => {
  const reads: string[] = [];
  const source: PublishCompatibilitySource = {
    get loadDeployTargets() { reads.push("loadDeployTargets"); return async () => EMPTY; },
    get publishCredentialVerificationCache() { reads.push("cache"); return { delete: () => undefined }; },
  };
  const port = bindPublishCompatibility({ source });
  assert.deepEqual(reads, [], "the roots bind before the source exists");
  await port.prepareInvalidation({ workspaceId: "ws-1" });
  assert.deepEqual([...new Set(reads)].sort(), ["cache", "loadDeployTargets"]);
});

test("without a cache there is no registry load and the returned function does nothing", async () => {
  let loads = 0;
  const port = bindPublishCompatibility({ source: { loadDeployTargets: async () => { loads += 1; return EMPTY; } } });
  const invalidate = await port.prepareInvalidation({ workspaceId: "ws-1" });
  invalidate({ after: AFTER });
  assert.equal(loads, 0);
});

test("a rejected registry load propagates from prepareInvalidation", async () => {
  const failure = new Error("registry unavailable");
  const port = bindPublishCompatibility({ source: { loadDeployTargets: async () => { throw failure; }, publishCredentialVerificationCache: { delete: () => undefined } } });
  await assert.rejects(port.prepareInvalidation({ workspaceId: "ws-1" }), failure);
});
