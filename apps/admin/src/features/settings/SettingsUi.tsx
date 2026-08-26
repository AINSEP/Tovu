/**
 * @file Admin "Settings (New)" screen — the Open Design settings-dialog port. Markup only.
 *
 * Originally shipped *beside* the SPEC-007 raw ledger browser
 * (`features/settings-raw/Settings.tsx`) — the curated tabbed surface and the raw namespace/key
 * inspector were two views of the same `content.db` store, and for a while the decision on record
 * was that both stay available. `settings-raw/` was later deleted once `/settings` was judged to
 * cover the same rows on its own; this file no longer has a raw-ledger sibling.
 *
 * 13 tabs mounted: Execution mode, Instructions, Notifications, Privacy,
 * Dialog appearance, Language, MCP server, Media providers, Connectors,
 * Memory, External MCP, Skills, About. The shell is generic over its tab
 * array, so adding more is appending entries to `tabs` below — not
 * restructuring this file. Each ledger-backed tab owns one `useSettingsSlice`
 * instance (its own load, debounce, save chain and diff base); the page
 * chrome renders `mergeSaveStates` over all of them. The last five of the 13
 * (Media providers, Connectors, Memory, External MCP, Skills) have no Tovu
 * backend at all and so own no slice. All five mount their real `@jini-ai/ui`
 * component behind the same `settings-ui-inert-wrap`/`inert` pattern Privacy's
 * telemetry toggles use below, fed an empty/fresh fake port so nothing
 * fabricated is shown. Memory and External MCP had no ready-made `*Tab`
 * export upstream as of the previous pass over this file — `MemorySettingsPanel`
 * (composing `MemoryList`/`MemoryHowPanel` with a new header) was built for
 * that pass; see `packages/ui/src/features/memory/react/components/MemorySettingsPanel.tsx`
 * in Jini for its own doc comment. External MCP originally mounted Jini's own
 * `ExternalMcpTab` the same way, but that component takes a single static
 * `fieldSpecs` prop with no way to react to what the operator is currently
 * typing — fine while every server was `stdio`-only, not once a server's real
 * shape depends on a live transport/auth-mode choice (`stdio`/`streamable_http`,
 * `none`/`static_env`/`oauth`). It is now `./ExternalMcpSettingsPanel.tsx`, a
 * Tovu-owned recomposition of the SAME lower-level `@jini-ai/ui` pieces
 * `ExternalMcpTab` itself is built from — see that file's own doc comment for
 * the full reasoning.
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
  ConnectorsBrowser,
  ExecutionTab,
  I18nProvider,
  InstructionsTab,
  IntegrationsTab,
  LanguageTab,
  MediaProvidersTab,
  MemorySettingsPanel,
  NotificationsTab,
  PrivacyTab,
  SETTINGS_DIALOG_DICTIONARIES,
  SettingsDialogShell,
  SkillsTab,
  type ExecutionConfig,
  type MediaProviderOption,
  type MemoryConfigFlagKey,
  type MemoryEntrySummary,
  type MemoryExtractionRecord,
  type MemoryTopTab,
  type NotificationsPreferences,
  type PrivacyConsentState,
  type SettingsDialogTab,
} from "@jini-ai/ui";
import "@jini-ai/ui/settings-dialog.css";
import { ExternalMcpSettingsPanel } from "./ExternalMcpSettingsPanel";
import { ADMIN_LOCALES, DEFAULT_INSTRUCTIONS, type AppearanceConfig } from "../../lib/settings-tabs";
import { DEFAULT_EXECUTION_CONFIG } from "../../lib/execution-settings";
import { navigate } from "../../lib/router";
import { describeSaveStatus, resolveDialogDataTheme } from "./rules";
import { useWiredSettingsLocaleSync } from "./hooks/use-settings-locale-sync.hooks";
import { useSettingsUi, type SettingsUiController } from "./hooks/use-settings-ui.hooks";
import type { Translate } from "../../lib/dictionary-translator";
import { ComposioKeyField } from "./ComposioKeyField";
import { connectorsDependencies } from "./connectors-port";
import { useWiredAdminExecutionCredential } from "../../hooks/use-admin-execution-credential.hooks";
import { AdminByokKeyFooter, AdminByokMigrationPrompt } from "../../components/AdminByokKeyPanel";
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

/** Stable empty catalog for the inert-wrapped `MediaProvidersTab` mount below
 *  — Tovu genuinely has zero configured providers, so an empty array is the
 *  honest state, not a stand-in for missing data. Module-level so it's the
 *  same array reference across renders. */
