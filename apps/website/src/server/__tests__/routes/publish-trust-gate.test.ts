import "../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import { hkdfSync } from "node:crypto";
import { once } from "node:events";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";
import type { NextFunction, Request, Response as ExpressResponse } from "express";

import { createApp, createRouteDeps } from "#src/server/runtime/composition/app";
import { buildChallengeMessage } from "#src/features/publish-trust/challenge";
import { PUBLISH_TRUST_GRANT_VERSION, type PublishingCapability } from "#src/features/publish-trust/grant";
import { derivePublishSigningKey } from "#src/features/publish-trust/keys";
import { PUBLISH_TRUST_ENV_VAR, parseGrantDocument, type PublishTrustResolution } from "#src/features/publish-trust/provisioning";
import { mintPublishSession } from "#src/features/publish-trust/session";
import { requirePublishTrust, type PublishTrustAuthDeps } from "#src/server/inbound/admin-http/publish-trust-auth";
import type { KeyringPort } from "#src/features/webhooks/index";
import { loginAsOwner } from "../helpers/http-test-server.js";

/**
 * @file The publishing gate, over real HTTP, through the real app.
 *
 * `features/publish-trust/__tests__/handshake.test.ts` already proves the eight security
 * properties against the verifiers themselves. This file exists because a correct primitive with
 * an unwired call site is the failure mode that actually ships: the HTTP assertions go through
 * `createApp()`, so they fail if the middleware is not mounted, is mounted in the wrong order,
 * answers authorization from RBAC instead of the grant, or lets a publishing token fall through to
 * whatever credential the request happens to carry. Direct middleware cases also pin promise
 * resolution and credential attachment without an Express 4 hang hiding a rejected promise.
 *
 * The source install is a FAKE with its own site key — which is the honest arrangement, since the
 * two installs have different site keys by design and the destination only ever sees a public key.
 */
const WORKSPACE = "workspace-local";
const SOURCE_ROOT = "1".repeat(64);
const ATTACKER_ROOT = "9".repeat(64);
const SOURCE_INSTALL = "test-source-install";
const TARGET_ORIGIN = "https://destination.test";
const CAPABILITIES = ["publish_content.read", "publish_content.apply"] as const;
const A_SHA = "a".repeat(64);

/** The same HKDF construction `keyring.env.ts` uses — a faithful double, not a friendlier one. */
function testKeyring(siteKeyHex: string): KeyringPort {
  const siteKey = Buffer.from(siteKeyHex, "hex");
  return {
    async activeKey() {
      return { keyId: "v1" };
    },
    async deriveSigningSecret() {
      throw new Error("not used by publish-trust");
    },
    async derive(input: { workspaceId: string; purpose: string; info: string }) {
      return new Uint8Array(
        hkdfSync("sha256", siteKey, Buffer.alloc(0), `${input.purpose}:${input.workspaceId}:${input.info}`, 32)
      );
    },
  } as unknown as KeyringPort;
}

async function sourceKey(siteKeyHex = SOURCE_ROOT) {
  return derivePublishSigningKey({
    keyring: testKeyring(siteKeyHex),
    workspaceId: WORKSPACE,
    sourceInstallationId: SOURCE_INSTALL,
    targetOrigin: TARGET_ORIGIN,
    generation: 1,
  });
}

function grantDocument(publicKeyB64u: string): string {
  return JSON.stringify([
    {
      version: PUBLISH_TRUST_GRANT_VERSION,
      sourceInstallationId: SOURCE_INSTALL,
      publicKeys: [{ publicKeyB64u, generation: 1 }],
      workspaceId: WORKSPACE,
      entityTypes: ["post", "media"],
      capabilities: [...CAPABILITIES],
      notAfter: "2099-01-01T00:00:00.000Z",
    },
  ]);
}

/**
 * Starts the real app with `TOVU_PUBLISH_TRUST` set to `grantJson`.
 *
 * The env var is set BEFORE the first request rather than before `createApp`, because the grant
 * resolver reads it lazily on first use — which is itself worth pinning: a resolver that read at
 * module load would make the destination's revocation channel depend on import order.
 */
