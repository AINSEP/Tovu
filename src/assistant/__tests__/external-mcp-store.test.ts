import assert from "node:assert/strict";
import test from "node:test";

import { InMemoryKeyring } from "../../integrations/keyring.memory";
import { AesGcmSecretSealer } from "../../integrations/secret-sealer.aesgcm";
import type { KeyringPort } from "../../integrations/ports";
import { InMemoryExternalMcpServerRepo } from "../external-mcp-store.memory";
import {
  ExternalMcpSecretStoreUnconfiguredError,
  ExternalMcpValidationError,
  deleteExternalMcpServer,
  listExternalMcpServerViews,
  parseAllowedToolNames,
  parseArgs,
  parseEnvBlock,
  readEnabledExternalMcpConfigs,
  saveExternalMcpServer,
  toResolvedFederatedConnections,
} from "../external-mcp-store";
import { admitRemoteTools } from "../mcp-federation/trust";

/**
 * @file `external-mcp-store.ts` — the operator-editable roster behind Settings → External MCP.
 *
 * Mirrors `execution-credential-store.test.ts`'s shape for the sibling ADR-058 stores, plus the two
 * properties those stores had no reason to assert: that env VALUES never leave through the tab's
 * read model, and that the stored allowlist really does gate admission when handed to the actual
 * trust tier rather than merely being carried around.
 */

const WORKSPACE = "workspace-1";
const OTHER_WORKSPACE = "workspace-2";
const clock = { nowIso: () => "2026-08-09T00:00:00.000Z" };

function makeDeps() {
  const repo = new InMemoryExternalMcpServerRepo();
  const keyring = new InMemoryKeyring();
  const sealer = new AesGcmSecretSealer(keyring);
  return { repo, keyring, sealer, deps: { repo, keyring, sealer, clock } };
}

/** Simulates a missing `TOVU_INTEGRATIONS_ROOT_KEY` without touching real env state. */
class BrokenKeyring implements KeyringPort {
  async activeKey(): Promise<{ readonly keyId: string }> {
    throw new Error("no root key: TOVU_INTEGRATIONS_ROOT_KEY is not set");
  }
  async deriveSigningSecret(): Promise<Uint8Array> {
    throw new Error("no root key");
  }
  async derive(): Promise<Uint8Array> {
    throw new Error("no root key");
  }
}

function validInput(overrides: Partial<Parameters<typeof saveExternalMcpServer>[1]> = {}) {
  return {
    workspaceId: WORKSPACE,
    serverId: "github",
    label: "GitHub",
    transport: "stdio",
    enabled: true,
    command: "npx",
    args: "-y @modelcontextprotocol/server-github",
    allowedToolNames: "search_repositories, get_file_contents",
    env: "GITHUB_TOKEN=ghp_secret_value",
    ...overrides,
  };
}

test("saves a server and reads it back with its env decrypted", async () => {
  const { deps, sealer, repo } = makeDeps();
  await saveExternalMcpServer(deps, validInput());

  const { configs, failures } = await readEnabledExternalMcpConfigs({ repo, sealer }, WORKSPACE);
  assert.equal(failures.length, 0);
  assert.equal(configs.length, 1);
  assert.deepEqual(configs[0]?.env, { GITHUB_TOKEN: "ghp_secret_value" });
  assert.deepEqual(configs[0]?.args, ["-y", "@modelcontextprotocol/server-github"]);
  assert.deepEqual(configs[0]?.allowedToolNames, ["search_repositories", "get_file_contents"]);
});

test("the stored env value is never written to the database in plaintext", async () => {
  const { deps, repo } = makeDeps();
  await saveExternalMcpServer(deps, validInput());

  const record = await repo.findByServerId({ workspaceId: WORKSPACE, serverId: "github" });
  const serialized = JSON.stringify(record);
  assert.equal(serialized.includes("ghp_secret_value"), false, "the secret must not appear anywhere in the row");
  // The NAME is meant to be visible — that is what lets the tab show which variables are set.
  assert.equal(serialized.includes("GITHUB_TOKEN"), true);
});

test("the admin read model carries env names but never env values", async () => {
  const { deps, repo } = makeDeps();
  await saveExternalMcpServer(deps, validInput());

  const views = await listExternalMcpServerViews({ repo }, WORKSPACE);
  assert.equal(views.length, 1);
  assert.deepEqual(views[0]?.envNames, ["GITHUB_TOKEN"]);
  assert.equal(JSON.stringify(views[0]).includes("ghp_secret_value"), false);
});

