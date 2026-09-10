/**
 * @file Admin "Settings (New)" screen — the Open Design settings-dialog port. Markup only.
 *
 * Originally shipped *beside* the SPEC-007 raw ledger browser
 * (`features/settings-raw/Settings.tsx`) — the curated tabbed surface and the raw namespace/key
 * inspector were two views of the same `content.db` store, and for a while the decision on record
 * was that both stay available. `settings-raw/` was later deleted once `/settings` was judged to
 * cover the same rows on its own; this file no longer has a raw-ledger sibling.
 *
 * 10 tabs mounted: Execution mode, Instructions, Notifications, Privacy,
 * Dialog appearance, Language, Memory, Skills, Workspace, About. The shell is
 * generic over its tab array, so adding more is appending entries to `tabs`
 * below — not restructuring this file. Each ledger-backed tab owns one
 * `useSettingsSlice` instance (its own load, debounce, save chain and diff
 * base); the page chrome renders `mergeSaveStates` over all of them. Memory
 * and Skills have no Tovu backend at all and so own no slice; both mount
 * their real `@jini-ai/ui` component behind the same
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
 * They were never "settings" in the sense the nine above are — three of them
 * configure an outside service with a credential, and the fourth exposes this
 * install to an MCP client — so they moved out to top-level nav rows instead
 * of tabs an operator had to know to look for behind Settings. Where they
 * landed moved again the same day (second pass, also owner-approved) — this
 * comment describes the CURRENT, final destination:
 *
 * - MCP server  -> `features/providers/Providers.tsx`, "MCP Server" tab (moved there from its own
 *                  short-lived `features/integrations/DeveloperApi.tsx` page, now deleted — see
 *                  `panels.tsx`'s comment on the `providers`/`integrations` panels for why).
 * - Connectors  -> `features/providers/Providers.tsx`, "Composio" tab (relabelled to the vendor's
 *                  own name; "Connectors" told an operator nothing about what they were setting up).
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
 * `ExternalMcpSettingsPanel.tsx`, `ComposioKeyField.tsx`, `connectors-port.ts` and their
 * rules/i18n/hook files still physically live in THIS folder — see
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
 * The screen itself is UNCHANGED — `Workspace.tsx`, `rules.ts`, `workspace-i18n.ts`, and its hooks
 * stayed exactly where they already lived and exactly as they already worked, self-contained via its
 * own `useWiredWorkspace()` (not one of this file's `useSettingsSlice` mounts below — Workspace talks
 * to `/api/admin/v1/workspaces/:id` directly, a different ledger entirely from the `core.*`
 * namespace every other tab here reads). The tab's own label/title/subtitle reuse
 * `workspace-i18n.ts`'s existing `"Workspace"` / description strings (already translated across all
 * 21 admin locales) rather than re-translating the same words into a second dictionary.
 *
 * KNOWN, ACCEPTED COSMETIC CONSEQUENCE: `Workspace.tsx` renders its own `.page-header` (kicker,
 * title, description) — every other tab's `panel` here is a bare widget with no header of its own,
 * because `SettingsDialogShell` already renders one from this tab's `title`/`subtitle` fields. That
 * makes the Workspace tab the one tab in this file with a doubled heading (the shell's chrome, then
 * `Workspace.tsx`'s own). Not fixed here: the task that folded this tab in was explicit that
 * `Workspace.tsx` itself must not be rewritten to fit its new mount, only relocated to it.
 *
 * Both render modes are exercised here on purpose. `SettingsDialogShell`
 * treats `onClose` as the modal/inline switch (omit it and the shell renders
 * inline with no close affordance), so the page view and the modal view are
 * the same component with one prop different.
 *
 * State, effects, and API/port setup live in `hooks/use-settings-ui.hooks.ts` (the six
 * `useSettingsSlice` mounts, the fake ports/dependencies, and the merged save status) and
 * `hooks/use-settings-locale-sync.hooks.ts` (the `I18nProvider` locale bridge). Pure computation —
 * the loading gate, the first load error, the save-status label, and the dialog theme mapping —
 * lives in `rules.ts`. What stays here is the 13-tab `SettingsDialogTab[]` array (JSX per tab) and
 * the shell mounts.
 */

