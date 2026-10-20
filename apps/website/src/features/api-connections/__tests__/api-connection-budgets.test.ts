/**
 * @file Pins for plugin-declared connection budgets: characterization of the declaration parser and
 * the host's token accessor before budgets existed, then the phase-A security pins (budgets are
 * namespaced per plugin, clamped to host maxima, charged only for owned refs, refused with a safe
 * retryable error). Uses the "acme-office" fixture plugin; no network is involved.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { AesGcmSecretSealer } from "@jini-ai/platform/secrets";
import { InMemoryKeyring } from "@jini-ai/platform/secrets/testing";
import { InMemoryVaultRepo } from "@jini-ai/platform/secrets/credential-sets";
import { deriveApiConnectionKey } from "@jini-ai/integrations/api-connections";
import type { OAuthHttpPorts } from "@jini-ai/oauth";

import { loadPluginContributionsFromSource, type LoadPluginContributions } from "../../agent-plugins/lifecycle.js";
import { createConnectionBudgets, type ConnectionBudget } from "../budgets.js";
import { parseApiConnectionsFile } from "../contribution.js";
import { createApiConnectionHost } from "../host.js";

const fixtureRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "acme-office");
const fixtureRaw = readFileSync(path.join(fixtureRoot, "tovu-connections.json"), "utf8");

/** Nothing in these pins may reach a network: every outbound call is a test failure. */
const noNetwork = () => { throw new Error("unexpected outbound call"); };
const oauthHttp: OAuthHttpPorts = { guard: { assertSafeUrl: ({ raw }) => new URL(raw) }, fetchFn: noNetwork };

function makeHost(clock: { nowMs(): number } = { nowMs: () => Date.now() }) {
  const keyring = new InMemoryKeyring({ hkdfSalt: "api-connection-budgets" });
  const loadContributions: LoadPluginContributions = (input) => loadPluginContributionsFromSource({ plugin: { pluginId: "acme-office", packageRoot: fixtureRoot }, definition: input.definition });
  return createApiConnectionHost({
    workspaceId: "ws-1", loadContributions, vaultRepo: new InMemoryVaultRepo({}), keyring, sealer: new AesGcmSecretSealer({ keyring }),
    clock, oauthHttp, pluginHttp: { fetch: noNetwork }, runtime: "hosted",
    env: { TOVU_ACME_OAUTH_WEB_CLIENT_ID: "acme-web-client", TOVU_ACME_OAUTH_WEB_CLIENT_SECRET: "s".repeat(24), TOVU_API_CONNECTION_CALLBACK_ORIGINS: "https://site.example" },
    publicOrigin: () => "https://site.example",
  });
}

const ownRef = deriveApiConnectionKey({ workspaceId: "ws-1", pluginId: "acme-office", connectionId: "account" });

test("characterization: the declaration parser splits id, module and clients from the descriptor it hands to Jini", () => {
  const parsed = parseApiConnectionsFile({ raw: fixtureRaw });
  assert.equal(parsed.ok, true);
  const [declaration] = parsed.ok ? parsed.descriptors : [];
  assert.equal(declaration?.id, "account");
  assert.equal(declaration?.module, "lib/connection.mjs");
  assert.deepEqual(Object.keys(declaration?.clients ?? {}), ["web", "desktop"]);
  assert.equal(declaration?.descriptor.label, "Acme Office");
  assert.ok(!("id" in (declaration?.descriptor ?? {})) && !("module" in (declaration?.descriptor ?? {})) && !("clients" in (declaration?.descriptor ?? {})));
});