async function startServer(grantJson: string | undefined) {
  if (grantJson === undefined) delete process.env[PUBLISH_TRUST_ENV_VAR];
  else process.env[PUBLISH_TRUST_ENV_VAR] = grantJson;

  const server = createServer(createApp(createRouteDeps()));
  server.listen(0);
  await once(server, "listening");
  const { port } = server.address() as AddressInfo;
  return { server, baseUrl: `http://127.0.0.1:${port}` };
}

async function stop(server: Server): Promise<void> {
  server.close();
  await once(server, "close");
}

/** Drives the real three-route handshake and returns everything a test might want to bend. */
async function handshakeOver(
  baseUrl: string,
  options: { signWith?: Awaited<ReturnType<typeof sourceKey>>; omitSignature?: boolean } = {}
) {
  const key = options.signWith ?? (await sourceKey());

  const challengeRes = await fetch(`${baseUrl}/api/publish-trust/v1/challenge`, { method: "POST" });
  const challenge = (await challengeRes.json()) as { nonce: string; targetInstallationId: string };

  const message = buildChallengeMessage({
    nonce: challenge.nonce,
    targetInstallationId: challenge.targetInstallationId,
    sourceInstallationId: SOURCE_INSTALL,
    generation: 1,
    capabilities: CAPABILITIES,
  });

  const body = {
    nonce: challenge.nonce,
    sourceInstallationId: SOURCE_INSTALL,
    generation: 1,
    capabilities: [...CAPABILITIES],
    signatureB64u: options.omitSignature ? "" : key.sign(message),
  };

  const sessionRes = await fetch(`${baseUrl}/api/publish-trust/v1/session`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { challenge, body, sessionRes };
}

/** Reads the body exactly once and asserts the status against that same read — a
 *  `assert.equal(res.status, N, await res.text())` followed by `res.json()` double-consumes even on
 *  the passing path, because the template argument always evaluates. */
async function tokenFor(baseUrl: string): Promise<string> {
  const { sessionRes } = await handshakeOver(baseUrl);
  const raw = await sessionRes.text();
  assert.equal(sessionRes.status, 200, raw);
  return (JSON.parse(raw) as { token: string }).token;
}

function probe(baseUrl: string, token: string | null): Promise<Response> {
  return fetch(`${baseUrl}/api/admin/v1/workspaces/${WORKSPACE}/publish-content/blobs/probe`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ shas: [A_SHA] }),
  });
}

/** Direct calls also catch async rejections that Express 4 would leave hanging. */
async function directGateFixture(
  { capabilities = CAPABILITIES }: { capabilities?: readonly PublishingCapability[] } = {},
  _options: Record<string, never> = {}
) {
  const key = await sourceKey();
  const parsed = parseGrantDocument(grantDocument(key.publicKeyB64u));
  assert.equal(parsed.ok, true);
  const resolution: PublishTrustResolution = { state: "configured", origin: "env", grants: parsed.grants, reason: null };
  const deps: PublishTrustAuthDeps = {
    keyring: testKeyring(ATTACKER_ROOT),
    workspaceId: WORKSPACE,
    clock: { nowIso: () => "2026-10-15T12:00:00.000Z" },
    targetInstallationId: Promise.resolve("test-destination-install"),
    grants: async () => resolution,
    revocations: async () => ({ ok: true, revocations: [] }),
  };
  const { token } = await mintPublishSession(deps, {
    sourceInstallationId: SOURCE_INSTALL,
    targetInstallationId: await deps.targetInstallationId,
    capabilities,
    generation: 1,
  });
  return { deps, token, resolution };
}

function directGateRequest(
  { headers }: { headers: Request["headers"] },
  _options: Record<string, never> = {}
) {
  const statuses: number[] = [];
  const bodies: unknown[] = [];
  const nextCalls: unknown[][] = [];
  const req = {
    headers,
    method: "POST",
    originalUrl: `/api/admin/v1/workspaces/${WORKSPACE}/publish-content/blobs/probe`,
  } as Request;
  const res = {
    locals: {},
    status(code: number) { statuses.push(code); return this; },
    json(body: unknown) { bodies.push(body); return this; },
  } as unknown as ExpressResponse;
  const next: NextFunction = (...args: unknown[]) => { nextCalls.push(args); };
  return { req, res, next, statuses, bodies, nextCalls };
}

