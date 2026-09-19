import assert from "node:assert/strict";
import { hkdfSync } from "node:crypto";
import { once } from "node:events";
import { mkdtemp, writeFile, mkdir } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createApp, createRouteDeps } from "#src/server/runtime/composition/app";
import { buildChallengeMessage } from "#src/features/publish-trust/challenge";
import { PUBLISH_TRUST_GRANT_VERSION } from "#src/features/publish-trust/grant";
import { derivePublishSigningKey } from "#src/features/publish-trust/keys";
import { PUBLISH_TRUST_ENV_VAR } from "#src/features/publish-trust/provisioning";
import { PUBLISH_TRUST_REVOCATIONS_ENV_VAR } from "#src/server/runtime/composition/publish-trust-revocations";
import type { KeyringPort } from "#src/features/webhooks/index";

/**
 * @file Disconnecting a computer, proven through the real app.
 *
 * `features/publish-trust/__tests__/revocations.test.ts` already proves `admitPublish` itself. This
 * file exists because that is not the thing that was broken: the primitive was correct, complete and
 * green, and NOTHING CALLED IT — so "the owner disconnects a computer and the next publish request is
 * refused" was false while every test passed. Every assertion below therefore goes through
 * `createApp()` and a real publish-content route, and fails if the deny store is not consulted on the
 * request path, is consulted in the wrong order, is cached, or is read fail-OPEN.
 *
 * The load-bearing detail in the first test is that the token is minted BEFORE the disconnect and is
 * still cryptographically valid afterwards. A check at session mint would pass that test's first half
 * and fail its second only after a whole session lifetime; here it has to bite on the next request.
 */
const WORKSPACE = "workspace-local";
const SOURCE_ROOT = "1".repeat(64);
const SOURCE_INSTALL = "test-source-install";
const OTHER_INSTALL = "someone-elses-laptop";
const TARGET_ORIGIN = "https://destination.test";
const CAPABILITIES = ["publish_content.read", "publish_content.apply"] as const;
const A_SHA = "a".repeat(64);
const NOW = "2026-09-19T12:00:00.000Z";

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

async function sourceKey() {
  return derivePublishSigningKey({
    keyring: testKeyring(SOURCE_ROOT),
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

/** A deny list as the disconnect action would write it. */
function denyList(...sourceInstallationIds: readonly string[]): string {
  return JSON.stringify(
    sourceInstallationIds.map((sourceInstallationId) => ({ sourceInstallationId, revokedAt: NOW, note: null })),
    null,
    2
  );
}

/** A private directory standing in for the destination's persistent volume. */
async function volume(): Promise<string> {
  return mkdtemp(join(tmpdir(), "tovu-publish-trust-deny-"));
}

/**
 * Starts the real app against one grant document and one deny-list PATH.
 *
 * Both are env vars rather than injected doubles on purpose: this file is here to prove the
 * COMPOSITION, and a test that handed `createApp` its own revocation reader would pass even if
 * `modules/core.ts` never wired one.
 */
async function startServer(options: { grantJson?: string; denyPath: string }) {
  if (options.grantJson === undefined) delete process.env[PUBLISH_TRUST_ENV_VAR];
  else process.env[PUBLISH_TRUST_ENV_VAR] = options.grantJson;
  process.env[PUBLISH_TRUST_REVOCATIONS_ENV_VAR] = options.denyPath;

  const server = createServer(createApp(createRouteDeps()));
  server.listen(0);
  await once(server, "listening");
  const { port } = server.address() as AddressInfo;
  return { server, baseUrl: `http://127.0.0.1:${port}` };
}

async function stop(server: Server): Promise<void> {
  server.close();
  await once(server, "close");
  delete process.env[PUBLISH_TRUST_ENV_VAR];
  delete process.env[PUBLISH_TRUST_REVOCATIONS_ENV_VAR];
}

/** Drives the real three-route handshake and returns the session token. */
async function tokenFor(baseUrl: string): Promise<string> {
  const key = await sourceKey();
  const challengeRes = await fetch(`${baseUrl}/api/publish-trust/v1/challenge`, { method: "POST" });
  const challenge = (await challengeRes.json()) as { nonce: string; targetInstallationId: string };

  const message = buildChallengeMessage({
    nonce: challenge.nonce,
    targetInstallationId: challenge.targetInstallationId,
    sourceInstallationId: SOURCE_INSTALL,
    generation: 1,
    capabilities: CAPABILITIES,
  });

  const sessionRes = await fetch(`${baseUrl}/api/publish-trust/v1/session`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      nonce: challenge.nonce,
      sourceInstallationId: SOURCE_INSTALL,
      generation: 1,
      capabilities: [...CAPABILITIES],
      signatureB64u: key.sign(message),
    }),
  });
  const raw = await sessionRes.text();
  assert.equal(sessionRes.status, 200, raw);
  return (JSON.parse(raw) as { token: string }).token;
}

/** A real publish-content route, reached with a real token. */
function probe(baseUrl: string, token: string): Promise<Response> {
  return fetch(`${baseUrl}/api/admin/v1/workspaces/${WORKSPACE}/publish-content/blobs/probe`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({ shas: [A_SHA] }),
  });
}

/** Asserts a refusal that is the gate's flat 401 — not a 500, and not an HTML error page, either of
 *  which would mean the request path threw rather than decided. */
