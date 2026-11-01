/** k1: optional saved keys password stays on the existing private owner-setup endpoint. */
import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { IncomingMessage, ServerResponse } from "node:http";
import type { Socket } from "node:net";
import { PassThrough } from "node:stream";
import { registerAdminSiteImportRoutes } from "../site-imports.js";
import type { RouteDeps } from "#src/server/routes/types";

test("owner setup accepts the optional password without echoing or caching it", { timeout: 120000 }, async () => {
  const calls: unknown[] = [];
  const pending = { importId: "import", status: "needs-owner", state: "needs-owner", hasEncryptedKeys: true };
  const app = express();
  app.use((_req, res, next) => { res.locals.principal = { id: "owner" }; res.locals.authCredentialKind = "session"; next(); });
  registerAdminSiteImportRoutes({ app, deps: { workspaceId: "ws", authorize: async () => ({ allowed: true }), siteImportBackend: {
    get: () => pending,
    completeOwner: async (input: unknown) => { calls.push(input); return { ...pending, status: "ready", state: "ready" }; },
  } } as unknown as RouteDeps });
  const socket = new PassThrough(), req = new IncomingMessage(socket as unknown as Socket);
  req.method = "POST"; req.url = "/api/admin/v1/workspaces/ws/site-imports/import/owner";
  req.headers = { host: "localhost", origin: "http://localhost" };
  Object.assign(req, { body: { adminPassword: "new-owner-password", savedKeysPassword: "separate-saved-keys-password" } }); req.push(null);
  const res = new ServerResponse(req); res.assignSocket(socket as unknown as Socket);
  const chunks: Buffer[] = []; socket.on("data", c => chunks.push(Buffer.from(c)));
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await new Promise<void>((resolve, reject) => {
      timer = setTimeout(() => reject(new Error("request timed out")), 2000);
      res.on("finish", resolve); app(req, res);
    });
    assert.equal(res.statusCode, 200); assert.equal(res.getHeader("cache-control"), "no-store");
    assert.deepEqual(calls, [{ principalId: "owner", importId: "import", adminPassword: "new-owner-password", savedKeysPassword: "separate-saved-keys-password" }]);
    assert.equal(Buffer.concat(chunks).toString().includes("separate-saved-keys-password"), false);
  } finally { clearTimeout(timer); socket.destroy(); }
});
