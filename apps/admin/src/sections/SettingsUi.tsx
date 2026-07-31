/**
 * @file Admin "Settings (New)" screen — the Open Design settings-dialog port.
 *
 * Ships *beside* the SPEC-007 raw ledger browser (`sections/Settings.tsx`),
 * which is deliberately untouched: the curated tabbed surface and the raw
 * namespace/key inspector are two views of the same `content.db` store, and
 * the decision on record is that both stay available.
 *
 * Four tabs mounted: Execution mode, Instructions, Notifications, Privacy.
 * The shell is generic over its tab array, so adding the remaining ten is
 * appending entries to `tabs` below — not restructuring this file. Each tab
 * owns one `useSettingsSlice` instance (its own load, debounce, save chain and
 * diff base); the page chrome renders `mergeSaveStates` over all four.
 *
 * Both render modes are exercised here on purpose. `SettingsDialogShell`
 * treats `onClose` as the modal/inline switch (omit it and the shell renders
 * inline with no close affordance), so the page view and the modal view are
 * the same component with one prop different.
 */

import { useMemo, useRef, useState } from "react";
import {
  AppearanceTab,
  ExecutionTab,
  InstructionsTab,
  IntegrationsTab,
  LanguageTab,
  NotificationsTab,
  PrivacyTab,
  SettingsDialogShell,
  type ExecutionConfig,
  type NotificationsPreferences,
  type PrivacyConsentState,
  type SettingsDialogTab,
} from "@jini-ai/ui";
import "@jini-ai/ui/settings-dialog.css";
import {
  DEFAULT_EXECUTION_CONFIG,
  createExecutionPort,
  loadExecutionConfig,
  saveExecutionConfig,
} from "../lib/execution-settings";
import {
  ADMIN_LOCALES,
  DEFAULT_APPEARANCE,
  DEFAULT_INSTRUCTIONS,
  DEFAULT_LOCALE,
  DEFAULT_NOTIFICATIONS,
  DEFAULT_PRIVACY,
  loadAppearance,
  loadInstructions,
  loadLanguage,
  loadNotifications,
  loadPrivacy,
  saveAppearance,
  saveInstructions,
  saveLanguage,
  saveNotifications,
  savePrivacy,
  type AppearanceConfig,
} from "../lib/settings-tabs";
import { mergeSaveStates, useSettingsSlice } from "../hooks/use-settings-slice.hooks";

/** Shared 16px icon frame, so a tab's glyph can be written as bare path data. */
function TabIcon({ children }: { children: React.ReactNode }) {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5">
      {children}
    </svg>
  );
}

