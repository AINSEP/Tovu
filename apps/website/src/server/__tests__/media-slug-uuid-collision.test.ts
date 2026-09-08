import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";

import { createApp, createRouteDeps } from "../runtime/composition/app.js";
import { updateMediaMetadata, uploadMedia } from "../../features/media/index.js";

/**
 * @file A media SLUG that spells another asset's UUID (2026-09-07 audit, claim #3).
 *
 * `resolveSlugForUpdate` (`@jini-ai/cms/media`) validated an explicit slug edit against
 * `/^[a-z0-9-]+$/`, which a lowercase UUID matches character for character, and
 * `findMediaByIdOrSlug` resolved SLUG FIRST. So an operator could point one asset's slug at
 * another asset's id and silently take over every reference already authored against that id —
 * every `/m/{id}/…` URL `render.ts` has ever emitted for the victim.
 *
 * `findMediaByIdOrSlug`'s own doc asserted this could not happen ("an id never collides with a slug
 * in practice since slugs pass through `isValidMediaSlugFormat`"), which is exactly the claim these
 * tests exist to hold to.
 */
async function withServer(run: (baseUrl: string, deps: ReturnType<typeof createRouteDeps>) => Promise<void>) {
  const deps = createRouteDeps();
  const server = createServer(createApp(deps));
  server.listen(0);
  await once(server, "listening");
  try {
    const address = server.address() as AddressInfo;
    await run(`http://127.0.0.1:${address.port}`, deps);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

/** Same `blobRepo`/`assetBlobRepo` field-naming mapping `media-rendition-gating-bypass.test.ts`'s
 *  own `uploadOne` documents. */
async function uploadOne(deps: ReturnType<typeof createRouteDeps>, bytes: Uint8Array, filename: string, declaredContentType: string) {
  return uploadMedia({
    deps: {
      clock: deps.clock,
      idGen: deps.idGen,
      mediaRepo: deps.mediaRepo,
      blobRepo: deps.assetBlobRepo,
      renditionRepo: deps.assetRenditionRepo,
      blobStore: deps.blobStore,
    },
    input: { workspaceId: deps.workspaceId, bytes, filename, contentType: declaredContentType, createdByPrincipal: "user-1" },
  });
}

/** Same minimal `ftyp`/`isom` box the sibling media suites use so `sniffContentType` reports
 *  `video/mp4` from the bytes themselves — the public `/m/{id}/original` route is video-only. */
function mp4Bytes(payload: string): Uint8Array {
  const b = new Uint8Array(16 + payload.length);
  b.set(new TextEncoder().encode("ftyp"), 4);
  b.set(new TextEncoder().encode("isom"), 8);
  b.set(new TextEncoder().encode(payload), 16);
  return b;
}

test("media slug: a slug spelling ANOTHER asset's id is rejected at the write path", async () => {
  const deps = createRouteDeps();
  const { media: victim } = await uploadOne(deps, mp4Bytes("victim"), "victim.mp4", "video/mp4");
  const { media: attacker } = await uploadOne(deps, mp4Bytes("attacker"), "attacker.mp4", "video/mp4");

  await assert.rejects(
    () =>
      updateMediaMetadata({
        deps: { clock: deps.clock, mediaRepo: deps.mediaRepo },
        input: { workspaceId: deps.workspaceId, id: attacker.id, slug: victim.id },
      }),
    /slug/i,
    "a UUID-shaped slug must be refused — it can only ever shadow an id"
  );
});

test("media slug: a slug spelling its OWN id is refused too — the shape is what is rejected, not the collision", async () => {
  const deps = createRouteDeps();
  const { media } = await uploadOne(deps, mp4Bytes("self"), "self.mp4", "video/mp4");

  await assert.rejects(
    () =>
      updateMediaMetadata({
        deps: { clock: deps.clock, mediaRepo: deps.mediaRepo },
        input: { workspaceId: deps.workspaceId, id: media.id, slug: media.id },
      }),
    /slug/i
  );
});

test("media slug: ordinary slugs that merely contain hex and dashes are still accepted", async () => {
  const deps = createRouteDeps();
  const { media } = await uploadOne(deps, mp4Bytes("ordinary"), "ordinary.mp4", "video/mp4");

  for (const slug of ["abc-123-def", "2026-09-07-launch-clip", "deadbeef", "a-b-c-d-e"]) {
    const { media: updated } = await updateMediaMetadata({
      deps: { clock: deps.clock, mediaRepo: deps.mediaRepo },
      input: { workspaceId: deps.workspaceId, id: media.id, slug },
    });
    assert.equal(updated.slug, slug, `${slug} must stay a legal slug`);
  }
});

test("media slug: even a pre-existing UUID-shaped slug cannot hijack the victim's own /m/{id}/original URL", async () => {
  await withServer(async (baseUrl, deps) => {
    const { media: victim } = await uploadOne(deps, mp4Bytes("victim-bytes"), "victim.mp4", "video/mp4");
    const { media: attacker } = await uploadOne(deps, mp4Bytes("attacker-bytes"), "attacker.mp4", "video/mp4");

    // Written straight through the repo, bypassing the write-path validator above: this is the row
    // an older code path (or a direct DB edit) could already have left behind, so id-first
    // resolution has to hold the line independently of the new format rule.
    await deps.mediaRepo.save({ ...attacker, slug: victim.id, version: attacker.version + 1 });

    const res = await fetch(`${baseUrl}/m/${victim.id}/original`);
    assert.equal(res.status, 200);
    assert.deepEqual(
      new Uint8Array(await res.arrayBuffer()),
      mp4Bytes("victim-bytes"),
      "an id must always resolve to the asset that OWNS it, never to whoever claimed it as a slug"
    );
  });
});
