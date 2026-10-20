/** Pins `GET /` outcomes the wider page suites leave open: a pre-content redirect claiming `/`, a
 *  see-more batch request against the theme's home, and a static `index.html` whose explicit-title
 *  lookup fails. */
import "../../../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import path from "node:path";
import test, { type TestContext } from "node:test";

import type { PostRecord } from "#src/features/post/index";
import { InMemoryPostRepo } from "#src/features/post/index";
import { loadTheme } from "#src/features/theme/index";
import { createApp, createRouteDeps } from "#src/server/runtime/composition/app";
import { startTestServer } from "#src/server/__tests__/helpers/http-test-server";

type Deps = ReturnType<typeof createRouteDeps>;

async function boot(t: TestContext, overrides: Partial<Deps> = {}) {
  const deps: Deps = { ...createRouteDeps(), ...overrides };
  return { deps, baseUrl: await startTestServer(createApp(deps), t) };
}

function publishedPost(workspaceId: string, index: number): PostRecord {
  return {
    id: `home-post-${index}`, workspaceId, title: `Home Post ${index}`, slug: `home-post-${index}`,
    bodyJson: { type: "doc", content: [] }, bodyFormat: "doc", bodyHtml: null, status: "published", kind: "post",
    publishAt: new Date(Date.UTC(2026, 0, 30 - index)).toISOString(), updatedAt: "2026-09-01T00:00:00.000Z", version: 1,
  };
}

test("GET /: an override redirect rule claiming / answers before any content render", async (t) => {
  const { deps, baseUrl } = await boot(t);
  const record = {
    id: "home-redirect", workspaceId: deps.workspaceId, matchType: "exact" as const, fromPattern: "/", toTarget: "/elsewhere",
    statusCode: 302 as const, status: "active" as const, override: true, priority: 0, source: "manual" as const,
    createdByPrincipal: "system", createdAt: "2026-10-20T00:00:00.000Z", updatedAt: "2026-10-20T00:00:00.000Z", version: 1,
  };
  await deps.redirectRepo.save({ record, revision: { redirectId: record.id, workspaceId: deps.workspaceId, seq: 1, state: record, tombstoned: false, actorId: "system", recordedAt: record.createdAt } });
  const response = await fetch(`${baseUrl}/`, { redirect: "manual" });
  assert.equal(response.status, 302);
  assert.equal(response.headers.get("location"), "/elsewhere");
});

test("GET /_more/1/<after>: a batch request for a static home with no see-more listing falls through to the 404", async (t) => {
  const base = createRouteDeps();
  const { baseUrl } = await boot(t, { postRepo: new InMemoryPostRepo(Array.from({ length: 3 }, (_, index) => publishedPost(base.workspaceId, index))) });
  assert.equal((await fetch(`${baseUrl}/`)).status, 200, "control: the home page itself renders");
  assert.equal((await fetch(`${baseUrl}/_more/1/13`)).status, 404);
});

function basicTwo() {
  return loadTheme({ themeDir: path.resolve("content/themes/static/basic-2"), id: "basic-2", source: "built-in" });
}
const titlesIn = (html: string) => [...html.matchAll(/<title>([^<]*)<\/title>/g)].map((match) => match[1]);

async function staticHomeTitles(t: TestContext, siteTitle: () => Promise<string | undefined>) {
  const theme = basicTwo();
  const base = createRouteDeps();
  const { baseUrl } = await boot(t, { themes: [theme], postRepo: new InMemoryPostRepo([]), seoDeps: { ...base.seoDeps, siteTitle } });
  const response = await fetch(`${baseUrl}/`);
  assert.equal(response.status, 200);
  return { titles: titlesIn(await response.text()), themeTitle: titlesIn(theme.pages.index ?? "")[0] };
}

test("GET /: a static index.html keeps its own title when no explicit site title is set", async (t) => {
  const { titles, themeTitle } = await staticHomeTitles(t, async () => undefined);
  assert.deepEqual(titles, [themeTitle]);
});

test("GET /: a static index.html takes the fold's title when the explicit site-title lookup fails", async (t) => {
  const { titles, themeTitle } = await staticHomeTitles(t, async () => { throw new Error("settings unavailable"); });
  assert.equal(titles.length, 1);
  assert.notEqual(titles[0], themeTitle);
});
