import "../../../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import test from "node:test";

import { createApp, createRouteDeps } from "#src/server/runtime/composition/app";
import { bootAuthenticated } from "#src/server/__tests__/helpers/http-test-server";
import type { RouteDeps } from "#src/server/routes/types";

/**
 * @file `GET .../site/profile`'s query parsing (the Jini spec's `parseSections`, `parsePageLimit`) and whether the
 * parsed `pageLimit` actually reaches the profile builder. `site-profile-route.test.ts` proves an
 * unknown section and five bad limits are 400s and that one good request is a 200 — but not that
 * the limit is honoured (dropping it from the `buildSiteProfile` call shipped green), nor the
 * repeated-param, whitespace, empty and upper-bound edges of the parsers.
 */

/**
 * The query parsers moved into the Jini spec (`@jini-ai/cms/admin-http/routes/site/profile`, unit-tested
 * there against an injected vocabulary). This is the same rule at the wire: the section vocabulary and
 * page cap are the builder's own constants, bound by the registrar.
 */
test("GET site/profile: query parsing at the wire (blank means every section, names trim and merge, bad values are 400s)", async (t) => {
  const deps: ReturnType<typeof createRouteDeps> = { ...createRouteDeps() };
  const { baseUrl, cookie } = await bootAuthenticated(createApp(deps), t);
  const get = (query: string) => fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/site/profile${query}`, { headers: { cookie } });
  const keysOf = async (query: string): Promise<string[]> => {
    const res = await get(query);
    assert.equal(res.status, 200, `${query} should be accepted`);
    return Object.keys(((await res.json()) as { sections: Record<string, unknown> }).sections).sort();
  };
  const every = ["contentTypes", "pages", "plugins", "settings", "theme"];
  for (const blank of ["", "?sections=", "?sections=%20,%20,"]) assert.deepEqual(await keysOf(blank), every, `${blank || "no query"} means every section`);
  assert.deepEqual(await keysOf("?sections=%20theme%20,%20pages%20"), ["pages", "theme"]);
  assert.deepEqual(await keysOf("?sections=theme&sections=plugins,settings"), ["plugins", "settings", "theme"]);
  assert.deepEqual(await keysOf("?sections=pages&pageLimit=1"), ["pages"]);
  assert.deepEqual(await keysOf("?sections=pages&pageLimit=200"), ["pages"]);

  const refused = async (query: string, error: string): Promise<void> => {
    const res = await get(query);
    assert.equal(res.status, 400, `${query} should be refused`);
    assert.deepEqual(await res.json(), { error, code: "VALIDATION_ERROR" });
  };
  await refused("?sections=pages,Theme", "unknown section 'Theme' — valid sections are: pages, theme, plugins, settings, contentTypes");
  await refused("?sections[a]=pages", "sections must be a comma-separated string of section names");
  await refused("?pageLimit=201", "pageLimit must be an integer between 1 and 200, got '201'");
  await refused("?pageLimit=5&pageLimit=6", "pageLimit must be a single integer value");
});

test("GET site/profile: pageLimit caps the pages section's items while total still counts every page", async (t) => {
  const deps: ReturnType<typeof createRouteDeps> = { ...createRouteDeps() };
  const { baseUrl, cookie } = await bootAuthenticated(createApp(deps), t);
  for (const title of ["Profile Page A", "Profile Page B", "Profile Page C"]) {
    const created = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/pages`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ title }),
    });
    assert.equal(created.status, 201);
  }

  const full = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/site/profile?sections=pages`, { headers: { cookie } });
  assert.equal(full.status, 200);
  const fullPages = ((await full.json()) as { sections: { pages: { data: { total: number; items: unknown[] } } } }).sections.pages;
  assert.ok(fullPages.data.total >= 3, `expected at least the 3 created pages, saw ${fullPages.data.total}`);
  assert.equal(fullPages.data.items.length, fullPages.data.total);

  const capped = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/site/profile?sections=pages&pageLimit=2`, { headers: { cookie } });
  assert.equal(capped.status, 200);
  const body = (await capped.json()) as { sections: Record<string, { truncated?: boolean; data: { total: number; items: unknown[] } }> };
  assert.deepEqual(Object.keys(body.sections), ["pages"]);
  assert.equal(body.sections.pages.data.items.length, 2);
  assert.equal(body.sections.pages.data.total, fullPages.data.total);
  assert.equal(body.sections.pages.truncated, true);
});
