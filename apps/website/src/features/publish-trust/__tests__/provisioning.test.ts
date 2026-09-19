import assert from "node:assert/strict";
import test from "node:test";

import type { PublishTrustGrant } from "../grant.js";
import { PUBLISH_TRUST_GRANT_VERSION } from "../grant.js";
import { FLY_TOML_CODEC } from "../provisioning.fly-toml.js";
import type { ProvisioningEvent, ProvisioningFileIo } from "../provisioning.js";
import {
  COMMITTED_JSON_CODEC,
  createFileProvisioning,
  describeConnection,
  describePublishTrustState,
  findGrantForSource,
  grantNotAfterFrom,
  MAX_PROVISIONED_GRANTS,
  mergeGrant,
  parseGrantDocument,
  PUBLISH_TRUST_ENV_VAR,
  removeGrant,
  resolvePublishTrust,
  serializeGrantDocument,
} from "../provisioning.js";

/**
 * @file Proofs for how a grant reaches the destination.
 *
 * Three properties carry this feature, and each maps to a question the owner will actually ask:
 *
 * 1. **Connecting a second computer must not disconnect the first.** The document is a list keyed
 *    by `sourceInstallationId`, and provisioning merges into it.
 * 2. **A stale grant must be visible as stale.** Matching is on the PUBLIC KEY, not the generation,
 *    because regenerating the Site Token changes the key while leaving the generation alone.
 * 3. **Revoking publishing and revoking provider access are independent.** Two unrelated inputs can
 *    each switch publishing off on their own, and neither read path touches a provider credential.
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

// ---------------------------------------------------------------------------
// The document is a list, so a second computer adds rather than replaces
// ---------------------------------------------------------------------------

test("a single grant object is accepted, but is re-serialised as a list", () => {
  const parsed = parseGrantDocument(JSON.stringify(grantFor("laptop")));
  assert.equal(parsed.ok, true);
  assert.equal(parsed.ok && parsed.grants.length, 1);

  const written = serializeGrantDocument(parsed.ok ? parsed.grants : [], { pretty: true });
  assert.equal(JSON.parse(written).length, 1, "a one-grant document still writes as an array");
});

test("connecting a second computer keeps the first one connected", async () => {
  const io = memoryIo();
  const port = createFileProvisioning({ io, codec: COMMITTED_JSON_CODEC, path: "/repo/deploy/publish-trust.json" });

  await port.connect({ grant: grantFor("laptop") });
  await port.connect({ grant: grantFor("desktop") });

  const read = await port.readProvisioned();
  assert.equal(read.ok, true);
  assert.deepEqual(
    read.ok ? read.grants.map((g) => g.sourceInstallationId) : [],
    ["laptop", "desktop"],
    "the desktop must be appended, not substituted for the laptop"
  );
});

test("reconnecting the same computer replaces its entry in place", () => {
  const rotated = grantFor("laptop", { publicKeys: [{ publicKeyB64u: "pk-new", generation: 1 }] });
  const merged = mergeGrant([grantFor("laptop"), grantFor("desktop")], rotated);

  assert.equal(merged.ok, true);
  assert.equal(merged.ok && merged.grants.length, 2);
  assert.equal(merged.ok && merged.grants[0].publicKeys[0].publicKeyB64u, "pk-new");
  assert.equal(merged.ok && merged.grants[1].sourceInstallationId, "desktop");
});

test("an unchanged reconnect reports changed:false so there is nothing to commit", async () => {
  const io = memoryIo();
  const port = createFileProvisioning({ io, codec: COMMITTED_JSON_CODEC, path: "/repo/deploy/publish-trust.json" });

  await port.connect({ grant: grantFor("laptop") });
  const again = await port.connect({ grant: grantFor("laptop") });

  assert.equal(again.ok && again.changed, false);
});

test("the grant list is bounded", () => {
  const full = Array.from({ length: MAX_PROVISIONED_GRANTS }, (_, i) => grantFor(`m${i}`));
  const overflow = mergeGrant(full, grantFor("one-too-many"));
  assert.equal(overflow.ok, false);
  assert.match(overflow.ok ? "" : overflow.reason, /disconnect one first/);
});

test("a document repeating one source is refused, not de-duplicated", () => {
  const parsed = parseGrantDocument(JSON.stringify([grantFor("laptop"), grantFor("laptop")]));
  assert.equal(parsed.ok, false);
  assert.match(parsed.ok ? "" : parsed.reason, /repeats source installation laptop/);
});

test("a document whose grant would widen authority is refused whole", () => {
  const hostile = { ...grantFor("laptop"), capabilities: ["content.write"] };
  const parsed = parseGrantDocument(JSON.stringify([grantFor("desktop"), hostile]));
  assert.equal(parsed.ok, false, "one bad element must reject the document, not yield the good half");
});

// ---------------------------------------------------------------------------
// The destination's boot read, and the empty state
// ---------------------------------------------------------------------------

test("an install that has never been published to says so in a sentence", () => {
  const res = resolvePublishTrust({ envValue: undefined, fileContents: null });
  assert.equal(res.state, "absent");
  assert.equal(res.origin, "none");
  assert.deepEqual(res.grants, []);
  assert.match(describePublishTrustState(res), /^No computer is connected to this site for publishing yet\./);
  assert.doesNotMatch(describePublishTrustState(res), /[A-Z_]{6,}/, "the empty state must not surface an error code");
});

test("a malformed grant document disables publishing without pretending to be configured", () => {
  const res = resolvePublishTrust({ envValue: undefined, fileContents: "{ not json" });
  assert.equal(res.state, "invalid");
  assert.deepEqual(res.grants, [], "an unreadable document must never yield a usable grant");
  assert.equal(findGrantForSource(res, "laptop"), null);
});

test("findGrantForSource refuses every state but configured", () => {
  const revoked = resolvePublishTrust({ envValue: "", fileContents: JSON.stringify([grantFor("laptop")]) });
  assert.equal(revoked.state, "revoked");
  assert.equal(findGrantForSource(revoked, "laptop"), null);
});

test("a configured install resolves the right source's grant and only that one", () => {
  const res = resolvePublishTrust({
    envValue: undefined,
    fileContents: JSON.stringify([grantFor("laptop"), grantFor("desktop")]),
  });
  assert.equal(res.state, "configured");
  assert.equal(findGrantForSource(res, "desktop")?.publicKeys[0].publicKeyB64u, "pk-desktop");
  assert.equal(findGrantForSource(res, "phone"), null);
});

// ---------------------------------------------------------------------------
// Revocation: two independent paths, neither needing the other
// ---------------------------------------------------------------------------

test("an operator with only the provider console can switch publishing off", () => {
  const committed = JSON.stringify([grantFor("laptop")]);
  const res = resolvePublishTrust({ envValue: "", fileContents: committed });

  assert.equal(res.state, "revoked", "the env var must override the committed file, or there is no kill switch");
  assert.equal(res.origin, "env");
  assert.match(describePublishTrustState(res), new RegExp(PUBLISH_TRUST_ENV_VAR));
});

test("an operator with only the repository can switch publishing off", () => {
  const res = resolvePublishTrust({ envValue: undefined, fileContents: "[]" });
  assert.equal(res.state, "revoked");
  assert.equal(res.origin, "file");
});

test("an unset env var is not a revocation — only an empty one is", () => {
  const committed = JSON.stringify([grantFor("laptop")]);
  assert.equal(resolvePublishTrust({ envValue: undefined, fileContents: committed }).state, "configured");
  assert.equal(resolvePublishTrust({ envValue: "", fileContents: committed }).state, "revoked");
});

test("disconnecting one computer leaves the others publishing", async () => {
  const io = memoryIo();
  const port = createFileProvisioning({ io, codec: COMMITTED_JSON_CODEC, path: "/repo/deploy/publish-trust.json" });
  await port.connect({ grant: grantFor("laptop") });
  await port.connect({ grant: grantFor("desktop") });

  const removed = await port.disconnect({ sourceInstallationId: "laptop" });
  assert.equal(removed.ok && removed.changed, true);
  assert.deepEqual(removed.ok ? removed.grants.map((g) => g.sourceInstallationId) : [], ["desktop"]);
});

test("disconnecting a computer that was never connected is a no-op, not an error", () => {
  const edit = removeGrant([grantFor("desktop")], "laptop");
  assert.equal(edit.ok && edit.changed, false);
  assert.equal(edit.ok && edit.grants.length, 1);
});

// ---------------------------------------------------------------------------
// Staleness: a rotation the destination has not been redeployed for
// ---------------------------------------------------------------------------

test("a Site Token regeneration is reported as a stale key, not as connected", () => {
  // The generation is unchanged — only the derived key moved. A generation comparison would call
  // this current and leave the owner debugging a refusal the source insisted could not happen.
  const res = resolvePublishTrust({ envValue: undefined, fileContents: JSON.stringify([grantFor("laptop")]) });
  const status = describeConnection({
    resolution: res,
    sourceInstallationId: "laptop",
    publicKeyB64u: "pk-laptop-after-regenerating-the-site-token",
    siteLabel: "tovu.com",
    nowIso: NOW,
  });

  assert.equal(status.verdict, "superseded-key");
  assert.match(status.message, /older key/);
  assert.match(status.message, /deploy/i);
});

test("a rotation overlap window reads as connected for both keys", () => {
  const overlapping = grantFor("laptop", {
    publicKeys: [
      { publicKeyB64u: "pk-old", generation: 0 },
      { publicKeyB64u: "pk-new", generation: 1 },
    ],
  });
  const res = resolvePublishTrust({ envValue: undefined, fileContents: JSON.stringify([overlapping]) });
  const ask = (publicKeyB64u: string) =>
    describeConnection({ resolution: res, sourceInstallationId: "laptop", publicKeyB64u, siteLabel: "tovu.com", nowIso: NOW })
      .verdict;

  assert.equal(ask("pk-old"), "connected");
  assert.equal(ask("pk-new"), "connected");
});

test("a computer the site has never seen is told what to do, in plain words", () => {
  const res = resolvePublishTrust({ envValue: undefined, fileContents: JSON.stringify([grantFor("laptop")]) });
  const status = describeConnection({
    resolution: res,
    sourceInstallationId: "desktop",
    publicKeyB64u: "pk-desktop",
    siteLabel: "tovu.com",
    nowIso: NOW,
  });

  assert.equal(status.verdict, "not-connected");
  assert.match(status.message, /does not recognise this computer yet/);
  assert.doesNotMatch(status.message, /[A-Z_]{6,}/);
});

test("an expired grant is expired, and a soon-to-expire one warns before it bites", () => {
  const ask = (notAfter: string) => {
    const res = resolvePublishTrust({
      envValue: undefined,
      fileContents: JSON.stringify([grantFor("laptop", { notAfter })]),
    });
    return describeConnection({
      resolution: res,
      sourceInstallationId: "laptop",
      publicKeyB64u: "pk-laptop",
      siteLabel: "tovu.com",
      nowIso: NOW,
    });
  };

  assert.equal(ask("2026-09-18T12:00:00.000Z").verdict, "expired");
  assert.equal(ask("2026-10-04T12:00:00.000Z").verdict, "expiring-soon");
  assert.equal(ask("2027-09-19T12:00:00.000Z").verdict, "connected");
});

test("a freshly written grant is dated from now, not from a fixed calendar point", () => {
  const notAfter = grantNotAfterFrom(NOW, { lifetimeDays: 30 });
  assert.equal(notAfter, "2026-10-19T12:00:00.000Z");
});

test("a destination whose config cannot be read tells the source that, not 'not connected'", () => {
  const res = resolvePublishTrust({ envValue: "{ not json", fileContents: null });
  const status = describeConnection({
    resolution: res,
    sourceInstallationId: "laptop",
    publicKeyB64u: "pk-laptop",
    siteLabel: "tovu.com",
    nowIso: NOW,
  });
  assert.equal(status.verdict, "unavailable");
});

// ---------------------------------------------------------------------------
// The Fly adapter is a codec, and edits rather than regenerates
// ---------------------------------------------------------------------------

const FLY_TOML = [
  'app = "tovu"',
  'primary_region = "iad"',
  "",
  "[env]",
  '  TOVU_RUNTIME_MODE = "production"',
  '  TOVU_PUBLIC_URL = "https://tovu.fly.dev"',
  "",
  "[[mounts]]",
  '  source = "tovu_sites"',
  "",
].join("\n");

test("provisioning Fly edits one assignment and leaves the rest of fly.toml byte-identical", async () => {
  const io = memoryIo({ "/repo/fly.toml": FLY_TOML });
  const port = createFileProvisioning({ io, codec: FLY_TOML_CODEC, path: "/repo/fly.toml" });

  await port.connect({ grant: grantFor("laptop") });

  const after = io.files["/repo/fly.toml"];
  for (const line of FLY_TOML.split("\n")) {
    assert.ok(after.includes(line), `provisioning must not disturb: ${line}`);
  }
  assert.match(after, new RegExp(`\\[env\\][\\s\\S]*${PUBLISH_TRUST_ENV_VAR}`), "the key belongs inside [env]");
});

test("the grant survives a fly.toml round trip, quoting and all", async () => {
  const io = memoryIo({ "/repo/fly.toml": FLY_TOML });
  const port = createFileProvisioning({ io, codec: FLY_TOML_CODEC, path: "/repo/fly.toml" });
  const tricky = grantFor("laptop", { entityTypes: ['post"with\\quotes'] });

  await port.connect({ grant: tricky });
  const read = await port.readProvisioned();

  assert.equal(read.ok, true);
  assert.deepEqual(read.ok ? read.grants[0].entityTypes : [], ['post"with\\quotes']);
});

test("a second Fly provisioning replaces the assignment instead of adding a duplicate key", async () => {
  const io = memoryIo({ "/repo/fly.toml": FLY_TOML });
  const port = createFileProvisioning({ io, codec: FLY_TOML_CODEC, path: "/repo/fly.toml" });

  await port.connect({ grant: grantFor("laptop") });
  await port.connect({ grant: grantFor("desktop") });

  const occurrences = io.files["/repo/fly.toml"].split("\n").filter((l) => l.includes(`${PUBLISH_TRUST_ENV_VAR} =`));
  assert.equal(occurrences.length, 1, "a duplicate TOML key makes the file unparseable");
});

test("a same-named key outside [env] is not mistaken for the grant", () => {
  const decoy = [`[build]`, `  ${PUBLISH_TRUST_ENV_VAR} = "not-the-one"`, "", "[env]", ""].join("\n");
  assert.equal(FLY_TOML_CODEC.decode(decoy), null, "only an assignment inside [env] reaches the deployed process");
});

test("a fly.toml with no [env] table gets one rather than being refused", () => {
  const encoded = FLY_TOML_CODEC.encode({ fileContents: 'app = "tovu"\n', document: "[]" });
  assert.equal(encoded.ok, true);
  assert.match(encoded.ok ? encoded.contents : "", /\[env\]/);
  assert.equal(FLY_TOML_CODEC.decode(encoded.ok ? encoded.contents : ""), "[]");
});

test("the Fly codec writes the document on one line", async () => {
  const io = memoryIo({ "/repo/fly.toml": FLY_TOML });
  const port = createFileProvisioning({ io, codec: FLY_TOML_CODEC, path: "/repo/fly.toml" });
  await port.connect({ grant: grantFor("laptop") });

  const line = io.files["/repo/fly.toml"].split("\n").find((l) => l.includes(PUBLISH_TRUST_ENV_VAR));
  assert.ok(line !== undefined && line.trim().endsWith('"'), "a multi-line value would not be valid TOML here");
});

test("both adapters agree on merge semantics", async () => {
  const run = async (codec: typeof COMMITTED_JSON_CODEC, path: string, seed: Record<string, string>) => {
    const io = memoryIo(seed);
    const port = createFileProvisioning({ io, codec, path });
    await port.connect({ grant: grantFor("laptop") });
    await port.connect({ grant: grantFor("desktop") });
    await port.disconnect({ sourceInstallationId: "laptop" });
    const read = await port.readProvisioned();
    return read.ok ? read.grants.map((g) => g.sourceInstallationId) : ["<failed>"];
  };

  assert.deepEqual(await run(COMMITTED_JSON_CODEC, "/repo/deploy/publish-trust.json", {}), ["desktop"]);
  assert.deepEqual(await run(FLY_TOML_CODEC, "/repo/fly.toml", { "/repo/fly.toml": FLY_TOML }), ["desktop"]);
});

// ---------------------------------------------------------------------------
// The port's own behaviour
// ---------------------------------------------------------------------------

test("provisioning refuses to edit a config file it cannot parse", async () => {
  const io = memoryIo({ "/repo/deploy/publish-trust.json": "{ not json" });
  const port = createFileProvisioning({ io, codec: COMMITTED_JSON_CODEC, path: "/repo/deploy/publish-trust.json" });

  const written = await port.connect({ grant: grantFor("laptop") });
  assert.equal(written.ok, false);
  assert.equal(io.files["/repo/deploy/publish-trust.json"], "{ not json", "a refused write must not overwrite");
});

test("the port announces its I/O so the composition root can log it", async () => {
  const events: ProvisioningEvent[] = [];
  const io = memoryIo();
  const port = createFileProvisioning({
    io,
    codec: COMMITTED_JSON_CODEC,
    path: "/repo/deploy/publish-trust.json",
    onEvent: (event) => events.push(event),
  });

  await port.connect({ grant: grantFor("laptop") });
  await port.readProvisioned();

  assert.deepEqual(
    events.map((e) => e.kind),
    ["write", "read"]
  );
});

test("the port names where the grant went and what to do next", () => {
  const io = memoryIo();
  const port = createFileProvisioning({ io, codec: FLY_TOML_CODEC, path: "/repo/fly.toml" });

  assert.equal(port.target.kind, "fly-toml");
  assert.equal(port.target.path, "/repo/fly.toml");
  assert.match(port.target.nextStep, /nothing secret/i);
});

test("an oversized document is refused before it is parsed", () => {
  const parsed = parseGrantDocument(JSON.stringify([grantFor("laptop", { entityTypes: ["x".repeat(400)] })]).padEnd(20_000, " "));
  assert.equal(parsed.ok, false);
  assert.match(parsed.ok ? "" : parsed.reason, /exceeds/);
});
