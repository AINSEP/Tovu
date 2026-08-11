import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";

import express from "express";

import type { PagesHtmlDocumentStorePort } from "#src/features/pages/index";
import { registerAdminPageUpdateHtmlRoute } from "#src/server/routes/admin/pages/update-html";
import type { ContentRouteDeps } from "#src/server/routes/admin/content/deps";

/**
 * @file The permission gate on `PUT /pages/:pageId/html` (2026-08-10).
 *
 * **The refusal is the point of this file, not the happy path.** Until this gate landed the route
 * carried no per-action authz at all — its own header said so — while the agent-tool path to the
 * exact same store checked `content.write`. A test that only asserts a 200 for an authorized caller
 * passes identically against a completely ungated route and proves nothing; the assertions that
 * actually pin the gate are the 403 and, more importantly, that the STORE WAS NEVER TOUCHED on a
 * refusal. A 403 that still wrote the row would be worse than no gate, because it would look closed.
 *
 * Harness: a bare `express()` app with this one registrar mounted and fake deps, following
 * `features/post/__tests__/agent-tools.delete-confirmation.test.ts`'s recorded-`authorize` pattern.
 * Deliberately NOT `createApp()` (as `admin-page-html-route.test.ts` uses): that boots the real
 * composition root against the real `content.db` and needs seeded principals and policy rows, none
 * of which this behavior depends on. A recorded fake is also the only way to assert the EXACT
 * permission string the route asks for, which is the thing most likely to silently drift.
 */

const WS = "ws-page-html-auth";
const PRINCIPAL_ID = "principal-under-test";
const PAGE_ID = "page-1";

interface Harness {
  readonly baseUrl: string;
  readonly authorizeCalls: { principalId?: unknown; permission?: unknown; workspaceId?: unknown }[];
  readonly storeCalls: string[];
}

/**
 * Boot the route alone, with `authorize` recorded and the store recording every method it is asked
 * for. `allow` decides the gate's answer.
 */
async function harness(t: { after: (fn: () => Promise<void>) => void }, options: { allow: boolean }): Promise<Harness> {
  const authorizeCalls: Harness["authorizeCalls"] = [];
  const storeCalls: string[] = [];

  const store: PagesHtmlDocumentStorePort = {
    ensureHtmlFormat: async () => {
      storeCalls.push("ensureHtmlFormat");
    },
    read: async () => {
      storeCalls.push("read");
      return "<p>stored</p>";
    },
    write: async () => {
      storeCalls.push("write");
    },
  };

  const deps = {
    workspaceId: WS,
    authorize: async (params: Record<string, unknown>) => {
      authorizeCalls.push(params);
      return options.allow ? { allowed: true, reason: "matched" } : { allowed: false, reason: "insufficient_permission" };
    },
    pagesHtmlStore: () => store,
    postRepo: {
      findById: async () => ({ id: PAGE_ID, kind: "page", bodyFormat: "html", bodyHtml: "<p>stored</p>" }),
    },
  } as unknown as ContentRouteDeps;

  const app = express();
  app.use(express.json());
  // Stands in for `requireAdminSession`, which every /api/admin route already sits behind — this
  // file is about AUTHORIZATION (what an authenticated principal may do), not authentication.
  app.use((_req, res, next) => {
    res.locals.principal = { id: PRINCIPAL_ID };
    next();
  });
  registerAdminPageUpdateHtmlRoute(app, deps);

  const server = createServer(app);
  server.listen(0);
  await once(server, "listening");
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));

  const { port } = server.address() as AddressInfo;
  return { baseUrl: `http://127.0.0.1:${port}`, authorizeCalls, storeCalls };
}

function putHtml(baseUrl: string, body: unknown) {
  return fetch(`${baseUrl}/api/admin/v1/workspaces/${WS}/pages/${PAGE_ID}/html`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

// ---------------------------------------------------------------------------
// The refusal path — the primary certification.
// ---------------------------------------------------------------------------

test("PUT /pages/:id/html REFUSES a principal without content.write: 403 FORBIDDEN, and the store is never touched", async (t) => {
  const { baseUrl, authorizeCalls, storeCalls } = await harness(t, { allow: false });

  const response = await putHtml(baseUrl, { html: "<p>hostile</p>" });
  const body = (await response.json()) as { error: string; code: string; details: { permission: string } };

  assert.equal(response.status, 403, "an unauthorized principal must be refused, not served");
  assert.equal(body.code, "FORBIDDEN");
  assert.equal(body.details.permission, "content.write");
  assert.match(body.error, /is not authorized for 'content\.write'/);

  // The assertion that makes this test worth having. Status codes are cheap; what matters is that
  // no part of the write chain ran. `ensureHtmlFormat` alone would already have CONVERTED the page's
  // body_format and dropped its body_json — a destructive side effect, reached before any write.
  assert.deepEqual(storeCalls, [], "a refused request must not reach the store at all");
  assert.equal(authorizeCalls.length, 1);
});

test("PUT /pages/:id/html asks for exactly 'content.write', scoped to the route's workspace and the authenticated principal", async (t) => {
  const { baseUrl, authorizeCalls } = await harness(t, { allow: false });

  await putHtml(baseUrl, { html: "<p>x</p>" });

  // Pinned literally: `authorize()` matches `policy_permissions` rows by exact string, so a typo or
  // a drift to an unseeded name (e.g. `pages.edit_html`, which no row spells) would not fail loudly
  // — it would silently refuse every principal except `owner`.
  assert.deepEqual(authorizeCalls[0], {
    principalId: PRINCIPAL_ID,
    permission: "content.write",
    workspaceId: WS,
  });
});

test("PUT /pages/:id/html authorizes BEFORE validating the body — an unauthorized caller cannot probe what the endpoint accepts", async (t) => {
  const { baseUrl, storeCalls } = await harness(t, { allow: false });

  // A body that would otherwise earn a 400 VALIDATION_ERROR. The refusal must win.
  const response = await putHtml(baseUrl, { html: { not: "a string" } });

  assert.equal(response.status, 403, "authz must precede validation, so a 400 never leaks endpoint shape to an unauthorized caller");
  assert.deepEqual(storeCalls, []);
});

// ---------------------------------------------------------------------------
// The allow path — present only to prove the gate is a gate and not a wall.
// ---------------------------------------------------------------------------

test("PUT /pages/:id/html still serves an authorized principal, running the full ensureHtmlFormat -> read -> write sequence", async (t) => {
  const { baseUrl, authorizeCalls, storeCalls } = await harness(t, { allow: true });

  const response = await putHtml(baseUrl, { html: "<p>legitimate</p>" });

  assert.equal(response.status, 200, await response.clone().text());
  assert.equal(authorizeCalls.length, 1);
  // Order matters and is asserted, not just membership: `read()` is what captures the version
  // `write()` conditions its compare-and-set on (CIC-1), so a reordering would silently turn the
  // write into an unconditional overwrite.
  assert.deepEqual(storeCalls, ["ensureHtmlFormat", "read", "write"]);
});
