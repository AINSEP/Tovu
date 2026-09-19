import assert from "node:assert/strict";
import { hkdfSync, randomUUID } from "node:crypto";
import { once } from "node:events";
import { createServer, type Server } from "node:http";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import test from "node:test";

import { buildExportBundle } from "#src/features/publish-content/export-bundle";
import { resolvePublishDestinationCredential } from "#src/features/publish-content/destination-credential";
import { pushBundleToPeer, confirmPeerImport, executePeerImport } from "#src/features/publish-content/peer-transport";
import { saveConnectedDestination, type PublishContentPeerRecord, type PublishContentPeerRepoPort } from "#src/features/publish-content/peers";
import { listPublishContentContributors } from "#src/features/publish-content/type-registry";
import { connectDestination, disconnectDestination, findCandidateDestination } from "#src/features/publish-trust/connect";
import { PublishTrustHandshakeError } from "#src/features/publish-trust/handshake-client";
import {
  COMMITTED_JSON_CODEC,
  createFileProvisioning,
  PUBLISH_TRUST_ENV_VAR,
  type ProvisioningFileIo,
} from "#src/features/publish-trust/provisioning";
import { nodeProvisioningFileIo } from "#src/features/publish-trust/provisioning.node-io";
import type { HttpClientPort } from "#src/platform/http/index";
import type { KeyringPort } from "#src/features/webhooks/index";
import { createApp, createRouteDeps } from "#src/server/runtime/composition/app";
import { toPublishContentDeps } from "#src/server/inbound/admin-http/routes/publish-content/deps";

/**
 * @file The whole flow a person actually performs, end to end, with no key displayed or copied.
 *
 * `publish-trust-gate.test.ts` proves the destination refuses correctly. This file proves the
 * opposite thing — that a source with NOTHING configured can connect and then publish — because the
 * dominant defect on this feature has been a correct primitive with an unwired call site, and
 * neither half's own tests can catch that.
 *
 * Every step below is the production code path:
 *
 * 1. `findCandidateDestination` reads the address out of a deploy config, as the dialog does.
 * 2. `connectDestination` asks the LIVE destination who it is, derives this install's public key
 *    and writes a real grant document through the real provisioning port.
 * 3. The destination is restarted with that document, which is what a deploy does.
 * 4. `resolvePublishDestinationCredential` runs the real three-call handshake and returns a
 *    credential.
 * 5. `pushBundleToPeer` + `confirmPeerImport` + `executePeerImport` drive the destination's own
 *    gated ceremony over real HTTP with that credential, and content lands.
 *
 * ## What is a double, and what that costs
 *
 * ONE thing: the `HttpClientPort` maps `https://destination.test` onto the loopback port the
 * destination is listening on. It stands in for TLS and DNS and nothing else — every request it
 * forwards is the exact method, path, headers and body the production client would send, and the
 * destination is the real `createApp()`. The source's keyring is a faithful HKDF double with its
 * OWN root key, which is the honest arrangement: two installs have different Site Tokens by design
 * and the destination only ever sees a public key.
 *
 * ## The assertion that matters most
 *
 * No secret is ever handed to a person. There is no step below where a test reads a key, a token or
 * an id out of one side and gives it to the other — every value crosses on the wire, derived. If a
 * future change reintroduces a copy-paste step, this file stops compiling long before it stops
 * passing.
 */

const DESTINATION_ORIGIN = "https://destination.test";
const SOURCE_ROOT_KEY = "7".repeat(64);
const OTHER_COMPUTER_ROOT_KEY = "3".repeat(64);

/** The same HKDF construction `keyring.env.ts` uses — a faithful double, not a friendlier one. */
function testKeyring(rootKeyHex: string): KeyringPort {
  const rootKey = Buffer.from(rootKeyHex, "hex");
  return {
    async activeKey() {
      return { keyId: "v1" };
    },
    async deriveSigningSecret() {
      throw new Error("not used by publish-trust");
    },
    async derive(input: { workspaceId: string; purpose: string; info: string }) {
      return new Uint8Array(
        hkdfSync("sha256", rootKey, Buffer.alloc(0), `${input.purpose}:${input.workspaceId}:${input.info}`, 32)
      );
    },
  } as unknown as KeyringPort;
}

