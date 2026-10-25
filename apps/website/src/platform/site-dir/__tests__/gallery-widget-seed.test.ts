import assert from 'node:assert/strict';
import test from 'node:test';
import { readTemplate } from '../read-template.js';
import { openContentDb } from '../../db/sqlite/content-db.js';
import { contentKernel } from '../../db/content-kernel.js';
import { prepareContentStore } from '../../db/prepare-content-store.js';
import * as schema from '../../db/schema.sqlite.js';
import { parseWidgetInstancePayload } from '@jini-ai/cms/widgets';

test('a new starter site stores one empty Gallery in content.db and a restart preserves edits/deletion', async () => {
  const db = openContentDb(':memory:');
  try {
    const seed = readTemplate({ templateId: 'starter' }).seed;
    assert.deepEqual(seed.posts.map((entry) => entry.id), ['page-blog']);
    await prepareContentStore(contentKernel(db), { seed });
    const widgets = db.select().from(schema.entries).all();
    assert.equal(widgets.length, 1); assert.equal(widgets[0].title, 'Gallery'); assert.equal(widgets[0].type, 'widget');
    assert.deepEqual(parseWidgetInstancePayload({ fieldsJson: JSON.parse(widgets[0].fieldsJson) }), { widgetType: 'gallery', status: 'active', config: { images: [], layout: 'grid', columns: 3 } });
    db.delete(schema.entries).run();
    await prepareContentStore(contentKernel(db), { seed });
    assert.deepEqual(db.select().from(schema.entries).all(), [], 'existing sites never receive the new default');
  } finally { db.$client.close(); }
});

test('sample content opt-in includes the same single Gallery default', () => {
  const seed = readTemplate({ templateId: 'starter' }, { withSampleContent: true }).seed;
  assert.equal(seed.contentEntries?.length, 1); assert.equal(seed.contentEntries?.[0].title, 'Gallery');
  assert.ok(seed.posts.length > 0);
});
