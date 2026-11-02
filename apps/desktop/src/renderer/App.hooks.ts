/**
 * Custom hooks pulled out of `App.tsx`.
 *
 * Most of this is stateful/effectful logic that used to live inline inside `App()` or one of its
 * child components — polling, subscriptions, and view state. Splitting it out of the components is
 * what let `App()` and `SiteGrid` drop back under the complexity ceiling without changing what
 * either one does; see the header comment in `eslint.config.mjs` for why that ceiling exists. This
 * file carries no JSX and no rendering decisions of its own — those stay in `App.tsx`, unchanged
 * in shape.
 *
 * The plain functions mixed in here (`deriveSitesHomeView`, `computeCanCreate`,
 * `buildCreateProjectInput`, `siteSlug`) are deliberately NOT hooks. Each is a rule that used to
 * be inlined into a hook body, pulled out to where it can be called with an object and asserted
 * against directly — no React, no component, no hook harness. `countRunningSites`, `navLinkClick`,
 * `settingsControlHandlers` and `startThenNotify` are the same kind of thing pulled out of
 * `App.tsx`'s component bodies instead, so those components define no functions of their own. When something in this file can be
 * a pure function, it should be one; the hooks around them exist for the state and the effects
 * they genuinely need.
 *
 * Components take these hooks as props with the real hook as the default (see `App`,
 * `SiteGrid`, `CreateWebsiteOnboarding`), so a test can substitute a stub without the component
 * reaching for IPC, timers, or window listeners. The prop is always the hook FUNCTION, never its
 * result — a default of `useFoo()` would only run when the caller omits the prop, which makes hook
 * order depend on the call site. Biome's `correctness/useHookAtTopLevel` runs at error severity in
 * `npm run lint` and catches exactly that mistake.
 *
 * Each hook family now lives in its own module (`use-<thing>.hooks.ts`, plus the pure
 * `sites-home-view.ts` and the shared `bridge-lookup.ts` type); this file only re-exports them
 * under their original names so every existing `./App.hooks.js` import keeps working unchanged.
 */
export type { BridgeLookup } from './bridge-lookup.js';
export { countRunningSites, useApplySiteRecord, useSiteRescan, useSitesPolling } from './use-sites-inventory.hooks.js';
export { navLinkClick, useRunnerNavigation, useSectionNav, type SectionNavState } from './use-section-nav.hooks.js';
export { useProjectTabs, type ProjectTabsState } from './use-project-tabs.hooks.js';
export { useProjectMutations, type SiteMutationsState } from './use-project-mutations.hooks.js';
export { appPresentation, deriveSitesHomeView, type SitesHomeView } from './sites-home-view.js';
export { useExpandedMode } from './use-expanded-mode.hooks.js';
export {
  menuFocusIndex,
  settingsControlHandlers,
  useDismissibleDropdown,
  useMenuKeyboard,
  type SettingsControlHandlers,
} from './use-dropdown-menu.hooks.js';
export { useDeleteConfirmation } from './use-delete-confirmation.hooks.js';
export { performSiteStart, startThenNotify, useSiteStart, type SiteStartResult } from './use-site-start.hooks.js';
export { useWebviewLoadFailure } from './use-webview-load-failure.hooks.js';
export { useWorkspaceChatTransport } from './use-workspace-chat-transport.hooks.js';
export {
  useConversationDeleteConfirmation,
  useRunnerConversations,
  type ConversationDeleteConfirmationState,
  type UseRunnerConversations,
} from './use-runner-conversations.hooks.js';
export {
  buildCreateProjectInput,
  computeCanCreate,
  siteSlug,
  useCreateWebsiteForm,
  type CreateWebsiteFormState,
} from './use-create-website-form.hooks.js';