/** TLS and DNS, and nothing else — see this file's header. */
function clientTo(port: () => number): HttpClientPort {
  return {
    async send(request) {
      const url = request.url.replace(DESTINATION_ORIGIN, `http://127.0.0.1:${port()}`);
      const response = await fetch(url, {
        method: request.method,
        headers: request.headers as Record<string, string>,
        ...(request.body === undefined ? {} : { body: request.body }),
      });
      const bodyText = await response.text();
      return {
        status: response.status,
        headers: Object.fromEntries(response.headers.entries()),
        bodyText,
        bodyBytes: new Uint8Array(Buffer.from(bodyText, "utf8")),
      } as Awaited<ReturnType<HttpClientPort["send"]>>;
    },
  };
}

/** The peer table, in memory. The production SQLite adapter satisfies the same port. */
function memoryPeerRepo(): PublishContentPeerRepoPort {
  const rows = new Map<string, PublishContentPeerRecord>();
  return {
    async insert(record) {
      rows.set(record.id, record);
    },
    async update(record) {
      rows.set(record.id, record);
    },
    async findById({ id }) {
      return rows.get(id) ?? null;
    },
    async listByWorkspace({ workspaceId }) {
      return [...rows.values()].filter((row) => row.workspaceId === workspaceId);
    },
    async delete({ id }) {
      rows.delete(id);
    },
  };
}

/** The filesystem, in memory — the same `ProvisioningFileIo` seam the node adapter implements. */
function memoryIo(seed: Record<string, string> = {}): ProvisioningFileIo & { files: Map<string, string> } {
  const files = new Map(Object.entries(seed));
  return {
    files,
    async read(path) {
      return files.get(path) ?? null;
    },
    async write(path, contents) {
      files.set(path, contents);
    },
  };
}

async function listen(app: ReturnType<typeof createApp>): Promise<{ server: Server; port: number }> {
  const server = createServer(app);
  server.listen(0);
  await once(server, "listening");
  return { server, port: (server.address() as AddressInfo).port };
}

async function stop(server: Server): Promise<void> {
  server.close();
  await once(server, "close");
}

/** Everything one run of the flow needs, wired the way the composition root wires it. */
async function scenario() {
  const destinationDeps = createRouteDeps();
  const sourceDeps = createRouteDeps();

  let live = await listen(createApp(destinationDeps));
  const httpClient = clientTo(() => live.port);

  // A REAL file through the REAL node adapter — the temp-file-plus-rename write this feature
  // depends on is production code, so it is exercised rather than stubbed.
  const grantPath = join(await mkdtemp(join(tmpdir(), "publish-trust-")), "publish-trust.json");
  const provisioning = createFileProvisioning({ io: nodeProvisioningFileIo, codec: COMMITTED_JSON_CODEC, path: grantPath });
  const readGrantDocument = async (): Promise<string> => {
    try {
      return await readFile(grantPath, "utf8");
    } catch {
      return "";
    }
  };

  const peerRepo = memoryPeerRepo();
  const clock = { nowIso: () => new Date().toISOString() };
  const idGen = { newId: () => randomUUID() };

  return {
    destinationDeps,
    sourceDeps,
    httpClient,
    provisioning,
    grantPath,
    readGrantDocument,
    peerRepo,
    clock,
    idGen,
    get port() {
      return live.port;
    },
    /** What a deploy does: the process restarts carrying the config that was committed. */
    async redeploy() {
      await stop(live.server);
      process.env[PUBLISH_TRUST_ENV_VAR] = await readGrantDocument();
      live = await listen(createApp(destinationDeps));
    },
    async teardown() {
      delete process.env[PUBLISH_TRUST_ENV_VAR];
      await stop(live.server);
    },
  };
}