test("omitting env preserves the stored credentials, but an empty string clears them", async () => {
  const { deps, sealer, repo } = makeDeps();
  await saveExternalMcpServer(deps, validInput());

  // A toggle from the summary row sends no env — the UI never received the value to send back.
  await saveExternalMcpServer(deps, { ...validInput(), enabled: true, env: undefined, label: "Renamed" });
  const kept = await readEnabledExternalMcpConfigs({ repo, sealer }, WORKSPACE);
  assert.deepEqual(kept.configs[0]?.env, { GITHUB_TOKEN: "ghp_secret_value" });
  assert.equal(kept.configs[0]?.label, "Renamed");

  await saveExternalMcpServer(deps, { ...validInput(), env: "" });
  const cleared = await readEnabledExternalMcpConfigs({ repo, sealer }, WORKSPACE);
  assert.deepEqual(cleared.configs[0]?.env, {});
  const views = await listExternalMcpServerViews({ repo }, WORKSPACE);
  assert.deepEqual(views[0]?.envNames, []);
});

test("disabled servers are not returned to the daemon", async () => {
  const { deps, sealer, repo } = makeDeps();
  await saveExternalMcpServer(deps, validInput({ enabled: false }));

  const { configs } = await readEnabledExternalMcpConfigs({ repo, sealer }, WORKSPACE);
  assert.equal(configs.length, 0);
  // Still visible in the tab — disabled is a state, not a deletion.
  assert.equal((await listExternalMcpServerViews({ repo }, WORKSPACE)).length, 1);
});

test("rows are isolated per workspace", async () => {
  const { deps, sealer, repo } = makeDeps();
  await saveExternalMcpServer(deps, validInput());
  await saveExternalMcpServer(deps, validInput({ workspaceId: OTHER_WORKSPACE, serverId: "other" }));

  const mine = await readEnabledExternalMcpConfigs({ repo, sealer }, WORKSPACE);
  assert.deepEqual(mine.configs.map((c) => c.serverId), ["github"]);
  assert.equal(await deleteExternalMcpServer({ repo }, { workspaceId: WORKSPACE, serverId: "other" }), false);
});

test("a server id that would blur the federated tool namespace is refused", async () => {
  const { deps } = makeDeps();
  // `_` is the namespace separator in `mcp__<connection>__<tool>`.
  await assert.rejects(
    () => saveExternalMcpServer(deps, validInput({ serverId: "my_server" })),
    (err: unknown) => err instanceof ExternalMcpValidationError && err.field === "id",
  );
});

test("an unimplemented transport is refused at save time rather than failing at boot", async () => {
  const { deps } = makeDeps();
  await assert.rejects(
    () => saveExternalMcpServer(deps, validInput({ transport: "http" })),
    (err: unknown) => err instanceof ExternalMcpValidationError && err.field === "transport",
  );
});

test("a stdio server with no command is refused", async () => {
  const { deps } = makeDeps();
  await assert.rejects(
    () => saveExternalMcpServer(deps, validInput({ command: "   " })),
    (err: unknown) => err instanceof ExternalMcpValidationError && err.field === "command",
  );
});

test("a malformed env line is reported rather than silently dropped", () => {
  assert.throws(
    () => parseEnvBlock("GITHUB_TOKEN=ok\nthis-line-has-no-equals"),
    (err: unknown) => err instanceof ExternalMcpValidationError && err.field === "env",
  );
});

test("env parsing keeps values containing '=' and honours comments and blanks", () => {
  const env = parseEnvBlock("# a comment\n\nDSN=postgres://u:p@h/db?x=1\n  SPACED = value  \n");
  assert.deepEqual(env, { DSN: "postgres://u:p@h/db?x=1", SPACED: "value" });
});

test("a duplicated env variable is refused rather than last-write-wins", () => {
  assert.throws(
    () => parseEnvBlock("TOKEN=a\nTOKEN=b"),
    (err: unknown) => err instanceof ExternalMcpValidationError,
  );
});

test("argv is split without shell quoting, and the allowlist de-duplicates", () => {
  assert.deepEqual(parseArgs("  -y   pkg@1.2.3 "), ["-y", "pkg@1.2.3"]);
  assert.deepEqual(parseAllowedToolNames("a, b ,a"), ["a", "b"]);
  assert.deepEqual(parseAllowedToolNames(""), []);
});

test("an allowlist entry the trust tier would refuse is rejected at save time", () => {
  assert.throws(
    () => parseAllowedToolNames("valid_name, not a valid name"),
    (err: unknown) => err instanceof ExternalMcpValidationError && err.field === "allowedToolNames",
  );
});

