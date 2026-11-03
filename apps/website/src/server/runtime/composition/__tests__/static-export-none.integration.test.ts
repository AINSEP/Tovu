import "../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { createSiteRouteDeps } from "../deps.js";

test('production composition preserves the none sentinel and legacy unstyled static export', async t => {
  const siteDir = await mkdtemp(path.join(tmpdir(), 'static-none-'));
  t.after(() => rm(siteDir, { recursive: true, force: true }));
  const themesDir = path.join(siteDir, 'themes'), uploadsDir = path.join(siteDir, 'uploads');
  await mkdir(themesDir);
  await mkdir(uploadsDir);
  let close: (() => Promise<void>) | undefined;
  const deps = await createSiteRouteDeps(path.join(siteDir, 'data.nosync', 'content.db'), {
    themesDir, uploadsDir,
    siteBinding: { dir: siteDir, name: 'site', dirOverridden: true, switcherCompatible: false },
    onStoreOpened: store => { close = () => store.close(); },
  });
  t.after(() => close?.());
  await deps.identityReady;
  deps.resolveActiveThemeId = async () => 'none';
  const overrides: (string | undefined)[] = [];
  deps.exportSiteBound = async input => {
    const { outputDir } = input;
    const themeId = 'themeId' in input && typeof input.themeId === 'string' ? input.themeId : undefined;
    overrides.push(themeId);
    return { outputDir, routes: { succeeded: [{ path: '/', kind: 'home', outputFile: 'index.html', data: '<main>Unstyled site</main>' }], failed: [] },
      assets: { succeeded: [], failed: [] }, skippedManifestEntries: [], unreferencedThemeFiles: [], droppedReferences: [] };
  };
  // Legacy {} selection must still capture the current site through the real composition/backend.
  const result = await deps.siteShareBackend!.create({ principalId: 'owner', format: 'static',
    signal: new AbortController().signal }, { waitMs: 60_000 }) as { shareId: string };
  assert.ok(result.shareId);
  assert.equal((await deps.staticSiteContext()).themeId, 'none');
  assert.deepEqual(overrides, ['none']);
  assert.deepEqual(await deps.siteShareBackend!.staticOptions({}), {
    activeThemeId: 'none', themes: [{ themeId: 'none', name: 'Current site' }],
  });
});