import {
  AppearanceTab,
  ExecutionTab,
  I18nProvider,
  InstructionsTab,
  LanguageTab,
  MemorySettingsPanel,
  NotificationsTab,
  PrivacyTab,
  SETTINGS_DIALOG_DICTIONARIES,
  SettingsDialogShell,
  SkillsTab,
  type ExecutionConfig,
  type MemoryConfigFlagKey,
  type MemoryEntrySummary,
  type MemoryExtractionRecord,
  type MemoryTopTab,
  type NotificationsPreferences,
  type PrivacyConsentState,
  type SettingsDialogTab,
} from "@jini-ai/ui";
import "@jini-ai/ui/settings-dialog.css";
import { agentHandle } from "@jini-ai/agentic";
import { ADMIN_LOCALES, DEFAULT_INSTRUCTIONS, type AppearanceConfig } from "../../lib/settings-tabs";
import { navigate } from "../../lib/router";
import { Workspace } from "../workspace";
import { t as tWorkspace } from "../workspace/workspace-i18n";
import { describeSaveStatus, resolveByokConfig } from "./rules";
import { useWiredSettingsLocaleSync } from "./hooks/use-settings-locale-sync.hooks";
import { useSettingsUi, type SettingsUiController } from "./hooks/use-settings-ui.hooks";
import type { Translate } from "../../lib/dictionary-translator";
import { useWiredAdminExecutionCredential } from "../../hooks/use-admin-execution-credential.hooks";
import { AdminByokKeyFooter, AdminByokMigrationPrompt, AdminByokSettingsFooter } from "../../components/AdminByokKeyPanel";
import { TOVU_ADMIN_VERSION } from "../../lib/app-version";
import { t as tCapability } from "./settings-capabilities-i18n";
import { SETTINGS_DIALOG_DICTIONARIES as CMS_SETTINGS_DIALOG_DICTIONARIES } from "@jini-ai/cms/settings";

/** Shared 16px icon frame, so a tab's glyph can be written as bare path data. */
function TabIcon({ children }: { children: React.ReactNode }) {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5">
      {children}
    </svg>
  );
}

/** Stable empty set for the inert-wrapped `SkillsTab` mount below — the tab
 *  is unusable inside its `inert` wrapper, so this never actually gets
 *  written to; it exists only to satisfy the required prop honestly (no
 *  skill is disabled because no skill can exist yet). */
const EMPTY_DISABLED_SKILL_IDS: ReadonlySet<string> = new Set();

/** Stable empty lists for the inert-wrapped `MemorySettingsPanel` mount below
 *  — Tovu's assistant doesn't extract or persist standing facts yet, so an
 *  empty saved-memory list is the honest state, not a stand-in. Module-level
 *  so `MemoryList` sees the same array reference across renders. */
const EMPTY_MEMORY_ENTRIES: MemoryEntrySummary[] = [];
const EMPTY_MEMORY_EXTRACTIONS: MemoryExtractionRecord[] = [];

/** Every hook shown "on" — matches OD's own default state
 *  (`od-settings-memory-howitworks.png`). Never actually toggled: the whole
 *  panel is `inert`-wrapped below, so this is reference-only, not a claim
 *  that Tovu runs any of these hooks. */
const MEMORY_HOOK_FLAGS: Record<MemoryConfigFlagKey, boolean> = {
  chatExtractionEnabled: true,
  profileEnabled: true,
  rewriteEnabled: true,
  verifyEnabled: true,
};

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
function AboutPanel({ t, tCap }: { t: Translate; tCap: (key: string) => string }) {
  return (
    <section className="jini-settings-section">
      <div className="jini-settings-section-card">
        <div className="jini-field">
          <span className="jini-field-label">{t("Version")}</span>
          <strong>{`Tovu Admin ${TOVU_ADMIN_VERSION}`}</strong>
        </div>
        <p className="jini-hint">
          {tCap("Tovu is a server CMS — new versions ship with a deployment, not an in-app updater.")}
        </p>
      </div>
    </section>
  );
}

/**
 * Bridges the `core.language.locale` setting to the mounted `I18nProvider`'s active locale.
 * Renders nothing; see `hooks/use-settings-locale-sync.hooks.ts` for the full rationale (an
 * uncontrolled `initialLocale` prop that only applies at mount).
 *
 * @complexity O(1) — one equality check per render, no iteration.
 * @overallScore 100
 */
function SettingsLocaleSync({
  locale,
  useSettingsLocaleSyncHook = useWiredSettingsLocaleSync,
}: {
  locale: string;
  /** Dependency injection seam for tests — same convention as `PostsProps.usePostsHook`. */
  useSettingsLocaleSyncHook?: typeof useWiredSettingsLocaleSync;
}) {
  useSettingsLocaleSyncHook({ locale });
  return null;
}

