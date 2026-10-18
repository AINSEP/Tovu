import assert from "node:assert/strict";
import test from "node:test";
import { parseFormMultipart } from "../../../server/inbound/public-http/routes/site/forms-multipart.js";
import { createFormFileStorage } from "../form-file-storage.js";
import { InMemoryVersionedMediaRepo, InMemoryAssetBlobRepo, InMemoryAssetRenditionRepo, InMemoryBlobStore, InMemoryMediaContentTypeStore, MediaStillReferencedError } from "../../media/index.js";
import { InMemoryEntryRefsRepo } from "../../../contracts/core/entry-refs/repo.memory.js";
import { InMemoryPostRepo } from "../../post/repo.memory.js";
import { formsAgentToolCatalog } from "../agent-tools.js";
import { renderWidgetIr } from "../../../server/inbound/public-http/http/site/render.js";
import { injectFormSubmissionResultIntoHtml } from "../../../server/inbound/public-http/http/site/form-render.js";

const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1]);
test("native multipart preserves choice arrays, file bytes, duplicate scalar controls and skips the empty file picker", async () => {
  const data = new FormData(); data.append("topic", "sales"); data.append("choices", "sales"); data.append("choices", "help"); data.append("name", "Ada"); data.append("name", "Eve"); data.append("photo", new Blob([png], { type: "image/png" }), "photo.png"); data.append("empty", new Blob([]), "empty-picker"); data.append("blankText", ""); data.append("zeroByteFile", new Blob([]), "empty.png");
  const request = new Request("http://form.invalid", { method: "POST", body: data });
  // Node's serializer omits filename=""; supply the browser's empty-picker header explicitly.
  // Replace only that header, keeping uploaded binary bytes and all other controls intact.
  const encoded = Buffer.from(await request.arrayBuffer());
  const pickerHeader = Buffer.from('name="empty"; filename="empty-picker"');
  const pickerOffset = encoded.indexOf(pickerHeader);
  assert.notEqual(pickerOffset, -1);
  const bytes = Buffer.concat([encoded.subarray(0, pickerOffset), Buffer.from('name="empty"; filename=""'), encoded.subarray(pickerOffset + pickerHeader.length)]);
  const body = await parseFormMultipart({ bytes, contentType: request.headers.get("content-type")! });
  assert.deepEqual({ ...body, photo: undefined, zeroByteFile: undefined }, { topic: "sales", choices: ["sales", "help"], name: ["Ada", "Eve"], photo: undefined, blankText: "", zeroByteFile: undefined });
  assert.deepEqual(body.photo, { filename: "photo.png", contentType: "image/png", bytes: png });
  assert.deepEqual(body.zeroByteFile, { filename: "empty.png", contentType: "application/octet-stream", bytes: new Uint8Array() });
  await assert.rejects(parseFormMultipart({ bytes: new Uint8Array(12 * 1024 * 1024 + 1), contentType: "multipart/form-data; boundary=x" }), RangeError);
  await assert.rejects(parseFormMultipart({ bytes: png, contentType: "multipart/form-data" }));
});
test("form upload storage delegates to real media/blob/rendition ports and supports compensating cleanup", async () => {
  let id = 0; const mediaRepo = new InMemoryVersionedMediaRepo(); const blobRepo = new InMemoryAssetBlobRepo({}); const renditionRepo = new InMemoryAssetRenditionRepo({}); const blobStore = new InMemoryBlobStore(); const contentTypes = new InMemoryMediaContentTypeStore();
  const attributionRequests: { workspaceId: string }[] = [];
  const storage = createFormFileStorage({ media: { clock: { nowMs: () => 0 }, idGen: { newId: () => `asset-${++id}` }, mediaRepo, blobRepo, renditionRepo, blobStore, entryRefsRepo: new InMemoryEntryRefsRepo(), postRepo: new InMemoryPostRepo() }, contentTypes, resolveCreatedByPrincipal: async (required) => { attributionRequests.push(required); return "site-system"; } });
  assert.equal(storage.detectContentType({ bytes: png }), "image/png");
  assert.equal(storage.detectContentType({ bytes: new TextEncoder().encode("%PDF-1.7") }), "application/pdf");
  assert.equal(storage.detectContentType({ bytes: new Uint8Array([77, 90]) }), "application/octet-stream");
  const reference = await storage.store({ workspaceId: "ws", submissionId: "submission", fieldId: "photo", file: { filename: "photo.png", contentType: "image/png", bytes: png } });
  assert.deepEqual(reference, { mediaId: reference.mediaId, filename: "photo.png", contentType: "image/png", byteSize: png.byteLength });
  assert.ok(await mediaRepo.findById({ workspaceId: "ws", id: reference.mediaId }));
  assert.deepEqual(attributionRequests, [{ workspaceId: "ws" }]);
  assert.equal((await mediaRepo.findById({ workspaceId: "ws", id: reference.mediaId }))?.createdBy, "site-system");
  assert.equal((await blobRepo.list({ workspaceId: "ws" }))[0]?.createdByPrincipal, "site-system");
  await storage.discard({ workspaceId: "ws", reference });
  assert.equal(await mediaRepo.findById({ workspaceId: "ws", id: reference.mediaId }), null);
  assert.equal((await blobRepo.list({ workspaceId: "ws" }))[0]?.status, "tombstoned");
});

