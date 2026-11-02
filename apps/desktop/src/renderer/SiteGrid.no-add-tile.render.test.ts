/**
 * @file `SiteGrid` rendered from its real module (real default hooks, a preview-less bridge): the
 * grid holds one card per website and nothing else — the old dashed "add" tile stays gone.
 */
import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { createElement } from 'react';
import { installBridge, mount, settle, site, type TestContext } from './app/component-harness.js';
import { closeHost } from './app-render-harness.js';
import { SiteGrid } from './SiteGrid.js';
import type { SiteRecord } from '../contracts/project.js';

after(closeHost);

async function renderGrid(t: TestContext, projects: readonly SiteRecord[]) {
  installBridge({ t, bridge: { getSitePreview: async () => null } });
  const view = mount({ t, element: createElement(SiteGrid, { projects, onOpen: () => {}, onDelete: async () => {} }) });
  await settle();
  return view;
}

test('SiteGrid: no dashed add tile, with or without websites — one card per website and nothing else', async (t) => {
  // The tile called the identical zero-argument handler the header's "Create website" button calls,
  // and its subtitle described the create path — one action wearing two controls. Checked by class
  // and by label both, so restoring either half fails.
  const cases: SiteRecord[][] = [[], [site('a'), site('b')]];
  for (const projects of cases) {
    const view = await renderGrid(t, projects);
    assert.equal(view.container.querySelector('.card--add'), null);
    assert.doesNotMatch(view.text(), /Add project|New site on its own port/);
    assert.equal(view.container.querySelector('.grid')?.children.length, projects.length);
  }
});
