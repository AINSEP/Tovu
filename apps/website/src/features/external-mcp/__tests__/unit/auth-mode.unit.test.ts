import assert from "node:assert/strict";
import test from "node:test";

import type { SealedSecret } from "#src/features/webhooks/index";
import { EXTERNAL_MCP_AUTH_MODES, externalMcpRecordHasStaticAccessToken, resolveExternalMcpAuthMode } from "../../auth-mode.js";

/** @file The external-MCP row auth-mode readers (`auth-mode.ts`): the pre-column default and the static-token check. */

const SEALED = { keyId: "k", ciphertext: "c", nonce: "n", alg: "aes-256-gcm" } as unknown as SealedSecret;

test("each known mode reads back as itself", () => {
  assert.deepEqual(EXTERNAL_MCP_AUTH_MODES, ["none", "static_env", "oauth"]);
  for (const authMode of EXTERNAL_MCP_AUTH_MODES) assert.equal(resolveExternalMcpAuthMode({ authMode }), authMode);
});

test("a row written before the column existed, or with an unknown mode, reads as static_env (never none)", () => {
  for (const authMode of ["", "bearer", "OAUTH"]) assert.equal(resolveExternalMcpAuthMode({ authMode }), "static_env", authMode);
});

test("only a static_env row with a sealed blob holds a static access token", () => {
  assert.equal(externalMcpRecordHasStaticAccessToken({ authMode: "static_env", sealedOAuth: SEALED }), true);
  assert.equal(externalMcpRecordHasStaticAccessToken({ authMode: "legacy", sealedOAuth: SEALED }), true);
  assert.equal(externalMcpRecordHasStaticAccessToken({ authMode: "static_env", sealedOAuth: null }), false);
  assert.equal(externalMcpRecordHasStaticAccessToken({ authMode: "oauth", sealedOAuth: SEALED }), false);
  assert.equal(externalMcpRecordHasStaticAccessToken({ authMode: "none", sealedOAuth: SEALED }), false);
});
