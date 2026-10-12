/** Owner stalecard dispatch: same-name different sites stay distinguishable in the real card DOM. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import * as React from 'react';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { SiteGrid } from './SiteGrid.js';
import type { SiteRecord } from '../contracts/project.js';

test('stalecard: duplicate names show each parent under the name, including missing and Windows sites', (t) => {
  const { JSDOM } = createRequire(import.meta.url)('jsdom');
  const dom = new JSDOM('<div id="root"></div>');
  const globals = { React, window: dom.window, document: dom.window.document, navigator: dom.window.navigator, IS_REACT_ACT_ENVIRONMENT: true };
  const saved = new Map(Object.keys(globals).map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  const root = createRoot(dom.window.document.getElementById('root')!);
  t.after(() => {
    act(() => root.unmount()); dom.window.close();
    for (const [key, descriptor] of saved) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key); }
  });
  const site = (dir: string, folderMissing: boolean): SiteRecord => ({
    id: dir, installDir: dir, slug: 'tovu-dev', displayName: 'tovu-dev', port: 0, partition: 'fixture',
    templateId: 'blank', templateVersion: null, database: { kind: 'sqlite' }, desiredState: 'stopped', status: 'stopped',
    statusDetail: null, deleteErasesFiles: false, previewVersion: null, folderMissing, createdAt: 'date', updatedAt: 'date',
  });
  const projects = [site('/repo/sites/tovu-dev', true), site('/Documents/Tovu/tovu-dev', false), site('C:\\Sites\\tovu-dev', false)];
  const render = (records: SiteRecord[]) => act(() => root.render(createElement(SiteGrid, {
    projects: records, onOpen: () => {}, onDelete: async () => {},
  })));
  render(projects);
  const cards = [...dom.window.document.querySelectorAll('article.card')];
  assert.equal(cards.length, 3);
  const parents = ['/repo/sites', '/Documents/Tovu', 'C:\\Sites'];
  for (const [index, card] of cards.entries()) {
    const name = card.querySelector('h3')!;
    assert.equal(name.textContent, 'tovu-dev');
    assert.equal(name.nextElementSibling?.textContent, parents[index]);
    assert.equal(name.nextElementSibling?.getAttribute('title'), projects[index]!.installDir);
  }
  assert.match(cards[0]!.textContent!, /Folder moved or not a site/);
  render([projects[1]!]);
  assert.equal(dom.window.document.querySelector('.card__parent'), null, 'unique names stay compact');
});
