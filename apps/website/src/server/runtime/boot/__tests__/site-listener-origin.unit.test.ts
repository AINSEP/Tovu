/** The real pinned listener wins over stale environment defaults when building dev URLs. */
import assert from "node:assert/strict";
import test from "node:test";
import { pinSiteListenerOrigin, readSiteListenerOrigin } from "../site-listener-origin.js";

test("pin then read uses the selected scheme and port over inherited PORT and TLS fallback", () => {
  const env = { PORT: "3000", TOVU_SITE_LISTENER_ORIGIN: "http://stale:1" };
  pinSiteListenerOrigin({ scheme: "https", host: "localhost", port: 3001 }, { env });
  const read = readSiteListenerOrigin({ fallbackScheme: "http" }, { env });
  assert.equal(read.origin, "https://localhost:3001");
});

for (const fallbackScheme of ["http", "https"] as const) test(`${fallbackScheme}: direct composition uses the configured PORT`, () => {
  assert.equal(readSiteListenerOrigin({ fallbackScheme }, { env: { PORT: "3001" } }).origin, `${fallbackScheme}://localhost:3001`);
  assert.equal(readSiteListenerOrigin({ fallbackScheme }, { env: {} }).port, "3000");
});

// F6 fix wave (L12 Stryker top-7: 9 survivors). A wildcard bind is never advertised as a literal
// origin; a concrete host (IPv6 bracketed) is advertised as itself and pinned into the env.
for (const [host, expected] of [
  [undefined, "http://localhost:4000"], ["", "http://localhost:4000"], ["0.0.0.0", "http://localhost:4000"], ["::", "http://localhost:4000"],
  ["127.0.0.1", "http://127.0.0.1:4000"], ["::1", "http://[::1]:4000"], ["site.example", "http://site.example:4000"], ["0.0.0.1", "http://0.0.0.1:4000"],
] as const) {
  test(`pinSiteListenerOrigin: host ${JSON.stringify(host)} is advertised as ${expected}`, () => {
    const env: NodeJS.ProcessEnv = {};
    assert.equal(pinSiteListenerOrigin({ scheme: "http", host, port: 4000 }, { env }), expected);
    assert.equal(env.TOVU_SITE_LISTENER_ORIGIN, expected);
    assert.equal(readSiteListenerOrigin({ fallbackScheme: "https" }, { env }).href, `${expected}/`);
  });
}

test("readSiteListenerOrigin throws on an invalid pinned origin instead of falling back", () => {
  assert.throws(() => readSiteListenerOrigin({ fallbackScheme: "http" }, { env: { TOVU_SITE_LISTENER_ORIGIN: "not a url" } }), TypeError);
});
