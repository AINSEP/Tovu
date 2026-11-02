import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { RETIRED_READ_TOOL_TO_CARD } from '../../../../apps/website/src/assistant/content-read-tool.ts';
import { readHostPluginFile, readHostPluginGuidance } from '../../../../apps/website/src/features/agent-plugins/host-plugin-guidance.ts';

const root = path.resolve(import.meta.dirname, '..');
const options = { overlaysDir: path.dirname(root) };

test('the host loader exposes every Shopify overlay reference named by its guidance', async () => {
  const result = await readHostPluginGuidance({ pluginId: 'shopify' }, options);
  assert.deepEqual(result.files, ['host/content-mapping.md', 'host/site-integration.md', 'host/storefront-snippets.md']);
  assert.match(result.guidance, /`agent_plugin_shopify`[^]*file: "references\/<file>"/);
  for (const file of result.files) {
    assert.ok(result.guidance.includes(`file: "${file}"`), file);
    assert.deepEqual(await readHostPluginFile({ pluginId: 'shopify', file }, options), {
      text: await readFile(path.join(root, file), 'utf8'),
    });
  }
});

test('collection shapes use the current read card and preserve version and field-bag guards', async () => {
  const guidance = await readFile(path.join(root, 'GUIDANCE.md'), 'utf8');
  const mapping = await readFile(path.join(root, 'host/content-mapping.md'), 'utf8');
  assert.equal(RETIRED_READ_TOOL_TO_CARD.get('collections_entry_list'), 'content_read.collection_entry');
  for (const text of [guidance, mapping]) {
    assert.match(text, /content_read\.collection_entry \{type:"product"\}/);
    assert.doesNotMatch(text, /collections_entry_list/);
  }
  assert.match(mapping, /fieldsJson:\{ext:\{site:\{/);
  assert.match(mapping, /COMPLETE replacement[^]*including\s+fields outside `ext\.site`/);
  assert.match(mapping, /version from the latest\s+response/);
  assert.match(mapping, /only\s+after the complete successful catalog read/);
});

test('renderer and live-site limitations stay in the overlay', async () => {
  const storefront = await readFile(path.join(root, 'host/storefront-snippets.md'), 'utf8');
  const integration = await readFile(path.join(root, 'host/site-integration.md'), 'utf8');
  assert.match(storefront, /data-embed-config='\{"type":"collection","id":"product","limit":24/);
  assert.match(storefront, /two selections can overlap/);
  assert.match(integration, /one-segment paths/);
  assert.match(integration, /make it primary BEFORE the main domain points at Tovu/);
  assert.match(integration, /splitCollectionMarkerInner/);
  assert.match(integration, /CSP is report-only/);
});
