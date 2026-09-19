import assert from "node:assert/strict";
import test from "node:test";

import type { PublishTrustGrant } from "../grant.js";
import { PUBLISH_TRUST_GRANT_VERSION } from "../grant.js";
import type { ProvisioningFileIo } from "../provisioning.js";
import { resolvePublishTrust } from "../provisioning.js";
import type { PublishTrustRevocation } from "../revocations.js";
import {
  admitPublish,
  createFileRevocations,
  isRevoked,
  MAX_REVOCATIONS,
  parseRevocationDocument,
} from "../revocations.js";

/**
 * @file Proofs that disconnecting a computer works without a deploy, and cannot be undone by one.
 *
 * The property the whole file exists for: **committed config can only grant, this store can only
 * deny, and deny wins.** Everything else follows — a disconnect takes effect on the next request, a
 * rollback to an older commit cannot resurrect a disconnected computer, and neither action needs a
 * provider console.
 *
 * The second property, and the one that is easy to get backwards: a revocation list that cannot be
 * READ must refuse everybody. `provisioning.ts` fails closed by admitting nobody when the GRANT
 * document is broken; this file has to fail closed in the opposite direction, by treating everybody
 * as disconnected when the DENY document is broken.
 */

const NOW = "2026-09-19T12:00:00.000Z";

function grantFor(sourceInstallationId: string, overrides: Partial<PublishTrustGrant> = {}): PublishTrustGrant {
  return {
    version: PUBLISH_TRUST_GRANT_VERSION,
    sourceInstallationId,
    publicKeys: [{ publicKeyB64u: `pk-${sourceInstallationId}`, generation: 0 }],
    workspaceId: "ws-1",
    entityTypes: ["post"],
    capabilities: ["publish_content.read", "publish_content.apply"],
    notAfter: "2027-09-19T12:00:00.000Z",
    ...overrides,
  };
}

function memoryIo(seed: Record<string, string> = {}): ProvisioningFileIo & { files: Record<string, string> } {
  const files = { ...seed };
  return {
    files,
    read: async (path) => (path in files ? files[path] : null),
    write: async (path, contents) => {
      files[path] = contents;
    },
  };
}

function siteCarrying(...grants: readonly PublishTrustGrant[]) {
  return resolvePublishTrust({ envValue: undefined, fileContents: JSON.stringify(grants) });
}

function ask(input: {
  grants: readonly PublishTrustGrant[];
  revocations: readonly PublishTrustRevocation[] | null;
  sourceInstallationId?: string;
  publicKeyB64u?: string;
}) {
  return admitPublish({
    resolution: siteCarrying(...input.grants),
    revocations: input.revocations,
    sourceInstallationId: input.sourceInstallationId ?? "laptop",
    publicKeyB64u: input.publicKeyB64u ?? "pk-laptop",
    siteLabel: "tovu.com",
    nowIso: NOW,
  });
}

const REVOKED_LAPTOP: PublishTrustRevocation = {
  sourceInstallationId: "laptop",
  revokedAt: NOW,
  note: "sold it",
};

// ---------------------------------------------------------------------------
// Deny wins, and a deploy cannot undo it
// ---------------------------------------------------------------------------

test("a connected computer publishes", () => {
  const admission = ask({ grants: [grantFor("laptop")], revocations: [] });
  assert.equal(admission.allowed, true);
  assert.equal(admission.allowed && admission.grant.sourceInstallationId, "laptop");
});

test("a disconnected computer is refused even though committed config still grants it", () => {
  // This is the whole point: the grant is unchanged and still in the repo, and the answer is no.
  const admission = ask({ grants: [grantFor("laptop")], revocations: [REVOKED_LAPTOP] });
  assert.equal(admission.allowed, false);
  assert.equal(admission.allowed === false && admission.refusal, "disconnected");
});

test("redeploying the same committed config does not reconnect a disconnected computer", () => {
  // A deploy replaces the image, which is where grants live. Denials live on the volume, so the
  // redeploy -- and equally a ROLLBACK to an older commit -- changes nothing here.
  const beforeDeploy = ask({ grants: [grantFor("laptop")], revocations: [REVOKED_LAPTOP] });
  const afterRollbackToOlderCommit = ask({
    grants: [grantFor("laptop", { notAfter: "2030-01-01T00:00:00.000Z" })],
    revocations: [REVOKED_LAPTOP],
  });

  assert.equal(beforeDeploy.allowed, false);
  assert.equal(afterRollbackToOlderCommit.allowed, false);
});

