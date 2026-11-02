import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { readBundledObjectStoreEnvDeclarations } from "../../../../apps/website/src/features/object-storage/registry.ts";
import { readMediaStoreEnv, createMediaBlobStore } from "../../../../apps/website/src/features/object-storage/media-store.ts";
import path from 'node:path';
import { agentPluginSourceDir } from '../../../../development/test-support/agent-plugin-source.mjs';
import { processComposedBundledSourceRoot } from '../../../../apps/website/src/features/agent-plugins/__tests__/fixtures/bundled-source-root.ts';

// s3-compatible ships from @jini-ai/agent-plugins/s3-compatible: read it where Tovu takes it from.
const PLUGIN_DIR = agentPluginSourceDir({ pluginId: 's3-compatible' });

const { id, env: declaration } = JSON.parse(readFileSync(path.join(PLUGIN_DIR, "tovu-object-stores.json"), "utf8")).providers[0];
const names = ["TOVU_S3_BUCKET", "TOVU_S3_REGION", "TOVU_S3_ACCESS_KEY_ID", "TOVU_S3_SECRET_ACCESS_KEY"];
const complete = { TOVU_MEDIA_BLOB_STORE: "s3", TOVU_S3_BUCKET: "bucket", TOVU_S3_REGION: "region", TOVU_S3_ACCESS_KEY_ID: "id", TOVU_S3_SECRET_ACCESS_KEY: "secret", TOVU_S3_KEY_PREFIX: "prefix/", TOVU_S3_ENDPOINT: "https://objects.example.test" };
const envDeclarations = readBundledObjectStoreEnvDeclarations({ sourceRoot: await processComposedBundledSourceRoot() });

test("the bundled mapping is available without provider activation and preserves optional fields", () => {
  assert.deepEqual(envDeclarations.find(entry => entry.providerId === id), { providerId: id, ...declaration });
  assert.deepEqual(declaration.required, names);
  assert.deepEqual(readMediaStoreEnv({ env: complete }, { envDeclarations }), { kind: "remote", providerId: "s3_compatible", settings: { bucket: "bucket", keyPrefix: "prefix/" }, credential: { fields: { accessKeyId: "id", region: "region", endpoint: "https://objects.example.test" }, secret: "secret" } });
  const { TOVU_S3_ENDPOINT, TOVU_S3_KEY_PREFIX, ...withoutOptional } = complete;
  const choice = readMediaStoreEnv({ env: withoutOptional }, { envDeclarations });
  assert.equal(choice.settings.keyPrefix, undefined);
  assert.equal(choice.credential.fields.endpoint, undefined);
});

test("every missing-variable combination preserves the original error bytes and ordering synchronously", () => {
  for (let mask = 1; mask < 16; mask++) {
    const env = { ...complete };
    const missing = names.filter((name, index) => mask & (1 << index));
    for (const [index, name] of missing.entries()) env[name] = index % 2 ? "" : undefined;
    const message = `TOVU_MEDIA_BLOB_STORE=s3 requires ${names.join(", ")} — missing: ${missing.join(", ")}.`;
    assert.throws(() => readMediaStoreEnv({ env }, { envDeclarations }), { message });
    assert.throws(() => createMediaBlobStore({ uploadsDir: "/unused", env, ports: () => { throw new Error("must fail before ports"); } }, { envDeclarations }), { message });
  }
  for (const backend of ["", "S3", "other"]) {
    assert.throws(() => readMediaStoreEnv({ env: { TOVU_MEDIA_BLOB_STORE: backend } }, { envDeclarations }), { message: `Unknown TOVU_MEDIA_BLOB_STORE '${backend}' — expected 'local' or 's3'.` });
  }
});
