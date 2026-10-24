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