test("characterization: an invalid web or desktop client refuses the declaration with the field it names", () => {
  const withClients = (clients: unknown) => {
    const file = JSON.parse(fixtureRaw) as { connections: Record<string, unknown>[] };
    file.connections[0].clients = clients;
    return parseApiConnectionsFile({ raw: JSON.stringify(file) });
  };
  const web = withClients({ web: { clientIdEnv: "HOME" } });
  assert.equal(web.ok ? "loaded" : web.reason, "connections[0].clients.web.clientIdEnv must name a TOVU_…_CLIENT_ID setting");
  const desktop = withClients({ desktop: { clientIdEnv: "TOVU_ACME_OAUTH_DESKTOP_CLIENT_ID", clientSecretEnv: "AWS_SECRET_ACCESS_KEY" } });
  assert.equal(desktop.ok ? "loaded" : desktop.reason, "connections[0].clients.desktop.clientSecretEnv must name a TOVU_…_CLIENT_SECRET setting");
  const both = withClients({ web: { clientIdEnv: "TOVU_ACME_OAUTH_WEB_CLIENT_ID" } });
  assert.deepEqual(both.ok ? both.descriptors[0]?.clients : null, { web: { clientIdEnv: "TOVU_ACME_OAUTH_WEB_CLIENT_ID" } });
});

test("characterization: an owned ref that was never connected is refused as not found (connect first) on every read", async () => {
  const tokens = makeHost().accessTokensFor({ pluginId: "acme-office" });
  for (let call = 0; call < 3; call += 1) {
    await assert.rejects(tokens.getAccessToken({ connectionRef: ownRef }), { code: "connection-not-found", message: /Connect the account first/ });
  }
});

/** The fixture's declaration file with its `budgets` replaced (undefined removes the key). */
function withBudgets(budgets: unknown): string {
  const file = JSON.parse(fixtureRaw) as { connections: Record<string, unknown>[] };
  const [entry] = file.connections;
  if (budgets === undefined) delete entry.budgets; else entry.budgets = budgets;
  return JSON.stringify(file);
}

test("security: a declared budget above the host maximum is clamped, never honoured, and never reaches the descriptor", () => {
  const parsed = parseApiConnectionsFile({ raw: withBudgets([{ scope: "instance", perMinute: 1_000_000, burst: 1_000_000 }, { scope: "connection", perMinute: 45 }]) });
  assert.equal(parsed.ok, true);
  const [declaration] = parsed.ok ? parsed.descriptors : [];
  assert.deepEqual(declaration?.budgets, [{ scope: "instance", perMinute: 240, burst: 40 }, { scope: "connection", perMinute: 45, burst: 0 }]);
  assert.ok(!("budgets" in (declaration?.descriptor ?? {})));
});

test("security: a connection that declares no instance budget still gets the host's bounded one", () => {
  const parsed = parseApiConnectionsFile({ raw: withBudgets(undefined) });
  assert.deepEqual(parsed.ok ? parsed.descriptors[0]?.budgets : [], [{ scope: "instance", perMinute: 240, burst: 40 }]);
  const onlyPerAccount = parseApiConnectionsFile({ raw: fixtureRaw });
  assert.deepEqual(onlyPerAccount.ok ? onlyPerAccount.descriptors[0]?.budgets : [], [{ scope: "instance", perMinute: 240, burst: 40 }, { scope: "connection", perMinute: 45, burst: 0 }]);
});

