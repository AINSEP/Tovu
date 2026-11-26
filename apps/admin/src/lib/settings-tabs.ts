import {
  DEFAULT_NOTIFICATIONS_PREFERENCES,
  normalizeAccentColor,
  type NotificationsPreferences,
  type PrivacyConsentState,
} from "@jini-ai/ui";
import {
  createPrivacyConsentBrowserAdapter,
  createSettingsTabs,
  type AppearanceConfig,
  type InterfaceConfig,
} from "@jini-ai/admin/core/settings-tabs";
import { ADMIN_LOCALES as adminLocales } from "@tovu/contracts/admin-locales";
import { loadNamespaceValues, saveChangedEntries } from "./ledger-slice";

export type { AppearanceConfig, InterfaceConfig };

export const INSTRUCTIONS_NAMESPACE = "core.instructions";
export const NOTIFICATIONS_NAMESPACE = "core.notifications";
export const PRIVACY_NAMESPACE = "core.privacy";
export const APPEARANCE_NAMESPACE = "core.appearance";
export const LANGUAGE_NAMESPACE = "core.language";
/** Per-operator admin chrome preferences — registered by the website's
 *  `@jini-ai/cms/settings/site/admin-interface`, mirrored (not re-derived) here. */
export const INTERFACE_NAMESPACE = "core.interface";

export const DEFAULT_INSTRUCTIONS = "";

/**
 * Re-exported from the package rather than restated. The sound catalog is
 * `@jini-ai/ui`'s to grow, and a local copy of the default ids would drift
 * silently the first time it does — the registered ledger defaults in
 * `ui-tab-definitions.ts` are the copy that genuinely cannot import this and
 * is documented as needing to match.
 */
export const DEFAULT_NOTIFICATIONS: NotificationsPreferences = DEFAULT_NOTIFICATIONS_PREFERENCES;

export const DEFAULT_PRIVACY: PrivacyConsentState = {
  telemetry: { metrics: false, content: false },
  installationId: null,
  privacyDecisionAt: null,
};

/**
 * Defaults to LIGHT, not `'system'`.
 *
 * The rest of the Tovu admin is a light surface with no dark variant, so
 * following the OS would put a dark settings panel inside a light app for
 * every operator on a dark-mode machine. `'system'` is still selectable — it
 * is just not the default, because here it means "match an OS the surrounding
 * UI doesn't match".
 */
export const DEFAULT_APPEARANCE: AppearanceConfig = { theme: "light", accentColor: "#2563eb" };

export const DEFAULT_LOCALE = "en";

export const ADMIN_LOCALES = adminLocales;

/** `hideChatFabWhileOpen: true`: the behaviour the owner approved before this became a choice
 *  (2026-10-06). `wrapTabs: false`: the swipeable one-row strip stays the phone default. */
export const DEFAULT_INTERFACE: InterfaceConfig = { hideChatFabWhileOpen: true, wrapTabs: false, adminTheme: "classic" };

const privacyCallbacks = createPrivacyConsentBrowserAdapter({ deps: {
  getBrowser: () => typeof window === "undefined" ? undefined : window,
  createEvent: (type, init) => new CustomEvent(type, init),
  observe: () => undefined,
  withdrawalKey: "jini:metrics-withdrawal",
  consentEvent: "jini:metrics-consent-changed",
  saveMarkerStep: "Save metrics withdrawal marker",
  clearMarkerStep: "Clear metrics withdrawal marker",
} });

export const {
  loadInstructions, saveInstructions,
  loadNotifications, saveNotifications,
  loadPrivacy, savePrivacy,
  loadAppearance, saveAppearance,
  loadLanguage, saveLanguage,
  loadInterface, saveInterface,
  adminThemeAccent, withAdminThemeAccent,
} = createSettingsTabs({ deps: {
  loadNamespaceValues, saveChangedEntries,
  interfaceNamespace: INTERFACE_NAMESPACE,
  legacyThemeId: "classic",
  DEFAULT_INSTRUCTIONS, DEFAULT_LOCALE, DEFAULT_NOTIFICATIONS,
  DEFAULT_APPEARANCE, DEFAULT_INTERFACE, normalizeAccentColor,
  ...privacyCallbacks,
} });
