/**
 * @file Coverage for `expanded-mode.ts` — immersive mode's decision rules.
 *
 * `useExpandedMode` itself calls `useState`, so it cannot be invoked here: this package has no
 * React renderer at all (no jsdom, no testing-library, no react-test-renderer) and calling a hook
 * outside a component render throws "Invalid hook call". `use-site-rename.hooks.test.ts`'s header
 * records the empirical verification of that against this exact React 19 install. So every rule
 * the hook and `App`'s JSX apply is a plain function in `expanded-mode.ts`, and every test below
 * calls one of those with real inputs and asserts an exact output. Nothing here asserts against
 * source text.
 *
 * The failure mode these tests exist for is not a wrong pixel. Expanded mode hides the top nav and
 * the tab strip — every piece of navigation Tovu has — so a rule that lets the mode stay on while
 * nothing is left to exit from leaves the operator staring at a window with no way out. The exit
 * invariant at the bottom of this file is the one that catches that.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { deriveSitesHomeView } from './App.hooks.js';
import {
  COLLAPSE_KEY,
  chromeVisibility,
  expandedAfterKeyDown,
  expandedAfterWorkspaceChange,
  nextExpanded,
  workspaceOnScreen,
} from './expanded-mode.js';
import type { SiteRecord } from '../contracts/project.js';

/** A `SiteRecord` stand-in: nothing under test here reads anything but `id`. */
function site(id: string): SiteRecord {
  return { id, status: 'running' } as unknown as SiteRecord;
}

const BOTH = [false, true] as const;

// ---------------------------------------------------------------------------------------------
// nextExpanded — the workspace bar's toggle
// ---------------------------------------------------------------------------------------------

test('the toggle expands from collapsed', () => {
  assert.equal(nextExpanded(false), true);
});

test('the toggle collapses from expanded', () => {
  assert.equal(nextExpanded(true), false);
});

test('the toggle round-trips from either starting state', () => {
  // The button is one control with two jobs, so "expand" and "exit full window" are the same
  // click. Two of them has to land back where it started, from both directions.
  for (const start of BOTH) {
    assert.equal(nextExpanded(nextExpanded(start)), start, `start=${start}`);
  }
});

// ---------------------------------------------------------------------------------------------
// expandedAfterKeyDown — Escape
// ---------------------------------------------------------------------------------------------

test('the collapse key is exactly the DOM key name, not a label', () => {
  // `KeyboardEvent.key` reports "Escape". "Esc" is the legacy IE/Edge spelling and is what this
  // would silently degrade to if it were ever written from the tooltip text ("Esc") instead.
  assert.equal(COLLAPSE_KEY, 'Escape');
});

test('Escape collapses expanded mode', () => {
  assert.equal(expandedAfterKeyDown(true, 'Escape'), false);
});

test('Escape while already collapsed is a no-op, not a toggle', () => {
  // The listener is only attached while expanded, but the rule must hold on its own: an Escape
  // that re-expanded would turn the one documented exit into a way back IN.
  assert.equal(expandedAfterKeyDown(false, 'Escape'), false);
});

test('repeated Escape stays collapsed', () => {
  assert.equal(expandedAfterKeyDown(expandedAfterKeyDown(true, 'Escape'), 'Escape'), false);
});

test('every other key leaves the mode exactly as it was, from both states', () => {
  for (const key of ['Esc', 'escape', 'ESCAPE', 'Enter', 'Tab', ' ', 'a', 'ArrowDown', 'Backspace']) {
    for (const expanded of BOTH) {
      assert.equal(expandedAfterKeyDown(expanded, key), expanded, `key=${key} expanded=${expanded}`);
    }
  }
});

// ---------------------------------------------------------------------------------------------
// expandedAfterWorkspaceChange — the mode must not outlive its workspace
// ---------------------------------------------------------------------------------------------

test('losing the project tab collapses expanded mode', () => {
  // Closing the tab, deleting the project, or `desktop.navigate` moving the nav elsewhere. Staying
  // expanded through any of them hides the chrome with nothing immersed in it.
  assert.equal(expandedAfterWorkspaceChange(true, false), false);
});

test('expanded mode survives as long as the project tab is still showing', () => {
  assert.equal(expandedAfterWorkspaceChange(true, true), true);
});

test('a project tab appearing does NOT expand on its own', () => {
  // The rule only ever collapses. Opening a project must not drop the operator into a window with
  // no navigation they never asked for.
  assert.equal(expandedAfterWorkspaceChange(false, true), false);
  assert.equal(expandedAfterWorkspaceChange(false, false), false);
});

// ---------------------------------------------------------------------------------------------
// chromeVisibility — what expanded mode hides
// ---------------------------------------------------------------------------------------------

test('entering expanded mode hides both the top nav and the tab strip', () => {
  // The same state, once collapsed and once expanded: the only difference is the mode, and both
  // pieces of chrome go.
  const state = { inSites: true, appearanceOpen: false };
  assert.deepEqual(chromeVisibility({ ...state, expanded: false }), {
    showTopNav: true,
    showTabStrip: true,
  });
  assert.deepEqual(chromeVisibility({ ...state, expanded: true }), {
    showTopNav: false,
    showTabStrip: false,
  });
});

test('expanded mode hides the top nav in every section, appearance open or not', () => {
  for (const inSites of BOTH) {
    for (const appearanceOpen of BOTH) {
      const chrome = chromeVisibility({ expanded: true, inSites, appearanceOpen });
      assert.equal(chrome.showTopNav, false, `inSites=${inSites} appearanceOpen=${appearanceOpen}`);
      assert.equal(chrome.showTabStrip, false, `inSites=${inSites} appearanceOpen=${appearanceOpen}`);
    }
  }
});

