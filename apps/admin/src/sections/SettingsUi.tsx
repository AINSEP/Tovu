/**
 * @file Admin "Settings (New)" screen — the Open Design settings-dialog port.
 *
 * Ships *beside* the SPEC-007 raw ledger browser (`sections/Settings.tsx`),
 * which is deliberately untouched: the curated tabbed surface and the raw
 * namespace/key inspector are two views of the same `content.db` store, and
 * the decision on record is that both stay available.
 *
 * 13 tabs mounted: Execution mode, Instructions, Notifications, Privacy,
 * Dialog appearance, Language, MCP server, Media providers, Connectors,
 * Memory, External MCP, Skills, About. The shell is generic over its tab
 * array, so adding more is appending entries to `tabs` below — not
 * restructuring this file. Each ledger-backed tab owns one `useSettingsSlice`
 * instance (its own load, debounce, save chain and diff base); the page
 * chrome renders `mergeSaveStates` over all of them. The last five of the 13
 * (Media providers, Connectors, Memory, External MCP, Skills) have no Tovu
 * backend at all and so own no slice. Three (Media providers, Connectors,
 * Skills) mount their real `@jini-ai/ui` component behind the same
 * `settings-ui-inert-wrap`/`inert` pattern Privacy's telemetry toggles use
 * below, fed an empty/fresh fake port so nothing fabricated is shown. The
 * other two (Memory, External MCP) have no ready-made `*Tab` export to wrap
 * this way — composing one is real follow-up work, not done here — and
 * render `ComingSoonPanel` instead. See both panels' doc comments.
 *
 * Both render modes are exercised here on purpose. `SettingsDialogShell`
 * treats `onClose` as the modal/inline switch (omit it and the shell renders
 * inline with no close affordance), so the page view and the modal view are
 * the same component with one prop different.
 */

import { useMemo, useRef, useState } from "react";
import {
  AppearanceTab,
  ConnectorsBrowser,
  ExecutionTab,
  InstructionsTab,
  IntegrationsTab,
  LanguageTab,
  MediaProvidersTab,
  NotificationsTab,
  PrivacyTab,
  SettingsDialogShell,
  SkillsTab,
  createFakeMediaProvidersPort,
  createFakeSkillsPort,
  type ExecutionConfig,
  type MediaProviderOption,
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
import { TOVU_ADMIN_VERSION } from "../lib/app-version";

/** Shared 16px icon frame, so a tab's glyph can be written as bare path data. */
function TabIcon({ children }: { children: React.ReactNode }) {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5">
      {children}
    </svg>
  );
}

/**
 * Panel body for a settings tab with no ready-made `@jini-ai/ui` `*Tab`
 * export to mount at all — currently Memory and External MCP.
 *
 * Locked project decision (coordinator dispatch, 2026-07-31): a tab with no
 * real backend must never ship as a live control that saves but changes
 * nothing. Three siblings (Media providers, Connectors, Skills) satisfy that
 * by mounting their real component behind the same `settings-ui-inert-wrap`/
 * `inert` pattern Privacy's telemetry toggles use below — see those tabs'
 * entries in `tabs` for the exact shape. Memory and External MCP can't do
 * that cheaply: neither has a drop-in `*Tab` component, only loose pieces
 * (`MemoryConnectedPanel`/`MemoryList`/`MemoryHooksPanel`, several dozen
 * props between them; `SourceConfigList<TSource>`, generic over a source
 * shape Tovu would have to invent). Composing either behind a fake port is
 * real follow-up work, not a same-pass swap-in — this plain notice is the
 * interim, honest state: no fabricated sample data, and nothing to
 * accidentally click.
 *
 * Renders no title/description of its own: `SettingsDialogShell` already
 * renders the active tab's `title`/`subtitle` as its own page header (see
 * `SettingsDialogShell.tsx`'s `<h2>{activeTab.title}</h2>`), so repeating
 * them here would double the heading. Only real, already-styled classes are
 * used (`jini-settings-section`, `jini-empty-card` both ship in
 * `settings-dialog.css` upstream), plus one small Tovu-local badge class —
 * no compensating CSS needed for a Jini package gap.
 *
 * @complexity O(1) — fixed-shape render, no iteration, no branching.
 * @overallScore 100 — no branches, no I/O, no state; matches the existing
 * `TabIcon` helper's exemption from a full function-quality write-up.
 */
