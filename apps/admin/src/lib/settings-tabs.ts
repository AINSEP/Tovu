/**
 * @file Tovu adapters for the settings-dialog tabs whose entire backend is
 * ledger storage: Instructions, Notifications, and Privacy.
 *
 * Each exports a `DEFAULT_*`, a `load*`, and a `save*` triple with the same
 * shape as `execution-settings.ts`'s, so `SettingsUi.tsx` drives all four tabs
 * through one pattern. The shared read/diff-write machinery is in
 * `ledger-slice.ts`; what each adapter owns is the mapping between its ledger
 * keys and the config object `@jini-ai/ui`'s component expects — including the
 * sentinel round-trips, which are the only genuinely subtle part.
 *
 * The server counterpart registering these definitions is
 * `Jini packages/core/src/settings/ui-tab-definitions.ts`; the sentinel choices are
 * explained there and mirrored (not re-derived) here.
 */

import {
  DEFAULT_NOTIFICATIONS_PREFERENCES,
  normalizeAccentColor,
  type NotificationsPreferences,
  type PrivacyConsentState,
  type SettingsThemeChoice,
} from "@jini-ai/ui";
import type { SettingScope } from "@jini-ai/core/settings";
import { orFallbackSync } from "@jini-ai/core/errors/idioms";
import {
  loadNamespaceValues,
  readBoolean,
  readNumber,
  readString,
  saveChangedEntries,
  type LedgerCandidate,
} from "./ledger-slice";

export const INSTRUCTIONS_NAMESPACE = "core.instructions";
export const NOTIFICATIONS_NAMESPACE = "core.notifications";
export const PRIVACY_NAMESPACE = "core.privacy";
export const APPEARANCE_NAMESPACE = "core.appearance";
export const LANGUAGE_NAMESPACE = "core.language";
/** Per-operator admin chrome preferences — registered by the website's
 *  `features/settings/admin-interface.ts`, mirrored (not re-derived) here. */
export const INTERFACE_NAMESPACE = "core.interface";

/** Workspace-scoped: custom instructions and telemetry consent are properties
 *  of the workspace, not of whoever happens to be looking at the tab. */
const WORKSPACE_SCOPE: SettingScope = "workspace";

/** Notification preferences are per-operator — see `ui-tab-definitions.ts`'s
 *  `NOTIFICATIONS_SCOPES` for why this one differs. */
const USER_SCOPE: SettingScope = "user";

// --- Instructions ---------------------------------------------------------

const INSTRUCTIONS_KEY = "custom";

export const DEFAULT_INSTRUCTIONS = "";

export async function loadInstructions(): Promise<string> {
  const values = await loadNamespaceValues({ namespace: INSTRUCTIONS_NAMESPACE });
  return readString({ values, key: INSTRUCTIONS_KEY, fallback: DEFAULT_INSTRUCTIONS });
}

/**
 * `InstructionsTab` reports an all-empty textarea as `undefined` rather than
 * `''` (its documented `onChange` collapse), so `undefined` is normalised back
 * to the empty string the ledger actually stores. Without this the definition
 * would receive `undefined` as its value and the write would fail validation.
 */
export async function saveInstructions({ next, previous }: { next: string | undefined; previous: string }, _options = {}): Promise<readonly string[]> {
  const value = next ?? DEFAULT_INSTRUCTIONS;
  return saveChangedEntries({ namespace: INSTRUCTIONS_NAMESPACE, scope: WORKSPACE_SCOPE, candidates: [
    { key: INSTRUCTIONS_KEY, valueJson: value, changed: value !== previous },
  ] });
}

// --- Notifications --------------------------------------------------------

const NOTIFICATION_KEYS = {
  soundEnabled: "soundEnabled",
  successSoundId: "successSoundId",
  failureSoundId: "failureSoundId",
  desktopEnabled: "desktopEnabled",
} as const;

/**
 * Re-exported from the package rather than restated. The sound catalog is
 * `@jini-ai/ui`'s to grow, and a local copy of the default ids would drift
 * silently the first time it does — the registered ledger defaults in
 * `ui-tab-definitions.ts` are the copy that genuinely cannot import this and
 * is documented as needing to match.
 */
export const DEFAULT_NOTIFICATIONS: NotificationsPreferences = DEFAULT_NOTIFICATIONS_PREFERENCES;

export async function loadNotifications(): Promise<NotificationsPreferences> {
  const values = await loadNamespaceValues({ namespace: NOTIFICATIONS_NAMESPACE });
  return {
    soundEnabled: readBoolean({ values, key: NOTIFICATION_KEYS.soundEnabled, fallback: DEFAULT_NOTIFICATIONS.soundEnabled }),
    successSoundId: readString({ values, key: NOTIFICATION_KEYS.successSoundId, fallback: DEFAULT_NOTIFICATIONS.successSoundId }),
    failureSoundId: readString({ values, key: NOTIFICATION_KEYS.failureSoundId, fallback: DEFAULT_NOTIFICATIONS.failureSoundId }),
    desktopEnabled: readBoolean({ values, key: NOTIFICATION_KEYS.desktopEnabled, fallback: DEFAULT_NOTIFICATIONS.desktopEnabled }),
  };
}

