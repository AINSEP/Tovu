import assert from "node:assert/strict";
import test from "node:test";

import * as artifactProvider from "../artifact-provider.js";
import * as barrel from "../index.js";
import * as mediaStore from "../media-store.js";
import * as registry from "../registry.js";
import * as setting from "@jini-ai/platform/object-store/site/setting";

/**
 * @file The feature barrel is the composition root's only entry point, so it must re-export each
 * module's public values unchanged (same identities, nothing missing, nothing extra).
 */

test("object-storage barrel re-exports every public value of its three remaining modules, by identity", () => {
  // The setting module moved to `@jini-ai/platform/object-store/site/setting`; the barrel no longer
  // re-exports it (no re-export shells), so composition imports it from Jini directly.
  const expected = { ...artifactProvider, ...mediaStore, ...registry };
  assert.deepEqual(Object.keys(barrel).sort(), Object.keys(expected).sort());
  for (const [name, value] of Object.entries(expected)) {
    assert.equal((barrel as Record<string, unknown>)[name], value, name);
  }
  assert.equal(barrel.MEDIA_OBJECT_STORE_ENV, "TOVU_MEDIA_BLOB_STORE");
  assert.equal(barrel.OBJECT_STORES_FILENAME, "jini-object-stores.json");
  assert.equal(setting.STORAGE_SETTINGS_NAMESPACE, "core.storage");
  assert.equal(setting.MEDIA_OBJECT_STORE_KEY, "mediaObjectStore");
  for (const name of Object.keys(setting)) assert.equal(name in barrel, false, name);
});