function ComingSoonPanel({ reason }: { reason: string }) {
  return (
    <section className="jini-settings-section settings-ui-coming-soon">
      <span className="settings-ui-coming-soon-badge">Coming soon</span>
      <div className="jini-empty-card">{reason}</div>
    </section>
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

/**
 * About tab body: version only, no updater surface.
 *
 * Deliberately NOT `@jini-ai/ui`'s own `AboutTab`, even though the dispatch
 * table names it as the drop-in to use. Reason, found while wiring it up:
 * `AboutTab`'s update-status row always renders `t(control.statusKey)`,
 * and every branch of `deriveAboutUpdateControl` (ui-core) sets `statusKey`
 * to a semantic dictionary id like `settings.updateStatusUnsupported` — never
 * to literal English, unlike every other label on every other tab mounted in
 * this file (`t('Version')`, `t('Media providers')`, ...). Tovu mounts no
 * `I18nProvider` anywhere (`useT()` runs in passthrough mode: `t(key)`
 * returns `key`), so any `AboutTab` mount would show that raw id as on-screen
 * text — a second instance of the already-known "no dictionary mounted" gap
 * (Notifications' sound picker), and unlike that one, unavoidable here: there
 * is no `UpdaterModel` state that produces a null status text, and
 * `showReleaseLink` is `true` in every reachable static state, so "omit the
 * updater surface entirely" (the dispatch's own instruction) cannot be done
 * through `AboutTab`'s props at all. Composing a minimal panel instead is
 * the smallest change that actually satisfies "version info only, no
 * updater" rather than papering over the raw-key display. Worth fixing
 * upstream: `ABOUT_UPDATE_KEYS` has no literal-English fallback path the way
 * every other tab's default labels do.
 *
 * @complexity O(1) — fixed-shape render, no iteration, no branching.
 * @overallScore 100 — no branches, no I/O, no state.
 */
function AboutPanel() {
  return (
    <section className="jini-settings-section">
      <div className="jini-settings-section-card">
        <div className="jini-field">
          <span className="jini-field-label">Version</span>
          <strong>{`Tovu Admin ${TOVU_ADMIN_VERSION}`}</strong>
        </div>
        <p className="jini-hint">
          Tovu is a server CMS — new versions ship with a deployment, not an in-app updater.
        </p>
      </div>
    </section>
  );
}

export function SettingsUi() {
  const [modalOpen, setModalOpen] = useState(false);
  const port = useRef(createExecutionPort());
  // Fresh, empty in-memory ports for the three inert-wrapped backend-less
  // tabs below (Media providers, Skills) — `useRef` so each mounts once, not
  // once per render. `{ skills: [] }` overrides `createFakeSkillsPort`'s own
  // sample-data default; without it the tab would show skills that don't
  // exist in this Tovu install, which is exactly the fabricated-data problem
  // these ports otherwise avoid.
  const mediaProvidersPort = useRef(createFakeMediaProvidersPort());
  const skillsPort = useRef(createFakeSkillsPort({ skills: [] }));

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
      title: "Privacy",
      // Not "Choose what this installation shares" — there is nothing to
      // choose yet. See the panel note below.
      subtitle: "Vendor telemetry consent. Not connected to a collection pipeline in Tovu yet.",
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
            Not wired up: this installation has no outbound telemetry pipeline, so nothing is sent
            regardless of this choice. The control below is shown for reference and disabled until a
            real collection path exists.
          </p>
          <div className="settings-ui-inert-control" inert>
            <PrivacyTab state={privacy.value as PrivacyConsentState} onChange={privacy.onChange} />
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
      label: "Dialog appearance",
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
    {
      id: "media-providers",
      label: "Media providers",
      title: "Media providers",
      subtitle: "API keys for image, video, and audio generation.",
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
            Tovu doesn't have a media-provider backend yet. The control below is shown for
            reference and disabled until one exists.
          </p>
          <div className="settings-ui-inert-control" inert>
            <MediaProvidersTab port={mediaProvidersPort.current} catalog={EMPTY_MEDIA_PROVIDER_CATALOG} />
          </div>
        </div>
      ),
    },
    {
      id: "connectors",
      label: "Connectors",
      title: "Connectors",
      subtitle: "Third-party accounts and APIs via Composio.",
      icon: (
        <TabIcon>
          <path d="M4 5h10M4 9h10M4 13h10" />
          <circle cx="7" cy="5" r="1.4" />
          <circle cx="11" cy="9" r="1.4" />
          <circle cx="6" cy="13" r="1.4" />
        </TabIcon>
      ),
      /**
       * `ConnectorsBrowser` needs no props beyond `unlocked` to render safely
       * — omitting `dependencies` makes it default to an empty in-memory fake
       * (`useWiredConnectorsBrowser`'s own fallback), and `unlocked={false}`
       * is Tovu's real state (no Composio key configured), not a fabricated
       * one. `gate` is omitted too: its `ctaHref` would have to point
       * somewhere Tovu can't actually complete a Composio connection from
       * yet, so the plain locked grid renders instead of a CTA link nothing
       * backs.
       */
      panel: (
        <div className="settings-ui-inert-wrap">
          <p className="settings-ui-inert-note" role="note">
            Composio-backed third-party connectors aren't wired up in Tovu yet. The control below
            is shown for reference and disabled until they are.
          </p>
          <div className="settings-ui-inert-control" inert>
            <ConnectorsBrowser unlocked={false} />
          </div>
        </div>
      ),
    },
    {
      id: "memory",
      label: "Memory",
      title: "Memory",
      subtitle: "Saved facts and context for future chats.",
      icon: (
        <TabIcon>
          <circle cx="9" cy="9" r="6.5" />
          <path d="M9 5.5V9l3 2" />
        </TabIcon>
      ),
      // No `*Tab` export — see `ComingSoonPanel`'s doc comment. Distinct from
      // the AI Assistant's chat *history*, which does persist: this is about
      // extracting and reusing standing facts across conversations, which
      // Tovu's assistant doesn't do.
      panel: (
        <ComingSoonPanel reason="Tovu's assistant doesn't persist extracted facts across conversations yet — that's separate from chat history, which does persist." />
      ),
    },
    {
      id: "external-mcp",
      label: "External MCP",
      title: "External MCP",
      subtitle: "Add MCP tools from external services.",
      icon: (
        <TabIcon>
          <path d="M6 3v4M12 3v4M4.5 7h9v2a4.5 4.5 0 0 1-9 0z" />
          <path d="M9 13.5V16" />
        </TabIcon>
      ),
      // OD as MCP *client* (`source-config-list`) — distinct from the "MCP
      // server" tab above, where Tovu is the one being connected TO. No
      // `*Tab` export — see `ComingSoonPanel`'s doc comment.
      panel: <ComingSoonPanel reason="Tovu doesn't run an MCP client yet, so there are no external MCP servers to add here." />,
    },
    {
      id: "skills",
      label: "Skills",
      title: "Skills",
      subtitle: "Custom skills your assistant can invoke mid-task.",
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
            Tovu has no skills backend yet. Skills lives in Settings here by design, unlike Open
            Design's separate Integrations page. The control below is shown for reference and
            disabled until a real backend exists.
          </p>
          <div className="settings-ui-inert-control" inert>
            <SkillsTab
              port={skillsPort.current}
              disabledSkillIds={EMPTY_DISABLED_SKILL_IDS}
              onToggleEnabled={() => {}}
            />
          </div>
        </div>
      ),
    },
    {
      id: "about",
      label: "About",
      title: "About",
      subtitle: "Version and runtime details.",
      icon: (
        <TabIcon>
          <circle cx="9" cy="9" r="6.5" />
          <path d="M9 6.2h.01M8.3 8.5h1v4h1" />
        </TabIcon>
      ),
      panel: <AboutPanel />,
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
   * Follows the operator's stored `core.appearance.theme` choice, scoped to
   * this section only.
   *
   * `settings-dialog.css` resolves its `--jini-*` tokens from a `data-theme`
   * attribute on ANY ancestor, falling back to `@media (prefers-color-scheme)`
   * when none is set. `"system"` means "match the OS", which this dialog
   * already does natively via that same media query — so `"system"` maps to
   * `undefined` here rather than a literal string data-theme has no value for.
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
  const dialogTheme = (appearance.value as AppearanceConfig).theme;
  const dialogDataTheme = dialogTheme === "system" ? undefined : dialogTheme;

  return (
    <div className="settings-ui-section" data-theme={dialogDataTheme}>
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