export async function saveNotifications(
  next: NotificationsPreferences,
  previous: NotificationsPreferences,
): Promise<readonly string[]> {
  const candidates: LedgerCandidate[] = [
    {
      key: NOTIFICATION_KEYS.soundEnabled,
      valueJson: next.soundEnabled,
      changed: next.soundEnabled !== previous.soundEnabled,
    },
    {
      key: NOTIFICATION_KEYS.successSoundId,
      valueJson: next.successSoundId,
      changed: next.successSoundId !== previous.successSoundId,
    },
    {
      key: NOTIFICATION_KEYS.failureSoundId,
      valueJson: next.failureSoundId,
      changed: next.failureSoundId !== previous.failureSoundId,
    },
    {
      key: NOTIFICATION_KEYS.desktopEnabled,
      valueJson: next.desktopEnabled,
      changed: next.desktopEnabled !== previous.desktopEnabled,
    },
  ];
  return saveChangedEntries({ namespace: NOTIFICATIONS_NAMESPACE, scope: USER_SCOPE, candidates });
}

// --- Privacy --------------------------------------------------------------

const PRIVACY_KEYS = {
  metrics: "telemetry.metrics",
  content: "telemetry.content",
  installationId: "installationId",
  decisionAt: "decisionAt",
} as const;

/** Mirrors `ui-tab-definitions.ts`'s identical sentinels: the ledger cannot
 *  register a null default for a non-secret definition, and both of these
 *  fields are nullable in `@jini-ai/ui`'s own type. */
const NO_DECISION_SENTINEL = 0;
const NO_INSTALLATION_ID_SENTINEL = "";

export const DEFAULT_PRIVACY: PrivacyConsentState = {
  telemetry: { metrics: false, content: false },
  installationId: null,
  privacyDecisionAt: null,
};

export async function loadPrivacy(): Promise<PrivacyConsentState> {
  const values = await loadNamespaceValues({ namespace: PRIVACY_NAMESPACE });
  const decisionAt = readNumber({ values, key: PRIVACY_KEYS.decisionAt, fallback: NO_DECISION_SENTINEL });
  const installationId = readString({ values, key: PRIVACY_KEYS.installationId, fallback: NO_INSTALLATION_ID_SENTINEL });
  return {
    telemetry: {
      metrics: readBoolean({ values, key: PRIVACY_KEYS.metrics, fallback: false }),
      content: readBoolean({ values, key: PRIVACY_KEYS.content, fallback: false }),
    },
    // Both sentinels collapse back to the `null` the tab uses to mean "absent".
    // `decisionAt` gates the first-run consent prompt, so getting this wrong in
    // either direction is user-visible: a stuck prompt, or a silently-skipped one.
    installationId: installationId === NO_INSTALLATION_ID_SENTINEL ? null : installationId,
    privacyDecisionAt: decisionAt === NO_DECISION_SENTINEL ? null : decisionAt,
  };
}

// --- Appearance -----------------------------------------------------------

const APPEARANCE_KEYS = { theme: "theme", accentColor: "accentColor", adminThemeAccents: "adminThemeAccents" } as const;

/** Mirrors `@jini-ai/ui`'s own `DEFAULT_ACCENT_COLOR` and the registered
 *  ledger default. */
export interface AppearanceConfig {
  theme: SettingsThemeChoice;
  /** Legacy single value belongs to Classic. Kept for existing settings callers. */
  accentColor: string;
  /** Tovu admin-theme overrides other than Classic; stored separately from the scalar. */
  accentColors?: Readonly<Record<string, string>>;
}

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

/** Read the separate admin-theme object, preserving overrides for uninstalled themes.
 * Classic's scalar remains the sole owner of its value for legacy readers and agent writes.
 * @complexity O(n) time/space for n stored theme entries. Invalid entries are ignored. */
function readAppearanceAccents({ stored }: { stored: unknown }, _optional: object = {}): Readonly<Record<string, string>> | undefined {
  if (stored === null || typeof stored !== "object" || Array.isArray(stored)) return undefined;
  const entries = Object.entries(stored).filter(([id, value]) => id !== "classic" && normalizeAccentColor({ value }) !== null);
  return entries.length ? Object.fromEntries(entries) : undefined;
}

