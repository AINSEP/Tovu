import assert from "node:assert/strict";
import test from "node:test";

import type { PostRecord } from "#src/features/post/index";
import { buildPostRecord } from "#src/features/post/__tests__/post-record.fixture";
import { runLiquidRender } from "../liquid-render.js";
import { buildTemplateRenderData, renderSite, type SiteRenderContext } from "../render.js";

/**
 * @file Bug D follow-up (2026-10-22): the day a template shows for a post is the SITE's calendar day,
 * not UTC's — `post.dateShort`, the no-theme `.entry-meta` line and Liquid's `| date:` filter are all
 * computed on the server, so a static page is right without JavaScript. `post.date` stays the stored
 * instant (the machine value a theme puts in `<time datetime>`).
 *
 * Midnight-boundary instants: 03:30 UTC on Jun 14 is still Jun 13 in Los Angeles; 16:00 UTC on Jun 13
 * is already Jun 14 in Tokyo.
 */

const LA_EVENING = "2022-06-14T03:30:00.000Z";
const TOKYO_MORNING = "2022-06-13T16:00:00.000Z";

function post(iso: string): PostRecord {
  return buildPostRecord({ id: "p1", workspaceId: "w1", title: "Late", slug: "late", status: "published", updatedAt: iso, publishAt: iso, version: 1 });
}

function ctx(iso: string, timeZone?: string): SiteRenderContext {
  const p = post(iso);
  return {
    siteTitle: "Site", route: "post", posts: [p], post: p, products: [], themeName: "test",
    widgetRegions: {}, widgetInlineResolved: new Map(), mediaTransformVersions: new Map(), mediaAssetMetadata: new Map(), assignedTerms: [],
    ...(timeZone === undefined ? {} : { timeZone }),
  };
}

function dateShorts(data: Record<string, unknown>): (string | undefined)[] {
  const posts = data.posts as { dateShort: string; date: string }[];
  const single = data.post as { dateShort: string; date: string };
  return [posts[0]?.dateShort, single.dateShort];
}

test("dateShort is the calendar day in the site's zone, on the list and the single post", () => {
  assert.deepEqual(dateShorts(buildTemplateRenderData(ctx(LA_EVENING, "America/Los_Angeles"))), ["2022-06-13", "2022-06-13"]);
  assert.deepEqual(dateShorts(buildTemplateRenderData(ctx(TOKYO_MORNING, "Asia/Tokyo"))), ["2022-06-14", "2022-06-14"]);
});

test("dateShort stays the UTC day when the site has no zone", () => {
  assert.deepEqual(dateShorts(buildTemplateRenderData(ctx(LA_EVENING))), ["2022-06-14", "2022-06-14"]);
  assert.deepEqual(dateShorts(buildTemplateRenderData(ctx(TOKYO_MORNING))), ["2022-06-13", "2022-06-13"]);
});

test("post.date stays the stored instant whatever the zone", () => {
  const data = buildTemplateRenderData(ctx(LA_EVENING, "America/Los_Angeles"));
  assert.equal((data.post as { date: string }).date, LA_EVENING);
  assert.equal((data.posts as { date: string }[])[0]?.date, LA_EVENING);
});

test("a themeless render's entry-meta line shows the site's day on the list and the post page", async () => {
  const p = post(LA_EVENING);
  for (const route of ["home", "post"] as const) {
    const zoned = await renderSite({ theme: null, route, siteTitle: "Acme", posts: [p], post: p, timeZone: "America/Los_Angeles" });
    assert.match(zoned, /class="entry-meta">2022-06-13<\/p>/, route);
    const utc = await renderSite({ theme: null, route, siteTitle: "Acme", posts: [p], post: p });
    assert.match(utc, /class="entry-meta">2022-06-14<\/p>/, route);
  }
});

const DATE_FILTER = '{{ post.date | date: "%Y-%m-%d %H:%M" }}|{% for p in posts %}{{ p.date | date: "%b %e, %Y" }}{% endfor %}';

function liquidHtml(context: SiteRenderContext): string {
  const result = runLiquidRender({ workerData: { source: DATE_FILTER, ctx: context } });
  assert.equal(result.ok, true, JSON.stringify(result));
  return (result as { html: string }).html;
}

test("Liquid's date filter formats in the site's zone", () => {
  assert.equal(liquidHtml(ctx(LA_EVENING, "America/Los_Angeles")), "2022-06-13 20:30|Jun 13, 2022");
  assert.equal(liquidHtml(ctx(TOKYO_MORNING, "Asia/Tokyo")), "2022-06-14 01:00|Jun 14, 2022");
});

test("Liquid's date filter formats in UTC when the site has no zone or an invalid one, whatever zone rendered before", () => {
  // Rendering a zoned site first proves the zone is per render: it must not leak into the next site's render.
  liquidHtml(ctx(LA_EVENING, "America/Los_Angeles"));
  assert.equal(liquidHtml(ctx(LA_EVENING)), "2022-06-14 03:30|Jun 14, 2022");
  assert.equal(liquidHtml(ctx(LA_EVENING, "Mars/Olympus_Mons")), "2022-06-14 03:30|Jun 14, 2022");
});

test("a Liquid date filter's own explicit zone argument still wins over the site's", () => {
  const result = runLiquidRender({ workerData: { source: '{{ post.date | date: "%Y-%m-%d", "Asia/Tokyo" }}', ctx: ctx(LA_EVENING, "America/Los_Angeles") } });
  assert.deepEqual(result, { ok: true, html: "2022-06-14" });
});

test("with no site zone, dates are UTC even when the server process runs in another zone", (t) => {
  // LiquidJS's default is the PROCESS zone; a dev box or a non-UTC host must not change a site's dates.
  const previous = process.env.TZ;
  t.after(() => {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  });
  process.env.TZ = "Asia/Tokyo";
  assert.equal(liquidHtml(ctx(LA_EVENING)), "2022-06-14 03:30|Jun 14, 2022");
  assert.deepEqual(dateShorts(buildTemplateRenderData(ctx(LA_EVENING))), ["2022-06-14", "2022-06-14"]);
});
