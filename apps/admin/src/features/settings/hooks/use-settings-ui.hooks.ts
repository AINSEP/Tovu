import { useMemo, useRef, useState } from "react";
import {
  createFakeSkillsPort,
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
import { areAnySlicesLoading, firstLoadError } from "../rules";

/**
 * @file `SettingsUi`'s port/slice/save-merge bootstrap, so `SettingsUi` in `SettingsUi.tsx` is only
 * markup (the 9-tab `SettingsDialogTab[]` array and the shell mounts).
 *
 * Extracted verbatim — same state, same declaration order, same slice configs. `ADMIN_LOCALES` and
 * `DEFAULT_INSTRUCTIONS` stay imported directly by `SettingsUi.tsx` rather than being threaded
 * through this controller: they are static render-only data (a locale list, a fallback string),
 * not state this hook owns.
 *
 * Six independent `useSettingsSlice` instances are mounted — one per ledger-backed tab (Execution,
 * Instructions, Notifications, Privacy, Dialog appearance, Language) — each with its own load,
 * debounce, save chain, and diff base (see `use-settings-slice.hooks.ts`'s own header for why that
 * independence matters). The remaining three tabs (Memory, Skills, About) have no Tovu backend and
 * so mount no slice; Skills' fake port is still constructed here (via `useRef`, so it mounts once)
 * since it is the same kind of "stable thing the view needs a reference to" as the slices are.
 *
 * The Composio and External MCP controllers this hook used to expose left on 2026-09-10 with their
 * tabs — see `SettingsUi.tsx`'s header. They are composed by
 * `features/providers/hooks/use-providers.hooks.ts` now, which deliberately does NOT reuse this
 * hook: neither controller was ever settings-ledger-backed, and mounting six unrelated slices to
 * reach them would have put the Providers page behind five loads it never displays.
 */

export interface SettingsUiController {
  modalOpen: boolean;
  setModalOpen: (open: boolean) => void;
  /** Which segment of the inert-wrapped `MemorySettingsPanel` mount is showing. Local view state
   *  only — nothing here persists, matching every other prop that tab's `inert` control feeds. */
  memoryTopTab: MemoryTopTab;
  setMemoryTopTab: (tab: MemoryTopTab) => void;

  port: ReturnType<typeof createExecutionPort>;
  skillsPort: ReturnType<typeof createFakeSkillsPort>;

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
  // A fresh, empty in-memory port for the one remaining inert-wrapped backend-less tab (Skills)
  // — `useRef` so it mounts once, not once per render. `{ skills: [] }` overrides
  // `createFakeSkillsPort`'s own sample-data default; without it the tab would show skills that
  // don't exist in this Tovu install, which is exactly the fabricated-data problem this port
  // otherwise avoids.
  //
  // The Media providers fake port that used to sit beside this one is gone with its tab (2026-09-10
  // — see `SettingsUi.tsx`'s header): the real Media providers surface is on the Media screen over
  // a real backend, and a second fake copy of it here was showing an inert control under a note
  // claiming Tovu had no media-provider backend, which stopped being true.
  const skillsPort = useRef(createFakeSkillsPort({ skills: [] }));
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
    skillsPort: skillsPort.current,

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
