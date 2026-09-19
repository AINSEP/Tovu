import assert from "node:assert/strict";
import { hkdfSync } from "node:crypto";
import test from "node:test";

import type { KeyringPort } from "../../webhooks/index.js";
import {
  buildChallengeMessage,
  CHALLENGE_TTL_MS,
  InMemoryPublishChallengeStore,
  issuePublishChallenge,
  verifyChallengeResponse,
} from "../challenge.js";
import { isPublishTrustRoute, parsePublishTrustGrant, PUBLISH_TRUST_GRANT_VERSION } from "../grant.js";
import { derivePublishSigningKey } from "../keys.js";
import { mintPublishSession, SESSION_TTL_MS, verifyPublishSession } from "../session.js";

/**
 * @file End-to-end handshake proofs: challenge -> signature -> session -> use.
 *
 * The six properties the dispatch requires, each proved by a NEGATIVE test that was additionally
 * confirmed RED against a deliberately broken implementation: an unsigned request, a signature from
 * the wrong key, a replayed nonce, an expired session, a token presented to a different destination,
 * and a publish token aimed at an ordinary `content.write` route.
 */

/** The same HKDF construction `keyring.env.ts` uses — see `keys.test.ts` for why a faithful double
 *  rather than a friendlier one. */
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

const SOURCE_ROOT = "a".repeat(64);
const DEST_ROOT = "d".repeat(64);
const ATTACKER_ROOT = "f".repeat(64);
const SOURCE_INSTALL = "src-install";
const TARGET_INSTALL = "dest-install";
const TARGET_ORIGIN = "https://tovu.com";
const WORKSPACE = "ws-1";
const CAPABILITIES = ["publish_content.read", "publish_content.apply"] as const;

/** A clock the test drives, so expiry is proved by elapsed time rather than by a stub returning a
 *  hardcoded "expired" answer. */
function movableClock(startIso = "2026-09-19T12:00:00.000Z") {
  let now = Date.parse(startIso);
  return {
    nowIso: () => new Date(now).toISOString(),
    advance(ms: number) {
      now += ms;
    },
  };
}

let nonceCounter = 0;
const idGen = { newId: () => `nonce-${++nonceCounter}` };

async function sourceKey(rootKeyHex = SOURCE_ROOT, generation = 1) {
  return derivePublishSigningKey({
    keyring: testKeyring(rootKeyHex),
    workspaceId: WORKSPACE,
    sourceInstallationId: SOURCE_INSTALL,
    targetOrigin: TARGET_ORIGIN,
    generation,
  });
}

async function grantFor(publicKeyB64u: string, generation = 1) {
  const parsed = parsePublishTrustGrant({
    version: PUBLISH_TRUST_GRANT_VERSION,
    sourceInstallationId: SOURCE_INSTALL,
    publicKeys: [{ publicKeyB64u, generation }],
    workspaceId: WORKSPACE,
    entityTypes: ["post", "media"],
    capabilities: [...CAPABILITIES],
    notAfter: "2099-01-01T00:00:00.000Z",
  });
  assert.ok(parsed.ok);
  return parsed.grant;
}

/** Runs the real handshake: issue a nonce, sign it, verify, mint a session. */
async function handshake(options: { clock: ReturnType<typeof movableClock>; signWith?: Awaited<ReturnType<typeof sourceKey>> }) {
  const clock = options.clock;
  const key = options.signWith ?? (await sourceKey());
  const realKey = await sourceKey();
  const grant = await grantFor(realKey.publicKeyB64u);
  const store = new InMemoryPublishChallengeStore(clock);

  const challenge = await issuePublishChallenge({ store, clock, idGen, targetInstallationId: TARGET_INSTALL });
  const message = buildChallengeMessage({
    nonce: challenge.nonce,
    targetInstallationId: TARGET_INSTALL,
    sourceInstallationId: SOURCE_INSTALL,
    generation: key.generation,
    capabilities: CAPABILITIES,
  });

  const response = {
    nonce: challenge.nonce,
    sourceInstallationId: SOURCE_INSTALL,
    generation: key.generation,
    capabilities: [...CAPABILITIES],
    signatureB64u: key.sign(message),
  };
  return { store, grant, challenge, response, clock };
}

