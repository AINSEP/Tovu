import assert from "node:assert/strict";
import test from "node:test";

import { InMemoryKeyring } from "../../webhooks/keyring.memory.js";
import { AesGcmSecretSealer } from "../../webhooks/secret-sealer.aesgcm.js";
import type { KeyringPort } from "../../webhooks/index.js";
import { InMemoryExternalMcpServerRepo } from "../external-mcp-store.memory.js";
import {
  ExternalMcpSecretStoreUnconfiguredError,
  ExternalMcpValidationError,
  deleteExternalMcpServer,
  listExternalMcpServerViews,
  openExternalMcpOAuthPayload,
  parseAllowedToolNames,
  parseArgs,
  parseEnvBlock,
  readEnabledExternalMcpConfigs,
  saveExternalMcpServer,
  toResolvedFederatedConnections,
} from "../external-mcp-store.js";
import { admitRemoteTools } from "../mcp-federation/trust.js";
import type { ResolvedFederatedConnection } from "../mcp-federation/config.js";
import type { ExternalMcpServerConfig, SaveExternalMcpOAuthInput } from "../external-mcp-store.js";

/**
 * @file `external-mcp-store.ts` — the operator-editable roster behind Settings → External MCP.
 *
 * Mirrors `execution-credential-store.test.ts`'s shape for the sibling ADR-058 stores, plus the two
 * properties those stores had no reason to assert: that env VALUES never leave through the tab's
 * read model, and that the stored allowlist really does gate admission when handed to the actual
 * trust tier rather than merely being carried around.
 */

/** Narrows a resolved config to its stdio target, failing the test rather than the type system if a
 *  row that should have been local came back hosted. */
function stdioTarget(config: ExternalMcpServerConfig | undefined): { command: string; args: string[]; env: Record<string, string> } {
  assert.ok(config, "expected a resolved config");
  assert.equal(config.target.kind, "stdio");
  if (config.target.kind !== "stdio") throw new Error("unreachable");
  return config.target;
}

/** The same narrowing one layer down, for a federation launch spec. */
function stdioLaunch(connection: ResolvedFederatedConnection | undefined): { command: string; args: readonly string[]; env: Readonly<Record<string, string>> } {
  assert.ok(connection, "expected a resolved connection");
  assert.ok(!("url" in connection.launch), "expected a stdio launch spec");
  if ("url" in connection.launch) throw new Error("unreachable");
  return connection.launch;
}

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
  assert.deepEqual(stdioTarget(configs[0]).env, { GITHUB_TOKEN: "ghp_secret_value" });
  assert.deepEqual(stdioTarget(configs[0]).args, ["-y", "@modelcontextprotocol/server-github"]);
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
  assert.deepEqual(stdioTarget(kept.configs[0]).env, { GITHUB_TOKEN: "ghp_secret_value" });
  assert.equal(kept.configs[0]?.label, "Renamed");

  await saveExternalMcpServer(deps, { ...validInput(), env: "" });
  const cleared = await readEnabledExternalMcpConfigs({ repo, sealer }, WORKSPACE);
  assert.deepEqual(stdioTarget(cleared.configs[0]).env, {});
  const views = await listExternalMcpServerViews({ repo }, WORKSPACE);
  assert.deepEqual(views[0]?.envNames, []);
});

test("an omitted or whitespace-only label falls back to the serverId, the same as a stored null label", async () => {
  const { deps, repo } = makeDeps();
  await saveExternalMcpServer(deps, validInput({ serverId: "no-label", label: undefined }));
  await saveExternalMcpServer(deps, validInput({ serverId: "blank-label", label: "   " }));

  const views = await listExternalMcpServerViews({ repo }, WORKSPACE);
  assert.equal(views.find((v) => v.serverId === "no-label")?.label, "no-label");
  assert.equal(views.find((v) => v.serverId === "blank-label")?.label, "blank-label");
});

