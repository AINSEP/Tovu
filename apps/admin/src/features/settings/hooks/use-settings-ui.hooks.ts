import { useMemo, useRef, useState } from "react";
import {
  createFakeMediaProvidersPort,
  createFakeSkillsPort,
  createFakeSourceConfigDependencies,
  type ExecutionConfig,
  type MemoryTopTab,
  type NotificationsPreferences,
  type PrivacyConsentState,
  type SourceConfigItem,
} from "@jini-ai/ui";
import {
  DEFAULT_EXECUTION_CONFIG,
  EXECUTION_NAMESPACE,
  createExecutionPort,
  loadExecutionConfig,
  reconcileExecutionConfigRefresh,
  saveExecutionConfig,
} from "@/lib/execution-settings";
import {
  APPEARANCE_NAMESPACE,
  DEFAULT_APPEARANCE,
  DEFAULT_INSTRUCTIONS,
  DEFAULT_LOCALE,
  DEFAULT_NOTIFICATIONS,
  DEFAULT_PRIVACY,
  INSTRUCTIONS_NAMESPACE,
  LANGUAGE_NAMESPACE,
  NOTIFICATIONS_NAMESPACE,
  PRIVACY_NAMESPACE,
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
} from "@/lib/settings-tabs";
import { mergeSaveStates, useSettingsSlice, type SaveState, type SettingsSlice } from "@/hooks/use-settings-slice.hooks";
import { useWiredComposioConfig, type ComposioConfigController } from "./use-composio-config.hooks";
import { useExternalMcp, type ExternalMcpController } from "./use-external-mcp.hooks";
import { areAnySlicesLoading, firstLoadError } from "../rules";

/**
 * @file `SettingsUi`'s port/slice/save-merge bootstrap, so `SettingsUi` in `SettingsUi.tsx` is only
 * markup (the 13-tab `SettingsDialogTab[]` array and the shell mounts).
 *
 * Extracted verbatim — same state, same declaration order, same slice configs. `ADMIN_LOCALES` and
 * `DEFAULT_INSTRUCTIONS` stay imported directly by `SettingsUi.tsx` rather than being threaded
 * through this controller: they are static render-only data (a locale list, a fallback string),
 * not state this hook owns.
 *
 * Six independent `useSettingsSlice` instances are mounted — one per ledger-backed tab (Execution,
 * Instructions, Notifications, Privacy, Dialog appearance, Language) — each with its own load,
 * debounce, save chain, and diff base (see `use-settings-slice.hooks.ts`'s own header for why that
 * independence matters). The remaining seven tabs (MCP server, Media providers, Connectors,
 * Memory, External MCP, Skills, About) have no Tovu backend and so mount no slice; their fake
 * ports/dependencies are still constructed here (via `useRef`, so each mounts once) since they are
 * the same kind of "stable thing the view needs a reference to" as the slices are.
 */

export interface SettingsUiController {
  modalOpen: boolean;
  setModalOpen: (open: boolean) => void;
  /** Which segment of the inert-wrapped `MemorySettingsPanel` mount is showing. Local view state
   *  only — nothing here persists, matching every other prop that tab's `inert` control feeds. */
  memoryTopTab: MemoryTopTab;
  setMemoryTopTab: (tab: MemoryTopTab) => void;

  port: ReturnType<typeof createExecutionPort>;
  mediaProvidersPort: ReturnType<typeof createFakeMediaProvidersPort>;
  skillsPort: ReturnType<typeof createFakeSkillsPort>;
  /**
   * The External MCP tab's real transport, plus the Tovu-specific field specs and the
   * restart-required flag. Backed by the `external_mcp_servers` table rather than the settings
   * ledger, so it is not a `SettingsSlice` — see `use-external-mcp.hooks.ts`.
   */
  externalMcp: ExternalMcpController;

  /**
   * The Connectors tab's Composio API key. Not a `SettingsSlice` — it is backed by its own sealed
   * `composio_config` row rather than the settings ledger; see `use-composio-config.hooks.ts`.
   */
  composio: ComposioConfigController;

  execution: SettingsSlice<ExecutionConfig>;
  instructions: SettingsSlice<string>;
  notifications: SettingsSlice<NotificationsPreferences>;
  privacy: SettingsSlice<PrivacyConsentState>;
  appearance: SettingsSlice<AppearanceConfig>;
  language: SettingsSlice<string>;

  /** `true` until every mounted slice has settled — see `rules.ts`'s `areAnySlicesLoading`. */
  loading: boolean;
  loadError: string | null;
  save: SaveState;
}

