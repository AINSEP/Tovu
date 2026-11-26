import { bindSettingsUi, type SettingsUiProps } from "@jini-ai/admin/screens/settings/SettingsUi";
import { useAdminLocale } from "@/hooks/use-admin-locale.hooks";
import { createAdminByokKeyPanelTranslator } from "@jini-ai/admin/shell/components/AdminByokKeyPanel.hooks";
import { resolveAdminByokFooterStatusLine, useWiredAdminExecutionCredential } from "@/hooks/use-admin-execution-credential.hooks";
import { createSettingsTabChange } from "@jini-ai/admin/screens/settings/SettingsUi.hooks";
import { t as tApp } from "../../app-i18n";
import { tSettingsCapabilities as tCapability } from "../../lib/i18n-common";
import { useAdminThemeBoundary } from "../../admin-themes/use-admin-theme.hooks";
import { useTovuSettingsExecution } from "../../hooks/use-tovu-execution-adapters.hooks";
import { useTovuExecutionPolicy } from "../../hooks/use-tovu-execution-policy.hooks";
import { ExecutionTab, InstructionsTab, LanguageTab, MemorySettingsPanel, NotificationsTab, PrivacyTab, SETTINGS_DIALOG_DICTIONARIES } from "@jini-ai/ui";
import { I18nProvider, SettingsDialogShell } from "@jini-ai/admin/react/kit";
import "@jini-ai/ui/settings-dialog.css";
import { DEFAULT_PROVIDER_PRESETS } from "@jini-ai/integrations/media-providers/catalog";
import { ADMIN_LOCALES, DEFAULT_INSTRUCTIONS } from "../../lib/settings-tabs";
import { navigate } from "@jini-ai/admin/shell/lib/router";
import { Workspace } from "../workspace";
import { t as tWorkspace } from "../workspace/workspace-i18n";
import { DEFAULT_EXECUTION_CONFIG } from "../../lib/execution-settings";
import { useWiredSettingsLocaleSync } from "../../integrations/jini-admin/settings-locale-sync.hooks";
import { useSettingsUi } from "./hooks/use-settings-ui.hooks";
import { useSettingsActiveTabScroll } from "@jini-ai/admin/screens/settings/hooks/use-settings-active-tab-scroll.hooks";
import { AdminByokKeyFooter, AdminByokMigrationPrompt, AdminByokSettingsFooter } from "@jini-ai/integrations/react/admin-credentials/AdminByokKeyPanel";
import { TOVU_ADMIN_VERSION } from "../../lib/app-version";
import { createProbeErrorDescriber } from "../../lib/shell-collaborators";
import { SETTINGS_EXECUTION_PRODUCT_VARS } from "../../integrations/jini-admin/settings-execution-copy";
import { useAiAgentPresentation } from "@jini-ai/chat/react/admin-execution/hooks/use-ai-agent-presentation.hooks";
import { isDesktopAdmin, scopeKeys } from "./ai-agent-presentation";
import "@jini-ai/admin/screens/settings/user-interface-settings.css";
import { useUserInterfaceTab } from "./hooks/use-user-interface-tab.hooks";
import { useAdminBrowserAgentSettings, webMcpT } from "../webmcp/browser-agent-settings.hooks";
import { BrowserAgentSettingsPanel } from "@jini-ai/admin/screens/webmcp/BrowserAgentSettingsPanel";