// Pins publish-trust-auth.ts:114 — an absent Authorization header must pass through without throwing.
test("the publishing gate leaves a request without an Authorization header untouched", async () => {
  const { deps } = await directGateFixture();
  const call = directGateRequest({ headers: {} });

  await assert.doesNotReject(requirePublishTrust(deps)(call.req, call.res, call.next));

  assert.deepEqual(call.nextCalls, [[]]);
  assert.equal(call.res.locals.principal, undefined);
  assert.equal(call.res.locals.publishTrust, undefined);
  assert.deepEqual(call.statuses, []);
  assert.deepEqual(call.bodies, []);
});

// Pins publish-trust-auth.ts:249 — failed verification must pass API keys and tampered tokens through.
test("the publishing gate passes ordinary API keys and tampered publishing tokens on untouched", async () => {
  const { deps, token } = await directGateFixture();
  const [payload, mac] = token.split(".");
  const tampered = `${payload}.${mac[0] === "A" ? "B" : "A"}${mac.slice(1)}`;
  for (const credential of ["some-ordinary-api-key", tampered]) {
    const call = directGateRequest({ headers: { authorization: `Bearer ${credential}` } });

    await assert.doesNotReject(requirePublishTrust(deps)(call.req, call.res, call.next));

    assert.deepEqual(call.nextCalls, [[]]);
    assert.equal(call.res.locals.principal, undefined);
    assert.equal(call.res.locals.publishTrust, undefined);
    assert.deepEqual(call.statuses, []);
    assert.deepEqual(call.bodies, []);
  }
});

// Pins publish-trust-auth.ts:296 — admission refusals must stop a still-valid token on the next request.
test("the publishing gate refuses a disconnected source or a removed grant after admitting the same token", async () => {
  const { deps, token, resolution } = await directGateFixture();
  for (const refusal of ["disconnected", "grant-removed"] as const) {
    let denied = false;
    const middleware = requirePublishTrust({
      ...deps,
      grants: async () => denied && refusal === "grant-removed"
        ? { ...resolution, grants: [] }
        : resolution,
      revocations: async () => ({
        ok: true,
        revocations: denied && refusal === "disconnected"
          ? [{ sourceInstallationId: SOURCE_INSTALL, revokedAt: deps.clock.nowIso(), note: "lost device" }]
          : [],
      }),
    });
    const admitted = directGateRequest({ headers: { authorization: `Bearer ${token}` } });
    await assert.doesNotReject(middleware(admitted.req, admitted.res, admitted.next));
    assert.deepEqual(admitted.nextCalls, [[]]);
    assert.deepEqual(admitted.statuses, []);
    assert.deepEqual(admitted.bodies, []);
    assert.equal(admitted.res.locals.principal.id, `pub:${SOURCE_INSTALL}`);
    assert.deepEqual(admitted.res.locals.publishTrust, {
      sourceInstallationId: SOURCE_INSTALL,
      capabilities: [...CAPABILITIES],
      entityTypes: ["post", "media"],
      generation: 1,
    });

    denied = true;
    const refused = directGateRequest({ headers: { authorization: `Bearer ${token}` } });
    await assert.doesNotReject(middleware(refused.req, refused.res, refused.next));
    assert.deepEqual(refused.statuses, [401], refusal);
    assert.deepEqual(refused.bodies, [{ error: "unauthenticated", code: "UNAUTHENTICATED" }], refusal);
    assert.deepEqual(refused.nextCalls, [], refusal);
    assert.equal(refused.res.locals.principal, undefined);
    assert.equal(refused.res.locals.publishTrust, undefined);
  }
});