test("form upload removes its asset when recording the content type fails and preserves the original error", async () => {
  const mediaRepo = new InMemoryVersionedMediaRepo();
  const blobRepo = new InMemoryAssetBlobRepo({});
  const contentTypes = new InMemoryMediaContentTypeStore();
  const writeError = new Error("content type store failed");
  contentTypes.set = async () => { throw writeError; };
  let id = 0;
  const storage = createFormFileStorage({
    media: { clock: { nowMs: () => 0 }, idGen: { newId: () => `asset-${++id}` }, mediaRepo, blobRepo,
      renditionRepo: new InMemoryAssetRenditionRepo({}), blobStore: new InMemoryBlobStore(),
      entryRefsRepo: new InMemoryEntryRefsRepo(), postRepo: new InMemoryPostRepo() },
    contentTypes, resolveCreatedByPrincipal: async () => "site-system",
  });
  await assert.rejects(storage.store({ workspaceId: "ws", submissionId: "submission", fieldId: "photo",
    file: { filename: "photo.png", contentType: "image/png", bytes: png } }), error => error === writeError);
  assert.deepEqual(await mediaRepo.list({ workspaceId: "ws" }), []);
  const blobs = await blobRepo.list({ workspaceId: "ws" });
  assert.equal(blobs.length, 1);
  assert.equal(blobs[0]?.status, "tombstoned");
});

test("form discard keeps a referenced upload trashed rather than bypassing the reference check", async () => {
  const mediaRepo = new InMemoryVersionedMediaRepo();
  const blobRepo = new InMemoryAssetBlobRepo({});
  const entryRefsRepo = new InMemoryEntryRefsRepo();
  let id = 0;
  const storage = createFormFileStorage({
    media: { clock: { nowMs: () => 0 }, idGen: { newId: () => `asset-${++id}` }, mediaRepo, blobRepo,
      renditionRepo: new InMemoryAssetRenditionRepo({}), blobStore: new InMemoryBlobStore(),
      entryRefsRepo, postRepo: new InMemoryPostRepo() },
    contentTypes: new InMemoryMediaContentTypeStore(), resolveCreatedByPrincipal: async () => "site-system",
  });
  const reference = await storage.store({ workspaceId: "ws", submissionId: "submission", fieldId: "photo",
    file: { filename: "photo.png", contentType: "image/png", bytes: png } });
  await entryRefsRepo.replaceForSource({ workspaceId: "ws", sourceEntryId: "widget-1", refs: [{
    workspaceId: "ws", sourceEntryId: "widget-1", sourceKind: "config-field", fieldPath: "image",
    targetKind: "asset", targetId: reference.mediaId,
  }] });
  await assert.rejects(storage.discard({ workspaceId: "ws", reference }), MediaStillReferencedError);
  assert.equal((await mediaRepo.findById({ workspaceId: "ws", id: reference.mediaId }))?.status, "trashed");
  assert.equal((await blobRepo.list({ workspaceId: "ws" }))[0]?.status, "active");
});
test("assistant create/update schemas advertise common native fields and builder uses the shared semantic renderer", () => {
  for (const name of ["forms_create_definition", "forms_update_definition"]) {
    const schema = formsAgentToolCatalog.find((tool) => tool.name === name)!.inputSchema as any;
    const field = schema.properties.fields.items;
    for (const type of ["select", "multi-select", "radio", "checkbox-group", "phone", "url", "number", "range", "date", "time", "datetime", "toggle", "file", "hidden"]) assert.ok(field.properties.type.enum.includes(type), type);
    for (const prop of ["name", "placeholder", "helpText", "default", "options", "min", "max", "step", "minLength", "pattern", "accept", "maxFileSize"]) assert.ok(field.properties[prop], prop);
  }
  const html = renderWidgetIr({ componentId: "contact-form", props: { slug: "contact", fields: [{ id: "topic", label: "Topic", type: "select", required: true, options: [{ value: "sales", label: "Sales" }], helpText: "Pick a topic" }, { id: "upload", label: "Upload", type: "file", required: false }] } });
  assert.match(html, /enctype="multipart\/form-data"/); assert.match(html, /<select id="widget-contact-topic"/); assert.match(html, /<option value="sales">Sales/); assert.match(html, /aria-describedby="widget-contact-topic-help widget-contact-topic-error"/);
  const invalid = injectFormSubmissionResultIntoHtml(html, { kind: "validation", slug: "contact", fieldErrors: [{ field: "topic", reason: "invalid_option" }] });
  assert.match(invalid, /class="widget-form-field-error" data-field="topic" id="widget-contact-topic-error">/);
  assert.equal((html.match(/<button type="submit"/g) ?? []).length, 1);
});

test("form upload attribution failure writes no media or blob", async () => {
  const mediaRepo = new InMemoryVersionedMediaRepo();
  const blobRepo = new InMemoryAssetBlobRepo({});
  const attributionError = new Error("identity seed failed");
  const storage = createFormFileStorage({
    media: { clock: { nowMs: () => 0 }, idGen: { newId: () => "must-not-be-used" }, mediaRepo,
      entryRefsRepo: new InMemoryEntryRefsRepo(), postRepo: new InMemoryPostRepo(),
      blobRepo, renditionRepo: new InMemoryAssetRenditionRepo({}), blobStore: new InMemoryBlobStore() },
    contentTypes: new InMemoryMediaContentTypeStore(),
    resolveCreatedByPrincipal: async () => { throw attributionError; },
  });
  await assert.rejects(storage.store({ workspaceId: "ws", submissionId: "submission", fieldId: "photo",
    file: { filename: "photo.png", contentType: "image/png", bytes: png } }), error => error === attributionError);
  assert.deepEqual(await mediaRepo.list({ workspaceId: "ws" }), []);
  assert.deepEqual(await blobRepo.list({ workspaceId: "ws" }), []);
});
