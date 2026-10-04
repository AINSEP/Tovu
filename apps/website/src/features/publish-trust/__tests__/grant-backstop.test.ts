import assert from "node:assert/strict";
import test from "node:test";
import { backstopGrantAllows, DEFAULT_PUBLISHING_CAPABILITIES, parsePublishTrustGrant } from "../grant.js";
import { connectDestination } from "../connect.js";

test("backstop requires a separate capability AND an explicit raw entity type", () => {
  for (const entityType of ["raw-row", "raw-file"]) {
    assert.equal(backstopGrantAllows({ grant: null, entityType }), false);
    assert.equal(backstopGrantAllows({ grant: { capabilities: ["publish_content.apply"], entityTypes: [entityType] }, entityType }), false);
    assert.equal(backstopGrantAllows({ grant: { capabilities: ["publish_content.backstop"], entityTypes: [] }, entityType }), false);
    assert.equal(backstopGrantAllows({ grant: { capabilities: ["publish_content.apply", "publish_content.backstop"], entityTypes: [entityType] }, entityType }), true);
  }
  const parsed = parsePublishTrustGrant({ version: 1, sourceInstallationId: "src", workspaceId: "ws",
    publicKeys: [{ publicKeyB64u: "AAAA", generation: 1 }], entityTypes: ["raw-row"],
    capabilities: ["publish_content.apply", "publish_content.backstop"], notAfter: "2099-01-01T00:00:00.000Z" });
  assert.equal(parsed.ok, true);
  assert.deepEqual(DEFAULT_PUBLISHING_CAPABILITIES, ["publish_content.read", "publish_content.apply"]);
});

test("connecting never grants backstop, even when callers include raw types", async () => {
  let written: unknown;
  await connectDestination({
    workspaceId: "source-ws", clock: { nowMs: () => Date.parse("2026-10-04T00:00:00.000Z") },
    keyring: { derive: async () => new Uint8Array(32).fill(7) } as never,
    httpClient: { send: async () => ({ status: 200, headers: {}, bodyText: JSON.stringify({
      installationId: "dest", workspaceId: "dest-ws", origin: "https://dest.example",
    }) }) },
    provisioning: { connect: async ({ grant }: { grant: unknown }) => { written = grant; return {
      ok: true, changed: true, target: { kind: "file", path: "deploy/publish-trust.json", nextStep: "Redeploy." },
    }; } } as never,
  }, { baseUrl: "https://dest.example", entityTypes: ["post", "raw-row", "raw-file"] });
  assert.deepEqual((written as { entityTypes: string[] }).entityTypes, ["post"]);
  assert.deepEqual((written as { capabilities: string[] }).capabilities, ["publish_content.read", "publish_content.apply"]);
});