/**
 * @complexity Time: O(1) beyond the six constant-shaped slice mounts; `save`'s `useMemo` body is
 * O(n) in slice count (fixed at 6). Space: O(1) — no caller-controlled collections.
 */
export function useSettingsUi(): SettingsUiController {
  const [modalOpen, setModalOpen] = useState(false);
  // Same option, same reasoning as `features/ai-assistant/hooks/use-admin-execution-mode.hooks.ts`
  // — this is the SECOND mount of `ExecutionTab` over the same `core.execution` ledger and the same
  // stored credential, and the two must not drift in their port options.
  const port = useRef(
    createExecutionPort({
      // Opts model discovery and "Test connection" into the ADMIN'S OWN server-side credential — the
      // key this very screen configures, encrypted and write-only since 2026-08-05. Without it the
      // probes were sent with the empty browser field and the provider (correctly) answered "No API
      // key", so `ByokProviderForm` never reached `modelDiscovery.status === 'ok'` and rendered its
      // free-text Model input instead of the live picker it already contains.
      //
      // NOT `useStoredCredential` — that is the SITE's visitor key, a different row belonging to a
      // different subject, and opting into it here would silently probe the wrong credential. The two
      // flags are separate for exactly this reason; see `lib/execution-settings.ts`'s option docs.
      useAdminStoredCredential: true,
    }),
  );
  // Fresh, empty in-memory ports for the three inert-wrapped backend-less
  // tabs below (Media providers, Skills) — `useRef` so each mounts once, not
  // once per render. `{ skills: [] }` overrides `createFakeSkillsPort`'s own
  // sample-data default; without it the tab would show skills that don't
  // exist in this Tovu install, which is exactly the fabricated-data problem
  // these ports otherwise avoid.
  const mediaProvidersPort = useRef(createFakeMediaProvidersPort());
  const skillsPort = useRef(createFakeSkillsPort({ skills: [] }));
  // Which segment of the inert-wrapped `MemorySettingsPanel` mount below is
  // showing. Local view state only — nothing here persists, matching every
  // other prop this tab's `inert` control feeds.
  const [memoryTopTab, setMemoryTopTab] = useState<MemoryTopTab>("memories");
  const composio = useWiredComposioConfig();
  const externalMcp = useExternalMcp();

  const execution = useSettingsSlice<ExecutionConfig>({
    load: loadExecutionConfig,
    save: saveExecutionConfig,
    defaultValue: DEFAULT_EXECUTION_CONFIG,
    namespaces: [EXECUTION_NAMESPACE],
    // Without this, an external refresh (a same-tab echo of this slice's own write over the
    // settings-changed SSE feed, another tab, another operator) wipes a typed-but-unsaved API key
    // out of the form — see `reconcileExecutionConfigRefresh`'s own doc.
    reconcileRefresh: reconcileExecutionConfigRefresh,
  });
  const instructions = useSettingsSlice<string>({
    load: loadInstructions,
    save: saveInstructions,
    defaultValue: DEFAULT_INSTRUCTIONS,
    namespaces: [INSTRUCTIONS_NAMESPACE],
  });
  const notifications = useSettingsSlice<NotificationsPreferences>({
    load: loadNotifications,
    save: saveNotifications,
    defaultValue: DEFAULT_NOTIFICATIONS,
    namespaces: [NOTIFICATIONS_NAMESPACE],
  });
  const privacy = useSettingsSlice<PrivacyConsentState>({
    load: loadPrivacy,
    save: savePrivacy,
    defaultValue: DEFAULT_PRIVACY,
    namespaces: [PRIVACY_NAMESPACE],
  });
  const appearance = useSettingsSlice<AppearanceConfig>({
    load: loadAppearance,
    save: saveAppearance,
    defaultValue: DEFAULT_APPEARANCE,
    namespaces: [APPEARANCE_NAMESPACE],
  });
  const language = useSettingsSlice<string>({
    load: loadLanguage,
    save: saveLanguage,
    defaultValue: DEFAULT_LOCALE,
    namespaces: [LANGUAGE_NAMESPACE],
  });

  const slices = [execution, instructions, notifications, privacy, appearance, language];
  const save = useMemo(
    () => mergeSaveStates(slices.map((slice) => slice.saveState)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    slices.map((slice) => slice.saveState),
  );

  return {
    modalOpen,
    setModalOpen,
    memoryTopTab,
    setMemoryTopTab,

    port: port.current,
    mediaProvidersPort: mediaProvidersPort.current,
    skillsPort: skillsPort.current,
    externalMcp,

    composio,

    execution,
    instructions,
    notifications,
    privacy,
    appearance,
    language,

    loading: areAnySlicesLoading(slices),
    loadError: firstLoadError(slices),
    save,
  };
}
