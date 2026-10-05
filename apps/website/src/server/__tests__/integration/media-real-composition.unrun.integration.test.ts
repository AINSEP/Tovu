// @unrun: authored 2026-10-04 by an agent, NEVER EXECUTED; expectations unverified.
import assert from "node:assert/strict";
import test from "node:test";

import { bootSite, expectJson, send, SITE_DIALECTS, type BootedSite } from "../helpers/unrun-site-boot.js";

/**
 * @file Round 4 of ADS-memory/reports/2026-10-04-integration-test-gaps.md — the Media admin surface
 * (`routes/media/{upload,update,trash,delete,list}.ts`) through the REAL site composition on both
 * dialects, out to the public `/m/...` URL (`public-http/routes/site/media-rendition.ts`).
 *
 * The PGlite smoke test uploads one PNG and lists it. Unproven over a real store until here: the
 * metadata PATCH round-trip (nullable numbers, slug uniqueness → 409), the deletion ladder (DELETE on
 * a live asset is refused 409, POST .../trash flips it, its public URL then answers 410, DELETE then
 * purges the row and its Trash index entry), restore from the Trash, and the content sniff refusing
 * bytes that are not an allowed media type.
 */

const PNG_A = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
const PNG_B = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

interface AdminMedia {
  id: string;
  title: string;
  slug: string;
  alt: string;
  caption: string;
  credit: string;
  sha256: string;
  byteSize: number | null;
  status: string;
  version: number;
  width: number | null;
  height: number | null;
  cssClass: string | null;
  contentType: string | null;
  publicUrl: string | null;
}

async function upload(site: BootedSite, filename: string, dataBase64: string, extra: Record<string, unknown> = {}): Promise<AdminMedia> {
  return (await expectJson<{ media: AdminMedia }>(await send(site, "POST", `${site.ws}/media`, { filename, contentType: "image/png", dataBase64, ...extra }), 201)).media;
}

async function listMedia(site: BootedSite): Promise<AdminMedia[]> {
  return (await expectJson<{ media: AdminMedia[] }>(await send(site, "GET", `${site.ws}/media`), 200)).media;
}

async function trashRowsFor(site: BootedSite, id: string): Promise<Array<{ entityType: string; entityId: string }>> {
  const trash = await expectJson<{ items: Array<{ entityType: string; entityId: string }> }>(await send(site, "GET", `${site.ws}/trash`), 200);
  return trash.items.filter((item) => item.entityId === id).map((item) => ({ entityType: item.entityType, entityId: item.entityId }));
}