test('collapsed, the top nav shows in every section', () => {
  for (const inSites of BOTH) {
    for (const appearanceOpen of BOTH) {
      const chrome = chromeVisibility({ expanded: false, inSites, appearanceOpen });
      assert.equal(chrome.showTopNav, true, `inSites=${inSites} appearanceOpen=${appearanceOpen}`);
    }
  }
});

test('the tab strip keeps its two pre-existing rules when nothing is expanded', () => {
  // Tabs are a Projects mechanic, and Appearance layers over the whole content area. Expanded mode
  // was added on top of both; it did not replace either.
  const collapsed = (inSites: boolean, appearanceOpen: boolean) =>
    chromeVisibility({ expanded: false, inSites, appearanceOpen }).showTabStrip;
  assert.equal(collapsed(true, false), true);
  assert.equal(collapsed(false, false), false, 'outside Projects');
  assert.equal(collapsed(true, true), false, 'Appearance is over it');
  assert.equal(collapsed(false, true), false);
});

// ---------------------------------------------------------------------------------------------
// workspaceOnScreen — where the exit lives
// ---------------------------------------------------------------------------------------------

test('the visible project is on screen; its open siblings are not', () => {
  const at = (projectId: string) =>
    workspaceOnScreen({ inSites: true, projectId, visibleWorkspaceId: 'site-b' });
  assert.equal(at('site-b'), true);
  assert.equal(at('site-a'), false);
  assert.equal(at('site-c'), false);
});

test('nothing is on screen when no workspace is the visible one', () => {
  for (const projectId of ['site-a', 'site-b']) {
    assert.equal(workspaceOnScreen({ inSites: true, projectId, visibleWorkspaceId: null }), false);
  }
});

test('no workspace is on screen outside Projects, even one whose id still matches', () => {
  // `visibleWorkspaceId` is derived and already accounts for this; asserting it here too is what
  // stops the section check being quietly dropped as redundant.
  assert.equal(
    workspaceOnScreen({ inSites: false, projectId: 'site-b', visibleWorkspaceId: 'site-b' }),
    false,
  );
});

// ---------------------------------------------------------------------------------------------
// The exit invariant: expanded mode never leaves the operator without a visible way out
// ---------------------------------------------------------------------------------------------

test('whenever expanded mode can stay on, exactly one workspace — and its bar — is on screen', () => {
  // The whole point. Expanded mode hides the top nav and the tab strip, so the workspace bar
  // (rendered inside the workspace section, `App.tsx`'s `SiteWorkspace`) is the only chrome left
  // and therefore the only exit. This walks every combination of the state `App` derives its view
  // from and checks the two halves agree: if `expandedAfterWorkspaceChange` lets the mode stay on,
  // some project must satisfy `workspaceOnScreen`.
  const projects = [site('site-a'), site('site-b')];
  let staysExpanded = 0;

  for (const activeId of ['projects', 'tasks'] as const) {
    for (const activeTab of [null, 'site-a', 'site-b', 'site-gone']) {
      for (const openTabs of [[], ['site-a'], ['site-a', 'site-b']]) {
        const view = deriveSitesHomeView({
          activeId,
          appearanceOpen: false,
          activeTab,
          openTabs,
          projects,
          isCreating: false,
        });
        if (!expandedAfterWorkspaceChange(true, view.showSiteTab)) continue;
        staysExpanded += 1;
        const onScreen = view.openSites.filter((project) =>
          workspaceOnScreen({
            inSites: view.inSites,
            projectId: project.id,
            visibleWorkspaceId: view.visibleWorkspaceId,
          }),
        );
        assert.equal(
          onScreen.length,
          1,
          `no single visible exit for activeId=${activeId} activeTab=${activeTab} openTabs=[${openTabs}]`,
        );
      }
    }
  }

  // A guard on the guard: if the loop above ever stopped producing expanded-capable states, every
  // assertion inside it would vacuously pass and this test would go green while checking nothing.
  assert.ok(staysExpanded >= 3, `expected several expanded-capable states, got ${staysExpanded}`);
});

test('opening Appearance takes the workspace away, and the top nav with it — but not the exit', () => {
  // The one state where the invariant above does not hold: `showSiteTab` stays true (so expanded
  // mode survives) while `visibleWorkspaceId` goes null, so the bar is gone. It is not a stranding
  // and it is not reachable in practice — `openAppearance` is only callable from the top nav's
  // Settings dropdown, which expanded mode has already hidden, and `AppearancePage` renders its own
  // "← Back" button regardless. Asserted so that a future path INTO Appearance from expanded mode
  // has to come past this comment.
  const view = deriveSitesHomeView({
    activeId: 'projects',
    appearanceOpen: true,
    activeTab: 'site-a',
    openTabs: ['site-a'],
    projects: [site('site-a')],
    isCreating: false,
  });
  assert.equal(view.showSiteTab, true, 'the tab is still the active one');
  assert.equal(view.visibleWorkspaceId, null, 'but Appearance is over its workspace');
  assert.equal(expandedAfterWorkspaceChange(true, view.showSiteTab), true);
  assert.equal(
    workspaceOnScreen({ inSites: view.inSites, projectId: 'site-a', visibleWorkspaceId: view.visibleWorkspaceId }),
    false,
  );
});