test("security: a malformed budget refuses the whole declaration instead of loading it unbounded", () => {
  const count = /^connections\[0\]\.budgets\[0\]\.perMinute must be a whole number of at least 1, and burst a whole number of at least 0$/;
  const malformed: readonly (readonly [unknown, RegExp])[] = [
    ["45", /^connections\[0\]\.budgets must be a list of at most 2 budgets$/],
    [[{ scope: "instance", perMinute: 1 }, { scope: "connection", perMinute: 1 }, { scope: "connection", perMinute: 1 }], /^connections\[0\]\.budgets must be a list of at most 2 budgets$/],
    [[{ scope: "connection", perMinute: 0 }], count], [[{ scope: "connection", perMinute: 1.5 }], count], [[{ scope: "connection", perMinute: "45" }], count],
    [[{ scope: "connection" }], count], [[{ scope: "connection", perMinute: 45, burst: -1 }], count],
    [[{ scope: "everyone", perMinute: 45 }], /^connections\[0\]\.budgets\[0\]\.scope must be "instance" or "connection"$/],
    [["connection"], /^connections\[0\]\.budgets\[0\] must be an object$/],
    [[{ scope: "connection", perMinute: 45 }, { scope: "connection", perMinute: 90 }], /^connections\[0\]\.budgets\[1\]\.scope "connection" is declared twice$/],
  ];
  for (const [budgets, reason] of malformed) {
    const parsed = parseApiConnectionsFile({ raw: withBudgets(budgets) });
    assert.match(parsed.ok ? "loaded" : parsed.reason, reason, JSON.stringify(budgets));
  }
});

/** A clock the test moves by hand. */
function manualClock() {
  let now = Date.parse("2026-10-20T12:00:00.000Z");
  return { nowMs: () => now, advance: (ms: number) => { now += ms; } };
}

test("security: past the declared per-account budget a token read is refused, before any token is read, with a safe retryable error", async () => {
  const clock = manualClock();
  const tokens = makeHost(clock).accessTokensFor({ pluginId: "acme-office" });
  for (let call = 0; call < 45; call += 1) {
    await assert.rejects(tokens.getAccessToken({ connectionRef: ownRef }), { code: "connection-not-found" });
  }
  clock.advance(15_000);
  const refusal = await tokens.getAccessToken({ connectionRef: ownRef }).then(() => undefined, (error: unknown) => error);
  assert.deepEqual({ ...(refusal as object) }, { name: "ConnectionBudgetExceededError", code: "rate-limited", retryable: true, retryAfterMs: 45_000, outcome: "not-applied" });
  assert.match((refusal as Error).message, /request budget.*Nothing was sent.*retry/);
  assert.ok(!(refusal as Error).message.includes(ownRef));
  clock.advance(45_000);
  await assert.rejects(tokens.getAccessToken({ connectionRef: ownRef }), { code: "connection-not-found" });
});

test("security: refs the plugin does not own are refused without charging its budget", async () => {
  const tokens = makeHost(manualClock()).accessTokensFor({ pluginId: "acme-office" });
  const forged = deriveApiConnectionKey({ workspaceId: "ws-2", pluginId: "acme-office", connectionId: "account" });
  for (let call = 0; call < 60; call += 1) {
    await assert.rejects(tokens.getAccessToken({ connectionRef: forged }), { code: "connection-not-found", message: /not available to this plugin/ });
  }
  await assert.rejects(tokens.getAccessToken({ connectionRef: ownRef }), { code: "connection-not-found", message: /Connect the account first/ });
});

test("security: tool and admin-surface reads (toolConnections) and form-delivery reads (accessTokensFor) spend one budget", async () => {
  const host = makeHost(manualClock());
  const target = { workspaceId: "ws-1", pluginId: "acme-office", connectionRef: ownRef };
  for (let call = 0; call < 45; call += 1) {
    await assert.rejects(host.toolConnections.getAccessToken(target), { code: "connection-not-found" });
  }
  await assert.rejects(host.accessTokensFor({ pluginId: "acme-office" }).getAccessToken({ connectionRef: ownRef }), { code: "rate-limited" });
});

/** Whether one charge is allowed (true) or refused as rate-limited (false). */
async function allowed(charge: Promise<void>): Promise<boolean> {
  return charge.then(() => true, (error: { code?: string }) => {
    assert.equal(error.code, "rate-limited");
    return false;
  });
}

