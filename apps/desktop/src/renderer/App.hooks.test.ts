/**
 * @file `App.hooks.ts` is now a barrel: each hook family lives in its own `use-<thing>.hooks.ts`
 * (plus `sites-home-view.ts`), and their behaviour is tested beside each one. What is left to pin
 * here is the barrel's own contract — every name it exported before the split is still exported,
 * and is the very same function its family module exports, so no importer of `./App.hooks.js` can
 * have been handed a stale copy or a wrapper.
 *
 * **How this file runs.** `apps/desktop`'s `test` script is two commands: a bare
 * `node --test "src/*.test.ts" "src/!(renderer|contracts)/**\/*.test.ts"` first, which has no
 * runner for TypeScript imported across a `.js`-specifier boundary (see `folder-drop.ts`'s own
 * header for why); that is why every renderer test before this one was a source-text assertion (see
 * `rescan-wiring.test.ts`'s own header). This file, living under `src/renderer/`, is executed by the
 * second command instead, `node --import tsx --test "src/renderer/**\/*.test.ts" "src/contracts/**\/*.test.ts"`.
 *
 * `tsx` is this package's OWN devDependency, declared at the same `^4.19.3` the repo root declares.
 * It briefly was not: the script worked only because Node resolves a bare specifier by walking up to
 * the root's `node_modules` — an undeclared dependency on the parent tree, in a package whose own
 * header calls itself self-contained. Declared here, `require.resolve` answers
 * `apps/desktop/node_modules/tsx` and the package stands on its own.
 *
 * Co-located `*.test.ts` beside the unit it covers, matching this package's existing `*.test.cjs`
 * convention rather than the repo-wide `__tests__/unit/` layout.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import * as barrel from './App.hooks.js';
import * as createForm from './use-create-website-form.hooks.js';
import * as deleteConfirmation from './use-delete-confirmation.hooks.js';
import * as dropdownMenu from './use-dropdown-menu.hooks.js';
import * as expandedMode from './use-expanded-mode.hooks.js';
import * as projectMutations from './use-project-mutations.hooks.js';
import * as projectTabs from './use-project-tabs.hooks.js';
import * as runnerConversations from './use-runner-conversations.hooks.js';
import * as sectionNav from './use-section-nav.hooks.js';
import * as siteStart from './use-site-start.hooks.js';
import * as sitesHomeView from './sites-home-view.js';
import * as sitesInventory from './use-sites-inventory.hooks.js';
import * as webviewLoadFailure from './use-webview-load-failure.hooks.js';
import * as workspaceChatTransport from './use-workspace-chat-transport.hooks.js';

/** Every runtime (non-type) name `App.hooks.ts` exported before the split, by its new home. */
const HOMES: Record<string, Record<string, unknown>> = {
  useSitesPolling: sitesInventory, useSiteRescan: sitesInventory, useApplySiteRecord: sitesInventory, countRunningSites: sitesInventory,
  useRunnerNavigation: sectionNav, useSectionNav: sectionNav, navLinkClick: sectionNav,
  useProjectTabs: projectTabs,
  useProjectMutations: projectMutations,
  deriveSitesHomeView: sitesHomeView, appPresentation: sitesHomeView,
  useExpandedMode: expandedMode,
  useDismissibleDropdown: dropdownMenu, menuFocusIndex: dropdownMenu, useMenuKeyboard: dropdownMenu, settingsControlHandlers: dropdownMenu,
  useDeleteConfirmation: deleteConfirmation,
  performSiteStart: siteStart, useSiteStart: siteStart, startThenNotify: siteStart,
  useWebviewLoadFailure: webviewLoadFailure,
  useWorkspaceChatTransport: workspaceChatTransport,
  useRunnerConversations: runnerConversations, useConversationDeleteConfirmation: runnerConversations,
  computeCanCreate: createForm, buildCreateProjectInput: createForm, siteSlug: createForm, useCreateWebsiteForm: createForm,
};

test('the barrel exports exactly the runtime names it exported before the split, and nothing else', () => {
  assert.deepEqual(Object.keys(barrel).sort(), Object.keys(HOMES).sort());
});

test('each re-exported name is the very function its family module exports', () => {
  for (const [name, home] of Object.entries(HOMES)) {
    assert.equal(typeof home[name], 'function', `${name} must be a function in its family module`);
    assert.equal((barrel as Record<string, unknown>)[name], home[name], `${name} must be re-exported, not copied`);
  }
});
