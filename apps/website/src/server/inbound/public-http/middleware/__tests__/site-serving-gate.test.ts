import assert from "node:assert/strict";
import test from "node:test";

import express from "express";

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
 * The last one is a real defect (marked BUG below): the middleware is an `async` function with no
 * `try`/`catch`, and Express 4 does not handle a rejected middleware promise, so a store read that
 * throws leaves EVERY request on the site hanging until the client gives up, instead of a fast
 * error. Kept as a `todo` test so it reports without failing the shared suite.
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

async function boot(t: import("node:test").TestContext, port: SiteStatusPort): Promise<string> {
  const app = express();
  applySiteServingGate(app, { siteStatusRepo: port, workspaceId: "ws-gate-1" });
  app.use((req, res) => res.status(200).json({ reached: req.path }));
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

test(
  "BUG: a status store that throws answers the request with an error status instead of hanging it",
  { todo: "site-serving-gate.ts: async middleware has no try/catch; Express 4 drops the rejection and the request hangs" },
  async (t) => {
    const throwing: SiteStatusPort = {
      get: async () => {
        throw new Error("database is locked");
      },
      set: async () => undefined,
    };
    const baseUrl = await boot(t, throwing);

    const res = await fetch(`${baseUrl}/some-page`, { signal: AbortSignal.timeout(2000) });

    assert.ok(res.status >= 500, `expected a 5xx, got ${res.status}`);
  }
);
