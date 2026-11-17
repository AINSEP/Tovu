import assert from "node:assert/strict";
import test from "node:test";

import { discoverAllBuiltInThemes, NO_THEME_ID } from "#src/features/theme/index";
import { builtInThemesDir } from "../site-paths.js";
import { bindStaticSiteContext, type StaticSiteContextDeps } from "../static-site-context.js";

/**
 * @file The identity a portable static copy is labelled with: the configured display name (falling
 * back to the site folder name), the folder name as slug, and the theme that is active when the
 * commit or preview runs, not when the root was built.
 */

const themes = discoverAllBuiltInThemes({ dir: builtInThemesDir(), source: "built-in" });

function depsWith(overrides: Partial<StaticSiteContextDeps> & { activeThemeId: string }): StaticSiteContextDeps {
  const { activeThemeId, ...rest } = overrides;
  return { themes, siteDisplayName: { read: () => undefined }, resolveActiveThemeId: async () => activeThemeId, ...rest };
}

test("the none sentinel resolves to the unstyled identity and the folder name stands in for a missing display name", async () => {
  const context = await bindStaticSiteContext({ readDeps: () => depsWith({ activeThemeId: NO_THEME_ID }), siteName: "my-site" })();
  assert.deepEqual(context, { name: "my-site", slug: "my-site", theme: "None", themeId: NO_THEME_ID });
});

test("a configured display name is the label, the folder name stays the slug, and a real theme reports its manifest", async () => {
  const stock = themes.find(theme => theme.status === "valid");
  if (!stock) assert.fail("no valid built-in theme to resolve");
  const context = await bindStaticSiteContext({
    readDeps: () => depsWith({ activeThemeId: stock.manifest.id, siteDisplayName: { read: () => "Acme Bakery" } }), siteName: "my-site",
  })();
  assert.deepEqual(context, { name: "Acme Bakery", slug: "my-site", theme: stock.manifest.name, themeId: stock.manifest.id });
});

test("deps are read when the context is resolved, so a later change to the active theme is seen", async () => {
  let activeThemeId: string = NO_THEME_ID;
  const deps = depsWith({ activeThemeId });
  deps.resolveActiveThemeId = async () => activeThemeId;
  const resolve = bindStaticSiteContext({ readDeps: () => deps, siteName: "s" });
  assert.equal((await resolve()).themeId, NO_THEME_ID);
  const stock = themes.find(theme => theme.status === "valid");
  if (!stock) assert.fail("no valid built-in theme to resolve");
  activeThemeId = stock.manifest.id;
  assert.equal((await resolve()).themeId, stock.manifest.id);
});