// Pins publish-trust-auth.ts:306 — an admitted grant with no remaining token capabilities is a flat 401.
test("the publishing gate refuses a token after its only capability is removed from the current grant", async () => {
  const { deps, token, resolution } = await directGateFixture({ capabilities: ["publish_content.apply"] });
  const admitted = directGateRequest({ headers: { authorization: `Bearer ${token}` } });
  await assert.doesNotReject(requirePublishTrust(deps)(admitted.req, admitted.res, admitted.next));
  assert.deepEqual(admitted.nextCalls, [[]]);
  assert.deepEqual(admitted.statuses, []);
  assert.deepEqual(admitted.bodies, []);
  assert.deepEqual(admitted.res.locals.publishTrust.capabilities, ["publish_content.apply"]);

  const call = directGateRequest({ headers: { authorization: `Bearer ${token}` } });
  const narrowed: PublishTrustAuthDeps = {
    ...deps,
    grants: async () => ({
      ...resolution,
      grants: resolution.grants.map(grant => ({ ...grant, capabilities: ["publish_content.read"] as const })),
    }),
  };

  await assert.doesNotReject(requirePublishTrust(narrowed)(call.req, call.res, call.next));

  assert.deepEqual(call.statuses, [401]);
  assert.deepEqual(call.bodies, [{ error: "unauthenticated", code: "UNAUTHENTICATED" }]);
  assert.deepEqual(call.nextCalls, []);
  assert.equal(call.res.locals.principal, undefined);
  assert.equal(call.res.locals.publishTrust, undefined);
});

// A broken deny store or grant source must refuse (401), never admit and never surface a 500 oracle.
test("the publishing gate refuses a verified token when either trust store is unreadable or rejects", async () => {
  const { deps, token } = await directGateFixture();
  const brokenStores: ReadonlyArray<[string, Partial<PublishTrustAuthDeps>]> = [
    ["unreadable deny store", { revocations: async () => ({ ok: false, reason: "the revocation file could not be parsed" }) }],
    ["rejecting deny store", { revocations: async () => { throw new Error("EIO reading /private/revocations.json"); } }],
    ["rejecting grant source", { grants: async () => { throw new Error("EIO reading /private/grants.json"); } }],
  ];
  for (const [label, override] of brokenStores) {
    const call = directGateRequest({ headers: { authorization: `Bearer ${token}` } });
    await assert.doesNotReject(requirePublishTrust({ ...deps, ...override })(call.req, call.res, call.next), label);
    assert.deepEqual(call.statuses, [401], label);
    assert.deepEqual(call.bodies, [{ error: "unauthenticated", code: "UNAUTHENTICATED" }], label);
    assert.deepEqual(call.nextCalls, [], label);
    assert.equal(call.res.locals.principal, undefined, label);
    assert.equal(call.res.locals.publishTrust, undefined, label);
  }
});

test("the identity route states this install's identity and nothing about who may publish to it", async () => {
  const key = await sourceKey();
  const { server, baseUrl } = await startServer(grantDocument(key.publicKeyB64u));
  try {
    const res = await fetch(`${baseUrl}/api/publish-trust/v1/identity`);
    assert.equal(res.status, 200);
    const body = (await res.json()) as Record<string, unknown>;

    assert.deepEqual(Object.keys(body).sort(), ["installationId", "origin", "workspaceId"]);
    assert.equal(body.workspaceId, WORKSPACE);
    assert.equal(typeof body.installationId, "string");
    assert.ok((body.installationId as string).length > 0);

    // The grant is provisioned and must still be invisible here: no source id, no public key, and
    // nothing that distinguishes a paired site from an unpaired one.
    const serialized = JSON.stringify(body);
    assert.ok(!serialized.includes(SOURCE_INSTALL), "the identity route must not name who may publish here");
    assert.ok(!serialized.includes(key.publicKeyB64u), "the identity route must not disclose grant key material");
  } finally {
    await stop(server);
  }
});

test("a source that was never given a secret publishes end to end, over HTTP", async () => {
  const key = await sourceKey();
  const { server, baseUrl } = await startServer(grantDocument(key.publicKeyB64u));
  try {
    const token = await tokenFor(baseUrl);
    const res = await probe(baseUrl, token);
    const raw = await res.text();
    assert.equal(res.status, 200, raw);
    assert.deepEqual((JSON.parse(raw) as { missing: string[] }).missing, [A_SHA]);
  } finally {
    await stop(server);
  }
});