test("disconnecting one computer leaves the others publishing", () => {
  const grants = [grantFor("laptop"), grantFor("desktop")];
  assert.equal(ask({ grants, revocations: [REVOKED_LAPTOP] }).allowed, false);
  assert.equal(
    ask({ grants, revocations: [REVOKED_LAPTOP], sourceInstallationId: "desktop", publicKeyB64u: "pk-desktop" }).allowed,
    true
  );
});

test("a disconnect outranks a broken grant document rather than depending on it", () => {
  const admission = admitPublish({
    resolution: resolvePublishTrust({ envValue: undefined, fileContents: "{ not json" }),
    revocations: [REVOKED_LAPTOP],
    sourceInstallationId: "laptop",
    publicKeyB64u: "pk-laptop",
    siteLabel: "tovu.com",
    nowIso: NOW,
  });
  assert.equal(admission.allowed === false && admission.refusal, "disconnected");
});

// ---------------------------------------------------------------------------
// Fail-closed in the deny direction
// ---------------------------------------------------------------------------

test("an unreadable revocation list refuses everybody", () => {
  const admission = ask({ grants: [grantFor("laptop")], revocations: null });
  assert.equal(admission.allowed, false);
  assert.equal(admission.allowed === false && admission.refusal, "revocations-unreadable");
});

test("a corrupt revocation file reads as unreadable, not as empty", async () => {
  const io = memoryIo({ "/state/publish-trust-disconnected.json": "{ not json" });
  const port = createFileRevocations({ io, path: "/state/publish-trust-disconnected.json" });
  const read = await port.list();

  assert.equal(read.ok, false, "an empty read here would silently reconnect every disconnected computer");
});

test("a revocation list that is not an array is refused", () => {
  assert.equal(parseRevocationDocument('{"sourceInstallationId":"laptop"}').ok, false);
});

test("a missing revocation file is an empty list, which is the honest reading", async () => {
  const io = memoryIo();
  const port = createFileRevocations({ io, path: "/state/publish-trust-disconnected.json" });
  const read = await port.list();

  assert.equal(read.ok, true);
  assert.deepEqual(read.ok ? read.revocations : null, [], "nothing has been disconnected yet");
});

// ---------------------------------------------------------------------------
// The refusals a person actually reads
// ---------------------------------------------------------------------------

test("no refusal ever shows key vocabulary or an error code", () => {
  const admissions = [
    ask({ grants: [], revocations: [] }),
    ask({ grants: [grantFor("desktop")], revocations: [] }),
    ask({ grants: [grantFor("laptop")], revocations: [REVOKED_LAPTOP] }),
    ask({ grants: [grantFor("laptop", { notAfter: "2026-01-01T00:00:00.000Z" })], revocations: [] }),
    ask({ grants: [grantFor("laptop")], revocations: [], publicKeyB64u: "pk-rotated" }),
    ask({ grants: [grantFor("laptop")], revocations: null }),
  ];

  for (const admission of admissions) {
    assert.equal(admission.allowed, false);
    const message = admission.allowed === false ? admission.message : "";
    assert.doesNotMatch(message, /public key|generation|installation|principal|credential|token id/i, message);
    assert.doesNotMatch(message, /[A-Z_]{6,}/, message);
    assert.match(message, /tovu\.com/, "every refusal names the site the person was publishing to");
  }
});

