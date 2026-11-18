import "../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";
import express, { type NextFunction, type Request, type Response as ExpressResponse } from "express";

import { createFixedKeyring } from "#src/features/publish-trust/__tests__/support/fixed-keyring";
import type { PublishChallengeRecord, PublishChallengeStorePort } from "#src/features/publish-trust/challenge";
import { PUBLISH_TRUST_GRANT_VERSION, type PublishTrustGrant } from "#src/features/publish-trust/grant";
import type { PublishTrustResolution } from "#src/features/publish-trust/provisioning";
import { mintPublishSession } from "#src/features/publish-trust/session";
import { requirePublishTrust, type PublishTrustAuthDeps } from "#src/server/inbound/admin-http/publish-trust-auth";
import { registerPublishTrustHandshakeRoutes } from "#src/server/inbound/public-http/routes/publish-trust/handshake";

/**
 * @file Host-gate predicates of the publishing trust middleware and handshake route that no other
 * suite could see being removed (publish-engine design section 3.4: H5, H7, H12).
 *
 * Each test here was shown to fail when its one predicate is removed or inverted, and each asserts
 * an outcome only that predicate protects. They exist so the gate stays proven while the trust
 * code underneath it is split and moved; the gate itself stays in this repository.
 */

const WORKSPACE = "workspace-local";
const NOW = "2026-10-15T12:00:00.000Z";
const SOURCE_INSTALL = "test-source-install";
const DESTINATION_INSTALL = "test-destination-install";

