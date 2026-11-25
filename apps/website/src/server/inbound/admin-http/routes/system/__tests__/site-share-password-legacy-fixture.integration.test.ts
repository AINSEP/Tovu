/**
 * A share password sealed by the ORIGINAL export code, opened through today's combined route:
 * browser-only owner POST …/site-shares/:shareId/password → host share backend binding → engine
 * `revealPassword` → host `composeSiteSavedKeys` → real AES-256-GCM over the site keyring.
 *
 * Fixture provenance (frozen bytes, test key material only, no real secret). Generated ONCE by running
 * the historical code itself, not a re-implementation of it:
 * - AAD: `passwordAad` copied verbatim from Tovu `6b9c36568:apps/website/src/features/site-backup/saved-keys.ts`
 *   (`JSON.stringify(["tovu-share-password", 1, workspaceId, shareId])`); its `capture` sealed with
 *   `deps.sealer.seal({ plaintext: password, key: await deps.keyring.activeKey({}), aad: passwordAad(input) })`
 *   where `password = randomBytes(24).toString("base64url")` (here 24 FIXED bytes 0xa0..0xb7, same shape).
 * - Sealer + keyring: Jini `302c7db42:packages/platform/src/secrets/{secret-sealer.aesgcm.ts,keyring.env.ts}`,
 *   i.e. `AesGcmSecretSealer` over `FixedRootKeyKeyring({ hex, hkdfSalt: "tovu-integrations-root-key-hkdf-v1" }, { keyId: "v1" })`
 *   (what the historical `EnvOrFileKeyring`/`FixedSiteKeyKeyring` resolved to), root key bytes 0x40..0x5f, and a
 *   fixed 12-byte IV of 0x0b via the sealer's own `randomBytesFn` option so the literal is reproducible.
 * - The historical sealer's `open` was run on the result with the same AAD and returned the password.
 * The format did not change between then and now (same alg, IV length, ciphertext||tag base64, HKDF info),
 * which is exactly what this frozen blob proves on every run.
 */
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { IncomingMessage, ServerResponse } from "node:http";
import type { Socket } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { PassThrough } from "node:stream";
import test, { type TestContext } from "node:test";
import express from "express";
import { zipFolderFiles } from "@jini-ai/agent-plugins/folder-zip";
import { AesGcmSecretSealer } from "@jini-ai/platform/secrets";
import { FixedSiteKeyKeyring } from "#src/features/webhooks/keyring.env";
import { composeSiteSavedKeys } from "#src/server/runtime/composition/site-portability";
import { registerAdminSiteShareRoutes } from "#src/server/runtime/composition/modules/system-site-shares";
import type { RouteDeps } from "#src/server/routes/types";
import { createBundledExportFilePolicy } from "#src/features/site-backup/bundled-export-file-policy";
import { SELECTED_AGENT_PLUGIN_PACKAGES } from "#src/features/agent-plugins/bundled-catalog";
import { createSiteShareBackend } from "#src/features/site-backup/share-backend";
import { SiteShareRegistry } from "#src/features/site-backup/share-registry";

const LEGACY_ROOT_KEY_HEX = "404142434445464748494a4b4c4d4e4f505152535455565758595a5b5c5d5e5f";
const LEGACY_SHARE_ID = "00000000-0000-4000-8000-00000000c0de";
const LEGACY_PASSWORD = "oKGio6SlpqeoqaqrrK2ur7CxsrO0tba3";
const LEGACY_SEALED_PASSWORD = { keyId: "v1", ciphertext: "3wFLc5HNvowc0qGp4aEr4ENZ17HV+2oSUhtLLzZPt/vVXe68YqtKQfbhd0XZW0Ns", nonce: "CwsLCwsLCwsLCwsL", alg: "aes-256-gcm" } as const;
const EXPIRES_AT = "2026-12-01T00:00:00.000Z";