export function SettingsUi() {
  const [modalOpen, setModalOpen] = useState(false);
  const port = useRef(createExecutionPort());

  const execution = useSettingsSlice<ExecutionConfig>({
    load: loadExecutionConfig,
    save: saveExecutionConfig,
    defaultValue: DEFAULT_EXECUTION_CONFIG,
  });
  const instructions = useSettingsSlice<string>({
    load: loadInstructions,
    save: saveInstructions,
    defaultValue: DEFAULT_INSTRUCTIONS,
  });
  const notifications = useSettingsSlice<NotificationsPreferences>({
    load: loadNotifications,
    save: saveNotifications,
    defaultValue: DEFAULT_NOTIFICATIONS,
  });
  const privacy = useSettingsSlice<PrivacyConsentState>({
    load: loadPrivacy,
    save: savePrivacy,
    defaultValue: DEFAULT_PRIVACY,
  });
  const appearance = useSettingsSlice<AppearanceConfig>({
    load: loadAppearance,
    save: saveAppearance,
    defaultValue: DEFAULT_APPEARANCE,
  });
  const language = useSettingsSlice<string>({
    load: loadLanguage,
    save: saveLanguage,
    defaultValue: DEFAULT_LOCALE,
  });

  const slices = [execution, instructions, notifications, privacy, appearance, language];
  const save = useMemo(
    () => mergeSaveStates(slices.map((slice) => slice.saveState)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    slices.map((slice) => slice.saveState),
  );

  /** First load error across the four namespaces. One banner is enough — they
   *  all mean the same thing to the operator (this screen is showing defaults),
   *  and four stacked banners would push the tabs off the fold. */
  const loadError = slices.find((slice) => slice.loadError !== null)?.loadError ?? null;

  // Every slice starts `null` and settles independently. Gate on the whole set
  // so tabs don't pop in one at a time as their namespaces resolve.
  if (slices.some((slice) => slice.value === null)) {
    return (
      <div className="settings-ui-section">
        <p className="muted">Loading settings…</p>
      </div>
    );
  }

  const tabs: SettingsDialogTab[] = [
    {
      id: "execution",
      label: "Execution mode",
      navHint: "Local CLI / BYOK",
      title: "Execution mode",
      subtitle: "Choose Local CLI or BYOK.",
      icon: (
        <TabIcon>
          <path d="M3 5h3M9 5h6M12 9H9M6 9H3M3 13h7M13 13h2" />
          <circle cx="7.5" cy="5" r="1.6" />
          <circle cx="7.5" cy="9" r="1.6" transform="translate(3 0)" />
          <circle cx="11.5" cy="13" r="1.6" />
        </TabIcon>
      ),
      panel: (
        <ExecutionTab
          config={execution.value as ExecutionConfig}
          onConfigChange={execution.onChange}
          port={port.current}
          // Detection runs wherever the Tovu SERVER runs, not on the browser's
          // machine. For a deployed CMS those are different computers, so the
          // component's own default ("on this machine") would be a false claim
          // about whose CLIs these are.
          localCliScopeLabel="Detected on the Tovu server, not on your own computer."
        />
      ),
    },
    {
      id: "instructions",
      label: "Instructions",
      navHint: "Custom prompt",
      title: "Custom instructions",
      subtitle: "Applied to every assistant conversation in this workspace.",
      icon: (
        <TabIcon>
          <path d="M4 3h10v12H4z" />
          <path d="M6.5 6.5h5M6.5 9h5M6.5 11.5h3" />
        </TabIcon>
      ),
      panel: (
        <InstructionsTab
          value={instructions.value as string}
          // The tab reports an all-empty textarea as `undefined` rather than
          // `''`; the slice is typed on the stored shape, which is a string.
          onChange={(next) => instructions.onChange(next ?? DEFAULT_INSTRUCTIONS)}
          description="Extra instructions applied to every conversation in this workspace, in addition to any per-request instructions."
        />
      ),
    },
    {
      id: "notifications",
      label: "Notifications",
      navHint: "Sounds / desktop",
      title: "Notifications",
      subtitle: "How you're told a task finished. Saved per operator, not per workspace.",
      icon: (
        <TabIcon>
          <path d="M9 3a4 4 0 0 0-4 4v3l-1.5 2.5h11L13 10V7a4 4 0 0 0-4-4z" />
          <path d="M7.5 13.5a1.5 1.5 0 0 0 3 0" />
        </TabIcon>
      ),
      panel: (
        <NotificationsTab
          preferences={notifications.value as NotificationsPreferences}
          // This tab emits a PATCH, not a whole object (unlike `PrivacyTab`
          // next door, which emits full state). Merging here rather than
          // teaching the slice about patches keeps the slice's diff base and
          // the stored shape the same type.
          onChange={(patch) =>
            notifications.onChange({ ...(notifications.value as NotificationsPreferences), ...patch })
          }
        />
      ),
    },
    {
      id: "privacy",
      label: "Privacy",
      navHint: "Telemetry",
      title: "Privacy",
      subtitle: "Choose what this installation shares.",
      icon: (
        <TabIcon>
          <path d="M9 2.5 14 4.5v4c0 3.2-2.1 6-5 7-2.9-1-5-3.8-5-7v-4z" />
          <path d="M6.75 8.75 8.5 10.5l3-3.25" />
        </TabIcon>
      ),
      panel: <PrivacyTab state={privacy.value as PrivacyConsentState} onChange={privacy.onChange} />,
    },
    {
      id: "appearance",
      // Labelled "Dialog appearance", not "Appearance": Tovu already has an
      // Appearance concept (site theming, its own admin section), and two nav
      // entries reading "Appearance" that configure different things is the
      // label collision recon §4 flagged. This one styles the settings surface.
      label: "Dialog appearance",
      navHint: "Theme / accent",
      title: "Dialog appearance",
      subtitle: "Theme and accent color for this settings surface. Saved per operator.",
      icon: (
        <TabIcon>
          <circle cx="9" cy="9" r="6" />
          <path d="M9 3a6 6 0 0 1 0 12z" fill="currentColor" stroke="none" />
        </TabIcon>
      ),
      panel: (
        <AppearanceTab
          theme={(appearance.value as AppearanceConfig).theme}
          onThemeChange={(theme) => appearance.onChange({ ...(appearance.value as AppearanceConfig), theme })}
          accentColor={(appearance.value as AppearanceConfig).accentColor}
          onAccentColorChange={(accentColor) =>
            appearance.onChange({ ...(appearance.value as AppearanceConfig), accentColor })
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
      label: "Language",
      navHint: "Admin locale",
      title: "Language",
      // Stated rather than hidden: the preference persists, but nothing reads
      // it yet because Tovu has no i18n module. See `ADMIN_LOCALES`.
      subtitle: "Admin interface language. The choice is saved, but translation is not wired up yet.",
      icon: (
        <TabIcon>
          <circle cx="9" cy="9" r="6.5" />
          <path d="M2.5 9h13M9 2.5c1.8 2 2.7 4.2 2.7 6.5S10.8 13.5 9 15.5c-1.8-2-2.7-4.2-2.7-6.5S7.2 4.5 9 2.5z" />
        </TabIcon>
      ),
      panel: (
        <LanguageTab
          locales={ADMIN_LOCALES}
          selectedLocale={language.value as string}
          onSelectLocale={language.onChange}
        />
      ),
    },
    {
      id: "mcp",
      label: "MCP server",
      navHint: "Client snippets",
      title: "MCP server",
      // The component defaults to an in-memory fake port, so this renders and
      // is explorable with no backend at all. Wiring a real McpIntegrationsPort
      // to Tovu's daemon is its own piece of work.
      subtitle: "Connect an MCP client. Showing sample output — not yet wired to a live server.",
      icon: (
        <TabIcon>
          <path d="M4 6.5h10M4 11.5h10" />
          <circle cx="6.5" cy="6.5" r="1.5" />
          <circle cx="11.5" cy="11.5" r="1.5" />
        </TabIcon>
      ),
      panel: <IntegrationsTab serverName="tovu" />,
    },
  ];

  /**
   * Top-right chrome. Lives in the shell's own `chromeExtra` slot rather than
   * in a banner above it, so the page is exactly what it looks like: the admin
   * sidebar, the settings sidebar, and the panel — no third strip of header
   * competing with the shell's own title.
   */
  const saveStatus = (
    <span
      className={`settings-ui-save is-${save.status}`}
      role={save.status === "error" ? "alert" : "status"}
    >
      {save.status === "saving"
        ? "Saving…"
        : save.status === "saved"
          ? "Saved"
          : save.status === "error"
            ? save.message
            : ""}
    </span>
  );

  /** Page chrome carries the "open as dialog" affordance; the dialog itself
   *  obviously must not offer to open itself, so it gets the status alone. */
  const pageChrome = (
    <>
      {saveStatus}
      <button type="button" className="settings-ui-dialog-btn" onClick={() => setModalOpen(true)}>
        Open as dialog
      </button>
    </>
  );

  /**
   * Pins the dialog's palette to LIGHT, unconditionally, scoped to this section.
   *
   * `settings-dialog.css` resolves its `--jini-*` tokens from a `data-theme`
   * attribute on ANY ancestor, falling back to `@media (prefers-color-scheme)`.
   * Emitting a literal `"light"` is what stops that media query from applying:
   * the surrounding Tovu admin is a light surface with NO dark variant, so any
   * path that resolves to dark puts a dark panel inside a light app.
   *
   * Why unconditional rather than reading the operator's stored choice: the
   * stored `core.appearance.theme` definition default is `"system"` on any
   * install that booted before the source default became `"light"`, and
   * `ensureSettingDefinitions` skips definitions that already exist
   * (`if (existing) continue;`) — so a source-side default can never reach an
   * existing database. Rather than depend on a value we cannot correct from
   * code, this ignores it. That is deliberate and temporary.
   *
   * Consequence, stated not hidden: the Appearance tab's theme control is
   * currently INERT — picking dark or system still saves to the ledger but
   * changes nothing on screen. Restore `data-theme={theme === 'system' ?
   * undefined : theme}` here once the admin has a real dark variant, or once
   * the stored-default drift is fixed and the control is worth honouring.
   */
  return (
    <div className="settings-ui-section" data-theme="light">
      {loadError ? (
        <p className="settings-ui-load-error" role="alert">
          Could not load saved settings ({loadError}). Showing defaults — edits will still save.
        </p>
      ) : null}

      {/* Page mode: `presentation="inline"` renders the shell in the admin's own
          content column — two sidebars (admin, then settings) and the panel. */}
      <SettingsDialogShell
        tabs={tabs}
        presentation="inline"
        className="jini-settings-dialog--inline"
        fullscreenEnabled={false}
        chromeExtra={pageChrome}
      />

      {/* Modal mode: same component, same tabs, one different prop. */}
      {modalOpen ? (
        <SettingsDialogShell
          tabs={tabs}
          onClose={() => setModalOpen(false)}
          chromeExtra={saveStatus}
        />
      ) : null}
    </div>
  );
}
