import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { IncomingMessage, ServerResponse } from "node:http";
import { PassThrough } from "node:stream";
import type { Socket } from "node:net";
import { registerAdminSiteShareRoutes } from "../site-shares.js";
import type { RouteDeps } from "#src/server/routes/types";
import { createSiteShareBackend } from "#src/features/site-backup/share-backend";
import { SiteShareRegistry } from "#src/features/site-backup/share-registry";
import { SiteShareRefusal } from "#src/features/site-backup/share-policy";
import { InMemoryKeyring } from "@jini-ai/platform/secrets/testing";
import { AesGcmSecretSealer } from "@jini-ai/platform/secrets";
import { createSiteSavedKeys } from "#src/features/site-backup/saved-keys";
import { zipFolderFiles } from "@jini-ai/agent-plugins/folder-zip";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

async function request(app: express.Express, options: { principal?: string; credential?: string; workspace?: string; shareId?: string; origin?: string; trust?: boolean; fetchSite?: string } = {}) {
  const socket = new PassThrough(), req = new IncomingMessage(socket as unknown as Socket);
  req.method = "POST";
  req.url = `/api/admin/v1/workspaces/${options.workspace ?? "ws"}/site-shares/${options.shareId ?? "00000000-0000-0000-0000-000000000000"}/password`;
  req.headers = { host: "localhost", origin: options.origin ?? "http://localhost", "sec-fetch-site": options.fetchSite ?? "same-origin",
    "x-principal": options.principal ?? "owner", "x-credential": options.credential ?? "session", "x-trust": options.trust ? "yes" : "no" };
  req.push(null);
  const res = new ServerResponse(req); res.assignSocket(socket as unknown as Socket);
  const chunks: Buffer[] = []; socket.on("data", chunk => chunks.push(Buffer.from(chunk)));
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await new Promise<{ status: number; cache: unknown; wire: string }>((resolve, reject) => {
      timer = setTimeout(() => reject(new Error("request timeout")), 2000);
      res.on("finish", () => resolve({ status: res.statusCode, cache: res.getHeader("cache-control"), wire: Buffer.concat(chunks).toString() }));
      app(req, res);
    });
  } finally { clearTimeout(timer); socket.destroy(); }
}

test("only the same-origin browser owner can open this share's real sealed password; every response is no-store", { timeout: 10000 }, async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "share-password-handler-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const registry = new SiteShareRegistry({ directory: root });
  const keyring = new InMemoryKeyring({ hkdfSalt: "password-handler" });
  const sealer = new AesGcmSecretSealer({ keyring });
  const identity = { shareId: "00000000-0000-0000-0000-000000000000", workspaceId: "ws" };
  const password = "private-export-password";
  const sealedPassword = await sealer.seal({ plaintext: password, key: await keyring.activeKey({}), aad: JSON.stringify(["tovu-share-password", 1, "ws", identity.shareId]) });
  await registry.put({ record: { shareId: identity.shareId, site: "ws", token: "ABCDEFGHIJKLMNOP", file: "site.tovu.zip", bytes: 12, sha256: "a".repeat(64), url: null,
    status: "active", createdAt: "2026-10-31T00:00:00Z", revokedAt: null, hasEncryptedKeys: true, sealedPassword } });
  const unexpected = async (): Promise<never> => { throw new Error("Unrelated export/import operation invoked"); };
  const savedKeys = createSiteSavedKeys({ workspaceId: "ws", sealer });
  const backend = createSiteShareBackend({ registry, site: "ws", zip: zipFolderFiles, prepare: unexpected, delivery: async () => undefined, ownerPrincipalId: "owner", savedKeys });
  const app = express();
  app.use((req, res, next) => {
    // This seam represents the existing session gate's output; crypto, registry and backend are real.
    res.locals.principal = { id: req.get("x-principal") };
    res.locals.authCredentialKind = req.get("x-credential");
    if (req.get("x-trust") === "yes") res.locals.publishTrust = { sourceInstallationId: "peer", capabilities: [] };
    next();
  });
  registerAdminSiteShareRoutes({ app, deps: { workspaceId: "ws", ownerPrincipalId: Promise.resolve("owner"), siteShareBackend: backend, authorize: async () => ({ allowed: true }) } as unknown as RouteDeps });
  for (const options of [{ principal: "admin" }, { credential: "api_key" }, { credential: "publish_key" }, { credential: "tool" }, { credential: "connected_computer" }, { trust: true }, { origin: "https://localhost" }, { origin: "null" }, { fetchSite: "cross-site" }]) {
    const response = await request(app, options);
    assert.equal(response.status, 403);
    assert.equal(response.cache, "no-store");
    assert.equal(response.wire.includes(password), false);
  }
  assert.equal((await request(app, { workspace: "other" })).status, 404);
  assert.equal((await request(app, { shareId: "00000000-0000-0000-0000-000000000001" })).status, 404);
  const revealed = await request(app);
  assert.equal(revealed.status, 200); assert.equal(revealed.cache, "no-store"); assert.equal(revealed.wire.includes(password), true);
  const listing = JSON.stringify(await backend.list({}));
  assert.equal(listing.includes(password), false); assert.equal(listing.includes(sealedPassword.ciphertext), false);
  await registry.disable({ shareId: identity.shareId, site: "ws" });
  assert.equal((await request(app)).status, 404);
});