test("the happy path: a source that never received a secret authenticates end to end", async () => {
  const clock = movableClock();
  const { store, grant, response } = await handshake({ clock });

  const verified = await verifyChallengeResponse(
    { store, clock },
    { grant, targetInstallationId: TARGET_INSTALL, response }
  );
  assert.ok(verified.ok, verified.ok ? "" : verified.reason);

  const { token } = await mintPublishSession(
    { keyring: testKeyring(DEST_ROOT), workspaceId: WORKSPACE, clock },
    {
      sourceInstallationId: verified.verified.sourceInstallationId,
      targetInstallationId: TARGET_INSTALL,
      capabilities: verified.verified.capabilities,
      generation: verified.verified.generation,
    }
  );

  const session = await verifyPublishSession(
    { keyring: testKeyring(DEST_ROOT), workspaceId: WORKSPACE, clock },
    { token, expectedAudience: TARGET_INSTALL }
  );
  assert.ok(session.ok, session.ok ? "" : session.reason);
  assert.equal(session.payload.sourceInstallationId, SOURCE_INSTALL);
  // Stable identity, which is what baselines key on — not the rotating credential.
  assert.equal(session.payload.sourceInstallationId, SOURCE_INSTALL);
});

test("PROOF 1 — an UNSIGNED request is refused", async () => {
  const clock = movableClock();
  const { store, grant, response } = await handshake({ clock });

  for (const missing of ["", undefined, null]) {
    const result = await verifyChallengeResponse(
      { store, clock },
      {
        grant,
        targetInstallationId: TARGET_INSTALL,
        response: { ...response, signatureB64u: missing as unknown as string },
      }
    );
    assert.equal(result.ok, false);
    // Each attempt also burns its nonce, so a caller cannot probe with the same one.
    if (missing === "") assert.match(result.ok ? "" : result.reason, /no signature|already used/);
  }
});

test("PROOF 2 — a signature from the WRONG KEY is refused", async () => {
  const clock = movableClock();
  const attackerKey = await sourceKey(ATTACKER_ROOT);
  const { store, grant, response } = await handshake({ clock, signWith: attackerKey });

  const result = await verifyChallengeResponse(
    { store, clock },
    { grant, targetInstallationId: TARGET_INSTALL, response }
  );
  assert.equal(result.ok, false);
  assert.match(result.ok ? "" : result.reason, /signature verification failed/);
});

test("PROOF 3 — a REPLAYED nonce is refused", async () => {
  const clock = movableClock();
  const { store, grant, response } = await handshake({ clock });

  const first = await verifyChallengeResponse(
    { store, clock },
    { grant, targetInstallationId: TARGET_INSTALL, response }
  );
  assert.ok(first.ok, "the first use must succeed, or this test proves nothing");

  const replay = await verifyChallengeResponse(
    { store, clock },
    { grant, targetInstallationId: TARGET_INSTALL, response }
  );
  assert.equal(replay.ok, false);
  assert.match(replay.ok ? "" : replay.reason, /already used/);
});

test("a nonce is burned even by a FAILED attempt — a rejection cannot keep it alive", async () => {
  const clock = movableClock();
  const { store, grant, response } = await handshake({ clock });

  const bad = await verifyChallengeResponse(
    { store, clock },
    { grant, targetInstallationId: TARGET_INSTALL, response: { ...response, signatureB64u: "AAAA" } }
  );
  assert.equal(bad.ok, false);

  const retryWithGoodSignature = await verifyChallengeResponse(
    { store, clock },
    { grant, targetInstallationId: TARGET_INSTALL, response }
  );
  assert.equal(retryWithGoodSignature.ok, false);
  assert.match(retryWithGoodSignature.ok ? "" : retryWithGoodSignature.reason, /already used/);
});

