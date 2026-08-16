import assert from "node:assert/strict";
import test from "node:test";

import { AesGcmSecretSealer } from "../../../../integrations/secret-sealer.aesgcm";
import { InMemoryKeyring } from "../../../../integrations/keyring.memory";
import { InMemoryPublishCredentialSetRepo } from "../repo.memory";
import { S3_COMPATIBLE_FIELD_GUIDANCE, S3_COMPATIBLE_FORM_DESCRIPTION } from "../s3-compatible-field-guidance";
import { createPublishCredential, PublishCredentialValidationError, type PublishCredentialWriteDeps } from "../store";

/**
 * @file `S3_COMPATIBLE_FIELD_GUIDANCE` — the single canonical per-field table (spec §4c/§5). The most
 * valuable thing this suite proves is that the table's `required` column agrees with `store.ts`'s OWN
 * `validateConnection` enforcement — a drift between "what the form tells a human is required" and
 * "what the server actually enforces" would be silent and easy to introduce (edit one file, forget the
 * other), so this asserts against real validation behavior, not just the table's own shape.
 */

const ALL_FIELD_NAMES = ["endpoint", "region", "bucket", "accessKeyId", "secretAccessKey", "publicUrl"] as const;

function makeDeps(): PublishCredentialWriteDeps {
  const keyring = new InMemoryKeyring();
  let counter = 0;
  return {
    repo: new InMemoryPublishCredentialSetRepo(),
    sealer: new AesGcmSecretSealer(keyring),
    keyring,
    clock: { nowIso: () => "2026-08-15T00:00:00.000Z" },
    idGen: { newId: () => `cred-${(counter += 1)}` },
  };
}

const VALID_CONNECTION = {
  providerId: "s3-compatible" as const,
  region: "us-east-1",
  bucket: "my-bucket",
  accessKeyId: "AKIAEXAMPLE",
  secretAccessKey: "s3cr3t",
  publicUrl: "https://my-bucket.s3.us-east-1.amazonaws.com",
};

test("carries exactly the six S3CompatibleConnectionInput field names, no more, no fewer, in form order", () => {
  assert.deepEqual(
    S3_COMPATIBLE_FIELD_GUIDANCE.map((f) => f.name),
    [...ALL_FIELD_NAMES]
  );
});

test("secret:true is set for secretAccessKey ONLY — accessKeyId is explicitly non-secret ('like a username')", () => {
  const secretFields = S3_COMPATIBLE_FIELD_GUIDANCE.filter((f) => f.secret).map((f) => f.name);
  assert.deepEqual(secretFields, ["secretAccessKey"]);
});

test("every non-endpoint field is required; endpoint alone is optional — matches the credential's own optional field", () => {
  for (const field of S3_COMPATIBLE_FIELD_GUIDANCE) {
    assert.equal(field.required, field.name !== "endpoint", `'${field.name}'.required should be ${field.name !== "endpoint"}`);
  }
});

test("every hint is non-empty prose (never a placeholder/TODO)", () => {
  for (const field of S3_COMPATIBLE_FIELD_GUIDANCE) {
    assert.ok(field.hint.length > 20, `'${field.name}' hint looks too short to be real guidance: ${JSON.stringify(field.hint)}`);
    assert.doesNotMatch(field.hint, /TODO|TBD|placeholder/i);
  }
});

test("the form-level description leads with the three-piece framing (bucket, hosting/CDN, scoped key) — spec §3b", () => {
  assert.match(S3_COMPATIBLE_FORM_DESCRIPTION, /bucket/i);
  assert.match(S3_COMPATIBLE_FORM_DESCRIPTION, /public access or hosting/i);
  assert.match(S3_COMPATIBLE_FORM_DESCRIPTION, /access key/i);
});

test("table.required agrees with store.ts's real validateConnection enforcement — no drift between what the form claims and what the server enforces", async () => {
  for (const field of S3_COMPATIBLE_FIELD_GUIDANCE) {
    if (!field.required) continue; // endpoint — optional, covered by the "accepts with no endpoint" test elsewhere
    const deps = makeDeps();
    await assert.rejects(
      () => createPublishCredential(deps, { workspaceId: "ws-1", label: "x", connection: { ...VALID_CONNECTION, [field.name]: "" } }),
      PublishCredentialValidationError,
      `table marks '${field.name}' required, but the real store did not reject a blank value for it`
    );
  }

  // The inverse direction: a full, valid connection (every field the table says is required, filled
  // in) must be ACCEPTED — proves the table isn't merely claiming more fields than the server needs.
  const deps = makeDeps();
  await assert.doesNotReject(() => createPublishCredential(deps, { workspaceId: "ws-1", label: "x", connection: VALID_CONNECTION }));
});
