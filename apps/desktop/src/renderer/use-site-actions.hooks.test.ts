/**
 * @file Coverage for `use-site-actions.hooks.ts`'s two bridge-backed actions.
 *
 * `useSiteActions` calls no React hook itself — its own doc says so ("no state, two thin
 * wrappers") — so unlike its stateful siblings in this directory (`useSitePreview`,
 * `useSiteRename`) it is callable directly here, with no renderer needed. The one seam it reaches
 * through is `runnerInventoryBridge()`, which reads `window.tovuRunner`; this package has no DOM at
 * all, so these tests install a fake bridge on `globalThis.window` for the duration of each test and
 * restore whatever was there before. This is the same "stand-in for the IPC surface that records its
 * own calls" approach `workspace-chat-transport.test.ts` uses for its fake `RunnerInventoryBridge`,
 * just wired through the global the real hook actually reads instead of a constructor argument.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { useSiteActions } from './use-site-actions.hooks.js';
import type { RunnerInventoryBridge } from './runner-api.js';

interface FakeBridgeOverrides {
  startSite?: (id: string) => Promise<unknown>;
  openSiteExternal?: (input: { siteId: string; view: string }) => Promise<unknown>;
}

interface FakeCalls {
  startSite: string[];
  openSiteExternal: Array<{ siteId: string; view: string }>;
}

// NOT `typeof globalThis & {...}` — the renderer's real DOM lib already declares `window` on
// `typeof globalThis` as non-optional (`Window & typeof globalThis`), so intersecting a second,
// optional `window` onto it merges into that same non-optional shape instead of narrowing it. Going
// through `unknown` first is what actually lets this test model "no `window` at all".
type GlobalWithWindow = { window?: { tovuRunner?: RunnerInventoryBridge } };

/**
 * Installs `overrides` as `window.tovuRunner` for the duration of `run`, restoring whatever
 * `window` held before (nothing, in this package's own test process). Passing `undefined` models
 * "no desktop bridge at all" — a plain `vite preview` or, exactly as here, a test harness — by
 * leaving `window` present but `tovuRunner` absent, matching what `runnerInventoryBridge()` actually
 * sees in that case.
 */
async function withBridge(
  overrides: FakeBridgeOverrides | undefined,
  run: (calls: FakeCalls) => Promise<void>,
): Promise<void> {
  const calls: FakeCalls = { startSite: [], openSiteExternal: [] };
  const g = globalThis as unknown as GlobalWithWindow;
  const hadWindow = Object.prototype.hasOwnProperty.call(g, 'window');
  const previousWindow = g.window;

  if (overrides === undefined) {
    g.window = {};
  } else {
    const fakeBridge = {
      startSite: (id: string) => {
        calls.startSite.push(id);
        return overrides.startSite ? overrides.startSite(id) : Promise.resolve(undefined);
      },
      openSiteExternal: (input: { siteId: string; view: string }) => {
        calls.openSiteExternal.push(input);
        return overrides.openSiteExternal ? overrides.openSiteExternal(input) : Promise.resolve(undefined);
      },
    } as unknown as RunnerInventoryBridge;
    g.window = { tovuRunner: fakeBridge };
  }

  try {
    await run(calls);
  } finally {
    if (hadWindow) g.window = previousWindow;
    else delete g.window;
  }
}

test('with no desktop bridge at all, both actions resolve the SAME operator-facing refusal, without throwing', async () => {
  await withBridge(undefined, async () => {
    const actions = useSiteActions();
    assert.equal(await actions.startSite('site-1'), 'The desktop bridge is unavailable.');
    assert.equal(await actions.openInBrowser('site-1'), 'The desktop bridge is unavailable.');
  });
});

test('startSite calls bridge.startSite with the given id and resolves null on success', async () => {
  await withBridge({}, async (calls) => {
    const actions = useSiteActions();
    assert.equal(await actions.startSite('site-42'), null);
    assert.deepEqual(calls.startSite, ['site-42']);
  });
});

test('openInBrowser calls bridge.openSiteExternal with the PUBLIC site view, not the admin', async () => {
  await withBridge({}, async (calls) => {
    const actions = useSiteActions();
    assert.equal(await actions.openInBrowser('site-7'), null);
    // `view: 'site'` is load-bearing: a card has no "current surface" the way the workspace bar's
    // own open-in-browser does, and "open in browser" from a card means the PUBLIC website.
    assert.deepEqual(calls.openSiteExternal, [{ siteId: 'site-7', view: 'site' }]);
  });
});

test('startSite surfaces a rejected Error message verbatim, not a re-wrapped string', async () => {
  await withBridge({ startSite: () => Promise.reject(new Error('daemon offline')) }, async () => {
    const actions = useSiteActions();
    assert.equal(await actions.startSite('site-1'), 'daemon offline');
  });
});

test('openInBrowser surfaces a rejected Error message verbatim', async () => {
  await withBridge({ openSiteExternal: () => Promise.reject(new Error('no default browser registered')) }, async () => {
    const actions = useSiteActions();
    assert.equal(await actions.openInBrowser('site-1'), 'no default browser registered');
  });
});

test('a non-Error rejection is coerced with String(), not left as [object Object]', async () => {
  await withBridge({ startSite: () => Promise.reject('offline') }, async () => {
    const actions = useSiteActions();
    assert.equal(await actions.startSite('site-1'), 'offline');
  });
});