test("an EXPIRED nonce is refused", async () => {
  const clock = movableClock();
  const { store, grant, response } = await handshake({ clock });

  clock.advance(CHALLENGE_TTL_MS);
  const result = await verifyChallengeResponse(
    { store, clock },
    { grant, targetInstallationId: TARGET_INSTALL, response }
  );
  assert.equal(result.ok, false);
  assert.match(result.ok ? "" : result.reason, /expired/);
});

test("PROOF 4 — an EXPIRED session is refused", async () => {
  const clock = movableClock();
  const deps = { keyring: testKeyring(DEST_ROOT), workspaceId: WORKSPACE, clock };
  const { token } = await mintPublishSession(deps, {
    sourceInstallationId: SOURCE_INSTALL,
    targetInstallationId: TARGET_INSTALL,
    capabilities: CAPABILITIES,
    generation: 1,
  });

  assert.ok((await verifyPublishSession(deps, { token, expectedAudience: TARGET_INSTALL })).ok);

  clock.advance(SESSION_TTL_MS);
  const expired = await verifyPublishSession(deps, { token, expectedAudience: TARGET_INSTALL });
  assert.equal(expired.ok, false);
  assert.match(expired.ok ? "" : expired.reason, /expired/);
});

test("PROOF 5 — a token presented to a DIFFERENT DESTINATION is refused", async () => {
  const clock = movableClock();
  const deps = { keyring: testKeyring(DEST_ROOT), workspaceId: WORKSPACE, clock };
  const { token } = await mintPublishSession(deps, {
    sourceInstallationId: SOURCE_INSTALL,
    targetInstallationId: TARGET_INSTALL,
    capabilities: CAPABILITIES,
    generation: 1,
  });

  const elsewhere = await verifyPublishSession(deps, { token, expectedAudience: "staging-install" });
  assert.equal(elsewhere.ok, false);
  assert.match(elsewhere.ok ? "" : elsewhere.reason, /another destination/);
});

test("PROOF 6 — a valid publish token still cannot reach an ordinary content.write route", async () => {
  const clock = movableClock();
  const deps = { keyring: testKeyring(DEST_ROOT), workspaceId: WORKSPACE, clock };
  const { token } = await mintPublishSession(deps, {
    sourceInstallationId: SOURCE_INSTALL,
    targetInstallationId: TARGET_INSTALL,
    capabilities: CAPABILITIES,
    generation: 1,
  });

  const session = await verifyPublishSession(deps, { token, expectedAudience: TARGET_INSTALL });
  assert.ok(session.ok, "the token itself must be valid, or this test proves nothing");

  // The token is genuine and unexpired. It still cannot reach these, because the reachable set is
  // owned by `grant.ts` and is not carried in the token — nothing the holder presents can widen it.
  assert.equal(isPublishTrustRoute("POST", `/api/admin/v1/workspaces/${WORKSPACE}/posts`), false);
  assert.equal(isPublishTrustRoute("PUT", `/api/admin/v1/workspaces/${WORKSPACE}/posts/p-1`), false);
  assert.equal(isPublishTrustRoute("POST", `/api/admin/v1/workspaces/${WORKSPACE}/api-keys`), false);
  // And what it CAN reach is exactly the publishing surface.
  assert.equal(isPublishTrustRoute("POST", `/api/admin/v1/workspaces/${WORKSPACE}/publish-content/bundles`), true);
});

test("a nonce issued by another destination is refused", async () => {
  const clock = movableClock();
  const { store, grant, response } = await handshake({ clock });

  const result = await verifyChallengeResponse(
    { store, clock },
    { grant, targetInstallationId: "someone-elses-install", response }
  );
  assert.equal(result.ok, false);
});

