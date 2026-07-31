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
 * `src/features/settings/ui-tab-definitions.ts`; the sentinel choices are
 * explained there and mirrored (not re-derived) here.
 */

import { DEFAULT_NOTIFICATIONS_PREFERENCES, type NotificationsPreferences, type PrivacyConsentState } from "@jini-ai/ui";
import type { SettingScope } from "./api";
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
  const values = await loadNamespaceValues(INSTRUCTIONS_NAMESPACE);
  return readString(values, INSTRUCTIONS_KEY, DEFAULT_INSTRUCTIONS);
}

/**
 * `InstructionsTab` reports an all-empty textarea as `undefined` rather than
 * `''` (its documented `onChange` collapse), so `undefined` is normalised back
 * to the empty string the ledger actually stores. Without this the definition
 * would receive `undefined` as its value and the write would fail validation.
 */
export async function saveInstructions(next: string | undefined, previous: string): Promise<readonly string[]> {
  const value = next ?? DEFAULT_INSTRUCTIONS;
  return saveChangedEntries(INSTRUCTIONS_NAMESPACE, WORKSPACE_SCOPE, [
    { key: INSTRUCTIONS_KEY, valueJson: value, changed: value !== previous },
  ]);
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
  const values = await loadNamespaceValues(NOTIFICATIONS_NAMESPACE);
  return {
    soundEnabled: readBoolean(values, NOTIFICATION_KEYS.soundEnabled, DEFAULT_NOTIFICATIONS.soundEnabled),
    successSoundId: readString(values, NOTIFICATION_KEYS.successSoundId, DEFAULT_NOTIFICATIONS.successSoundId),
    failureSoundId: readString(values, NOTIFICATION_KEYS.failureSoundId, DEFAULT_NOTIFICATIONS.failureSoundId),
    desktopEnabled: readBoolean(values, NOTIFICATION_KEYS.desktopEnabled, DEFAULT_NOTIFICATIONS.desktopEnabled),
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
  return saveChangedEntries(NOTIFICATIONS_NAMESPACE, USER_SCOPE, candidates);
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
  const values = await loadNamespaceValues(PRIVACY_NAMESPACE);
  const decisionAt = readNumber(values, PRIVACY_KEYS.decisionAt, NO_DECISION_SENTINEL);
  const installationId = readString(values, PRIVACY_KEYS.installationId, NO_INSTALLATION_ID_SENTINEL);
  return {
    telemetry: {
      metrics: readBoolean(values, PRIVACY_KEYS.metrics, false),
      content: readBoolean(values, PRIVACY_KEYS.content, false),
    },
    // Both sentinels collapse back to the `null` the tab uses to mean "absent".
    // `decisionAt` gates the first-run consent prompt, so getting this wrong in
    // either direction is user-visible: a stuck prompt, or a silently-skipped one.
    installationId: installationId === NO_INSTALLATION_ID_SENTINEL ? null : installationId,
    privacyDecisionAt: decisionAt === NO_DECISION_SENTINEL ? null : decisionAt,
  };
}

export async function savePrivacy(
  next: PrivacyConsentState,
  previous: PrivacyConsentState,
): Promise<readonly string[]> {
  const nextMetrics = next.telemetry.metrics ?? false;
  const previousMetrics = previous.telemetry.metrics ?? false;
  const nextContent = next.telemetry.content ?? false;
  const previousContent = previous.telemetry.content ?? false;
  const nextInstallationId = next.installationId ?? NO_INSTALLATION_ID_SENTINEL;
  const previousInstallationId = previous.installationId ?? NO_INSTALLATION_ID_SENTINEL;
  const nextDecisionAt = next.privacyDecisionAt ?? NO_DECISION_SENTINEL;
  const previousDecisionAt = previous.privacyDecisionAt ?? NO_DECISION_SENTINEL;

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
  return saveChangedEntries(PRIVACY_NAMESPACE, WORKSPACE_SCOPE, candidates);
}