test("an UNSIGNED handshake is refused by the live route", async () => {
  const key = await sourceKey();
  const { server, baseUrl } = await startServer(grantDocument(key.publicKeyB64u));
  try {
    const { sessionRes } = await handshakeOver(baseUrl, { omitSignature: true });
    assert.equal(sessionRes.status, 401);
  } finally {
    await stop(server);
  }
});

test("a signature from the WRONG KEY is refused by the live route", async () => {
  const key = await sourceKey();
  const { server, baseUrl } = await startServer(grantDocument(key.publicKeyB64u));
  try {
    const { sessionRes } = await handshakeOver(baseUrl, { signWith: await sourceKey(ATTACKER_ROOT) });
    assert.equal(sessionRes.status, 401);
  } finally {
    await stop(server);
  }
});

test("a REPLAYED nonce is refused by the live route — single use is real, not documented", async () => {
  const key = await sourceKey();
  const { server, baseUrl } = await startServer(grantDocument(key.publicKeyB64u));
  try {
    const { body, sessionRes } = await handshakeOver(baseUrl);
    assert.equal(sessionRes.status, 200, "the first exchange must succeed, or the replay proves nothing");

    const replay = await fetch(`${baseUrl}/api/publish-trust/v1/session`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    assert.equal(replay.status, 401);
  } finally {
    await stop(server);
  }
});

test("a valid publish token cannot reach an ordinary content.write route", async () => {
  const key = await sourceKey();
  const { server, baseUrl } = await startServer(grantDocument(key.publicKeyB64u));
  try {
    const token = await tokenFor(baseUrl);
    const cookie = await loginAsOwner(baseUrl);
    const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/${WORKSPACE}/posts`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ title: "hostile", slug: "hostile" }),
    });
    assert.equal(res.status, 401, await res.text());
    const mixed = await fetch(`${baseUrl}/api/admin/v1/workspaces/${WORKSPACE}/posts`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}`, cookie },
      body: JSON.stringify({ title: "hostile", slug: "hostile" }),
    });
    assert.equal(mixed.status, 401);
    assert.deepEqual(await mixed.json(), { error: "unauthenticated", code: "UNAUTHENTICATED" });
  } finally {
    await stop(server);
  }
});

test("a valid publish token cannot reach an admin route outside the publishing surface", async () => {
  const key = await sourceKey();
  const { server, baseUrl } = await startServer(grantDocument(key.publicKeyB64u));
  try {
    const token = await tokenFor(baseUrl);
    const cookie = await loginAsOwner(baseUrl);
    const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/${WORKSPACE}/publish-content/peers`, {
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(res.status, 401, await res.text());
    const mixed = await fetch(`${baseUrl}/api/admin/v1/workspaces/${WORKSPACE}/publish-content/peers`, {
      headers: { authorization: `Bearer ${token}`, cookie },
    });
    assert.equal(mixed.status, 401);
    assert.deepEqual(await mixed.json(), { error: "unauthenticated", code: "UNAUTHENTICATED" });
  } finally {
    await stop(server);
  }
});

test("the export route REFUSES a publishing credential rather than handing back an empty bundle", async () => {
  const key = await sourceKey();
  const { server, baseUrl } = await startServer(grantDocument(key.publicKeyB64u));
  try {
    const token = await tokenFor(baseUrl);
    const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/${WORKSPACE}/publish-content/export`, {
      headers: { authorization: `Bearer ${token}` },
    });
    const raw = await res.text();
    assert.equal(res.status, 403, raw);
    const body = JSON.parse(raw) as Record<string, unknown>;
    const details = (body.details ?? {}) as Record<string, unknown>;

    // The identifier, not merely the status. `export` IS in `PUBLISH_TRUST_ROUTES`, so a valid
    // publishing session reaches this handler; what stops it is one explicit refusal in
    // `routes/publish-content/export.ts`, and an assertion on the status alone would still pass
    // against the very answer that refusal exists to prevent.
    assert.equal(details.reason, "publish_trust_export_not_wired");
    assert.equal(details.permission, "publish_content.read");
    assert.equal(body.code, "FORBIDDEN");

    // And positively: the body must not be shaped like a bundle. Falling through would not fail —
    // `packAuthorizedEntities` asks each registered type for its OWN write permission, a publishing
    // grant's closed capability set can never hold `content.write`, so every type would be omitted
    // and the caller would receive `{"hashVersion":…,"entities":[],…}`: success-shaped, empty, and
    // indistinguishable from "this site has nothing to export". That silent wrong answer is the
    // regression this pins, so assert the bundle shape is ABSENT instead of trusting a status code.
    assert.equal("entities" in body, false, "a refusal must not be shaped like a bundle");
    assert.equal("hashVersion" in body, false, "a refusal must not be shaped like a bundle");
  } finally {
    await stop(server);
  }
});

