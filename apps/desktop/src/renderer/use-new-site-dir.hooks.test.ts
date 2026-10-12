import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { useNewSiteDir } from './use-new-site-dir.hooks.js';

test('destination follows typed names, shortens home, and ignores stale replies', async (t) => {
  const { JSDOM } = createRequire(import.meta.url)('jsdom');
  const dom = new JSDOM('<div id="root"></div>');
  const globals = { window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true };
  const saved = new Map(Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  type Plan = { path: string; homeDir: string };
  const requests: Array<{ name: string; resolve: (plan: Plan) => void; reject: (error: Error) => void }> = [];
  const bridge = { planNewDir: ({ name }: { name: string }) => new Promise<Plan>((resolve, reject) => { requests.push({ name, resolve, reject }); }) };
  let currentBridge: typeof bridge | undefined = bridge;
  const getBridge = () => currentBridge;
  function Probe({ name }: { name: string }) { return useNewSiteDir({ name }, { getBridge }); }
  const root = createRoot(dom.window.document.getElementById('root')!);
  t.after(() => {
    act(() => root.unmount()); dom.window.close();
    for (const [key, descriptor] of saved) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  });
  act(() => root.render(createElement(Probe, { name: 'Corner Bakery' })));
  assert.equal(dom.window.document.body.textContent, 'Checking website destination…');
  await act(async () => { requests[0]!.resolve({ path: '/Users/la/Documents/Tovu/sites/corner-bakery', homeDir: '/Users/la' }); });
  assert.equal(dom.window.document.body.textContent, 'Creates ~/Documents/Tovu/sites/corner-bakery');
  act(() => root.render(createElement(Probe, { name: 'Second name' })));
  assert.equal(dom.window.document.body.textContent, 'Checking website destination…');
  act(() => root.render(createElement(Probe, { name: 'Third name' })));
  await act(async () => { requests[2]!.resolve({ path: '/Volumes/Work/sites/third-name-3', homeDir: '/Users/la' }); });
  await act(async () => { requests[1]!.resolve({ path: '/Users/la/Documents/Tovu/sites/second-name', homeDir: '/Users/la' }); });
  assert.equal(dom.window.document.body.textContent, 'Creates /Volumes/Work/sites/third-name-3');
  act(() => root.render(createElement(Probe, { name: 'Windows name' })));
  await act(async () => { requests[3]!.resolve({ path: 'C:\\Users\\la\\Documents\\Tovu\\sites\\windows-name', homeDir: 'C:\\Users\\la' }); });
  assert.equal(dom.window.document.body.textContent, 'Creates ~\\Documents\\Tovu\\sites\\windows-name');
  act(() => root.render(createElement(Probe, { name: 'Unavailable' })));
  const message = 'Sites home volume is unavailable: /Volumes/Work/sites. Mount it or choose a local folder in Sites settings.';
  await act(async () => { requests[4]!.reject(new Error("Error invoking remote method 'runner:sites:plan-new-dir': Error: " + message)); });
  assert.equal(dom.window.document.body.textContent, message);
  act(() => root.render(createElement(Probe, { name: 'Stale failure' })));
  act(() => root.render(createElement(Probe, { name: 'Latest' })));
  await act(async () => { requests[6]!.resolve({ path: '/Users/la/Documents/Tovu/sites/latest', homeDir: '/Users/la' }); });
  await act(async () => { requests[5]!.reject(new Error('An old planning error')); });
  assert.equal(dom.window.document.body.textContent, 'Creates ~/Documents/Tovu/sites/latest');
  assert.deepEqual(requests.map(({ name }) => name), ['Corner Bakery', 'Second name', 'Third name', 'Windows name', 'Unavailable', 'Stale failure', 'Latest']);
  currentBridge = undefined;
  act(() => root.render(createElement(Probe, { name: 'Missing bridge' })));
  assert.equal(dom.window.document.body.textContent, 'Website destination is unavailable in this desktop version.');
});
