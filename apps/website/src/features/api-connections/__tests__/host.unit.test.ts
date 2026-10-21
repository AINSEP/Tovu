/**
 * @file Phase-C unit tests for `host.ts` branches the slice and security suites do not reach: a
 * desktop connection with no installed-app client (or no secret setting), the honest-record check's
 * early exits (connection no longer declared, no usable client), a storage fault that must not read
 * as "client changed", a lost revision race while marking reconnect-required, and the refresher's
 * lease wait running on the host's real sleep. Real Jini service and Tovu vault stores over the fake
 * provider; no real network.
 */
import assert from "node:assert/strict";
import { after, afterEach, before, test } from "node:test";

import { AesGcmSecretSealer } from "@jini-ai/platform/secrets";
import { InMemoryKeyring } from "@jini-ai/platform/secrets/testing";
import { buildVaultAad, InMemoryVaultRepo, type VaultRecord } from "@jini-ai/platform/secrets/credential-sets";

import { loadPluginContributionsFromSource, type LoadPluginContributions } from "../../agent-plugins/lifecycle.js";
import { createApiConnectionVault, createApiConnectionVaultRecordStore, createApiConnectionVaultTokenStore } from "../vault-stores.js";
import { ACME_FIXTURE_ROOT, ACME_PLUGIN, ACME_WORKSPACE, acmeFixtureCopy, connectHosted, startAcmeHarness, type AcmeHarness } from "./support/acme-harness.js";

let harness: AcmeHarness;
before(async () => { harness = await startAcmeHarness(); });
afterEach(() => harness.reset());
after(async () => { await harness.close(); });

const fixtureLoader = (packageRoot: string = ACME_FIXTURE_ROOT): LoadPluginContributions => (input) =>
  loadPluginContributionsFromSource({ plugin: { pluginId: ACME_PLUGIN, packageRoot }, definition: input.definition });

test("a legacy OAuth credential requires reconnect without deleting or rewriting its token row", async () => {
  const vaultRepo = new InMemoryVaultRepo({});
  const keyring = new InMemoryKeyring({ hkdfSalt: "legacy-oauth-record" });
  const sealer = new AesGcmSecretSealer({ keyring });
  const host = harness.makeHost({ vaultRepo, keyring });
  const { connection, connectionRef } = await connectHosted(harness, host);
  const current = (await vaultRepo.find({ workspaceId: ACME_WORKSPACE, id: connectionRef }))!;
  const legacy = { ...current, meta: {}, revision: current.revision + 1,
    sealed: await sealer.seal({ plaintext: JSON.stringify({ schemaVersion: 1, tokens: { accessToken: "legacy-access" } }),
      key: await keyring.activeKey({}), aad: buildVaultAad(current) }) };
  await vaultRepo.put({ record: legacy, expectedRevision: current.revision });
  assert.equal((await host.statusOf({ connection })).status, "reconnect-required");
  assert.deepEqual(await vaultRepo.find({ workspaceId: ACME_WORKSPACE, id: connectionRef }), legacy);
});

/** A vault repo whose read of one row id fails like a storage fault would. */
class FaultyVaultRepo extends InMemoryVaultRepo {
  failingId: string | undefined;
  override async find(input: { workspaceId: string; id: string }, options: Record<string, never> = {}): Promise<VaultRecord | null> {
    if (input.id === this.failingId) throw new Error("vault storage read failed");
    return super.find(input, options);
  }
}

test("desktop: a connection with no installed-app client is refused as not set up on this desktop app", async (t) => {
  const packageRoot = acmeFixtureCopy(t, (declaration) => { (declaration.clients as Record<string, unknown>).desktop = undefined; });
  const host = harness.makeHost({ runtime: "desktop", packageRoot });
  const [connection] = await host.listConnections({ pluginId: ACME_PLUGIN });
  assert.throws(() => host.serviceFor({ connection: connection!, redirectUri: "http://127.0.0.1:1/callback" }), {
    code: "descriptor-invalid",
    message: "Acme Office is not set up on this desktop app: its sign-in client is not configured. Ask the operator to configure it, then retry.",
  });
});

