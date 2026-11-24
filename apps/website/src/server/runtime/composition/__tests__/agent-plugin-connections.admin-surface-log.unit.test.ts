/**
 * @file Pins the host-owned refusal sink `composeAgentPluginConnections` binds for the admin-surface
 * handler host: Jini's `createAgentPluginAdminSurfaceHandlers` takes a REQUIRED `log` and adds no
 * prefix, so the `[admin-surfaces]` line prefix and the `console.warn` destination are Tovu's
 * composition choice. This replaces the pre-move Tovu unit case "without a log option, refusals go
 * to console.warn with the admin-surfaces prefix".
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import type { HttpClientPort } from "@jini-ai/core/primitives";
import { AesGcmSecretSealer } from "@jini-ai/platform/secrets";
import { InMemoryKeyring } from "@jini-ai/platform/secrets/testing";
import { InMemoryVaultRepo } from "@jini-ai/platform/secrets/credential-sets";
import { InMemoryCustomCredentialSetRepo } from "#src/features/custom-credentials/index";
import type { LoadPluginContributions } from "#src/features/agent-plugins/lifecycle";

import { composeAgentPluginConnections } from "../agent-plugin-connections.js";

const refusingLoad = (async () => ({ items: [], refusals: ["refused line"] })) as unknown as LoadPluginContributions;
const unusedHttp = { request: async () => { throw new Error("no network in this test"); } } as unknown as HttpClientPort;

test("composed admin-surface handler refusals go to console.warn with the admin-surfaces prefix", async (t) => {
  const keyring = new InMemoryKeyring({ hkdfSalt: "admin-surface-log-sink" });
  const composition = composeAgentPluginConnections({
    workspaceId: "ws-log", loadContributions: refusingLoad, vaultRepo: new InMemoryVaultRepo({}), keyring,
    sealer: new AesGcmSecretSealer({ keyring }), customCredentialRepo: new InMemoryCustomCredentialSetRepo(),
    clock: { nowMs: () => 0, nowIso: () => new Date(0).toISOString() }, http: unusedHttp, env: {}, derivedPublicOrigin: undefined,
  });
  const warn = t.mock.method(console, "warn", () => {});
  assert.deepEqual(await composition.adminSurfaceHost.refresh(), ["refused line"]);
  assert.deepEqual(warn.mock.calls.map((call) => call.arguments), [["[admin-surfaces] refused line"]]);
});