/** Steps 1-3: confirm the site, connect, deploy. */
async function connectAndDeploy(s: Awaited<ReturnType<typeof scenario>>, rootKeyHex = SOURCE_ROOT_KEY) {
  const keyring = testKeyring(rootKeyHex);
  const connected = await connectDestination(
    { httpClient: s.httpClient, keyring, provisioning: s.provisioning, clock: s.clock, workspaceId: s.sourceDeps.workspaceId },
    { baseUrl: DESTINATION_ORIGIN, entityTypes: listPublishContentContributors().map((c) => c.entityType) }
  );
  const site = await saveConnectedDestination(
    { repo: s.peerRepo, clock: s.clock, idGen: s.idGen },
    {
      workspaceId: s.sourceDeps.workspaceId,
      label: "destination.test",
      baseUrl: connected.baseUrl,
      remoteWorkspaceId: connected.identity.workspaceId,
    }
  );
  await s.redeploy();
  return { connected, site, keyring };
}

test("the address to confirm comes from the deploy config the repo already carries", async () => {
  const io = memoryIo({
    "fly.toml": ['app = "tovu"', "[env]", '  TOVU_PUBLIC_URL = "https://tovu.example"'].join("\n"),
  });
  assert.equal(await findCandidateDestination({ io, resolvePath: (r) => r }), "https://tovu.example");

  // A fresh install that has never been deployed simply has none. An empty state, not an error.
  assert.equal(await findCandidateDestination({ io: memoryIo(), resolvePath: (r) => r }), null);
});

test("connecting learns the destination's workspace instead of asking a human for it", async () => {
  const s = await scenario();
  try {
    const { connected, site } = await connectAndDeploy(s);

    // The one value the old flow made a person find and retype.
    assert.equal(connected.identity.workspaceId, s.destinationDeps.workspaceId);
    assert.equal(site.remoteWorkspaceId, s.destinationDeps.workspaceId);
    assert.equal(site.hasCredential, false, "a connected destination stores no credential at all");
    assert.equal(site.masked, null);

    // What was written is a public document. Nothing in it can authenticate as this install.
    const written = await s.readGrantDocument();
    assert.match(written, /"publicKeys"/);
    assert.ok(!written.includes(SOURCE_ROOT_KEY), "the Site Token must never reach committed config");
    assert.ok(!/privateKey|secret|apiKey/i.test(written), written);
  } finally {
    await s.teardown();
  }
});

