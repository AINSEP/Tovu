/**
 * @file `SiteGrid` rendered from its real module (real default hooks, a preview-less bridge): a
 * card's status title carries the running address, its copy never prints a port, and a port left
 * over on a site that is not running reads as Stopped.
 */
import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { createElement } from 'react';
import { installBridge, mount, settle, site, type TestContext } from './app/component-harness.js';
import { closeHost } from './app-render-harness.js';
import { SiteGrid } from './SiteGrid.js';
import type { SiteRecord } from '../contracts/project.js';

after(closeHost);

async function renderCard(t: TestContext, project: SiteRecord) {
  installBridge({ t, bridge: { getSitePreview: async () => null } });
  const view = mount({ t, element: createElement(SiteGrid, { projects: [project], onOpen: () => {}, onDelete: async () => {} }) });
  await settle();
  const card = view.container.querySelector('article.card');
  assert.ok(card, 'the card is on screen');
  return card;
}

// REGRESSION: owner 2026-10-13 — the card's copy never shows the port; it lives in the status title.
test('SiteGrid: the running address is in the status title, never in the card copy; a stale or zero port reads Stopped', async (t) => {
  for (const [status, port, title] of [
    ['stopped', 0, 'Stopped.'], ['stopped', 4100, 'Stopped.'], ['running', 0, 'Stopped.'],
    ['stopped', undefined, 'Stopped.'], ['running', 4100, 'Running at http://localhost:4100'],
  ] as const) {
    const card = await renderCard(t, site('a', { status, port } as Partial<SiteRecord>));
    assert.equal(card.querySelector('.state')?.getAttribute('title'), title, `${status}/${port}`);
    assert.doesNotMatch(card.textContent ?? '', /4100/, `${status}/${port} must not print the port`);
    assert.equal(card.querySelector('.card__port'), null);
  }
});
