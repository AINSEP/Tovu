import assert from "node:assert/strict";
import test from "node:test";

import { PUBLISH_CONTENT_ARTIFACT_FORMAT_VERSION } from "#src/features/publish-content/artifact-format";
import { CONTENT_HASH_VERSION } from "#src/features/publish-content/content-hash";
import { validateBundleBody } from "#src/server/inbound/admin-http/routes/publish-content/bundle-create";

function validBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    artifactFormatVersion: PUBLISH_CONTENT_ARTIFACT_FORMAT_VERSION,
    hashVersion: CONTENT_HASH_VERSION,
    sourceLabel: "source",
    entities: [
      {
        entityType: "post",
        id: "p-1",
        schemaVersion: 1,
        contentHash: "hash",
        hashVersion: CONTENT_HASH_VERSION,
        requiredBlobs: [],
        state: {},
      },
    ],
    blobManifest: [],
    ...overrides,
  };
}

test("bundle body validation accepts the current artifact and entity version fields", () => {
  const result = validateBundleBody(validBody());
  assert.equal("error" in result, false);
});

test("bundle body validation rejects a missing or unknown artifact format version", () => {
  assert.deepEqual(validateBundleBody(validBody({ artifactFormatVersion: undefined })), {
    error: "artifactFormatVersion must be an integer",
  });
  const unknown = validateBundleBody(validBody({ artifactFormatVersion: PUBLISH_CONTENT_ARTIFACT_FORMAT_VERSION + 1 }));
  assert.ok("error" in unknown);
  assert.match(unknown.error, /unsupported artifactFormatVersion 2/);
});

test("bundle body validation rejects a missing or non-integer per-type schema version", () => {
  const withoutSchema = validBody().entities as Array<Record<string, unknown>>;
  delete withoutSchema[0].schemaVersion;
  assert.deepEqual(validateBundleBody(validBody({ entities: withoutSchema })), {
    error: "entities[0].schemaVersion must be an integer",
  });
  assert.deepEqual(
    validateBundleBody(validBody({ entities: [{ ...withoutSchema[0], schemaVersion: 1.5 }] })),
    { error: "entities[0].schemaVersion must be an integer" }
  );
});

