import assert from "node:assert/strict";
import test from "node:test";

import { createApp, createRouteDeps } from "#src/server/runtime/composition/app";
import { bootAuthenticated } from "#src/server/__tests__/helpers/http-test-server";
import type { RouteDeps } from "#src/server/routes/types";
import { parsePageLimit, parseSections } from "../profile.js";

/**
 * @file `GET .../site/profile`'s query parsing (`parseSections`, `parsePageLimit`) and whether the
 * parsed `pageLimit` actually reaches the profile builder. `site-profile-route.test.ts` proves an
 * unknown section and five bad limits are 400s and that one good request is a 200 — but not that
 * the limit is honoured (dropping it from the `buildSiteProfile` call shipped green), nor the
 * repeated-param, whitespace, empty and upper-bound edges of the parsers.
 */

test("parseSections: absent or blank means every section (undefined), never an empty selection", () => {
  assert.equal(parseSections(undefined), undefined);
  assert.equal(parseSections(""), undefined);
  assert.equal(parseSections(" , ,"), undefined);
});

test("parseSections: trims names and merges a repeated ?sections= param in order", () => {
  assert.deepEqual(parseSections(" theme , pages "), ["theme", "pages"]);
  assert.deepEqual(parseSections(["theme", "plugins,settings"]), ["theme", "plugins", "settings"]);
});

test("parseSections: an unknown name or a non-string (nested query object) is refused", () => {
  assert.throws(() => parseSections("pages,Theme"), {
    message: "unknown section 'Theme' — valid sections are: pages, theme, plugins, settings, contentTypes",
  });
  assert.throws(() => parseSections({ a: "pages" }), { message: "sections must be a comma-separated string of section names" });
});

test("parsePageLimit: accepts 1 and 200 inclusive, refuses 201, a repeated param, and absence is undefined", () => {
  assert.equal(parsePageLimit(undefined), undefined);
  assert.equal(parsePageLimit("1"), 1);
  assert.equal(parsePageLimit("200"), 200);
  assert.throws(() => parsePageLimit("201"), { message: "pageLimit must be an integer between 1 and 200, got '201'" });
  assert.throws(() => parsePageLimit(["5", "6"]), { message: "pageLimit must be a single integer value" });
});

test("GET site/profile: pageLimit caps the pages section's items while total still counts every page", async (t) => {
  const deps: RouteDeps = { ...createRouteDeps() };
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
