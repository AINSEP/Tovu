/** Reverses 59a036e49: startup now migrates stopped sites; cards no longer offer nesting. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import * as React from 'react';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { SiteGrid } from './SiteGrid.js';
import type { SiteRecord } from '../contracts/project.js';

test('stopped, running and missing-folder cards never offer Move into sites/', async (t) => {
  const { JSDOM } = createRequire(import.meta.url)('jsdom');
  const dom = new JSDOM('<div id="root"></div>');
  // The Node loader may use classic JSX; supply the real React runtime, not a module mock.
  const globals = { React, window: dom.window, document: dom.window.document, navigator: dom.window.navigator, IS_REACT_ACT_ENVIRONMENT: true };
  const saved = new Map(Object.keys(globals).map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  const project = { id: '/old/alpha', slug: 'alpha', displayName: 'Alpha', installDir: '/old/alpha', port: 0, partition: 'test',
    templateId: 'blank', templateVersion: null, database: { kind: 'sqlite' }, desiredState: 'stopped', status: 'stopped', statusDetail: null,
    deleteErasesFiles: false, previewVersion: null, folderMissing: false, createdAt: 'date', updatedAt: 'date' } satisfies SiteRecord;
  const root = createRoot(dom.window.document.getElementById('root')!);
  t.after(() => {
    act(() => root.unmount()); dom.window.close();
    for (const [key, descriptor] of saved) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key); }
  });
  const render = (record: SiteRecord) => act(() => root.render(createElement(SiteGrid, {
    projects: [record], onOpen: () => {}, onDelete: async () => {},
  })));
  for (const record of [project, { ...project, status: 'running' as const }, { ...project, folderMissing: true }]) {
    render(record);
    assert.equal([...dom.window.document.querySelectorAll('button')].some((node: Element) => node.textContent === 'Move into sites/'), false);
    assert.ok(dom.window.document.querySelector('[aria-label="Actions for Alpha"]'));
  }
});