test("desktop: an installed-app client that names no secret setting signs in as a public client and never sends a secret", async (t) => {
  const packageRoot = acmeFixtureCopy(t, (declaration) => { (declaration.clients as Record<string, unknown>).desktop = { clientIdEnv: "TOVU_ACME_OFFICE_OAUTH_DESKTOP_CLIENT_ID" }; });
  const host = harness.makeHost({ runtime: "desktop", packageRoot, env: { ...harness.env, TOVU_ACME_OFFICE_OAUTH_DESKTOP_CLIENT_SECRET: "never-sent-" + "x".repeat(12) } });
  const [connection] = await host.listConnections({ pluginId: ACME_PLUGIN });
  const redirectUri = "http://127.0.0.1:1/callback";
  const service = host.serviceFor({ connection: connection!, redirectUri });
  const start = await service.start({ workspaceId: ACME_WORKSPACE, actorId: "admin-1", intent: "connect", scopeSetIds: [], redirectUri });
  const back = harness.consentRedirect(start.authorizationUrl);
  await service.complete({ workspaceId: ACME_WORKSPACE, actorId: "admin-1", redirectUri, callbackParams: Object.fromEntries(back.searchParams), browserBinding: start.browserBinding });
  assert.equal(harness.provider.lastTokenForm.get("client_id"), "acme-desktop-client");
  assert.equal(harness.provider.lastTokenForm.has("client_secret"), false);
  assert.equal((await host.statusOf({ connection: connection! })).status, "connected");
});

test("honest record: a connected record whose connection is no longer declared is served as it stands", async () => {
  let declared = true;
  const loader = fixtureLoader();
  const host = harness.makeHost({ loadContributions: async (input, options) => (declared ? loader(input, options) : { items: [], refusals: [] }) });
  const { connectionRef } = await connectHosted(harness, host);
  declared = false;
  assert.equal((await host.records.read({ key: connectionRef }))?.status, "connected");
});

test("honest record: a connected record is left as it stands when this host has no usable client (its actions refuse on their own)", async () => {
  const env: Record<string, string | undefined> = { ...harness.env };
  const host = harness.makeHost({ env });
  const { connection, connectionRef } = await connectHosted(harness, host);
  delete env.TOVU_ACME_OFFICE_OAUTH_WEB_CLIENT_SECRET;
  assert.equal((await host.statusOf({ connection })).status, "connected");
  await assert.rejects(host.accessTokensFor({ pluginId: ACME_PLUGIN }).getAccessToken({ connectionRef }), { code: "descriptor-invalid", message: /its sign-in client secret is not configured/ });
});

test("honest record: a storage fault while opening the tokens propagates and never reads as a client change", async () => {
  const vaultRepo = new FaultyVaultRepo({});
  const host = harness.makeHost({ vaultRepo });
  const { connection, connectionRef } = await connectHosted(harness, host);
  vaultRepo.failingId = connectionRef;
  await assert.rejects(host.statusOf({ connection }), { message: "vault storage read failed" });
  vaultRepo.failingId = undefined;
  assert.equal((await host.statusOf({ connection })).status, "connected", "nothing was marked");
});

test("honest record: losing the revision race while marking reconnect-required returns the record that won", async () => {
  const env: Record<string, string | undefined> = { ...harness.env };
  const keyring = new InMemoryKeyring({ hkdfSalt: "api-connections-c3-race" });
  const vaultRepo = new InMemoryVaultRepo({});
  const clock = { nowMs: () => Date.now() };
  const loader = fixtureLoader();
  let beforeNextLoad: (() => Promise<void>) | undefined;
  const host = harness.makeHost({
    env, keyring, vaultRepo, clock, loadContributions: async (input, options) => {
      const hook = beforeNextLoad;
      beforeNextLoad = undefined;
      await hook?.();
      return loader(input, options);
    },
  });
  const { connection, connectionRef } = await connectHosted(harness, host);
  // Another writer, over the same vault, lands between the honest read and its reconnect-required CAS.
  const vault = createApiConnectionVault({ repo: vaultRepo, keyring, sealer: new AesGcmSecretSealer({ keyring }), clock, workspaceId: ACME_WORKSPACE });
  const rawRecords = createApiConnectionVaultRecordStore({ vault, workspaceId: ACME_WORKSPACE, clock });
  const winnerStamp = "2030-01-01T00:00:00.000Z";
  beforeNextLoad = async () => {
    const current = (await rawRecords.read({ key: connectionRef }))!;
    assert.ok(await rawRecords.compareAndSet({ key: connectionRef, expectedRevision: current.revision, record: { ...current, revision: current.revision + 1, updatedAt: winnerStamp } }));
  };
  env.TOVU_ACME_OFFICE_OAUTH_WEB_CLIENT_ID = "acme-web-client-rotated";
  const status = await host.statusOf({ connection });
  assert.equal(status.status, "connected", "the record that won the race is what this read returns");
  assert.equal((await rawRecords.read({ key: connectionRef }))?.updatedAt, winnerStamp, "the losing write never overwrote the winner");
});

