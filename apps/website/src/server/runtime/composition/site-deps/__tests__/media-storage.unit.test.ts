import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import { openContentDb } from "#src/platform/db/sqlite/content-db";
import { composeMediaStorage } from "../media-storage.js";

/**
 * @file `composeMediaStorage`'s late-bound shared-credential port: media reads the site's saved bucket
 * connection through the publish credential source, which only exists once `routeDeps` is built, so
 * `resolveSharedCredential` waits on `provideMediaCredentials` and maps the provider id (underscores)
 * onto the deploy target id (hyphens) before projecting the resolved connection to `{ fields, secret }`.
 */

type Required = Parameters<typeof composeMediaStorage>[0];
type CredentialSource = Parameters<ReturnType<typeof composeMediaStorage>["provideMediaCredentials"]>[0];

const uploadsDir = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-media-storage-"));
after(() => fs.rmSync(uploadsDir, { recursive: true, force: true }));

function compose() {
  return composeMediaStorage({
    overrides: { uploadsDir },
    resolvedSiteBinding: { dir: uploadsDir, name: "bakery" },
    observability: () => undefined,
    workspaceId: () => "ws-media-9",
    agentPluginLifecycle: {},
    settingsRepo: () => ({}),
    store: { sqliteDb: openContentDb(":memory:") },
    dbPath: ":memory:",
  } as unknown as Required);
}

test("resolveSharedCredential waits for the credential source, asks for the hyphenated target, and splits off the token as the secret", async () => {
  const { mediaStorePorts, provideMediaCredentials } = compose();
  const seen: unknown[] = [];
  const pending = mediaStorePorts().resolveSharedCredential({ providerId: "cloudflare_r2_eu" });
  provideMediaCredentials({ resolve: async (input: unknown) => { seen.push(input); return { ok: true, token: "tok-a", accountId: "acct-1", bucket: "pics", credentialId: "cred-1" }; } } as unknown as CredentialSource);
  assert.deepEqual(await pending, { fields: { accountId: "acct-1", bucket: "pics" }, secret: "tok-a" });
  assert.deepEqual(seen, [{ workspaceId: "ws-media-9", target: "cloudflare-r2-eu" }]);
});

test("resolveSharedCredential answers undefined when the site has no usable saved connection", async () => {
  const { mediaStorePorts, provideMediaCredentials } = compose();
  provideMediaCredentials({ resolve: async () => ({ ok: false, reason: "missing" }) } as unknown as CredentialSource);
  assert.equal(await mediaStorePorts().resolveSharedCredential({ providerId: "s3" }), undefined);
});
