/**
 * @file `SectionIcon` rendered from its real module: every section the top nav shows draws its own
 * glyph. Replaces the source-text check that `icons.tsx` keyed an icon under `marketplace`.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { visibleSections } from '../contracts/sections.js';

// `npm test` runs renderer tests through tsx without the renderer tsconfig, so `icons.tsx` compiles
// with the classic JSX transform and reads a free `React`: publish it before importing the module.
(globalThis as { React?: typeof React }).React = React;
const { SectionIcon } = await import('./icons.js');

test('every visible nav section draws its own icon; Marketplace does not reuse another section\'s', () => {
  const drawn = visibleSections().map(({ id }) => ({ id, svg: renderToStaticMarkup(createElement(SectionIcon, { id })) }));
  assert.ok(drawn.some(({ id }) => id === 'marketplace'), 'Marketplace is in the nav');
  for (const { id, svg } of drawn) assert.match(svg, /<svg[^>]*>.+<\/svg>/s, `${id} renders an empty icon`);
  assert.equal(new Set(drawn.map(({ svg }) => svg)).size, drawn.length, 'two sections share one drawing');
});
