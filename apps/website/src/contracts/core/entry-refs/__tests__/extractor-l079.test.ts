import assert from 'node:assert/strict';
import test from 'node:test';
import { extractEntryRefs, extractHtmlEntryRefs } from '../extractor.js';

const base = { workspaceId: 'ws', sourceEntryId: 'page', sourceEntryType: 'page' };
const marker = ({ config }: { config: Record<string, unknown> }, _optional: Record<string, never> = {}) => `<div data-embed-config='${JSON.stringify(config)}'></div>`;

test('L079: structured refs retain placement, pre-order embed and namespace ordering through invalid nodes', () => {
  const refs = extractEntryRefs({ ...base, bodyJson: {
    placements: [null, {}, { widgetEntryId: 'placement' }],
    content: [null, 1, [], { type: 'widgetEmbed', attrs: { widgetEntryId: 'outer' }, content: [
      { type: 'widgetEmbed', attrs: { widgetEntryId: 'inner' } }, { type: 'widgetEmbed', attrs: [] },
    ] }],
  }, fieldsExt: { invalid: null, empty: { config: [] }, ordinary: { config: {
    menuRef: 'menu', categoryTermId: 'term', thingRefId: 'ref', formId: 'form', blankId: '', countId: 4, other: 'ignored',
  } }, widget: { widgetType: 'gallery', config: { images: [{ mediaId: 'photo' }] } } } });
  assert.deepEqual(refs.map(r => [r.fieldPath, r.targetKind, r.targetId]), [
    ['bodyJson.placements[2]', 'entry', 'placement'], ['bodyJson.content[3]', 'entry', 'outer'],
    ['bodyJson.content[3].content[0]', 'entry', 'inner'],
    ['fields.ext.ordinary.config.menuRef', 'entry', 'menu'], ['fields.ext.ordinary.config.categoryTermId', 'term', 'term'],
    ['fields.ext.ordinary.config.thingRefId', 'entry', 'ref'], ['fields.ext.ordinary.config.formId', 'entry', 'form'],
    ['fields.ext.widget.config.media[0]', 'asset', 'photo'],
  ]);
  assert.deepEqual(extractEntryRefs({ ...base, bodyJson: null, fieldsExt: {} }), []);
});

test('L079: galleries retain duplicate image locators and have a budget independent of single targets', () => {
  const gallery = marker({ config: { type: 'gallery', images: [{ mediaId: 'photo' }, { mediaId: 'photo' }] } });
  const refs = extractHtmlEntryRefs({ ...base, html: gallery.repeat(51) + marker({ config: { type: 'widget', id: 'widget' } }) });
  assert.equal(refs.length, 101);
  assert.equal(refs[99].fieldPath, 'bodyHtml[embed:gallery#50].images[1].mediaId');
  assert.equal(refs[100].targetId, 'widget');
  const capped = extractHtmlEntryRefs({ ...base, html: marker({ config: { type: 'widget', id: 'widget' } }).repeat(50) + gallery });
  assert.equal(capped.length, 50);
});

test('L079: slug-only widgets are invisible to safe-delete (reported, not fixed)', () => {
  assert.deepEqual(extractHtmlEntryRefs({ ...base, html: marker({ config: { type: 'widget', slug: 'named-widget' } }) }), []);
});