test("security: a per-account budget is namespaced by workspace, plugin and account", async () => {
  const budgets = createConnectionBudgets({ clock: manualClock() });
  const declared: readonly ConnectionBudget[] = [{ scope: "connection", perMinute: 1, burst: 0 }];
  const target = { workspaceId: "ws-1", pluginId: "plugin-a", connectionId: "account", connectionRef: "ref-1", budgets: declared };
  assert.equal(await allowed(budgets.charge(target)), true);
  assert.equal(await allowed(budgets.charge(target)), false);
  assert.equal(await allowed(budgets.charge({ ...target, pluginId: "plugin-b" })), true, "another plugin with the same ids has its own budget");
  assert.equal(await allowed(budgets.charge({ ...target, workspaceId: "ws-2" })), true, "another workspace has its own budget");
  assert.equal(await allowed(budgets.charge({ ...target, connectionRef: "ref-2" })), true, "another account has its own budget");
});

test("security: an instance budget is shared by one plugin connection's accounts and never by another plugin", async () => {
  const budgets = createConnectionBudgets({ clock: manualClock() });
  const declared: readonly ConnectionBudget[] = [{ scope: "instance", perMinute: 2, burst: 0 }];
  const target = { workspaceId: "ws-1", pluginId: "plugin-a", connectionId: "account", connectionRef: "ref-1", budgets: declared };
  assert.equal(await allowed(budgets.charge(target)), true);
  assert.equal(await allowed(budgets.charge({ ...target, connectionRef: "ref-2" })), true);
  assert.equal(await allowed(budgets.charge({ ...target, connectionRef: "ref-3" })), false, "a third account shares the spent instance budget");
  assert.equal(await allowed(budgets.charge({ ...target, pluginId: "plugin-b" })), true, "another plugin never spends this plugin's instance budget");
  assert.equal(await allowed(budgets.charge({ ...target, connectionId: "other" })), true, "another declared connection has its own instance budget");
});

test("security: a refused per-account charge does not spend the shared instance budget", async () => {
  const budgets = createConnectionBudgets({ clock: manualClock() });
  const declared: readonly ConnectionBudget[] = [{ scope: "instance", perMinute: 2, burst: 0 }, { scope: "connection", perMinute: 1, burst: 0 }];
  const target = { workspaceId: "ws-1", pluginId: "plugin-a", connectionId: "account", connectionRef: "ref-1", budgets: declared };
  assert.equal(await allowed(budgets.charge(target)), true);
  for (let call = 0; call < 5; call += 1) assert.equal(await allowed(budgets.charge(target)), false);
  assert.equal(await allowed(budgets.charge({ ...target, connectionRef: "ref-2" })), true, "a busy account cannot drain the budget other accounts share");
});

test("security: each plugin gets exactly the budget it declared, even when another declared the same rate with a different burst", async () => {
  const budgets = createConnectionBudgets({ clock: manualClock() });
  const strict = { workspaceId: "ws-1", pluginId: "plugin-a", connectionId: "account", connectionRef: "ref-1", budgets: [{ scope: "connection", perMinute: 1, burst: 0 }] as const };
  const bursty = { ...strict, pluginId: "plugin-b", budgets: [{ scope: "connection", perMinute: 1, burst: 1 }] as const };
  assert.equal(await allowed(budgets.charge(strict)), true);
  assert.equal(await allowed(budgets.charge(strict)), false);
  assert.equal(await allowed(budgets.charge(bursty)), true);
  assert.equal(await allowed(budgets.charge(bursty)), true, "plugin-b's burst is honoured");
  assert.equal(await allowed(budgets.charge(bursty)), false);
});

test("security: an instance and a per-account budget with the same rate never share a counter", async () => {
  const budgets = createConnectionBudgets({ clock: manualClock() });
  const declared: readonly ConnectionBudget[] = [{ scope: "instance", perMinute: 1, burst: 0 }, { scope: "connection", perMinute: 1, burst: 0 }];
  assert.equal(await allowed(budgets.charge({ workspaceId: "ws-1", pluginId: "plugin-a", connectionId: "account", connectionRef: "ref-1", budgets: declared })), true);
});