/**
 * @file Admin "Settings (New)" screen — the Open Design settings-dialog port. Markup only.
 *
 * Originally shipped *beside* the SPEC-007 raw ledger browser
 * (`features/settings-raw/Settings.tsx`) — the curated tabbed surface and the raw namespace/key
 * inspector were two views of the same `content.db` store, and for a while the decision on record
 * was that both stay available. `settings-raw/` was later deleted once `/settings` was judged to
 * cover the same rows on its own; this file no longer has a raw-ledger sibling.
 *
 * 9 tabs mounted: AI agent, Instructions, Notifications, Privacy,
 * Language, User Interface, Memory, Workspace, About. The shell is
 * generic over its tab array, so adding more is appending entries to `tabs`
 * below — not restructuring this file. Each ledger-backed tab owns one
 * `useSettingsSlice` instance (its own load, debounce, save chain and diff
 * base); the page chrome renders `mergeSaveStates` over all of them. Memory has no Tovu backend and owns no slice; it mounts
 * its real `@jini-ai/ui` component behind the same
 * `settings-ui-inert-wrap`/`inert` pattern Privacy's telemetry toggles use
 * below, fed an empty/fresh fake port so nothing fabricated is shown. Memory
 * had no ready-made `*Tab` export upstream as of an earlier pass over this
 * file — `MemorySettingsPanel` (composing `MemoryList`/`MemoryHowPanel` with a
 * new header) was built for it; see
 * `packages/ui/src/features/memory/react/components/MemorySettingsPanel.tsx`
 * in Jini for its own doc comment.
 *
 * ## Four tabs LEFT this file on 2026-09-10 (owner-approved nav restructure)
 *
 * MCP server, Media providers, Connectors and External MCP are no longer here.
 * They were never "settings" in the sense the remaining tabs above are — three of them
 * configure an outside service with a credential, and the fourth exposes this
 * install to an MCP client — so they moved out to top-level nav rows instead
 * of tabs an operator had to know to look for behind Settings. Where they
 * landed moved again the same day (second pass, also owner-approved) — this
 * comment describes the CURRENT, final destination:
 *
 * - MCP server  -> `features/providers/Providers.tsx`, "MCP Server" tab (moved there from its own
 *                  short-lived `features/integrations/DeveloperApi.tsx` page, now deleted — see
 *                  `panels.tsx`'s comment on the `providers`/`integrations` panels for why).
 * - Connectors  -> removed 2026-09-27; Composio is now the `composio` agent plugin.
 * - External MCP -> `features/providers/Providers.tsx`, "External MCP" tab.
 * - Media providers -> DELETED outright from here, not moved. It was an `inert` mount over
 *   `createFakeMediaProvidersPort()` under a note reading "Tovu doesn't have a media-provider
 *   backend yet" — a claim that stopped being true once the REAL, persisted Media providers tab
 *   existed. That real tab passed through `features/providers/Providers.tsx` briefly (first pass)
 *   before landing on `features/media/Media.tsx`'s own "External Providers" tab (second pass, where
 *   it lives now) — backed by `media-providers-port.ts` -> `api.getMediaProviders()` and the
 *   `media_provider_credentials` table throughout. Keeping a second, non-functional copy of a
 *   shipped screen would have been the more confusing outcome, and `features/security/rules.ts`
 *   deep-links the media-provider credential store to the real one.
 *
 * `providers`, now labelled "Integrations", is one row under the "Add-Ons" nav group — renamed back
 * from "Integrations" the same day (the group's OWN name and its `providers` row's name briefly
 * collided once the row absorbed the retired `integrations` panel's tabs — see `panels.tsx`'s own
 * group comment for the full rename history).
 *
 * `ExternalMcpSettingsPanel.tsx` and its rules/i18n/hook files still physically live in THIS folder — see
 * `features/providers/hooks/use-providers.hooks.ts` for why moving that file set is a deliberate
 * follow-up rather than part of the restructure.
 *
 * ## One tab ARRIVED here the same day: Workspace
 *
 * `"workspace"`, mounting `features/workspace/Workspace.tsx` verbatim (SPEC-044) — the opposite
 * direction of the moves above, and a different feature folder entirely, not one being absorbed.
 * `Workspace.tsx` used to be its own top-level `/admin/workspace` route+nav row; SPEC-044 shipped it
 * that way because placement (standalone entry vs Settings tab) was its own recorded open question,
 * OQ-04, deliberately left for later since either answer satisfies every REQ/AC unchanged. The owner
 * has now resolved OQ-04: tab. `panels.tsx`'s own comment on the retired `workspace` panel has the
 * redirect/nav-row mechanics; this file only owns the mount.
 *
 * The screen itself kept its state, fetch, save, and error handling exactly as they already worked —
 * `rules.ts`, `workspace-i18n.ts`, and its hooks are untouched, self-contained via its own
 * `useWiredWorkspace()` (not one of this file's `useSettingsSlice` mounts below — Workspace talks to
 * `/api/admin/v1/workspaces/:id` directly, a different ledger entirely from the `core.*` namespace
 * every other tab here reads). The tab's own label/title/subtitle reuse `workspace-i18n.ts`'s
 * existing `"Workspace"` / description strings (already translated across all 21 admin locales)
 * rather than re-translating the same words into a second dictionary.
 *
 * `Workspace.tsx` gained exactly one addition for this mount: `showPageHeader={false}` below. Every
 * other tab's `panel` here is a bare widget with no header of its own, because `SettingsDialogShell`
 * already renders one from this tab's `title`/`subtitle` fields — `Workspace.tsx` renders its OWN
 * `.page-header` too (kicker, title, description) when used at its standalone route, so mounting it
 * verbatim here first shipped with a doubled "Workspace" heading (the shell's chrome, then
 * `Workspace.tsx`'s own underneath it) before this prop existed. See `WorkspaceProps.showPageHeader`
 * for the full reasoning, including why this suppresses the whole header block rather than only the
 * `<h1>` the way `ExternalMcpSettingsPanel.tsx`'s own `showTitle` does for the same class of problem
 * on the Providers screen.
 *
 * This screen mounts `SettingsDialogShell` exactly once, inline (`onClose`
 * omitted — `SettingsDialogShell` treats that prop as its modal/inline
 * switch, and omitting it renders inline with no close affordance). A second,
 * modal mount used to sit beside it, opened by an "Open as dialog" button in
 * this page's own chrome; the owner never wanted that overlay, so it and the
 * button that opened it were removed 2026-09-19 (`s.modalOpen`/
 * `s.setModalOpen` went with them — see `use-settings-ui.hooks.ts`'s header).
 *
 * State, effects, and API/port setup live in `hooks/use-settings-ui.hooks.ts` (the seven
 * `useSettingsSlice` mounts, the fake ports/dependencies, and the merged save status) and
 * `hooks/use-settings-locale-sync.hooks.ts` (the `I18nProvider` locale bridge). Pure computation —
 * the loading gate, the first load error, the save-status label, and the dialog theme mapping —
 * lives in `rules.ts`. What stays here is the 9-tab `SettingsDialogTab[]` array (JSX per tab) and
 * the shell mounts.
 */