async function assertRefused(res: Response, context: string): Promise<void> {
  const raw = await res.text();
  assert.equal(res.status, 401, `${context}: ${raw}`);
  assert.deepEqual(JSON.parse(raw), { error: "unauthenticated", code: "UNAUTHENTICATED" }, context);
}

test("disconnecting a computer refuses its NEXT request, with the token already minted and still valid", async () => {
  const key = await sourceKey();
  const denyPath = join(await volume(), "publish-trust-disconnected.json");
  const { server, baseUrl } = await startServer({ grantJson: grantDocument(key.publicKeyB64u), denyPath });
  try {
    // Connected: mint a token and use it. Without this the refusal below proves nothing.
    const token = await tokenFor(baseUrl);
    const before = await probe(baseUrl, token);
    assert.equal(before.status, 200, await before.text());

    // The owner clicks disconnect. Same running process, same unexpired token.
    await writeFile(denyPath, denyList(SOURCE_INSTALL), "utf8");

    await assertRefused(await probe(baseUrl, token), "the next request after a disconnect");
  } finally {
    await stop(server);
  }
});

test("disconnecting one computer leaves another computer publishing", async () => {
  const key = await sourceKey();
  const denyPath = join(await volume(), "publish-trust-disconnected.json");
  const { server, baseUrl } = await startServer({ grantJson: grantDocument(key.publicKeyB64u), denyPath });
  try {
    await writeFile(denyPath, denyList(OTHER_INSTALL), "utf8");
    const token = await tokenFor(baseUrl);
    const res = await probe(baseUrl, token);
    assert.equal(res.status, 200, await res.text());
  } finally {
    await stop(server);
  }
});

test("reconnecting a computer lets it publish again, on the next request", async () => {
  const key = await sourceKey();
  const denyPath = join(await volume(), "publish-trust-disconnected.json");
  const { server, baseUrl } = await startServer({ grantJson: grantDocument(key.publicKeyB64u), denyPath });
  try {
    await writeFile(denyPath, denyList(SOURCE_INSTALL), "utf8");
    const token = await tokenFor(baseUrl);
    await assertRefused(await probe(baseUrl, token), "while disconnected");

    // The owner clicks reconnect, which empties the list.
    await writeFile(denyPath, denyList(), "utf8");
    const res = await probe(baseUrl, token);
    assert.equal(res.status, 200, await res.text());
  } finally {
    await stop(server);
  }
});

test("a disconnected computer is refused even when the grant config is MALFORMED", async () => {
  const denyPath = join(await volume(), "publish-trust-disconnected.json");
  await writeFile(denyPath, denyList(SOURCE_INSTALL), "utf8");

  // Minted against a healthy install, so the token itself is beyond question.
  const key = await sourceKey();
  const healthy = await startServer({ grantJson: grantDocument(key.publicKeyB64u), denyPath: join(await volume(), "none.json") });
  let token: string;
  try {
    token = await tokenFor(healthy.baseUrl);
  } finally {
    await stop(healthy.server);
  }

  const broken = await startServer({ grantJson: "{ not json", denyPath });
  try {
    await assertRefused(await probe(broken.baseUrl, token), "a disconnected computer against a broken grant document");
  } finally {
    await stop(broken.server);
  }
});

test("a disconnected computer is refused even when the grant config is ABSENT", async () => {
  const denyPath = join(await volume(), "publish-trust-disconnected.json");
  await writeFile(denyPath, denyList(SOURCE_INSTALL), "utf8");

  const key = await sourceKey();
  const healthy = await startServer({ grantJson: grantDocument(key.publicKeyB64u), denyPath: join(await volume(), "none.json") });
  let token: string;
  try {
    token = await tokenFor(healthy.baseUrl);
  } finally {
    await stop(healthy.server);
  }

  const unconfigured = await startServer({ grantJson: undefined, denyPath });
  try {
    await assertRefused(await probe(unconfigured.baseUrl, token), "a disconnected computer against an unconfigured install");
  } finally {
    await stop(unconfigured.server);
  }
});

test("a CORRUPT deny list refuses everyone, including a computer that is still connected", async () => {
  const key = await sourceKey();
  const denyPath = join(await volume(), "publish-trust-disconnected.json");
  const { server, baseUrl } = await startServer({ grantJson: grantDocument(key.publicKeyB64u), denyPath });
  try {
    const token = await tokenFor(baseUrl);
    assert.equal((await probe(baseUrl, token)).status, 200, "the connected path must work first");

    // A torn or hand-edited file. Read fail-OPEN this would be a bypass: a corrupt file would read
    // as "nobody is disconnected" and reconnect every computer the owner had disconnected.
    await writeFile(denyPath, "[ { not json", "utf8");
    await assertRefused(await probe(baseUrl, token), "a connected computer against a corrupt deny list");
  } finally {
    await stop(server);
  }
});

test("an UNREADABLE deny list refuses rather than throwing", async () => {
  const key = await sourceKey();
  // A directory where the file belongs: `readFile` raises EISDIR rather than returning anything, so
  // this exercises the throw path that a 500 — and an uncaught skip of the whole decision — hides in.
  const denyPath = join(await volume(), "publish-trust-disconnected.json");
  await mkdir(denyPath);

  const { server, baseUrl } = await startServer({ grantJson: grantDocument(key.publicKeyB64u), denyPath });
  try {
    const token = await tokenFor(baseUrl);
    await assertRefused(await probe(baseUrl, token), "a connected computer against an unreadable deny list");
  } finally {
    await stop(server);
  }
});
