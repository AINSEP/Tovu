/** @file Characterization of the pre-TW4 inventory projection, including traversal order. */
import assert from 'node:assert/strict';
import test from 'node:test';
import { consentGateInventory } from '../readiness.js';

test('inventory projects only marked templates and deferred attributes in reverse tree order', () => {
  const html = `<!doctype html><!--ignored--><body>text
    <template><script src="/ignored.js"></script></template>
    <template data-jini-consent-script data-category="analytics"><!--ignored--><script src="https://user:password@example.test/a.js?q=private#private"></script></template>
    <template data-jini-consent-resource><img src="/local.png?private=1"></template>
    <template data-jini-consent-script>text only</template>
    <section><button data-jini-consent-attributes='{"onclick":"doIt()","style":"color:red"}' data-jini-consent-category="functional">Click</button></section>
    <div data-jini-consent-attributes=""></div>
    <a data-jini-consent-attributes="{}"></a>
  </body>`;
  assert.deepEqual(consentGateInventory({ html }), { truncated: false, items: [
    { tag: 'a', category: 'blocked', source: null, attributes: [] },
    { tag: 'button', category: 'functional', source: null, attributes: ['onclick', 'style'] },
    { tag: 'img', category: 'blocked', source: '/local.png' },
    { tag: 'script', category: 'analytics', source: 'https://example.test/a.js' },
  ] });
});

for (const [attribute, value, source] of [
  ['src', '', null], ['href', '/privacy?q=private#private', '/privacy'],
  ['data', 'https://[invalid', '[invalid resource URL]'],
  ['poster', `/${'x'.repeat(600)}`, `/${'x'.repeat(499)}`],
] as const) {
  test(`inventory source labels preserve ${attribute} redaction and bounds`, () => {
    assert.deepEqual(consentGateInventory({ html: `<template data-jini-consent-resource data-category=""><video ${attribute}="${value}"></video></template>` }).items,
      [{ tag: 'video', category: '', source }]);
  });
}

test('a marked template without a source yields null and its subtree is not separately inventoried', () => {
  assert.deepEqual(consentGateInventory({ html: '<template data-jini-consent-resource><div><button data-jini-consent-attributes="{}"></button></div></template>' }).items,
    [{ tag: 'div', category: 'blocked', source: null }]);
});

test('malformed attribute payloads propagate rather than producing a green inventory', () => {
  assert.throws(() => consentGateInventory({ html: '<button data-jini-consent-attributes="invalid"></button>' }), SyntaxError);
});

test('inventory caps at 200 entries and distinguishes an exhausted head from more templates', () => {
  const item = '<template data-jini-consent-script><script></script></template>';
  assert.equal(consentGateInventory({ html: `<head>${item.repeat(200)}</head>` }).truncated, false);
  const result = consentGateInventory({ html: `<head>${item.repeat(201)}</head>` });
  assert.equal(result.items.length, 200);
  assert.equal(result.truncated, true);
});

test('200 body items report truncation for the remaining empty head (reported, not fixed)', () => {
  const result = consentGateInventory({ html: `<body>${'<template data-jini-consent-script><script></script></template>'.repeat(200)}</body>` });
  assert.equal(result.items.length, 200);
  assert.equal(result.truncated, true);
});
