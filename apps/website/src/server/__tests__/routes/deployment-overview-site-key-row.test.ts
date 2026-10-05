import assert from "node:assert/strict";
import test from "node:test";

import { buildDeploymentOverviewSnapshot } from "../../inbound/admin-http/routes/system/deployment-overview.js";

/**
 * The Overview's TOVU_SITE_KEY row reported only `Boolean(process.env[...])`, but the
 * keyring resolves the site key from the env var OR a generated key file, and rejects malformed
 * material. So a working file-backed key read "Not set" beside "Required to boot in production",
 * and a malformed env value read "Set". The row must report what the keyring would actually use.
 */
function siteKeyRow(siteKey: Parameters<typeof buildDeploymentOverviewSnapshot>[0]["siteKey"]) {
  const snapshot = buildDeploymentOverviewSnapshot({ defaultOwnerPasswordUnsafe: false, siteKey });
  return snapshot.envVars.find((row) => row.name === "TOVU_SITE_KEY");
}

test("deployment-overview site key: a valid generated key file counts as set, with its source", () => {
  assert.deepEqual(siteKeyRow({ active: true, source: "file", fingerprint: "ab12", keyFilePath: "/x/root.key" }), {
    name: "TOVU_SITE_KEY",
    set: true,
    source: "file",
  });
});

test("deployment-overview site key: a malformed env value is not set, and is flagged invalid", () => {
  assert.deepEqual(siteKeyRow({ active: false, source: "env", invalid: true, reason: "too-short", keyFilePath: "/x/root.key" }), {
    name: "TOVU_SITE_KEY",
    set: false,
    source: "env",
    invalid: true,
  });
});

test("deployment-overview site key: nothing configured is not set, source none", () => {
  assert.deepEqual(siteKeyRow({ active: false, source: "none", keyFilePath: "/x/root.key" }), {
    name: "TOVU_SITE_KEY",
    set: false,
    source: "none",
  });
});
