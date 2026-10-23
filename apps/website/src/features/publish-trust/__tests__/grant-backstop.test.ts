import "../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import test from "node:test";
import { backstopGrantAllows, DEFAULT_PUBLISHING_CAPABILITIES, parsePublishTrustGrant } from "../grant.js";
import { connectDestination, disconnectDestination, findCandidateDestination, type ConnectDeps } from "../connect.js";
import { COMMITTED_JSON_CODEC, createFileProvisioning, type ProvisioningFileIo } from "../provisioning.js";

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

function connectionFixture() {
  const files = new Map<string, string>();
  const io: ProvisioningFileIo = {
    read: async (file) => files.get(file) ?? null,
    write: async (file, contents) => { files.set(file, contents); },
  };
  const configPath = "/fixture/deploy/publish-trust.json";
  const provisioning = createFileProvisioning({ io, codec: COMMITTED_JSON_CODEC, path: configPath });
  const deps: ConnectDeps = {
    workspaceId: "source-ws",
    clock: { nowMs: () => Date.parse("2026-10-04T00:00:00.000Z") },
    keyring: {
      activeKey: async () => ({ keyId: "v1" }),
      deriveSigningSecret: async () => { throw new Error("Webhook signing is not used when connecting a destination"); },
      derive: async () => new Uint8Array(32).fill(7),
    },
    httpClient: { send: async ({ method, url }) => {
      assert.equal(method, "GET");
      assert.equal(url, "https://dest.example/api/publish-trust/v1/identity");
      return { status: 200, headers: {}, bodyText: JSON.stringify({ installationId: "dest", workspaceId: "dest-ws", origin: "https://dest.example" }) };
    } },
    provisioning,
  };
  return { deps, io, files, configPath, input: { baseUrl: "https://dest.example", entityTypes: ["post"] } };
}

test("candidate discovery skips an existing config without a public URL", async () => {
  const { io, files } = connectionFixture();
  files.set("/fixture/example-one.toml", 'app = "demo"');
  files.set("/fixture/example-two.yaml", "TOVU_PUBLIC_URL: https://destination.example\n");
  assert.equal(await findCandidateDestination({ io, resolvePath: (file) => `/fixture/${file}` }, { candidatePaths: ["example-one.toml", "example-two.yaml"] }), "https://destination.example");
});

test("reconnecting an unchanged grant says that nothing needs deploying", async () => {
  const { deps, input } = connectionFixture();
  const first = await connectDestination(deps, input);
  assert.equal(first.changed, true);
  assert.equal(first.nextStep, "Commit deploy/publish-trust.json and deploy. It holds public keys only — there is nothing secret in it.");
  const again = await connectDestination(deps, input);
  assert.deepEqual(again, {
    identity: { installationId: "dest", workspaceId: "dest-ws", origin: "https://dest.example" },
    baseUrl: "https://dest.example", changed: false,
    target: { kind: "committed-json", path: "/fixture/deploy/publish-trust.json", nextStep: first.nextStep },
    nextStep: "This computer was already connected to that site. Nothing to change.",
  });
  const provisioned = await deps.provisioning.readProvisioned();
  assert.ok(provisioned.ok);
  assert.equal(provisioned.grants.length, 1);
  assert.equal(provisioned.grants[0]!.workspaceId, "dest-ws");
});

for (const action of ["connect", "disconnect"] as const) {
  test(`${action} reports a provisioning refusal and leaves the document intact`, async () => {
    const { deps, files, configPath, input } = connectionFixture();
    files.set(configPath, "null");
    await assert.rejects(
      () => action === "connect" ? connectDestination(deps, input) : disconnectDestination(deps),
      { name: "PublishTrustConnectError", message: "This site's publishing settings could not be saved: grant must be a JSON object" },
    );
    assert.equal(files.get(configPath), "null");
  });
}

test("disconnecting clears the stored grant and a second disconnect is unchanged", async () => {
  const { deps, input } = connectionFixture();
  await connectDestination(deps, input);
  const removed = await disconnectDestination(deps);
  assert.deepEqual(removed, { changed: true, target: deps.provisioning.target });
  assert.deepEqual(await deps.provisioning.readProvisioned(), { ok: true, grants: [] });
  assert.deepEqual(await disconnectDestination(deps), { changed: false, target: deps.provisioning.target });
});
