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
    env: { TOVU_ACME_OAUTH_WEB_CLIENT_ID: "acme-web-client", TOVU_ACME_OAUTH_WEB_CLIENT_SECRET: "s".repeat(24) },
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

test("characterization: an owned ref that was never connected is refused as not found (connect first) on every read", async () => {
  const tokens = makeHost().accessTokensFor({ pluginId: "acme-office" });
  for (let call = 0; call < 3; call += 1) {
    await assert.rejects(tokens.getAccessToken({ connectionRef: ownRef }), { code: "connection-not-found", message: /Connect the account first/ });
  }
});
