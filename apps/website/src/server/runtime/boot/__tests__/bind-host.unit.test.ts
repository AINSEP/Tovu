import assert from "node:assert/strict";
import test from "node:test";

import { resolveBindHost, isLoopbackHost, DEFAULT_LOCAL_BIND_HOST } from "../bind-host.js";
import { ValidationError } from "../../../../platform/site-dir/index.js";

/**
 * @file Coverage for `bind-host.ts` — the pure `TOVU_HOST` resolver shared by `tovu serve`
 * (`cli/commands/serve.ts`) and the container entry point (`index.ts`).
 *
 * Pinned here (see `ADS-memory/.local-artifacts/lan-bind-plan-2026-09-23.md`'s Decision):
 *   - unset/blank `TOVU_HOST`               → the caller's own fallback, unchanged;
 *   - an IP literal (`net.isIP`)             → passed through verbatim;
 *   - `"::"` (Node's own dual-stack default) → `undefined`, so `.listen()` falls back to it itself;
 *   - a hostname (`localhost`, `my host`)    → `ValidationError` with EXACT wording, because a
 *     server bound to `127.0.0.1` refuses a Node client that dials `localhost` and resolves `::1`
 *     first on this machine (Unknown 4) — accepting a hostname here would silently reintroduce
 *     that trap for a value that LOOKS like it should work.
 *
 * `isLoopbackHost` backs the non-loopback stderr warning `serve.ts` prints when `TOVU_HOST` widens
 * exposure — it must recognize every loopback form (`127.0.0.1`, other `127.x.x.x`, `::1`), not
 * just the one literal `resolveBindHost` defaults to.
 */

test("resolveBindHost: {} with fallback '127.0.0.1' returns the fallback", () => {
  assert.equal(resolveBindHost({}, "127.0.0.1"), "127.0.0.1");
});

test("resolveBindHost: {} with fallback undefined returns undefined", () => {
  assert.equal(resolveBindHost({}, undefined), undefined);
});

test("resolveBindHost: a whitespace-only TOVU_HOST is treated as unset -- returns the fallback", () => {
  assert.equal(resolveBindHost({ TOVU_HOST: "  " }, "127.0.0.1"), "127.0.0.1");
});

test("resolveBindHost: '0.0.0.0' passes through verbatim", () => {
  assert.equal(resolveBindHost({ TOVU_HOST: "0.0.0.0" }, "127.0.0.1"), "0.0.0.0");
});

test("resolveBindHost: an arbitrary IPv4 literal passes through verbatim", () => {
  assert.equal(resolveBindHost({ TOVU_HOST: "192.168.1.5" }, "127.0.0.1"), "192.168.1.5");
});

test("resolveBindHost: '::1' passes through verbatim", () => {
  assert.equal(resolveBindHost({ TOVU_HOST: "::1" }, "127.0.0.1"), "::1");
});

test("resolveBindHost: '::' resolves to undefined (Node's own all-interfaces default)", () => {
  assert.equal(resolveBindHost({ TOVU_HOST: "::" }, "127.0.0.1"), undefined);
});

test("resolveBindHost: 'localhost' throws ValidationError with the exact documented text", () => {
  assert.throws(
    () => resolveBindHost({ TOVU_HOST: "localhost" }, "127.0.0.1"),
    (err: unknown) => {
      assert.ok(err instanceof ValidationError);
      assert.equal(err.message, 'TOVU_HOST must be an IP address such as 127.0.0.1 or 0.0.0.0 (got "localhost")');
      return true;
    }
  );
});

test("resolveBindHost: a hostname with a space throws ValidationError naming the given value", () => {
  assert.throws(
    () => resolveBindHost({ TOVU_HOST: "my host" }, "127.0.0.1"),
    (err: unknown) => {
      assert.ok(err instanceof ValidationError);
      assert.equal(err.message, 'TOVU_HOST must be an IP address such as 127.0.0.1 or 0.0.0.0 (got "my host")');
      return true;
    }
  );
});

test("isLoopbackHost: 127.0.0.1 is loopback", () => {
  assert.equal(isLoopbackHost("127.0.0.1"), true);
});

test("isLoopbackHost: another 127.x.x.x literal is loopback", () => {
  assert.equal(isLoopbackHost("127.5.0.1"), true);
});

test("isLoopbackHost: ::1 is loopback", () => {
  assert.equal(isLoopbackHost("::1"), true);
});

test("isLoopbackHost: 0.0.0.0 is not loopback", () => {
  assert.equal(isLoopbackHost("0.0.0.0"), false);
});

test("isLoopbackHost: undefined (all interfaces) is not loopback", () => {
  assert.equal(isLoopbackHost(undefined), false);
});

test("isLoopbackHost: an arbitrary LAN literal is not loopback", () => {
  assert.equal(isLoopbackHost("192.168.1.5"), false);
});

test("DEFAULT_LOCAL_BIND_HOST is '127.0.0.1'", () => {
  assert.equal(DEFAULT_LOCAL_BIND_HOST, "127.0.0.1");
});
