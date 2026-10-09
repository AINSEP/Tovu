import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { registerAdminThemePreviewRoute } from "../preview.js";
import { extractRouteHandler } from "#src/server/__tests__/helpers/http-test-server";
import type { SitePreviewService, SitePreviewTarget } from "#src/features/sites/index";

const ROUTE = "/api/admin/v1/workspaces/:workspaceId/themes/:themeId/preview";

function theme(id: string, { tier = "static", pages = { index: "<main></main>" }, dir = `/themes/${id}` }: { tier?: string; pages?: Record<string, string>; dir?: string } = {}) {
  return { status: "valid", manifest: { id, tier }, dir, pages };
}

/** A capture queue whose stored versions live in a map; `capture` decides what a drain writes. */
function fakeService({ stored = {}, capture = () => 5_000 }: { stored?: Record<string, number>; capture?: (target: SitePreviewTarget) => number | null } = {}) {
  const versions = new Map(Object.entries(stored));
  const enqueued: SitePreviewTarget[] = [];
  const pending: SitePreviewTarget[] = [];
  const service: SitePreviewService = {
    versions({ sites, targets }) {
      const result: Record<string, number> = {};
      for (const site of sites) {
        const version = versions.get(site.name);
        if (version !== undefined && !(Date.parse(site.createdAt) > version)) result[site.name] = version;
      }
      for (const target of targets) {
        if (result[target.name] === undefined) { enqueued.push(target); pending.push(target); }
      }
      return result;
    },
    read: ({ name }) => (versions.has(name) ? Buffer.from(`jpeg:${name}:${versions.get(name)}`) : null),
    async idle() {
      for (let target = pending.shift(); target; target = pending.shift()) {
        const written = capture(target);
        if (written !== null) versions.set(target.name, written);
      }
    },
  };
  return { service, enqueued };
}

function response() {
  const capture: { status?: number; headers?: Record<string, string>; body?: unknown; json?: unknown; redirect?: [number, string] } = {};
  const res = {
    locals: { principal: { id: "operator" } } as Record<string, unknown>,
    status(code: number) { capture.status = code; return res; },
    set(headers: Record<string, string>) { capture.headers = { ...capture.headers, ...headers }; return res; },
    send(body: unknown) { capture.body = body; return res; },
    json(body: unknown) { capture.json = body; return res; },
    redirect(status: number, url: string) { capture.redirect = [status, url]; return res; },
  };
  return { res, capture };
}

function route({ themes = [theme("editorial-rose")], service, allowed = true, contentVersion = 1_000, shipped = null as string | null }: {
  themes?: ReturnType<typeof theme>[]; service?: SitePreviewService; allowed?: boolean; contentVersion?: number; shipped?: string | null;
} = {}) {
  const app = express();
  registerAdminThemePreviewRoute(
    { app, deps: { workspaceId: "ws", authorize: async () => ({ allowed, reason: "test" }), themes: themes as never, themePreviews: service ?? null } },
    { contentVersion: () => contentVersion, shippedImage: () => shipped, waitMs: 50 },
  );
  const handler = extractRouteHandler(app, "get", ROUTE);
  return async (themeId: string, workspaceId = "ws") => {
    const { res, capture } = response();
    await handler({ params: { workspaceId, themeId }, socket: { localPort: 3000, encrypted: true } }, res as never);
    return capture;
  };
}

test("a capture taken after the theme's last edit is served as-is, with no new capture queued", async () => {
  const { service, enqueued } = fakeService({ stored: { "editorial-rose": 2_000 } });
  const got = await route({ service, contentVersion: 1_000 })("editorial-rose");
  assert.equal(got.status, 200);
  assert.equal(String(got.body), "jpeg:editorial-rose:2000");
  assert.equal(got.headers?.["Content-Type"], "image/jpeg");
  assert.equal(got.headers?.["Cache-Control"], "private, max-age=31536000, immutable");
  assert.deepEqual(enqueued, []);
});

test("a theme edited (or copied, created, imported) after its capture is re-captured from its OWN render first", async () => {
  // Root cause: a copied theme's only picture was its source's `screenshots/`, never its own look.
  const { service, enqueued } = fakeService({ stored: { "editorial-rose": 500 }, capture: () => 9_000 });
  const got = await route({ service, contentVersion: 1_000 })("editorial-rose");
  assert.deepEqual(enqueued, [{ name: "editorial-rose", url: "https://localhost:3000/theme-explore/editorial-rose/index", lifecycle: "1000" }]);
  assert.equal(got.status, 200);
  assert.equal(String(got.body), "jpeg:editorial-rose:9000");
});

test("a theme without an index page is captured at its first page", async () => {
  const { service, enqueued } = fakeService();
  await route({ service, themes: [theme("one-pager", { pages: { home: "<main></main>" } })] })("one-pager");
  assert.equal(enqueued[0]?.url, "https://localhost:3000/theme-explore/one-pager/home");
});

test("when no capture can be made the card falls back to the shipped screenshot, uncached, else 404", async () => {
  const failing = fakeService({ capture: () => null });
  const fallback = await route({ service: failing.service, shipped: "/theme-assets/editorial-rose/screenshots/index.png" })("editorial-rose");
  assert.deepEqual(fallback.redirect, [302, "/theme-assets/editorial-rose/screenshots/index.png"]);
  assert.equal(fallback.headers?.["Cache-Control"], "no-store");
  const none = await route({ service: failing.service })("editorial-rose");
  assert.equal(none.status, 404);
  assert.equal(none.headers?.["Cache-Control"], "no-store");
  // Captures off (production, install-dir boot): the shipped screenshot, without touching a queue.
  assert.deepEqual((await route({ shipped: "/theme-assets/editorial-rose/screenshots/index.png" })("editorial-rose")).redirect,
    [302, "/theme-assets/editorial-rose/screenshots/index.png"]);
});

test("a capture that outlasts the wait is not awaited: the fallback answers and the capture lands for next time", async () => {
  const slow: SitePreviewService = { versions: () => ({}), read: () => null, idle: () => new Promise(() => {}) };
  const got = await route({ service: slow })("editorial-rose");
  assert.equal(got.status, 404);
});

test("unknown, invalid and non-static themes, another workspace, and a denied caller never reach the queue", async () => {
  const { service, enqueued } = fakeService();
  const get = route({ service, themes: [theme("editorial-rose"), theme("shop", { tier: "templated" }), { ...theme("broken"), status: "invalid" }] });
  assert.equal((await get("missing")).status, 404);
  assert.equal((await get("shop")).status, 404);
  assert.equal((await get("broken")).status, 404);
  assert.equal((await get("editorial-rose", "other")).status, 404);
  assert.equal((await route({ service, allowed: false })("editorial-rose")).status, 403);
  assert.deepEqual(enqueued, []);
});
