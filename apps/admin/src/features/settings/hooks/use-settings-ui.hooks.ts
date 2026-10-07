import { useSettingsAppearance } from "@/hooks/use-admin-appearance.hooks";
import { useMemo, useRef, useState } from "react";
import {
  type ExecutionConfig,
  type MemoryTopTab,
  type NotificationsPreferences,
  type PrivacyConsentState,
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
  DEFAULT_INTERFACE,
  DEFAULT_LOCALE,
  DEFAULT_NOTIFICATIONS,
  DEFAULT_PRIVACY,
  INSTRUCTIONS_NAMESPACE,
  INTERFACE_NAMESPACE,
  LANGUAGE_NAMESPACE,
  NOTIFICATIONS_NAMESPACE,
  PRIVACY_NAMESPACE,
  loadAppearance,
  loadInstructions,
  loadInterface,
  loadLanguage,
  loadNotifications,
  loadPrivacy,
  saveAppearance,
  saveInstructions,
  saveInterface,
  saveLanguage,
  saveNotifications,
  savePrivacy,
  type AppearanceConfig,
  type InterfaceConfig,
} from "@/lib/settings-tabs";
import { mergeSaveStates, useSettingsSlice, type SaveState, type SettingsSlice } from "@/hooks/use-settings-slice.hooks";
import { areAnySlicesLoading, firstLoadError } from "../rules";

/**
 * @file `SettingsUi`'s port/slice/save-merge bootstrap, so `SettingsUi` in `SettingsUi.tsx` is only
 * markup (the 10-tab `SettingsDialogTab[]` array and the shell mounts).
 *
 * Extracted verbatim — same state, same declaration order, same slice configs. `ADMIN_LOCALES` and
 * `DEFAULT_INSTRUCTIONS` stay imported directly by `SettingsUi.tsx` rather than being threaded
 * through this controller: they are static render-only data (a locale list, a fallback string),
 * not state this hook owns.
 *
 * Seven independent `useSettingsSlice` instances are mounted — one per ledger-backed tab (Execution,
 * Instructions, Notifications, Privacy, Dialog appearance, Language, User Interface) — each with its
 * own load, debounce, save chain, and diff base (see `use-settings-slice.hooks.ts`'s own header for
 * why that independence matters). Memory and About mount no slice. Skills live under Add-Ons.
 * Workspace (folded in 2026-09-10 — see `SettingsUi.tsx`'s own header), mounts no slice either, for
 * a different reason from the other three: it has a REAL Tovu backend, just not this one — its own
 * `useWiredWorkspace()` (`features/workspace/hooks/use-workspace.hooks.ts`) owns its fetch/save/
 * error state independently of `s`, so this controller has nothing to expose for it at all.
 *
 * The External MCP controller (and a since-removed Composio one) this hook used to expose left on
 * 2026-09-10 with their tabs — see `SettingsUi.tsx`'s header. External MCP is composed by
 * `features/providers/hooks/use-providers.hooks.ts` now, which deliberately does NOT reuse this
 * hook: it was never settings-ledger-backed, and mounting its seven slices to reach it would have
 * put the Providers page behind six loads it never displays (the seventh, `language`, feeds the
 * locale `Providers.tsx` already reads itself through `useAdminLocale()`).
 */

export interface SettingsUiController {
  /** Which segment of the inert-wrapped `MemorySettingsPanel` mount is showing. Local view state
   *  only — nothing here persists, matching every other prop that tab's `inert` control feeds. */
  memoryTopTab: MemoryTopTab;
  setMemoryTopTab: (tab: MemoryTopTab) => void;

  port: ReturnType<typeof createExecutionPort>;

  execution: SettingsSlice<ExecutionConfig>;
  instructions: SettingsSlice<string>;
  notifications: SettingsSlice<NotificationsPreferences>;
  privacy: SettingsSlice<PrivacyConsentState>;
  appearance: SettingsSlice<AppearanceConfig>;
  language: SettingsSlice<string>;
  /** Settings → User Interface (`core.interface`, per operator). */
  interface: SettingsSlice<InterfaceConfig>;

  /** `true` until every mounted slice has settled — see `rules.ts`'s `areAnySlicesLoading`. */
  loading: boolean;
  loadError: string | null;
  save: SaveState;
}

/**
 * @complexity Time: O(1) beyond the seven constant-shaped slice mounts; `save`'s `useMemo` body is
 * O(n) in slice count (fixed at 7). Space: O(1) — no caller-controlled collections.
 */
export function useSettingsUi(): SettingsUiController {
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

  // Which segment of the inert-wrapped `MemorySettingsPanel` mount below is
  // showing. Local view state only — nothing here persists, matching every
  // other prop this tab's `inert` control feeds.
  const [memoryTopTab, setMemoryTopTab] = useState<MemoryTopTab>("memories");

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
  const interfacePrefs = useSettingsSlice<InterfaceConfig>({
    load: loadInterface,
    save: saveInterface,
    defaultValue: DEFAULT_INTERFACE,
    namespaces: [INTERFACE_NAMESPACE],
  });

  useSettingsAppearance({ accentColor: appearance.value?.accentColor ?? DEFAULT_APPEARANCE.accentColor, ready: appearance.value !== null }, {});

  const slices = [execution, instructions, notifications, privacy, appearance, language, interfacePrefs];
  const save = useMemo(
    () => mergeSaveStates(slices.map((slice) => slice.saveState)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    slices.map((slice) => slice.saveState),
  );

  return {
    memoryTopTab,
    setMemoryTopTab,

    port: port.current,

    execution,
    instructions,
    notifications,
    privacy,
    appearance,
    language,
    interface: interfacePrefs,

    loading: areAnySlicesLoading(slices),
    loadError: firstLoadError(slices),
    save,
  };
}
