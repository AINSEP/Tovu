/**
 * @file Coverage for `icons.tsx`: every nav section has its own glyph, the gear has six attached
 * teeth, and the toolbar draws distinct back/forward/reload arrows. Rendered for real through
 * `react-dom/server`; the expected section list comes from the `RUNNER_SECTIONS` contract, not
 * from the icon table.
 *
 * Imported dynamically after publishing `React` on `globalThis`: `npm test` runs renderer tests
 * through tsx without the renderer tsconfig, so `.tsx` compiles with the classic JSX transform.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { RUNNER_SECTIONS, type RunnerSectionId } from '../contracts/sections.js';

(globalThis as { React?: typeof React }).React = React;
const { GearIcon, NavIcon, SectionIcon } = await import('./icons.js');

const SVG_OPEN = '<svg class="icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">';

function inner(markup: string): string {
  assert.ok(markup.startsWith(SVG_OPEN), `unexpected svg frame: ${markup.slice(0, 120)}`);
  assert.ok(markup.endsWith('</svg>'));
  return markup.slice(SVG_OPEN.length, -'</svg>'.length);
}

test('every Runner section has a non-empty glyph of its own in the shared decorative frame', () => {
  const ids = RUNNER_SECTIONS.map((section) => section.id as RunnerSectionId);
  assert.ok(ids.length >= 12);
  const drawn = new Map<string, string>();
  for (const id of ids) {
    const body = inner(renderToStaticMarkup(React.createElement(SectionIcon, { id })));
    assert.match(body, /^<(path|rect|circle) /, `${id} must draw shapes`);
    drawn.set(id, body);
  }
  // Distinct shapes per section: a copy-pasted entry would make two nav items look identical.
  assert.equal(new Set(drawn.values()).size, ids.length);
});

test('the home glyph has a door, not just an outline', () => {
  const body = inner(renderToStaticMarkup(React.createElement(SectionIcon, { id: 'home' })));
  assert.equal((body.match(/<path /g) ?? []).length, 3);
  assert.match(body, /<path d="M8 17v-4.1a2 2 0 0 1 4 0V17"><\/path>/);
});

test('the gear has six solid teeth at 60-degree steps under an opaque body ring', () => {
  const body = inner(renderToStaticMarkup(React.createElement(GearIcon)));
  const teeth = [...body.matchAll(/<rect [^>]*transform="rotate\((\d+) 10 10\)"[^>]*><\/rect>/g)];
  assert.deepEqual(teeth.map((match) => Number(match[1])), [0, 60, 120, 180, 240, 300]);
  for (const [tooth] of teeth) assert.match(tooth, /fill="currentColor"/);
  // Teeth first, then the body paints over the seam, then the hub.
  assert.ok(body.indexOf('<rect') < body.indexOf('<circle cx="10" cy="10" r="4.8" fill="var(--bg, #fff)"></circle>'));
  assert.ok(body.endsWith('<circle cx="10" cy="10" r="1.9"></circle>'));
});

test('back, forward and reload draw different shapes, and reload matches the updates glyph', () => {
  const kinds = ['back', 'forward', 'reload'] as const;
  const bodies = kinds.map((kind) => inner(renderToStaticMarkup(React.createElement(NavIcon, { kind }))));
  assert.equal(new Set(bodies).size, 3);
  assert.match(bodies[0]!, /M9 5.5 4.5 10 9 14.5/, 'back points left');
  assert.match(bodies[1]!, /M11 5.5l4.5 4.5-4.5 4.5/, 'forward points right');
  assert.equal(bodies[2], inner(renderToStaticMarkup(React.createElement(SectionIcon, { id: 'updates' }))));
});