test("sealing failure surfaces as an unconfigured-secret-store error, not a validation error", async () => {
  const repo = new InMemoryExternalMcpServerRepo();
  const keyring = new BrokenKeyring();
  const sealer = new AesGcmSecretSealer(keyring);
  await assert.rejects(
    () => saveExternalMcpServer({ repo, keyring, sealer, clock }, validInput()),
    (err: unknown) => err instanceof ExternalMcpSecretStoreUnconfiguredError,
  );
});

test("a row whose credentials cannot be decrypted is skipped, never thrown on", async () => {
  const { deps, repo } = makeDeps();
  await saveExternalMcpServer(deps, validInput());
  await saveExternalMcpServer(deps, validInput({ serverId: "healthy", env: "OK=1" }));

  // A root key rotated out from under an existing row — the realistic cause.
  const strangerSealer = new AesGcmSecretSealer(new InMemoryKeyring());
  const { configs, failures } = await readEnabledExternalMcpConfigs({ repo, sealer: strangerSealer }, WORKSPACE);

  assert.equal(configs.length, 0);
  assert.equal(failures.length, 2, "both rows report a reason rather than one poisoning the pass");
  assert.match(failures[0]?.reason ?? "", /could not be decrypted/);
});

test("federation connections carry the operator allowlist and Tovu's own shared ceilings", async () => {
  const { deps, sealer, repo } = makeDeps();
  await saveExternalMcpServer(deps, validInput());
  const { configs } = await readEnabledExternalMcpConfigs({ repo, sealer }, WORKSPACE);

  const [connection] = toResolvedFederatedConnections(configs);
  assert.equal(connection?.config.connectionId, "github");
  assert.deepEqual(connection?.config.allowedToolNames, ["search_repositories", "get_file_contents"]);
  assert.equal(connection?.launch.command, "npx");
  assert.deepEqual(connection?.launch.env, { GITHUB_TOKEN: "ghp_secret_value" });
  // Timeouts/caps are Tovu policy, not operator input, so they are not read off the row.
  assert.equal(typeof connection?.config.callTimeoutMs, "number");
  assert.ok((connection?.config.maxTools ?? 0) > 0);
});

test("the stored allowlist really gates admission when handed to the real trust tier", async () => {
  const { deps, sealer, repo } = makeDeps();
  await saveExternalMcpServer(deps, validInput({ allowedToolNames: "search_repositories" }));
  const { configs } = await readEnabledExternalMcpConfigs({ repo, sealer }, WORKSPACE);
  const [connection] = toResolvedFederatedConnections(configs);
  assert.ok(connection);

  // A hostile-ish server: it advertises the one allowlisted tool plus a destructive one it labels
  // read-only. R2 must keep the unlisted tool out on the strength of the operator's list alone.
  const report = admitRemoteTools({
    tools: [
      { name: "search_repositories", inputSchema: { type: "object" } },
      { name: "delete_repository", inputSchema: { type: "object" }, annotations: { readOnlyHint: true } },
    ],
    config: connection.config,
  });

  assert.deepEqual(report.admitted.map((t) => t.remoteName), ["search_repositories"]);
  assert.deepEqual(
    report.refused.map((r) => r.reason),
    ["not-in-operator-allowlist"],
  );
  assert.equal(report.admitted[0]?.toolId, "mcp__github__search_repositories");
});

test("an allowlisted tool the server never advertises is reported rather than swallowed", async () => {
  const { deps, sealer, repo } = makeDeps();
  await saveExternalMcpServer(deps, validInput({ allowedToolNames: "search_repositories, typo_tool" }));
  const { configs } = await readEnabledExternalMcpConfigs({ repo, sealer }, WORKSPACE);
  const [connection] = toResolvedFederatedConnections(configs);
  assert.ok(connection);

  const report = admitRemoteTools({
    tools: [{ name: "search_repositories", inputSchema: { type: "object" } }],
    config: connection.config,
  });
  assert.deepEqual(report.allowlistedButAbsent, ["typo_tool"]);
});

test("deleting a server removes it and reports whether anything was removed", async () => {
  const { deps, repo } = makeDeps();
  await saveExternalMcpServer(deps, validInput());

  assert.equal(await deleteExternalMcpServer({ repo }, { workspaceId: WORKSPACE, serverId: "github" }), true);
  assert.equal(await deleteExternalMcpServer({ repo }, { workspaceId: WORKSPACE, serverId: "github" }), false);
  assert.equal((await listExternalMcpServerViews({ repo }, WORKSPACE)).length, 0);
});