test("a publish-trust route with NO token resolves to no credential", async () => {
  const key = await sourceKey();
  const { server, baseUrl } = await startServer(grantDocument(key.publicKeyB64u));
  try {
    const res = await probe(baseUrl, null);
    assert.equal(res.status, 401);
    assert.equal(((await res.json()) as { code: string }).code, "UNAUTHENTICATED");
  } finally {
    await stop(server);
  }
});

// Owner decision 2026-10-03: trust revocation takes effect on RESTART. The grant is read once per
// process and cached (`createPublishTrustGrantResolver`), so emptying the kill switch under a
// running server changes nothing until the next boot; what must hold is that a still-unexpired
// token is refused by the restarted install.
test("dropping the grant revokes publishing within one session, not at the end of one", async () => {
  const key = await sourceKey();
  const first = await startServer(grantDocument(key.publicKeyB64u));
  let token: string;
  try {
    token = await tokenFor(first.baseUrl);
    assert.equal((await probe(first.baseUrl, token)).status, 200);
  } finally {
    await stop(first.server);
  }

  // The same still-unexpired token, against an install whose operator emptied the kill switch.
  const revoked = await startServer("");
  try {
    assert.equal((await probe(revoked.baseUrl, token)).status, 401);
  } finally {
    await stop(revoked.server);
    delete process.env[PUBLISH_TRUST_ENV_VAR];
  }
});

test("an install that has never provisioned refuses the handshake without saying so", async () => {
  const { server, baseUrl } = await startServer(undefined);
  try {
    const { sessionRes } = await handshakeOver(baseUrl);
    assert.equal(sessionRes.status, 401);
    // Byte-identical to a bad-signature refusal: an unpaired site must not be distinguishable.
    assert.deepEqual(await sessionRes.json(), {
      error: "the publishing handshake was refused",
      code: "UNAUTHENTICATED",
    });
  } finally {
    await stop(server);
  }
});

/** Each type's current `schemaVersion`; the door refuses any other before it reads the grant.
 *  `post`/`page` went to 2 when they began carrying `termIds`. */
const SCHEMA_VERSION: Readonly<Record<string, number>> = { post: 2, page: 2 };

/** Stages a bundle carrying one entity of `entityType`, the way a push would. */
function bundle(baseUrl: string, token: string, entityType: unknown): Promise<Response> {
  const schemaVersion = (typeof entityType === "string" && SCHEMA_VERSION[entityType]) || 1;
  return fetch(`${baseUrl}/api/admin/v1/workspaces/${WORKSPACE}/publish-content/bundles`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({
      artifactFormatVersion: 1,
      hashVersion: 1,
      sourceLabel: "test source",
      entities: [{ entityType, id: "e-1", schemaVersion, contentHash: "x", hashVersion: 1, requiredBlobs: [], state: {} }],
      blobManifest: [],
    }),
  });
}

test("a granted entity type is accepted at the bundle door", async () => {
  const key = await sourceKey();
  const { server, baseUrl } = await startServer(grantDocument(key.publicKeyB64u));
  try {
    const token = await tokenFor(baseUrl);
    const res = await bundle(baseUrl, token, "post");
    assert.equal(res.status, 201, await res.text());
  } finally {
    await stop(server);
  }
});

test("an entity type the grant does not name is refused, and the whole bundle with it", async () => {
  const key = await sourceKey();
  const { server, baseUrl } = await startServer(grantDocument(key.publicKeyB64u));
  try {
    const token = await tokenFor(baseUrl);
    // The grant names `post` and `media`. `page` is a real travelling type this grant omits.
    const res = await bundle(baseUrl, token, "page");
    const raw = await res.text();
    assert.equal(res.status, 403, raw);
    assert.equal((JSON.parse(raw) as { details: { reason: string } }).details.reason, "entity_type_not_granted");
  } finally {
    await stop(server);
  }
});

