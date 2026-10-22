import assert from "node:assert/strict";
import test from "node:test";
import { createDeployHostKit } from "../../../../apps/website/src/features/deployments/deploy-targets/host-kit.ts";
import { SHARE_DOWNLOAD_HEADERS } from "../../../../apps/website/src/features/site-backup/share-service.ts";
const key = `_share/${"a".repeat(64)}/site.tovu.zip`;
const bytes = Buffer.from("PK artifact contract");
async function s3() {
  const objects = new Map();
  objects.set("unrelated.txt", { bytes: Buffer.from("keep"), headers: new Headers() });
  const fetchObject = async (input, init = {}) => {
    const url = new URL(input);
    const objectKey = decodeURIComponent(url.pathname.replace(/^\/bucket\//, "").replace(/^\//, ""));
    if (init.method === "PUT") {
      const data = typeof init.body === "string" ? Buffer.from(init.body) : Buffer.from(init.body);
      objects.set(objectKey, { bytes: data, headers: new Headers(init.headers) });
      return new Response(null, { status: 200, headers: { etag: '"written"' } });
    }
    if (init.method === "DELETE") { objects.delete(objectKey); return new Response(null, { status: 204 }); }
    const object = objects.get(objectKey);
    if (!object) return new Response(null, { status: 404 });
    // Model a plain S3 bucket: return only persisted HTTP headers.
    const headers = new Headers(object.headers);
    headers.set("content-length", String(object.bytes.length));
    headers.set("etag", '"written"');
    return new Response(init.method === "HEAD" ? null : new Uint8Array(object.bytes), { status: 200, headers });
  };
  const kit = { ...createDeployHostKit({ fetchFn: fetchObject }),
    checkDeploymentUrl: async () => ({ reachable: true, status: "ready" }),
    createSigV4Client: () => ({ fetch: fetchObject, sign: async () => { throw new Error("No signing is needed by this fixture"); } }),
  };
  const module = (await import(new URL("../targets/s3-compatible.mjs", import.meta.url).href)).default;
  const context = { credential: { token: "fixture-secret", accessKeyId: "fixture-id", bucket: "bucket", region: "test", publicUrl: "https://objects.example.test", endpoint: "https://api.example.test" }, config: {}, kit };
  return { store: module.createArtifactStore(context), target: module.create(context), objects };
}

test("object store artifact contract: upload/verify/delete/confirmed absence; unrelated objects survive", async () => {
  const { store, objects } = await s3();
  const { url } = await store.upload({ key, bytes, headers: { ...SHARE_DOWNLOAD_HEADERS, "Content-Disposition": 'attachment; filename="site.tovu.zip"' } });
  assert.equal(await store.verify({ key, url, present: true, bytes: bytes.length }), true);
  await assert.rejects(store.delete({ key: "unrelated.txt" }), /Invalid share/i);
  await store.delete({ key });
  assert.equal(await store.verify({ key, url, present: false }), true);
  await store.delete({ key });
  assert.equal(objects.get("unrelated.txt")?.bytes.toString(), "keep");
});
test("ordinary S3 publishing preserves share objects even if an old cleanup manifest names them", async () => {
  const fixture = await s3();
  const { url } = await fixture.store.upload({ key, bytes, headers: SHARE_DOWNLOAD_HEADERS });
  fixture.objects.set(".tovu/managed-keys.json", { bytes: Buffer.from(JSON.stringify({ version: 2, keys: [{ key, etag: '"written"' }] })), headers: new Headers() });
  await fixture.target.publish({ files: [], projectName: "site" });
  assert.equal(fixture.objects.get(key)?.bytes.toString(), bytes.toString());
  await assert.rejects(fixture.target.publish({ files: [{ file: key, data: Buffer.from("overwrite") }], projectName: "site" }), /cannot write share artifacts/);
  assert.equal(await fixture.store.verify({ key, url, present: true, bytes: bytes.length }), false, "missing attachment header is not verified as safe delivery");
});

