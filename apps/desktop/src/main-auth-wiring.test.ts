/**
 * @file Wiring guard for `../main.ts`'s site-session sequence — DS-01.
 *
 * Source text, for the reason `main-speech-wiring.test.ts` documents: `main.ts` requires
 * `"electron"` at module scope, so `require`-ing it under plain `node --test` crashes before proving
 * anything. The DECISION itself is deliberately not tested here — it was extracted into
 * `desktop-auth.ts`'s `ensureSiteSession` precisely so it could be covered behaviourally, and it is
 * (four tests in `desktop-auth.test.ts`). What only this file can check is that `main.ts` reaches
 * for the new decision at all, and in the one order where it is sound.
 *
 * The order is the whole point. `emitBootToken` is a SPAWN ARGUMENT, so it is decided before any
 * server exists to ask about the session. Deciding it from the cookie jar — the old
 * `emitBootToken: !alreadyAuthenticated` — meant a wrong guess could never be revised: no token had
 * been minted, and this shell passes no `desktopCredential`, so there was nothing to fall back to.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const source = fs.readFileSync(path.join(__dirname, "..", "main.ts"), "utf8");

/** `startSiteBackend`'s body. */
function startSiteBackendBody() {
  const start = source.indexOf("async function startSiteBackend(");
  assert.notEqual(start, -1, "expected startSiteBackend in main.ts");
  const rest = source.slice(start);
  return rest.slice(0, rest.indexOf("\n}\n"));
}

test("the boot token is ALWAYS emitted — the decision it used to encode cannot be made that early", () => {
  const body = startSiteBackendBody();
  assert.match(body, /emitBootToken: true/, "emitBootToken must not be conditional on a pre-spawn guess");
  assert.doesNotMatch(body, /emitBootToken: !/, "DS-01: this is the guess that could never be revised");
});

test("the session decision is made AFTER the server is up, through ensureSiteSession", () => {
  const body = startSiteBackendBody();
  assert.match(body, /ensureSiteSession\(/, "main.ts must use the extracted, behaviourally-tested decision");
  assert.ok(
    body.indexOf("await startTovuServer(") < body.indexOf("ensureSiteSession("),
    "the probe is only meaningful once there is a server to answer it",
  );
});

test("the probe is pointed at this site's own admin URL and its own partition", () => {
  // Both are per-site. A probe against the wrong partition reads another site's jar (cookies ignore
  // port, which is why `sitePartition` exists at all — see `desktop-auth.ts` header, property 2).
  const body = startSiteBackendBody();
  assert.match(body, /adminUrl: server\.adminUrl/);
  assert.match(body, /session: session\.fromPartition\(partition\)/);
});

test("redeeming is still what stays conditional, and it is still the boot-token path", () => {
  // Always emitting is inert; always REDEEMING is the 713-live-rows defect. `ensureSiteSession`
  // owns that branch, and `authenticateSiteSession` must be what it calls.
  const body = startSiteBackendBody();
  assert.match(body, /redeem: \(\) => authenticateSiteSession\(siteDir, server, partition\)/);
});

test("main.ts no longer treats bare cookie presence as a session", () => {
  assert.doesNotMatch(source, /hasActiveSessionCookie/, "presence is not validity — that primitive is now internal to hasValidSession");
});
