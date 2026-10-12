/** Real card markup and its existing Locate controller, with a narrow fake preload port. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import * as React from 'react';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { SiteGrid } from './SiteGrid.js';
import type { SiteRecord } from '../contracts/project.js';

test('old-level stopped cards invoke the move bridge and replace the old card id; live cards cannot move', async (t) => {
  const { JSDOM } = createRequire(import.meta.url)('jsdom');
  const dom = new JSDOM('<div id="root"></div>');
  // The Node loader may use classic JSX; supply the real React runtime, not a module mock.
  const globals = { React, window: dom.window, document: dom.window.document, navigator: dom.window.navigator, IS_REACT_ACT_ENVIRONMENT: true };
  const saved = new Map(Object.keys(globals).map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  const project = { id: '/old/alpha', slug: 'alpha', displayName: 'Alpha', installDir: '/old/alpha', port: 0, partition: 'test',
    templateId: 'blank', templateVersion: null, database: { kind: 'sqlite' }, desiredState: 'stopped', status: 'stopped', statusDetail: null,
    deleteErasesFiles: false, previewVersion: null, folderMissing: false, createdAt: 'date', updatedAt: 'date', moveIntoSites: true } satisfies SiteRecord;
  const destination: SiteRecord = { ...project, id: '/new/sites/alpha', installDir: '/new/sites/alpha', moveIntoSites: false };
  const moves: unknown[] = [], delivered: unknown[] = [];
  dom.window.tovuRunner = { moveSiteHome: async (input: unknown) => { moves.push(input); return destination; } };
  const root = createRoot(dom.window.document.getElementById('root')!);
  t.after(() => {
    act(() => root.unmount()); dom.window.close();
    for (const [key, descriptor] of saved) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key); }
  });
  const render = (record: SiteRecord) => act(() => root.render(createElement(SiteGrid, {
    projects: [record], onOpen: () => assert.fail('move click must not open a site'), onDelete: async () => {},
    onSiteUpdated: (next: SiteRecord, old?: string) => delivered.push([next, old]),
  })));
  render(project);
  const button = [...dom.window.document.querySelectorAll('button')].find((node: Element) => node.textContent === 'Move into sites/');
  assert.ok(button);
  await act(async () => { button.click(); });
  assert.deepEqual(moves, [{ id: project.id, confirmed: true }]); assert.deepEqual(delivered, [[destination, project.id]]);
  render({ ...project, status: 'running' });
  assert.equal([...dom.window.document.querySelectorAll('button')].some((node: Element) => node.textContent === 'Move into sites/'), false);
  render(destination);
  assert.equal([...dom.window.document.querySelectorAll('button')].some((node: Element) => node.textContent === 'Move into sites/'), false);
});
