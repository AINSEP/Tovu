import assert from "node:assert/strict";
import test from "node:test";

import * as artifactProvider from "../artifact-provider.js";
import * as barrel from "../index.js";
import * as mediaStore from "../media-store.js";
import * as registry from "../registry.js";
import * as setting from "../setting.js";

/**
 * @file The feature barrel is the composition root's only entry point, so it must re-export each
 * module's public values unchanged (same identities, nothing missing, nothing extra).
 */

test("object-storage barrel re-exports every public value of its four modules, by identity", () => {
  const expected = { ...artifactProvider, ...mediaStore, ...registry, ...setting };
  assert.deepEqual(Object.keys(barrel).sort(), Object.keys(expected).sort());
  for (const [name, value] of Object.entries(expected)) {
    assert.equal((barrel as Record<string, unknown>)[name], value, name);
  }
  assert.equal(barrel.MEDIA_OBJECT_STORE_ENV, "TOVU_MEDIA_BLOB_STORE");
  assert.equal(barrel.S3_OBJECT_STORE_ID, "s3_compatible");
  assert.equal(barrel.OBJECT_STORES_FILENAME, "tovu-object-stores.json");
  assert.equal(barrel.STORAGE_SETTINGS_NAMESPACE, "core.storage");
  assert.equal(barrel.MEDIA_OBJECT_STORE_KEY, "mediaObjectStore");
});
