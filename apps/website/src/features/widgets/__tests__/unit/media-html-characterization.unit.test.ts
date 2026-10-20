import assert from 'node:assert/strict';
import test from 'node:test';
import type { JsonObject } from '@jini-ai/core/primitives';
import { renderMediaRawHtml, sanitizePageHtml } from '../../media-html.js';

test('srcset and SVG attributes keep safe URLs and reject invalid, empty and namespaced values', () => {
  const reports: Record<string, number>[] = [];
  const html = '<img srcset="/a 1x, https://example.test/b 2x"><img srcset="/a 1x, "><img srcset="javascript:bad 1x"><img srcset="http://[ 1x"><svg><path fill="red" stroke="javascript:bad" xml:lang="en"></path></svg>';
  assert.equal(sanitizePageHtml({ html }, { reportDrops: ({ dropped }) => reports.push(dropped) }), '<img srcset="/a 1x, https://example.test/b 2x"><img><img><img><svg><path fill="red"></path></svg>');
  assert.equal(reports[0]['img@srcset'], 3);
});

test('raw media caches successful and missing resolutions and keeps authored alt and source tag', () => {
  const calls: JsonObject[] = [];
  const issues: string[] = [];
  const html = '<img data-media-slug="photo" alt="Authored" width="1"><img data-media-slug="photo"><source data-media-slug="photo"><p>{{media:photo}}</p><i title="{{media:missing}}"></i><b>{{media:missing}}</b>';
  const output = renderMediaRawHtml({ html, media: { photo: { slug: 'photo' } }, renderMedia: ({ props }) => {
    calls.push(props);
    return '<!--ignore--><span>ignored</span><img src="/photo" alt="Library" width="20" height="10">';
  } }, { reportIssue: ({ slug }) => issues.push(slug) });
  assert.equal(output, '<img data-media-slug="photo" src="/photo" width="20" height="10" alt="Authored"><img data-media-slug="photo" src="/photo" alt="Library" width="20" height="10"><source data-media-slug="photo" src="/photo" alt="Library" width="20" height="10"><p>/photo</p>');
  assert.deepEqual(calls, [{ slug: 'photo', galleryResponsive: true }]);
  assert.deepEqual(issues, ['missing']);
});

test('raw media rejects mismatches, unsupported markers, inherited slugs and renderer output without media', (t) => {
  const warnings = t.mock.method(console, 'warn', () => {});
  const issues: string[] = [];
  const output = renderMediaRawHtml({ html: '<video data-media-slug="photo"></video><div data-media-slug="photo"></div><img data-media-slug="empty"><img data-media-slug="toString">', media: { photo: { slug: 'photo' }, empty: {} }, renderMedia: ({ props }) => props.slug === 'photo' ? '<img src="/photo">' : '<p>empty</p>' }, { reportIssue: ({ slug }) => issues.push(slug) });
  assert.equal(output, '');
  assert.deepEqual(issues.sort(), ['empty', 'toString']);
  assert.equal(warnings.mock.callCount(), 1);
});

test('raw media drops empty media containers after missing children, preserves src containers and plain text', () => {
  const output = renderMediaRawHtml({ html: 'plain<picture><source src="{{media:missing}}"></picture><audio><source src="{{media:missing}}"></audio><video src="/keep"><source src="{{media:missing}}"></video><audio></audio><p>no tokens</p>', media: {}, renderMedia: () => '' }, { reportIssue: () => {} });
  assert.equal(output, 'plain<video src="/keep"></video><audio></audio><p>no tokens</p>');
});

test('raw media kind mismatch warns and tokens without canonical src drop their owners', (t) => {
  const warnings = t.mock.method(console, 'warn', () => {});
  const output = renderMediaRawHtml({ html: '<video data-media-slug="photo"></video><img data-media-slug="photo"><p>{{media:photo}}</p><div data-note="{{media:photo}}"></div>', media: { photo: {} }, renderMedia: () => '<img alt="No source">' });
  assert.equal(output, '<img data-media-slug="photo" alt="No source">');
  assert.equal(warnings.mock.callCount(), 1);
});
