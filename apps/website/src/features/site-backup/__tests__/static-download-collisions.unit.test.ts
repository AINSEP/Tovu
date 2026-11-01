import assert from 'node:assert/strict';
import test from 'node:test';
import { staticDownloadLayout } from '../static-download-layout.js';
import { claimSharePath } from '../share-file-policy.js';

/** Distinct URLs must remain distinct bytes after portable path relocation. */
test('download preserves same-named assets from two theme namespaces and flattened font paths', () => {
  const names = [
    'theme-assets/tovu-theme/assets/vendor/kuinetic/kuinetic.all.min.js',
    'theme-assets/tovu-starter/assets/vendor/kuinetic/kuinetic.all.min.js',
    'theme-assets/tovu-theme/assets/fonts/one/Display.woff2',
    'theme-assets/tovu-theme/assets/fonts/two/Display.woff2',
  ];
  const html = names.map(name => `<a href="/${name}">${name}</a>`).join('');
  const files = staticDownloadLayout({ copy: { themeId: 'tovu-theme', siteSlug: 'tovu', files: [
    { path: 'index.html', content: Buffer.from(html) },
    ...names.map((path, index) => ({ path, content: Buffer.from(`asset-${index}`) })),
  ] } });
  const aliases = new Map<string, string>(), claimed = new Set<string>();
  for (const file of files) claimSharePath({ path: file.path, directory: false, aliases, files: claimed });
  const home = files.find(file => file.path === 'sites/theme/index.html')!.content.toString();
  for (const [index, name] of names.entries()) {
    const asset = files.find(file => file.content.equals(Buffer.from(`asset-${index}`)));
    assert.ok(asset, name);
    assert.ok(home.includes(asset.path.replace('sites/theme/', '')), name);
  }
});
