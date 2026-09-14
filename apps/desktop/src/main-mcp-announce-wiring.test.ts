/**
 * @file Wiring guard for `announceDesktopToolsToSite` (`../main.js`) — the call that registers this
 * shell's own MCP tool server with a site the instant it boots, so that site's assistant can reach
 * the desktop's capabilities (list the operator's websites, add one, reveal one's folder).
 *
 * Source text, for the reason `main-project-wiring.test.js` and `main-speech-wiring.test.js` state at
 * length: `main.js` requires `"electron"` at module scope, which resolves to a bare path string
 * outside a real Electron process, so requiring it under plain `node --test` crashes before this file
 * could prove anything behavioural. `writeSitesMcpLauncher` and `registerSitesMcpServer` are covered
 * behaviourally where they live (`sites-mcp-registration.test.js`); what only this file can catch is
 * that `main.js` actually calls them, in order, after the right session exists, with the right site's
 * own `workspaceId` — because `announceDesktopToolsToSite`'s own `catch` logs and swallows any error,
 * so a dropped call, a reordered one, or a hard-coded `workspaceId` produces no failing test, no
 * crash, and no dialog anywhere else. Only a silently degraded assistant on every site opened.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const rawSource = fs.readFileSync(path.join(__dirname, "..", "main.ts"), "utf8");

/**
 * `main.js` with every comment stripped. Load-bearing here specifically: `announceDesktopToolsToSite`'s
 * own JSDoc names the exact hazard this file guards against — a hard-coded `"workspace-local"` — in
 * prose explaining why the code does NOT do that (see this file's `workspaceId` test below). A raw
 * scan for that literal would fail against the comment describing the fix, not against a bug.
 */
function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
}

const source = withoutComments(rawSource);

/** The call site's index, asserted to exist first so a renamed function fails loudly here rather
 *  than making the ordering comparison below vacuously true against two -1s. */
function callIndex(name: string): number {
  const index = source.indexOf(`${name}(`);
  assert.notEqual(index, -1, `expected a ${name}(...) call in main.ts`);
  return index;
}

test("announceDesktopToolsToSite is actually CALLED on the site-open path, not merely defined", () => {
  assert.match(source, /function announceDesktopToolsToSite\(/, "expected the function to still be defined");
  assert.match(
    source,
    /\bannounceDesktopToolsToSite\(server, partition\);/,
    "expected a real call statement — the function's own definition line would not satisfy this pattern",
  );
});

test("announceDesktopToolsToSite runs AFTER ensureSiteSession, or its PUT races an unauthenticated session", () => {
  // registerSitesMcpServer authenticates with the session cookie ensureSiteSession just placed in
  // this partition's jar. Called first, the registration PUT would run against a still-anonymous
  // partition and (depending on the admin API's own behaviour) fail or register the wrong identity.
  //
  // Against the CALL specifically, not `callIndex`'s generic `${name}(` match: this function is a
  // hoisted declaration, so its own `function announceDesktopToolsToSite(` text always sits below
  // `ensureSiteSession(` regardless of where the call is (or whether it exists at all) — a version
  // with the call deleted entirely would still pass a comparison against the definition's position.
  const callSite = source.indexOf("announceDesktopToolsToSite(server, partition);");
  assert.notEqual(callSite, -1, "expected a call statement, not just the function's own definition");
  assert.ok(
    callIndex("ensureSiteSession") < callSite,
    "announceDesktopToolsToSite must be called after ensureSiteSession",
  );
});

test("announceDesktopToolsToSite calls both writeSitesMcpLauncher and registerSitesMcpServer, launcher first", () => {
  const body = source.slice(source.indexOf("function announceDesktopToolsToSite("));
  const ownBody = body.slice(0, body.indexOf("\n}"));
  const launcherCall = ownBody.indexOf("writeSitesMcpLauncher(");
  const registerCall = ownBody.indexOf("registerSitesMcpServer(");
  assert.notEqual(launcherCall, -1, "expected a writeSitesMcpLauncher(...) call");
  assert.notEqual(registerCall, -1, "expected a registerSitesMcpServer(...) call");
  assert.ok(
    launcherCall < registerCall,
    "registerSitesMcpServer needs the launcher's path, so writeSitesMcpLauncher must run first",
  );
});

test("registerSitesMcpServer is handed the SITE'S OWN workspaceId, never a hard-coded literal", () => {
  const body = source.slice(source.indexOf("function announceDesktopToolsToSite("));
  const ownBody = body.slice(0, body.indexOf("\n}"));
  assert.match(
    ownBody,
    /workspaceId:\s*server\.workspaceId/,
    "workspaceId must be read off the site's own server object",
  );
  assert.doesNotMatch(
    ownBody,
    /workspaceId:\s*["'`]/,
    "a string-literal workspaceId (e.g. \"workspace-local\") would 404 against any site whose real workspace differs from the guess",
  );
});

test("both functions are imported from sites-mcp-registration.ts", () => {
  assert.match(
    source,
    /import \{ registerSitesMcpServer, writeSitesMcpLauncher \} from ["']\.\/src\/sites-mcp-registration\.ts["']/,
  );
});