async function post(app: express.Express, url: string) {
  const socket = new PassThrough(), req = new IncomingMessage(socket as unknown as Socket);
  req.method = "POST"; req.url = url; req.headers = { host: "localhost", origin: "http://localhost", "sec-fetch-site": "same-origin" };
  Object.assign(req, { body: {} }); req.push(null);
  const res = new ServerResponse(req); res.assignSocket(socket as unknown as Socket);
  const chunks: Buffer[] = []; socket.on("data", c => chunks.push(Buffer.from(c)));
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await new Promise<{ status: number; wire: string; body: string }>((resolve, reject) => {
      timer = setTimeout(() => reject(new Error("request timed out")), 5000);
      res.on("finish", () => { const wire = Buffer.concat(chunks).toString(); resolve({ status: res.statusCode, wire, body: wire.slice(wire.indexOf("\r\n\r\n") + 4) }); });
      app(req, res);
    });
  } finally { clearTimeout(timer); socket.destroy(); }
}

/** The production pieces with only the clock, the directory and the TEST root key injected. */
async function legacyRoute(t: TestContext, { shareId = LEGACY_SHARE_ID }: { shareId?: string } = {}) {
  const directory = await mkdtemp(path.join(tmpdir(), "share-legacy-fixture-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const clock = { now: Date.parse("2026-11-20T00:00:00Z") };
  const now = () => clock.now;
  const registry = new SiteShareRegistry({ directory, now });
  await registry.put({ record: { shareId, site: "ws", token: "ABCDEFGHIJKLMNOP", file: "site.tovu.zip", bytes: 12, sha256: "a".repeat(64), url: null,
    status: "active", createdAt: "2026-11-01T00:00:00Z", revokedAt: null, hasEncryptedKeys: true, expiresAt: EXPIRES_AT, sealedPassword: LEGACY_SEALED_PASSWORD } });
  const sealer = new AesGcmSecretSealer({ keyring: new FixedSiteKeyKeyring({ hex: LEGACY_ROOT_KEY_HEX }) });
  const unexpected = async (): Promise<never> => { throw new Error("export must not run"); };
  const siteShareBackend = createSiteShareBackend({ createBundledFilePolicy: () => createBundledExportFilePolicy({ selection: SELECTED_AGENT_PLUGIN_PACKAGES }), registry, site: "ws",
    zip: zipFolderFiles, prepare: unexpected, delivery: async () => undefined, ownerPrincipalId: Promise.resolve("owner"), savedKeys: composeSiteSavedKeys({ workspaceId: "ws", sealer }) }, { now });
  const app = express();
  app.use((_req, res, next) => { res.locals.principal = { id: "owner" }; res.locals.authCredentialKind = "session"; next(); });
  registerAdminSiteShareRoutes({ app, deps: { workspaceId: "ws", ownerPrincipalId: Promise.resolve("owner"), authorize: async () => ({ allowed: true }), siteShareBackend } as unknown as RouteDeps });
  return { app, registry, clock, url: `/api/admin/v1/workspaces/ws/site-shares/${shareId}/password` };
}

test("a pre-move sealed share password is revealed through the browser-only route while the share has not expired", async t => {
  const { app, url } = await legacyRoute(t);
  const revealed = await post(app, url);
  assert.equal(revealed.status, 200, revealed.wire);
  assert.deepEqual(JSON.parse(revealed.body), { password: LEGACY_PASSWORD });
});

test("the legacy blob stays bound to its own share id: copied onto another share it does not open", async t => {
  const { app, url } = await legacyRoute(t, { shareId: "00000000-0000-4000-8000-00000000beef" });
  const refused = await post(app, url);
  assert.notEqual(refused.status, 200);
  assert.equal(refused.wire.includes(LEGACY_PASSWORD), false);
});

test("once the share's expiry has passed, the route refuses to reveal the legacy password", async t => {
  const { app, url, clock } = await legacyRoute(t);
  clock.now = Date.parse(EXPIRES_AT);
  const refused = await post(app, url);
  assert.equal(refused.status, 400, refused.wire);
  assert.equal(JSON.parse(refused.body).code, "EXPIRED");
  assert.equal(refused.wire.includes(LEGACY_PASSWORD), false);
});

test("an expiry tombstone written by retention refuses the reveal even if the clock reads earlier", async t => {
  const { app, url, registry } = await legacyRoute(t);
  await registry.markExpired({ shareId: LEGACY_SHARE_ID, expiresAt: EXPIRES_AT });
  const refused = await post(app, url);
  assert.equal(refused.status, 400, refused.wire);
  assert.equal(JSON.parse(refused.body).code, "EXPIRED");
  assert.equal(refused.wire.includes(LEGACY_PASSWORD), false);
});
