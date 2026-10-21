import assert from "node:assert/strict";
import { hkdfSync } from "node:crypto";
import test from "node:test";

import { ToolInputError, type ToolExecutionContext } from "@jini-ai/core";
import type { KeyringPort } from "#src/features/webhooks/index";
import type { ProvisioningWrite, PublishTrustProvisioningPort } from "#src/features/publish-trust/provisioning";
import { buildRegistrations, contributePublishContentDisconnectTools, derivedRisk, type Deps } from "../disconnect-tool.js";
import { InMemoryPublishContentPeerRepo, type PublishContentPeerRecord } from "../peers.js";

/** @file `publish_content_disconnect` through its handler with an in-memory peer repo, a recording
 *  provisioning port and a deterministic keyring (no deploy config file is written). */

const WS = "ws-disconnect";
const TARGET = { kind: "test", path: "deploy.json", nextStep: "Deploy this site once more." };

function keyring(): KeyringPort {
  const siteKey = Buffer.alloc(32, 7);
  return {
    async activeKey() { return { keyId: "v1" }; },
    async derive(input: { workspaceId: string; purpose: string; info: string }) {
      return new Uint8Array(hkdfSync("sha256", siteKey, Buffer.alloc(0), `${input.purpose}:${input.workspaceId}:${input.info}`, 32));
    },
  } as unknown as KeyringPort;
}

function provisioning(write: ProvisioningWrite): PublishTrustProvisioningPort & { disconnects: number } {
  const port = {
    disconnects: 0,
    target: TARGET,
    readProvisioned: async () => { throw new Error("not used"); },
    connect: async () => { throw new Error("not used"); },
    disconnect: async () => { port.disconnects += 1; return write; },
  };
  return port as unknown as PublishTrustProvisioningPort & { disconnects: number };
}

function row(): PublishContentPeerRecord {
  return { workspaceId: WS, id: "peer-1", label: "live.example", baseUrl: "https://live.example", remoteWorkspaceId: "remote", sealed: null, masked: null, aadVersion: 1, createdAt: "2026-10-01T00:00:00.000Z", updatedAt: "2026-10-01T00:00:00.000Z" };
}

function deps(over: Partial<Deps>): Deps {
  return {
    workspaceId: WS,
    authorize: async () => ({ allowed: true, reason: "matched" }),
    clock: { nowMs: () => Date.parse("2026-10-01T00:00:00.000Z") },
    idGen: { newId: () => "peer-restored" },
    publishContentPeerRepo: new InMemoryPublishContentPeerRepo(),
    siteAssistantSecretKeyring: keyring(),
    ...over,
  } as Deps;
}

function call(d: Deps) {
  const [registration] = buildRegistrations(d);
  const ctx = { executionId: "e1", principal: { id: "operator" }, run: { id: "r1" }, input: {}, signal: new AbortController().signal } as ToolExecutionContext;
  return registration!.handler(ctx);
}

test("disconnecting a connected destination forgets it and names the deploy still needed", async () => {
  const repo = new InMemoryPublishContentPeerRepo();
  await repo.insert(row());
  const port = provisioning({ ok: true, grants: [], changed: true, target: TARGET });
  const result = await call(deps({ publishContentPeerRepo: repo, publishTrustProvisioning: port, findPublishCandidate: async () => "https://unused.example" }));
  assert.deepEqual(result, { connected: false, site: null, candidateUrl: "https://live.example", message: "This computer no longer publishes to live.example.", nextStep: TARGET.nextStep });
  assert.equal(port.disconnects, 1);
  assert.deepEqual(await repo.listByWorkspace({ workspaceId: WS }), []);
});

test("disconnecting when not connected and nothing changed suggests the candidate URL and no next step", async () => {
  const port = provisioning({ ok: true, grants: [], changed: false, target: TARGET });
  const result = await call(deps({ publishTrustProvisioning: port, findPublishCandidate: async () => "https://candidate.example" }));
  assert.deepEqual(result, { connected: false, site: null, candidateUrl: "https://candidate.example", message: "This computer was not publishing anywhere.", nextStep: null });
});

test("a settings write failure is refused with recovery guidance, and the connected peer is put back", async () => {
  const repo = new InMemoryPublishContentPeerRepo();
  await repo.insert(row());
  const port = provisioning({ ok: false, reason: "read-only file system" });
  await assert.rejects(call(deps({ publishContentPeerRepo: repo, publishTrustProvisioning: port })), (error: unknown) =>
    error instanceof ToolInputError && error.message === "Publishing settings could not be saved. Check that this project's files can be written, then disconnect again.");
  assert.deepEqual((await repo.listByWorkspace({ workspaceId: WS })).map((r) => r.baseUrl), ["https://live.example"]);
});

test("any other failure propagates unchanged", async () => {
  const outage = new Error("peer store unavailable");
  const repo = new InMemoryPublishContentPeerRepo();
  repo.listByWorkspace = async () => { throw outage; };
  await assert.rejects(call(deps({ publishContentPeerRepo: repo, publishTrustProvisioning: provisioning({ ok: true, grants: [], changed: true, target: TARGET }) })), (error: unknown) => error === outage);
});

test("the contributor installs this module's builder and risk under its own domain", () => {
  const contributor = contributePublishContentDisconnectTools();
  assert.equal(contributor.domain, "publish-content-disconnect");
  assert.equal(contributor.build, buildRegistrations);
  assert.equal(contributor.risk, derivedRisk);
});
