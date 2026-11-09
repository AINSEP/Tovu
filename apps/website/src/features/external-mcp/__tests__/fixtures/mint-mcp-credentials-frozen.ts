import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createTovuOAuthGuard } from "../../../../platform/oauth/endpoint-safety.js";
import { createDeviceAuthorizationStore, createExternalMcpOAuthService } from "../../external-mcp-oauth.js";
import { SqlExternalMcpServerRepo } from "../../external-mcp-repo.js";
import { saveExternalMcpServer } from "../../external-mcp-store.js";
import { FROZEN_PLAINTEXT, FROZEN_PROVIDER, FROZEN_REDIRECT_URI, FROZEN_SERVERS, FROZEN_SQL_PATH, FROZEN_WORKSPACE,
  closeFrozenDb, dumpFrozenRows, insertFrozenWorkspace, fakeOAuthServer, frozenClock, frozenKeyring, frozenSealer, openFrozenDb } from "./mcp-credentials-frozen.fixture.js";

/**
 * @file ONE-TIME mint of `mcp-credentials.frozen.sql` (EXTRACT-S5 H0). Run exactly once, before any
 * move, from the Tovu root:
 *
 *   TSX_TSCONFIG_PATH=apps/site-chat/tsconfig.json node --import tsx \
 *     apps/website/src/features/external-mcp/__tests__/fixtures/mint-mcp-credentials-frozen.ts --i-am-minting-once
 *
 * Writes go through the unmoved `SqlExternalMcpServerRepo`, `saveExternalMcpServer` and the OAuth
 * service's redirect sign-in against an in-process fake token server. Never rerun after a move:
 * the fixture exists to prove later code still reads THESE bytes. Refuses to overwrite.
 */

async function mint(): Promise<void> {
  if (!process.argv.includes("--i-am-minting-once")) throw new Error("refusing: pass --i-am-minting-once (the fixture is minted once, never reminted)");
  if (fs.existsSync(FROZEN_SQL_PATH)) throw new Error("refusing: the frozen fixture already exists and must never be reminted");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mcp-frozen-mint-"));
  const { db, kernel } = await openFrozenDb(path.join(dir, "content.db"));
  insertFrozenWorkspace({ db });
  const repo = new SqlExternalMcpServerRepo(kernel);
  const keyring = frozenKeyring();
  const sealer = frozenSealer(keyring);
  const clock = frozenClock();
  const deps = { repo, sealer, keyring, clock };
  const common = { workspaceId: FROZEN_WORKSPACE, enabled: true, writeAllowedToolNames: "", principalId: "principal-frozen" };

  await saveExternalMcpServer(deps, { ...common, serverId: FROZEN_SERVERS.env, label: "Env Tool", transport: "stdio", authMode: "none",
    command: "npx", args: "-y env-tool-mcp", allowedToolNames: "search",
    env: Object.entries(FROZEN_PLAINTEXT.envBlock).map(([name, value]) => `${name}=${value}`).join("\n") });
  await saveExternalMcpServer(deps, { ...common, serverId: FROZEN_SERVERS.static, label: "Static HTTP", transport: "streamable_http",
    authMode: "static_env", command: "", url: "https://mcp.static.example.com/mcp", args: "", allowedToolNames: "lookup",
    accessToken: FROZEN_PLAINTEXT.staticToken });
  await saveExternalMcpServer(deps, { ...common, serverId: FROZEN_SERVERS.oauth, label: "Higgs", transport: "stdio", authMode: "oauth",
    command: "npx", args: "-y higgs-mcp", allowedToolNames: "generate_image", writeAllowedToolNames: "generate_image",
    env: Object.entries(FROZEN_PLAINTEXT.oauthEnv).map(([name, value]) => `${name}=${value}`).join("\n"),
    oauth: { providerId: FROZEN_PROVIDER.providerId, grant: "authorization_code", clientId: "tovu-frozen-client",
      clientSecret: FROZEN_PLAINTEXT.clientSecret, scopes: "images:generate", tokenEnvName: "HIGGS_TOKEN" } });

  const server = fakeOAuthServer(() => ({ json: { token_type: "Bearer", access_token: FROZEN_PLAINTEXT.accessToken,
    refresh_token: FROZEN_PLAINTEXT.refreshToken, expires_in: 3600 } }));
  const service = createExternalMcpOAuthService({ workspaceId: FROZEN_WORKSPACE, repo, sealer, keyring, clock,
    devices: createDeviceAuthorizationStore(), lookupProvider: () => FROZEN_PROVIDER,
    httpPorts: { guard: createTovuOAuthGuard({}, { allowLoopbackHttp: true }), fetchFn: ({ url }, init) => server.fetchFn(url, init) } });
  const started = await service.beginConnect({ serverId: FROZEN_SERVERS.oauth, redirectUri: FROZEN_REDIRECT_URI });
  if (started.kind !== "redirect_required") throw new Error(`expected a redirect sign-in, got ${started.kind}`);
  const state = new URL(started.authorizationUrl).searchParams.get("state") ?? "";
  await service.completeAuthorizationCallback({ serverId: FROZEN_SERVERS.oauth, redirectUri: FROZEN_REDIRECT_URI, params: { state, code: "fake-code" } });
  if (server.requests.length !== 1) throw new Error(`expected one token request, saw ${server.requests.length}`);

  const header = ["-- EXTRACT-S5 H0 frozen external-MCP credentials (SQLite). Minted ONCE; never remint.",
    "-- TEST key and FAKE tokens only. Load into a migrated content db that has the secrets_vault table.", ""].join("\n");
  fs.writeFileSync(FROZEN_SQL_PATH, header + dumpFrozenRows({ db }));
  closeFrozenDb(db);
  fs.rmSync(dir, { recursive: true, force: true });
  process.stdout.write(`minted ${FROZEN_SQL_PATH.pathname}\n`);
}

await mint();
