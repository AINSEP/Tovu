/**
 * @file Phase-C unit tests for `contribution.ts`: every refusal of the `tovu-connections.json`
 * parser (each names the field the plugin author must fix), the host-read fields' defaults, and the
 * loader over the lifecycle's real contained-import gate (missing file, unreadable file, a module
 * with no `createHooks`, a descriptor Jini refuses).
 */
import assert from "node:assert/strict";
import { mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

import { loadPluginContributionsFromSource, type LoadPluginContributions } from "../../agent-plugins/lifecycle.js";
import { API_CONNECTIONS_FILENAME, loadDeclaredApiConnections, parseApiConnectionsFile } from "../contribution.js";
import { ACME_PLUGIN, acmeFixtureCopy } from "./support/acme-harness.js";

const descriptorFields = { label: "Acme", authorizationEndpoint: "https://auth.acme.test/authorize", tokenEndpoint: "https://auth.acme.test/token" };
const web = { clientIdEnv: "TOVU_ACME_WEB_CLIENT_ID", clientSecretEnv: "TOVU_ACME_WEB_CLIENT_SECRET" };
const entry = (overrides: Record<string, unknown> = {}) => ({ id: "account", module: "lib/connection.mjs", clients: { web }, ...descriptorFields, ...overrides });
const file = (connections: unknown, extra: Record<string, unknown> = {}) => JSON.stringify({ schemaVersion: 1, connections, ...extra });
const reasonOf = (raw: string): string => {
  const result = parseApiConnectionsFile({ raw });
  assert.equal(result.ok, false, "expected a refusal");
  return result.ok ? "" : result.reason;
};

test("parse: text that is not JSON is refused as such", () => {
  assert.equal(reasonOf("{ not json"), "not valid JSON");
});

test("parse: a top level that is not an object, or another schemaVersion, is refused", () => {
  assert.equal(reasonOf("[]"), "schemaVersion must be 1");
  assert.equal(reasonOf(JSON.stringify({ schemaVersion: 2, connections: [] })), "schemaVersion must be 1");
});

test("parse: connections must be an array of at most 8", () => {
  assert.equal(reasonOf(JSON.stringify({ schemaVersion: 1, connections: {} })), "connections must be an array of at most 8");
  const nine = Array.from({ length: 9 }, (_, index) => entry({ id: `c${index}` }));
  assert.equal(reasonOf(file(nine)), "connections must be an array of at most 8");
});

test("parse: an entry that is not an object is refused by its index", () => {
  assert.equal(reasonOf(file([entry(), "nope"])), "connections[1] must be an object");
});

test("parse: an id that is not a short lowercase hyphenated string is refused", () => {
  for (const id of [7, "Account", "a".repeat(65), "trailing-"]) {
    assert.equal(reasonOf(file([entry({ id })])), "connections[0].id must be a lowercase hyphenated id", String(id));
  }
});

test("parse: a module that is not a relative .mjs path is refused", () => {
  for (const module of [3, "lib/connection.js", "/abs/connection.mjs"]) {
    assert.equal(reasonOf(file([entry({ module })])), "connections[0].module must be a relative path ending in .mjs", String(module));
  }
});

test("parse: clients that are not an object are refused", () => {
  assert.equal(reasonOf(file([entry({ clients: ["web"] })])), "connections[0].clients must be an object");
});

test("parse: a client config that is not an object is refused with its runtime", () => {
  assert.equal(reasonOf(file([entry({ clients: { desktop: "TOVU_X_CLIENT_ID" } })])), "connections[0].clients.desktop must be an object");
});

test("parse: a secret setting name outside TOVU_…_CLIENT_SECRET is refused (a plugin never names another host secret)", () => {
  for (const clientSecretEnv of ["TOVU_ACME_WEB_CLIENT_ID", "DATABASE_PASSWORD", 5]) {
    assert.equal(reasonOf(file([entry({ clients: { web: { ...web, clientSecretEnv } } })])),
      "connections[0].clients.web.clientSecretEnv must name a TOVU_…_CLIENT_SECRET setting", String(clientSecretEnv));
  }
});

test("parse: redirectOrigins must be a list of at most 32 bare origins", () => {
  const refused = "connections[0].clients.web.redirectOrigins must be a list of origins";
  for (const redirectOrigins of ["https://site.test", ["https://site.test/path"], [42], Array.from({ length: 33 }, (_, i) => `https://s${i}.test`)]) {
    assert.equal(reasonOf(file([entry({ clients: { web: { ...web, redirectOrigins } } })])), refused, JSON.stringify(redirectOrigins).slice(0, 40));
  }
});

test("parse: a client with redirect origins and no secret keeps exactly the fields it declared", () => {
  const result = parseApiConnectionsFile({ raw: file([entry({ clients: { web: { clientIdEnv: web.clientIdEnv, redirectOrigins: ["https://site.test"] } } })]) });
  assert.equal(result.ok, true);
  assert.deepEqual(result.ok && result.descriptors[0]!.clients, { web: { clientIdEnv: web.clientIdEnv, redirectOrigins: ["https://site.test"] } });
});

test("parse: scopeSets must be at most 16 short ids", () => {
  const refused = "connections[0].scopeSets must be at most 16 short ids";
  for (const scopeSets of ["tables", ["-leading"], Array.from({ length: 17 }, (_, i) => `s${i}`)]) {
    assert.equal(reasonOf(file([entry({ scopeSets })])), refused, JSON.stringify(scopeSets).slice(0, 40));
  }
});

test("parse: apiOrigins must be at most 8 https origins", () => {
  const refused = "connections[0].apiOrigins must be at most 8 https:// origins";
  for (const apiOrigins of [["http://api.acme.test"], ["https://api.acme.test/v1"], Array.from({ length: 9 }, (_, i) => `https://a${i}.test`)]) {
    assert.equal(reasonOf(file([entry({ apiOrigins })])), refused, JSON.stringify(apiOrigins).slice(0, 40));
  }
});

test("parse: absent host-read fields default to empty lists and no BYO client, and stay out of the descriptor", () => {
  const result = parseApiConnectionsFile({ raw: file([entry()]) });
  assert.equal(result.ok, true);
  const [declaration] = result.ok ? result.descriptors : [];
  assert.deepEqual({ scopeSets: declaration!.scopeSets, apiOrigins: declaration!.apiOrigins, byoClient: declaration!.byoClient }, { scopeSets: [], apiOrigins: [], byoClient: false });
  assert.deepEqual(declaration!.descriptor, descriptorFields);
});

test("parse: the same connection id declared twice is refused", () => {
  assert.equal(reasonOf(file([entry(), entry()])), "connections[1].id 'account' is declared twice");
});

const loaderFor = (packageRoot: string): LoadPluginContributions => (input) =>
  loadPluginContributionsFromSource({ plugin: { pluginId: ACME_PLUGIN, packageRoot }, definition: input.definition });

test("load: a plugin with no connections file declares none and is not refused", async (t) => {
  const root = acmeFixtureCopy(t, () => {});
  rmSync(path.join(root, API_CONNECTIONS_FILENAME));
  assert.deepEqual(await loadDeclaredApiConnections({ workspaceId: "ws-1", loadContributions: loaderFor(root) }), { connections: [], refusals: [] });
});

test("load: a connections file that cannot be read (not missing) fails loudly instead of reading as none", async (t) => {
  const root = acmeFixtureCopy(t, () => {});
  rmSync(path.join(root, API_CONNECTIONS_FILENAME));
  mkdirSync(path.join(root, API_CONNECTIONS_FILENAME));
  await assert.rejects(loadDeclaredApiConnections({ workspaceId: "ws-1", loadContributions: loaderFor(root) }), { code: "EISDIR" });
});

test("load: a hooks module with no createHooks() is refused with the connection and plugin it names", async (t) => {
  const root = acmeFixtureCopy(t, () => {}, { "lib/connection.mjs": "export default { notHooks: true };\n" });
  const loaded = await loadDeclaredApiConnections({ workspaceId: "ws-1", loadContributions: loaderFor(root) });
  assert.deepEqual(loaded, { connections: [], refusals: ["API connection 'account' from 'acme-office' was not loaded: its module has no createHooks() function"] });
});

test("load: a hooks module whose default export is not an object is refused the same way", async (t) => {
  const root = acmeFixtureCopy(t, () => {}, { "lib/connection.mjs": "export default 'createHooks';\n" });
  const loaded = await loadDeclaredApiConnections({ workspaceId: "ws-1", loadContributions: loaderFor(root) });
  assert.deepEqual(loaded.refusals, ["API connection 'account' from 'acme-office' was not loaded: its module has no createHooks() function"]);
});

test("load: a descriptor Jini refuses drops only that connection, with Jini's reason", async (t) => {
  const root = acmeFixtureCopy(t, (declaration) => { declaration.label = ""; });
  const loaded = await loadDeclaredApiConnections({ workspaceId: "ws-1", loadContributions: loaderFor(root) });
  assert.equal(loaded.connections.length, 0);
  assert.equal(loaded.refusals.length, 1);
  assert.match(loaded.refusals[0]!, /^API connection 'account' from 'acme-office' was not loaded: .*label/);
});

test("load: earlier refusals from the loader are kept alongside loaded connections", async () => {
  const fixture = await loadDeclaredApiConnections({ workspaceId: "ws-1", loadContributions: loaderFor(path.join(import.meta.dirname, "fixtures", "acme-office")) });
  const withRefusal: LoadPluginContributions = async (input, options) => {
    const real = await loaderFor(path.join(import.meta.dirname, "fixtures", "acme-office"))(input, options);
    return { items: real.items, refusals: ["an earlier package refusal"] };
  };
  const loaded = await loadDeclaredApiConnections({ workspaceId: "ws-1", loadContributions: withRefusal });
  assert.deepEqual(loaded.refusals, ["an earlier package refusal"]);
  assert.deepEqual(loaded.connections.map((connection) => connection.descriptor.connectionId), fixture.connections.map((connection) => connection.descriptor.connectionId));
});


for (const runtime of ["web", "desktop"] as const) {
  for (const clientSecretEnv of ["TOVU_OTHER_OAUTH_WEB_CLIENT_SECRET", "TOVU_ACME_OFFICE_EXTRA_OAUTH_WEB_CLIENT_SECRET", "TOVU_ACME_OFFICE_OAUTH_DESKTOP_CLIENT_SECRET"]) {
    if (runtime === "desktop" && clientSecretEnv === "TOVU_ACME_OFFICE_OAUTH_DESKTOP_CLIENT_SECRET") continue;
    test(`security (T5): ${runtime} refuses a foreign or undeclared client secret setting ${clientSecretEnv}`, async (t) => {
      const root = acmeFixtureCopy(t, (declaration) => {
        declaration.clients = { [runtime]: { clientIdEnv: `TOVU_ACME_OFFICE_OAUTH_${runtime.toUpperCase()}_CLIENT_ID`, clientSecretEnv } };
      });
      const loaded = await loadDeclaredApiConnections({ workspaceId: "ws-1", loadContributions: loaderFor(root) });
      assert.deepEqual(loaded.connections, []);
      assert.deepEqual(loaded.refusals, ["API connection 'account' from 'acme-office' was not loaded: Client settings must belong to this plugin's TOVU_ACME_OFFICE_ namespace."]);
    });
  }
}

test("security (T5): own exact runtime client names are admitted; a foreign client id is refused", async (t) => {
  const loaded = await loadDeclaredApiConnections({ workspaceId: "ws-1", loadContributions: loaderFor(path.join(import.meta.dirname, "fixtures", "acme-office")) });
  assert.equal(loaded.connections.length, 1);
  assert.deepEqual(loaded.refusals, []);
  const root = acmeFixtureCopy(t, (declaration) => {
    declaration.clients = { web: { clientIdEnv: "TOVU_OTHER_OAUTH_WEB_CLIENT_ID" } };
  });
  assert.equal((await loadDeclaredApiConnections({ workspaceId: "ws-1", loadContributions: loaderFor(root) })).connections.length, 0);
});