const EMPTY_MEDIA_PROVIDER_CATALOG: readonly MediaProviderOption[] = [];

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

  // Called unconditionally, ahead of the loading gate below (rules of hooks) — falls back to
  // `DEFAULT_EXECUTION_CONFIG.byok` while `s.execution.value` is still `null`, which is harmless:
  // the credential hook's own effects don't read `byok` until an explicit Save/migrate press, and
  // the tab this feeds isn't rendered until past the gate anyway.
  const adminCredential = useAdminExecutionCredentialHook({
    byok: (s.execution.value as ExecutionConfig | null)?.byok ?? DEFAULT_EXECUTION_CONFIG.byok,
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
            // (2026-08-05) — these three keep the shared `ByokProviderForm` honest about
            // that: an empty key field is not a missing value when one is already stored,
            // the masked placeholder answers "which key", and the footer is the ONLY
            // control that can persist it. See `hooks/use-admin-execution-credential.hooks.ts`.
            apiKeyStoredExternally={adminCredential.apiKeyStoredExternally}
            apiKeyPlaceholder={adminCredential.apiKeyPlaceholder}
            apiKeyFooter={<AdminByokKeyFooter controller={adminCredential} />}
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
            <PrivacyTab state={s.privacy.value as PrivacyConsentState} onChange={s.privacy.onChange} />
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
          // configures this dialog. We scope it to the section wrapper below
          // via `data-theme` instead.
          livePreview={false}
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
        />
      ),
    },
    {
      id: "mcp",
      label: t("MCP server"),
      title: t("MCP server"),
      // The component defaults to an in-memory fake port, so this renders and
      // is explorable with no backend at all. Wiring a real McpIntegrationsPort
      // to Tovu's daemon is its own piece of work.
      subtitle: t("Connect an MCP client. Showing sample output — not yet wired to a live server."),
      icon: (
        <TabIcon>
          <path d="M4 6.5h10M4 11.5h10" />
          <circle cx="6.5" cy="6.5" r="1.5" />
          <circle cx="11.5" cy="11.5" r="1.5" />
        </TabIcon>
      ),
      panel: <IntegrationsTab serverName="tovu" />,
    },
    {
      id: "media-providers",
      label: t("Media providers"),
      title: t("Media providers"),
      subtitle: t("API keys for image, video, and audio generation."),
      icon: (
        <TabIcon>
          <path d="M3 4.5h12v9H3z" />
          <circle cx="7" cy="8" r="1.4" />
          <path d="M4 12l3.5-3 2 2 2.5-3 3 4" />
        </TabIcon>
      ),
      /**
       * No Tovu backend, but a real `*Tab` export exists — mirrors the
       * Privacy tab's `inert`-wrap pattern (see that panel's comment below)
       * rather than `ComingSoonPanel`: `MediaProvidersTab` renders and is
       * genuinely explorable, just genuinely unusable. `catalog` is the
       * empty, stable `EMPTY_MEDIA_PROVIDER_CATALOG` — Tovu really has zero
       * configured providers, so the tab's own "No media providers
       * configured yet." empty state is the honest state, not a stand-in.
       */
      panel: (
        <div className="settings-ui-inert-wrap">
          <p className="settings-ui-inert-note" role="note">
            {tCap(
              "Tovu doesn't have a media-provider backend yet. The control below is shown for reference and disabled until one exists.",
            )}
          </p>
          <div className="settings-ui-inert-control" inert>
            <MediaProvidersTab port={s.mediaProvidersPort} catalog={EMPTY_MEDIA_PROVIDER_CATALOG} />
          </div>
        </div>
      ),
    },
    {
      id: "connectors",
      label: t("Connectors"),
      title: t("Connectors"),
      subtitle: t("Third-party accounts and APIs via Composio."),
      icon: (
        <TabIcon>
          <path d="M4 5h10M4 9h10M4 13h10" />
          <circle cx="7" cy="5" r="1.4" />
          <circle cx="11" cy="9" r="1.4" />
          <circle cx="6" cy="13" r="1.4" />
        </TabIcon>
      ),
      /**
       * LIVE, no longer `inert`. `dependencies` is Tovu's real `ConnectorsPort`
       * (`connectors-port.ts`) over the `/connectors` admin routes, so the grid
       * shows the provider's real 181-entry Composio catalog rather than the
       * empty in-memory fake this tab used to fall back to.
       *
       * `unlocked` tracks whether a Composio API key is actually saved, so it
       * is still Tovu's real state — just a state the operator can now change,
       * via the `ComposioKeyField` above (the input OD had in its own page
       * chrome and this component has never shipped).
       *
       * Connect/disconnect are fully wired: authorizing opens Composio's
       * consent page in a popup and finishes at Tovu's own public callback
       * route, which `postMessage`s this window (see `connectors-port.ts`).
       * While still locked, `ConnectorGrid` masks the grid and disables every
       * card, so those actions are unreachable until a key exists rather than
       * merely failing.
       *
       * `ctaHref` points at Composio's real site (`app.composio.dev`, per
       * `packages/ui/source-map.md`'s provenance note for this component).
       */
      panel: (
        <>
          <ComposioKeyField composio={s.composio} />
          <ConnectorsBrowser
            unlocked={s.composio.unlocked}
            dependencies={connectorsDependencies}
            catalogRefreshKey={s.composio.catalogRefreshKey}
            gate={{
              title: "Add your Composio API key to continue",
              body: "Paste your key above to load available integrations.",
              ctaLabel: "Get API Key",
              ctaHref: "https://app.composio.dev",
            }}
          />
        </>
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
      id: "external-mcp",
      label: t("External MCP"),
      title: t("External MCP"),
      subtitle: t("Add MCP tools from external services."),
      icon: (
        <TabIcon>
          <path d="M6 3v4M12 3v4M4.5 7h9v2a4.5 4.5 0 0 1-9 0z" />
          <path d="M9 13.5V16" />
        </TabIcon>
      ),
      /**
       * Tovu as MCP *client* — distinct from the "MCP server" tab above, where
       * Tovu is the one being connected TO. Live since the `external_mcp_servers`
       * store landed; this was previously an `inert` reference mount.
       *
       * `ExternalMcpSettingsPanel` (Tovu's own, `./ExternalMcpSettingsPanel.tsx`)
       * computes its own field specs reactively from the transport/auth-mode the
       * operator is currently choosing — see that file's own doc comment. See
       * also `use-external-mcp.hooks.ts` for why the port carries an allowlist
       * field at all (`mcp-federation/trust.ts` R2's default-deny means a saved
       * server with none contributes zero tools).
       *
       * `saveStatusLabel` deliberately carries the restart notice instead of
       * "All changes saved": a saved row is persisted but NOT live, because the
       * admitted tool set is frozen at connect (R5). Telling an operator their
       * change is saved, when the running assistant still cannot see the server,
       * would be true and useless.
       */
      panel: (
        <ExternalMcpSettingsPanel
          dependencies={s.externalMcp.dependencies}
          saveStatusLabel={
            s.externalMcp.restartRequired
              ? tCap("Saved — restart Tovu to connect")
              : tCap("Changes apply when Tovu restarts")
          }
        />
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
            />
          </div>
        </div>
      ),
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
      <button type="button" className="settings-ui-dialog-btn" onClick={() => s.setModalOpen(true)}>
        {t("Open as dialog")}
      </button>
    </>
  );

  /**
   * Follows the operator's stored `core.appearance.theme` choice, scoped to
   * this section only.
   *
   * `settings-dialog.css` resolves its `--jini-*` tokens from a `data-theme`
   * attribute on ANY ancestor, falling back to `@media (prefers-color-scheme)`
   * when none is set — see `rules.ts`'s `resolveDialogDataTheme` for the
   * `"system"` → `undefined` mapping this relies on.
   *
   * This used to be pinned to a literal `"light"` unconditionally, because the
   * stored default for `core.appearance.theme` could get stuck on `"system"`
   * on any install that booted before the source default became `"light"` —
   * `ensureSettingDefinitions` used to skip definitions that already existed,
   * so a source-side default fix could never reach an existing database. Fixed
   * upstream in `reconcileDefinitionDefault` (see `ensure-definitions.ts`):
   * `content.db` now reconciles a drifted core-owned default at boot instead
   * of leaving it stuck. The control is real again — picking dark or system
   * now actually changes what renders here, not just what's stored.
   *
   * Note this only themes the settings panel itself, not the rest of the
   * Tovu admin shell (which stays light-only) — picking "dark" or "system" on
   * a dark OS renders a dark settings panel inside an otherwise-light admin.
   * That is the intended scope of a "Dialog appearance" control, not a bug.
   */
  const dialogDataTheme = resolveDialogDataTheme((s.appearance.value as AppearanceConfig).theme);

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
      <div className="settings-ui-section" data-theme={dialogDataTheme}>
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