/** The active theme's override, or undefined so its own palette stays in charge. O(1). */
export function adminThemeAccent({ appearance, themeId }: { appearance: AppearanceConfig; themeId: string }, _optional: object = {}): string | undefined {
  const accent = themeId === "classic" ? appearance.accentColor : appearance.accentColors?.[themeId];
  // Jini's original neutral-blue ledger default was never an operator choice for Classic.
  return themeId === "classic" && accent?.toLowerCase() === DEFAULT_APPEARANCE.accentColor.toLowerCase() ? undefined : accent;
}

/** Edit one theme without losing other choices; undefined restores its palette default.
 * @complexity O(n) time/space for n stored theme entries; never mutates the draft. */
export function withAdminThemeAccent({ appearance, themeId, accentColor }: { appearance: AppearanceConfig; themeId: string; accentColor: string | undefined }, _optional: object = {}): AppearanceConfig {
  if (themeId === "classic") return { ...appearance, accentColor: accentColor ?? DEFAULT_APPEARANCE.accentColor };
  const accentColors = { ...appearance.accentColors };
  if (accentColor === undefined) delete accentColors[themeId];
  else accentColors[themeId] = accentColor;
  return { ...appearance, accentColors };
}

export async function loadAppearance(): Promise<AppearanceConfig> {
  const values = await loadNamespaceValues({ namespace: APPEARANCE_NAMESPACE });
  const theme = readString({ values, key: APPEARANCE_KEYS.theme, fallback: DEFAULT_APPEARANCE.theme });
  const accentColors = readAppearanceAccents({ stored: values.get(APPEARANCE_KEYS.adminThemeAccents) }, {});
  return {
    // An unrecognised stored theme falls back rather than reaching the tab as
    // a value its radio group cannot select.
    theme: theme === "system" || theme === "light" || theme === "dark" ? theme : DEFAULT_APPEARANCE.theme,
    accentColor: readString({ values, key: APPEARANCE_KEYS.accentColor, fallback: DEFAULT_APPEARANCE.accentColor }),
    ...(accentColors ? { accentColors } : {}),
  };
}

/** Diff-write appearance; scalar-only callers leave the optional admin-theme map untouched.
 * @complexity O(n) time/space for n theme entries; the shared ledger owns sequential writes. */
export async function saveAppearance(
  next: AppearanceConfig,
  previous: AppearanceConfig,
): Promise<readonly string[]> {
  const accentColors = next.accentColors ?? previous.accentColors ?? {};
  return saveChangedEntries({ namespace: APPEARANCE_NAMESPACE, scope: USER_SCOPE, candidates: [
    { key: APPEARANCE_KEYS.theme, valueJson: next.theme, changed: next.theme !== previous.theme },
    {
      key: APPEARANCE_KEYS.accentColor,
      valueJson: next.accentColor,
      changed: next.accentColor !== previous.accentColor,
    },
    {
      key: APPEARANCE_KEYS.adminThemeAccents,
      valueJson: accentColors,
      changed: JSON.stringify(accentColors) !== JSON.stringify(previous.accentColors ?? {}),
    },
  ] });
}

// --- Language -------------------------------------------------------------

const LANGUAGE_KEY = "locale";

export const DEFAULT_LOCALE = "en";

/** The selector and assistant tool consume the same offered-language catalog. */
export { ADMIN_LOCALES } from "@tovu/contracts/admin-locales";

export async function loadLanguage(): Promise<string> {
  const values = await loadNamespaceValues({ namespace: LANGUAGE_NAMESPACE });
  return readString({ values, key: LANGUAGE_KEY, fallback: DEFAULT_LOCALE });
}

export async function saveLanguage({ next, previous }: { next: string; previous: string }, _options = {}): Promise<readonly string[]> {
  return saveChangedEntries({ namespace: LANGUAGE_NAMESPACE, scope: USER_SCOPE, candidates: [
    { key: LANGUAGE_KEY, valueJson: next, changed: next !== previous },
  ] });
}

/** Map optional privacy preferences to the existing ledger sentinels. O(1); no effects. */
function privacyLedgerValues({ state }: { state: PrivacyConsentState }, _options = {}) {
  return { metrics: state.telemetry.metrics ?? false, content: state.telemetry.content ?? false,
    installationId: state.installationId ?? NO_INSTALLATION_ID_SENTINEL,
    decisionAt: state.privacyDecisionAt ?? NO_DECISION_SENTINEL };
}

