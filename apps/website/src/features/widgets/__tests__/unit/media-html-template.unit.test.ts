/** A collection marker's authored `<template>` (static-render splitCollectionMarkerInner) must survive
 * the page-body sanitizer, with its inert content held to the same element/attribute rules. */
import assert from 'node:assert/strict';
import test from 'node:test';
import { sanitizePageHtml } from '#src/features/widgets/media-html';

test('sanitizePageHtml keeps an authored <template> and its safe item markup', () => {
  const html = `<section data-embed-config='{"type":"collection"}'><template><p class="item">{{title}}: {{fields.price}}</p></template>Fallback</section>`;
  assert.ok(sanitizePageHtml({ html }).includes('<template><p class="item">{{title}}: {{fields.price}}</p></template>Fallback</section>'));
});

test('sanitizePageHtml strips scripts, event handlers and unsafe URLs inside a <template>', () => {
  const output = sanitizePageHtml({ html: `<template onclick="evil()"><p onmouseover="evil()">{{title}}</p><script>alert(1)</script><a href="javascript:evil()">x</a><iframe src="https://evil.example"></iframe></template>` });
  assert.equal(output, '<template><p>{{title}}</p><a>x</a></template>');
});
