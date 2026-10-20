/**
 * @file Phase-C unit tests for `surface-connections.ts`: status reports a plugin scope set as
 * granted only when every scope it requests was granted, and a desktop sign-in that failed after the
 * browser opened is kept as a safe code: our own lowercase codes pass, anything else (an upstream
 * library's code, or no code at all) becomes a generic one, and the log line carries the code only.
 * Real host over the fake provider and Jini's real loopback receiver; no real network.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { after, afterEach, before, test } from "node:test";

import { InMemoryVaultRepo } from "@jini-ai/platform/secrets/credential-sets";

import { createSurfaceConnections } from "../surface-connections.js";
import type { ApiConnectionHost } from "../host.js";
import { ACME_FIXTURE_ROOT, ACME_PLUGIN, ACME_WORKSPACE, acmeFixtureCopy, startAcmeHarness, type AcmeHarness } from "./support/acme-harness.js";

let harness: AcmeHarness;
before(async () => { harness = await startAcmeHarness(); });
afterEach(() => harness.reset());
after(async () => { await harness.close(); });

const portFor = (host: ApiConnectionHost) => createSurfaceConnections({ host, pluginId: ACME_PLUGIN, workspaceId: ACME_WORKSPACE, principalId: "admin-1" });

/** Waits (bounded) until the port's status shows a failed desktop attempt. */
async function failedAttempt(port: ReturnType<typeof portFor>) {
  for (let tries = 0; tries < 100; tries += 1) {
    const { lastSignInAttempt } = await port.status({ connectionId: "account" });
    if (lastSignInAttempt) return lastSignInAttempt;
    await new Promise((resolve) => { setTimeout(resolve, 10); });
  }
  throw new Error("the desktop sign-in never reported a failure");
}

function captureWarnings(t: { after(fn: () => void): void }): string[] {
  const lines: string[] = [];
  const original = console.warn;
  console.warn = (line: string) => { lines.push(line); };
  t.after(() => { console.warn = original; });
  return lines;
}

test("status: a scope set reads granted only when every scope it requests was granted", async () => {
  const host = harness.makeHost();
  const port = portFor(host);
  harness.provider.tokenBody = undefined;
  const { authorizationUrl } = await port.begin({ connectionId: "account", action: "connect" });
  assert.equal(await harness.consent(authorizationUrl), 200);
  assert.deepEqual((await port.status({ connectionId: "account" })).grantedScopeSetIds, [], "base scopes only: 'tables' is not granted");

  harness.provider.tokenBody = { access_token: harness.accessToken, refresh_token: harness.refreshToken, token_type: "Bearer", expires_in: 3600, scope: "acme.files acme.tables" };
  const widened = await port.begin({ connectionId: "account", action: "reconnect" }, { scopeSetIds: ["tables"] });
  assert.equal(await harness.consent(widened.authorizationUrl), 200);
  assert.deepEqual((await port.status({ connectionId: "account" })).grantedScopeSetIds, ["tables"]);
});

/** A vault repo whose writes fail, once armed, like a storage engine would (its own error codes). */
class FaultyWritesVaultRepo extends InMemoryVaultRepo {
  writeFault: Error | undefined;
  override async delete(input: Parameters<InMemoryVaultRepo["delete"]>[0], options: Record<string, never> = {}): Promise<boolean> {
    if (this.writeFault) throw this.writeFault;
    return super.delete(input, options);
  }
}

for (const [label, fault, shown] of [
  ["an upstream (non-lowercase) code", Object.assign(new Error("database is locked"), { code: "SQLITE_BUSY" }), "sign-in-failed"],
  ["no code at all", new Error("storage went away"), "unknown"],
] as const) {
  test(`desktop: a failure with ${label} is kept as the safe '${shown}' code and logged by code only`, async (t) => {
    const warnings = captureWarnings(t);
    const vaultRepo = new FaultyWritesVaultRepo({});
    const host = harness.makeHost({ runtime: "desktop", vaultRepo });
    const port = portFor(host);
    const start = await port.begin({ connectionId: "account", action: "connect" });
    // The browser opened; then the sign-in's own storage write fails while it completes.
    vaultRepo.writeFault = fault;
    void harness.consent(start.authorizationUrl);
    assert.deepEqual(await failedAttempt(port), { code: shown, nextAction: "reconnect" });
    assert.deepEqual(warnings, [`[admin-surfaces] desktop sign-in for 'acme-office' did not complete: ${"code" in fault ? fault.code : "unknown"}`]);
  });
}

test("desktop: a failure whose hook threw an error with no code shows a safe code and logs no message text", async (t) => {
  const warnings = captureWarnings(t);
  const hooks = readFileSync(path.join(ACME_FIXTURE_ROOT, "lib", "connection.mjs"), "utf8")
    .replace("async readAccount({ accessToken }) {", "async readAccount({ accessToken }) { throw new Error('account text ' + accessToken);");
  const host = harness.makeHost({ runtime: "desktop", packageRoot: acmeFixtureCopy(t, () => {}, { "lib/connection.mjs": hooks }) });
  const port = portFor(host);
  const start = await port.begin({ connectionId: "account", action: "connect" });
  void harness.consent(start.authorizationUrl);
  const attempt = await failedAttempt(port);
  assert.match(attempt.code, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
  assert.equal(warnings.length, 1);
  assert.ok(!warnings[0]!.includes("account text"), "no hook message text is logged");
});


test("security (F7): a surface without a principal cannot read an access token, including directly through the host port", async () => {
  const host = harness.makeHost();
  const port = portFor(host);
  const start = await port.begin({ connectionId: "account", action: "connect" });
  assert.equal(await harness.consent(start.authorizationUrl), 200);
  const anonymous = createSurfaceConnections({ host, pluginId: ACME_PLUGIN, workspaceId: ACME_WORKSPACE });
  await assert.rejects(anonymous.getAccessToken({ connectionId: "account" }), { code: "connection-not-found" });
  assert.equal(await port.getAccessToken({ connectionId: "account" }), harness.accessToken);
});
