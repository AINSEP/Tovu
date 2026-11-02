/**
 * @file D-02: the database cards `CreateWebsiteOnboarding` renders with its real default hooks,
 * read as markup. `react-dom/server` renders the real module (no effects run), and jsdom parses the
 * result so each radio is read with the card around it.
 *
 * `npm test` runs renderer tests through tsx WITHOUT the renderer tsconfig, so tsx compiles the
 * imported `.tsx` with the classic JSX transform (a free `React`); the component is imported only
 * after `React` is published on `globalThis` (see `CreateWebsiteOnboarding.test.ts`).
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

(globalThis as { React?: typeof React }).React = React;
const { CreateWebsiteOnboarding } = await import('./CreateWebsiteOnboarding.js');
const { JSDOM } = createRequire(import.meta.url)('jsdom');

/** Each database radio's value, whether it is disabled, and the hint on its own card. */
function databaseCards(): Map<string, { disabled: boolean; hint: string }> {
  const html = renderToStaticMarkup(React.createElement(CreateWebsiteOnboarding, { onBack: () => {}, onCreate: async () => {} }));
  const dom = new JSDOM(html);
  try {
    const radios = [...dom.window.document.querySelectorAll('input[name="database"]')] as HTMLInputElement[];
    return new Map(radios.map((radio) => [radio.value, {
      disabled: radio.disabled,
      hint: radio.closest('label')?.querySelector('small')?.textContent ?? '',
    }]));
  } finally {
    dom.window.close();
  }
}

test('D-02: the two database options this app cannot provision are disabled radios whose cards say why', () => {
  // Both were selectable, and `computeCanCreate` then refused to enable the button until the
  // operator typed a project URL and an API key — which `handleCreate` discarded before reporting
  // a plain SQLite site as success. Being made to type a credential that is thrown away is worse
  // than the choice being ignored. A disabled option cannot be selected (a control that only LOOKS
  // disabled is still selectable by keyboard), so the vendor field blocks never render and no
  // credential is ever asked for.
  const cards = databaseCards();
  for (const value of ['supabase', 'custom']) {
    assert.equal(cards.get(value)?.disabled, true, `${value} must really be disabled`);
    assert.match(cards.get(value)?.hint ?? '', /Not available.*provisioner/, `${value} must explain its unavailability`);
  }
  assert.equal(cards.get('sqlite')?.disabled, false, 'SQLite is the one this app really does create');
  assert.doesNotMatch(cards.get('sqlite')?.hint ?? '', /Not available/);
});
