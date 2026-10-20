import assert from "node:assert/strict";
import test from "node:test";
import { checkRawFilePath, checkRawValues } from "../backstop-policy.js";
import { readBackstopMetadata, validateBackstopRequest } from "../backstop-service.js";
import type { PackedEntity } from "../type-registry.js";
import type { BackstopMetadata } from "../backstop-audit.js";

const metadata: BackstopMetadata = { mode: "backstop", reason: " Emergency footer fix ", sourceActor: "owner", destinationHost: "live.example", gapLabels: ["untrusted"] };
function entity({ type = "raw-file", id = "snippets/footer.html", state = { size: 1 }, backstop = metadata }: {
  type?: string; id?: string; state?: Record<string, unknown>; backstop?: BackstopMetadata;
}, _options = {}): PackedEntity {
  return { entityType: type, id, state, backstop, schemaVersion: 1, hashVersion: 1, contentHash: "h", requiredBlobs: [] };
}
const validBody = { reason: " Emergency footer fix ", typedHost: "live.example", files: ["snippets/footer.html"] };
function request({ body }: { body: unknown }, _options = {}) { return validateBackstopRequest({ body, destinationHost: "live.example" }); }

test("L061 raw paths keep every nested private component and path-shape guard", () => {
  const protectedParts = ["plugins", "UPLOADS", "restore-point-old", ".env.local", ".mcp.json", ".mcp.local.json", ".npmrc", ".netrc", ".fs-custom-root.json", ".site-meta.json", ".storage-secret.json", "config.json", "id_rsa", "id_dsa.pub", "id_ecdsa", "id_ed25519", "a.pem", "a.key-old", "a.p12", "a.pfx", "a.db-backup", "a.sqlite3"];
  for (const part of protectedParts) {
    const relPath = `snippets/${part}/footer.html`;
    assert.equal(checkRawFilePath({ relPath }), `File '${relPath}' holds private data or belongs to a protected site folder and is never sent.`);
  }
  for (const relPath of ["../escape", "/absolute", "a//b", "a\\b", "a:b", "a%20b", "a\u0001b", "a\u007fb"]) assert.ok(checkRawFilePath({ relPath }));
  assert.equal(checkRawFilePath({ relPath: "snippets/footer.html", isSymbolicLink: true }), "Links are never sent; choose a regular file inside the site folder.");
  assert.equal(checkRawFilePath({ relPath: "snippets/footer.html" }), null);
});

test("L061 raw settings preserve flag encodings, install keys, and non-setting behavior", () => {
  for (const secret of [1, true, "1"]) assert.equal(checkRawValues({ table: "SETTING_VALUES_site", values: { secret } }), "Secret settings are never sent.");
  for (const secret of [0, false, "0", null]) assert.equal(checkRawValues({ table: "setting_values_site", values: { secret } }), null);
  for (const key of ["core.execution.x", "core.privacy.x", "core.instructions.custom", "site.assistant.public_enabled"]) {
    assert.equal(checkRawValues({ table: "setting_values_site", values: { key } }), `Setting '${key}' belongs to this installation and is never sent.`);
    assert.equal(checkRawValues({ table: "other", values: { key, secret: 1 } }), null);
  }
  assert.equal(checkRawValues({ values: { count: 1, empty: null, key: "ordinary" } }), null);
  const planted = ["ghp", "_"].join("") + "A".repeat(36);
  assert.match(checkRawValues({ values: { body: planted } }) ?? "", /^Value 'body' looks like it holds a key/);
});

