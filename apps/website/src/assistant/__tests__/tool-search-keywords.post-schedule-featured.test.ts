import assert from "node:assert/strict";
import test from "node:test";
import { realToolCatalog } from "./real-tool-catalog.fixture.js";

/**
 * @file Scheduled publishing + featured image (2026-10-05) are fields on `content_post_update`/
 * `content_post_create`, not tools of their own, so a "schedule this post" or "set the featured
 * image" request only reaches them through those tools' search vocabulary. Pins that it does, in the
 * full production catalog (where `newsletter_schedule_campaign` competes for "schedule").
 */

for (const query of ["schedule this post for next monday", "set the featured image on this post"]) {
  test(`'${query}' ranks a content_post write tool in the top 3`, async () => {
    const { catalog } = await realToolCatalog();
    const ids = catalog.search({ query }, { limit: 3 }).map((hit) => hit.id);
    assert.ok(ids.includes("content_post_update") || ids.includes("content_post_create"), `got ${ids.join(", ")}`);
  });
}