function grant(overrides: Partial<PublishTrustGrant> = {}): PublishTrustGrant {
  return {
    version: PUBLISH_TRUST_GRANT_VERSION,
    sourceInstallationId: SOURCE_INSTALL,
    publicKeys: [{ publicKeyB64u: "key-generation-1", generation: 1 }, { publicKeyB64u: "key-generation-2", generation: 2 }],
    workspaceId: WORKSPACE,
    entityTypes: ["post", "media"],
    capabilities: ["publish_content.read", "publish_content.apply"],
    notAfter: "2099-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function resolutionOf(grants: readonly PublishTrustGrant[]): PublishTrustResolution {
  return { state: "configured", origin: "env", grants, reason: null };
}

async function gateFixture({ grants, generation }: { grants: readonly PublishTrustGrant[]; generation: number }, _optional = {}) {
  const { keyring } = createFixedKeyring({ siteKeyHex: "9".repeat(64) });
  const deps: PublishTrustAuthDeps = {
    keyring,
    workspaceId: WORKSPACE,
    clock: { nowIso: () => NOW },
    targetInstallationId: Promise.resolve(DESTINATION_INSTALL),
    grants: async () => resolutionOf(grants),
    revocations: async () => ({ ok: true, revocations: [] }),
  };
  const { token } = await mintPublishSession({
                                               deps,
                                               input: {
      sourceInstallationId: SOURCE_INSTALL,
      targetInstallationId: DESTINATION_INSTALL,
      capabilities: ["publish_content.read", "publish_content.apply"],
      generation,
    }
                                             });
  return { deps, token };
}

async function runGate({ deps, token }: { deps: PublishTrustAuthDeps; token: string }, _optional = {}) {
  const statuses: number[] = [];
  const nextCalls: unknown[][] = [];
  const locals: Record<string, unknown> = {};
  const req = {
    headers: { authorization: `Bearer ${token}` },
    method: "POST",
    originalUrl: `/api/admin/v1/workspaces/${WORKSPACE}/publish-content/blobs/probe`,
  } as Request;
  const res = {
    locals,
    status(code: number) { statuses.push(code); return this; },
    json() { return this; },
  } as unknown as ExpressResponse;
  const next: NextFunction = (...args: unknown[]) => { nextCalls.push(args); };
  await requirePublishTrust(deps)(req, res, next);
  return { statuses, nextCalls, locals };
}

test("T-H5: a session for a generation the grant no longer holds a key for is refused, even while another generation's key is accepted", async () => {
  // The token is authentic (this destination minted it) but names generation 3. The grant holds
  // keys for generations 1 and 2 only, as it would after a rotation dropped the old key.
  const { deps, token } = await gateFixture({ grants: [grant()], generation: 3 });

  const outcome = await runGate({ deps, token });

  assert.deepEqual(outcome.statuses, [401]);
  assert.deepEqual(outcome.nextCalls, []);
  assert.equal(outcome.locals.publishTrust, undefined);
});

test("T-H5: a session for a generation the grant still holds is admitted", async () => {
  const { deps, token } = await gateFixture({ grants: [grant()], generation: 2 });

  const outcome = await runGate({ deps, token });

  assert.deepEqual(outcome.statuses, []);
  assert.deepEqual(outcome.nextCalls, [[]]);
});

test("T-H7: an admitted session is rewritten to the system principal of its source and the publish_key credential kind", async () => {
  const { deps, token } = await gateFixture({ grants: [grant()], generation: 1 });

  const outcome = await runGate({ deps, token });

  assert.deepEqual(outcome.nextCalls, [[]]);
  assert.deepEqual(outcome.locals, {
    principal: {
      id: `pub:${SOURCE_INSTALL}`,
      workspaceId: WORKSPACE,
      kind: "system",
      displayName: `publishing installation ${SOURCE_INSTALL}`,
      status: "active",
      createdAt: NOW,
    },
    authCredentialKind: "publish_key",
    publishTrust: {
      sourceInstallationId: SOURCE_INSTALL,
      capabilities: ["publish_content.read", "publish_content.apply"],
      entityTypes: ["post", "media"],
      generation: 1,
    },
  });
});

/** A fake of the challenge store port that records how often a nonce was taken. */
function countingChallengeStore(): { store: PublishChallengeStorePort; taken: string[] } {
  const records = new Map<string, PublishChallengeRecord>();
  const taken: string[] = [];
  const store: PublishChallengeStorePort = {
    put: async ({ record }) => { records.set(record.nonce, record); },
    takeOnce: async ({ nonce }) => {
      taken.push(nonce);
      const record = records.get(nonce) ?? null;
      records.delete(nonce);
      return record;
    },
  };
  return { store, taken };
}

async function handshakeServer({ grants }: { grants: readonly PublishTrustGrant[] }, _optional = {}) {
  const { store, taken } = countingChallengeStore();
  const { keyring } = createFixedKeyring({ siteKeyHex: "9".repeat(64) });
  const app = express();
  app.use(express.json());
  registerPublishTrustHandshakeRoutes({ app, deps: {
    keyring,
    workspaceId: WORKSPACE,
    clock: { nowIso: () => NOW },
    idGen: { newId: () => "nonce-1" },
    challengeStore: store,
    targetInstallationId: Promise.resolve(DESTINATION_INSTALL),
    grants: async () => resolutionOf(grants),
  } });
  const server = createServer(app);
  server.listen(0);
  await once(server, "listening");
  const { port } = server.address() as AddressInfo;
  const close = async (): Promise<void> => {
    server.close();
    await once(server, "close");
  };
  return { baseUrl: `http://127.0.0.1:${port}`, taken, close };
}

async function postSession(baseUrl: string): Promise<Response> {
  await fetch(`${baseUrl}/api/publish-trust/v1/challenge`, { method: "POST" });
  return fetch(`${baseUrl}/api/publish-trust/v1/session`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      nonce: "nonce-1",
      sourceInstallationId: SOURCE_INSTALL,
      generation: 1,
      capabilities: ["publish_content.read"],
      signatureB64u: "not-a-real-signature",
    }),
  });
}

test("T-H12: a source whose grant has expired is refused by the session route before its nonce is consumed", async (t) => {
  const { baseUrl, taken, close } = await handshakeServer({ grants: [grant({ notAfter: NOW })] });
  t.after(close);

  const response = await postSession(baseUrl);

  assert.equal(response.status, 401);
  // The challenge verifier refuses an expired grant too, but only after taking the nonce. This
  // route check is what keeps a source without a live grant from spending nonces.
  assert.deepEqual(taken, []);
});

test("T-H12: a source with a live grant reaches the challenge verifier, which consumes the nonce and refuses the bad signature", async (t) => {
  const { baseUrl, taken, close } = await handshakeServer({ grants: [grant()] });
  t.after(close);

  const response = await postSession(baseUrl);

  assert.equal(response.status, 401);
  assert.deepEqual(taken, ["nonce-1"]);
});

test("T-H12: a source no grant names is refused by the session route before any nonce is consumed", async (t) => {
  const { baseUrl, taken, close } = await handshakeServer({ grants: [grant({ sourceInstallationId: "someone-else" })] });
  t.after(close);

  const response = await postSession(baseUrl);

  assert.equal(response.status, 401);
  assert.deepEqual(taken, []);
});
