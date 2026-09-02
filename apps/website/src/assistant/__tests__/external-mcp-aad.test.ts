import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";

process.env.TOVU_INTEGRATIONS_ROOT_KEY ??= randomBytes(32).toString("hex");

import { AesGcmSecretSealer } from "../../features/webhooks/secret-sealer.aesgcm.js";
import { EnvOrFileKeyring } from "../../features/webhooks/keyring.env.js";
import { buildExternalMcpEnvAad, buildExternalMcpOAuthAad } from "../external-mcp-aad.js";
import {
  openExternalMcpOAuthPayload,
  sealExternalMcpOAuthPayload,
} from "../external-mcp-store.js";

/**
 * @file The adversarial proof for `external_mcp_servers`' AAD binding.
 *
 * Before this fix both `.seal()` call sites in `external-mcp-store.ts` (the env block and the OAuth
 * blob holding `clientSecret` + `tokens`) passed NO additional authenticated data, so a ciphertext
 * was transplantable between rows exactly as `adminExecutionCredentials`' was — except the payload
 * here is OAuth credentials for an external MCP server.
 */

const keyring = new EnvOrFileKeyring({ allowFileFallback: false });
const sealer = new AesGcmSecretSealer(keyring);
const deps = { sealer, keyring };

const WORKSPACE = "workspace-1";
const SERVER_A = "server-a";
const SERVER_B = "server-b";

test("external-mcp AAD: the two blobs on one row get DIFFERENT aad, so neither can be swapped into the other's slot", () => {
  const env = buildExternalMcpEnvAad({ workspaceId: WORKSPACE, serverId: SERVER_A });
  const oauth = buildExternalMcpOAuthAad({ workspaceId: WORKSPACE, serverId: SERVER_A });

  assert.equal(env, `external-mcp-env:v1:${WORKSPACE}:${SERVER_A}`);
  assert.equal(oauth, `external-mcp-oauth:v1:${WORKSPACE}:${SERVER_A}`);
  assert.notEqual(env, oauth);
});

test("external-mcp AAD: builders bind BOTH primary-key columns, not just the workspace", () => {
  const a = buildExternalMcpOAuthAad({ workspaceId: WORKSPACE, serverId: SERVER_A });
  const b = buildExternalMcpOAuthAad({ workspaceId: WORKSPACE, serverId: SERVER_B });
  const other = buildExternalMcpOAuthAad({ workspaceId: "workspace-2", serverId: SERVER_A });

  assert.notEqual(a, b, "two servers in one workspace must not share an aad");
  assert.notEqual(a, other, "the same server id in two workspaces must not share an aad");
});

test("external-mcp OAuth blob: opens under its OWN (workspace, server) identity", async () => {
  const identity = { workspaceId: WORKSPACE, serverId: SERVER_A };
  const { sealedOAuth, oauthAadVersion } = await sealExternalMcpOAuthPayload(deps, identity, {
    clientSecret: "cs-server-a",
    tokens: { accessToken: "at-server-a", refreshToken: "rt-server-a" },
  });
  assert.notEqual(sealedOAuth, null);
  // The seal hands back the version with the ciphertext, so the row can never fall out of step.
  assert.equal(oauthAadVersion, 1);

  const opened = await openExternalMcpOAuthPayload(sealer, { ...identity, sealedOAuth, oauthAadVersion });

  assert.equal(opened.clientSecret, "cs-server-a");
  assert.equal(opened.tokens?.accessToken, "at-server-a");
});

test("external-mcp OAuth blob: CROSS-SERVER ciphertext transplant is rejected (the vulnerability)", async () => {
  const { sealedOAuth: sealed } = await sealExternalMcpOAuthPayload(
    deps,
    { workspaceId: WORKSPACE, serverId: SERVER_A },
    { clientSecret: "cs-server-a", tokens: { accessToken: "at-server-a" } },
  );

  // Server A's ciphertext, presented as if it were row B's. Before the fix this returned
  // server A's OAuth tokens through server B's row.
  await assert.rejects(
    () =>
      // The real attack shape: row B, carrying row A's ciphertext in its own column.
      openExternalMcpOAuthPayload(sealer, {
        workspaceId: WORKSPACE,
        serverId: SERVER_B,
        sealedOAuth: sealed,
        oauthAadVersion: 1,
      }),
    (err: unknown) => {
      assert.ok(err instanceof Error);
      assert.match(err.message, /^stored OAuth credentials could not be decrypted: /);
      return true;
    },
  );
});

test("external-mcp OAuth blob: CROSS-WORKSPACE transplant is rejected", async () => {
  const { sealedOAuth: sealed } = await sealExternalMcpOAuthPayload(
    deps,
    { workspaceId: WORKSPACE, serverId: SERVER_A },
    { clientSecret: "cs-server-a" },
  );

  await assert.rejects(() =>
    openExternalMcpOAuthPayload(sealer, {
      workspaceId: "workspace-attacker",
      serverId: SERVER_A,
      sealedOAuth: sealed,
      oauthAadVersion: 1,
    }),
  );
});

test("external-mcp OAuth blob: a v0 legacy row still opens, so the fix does not brick live data", async () => {
  // Exactly what a pre-fix row looks like: sealed with no aad at all.
  const legacy = await sealer.seal({
    plaintext: JSON.stringify({ clientSecret: "legacy-secret" }),
    key: await keyring.activeKey(),
  });

  const opened = await openExternalMcpOAuthPayload(sealer, {
    workspaceId: WORKSPACE,
    serverId: SERVER_A,
    sealedOAuth: legacy,
    oauthAadVersion: 0,
  });

  assert.equal(opened.clientSecret, "legacy-secret");
});