export interface SettingsUiProps {
  /** Dependency injection seam for tests — same convention as `PostsProps.usePostsHook`. */
  useSettingsUiHook?: typeof useSettingsUi;
  /**
   * Dependency injection seam for tests — same convention as `useSettingsLocaleSyncHook` just above.
   * Was an inline `useWiredAdminExecutionCredential({...})` call in the body until this pass; a prop
   * lets a test drive the Execution tab's migration prompt and "Save key" footer (which read straight
   * off this controller) without a real `/api/.../execution-credential` round trip.
   */
  useAdminExecutionCredentialHook?: typeof useWiredAdminExecutionCredential;
  /**
   * The `?tab=` query value from `panels.tsx`'s `settings` route (`URLSearchParams.get` returns
   * `null` when the param is absent). Drives which tab the inline shell opens on — see the
   * `requestedTabId` computation below for why this can't be passed straight through as
   * `SettingsDialogShell`'s `activeTabId`.
   */
  tabId?: string | null;
}

/**
 * Resolves each of `SettingsUi`'s three seam/value props to its default when a caller passes
 * none — same `??`-avoidance idiom `MenuEditor.tsx`'s `orEmpty`/`AssistantDock.tsx`'s/`App.tsx`'s
 * resolver groups use (2026-08-14, DI migration sweep's complexity follow-up): ESLint's
 * cyclomatic-complexity rule counts a default parameter value inside a function's OWN body as one
 * of that function's own branches — a call out to a separately-scoped resolver does not.
 */
function resolveSettingsUiHook(override: typeof useSettingsUi | undefined): typeof useSettingsUi {
  return override ?? useSettingsUi;
}
function resolveSettingsExecutionCredentialHook(
  override: typeof useWiredAdminExecutionCredential | undefined
): typeof useWiredAdminExecutionCredential {
  return override ?? useWiredAdminExecutionCredential;
}
function resolveTabId(override: string | null | undefined): string | null {
  return override ?? null;
}

