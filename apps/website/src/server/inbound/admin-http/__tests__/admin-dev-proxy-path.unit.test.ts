import assert from "node:assert/strict";
import test from "node:test";

import { resolveAdminDevProxyPath } from "../admin-dev-proxy.js";

/**
 * @file Pure-function coverage for `resolveAdminDevProxyPath` — the bare-`/admin` fix the dev proxy
 * needs because Vite's `base: "/admin/"` only falls through to `index.html` on an exact match,
 * trailing slash included (confirmed against the installed Vite 7.3.6 source; see `admin-dev-proxy.ts`'s
 * module doc). Split from `admin-dev-proxy.test.ts`'s real-server integration tests since this needs
 * no server at all.
 */

test("resolveAdminDevProxyPath: rewrites a bare /admin to /admin/", () => {
  assert.equal(resolveAdminDevProxyPath("/admin"), "/admin/");
});

test("resolveAdminDevProxyPath: preserves the query string when rewriting a bare /admin", () => {
  assert.equal(resolveAdminDevProxyPath("/admin?foo=bar"), "/admin/?foo=bar");
});

test("resolveAdminDevProxyPath: leaves /admin/ (already exact) unchanged", () => {
  assert.equal(resolveAdminDevProxyPath("/admin/"), "/admin/");
});

test("resolveAdminDevProxyPath: leaves an /admin/* subpath unchanged", () => {
  assert.equal(resolveAdminDevProxyPath("/admin/src/main.tsx?t=1"), "/admin/src/main.tsx?t=1");
});

test("resolveAdminDevProxyPath: does not mistake a longer path for the bare /admin case", () => {
  // A naive `startsWith("/admin")` check would wrongly match this; the rewrite must compare the
  // exact pathname, not a prefix.
  assert.equal(resolveAdminDevProxyPath("/adminfoo"), "/adminfoo");
});
