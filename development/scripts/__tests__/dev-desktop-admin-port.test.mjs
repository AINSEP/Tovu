import assert from "node:assert/strict";
import net from "node:net";
import test from "node:test";

import { isPortFree, pickFreePort } from "../free-port.mjs";
import { DESKTOP_ADMIN_VITE_BASE_PORT, resolveDesktopAdminVitePort } from "../dev-desktop.mjs";

/**
 * @file `npm run desktop` and `npm run dev` used to fight over :5173: both defaulted the admin Vite
 * to the same port, so whichever started second could not get it (`dev.mjs`'s preflight refused to
 * start the web stack while a desktop's Vite held it). The desktop now picks its own free port from
 * {@link DESKTOP_ADMIN_VITE_BASE_PORT} upward, leaving :5173 to the web stack.
 *
 * Run with: `node --test development/scripts/__tests__/dev-desktop-admin-port.test.mjs`.
 */

/** A fake `isPortFree` that reports every port in `busy` as taken. */
function fakeIsPortFree(busy) {
  const asked = [];
  const check = async (port) => {
    asked.push(port);
    return !busy.includes(port);
  };
  return { check, asked };
}

test("the desktop's admin Vite base port is not the web stack's :5173", () => {
  assert.notEqual(DESKTOP_ADMIN_VITE_BASE_PORT, 5173);
});

test("pickFreePort: returns the first port in the range the check reports free", async () => {
  const { check, asked } = fakeIsPortFree([5273, 5274]);
  assert.equal(await pickFreePort({ start: 5273, span: 10 }, { isPortFree: check }), 5275);
  assert.deepEqual(asked, [5273, 5274, 5275]);
});

test("pickFreePort: returns null when every port in the range is taken, without probing past it", async () => {
  const { check, asked } = fakeIsPortFree([5273, 5274, 5275]);
  assert.equal(await pickFreePort({ start: 5273, span: 3 }, { isPortFree: check }), null);
  assert.deepEqual(asked, [5273, 5274, 5275]);
});

test("resolveDesktopAdminVitePort: with no TOVU_ADMIN_DEV_PORT, picks a free port from the desktop base, never 5173", async () => {
  const { check } = fakeIsPortFree([]);
  assert.deepEqual(await resolveDesktopAdminVitePort({ env: {} }, { isPortFree: check }), {
    port: DESKTOP_ADMIN_VITE_BASE_PORT,
    source: "picked",
  });
});

test("resolveDesktopAdminVitePort: a second desktop instance skips the first one's port", async () => {
  const { check } = fakeIsPortFree([DESKTOP_ADMIN_VITE_BASE_PORT]);
  assert.deepEqual(await resolveDesktopAdminVitePort({ env: {} }, { isPortFree: check }), {
    port: DESKTOP_ADMIN_VITE_BASE_PORT + 1,
    source: "picked",
  });
});

test("resolveDesktopAdminVitePort: an explicit TOVU_ADMIN_DEV_PORT is honored verbatim and never probed", async () => {
  const { check, asked } = fakeIsPortFree([]);
  assert.deepEqual(await resolveDesktopAdminVitePort({ env: { TOVU_ADMIN_DEV_PORT: "5173" } }, { isPortFree: check }), {
    port: 5173,
    source: "env",
  });
  assert.deepEqual(asked, []);
});

test("resolveDesktopAdminVitePort: a blank TOVU_ADMIN_DEV_PORT counts as unset", async () => {
  const { check } = fakeIsPortFree([]);
  const resolved = await resolveDesktopAdminVitePort({ env: { TOVU_ADMIN_DEV_PORT: "  " } }, { isPortFree: check });
  assert.equal(resolved?.source, "picked");
});

test("resolveDesktopAdminVitePort: null when the whole desktop range is taken", async () => {
  const resolved = await resolveDesktopAdminVitePort({ env: {} }, { isPortFree: async () => false });
  assert.equal(resolved, null);
});

test("isPortFree: a port with a live IPv4 listener is not free; the same port after close is", async () => {
  const server = net.createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  assert.equal(await isPortFree(port), false);
  await new Promise((resolve) => server.close(resolve));
  assert.equal(await isPortFree(port), true);
});

test("isPortFree: a port held only on ::1 is not free — Vite binds `localhost`, which is ::1 here", async (t) => {
  const server = net.createServer();
  const bound = await new Promise((resolve) => {
    server.once("error", () => resolve(false));
    server.listen(0, "::1", () => resolve(true));
  });
  if (!bound) return t.skip("no IPv6 loopback on this machine");
  const { port } = server.address();
  try {
    assert.equal(await isPortFree(port), false);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
