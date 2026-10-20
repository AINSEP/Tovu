import assert from 'node:assert/strict';
import test from 'node:test';
import { renderMediaRawHtml } from '../../media-html.js';

test('raw media visits roots and nested children last-first while preserving authored output order', () => {
  const calls: string[] = [];
  const output = renderMediaRawHtml({
    html: '<div><img data-media-slug="left"><span>plain</span><img data-media-slug="right"></div><img data-media-slug="last">',
    media: { left: { slug: 'left' }, right: { slug: 'right' }, last: { slug: 'last' } },
    renderMedia: ({ props }) => {
      calls.push(String(props.slug));
      return `<img src="/${props.slug}">`;
    },
  });
  assert.deepEqual(calls, ['last', 'right', 'left']);
  assert.equal(output, '<div><img data-media-slug="left" src="/left"><span>plain</span><img data-media-slug="right" src="/right"></div><img data-media-slug="last" src="/last">');
});

test('raw media stops traversing a rejected element before visiting its descendants', () => {
  const issues: string[] = [];
  const output = renderMediaRawHtml({
    html: '<div data-media-slug="missing"><img data-media-slug="ignored"></div><p>keep</p>',
    media: {},
    renderMedia: () => { throw new Error('Unknown slugs must never render'); },
  }, { reportIssue: ({ slug }) => issues.push(slug) });
  assert.deepEqual(issues, ['missing']);
  assert.equal(output, '<p>keep</p>');
});

test('raw media removes unresolved root text and the immediate parent of unresolved nested text', () => {
  const issues: string[] = [];
  const output = renderMediaRawHtml({
    html: '{{media:root}}<section><p>before {{media:nested}} after</p><b>kept</b></section>tail',
    media: {},
    renderMedia: () => '',
  }, { reportIssue: ({ slug }) => issues.push(slug) });
  assert.deepEqual(issues, ['nested', 'root']);
  assert.equal(output, '<section><b>kept</b></section>tail');
});

test('raw media prunes rejected sources through nested media containers but keeps empty ordinary parents', () => {
  const output = renderMediaRawHtml({
    html: '<div><picture><video><source src="{{media:missing}}"></video></picture></div><video src="/keep"><source src="{{media:missing}}"></video><audio></audio>',
    media: {},
    renderMedia: () => '',
  }, { reportIssue: () => {} });
  assert.equal(output, '<div></div><video src="/keep"></video><audio></audio>');
});

test('raw media handles an empty tree without rendering or reporting a missing slug', () => {
  assert.equal(renderMediaRawHtml({
    html: '',
    media: {},
    renderMedia: () => { throw new Error('Empty trees must never render'); },
  }, { reportIssue: () => { throw new Error('Empty trees have no slugs'); } }), '');
});
