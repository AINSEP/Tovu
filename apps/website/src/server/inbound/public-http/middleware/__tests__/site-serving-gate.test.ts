import assert from "node:assert/strict";
import test from "node:test";

import express from "express";
import type { NextFunction, Request, Response } from "express";

import type { SiteStatusPort } from "#src/features/database/boot/reconcile-interrupted-migration";
import { startTestServer } from "../../../../__tests__/helpers/http-test-server.js";
import { applySiteServingGate } from "../site-serving-gate.js";

/**
 * @file `applySiteServingGate` — direct coverage of the allow-list and the store-failure path.
 *
 * `database-migration-reconciliation-boot.integration.test.ts` already proves the block bites on a
 * normal admin route and on `/admin-news`, and that `/healthz`, `/api/admin/v1/recovery/status`,
 * `/admin` and `/admin/settings` stay reachable. Not pinned anywhere: `/readyz` and the auth routes
 * (an operator who must log in to reach Recovery), the workspace id the status is read for, and
 * what happens when the status store itself fails.
 *
 * A rejected store read must reach the app's error handler, because Express 4 does not handle
 * rejected middleware promises. Port test, not run in the Codex sandbox.
 */

function statusPort(status: string, seen: string[] = []): SiteStatusPort {
  return {
    get: async (siteId: string) => {
      seen.push(siteId);
      return status as Awaited<ReturnType<SiteStatusPort["get"]>>;
    },
    set: async () => undefined,
  };
}

async function boot(t: import("node:test").TestContext, port: SiteStatusPort, errors: unknown[] = []): Promise<string> {
  const app = express();
  applySiteServingGate(app, { siteStatusRepo: port, workspaceId: "ws-gate-1" });
  app.use((req, res) => res.status(200).json({ reached: req.path }));
  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    errors.push(error);
    res.status(500).json({ error: "internal error" });
  });
  return startTestServer(app, t);
}

test("blocked: login, readyz and the Recovery API stay reachable so an operator can sign in and resolve it", async (t) => {
  const baseUrl = await boot(t, statusPort("BLOCKED_PENDING_RECOVERY"));

  for (const p of ["/readyz", "/healthz", "/api/admin/v1/auth/login", "/api/admin/v1/auth/me", "/api/admin/v1/recovery/restore/plan"]) {
    const res = await fetch(`${baseUrl}${p}`);
    assert.equal(res.status, 200, `${p} must pass the gate`);
    assert.deepEqual(await res.json(), { reached: p });
  }
});

test("blocked: paths that only LOOK like allowed prefixes are refused with the gate's own 503", async (t) => {
  const baseUrl = await boot(t, statusPort("BLOCKED_PENDING_RECOVERY"));

  for (const p of ["/api/admin/v1/authx", "/api/admin/v1/recoveryx/status", "/readyzz", "/", "/api/admin/v1/database/timeline"]) {
    const res = await fetch(`${baseUrl}${p}`);
    assert.equal(res.status, 503, `${p} must be blocked`);
    assert.deepEqual(await res.json(), {
      error: "this site is blocked pending recovery from an interrupted migration — see /api/admin/v1/recovery/status",
      code: "SITE_BLOCKED_PENDING_RECOVERY",
    });
  }
});

test("not blocked: every path passes, and the status is read for the configured workspace id", async (t) => {
  const seen: string[] = [];
  const baseUrl = await boot(t, statusPort("SERVING", seen));

  const res = await fetch(`${baseUrl}/some-page`);

  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { reached: "/some-page" });
  assert.deepEqual(seen, ["ws-gate-1"]);
});

test("allow-listed paths never read the status store at all", async (t) => {
  const seen: string[] = [];
  const baseUrl = await boot(t, statusPort("BLOCKED_PENDING_RECOVERY", seen));

  await fetch(`${baseUrl}/healthz`);
  await fetch(`${baseUrl}/admin/settings`);

  assert.deepEqual(seen, []);
});

test("a rejected status read completes with 500 through the app's error handler", async (t) => {
  const failure = new Error("database is locked");
  const errors: unknown[] = [];
  const throwing: SiteStatusPort = {
    get: async () => {
      throw failure;
    },
    set: async () => undefined,
  };
  const baseUrl = await boot(t, throwing, errors);

  const res = await fetch(`${baseUrl}/some-page`, { signal: AbortSignal.timeout(2000) });

  assert.equal(res.status, 500);
  assert.deepEqual(await res.json(), { error: "internal error" });
  assert.deepEqual(errors, [failure]);
});