test("refresh: a token read waits for another process's refresh lease on the host's real sleep, then serves the still-valid token", async () => {
  let now = Date.now();
  const clock = { nowMs: () => now };
  const keyring = new InMemoryKeyring({ hkdfSalt: "api-connections-c3-lease" });
  const vaultRepo = new InMemoryVaultRepo({});
  const host = harness.makeHost({ clock, keyring, vaultRepo });
  const { connection, connectionRef } = await connectHosted(harness, host);
  const callsAfterConnect = harness.provider.tokenCalls;
  // Due for refresh (inside the refresher's skew) but not yet expired.
  now += 3_600_000 - 60_000;
  const vault = createApiConnectionVault({ repo: vaultRepo, keyring, sealer: new AesGcmSecretSealer({ keyring }), clock, workspaceId: ACME_WORKSPACE });
  const otherProcess = createApiConnectionVaultTokenStore({
    vault, records: createApiConnectionVaultRecordStore({ vault, workspaceId: ACME_WORKSPACE, clock }), clock,
    owner: { workspaceId: ACME_WORKSPACE, pluginId: ACME_PLUGIN, connectionId: connection.descriptor.connectionId, clientId: "acme-web-client" },
  });
  await otherProcess.load({ key: connectionRef });
  assert.equal(await otherProcess.tryAcquireRefreshLease!({ key: connectionRef }), true);
  // The lease holder never finishes; time moves past the wait deadline while the host sleeps.
  const timer = setTimeout(() => { now += 10_000; }, 100);
  const startedAt = performance.now();
  try {
    assert.equal(await host.accessTokensFor({ pluginId: ACME_PLUGIN }).getAccessToken({ connectionRef }), harness.accessToken);
  } finally {
    clearTimeout(timer);
  }
  assert.ok(performance.now() - startedAt >= 200, "the host's sleep really waited for the lease poll");
  assert.equal(harness.provider.tokenCalls, callsAfterConnect, "no refresh while another process holds the lease");
});

test("token read: tokens sealed for another client are refused as reconnect-required and the stored record is marked by that read itself", async () => {
  const env: Record<string, string | undefined> = { ...harness.env };
  const keyring = new InMemoryKeyring({ hkdfSalt: "api-connections-c3-mark" });
  const vaultRepo = new InMemoryVaultRepo({});
  const clock = { nowMs: () => Date.now() };
  const host = harness.makeHost({ env, keyring, vaultRepo, clock });
  const { connectionRef } = await connectHosted(harness, host);
  env.TOVU_ACME_OFFICE_OAUTH_WEB_CLIENT_ID = "acme-web-client-rotated";
  await assert.rejects(host.accessTokensFor({ pluginId: ACME_PLUGIN }).getAccessToken({ connectionRef }), { code: "reconnect-required", message: /sign-in client changed/ });
  // Read the row as stored (no honest re-check on read), so only the token read can have marked it.
  const vault = createApiConnectionVault({ repo: vaultRepo, keyring, sealer: new AesGcmSecretSealer({ keyring }), clock, workspaceId: ACME_WORKSPACE });
  const stored = await createApiConnectionVaultRecordStore({ vault, workspaceId: ACME_WORKSPACE, clock }).read({ key: connectionRef });
  assert.equal(stored?.status, "reconnect-required");
});