test("L061 backstop request validates in order and preserves normalized selection", () => {
  for (const body of [null, false, "body", [], 1]) assert.deepEqual(request({ body }), { error: "Choose items to send." });
  for (const reason of [undefined, 10, "short", " ".repeat(11), "a".repeat(2001)]) assert.deepEqual(request({ body: { ...validBody, reason } }), { error: "Explain why you need this send in at least 10 characters." });
  assert.deepEqual(request({ body: { ...validBody, typedHost: "wrong" } }), { error: "Type live.example to confirm where this send will go." });
  for (const selection of [{ rows: {} }, { files: {} }, { rows: Array(201).fill({}), files: [] }, { files: Array(51).fill("a") }]) assert.deepEqual(request({ body: { ...validBody, ...selection } }), { error: "Choose at most 200 rows and 50 files per send." });
  for (const row of [null, false, "row", {}, { table: 1, pk: { id: 1 } }, { table: "x", pk: null }, { table: "x", pk: [] }, { table: "x", pk: {} }]) assert.deepEqual(request({ body: { ...validBody, rows: [row] } }), { error: "Choose rows by their complete primary keys and files by their site-relative paths." });
  for (const files of [[1], []]) assert.deepEqual(request({ body: { ...validBody, files } }), { error: "Choose rows by their complete primary keys and files by their site-relative paths." });
  assert.deepEqual(request({ body: { ...validBody, rows: null } }), { request: { reason: "Emergency footer fix", typedHost: "live.example", selection: { rows: [], files: validBody.files } } });
  for (const selection of [{ files: ["a", "a"] }, { rows: [{ table: "x", pk: { b: 2, a: 1 } }, { table: "x", pk: { a: 1, b: 2 } }] }]) assert.deepEqual(request({ body: { ...validBody, ...selection } }), { error: "Choose each item once." });
  assert.ok("request" in request({ body: { ...validBody, rows: [{ table: "x", pk: { id: 1 } }, { table: "y", pk: { id: 1 } }] } }));
  const reason = ["ghp", "_"].join("") + "A".repeat(36);
  assert.match(JSON.stringify(request({ body: { ...validBody, reason } })), /looks like it holds a key/);
});

test("L061 metadata rejects mixed, repeated, malformed and oversized sends and derives sorted gaps", () => {
  assert.equal(readBackstopMetadata({ entities: [] }), null);
  assert.equal(readBackstopMetadata({ entities: [entity({ type: "post" })] }), null);
  assert.throws(() => readBackstopMetadata({ entities: [entity({}), entity({ type: "post" })] }), /normally published/);
  assert.throws(() => readBackstopMetadata({ entities: [entity({}), entity({})] }), /each item once/);
  for (const patch of [{ mode: "other" }, { reason: 1 }, { reason: "short" }, { reason: "a".repeat(2001) }, { sourceActor: 1 }, { sourceActor: "" }, { sourceActor: "a".repeat(513) }, { destinationHost: 1 }, { destinationHost: "a".repeat(513) }]) {
    // Deliberately malformed authenticated metadata at the wire boundary.
    const bad = { ...entity({}), backstop: { ...metadata, ...patch } } as PackedEntity;
    assert.throws(() => readBackstopMetadata({ entities: [bad] }), /missing its reason/);
  }
  assert.throws(() => readBackstopMetadata({ entities: [{ ...entity({}), backstop: undefined }] }), /missing its reason/);
  for (const destinationHost of ["", "live.example/path", "live.example:443", "bad host"]) assert.throws(() => readBackstopMetadata({ entities: [entity({ backstop: { ...metadata, destinationHost } })] }), /invalid destination/);
  assert.throws(() => readBackstopMetadata({ entities: [entity({}), entity({ id: "other", backstop: { ...metadata, sourceActor: "other" } })] }), /same audit details/);
  assert.throws(() => readBackstopMetadata({ entities: Array.from({ length: 201 }, (_, i) => entity({ type: "raw-row", id: String(i) })) }), /at most 200/);
  assert.throws(() => readBackstopMetadata({ entities: Array.from({ length: 51 }, (_, i) => entity({ id: String(i) })) }), /at most 200/);
  for (const state of [{}, { size: "1" }, { size: 50 * 1024 * 1024 + 1 }]) assert.throws(() => readBackstopMetadata({ entities: [entity({ state })] }), /at most 200/);
  const rows = [entity({ type: "raw-row", id: "r", state: { table: "widgets" } }), entity({ state: { size: 50 * 1024 * 1024 } })];
  assert.deepEqual(readBackstopMetadata({ entities: rows }), { ...metadata, gapLabels: ["folder:snippets/footer.html", "table:widgets"] });
  const reason = ["ghp", "_"].join("") + "A".repeat(36);
  assert.throws(() => readBackstopMetadata({ entities: [entity({ backstop: { ...metadata, reason } })] }), /looks like it holds a key/);
});

test("L061 metadata accepts negative and NaN file sizes (reported, not fixed)", () => {
  for (const size of [-1, NaN]) assert.ok(readBackstopMetadata({ entities: [entity({ state: { size } })] }));
});