test("a fresh install connects and then publishes, with no key displayed or copied", async () => {
  const s = await scenario();
  try {
    const { site } = await connectAndDeploy(s);

    // THE step every previous agent stopped short of: the publish path resolving a credential for a
    // destination that has no stored key, by proving possession of the Site Token on the wire.
    const credential = await resolvePublishDestinationCredential(
      { repo: s.peerRepo, sealer: s.sourceDeps.siteAssistantSecretSealer, keyring: testKeyring(SOURCE_ROOT_KEY), httpClient: s.httpClient },
      { workspaceId: s.sourceDeps.workspaceId, id: site.id }
    );
    assert.ok(credential.apiKey.length > 0);
    assert.equal(credential.remoteWorkspaceId, s.destinationDeps.workspaceId);

    // Both installs boot from the same seed, so without this the plan is correctly "everything is
    // already identical" and nothing would be written — a green run that would prove no transfer.
    // A post that exists only HERE is the case that must land.
    const [seed] = await s.sourceDeps.postRepo.list({ workspaceId: s.sourceDeps.workspaceId });
    assert.ok(seed, "the source must have a post to copy");
    const now = new Date().toISOString();
    await s.sourceDeps.postRepo.save({
      ...seed,
      id: "post-written-here",
      slug: "post-written-here",
      title: "Written on this computer",
      createdAt: now,
      updatedAt: now,
    });

    const workspace = await s.sourceDeps.workspaceRepo.findById(s.sourceDeps.workspaceId);
    const bundle = await buildExportBundle({
      workspaceId: s.sourceDeps.workspaceId,
      principalId: "test-operator",
      authorize: async () => ({ allowed: true }) as never,
      publishContentDeps: toPublishContentDeps(s.sourceDeps),
      sourceLabel: workspace?.name ?? "source",
    });
    assert.ok(bundle.entities.length > 0, "the source must actually have something to publish");

    const transport = {
      httpClient: s.httpClient,
      credential,
      blobSource: s.sourceDeps.blobStore,
      computeStorageKey: (sha256: string) => `blobs/${sha256}`,
    };
    const pushed = await pushBundleToPeer(transport, { bundle });
    assert.equal(typeof pushed.bundleId, "string");

    const planId = pushed.plan.planId as string;
    const planHash = pushed.plan.planHash as string;
    assert.ok(planId && planHash, JSON.stringify(pushed.plan));

    const { confirmationToken } = await confirmPeerImport(transport, { planId, planHash });
    const applied = await executePeerImport(transport, { bundleId: pushed.bundleId, confirmationToken });

    // Content landed on the destination, through its own gated ceremony, authenticated by a
    // credential that was never minted, stored, shown or copied.
    assert.ok(Array.isArray(applied.changeSetIds), JSON.stringify(applied));
    assert.ok((applied.changeSetIds as unknown[]).length > 0, JSON.stringify(applied));
    assert.equal(typeof applied.restorePointId, "string");

    // And it is really there, read back out of the destination's own repo rather than inferred
    // from the destination's own report of itself.
    const landed = await s.destinationDeps.postRepo.findById({
      workspaceId: s.destinationDeps.workspaceId,
      id: "post-written-here",
    });
    assert.ok(landed, "the post written on this computer must exist on the destination");
    assert.equal(landed.title, "Written on this computer");
  } finally {
    await s.teardown();
  }
});

test("a computer that was never connected is refused in plain language", async () => {
  const s = await scenario();
  try {
    // Connected, deployed — then a DIFFERENT computer (a different Site Token) tries to publish.
    const { site } = await connectAndDeploy(s);
    const stranger = resolvePublishDestinationCredential(
      { repo: s.peerRepo, sealer: s.sourceDeps.siteAssistantSecretSealer, keyring: testKeyring(OTHER_COMPUTER_ROOT_KEY), httpClient: s.httpClient },
      { workspaceId: s.sourceDeps.workspaceId, id: site.id }
    );

    const err = await stranger.then(
      () => null,
      (e: unknown) => e
    );
    assert.ok(err instanceof PublishTrustHandshakeError, String(err));
    assert.equal(err.failure, "not-connected");
    // The string this replaces is "no accepted public key for the claimed generation", which must
    // never reach a person.
    assert.match(err.message, /doesn't recognise this computer yet/);
    for (const jargon of ["grant", "public key", "generation", "installation", "capability", "nonce", "signature"]) {
      assert.ok(!err.message.toLowerCase().includes(jargon), `${jargon} leaked into: ${err.message}`);
    }
  } finally {
    await s.teardown();
  }
});

test("disconnecting removes only this computer, and leaves another computer's grant alone", async () => {
  const s = await scenario();
  try {
    await connectAndDeploy(s);
    // A second computer connects to the same site.
    await connectDestination(
      {
        httpClient: s.httpClient,
        keyring: testKeyring(OTHER_COMPUTER_ROOT_KEY),
        provisioning: s.provisioning,
        clock: s.clock,
        workspaceId: s.sourceDeps.workspaceId,
      },
      { baseUrl: DESTINATION_ORIGIN, entityTypes: ["post"] }
    );
    assert.equal((JSON.parse(await s.readGrantDocument()) as unknown[]).length, 2);

    await disconnectDestination({
      keyring: testKeyring(SOURCE_ROOT_KEY),
      provisioning: s.provisioning,
      workspaceId: s.sourceDeps.workspaceId,
    });

    const remaining = JSON.parse(await s.readGrantDocument()) as unknown[];
    assert.equal(remaining.length, 1, "disconnecting one computer must never revoke another");
  } finally {
    await s.teardown();
  }
});