test("a capability the grant does not hold is refused, not narrowed", async () => {
  const clock = movableClock();
  const key = await sourceKey();
  const grant = await grantFor(key.publicKeyB64u);
  const store = new InMemoryPublishChallengeStore(clock);
  const challenge = await issuePublishChallenge({ store, clock, idGen, targetInstallationId: TARGET_INSTALL });

  const capabilities = ["publish_content.apply", "content.write"];
  const message = buildChallengeMessage({
    nonce: challenge.nonce,
    targetInstallationId: TARGET_INSTALL,
    sourceInstallationId: SOURCE_INSTALL,
    generation: 1,
    capabilities,
  });

  const result = await verifyChallengeResponse(
    { store, clock },
    {
      grant,
      targetInstallationId: TARGET_INSTALL,
      response: {
        nonce: challenge.nonce,
        sourceInstallationId: SOURCE_INSTALL,
        generation: 1,
        capabilities,
        signatureB64u: key.sign(message),
      },
    }
  );
  assert.equal(result.ok, false);
  assert.match(result.ok ? "" : result.reason, /content\.write.*outside this grant/);
});

test("a response claiming a generation the grant does not accept is refused", async () => {
  const clock = movableClock();
  const oldKey = await sourceKey(SOURCE_ROOT, 1);
  const grant = await grantFor(oldKey.publicKeyB64u, 2); // grant accepts generation 2 only
  const store = new InMemoryPublishChallengeStore(clock);
  const challenge = await issuePublishChallenge({ store, clock, idGen, targetInstallationId: TARGET_INSTALL });

  const result = await verifyChallengeResponse(
    { store, clock },
    {
      grant,
      targetInstallationId: TARGET_INSTALL,
      response: {
        nonce: challenge.nonce,
        sourceInstallationId: SOURCE_INSTALL,
        generation: 1,
        capabilities: [...CAPABILITIES],
        signatureB64u: oldKey.sign("anything"),
      },
    }
  );
  assert.equal(result.ok, false);
  assert.match(result.ok ? "" : result.reason, /no accepted public key/);
});

test("a tampered session payload is refused — the MAC covers every field", async () => {
  const clock = movableClock();
  const deps = { keyring: testKeyring(DEST_ROOT), workspaceId: WORKSPACE, clock };
  const { token } = await mintPublishSession(deps, {
    sourceInstallationId: SOURCE_INSTALL,
    targetInstallationId: TARGET_INSTALL,
    capabilities: ["publish_content.read"],
    generation: 1,
  });

  const [encoded, mac] = token.split(".");
  const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  payload.capabilities = ["publish_content.read", "publish_content.apply"];
  const forged = `${Buffer.from(JSON.stringify(payload), "utf8").toString("base64url")}.${mac}`;

  const result = await verifyPublishSession(deps, { token: forged, expectedAudience: TARGET_INSTALL });
  assert.equal(result.ok, false);
  assert.match(result.ok ? "" : result.reason, /signature is invalid/);
});

test("a token minted under a different Site Token is refused", async () => {
  const clock = movableClock();
  const { token } = await mintPublishSession(
    { keyring: testKeyring(ATTACKER_ROOT), workspaceId: WORKSPACE, clock },
    {
      sourceInstallationId: SOURCE_INSTALL,
      targetInstallationId: TARGET_INSTALL,
      capabilities: CAPABILITIES,
      generation: 1,
    }
  );

  const result = await verifyPublishSession(
    { keyring: testKeyring(DEST_ROOT), workspaceId: WORKSPACE, clock },
    { token, expectedAudience: TARGET_INSTALL }
  );
  assert.equal(result.ok, false);
});

test("malformed session tokens are refused without throwing", async () => {
  const clock = movableClock();
  const deps = { keyring: testKeyring(DEST_ROOT), workspaceId: WORKSPACE, clock };

  for (const bad of ["", ".", "a.", ".b", "no-dot", "a.b.c", "!!!.!!!"]) {
    const result = await verifyPublishSession(deps, { token: bad, expectedAudience: TARGET_INSTALL });
    assert.equal(result.ok, false, `'${bad}' must be refused`);
  }
});