test("the never-connected refusal says what to do, in ordinary words", () => {
  const admission = ask({ grants: [grantFor("desktop")], revocations: [] });
  assert.equal(admission.allowed === false && admission.refusal, "not-connected");
  assert.match(admission.allowed === false ? admission.message : "", /doesn't recognise this computer yet/);
  assert.match(admission.allowed === false ? admission.message : "", /nothing to copy and no key to keep/);
});

test("a rotated Site Token is explained as a rotation, not as a mystery", () => {
  const admission = ask({ grants: [grantFor("laptop")], revocations: [], publicKeyB64u: "pk-after-regenerate" });
  assert.equal(admission.allowed === false && admission.refusal, "superseded-key");
  assert.match(admission.allowed === false ? admission.message : "", /Site Token is regenerated/);
});

// ---------------------------------------------------------------------------
// The port
// ---------------------------------------------------------------------------

test("disconnecting takes effect on the next read, with no deploy in between", async () => {
  const io = memoryIo();
  const port = createFileRevocations({ io, path: "/state/publish-trust-disconnected.json" });
  const grants = [grantFor("laptop")];

  const before = await port.list();
  assert.equal(ask({ grants, revocations: before.ok ? before.revocations : null }).allowed, true);

  await port.revoke({ sourceInstallationId: "laptop", nowIso: NOW, note: "stolen" });

  const after = await port.list();
  assert.equal(ask({ grants, revocations: after.ok ? after.revocations : null }).allowed, false);
});

test("reconnecting is an explicit act that restores publishing", async () => {
  const io = memoryIo();
  const port = createFileRevocations({ io, path: "/state/publish-trust-disconnected.json" });
  await port.revoke({ sourceInstallationId: "laptop", nowIso: NOW });

  const restored = await port.restore({ sourceInstallationId: "laptop" });
  assert.equal(restored.ok && restored.changed, true);
  assert.equal(ask({ grants: [grantFor("laptop")], revocations: restored.ok ? restored.revocations : null }).allowed, true);
});

test("disconnecting the same computer twice is a no-op, and keeps the first timestamp", async () => {
  const io = memoryIo();
  const port = createFileRevocations({ io, path: "/state/publish-trust-disconnected.json" });
  await port.revoke({ sourceInstallationId: "laptop", nowIso: NOW, note: "first" });
  const again = await port.revoke({ sourceInstallationId: "laptop", nowIso: "2026-12-25T00:00:00.000Z", note: "second" });

  assert.equal(again.ok && again.changed, false);
  assert.equal(again.ok ? again.revocations[0].revokedAt : "", NOW);
  assert.equal(again.ok ? again.revocations[0].note : "", "first");
});

test("reconnecting a computer that was never disconnected is a no-op, not an error", async () => {
  const io = memoryIo();
  const port = createFileRevocations({ io, path: "/state/publish-trust-disconnected.json" });
  const restored = await port.restore({ sourceInstallationId: "never-seen" });

  assert.equal(restored.ok && restored.changed, false);
});

test("a corrupt revocation file is never overwritten by a disconnect", async () => {
  const io = memoryIo({ "/state/publish-trust-disconnected.json": "{ not json" });
  const port = createFileRevocations({ io, path: "/state/publish-trust-disconnected.json" });

  const written = await port.revoke({ sourceInstallationId: "laptop", nowIso: NOW });
  assert.equal(written.ok, false);
  assert.equal(io.files["/state/publish-trust-disconnected.json"], "{ not json");
});

test("the revocation list is bounded", async () => {
  const full = Array.from({ length: MAX_REVOCATIONS }, (_, i) => ({
    sourceInstallationId: `m${i}`,
    revokedAt: NOW,
    note: null,
  }));
  const io = memoryIo({ "/state/publish-trust-disconnected.json": JSON.stringify(full) });
  const port = createFileRevocations({ io, path: "/state/publish-trust-disconnected.json" });

  const overflow = await port.revoke({ sourceInstallationId: "one-too-many", nowIso: NOW });
  assert.equal(overflow.ok, false);
});

test("a stored disconnect survives a reread through the file, notes and all", async () => {
  const io = memoryIo();
  const port = createFileRevocations({ io, path: "/state/publish-trust-disconnected.json" });
  await port.revoke({ sourceInstallationId: "laptop", nowIso: NOW, note: "left it on a train" });

  const reread = createFileRevocations({ io, path: "/state/publish-trust-disconnected.json" });
  const read = await reread.list();
  assert.deepEqual(read.ok ? read.revocations : null, [
    { sourceInstallationId: "laptop", revokedAt: NOW, note: "left it on a train" },
  ]);
  assert.equal(isRevoked(read.ok ? read.revocations : [], "laptop"), true);
});

test("the port names where its state lives, because that path must be the persistent volume", () => {
  const port = createFileRevocations({ io: memoryIo(), path: "/workspace/Tovu/sites/publish-trust-disconnected.json" });
  assert.equal(port.path, "/workspace/Tovu/sites/publish-trust-disconnected.json");
});
