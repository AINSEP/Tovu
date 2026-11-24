import assert from "node:assert/strict";
import test from "node:test";

import { MEDIA_OBJECT_STORE_ENV } from "../media-store.js";
import { OBJECT_STORES_FILENAME } from "@jini-ai/platform/object-store/site/registry";
import * as setting from "@jini-ai/platform/object-store/site/setting";

/**
 * @file The wire names operators and plugins already depend on. The feature barrel that used to
 * carry these assertions was removed (no re-export shells): composition imports `media-store.ts`,
 * `artifact-provider.ts` directly, and the registry/setting modules from Jini.
 */

test("object-storage keeps its operator env name, plugin manifest filename and setting keys", () => {
  assert.equal(MEDIA_OBJECT_STORE_ENV, "TOVU_MEDIA_BLOB_STORE");
  assert.equal(OBJECT_STORES_FILENAME, "jini-object-stores.json");
  assert.equal(setting.STORAGE_SETTINGS_NAMESPACE, "core.storage");
  assert.equal(setting.MEDIA_OBJECT_STORE_KEY, "mediaObjectStore");
});