export function SettingsUi(props: SettingsUiProps) {
  // No `SettingsUiProps = {}` default on the parameter itself (2026-08-14, same reasoning as
  // `App.tsx`'s own removal): every real call site is JSX, which always constructs an actual props
  // object — `{}` when no attributes are given, never `undefined` — and every field here is
  // optional, so `{}` still satisfies the type.
  const useSettingsUiHook = resolveSettingsUiHook(props.useSettingsUiHook);
  const useAdminExecutionCredentialHook = resolveSettingsExecutionCredentialHook(props.useAdminExecutionCredentialHook);
  const tabId = resolveTabId(props.tabId);
  const s: SettingsUiController = useSettingsUiHook();

  /**
   * `SettingsDialogShell` renders `tabs[].label/title/subtitle` verbatim — it only calls `t()` on
   * its own chrome strings (the "Settings" kicker, "Settings sections" aria-label, etc.; see
   * `context.tsx`). Every tab's own label/title/subtitle below is this file's responsibility to
   * translate before handing it to the shell, same as OD's own settings-tab array does upstream.
   *
   * Can't use `@jini-ai/ui`'s `useT()` hook for that: it reads `I18nContext` via `useContext`,
   * which only sees a provider mounted by an ANCESTOR. The `<I18nProvider>` this component renders
   * (below, wrapping `SettingsDialogShell`) is a *child* of `SettingsUi`, not a parent of it — a
   * component is never inside the context it itself provides. Calling `useT()` here would silently
   * hit `useI18n`'s `PASSTHROUGH_CONTEXT` and always return the raw key, with no error to catch it.
   * This inlines the exact same two-step resolution `I18nProvider`'s own `t` uses
   * (`dictionaries?.[locale]?.[key] ?? dictionaries?.[fallbackLocale]?.[key] ?? key`), against the
   * same `SETTINGS_DIALOG_DICTIONARIES` and the same locale value passed as `initialLocale` below —
   * so the visible result is identical to a real context read, without needing one.
   *
   * Third fallback tier added 2026-08-08: the 24 generic tab labels/subtitles (Instructions,
   * Notifications, Privacy, MCP server, Memory, Skills, Version, ...) moved out of `@jini-ai/ui`
   * into `@jini-ai/cms/settings` — see project memory "Settings-dialog i18n relocation". Checking
   * `CMS_SETTINGS_DIALOG_DICTIONARIES` last (not first) costs nothing: the two dictionaries are
   * disjoint key sets, so ordering only matters for the final raw-key fallback.
   */
  const settingsLocale = s.language.value as string;
  const t = (key: string): string =>
    SETTINGS_DIALOG_DICTIONARIES[settingsLocale]?.[key] ??
    SETTINGS_DIALOG_DICTIONARIES.en?.[key] ??
    CMS_SETTINGS_DIALOG_DICTIONARIES[settingsLocale]?.[key] ??
    key;
  /** The 8 "no backend yet" capability-status notes below — see `settings-capabilities-i18n.ts`'s
   *  header for why these live in Tovu's own dictionary rather than `SETTINGS_DIALOG_DICTIONARIES`. */
  const tCap = (key: string): string => tCapability(settingsLocale, key);

  // Called unconditionally, ahead of the loading gate below (rules of hooks) — `resolveByokConfig`
  // falls back to `DEFAULT_EXECUTION_CONFIG.byok` while `s.execution.value` is still `null`, which
  // is harmless: the credential hook's own effects don't read `byok` until an explicit Save/migrate
  // press, and the tab this feeds isn't rendered until past the gate anyway. Pulled out to `rules.ts`
  // (2026-09-04, complexity-ceiling pass) — see `resolveByokConfig`'s own doc comment.
  const adminCredential = useAdminExecutionCredentialHook({
    byok: resolveByokConfig(s.execution.value as ExecutionConfig | null),
    onByokChange: (byok) => s.execution.onChange({ ...(s.execution.value as ExecutionConfig), byok }),
  });

  // Every slice starts `null` and settles independently. Gate on the whole set
  // so tabs don't pop in one at a time as their namespaces resolve.
  if (s.loading) {
    return (
      <div className="settings-ui-section">
        <p className="muted">Loading settings…</p>
      </div>
    );
  }

  const tabs: SettingsDialogTab[] = [
    {
      id: "execution",
      label: t("Execution mode"),
      title: t("Execution mode"),
      subtitle: t("Choose Local CLI or BYOK."),
      icon: (
        <TabIcon>
          <path d="M3 5h3M9 5h6M12 9H9M6 9H3M3 13h7M13 13h2" />
          <circle cx="7.5" cy="5" r="1.6" />
          <circle cx="7.5" cy="9" r="1.6" transform="translate(3 0)" />
          <circle cx="11.5" cy="13" r="1.6" />
        </TabIcon>
      ),
      panel: (
        <>
          <AdminByokMigrationPrompt controller={adminCredential} />
          <ExecutionTab
            config={s.execution.value as ExecutionConfig}
            onConfigChange={s.execution.onChange}
            port={s.port}
            // Detection runs wherever the Tovu SERVER runs, not on the browser's
            // machine. For a deployed CMS those are different computers, so the
            // component's own default ("on this machine") would be a false claim
            // about whose CLIs these are.
            localCliScopeLabel="Detected on the Tovu server, not on your own computer."
            // The admin's own BYOK credential is encrypted server-side and write-only
            // (2026-08-05) — these four keep the shared `ByokProviderForm` honest about
            // that: an empty key field is not a missing value when one is already stored,
            // the masked placeholder answers "which key", and the two footers are the ONLY
            // controls that can persist anything. They write DISJOINT patches — the key
            // footer writes the key, the form footer writes protocol/base URL/model/max
            // tokens — so neither can claim the other's work. See
            // `hooks/use-admin-execution-credential.hooks.ts`.
            apiKeyStoredExternally={adminCredential.apiKeyStoredExternally}
            apiKeyPlaceholder={adminCredential.apiKeyPlaceholder}
            apiKeyFooter={<AdminByokKeyFooter controller={adminCredential} />}
            formFooter={<AdminByokSettingsFooter controller={adminCredential} />}
            agentHandle="settings-execution"
          />
        </>
      ),
    },
    {
      id: "instructions",
      label: t("Instructions"),
      title: t("Custom instructions"),
      subtitle: t("Applied to every assistant conversation in this workspace."),
      icon: (
        <TabIcon>
          <path d="M4 3h10v12H4z" />
          <path d="M6.5 6.5h5M6.5 9h5M6.5 11.5h3" />
        </TabIcon>
      ),
      panel: (
        <InstructionsTab
          value={s.instructions.value as string}
          // The tab reports an all-empty textarea as `undefined` rather than
          // `''`; the slice is typed on the stored shape, which is a string.
          onChange={(next) => s.instructions.onChange(next ?? DEFAULT_INSTRUCTIONS)}
          description="Extra instructions applied to every conversation in this workspace, in addition to any per-request instructions."
          agentHandle="settings-instructions"
        />
      ),
    },
    {
      id: "notifications",
      label: t("Notifications"),
      title: t("Notifications"),
      subtitle: t("How you're told a task finished. Saved per operator, not per workspace."),
      icon: (
        <TabIcon>
          <path d="M9 3a4 4 0 0 0-4 4v3l-1.5 2.5h11L13 10V7a4 4 0 0 0-4-4z" />
          <path d="M7.5 13.5a1.5 1.5 0 0 0 3 0" />
        </TabIcon>
      ),
      panel: (
        <NotificationsTab
          preferences={s.notifications.value as NotificationsPreferences}
          // This tab emits a PATCH, not a whole object (unlike `PrivacyTab`
          // next door, which emits full state). Merging here rather than
          // teaching the slice about patches keeps the slice's diff base and
          // the stored shape the same type.
          onChange={(patch) =>
            s.notifications.onChange({ ...(s.notifications.value as NotificationsPreferences), ...patch })
          }
          agentHandle="settings-notifications"
        />
      ),
    },
    {
      id: "privacy",
      label: t("Privacy"),
      title: t("Privacy"),
      // Not "Choose what this installation shares" — there is nothing to
      // choose yet. See the panel note below.
      subtitle: tCap("Vendor telemetry consent. Not connected to a collection pipeline in Tovu yet."),
      icon: (
        <TabIcon>
          <path d="M9 2.5 14 4.5v4c0 3.2-2.1 6-5 7-2.9-1-5-3.8-5-7v-4z" />
          <path d="M6.75 8.75 8.5 10.5l3-3.25" />
        </TabIcon>
      ),
      /**
       * `core.privacy.telemetry.{metrics,content}` models consent to share
       * anonymous usage data with the *vendor* (this port's origin control).
       * Tovu has no outbound telemetry path at all — no `ForwardingSink`
       * implementation exists anywhere in `src/`, only doc comments saying
       * one will be "built later". Leaving this tab live-but-inert would let
       * an operator believe they are choosing to share (or successfully
       * withholding) data that was never going anywhere either way — the
       * exact "mount for completeness" trap this project's decisions call
       * out. So: the note says so plainly, and `inert` makes the controls
       * genuinely unusable (not just dimmed — `inert` also removes them from
       * focus and keyboard activation, unlike a CSS-only `pointer-events`
       * fake-disable). `PrivacyTab` has no `disabled` prop to plumb this
       * through instead.
       *
       * A separate, real first-party analytics privacy surface
       * (`core.analytics.*` — DNT/GPC, retention, path exclusions) is being
       * built alongside this by another agent. That one is unrelated: it is
       * about Tovu's OWN first-party analytics, not vendor telemetry, and it
       * is NOT this tab.
       */
      panel: (
        <div className="settings-ui-inert-wrap">
          <p className="settings-ui-inert-note" role="note">
            {tCap(
              "Not wired up: this installation has no outbound telemetry pipeline, so nothing is sent regardless of this choice. The control below is shown for reference and disabled until a real collection path exists.",
            )}
          </p>
          <div className="settings-ui-inert-control" inert>
            <PrivacyTab state={s.privacy.value as PrivacyConsentState} onChange={s.privacy.onChange} agentHandle="settings-privacy" />
          </div>
        </div>
      ),
    },
    {
      id: "appearance",
      // Labelled "Dialog appearance", not "Appearance": Tovu already has an
      // Appearance concept (site theming, its own admin section), and two nav
      // entries reading "Appearance" that configure different things is the
      // label collision recon §4 flagged. This one styles the settings surface.
      label: t("Dialog appearance"),
      title: t("Dialog appearance"),
      subtitle: t("Theme and accent color for this settings surface. Saved per operator."),
      icon: (
        <TabIcon>
          <circle cx="9" cy="9" r="6" />
          <path d="M9 3a6 6 0 0 1 0 12z" fill="currentColor" stroke="none" />
        </TabIcon>
      ),
      panel: (
        <AppearanceTab
          theme={(s.appearance.value as AppearanceConfig).theme}
          onThemeChange={(theme) => s.appearance.onChange({ ...(s.appearance.value as AppearanceConfig), theme })}
          accentColor={(s.appearance.value as AppearanceConfig).accentColor}
          onAccentColorChange={(accentColor) =>
            s.appearance.onChange({ ...(s.appearance.value as AppearanceConfig), accentColor })
          }
          // OFF deliberately. The tab's default writes the picked theme onto
          // `document.documentElement`, which would re-theme the ENTIRE admin
          // — every other section included — from a control that says it
          // configures this dialog. Nothing applies the picked theme anywhere
          // now: the section wrapper's `data-theme` is pinned to light (owner
          // decision, 2026-09-06 — see the comment above `return`), so Dark and
          // System here save but render nothing different. Deliberately left
          // in place rather than hidden; what becomes of the two options is
          // the owner's call.
          livePreview={false}
          agentHandle="settings-appearance"
        />
      ),
    },
    {
      id: "language",
      label: t("Language"),
      title: t("Language"),
      // Real translation as of this pass: picking Español actually switches
      // this settings panel's tab content (see `SettingsLocaleSync` and the
      // `I18nProvider` mount below). Scoped honestly in the subtitle itself —
      // see `ADMIN_LOCALES`'s doc comment for exactly what is and isn't
      // covered.
      subtitle: t("Admin interface language. Applies to this settings panel's tab content only."),
      icon: (
        <TabIcon>
          <circle cx="9" cy="9" r="6.5" />
          <path d="M2.5 9h13M9 2.5c1.8 2 2.7 4.2 2.7 6.5S10.8 13.5 9 15.5c-1.8-2-2.7-4.2-2.7-6.5S7.2 4.5 9 2.5z" />
        </TabIcon>
      ),
      panel: (
        <LanguageTab
          locales={ADMIN_LOCALES}
          selectedLocale={s.language.value as string}
          onSelectLocale={s.language.onChange}
          agentHandle="settings-language"
        />
      ),
    },
    {
      id: "memory",
      label: t("Memory"),
      title: t("Memory"),
      subtitle: t("Saved facts and context for future chats."),
      icon: (
        <TabIcon>
          <circle cx="9" cy="9" r="6.5" />
          <path d="M9 5.5V9l3 2" />
        </TabIcon>
      ),
      /**
       * `MemorySettingsPanel` (new upstream component — see its own doc
       * comment) composes the header + segmented control with the two
       * already-existing body panels (`MemoryList`/`MemoryHowPanel`). Every
       * list below is one of the stable empty fixtures above: Tovu's
       * assistant doesn't extract or persist standing facts across
       * conversations yet, distinct from chat *history*, which does persist.
       * `onFilterChange`/`onOpenPreview`/etc. are no-ops — `inert` means none
       * of them can fire anyway.
       */
      panel: (
        <div className="settings-ui-inert-wrap">
          <p className="settings-ui-inert-note" role="note">
            {tCap(
              "Tovu's assistant doesn't persist extracted facts across conversations yet — that's separate from chat history, which does persist. The control below is shown for reference and disabled until it does.",
            )}
          </p>
          <div className="settings-ui-inert-control" inert>
            <MemorySettingsPanel
              enabled
              onToggleEnabled={() => {}}
              topTab={s.memoryTopTab}
              onTopTabChange={s.setMemoryTopTab}
              agentHandle="settings-memory"
              savedMemory={{
                entries: EMPTY_MEMORY_ENTRIES,
                filtered: EMPTY_MEMORY_ENTRIES,
                visibleExtractions: EMPTY_MEMORY_EXTRACTIONS,
                filter: "all",
                onFilterChange: () => {},
                unifiedMemoryCount: 0,
                onClearExtractions: () => {},
                onRefreshExtractions: () => {},
                isRefreshing: false,
                previewId: null,
                previewBody: null,
                nowClock: Date.now(),
                onOpenPreview: () => {},
                onStartEdit: () => {},
                onDeleteEntry: () => {},
                onDeleteExtraction: () => {},
              }}
              howItWorks={{
                enabled: true,
                hookFlags: MEMORY_HOOK_FLAGS,
                onToggleHook: () => {},
              }}
            />
          </div>
        </div>
      ),
    },
    {
      id: "skills",
      label: t("Skills"),
      title: t("Skills"),
      subtitle: t("Custom skills your assistant can invoke mid-task."),
      icon: (
        <TabIcon>
          <path d="M9 3l1.2 3.8L14 8l-3.8 1.2L9 13l-1.2-3.8L4 8l3.8-1.2z" />
        </TabIcon>
      ),
      /**
       * Mounted in Settings by explicit user decision, even though OD keeps
       * Skills on its top-level `/integrations` page instead
       * (`od-integrations-skills.png`) — a reversible placement call, not a
       * parity miss. No Tovu backend, but a real `*Tab` export exists — same
       * `inert`-wrap shape as Media providers above. `disabledSkillIds`/
       * `onToggleEnabled` are the stable empty-set/no-op pair: `inert` means
       * the toggle can never actually fire, so there is nothing for a real
       * handler to do here.
       */
      panel: (
        <div className="settings-ui-inert-wrap">
          <p className="settings-ui-inert-note" role="note">
            {tCap(
              "Tovu has no skills backend yet. Skills lives in Settings here by design, unlike Open Design's separate Integrations page. The control below is shown for reference and disabled until a real backend exists.",
            )}
          </p>
          <div className="settings-ui-inert-control" inert>
            <SkillsTab
              port={s.skillsPort}
              disabledSkillIds={EMPTY_DISABLED_SKILL_IDS}
              onToggleEnabled={() => {}}
              agentHandle="settings-skills"
            />
          </div>
        </div>
      ),
    },
    {
      // SPEC-044's OQ-04, resolved 2026-09-10 (owner call): folded in from a standalone top-level
      // nav row — see this file's own header (the "One tab ARRIVED here" section) and
      // `panels.tsx`'s comment on the retired `workspace` panel for the full history and the
      // `/admin/workspace` -> `/admin/settings?tab=workspace` redirect that keeps old links
      // working.
      //
      // Placed last, immediately before About: every other tab here configures how the ASSISTANT
      // behaves or how this OPERATOR experiences the dialog (execution, instructions,
      // notifications, privacy, appearance, language, memory, skills) — this one is the only tab
      // that is about the INSTALL's own identity, closer in kind to About's version/runtime facts
      // than to any operator preference above it. Not inserted earlier in that run (e.g. ahead of
      // Language) for the same reason: nothing about Workspace configures another tab's behavior,
      // so there is no ordering dependency forcing it earlier, only this one thematic affinity to
      // the tab already at the end.
      //
      // Label/title/subtitle reuse `workspace-i18n.ts`'s own `t(locale, key)` translator
      // (`tWorkspace`) rather than re-translating the same three strings into
      // `settings-capabilities-i18n.ts`: `"Workspace"` and its identity-summary subtitle are
      // already translated there, across the same 21 admin locales `admin-nav-i18n.ts` covers, from
      // when this screen's own `<h1>`/`<p className="page-description">` used them as a standalone
      // page. Two dictionaries carrying the same three English source strings would drift the
      // moment either changed.
      id: "workspace",
      label: tWorkspace(settingsLocale, "Workspace"),
      title: tWorkspace(settingsLocale, "Workspace"),
      subtitle: tWorkspace(settingsLocale, "This site's identity — its name, URL slug, and creation date."),
      // Unchanged from the retired nav row's own icon — a card/panel with a header bar, read as
      // "this install's own identity card", distinct from every `TabIcon` glyph around it.
      icon: (
        <TabIcon>
          <rect x="2.5" y="2.5" width="13" height="13" rx="2" />
          <path d="M2.5 7h13" />
        </TabIcon>
      ),
      // `<Workspace />` verbatim, no props — production callers get the real `useWiredWorkspace()`
      // (`WorkspaceProps.useWorkspaceHook`'s own default), the same as every other mount of this
      // component. Self-contained: it manages its own fetch/save/error state and does not read from
      // or write into `s` (`SettingsUiController`) — see this file's header for why it isn't one of
      // the `useSettingsSlice` tabs.
      panel: <Workspace />,
    },
    {
      id: "about",
      label: t("About"),
      title: t("About"),
      subtitle: t("Version and runtime details."),
      icon: (
        <TabIcon>
          <circle cx="9" cy="9" r="6.5" />
          <path d="M9 6.2h.01M8.3 8.5h1v4h1" />
        </TabIcon>
      ),
      panel: <AboutPanel t={t} tCap={tCap} />,
    },
  ];

  /**
   * The tab the inline shell should actually open on, or `undefined` to leave it uncontrolled.
   *
   * Can't pass `tabId` straight through as `SettingsDialogShell`'s `activeTabId`: that prop's own
   * controlled/uncontrolled switch is `!== undefined`, not truthiness (see
   * `useSettingsDialogShell.ts`), so a literal `null` — what `URLSearchParams.get("tab")` returns
   * for every URL with no `?tab=` at all, i.e. most of them — would still count as "controlled,
   * active tab is null" and blank the panel instead of falling back to the first tab. A `?tab=`
   * naming an id that isn't one of the 13 above (typo, stale link, or a deliberately bogus value)
   * would do the same, so this checks membership, not just presence — same "don't trust a raw
   * query value" instinct `WidgetInstanceEditor`'s own `?type=` guard applies for the same reason.
   */
  const requestedTabId = tabId && tabs.some((tab) => tab.id === tabId) ? tabId : undefined;

  /**
   * Keeps `?tab=` in sync as the operator switches tabs, so the URL is always a correct deep link
   * back to whatever is on screen — not just the one the panel happened to open on. `replace`, not a
   * new history entry per click: switching tabs is not a navigation Back should step through one at
   * a time, the same reasoning `navigate()`'s own legacy-hash-redirect caller applies.
   *
   * Fires even before any `?tab=` is present (`requestedTabId` is `undefined` then, so the shell
   * manages the active tab itself) — `useSettingsDialogShell`'s `setActiveTabId` calls
   * `onActiveTabIdChange` unconditionally, controlled or not. That is what turns the very first tab
   * click into the point the URL starts tracking the panel, with no local "which tab" state needed
   * here to make that happen.
   */
  const handleTabChange = (nextTabId: string) => {
    navigate(`/settings?tab=${nextTabId}`, { replace: true });
  };

  /**
   * Top-right chrome. Lives in the shell's own `chromeExtra` slot rather than
   * in a banner above it, so the page is exactly what it looks like: the admin
   * sidebar, the settings sidebar, and the panel — no third strip of header
   * competing with the shell's own title.
   */
  const saveStatus = (
    <span
      className={`settings-ui-save is-${s.save.status}`}
      role={s.save.status === "error" ? "alert" : "status"}
    >
      {describeSaveStatus(s.save)}
    </span>
  );

  /** Page chrome carries the "open as dialog" affordance; the dialog itself
   *  obviously must not offer to open itself, so it gets the status alone. */
  const pageChrome = (
    <>
      {saveStatus}
      <button
        type="button"
        className="settings-ui-dialog-btn"
        onClick={() => s.setModalOpen(true)}
        {...agentHandle("settings-open-as-dialog", { role: "button", label: "Open Settings as a dialog overlay" })}
      >
        {t("Open as dialog")}
      </button>
    </>
  );

  /*
   * `data-theme="light"` on the wrapper below is PINNED — the owner's call,
   * 2026-09-06: "take dark mode off the Settings page entirely; Settings
   * renders light, like every other admin screen." This page has no
   * appearance of its own any more, so its chrome can come off too
   * (`styles/settings.css`, "Take Settings out of the card") and the surface
   * sits flush in the admin column with every other screen.
   *
   * History, because this attribute has flipped twice and the next reader
   * deserves to know it was deliberate each time: it was first a literal
   * `"light"` (a workaround for `core.appearance.theme` getting stuck on
   * `"system"` on installs that predated the source default); then, once
   * `reconcileDefinitionDefault` fixed the stuck default upstream, it followed
   * the stored choice through `resolveDialogDataTheme` — picking Dark or
   * System genuinely rendered a dark panel inside the light admin. That
   * per-panel theming is what the owner has now removed, and the resolver
   * went with it.
   *
   * CONSEQUENCE, stated rather than hidden: the "Dialog appearance" tab's
   * Dark and System options still SAVE (`s.appearance.onChange` is untouched
   * and the value round-trips to the store) but no longer change anything on
   * this page or in the "Open as dialog" overlay. What to do with those two
   * options — disable, remove, or hold for an admin-wide dark mode — is the
   * owner's separate decision; nothing here pre-empts it.
   */
  return (
    /**
     * `initialLocale` is safe to read straight from the slice here: this
     * whole function already returned the "Loading settings…" placeholder
     * above until every slice (including `language`) resolved, so
     * `language.value` is never null at this point — no detection race.
     * `dictionaries` is upstream's shipped EN+ES pair (`@jini-ai/ui`'s
     * `SETTINGS_DIALOG_DICTIONARIES`); `fallbackLocale="en"` is already the
     * default, named here for clarity since it's load-bearing (a key missing
     * from `es` renders real English, never a raw key — see
     * `dictionaries.test.tsx` upstream). `syncDocumentAttributes={false}`:
     * the default would set `<html lang/dir>` for the WHOLE document, but
     * only this settings panel's tab content is actually translated — the
     * rest of the Tovu admin shell stays English regardless of this choice
     * (same scoping rule as `AppearanceTab`'s `livePreview={false}` above),
     * so claiming a document-wide language via `<html lang="es">` here would
     * misinform assistive tech about the untranslated majority of the page.
     */
    <I18nProvider
      initialLocale={s.language.value as string}
      dictionaries={SETTINGS_DIALOG_DICTIONARIES}
      fallbackLocale="en"
      syncDocumentAttributes={false}
    >
      <SettingsLocaleSync locale={s.language.value as string} />
      {/* `settings-page` is THIS screen's own hook for `styles/settings.css` — five screens share
          `settings-ui-section` (Agent Plugins, Authentication, AI Assistant, the placeholder tabs,
          and this one), so anything meant for the Settings page alone must not select on the
          shared class. `data-theme` is pinned — see the comment above `return`. */}
      <div className="settings-ui-section settings-page" data-theme="light">
        {s.loadError ? (
          <p className="settings-ui-load-error" role="alert">
            Could not load saved settings ({s.loadError}). Showing defaults — edits will still save.
          </p>
        ) : null}

        {/* Page mode: `presentation="inline"` renders the shell in the admin's own
            content column — two sidebars (admin, then settings) and the panel. */}
        <SettingsDialogShell
          tabs={tabs}
          presentation="inline"
          className="jini-tabbed-dialog--inline"
          fullscreenEnabled={false}
          chromeExtra={pageChrome}
          activeTabId={requestedTabId}
          onActiveTabIdChange={handleTabChange}
        />

        {/* Modal mode: same component, same tabs, one different prop. */}
        {s.modalOpen ? (
          <SettingsDialogShell
            tabs={tabs}
            onClose={() => s.setModalOpen(false)}
            chromeExtra={saveStatus}
          />
        ) : null}
      </div>
    </I18nProvider>
  );
}