export const hooks: SettingsUiProps["hooks"] = {
  useAdminThemeBoundaryHook: useAdminThemeBoundary,
  useSettingsUiHook: useSettingsUi,
  useSettingsActiveTabScrollHook: useSettingsActiveTabScroll,
  useSettingsLocaleSyncHook: useWiredSettingsLocaleSync,
  useSettingsExecutionHook: useTovuSettingsExecution,
  useExecutionPolicy: useTovuExecutionPolicy,
  useAiAgentPresentationHook: useAiAgentPresentation,
  useAdminExecutionCredentialHook: useWiredAdminExecutionCredential,
  useAdminLocale, useUserInterfaceTab, useAdminBrowserAgentSettings,
};

const aboutVersion = `Tovu Admin ${TOVU_ADMIN_VERSION}`;

export const kit: SettingsUiProps["kit"] = {
  BrowserAgentSettingsPanel,
  I18nProvider,
  SettingsDialogShell: ({ activeTabId, ...props }) => <SettingsDialogShell {...props} {...(activeTabId === undefined ? {} : { activeTabId })} />,
  ExecutionTab: ({ localCliUnavailableReason, apiKeyPlaceholder, ...props }) => <ExecutionTab {...props}
    {...(localCliUnavailableReason === undefined ? {} : { localCliUnavailableReason })}
    {...(apiKeyPlaceholder === undefined ? {} : { apiKeyPlaceholder })} />,
  InstructionsTab, NotificationsTab, PrivacyTab, LanguageTab, MemorySettingsPanel, Workspace,
/**
 * About tab body: version only, no updater surface.
 *
 * Deliberately NOT `@jini-ai/ui`'s own `AboutTab`, even though the dispatch
 * table names it as the drop-in to use. Reason, found while wiring it up:
 * `AboutTab`'s update-status row always renders `t(control.statusKey)`,
 * and every branch of `deriveAboutUpdateControl` (ui-core) sets `statusKey`
 * to a semantic dictionary id like `settings.updateStatusUnsupported` — never
 * to literal English, unlike this file's own tab labels. There is no
 * `UpdaterModel` state that produces a null status text, and
 * `showReleaseLink` is `true` in every reachable static state, so "omit the
 * updater surface entirely" (the dispatch's own instruction) cannot be done
 * through `AboutTab`'s props at all. Composing a minimal panel instead is
 * the smallest change that actually satisfies "version info only, no
 * updater" rather than papering over the raw-key display. Worth fixing
 * upstream: `ABOUT_UPDATE_KEYS` has no literal-English fallback path the way
 * every other tab's default labels do.
 *
 * Takes `t` as a prop rather than calling `useT()` itself: this module-scope
 * function isn't a descendant of the `I18nProvider` mounted in `SettingsUi`'s
 * own return value below (a component is never inside the context tree it
 * renders), so a `useT()` call here would silently resolve to context.tsx's
 * passthrough default instead of the real dictionary. See the `const t = ...`
 * comment inside `SettingsUi` for the full explanation.
 *
 * @complexity O(1) — fixed-shape render, no iteration, no branching.
 * @overallScore 100 — no branches, no I/O, no state.
 */
  AboutPanel: ({ t, tCap }) => (
    <section className="jini-settings-section">
      <div className="jini-settings-section-card">
        <div className="jini-field">
          <span className="jini-field-label">{t("Version")}</span>
          <strong>{aboutVersion}</strong>
        </div>
        <p className="jini-hint">
          {tCap({ key: "Tovu is a server CMS — new versions ship with a deployment, not an in-app updater." })}
        </p>
      </div>
    </section>
  ),
  AdminByokMigrationPrompt, AdminByokKeyFooter, AdminByokSettingsFooter,
};

export const deps: SettingsUiProps["deps"] = {
  createAdminByokKeyPanelTranslator,
  SETTINGS_DIALOG_DICTIONARIES, ADMIN_LOCALES, DEFAULT_INSTRUCTIONS, DEFAULT_EXECUTION_CONFIG,
  tApp, tCapability, tWorkspace, navigate, createSettingsTabChange, DEFAULT_PROVIDER_PRESETS,
  isDesktopAdmin, defaultLocalAgentId: "claude", scopeKeys,
  SETTINGS_EXECUTION_PRODUCT_VARS, createProbeErrorDescriber, resolveAdminByokFooterStatusLine,
  webMcpT,
  memoryUnavailableNote: "Tovu's assistant doesn't persist extracted facts across conversations yet — that's separate from chat history, which does persist. The control below is shown for reference and disabled until it does.",
  localCliDataAttribute: "data-tovu-local-cli",
  legacySkillsPath: "/addons/skills",
  legacyAppearancePath: "/admin-ui?tab=appearance",
  now: () => Date.now(),
};

export const SettingsUi = bindSettingsUi({ hooks, kit, deps });