test("an entity that declares no type at all is refused, not skipped", async () => {
  const key = await sourceKey();
  const { server, baseUrl } = await startServer(grantDocument(key.publicKeyB64u));
  try {
    const token = await tokenFor(baseUrl);
    const res = await bundle(baseUrl, token, undefined);
    // The body's own shape check refuses it before the grant's allowlist is reached.
    const raw = await res.text();
    assert.equal(res.status, 400, raw);
    assert.equal((JSON.parse(raw) as { error: string }).error, "entities[0].entityType must be a non-empty string");
  } finally {
    await stop(server);
  }
});

// c7n-ow-review2 (2026-09-24): the real publish path. A computer connected to live reaches
// /import/plan and /import/execute with a publishing session token, which `requirePublishTrust`
// marks `publish_key` — NOT `api_key` — so "Overwrite on live" ticks get through. Only a saved API
// key is refused (`publish-content-types-round-trip.test.ts` pins that half).
test("a publishing token may carry overwrite ticks to /import/plan and /import/execute", async () => {
  const key = await sourceKey();
  const { server, baseUrl } = await startServer(grantDocument(key.publicKeyB64u));
  try {
    const token = await tokenFor(baseUrl);
    const staged = await bundle(baseUrl, token, "post");
    const stagedRaw = await staged.text();
    assert.equal(staged.status, 201, stagedRaw);
    const { bundleId } = JSON.parse(stagedRaw) as { bundleId: string };
    const api = `${baseUrl}/api/admin/v1/workspaces/${WORKSPACE}/publish-content`;
    const headers = { "content-type": "application/json", authorization: `Bearer ${token}` };

    const planned = await fetch(`${api}/import/plan`, {
      method: "POST",
      headers,
      body: JSON.stringify({ bundleId, overwriteEntityKeys: ["post:e-1"] }),
    });
    const plannedRaw = await planned.text();
    assert.equal(planned.status, 200, plannedRaw);

    const executed = await fetch(`${api}/import/execute`, {
      method: "POST",
      headers,
      body: JSON.stringify({ bundleId, confirmationToken: "not-a-real-token", overwriteEntityKeys: ["post:e-1"] }),
    });
    const executedRaw = await executed.text();
    // Past the credential-kind gate: the made-up token is what fails, not who sent the ticks.
    assert.equal(executed.status, 409, executedRaw);
    assert.equal((JSON.parse(executedRaw) as { code: string }).code, "TOKEN_EXPIRED");
  } finally {
    await stop(server);
  }
});

// RED: a real connected-computer session was refused before reaching either artifact route.
test("publishing trust admits only artifact PUT/DELETE in the share namespace", async () => {
  const { deps, token } = await directGateFixture();
  const root = `/api/admin/v1/workspaces/${WORKSPACE}/site-shares`;
  for (const method of ["PUT", "DELETE"]) {
    const call = directGateRequest({ headers: { authorization: `Bearer ${token}` } });
    call.req.method = method;
    call.req.originalUrl = `${root}/artifacts/${"a".repeat(64)}/site.tovu.zip`;
    await requirePublishTrust(deps)(call.req, call.res, call.next);
    assert.deepEqual(call.statuses, []);
    assert.deepEqual(call.nextCalls, [[]]);
    assert.equal(call.res.locals.authCredentialKind, "publish_key");
  }
  for (const [method, suffix] of [["GET", ""], ["POST", ""], ["DELETE", "/id"], ["GET", "/id/download"], ["GET", `/artifacts/${"a".repeat(64)}/site.tovu.zip`]]) {
    const call = directGateRequest({ headers: { authorization: `Bearer ${token}` } });
    call.req.method = method;
    call.req.originalUrl = root + suffix;
    await requirePublishTrust(deps)(call.req, call.res, call.next);
    assert.deepEqual(call.statuses, [401]);
    assert.deepEqual(call.nextCalls, []);
  }
});
