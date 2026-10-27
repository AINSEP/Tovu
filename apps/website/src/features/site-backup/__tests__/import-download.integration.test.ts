/** Approved round17 B download safety. Baseline RED: import endpoint/guarded policy absent. */
import assert from "node:assert/strict";
import test from "node:test";
import { createSiteImportBackend } from "../import-backend.js";
import { SHARE_LIMITS } from "../share-policy.js";
import type { HttpResponse } from "../../../platform/http/index.js";
import { createHttpClient } from "../../../platform/http/client.js";
import { SITE_IMPORT_EGRESS_POLICY } from "../../../platform/http/egress-policies.js";
import { importFixture } from "./import.fixture.js";

test("B guarded HTTPS import pins public download, refuses private initial/redirect peers, propagates caps and cancellation", async t => {
  const h = await importFixture(t);
  const hops: string[] = [];
  const http = createHttpClient({ policy: SITE_IMPORT_EGRESS_POLICY, transport: { requestPinned: async (request): Promise<HttpResponse> => {
    hops.push(request.url);
    assert.equal(request.maxResponseBytes, SHARE_LIMITS.maxArchiveBytes);
    assert.ok(request.signal);
    if (request.url.includes("redirect")) return { status: 302, headers: { location: "https://127.0.0.1/latest/meta-data" }, bodyText: "", bodyBytes: Buffer.alloc(0), bodyBytesTruncated: false };
    return { status: 200, headers: { "content-type": "application/zip" }, bodyText: "", bodyBytes: h.archive, bodyBytesTruncated: false };
  } } }, { dns: { resolve: async () => ["93.184.216.34"] } });
  assert.equal(SITE_IMPORT_EGRESS_POLICY.maxResponseBytes, SHARE_LIMITS.maxArchiveBytes);
  assert.equal(SITE_IMPORT_EGRESS_POLICY.maxDecompressedBytes, SHARE_LIMITS.maxArchiveBytes);
  const backend = createSiteImportBackend({ ...h.backendPorts, http });
  for (const url of ["https://127.0.0.1/a", "https://169.254.169.254/a", "https://[::1]/a", "http://public.example/a"]) await assert.rejects(backend.importBackup({ principalId: "recipient", source: { url } }));
  assert.deepEqual(hops, []);
  await assert.rejects(backend.importBackup({ principalId: "recipient", source: { url: "https://public.example/redirect" } }));
  assert.deepEqual(hops, ["https://public.example/redirect"]);
  assert.equal((await backend.importBackup({ principalId: "recipient", source: { url: "https://public.example/site.tovu.zip" } })).state, "needs-owner");
  const before = hops.length;
  await assert.rejects(backend.importBackup({ principalId: "recipient", source: { url: "https://public.example/cancelled" } }, { signal: AbortSignal.abort() }));
  assert.equal(hops.length, before);
  assert.deepEqual(h.workspace.registry({}).list({}), []);
});

test("B truncated/unknown-completeness downloads and oversized uploads fail without registering sites", async t => {
  const h = await importFixture(t);
  for (const bodyBytesTruncated of [true, undefined]) {
    const backend = createSiteImportBackend({ ...h.backendPorts, http: { send: async () => ({ status: 200, headers: {}, bodyText: "", bodyBytes: h.archive, bodyBytesTruncated }) } });
    await assert.rejects(backend.importBackup({ principalId: "recipient", source: { url: "https://public.example/site.tovu.zip" } }), /download|cap/i);
  }
  await assert.rejects(h.backend.upload({ principalId: "recipient", archive: Buffer.alloc(SHARE_LIMITS.maxArchiveBytes + 1) }), /300 MiB/);
  assert.deepEqual(h.workspace.registry({}).list({}), []);
});

// Review B-6 RED: valid ZIP bytes with HTML/JSON/missing MIME were previously accepted.
test("B download admits only ZIP/binary MIME and still verifies ZIP bytes", async t => {
  const h = await importFixture(t);
  for (const contentType of [undefined, "text/html", "application/json", "text/plain", "image/png"]) {
    const headers: Record<string, string> = contentType === undefined ? {} : { "Content-Type": contentType };
    const backend = createSiteImportBackend({ ...h.backendPorts, http: { send: async () => ({ status: 200, headers, bodyText: "", bodyBytes: h.archive, bodyBytesTruncated: false }) } });
    await assert.rejects(backend.importBackup({ principalId: "recipient", source: { url: "https://public.example/site.tovu.zip" } }), (error: unknown) => (error as { code: string }).code === "INVALID_CONTENT_TYPE");
  }
  for (const contentType of ["application/zip", "application/x-zip-compressed", "Application/Octet-Stream; charset=binary"]) {
    const backend = createSiteImportBackend({ ...h.backendPorts, http: { send: async () => ({ status: 200, headers: { "Content-Type": contentType }, bodyText: "", bodyBytes: h.archive, bodyBytesTruncated: false }) } });
    assert.equal((await backend.importBackup({ principalId: "recipient", source: { url: "https://public.example/site.tovu.zip" } })).state, "needs-owner");
  }
  const backend = createSiteImportBackend({ ...h.backendPorts, http: { send: async () => ({ status: 200, headers: { "content-type": "application/zip" }, bodyText: "", bodyBytes: Buffer.from("<html>not a zip</html>"), bodyBytesTruncated: false }) } });
  await assert.rejects(backend.importBackup({ principalId: "recipient", source: { url: "https://public.example/fake.tovu.zip" } }));
  assert.deepEqual(h.workspace.registry({}).list({}), []);
});

test("failed HTTP status or missing binary body records a failed import without staging a site", async t => {
  const h = await importFixture(t);
  for (const response of [
    { status: 404, headers: { "content-type": "application/zip" }, bodyText: "not found", bodyBytes: h.archive, bodyBytesTruncated: false },
    { status: 200, headers: { "content-type": "application/zip" }, bodyText: "", bodyBytesTruncated: false },
  ]) {
    const backend = createSiteImportBackend({ ...h.backendPorts, http: { send: async () => response } });
    await assert.rejects(backend.importBackup({ principalId: "recipient", source: { url: "https://public.example/missing.zip" } }), { code: "DOWNLOAD_FAILED" });
  }
  const rows = await h.backend.list({ principalId: "recipient" });
  assert.equal(rows.length, 2);
  assert.ok(rows.every(row => row.state === "failed" && row.error === "Share download failed or exceeded the 300 MiB archive cap."));
  assert.deepEqual(h.workspace.registry({}).list({}), []);
});
