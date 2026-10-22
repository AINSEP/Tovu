import assert from "node:assert/strict";
import test from "node:test";

import { InMemoryPresentationSettingsRepo } from "@jini-ai/cms/presentation";
import type { DiscoveredTheme } from "../../theme/index.js";
import { readPostTemplateOptions } from "../template-options.js";

/** readPostTemplateOptions: the active theme's templates applicable to a post kind, or none when
 *  the host supplied no theme ports, no theme renders, or the workspace chose "no theme". */

const atlas = {
  status: "valid",
  manifest: { id: "atlas", templates: ["wide", "landing", "plain"], templateFor: { landing: ["page"], plain: ["post", "page"] } },
} as unknown as DiscoveredTheme;

function repoWithActiveTheme(activeThemeId: string) {
  return new InMemoryPresentationSettingsRepo({}, { initialRows: [{ workspaceId: "ws-1", activeThemeId, updatedAt: "2026-07-15T00:00:00.000Z" }] });
}

test("without both theme ports (older fixtures) there are no options", async () => {
  assert.deepEqual(await readPostTemplateOptions({ deps: { workspaceId: "ws-1" }, kind: "post" }), []);
  assert.deepEqual(await readPostTemplateOptions({ deps: { workspaceId: "ws-1", presentationRepo: repoWithActiveTheme("atlas") }, kind: "post" }), []);
  assert.deepEqual(await readPostTemplateOptions({ deps: { workspaceId: "ws-1", themes: [atlas] }, kind: "post" }), []);
});

test("the active theme's templates are filtered by the kind each template declares", async () => {
  const deps = { workspaceId: "ws-1", presentationRepo: repoWithActiveTheme("atlas"), themes: [atlas] };
  assert.deepEqual(await readPostTemplateOptions({ deps, kind: "post" }), ["wide", "plain"]);
  assert.deepEqual(await readPostTemplateOptions({ deps, kind: "page" }), ["wide", "landing", "plain"]);
});

test("the no-theme choice offers no templates even when themes are installed", async () => {
  const deps = { workspaceId: "ws-1", presentationRepo: repoWithActiveTheme("none"), themes: [atlas] };
  assert.deepEqual(await readPostTemplateOptions({ deps, kind: "post" }), []);
});

test("an unresolvable active theme with nothing installed offers no templates", async (t) => {
  t.mock.method(console, "warn", () => {});
  const deps = { workspaceId: "ws-1", presentationRepo: repoWithActiveTheme("ghost"), themes: [] };
  assert.deepEqual(await readPostTemplateOptions({ deps, kind: "post" }), []);
});
