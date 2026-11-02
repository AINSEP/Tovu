/**
 * @file `deriveSitesHomeView` and `appPresentation` run against the real functions. The
 * `appPresentation` case moved from `App.hooks.test.ts` with the split; the `deriveSitesHomeView`
 * cases are new — before the split its only callers in tests were the expanded-mode and
 * error-feedback suites, which exercise a handful of its combinations in passing.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import type { RunnerSectionId } from '../contracts/sections.js';
import type { SiteRecord } from '../contracts/project.js';
import { appPresentation, deriveSitesHomeView } from './sites-home-view.js';

const A = { id: '/a', displayName: 'A' } as unknown as SiteRecord;
const B = { id: '/b', displayName: 'B' } as unknown as SiteRecord;

/** A Projects screen with tabs a and b open, b selected, nothing layered over it. */
const BASE = {
  activeId: 'projects' as RunnerSectionId,
  appearanceOpen: false,
  activeTab: '/b' as string | null,
  openTabs: ['/b', '/a'] as readonly string[],
  projects: [A, B] as readonly SiteRecord[],
  isCreating: false,
};

test("an open tab on Projects shows that site's workspace, in tab order", () => {
  assert.deepEqual(deriveSitesHomeView(BASE), {
    openSites: [B, A], inSites: true, activeSite: B, showSiteTab: true, showSitesHome: false,
    visibleWorkspaceId: '/b', showCreateForm: false,
  });
});

test('a tab whose project vanished between polls is dropped and strands nothing', () => {
  const view = deriveSitesHomeView({ ...BASE, projects: [A] });
  assert.deepEqual(view.openSites, [A]);
  assert.equal(view.activeSite, undefined);
  assert.deepEqual([view.showSiteTab, view.showSitesHome, view.visibleWorkspaceId], [false, true, null]);
});

test('the sites home tab (no active tab) shows the grid, and the create form only while creating', () => {
  const home = deriveSitesHomeView({ ...BASE, activeTab: null });
  assert.deepEqual([home.activeSite, home.showSiteTab, home.showSitesHome, home.showCreateForm], [undefined, false, true, false]);
  assert.equal(deriveSitesHomeView({ ...BASE, activeTab: null, isCreating: true }).showCreateForm, true);
});

test('outside Projects no workspace or create form is reachable, but the tabs stay open', () => {
  const view = deriveSitesHomeView({ ...BASE, activeId: 'agents' as RunnerSectionId, isCreating: true });
  assert.deepEqual([view.inSites, view.showSiteTab, view.showSitesHome, view.visibleWorkspaceId, view.showCreateForm],
    [false, false, true, null, false]);
  assert.deepEqual(view.openSites, [B, A], 'navigating away keeps the same tabs');
  assert.equal(view.activeSite, B);
});

test('Appearance hides the visible workspace and the create form without closing either', () => {
  const overTab = deriveSitesHomeView({ ...BASE, appearanceOpen: true });
  assert.deepEqual([overTab.showSiteTab, overTab.visibleWorkspaceId], [true, null]);
  const overForm = deriveSitesHomeView({ ...BASE, activeTab: null, isCreating: true, appearanceOpen: true });
  assert.equal(overForm.showCreateForm, false);
});

test('a project tab hides the create form even while creating', () => {
  assert.equal(deriveSitesHomeView({ ...BASE, isCreating: true }).showCreateForm, false);
});

// The extraction must keep one routing answer for Find, Zoom, tabs and Add feedback.
// Without the refactor this new boundary is absent; a miswired caller is covered in site-error-feedback.
test('root presentation keeps chrome, guest targets and duplicate-site notices aligned', () => {
  const input = {
    showSiteTab: true, showSitesHome: false, appearanceOpen: false,
    activeTab: '/a', visibleWorkspaceId: '/a', addNotice: { siteId: '/a', message: 'Already tracked.' },
  };
  assert.deepEqual(appPresentation(input), {
    onSitesHome: false, selectedTab: '/a', guestTarget: '/a', tabNotice: 'Already tracked.',
  });
  assert.equal(appPresentation({ ...input, addNotice: { siteId: '/b', message: 'Other site.' } }).tabNotice, undefined);
  assert.equal(appPresentation({ ...input, addNotice: null }).tabNotice, undefined);
  assert.equal(appPresentation({ ...input, addNotice: { siteId: '/a', message: '' } }).tabNotice, '');
  assert.deepEqual(appPresentation({ ...input, showSiteTab: false, showSitesHome: true }), {
    onSitesHome: true, selectedTab: null, guestTarget: null, tabNotice: undefined,
  });
  assert.deepEqual(appPresentation({ ...input, appearanceOpen: true, visibleWorkspaceId: null }), {
    onSitesHome: false, selectedTab: '/a', guestTarget: null, tabNotice: 'Already tracked.',
  });
  assert.equal(appPresentation({ ...input, showSitesHome: true, appearanceOpen: true }).onSitesHome, false);
});