export async function savePrivacy(
  next: PrivacyConsentState,
  previous: PrivacyConsentState,
): Promise<readonly string[]> {
  const nextValues = privacyLedgerValues({ state: next }), previousValues = privacyLedgerValues({ state: previous });
  const { metrics: nextMetrics, content: nextContent, installationId: nextInstallationId, decisionAt: nextDecisionAt } = nextValues;
  const { metrics: previousMetrics, content: previousContent, installationId: previousInstallationId, decisionAt: previousDecisionAt } = previousValues;

  const candidates: LedgerCandidate[] = [
    { key: PRIVACY_KEYS.metrics, valueJson: nextMetrics, changed: nextMetrics !== previousMetrics },
    { key: PRIVACY_KEYS.content, valueJson: nextContent, changed: nextContent !== previousContent },
    {
      key: PRIVACY_KEYS.installationId,
      valueJson: nextInstallationId,
      changed: nextInstallationId !== previousInstallationId,
    },
    {
      key: PRIVACY_KEYS.decisionAt,
      valueJson: nextDecisionAt,
      changed: nextDecisionAt !== previousDecisionAt,
    },
  ];
  // A withdrawal stops live browser collection even when the durable save fails.
  // Keep only a denial marker for reloads; it can never manufacture a grant.
  if (!nextMetrics && previousMetrics && typeof window !== 'undefined') {
    /* Live teardown still applies. */
    orFallbackSync({ work: () => { window.localStorage.setItem('jini:metrics-withdrawal', '1'); }, fallback: undefined, step: 'Save metrics withdrawal marker' });
    window.dispatchEvent(new CustomEvent('jini:metrics-consent-changed', { detail: false }));
  }
  // Metrics is the first durable write. Signal it before later preference writes can fail.
  const metrics = await saveChangedEntries({ namespace: PRIVACY_NAMESPACE, scope: WORKSPACE_SCOPE, candidates: candidates.filter(candidate => candidate.key === PRIVACY_KEYS.metrics) });
  if (metrics.includes(PRIVACY_KEYS.metrics) && typeof window !== 'undefined') {
    /* The marker only denies. */
    orFallbackSync({ work: () => { window.localStorage.removeItem('jini:metrics-withdrawal'); }, fallback: undefined, step: 'Clear metrics withdrawal marker' });
    window.dispatchEvent(new CustomEvent('jini:metrics-consent-changed', { detail: nextMetrics }));
  }
  const remaining = await saveChangedEntries({ namespace: PRIVACY_NAMESPACE, scope: WORKSPACE_SCOPE, candidates: candidates.filter(candidate => candidate.key !== PRIVACY_KEYS.metrics) });
  return [...metrics, ...remaining];
}

// --- User Interface -------------------------------------------------------

const INTERFACE_KEYS = { hideChatFabWhileOpen: "hideChatFabWhileOpen", wrapTabs: "wrapTabs", adminTheme: "adminTheme" } as const;

export interface InterfaceConfig {
  /** Hide the floating chat button while the assistant dock is open (the dock's ✕ closes it). */
  hideChatFabWhileOpen: boolean;
  /** Phone tab strips wrap onto more rows instead of scrolling sideways (owner, 2026-10-07). */
  wrapTabs: boolean;
  /** The operator's admin theme id (`admin-themes/registry.ts`); its scheme is Appearance's `theme`. */
  adminTheme: string;
}

/** `hideChatFabWhileOpen: true`: the behaviour the owner approved before this became a choice
 *  (2026-10-06). `wrapTabs: false`: the swipeable one-row strip stays the phone default. */
export const DEFAULT_INTERFACE: InterfaceConfig = { hideChatFabWhileOpen: true, wrapTabs: false, adminTheme: "classic" };

export async function loadInterface(): Promise<InterfaceConfig> {
  const values = await loadNamespaceValues({ namespace: INTERFACE_NAMESPACE });
  return {
    hideChatFabWhileOpen: readBoolean({ values, key: INTERFACE_KEYS.hideChatFabWhileOpen, fallback: DEFAULT_INTERFACE.hideChatFabWhileOpen }),
    wrapTabs: readBoolean({ values, key: INTERFACE_KEYS.wrapTabs, fallback: DEFAULT_INTERFACE.wrapTabs }),
    adminTheme: readString({ values, key: INTERFACE_KEYS.adminTheme, fallback: DEFAULT_INTERFACE.adminTheme }),
  };
}

export async function saveInterface(next: InterfaceConfig, previous: InterfaceConfig): Promise<readonly string[]> {
  return saveChangedEntries({ namespace: INTERFACE_NAMESPACE, scope: USER_SCOPE, candidates: [
    {
      key: INTERFACE_KEYS.hideChatFabWhileOpen,
      valueJson: next.hideChatFabWhileOpen,
      changed: next.hideChatFabWhileOpen !== previous.hideChatFabWhileOpen,
    },
    {
      key: INTERFACE_KEYS.wrapTabs,
      valueJson: next.wrapTabs,
      changed: next.wrapTabs !== previous.wrapTabs,
    },
    {
      key: INTERFACE_KEYS.adminTheme,
      valueJson: next.adminTheme,
      changed: next.adminTheme !== previous.adminTheme,
    },
  ] });
}