for (const dialect of SITE_DIALECTS) {
  test(`[unrun] media [${dialect}]: upload stores the sniffed type, byte size and caption; its public URL serves an image`, async (t) => {
    const site = await bootSite(t, dialect);
    const media = await upload(site, "unrun-dot.png", PNG_A, { alt: "A dot", caption: "Ünïcode caption", credit: "Unrun" });
    assert.deepEqual(
      { alt: media.alt, caption: media.caption, credit: media.credit, status: media.status, contentType: media.contentType, byteSize: media.byteSize },
      { alt: "A dot", caption: "Ünïcode caption", credit: "Unrun", status: "active", contentType: "image/png", byteSize: Buffer.from(PNG_A, "base64").byteLength }
    );
    assert.ok(media.publicUrl?.startsWith("/m/"), `a live asset has a public /m/ URL: ${media.publicUrl}`);

    const listed = await listMedia(site);
    assert.deepEqual(listed.map((row) => row.id), [media.id]);
    assert.deepEqual(listed[0], media, "the list reads back exactly what the upload answered");

    const res = await fetch(`${site.baseUrl}${media.publicUrl}`);
    await res.arrayBuffer();
    assert.equal(res.status, 200);
    assert.ok(res.headers.get("content-type")?.startsWith("image/"), `served as an image: ${res.headers.get("content-type")}`);
  });

  test(`[unrun] media [${dialect}]: PATCH metadata round-trips (nullable numbers clear), and taking another asset's slug is 409`, async (t) => {
    const site = await bootSite(t, dialect);
    const first = await upload(site, "unrun-first.png", PNG_A);
    const second = await upload(site, "unrun-second.png", PNG_B);

    const patched = await expectJson<{ media: AdminMedia }>(
      await send(site, "PATCH", `${site.ws}/media/${second.id}`, { title: "Second", alt: "alt two", width: 640, height: 480, cssClass: "hero" }),
      200
    );
    assert.deepEqual(
      { title: patched.media.title, alt: patched.media.alt, width: patched.media.width, height: patched.media.height, cssClass: patched.media.cssClass },
      { title: "Second", alt: "alt two", width: 640, height: 480, cssClass: "hero" }
    );
    const cleared = await expectJson<{ media: AdminMedia }>(await send(site, "PATCH", `${site.ws}/media/${second.id}`, { width: null, cssClass: null }), 200);
    assert.deepEqual({ width: cleared.media.width, height: cleared.media.height, cssClass: cleared.media.cssClass }, { width: null, height: 480, cssClass: null });

    const clash = await expectJson<{ error: string }>(await send(site, "PATCH", `${site.ws}/media/${second.id}`, { slug: first.slug }), 409);
    assert.deepEqual(clash, { error: `slug '${first.slug}' is already used by media '${first.id}'` });
    const stored = (await listMedia(site)).find((row) => row.id === second.id);
    assert.equal(stored?.slug, second.slug, "the refused slug change wrote nothing");
  });

  test(`[unrun] media [${dialect}]: DELETE on a live asset is 409; trash -> public URL 410 -> listed in Trash; DELETE then purges row and Trash entry`, async (t) => {
    const site = await bootSite(t, dialect);
    const media = await upload(site, "unrun-doomed.png", PNG_A);
    const publicUrl = media.publicUrl;
    assert.ok(publicUrl);

    const refused = await expectJson<{ error: string; referencing: string[] }>(await send(site, "DELETE", `${site.ws}/media/${media.id}`), 409);
    assert.equal(refused.error, `media '${media.id}' must be trashed before it can be purged`);
    assert.equal(refused.referencing.length, 1);

    const trashed = await expectJson<{ media: AdminMedia }>(await send(site, "POST", `${site.ws}/media/${media.id}/trash`), 200);
    assert.equal(trashed.media.status, "trashed");
    assert.equal(trashed.media.publicUrl, null, "a trashed asset advertises no public URL");
    const gone = await fetch(`${site.baseUrl}${publicUrl}`);
    await gone.arrayBuffer();
    assert.equal(gone.status, 410, "the old public URL is gone, not served");
    assert.deepEqual(await trashRowsFor(site, media.id), [{ entityType: "media", entityId: media.id }]);

    const editWhileTrashed = await expectJson<{ code: string }>(await send(site, "PATCH", `${site.ws}/media/${media.id}`, { alt: "nope" }), 409);
    assert.equal(editWhileTrashed.code, "ENTITY_IN_TRASH");

    assert.deepEqual(await expectJson(await send(site, "DELETE", `${site.ws}/media/${media.id}`), 200), { purged: true });
    assert.deepEqual(await listMedia(site), []);
    assert.deepEqual(await trashRowsFor(site, media.id), [], "the purge also forgot the Trash index row");
    assert.deepEqual(await expectJson(await send(site, "DELETE", `${site.ws}/media/${media.id}`), 404), { error: `media '${media.id}' was not found` });
  });

  test(`[unrun] media [${dialect}]: a trashed asset restored from the Trash is active again with a public URL`, async (t) => {
    const site = await bootSite(t, dialect);
    const media = await upload(site, "unrun-restore.png", PNG_A);
    await expectJson(await send(site, "POST", `${site.ws}/media/${media.id}/trash`), 200);

    const restored = await expectJson<unknown>(await send(site, "POST", `${site.ws}/trash/restore`, { items: [{ entityType: "media", entityId: media.id }] }), 200);
    assert.deepEqual(restored, { restored: 1, results: [{ entityType: "media", entityId: media.id, outcome: "restored" }] });
    const row = (await listMedia(site)).find((entry) => entry.id === media.id);
    assert.equal(row?.status, "active");
    assert.ok(row?.publicUrl?.startsWith("/m/"));
    assert.deepEqual(await trashRowsFor(site, media.id), []);
  });

  test(`[unrun] media [${dialect}]: bytes that are not an allowed media type are refused 400 even when declared image/png, and nothing is stored`, async (t) => {
    const site = await bootSite(t, dialect);
    const html = Buffer.from("<!doctype html><html><body><script>alert(1)</script></body></html>").toString("base64");
    const refused = await expectJson<{ error: string }>(await send(site, "POST", `${site.ws}/media`, { filename: "evil.png", contentType: "image/png", dataBase64: html }), 400);
    assert.match(refused.error, /^the file's content \(.+\) is not an allowed media type$/);

    const malformed = await expectJson(await send(site, "POST", `${site.ws}/media`, { filename: "x.png", contentType: "image/png", dataBase64: "not base64!!" }), 400);
    assert.deepEqual(malformed, { error: "dataBase64 is not valid base64" });
    const missing = await expectJson(await send(site, "POST", `${site.ws}/media`, { filename: "x.png" }), 400);
    assert.deepEqual(missing, { error: "filename, contentType, and dataBase64 are required" });

    assert.deepEqual(await listMedia(site), []);
  });
}
