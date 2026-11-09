/**
 * EXTRACT-S5 H1b: the moved store/memory/vault/revocation reached through the Tovu shims keep the
 * H0 per-row open counts, refuse foreign contexts/kinds with the real platform VaultError before any
 * crypto, keep error identity, and share ONE envelope module instance (the built package dist).
 */
import "../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import test from "node:test";
import { ToolInputError } from "@jini-ai/core";
import { InMemoryVaultRepo, VaultError } from "@jini-ai/platform/secrets/credential-sets";
import * as hosted from "@jini-ai/mcp/federation/hosted";
import { InMemoryKeyring } from "../../../webhooks/keyring.memory.js";
import { AesGcmSecretSealer } from "../../../webhooks/secret-sealer.aesgcm.js";
import { InMemoryExternalMcpServerRepo } from "../../external-mcp-store.memory.js";
import { listExternalMcpServerViews, readEnabledExternalMcpConfigs, saveExternalMcpServer } from "../../external-mcp-store.js";
import * as vaultShim from "../../external-mcp-vault.js";
import { ExternalMcpConnectionRevokedError, rosterRefusalFor } from "../../external-mcp-revocation.js";

const keyring = new InMemoryKeyring();
const inner = new AesGcmSecretSealer(keyring);
const counts = { seal: 0, open: 0 };
const sealer = {
  seal: (...args: Parameters<typeof inner.seal>) => { counts.seal += 1; return inner.seal(...args); },
  open: (...args: Parameters<typeof inner.open>) => { counts.open += 1; return inner.open(...args); },
};
const clock = { nowMs: () => Date.parse("2026-09-01T00:00:00.000Z") } as never;
const WS = "11111111-1111-4111-8111-111111111111";
const reset = () => Object.assign(counts, { seal: 0, open: 0 });

test("H0 per-row counts through the shims: save seals env+static once each; toView and config read open env 1 + static 1", async () => {
  const repo = new InMemoryExternalMcpServerRepo();
  reset();
  await saveExternalMcpServer({ repo, sealer, keyring, clock }, { workspaceId: WS, enabled: true, serverId: "counts", transport: "stdio", command: "node",
    args: "", env: "REGION=eu", allowedToolNames: "", authMode: "static_env", accessToken: "count-token-123456", accessTokenEnvName: "TOKEN" } as never);
  assert.deepEqual(counts, { seal: 2, open: 2 });
  reset();
  const [view] = await listExternalMcpServerViews({ repo, sealer }, WS as never);
  assert.deepEqual([counts, view!.accessTokenHint, view!.envTokenHints], [{ seal: 0, open: 2 }, { length: 18, last4: "3456" }, { REGION: { length: 2, last4: null } }]);
  reset();
  const { configs } = await readEnabledExternalMcpConfigs({ repo, sealer }, WS as never);
  assert.deepEqual([counts, configs.length], [{ seal: 0, open: 2 }, 1]);
});

test("foreign context/kind refused with the real platform VaultError before any open", async () => {
  const identity = { workspaceId: WS, serverId: "owner" };
  const sealed = await vaultShim.sealExternalMcpVaultPayload({ deps: { sealer, keyring }, identity, kind: "mcp-env", payload: { K: "v" } });
  reset();
  const refusals = [
    vaultShim.openExternalMcpVaultPayload({ sealer, sealed, identity: { workspaceId: WS, serverId: "other" }, kind: "mcp-env" }),
    vaultShim.openExternalMcpVaultPayload({ sealer, sealed, identity, kind: "mcp-auth" }),
    vaultShim.openExternalMcpVaultPayload({ sealer, sealed: { ...sealed }, identity, kind: "mcp-env" }),
    vaultShim.sealExternalMcpVaultPayload({ deps: { sealer, keyring }, identity, kind: "vendor" as never, payload: {} }),
  ];
  for (const refusal of refusals) {
    await assert.rejects(refusal, (error: unknown) => error instanceof VaultError && error.code === "context" && error.name === "VaultError");
  }
  assert.deepEqual(counts, { seal: 0, open: 0 });
  assert.throws(() => vaultShim.externalMcpVaultRecord({ sealed: { ...sealed }, identity, kind: "mcp-env" }), VaultError);
  const carried = vaultShim.externalMcpVaultEnvelope({ record: vaultShim.externalMcpVaultRecord({ sealed, identity, kind: "mcp-env" }) })!;
  await assert.rejects(vaultShim.persistExternalMcpVaultEnvelope({ repo: new InMemoryVaultRepo({}), sealed: carried, identity, kind: "mcp-env" }),
    (error: unknown) => error instanceof VaultError && error.code === "conflict");
});

test("error identity and one envelope module instance (package dist, not source)", async () => {
  const revoked = new ExternalMcpConnectionRevokedError({ serverId: "s1", label: null, remoteName: "t", reason: "removed" });
  assert.ok(revoked instanceof hosted.ExternalMcpConnectionRevokedError && revoked instanceof ToolInputError);
  assert.deepEqual([revoked.name, revoked.code, revoked.retryable, revoked.message],
    ["ExternalMcpConnectionRevokedError", "EXTERNAL_MCP_CONNECTION_REVOKED", false, '"s1" was removed from Integrations → External MCP, so its tools no longer work. Do not retry this tool.']);
  assert.equal(rosterRefusalFor, hosted.rosterRefusalFor);
  assert.equal(vaultShim.externalMcpVaultEnvelope, hosted.externalMcpVaultEnvelope);
  assert.equal(vaultShim.deleteExternalMcpVaultEnvelope, hosted.deleteExternalMcpVaultEnvelope);
  const resolved = import.meta.resolve("@jini-ai/mcp/federation/hosted");
  assert.match(resolved, /\/dist\/federation\/hosted\/index\.js$/);
  // A shim-sealed envelope carries the context symbol of the hosted dist module ...
  const identity = { workspaceId: WS, serverId: "one" };
  const sealed = await vaultShim.sealExternalMcpVaultPayload({ deps: { sealer, keyring }, identity, kind: "mcp-auth", payload: { a: 1 } });
  assert.equal(hosted.externalMcpVaultRecord({ sealed, identity, kind: "mcp-auth", vaultErrors: vaultShim.externalMcpVaultPorts.vaultErrors }).ownerKey, "one");
  // ... and a second instance of the emitted module cannot read it: symbols are per instance,
  // so the passing path above proves every caller shares the dist instance. A distinct ESM URL
  // creates that second instance using only files present in a published installation.
  const secondInstance = await import(new URL("./vault.js?instance=isolated", resolved).href) as typeof hosted;
  assert.notEqual(secondInstance.externalMcpVaultRecord, hosted.externalMcpVaultRecord);
  assert.throws(() => secondInstance.externalMcpVaultRecord({ sealed, identity, kind: "mcp-auth", vaultErrors: vaultShim.externalMcpVaultPorts.vaultErrors }), VaultError);
});