test("omitting env on a BRAND NEW server (nothing existing to preserve) saves with no credentials at all", async () => {
  const { deps, sealer, repo } = makeDeps();
  await saveExternalMcpServer(deps, { ...validInput(), env: undefined });

  const { configs } = await readEnabledExternalMcpConfigs({ repo, sealer }, WORKSPACE);
  assert.deepEqual(stdioTarget(configs[0]).env, {});
  const [view] = await listExternalMcpServerViews({ repo }, WORKSPACE);
  assert.deepEqual(view?.envNames, []);
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
  assert.equal(stdioLaunch(connection).command, "npx");
  assert.deepEqual(stdioLaunch(connection).env, { GITHUB_TOKEN: "ghp_secret_value" });
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

test("more than 64 environment variables are refused", () => {
  const block = Array.from({ length: 65 }, (_, i) => `VAR_${i}=x`).join("\n");
  assert.throws(
    () => parseEnvBlock(block),
    (err: unknown) => err instanceof ExternalMcpValidationError && err.field === "env",
  );
});

test("more than 64 args are refused", () => {
  const raw = Array.from({ length: 65 }, (_, i) => `arg${i}`).join(" ");
  assert.throws(
    () => parseArgs(raw),
    (err: unknown) => err instanceof ExternalMcpValidationError && err.field === "args",
  );
});

test("more than 64 allowed tool names are refused", () => {
  const raw = Array.from({ length: 65 }, (_, i) => `tool_${i}`).join(",");
  assert.throws(
    () => parseAllowedToolNames(raw),
    (err: unknown) => err instanceof ExternalMcpValidationError && err.field === "allowedToolNames",
  );
});

test("a workspace at the server cap refuses a NEW server but still allows updating an existing one", async () => {
  const { deps } = makeDeps();
  for (let i = 0; i < 32; i += 1) {
    await saveExternalMcpServer(deps, validInput({ serverId: `server-${i}` }));
  }

  await assert.rejects(
    () => saveExternalMcpServer(deps, validInput({ serverId: "one-too-many" })),
    (err: unknown) => err instanceof ExternalMcpValidationError && err.field === "id",
  );

  // Updating an already-existing row at the cap must still succeed — the cap gates NEW slots only.
  const updated = await saveExternalMcpServer(deps, validInput({ serverId: "server-0", label: "renamed" }));
  assert.equal(updated.label, "renamed");
});

test("the admin read model degrades corrupt stored JSON to safe defaults rather than throwing", async () => {
  const { repo } = makeDeps();
  await repo.upsert({
    workspaceId: WORKSPACE,
    serverId: "corrupt",
    label: null,
    transport: "stdio",
    enabled: true,
    command: null,
    args: "not valid json",
    allowedToolNames: "42",
    envNames: JSON.stringify([1, "real-name", null]),
    sealedEnv: null,
    createdAt: "2026-08-09T00:00:00.000Z",
    updatedAt: "2026-08-09T00:00:00.000Z",
  });

  const [view] = await listExternalMcpServerViews({ repo }, WORKSPACE);
  assert.ok(view);
  assert.equal(view.label, "corrupt", "falls back to serverId when label is null");
  assert.equal(view.command, "", "falls back to '' when command is null");
  assert.deepEqual(view.args, [], "malformed JSON degrades to an empty array, not a throw");
  assert.deepEqual(view.allowedToolNames, [], "valid JSON that is not an array degrades to an empty array");
  assert.deepEqual(view.envNames, ["real-name"], "non-string entries are filtered out, not thrown on");
});

test("the admin read model treats a null args/allowedToolNames/envNames column as empty, not a parse failure", async () => {
  const { repo } = makeDeps();
  await repo.upsert({
    workspaceId: WORKSPACE,
    serverId: "bare",
    label: "Bare",
    transport: "stdio",
    enabled: true,
    command: "npx",
    args: null,
    allowedToolNames: null,
    envNames: null,
    sealedEnv: null,
    createdAt: "2026-08-09T00:00:00.000Z",
    updatedAt: "2026-08-09T00:00:00.000Z",
  });

  const [view] = await listExternalMcpServerViews({ repo }, WORKSPACE);
  assert.deepEqual(view?.args, []);
  assert.deepEqual(view?.allowedToolNames, []);
  assert.deepEqual(view?.envNames, []);
});

test("readEnabledExternalMcpConfigs reports a stored row with an unsupported transport or missing command, at read time, not just at save time", async () => {
  const { repo, sealer } = makeDeps();
  await repo.upsert({
    workspaceId: WORKSPACE,
    serverId: "legacy-http",
    label: "legacy",
    transport: "http",
    enabled: true,
    command: null,
    args: null,
    allowedToolNames: null,
    envNames: null,
    sealedEnv: null,
    createdAt: "2026-08-09T00:00:00.000Z",
    updatedAt: "2026-08-09T00:00:00.000Z",
  });

  const { configs, failures } = await readEnabledExternalMcpConfigs({ repo, sealer }, WORKSPACE);
  assert.equal(configs.length, 0);
  assert.equal(failures.length, 1);
  assert.equal(failures[0]?.serverId, "legacy-http");
  assert.match(failures[0]?.reason ?? "", /unsupported transport|missing command/);
});

test("a decrypted env block that is valid JSON but not an object (e.g. an array) degrades to an empty env, not a throw", async () => {
  const { repo, sealer, keyring } = makeDeps();
  const sealedEnv = await sealer.seal({ plaintext: JSON.stringify(["not", "an", "object"]), key: await keyring.activeKey() });
  await repo.upsert({
    workspaceId: WORKSPACE,
    serverId: "weird-payload",
    label: "weird",
    transport: "stdio",
    enabled: true,
    command: "npx",
    args: "[]",
    allowedToolNames: "[]",
    envNames: JSON.stringify(["x"]),
    sealedEnv,
    createdAt: "2026-08-09T00:00:00.000Z",
    updatedAt: "2026-08-09T00:00:00.000Z",
  });

  const { configs, failures } = await readEnabledExternalMcpConfigs({ repo, sealer }, WORKSPACE);
  assert.equal(failures.length, 0);
  assert.deepEqual(stdioTarget(configs[0]).env, {});
});

test("deleting a server removes it and reports whether anything was removed", async () => {
  const { deps, repo } = makeDeps();
  await saveExternalMcpServer(deps, validInput());

  assert.equal(await deleteExternalMcpServer({ repo }, { workspaceId: WORKSPACE, serverId: "github" }), true);
  assert.equal(await deleteExternalMcpServer({ repo }, { workspaceId: WORKSPACE, serverId: "github" }), false);
  assert.equal((await listExternalMcpServerViews({ repo }, WORKSPACE)).length, 0);
});

// ---------------------------------------------------------------------------
// Hosted (`streamable_http`) connections
//
// The transport that has no child process, and therefore no environment variable to put a token in.
// Until these passed, an operator could SAVE a hosted OAuth connection and it would then be refused
// at boot as an unsupported transport — the store and the runtime disagreeing about what the
// product supports.
// ---------------------------------------------------------------------------

/** Narrows a resolved config to its hosted target. */
function httpTarget(config: ExternalMcpServerConfig | undefined): { url: string; headers: Record<string, string> } {
  assert.ok(config, "expected a resolved config");
  assert.equal(config.target.kind, "streamable_http");
  if (config.target.kind !== "streamable_http") throw new Error("unreachable");
  return config.target;
}

/** A token resolver that hands back a fixed token, recording who asked. */
function fakeTokenResolver(token = "at-live-1") {
  const asked: string[] = [];
  return {
    asked,
    port: {
      async resolveAccessToken(input: { serverId: string }): Promise<string> {
        asked.push(input.serverId);
        return token;
      },
    },
  };
}

/** Writes a hosted row straight to the repo, so these tests exercise the READ path in isolation
 *  rather than re-testing the save path's validation alongside it. */
async function seedHostedRow(
  repo: InMemoryExternalMcpServerRepo,
  overrides: Partial<Parameters<InMemoryExternalMcpServerRepo["upsert"]>[0]> = {},
): Promise<void> {
  await repo.upsert({
    workspaceId: WORKSPACE,
    serverId: "higgsfield",
    label: "Higgsfield",
    transport: "streamable_http",
    authMode: "oauth",
    enabled: true,
    command: null,
    url: "https://mcp.higgsfield.example/mcp",
    args: null,
    allowedToolNames: JSON.stringify(["generate_image"]),
    envNames: null,
    sealedEnv: null,
    oauthProviderId: "higgsfield",
    oauthGrant: "authorization_code",
    oauthClientId: "client-1",
    oauthEndpointsJson: null,
    oauthScopesJson: null,
    oauthStatus: "connected",
    oauthExpiresAt: "2099-01-01T00:00:00.000Z",
    oauthTokenEnvName: null,
    sealedOAuth: null,
    createdAt: "2026-08-09T00:00:00.000Z",
    updatedAt: "2026-08-09T00:00:00.000Z",
    ...overrides,
  } as Parameters<InMemoryExternalMcpServerRepo["upsert"]>[0]);
}

test("a connected hosted OAuth row resolves to its endpoint with the token in an Authorization header", async () => {
  const { repo, sealer } = makeDeps();
  await seedHostedRow(repo);
  const resolver = fakeTokenResolver("at-live-1");

  const { configs, failures } = await readEnabledExternalMcpConfigs({ repo, sealer, oauth: resolver.port }, WORKSPACE);

  assert.deepEqual(failures, []);
  assert.equal(httpTarget(configs[0]).url, "https://mcp.higgsfield.example/mcp");
  assert.equal(httpTarget(configs[0]).headers.authorization, "Bearer at-live-1");
  assert.deepEqual(resolver.asked, ["higgsfield"]);
});

test("a hosted row needs NO tokenEnvName — that is a stdio-only concept", async () => {
  const { repo, sealer } = makeDeps();
  // The row above already has `oauthTokenEnvName: null`. Before hosted support this was a hard
  // failure ("no environment variable name is configured"), which is the wrong question to ask of a
  // server that has no child process.
  await seedHostedRow(repo, { oauthTokenEnvName: null });

  const { failures } = await readEnabledExternalMcpConfigs({ repo, sealer, oauth: fakeTokenResolver().port }, WORKSPACE);

  assert.deepEqual(failures, []);
});

test("a hosted row reaches federation as an HTTP launch spec carrying the same header", async () => {
  const { repo, sealer } = makeDeps();
  await seedHostedRow(repo);

  const { configs } = await readEnabledExternalMcpConfigs({ repo, sealer, oauth: fakeTokenResolver("at-2").port }, WORKSPACE);
  const [connection] = toResolvedFederatedConnections(configs);

  assert.ok(connection);
  assert.ok("url" in connection.launch, "a hosted row must not be handed to the stdio adapter");
  if (!("url" in connection.launch)) throw new Error("unreachable");
  assert.equal(connection.launch.url, "https://mcp.higgsfield.example/mcp");
  assert.equal(connection.launch.headers.authorization, "Bearer at-2");
  assert.equal(connection.config.connectionId, "higgsfield");
  assert.deepEqual(connection.config.allowedToolNames, ["generate_image"]);
});

test("a hosted row whose authorization expired is REPORTED, not silently dropped", async () => {
  const { repo, sealer } = makeDeps();
  await seedHostedRow(repo, { oauthStatus: "needs_reauth" });

  const { configs, failures } = await readEnabledExternalMcpConfigs({ repo, sealer, oauth: fakeTokenResolver().port }, WORKSPACE);

  assert.equal(configs.length, 0);
  // The operator whose tools vanished needs the reason, and this string is the only thing carrying
  // it at boot.
  assert.match(failures[0]?.reason ?? "", /its authorization expired or was revoked — reconnect it in Settings → External MCP/);
});

test("a hosted row with no URL fails with a reason naming the URL, not a missing command", async () => {
  const { repo, sealer } = makeDeps();
  await seedHostedRow(repo, { url: null });

  const { failures } = await readEnabledExternalMcpConfigs({ repo, sealer, oauth: fakeTokenResolver().port }, WORKSPACE);

  assert.match(failures[0]?.reason ?? "", /no URL is configured to reach it/);
});

test("a hosted row's pasted env block is NOT promoted into request headers", async () => {
  const { repo, sealer, keyring } = makeDeps();
  const sealed = await sealer.seal({ plaintext: JSON.stringify({ SOME_LOCAL_VAR: "value" }), key: await keyring.activeKey() });
  await seedHostedRow(repo, { envNames: JSON.stringify(["SOME_LOCAL_VAR"]), sealedEnv: sealed });

  const { configs } = await readEnabledExternalMcpConfigs({ repo, sealer, oauth: fakeTokenResolver().port }, WORKSPACE);

  // An operator typing FOO=bar meant an environment variable. Promoting it to a header would send a
  // value they scoped to a local process to a third party over the network.
  assert.deepEqual(Object.keys(httpTarget(configs[0]).headers), ["authorization"]);
});

test("a hosted row with no OAuth at all carries no Authorization header rather than an empty one", async () => {
  const { repo, sealer } = makeDeps();
  await seedHostedRow(repo, { authMode: "none", oauthStatus: null, oauthProviderId: null, oauthGrant: null, oauthClientId: null });

  const { configs, failures } = await readEnabledExternalMcpConfigs({ repo, sealer }, WORKSPACE);

  assert.deepEqual(failures, []);
  assert.deepEqual(httpTarget(configs[0]).headers, {});
});

test("a stdio OAuth row still receives its token as an environment variable", async () => {
  const { repo, sealer } = makeDeps();
  await seedHostedRow(repo, {
    serverId: "local-oauth",
    transport: "stdio",
    command: "npx",
    url: null,
    oauthTokenEnvName: "MCP_TOKEN",
  });

  const { configs, failures } = await readEnabledExternalMcpConfigs({ repo, sealer, oauth: fakeTokenResolver("at-stdio").port }, WORKSPACE);

  assert.deepEqual(failures, []);
  assert.equal(stdioTarget(configs[0]).env.MCP_TOKEN, "at-stdio");
});

// ---------------------------------------------------------------------------
// OAuth token survival across a save (INV-001, INV-002)
//
// The admin form sends `providerId` and all three OAuth endpoint fields on EVERY save, blank or not
// — `toItem` cannot round-trip a connection's own endpoints yet (see `use-external-mcp.hooks.ts`).
// That made `resolveOAuthEndpoints` treat every save as an identity change: it rebuilt
// `oauthEndpointsJson` from the (blank) operator input, changed the binding fingerprint, and — because
// the fingerprint no longer matched — discarded the access token, the refresh token AND the
// DCR-minted client secret on every edit, including one that only flipped `enabled`.
// ---------------------------------------------------------------------------

/** The OAuth write body the admin form sends TODAY for an untouched row: every identity/endpoint
 *  field present, `providerId` and the three endpoints blank because this connection defines its own
 *  endpoints (no registered provider) and `toItem` cannot round-trip them yet, `clientSecret` omitted
 *  because no read model ever returns one to round-trip. */
const TODAYS_UNTOUCHED_OAUTH_SAVE_BODY: SaveExternalMcpOAuthInput = {
  providerId: "",
  grant: "authorization_code",
  clientId: "client-1",
  scopes: "",
  tokenEnvName: "",
  authorizationEndpoint: "",
  tokenEndpoint: "",
  deviceAuthorizationEndpoint: "",
};

/** Seeds a row exactly as a completed connect leaves it: `persistSelfConfiguration` wrote this
 *  connection's own endpoints plus the DCR-minted `clientAuth`, `persistTokens` sealed
 *  `{clientSecret, tokens}`, and `setOAuthStatus` marked it connected. */
async function seedConnectedOAuthRow(
  repo: InMemoryExternalMcpServerRepo,
  sealer: AesGcmSecretSealer,
  keyring: InMemoryKeyring,
): Promise<void> {
  const sealedOAuth = await sealer.seal({
    plaintext: JSON.stringify({
      clientSecret: "dcr-minted-secret",
      tokens: { accessToken: "at-1", refreshToken: "rt-1", tokenType: "Bearer", scopes: [], expiresAt: null },
    }),
    key: await keyring.activeKey(),
  });
  await repo.upsert({
    workspaceId: WORKSPACE,
    serverId: "own-endpoint-server",
    label: "Own Endpoint Server",
    transport: "streamable_http",
    authMode: "oauth",
    enabled: true,
    command: null,
    url: "https://mcp.example.com/mcp",
    args: null,
    allowedToolNames: null,
    envNames: null,
    sealedEnv: null,
    oauthProviderId: null,
    oauthGrant: "authorization_code",
    oauthClientId: "client-1",
    oauthEndpointsJson: JSON.stringify({
      authorizationEndpoint: "https://auth.example.com/authorize",
      tokenEndpoint: "https://auth.example.com/token",
      deviceAuthorizationEndpoint: "https://auth.example.com/device",
      clientAuth: "client_secret_post",
    }),
    oauthScopesJson: JSON.stringify([]),
    oauthStatus: "connected",
    oauthExpiresAt: "2099-01-01T00:00:00.000Z",
    oauthTokenEnvName: null,
    oauthRefreshLeaseUntil: null,
    sealedOAuth,
    createdAt: "2026-08-09T00:00:00.000Z",
    updatedAt: "2026-08-09T00:00:00.000Z",
  } as Parameters<InMemoryExternalMcpServerRepo["upsert"]>[0]);
}

/** Re-saves the seeded row exactly as the admin panel does when an operator flips `enabled` and
 *  touches nothing else: same transport/url/command, today's OAuth body, only `enabled` changes. */
function resaveFlippingEnabledOnly(): Parameters<typeof saveExternalMcpServer>[1] {
  return {
    workspaceId: WORKSPACE,
    serverId: "own-endpoint-server",
    transport: "streamable_http",
    authMode: "oauth",
    enabled: false,
    command: "",
    url: "https://mcp.example.com/mcp",
    args: "",
    allowedToolNames: "",
    oauth: TODAYS_UNTOUCHED_OAUTH_SAVE_BODY,
  };
}

test("INV-001: a save that only flips `enabled`, sending today's blank OAuth identity fields, preserves the stored token and client secret", async () => {
  const { deps, repo, sealer, keyring } = makeDeps();
  await seedConnectedOAuthRow(repo, sealer, keyring);

  const view = await saveExternalMcpServer(deps, resaveFlippingEnabledOnly());

  assert.equal(view.oauth.status, "connected", "the binding must read as unchanged, not disconnected");
  assert.equal(view.oauth.hasStoredToken, true, "the sealed blob must survive");
  const record = await repo.findByServerId({ workspaceId: WORKSPACE, serverId: "own-endpoint-server" });
  assert.ok(record?.sealedOAuth, "the sealed OAuth column must not be nulled");
  const payload = await openExternalMcpOAuthPayload(sealer, record);
  assert.equal(payload.clientSecret, "dcr-minted-secret", "the DCR-minted client secret must survive");
  assert.equal(payload.tokens?.accessToken, "at-1", "the access token must survive");
  assert.equal(payload.tokens?.refreshToken, "rt-1", "the refresh token must survive");
});

test("INV-002: the same save preserves `clientAuth`, which no operator can type", async () => {
  const { deps, repo, sealer, keyring } = makeDeps();
  await seedConnectedOAuthRow(repo, sealer, keyring);

  await saveExternalMcpServer(deps, resaveFlippingEnabledOnly());

  const record = await repo.findByServerId({ workspaceId: WORKSPACE, serverId: "own-endpoint-server" });
  const endpoints = JSON.parse(record?.oauthEndpointsJson ?? "{}");
  assert.equal(endpoints.clientAuth, "client_secret_post");
  // The two operator-typed endpoints the admin form still can't round-trip must also survive — this
  // is what proves `clientAuth` didn't just get bolted onto an otherwise-emptied object.
  assert.equal(endpoints.tokenEndpoint, "https://auth.example.com/token");
  assert.equal(endpoints.authorizationEndpoint, "https://auth.example.com/authorize");
});

test("a genuine identity edit re-derives the operator's endpoints from scratch, but still keeps `clientAuth` (C-012 defense in depth)", async () => {
  const { deps, repo, sealer, keyring } = makeDeps();
  await seedConnectedOAuthRow(repo, sealer, keyring);

  // A real edit: the operator retyped the token endpoint. This legitimately invalidates the stored
  // token — unlike the two tests above, this save is EXPECTED to disconnect.
  await saveExternalMcpServer(deps, {
    ...resaveFlippingEnabledOnly(),
    enabled: true,
    oauth: { ...TODAYS_UNTOUCHED_OAUTH_SAVE_BODY, tokenEndpoint: "https://auth.example.com/new-token" },
  });

  const record = await repo.findByServerId({ workspaceId: WORKSPACE, serverId: "own-endpoint-server" });
  assert.equal(record?.oauthStatus, "disconnected", "a genuinely new token endpoint invalidates the binding, same as before this fix");
  const endpoints = JSON.parse(record?.oauthEndpointsJson ?? "{}");
  assert.equal(endpoints.tokenEndpoint, "https://auth.example.com/new-token", "the newly typed endpoint wins");
  assert.equal(endpoints.authorizationEndpoint, undefined, "an endpoint the operator didn't retype is not carried over — the documented re-derivation rule this fix must not disturb");
  assert.equal(endpoints.clientAuth, "client_secret_post", "clientAuth alone survives even a genuine identity edit — no operator input could ever retype it");
});
