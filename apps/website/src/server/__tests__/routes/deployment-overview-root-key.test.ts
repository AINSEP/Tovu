import assert from "node:assert/strict";
import test from "node:test";

import { buildDeploymentOverviewSnapshot } from "../../inbound/admin-http/routes/system/deployment-overview.js";

/**
 * The Overview's TOVU_INTEGRATIONS_ROOT_KEY row reported only `Boolean(process.env[...])`, but the
 * keyring resolves the root key from the env var OR a generated key file, and rejects malformed
 * material. So a working file-backed key read "Not set" beside "Required to boot in production",
 * and a malformed env value read "Set". The row must report what the keyring would actually use.
 */
function rootKeyRow(rootKey: Parameters<typeof buildDeploymentOverviewSnapshot>[0]["rootKey"]) {
  const snapshot = buildDeploymentOverviewSnapshot({ defaultOwnerPasswordUnsafe: false, rootKey });
  return snapshot.envVars.find((row) => row.name === "TOVU_INTEGRATIONS_ROOT_KEY");
}

test("deployment-overview root key: a valid generated key file counts as set, with its source", () => {
  assert.deepEqual(rootKeyRow({ active: true, source: "file", fingerprint: "ab12", keyFilePath: "/x/root.key" }), {
    name: "TOVU_INTEGRATIONS_ROOT_KEY",
    set: true,
    source: "file",
  });
});

test("deployment-overview root key: a malformed env value is not set, and is flagged invalid", () => {
  assert.deepEqual(rootKeyRow({ active: false, source: "env", invalid: true, reason: "too-short", keyFilePath: "/x/root.key" }), {
    name: "TOVU_INTEGRATIONS_ROOT_KEY",
    set: false,
    source: "env",
    invalid: true,
  });
});

test("deployment-overview root key: nothing configured is not set, source none", () => {
  assert.deepEqual(rootKeyRow({ active: false, source: "none", keyFilePath: "/x/root.key" }), {
    name: "TOVU_INTEGRATIONS_ROOT_KEY",
    set: false,
    source: "none",
  });
});
