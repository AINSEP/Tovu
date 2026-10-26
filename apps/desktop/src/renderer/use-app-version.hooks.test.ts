/** Owner 2026-10-09: version loading belongs in the hook, with DI fakes and no module mocks. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import type { RunnerAppVersionBridge } from '../contracts/app-version.js';
import type { AppVersionState, useAppVersion } from './use-app-version.hooks.js';
import { elements, hookHarness, sourceFunction } from './source-test-harness.js';

function versionHook(bridge?: Partial<RunnerAppVersionBridge>) {
  const harness = hookHarness();
  const hook: typeof useAppVersion = sourceFunction(
    readFileSync(new URL('./use-app-version.hooks.ts', import.meta.url), 'utf8'),
    'useAppVersion',
    { ...harness.bindings, runnerInventoryBridge: () => bridge },
  );
  return { harness, render: (options?: Parameters<typeof useAppVersion>[1]) => harness.render(() => hook({}, options)) };
}

test('the hook loads the exact main-process version once and retains it on rerender', async () => {
  let reads = 0;
  const { harness, render } = versionHook({ getAppVersion: async () => { reads++; return '4.8.2-beta.5'; } });
  try {
    assert.deepEqual(render(), { version: null, error: null });
    await Promise.resolve();
    assert.deepEqual(render(), { version: '4.8.2-beta.5', error: null });
    render();
    assert.equal(reads, 1);
  } finally { harness.cleanup(); }
});

test('missing bridge or a stale preload without getAppVersion leaves the brand usable', () => {
  for (const bridge of [undefined, {}]) {
    const { harness, render } = versionHook(bridge);
    try { assert.deepEqual(render(), { version: null, error: null }); }
    finally { harness.cleanup(); }
  }
});

test('an injected replacement bridge resets stale state and ignores the previous request', async () => {
  let resolveFirst!: (version: string) => void;
  let resolveSecond!: (version: string) => void;
  const first = new Promise<string>((resolve) => { resolveFirst = resolve; });
  const second = new Promise<string>((resolve) => { resolveSecond = resolve; });
  const replacement = { getAppVersion: () => second };
  const { harness, render } = versionHook({ getAppVersion: () => first });
  try {
    render();
    render({ bridge: replacement });
    resolveFirst('2.3.4');
    await Promise.resolve();
    assert.deepEqual(render({ bridge: replacement }), { version: null, error: null });
    resolveSecond('3.4.5');
    await Promise.resolve();
    assert.deepEqual(render({ bridge: replacement }), { version: '3.4.5', error: null });
    assert.deepEqual(render({ bridge: {} }), { version: null, error: null });
  } finally { harness.cleanup(); }
});

test('IPC failure preserves the actual message without inventing a version', async () => {
  const { harness, render } = versionHook({ getAppVersion: async () => { throw new Error('Version IPC unavailable'); } });
  try {
    render();
    await Promise.resolve();
    assert.deepEqual(render(), { version: null, error: 'Version IPC unavailable' });
  } finally { harness.cleanup(); }
});

test('a synchronous bridge failure is contained and its exact text is retained', () => {
  const { harness, render } = versionHook({ getAppVersion: () => { throw 'Version bridge disconnected'; } });
  try { assert.deepEqual(render(), { version: null, error: 'Version bridge disconnected' }); }
  finally { harness.cleanup(); }
});

test('a version request that settles after unmount cannot update state', async () => {
  for (const reject of [false, true]) {
    let resolve!: (version: string) => void;
    let fail!: (error: Error) => void;
    const pending = new Promise<string>((yes, no) => { resolve = yes; fail = no; });
    const { harness, render } = versionHook({ getAppVersion: () => pending });
    render();
    harness.cleanup();
    if (reject) fail(new Error('Late version failure'));
    else resolve('5.6.7');
    await Promise.resolve();
    assert.deepEqual(render(), { version: null, error: null });
  }
});

test('the nav renders the loaded version beneath Tovu in the same brand block', () => {
  const source = readFileSync(new URL('./App.tsx', import.meta.url), 'utf8');
  const topNav = sourceFunction(source, 'TopNav', {
    useAppVersion: () => ({ version: '7.9.3', error: null } satisfies AppVersionState),
    visibleSections: () => [],
    SettingsControl: () => null,
    ResourcesChip: () => null,
  });
  const nodes = elements(topNav({ activeId: 'projects', onSitesHome: true, runningCount: 0, theme: 'system' }));
  const brand = nodes.find((node) => node.props.className === 'topnav__brand');
  assert.ok(brand);
  const text = elements(brand).find((node) => node.props.className === 'topnav__brand-text');
  assert.ok(text);
  const lines = elements(text).slice(1);
  assert.deepEqual(lines.map((node) => [node.props.className, node.props.children]), [
    ['topnav__wordmark', 'Tovu'], ['topnav__version', '7.9.3'],
  ]);
});

test('the nav exposes the real loading error on the brand without displaying a fake version', () => {
  const topNav = sourceFunction(readFileSync(new URL('./App.tsx', import.meta.url), 'utf8'), 'TopNav', {
    useAppVersion: () => ({ version: null, error: 'Version IPC unavailable' } satisfies AppVersionState),
    visibleSections: () => [],
    SettingsControl: () => null,
    ResourcesChip: () => null,
  });
  const nodes = elements(topNav({ activeId: 'projects', onSitesHome: true, runningCount: 0, theme: 'system' }));
  assert.equal(nodes.find((node) => node.props.className === 'topnav__brand')?.props.title, 'Version IPC unavailable');
  assert.equal(nodes.some((node) => node.props.className === 'topnav__version'), false);
});
